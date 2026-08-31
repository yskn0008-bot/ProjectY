'use strict';

const CACHE_PREFIX = 'yos-command-center-';
const CACHE = `${CACHE_PREFIX}v15-visual-pixel-match-roadmap-footer`;
const STATIC = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './assets/home-life-path-watercolor-v1.webp',
  './assets/journey-valley-watercolor-v1.webp',
  './taxi-live-v1.js',
  './hj-entry.js',
  './journey.html',
  './journey.css',
  './journey.js',
  './manifest.webmanifest'
];

async function inject(response) {
  let html = await response.text();
  if (!html.includes('taxi-live-v1.js')) {
    html = html.replace('</body>', '<script src="./taxi-live-v1.js?v=4"></script></body>');
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isHome = event.request.mode === 'navigate' && (url.pathname.endsWith('/yos/') || url.pathname.endsWith('/yos/index.html'));

  if (isHome) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(inject)
        .catch(() => caches.match('./index.html').then(inject))
    );
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
