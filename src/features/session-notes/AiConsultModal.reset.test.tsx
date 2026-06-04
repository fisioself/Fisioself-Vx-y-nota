import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PendingConsult } from './types';
import { AiConsultModal } from './AiConsultModal';

const consultA: PendingConsult = {
  type: 'clinical_analysis',
  label: 'Analisis clinico',
  input: 'nota A',
  output: 'salida A'
};
const consultB: PendingConsult = {
  type: 'treatment_plan',
  label: 'Plan de tratamiento',
  input: 'nota B',
  output: 'salida B'
};

describe('AiConsultModal — reset de estado entre consultas', () => {
  it('no permite guardar sin marcar la revisión clínica', async () => {
    const onSave = vi.fn();
    render(<AiConsultModal consult={consultA} onSave={onSave} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar ia trazable/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/confirmar revision clinica/i)).toBeInTheDocument();
  });

  it('al cambiar a una nueva consulta se des-marca la validación previa', async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <AiConsultModal consult={consultA} onSave={onSave} onClose={vi.fn()} />
    );
    // Marca la revisión clínica en la consulta A.
    const checkbox = screen.getByRole('checkbox', { name: /confirmo que revise/i });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Llega una consulta B distinta: la validación NO debe heredarse.
    rerender(<AiConsultModal consult={consultB} onSave={onSave} onClose={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /confirmo que revise/i })).not.toBeChecked();

    // Y por tanto guardar sin re-revisar queda bloqueado.
    await userEvent.click(screen.getByRole('button', { name: /guardar ia trazable/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
