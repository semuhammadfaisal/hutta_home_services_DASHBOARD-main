/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'hutta-static-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('hutta-static-') && cacheName !== CACHE_NAME)
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

  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(req);
    const refresh = fetch(req).then(res => {
      if (res?.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    });
    if (cached) { event.waitUntil(refresh.catch(() => {})); return cached; }
    return refresh;
  }));
});
