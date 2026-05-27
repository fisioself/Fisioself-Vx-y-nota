import { useState } from 'react';
import { authService } from '../../services/authService.js';

export function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await authService.signInWithPassword({ email: email.trim(), password });
      onLogin?.(session);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesion.');
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
              background: '#0b0f0e',
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

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="auth-footnote">San Andres Cholula, Puebla · MX</p>
      </form>
    </main>
  );
}
