import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, set, del } from 'idb-keyval';
import { createIDBPersister, clearPersistedQueryCache } from './offlineSync';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createIDBPersister', () => {
  it('persistClient guarda el cliente con la clave por defecto', async () => {
    const persister = createIDBPersister();
    await persister.persistClient({ a: 1 });
    expect(set).toHaveBeenCalledWith('reactQuery', { a: 1 });
  });

  it('restoreClient lee el cliente guardado', async () => {
    get.mockResolvedValue({ restored: true });
    const persister = createIDBPersister('miClave');
    const restored = await persister.restoreClient();
    expect(get).toHaveBeenCalledWith('miClave');
    expect(restored).toEqual({ restored: true });
  });

  it('removeClient borra el cliente', async () => {
    const persister = createIDBPersister('otra');
    await persister.removeClient();
    expect(del).toHaveBeenCalledWith('otra');
  });
});

describe('clearPersistedQueryCache', () => {
  it('borra el caché de PHI persistido con la clave por defecto', async () => {
    await clearPersistedQueryCache();
    expect(del).toHaveBeenCalledWith('reactQuery');
  });

  it('acepta una clave personalizada', async () => {
    await clearPersistedQueryCache('otraClave');
    expect(del).toHaveBeenCalledWith('otraClave');
  });
});
