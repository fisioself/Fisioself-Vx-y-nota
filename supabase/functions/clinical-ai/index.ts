import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse, buildCorsHeaders } from '../_shared/cors.ts';

const AI_TYPES = new Set([
  'soap',
  'summary',
  'exercises',
  'clinical_analysis',
  'treatment_plan',
  'discharge_letter',
  'informed_consent'
]);

const SYSTEM_PROMPT = `Eres un asistente clinico para fisioterapia.
Ayudas a redactar, ordenar y resumir notas.
No reemplazas el juicio clinico del fisioterapeuta.
No inventes datos que no esten en la entrada.
Si falta informacion, dilo claramente.
Responde en espanol clinico, claro y prudente.`;

const prompts: Record<string, string> = {
  soap: 'Convierte la nota libre en formato SOAP. Mantente fiel al texto original.',
  summary: 'Resume la nota clinica en puntos breves y utiles.',
  exercises: 'Sugiere ejercicios generales seguros basados solo en la nota. Incluye precauciones.',
  clinical_analysis:
    'Realiza un analisis clinico prudente. Incluye banderas rojas si aparecen en el texto.',
  treatment_plan: 'Propone un plan de tratamiento fisioterapeutico razonable y progresivo.',
  discharge_letter: 'Redacta un borrador de carta de alta fisioterapeutica.',
  informed_consent:
    'Redacta un borrador de consentimiento informado para fisioterapia. Debe explicar objetivo, beneficios esperados, riesgos razonables, alternativas, derecho a retirar consentimiento y espacio para firma. No inventes datos personales.'
};

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

const json = (
  req: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) => jsonResponse(req, status, body, extraHeaders);

const getClientKey = (req: Request) => {
  const auth = req.headers.get('authorization') || 'anonymous';
  const forwardedFor =
    req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown-ip';
  return `${auth.slice(0, 48)}:${forwardedFor.split(',')[0].trim()}`;
};

const checkRateLimit = (key: string) => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo no permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('authorization');

  if (!supabaseUrl || !serviceRoleKey) return json(req, 503, { error: 'Supabase no configurado' });
  if (!authHeader) return json(req, 401, { error: 'Falta autorizacion' });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json(req, 401, { error: 'Sesion invalida' });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single();
  if (
    profileError ||
    !profile?.active ||
    !['admin', 'therapist', 'assistant'].includes(profile.role)
  ) {
    return json(req, 403, { error: 'Usuario clinico no autorizado' });
  }

  const rate = checkRateLimit(getClientKey(req));
  if (!rate.allowed) {
    return json(
      req,
      429,
      { error: 'Demasiadas solicitudes de IA. Intenta de nuevo en un momento.' },
      {
        'Retry-After': String(rate.retryAfterSeconds)
      }
    );
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-3-5-sonnet-latest';

  if (!apiKey) return json(req, 503, { error: 'IA no configurada' });

  let body: { text?: unknown; type?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'JSON invalido' });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';

  if (!text) return json(req, 400, { error: 'Falta texto clinico' });
  if (text.length > 12000) return json(req, 400, { error: 'Texto demasiado largo' });
  if (!AI_TYPES.has(type)) return json(req, 400, { error: 'Tipo de IA invalido' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${prompts[type]}\n\nNota clinica:\n${text}`
        }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return json(req, response.status, {
      error: data?.error?.message || 'Error al consultar IA'
    });
  }

  const output = (data.content || [])
    .map((item: { text?: string }) => item.text || '')
    .join('\n')
    .trim();

  return json(req, 200, { text: output });
});
