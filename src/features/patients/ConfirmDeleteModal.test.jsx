import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

describe('ConfirmDeleteModal', () => {
  it('mantiene deshabilitado el botón hasta escribir el nombre exacto', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal
        patientName="Antonio Pérez"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: /mover a la papelera/i });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText('Antonio Pérez');
    fireEvent.change(input, { target: { value: 'Antonio' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Antonio Pérez' } });
    expect(confirmBtn).toBeEnabled();
  });

  it('confirma con coincidencia tolerante a mayúsculas y espacios', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal patientName="Maria Lopez" onConfirm={onConfirm} onCancel={() => {}} />
    );

    const input = screen.getByPlaceholderText('Maria Lopez');
    fireEvent.change(input, { target: { value: '  maria lopez  ' } });

    const confirmBtn = screen.getByRole('button', { name: /mover a la papelera/i });
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancela sin confirmar', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteModal patientName="Test" onConfirm={onConfirm} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
