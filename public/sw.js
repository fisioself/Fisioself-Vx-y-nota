// Classic Service Worker — no ES module imports, no CDN dependencies
const CACHE_NAME = 'fisioself-notas-vx-v4';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];
const DB_NAME = 'fisioself-sync-db';
const STORE_NAME = 'sync-queue';

// ---- Tiny IndexedDB promise helpers (replaces idb library) ----
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, record) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---- Lifecycle ----
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

// ---- Fetch ----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    if (request.url.includes('/rest/v1/')) {
      event.respondWith(
        fetch(request.clone()).catch(async (_err) => {
          const db = await idbOpen();
          const clonedReq = request.clone();
          const headers = {};
          clonedReq.headers.forEach((value, key) => (headers[key] = value));

          let body;
          try {
            body = await clonedReq.text();
          } catch (_e) {
            body = null;
          }

          await idbPut(db, {
            url: clonedReq.url,
            method: clonedReq.method,
            headers,
            body,
            timestamp: Date.now()
          });

          if ('sync' in self.registration) {
            await self.registration.sync.register('clinical-sync');
          }

          return new Response(JSON.stringify({ status: 'queued_offline' }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
      return;
    }
  }

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Only fall back to /index.html for HTML navigation requests.
          // JS/CSS chunk requests must fail so the ErrorBoundary can detect
          // the stale-chunk pattern and trigger a reload.
          if (request.destination === 'document' ||
              request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
          return Response.error();
        });
    })
  );
});

// ---- Background sync ----
self.addEventListener('sync', (event) => {
  if (event.tag === 'clinical-sync') {
    event.waitUntil(
      (async () => {
        const db = await idbOpen();
        const allReqs = await idbGetAll(db);

        for (const reqData of allReqs) {
          try {
            const response = await fetch(reqData.url, {
              method: reqData.method,
              headers: reqData.headers,
              body: reqData.body
            });

            if (response.ok) {
              await idbDelete(db, reqData.id);
            } else if (response.status === 401) {
              const clients = await self.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: 'SYNC_ERROR',
                  status: 401,
                  message: 'Sesion caducada. Inicia sesion para sincronizar tus notas.'
                });
              });
              break;
            } else if (response.status === 409) {
              const clients = await self.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: 'SYNC_CONFLICT',
                  id: reqData.id,
                  message: 'Conflicto detectado en una nota. Por favor revisa tus borradores.'
                });
              });
              await idbPut(db, { ...reqData, conflict: true });
            }
          } catch (err) {
            console.error('Background sync failed for req', reqData.id, err);
          }
        }
      })()
    );
  }
});

// ---- Push notifications ----
self.addEventListener('push', (event) => {
  let data = { title: 'Fisioself', body: 'Tienes una nueva notificacion clinica.' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (_e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/logo.jpg',
    badge: '/icons/icon.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
