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

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const GENERIC_AI_ERROR = 'No se pudo consultar IA. Intenta de nuevo mas tarde.';

const json = (
  req: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) => jsonResponse(req, status, body, extraHeaders);

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Metodo no permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = getBearerToken(req);

  if (!supabaseUrl || !serviceRoleKey) return json(req, 503, { error: 'Supabase no configurado' });
  if (!token) return json(req, 401, { error: 'Falta autorizacion' });

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
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

  const { data: membership, error: membershipError } = await supabase
    .from('clinic_memberships')
    .select('clinic_id')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) {
    return json(req, 403, { error: 'No tienes acceso a una clinica activa' });
  }

  const { data: rateRows, error: rateError } = await supabase.rpc('check_ai_rate_limit', {
    target_user_id: userData.user.id,
    window_seconds: Math.floor(WINDOW_MS / 1000),
    max_requests: MAX_REQUESTS_PER_WINDOW
  });
  if (rateError) return json(req, 503, { error: 'Rate limit de IA no disponible' });

  const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
  if (!rate?.allowed) {
    return json(
      req,
      429,
      { error: 'Demasiadas solicitudes de IA. Intenta de nuevo en un momento.' },
      {
        'Retry-After': String(rate?.retry_after_seconds || 60)
      }
    );
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  const model = Deno.env.get('OPENROUTER_MODEL') || 'deepseek/deepseek-chat-v3-0324:free';

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

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://fisioself.app',
        'X-Title': 'Fisioself Clinical AI'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1400,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${prompts[type]}\n\nNota clinica:\n${text}` }
        ]
      })
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      console.error('clinical_ai_upstream_failed', {
        status: response.status,
        error: (data as { error?: { message?: string } })?.error?.message || 'unknown'
      });
      return json(req, response.status >= 500 ? 502 : response.status, {
        error: GENERIC_AI_ERROR
      });
    }

    const headers = buildCorsHeaders(req);
    headers.set('Content-Type', 'text/event-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('Connection', 'keep-alive');

    // Convert OpenAI SSE → Anthropic delta format so the frontend parser stays unchanged
    const transformed = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const parsed = JSON.parse(raw) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) {
                  const out = `data: ${JSON.stringify({ type: 'content_block_delta', delta: { text: chunk } })}\n\n`;
                  controller.enqueue(encoder.encode(out));
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      }
    });

    return new Response(transformed, { headers });
  } catch (error) {
    console.error('clinical_ai_failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return json(req, 502, { error: GENERIC_AI_ERROR });
  }
});
