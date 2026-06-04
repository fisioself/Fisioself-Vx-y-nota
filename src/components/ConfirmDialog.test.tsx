import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renderiza título y mensaje como diálogo accesible', () => {
    render(
      <ConfirmDialog
        title="Eliminar algo"
        message="¿Seguro?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Eliminar algo' })).toBeInTheDocument();
    expect(screen.getByText('¿Seguro?')).toBeInTheDocument();
  });

  it('llama a onConfirm al pulsar el botón de confirmar', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Borrar"
        message="x"
        confirmLabel="Eliminar"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('llama a onCancel con el botón cancelar y con la tecla Escape', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Borrar" message="x" onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('deshabilita los botones mientras busy', () => {
    render(
      <ConfirmDialog title="Borrar" message="x" busy onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /Procesando/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('no cierra con Escape mientras está busy', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog title="Borrar" message="x" busy onConfirm={vi.fn()} onCancel={onCancel} />
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
