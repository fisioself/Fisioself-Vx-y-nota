import { afterEach, describe, expect, it, vi } from 'vitest';

// Mockeamos supabaseClient para probar authService sin red real.
const loadAuth = async ({ auth, configured = true }) => {
  vi.resetModules();
  vi.doMock('../lib/supabaseClient.js', () => ({
    isSupabaseConfigured: configured,
    supabase: configured ? { auth } : null,
    assertSupabase: () => ({ auth })
  }));
  return import('./authService');
};

afterEach(() => {
  vi.doUnmock('../lib/supabaseClient.js');
  vi.restoreAllMocks();
});

describe('authService.getSession', () => {
  it('devuelve la sesión activa', async () => {
    const auth = {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
    };
    const { authService } = await loadAuth({ auth });
    const session = await authService.getSession();
    expect(session).toMatchObject({ user: { id: 'u1' } });
  });

  it('lanza error si Supabase falla', async () => {
    const auth = {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('boom') })
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.getSession()).rejects.toThrow('boom');
  });
});

describe('authService.signInWithPassword', () => {
  it('inicia sesión y devuelve la sesión', async () => {
    const auth = {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
    };
    const { authService } = await loadAuth({ auth });
    const session = await authService.signInWithPassword({ email: 'a@b.com', password: 'x' });
    expect(session).toMatchObject({ access_token: 'tok' });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'x' });
  });

  it('lanza error con credenciales inválidas', async () => {
    const auth = {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: new Error('invalid') })
    };
    const { authService } = await loadAuth({ auth });
    await expect(
      authService.signInWithPassword({ email: 'a@b.com', password: 'bad' })
    ).rejects.toThrow('invalid');
  });
});

describe('authService.signOut', () => {
  it('cierra sesión sin error', async () => {
    const auth = { signOut: vi.fn().mockResolvedValue({ error: null }) };
    const { authService } = await loadAuth({ auth });
    await expect(authService.signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('propaga el error al cerrar sesión', async () => {
    const auth = { signOut: vi.fn().mockResolvedValue({ error: new Error('no') }) };
    const { authService } = await loadAuth({ auth });
    await expect(authService.signOut()).rejects.toThrow('no');
  });
});

describe('authService.onAuthStateChange', () => {
  it('se suscribe y devuelve la suscripción', async () => {
    const unsubscribe = vi.fn();
    const auth = {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { id: 's1', unsubscribe } } }))
    };
    const { authService } = await loadAuth({ auth });
    const sub = authService.onAuthStateChange(() => {});
    expect(sub).toMatchObject({ id: 's1' });
    expect(auth.onAuthStateChange).toHaveBeenCalled();
  });

  it('devuelve una suscripción noop si Supabase no está configurado', async () => {
    const { authService } = await loadAuth({ auth: {}, configured: false });
    const sub = authService.onAuthStateChange(() => {});
    expect(sub.id).toBe('noop');
    expect(() => sub.unsubscribe()).not.toThrow();
  });
});
