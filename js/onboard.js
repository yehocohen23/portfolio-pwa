// אונבורדינג: שאלה אחת במסך, העדפה ללחיצה. הכל נשמר רק במכשיר.
import { RETURN_ASSUMPTIONS, suggestedRiskForYears } from './logic.js';
import { LISTINGS, CRYPTO } from './listings.js';

export const RISK_Q = [
  ['אם התיק ירד 20% בחודש, מה היית עושה?', ['מוכר הכל', 'מוכר חלק', 'לא עושה כלום', 'קונה עוד']],
  ['מתי תצטרך את רוב הכסף?', ['פחות משנתיים', '2–5 שנים', '5–10 שנים', 'מעל 10 שנים']],
  ['כמה ניסיון יש לך בהשקעות?', ['אין', 'מעט', 'בינוני', 'רב']],
  ['איזה תיק היית מעדיף לשנה?', ['−5% עד +7%', '−12% עד +18%', '−25% עד +35%', '−45% עד +70%']],
  ['כמה חודשי הוצאות יש לך בצד?', ['פחות מחודש', '1–3', '3–6', 'מעל 6']],
];

export const GOAL_TYPES = [
  ['home', 'דירה'], ['trip', 'טיול'], ['retire', 'פרישה מוקדמת'],
  ['freedom', 'חופש כלכלי'], ['kids', 'ביטחון לילדים'], ['other', 'אחר'],
];
const PROVIDERS = ['מגדל', 'הראל', 'כלל', 'מנורה', 'הפניקס', 'אלטשולר שחם', 'מיטב', 'מור', 'ילין לפידות', 'אנליסט', 'אחר'];
const TRACKS = ['כללי', 'מניות', 'S&P 500', 'מחקה מדד', 'אג״ח', 'לפי גיל', 'הלכה', 'אחר'];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const goalLabel = key => GOAL_TYPES.find(g => g[0] === key)?.[1] || key;

export function emptyPortfolio() {
  return {
    simulated: false,
    onboarded: false,
    onboarding: { active: true, step: 'intro', hist: [] },
    holdings: [],
    goals: [],
    settings: { E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' },
    proj: { B0: null, P: null, fd: null, fa: null, years: null, G: null, horizonYear: null },
    journal: [],
    reviewed: {},
    risk: null,
    profile: { taxResidency: 'IL' },
  };
}

const DEAD_STEPS = new Set(['material', 'employer', 'astsQty', 'goal', 'horizon', 'r0', 'r1', 'r2', 'E', 'M', 'cashSince', 'cashMore', 'hKind', 'hEr', 'hSector', 'hWhy', 'hExit', 'cWhy', 'cExit', 'penFd', 'penFa', 'penP', 'stuFd', 'stuFa', 'stuP']);

export function migratePortfolio(s) {
  if (!s || typeof s !== 'object') return s;
  s.holdings = Array.isArray(s.holdings) ? s.holdings : [];
  s.journal = Array.isArray(s.journal) ? s.journal : [];
  s.reviewed = s.reviewed || {};
  s.profile = s.profile || {};
  s.settings = Object.assign({ E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' }, s.settings || {});
  if (!Array.isArray(s.settings.rScen) || s.settings.rScen.length !== 3) s.settings.rScen = [null, null, null];
  if (!Array.isArray(s.goals)) s.goals = [];
  if (!s.goals.length && s.proj && (s.proj.G != null || s.proj.horizonYear != null)) {
    s.goals = [{ id: 'g-legacy', key: 'other', label: 'יעד קודם', amount: s.proj.G ?? null, currency: 'USD', year: s.proj.horizonYear ?? null }];
  }
  if (s.onboarding?.active && !s.onboarded && DEAD_STEPS.has(s.onboarding.step)) {
    s.onboarding.step = 'intro';
    s.onboarding.hist = [];
  }
  return s;
}

export function mode(S) {
  if (S.onboarding?.active && !S.onboarded) return 'onboard';
  if (S.simulated && !S.demoChoice) return 'gate';
  return 'app';
}

function plan(S) {
  const o = S.onboarding || {};
  const ids = ['intro', 'tax', 'goals'];
  (o.goalKeys || []).forEach((_, i) => ids.push('gAmt' + i, 'gCur' + i, 'gYear' + i));
  ids.push('returns');
  if (o.editingReturns) ids.push('rEdit');
  ids.push('q0', 'q1', 'q2', 'q3', 'q4', 'cashAmt', 'cashCcy', 'holdMenu');
  if (o.draft?.phase === 'sec') ids.push('hSym', 'hQty');
  else if (o.draft?.phase === 'crypto') ids.push('cSym', 'cQty');
  else if (o.draft?.phase === 'csv') ids.push('csv');
  ids.push('penAsk');
  if (o.pen === 'yes') {
    ids.push('penProvider');
    if (o.fund?.provider === 'אחר') ids.push('penProviderText');
    ids.push('penTrack');
    if (o.fund?.track === 'אחר') ids.push('penTrackText');
    ids.push('penBal', 'penMore');
  }
  ids.push('stuAsk');
  if (o.stu === 'yes') {
    ids.push('stuProvider');
    if (o.fund?.provider === 'אחר') ids.push('stuProviderText');
    ids.push('stuTrack');
    if (o.fund?.track === 'אחר') ids.push('stuTrackText');
    ids.push('stuBal', 'stuMore');
  }
  ids.push('done');
  return ids;
}

function shell(S, step, { title, note, field, choices, next, skip = true }) {
  const ids = plan(S);
  const at = ids.indexOf(step);
  const i = at < 0 ? 0 : at;
  const pct = ids.length <= 1 ? 0 : Math.round(i / (ids.length - 1) * 100);
  const o = S.onboarding;
  const back = (o.hist || []).length ? '<button type="button" class="b sec" data-ob="back">חזרה</button>' : '';
  const skipBtn = skip ? '<button type="button" class="b sec" data-ob="skip">דלג</button>' : '';
  const nextBtn = next ? `<button type="button" class="b" data-ob="${next.act || 'next'}">${next.label}</button>` : '';
  return `<section class="ob" id="ob" data-step="${esc(step)}">
    <div class="ob-meta">שאלה ${i + 1} מתוך ${ids.length}</div>
    <div class="ob-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span class="w${pct}"></span></div>
    <h2 id="obQ">${title}</h2>
    ${choices || ''}
    ${note ? `<div class="ob-note">${note}</div>` : ''}
    ${field || ''}
    <div class="ob-err" id="obErr">${esc(o.err || '')}</div>
    <div class="ob-actions">${back}${skipBtn}${nextBtn}</div>
  </section>`;
}

function chips(list, current, act = 'pick') {
  const many = Array.isArray(current);
  const set = many ? new Set(current) : null;
  return `<div class="ob-chips">${list.map(([val, label]) => {
    const on = many ? set.has(val) : current === val;
    return `<button type="button" class="ob-choice${on ? ' on' : ''}" data-ob="${act}" data-val="${esc(val)}">${esc(label)}</button>`;
  }).join('')}</div>`;
}
function numField(value) {
  return `<input id="obIn" aria-labelledby="obQ" type="number" step="any" inputmode="decimal" dir="ltr" autocomplete="off" value="${esc(value ?? '')}">`;
}
function textField(value, id = 'obIn') {
  return `<input id="${id}" aria-labelledby="obQ" type="text" dir="ltr" autocomplete="off" value="${esc(value ?? '')}">`;
}

export function suggestHtml(query, crypto) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return '';
  const list = crypto ? CRYPTO : LISTINGS;
  const hits = list.filter(r => r.s.startsWith(q) || r.n.toUpperCase().includes(q)).slice(0, 8);
  if (!hits.length) return '<div class="mut">אין הצעה ברשימה המקומית. אפשר להמשיך עם הסמל שהוקלד.</div>';
  return chips(hits.map(r => [r.s, '\u2066' + r.s + ' · ' + r.n + '\u2069']), '', 'pickSym');
}

function lookup(symbol, crypto) {
  const s = symbol.toUpperCase();
  return (crypto ? CRYPTO : LISTINGS).find(r => r.s === s) || null;
}
function nid(S) { S.onboarding.seq = (S.onboarding.seq || 0) + 1; return 'h' + S.onboarding.seq; }
function upsert(S, h) {
  const i = S.holdings.findIndex(x => x.id === h.id);
  if (i >= 0) S.holdings[i] = { ...S.holdings[i], ...h }; else S.holdings.push(h);
}
function dropPrefix(S, pre) { S.holdings = S.holdings.filter(h => !String(h.id).startsWith(pre)); }
function go(S, id) {
  const o = S.onboarding;
  o.err = '';
  o.hist = o.hist || [];
  if (o.step && o.step !== id) o.hist.push(o.step);
  o.step = id;
  return 'stay';
}
function back(S) {
  const o = S.onboarding;
  o.err = '';
  const prev = (o.hist || []).pop();
  if (prev) o.step = prev;
  return 'stay';
}
function fail(S, msg) { S.onboarding.err = msg; return 'stay'; }
function parsed(read) {
  if (!read.text) return { blank: true };
  if (!Number.isFinite(read.num)) return { bad: true };
  return { n: read.num };
}
function years() {
  const y = new Date().getFullYear();
  return Array.from({ length: 20 }, (_, i) => [String(y + 1 + i), String(y + 1 + i)]);
}
function goalAt(S, i) {
  const key = (S.onboarding.goalKeys || [])[i];
  if (!key) return null;
  if (!Array.isArray(S.goals)) S.goals = [];
  let g = S.goals.find(x => x.key === key && String(x.id).startsWith('g-ob-'));
  if (!g) { g = { id: 'g-ob-' + key, key, label: goalLabel(key) }; S.goals.push(g); }
  return g;
}
function goalIndex(step) {
  const m = /^g(?:Amt|Cur|Year)(\d+)$/.exec(step);
  return m ? +m[1] : null;
}
function afterGoal(S, i) {
  const n = (S.onboarding.goalKeys || []).length;
  return i + 1 < n ? 'gAmt' + (i + 1) : 'returns';
}
function fundName(kind, provider, track) {
  const base = kind === 'study' ? 'קרן השתלמות' : 'קרן פנסיה';
  if (provider && track && provider !== 'אחר' && track !== 'אחר') return provider + ' — ' + track;
  if (provider && provider !== 'אחר') return provider;
  if (track && track !== 'אחר') return base + ' — ' + track;
  return base;
}
function writeFund(S, kind) {
  const d = S.onboarding.fund || {};
  const id = (kind === 'study' ? 'ob-stu-' : 'ob-pen-') + (kind === 'study' ? (S.onboarding.stuI || 0) : (S.onboarding.penI || 0));
  const prev = S.holdings.find(h => h.id === id) || {};
  const provider = d.provider === 'אחר' ? (d.providerText || '') : d.provider;
  const track = d.track === 'אחר' ? (d.trackText || '') : d.track;
  upsert(S, {
    ...prev, id, kind, currency: 'ILS',
    name: fundName(kind, provider, track),
    provider: provider || undefined,
    track: track || undefined,
    balance: d.balance == null ? prev.balance : d.balance,
  });
}

export function renderGate() {
  return `<section class="ob" id="ob" data-step="gate">
    <div class="ob-meta">נתונים שנשמרו במכשיר</div>
    <h2 id="obQ">במכשיר שמורים נתוני הדגמה</h2>
    <div class="ob-note">אלה לא הנתונים שלך. אפשר להתחיל מחדש עם תמונה ריקה, או להמשיך עם ההדגמה.</div>
    <button type="button" class="ob-choice" data-ob="fresh">התחל מחדש</button>
    <button type="button" class="ob-choice" data-ob="keepDemo">המשך עם ההדגמה</button>
  </section>`;
}

export function renderOnboard(S) {
  const step = S.onboarding?.step || 'intro';
  const o = S.onboarding;
  if (step === 'intro') return shell(S, step, {
    title: 'נבנה את התמונה שלך',
    note: 'רוב התשובות בלחיצה. אפשר לדלג על כל שאלה ולחזור אחורה. מה שלא יוזן יישאר חסר. אין צורך בשם, והכל נשמר רק במכשיר.',
    next: { label: 'מתחילים' }, skip: false,
  });
  if (step === 'tax') return shell(S, step, {
    title: 'מה תושבות המס שלך?',
    note: 'ברירת המחדל: ישראל. דלג שומר את ישראל.',
    choices: chips([['IL', 'ישראל'], ['other', 'אחר']], S.profile.taxResidency === 'other' ? 'other' : 'IL'),
    next: { label: 'המשך' },
  });
  if (step === 'goals') return shell(S, step, {
    title: 'מה היעדים שלך?',
    note: 'אפשר לבחור כמה. אחר כך נשאל סכום ושנה לכל יעד.',
    choices: chips(GOAL_TYPES, o.goalKeys || [], 'toggle'),
    next: { label: 'המשך' },
  });
  const gi = goalIndex(step);
  if (gi != null && step.startsWith('gAmt')) {
    const g = goalAt(S, gi);
    return shell(S, step, { title: `כמה עולה היעד «${g.label}»?`, field: numField(g.amount ?? ''), next: { label: 'המשך' } });
  }
  if (gi != null && step.startsWith('gCur')) {
    const g = goalAt(S, gi);
    return shell(S, step, { title: `באיזה מטבע הסכום של «${g.label}»?`, choices: chips([['ILS', 'שקל'], ['USD', 'דולר']], g.currency || '') });
  }
  if (gi != null && step.startsWith('gYear')) {
    const g = goalAt(S, gi);
    return shell(S, step, { title: `באיזו שנה היעד «${g.label}»?`, choices: chips(years(), g.year == null ? '' : String(g.year)) });
  }
  if (step === 'returns') {
    const a = RETURN_ASSUMPTIONS;
    return shell(S, step, {
      title: 'לאשר הנחות תשואה שנתיות?',
      note: `שמרני ${(a.conservative * 100).toFixed(1)}% · בסיס ${(a.base * 100).toFixed(1)}% · אופטימי ${(a.optimistic * 100).toFixed(1)}%.<br>${esc(a.sourceHe)}<br><span class="mut">נכון ל־${esc(a.date)}. <span class="chip prop">הצעה לאימות</span></span>`,
      choices: chips([['confirm', 'לאשר את ההנחות'], ['edit', 'לערוך']], ''),
    });
  }
  if (step === 'rEdit') {
    const rs = S.settings.rScen || [];
    const show = i => rs[i] == null ? '' : +(rs[i] * 100).toFixed(2);
    return shell(S, step, {
      title: 'עריכת שלוש הנחות התשואה',
      note: 'באחוזים לשנה. שדה ריק = חסר.',
      field: `<label for="r0">שמרני</label><input id="r0" type="number" step="any" inputmode="decimal" dir="ltr" value="${esc(show(0))}">
        <label for="r1">בסיס</label><input id="r1" type="number" step="any" inputmode="decimal" dir="ltr" value="${esc(show(1))}">
        <label for="r2">אופטימי</label><input id="r2" type="number" step="any" inputmode="decimal" dir="ltr" value="${esc(show(2))}">`,
      next: { label: 'שמור' },
    });
  }
  if (/^q[0-4]$/.test(step)) {
    const k = +step.slice(1);
    const q = RISK_Q[k];
    const cur = o.qa?.[k];
    return shell(S, step, { title: q[0], choices: chips(q[1].map((label, j) => [String(j), label]), cur == null ? '' : String(cur)) });
  }
  if (step === 'cashAmt') return shell(S, step, { title: 'כמה מזומן זמין יש לך?', field: numField(o.pendingCash ?? ''), next: { label: 'המשך' } });
  if (step === 'cashCcy') return shell(S, step, { title: 'באיזה מטבע המזומן?', choices: chips([['ILS', 'שקל'], ['USD', 'דולר']], '') });
  if (step === 'holdMenu') return shell(S, step, {
    title: 'מה להוסיף לתיק?',
    choices: chips([['stock', 'מניה או קרן סל'], ['crypto', 'קריפטו'], ['csv', 'ייבוא CSV'], ['done', 'סיימתי עם ניירות']], ''),
  });
  if (step === 'hSym' || step === 'cSym') {
    const crypto = step === 'cSym';
    return shell(S, step, {
      title: crypto ? 'מה סמל הקריפטו?' : 'מה הסמל?',
      note: crypto ? 'תצוגה וסיכון בלבד. בחירה מהרשימה המקומית.' : 'הקלד אותיות. NV מציע את NVDA. סוג, ענף ויחס הוצאות יושלמו מהרשימה אם יש, ואחרת יישארו חסרים.',
      field: textField(o.draft?.symbol || '', 'obSym') + `<div id="obSuggest">${suggestHtml(o.draft?.symbol || '', crypto)}</div>`,
      next: { label: 'המשך' },
    });
  }
  if (step === 'hQty' || step === 'cQty') return shell(S, step, { title: `כמה יחידות של ${esc(o.draft?.symbol || '')}?`, field: numField(o.draft?.qty ?? ''), next: { label: 'המשך' } });
  if (step === 'csv') return shell(S, step, {
    title: 'ייבוא CSV מהמכשיר',
    note: 'הקובץ נקרא כאן בלבד. עמודות: kind, symbol, name, qty, balance, currency, er, feeDeposit, feeAccum, monthlyDeposit, sector, employer, thesis. אחוזים כשבר עשרוני.',
    field: '<label for="obCsvFile">קובץ</label><input id="obCsvFile" type="file" accept=".csv,text/csv"><label for="obCsv">או הדבקה</label><textarea id="obCsv" dir="ltr"></textarea>',
    next: { act: 'importCsv', label: 'הוסף מהקובץ' },
  });
  if (step === 'penAsk') return shell(S, step, { title: 'יש לך קרן פנסיה?', choices: chips([['yes', 'כן'], ['no', 'אין']], '') });
  if (step === 'stuAsk') return shell(S, step, { title: 'יש לך קרן השתלמות?', choices: chips([['yes', 'כן'], ['no', 'אין']], '') });
  if (step === 'penProvider' || step === 'stuProvider') return shell(S, step, { title: 'מי הגוף המנהל?', choices: chips(PROVIDERS.map(p => [p, p]), o.fund?.provider || '') });
  if (step === 'penProviderText' || step === 'stuProviderText') return shell(S, step, { title: 'שם הגוף המנהל', field: textField(o.fund?.providerText || '', 'obIn'), next: { label: 'המשך' } });
  if (step === 'penTrack' || step === 'stuTrack') return shell(S, step, { title: 'מה המסלול?', choices: chips(TRACKS.map(t => [t, t]), o.fund?.track || '') });
  if (step === 'penTrackText' || step === 'stuTrackText') return shell(S, step, { title: 'שם המסלול', field: textField(o.fund?.trackText || '', 'obIn'), next: { label: 'המשך' } });
  if (step === 'penBal' || step === 'stuBal') return shell(S, step, { title: 'מה היתרה בשקלים?', field: numField(o.fund?.balance ?? ''), next: { label: 'המשך' } });
  if (step === 'penMore') return shell(S, step, { title: 'יש עוד קרן פנסיה?', choices: chips([['yes', 'כן'], ['no', 'לא']], '') });
  if (step === 'stuMore') return shell(S, step, { title: 'יש עוד קרן השתלמות?', choices: chips([['yes', 'כן'], ['no', 'לא']], '') });
  if (step === 'done') return shell(S, step, {
    title: 'אפשר לראות את התיק',
    note: 'החישוב משתמש רק במה שהזנת. מה שחסר יסומן כחסר.',
    next: { act: 'finish', label: 'אל התיק' }, skip: false,
  });
  return shell(S, 'intro', { title: 'נבנה את התמונה שלך', next: { label: 'מתחילים' }, skip: false });
}

function setRisk(S) {
  const answers = S.onboarding.qa;
  if (!answers || answers.length < 5 || answers.some(x => x == null)) { S.risk = null; return; }
  const score = answers.reduce((s, x) => s + x, 0);
  S.risk = { answers: answers.slice(), score, profile: score <= 5 ? 'שמרני' : score <= 10 ? 'מאוזן' : 'צמיחה', date: new Date().toISOString().slice(0, 10) };
}
function applyReturns(S, list) {
  S.settings.rScen = list;
  S.settings.rScenMeta = { source: RETURN_ASSUMPTIONS.sourceHe, date: RETURN_ASSUMPTIONS.date, proposal: true };
}
function commitSecurity(S) {
  const d = S.onboarding.draft;
  if (!d?.symbol || !(d.qty > 0)) return;
  const meta = lookup(d.symbol, false);
  const h = {
    id: d.id, kind: meta?.k || 'stock', symbol: d.symbol, name: meta?.n || d.symbol, qty: d.qty, currency: 'USD',
    sector: meta?.sec || undefined,
  };
  if (meta?.er != null) h.er = meta.er;
  upsert(S, h);
  S.onboarding.draft = null;
}
function commitCrypto(S) {
  const d = S.onboarding.draft;
  if (!d?.symbol || !(d.qty > 0)) return;
  const meta = lookup(d.symbol, true);
  upsert(S, { id: d.id, kind: 'crypto', symbol: d.symbol, name: meta?.n || d.symbol, qty: d.qty, currency: 'USD' });
  S.onboarding.draft = null;
}

export function acceptImport(S, rows) {
  S.holdings = S.holdings.concat(rows);
  S.onboarding.draft = null;
  S.onboarding.err = '';
  go(S, 'holdMenu');
}

export { suggestedRiskForYears };

export function onboardAct(S, kind, val, read) {
  if (!S.profile) S.profile = { taxResidency: 'IL' };
  if (!S.onboarding) S.onboarding = { active: true, step: 'intro', hist: [] };
  if (!S.settings) S.settings = { E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' };
  if (!S.settings.rScen) S.settings.rScen = [null, null, null];
  if (!Array.isArray(S.goals)) S.goals = [];
  const step = S.onboarding.step || 'intro';
  if (kind === 'fresh') return 'empty';
  if (kind === 'keepDemo') { S.demoChoice = 'keep'; S.onboarded = true; return 'app'; }
  if (kind === 'back') return back(S);
  if (kind === 'finish') {
    S.simulated = false;
    S.onboarded = true;
    S.demoChoice = 'fresh';
    S.onboarding = { active: false, step: 'done', hist: [] };
    return 'app';
  }
  if (kind === 'toggle') {
    const set = new Set(S.onboarding.goalKeys || []);
    if (set.has(val)) set.delete(val); else set.add(val);
    S.onboarding.goalKeys = GOAL_TYPES.map(([k]) => k).filter(k => set.has(k));
    return 'stay';
  }
  if (kind === 'pickSym') return onPick(S, step, val, read);
  if (kind === 'pick') return onPick(S, step, val, read);
  if (kind === 'skip') return onSkip(S, step);
  return onNext(S, step, read);
}

function onSkip(S, step) {
  if (step === 'intro' || step === 'done') return fail(S, 'כאן אין דילוג');
  if (step === 'tax') { S.profile.taxResidency = 'IL'; return go(S, 'goals'); }
  if (step === 'goals') { S.onboarding.goalKeys = []; return go(S, 'returns'); }
  const gi = goalIndex(step);
  if (gi != null) {
    const g = goalAt(S, gi);
    if (step.startsWith('gAmt')) g.amount = null;
    if (step.startsWith('gCur')) g.currency = null;
    if (step.startsWith('gYear')) { g.year = null; g.suggestedRisk = null; }
    if (step.startsWith('gYear')) return go(S, afterGoal(S, gi));
    if (step.startsWith('gAmt')) return go(S, 'gCur' + gi);
    return go(S, 'gYear' + gi);
  }
  if (step === 'returns' || step === 'rEdit') { S.onboarding.editingReturns = false; return go(S, 'q0'); }
  if (/^q[0-4]$/.test(step)) {
    const k = +step.slice(1);
    if (!S.onboarding.qa) S.onboarding.qa = [null, null, null, null, null];
    S.onboarding.qa[k] = null;
    setRisk(S);
    return go(S, k < 4 ? 'q' + (k + 1) : 'cashAmt');
  }
  if (step === 'cashAmt') { S.onboarding.pendingCash = null; return go(S, 'holdMenu'); }
  if (step === 'cashCcy') { S.onboarding.pendingCash = null; return go(S, 'holdMenu'); }
  if (step === 'hSym' || step === 'cSym' || step === 'hQty' || step === 'cQty') { S.onboarding.draft = null; return go(S, 'holdMenu'); }
  if (step === 'csv') { S.onboarding.draft = null; return go(S, 'holdMenu'); }
  if (step === 'penAsk') { S.onboarding.pen = 'no'; return go(S, 'stuAsk'); }
  if (step === 'stuAsk') { S.onboarding.stu = 'no'; return go(S, 'done'); }
  if (step === 'penBal' || step === 'stuBal') {
    if (S.onboarding.fund) S.onboarding.fund.balance = null;
    writeFund(S, step.startsWith('pen') ? 'pension' : 'study');
    return go(S, step.startsWith('pen') ? 'penMore' : 'stuMore');
  }
  if (step.startsWith('pen')) return go(S, 'penMore');
  if (step.startsWith('stu')) return go(S, 'stuMore');
  return go(S, 'done');
}

function onPick(S, step, val, read) {
  if (step === 'tax') { S.profile.taxResidency = val === 'other' ? 'other' : 'IL'; return 'stay'; }
  if (step === 'gCur' || /^gCur\d+$/.test(step)) {
    const gi = goalIndex(step);
    goalAt(S, gi).currency = val === 'USD' ? 'USD' : 'ILS';
    return go(S, 'gYear' + gi);
  }
  if (/^gYear\d+$/.test(step)) {
    const gi = goalIndex(step);
    const g = goalAt(S, gi);
    g.year = +val;
    const left = g.year - new Date().getFullYear();
    g.suggestedRisk = suggestedRiskForYears(left);
    return go(S, afterGoal(S, gi));
  }
  if (step === 'returns') {
    if (val === 'edit') {
      const a = RETURN_ASSUMPTIONS;
      if (S.settings.rScen.every(x => x == null)) S.settings.rScen = [a.conservative, a.base, a.optimistic];
      S.onboarding.editingReturns = true;
      return go(S, 'rEdit');
    }
    const a = RETURN_ASSUMPTIONS;
    applyReturns(S, [a.conservative, a.base, a.optimistic]);
    return go(S, 'q0');
  }
  if (/^q[0-4]$/.test(step)) {
    const k = +step.slice(1);
    if (!S.onboarding.qa) S.onboarding.qa = [null, null, null, null, null];
    S.onboarding.qa[k] = +val;
    setRisk(S);
    return go(S, k < 4 ? 'q' + (k + 1) : 'cashAmt');
  }
  if (step === 'cashCcy') {
    const amt = S.onboarding.pendingCash;
    if (!(amt > 0)) return fail(S, 'חסר סכום');
    const currency = val === 'USD' ? 'USD' : 'ILS';
    upsert(S, { id: 'ob-cash', kind: 'cash', name: currency === 'ILS' ? 'מזומן (ILS)' : 'מזומן (USD)', balance: amt, currency });
    S.onboarding.pendingCash = null;
    return go(S, 'holdMenu');
  }
  if (step === 'holdMenu') {
    if (val === 'done') { S.onboarding.draft = null; return go(S, 'penAsk'); }
    if (val === 'csv') { S.onboarding.draft = { phase: 'csv' }; return go(S, 'csv'); }
    if (val === 'crypto') { S.onboarding.draft = { phase: 'crypto', id: nid(S) }; return go(S, 'cSym'); }
    S.onboarding.draft = { phase: 'sec', id: nid(S) };
    return go(S, 'hSym');
  }
  if ((step === 'hSym' || step === 'cSym') && val) {
    if (!S.onboarding.draft) return go(S, 'holdMenu');
    S.onboarding.draft.symbol = val.toUpperCase();
    return go(S, step === 'hSym' ? 'hQty' : 'cQty');
  }
  if (step === 'penAsk' || step === 'stuAsk') {
    const study = step === 'stuAsk';
    if (val === 'no') {
      if (!study) { dropPrefix(S, 'ob-pen-'); S.onboarding.pen = 'no'; S.onboarding.fund = null; return go(S, 'stuAsk'); }
      dropPrefix(S, 'ob-stu-'); S.onboarding.stu = 'no'; S.onboarding.fund = null; return go(S, 'done');
    }
    if (study) { S.onboarding.stu = 'yes'; S.onboarding.stuI = 0; }
    else { S.onboarding.pen = 'yes'; S.onboarding.penI = 0; }
    S.onboarding.fund = {};
    return go(S, study ? 'stuProvider' : 'penProvider');
  }
  if (step === 'penProvider' || step === 'stuProvider') {
    S.onboarding.fund.provider = val;
    S.onboarding.fund.providerText = '';
    return go(S, val === 'אחר' ? (step.startsWith('pen') ? 'penProviderText' : 'stuProviderText') : (step.startsWith('pen') ? 'penTrack' : 'stuTrack'));
  }
  if (step === 'penTrack' || step === 'stuTrack') {
    S.onboarding.fund.track = val;
    S.onboarding.fund.trackText = '';
    return go(S, val === 'אחר' ? (step.startsWith('pen') ? 'penTrackText' : 'stuTrackText') : (step.startsWith('pen') ? 'penBal' : 'stuBal'));
  }
  if (step === 'penMore' || step === 'stuMore') {
    const study = step === 'stuMore';
    if (val === 'yes') {
      if (study) S.onboarding.stuI = (S.onboarding.stuI || 0) + 1;
      else S.onboarding.penI = (S.onboarding.penI || 0) + 1;
      S.onboarding.fund = {};
      return go(S, study ? 'stuProvider' : 'penProvider');
    }
    S.onboarding.fund = null;
    return go(S, study ? 'done' : 'stuAsk');
  }
  return fail(S, 'בחר אפשרות');
}

function onNext(S, step, read) {
  if (step === 'intro') return go(S, 'tax');
  if (step === 'tax') { if (S.profile.taxResidency !== 'other') S.profile.taxResidency = 'IL'; return go(S, 'goals'); }
  if (step === 'goals') {
    const keys = S.onboarding.goalKeys || [];
    S.goals = (S.goals || []).filter(g => !String(g.id).startsWith('g-ob-') || keys.includes(g.key));
    return go(S, keys.length ? 'gAmt0' : 'returns');
  }
  if (/^gAmt\d+$/.test(step)) {
    const gi = goalIndex(step);
    const p = parsed(read);
    if (p.bad || p.blank || !(p.n > 0)) return fail(S, 'סכום חיובי, או דלג');
    goalAt(S, gi).amount = p.n;
    return go(S, 'gCur' + gi);
  }
  if (step === 'rEdit') {
    const nums = [read.r0, read.r1, read.r2].map(v => v === '' || v == null ? null : Number(v));
    if (nums.some(n => n != null && !Number.isFinite(n))) return fail(S, 'צריך מספר או שדה ריק');
    applyReturns(S, nums.map(n => n == null ? null : n / 100));
    S.onboarding.editingReturns = false;
    return go(S, 'q0');
  }
  if (step === 'cashAmt') {
    const p = parsed(read);
    if (p.bad || p.blank || !(p.n > 0)) return fail(S, 'סכום חיובי, או דלג');
    S.onboarding.pendingCash = p.n;
    return go(S, 'cashCcy');
  }
  if (step === 'hSym' || step === 'cSym') {
    const raw = (read.sym || read.text || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!raw) return fail(S, 'צריך סמל, או דלג');
    if (!S.onboarding.draft) return go(S, 'holdMenu');
    S.onboarding.draft.symbol = raw;
    return go(S, step === 'hSym' ? 'hQty' : 'cQty');
  }
  if (step === 'hQty' || step === 'cQty') {
    const p = parsed(read);
    if (p.bad || !(p.n > 0)) return fail(S, 'צריך כמות חיובית, או דלג');
    if (!S.onboarding.draft?.symbol) return go(S, 'holdMenu');
    S.onboarding.draft.qty = p.n;
    if (step === 'hQty') commitSecurity(S); else commitCrypto(S);
    return go(S, 'holdMenu');
  }
  if (step === 'penProviderText' || step === 'stuProviderText') {
    S.onboarding.fund.providerText = read.text;
    return go(S, step.startsWith('pen') ? 'penTrack' : 'stuTrack');
  }
  if (step === 'penTrackText' || step === 'stuTrackText') {
    S.onboarding.fund.trackText = read.text;
    return go(S, step.startsWith('pen') ? 'penBal' : 'stuBal');
  }
  if (step === 'penBal' || step === 'stuBal') {
    const p = parsed(read);
    if (p.bad) return fail(S, 'צריך מספר, או דלג');
    if (!p.blank && p.n < 0) return fail(S, 'מספר לא שלילי, או דלג');
    S.onboarding.fund.balance = p.blank ? null : p.n;
    writeFund(S, step === 'penBal' ? 'pension' : 'study');
    return go(S, step === 'penBal' ? 'penMore' : 'stuMore');
  }
  return fail(S, 'חסרה תשובה');
}
