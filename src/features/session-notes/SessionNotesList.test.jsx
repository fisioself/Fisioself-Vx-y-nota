import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../app/ToastProvider.jsx';
import { clinicalApi } from '../../services/clinicalApi';
import { SessionNotesList } from './SessionNotesList.jsx';

vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    deleteSessionNote: vi.fn(),
    updateSessionNote: vi.fn(),
    addSessionNote: vi.fn()
  }
}));

vi.mock('../../services/aiService.js', () => ({
  AI_TYPES: [],
  aiService: { transform: vi.fn() }
}));

vi.mock('./useDictation.js', () => ({
  useDictation: () => ({ supported: false, listening: false, toggle: vi.fn() })
}));

const renderWithToast = (ui) => render(<ToastProvider>{ui}</ToastProvider>);

describe('SessionNotesList', () => {
  const notes = [
    {
      id: '1',
      patient_id: 'patient-1',
      session_number: 1,
      session_date: '2026-05-01',
      eva: 6,
      raw_text: 'Dolor lumbar y movilidad limitada'
    },
    {
      id: '2',
      patient_id: 'patient-1',
      session_number: 2,
      session_date: '2026-05-03',
      eva: 3,
      raw_text: 'Mejora tolerancia a ejercicio'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters notes by clinical text', async () => {
    renderWithToast(<SessionNotesList notes={notes} />);

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'lumbar');

    await waitFor(() => {
      expect(screen.getByText(/sesion #1/i)).toBeInTheDocument();
      expect(screen.queryByText(/sesion #2/i)).not.toBeInTheDocument();
    });
  });

  it('expands a note when clicked', async () => {
    renderWithToast(<SessionNotesList notes={notes} />);

    await userEvent.click(screen.getByText(/sesion #2/i));

    expect(screen.getByText(/mejora tolerancia/i)).toBeInTheDocument();
  });

  it('deletes a session note after confirmation', async () => {
    clinicalApi.deleteSessionNote.mockResolvedValueOnce(null);
    const onChanged = vi.fn();

    renderWithToast(<SessionNotesList notes={notes} onChanged={onChanged} />);

    // Primer clic en "Eliminar" de la fila: abre el diálogo accesible.
    await userEvent.click(screen.getAllByRole('button', { name: /^eliminar$/i })[0]);
    const dialog = await screen.findByRole('dialog');
    // El diálogo todavía no borra nada por sí mismo.
    expect(clinicalApi.deleteSessionNote).not.toHaveBeenCalled();

    // Confirmar dentro del diálogo.
    await userEvent.click(
      within(dialog).getByRole('button', { name: /eliminar permanentemente/i })
    );

    await waitFor(() => {
      expect(clinicalApi.deleteSessionNote).toHaveBeenCalledWith('2');
      expect(onChanged).toHaveBeenCalled();
    });
  });
});
