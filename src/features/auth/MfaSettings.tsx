import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../../services/authService';
import { useToast } from '../../app/ToastProvider';
import { getErrorMessage } from '../../shared/errors';

// Panel para que cada miembro del equipo active o desactive su segundo factor
// (TOTP). Aparece en la cabecera. Cada usuario gestiona su propio autenticador.
export function MfaSettings({ onClose }: { onClose: () => void }) {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: factors = [], isLoading } = useQuery({
    queryKey: ['mfa', 'factors'],
    queryFn: () => authService.listMfaFactors()
  });

  const verified = factors.find((f) => f.status === 'verified');

  // Estado del alta en curso (QR + código de confirmación).
  const [enrolling, setEnrolling] = useState<{
    factorId: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startEnroll = async () => {
    setBusy(true);
    setError('');
    try {
      const friendlyName = `Autenticador ${new Date().toISOString().slice(0, 10)}`;
      const result = await authService.enrollTotp(friendlyName);
      setEnrolling(result);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo iniciar el registro del 2FA.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrolling) return;
    setBusy(true);
    setError('');
    try {
      await authService.verifyTotp(enrolling.factorId, code.trim());
      notify({ tone: 'success', message: 'Segundo factor activado correctamente.' });
      setEnrolling(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch (err) {
      setError(getErrorMessage(err, 'Código incorrecto. Intenta de nuevo.'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const disable = async (factorId: string) => {
    if (!window.confirm('¿Desactivar la verificación en dos pasos para tu cuenta?')) return;
    setBusy(true);
    try {
      await authService.unenrollFactor(factorId);
      notify({ tone: 'success', message: 'Segundo factor desactivado.' });
      queryClient.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch (err) {
      notify({ tone: 'error', message: getErrorMessage(err, 'No se pudo desactivar.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mfa-settings" style={{ maxWidth: 460 }}>
      <div className="form-header">
        <div>
          <p className="eyebrow">Seguridad</p>
          <h2>Verificación en dos pasos</h2>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>

      {isLoading && <p className="muted">Cargando...</p>}

      {!isLoading && !enrolling && (
        <>
          {verified ? (
            <>
              <p className="muted">
                Tu cuenta está protegida con un segundo factor. Al iniciar sesión pediremos un
                código de tu app de autenticación.
              </p>
              <button
                type="button"
                className="danger"
                onClick={() => disable(verified.id)}
                disabled={busy}
              >
                Desactivar 2FA
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                Añade una capa extra de seguridad: además de tu contraseña, pediremos un código de
                tu teléfono al entrar.
              </p>
              <button type="button" onClick={startEnroll} disabled={busy}>
                {busy ? 'Generando...' : 'Activar 2FA'}
              </button>
            </>
          )}
        </>
      )}

      {enrolling && (
        <form onSubmit={confirmEnroll}>
          <p className="muted">
            1. Escanea este código QR con tu app de autenticación (Google Authenticator, Authy…).
          </p>
          <div
            style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}
            // El QR viene como SVG desde Supabase; es contenido propio y de confianza.
            dangerouslySetInnerHTML={{ __html: enrolling.qrCode }}
          />
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            ¿No puedes escanear? Ingresa esta clave manualmente:
            <br />
            <code style={{ wordBreak: 'break-all' }}>{enrolling.secret}</code>
          </p>

          <label>
            2. Ingresa el código de 6 dígitos que muestra la app
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
            {busy ? 'Verificando...' : 'Confirmar y activar'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEnrolling(null);
              setCode('');
              setError('');
            }}
            disabled={busy}
          >
            Cancelar
          </button>
        </form>
      )}

      {error && !enrolling && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
