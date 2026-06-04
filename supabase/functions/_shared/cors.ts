export const buildCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowed = (Deno.env.get('APP_ORIGIN') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // localhost solo se permite cuando el entorno se declara EXPLICITAMENTE como
  // desarrollo/local. Asi, si ENVIRONMENT no esta seteado en las edge functions
  // desplegadas, el default es seguro (NO se acepta localhost en produccion).
  const env = (Deno.env.get('ENVIRONMENT') || '').toLowerCase();
  const isDevEnv = env === 'development' || env === 'dev' || env === 'local';
  const isAllowed = allowed.includes(origin) || (isDevEnv && origin.startsWith('http://localhost'));
  const allowOrigin = isAllowed ? origin : allowed[0] || 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
};

export const jsonResponse = (
  req: Request,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), ...extraHeaders, 'Content-Type': 'application/json' }
  });
