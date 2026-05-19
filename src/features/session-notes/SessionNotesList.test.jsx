import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SessionNotesList } from './SessionNotesList.jsx';

describe('SessionNotesList', () => {
  const notes = [
    { id: '1', session_number: 1, session_date: '2026-05-01', eva: 6, raw_text: 'Dolor lumbar y movilidad limitada' },
    { id: '2', session_number: 2, session_date: '2026-05-03', eva: 3, raw_text: 'Mejora tolerancia a ejercicio' }
  ];

  it('filters notes by clinical text', async () => {
    render(<SessionNotesList notes={notes} />);

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'lumbar');

    expect(screen.getByText(/sesion #1/i)).toBeInTheDocument();
    expect(screen.queryByText(/sesion #2/i)).not.toBeInTheDocument();
  });

  it('expands a note when clicked', async () => {
    render(<SessionNotesList notes={notes} />);

    await userEvent.click(screen.getByText(/sesion #2/i));

    expect(screen.getByText(/mejora tolerancia/i)).toBeInTheDocument();
  });
});
