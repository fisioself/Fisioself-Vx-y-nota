import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../../services/authService';
import { MfaChallenge } from './MfaChallenge';

vi.mock('../../services/authService', () => ({
  authService: { verifyTotp: vi.fn() }
}));

beforeEach(() => {
  vi.mocked(authService.verifyTotp).mockReset();
  vi.mocked(authService.verifyTotp).mockResolvedValue({} as never);
});

describe('MfaChallenge', () => {
  it('el botón Verificar está deshabilitado hasta tener 6 dígitos', async () => {
    render(<MfaChallenge factorId="f1" onVerified={vi.fn()} onCancel={vi.fn()} />);
    const button = screen.getByRole('button', { name: /verificar/i });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/código/i), '123456');
    expect(button).toBeEnabled();
  });

  it('ignora caracteres no numéricos en el código', async () => {
    render(<MfaChallenge factorId="f1" onVerified={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/código/i) as HTMLInputElement;
    await userEvent.type(input, '12ab34cd56');
    expect(input.value).toBe('123456');
  });

  it('verifica el código y llama onVerified', async () => {
    const onVerified = vi.fn();
    render(<MfaChallenge factorId="f1" onVerified={onVerified} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/código/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => {
      expect(authService.verifyTotp).toHaveBeenCalledWith('f1', '123456');
    });
    expect(onVerified).toHaveBeenCalled();
  });

  it('muestra error y limpia el código si el código es incorrecto', async () => {
    vi.mocked(authService.verifyTotp).mockRejectedValueOnce(new Error('Invalid TOTP code'));
    const onVerified = vi.fn();
    render(<MfaChallenge factorId="f1" onVerified={onVerified} onCancel={vi.fn()} />);
    const input = screen.getByLabelText(/código/i) as HTMLInputElement;
    await userEvent.type(input, '000000');
    await userEvent.click(screen.getByRole('button', { name: /verificar/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(onVerified).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('Cancelar y salir invoca onCancel', async () => {
    const onCancel = vi.fn();
    render(<MfaChallenge factorId="f1" onVerified={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancelar y salir/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
