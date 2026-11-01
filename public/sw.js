// Nexaro service worker: makes the site installable (PWA) and keeps the pages
// you've already opened available when the connection drops.
//
// "Network first": every request goes to the network as usual, so changes show up
// straight away; the saved copy is only used when you're offline.
// It never touches Supabase, logins or other websites (only this site's own files),
// and never saves /config.js.
const CACHE = 'nexaro-v1';
const PRECACHE = ['/', '/css/style.css', '/images/favicon.svg', '/images/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

// A new version of this file deletes the old saved copies
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return; // Supabase, fonts, CDNs: untouched
  if (url.pathname === '/config.js' || url.pathname === '/sw.js') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request))
        ?? (request.mode === 'navigate' ? caches.match('/') : Response.error())),
  );
});
