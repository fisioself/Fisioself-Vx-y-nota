import { useState, type FormEvent } from 'react';

interface ConfirmDeleteModalProps {
  // Nombre del paciente que el usuario debe teclear para confirmar.
  patientName: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmación fuerte de borrado: obliga a escribir el nombre exacto del
// paciente antes de habilitar el botón. Evita borrados accidentales por un
// clic apresurado. El borrado es lógico (papelera), pero igual lo blindamos.
export function ConfirmDeleteModal({
  patientName,
  busy = false,
  error,
  onConfirm,
  onCancel
}: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState('');
  // Comparación tolerante a espacios/mayúsculas para no frustrar al usuario.
  const matches = typed.trim().toLowerCase() === patientName.trim().toLowerCase();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (matches && !busy) onConfirm();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar eliminación"
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
        aria-label="Cerrar sin eliminar"
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
      <form
        className="card"
        onSubmit={submit}
        style={{ position: 'relative', zIndex: 1, maxWidth: 440 }}
      >
        <p className="eyebrow">Mover a la papelera</p>
        <h2>Eliminar paciente</h2>
        <p className="muted">
          El expediente de <strong>{patientName}</strong> se moverá a la papelera. No se pierde
          nada: un administrador puede restaurarlo desde la papelera de pacientes.
        </p>
        <label>
          Para confirmar, escribe el nombre del paciente:
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={patientName}
            autoComplete="off"
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="danger" disabled={!matches || busy}>
            {busy ? 'Moviendo...' : 'Mover a la papelera'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
