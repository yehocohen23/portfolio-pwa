// גיבוי מקומי בלבד. סיסמה אופציונלית: PBKDF2 + AES-GCM. אין שרת.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes) {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function packBackup(portfolio, extra) {
  return { version: 1, exportedAt: new Date().toISOString(), portfolio, ...extra };
}

export function validateBackup(data) {
  const p = data?.portfolio || (data?.holdings ? data : null);
  if (!p || !Array.isArray(p.holdings)) return 'הקובץ אינו גיבוי של התיק';
  if (p.settings != null && typeof p.settings !== 'object') return 'הגדרות לא תקינות';
  if (p.journal != null && !Array.isArray(p.journal)) return 'יומן לא תקין';
  return null;
}

export function portfolioFromBackup(data) {
  return data.portfolio || data;
}

export async function encryptBackup(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { version: 1, enc: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: 150000, salt: b64(salt), iv: b64(iv), data: b64(cipher) };
}

export async function decryptBackup(wrapped, passphrase) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(wrapped.salt), iterations: wrapped.iter || 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(wrapped.iv) }, key, fromB64(wrapped.data));
  return JSON.parse(dec.decode(plain));
}

export async function shareOrDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: 'גיבוי תיק' });
    return 'shared';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return 'downloaded';
}
