// לוגיקת ניתוח — מקור: סקירת היועץ הפיננסי, 9 בנובמבר 2026 (portfolio-app-logic-review.md)
// מודול טהור (ללא DOM), משמש גם את האפליקציה וגם את סורק ה-stub ב-Node.
// כל סף שאין לו מקור מחקרי מסומן proposal:true => "הצעה לאימות".

export const THRESHOLDS = {
  ddFirst:        { value: -0.30, proposal: true,  label: 'ירידה מהשיא, סף ראשון', src: 'סקירת היועץ §1.2' },
  ddSecond:       { value: -0.50, proposal: true,  label: 'ירידה מהשיא, סף שני', src: 'סקירת היועץ §1.2' },
  eventWindowDays:{ value: 90,    proposal: true,  label: 'חלון אירועים יסודיים (ימים)', src: 'סקירת היועץ §1.3' },
  dilution:       { value: 0.10,  proposal: true,  label: 'דילול שנתי', src: 'סקירת היועץ §1.3' },
  idleDays:       { value: 30,    proposal: true,  label: 'עודף מזומן — ימים עד התראה', src: 'סקירת היועץ §2.1' },
  valueChange:    { value: 0.03,  proposal: false, operational: true, label: 'שינוי שווי תיק', src: 'בחירה תפעולית שלך (לא ממצא מחקרי)' },
  concSingle:     { value: 0.10,  proposal: true,  label: 'ריכוזיות אחזקה בודדת', src: 'הצעה תפעולית של המומחה הטכנולוגי; אין סף מהיועץ' },
  concSector:     { value: 0.30,  proposal: true,  label: 'ריכוזיות ענף', src: 'הצעה תפעולית של המומחה הטכנולוגי; אין סף מהיועץ' },
};

export const ANCHORS = {
  pensionCap:      { deposit: 0.06, accum: 0.005, src: 'תקנות הפיקוח על שירותים פיננסיים (קופות גמל) (דמי ניהול), התשע״ב–2012, תקנה 3(א)' },
  pensionSelected: { deposit: 0.01, accum: 0.0022, src: 'מרכז המחקר והמידע של הכנסת, 14.8.2024 (תעריף קרנות נבחרות; לאמת מול פנסיה-נט)' },
  studyFundCap:    { accum: 0.02, src: 'תקנות דמי ניהול, תקנה 4 (קרן השתלמות, מהצבירה בלבד)' },
  iciEquityIndexEtf: { value: 0.0014, src: 'ICI, Trends in the Expenses and Fees of Funds, 2025 (מרץ 2026) — ממוצע משוקלל קרנות סל מנייתיות מחקות' },
  boiRate:         { value: 0.0325, date: '2026-10-21', src: 'בנק ישראל, החלטת ריבית 21.10.2026 (שיעור מדיניות, לא תשואה מובטחת)' },
};

export const TAX_NOTE = 'תזכורת מס רווח הון ריאלי בישראל (פקודת מס הכנסה, סעיף 91(ב)(1)–(2)): יחיד — עד 25%; בעל מניות מהותי (10% או יותר מאמצעי שליטה) — עד 30%. אין אומדן מס כי אין מחירי קנייה.';

// ---------- טכני ----------
const mk = d => d.slice(0, 7);

// אינדקס סוף החודש האחרון שהושלם (יום המסחר האחרון של חודש קלנדרי)
export function monthEndIndices(dates) {
  const out = [];
  for (let i = 0; i < dates.length - 1; i++) if (mk(dates[i]) !== mk(dates[i + 1])) out.push(i);
  return out; // היום האחרון בסדרה לא נחשב סוף חודש אלא אם החודש הבא כבר התחיל
}

// T2, T3, DD ו-R(12-1) לפי סוף החודש האחרון (בדיקה חודשית, לא יומית)
export function technicalsAtMonthEnd(dates, closes) {
  const me = monthEndIndices(dates);
  if (!me.length) return { missing: 'אין סוף חודש בסדרה' };
  const t = me[me.length - 1];
  const res = { asOf: dates[t], close: closes[t] };
  if (t - 252 < 0) { res.missing = 'פחות מ-252 ימי מסחר — חסר נתון'; return res; }
  res.r12_1 = closes[t - 21] / closes[t - 252] - 1;            // Jegadeesh & Titman 1993
  res.r12 = closes[t] / closes[t - 252] - 1;                     // Moskowitz, Ooi & Pedersen 2012
  const last10 = me.slice(-10);
  if (last10.length < 10) res.missingSma = true;
  else {
    res.sma10m = last10.reduce((s, i) => s + closes[i], 0) / 10;  // Faber 2007
    res.t3 = closes[t] < res.sma10m;
  }
  let peak = -Infinity;
  for (let j = 0; j <= 251; j++) peak = Math.max(peak, closes[t - j]);
  res.peak252 = peak;
  res.dd = closes[t] / peak - 1;
  res.t2 = res.r12 < 0;
  return res;
}

// T1: דירוג צולב מול כל הרשימה — עשירון 1 = החלש ביותר
export function assignDeciles(rows) {
  const valid = rows.filter(r => Number.isFinite(r.r12_1)).sort((a, b) => a.r12_1 - b.r12_1);
  valid.forEach((r, i) => { r.decile = Math.floor(i * 10 / valid.length) + 1; r.t1 = r.decile === 1; });
  return rows;
}

const EVENT_LABELS = {
  earnings_miss: 'החטאת תחזית רווח / הפתעה שלילית (8-K 2.02)',
  going_concern: 'ספקות בדבר המשך פעילות (going concern)',
  auditor_change: 'החלפת רואה חשבון (8-K 4.01)',
  non_reliance: 'אי-הסתמכות על דוחות שפורסמו (8-K 4.02)',
  dilution: 'דילול מהיר (>10% בשנה — הצעה לאימות)',
  exec_departure: 'עזיבת מנכ״ל/סמנכ״ל כספים (8-K 5.02)',
  investigation: 'חקירת SEC / משרד המשפטים',
  short_report: 'דוח שורט (ראיה ראשונית, חלשה)',
};
export const eventLabel = t => EVENT_LABELS[t] || t;

export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

// צירוף לרמות — סקירת היועץ §1.4
export function classifyDowntrend(sig, today) {
  const win = THRESHOLDS.eventWindowDays.value;
  const tech = !!(sig.t1 || sig.t2 || sig.t3 || (sig.dd <= THRESHOLDS.ddFirst.value));
  const techStrong = !!(sig.t1 || sig.t2 || sig.t3 || (sig.dd <= THRESHOLDS.ddSecond.value));
  const events = (sig.events || []).filter(e => { const d = daysBetween(e.date, today); return d >= 0 && d <= win; });
  const severe = events.some(e => e.type === 'going_concern' || e.type === 'non_reliance');
  let level = null;
  if ((techStrong && events.length) || severe) level = 'red';
  else if (tech && !events.length) level = 'yellow';
  // פער בכלל היועץ: Tech (DD בין -30% ל-50% בלבד) + Event בלי TechStrong — לא צהוב ולא אדום. מסומן "ראשוני" ושאלה פתוחה.
  const gap = !level && tech && events.length > 0 && !techStrong;
  const fired = [];
  if (sig.t1) fired.push({ k: 'T1', txt: `מומנטום 12-1 בעשירון התחתון (עשירון ${sig.decile}; R=${pct(sig.r12_1)})`, src: 'Jegadeesh & Titman, Journal of Finance, מרץ 1993' });
  if (sig.t2) fired.push({ k: 'T2', txt: `תשואת 12 חודשים שלילית (R12=${pct(sig.r12)})`, src: 'Moskowitz, Ooi & Pedersen, JFE 2012 — הכללה למניה בודדת' });
  if (sig.t3) fired.push({ k: 'T3', txt: `מחיר סוף חודש ${num(sig.close)} מתחת לממוצע 10 חודשים ${num(sig.sma10m)}`, src: 'Faber, Journal of Wealth Management, 2007 — הכללה למניה בודדת' });
  if (sig.dd <= THRESHOLDS.ddFirst.value) fired.push({ k: 'DD', txt: `ירידה מהשיא ב־252 ימים: ${pct(sig.dd)} (סף ${pct(sig.dd <= THRESHOLDS.ddSecond.value ? THRESHOLDS.ddSecond.value : THRESHOLDS.ddFirst.value)} — הצעה לאימות)`, src: 'סקירת היועץ §1.2; ירידה מהשיא לבדה אינה הצדקה למכירה' });
  return { level, tech, techStrong, events, severe, fired, gap };
}

// ---------- ריכוזיות ----------
export function concentration(items, total) {
  const bySym = items.filter(i => i.kind === 'stock' || i.kind === 'etf' || i.kind === 'crypto')
    .map(i => ({ ...i, w: i.usd / total })).sort((a, b) => b.w - a.w);
  const sectors = {};
  for (const i of items) if (i.sector) sectors[i.sector] = (sectors[i.sector] || 0) + i.usd;
  const sec = Object.entries(sectors).map(([s, v]) => ({ s, w: v / total })).sort((a, b) => b.w - a.w);
  return { bySym, sec };
}

// ---------- מזומן שלא עובד — §2 ----------
export function idleCash({ cashUsd, E_usd, M, sinceDate, today, rRef }) {
  if (!E_usd || !M) return { missing: true };
  const target = E_usd * M;
  const excess = Math.max(0, cashUsd - target);
  const days = sinceDate ? daysBetween(sinceDate, today) : null;
  const over = days == null ? null : days - THRESHOLDS.idleDays.value;
  const fire = excess > 0 && days != null && days >= THRESHOLDS.idleDays.value;
  const cost = fire ? excess * rRef * Math.max(0, over) / 365 : 0;
  return { target, excess, days, fire, cost };
}

// ---------- תחזית — §4 ----------
export function monthlyRates(r, fa, mode = 'equal') {
  const rm = Math.pow(1 + r, 1 / 12) - 1;
  const fm = mode === 'continuous' ? 1 - Math.pow(1 - fa, 1 / 12) : fa / 12;
  return { rm, fm };
}
export function projectSeries({ B0, P, fd, fa, r, years, mode }) {
  const { rm, fm } = monthlyRates(r, fa, mode);
  const out = [B0]; let B = B0;
  for (let t = 1; t <= years * 12; t++) { B = (B + P * (1 - fd)) * (1 + rm) * (1 - fm); out.push(B); }
  return out;
}
// שאלה פתוחה ליועץ: הנוסחה הסגורה ב-§4.1/§4.2 היא קצבה רגילה (הפקדה בסוף חודש), בעוד הרקורסיה ב-§4.1
// מכניסה הפקדה בתחילת חודש. ההפרש הוא פקטור (1+g) על רכיב ההפקדות (~0.3% ב-20 שנה ב-6%). מיושם כפי שנכתב, עד הכרעה.
export function requiredDeposit({ G, B0, fd, fa, r, years, mode }) {
  const { rm, fm } = monthlyRates(r, fa, mode);
  const g = (1 + rm) * (1 - fm) - 1, N = years * 12, grow = Math.pow(1 + g, N);
  if (G <= B0 * grow) return { zero: true, P: 0 };
  const Pn = g === 0 ? (G - B0) / N : (G - B0 * grow) * g / (grow - 1);
  return { zero: false, P: Pn / (1 - fd) };
}
export const idleCostYears = (C, r, n) => C * (Math.pow(1 + r, n) - 1); // §4.3

// ---------- עזרי תצוגה ----------
export function pct(x, d = 1) { return Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—'; }
export function num(x, d = 2) { return Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'; }
