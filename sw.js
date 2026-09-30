/* Learn with Yoot — offline cache for the hosted site: the app, its fonts and the block editor are cached on first visit; /api is never cached. */
const CACHE = 'yoot-web-8a3c93d3bf';
const FILES = ["./", "./index.html", "./fonts.css", "./vendor/blockly.js", "./vendor/blockly-en.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./fonts/fredoka-latin-500-normal.woff2", "./fonts/fredoka-latin-600-normal.woff2", "./fonts/fredoka-latin-700-normal.woff2", "./fonts/lexend-latin-400-normal.woff2", "./fonts/lexend-latin-500-normal.woff2", "./fonts/lexend-latin-600-normal.woff2", "./fonts/noto-sans-myanmar-myanmar-400-normal.woff2", "./fonts/noto-sans-myanmar-myanmar-600-normal.woff2", "./fonts/noto-sans-myanmar-myanmar-700-normal.woff2"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; }).catch(() => caches.match('./index.html'))));
});
