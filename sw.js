// Service worker: keeps a copy of the app around so it opens even without internet.
// Your videos never pass through here, they're read straight from your device.
// Bump the version when you change the file list below, old copies get cleaned up.
const CACHE = 'video-player-v2';
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

// throw away copies from older versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// only our own files get this treatment, so another project you serve on the same
// localhost port later doesn't get hijacked by this one
const APP_URLS = new Set(APP_FILES.map((file) => new URL(file, self.registration.scope).href));

// network first, so you always get the latest version; the saved copy is the plan B for offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  url.search = '';
  if (request.method !== 'GET' || !APP_URLS.has(url.href)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('./') : Response.error()))),
  );
});
