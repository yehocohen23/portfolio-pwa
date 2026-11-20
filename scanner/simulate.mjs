// STUB — סורק יומי עתידי (GitHub Actions). כרגע מייצר נתונים מדומים בלבד, בלי שום קריאת רשת.
// הפלט: data/signals.json לרשימה רחבה של סמלים. האפליקציה מצליבה מקומית מול התיק.
// אין כאן כמויות, סכומים או אחוזי תיק — רק סמלים.
import { writeFileSync, readFileSync } from 'node:fs';
import { technicalsAtMonthEnd, assignDeciles } from '../js/logic.js';

const TODAY = '2026-11-13'; // יום המסחר האחרון (שישי 13.11.2026)
let seed = 20261114;
const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

// ימי מסחר (שני-שישי; חגים בארה״ב לא מוסרים — פישוט של הנתונים המדומים)
const dates = [];
for (let d = new Date('2025-07-01T12:00:00Z'); d <= new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const w = d.getUTCDay(); if (w && w !== 6) dates.push(d.toISOString().slice(0, 10));
}
const N = dates.length;
const universe = readFileSync(new URL('./universe.txt', import.meta.url), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));

// פרמטרים מדומים: [מחיר התחלתי, סחף שנתי, תנודתיות, תשואת יום אחרון כפויה, שינוי משטר ב-X ימים אחרונים]
const special = {
  VOO:  [560, 0.08, 0.10, -0.031],
  QQQ:  [480, 0.08, 0.14, -0.036],
  NVDA: [170, 0.30, 0.30, -0.062, [130, -0.75]],   // מגמת ירידה מדומה בחצי השנה האחרונה
  MSFT: [450, 0.05, 0.15, -0.022],
  ASTS: [45,  0.40, 0.80, -0.081, [90, -0.9]],
  SIMX: [38,  -0.20, 0.60, -0.050, [160, -1.6]],    // מניה בדיונית — דגל אדום לדוגמה
};
const rows = [], series = {};
for (const sym of universe) {
  const sp = special[sym] || [20 + rand() * 300, (rand() - 0.4) * 0.8, 0.2 + rand() * 0.5, null];
  let [p0, mu, vol, lastRet, regime] = sp;
  const closes = [p0];
  for (let i = 1; i < N; i++) {
    let m = mu; if (regime && i >= N - regime[0]) m = regime[1];
    let r = m / 252 + vol / Math.sqrt(252) * gauss();
    if (i === N - 1 && lastRet != null) r = lastRet;
    closes.push(+(closes[i - 1] * Math.exp(r)).toFixed(2));
  }
  series[sym] = closes;
  const tech = technicalsAtMonthEnd(dates, closes);
  rows.push({ symbol: sym, lastClose: closes[N - 1], prevClose: closes[N - 2], closeDate: dates[N - 1], ...tech, t1: false, decile: null, events: [], form4: [] });
}
assignDeciles(rows);
const R = Object.fromEntries(rows.map(r => [r.symbol, r]));
const sim = '(אירוע מדומה לבדיקה — לא דיווח אמיתי)';
R.SIMX.events.push({ type: 'exec_departure', date: '2026-10-20', source: 'SEC EDGAR 8-K סעיף 5.02 ' + sim, url: null });
R.SIMX.events.push({ type: 'dilution', date: '2026-08-28', value: 0.18, source: '10-Q, מניות מדוללות +18% בשנה ' + sim, url: null });
R.NVDA.form4.push({ code: 'S', plan10b51: true, date: '2026-10-28', source: 'SEC Form 4 ' + sim, note: 'מכירה לפי תוכנית 10b5-1 — ראיה חלשה. מכירות מנהלים מנבאות חלש בהרבה מרכישות (Lakonishok & Lee 2001).' });
for (const r of rows) { // פונדמנטלס מדומים לסינון ראשוני
  r.fund = { pe: +(5 + rand() * 45).toFixed(1), revGrowth: +((rand() - 0.2) * 0.8).toFixed(3), simulated: true };
  for (const k of ['peak252']) if (r[k]) r[k] = +r[k].toFixed(2);
}
const out = {
  schema: 1,
  generatedAt: TODAY + 'T23:30:00Z',
  simulated: true,
  notice: 'נתונים מדומים בלבד — לא מחירים או דיווחים אמיתיים.',
  technicalAsOf: rows[0].asOf,
  technicalNote: 'T1–T3 ו-DD מחושבים פעם בחודש לפי סגירת יום המסחר האחרון של החודש. מחיר יומי משמש רק לשינוי שווי.',
  universeSize: universe.length,
  fx: { USDILS: 3.70, date: TODAY, source: 'מדומה. בפועל: בנק ישראל, שער יציג' },
  crypto: { BTC: { usd: 91000, date: TODAY }, ETH: { usd: 3100, date: TODAY }, source: 'מדומה. בפועל: CoinGecko Demo' },
  symbols: rows,
};
writeFileSync(new URL('../data/signals.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('wrote', rows.length, 'symbols; tech asOf', out.technicalAsOf);
for (const s of ['VOO','QQQ','NVDA','MSFT','ASTS','SIMX']) { const r = R[s]; console.log(s, r.lastClose, (r.lastClose/r.prevClose-1).toFixed(3), 'r12', r.r12?.toFixed(2), 'dd', r.dd?.toFixed(2), 't1', r.t1, 't2', r.t2, 't3', r.t3, 'dec', r.decile); }
