// אפליקציית ניתוח תיק — אבטיפוס v1. ניתוח והמלצה בלבד, ללא מסחר.
// כל נתוני התיק נשמרים ב-localStorage של הדפדפן בלבד. אין שליחה לשרת.
import { THRESHOLDS as TH, ANCHORS, TAX_NOTE, classifyDowntrend, concentration, idleCash, projectSeries,
  requiredDeposit, idleCostYears, eventLabel, pct, num, daysBetween } from './logic.js';
import { SAMPLE_PORTFOLIO, CSV_TEMPLATE } from './sample.js';
import { emptyPortfolio, mode, renderOnboard, renderGate, onboardAct, acceptImport, RISK_Q } from './onboard.js';

const KEY = 'pf.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// עוטף רצפים לטיניים/מספריים ב-<bdi> כדי שלא יתבלגנו בטקסט מימין לשמאל
const bidi = s => String(s ?? '').split(/([A-Za-z0-9$+\-][A-Za-z0-9$=.,+\-%:\/]*(?:[ ]+[A-Za-z0-9$&][A-Za-z0-9$=.,+\-%:\/&]*)*)/).map((p, i) => { if (!(i % 2)) return esc(p); const m = p.match(/^(.*?)([.,:]*)$/); return '<bdi dir="ltr">' + esc(m[1]) + '</bdi>' + esc(m[2]); }).join('');
const clone = o => JSON.parse(JSON.stringify(o));
const usd = (x, d = 0) => Number.isFinite(x) ? '<span class="ltr">$' + x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) + '</span>' : '<span class="chip miss">חסר</span>';
const P = x => '<span class="ltr">' + pct(x) + '</span>';
const prop = '<span class="chip prop">הצעה לאימות</span>';
const KIND = { stock: 'מניה ארה״ב', etf: 'קרן סל ארה״ב', pension: 'פנסיה', study: 'קרן השתלמות', crypto: 'קריפטו', cash: 'מזומן' };

let S = load();
let SIG = null;
let tab = location.hash.slice(1) || 'portfolio';
const ui = { openReloc: {}, testAmount: 10000 };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.holdings)) {
      s.settings = Object.assign({ E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' }, s.settings || {});
      if (!Array.isArray(s.settings.rScen) || s.settings.rScen.length !== 3) s.settings.rScen = [null, null, null];
      s.journal = s.journal || [];
      s.reviewed = s.reviewed || {};
      s.profile = s.profile || {};
      return s;
    }
  } catch {}
  return emptyPortfolio();
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 1800); }
const today = () => (SIG?.symbols?.[0]?.closeDate) || new Date().toISOString().slice(0, 10);

// ---------- ערכים ----------
function valuate() {
  const fx = SIG.fx.USDILS;
  const sig = Object.fromEntries(SIG.symbols.map(s => [s.symbol, s]));
  const items = S.holdings.map(h => {
    const o = { ...h, missing: [] };
    if (h.kind === 'stock' || h.kind === 'etf') {
      const s = sig[h.symbol];
      if (!s) { o.missing.push('אין מחיר ברשימת האותות'); o.usd = NaN; }
      else { o.price = s.lastClose; o.usd = h.qty * s.lastClose; o.prevUsd = h.qty * s.prevClose; o.sig = s; o.date = s.closeDate; }
      if (h.kind === 'etf' && h.er == null) o.missing.push('יחס הוצאות חסר');
      if (!h.sector) o.missing.push('ענף חסר');
    } else if (h.kind === 'crypto') {
      const c = SIG.crypto[h.symbol];
      if (!c) { o.missing.push('אין מחיר'); o.usd = NaN; } else { o.price = c.usd; o.usd = h.qty * c.usd; o.prevUsd = o.usd; o.date = c.date; }
      o.missing.push('עמלות בורסת קריפטו חסרות');
    } else {
      o.usd = h.currency === 'ILS' ? h.balance / fx : h.balance; o.prevUsd = o.usd;
      if ((h.kind === 'pension' || h.kind === 'study') && (h.feeAccum == null)) o.missing.push('דמי ניהול מהצבירה חסרים');
      if (h.kind === 'pension' && h.feeDeposit == null) o.missing.push('דמי ניהול מהפקדה חסרים');
      if (h.kind === 'pension' || h.kind === 'study') o.missing.push('חשיפות המסלול לא נטענו (גמל-נט/פנסיה-נט)');
    }
    return o;
  });
  const priced = items.filter(i => Number.isFinite(i.usd));
  const total = priced.reduce((s, i) => s + i.usd, 0);
  const prev = priced.reduce((s, i) => s + i.prevUsd, 0);
  return { items, total, prev, chg: total / prev - 1, fx };
}

// ---------- התראות ----------
function buildAlerts(V) {
  const A = [], t = today(), techDate = SIG.technicalAsOf, simTag = SIG.simulated ? ' (מדומה)' : '';
  const srcSig = 'קובץ אותות של הסורק היומי' + simTag;
  // 1. שינוי שווי
  if (Math.abs(V.chg) >= TH.valueChange.value) A.push({
    id: 'val', level: 'orange', title: `שווי התיק ${V.chg < 0 ? 'ירד' : 'עלה'} ב-${pct(Math.abs(V.chg))} מיום המסחר הקודם`,
    summary: `מ-${usd(V.prev)} ל-${usd(V.total)}.`,
    evidence: V.items.filter(i => i.prevUsd && Math.abs(i.usd - i.prevUsd) > 1).sort((a, b) => (a.usd - a.prevUsd) - (b.usd - b.prevUsd)).slice(0, 5)
      .map(i => `${esc(i.symbol || i.name)}: ${usd(i.usd - i.prevUsd)} (${P(i.usd / i.prevUsd - 1)})`),
    source: srcSig + '; שער דולר-שקל ' + esc(SIG.fx.source), date: t,
    assumptions: ['סף 3% הוא בחירה תפעולית שלך, לא ממצא מחקרי.', 'פנסיה, השתלמות ומזומן נחשבים ללא שינוי יומי; לקריפטו אין מחיר קודם בקובץ.', 'שווי בדולר לפי שער ' + SIG.fx.USDILS + ' מתאריך ' + SIG.fx.date + '.'],
    risks: ['תנועה יומית רועשת ואינה מעידה על מגמה.', 'שינוי בשער החליפין משנה את השווי בדולר בלי שינוי בנכסים.'], tax: true,
  });
  // 2. מגמת ירידה + 3. מניית מעסיק
  for (const i of V.items.filter(i => i.sig)) {
    const s = i.sig, w = i.usd / V.total;
    if (i.employer) {
      A.push({ id: 'emp-' + i.symbol, level: 'orange', symbol: i.symbol, title: `${esc(i.symbol)}: ריכוזיות כפולה במניית מעסיק`,
        summary: `${P(w)} מהתיק במניית החברה שבה אתה עובד — משכורת וחיסכון תלויים באותה חברה. אין הצעת פעולה למניה זו.`,
        evidence: [`שווי: ${usd(i.usd)} (${P(w)} מהתיק)`, 'הכנסה מעבודה תלויה באותה חברה (ריכוזיות כפולה).'],
        source: 'חישוב מקומי מהכמויות במכשיר; מחיר: ' + srcSig, date: s.closeDate,
        assumptions: ['לפי סקירת היועץ: למניית מעסיק מוצגת ריכוזיות בלבד, בלי הצעת הקטנה או מכירה.', 'סף ריכוזיות ' + pct(TH.concSingle.value, 0) + ' — הצעה לאימות.'],
        risks: ['פגיעה בחברה עלולה לפגוע בו-זמנית בהכנסה ובחיסכון.', 'בדוק את חלונות המסחר וכללי האינסיידר של החברה לפני כל פעולה.'], tax: true });
      continue;
    }
    const c = classifyDowntrend(s, t);
    const reviewed = S.reviewed[i.symbol];
    if (c.level && !(reviewed && reviewed >= techDate)) {
      const ev = c.fired.map(f => `<b>${f.k}</b> — ${bidi(f.txt)}<div class="mut">${bidi(f.src)}</div>`);
      for (const e of c.events) ev.push(`<b>אירוע</b> — ${bidi(eventLabel(e.type))}, ${bidi(e.date)}<div class="mut">${bidi(e.source)}</div>`);
      for (const f of s.form4 || []) ev.push(`<b>טופס 4 (ראיה משלימה)</b> — קוד ${bidi(f.code)}${f.plan10b51 ? ', לפי תוכנית 10b5-1' : ''}, ${bidi(f.date)}<div class="mut">${bidi(f.note)} ${bidi(f.source)}</div>`);
      A.push({ id: 'dt-' + i.symbol, level: c.level, symbol: i.symbol, reloc: true, item: i,
        title: `${esc(i.symbol)}: המלצה לשקול מכירה — ${c.level === 'red' ? 'דגל אדום' : 'דגל צהוב'}`,
        summary: c.level === 'red' ? 'אות טכני חזק יחד עם אירוע יסודי בחלון של 90 יום.' : 'אות טכני בלבד, בלי אירוע יסודי. שווה מבט לפני החלטה.',
        evidence: ev.concat([`משקל בתיק: ${P(w)} (${usd(i.usd)})`]),
        source: srcSig + '; אותות לפי סקירת היועץ §1', date: `אותות טכניים: סוף חודש ${techDate}; מחיר אחרון ${s.closeDate}`,
        assumptions: ['האותות מחושבים פעם בחודש (סגירת יום המסחר האחרון בחודש), לא יומית.', 'T2 ו-T3 הם הכללה של מחקרים על חוזים/סוגי נכסים למניה בודדת.', 'מחיר הקנייה ורווח/הפסד לא ממומש אינם קלט לאות (הטיית המימוש).', 'חלון אירועים 90 יום וספי ירידה מהשיא 30%/50% — הצעה לאימות.'],
        risks: ['ירידה מהשיא לבדה אינה הצדקה למכירה: NVDA, AMZN ו-NFLX ירדו בעבר 80%-93% ועדיין הניבו תשואות קיצוניות.', 'אזעקות שווא אפשריות; מתחת ל-30 התראות אין להסיק שהכלל עובד.', 'מכירה כרוכה במס, עמלות ופער ביצוע.'], tax: true });
    } else if (c.gap) {
      A.push({ id: 'gap-' + i.symbol, level: 'info', symbol: i.symbol, title: `${esc(i.symbol)}: ראשוני — אות חלש יחד עם אירוע`,
        summary: 'ירידה מהשיא בין 30% ל-50% יחד עם אירוע. הכלל של היועץ לא מגדיר רמה למצב הזה — שאלה פתוחה ליועץ.',
        evidence: c.fired.map(f => bidi(f.txt)).concat(c.events.map(e => bidi(eventLabel(e.type) + ' ' + e.date))), source: srcSig, date: techDate,
        assumptions: ['ממתין להחלטת היועץ.'], risks: ['ראיה ראשונית בלבד.'], tax: true });
    }
  }
  // 4. ריכוזיות
  const C = concentration(V.items.filter(i => Number.isFinite(i.usd)), V.total);
  for (const h of C.bySym.filter(h => !h.employer && h.w >= TH.concSingle.value)) A.push({
    id: 'conc-' + h.symbol, level: 'yellow', symbol: h.symbol, title: `${esc(h.symbol)}: ריכוזיות ${pct(h.w)} מהתיק`, summary: `מעל סף ${pct(TH.concSingle.value, 0)} ${prop}`,
    evidence: [`שווי ${usd(h.usd)}`], source: 'חישוב מקומי', date: h.date || t,
    assumptions: ['סף ריכוזיות הוא הצעה תפעולית לאימות; אין סף כזה בסקירת היועץ.', h.kind === 'etf' ? 'קרן סל מפוזרת — ריכוזיות כאן היא בקרן, לא בחברה אחת.' : ''].filter(Boolean),
    risks: ['אחזקה גדולה מגדילה את השפעת אירוע בודד.'], tax: true });
  for (const sc of C.sec.filter(x => x.w >= TH.concSector.value)) A.push({
    id: 'sec-' + sc.s, level: 'yellow', title: `ריכוזיות ענף: ${esc(sc.s)} ${pct(sc.w)}`, summary: `מעל סף ${pct(TH.concSector.value, 0)} ${prop}`,
    evidence: V.items.filter(i => i.sector === sc.s).map(i => `${esc(i.symbol)} ${usd(i.usd)}`), source: 'שדה ענף שהזנת; חישוב מקומי', date: t,
    assumptions: ['קרן סל נספרת כולה בענף שהוזן לה (אין פירוק החזקות בתוך הקרן בגרסה זו).'], risks: ['חשיפה משותפת לאותו גורם סיכון.'], tax: true });
  // 5. מזומן שלא עובד
  const cashUsd = V.items.filter(i => i.kind === 'cash' && !(i.interest > 0)).reduce((s, i) => s + i.usd, 0);
  const st = S.settings, rRef = st.rRef ?? ANCHORS.boiRate.value;
  const ic = idleCash({ cashUsd, E_usd: st.E_ils ? st.E_ils / V.fx : null, M: st.M, sinceDate: st.cashSince, today: t, rRef });
  if (ic.missing) A.push({ id: 'cash-miss', level: 'missing', title: 'חסר: הוצאה חודשית חיונית או מספר חודשי קרן חירום', summary: 'בלי הנתונים האלה לא מחושב יעד קרן חירום ולא מומצא סכום.', evidence: [], source: 'הגדרות', date: t, assumptions: [], risks: [], tax: false });
  else if (ic.fire) {
    const r = st.rScen?.[1];
    A.push({ id: 'cash', level: 'orange', title: 'כסף שלא עובד: עודף מזומן מעל קרן החירום', summary: `עודף ${usd(ic.excess)} מעל יעד חירום ${usd(ic.target)}, כבר ${ic.days} ימים.`,
      evidence: [`יעד חירום = M×E = ${st.M} × ₪${num(st.E_ils, 0)} ≈ ${usd(ic.target)}`, `מזומן בלי ריבית: ${usd(cashUsd)}`, `עלות החמצה משוערת עד היום: ${usd(ic.cost)} (עודף × ${pct(rRef, 2)} × ${ic.days - TH.idleDays.value}/365)`,
        r != null ? `אם יישאר כך 10 שנים בהנחת תשואה ${pct(r)} שבחרת: ${usd(idleCostYears(ic.excess, r, 10))}` : '<span class="chip miss">חסר</span> הנחת תשואה r לחישוב עלות לאורך שנים (מסך תחזית)'],
      source: 'סקירת היועץ §2; ' + ANCHORS.boiRate.src, date: t,
      assumptions: ['קרן חירום 3–6 חודשי הוצאות היא כלל אצבע של מתכננים (Fed FEDS Notes 2018; St. Louis Fed 2025), לא חובה. אתה קבעת M=' + st.M + '.', 'שעון 30 יום — הצעה לאימות.', 'שיעור ייחוס: ' + (st.rRef != null ? 'שבחרת' : 'ריבית בנק ישראל 3.25% (שיעור מדיניות, לא תשואה מובטחת)') + '.', 'חלופות נזילות: קרן כספית שקלית (דמי ניהול משוקללים 0.16%, רשות ני״ע 2025) — בלי תשואה חיה של קרן בשם.'],
      risks: ['זו הזדמנות שהוחמצה בהנחה בלבד, לא הפסד ודאי.', 'סיווג המס של קרן כספית/פיקדון חסר — לא הונח שיעור.'], tax: false });
  }
  // 6. דמי ניהול
  for (const i of V.items) {
    if (i.kind === 'pension' && i.feeDeposit != null && i.feeAccum != null) {
      const sel = ANCHORS.pensionSelected, cap = ANCHORS.pensionCap;
      const high = i.feeDeposit > sel.deposit || i.feeAccum > sel.accum, atCap = i.feeDeposit >= cap.deposit || i.feeAccum >= cap.accum;
      if (high || atCap) {
        const r = S.settings.rScen?.[1]; let costLine;
        if (r != null) {
          const B0 = i.balance, Pm = i.monthlyDeposit || 0;
          const mine = projectSeries({ B0, P: Pm, fd: i.feeDeposit, fa: i.feeAccum, r, years: 20, mode: S.settings.mode }).at(-1);
          const anc = projectSeries({ B0, P: Pm, fd: sel.deposit, fa: sel.accum, r, years: 20, mode: S.settings.mode }).at(-1);
          costLine = `פער משוער ל-20 שנה מול תעריף הקרנות הנבחרות, בהנחת ${pct(r)}: ₪${num(anc - mine, 0)}`;
        } else costLine = '<span class="chip miss">חסר</span> הנחת תשואה r (מסך תחזית) לחישוב העלות לאורך זמן';
        A.push({ id: 'fee-' + i.id, level: 'yellow', title: `דמי ניהול: ${esc(i.name)}`, summary: atCap ? 'בתקרת התקנות.' : 'גבוה ביחס לתעריף הקרנות הנבחרות שתועד ב-2024.',
          evidence: [`שלך: ${P(i.feeDeposit)} מהפקדה, ${pct(i.feeAccum, 2)} מצבירה`, `קרנות נבחרות: ${pct(sel.deposit)} / ${pct(sel.accum, 2)} ${prop}`, `תקרת חוק: ${pct(cap.deposit)} / ${pct(cap.accum, 2)}`, costLine],
          source: sel.src + '; ' + cap.src, date: '2024-08-14 (כנסת); תקנות בנוסח 9.11.2026',
          assumptions: ['רקורסיה חודשית: הפקדה נטו בתחילת חודש, דמי צבירה בסוף חודש (' + (S.settings.mode === 'continuous' ? 'נוסחה רציפה' : 'fa/12') + ').', 'ללא עלות כיסוי ביטוחי.', 'תעריף הקרנות הנבחרות יש לאמת מול פנסיה-נט.'],
          risks: ['מעבר קרן כרוך בבדיקת כיסויים ביטוחיים — לא נבדק כאן.'], tax: false });
      }
    }
    if (i.kind === 'study' && i.feeAccum != null) {
      const cap = ANCHORS.studyFundCap.accum;
      if (i.feeAccum >= cap * 0.5) A.push({ id: 'fee-' + i.id, level: 'info', title: `דמי ניהול: ${esc(i.name)}`, summary: `${pct(i.feeAccum, 2)} מצבירה מול תקרה ${pct(cap)}.`, evidence: ['אין סף רשמי ל«גבוה» בקרן השתלמות; מוצג מול התקרה בלבד. סף נוסף רק אם תקבע.'], source: ANCHORS.studyFundCap.src, date: '9.11.2026', assumptions: ['50% מהתקרה כסף תצוגה — הצעה לאימות.'], risks: [], tax: false });
    }
    if (i.kind === 'etf' && i.er != null && i.er > ANCHORS.iciEquityIndexEtf.value) A.push({ id: 'fee-' + i.id, level: 'info', symbol: i.symbol,
      title: `${esc(i.symbol)}: יחס הוצאות מעל ממוצע הקטגוריה`, summary: `${pct(i.er, 2)} מול ${pct(ANCHORS.iciEquityIndexEtf.value, 2)} (ממוצע משוקלל ICI 2025). זו לא המלצת החלפה.`,
      evidence: [], source: ANCHORS.iciEquityIndexEtf.src, date: 'מרץ 2026', assumptions: ['השוואה לקטגוריית קרנות סל מנייתיות מחקות; יחס ההוצאות בתיק המדומה — יש לאמת.', 'מעל ממוצע — הצעה לאימות.'], risks: [], tax: false });
  }
  // 7. נתונים חסרים
  const miss = V.items.filter(i => i.missing.length);
  if (miss.length) A.push({ id: 'missing', level: 'missing', title: `נתונים חסרים ב-${miss.length} פריטים`, summary: 'חסר מסומן כחסר — לא כאפס ולא מומצא.',
    evidence: miss.map(i => `${esc(i.symbol || i.name)}: ${i.missing.map(esc).join('; ')}`), source: 'בדיקה מקומית', date: t, assumptions: [], risks: ['ניתוח עם נתונים חסרים פחות אמין.'], tax: false });
  const order = { red: 0, orange: 1, yellow: 2, info: 3, missing: 4 };
  return A.sort((a, b) => order[a.level] - order[b.level]);
}

// ---------- מסכים ----------
function viewPortfolio(V, A) {
  const groups = {};
  for (const i of V.items) if (Number.isFinite(i.usd)) groups[i.kind] = (groups[i.kind] || 0) + i.usd;
  const C = concentration(V.items.filter(i => Number.isFinite(i.usd)), V.total);
  const flag = sym => { const a = A.find(a => a.symbol === sym && (a.level === 'red' || a.level === 'yellow' || a.id.startsWith('emp'))); return a ? `<span class="chip ${a.level}">${a.level === 'red' ? 'אדום' : a.level === 'yellow' ? 'צהוב' : 'ריכוזיות'}</span>` : ''; };
  return `
  <div class="card">
    <div class="mut">שווי כולל (דולר)</div>
    <div class="big">${usd(V.total)}</div>
    <div class="row small"><span>שינוי מיום המסחר הקודם</span><span class="ltr ${V.chg < 0 ? 'neg' : 'pos'}">${usd(V.total - V.prev)} (${pct(V.chg, 2)})</span></div>
    <div class="note">מחירים: ${esc(SIG.symbols[0].closeDate)} · שער ₪/$ ${SIG.fx.USDILS} מ-${esc(SIG.fx.date)} (${esc(SIG.fx.source)}) · ${esc(SIG.notice)}</div>
  </div>
  <h2>פילוח לפי סוג נכס</h2>
  <div class="card">${Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
    <div class="row small"><span>${KIND[k]}${k === 'crypto' ? ' <span class="chip">תצוגה וסיכון בלבד</span>' : ''}</span><span>${usd(v)} · ${P(v / V.total)}</span></div>
    <div class="bar"><span data-w="${(v / V.total * 100).toFixed(1)}"></span></div>`).join('')}
  </div>
  <h2>ריכוזיות</h2>
  <div class="card">
    ${C.bySym.slice(0, 6).map(h => `<div class="row small"><span>${esc(h.symbol)} ${h.employer ? '<span class="chip orange">מניית מעסיק — ריכוזיות כפולה</span>' : ''}</span><span>${P(h.w)}</span></div>
      <div class="bar"><span class="${h.w >= TH.concSingle.value ? 'warn' : ''}" data-w="${(h.w * 100).toFixed(1)}"></span></div>`).join('')}
    <h3>ענפים</h3>
    ${C.sec.map(x => `<div class="row small"><span>${esc(x.s)}</span><span>${P(x.w)}</span></div>`).join('')}
    <div class="note">ספי ריכוזיות: אחזקה ${pct(TH.concSingle.value, 0)}, ענף ${pct(TH.concSector.value, 0)} — ${prop}. קרן סל לא מפורקת לרכיביה בגרסה זו.</div>
  </div>
  <h2>אחזקות</h2>
  <div class="card">${V.items.map(i => `
    <div class="hold" data-hold="${esc(i.id)}">
      <div class="row"><b>${esc(i.symbol || '')} ${i.symbol ? '·' : ''} <span class="small">${esc(i.name)}</span></b><span>${usd(i.usd)}</span></div>
      <div class="row mut"><span>${KIND[i.kind]}${i.qty != null ? ` · ${i.qty} יח׳` : ''} · ${esc(i.currency)}${i.currency === 'ILS' ? ` ₪${num(i.balance, 0)}` : ''}</span>
      <span>${Number.isFinite(i.usd) ? P(i.usd / V.total) : ''} ${flag(i.symbol)} ${i.missing.length ? '<span class="chip miss">חסר נתון</span>' : ''}</span></div>
      ${i.thesis ? `<div class="mut">תזה: ${esc(i.thesis)}</div>` : ''}
      ${i.exit ? `<div class="mut">יציאה: ${esc(i.exit)}</div>` : ''}
    </div>`).join('')}
    <div class="btns"><button class="b sec" data-act="addHolding">+ הוספה ידנית</button><button class="b sec" data-go="more">ייבוא CSV</button></div>
  </div>
  <p class="mut">ניתוח בלבד. האפליקציה לא מבצעת עסקאות, לא מעבירה כסף ולא מתחברת לחשבונות.</p>`;
}

function alertCard(a, V) {
  const li = arr => arr?.length ? '<ul>' + arr.map(x => `<li>${x}</li>`).join('') + '</ul>' : '<div class="mut">—</div>';
  return `<div class="card alert ${a.level}" id="al-${esc(a.id)}">
    <h3>${a.title}</h3><div class="small">${a.summary}</div>
    ${a.evidence?.length ? `<dl><dt>ראיות וערכים</dt><dd>${li(a.evidence)}</dd></dl>` : ''}
    <details><summary>מקור, תאריך, הנחות וסיכונים</summary><dl>
      <dt>מקור</dt><dd>${bidi(a.source)}</dd><dt>תאריך הנתונים</dt><dd>${bidi(a.date)}</dd>
      <dt>הנחות</dt><dd>${li(a.assumptions.map(bidi))}</dd><dt>סיכונים</dt><dd>${li(a.risks.map(bidi))}</dd></dl></details>
    ${a.tax ? `<div class="tax">${bidi(TAX_NOTE)}</div>` : ''}
    <div class="btns">
      ${a.reloc ? `<button class="b" data-reloc="${esc(a.id)}">לאן להעביר?</button>` : ''}
      ${a.reloc ? `<button class="b sec" data-reviewed="${esc(a.symbol)}">סימנתי נבדק</button>` : ''}
      <button class="b sec" data-journal="${esc(a.id)}">רשום החלטה ביומן</button>
    </div>
    ${a.reloc && ui.openReloc[a.id] ? relocBox(a, V) : ''}
  </div>`;
}

function relocBox(a, V) {
  const i = a.item, amt = i.usd, wNow = amt / V.total;
  const voo = V.items.find(x => x.symbol === 'VOO'); const vooW = (voo?.usd || 0) / V.total;
  return `<div class="reloc">
    <b>חלופות להמחשה בלבד — לא הוראת פעולה</b>
    <table><tr><th>חלופה</th><th>נימוק ומקור</th><th>השפעת ריכוזיות</th></tr>
    <tr><td>קרן סל על S&P 500</td><td>פיזור רחב; יחס הוצאות נמוך (ICI 2025: ממוצע מחקות 0.14%). מדד הייחוס בתוכנית.</td><td>${esc(i.symbol)}: מ־${P(wNow)} ל־${P(0)}<br>VOO: מ־${P(vooW)} ל־${P(vooW + wNow)}</td></tr>
    <tr><td>קרן כספית / פיקדון</td><td>נזיל; עוגן: ריבית בנק ישראל 3.25% (21.10.2026). ממוצע כספיות שקליות 2025: 4.43% — נתון היסטורי, לא הבטחה.</td><td>${esc(i.symbol)}: ל־${P(0)}<br>מזומן: תוספת ${P(wNow)}</td></tr>
    <tr><td>להשאיר</td><td>ירידה מהשיא לבדה אינה הצדקה למכירה; אין מס ועמלות.</td><td>ללא שינוי</td></tr>
    <tr><td>הקטנה חלקית (חצי)</td><td>מקטין חשיפה תוך שמירת חלק מהפוטנציאל.</td><td>${esc(i.symbol)}: מ־${P(wNow)} ל־${P(wNow / 2)}</td></tr></table>
    <div class="note">ההשוואה מתעלמת ממס רווח הון (25%/30%), עמלות ופער ביצוע, ומניחה מעבר מלא באותו יום — מה שבפועל לא מדויק. כמויות לא יוצאות מהמכשיר; החישוב מקומי.</div>
  </div>`;
}

function viewAlerts(V, A) {
  return `<p class="mut">התראות לפי כללי היועץ. אותות טכניים חודשיים (נכון ל-${esc(SIG.technicalAsOf)}), דיווחים יומיים. חלופה לאן להעביר מוצגת רק בלחיצה.</p>
    ${A.map(a => alertCard(a, V)).join('') || '<div class="card">אין התראות.</div>'}`;
}

function viewScreen(V) {
  const held = new Set(S.holdings.map(h => h.symbol));
  const rows = SIG.symbols;
  const cats = [
    { k: 'מומנטום', d: 'עשירון עליון של 12-1 (Jegadeesh & Titman 1993)', f: r => r.decile === 10 },
    { k: 'ערך', d: `מכפיל רווח < 15 ${prop} (פונדמנטלס מדומים)`, f: r => r.fund?.pe < 15 },
    { k: 'צמיחה', d: `צמיחת הכנסות > 25% בשנה ${prop} (מדומה)`, f: r => r.fund?.revGrowth > 0.25 },
    { k: 'מחיר נמוך מאוד', d: `מחיר < $10 ${prop}. אין סף מאומת ל«מניית אלף אחוז»`, f: r => r.lastClose < 10 },
  ];
  const amt = ui.testAmount;
  return `<div class="card small"><b>סריקה ראשונית של השוק הרחב (${SIG.universeSize} סמלים בדוגמה)</b>
    <div class="mut">כל תוצאה ראשונית. סריקה בלי יקום שכולל מניות שנמחקו משחזרת הטיית שרידות; ריבוי מסננים = סכנת חיטוט בנתונים. אין הבטחת תשואה. קריפטו לא נסרק.</div>
    <label>סכום לבדיקת השפעת ריכוזיות ($)</label><input id="testAmt" type="number" inputmode="decimal" value="${amt}"></div>
    ${cats.map(c => { const list = rows.filter(c.f).slice(0, 8); return `<h2>${c.k} <span class="chip">ראשוני</span></h2><div class="mut small">${c.d}</div><div class="card">
      ${list.map(r => `<div class="hold"><div class="row"><b>${esc(r.symbol)} ${held.has(r.symbol) ? '<span class="chip">מוחזק</span>' : ''}</b><span>${usd(r.lastClose, 2)}</span></div>
      <div class="row mut"><span><span class="ltr">R12-1 ${pct(r.r12_1)}</span> · עשירון ${r.decile} · <span class="ltr">P/E ${r.fund?.pe}</span></span><span>אם תשקיע ${usd(amt)}: ${P(amt / (V.total + amt))} מהתיק</span></div></div>`).join('') || '<div class="mut">אין</div>'}</div>`; }).join('')}
    <p class="mut">מקור: ${esc(SIG.notice)} נכון ל-${esc(SIG.technicalAsOf)}. המחקר הקודם (Bessembinder 2018; J.P. Morgan 2021; Mauboussin 2026) לא הניב ספים מאומתים.</p>`;
}

function viewProjection(V) {
  const st = S.settings, pj = S.proj || (S.proj = { B0: Math.round(V.total), P: 1000, fd: 0, fa: 0.001, years: 20, G: null });
  const rs = st.rScen || [null, null, null];
  const rReady = rs.every(r => r != null);
  const ready = rReady && [pj.B0, pj.P, pj.fd, pj.fa].every(Number.isFinite);
  const pctIn = x => Number.isFinite(x) ? +(x * 100).toFixed(3) : '';
  let out = '';
  if (ready) {
    const series = rs.map(r => projectSeries({ ...pj, r, years: 20, mode: st.mode }));
    const noFee = projectSeries({ ...pj, fd: 0, fa: 0, r: rs[1], years: 20, mode: st.mode });
    const max = Math.max(...series.flat(), pj.G || 0), Wd = 340, Ht = 180;
    const pts = s => s.map((v, t) => `${(t / 240 * Wd).toFixed(1)},${(Ht - v / max * Ht).toFixed(1)}`).join(' ');
    const colors = ['#94a3b8', '#38bdf8', '#34d399'];
    out = `<div class="card"><svg viewBox="-14 -4 ${Wd + 28} ${Ht + 22}" width="100%" direction="ltr" role="img" aria-label="תרשים תחזית">
      ${series.map((s, k) => `<polyline fill="none" stroke="${colors[k]}" stroke-width="2" points="${pts(s)}"/>`).join('')}
      ${pj.G ? `<line x1="0" x2="${Wd}" y1="${Ht - pj.G / max * Ht}" y2="${Ht - pj.G / max * Ht}" stroke="#facc15" stroke-dasharray="4"/>` : ''}
      <line x1="${Wd / 2}" x2="${Wd / 2}" y1="0" y2="${Ht}" stroke="#334155"/><text x="${Wd / 2}" y="${Ht + 14}" text-anchor="middle">10 שנים</text><text x="${Wd}" y="${Ht + 14}" text-anchor="middle">20 שנה</text><text x="0" y="${Ht + 14}" text-anchor="middle">היום</text>${pj.G ? `<text x="${Wd}" y="${Ht - pj.G / max * Ht - 4}" text-anchor="end">יעד</text>` : ''}</svg>
      <table><tr><th>תרחיש (r שלך)</th><th>10 שנים</th><th>20 שנים</th></tr>
      ${series.map((s, k) => `<tr><td><span class="ltr" data-c="${colors[k]}">■</span> ${['שמרני', 'בסיס', 'אופטימי'][k]} ${P(rs[k])}</td><td>${usd(s[120])}</td><td>${usd(s[240])}</td></tr>`).join('')}</table>
      <div class="small">עלות דמי ניהול ל-20 שנה (תרחיש בסיס): ${usd(noFee[240] - series[1][240])} (${P(1 - series[1][240] / noFee[240])} מהיתרה בלי דמים)</div>
      ${pj.G && Number.isFinite(pj.years) ? (() => { const q = requiredDeposit({ ...pj, r: rs[1], years: pj.years, mode: st.mode }); return `<div class="small">יעד ${usd(pj.G)} בעוד ${pj.years} שנים (תרחיש בסיס): ${q.zero ? 'ההפקדה הנדרשת היא אפס בהנחות אלה.' : 'הפקדה חודשית נדרשת ' + usd(q.P)}</div>`; })() : '<div class="mut">לא הוגדר יעד (אופציונלי).</div>'}
      <div class="tax">זו המחשה חשבונאית לפי הנחת תשואה שנתית שהזנת, לא תחזית ולא הבטחה. אין חישוב «סיכוי להגיע ליעד». תשואה נומינלית; אין התאמה לאינפלציה. ללא מס.</div></div>`;
  } else if (!rReady) out = '<div class="card alert missing"><b>חסר: שלוש הנחות תשואה שאתה קובע.</b><div class="mut">אין תשואת ברירת מחדל סמויה. הזן שמרני / בסיס / אופטימי.</div></div>';
  const f = (id, l, v, step = 'any') => `<div><label for="${id}">${l}</label><input id="${id}" type="number" step="${step}" inputmode="decimal" value="${v ?? ''}"></div>`;
  return `<h2>ריבית דריבית מול היעד</h2>${out}
    <div class="card"><div class="grid2">
      ${f('pB0', 'יתרה נוכחית B0 ($)', pj.B0)}${f('pP', 'הפקדה חודשית P ($)', pj.P)}
      ${f('pfd', 'דמי ניהול מהפקדה fd (%)', pctIn(pj.fd))}${f('pfa', 'דמי ניהול מצבירה fa (%/שנה)', pctIn(pj.fa))}
      ${f('r0', 'r שמרני (%/שנה)', rs[0] != null ? +(rs[0] * 100).toFixed(2) : '')}${f('r1', 'r בסיס (%/שנה)', rs[1] != null ? +(rs[1] * 100).toFixed(2) : '')}
      ${f('r2', 'r אופטימי (%/שנה)', rs[2] != null ? +(rs[2] * 100).toFixed(2) : '')}${f('pG', 'יעד G ($, אופציונלי)', pj.G)}
      ${f('pY', 'שנים ליעד', pj.years, 1)}
      <div><label for="pMode">גביית דמי צבירה חודשית</label><select id="pMode"><option value="equal"${st.mode !== 'continuous' ? ' selected' : ''}>fa/12 (שיעורים שווים)</option><option value="continuous"${st.mode === 'continuous' ? ' selected' : ''}>רציפה</option></select></div>
    </div><div class="btns"><button class="b" data-act="saveProj">חשב</button></div>
    <div class="note">נוסחה (סקירת היועץ §4): B<sub>t</sub> = [B<sub>t-1</sub> + P(1−fd)]·(1+r<sub>m</sub>)·(1−f<sub>m</sub>), r<sub>m</sub>=(1+r)<sup>1/12</sup>−1. הנחות r משמשות גם לחישובי עלות דמי ניהול ומזומן במסך ההתראות (תרחיש בסיס).</div></div>`;
}

function viewJournal(A) {
  const J = S.journal;
  return `<h2>יומן החלטות</h2>
    <div class="card"><label for="jAlert">המלצת האפליקציה</label><select id="jAlert"><option value="">— ללא —</option>${A.map(a => `<option value="${esc(a.id)}">${a.title.replace(/<[^>]+>/g, '')}</option>`).join('')}</select>
      <label for="jDec">ההחלטה שלך</label><select id="jDec"><option>עקבתי אחרי ההמלצה</option><option>לא עקבתי</option><option>חלקית</option><option>נבדק — ללא פעולה</option><option>החלטה עצמאית</option></select>
      <label for="jNote">נימוק (אופציונלי)</label><textarea id="jNote"></textarea>
      <div class="btns"><button class="b" data-act="addJournal">שמור ביומן</button></div></div>
    ${J.length ? J.slice().reverse().map(e => `<div class="card small"><div class="row"><b>${esc(e.date)}</b>${e.levelLabel ? `<span class="chip ${esc(e.level || '')}">${esc(e.levelLabel)}</span>` : ''}</div>
      <div>${esc(e.rec || 'ללא המלצה')}</div><div><b>החלטה:</b> ${esc(e.decision)}</div>${e.note ? `<div class="mut">${esc(e.note)}</div>` : ''}
      ${e.price ? `<div class="mut">מחיר ביום ההחלטה: ${usd(e.price, 2)} · מדד ייחוס VOO: ${usd(e.bench, 2)}</div>` : ''}</div>`).join('') : '<div class="card mut">היומן ריק.</div>'}
    <div class="card small"><b>קריאת תוצאות</b><div class="mut">אחרי כחצי שנה תוצג השוואה: כשעקבת, כשלא, ומול S&P 500, בחלונות 20/60/126/252 ימי מסחר. כרגע ${J.length} רשומות; מתחת ל-30 התראות המדדים תיאוריים בלבד.</div></div>`;
}

function viewMore() {
  const st = S.settings, rk = S.risk, pf = S.profile || {};
  const yn = v => v == null ? '<span class="chip miss">חסר</span>' : v ? 'כן' : 'לא';
  const ast = S.holdings.find(h => h.employer && h.symbol === 'ASTS');
  return `<h2>עליך</h2><div class="card small">
    <div>תושבות מס: ${pf.taxResidency === 'other' ? 'אחר' : pf.taxResidency === 'IL' ? 'ישראל' : '<span class="chip miss">חסר</span>'}</div>
    <div>בעל מניות מהותי: ${yn(pf.materialShareholder)}</div>
    <div>תוכנית עובדים AST SpaceMobile: ${yn(pf.employerPlan)}${pf.employerPlan && !ast ? ' · <span class="chip miss">כמות ASTS חסרה</span>' : ''}</div>
  </div>
  <h2>שאלון סיכון קצר</h2><div class="card">
    ${RISK_Q.map((q, k) => `<div class="q"><label for="q${k}">${q[0]}</label><select id="q${k}">${q[1].map((o, j) => `<option value="${j}"${rk?.answers?.[k] == j ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`).join('')}
    <div class="btns"><button class="b" data-act="saveRisk">שמור</button></div>
    ${rk ? `<div class="small">פרופיל: <b>${esc(rk.profile)}</b> (ציון ${rk.score}/15). <span class="mut">הניקוד הוא בחירה תפעולית, לא כלי מאומת — ${prop.replace(/<[^>]+>/g, '')}.</span></div>` : ''}</div>
  <h2>הגדרות מזומן וקרן חירום</h2><div class="card"><div class="grid2">
    <div><label for="sE">הוצאה חודשית חיונית E (₪)</label><input id="sE" type="number" value="${st.E_ils ?? ''}"></div>
    <div><label for="sM">חודשי חירום M (3–6)</label><input id="sM" type="number" min="1" max="12" value="${st.M ?? ''}"></div>
    <div><label for="sSince">עודף המזומן קיים מתאריך</label><input id="sSince" type="date" value="${st.cashSince ?? ''}"></div>
    <div><label for="sR">שיעור ייחוס (%; ריק = ריבית בנק ישראל 3.25%)</label><input id="sR" type="number" step="any" value="${st.rRef != null ? st.rRef * 100 : ''}"></div>
  </div><div class="btns"><button class="b" data-act="saveSettings">שמור</button></div></div>
  <h2>ייבוא CSV</h2><div class="card small">
    <div class="mut">הקובץ נקרא במכשיר בלבד. עמודות: <code class="wrap" dir="ltr">kind, symbol, name, qty, balance, currency, er, feeDeposit, feeAccum, monthlyDeposit, sector, employer, thesis</code>. אחוזים כשבר עשרוני (0.01 = 1%).</div>
    <label for="csvFile">קובץ</label><input id="csvFile" type="file" accept=".csv,text/csv">
    <label for="csvText">או הדבקה</label><textarea id="csvText" dir="ltr">${esc(CSV_TEMPLATE)}</textarea>
    <div class="btns"><button class="b" data-act="importCsv">החלף את התיק בייבוא</button><button class="b sec" data-act="appendCsv">הוסף לתיק</button></div></div>
  <h2>ספים בשימוש</h2><div class="card"><table><tr><th>סף</th><th>ערך</th><th>מקור</th></tr>
    ${Object.values(TH).map(t => `<tr><td>${esc(t.label)}</td><td class="ltr">${Math.abs(t.value) < 1 ? pct(t.value, 0) : t.value}</td><td>${esc(t.src)} ${t.proposal ? prop : t.operational ? '<span class="chip">בחירה תפעולית</span>' : ''}</td></tr>`).join('')}</table></div>
  <h2>פרטיות וגיבוי</h2><div class="card small">
    <ul><li>כל הנתונים נשמרים רק בדפדפן במכשיר הזה. אין שרת, אין חשבון, אין סיסמאות.</li><li>אין חיבור לחשבונות מסחר. האפליקציה רק מנתחת וממליצה.</li><li>קובץ האותות מכיל רשימת סמלים רחבה בלבד; ההצלבה מול הכמויות נעשית כאן.</li></ul>
    <div class="btns"><button class="b sec" data-act="export">ייצוא גיבוי (JSON)</button><button class="b sec" data-act="loadDemo">טען נתוני הדגמה</button><button class="b danger" data-act="restartOnboarding">התחל אונבורדינג מחדש</button></div></div>`;
}

function holdingForm(h) {
  h = h || { id: 'h' + Date.now(), kind: 'stock', currency: 'USD' };
  const f = (k, l, t = 'text', v = h[k]) => `<div><label for="f_${k}">${l}</label><input id="f_${k}" type="${t}" ${t === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(v ?? '')}"></div>`;
  return `<h2>${S.holdings.some(x => x.id === h.id) ? 'עריכת אחזקה' : 'אחזקה חדשה'}</h2>
    <input type="hidden" id="f_id" value="${esc(h.id)}">
    <label for="f_kind">סוג</label><select id="f_kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}"${h.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <div class="grid2">${f('symbol', 'סמל')}${f('name', 'שם')}${f('qty', 'כמות (מניה/קרן סל/קריפטו)', 'number')}${f('balance', 'יתרה (פנסיה/השתלמות/מזומן)', 'number')}
    <div><label for="f_currency">מטבע</label><select id="f_currency"><option${h.currency === 'USD' ? ' selected' : ''}>USD</option><option${h.currency === 'ILS' ? ' selected' : ''}>ILS</option></select></div>
    ${f('sector', 'ענף')}${f('er', 'יחס הוצאות (0.0003 = 0.03%)', 'number')}${f('feeDeposit', 'דמי ניהול מהפקדה (שבר)', 'number')}${f('feeAccum', 'דמי ניהול מצבירה (שבר)', 'number')}${f('monthlyDeposit', 'הפקדה חודשית', 'number')}</div>
    <label><input type="checkbox" id="f_employer" ${h.employer ? 'checked' : ''}> מניית המעסיק שלי (ריכוזיות כפולה, בלי הצעת פעולה)</label>
    <label for="f_thesis">תזת השקעה — למה אני מחזיק?</label><textarea id="f_thesis">${esc(h.thesis || '')}</textarea>
    <label for="f_exit">מה יגרום לי לצאת?</label><textarea id="f_exit">${esc(h.exit || '')}</textarea>
    <div class="mut small">שדה ריק = חסר (לא אפס).</div>
    <div class="btns"><button class="b" data-act="saveHolding">שמור</button><button class="b sec" data-act="closeSheet">ביטול</button>${S.holdings.some(x => x.id === h.id) ? '<button class="b danger" data-act="delHolding">מחיקה</button>' : ''}</div>`;
}

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [hdr, ...data] = rows.filter(r => r.some(c => c.trim()));
  const keys = hdr.map(h => h.trim());
  const numK = ['qty', 'balance', 'er', 'feeDeposit', 'feeAccum', 'monthlyDeposit'];
  const errs = [];
  const out = data.map((r, n) => {
    const o = { id: 'h' + Date.now() + '_' + n };
    keys.forEach((k, j) => { const v = (r[j] ?? '').trim(); if (v === '') return; o[k] = numK.includes(k) ? Number(v) : k === 'employer' ? /^(1|true|yes|כן)$/i.test(v) : v; });
    if (!KIND[o.kind]) errs.push(`שורה ${n + 2}: סוג לא מוכר "${o.kind}"`);
    for (const k of numK) if (o[k] != null && !Number.isFinite(o[k])) errs.push(`שורה ${n + 2}: ${k} לא מספר`);
    if (o.symbol) o.symbol = o.symbol.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    o.currency = o.currency === 'ILS' ? 'ILS' : 'USD';
    return o;
  });
  return { out, errs };
}

// ---------- רינדור ----------
function render() {
  document.body.classList.toggle('is-onboard', mode(S) !== 'app');
  if (mode(S) === 'gate') { $('#view').innerHTML = renderGate(); return; }
  if (mode(S) === 'onboard') { $('#view').innerHTML = renderOnboard(S); return; }
  const V = valuate(); const A = buildAlerts(V);
  const n = A.filter(a => a.level === 'red' || a.level === 'yellow' || a.level === 'orange').length;
  $('#badge').hidden = !n; $('#badge').textContent = n;
  $('#simBanner').hidden = !(S.simulated || SIG.simulated);
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const v = { portfolio: () => viewPortfolio(V, A), alerts: () => viewAlerts(V, A), screen: () => viewScreen(V), projection: () => viewProjection(V), journal: () => viewJournal(A), more: viewMore }[tab] || (() => viewPortfolio(V, A));
  $('#view').innerHTML = v();
  document.querySelectorAll('[data-w]').forEach(e => e.classList.add('w' + Math.max(0, Math.min(100, Math.round(+e.dataset.w)))));
  const colorClass = { '#94a3b8': 'c0', '#38bdf8': 'c1', '#34d399': 'c2' };
  document.querySelectorAll('[data-c]').forEach(e => { const c = colorClass[e.dataset.c]; if (c) e.classList.add(c); });
  render.V = V; render.A = A;
}
const go = t => { tab = t; location.hash = t; render(); window.scrollTo(0, 0); };
const openSheet = html => { $('#sheetBody').innerHTML = html; $('#sheet').hidden = false; };
const closeSheet = () => { $('#sheet').hidden = true; };
const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const numOrNull = id => { const v = val(id); return v === '' ? null : Number(v); };

function journalEntry(a, decision, note) {
  const V = render.V, s = a?.symbol ? V.items.find(i => i.symbol === a.symbol)?.sig : null;
  const voo = SIG.symbols.find(x => x.symbol === 'VOO');
  S.journal.push({ date: today(), rec: a ? a.title.replace(/<[^>]+>/g, '') : '', level: a?.level, levelLabel: a ? { red: 'אדום', yellow: 'צהוב', orange: 'התראה', info: 'מידע', missing: 'חסר' }[a.level] : '',
    symbol: a?.symbol, decision, note, price: s?.lastClose, bench: voo?.lastClose, signalsAsOf: SIG.technicalAsOf });
  save();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-hold]'); if (!t) return;
  if (t.dataset.ob) { await onOb(t); return; }
  if (t.dataset.tab) return go(t.dataset.tab);
  if (t.id === 'moreBtn') return go('more');
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.hold) return openSheet(holdingForm(S.holdings.find(h => h.id === t.dataset.hold)));
  if (t.dataset.reloc) { ui.openReloc[t.dataset.reloc] = !ui.openReloc[t.dataset.reloc]; render(); document.getElementById('al-' + t.dataset.reloc)?.scrollIntoView({ block: 'start' }); return; }
  if (t.dataset.reviewed) { const a = render.A.find(a => a.symbol === t.dataset.reviewed && a.reloc); S.reviewed[t.dataset.reviewed] = SIG.technicalAsOf; journalEntry(a, 'נבדק — ללא פעולה', ''); toast('סומן נבדק ונרשם ביומן'); return render(); }
  if (t.dataset.journal) { tab = 'journal'; location.hash = 'journal'; render(); $('#jAlert').value = t.dataset.journal; return; }
  const act = t.dataset.act; if (!act) return;
  const A = {
    addHolding: () => openSheet(holdingForm()),
    closeSheet,
    saveHolding: () => {
      const prev = S.holdings.find(x => x.id === val('f_id')) || {};
      const h = { ...prev, id: val('f_id'), kind: val('f_kind'), symbol: val('f_symbol').toUpperCase().replace(/[^A-Z0-9.\-]/g, '') || undefined, name: val('f_name'), currency: val('f_currency'),
        qty: numOrNull('f_qty'), balance: numOrNull('f_balance'), sector: val('f_sector') || undefined, er: numOrNull('f_er'), feeDeposit: numOrNull('f_feeDeposit'), feeAccum: numOrNull('f_feeAccum'),
        monthlyDeposit: numOrNull('f_monthlyDeposit'), employer: document.getElementById('f_employer').checked, thesis: val('f_thesis') || undefined, exit: val('f_exit') || undefined };
      const k = S.holdings.findIndex(x => x.id === h.id); if (k >= 0) S.holdings[k] = h; else S.holdings.push(h);
      S.simulated = false; save(); closeSheet(); render(); toast('נשמר במכשיר');
    },
    delHolding: () => { if (!confirm('למחוק את האחזקה מהמכשיר?')) return; S.holdings = S.holdings.filter(x => x.id !== val('f_id')); save(); closeSheet(); render(); },
    saveProj: () => {
      S.proj = { B0: numOrNull('pB0') ?? 0, P: numOrNull('pP') ?? 0, fd: (numOrNull('pfd') ?? 0) / 100, fa: (numOrNull('pfa') ?? 0) / 100, G: numOrNull('pG'), years: numOrNull('pY') || 20 };
      S.settings.rScen = ['r0', 'r1', 'r2'].map(id => { const v = numOrNull(id); return v == null ? null : v / 100; });
      S.settings.mode = val('pMode'); save(); render();
    },
    addJournal: () => { const a = render.A.find(x => x.id === val('jAlert')); journalEntry(a, val('jDec'), val('jNote')); render(); toast('נרשם ביומן'); },
    saveRisk: () => { const answers = [0, 1, 2, 3, 4].map(k => +val('q' + k)); const score = answers.reduce((s, x) => s + x, 0);
      S.risk = { answers, score, profile: score <= 5 ? 'שמרני' : score <= 10 ? 'מאוזן' : 'צמיחה', date: new Date().toISOString().slice(0, 10) }; save(); render(); toast('השאלון נשמר'); },
    saveSettings: () => { S.settings.E_ils = numOrNull('sE'); S.settings.M = numOrNull('sM'); S.settings.cashSince = val('sSince') || null; const r = numOrNull('sR'); S.settings.rRef = r == null ? null : r / 100; save(); render(); toast('נשמר'); },
    importCsv: () => doImport(true), appendCsv: () => doImport(false),
    export: () => { const b = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'portfolio-backup.json'; a.click(); },
    loadDemo: () => { if (!confirm('לטעון נתוני הדגמה? הנתונים השמורים במכשיר יוחלפו.')) return; S = clone(SAMPLE_PORTFOLIO); S.demoChoice = 'keep'; S.onboarded = true; S.onboarding = { active: false }; save(); go('portfolio'); },
    restartOnboarding: () => { if (!confirm('להתחיל אונבורדינג מחדש? הנתונים השמורים במכשיר יימחקו.')) return; S = emptyPortfolio(); save(); render(); },
  };
  A[act]?.();
});
async function doImport(replace) {
  const file = document.getElementById('csvFile').files[0];
  const text = file ? await file.text() : val('csvText');
  try {
    const { out, errs } = parseCsv(text);
    if (errs.length) return alert('שגיאות בקובץ:\n' + errs.join('\n'));
    S.holdings = replace ? out : S.holdings.concat(out); S.simulated = false; save(); go('portfolio'); toast(`יובאו ${out.length} שורות`);
  } catch (err) { alert('לא ניתן לקרוא את הקובץ: ' + err.message); }
}
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('change', e => { if (e.target.id === 'testAmt') { ui.testAmount = Number(e.target.value) || 0; render(); } });
function obRead() {
  const el = document.getElementById('obIn');
  const text = el ? String(el.value).trim() : '';
  return { text, num: text === '' ? null : Number(text), sel: document.getElementById('obSel')?.value || 'IL' };
}
async function onOb(t) {
  if (t.dataset.ob === 'importCsv') {
    try {
      const file = document.getElementById('obCsvFile')?.files?.[0];
      const text = file ? await file.text() : (document.getElementById('obCsv')?.value || '');
      const { out, errs } = parseCsv(text);
      if (errs.length || !out.length) { S.onboarding.err = errs.length ? errs.join('\n') : 'אין שורות לייבוא'; save(); render(); return; }
      acceptImport(S, out); save(); render(); toast(`יובאו ${out.length} שורות`);
    } catch (err) { S.onboarding.err = 'לא ניתן לקרוא את הקובץ'; save(); render(); }
    return;
  }
  const res = onboardAct(S, t.dataset.ob, t.dataset.val, obRead());
  if (res === 'empty') { S = emptyPortfolio(); save(); render(); return; }
  if (res === 'app') { save(); tab = 'portfolio'; if (location.hash !== '#portfolio') location.hash = 'portfolio'; render(); return; }
  save(); render();
}
window.addEventListener('hashchange', () => { if (mode(S) !== 'app') return; const h = location.hash.slice(1); if (h && h !== tab) { tab = h; render(); } });

(async function init() {
  try { SIG = await (await fetch('data/signals.json', { cache: 'no-cache' })).json(); }
  catch { $('#view').innerHTML = '<div class="card alert missing">לא ניתן לטעון את קובץ האותות. הנתונים חסרים — לא הומצאו.</div>'; return; }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
