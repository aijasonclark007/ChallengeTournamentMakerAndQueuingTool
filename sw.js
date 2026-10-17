// Keeps the umpire page (and the files it needs) available when the gym wifi drops.
// Always asks the network first, so people get the newest version whenever they are online.
const CACHE = 'umpire-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && u.hostname !== 'cdn.jsdelivr.net') return;     // never touch the database calls
  e.respondWith(fetch(r).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: u.origin === location.origin && /\/u\.html$/.test(u.pathname) })));
});
