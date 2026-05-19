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
        <p className="eyebrow">FISIOSELF App Notas VX</p>
        <h1>Acceso clinico seguro</h1>
        <p className="muted">Entra con tu usuario de Supabase Auth.</p>

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
      </form>
    </main>
  );
}
