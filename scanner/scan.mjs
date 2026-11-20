// Daily public-market scan. No portfolio quantities, weights, or names are read here.
// Prices: Yahoo Finance (no key), Finnhub only if FINNHUB_API_KEY is set and Yahoo fails.
// Filings: SEC EDGAR when SEC_USER_AGENT is set. Anything not fetched stays missing.
import { readFileSync, writeFileSync } from 'node:fs';
import { technicalsAtMonthEnd, assignDeciles, classifyDowntrend } from '../js/logic.js';
import { mapPool, loadPrices, usdIls, cryptoUsd } from './prices.mjs';
import { createEdgar } from './edgar.mjs';
import { sendGenericPush } from './push.mjs';

if (process.env.SCANNER_SIMULATE === '1') {
  await import('./simulate.mjs');
  process.exit(0);
}

const round = (n, d = 4) => Number.isFinite(n) ? +n.toFixed(d) : null;
const signalsPath = new URL('../data/signals.json', import.meta.url);

function readUniverse() {
  return readFileSync(new URL('./universe.txt', import.meta.url), 'utf8')
    .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#') && s !== 'SIMX');
}

async function liveLists() {
  const extra = [];
  try {
    const res = await fetch('https://api.nasdaq.com/api/quote/list-type/nasdaq100', { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const data = await res.json();
      for (const row of data?.data?.data?.rows || []) if (row.symbol) extra.push(String(row.symbol).toUpperCase());
    }
  } catch (err) { console.log('nasdaq-100 list skipped:', err.message); }
  try {
    const res = await fetch('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv', { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      for (const line of (await res.text()).split('\n').slice(1)) {
        const sym = line.split(',')[0]?.trim();
        if (sym && sym !== 'Symbol') extra.push(sym.toUpperCase());
      }
    }
  } catch (err) { console.log('s&p list skipped:', err.message); }
  return extra;
}

function redSymbols(doc) {
  const set = new Set();
  if (!doc || doc.simulated || !Array.isArray(doc.symbols)) return set;
  const today = doc.symbols.find(s => s.closeDate)?.closeDate;
  if (!today) return set;
  for (const s of doc.symbols) {
    if (!Number.isFinite(s.lastClose) || s.dd == null) continue;
    if (classifyDowntrend(s, today).level === 'red') set.add(s.symbol);
  }
  return set;
}

let previous = null;
try { previous = JSON.parse(readFileSync(signalsPath, 'utf8')); }
catch { previous = null; }

const limit = Number(process.env.SCAN_LIMIT || 0);
const universe = [...new Set([...(await liveLists()), ...readUniverse()].map(s => String(s).toUpperCase()))].filter(s => s && s !== 'SIMX').sort();
const symbols = limit > 0 ? universe.slice(0, limit) : universe;
console.log('universe', symbols.length, limit ? '(limited)' : '');

const finnhub = process.env.FINNHUB_API_KEY || '';
let priced = 0, missed = 0;
const rows = await mapPool(symbols, 4, async (symbol, i) => {
  const series = await loadPrices(symbol, finnhub);
  if (!series) { missed++; if ((i + 1) % 40 === 0) console.log('prices', i + 1, '/', symbols.length, 'miss', missed); return null; }
  const tech = technicalsAtMonthEnd(series.dates, series.closes) || {};
  priced++;
  if ((i + 1) % 40 === 0) console.log('prices', i + 1, '/', symbols.length, 'ok', priced);
  const n = series.closes.length;
  return {
    symbol,
    ...tech,
    lastClose: round(series.closes[n - 1]),
    prevClose: round(series.closes[n - 2]),
    closeDate: series.dates[n - 1],
    priceSource: series.source,
    t1: false,
    decile: null,
    events: [],
    form4: [],
    form4Note: 'טופס 4 לא נסרק — לא הומצאו עסקאות',
  };
});

const good = rows.filter(Boolean);
if (good.length < Math.min(30, Math.ceil(symbols.length * 0.4))) {
  console.error('too few prices (' + good.length + '). not writing signals.json');
  process.exit(1);
}
assignDeciles(good);
for (const row of good) {
  if (row.peak252) row.peak252 = round(row.peak252, 4);
  if (row.close) row.close = round(row.close, 4);
  if (row.sma10m) row.sma10m = round(row.sma10m, 4);
}

const today = good.map(r => r.closeDate).sort().at(-1);
const edgar = createEdgar(process.env.SEC_USER_AGENT || '');
const filing = await edgar.load(good.map(r => r.symbol), today);
for (const row of good) row.events = filing.events.get(row.symbol) || [];

let fx = null, crypto = null;
try { fx = await usdIls(); }
catch (err) { console.log('fx missing:', err.message); }
try { crypto = await cryptoUsd(); }
catch (err) { console.log('crypto missing:', err.message); crypto = { missing: true, source: 'CoinGecko unavailable — no price invented' }; }

const asOf = good.map(r => r.asOf).filter(Boolean).sort().at(-1) || null;
const out = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  simulated: false,
  notice: 'מחירים יומיים אמיתיים (Yahoo Finance). שער הדולר: בנק ישראל. ' + (filing.note.detail || ''),
  technicalAsOf: asOf,
  technicalNote: 'T1–T3 ו-DD מחושבים מסוף החודש האחרון שהושלם (js/logic.js), לא כל יום. מחיר יומי משמש לשינוי שווי. מכפיל וצמיחת הכנסות לא נאספו — חסר, לא הומצא. טופס 4 לא נסרק.',
  universeSize: symbols.length,
  pricedCount: good.length,
  unpricedCount: missed,
  filings: filing.note,
  fx: fx || { USDILS: null, date: null, source: 'חסר — שער בנק ישראל לא נקרא, לא הומצא שער' },
  crypto: crypto || { missing: true },
  symbols: good,
};

writeFileSync(signalsPath, JSON.stringify(out, null, 1));
console.log('wrote', good.length, 'priced;', missed, 'missing; tech', asOf, 'close', today, 'fx', fx?.USDILS ?? 'missing');

const before = redSymbols(previous);
const after = redSymbols(out);
let freshRed = 0;
if (previous && previous.simulated === false) {
  for (const sym of after) if (!before.has(sym)) freshRed++;
}
const spy = good.find(s => s.symbol === 'SPY');
const spyMove = spy && spy.prevClose ? Math.abs(spy.lastClose / spy.prevClose - 1) : null;
const shouldPush = freshRed > 0 || (spyMove != null && spyMove >= 0.03);
console.log('push decision', JSON.stringify({ freshRed, spyMove, shouldPush, previousSimulated: previous?.simulated ?? null }));
if (shouldPush) {
  try { await sendGenericPush(); }
  catch (err) { console.log('push error (signals file already written):', err.message); }
} else console.log('no push: no new red flag and SPY did not move 3%');
