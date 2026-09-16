// Minimal service worker: caches the app shell so it opens instantly and still loads
// (in a "you're offline" sense) without a connection. It does NOT cache book data itself —
// that always comes fresh from the API when online, since a stale cached library would be
// more confusing than useful.
const CACHE_NAME = 'alices-library-v5'; // bump this string any time index.html, manifest.json, or the icons change — it's what tells phones a new version exists
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; }).map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  // Never cache API calls to Apps Script — books data must always be live.
  if (url.hostname.indexOf('script.google.com') !== -1 || url.hostname.indexOf('googleusercontent.com') !== -1) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
