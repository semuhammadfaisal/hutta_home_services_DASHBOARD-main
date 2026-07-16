/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'hutta-static-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
