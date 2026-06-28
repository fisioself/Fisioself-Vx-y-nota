import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../services/clinicalApi';
import { offlineNotes } from './offlineNotes';
import { useToast } from '../app/ToastProvider';

// ¿El error es por sesión/token caducado? (hay que volver a iniciar sesión).
function isAuthExpired(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string };
  if (e?.code === 'PGRST301') return true;
  if (e?.status === 401) return true;
  return /jwt|expired|not authenticated|invalid (token|claim)|no autoriz/i.test(e?.message || '');
}

// ¿El error es "no encontrado"? (la nota ya no existe: borrada en otro lado).
function isNotFound(err: unknown): boolean {
  const e = err as { code?: string; status?: number };
  return e?.code === 'PGRST116' || e?.status === 404;
}

// Vacía la cola de cambios de notas hechos sin conexión (crear/editar/borrar)
// cuando hay (o vuelve) la conexión. Se monta una sola vez en <App>.
export function useOfflineNoteSync(): void {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    let running = false;

    async function flush() {
      if (running) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const ops = offlineNotes.all();
      if (!ops.length) return;

      running = true;
      let synced = 0;
      let authExpired = false;
      try {
        for (const op of ops) {
          try {
            if (op.op === 'create' && op.note) {
              await clinicalApi.addSessionNote(op.note);
            } else if (op.op === 'update' && op.note) {
              await clinicalApi.updateSessionNote(op.noteId, op.note);
            } else if (op.op === 'delete') {
              await clinicalApi.deleteSessionNote(op.noteId);
            }
            offlineNotes.remove(op.outboxId);
            synced += 1;
          } catch (err) {
            if (isAuthExpired(err)) {
              authExpired = true;
              break;
            }
            const msg = err instanceof Error ? err.message : '';
            // Duplicado (create ya subido) o nota inexistente (update/delete sobre
            // algo ya borrado): la operación ya no aplica, la sacamos de la cola.
            if (op.op === 'create' && /Ya existe una nota/i.test(msg)) {
              offlineNotes.remove(op.outboxId);
              continue;
            }
            if (op.op !== 'create' && isNotFound(err)) {
              offlineNotes.remove(op.outboxId);
              continue;
            }
            // Otro error (sin red, 5xx…): paramos y reintentamos al reconectar.
            break;
          }
        }
      } finally {
        running = false;
        if (synced > 0) {
          queryClient.invalidateQueries({ queryKey: ['patient'] });
          notify({
            tone: 'success',
            message: `${synced} cambio${synced > 1 ? 's' : ''} de notas sincronizado${synced > 1 ? 's' : ''}.`
          });
        }
        if (authExpired) {
          notify({
            tone: 'error',
            duration: 8000,
            message:
              'Tu sesión caducó. Inicia sesión de nuevo para sincronizar tus notas pendientes.'
          });
        }
      }
    }

    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [queryClient, notify]);
}
