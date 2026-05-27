import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider.jsx';
import { SessionNoteEditor } from './SessionNoteEditor.jsx';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    addSessionNote: vi.fn(),
    updateSessionNote: vi.fn(),
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

describe('SessionNoteEditor Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('preserves local changes when the note prop object changes but the ID remains the same', async () => {
    const initialNote = {
      id: 'note-1',
      patient_id: 'patient-1',
      session_number: 1,
      raw_text: 'Contenido original'
    };

    const { rerender } = renderWithToast(
      <SessionNoteEditor patientId="patient-1" sessionNumber={1} note={initialNote} />
    );

    const textarea = screen.getByLabelText(/nota de sesion/i);
    fireEvent.change(textarea, { target: { value: 'Contenido modificado por el usuario' } });
    
    expect(textarea.value).toBe('Contenido modificado por el usuario');

    // Simulamos un re-render del padre con una nueva referencia de objeto pero mismo ID
    const updatedNoteReference = { ...initialNote }; 
    rerender(
      <ToastProvider>
        <SessionNoteEditor patientId="patient-1" sessionNumber={1} note={updatedNoteReference} />
      </ToastProvider>
    );

    // El contenido NO debe haberse reseteado al original
    expect(screen.getByLabelText(/nota de sesion/i).value).toBe('Contenido modificado por el usuario');
  });

  it('marks the note as dirty when changes are made', () => {
    renderWithToast(<SessionNoteEditor patientId="patient-1" sessionNumber={1} />);
    
    expect(screen.queryByText(/borrador local con cambios/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/nota de sesion/i), { target: { value: 'C' } });
    
    expect(screen.getByText(/borrador local con cambios/i)).toBeInTheDocument();
  });
});
