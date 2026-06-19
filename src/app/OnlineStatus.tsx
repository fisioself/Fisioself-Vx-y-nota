import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

export function OnlineStatus() {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const queryClient = useQueryClient();
  const { notify } = useToast();

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
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
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

  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      Sin conexion. Puedes seguir redactando borradores locales; guarda en expediente cuando vuelva
      internet.
    </div>
  );
}
