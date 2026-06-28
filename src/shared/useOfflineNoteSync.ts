import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clinicalApi } from '../services/clinicalApi';
import { offlineNotes } from './offlineNotes';
import { useToast } from '../app/ToastProvider';

// Vacía la cola de notas offline cuando hay (o vuelve) la conexión. Se monta una
// sola vez en <App>. Envía cada nota pendiente a Supabase; al lograrlo la quita
// de la cola y refresca el expediente. Si una nota ya existía (duplicado por un
// flush doble), la descarta; ante cualquier otro fallo de red, detiene el envío
// y reintenta en el próximo evento 'online'.
export function useOfflineNoteSync(): void {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    let running = false;

    async function flush() {
      if (running) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const items = offlineNotes.all();
      if (!items.length) return;

      running = true;
      let synced = 0;
      try {
        for (const item of items) {
          try {
            await clinicalApi.addSessionNote(item.note);
            offlineNotes.remove(item.outboxId);
            synced += 1;
          } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            // Duplicado (la nota ya está en el servidor): la sacamos de la cola.
            if (/Ya existe una nota/i.test(msg)) {
              offlineNotes.remove(item.outboxId);
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
            message: `${synced} nota${synced > 1 ? 's' : ''} sincronizada${synced > 1 ? 's' : ''}.`
          });
        }
      }
    }

    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [queryClient, notify]);
}
