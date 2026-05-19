import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/authService.js';
import { LoginScreen } from './LoginScreen.jsx';

vi.mock('../../services/authService.js', () => ({
  authService: {
    signInWithPassword: vi.fn()
  }
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('signs in with email and password', async () => {
    authService.signInWithPassword.mockResolvedValueOnce({ user: { email: 'demo@example.com' } });
    const onLogin = vi.fn();

    render(<LoginScreen onLogin={onLogin} />);

    await userEvent.type(screen.getByLabelText(/correo/i), 'demo@example.com');
    await userEvent.type(screen.getByLabelText(/contrasena/i), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => {
      expect(authService.signInWithPassword).toHaveBeenCalledWith({
        email: 'demo@example.com',
        password: 'secret-pass'
      });
      expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(Object) }));
    });
  });

  it('shows auth errors without logging in', async () => {
    authService.signInWithPassword.mockRejectedValueOnce(new Error('Credenciales invalidas'));

    render(<LoginScreen onLogin={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/correo/i), 'demo@example.com');
    await userEvent.type(screen.getByLabelText(/contrasena/i), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/credenciales invalidas/i);
  });
});
