import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, assertSupabase } from '../lib/supabaseClient';
import { identifyUser, resetAnalyticsUser } from '../lib/analytics';

const noopSubscription: Subscription = {
  id: 'noop',
  callback: () => {},
  unsubscribe: () => {}
};

export const authService = {
  async getSession(): Promise<Session | null> {
    const db = assertSupabase();
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(callback: (session: Session | null) => void): Subscription {
    if (!isSupabaseConfigured || !supabase) return noopSubscription;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },

  async signInWithPassword({
    email,
    password,
    captchaToken
  }: {
    email: string;
    password: string;
    // Token de Cloudflare Turnstile. Obligatorio cuando la protección CAPTCHA
    // está activada en Supabase Auth; si no se envía, el login es rechazado.
    captchaToken?: string;
  }): Promise<Session | null> {
    const db = assertSupabase();
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined
    });
    if (error) throw error;
    if (data.session?.user?.id) {
      identifyUser(data.session.user.id);
    }
    return data.session;
  },

  async signOut(): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.auth.signOut();
    if (error) throw error;
    resetAnalyticsUser();
  },

  // --- MFA / Segundo factor (TOTP) ---
  // Supabase Auth implementa TOTP gratis. El flujo es:
  //  1. enroll → genera un factor y su QR; el usuario lo escanea en su app
  //     (Google Authenticator, Authy, etc.) y confirma con un código.
  //  2. En cada login con 2FA activo, la sesión sube a AAL1; hay que resolver
  //     un challenge con el código de 6 dígitos para llegar a AAL2.

  // Nivel de garantía de autenticación de la sesión actual.
  // currentLevel = 'aal1' (solo contraseña) | 'aal2' (contraseña + 2FO).
  // nextLevel = 'aal2' significa que el usuario tiene un factor verificado y
  // debe completar el reto para quedar plenamente autenticado.
  async getAssuranceLevel(): Promise<{
    currentLevel: string | null;
    nextLevel: string | null;
  }> {
    const db = assertSupabase();
    const { data, error } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
  },

  // ¿El usuario debe resolver un reto 2FA ahora mismo? (tiene factor activo
  // pero la sesión todavía es solo de contraseña).
  async needsMfaChallenge(): Promise<boolean> {
    const { currentLevel, nextLevel } = await this.getAssuranceLevel();
    return currentLevel === 'aal1' && nextLevel === 'aal2';
  },

  // Lista los factores TOTP del usuario (verificados o pendientes).
  async listMfaFactors(): Promise<Array<{ id: string; status: string; friendlyName?: string }>> {
    const db = assertSupabase();
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw error;
    return (data.totp ?? []).map((f) => ({
      id: f.id,
      status: f.status,
      friendlyName: f.friendly_name ?? undefined
    }));
  },

  // Inicia el alta de un autenticador: devuelve el factorId y el QR (SVG) para
  // que el usuario lo escanee. El factor queda 'unverified' hasta confirmarlo.
  async enrollTotp(
    friendlyName: string
  ): Promise<{ factorId: string; qrCode: string; secret: string }> {
    const db = assertSupabase();
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName
    });
    if (error) throw error;
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  },

  // Confirma el alta (o resuelve el reto de login) verificando el código de 6
  // dígitos. challengeAndVerify hace challenge+verify en un solo paso.
  async verifyTotp(factorId: string, code: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
  },

  // Elimina un factor (desactiva el 2FA para ese autenticador).
  async unenrollFactor(factorId: string): Promise<void> {
    const db = assertSupabase();
    const { error } = await db.auth.mfa.unenroll({ factorId });
    if (error) throw error;
  }
};
