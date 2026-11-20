// One generic Web Push. The body never names a symbol, a quantity, or a person.
// Holdings stay on the phone. We push only for a new red flag in the public list,
// or when SPY itself moved at least 3% — see scan.mjs.
import { pathToFileURL } from 'node:url';

async function loadWebPush() {
  const base = process.env.WEB_PUSH_PATH;
  if (!base) return null;
  try {
    const mod = await import(pathToFileURL(base.replace(/\/$/, '') + '/src/index.js').href);
    return mod.default || mod;
  } catch (err) {
    console.log('web-push import failed:', err.message);
    return null;
  }
}

export async function sendGenericPush() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const raw = process.env.PUSH_SUBSCRIPTIONS || '';
  if (!pub || !priv || !raw.trim()) {
    console.log('push skipped: VAPID keys or PUSH_SUBSCRIPTIONS not set');
    return { sent: 0, skipped: true };
  }
  let subs;
  try { subs = JSON.parse(raw); }
  catch {
    console.log('push skipped: PUSH_SUBSCRIPTIONS is not valid JSON');
    return { sent: 0, skipped: true };
  }
  if (!Array.isArray(subs)) subs = [subs];
  subs = subs.filter(s => s && s.endpoint);
  if (!subs.length) {
    console.log('push skipped: no subscriptions');
    return { sent: 0, skipped: true };
  }
  const webpush = await loadWebPush();
  if (!webpush) {
    console.log('push skipped: web-push is not installed');
    return { sent: 0, skipped: true };
  }
  const subject = process.env.VAPID_SUBJECT || 'mailto:yehocohen23@users.noreply.github.com';
  webpush.setVapidDetails(subject, pub, priv);
  const payload = JSON.stringify({
    title: 'ניתוח תיק',
    body: 'יש עדכון משמעותי בתיק — פתח את האפליקציה',
  });
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload);
      sent++;
    } catch (err) {
      console.log('push failed for one device:', err.statusCode || err.message);
    }
  }
  console.log('push sent to', sent, 'of', subs.length, 'devices');
  return { sent, skipped: false };
}
