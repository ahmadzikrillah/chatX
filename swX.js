// Config
const APP_VERSION = '1.0.4';
const CACHE_NAME = `ipa-cache-${APP_VERSION}`;
const OFFLINE_PAGE = '/offline.html';
const MAX_CACHE_AGE_DAYS = 30;

// Precached Assets (Critical)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/scriptX.js',
  '/manifest.json',
  '/favicon.ico'
];

// Runtime Cached Assets
const RUNTIME_CACHE = [
  '/database.json',
  '/offline.html',
  '/img/default-guru.png',
  '/icons/icon-192x192.png'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching critical assets');
        return cache.addAll(PRECACHE_ASSETS)
          .then(() => cache.addAll(RUNTIME_CACHE))
          .catch(err => console.warn('[SW] Cache addAll error:', err))
          .then(() => self.skipWaiting()); // Pindahkan skipWaiting ke sini
      })
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activated version ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all([
        // Clean old caches
        ...cacheNames
          .filter(name => name.startsWith('ipa-cache-') && name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }),

        // Claim clients
        self.clients.claim(),

        // Clean expired cache
        cleanExpiredCache()
      ]);
    })
  );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET & cross-origin
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Handle permintaan navigasi (HTML)
  if (request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          // Jika permintaan berhasil, simpan di cache dan kembalikan
          updateCache(request, networkResponse.clone());
          return networkResponse;
        })
        .catch(() => {
          // Jika permintaan gagal (mungkin offline), coba ambil dari cache atau offline page
          return getFromCache(request) || getOfflinePage();
        })
    );
    return;
  }

  // Handle permintaan aset lainnya (CSS, JS, gambar, data) - Cache First
  if (isStaticAsset(request) || url.pathname === '/database.json') {
    event.respondWith(
      getFromCache(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request).then(networkResponse => {
            updateCache(request, networkResponse.clone());
            return networkResponse;
          });
        })
    );
    return;
  }

  // Biarkan permintaan lain ditangani oleh browser
});

// ===== HELPERS =====
function fetchWithTimeout(request, timeout = 1500) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

function updateCache(request, response) {
  if (response.ok) {
    caches.open(CACHE_NAME)
      .then(cache => cache.put(request, response))
      .catch(err => console.warn('[SW] Cache put error:', err));
  }
}

function getFromCache(request) {
  return caches.match(request)
    .then(response => response || Promise.reject('No cache match'));
}

function getOfflinePage() {
  return caches.match(OFFLINE_PAGE)
    .then(response => response || Response.error());
}

function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      updateCache(request, response.clone());
      return response;
    })
    .catch(() => {
      if (request.url.match(/\.(png|jpg|jpeg)$/)) {
        return caches.match('/img/default-guru.png');
      }
      return Response.error();
    });
}

function isStaticAsset(request) {
  return request.url.match(/\.(css|js|png|jpg|jpeg|ico|svg|woff2?)$/);
}

function cleanExpiredCache() {
  const now = Date.now();
  return caches.open(CACHE_NAME)
    .then(cache => cache.keys()
      .then(keys => {
        return Promise.all(keys.map(request => {
          return cache.match(request).then(response => {
            if (!response) return;
            const date = new Date(response.headers.get('date'));
            if (now - date > MAX_CACHE_AGE_DAYS * 86400000) {
              return cache.delete(request);
            }
          });
        }));
      })
    );
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Implement your sync logic here
  console.log('[SW] Syncing pending data...');
}