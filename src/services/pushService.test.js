import { afterEach, describe, expect, it, vi } from 'vitest';

// Suscripción de push falsa con la forma que devuelve el navegador.
const makeSub = (endpoint = 'https://push.example/abc') => ({
  endpoint,
  toJSON: () => ({ keys: { p256dh: 'PKEY', auth: 'AKEY' } }),
  unsubscribe: vi.fn().mockResolvedValue(true)
});

// Prepara los globals del navegador (Notification, serviceWorker, PushManager)
// que pushService consulta. Devuelve los spies del pushManager para aserciones.
const setupBrowser = ({ permission = 'granted', existingSub = null, subscribeResult } = {}) => {
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission)
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existingSub),
    subscribe: vi.fn().mockResolvedValue(subscribeResult ?? makeSub())
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) }
  });
  return { pushManager };
};

// Carga el módulo con env de VAPID fijo y un mock de Supabase con spies.
const loadPush = async ({ vapid = 'QUJD' } = {}) => {
  vi.resetModules();
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', vapid);
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockReturnValue({ eq });
  vi.doMock('../lib/supabaseClient.js', () => ({
    assertSupabase: () => ({ from: () => ({ upsert, delete: del }) })
  }));
  const mod = await import('./pushService');
  return { ...mod, upsert, del, eq };
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete navigator.serviceWorker;
});

describe('pushService.enable', () => {
  it('pide permiso, se suscribe y guarda la suscripción del usuario', async () => {
    const { pushManager } = setupBrowser({ permission: 'granted', existingSub: null });
    const { pushService, upsert } = await loadPush();

    await pushService.enable('user-1');

    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', endpoint: 'https://push.example/abc', p256dh: 'PKEY', auth: 'AKEY' },
      { onConflict: 'user_id,endpoint' }
    );
  });

  it('reutiliza la suscripción existente sin volver a suscribir', async () => {
    const existing = makeSub('https://push.example/existing');
    const { pushManager } = setupBrowser({ permission: 'granted', existingSub: existing });
    const { pushService, upsert } = await loadPush();

    await pushService.enable('user-1');

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example/existing' }),
      expect.anything()
    );
  });

  it('lanza error claro si el usuario niega el permiso', async () => {
    setupBrowser({ permission: 'denied' });
    const { pushService } = await loadPush();
    await expect(pushService.enable('user-1')).rejects.toThrow(/permiso/i);
  });

  it('lanza error si falta la clave VAPID', async () => {
    setupBrowser({ permission: 'granted' });
    const { pushService } = await loadPush({ vapid: '' });
    await expect(pushService.enable('user-1')).rejects.toThrow(/VAPID/);
  });
});

describe('pushService.isEnabled', () => {
  it('es true cuando hay permiso y suscripción', async () => {
    setupBrowser({ permission: 'granted', existingSub: makeSub() });
    const { pushService } = await loadPush();
    expect(await pushService.isEnabled()).toBe(true);
  });

  it('es false sin permiso aunque exista suscripción', async () => {
    setupBrowser({ permission: 'default', existingSub: makeSub() });
    const { pushService } = await loadPush();
    expect(await pushService.isEnabled()).toBe(false);
  });
});

describe('pushService.disable', () => {
  it('borra la suscripción del servidor y la cancela en el navegador', async () => {
    const existing = makeSub('https://push.example/to-delete');
    setupBrowser({ permission: 'granted', existingSub: existing });
    const { pushService, del, eq } = await loadPush();

    await pushService.disable();

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example/to-delete');
    expect(existing.unsubscribe).toHaveBeenCalled();
  });

  it('no hace nada si no hay suscripción', async () => {
    setupBrowser({ permission: 'granted', existingSub: null });
    const { pushService, del } = await loadPush();
    await pushService.disable();
    expect(del).not.toHaveBeenCalled();
  });
});
