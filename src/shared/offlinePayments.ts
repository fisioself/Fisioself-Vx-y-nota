// Cola local (outbox) de cobros de cita hechos SIN conexión.
//
// A diferencia de las notas, un cobro es una operación financiera atómica del
// lado del servidor (RPC charge_appointment: pago + sesión de paquete +
// comisión). Por eso aquí NO mostramos el cobro de forma optimista en caja: solo
// guardamos la INTENCIÓN de cobro y, al reconectar, la reproducimos con la misma
// lógica que un cobro normal. Antes de cobrar, el sincronizador verifica que la
// cita no tenga ya un cobro, para no cobrar dos veces.
import type { PaymentMethod } from '../services/financeApi';

const KEY = 'fisioself-offline-payments';
const EVENT = 'fisioself-offline-payments-changed';

// Entrada exacta que recibe financeApi.chargeAppointment (sin cambios).
export interface ChargeInput {
  appointmentId: string;
  patientId: string;
  usePackage: boolean;
  patientPackageId?: string | null;
  amount?: number;
  method?: PaymentMethod;
  paidAt?: string;
  notes?: string;
}

export interface QueuedCharge {
  outboxId: string;
  input: ChargeInput;
  // Datos solo para mostrar en avisos (no se envían).
  patientName?: string;
  createdAt: number;
}

function read(): QueuedCharge[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedCharge[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedCharge[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Almacenamiento lleno o no disponible: no rompemos la app.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

const uuid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `chg-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

export const offlinePayments = {
  enqueue(input: ChargeInput, patientName?: string): void {
    const items = read();
    items.push({ outboxId: uuid(), input, patientName, createdAt: Date.now() });
    write(items);
  },

  all(): QueuedCharge[] {
    return read().sort((a, b) => a.createdAt - b.createdAt);
  },

  // ¿Ya hay un cobro en cola para esta cita? (evita encolar dos veces).
  hasForAppointment(appointmentId: string): boolean {
    return read().some((q) => q.input.appointmentId === appointmentId);
  },

  remove(outboxId: string): void {
    write(read().filter((q) => q.outboxId !== outboxId));
  },

  // Vacía la cola. Se llama al cerrar sesión (datos financieros del paciente).
  clearAll(): void {
    write([]);
  },

  count(): number {
    return read().length;
  },

  subscribe(cb: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = () => cb();
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }
};
