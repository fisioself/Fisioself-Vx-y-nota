import { useEffect, useState } from 'react';

export function OnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="offline-banner" role="status">
      Sin conexion. Puedes seguir redactando borradores locales; guarda en expediente cuando vuelva
      internet.
    </div>
  );
}
