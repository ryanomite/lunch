const CACHE = 'lunch-v1';
const SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/events.js',
  '/js/api.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/mapManager.js',
  '/js/mapLabel.js',
  '/js/restaurantManager.js',
  '/js/panels.js',
  '/js/configManager.js',
  '/js/app.js',
  '/icons/logo-icon.svg',
  '/icons/logo-white.svg',
  '/icons/logo-bw.svg',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Don't cache API calls, env.js, or external scripts
  if (url.pathname.startsWith('/api/') ||
      url.pathname === '/env.js' ||
      url.origin !== self.location.origin) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
