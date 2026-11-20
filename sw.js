// Service worker: מטמון מקומי בלבד. אין שליחת נתונים החוצה.
const CACHE = 'pf-v2';
const SHELL = ['./', './index.html', './styles.css', './js/app.js', './js/logic.js', './js/sample.js', './js/onboard.js', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './data/signals.json'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // לא מטפל בבקשות חיצוניות (אין כאלה)
  // רשת קודם (כדי לקבל עדכונים), מטמון כגיבוי לעבודה בלי חיבור
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
