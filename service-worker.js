const CACHE_NAME = 'yos-mission-control-v2-network-first';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/mission-control.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkWithFallback(request, fallbackKey) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(fallbackKey, response.clone());
    }
    return response;
  } catch {
    return caches.match(fallbackKey);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isMissionData = url.pathname.endsWith('/data/mission-control.json');

  if (isMissionData) {
    event.respondWith(networkWithFallback(event.request, './data/mission-control.json'));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkWithFallback(event.request, './index.html'));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
