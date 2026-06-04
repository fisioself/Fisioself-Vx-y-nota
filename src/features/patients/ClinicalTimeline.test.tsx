import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TimelineEntry } from '../../types/clinical';
import { ClinicalTimeline } from './ClinicalTimeline';

const makeItems = (n: number): TimelineEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `item-${i}`,
    type: 'session_note',
    label: `Nota ${i + 1}`,
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
    description: `Descripción ${i + 1}`
  })) as TimelineEntry[];

describe('ClinicalTimeline', () => {
  it('muestra mensaje vacío sin items', () => {
    render(<ClinicalTimeline items={[]} />);
    expect(screen.getByText(/aun no hay actividad clinica/i)).toBeInTheDocument();
  });

  it('muestra solo los primeros 2 items cuando hay más', () => {
    render(<ClinicalTimeline items={makeItems(5)} />);
    expect(screen.getByText('Nota 1')).toBeInTheDocument();
    expect(screen.getByText('Nota 2')).toBeInTheDocument();
    expect(screen.queryByText('Nota 3')).not.toBeInTheDocument();
    // El contador refleja el total real.
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('expande y colapsa el historial completo', async () => {
    render(<ClinicalTimeline items={makeItems(5)} />);
    await userEvent.click(screen.getByRole('button', { name: /ver historial completo/i }));
    expect(screen.getByText('Nota 5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ocultar historial/i }));
    expect(screen.queryByText('Nota 5')).not.toBeInTheDocument();
  });

  it('no muestra botón de expandir con 2 o menos items', () => {
    render(<ClinicalTimeline items={makeItems(2)} />);
    expect(screen.queryByRole('button', { name: /ver historial/i })).not.toBeInTheDocument();
  });
});
