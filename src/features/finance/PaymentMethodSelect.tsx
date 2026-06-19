import type { CSSProperties } from 'react';
import { PAYMENT_METHODS, type PaymentMethod } from '../../services/financeApi';

interface PaymentMethodSelectProps {
  value: string;
  onChange: (method: PaymentMethod) => void;
  // Etiqueta accesible cuando el <select> NO está envuelto en un <label> visible.
  ariaLabel?: string;
  // id para asociar un <label htmlFor> visible externo (el linter a11y no ve el
  // control dentro de este componente, así que la asociación se hace por id).
  id?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

// Selector reutilizable de método de pago (efectivo / tarjeta / transferencia).
// Antes este mismo <select> con sus tres <option> estaba copiado en 5 sitios
// (caja, abono de paciente y las tres rutas de cobro del modal de cita). Centralizarlo
// evita que las opciones se desincronicen de PAYMENT_METHODS al agregar un método.
export function PaymentMethodSelect({
  value,
  onChange,
  ariaLabel,
  id,
  style,
  disabled
}: PaymentMethodSelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as PaymentMethod)}
      aria-label={ariaLabel}
      style={style}
      disabled={disabled}
    >
      {PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {m.charAt(0).toUpperCase() + m.slice(1)}
        </option>
      ))}
    </select>
  );
}
