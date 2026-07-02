import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';
import { offlineNotes } from '../shared/offlineNotes';
import { offlinePayments } from '../shared/offlinePayments';
import { serverReachability } from '../shared/serverReachability';

const totalPending = (): number => offlineNotes.count() + offlinePayments.count();

export function OnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() => navigator.onLine);
  // El servidor puede no responder aunque el navegador esté "online" (señal de
  // datos pero sin poder llegar a Supabase). Se considera "sin conexión" cualquiera
  // de los dos casos.
  const [serverOk, setServerOk] = useState<boolean>(() => serverReachability.isReachable());
  const online = browserOnline && serverOk;
  // Cambios escritos sin conexión (notas + cobros) que aún no se suben.
  const [pendingCount, setPendingCount] = useState<number>(() => totalPending());
  const queryClient = useQueryClient();
  const { notify } = useToast();

  // Mantiene el contador de pendientes al día (al encolar o al sincronizar).
  useEffect(() => {
    const update = () => setPendingCount(totalPending());
    update();
    const unsubNotes = offlineNotes.subscribe(update);
    const unsubPays = offlinePayments.subscribe(update);
    return () => {
      unsubNotes();
      unsubPays();
    };
  }, []);

  // Escucha la señal de alcanzabilidad del servidor.
  useEffect(
    () => serverReachability.subscribe(() => setServerOk(serverReachability.isReachable())),
    []
  );

  // Escucha los mensajes que el Service Worker envia al reenviar la cola offline.
  // Antes el SW emitia SYNC_ERROR / SYNC_CONFLICT pero nadie los escuchaba, asi
  // que el usuario nunca se enteraba si su sesion caducaba o habia un conflicto.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'SYNC_DONE') {
        notify({
          message:
            data.synced === 1
              ? 'Se sincronizo 1 nota guardada sin conexion.'
              : `Se sincronizaron ${data.synced} cambios guardados sin conexion.`,
          tone: 'success'
        });
        // refetchType:'active' refetchea solo las queries montadas; las inactivas
        // (p. ej. cada término de búsqueda cacheado) se marcan stale sin disparar
        // una tormenta de peticiones al volver la conexión.
        queryClient.invalidateQueries({ refetchType: 'active' });
      } else if (data.type === 'SYNC_ERROR') {
        notify({ message: data.message || 'Error al sincronizar.', tone: 'error', duration: 7000 });
      } else if (data.type === 'SYNC_CONFLICT') {
        notify({
          message: data.message || 'Conflicto al sincronizar una nota.',
          tone: 'warning',
          duration: 7000
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [notify, queryClient]);

  useEffect(() => {
    const goOffline = () => setBrowserOnline(false);
    const goOnline = () => {
      setBrowserOnline(true);
      // Damos al servidor el beneficio de la duda al volver la señal: la próxima
      // query exitosa lo confirma; una fallida lo vuelve a marcar sin conexión.
      serverReachability.set(true);
      // Al recuperar la conexion, le pedimos al Service Worker que reenvie las
      // escrituras que quedaron en cola mientras estabamos sin internet. Esto es
      // imprescindible en iOS/Safari, donde la Background Sync API no existe y sin
      // este aviso las notas guardadas offline nunca se reenviaban solas.
      navigator.serviceWorker?.ready
        .then((reg) => reg.active?.postMessage({ type: 'FLUSH_QUEUE' }))
        .catch(() => {
          /* SW no disponible: nada que reenviar */
        });
      // Refrescamos los datos para que la app deje de mostrar informacion
      // potencialmente desactualizada del cache offline. Solo las queries activas
      // (refetchType:'active') para no recargar de golpe todo el histórico.
      queryClient.invalidateQueries({ refetchType: 'active' });
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [queryClient]);

  // Píldora de "pendientes por sincronizar": visible aunque haya conexión
  // (mientras la cola se vacía) para que se vea que aún falta subir algo.
  const pendingPill = pendingCount > 0 && (
    <div className="offline-pending" role="status">
      {pendingCount === 1 ? '1 cambio por sincronizar' : `${pendingCount} cambios por sincronizar`}
    </div>
  );

  if (online) return pendingPill || null;

  return (
    <>
      <div className="offline-banner" role="status">
        {browserOnline
          ? 'Sin conexión con el servidor. Puedes seguir trabajando: tus cambios se guardan y se sincronizan al reconectar.'
          : 'Sin conexión. Puedes seguir trabajando: las notas se guardan localmente y se sincronizan al reconectar.'}
      </div>
      {pendingPill}
    </>
  );
}
