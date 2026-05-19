import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiConsultModal } from './AiConsultModal.jsx';

describe('AiConsultModal', () => {
  const consult = {
    type: 'clinical_analysis',
    label: 'Analisis clinico',
    input: 'nota base',
    output: 'resultado IA'
  };

  it('requires clinical validation before saving', async () => {
    const onSave = vi.fn();
    render(<AiConsultModal consult={consult} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /guardar ia trazable/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/revision clinica/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves after validation is confirmed', async () => {
    const onSave = vi.fn();
    render(<AiConsultModal consult={consult} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.click(screen.getByLabelText(/confirmo que revise/i));
    await userEvent.click(screen.getByRole('button', { name: /guardar ia trazable/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      type: 'clinical_analysis',
      validated: true,
      output: 'resultado IA'
    }));
  });
});
