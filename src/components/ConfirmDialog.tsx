import type { ReactNode } from 'react';
import { useModalA11y } from '../shared/useModalA11y';

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false,
  error,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  // useModalA11y: foco inicial en primer elemento interactivo (botón confirmar),
  // ciclo de Tab atrapado dentro del diálogo, Escape para cerrar, scroll bloqueado.
  const dialogRef = useModalA11y<HTMLDivElement>(() => {
    if (!busy) onCancel();
  });

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 1000
      }}
    >
      <button
        type="button"
        aria-label="Cerrar sin confirmar"
        onClick={onCancel}
        disabled={busy}
        style={{
          position: 'fixed',
          inset: 0,
          border: 'none',
          padding: 0,
          background: 'rgba(0,0,0,0.45)',
          cursor: 'pointer'
        }}
      />
      <div className="card" style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <div className="muted">{message}</div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className={tone === 'danger' ? 'danger' : ''}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando...' : confirmLabel}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
