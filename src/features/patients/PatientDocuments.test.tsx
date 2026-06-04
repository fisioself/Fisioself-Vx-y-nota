import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider';
import { documentsApi, type PatientDocument } from '../../services/documentsApi';
import { PatientDocuments } from './PatientDocuments';

vi.mock('../../services/documentsApi', async () => {
  const actual = await vi.importActual<typeof import('../../services/documentsApi')>(
    '../../services/documentsApi'
  );
  return {
    // Conservamos validateUploadFile real (es pura) y mockeamos las llamadas de red.
    ...actual,
    documentsApi: {
      list: vi.fn(),
      upload: vi.fn(),
      signedUrl: vi.fn(),
      remove: vi.fn()
    }
  };
});

const DOC: PatientDocument = {
  id: 'doc-1',
  patient_id: 'patient-1',
  clinic_id: 'clinic-1',
  storage_path: 'patient-1/abc.pdf',
  file_name: 'estudio.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1048576,
  description: null,
  uploaded_by: 'user-1',
  created_at: '2026-05-01T12:00:00.000Z'
};

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
  vi.mocked(documentsApi.list).mockReset();
  vi.mocked(documentsApi.upload).mockReset();
  vi.mocked(documentsApi.signedUrl).mockReset();
  vi.mocked(documentsApi.remove).mockReset();
  vi.mocked(documentsApi.list).mockResolvedValue([]);
  vi.mocked(documentsApi.upload).mockResolvedValue(DOC);
  vi.mocked(documentsApi.signedUrl).mockResolvedValue('https://signed.example/file');
  vi.mocked(documentsApi.remove).mockResolvedValue(undefined);
});

describe('PatientDocuments', () => {
  it('muestra mensaje vacío cuando no hay documentos', async () => {
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText(/no hay archivos adjuntos/i)).toBeInTheDocument();
    });
  });

  it('lista los documentos del paciente', async () => {
    vi.mocked(documentsApi.list).mockResolvedValue([DOC]);
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByText('estudio.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText(/1\.0 MB/)).toBeInTheDocument();
  });

  it('rechaza un archivo de tipo no permitido sin llamar a upload', async () => {
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/no hay archivos/i)).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(['x'], 'malware.exe', { type: 'application/x-msdownload' });
    await userEvent.upload(input, badFile);
    expect(documentsApi.upload).not.toHaveBeenCalled();
  });

  it('sube un archivo válido', async () => {
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/no hay archivos/i)).toBeInTheDocument());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const okFile = new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, okFile);
    await waitFor(() => {
      expect(documentsApi.upload).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-1', file: okFile })
      );
    });
  });

  it('eliminar pide confirmación antes de llamar a remove', async () => {
    vi.mocked(documentsApi.list).mockResolvedValue([DOC]);
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText('estudio.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(documentsApi.remove).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /eliminar/i }));
    await waitFor(() => {
      expect(documentsApi.remove).toHaveBeenCalledWith(DOC);
    });
  });

  it('Ver genera una URL firmada y abre el archivo', async () => {
    vi.mocked(documentsApi.list).mockResolvedValue([DOC]);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PatientDocuments patientId="patient-1" />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText('estudio.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /ver/i }));
    await waitFor(() => {
      expect(documentsApi.signedUrl).toHaveBeenCalledWith('patient-1/abc.pdf', 300);
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed.example/file',
        '_blank',
        'noopener,noreferrer'
      );
    });
    openSpy.mockRestore();
  });
});
