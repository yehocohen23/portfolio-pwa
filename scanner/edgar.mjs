// SEC EDGAR: 8-K items and share-count dilution. No API key.
// The User-Agent must identify the requester (SEC fair-access policy). If the call is
// refused, callers keep events empty and record that filings were not obtained.

import { THRESHOLDS } from '../js/logic.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function shiftYear(iso, delta) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

export function createEdgar(userAgent) {
  let nextAt = 0;
  let blocked = !userAgent;
  const reason = userAgent ? '' : 'SEC_USER_AGENT is not set';

  async function secGet(url) {
    if (blocked) throw new Error(reason || 'SEC blocked');
    const wait = Math.max(0, nextAt - Date.now());
    if (wait) await sleep(wait);
    nextAt = Date.now() + 140;
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });
    if (res.status === 403 || res.status === 429) {
      blocked = true;
      throw new Error('SEC HTTP ' + res.status);
    }
    if (!res.ok) throw new Error('SEC HTTP ' + res.status);
    return res.json();
  }

  async function tickerMap() {
    const data = await secGet('https://www.sec.gov/files/company_tickers.json');
    const map = new Map();
    for (const row of Object.values(data)) {
      const ticker = String(row.ticker || '').toUpperCase();
      const cik = String(row.cik_str).padStart(10, '0');
      if (!ticker) continue;
      map.set(ticker, cik);
      map.set(ticker.replace(/\./g, '-'), cik);
      map.set(ticker.replace(/-/g, '.'), cik);
    }
    return map;
  }

  function eventsFromSubmission(sub, cik, today) {
    const rec = sub?.filings?.recent;
    if (!rec?.form) return [];
    const out = [];
    const cikPath = String(parseInt(cik, 10));
    for (let i = 0; i < rec.form.length; i++) {
      if (rec.form[i] !== '8-K') continue;
      const date = rec.filingDate[i];
      if (!date || daysBetween(date, today) > 120 || daysBetween(date, today) < 0) continue;
      const items = String(rec.items?.[i] || '').split(',').map(s => s.trim());
      const acc = String(rec.accessionNumber[i] || '').replace(/-/g, '');
      const doc = rec.primaryDocument?.[i] || '';
      const url = acc ? `https://www.sec.gov/Archives/edgar/data/${cikPath}/${acc}/${doc}` : 'https://www.sec.gov/edgar/search/';
      const add = (type, item) => out.push({
        type, date, source: `SEC EDGAR 8-K item ${item}, filed ${date}`, url,
      });
      if (items.includes('4.01')) add('auditor_change', '4.01');
      if (items.includes('4.02')) add('non_reliance', '4.02');
      if (items.includes('5.02')) add('exec_departure', '5.02');
    }
    return out;
  }

  function dilutionFromConcept(data, today) {
    const units = data?.units?.shares || data?.units?.pure || [];
    const pts = units.filter(p => Number.isFinite(p.val) && p.end).sort((a, b) => a.end < b.end ? -1 : 1);
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    if (daysBetween(last.end, today) > 500) return null;
    const target = shiftYear(last.end, -1);
    let best = null, bestDist = 1e9;
    for (const p of pts) {
      if (p.end >= last.end) continue;
      const dist = Math.abs(daysBetween(p.end, target));
      if (dist < bestDist) { best = p; bestDist = dist; }
    }
    if (!best || bestDist > 120 || !(best.val > 0)) return null;
    const change = last.val / best.val - 1;
    if (change < THRESHOLDS.dilution.value) return null;
    return {
      type: 'dilution', date: last.end, value: +change.toFixed(4),
      source: `SEC EDGAR shares outstanding ${best.end} → ${last.end} (${(change * 100).toFixed(1)}%)`,
      url: 'https://data.sec.gov/',
    };
  }

  return {
    get blocked() { return blocked; },
    async load(symbols, today) {
      const events = new Map();
      const note = { status: 'missing', detail: '', form4: 'not_scanned', goingConcern: 'not_scanned', earningsSurprise: 'not_obtainable' };
      if (!userAgent) {
        note.detail = 'SEC_USER_AGENT חסר — לא נקראו דיווחים ולא הומצאו אירועים';
        return { events, note };
      }
      let ciks;
      try { ciks = await tickerMap(); }
      catch (err) {
        note.detail = 'SEC EDGAR לא זמין (' + err.message + ') — לא הומצאו אירועים';
        return { events, note };
      }
      let ok = 0, failed = 0;
      for (const symbol of symbols) {
        if (blocked) break;
        const cik = ciks.get(symbol.toUpperCase()) || ciks.get(symbol.toUpperCase().replace(/\./g, '-'));
        if (!cik) { events.set(symbol, []); continue; }
        try {
          const sub = await secGet('https://data.sec.gov/submissions/CIK' + cik + '.json');
          const list = eventsFromSubmission(sub, cik, today);
          let dilution = null;
          if (!blocked) {
            for (const concept of ['us-gaap/CommonStockSharesOutstanding', 'dei/EntityCommonStockSharesOutstanding']) {
              try {
                const facts = await secGet(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${concept}.json`);
                dilution = dilutionFromConcept(facts, today);
                if (dilution) break;
              } catch (err) {
                if (blocked || String(err.message).includes('SEC blocked') || String(err.message).includes('403') || String(err.message).includes('429')) break;
              }
            }
          }
          if (dilution) list.push(dilution);
          events.set(symbol, list);
          ok++;
        } catch {
          failed++;
          events.set(symbol, []);
        }
      }
      if (blocked && ok === 0) note.detail = 'SEC EDGAR חסם את הבקשות — לא הומצאו אירועים';
      else {
        note.status = failed && !ok ? 'missing' : 'partial';
        if (ok && !failed && !blocked) note.status = 'ok';
        note.detail = `SEC EDGAR submissions. 8-K 4.01/4.02/5.02 נקראו ל-${ok} סמלים` + (failed ? `; ${failed} נכשלו` : '') + '. טופס 4 והפתעת רווח לא נסרקו. going concern לא נסרק (אין שדה מובנה בלי קריאת המסמך המלא).';
      }
      return { events, note };
    },
  };
}
