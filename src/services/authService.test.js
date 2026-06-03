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

  it('reenvía el captchaToken a Supabase cuando se proporciona', async () => {
    const auth = {
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
    };
    const { authService } = await loadAuth({ auth });
    await authService.signInWithPassword({
      email: 'a@b.com',
      password: 'x',
      captchaToken: 'cf-token'
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'x',
      options: { captchaToken: 'cf-token' }
    });
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

describe('authService MFA / segundo factor', () => {
  it('needsMfaChallenge es true cuando la sesión es aal1 y el siguiente nivel es aal2', async () => {
    const auth = {
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      }
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.needsMfaChallenge()).resolves.toBe(true);
  });

  it('needsMfaChallenge es false cuando ya está en aal2', async () => {
    const auth = {
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
      }
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.needsMfaChallenge()).resolves.toBe(false);
  });

  it('needsMfaChallenge es false cuando el usuario no tiene 2FA (nextLevel aal1)', async () => {
    const auth = {
      mfa: {
        getAuthenticatorAssuranceLevel: vi
          .fn()
          .mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
      }
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.needsMfaChallenge()).resolves.toBe(false);
  });

  it('listMfaFactors devuelve solo los factores TOTP normalizados', async () => {
    const auth = {
      mfa: {
        listFactors: vi.fn().mockResolvedValue({
          data: {
            totp: [{ id: 'f1', status: 'verified', friendly_name: 'Mi teléfono' }]
          },
          error: null
        })
      }
    };
    const { authService } = await loadAuth({ auth });
    const factors = await authService.listMfaFactors();
    expect(factors).toEqual([{ id: 'f1', status: 'verified', friendlyName: 'Mi teléfono' }]);
  });

  it('enrollTotp devuelve el factorId, el QR y el secret', async () => {
    const auth = {
      mfa: {
        enroll: vi.fn().mockResolvedValue({
          data: { id: 'f2', totp: { qr_code: '<svg/>', secret: 'ABC123' } },
          error: null
        })
      }
    };
    const { authService } = await loadAuth({ auth });
    const result = await authService.enrollTotp('Autenticador');
    expect(result).toEqual({ factorId: 'f2', qrCode: '<svg/>', secret: 'ABC123' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Autenticador'
    });
  });

  it('verifyTotp resuelve el reto con challengeAndVerify', async () => {
    const auth = {
      mfa: { challengeAndVerify: vi.fn().mockResolvedValue({ data: {}, error: null }) }
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.verifyTotp('f1', '123456')).resolves.toBeUndefined();
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' });
  });

  it('verifyTotp propaga el error de un código inválido', async () => {
    const auth = {
      mfa: {
        challengeAndVerify: vi.fn().mockResolvedValue({ data: null, error: new Error('invalid') })
      }
    };
    const { authService } = await loadAuth({ auth });
    await expect(authService.verifyTotp('f1', '000000')).rejects.toThrow('invalid');
  });

  it('unenrollFactor elimina el factor', async () => {
    const auth = { mfa: { unenroll: vi.fn().mockResolvedValue({ data: {}, error: null }) } };
    const { authService } = await loadAuth({ auth });
    await expect(authService.unenrollFactor('f1')).resolves.toBeUndefined();
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
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
