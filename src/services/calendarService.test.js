import { afterEach, describe, expect, it, vi } from 'vitest';

// Fijamos las URLs de las funciones Edge con vi.stubEnv para que las pruebas
// sean deterministas, exista o no un .env local (en CI no hay .env).
const loadCalendar = async ({ configured = false, rpc, auth, env = {} } = {}) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: configured,
    supabase: configured ? { rpc } : null,
    assertSupabase: () => ({ auth, rpc })
  }));
  return import('./calendarService');
};

const sessionAuth = (token = 'tok') => ({
  getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: token } }, error: null })
});

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('calendarService.syncAppointment', () => {
  it('envía la cita y devuelve el appointment', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ appointment: { id: 'appt-1' } })
      })
    );
    const { calendarService } = await loadCalendar({
      auth: sessionAuth(),
      env: { VITE_GOOGLE_CALENDAR_SYNC_URL: 'https://x/sync' }
    });
    const appt = await calendarService.syncAppointment('appt-1');
    expect(appt).toMatchObject({ id: 'appt-1' });
  });

  it('falla si no está configurada la URL de sync', async () => {
    const { calendarService } = await loadCalendar({
      auth: sessionAuth(),
      env: { VITE_GOOGLE_CALENDAR_SYNC_URL: '' }
    });
    await expect(calendarService.syncAppointment('appt-1')).rejects.toThrow(/SYNC_URL/);
  });
});

describe('calendarService.fetchEvents', () => {
  it('devuelve la lista de eventos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [{ id: 'e1', summary: 'Cita' }] })
      })
    );
    const { calendarService } = await loadCalendar({
      auth: sessionAuth(),
      env: { VITE_GOOGLE_CALENDAR_FETCH_URL: 'https://x/fetch' }
    });
    const events = await calendarService.fetchEvents({ maxResults: 5 });
    expect(events).toHaveLength(1);
  });
});

describe('calendarService.startGoogleConnection', () => {
  it('abre la URL de Google y la devuelve', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: 'https://accounts.google.com/o/oauth2' })
      })
    );
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const { calendarService } = await loadCalendar({
      auth: sessionAuth(),
      env: { VITE_GOOGLE_CALENDAR_CONNECT_URL: 'https://x/connect' }
    });
    const url = await calendarService.startGoogleConnection();
    expect(url).toContain('google.com');
    expect(openSpy).toHaveBeenCalled();
  });
});

describe('calendarService.getConnectionStatus', () => {
  it('devuelve no conectado si Supabase no está configurado', async () => {
    const { calendarService } = await loadCalendar({ configured: false });
    expect(await calendarService.getConnectionStatus()).toEqual({ connected: false, email: null });
  });

  it('devuelve conectado con el email cuando la RPC lo reporta', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ connected: true, email: 'clinica@fisioself.com' }],
      error: null
    });
    const { calendarService } = await loadCalendar({ configured: true, rpc });
    expect(await calendarService.getConnectionStatus()).toEqual({
      connected: true,
      email: 'clinica@fisioself.com'
    });
  });

  it('lanza error si la RPC falla', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc fail' } });
    const { calendarService } = await loadCalendar({ configured: true, rpc });
    await expect(calendarService.getConnectionStatus()).rejects.toThrow('rpc fail');
  });
});
