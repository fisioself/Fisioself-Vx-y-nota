// Cola local (outbox) de cambios en notas de sesión hechos SIN conexión:
// crear, editar y borrar. Cada operación se guarda en localStorage y se
// reproduce contra Supabase al reconectar (ver useOfflineNoteSync).
//
// Las notas nuevas llevan un id uuid generado en el cliente (id estable → sin
// duplicados al sincronizar). Se hace "coalescing": editar una nota aún no
// subida actualiza su creación en cola; borrar una nota en cola la elimina sin
// tocar el servidor. Así la cola nunca tiene operaciones contradictorias por nota.
import type { SessionNote } from '../types/clinical';

const KEY = 'fisioself-offline-notes';
const EVENT = 'fisioself-offline-notes-changed';

export type NoteOp = 'create' | 'update' | 'delete';

export interface QueuedOp {
  outboxId: string; // id único de la entrada en la cola
  op: NoteOp;
  noteId: string; // id de la nota objetivo (= note.id en create/update)
  patientId: string;
  note?: SessionNote; // payload para create/update
  createdAt: number;
}

// Nota pendiente tal como la consume la UI.
export type PendingNote = SessionNote & { _pending: true };

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

function write(items: QueuedOp[]): void {
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
    : `op-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

export const offlineNotes = {
  // Crear una nota nueva offline (id uuid ya generado en el cliente).
  enqueueCreate(note: SessionNote): void {
    const items = read();
    items.push({
      outboxId: uuid(),
      op: 'create',
      noteId: note.id,
      patientId: note.patient_id,
      note,
      createdAt: Date.now()
    });
    write(items);
  },

  // Editar una nota. Si la nota aún no se ha subido (hay un 'create' en cola),
  // se actualiza ese create en su lugar; si no, se registra/reemplaza un 'update'.
  enqueueUpdate(note: SessionNote): void {
    const items = read();
    const create = items.find((o) => o.op === 'create' && o.noteId === note.id);
    if (create) {
      create.note = note;
      write(items);
      return;
    }
    // Quita updates previos de la misma nota (nos quedamos con el más reciente).
    const rest = items.filter((o) => !(o.op === 'update' && o.noteId === note.id));
    rest.push({
      outboxId: uuid(),
      op: 'update',
      noteId: note.id,
      patientId: note.patient_id,
      note,
      createdAt: Date.now()
    });
    write(rest);
  },

  // Borrar una nota. Si solo existía en la cola (create sin subir), se elimina de
  // la cola sin tocar el servidor; si está en el servidor, se encola un 'delete'.
  enqueueDelete(noteId: string, patientId: string): void {
    const items = read();
    const create = items.find((o) => o.op === 'create' && o.noteId === noteId);
    const withoutNote = items.filter((o) => o.noteId !== noteId); // quita create/update previos
    if (create) {
      // Nunca llegó al servidor: basta con quitarlo de la cola.
      write(withoutNote);
      return;
    }
    withoutNote.push({
      outboxId: uuid(),
      op: 'delete',
      noteId,
      patientId,
      createdAt: Date.now()
    });
    write(withoutNote);
  },

  all(): QueuedOp[] {
    return read().sort((a, b) => a.createdAt - b.createdAt);
  },

  // Notas nuevas pendientes de un paciente (para mostrarlas en la lista).
  pendingCreates(patientId: string): PendingNote[] {
    return read()
      .filter((o) => o.op === 'create' && o.patientId === patientId && o.note)
      .map((o) => ({
        ...(o.note as SessionNote),
        created_at: o.note?.created_at ?? new Date(o.createdAt).toISOString(),
        _pending: true as const
      }));
  },

  // Mapa id→nota de las ediciones pendientes (para superponerlas sobre las del
  // servidor con su marca de "edición pendiente").
  pendingUpdates(patientId: string): Map<string, SessionNote> {
    const map = new Map<string, SessionNote>();
    for (const o of read()) {
      if (o.op === 'update' && o.patientId === patientId && o.note) map.set(o.noteId, o.note);
    }
    return map;
  },

  // ids de notas con borrado pendiente (para ocultarlas de la lista).
  pendingDeletes(patientId: string): Set<string> {
    return new Set(
      read()
        .filter((o) => o.op === 'delete' && o.patientId === patientId)
        .map((o) => o.noteId)
    );
  },

  // Descarta TODAS las operaciones en cola de una nota (botón "Descartar").
  removeForNote(noteId: string): void {
    write(read().filter((o) => o.noteId !== noteId));
  },

  // Quita una entrada concreta tras sincronizarla con éxito.
  remove(outboxId: string): void {
    write(read().filter((o) => o.outboxId !== outboxId));
  },

  // Vacía toda la cola. Se llama al cerrar sesión: las notas contienen PHI y no
  // deben quedar en el navegador tras el logout.
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
