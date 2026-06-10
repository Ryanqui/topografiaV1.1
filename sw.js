// Actualizar la fecha al desplegar nuevas versiones para forzar invalidaci\u00f3n del cach\u00e9 en PWA
const CACHE_NAME = 'practicas-topografia-v3-20260610';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './README.txt',
  './manifest.webmanifest',
  './assets/logo.svg',
  './assets/cover.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html')))
  );
});
