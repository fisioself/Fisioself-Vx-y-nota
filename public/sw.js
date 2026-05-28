import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/build/index.js';

const CACHE_NAME = 'fisioself-notas-vx-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

const dbPromise = openDB('fisioself-sync-db', 1, {
  upgrade(db) {
    db.createObjectStore('sync-queue', { keyPath: 'id', autoIncrement: true });
  }
});

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

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
    if (request.url.includes('/rest/v1/')) {
      // Supabase API
      event.respondWith(
        fetch(request.clone()).catch(async (_err) => {
          const db = await dbPromise;
          const clonedReq = request.clone();
          const headers = {};
          clonedReq.headers.forEach((value, key) => (headers[key] = value));

          let body;
          try {
            body = await clonedReq.text();
          } catch (_e) {
            body = null;
          }

          await db.put('sync-queue', {
            url: clonedReq.url,
            method: clonedReq.method,
            headers,
            body,
            timestamp: Date.now()
          });

          if ('sync' in self.registration) {
            await self.registration.sync.register('clinical-sync');
          }

          // Return a fake 202 Accepted response so the frontend thinks it succeeded locally
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
        .catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'clinical-sync') {
    event.waitUntil(
      (async () => {
        const db = await dbPromise;
        const tx = db.transaction('sync-queue', 'readwrite');
        const store = tx.objectStore('sync-queue');
        const allReqs = await store.getAll();

        for (const reqData of allReqs) {
          try {
            const response = await fetch(reqData.url, {
              method: reqData.method,
              headers: reqData.headers,
              body: reqData.body
            });

            if (response.ok) {
              await store.delete(reqData.id);
            } else if (response.status === 401) {
              // Notificar error de autenticación
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
              // Conflicto de datos: el registro cambió en el servidor
              const clients = await self.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: 'SYNC_CONFLICT',
                  id: reqData.id,
                  message: 'Conflicto detectado en una nota. Por favor revisa tus borradores.'
                });
              });
              // Keep in queue but mark as conflict
              await store.put({ ...reqData, conflict: true });
            }
          } catch (err) {
            console.error('Background sync failed for req', reqData.id, err);
          }
        }
      })()
    );
  }
});

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
