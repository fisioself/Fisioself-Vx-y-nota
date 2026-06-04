import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { authService } from '../../services/authService';
import { MfaSettings } from './MfaSettings';

vi.mock('../../services/authService', () => ({
  authService: {
    listMfaFactors: vi.fn(),
    enrollTotp: vi.fn(),
    verifyTotp: vi.fn(),
    unenrollFactor: vi.fn()
  }
}));

const makeWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.mocked(authService.listMfaFactors).mockReset();
  vi.mocked(authService.enrollTotp).mockReset();
  vi.mocked(authService.verifyTotp).mockReset();
  vi.mocked(authService.unenrollFactor).mockReset();
  vi.mocked(authService.listMfaFactors).mockResolvedValue([]);
  vi.mocked(authService.enrollTotp).mockResolvedValue({
    factorId: 'f-new',
    qrCode: '<svg></svg>',
    secret: 'ABC123'
  } as never);
  vi.mocked(authService.verifyTotp).mockResolvedValue({} as never);
  vi.mocked(authService.unenrollFactor).mockResolvedValue({} as never);
});

describe('MfaSettings', () => {
  it('sin factor verificado ofrece activar 2FA', async () => {
    render(<MfaSettings onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /activar 2fa/i })).toBeInTheDocument();
    });
  });

  it('con factor verificado ofrece desactivar 2FA', async () => {
    vi.mocked(authService.listMfaFactors).mockResolvedValue([
      { id: 'f1', status: 'verified' } as never
    ]);
    render(<MfaSettings onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /desactivar 2fa/i })).toBeInTheDocument();
    });
  });

  it('iniciar registro muestra el QR y la clave manual', async () => {
    render(<MfaSettings onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await userEvent.click(await screen.findByRole('button', { name: /activar 2fa/i }));
    await waitFor(() => {
      expect(authService.enrollTotp).toHaveBeenCalled();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
  });

  it('confirmar registro verifica el código de 6 dígitos', async () => {
    render(<MfaSettings onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await userEvent.click(await screen.findByRole('button', { name: /activar 2fa/i }));
    const input = await screen.findByLabelText(/código de 6 dígitos/i);
    await userEvent.type(input, '654321');
    await userEvent.click(screen.getByRole('button', { name: /confirmar y activar/i }));
    await waitFor(() => {
      expect(authService.verifyTotp).toHaveBeenCalledWith('f-new', '654321');
    });
  });

  it('desactivar pide confirmación antes de des-enrolar', async () => {
    vi.mocked(authService.listMfaFactors).mockResolvedValue([
      { id: 'f1', status: 'verified' } as never
    ]);
    render(<MfaSettings onClose={vi.fn()} />, { wrapper: makeWrapper() });
    await userEvent.click(await screen.findByRole('button', { name: /desactivar 2fa/i }));
    // No se des-enrola hasta confirmar en el diálogo.
    expect(authService.unenrollFactor).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /desactivar 2fa/i }));
    await waitFor(() => {
      expect(authService.unenrollFactor).toHaveBeenCalledWith('f1');
    });
  });
});
