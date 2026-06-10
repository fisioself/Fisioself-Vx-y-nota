import { get, set, del } from 'idb-keyval';

const DEFAULT_CACHE_KEY = 'reactQuery';

export function createIDBPersister(idbValidKey = DEFAULT_CACHE_KEY) {
  return {
    persistClient: async (client) => {
      await set(idbValidKey, client);
    },
    restoreClient: async () => {
      return await get(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    }
  };
}

// Purga el caché de consultas persistido en IndexedDB. Se llama al cerrar sesión
// para que NO queden datos clínicos (PHI: nombres, diagnósticos, notas, finanzas)
// legibles en el navegador tras el logout. Sin esto, cualquiera con acceso al
// dispositivo desbloqueado podría leerlos en DevTools → IndexedDB.
export async function clearPersistedQueryCache(idbValidKey = DEFAULT_CACHE_KEY) {
  await del(idbValidKey);
}
