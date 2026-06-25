import { useEffect, useRef, useState } from 'react';

interface DateFieldProps {
  // Valor en formato ISO (YYYY-MM-DD) o '' si no hay fecha.
  value: string;
  // Devuelve el valor en ISO (YYYY-MM-DD) o '' cuando se borra/está incompleto.
  onChange: (iso: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

// ISO (YYYY-MM-DD) → display (DD/MM/AAAA).
const isoToDisplay = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
};

// Inserta las barras conforme se escribe: 8 dígitos → DD/MM/AAAA.
const maskDigits = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

// display (DD/MM/AAAA completo y válido) → ISO (YYYY-MM-DD). '' si es inválido.
const displayToIso = (display: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return '';
  const date = new Date(year, month - 1, day);
  // Round-trip: descarta fechas imposibles (ej. 31/02/2026 → marzo).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '';
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
};

// Campo de fecha que SIEMPRE muestra DD/MM/AAAA, sin depender del idioma del
// navegador (a diferencia de <input type="date">). Internamente trabaja con ISO.
export function DateField({
  value,
  onChange,
  id,
  required,
  disabled,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  // Evita pisar lo que el usuario escribe: solo re-sincroniza desde la prop
  // cuando el ISO externo cambia respecto a lo que el campo ya representa.
  const lastIso = useRef(value);

  useEffect(() => {
    if (value !== lastIso.current) {
      lastIso.current = value;
      setText(isoToDisplay(value));
    }
  }, [value]);

  const handleChange = (raw: string) => {
    const masked = maskDigits(raw);
    setText(masked);
    const iso = displayToIso(masked);
    // Emitimos ISO cuando la fecha está completa y es válida; '' si se vació.
    if (iso) {
      lastIso.current = iso;
      onChange(iso);
    } else if (masked === '') {
      lastIso.current = '';
      onChange('');
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
    />
  );
}
