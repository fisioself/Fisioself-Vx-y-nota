import { useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authService } from '../../services/authService';
import { getErrorMessage } from '../../shared/errors';
import { Turnstile } from './Turnstile';

interface LoginScreenProps {
  onLogin?: (session: Session | null) => void;
}

// Site key pública de Cloudflare Turnstile. Si está definida, mostramos el
// CAPTCHA y exigimos su token (debe coincidir con el secret puesto en Supabase).
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  // Al cambiar este número se re-monta el widget para pedir un token nuevo
  // (los tokens de Turnstile son de un solo uso: hay que renovarlos tras fallar).
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const captchaEnabled = Boolean(TURNSTILE_SITE_KEY);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (captchaEnabled && !captchaToken) {
      setError('Completa la verificación de seguridad.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const session = await authService.signInWithPassword({
        email: email.trim(),
        password,
        captchaToken: captchaEnabled ? captchaToken : undefined
      });
      onLogin?.(session);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo iniciar sesion.'));
      // El token ya se consumió en el intento: pedimos uno nuevo.
      if (captchaEnabled) {
        setCaptchaToken('');
        setCaptchaResetKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand-lockup">
          <img
            src="/logo.jpg"
            alt="FISIOSELF"
            width="56"
            height="56"
            style={{
              width: 56,
              height: 56,
              borderRadius: 15,
              objectFit: 'cover',
              boxShadow: '0 14px 26px rgba(18, 55, 42, 0.2)'
            }}
          />
          <div>
            <p className="brand-name">FISIOSELF</p>
            <p className="brand-system">Sistema clinico</p>
          </div>
        </div>

        <div className="auth-copy">
          <p className="eyebrow">App Notas VX</p>
          <h1>Acceso privado</h1>
          <p className="muted">Expediente, notas y agenda clinica del equipo FISIOSELF.</p>
        </div>

        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {captchaEnabled && TURNSTILE_SITE_KEY && (
          <Turnstile
            siteKey={TURNSTILE_SITE_KEY}
            onVerify={(t) => {
              setCaptchaToken(t);
              setError('');
            }}
            onExpire={() => setCaptchaToken('')}
            onError={(msg) => setError(msg)}
            resetKey={captchaResetKey}
          />
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || (captchaEnabled && !captchaToken)}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="auth-footnote">San Andres Cholula, Puebla · MX</p>
      </form>
    </main>
  );
}
