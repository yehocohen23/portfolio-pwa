// Service worker: מטמון מקומי. בקשות הרשת של האפליקציה לא שולחות את התיק.
// התראת דחיפה, אם נרשמת, מציגה רק את הטקסט הכללי שהשרת שלח.
const CACHE = 'pf-v3';
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
self.addEventListener('push', e => {
  let title = 'ניתוח תיק', body = 'יש עדכון משמעותי בתיק — פתח את האפליקציה';
  try {
    const data = e.data ? e.data.json() : null;
    if (data?.title) title = data.title;
    if (data?.body) body = data.body;
  } catch { /* keep the generic text */ }
  e.waitUntil(self.registration.showNotification(title, {
    body, lang: 'he', dir: 'rtl',
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return clients.openWindow(self.registration.scope);
  }));
});
