// Puente gratis Sentry -> GitHub.
//
// Sentry (en planes que no son Business) no puede crear issues de GitHub
// directamente desde una alert rule. Esta edge function recibe el webhook de
// una *Internal Integration* de Sentry y crea el issue de GitHub por su cuenta,
// lo que a su vez dispara el workflow de triaje (.github/workflows/
// claude-sentry-triage.yml) que invoca a Claude.
//
// Flujo completo:
//   error en prod -> Sentry -> webhook a esta función -> crea issue en GitHub
//   -> workflow corre Claude -> PR en borrador con el fix.
//
// Secrets requeridos (supabase secrets set ...):
//   SENTRY_WEBHOOK_SECRET  Client Secret de la Internal Integration (firma HMAC)
//   GITHUB_TOKEN           PAT fine-grained con permiso Issues: Read & Write
//   GITHUB_REPO            "owner/repo" (por defecto fisioself/Fisioself-Vx-y-nota)

const SENTRY_WEBHOOK_SECRET = Deno.env.get('SENTRY_WEBHOOK_SECRET') ?? '';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'fisioself/Fisioself-Vx-y-nota';

const GH_API = 'https://api.github.com';
const GH_HEADERS = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'fisioself-sentry-bridge',
  'Content-Type': 'application/json'
};

// Verifica la firma HMAC-SHA256 que Sentry manda en el header
// `sentry-hook-signature`, calculada sobre el cuerpo crudo con el Client Secret.
async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!SENTRY_WEBHOOK_SECRET) return false;
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SENTRY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Comparación de tiempo constante para no filtrar la firma por timing.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

interface SentryEvent {
  issue_id?: string;
  title?: string;
  web_url?: string;
  culprit?: string;
  level?: string;
  environment?: string;
  metadata?: { type?: string; value?: string };
}

// Extrae lo esencial del payload del webhook de Sentry, tolerando variaciones
// de forma entre tipos de evento (event_alert / issue).
function extractEvent(payload: Record<string, unknown>): SentryEvent {
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const ev = (data.event ?? data.issue ?? {}) as Record<string, unknown>;
  const meta = (ev.metadata ?? {}) as Record<string, unknown>;
  return {
    issue_id: String(ev.issue_id ?? ev.id ?? ev.group_id ?? ''),
    title: String(ev.title ?? meta.value ?? meta.type ?? 'Error sin título'),
    web_url: String(ev.web_url ?? ev.url ?? data.web_url ?? ''),
    culprit: ev.culprit ? String(ev.culprit) : undefined,
    level: ev.level ? String(ev.level) : undefined,
    environment: ev.environment ? String(ev.environment) : undefined,
    metadata: {
      type: meta.type ? String(meta.type) : undefined,
      value: meta.value ? String(meta.value) : undefined
    }
  };
}

// ¿Ya existe un issue abierto para este issue de Sentry? Evita duplicados cuando
// Sentry reintenta o manda el webhook varias veces.
async function alreadyOpen(issueId: string): Promise<boolean> {
  if (!issueId) return false;
  const q = encodeURIComponent(
    `repo:${GITHUB_REPO} is:issue is:open in:body "sentry-issue-id: ${issueId}"`
  );
  const res = await fetch(`${GH_API}/search/issues?q=${q}`, { headers: GH_HEADERS });
  if (!res.ok) return false; // si la búsqueda falla, mejor crear que perder el aviso
  const json = (await res.json()) as { total_count?: number };
  return (json.total_count ?? 0) > 0;
}

async function createIssue(ev: SentryEvent): Promise<Response> {
  const title = `🐞 Sentry: ${ev.title}`.slice(0, 250);
  const lines = [
    'Issue creado automáticamente desde una alerta de Sentry.',
    '',
    `**Error:** ${ev.title}`,
    ev.culprit ? `**Origen:** \`${ev.culprit}\`` : '',
    ev.level ? `**Nivel:** ${ev.level}` : '',
    ev.environment ? `**Entorno:** ${ev.environment}` : '',
    ev.web_url ? `\n**Ver en Sentry:** ${ev.web_url}` : '\nVer en Sentry (sentry.io)',
    '',
    '---',
    'Claude investigará la causa raíz y abrirá un PR en borrador si hay un fix claro.',
    '',
    `<!-- sentry-issue-id: ${ev.issue_id} -->`
  ].filter(Boolean);

  return fetch(`${GH_API}/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: GH_HEADERS,
    body: JSON.stringify({ title, body: lines.join('\n'), labels: ['sentry', 'auto-triage'] })
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!GITHUB_TOKEN || !SENTRY_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Bridge not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('sentry-hook-signature') ?? '';
  if (!(await verifySignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Sentry manda webhooks de instalación/verificación al conectar la integración:
  // no traen un evento de error, así que respondemos 200 sin crear nada.
  const resource = req.headers.get('sentry-hook-resource') ?? '';
  if (resource && resource !== 'event_alert' && resource !== 'issue' && resource !== 'error') {
    return new Response(JSON.stringify({ ok: true, skipped: `resource:${resource}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ev = extractEvent(payload);

  if (await alreadyOpen(ev.issue_id ?? '')) {
    return new Response(JSON.stringify({ ok: true, skipped: 'duplicate' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const gh = await createIssue(ev);
  if (!gh.ok) {
    const detail = await gh.text();
    return new Response(JSON.stringify({ error: 'GitHub issue creation failed', detail }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const created = (await gh.json()) as { number?: number; html_url?: string };
  return new Response(JSON.stringify({ ok: true, issue: created.number, url: created.html_url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
