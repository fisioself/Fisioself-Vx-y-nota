// Señal de "el servidor (Supabase) está alcanzable".
//
// El navegador puede estar `onLine` (con señal de datos) pero SIN poder llegar
// al servidor: la petición falla con "Failed to fetch". En ese caso el banner de
// "sin conexión" no aparecía (solo miraba navigator.onLine) y la app mostraba
// errores. Este flag lo alimenta el QueryClient (onError/onSuccess) y lo consume
// OnlineStatus para avisar también en ese escenario.
let reachable = true;
const listeners = new Set<() => void>();

export const serverReachability = {
  isReachable: (): boolean => reachable,
  set(value: boolean): void {
    if (reachable === value) return;
    reachable = value;
    listeners.forEach((cb) => cb());
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }
};
