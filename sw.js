// Сервис-воркер: приложение открывается и без интернета. Код и данные — «сначала сеть», фото — «сначала кэш».
const V = 'trigor-v1';
const CORE = ['./', 'index.html', 'css/style.css', 'js/app.js', 'data.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  const isImg = u.pathname.indexOf('/img/') !== -1 || u.pathname.indexOf('/icons/') !== -1;
  if (isImg) {
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
  } else {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r).then(h => h || caches.match('index.html'))));
  }
});
