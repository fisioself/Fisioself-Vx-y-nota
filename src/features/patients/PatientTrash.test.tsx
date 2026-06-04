import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import { useRole } from '../../shared/useRole';
import { PatientTrash } from './PatientTrash';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    listDeletedPatients: vi.fn(),
    restorePatient: vi.fn()
  }
}));
vi.mock('../../shared/useRole', () => ({ useRole: vi.fn() }));

const DELETED = [{ id: 'p1', full_name: 'Ana Borrada', deleted_at: '2026-05-01T10:00:00.000Z' }];

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

const asAdmin = () => vi.mocked(useRole).mockReturnValue({ data: 'admin' } as never);
const asTherapist = () => vi.mocked(useRole).mockReturnValue({ data: 'therapist' } as never);

beforeEach(() => {
  vi.mocked(clinicalApi.listDeletedPatients).mockReset();
  vi.mocked(clinicalApi.restorePatient).mockReset();
  vi.mocked(clinicalApi.listDeletedPatients).mockResolvedValue(DELETED as never);
  vi.mocked(clinicalApi.restorePatient).mockResolvedValue(undefined as never);
});

describe('PatientTrash', () => {
  it('no se muestra para no-administradores', () => {
    asTherapist();
    render(<PatientTrash />, { wrapper: makeWrapper() });
    expect(
      screen.queryByRole('button', { name: /papelera de pacientes/i })
    ).not.toBeInTheDocument();
  });

  it('admin ve el botón de la papelera (colapsada por defecto)', () => {
    asAdmin();
    render(<PatientTrash />, { wrapper: makeWrapper() });
    expect(screen.getByRole('button', { name: /papelera de pacientes/i })).toBeInTheDocument();
    // No carga la lista hasta abrir.
    expect(clinicalApi.listDeletedPatients).not.toHaveBeenCalled();
  });

  it('al abrir carga y lista los pacientes borrados', async () => {
    asAdmin();
    render(<PatientTrash />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /papelera de pacientes/i }));
    expect(await screen.findByText('Ana Borrada')).toBeInTheDocument();
    expect(clinicalApi.listDeletedPatients).toHaveBeenCalled();
  });

  it('restaurar llama a restorePatient', async () => {
    asAdmin();
    render(<PatientTrash />, { wrapper: makeWrapper() });
    await userEvent.click(screen.getByRole('button', { name: /papelera de pacientes/i }));
    await userEvent.click(await screen.findByRole('button', { name: /restaurar/i }));
    await waitFor(() => {
      expect(clinicalApi.restorePatient).toHaveBeenCalledWith('p1');
    });
  });
});
