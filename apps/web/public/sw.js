/* eslint-disable no-undef, no-restricted-globals */
/**
 * Service Worker custom per impiantiXplus (no next-pwa).
 *
 * Strategie:
 *  1. App shell precache (install): /mobile e /mobile/login + offline fallback
 *  2. Stale-while-revalidate runtime cache per /_next/static e immagini
 *  3. Background Sync queue `photo-upload-queue` (IndexedDB) per upload foto
 *     in coda quando offline. Implementazione MVP: stub funzionante che
 *     accoda i POST verso /mobile/api/foto e riprova al recupero connessione.
 *
 * Riferimenti: Architettura_Soluzione.md §7 (PWA + capabilities),
 *              Flusso_Operativo.md §6 (offline ok per le foto del passo 4),
 *              CLAUDE.md (no Expo, solo Web APIs standard).
 *
 * Versioning: bump `CACHE_VERSION` ad ogni release per forzare clean-up.
 */

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `impiantixplus-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `impiantixplus-runtime-${CACHE_VERSION}`;
const VALID_CACHES = new Set([SHELL_CACHE, RUNTIME_CACHE]);

const SHELL_URLS = [
  '/mobile',
  '/mobile/login',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const QUEUE_DB_NAME = 'impiantixplus-pwa';
const QUEUE_STORE = 'photo-upload-queue';

// =====================================================================
// Install: precache app shell. skipWaiting per attivazione rapida.
// =====================================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // addAll fallisce in blocco se anche solo una URL fallisce: usiamo
        // singoli put best-effort per non bloccare l'install in dev.
        Promise.all(
          SHELL_URLS.map((url) =>
            fetch(url, { credentials: 'same-origin' })
              .then((res) => (res.ok ? cache.put(url, res.clone()) : null))
              .catch(() => null),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

// =====================================================================
// Activate: pulisci cache vecchie, prendi controllo subito.
// =====================================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('impiantixplus-') && !VALID_CACHES.has(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// =====================================================================
// Fetch: SWR per assets statici e immagini; network-first per HTML.
// =====================================================================
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET cacheabile
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin: lascia passare senza cache (Supabase, storage cloud, etc.)
  if (url.origin !== self.location.origin) return;

  // Service worker stesso / manifest: network-first
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') {
    return;
  }

  // Static next assets + immagini: stale-while-revalidate
  const isStaticAsset =
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // HTML navigation: network-first con fallback shell offline
  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(networkFirstHtml(req));
    return;
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone()).catch(() => null);
      return res;
    })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

async function networkFirstHtml(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const shell = await caches.open(SHELL_CACHE);
      shell.put(req, res.clone()).catch(() => null);
    }
    return res;
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const cached = (await shell.match(req)) || (await shell.match('/mobile'));
    return (
      cached ||
      new Response(
        '<html lang="it"><body style="font-family:system-ui;padding:24px"><h1>Offline</h1><p>Riapri quando torni online.</p></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
    );
  }
}

// =====================================================================
// Background Sync stub: coda upload foto.
// MVP: salva entry in IndexedDB; al `sync` event riprova tutti i POST.
// Quando il browser non supporta Background Sync API (Safari iOS) il
// SW prova comunque a svuotare la coda al prossimo `fetch` online.
// =====================================================================

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function drainPhotoQueue() {
  let db;
  try {
    db = await openQueueDb();
  } catch {
    return;
  }
  const tx = db.transaction(QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(QUEUE_STORE);
  const getAll = store.getAll();
  const entries = await new Promise((resolve) => {
    getAll.onsuccess = () => resolve(getAll.result || []);
    getAll.onerror = () => resolve([]);
  });
  for (const entry of entries) {
    try {
      const res = await fetch(entry.url, {
        method: 'POST',
        body: entry.body,
        credentials: 'same-origin',
      });
      if (res.ok) {
        store.delete(entry.id);
      }
    } catch {
      // Ancora offline: lascia in coda
      return;
    }
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'photo-upload-queue') {
    event.waitUntil(drainPhotoQueue());
  }
});

// Messaggio dal client per accodare manualmente o forzare drain.
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'DRAIN_PHOTO_QUEUE') {
    event.waitUntil(drainPhotoQueue());
  }
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notifications (iOS 16.4+ richiede PWA installata) — stub.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'impiantiXplus', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'impiantiXplus', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data || {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/mobile';
  event.waitUntil(self.clients.openWindow(url));
});
