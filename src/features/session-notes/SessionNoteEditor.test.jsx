import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider.jsx';
import { clinicalApi } from '../../services/clinicalApi.js';
import { SessionNoteEditor } from './SessionNoteEditor.jsx';

vi.mock('../../services/clinicalApi.js', () => ({
  clinicalApi: {
    addSessionNote: vi.fn(),
    addAiConsult: vi.fn()
  }
}));

vi.mock('../../services/aiService.js', () => ({
  AI_TYPES: [{ id: 'soap', label: 'Formatear SOAP', traceable: false }],
  aiService: {
    transform: vi.fn()
  }
}));

vi.mock('./useDictation.js', () => ({
  useDictation: () => ({ supported: false, listening: false, toggle: vi.fn() })
}));

const renderWithToast = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

describe('SessionNoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('saves a valid clinical note and clears the local draft', async () => {
    clinicalApi.addSessionNote.mockResolvedValueOnce({ id: 'note-1' });
    const onSaved = vi.fn();

    renderWithToast(
      <SessionNoteEditor patientId="patient-1" sessionNumber={2} onSaved={onSaved} />
    );

    fireEvent.change(screen.getByLabelText(/nota de sesion/i), {
      target: { value: 'Dolor lumbar con mejora' }
    });
    fireEvent.change(screen.getByLabelText(/eva hoy/i), { target: { value: '4' } });
    await userEvent.click(screen.getByRole('button', { name: /guardar sesion #2/i }));

    await waitFor(() => {
      expect(clinicalApi.addSessionNote).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 'patient-1',
          session_number: 2,
          eva: 4,
          raw_text: 'Dolor lumbar con mejora'
        })
      );
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));
    });
  });

  it('shows validation errors without calling the API', async () => {
    renderWithToast(<SessionNoteEditor patientId="patient-1" sessionNumber={1} />);

    await userEvent.click(screen.getByRole('button', { name: /guardar sesion #1/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/contenido clinico/i);
    expect(clinicalApi.addSessionNote).not.toHaveBeenCalled();
  });

  it('inserts a SOAP template for the numbered session', async () => {
    renderWithToast(<SessionNoteEditor patientId="patient-1" sessionNumber={3} />);

    await userEvent.click(screen.getByRole('button', { name: /usar plantilla soap/i }));

    const note = screen.getByLabelText(/nota de sesion/i);
    expect(note.value).toContain('S - Subjetivo:');
    expect(note.value).toContain('Notas adicionales:');
    expect(screen.getByRole('heading', { name: /sesion #3/i })).toBeInTheDocument();
  });
});
