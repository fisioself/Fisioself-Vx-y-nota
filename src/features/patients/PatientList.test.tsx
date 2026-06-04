import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { clinicalApi } from '../../services/clinicalApi';
import type { Patient } from '../../types/clinical';
import { PatientList } from './PatientList';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    listPatientsToday: vi.fn(),
    searchPatients: vi.fn()
  }
}));
// PatientTrash hace sus propias queries; no es objeto de esta prueba.
vi.mock('./PatientTrash', () => ({ PatientTrash: () => <div data-testid="patient-trash-mock" /> }));

const TODAY: Patient[] = [
  { id: 'p1', full_name: 'Ana García', status: 'En tratamiento', phone: '2221234567' } as Patient
];
const FOUND: Patient[] = [
  { id: 'p2', full_name: 'Beto López', status: 'En tratamiento', phone: '3339876543' } as Patient
];

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
  vi.mocked(clinicalApi.listPatientsToday).mockReset();
  vi.mocked(clinicalApi.searchPatients).mockReset();
  vi.mocked(clinicalApi.listPatientsToday).mockResolvedValue(TODAY);
  vi.mocked(clinicalApi.searchPatients).mockResolvedValue(FOUND);
});

describe('PatientList', () => {
  it('la lista de hoy arranca colapsada', async () => {
    render(<PatientList />, { wrapper: makeWrapper() });
    await waitFor(() => expect(clinicalApi.listPatientsToday).toHaveBeenCalled());
    // El nombre no se muestra hasta expandir.
    expect(screen.queryByText('Ana García')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mostrar pacientes de hoy/i })).toBeInTheDocument();
  });

  it('al expandir muestra los pacientes de hoy', async () => {
    render(<PatientList />, { wrapper: makeWrapper() });
    await userEvent.click(await screen.findByRole('button', { name: /mostrar pacientes de hoy/i }));
    expect(await screen.findByText('Ana García')).toBeInTheDocument();
  });

  it('buscar dispara searchPatients (con debounce) y muestra resultados', async () => {
    render(<PatientList />, { wrapper: makeWrapper() });
    await userEvent.type(screen.getByLabelText(/buscar pacientes/i), 'Beto');
    await waitFor(
      () => {
        expect(clinicalApi.searchPatients).toHaveBeenCalledWith('Beto');
      },
      { timeout: 1000 }
    );
    expect(await screen.findByText('Beto López')).toBeInTheDocument();
  });

  it('seleccionar un paciente invoca onSelect', async () => {
    const onSelect = vi.fn();
    render(<PatientList onSelect={onSelect} />, { wrapper: makeWrapper() });
    await userEvent.click(await screen.findByRole('button', { name: /mostrar pacientes de hoy/i }));
    await userEvent.click(await screen.findByText('Ana García'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('muestra mensaje cuando la búsqueda no encuentra pacientes', async () => {
    vi.mocked(clinicalApi.searchPatients).mockResolvedValue([]);
    render(<PatientList />, { wrapper: makeWrapper() });
    await userEvent.type(screen.getByLabelText(/buscar pacientes/i), 'Zzz');
    expect(await screen.findByText(/no se encontraron pacientes/i)).toBeInTheDocument();
  });
});
