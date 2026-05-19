const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const AI_TYPES = new Set([
  'soap',
  'summary',
  'exercises',
  'clinical_analysis',
  'treatment_plan',
  'discharge_letter'
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
  clinical_analysis: 'Realiza un analisis clinico prudente. Incluye banderas rojas si aparecen en el texto.',
  treatment_plan: 'Propone un plan de tratamiento fisioterapeutico razonable y progresivo.',
  discharge_letter: 'Redacta un borrador de carta de alta fisioterapeutica.'
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Metodo no permitido' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('CLAUDE_MODEL') || 'claude-3-5-sonnet-latest';

  if (!apiKey) return json(503, { error: 'IA no configurada' });

  let body: { text?: unknown; type?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'JSON invalido' });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const type = typeof body.type === 'string' ? body.type : '';

  if (!text) return json(400, { error: 'Falta texto clinico' });
  if (text.length > 12000) return json(400, { error: 'Texto demasiado largo' });
  if (!AI_TYPES.has(type)) return json(400, { error: 'Tipo de IA invalido' });

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
    return json(response.status, {
      error: data?.error?.message || 'Error al consultar IA'
    });
  }

  const output = (data.content || [])
    .map((item: { text?: string }) => item.text || '')
    .join('\n')
    .trim();

  return json(200, { text: output });
});
