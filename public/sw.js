// Classic Service Worker — no ES module imports, no CDN dependencies
// __BUILD_ID__ lo reemplaza scripts/stamp-sw.mjs tras `vite build` con un id
// único por deploy, así el navegador detecta SIEMPRE una versión nueva del SW.
// Antes el número de versión se subía a mano ('...-v14') y, si alguien lo
// olvidaba en un deploy, sw.js quedaba byte-idéntico, el navegador no detectaba
// actualización y la PWA instalada se quedaba con el bundle viejo. En desarrollo
// el SW se desregistra (ver registerServiceWorker.js), así que el placeholder
// literal nunca llega a usarse sin estampar.
const CACHE_NAME = 'fisioself-notas-vx-__BUILD_ID__';
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
  // A propósito NO llamamos self.skipWaiting() aquí: dejamos que el SW nuevo
  // espere en estado "waiting" para que la app muestre el banner "Actualizar
  // ahora" (useSwUpdate) y sea el usuario quien decida cuándo recargar — así no
  // interrumpimos a alguien a media nota clínica. El skipWaiting se dispara vía
  // el mensaje SKIP_WAITING cuando el usuario toca el botón. Si nunca lo toca,
  // el SW nuevo activa solo en el próximo arranque en frío de la app.
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
      // IMPORTANTE: solo encolamos escrituras cuando el dispositivo está
      // REALMENTE sin conexión. Antes interceptábamos toda escritura y, si el
      // `fetch` fallaba por un microcorte de red (mucho más común en celular),
      // devolvíamos un 202 falso "queued_offline". El cliente de Supabase espera
      // la fila insertada (.select().single()) y, al recibir ese 202, fallaba con
      // "No se pudo agendar la cita" — por eso en celular no se podía agendar y en
      // laptop (wifi estable) sí. Estando en línea dejamos pasar la petición tal
      // cual para que la app vea la respuesta/el error real y pueda reintentar.
      if (self.navigator && self.navigator.onLine === false) {
        event.respondWith(
          (async () => {
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
          })()
        );
      }
      // En línea: no interceptamos — el navegador hace el fetch normal.
      return;
    }
  }

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isDocument =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    (request.headers.get('accept') || '').includes('text/html');

  // HTML (la "cáscara" de la app): NETWORK-FIRST. Siempre intentamos traer el
  // index.html más reciente — que referencia el bundle JS recién desplegado —
  // y solo caemos a la copia en caché si no hay conexión. Esto evita quedarnos
  // con una versión vieja tras cada deploy.
  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put('/index.html', copy))
            .catch(() => {});
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Assets con hash (JS/CSS/imágenes): CACHE-FIRST (son inmutables por su hash).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
          return response;
        })
        .catch(() => Response.error());
    })
  );
});

// ---- Cola de escrituras offline: reenvío ----
// Reenvía todas las escrituras encoladas mientras no había conexión. Se invoca
// desde el evento `sync` (Background Sync, soportado en Chrome/Android) y también
// desde un mensaje FLUSH_QUEUE que la app dispara al reconectar — esto último es
// imprescindible porque iOS/Safari NO soporta Background Sync y, sin este camino,
// las notas guardadas offline nunca se reenviaban solas.
// Guarda de concurrencia: en iOS pueden llegar dos eventos 'online'/FLUSH_QUEUE
// casi simultáneos. Sin esto, dos flushQueue corrían en paralelo, ambos leían
// getAll() antes de borrar y reenviaban la misma nota dos veces (duplicado).
let isFlushing = false;

async function flushQueue() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    await flushQueueInner();
  } finally {
    isFlushing = false;
  }
}

async function flushQueueInner() {
  const db = await idbOpen();
  const allReqs = await idbGetAll(db);
  let synced = 0;

  for (const reqData of allReqs) {
    if (reqData.conflict) continue; // ya marcada como conflicto, no reintentar
    try {
      const response = await fetch(reqData.url, {
        method: reqData.method,
        headers: reqData.headers,
        body: reqData.body
      });

      if (response.ok) {
        await idbDelete(db, reqData.id);
        synced += 1;
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
      // Otros códigos (p. ej. 5xx transitorios): dejamos la petición en cola
      // para reintentarla en el próximo reconectar/sync.
    } catch (err) {
      // Sin red de nuevo: abortamos; el resto sigue en cola para el próximo intento.
      console.warn('[SW] Reenvío offline detenido (sin red) en req', reqData.id, err.message);
      break;
    }
  }

  if (synced > 0) {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'SYNC_DONE', synced });
    });
  }
}

// ---- Background sync (Chrome/Android) ----
self.addEventListener('sync', (event) => {
  if (event.tag === 'clinical-sync') {
    event.waitUntil(flushQueue());
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
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
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

// ---- Mensajes desde la app ----
self.addEventListener('message', (event) => {
  // Actualización instantánea cuando el usuario toca "Actualizar ahora".
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Reenviar la cola offline al reconectar (camino que sí funciona en iOS).
  if (event.data?.type === 'FLUSH_QUEUE') {
    event.waitUntil(flushQueue());
  }
});
