import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_TYPES, aiService } from './aiService.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('../lib/supabaseClient.js');
});

// Carga aiService con el proxy configurado y supabase mockeado (con sesión).
const loadAiMocked = async ({ auth, proxyUrl = 'https://example.com/clinical-ai' } = {}) => {
  vi.resetModules();
  vi.stubEnv('VITE_CLAUDE_PROXY_URL', proxyUrl);
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: true,
    supabase: { auth },
    assertSupabase: () => ({ auth })
  }));
  return import('./aiService.js');
};

const sessionAuth = (token = 'tok') => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: token } }, error: null })
});

// Response simulado con cuerpo en streaming (formato SSE de Claude).
const streamResponse = (chunks) => {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn(async () => {
          if (i < chunks.length) {
            const value = enc.encode(chunks[i]);
            i += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        })
      })
    }
  };
};

describe('aiService', () => {
  it('keeps supported AI types explicit', () => {
    const ids = AI_TYPES.map((type) => type.id);
    expect(ids).toContain('soap');
    expect(ids).toContain('exercises');
    expect(ids).toContain('clinical_analysis');
    expect(ids).toContain('treatment_plan');
  });

  it('rejects empty text before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(aiService.transform({ text: '  ', type: 'soap' })).rejects.toThrow(/escribe/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unsupported AI type before calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(aiService.transform({ text: 'nota valida', type: 'bad_type' })).rejects.toThrow(
      /tipo/i
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires an authenticated Supabase session before calling the proxy', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_CLAUDE_PROXY_URL', 'https://example.com/clinical-ai');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { aiService: configuredAiService } = await import('./aiService.js');

    await expect(
      configuredAiService.transform({ text: 'nota clinica valida', type: 'soap' })
    ).rejects.toThrow(/inicia sesion/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('aiService.transform streaming', () => {
  it('arma la respuesta de los chunks SSE y llama onChunk', async () => {
    const chunks = [
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hola ' } }) + '\n',
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { text: 'mundo' } }) + '\n',
      'data: [DONE]\n'
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)));
    const { aiService: ai } = await loadAiMocked({ auth: sessionAuth() });

    const seen = [];
    const out = await ai.transform({
      text: 'nota',
      type: 'soap',
      onChunk: (acc) => seen.push(acc)
    });

    expect(out).toBe('Hola mundo');
    expect(seen.at(-1)).toBe('Hola mundo');
  });

  it('no pierde texto cuando una línea SSE llega partida entre dos chunks', async () => {
    // El payload `data: {...}` se corta a la mitad: el buffer entre lecturas debe
    // reensamblarlo. Sin buffer, el JSON.parse fallaría y se perdería el texto.
    const full =
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { text: 'Hola mundo' } });
    const mid = Math.floor(full.length / 2);
    const chunks = [full.slice(0, mid), full.slice(mid) + '\n', 'data: [DONE]\n'];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)));
    const { aiService: ai } = await loadAiMocked({ auth: sessionAuth() });

    const out = await ai.transform({ text: 'nota', type: 'soap' });
    expect(out).toBe('Hola mundo');
  });

  it('procesa la última línea aunque no termine en salto de línea', async () => {
    const chunks = [
      'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { text: 'Final' } })
      // sin '\n' al final: el resto del buffer debe procesarse igualmente
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)));
    const { aiService: ai } = await loadAiMocked({ auth: sessionAuth() });

    const out = await ai.transform({ text: 'nota', type: 'soap' });
    expect(out).toBe('Final');
  });

  it('lanza error cuando la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'fallo el proxy' })
      })
    );
    const { aiService: ai } = await loadAiMocked({ auth: sessionAuth() });
    await expect(ai.transform({ text: 'nota', type: 'soap' })).rejects.toThrow('fallo el proxy');
  });

  it('lanza error si la IA no devuelve contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(['data: [DONE]\n'])));
    const { aiService: ai } = await loadAiMocked({ auth: sessionAuth() });
    await expect(ai.transform({ text: 'nota', type: 'soap' })).rejects.toThrow(
      /no devolvio contenido/i
    );
  });
});
