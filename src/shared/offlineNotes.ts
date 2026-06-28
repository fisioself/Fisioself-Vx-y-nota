// Cola local (outbox) de notas de sesión creadas SIN conexión.
//
// Fase 1 de "escritura offline": cuando no hay internet, la nota se guarda aquí
// (localStorage) con un id uuid generado en el cliente y se muestra en el
// expediente marcada como "pendiente". Al reconectar, `useOfflineNoteSync` la
// envía a Supabase (el id uuid estable evita duplicados) y la quita de la cola.
//
// Solo cubre la CREACIÓN de notas nuevas; editar/borrar offline queda fuera de
// esta fase (requiere conexión).
import type { SessionNote } from '../types/clinical';

const KEY = 'fisioself-offline-notes';
const EVENT = 'fisioself-offline-notes-changed';

// Entrada en la cola: el payload exacto a insertar + cuándo se encoló (para
// ordenar y mostrar una fecha aproximada de creación).
interface QueuedNote {
  outboxId: string; // = note.id (uuid de cliente); único
  note: SessionNote;
  createdAt: number;
}

// Nota pendiente tal como la consume la UI (con la marca `_pending`).
export type PendingNote = SessionNote & { _pending: true };

function read(): QueuedNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedNote[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedNote[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Almacenamiento lleno o no disponible: no rompemos la app.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export const offlineNotes = {
  enqueue(note: SessionNote): void {
    const items = read();
    items.push({ outboxId: note.id, note, createdAt: Date.now() });
    write(items);
  },

  all(): QueuedNote[] {
    return read();
  },

  // Notas pendientes de un paciente, listas para mostrar (con `_pending` y una
  // fecha de creación derivada si la nota no traía `created_at`).
  forPatient(patientId: string): PendingNote[] {
    return read()
      .filter((q) => q.note.patient_id === patientId)
      .map((q) => ({
        ...q.note,
        created_at: q.note.created_at ?? new Date(q.createdAt).toISOString(),
        _pending: true as const
      }));
  },

  remove(outboxId: string): void {
    write(read().filter((q) => q.outboxId !== outboxId));
  },

  // Vacía toda la cola. Se llama al cerrar sesión: las notas contienen PHI y no
  // deben quedar en el navegador tras el logout (igual que el caché de datos y
  // los borradores, que también se limpian al salir).
  clearAll(): void {
    write([]);
  },

  count(): number {
    return read().length;
  },

  // Notifica cambios en la cola (misma pestaña vía evento propio; otras pestañas
  // vía 'storage'). Devuelve la función para desuscribirse.
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
