import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  // Título corto del diálogo (ej. "Eliminar nota").
  title: string;
  // Mensaje explicativo. Puede ser texto o nodos (para resaltar nombres, etc.).
  message: React.ReactNode;
  // Texto del botón que confirma la acción.
  confirmLabel?: string;
  cancelLabel?: string;
  // `danger` pinta el botón de confirmar en rojo (acciones destructivas).
  tone?: 'danger' | 'primary';
  // Bloquea los botones mientras la acción está en curso.
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Diálogo de confirmación accesible y reutilizable. Sustituye a window.confirm()
// (que no respeta el tema, no es navegable bien con lector de pantalla y bloquea
// el hilo). Maneja foco inicial en el botón de confirmar, cierre con Escape y un
// backdrop que también es un botón (cerrar al hacer clic fuera).
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
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Foco inicial en el botón de confirmar + cierre con Escape.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
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
            ref={confirmRef}
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
