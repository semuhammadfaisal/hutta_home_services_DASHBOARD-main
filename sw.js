/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'smplfix-static-v2';
const LEGACY_CACHE_PREFIX = 'hutta-static-';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => (
            cacheName.startsWith('smplfix-static-') || cacheName.startsWith(LEGACY_CACHE_PREFIX)
          ) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (url.pathname.startsWith('/api/')) return;

  const ext = url.pathname.split('.').pop() || '';
  const cacheable = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'woff2', 'woff', 'ico'].includes(ext);
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(req)
        .then((res) => {
          if (res && res.ok && ['http:', 'https:'].includes(new URL(req.url).protocol)) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cache.match(req))
    )
  );
});
