import { useModalA11y } from '../../shared/useModalA11y';

interface ConsentGateProps {
  open: boolean;
  title: string;
  eyebrow: string;
  bullets: string[];
  acceptLabel: string;
  onAccept: () => void;
  onCancel: () => void;
}

export function ConsentGate({
  open,
  title,
  eyebrow,
  bullets,
  acceptLabel,
  onAccept,
  onCancel
}: ConsentGateProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel, open);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" ref={dialogRef} tabIndex={-1}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
      >
        <div className="form-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="consent-gate-title">{title}</h2>
          </div>
        </div>

        <div className="warning-box">
          <ul>
            {bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        </div>

        <p className="muted">
          Al continuar confirmas que tienes consentimiento del paciente para procesar sus datos por
          este medio.
        </p>

        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={onAccept}>
            {acceptLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
