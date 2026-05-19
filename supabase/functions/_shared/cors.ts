export const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('APP_ORIGIN') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const isAllowed = allowed.includes(origin) || (Deno.env.get('ENVIRONMENT') !== 'production' && origin.startsWith('http://localhost'));
  const allowOrigin = isAllowed ? origin : allowed[0] || 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
};

export const jsonResponse = (req: Request, status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), ...extraHeaders, 'Content-Type': 'application/json' }
  });
