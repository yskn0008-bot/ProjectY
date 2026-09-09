'use strict';

const CACHE_PREFIX = 'yos-command-center-';
const CACHE = `${CACHE_PREFIX}v27-my-way-refinement`;
const STATIC = [
  './',
  './index.html',
  './styles.css',
  './readability-final.css?v=2',
  './task-dashboard.css?v=1',
  './task-dashboard.js?v=1',
  './app.js',
  './money-v2.css?v=2',
  './money-v2.js?v=1',
  './money-reference-v1.css?v=1',
  './money-reference-v1.js?v=2',
  './money-polish-v2.css?v=1',
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
  html = html.replace(/<link rel="stylesheet" href="\.\/readability-final\.css\?v=1">/g, '<link rel="stylesheet" href="./readability-final.css?v=2">');
  if (!html.includes('readability-final.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./readability-final.css?v=2"></head>');
  }
  if (!html.includes('task-dashboard.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./task-dashboard.css?v=1"></head>');
  }
  if (!html.includes('money-v2.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./money-v2.css?v=2"></head>');
  } else {
    html = html.replace(/\.\/money-v2\.css\?v=1/g, './money-v2.css?v=2');
  }
  if (!html.includes('money-reference-v1.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./money-reference-v1.css?v=1"></head>');
  }
  if (!html.includes('money-polish-v2.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="./money-polish-v2.css?v=1"></head>');
  }
  if (!html.includes('taxi-live-v1.js')) {
    html = html.replace('</body>', '<script src="./taxi-live-v1.js?v=4"></script></body>');
  }
  if (!html.includes('task-dashboard.js')) {
    html = html.replace('</body>', '<script src="./task-dashboard.js?v=1" defer></script></body>');
  }
  if (!html.includes('money-v2.js')) {
    html = html.replace('</body>', '<script src="./money-v2.js?v=1" defer></script></body>');
  }
  if (!html.includes('money-reference-v1.js')) {
    html = html.replace('</body>', '<script src="./money-reference-v1.js?v=2" defer></script></body>');
  } else {
    html = html.replace(/\.\/money-reference-v1\.js\?v=1/g, './money-reference-v1.js?v=2');
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
      fetch(event.request, { cache: 'no-store' })
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
