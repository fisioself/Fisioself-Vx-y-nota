import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { financeApi } from '../services/financeApi';
import { offlinePayments } from './offlinePayments';
import { useToast } from '../app/ToastProvider';

function isAuthExpired(err: unknown): boolean {
  const e = err as { code?: string; status?: number; message?: string };
  if (e?.code === 'PGRST301') return true;
  if (e?.status === 401) return true;
  return /jwt|expired|not authenticated|invalid (token|claim)|no autoriz/i.test(e?.message || '');
}

// Sincroniza los cobros guardados sin conexión cuando vuelve el internet.
// SEGURIDAD ANTI-DOBLE-COBRO: antes de reproducir un cobro, comprueba que la
// cita no tenga ya un cobro registrado; si lo tiene, lo descarta de la cola.
export function useOfflinePaymentSync(): void {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    let running = false;

    async function flush() {
      if (running) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const items = offlinePayments.all();
      if (!items.length) return;

      running = true;
      let synced = 0;
      let authExpired = false;
      try {
        for (const item of items) {
          try {
            // Anti-doble-cobro: si la cita ya tiene cobro, no lo repetimos.
            const existing = await financeApi.getAppointmentCharge(item.input.appointmentId);
            if (existing.length > 0) {
              offlinePayments.remove(item.outboxId);
              continue;
            }
            await financeApi.chargeAppointment(item.input);
            offlinePayments.remove(item.outboxId);
            synced += 1;
          } catch (err) {
            if (isAuthExpired(err)) {
              authExpired = true;
              break;
            }
            // Otro error (sin red, 5xx…): paramos y reintentamos al reconectar.
            break;
          }
        }
      } finally {
        running = false;
        if (synced > 0) {
          // Refresca todo lo que toca un cobro: caja, finanzas, paquetes, KPIs.
          for (const key of [
            ['finance-global'],
            ['caja-payments'],
            ['caja-movements'],
            ['expenses'],
            ['clinic-stats'],
            ['patient']
          ]) {
            queryClient.invalidateQueries({ queryKey: key });
          }
          notify({
            tone: 'success',
            message: `${synced} cobro${synced > 1 ? 's' : ''} sincronizado${synced > 1 ? 's' : ''}.`
          });
        }
        if (authExpired) {
          notify({
            tone: 'error',
            duration: 8000,
            message:
              'Tu sesión caducó. Inicia sesión de nuevo para sincronizar los cobros pendientes.'
          });
        }
      }
    }

    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [queryClient, notify]);
}
