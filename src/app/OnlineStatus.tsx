import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function OnlineStatus() {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const queryClient = useQueryClient();

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      // Al recuperar la conexion, refrescamos los datos para que la app deje de
      // mostrar informacion potencialmente desactualizada del cache offline.
      queryClient.invalidateQueries();
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
