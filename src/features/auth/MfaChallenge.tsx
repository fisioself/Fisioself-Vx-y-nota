import { useState, type FormEvent } from 'react';
import { authService } from '../../services/authService';
import { getErrorMessage } from '../../shared/errors';
import { AppLogo } from '../../components/AppLogo';

interface MfaChallengeProps {
  // Id del factor TOTP verificado del usuario.
  factorId: string;
  // Se llama cuando el reto se resuelve y la sesión sube a AAL2.
  onVerified: () => void;
  // Cerrar sesión (botón de escape si el usuario perdió su autenticador).
  onCancel: () => void;
}

// Pantalla que aparece tras el login cuando el usuario ya tiene 2FA activo:
// pide el código de 6 dígitos de su app de autenticación.
export function MfaChallenge({ factorId, onVerified, onCancel }: MfaChallengeProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authService.verifyTotp(factorId, code.trim());
      onVerified();
    } catch (err) {
      setError(getErrorMessage(err, 'Código incorrecto. Intenta de nuevo.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand-lockup">
          <AppLogo size={56} />
          <div>
            <p className="brand-name">FISIOSELF</p>
            <p className="brand-system">Verificación en dos pasos</p>
          </div>
        </div>

        <div className="auth-copy">
          <p className="eyebrow">Seguridad</p>
          <h1>Código de verificación</h1>
          <p className="muted">
            Abre tu app de autenticación (Google Authenticator, Authy…) e ingresa el código de 6
            dígitos.
          </p>
        </div>

        <label>
          Código
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || code.length !== 6}>
          {busy ? 'Verificando...' : 'Verificar'}
        </button>

        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancelar y salir
        </button>
      </form>
    </main>
  );
}
