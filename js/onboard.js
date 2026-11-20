// אונבורדינג: שאלה אחת במסך. שומר רק מה שהוזן. אין רשת ואין ברירות מחדל מספריות.
import { TAX_NOTE } from './logic.js';

export const RISK_Q = [
  ['אם התיק ירד 20% בחודש, מה היית עושה?', ['מוכר הכל', 'מוכר חלק', 'לא עושה כלום', 'קונה עוד']],
  ['מתי תצטרך את רוב הכסף?', ['פחות משנתיים', '2–5 שנים', '5–10 שנים', 'מעל 10 שנים']],
  ['כמה ניסיון יש לך בהשקעות?', ['אין', 'מעט', 'בינוני', 'רב']],
  ['איזה תיק היית מעדיף לשנה?', ['−5% עד +7%', '−12% עד +18%', '−25% עד +35%', '−45% עד +70%']],
  ['כמה חודשי הוצאות יש לך בצד?', ['פחות מחודש', '1–3', '3–6', 'מעל 6']],
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emptyPortfolio() {
  return {
    simulated: false,
    onboarded: false,
    onboarding: { active: true, step: 'intro', hist: [] },
    holdings: [],
    settings: { E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' },
    proj: { B0: null, P: null, fd: null, fa: null, years: null, G: null, horizonYear: null },
    journal: [],
    reviewed: {},
    risk: null,
    profile: { taxResidency: 'IL', materialShareholder: null, employerPlan: null },
  };
}

export function mode(S) {
  if (S.onboarding?.active && !S.onboarded) return 'onboard';
  if (S.simulated && !S.demoChoice) return 'gate';
  return 'app';
}

const OPTIONAL = new Set(['astsQty', 'goal', 'horizon', 'r0', 'r1', 'r2', 'E', 'M', 'cashSince', 'cashAmt', 'hEr', 'hSector', 'hWhy', 'hExit', 'cWhy', 'cExit', 'csv', 'penProvider', 'penTrack', 'penBal', 'penFd', 'penFa', 'penP', 'stuProvider', 'stuTrack', 'stuBal', 'stuFd', 'stuFa', 'stuP']);

function plan(S) {
  const o = S.onboarding || {};
  const ids = ['intro', 'tax', 'material', 'employer'];
  if (S.profile?.employerPlan) ids.push('astsQty');
  ids.push('goal', 'horizon', 'r0', 'r1', 'r2', 'q0', 'q1', 'q2', 'q3', 'q4', 'E', 'M', 'cashSince', 'cashAmt', 'cashCcy', 'cashMore', 'holdMenu');
  const d = o.draft;
  if (d?.phase === 'sec') {
    ids.push('hKind', 'hSym', 'hQty');
    if (d.kind === 'etf') ids.push('hEr');
    ids.push('hSector', 'hWhy', 'hExit');
  } else if (d?.phase === 'crypto') ids.push('cSym', 'cQty', 'cWhy', 'cExit');
  else if (d?.phase === 'csv') ids.push('csv');
  ids.push('penAsk');
  if (o.pen === 'yes') ids.push('penProvider', 'penTrack', 'penBal', 'penFd', 'penFa', 'penP', 'penMore');
  ids.push('stuAsk');
  if (o.stu === 'yes') ids.push('stuProvider', 'stuTrack', 'stuBal', 'stuFd', 'stuFa', 'stuP', 'stuMore');
  ids.push('done');
  return ids;
}

function shell(S, step, { title, note, field, choices, next, skip }) {
  const ids = plan(S);
  const i = Math.max(0, ids.indexOf(step));
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

function picks(list, current) {
  return list.map(([val, label]) => `<button type="button" class="ob-choice${current === val ? ' on' : ''}" data-ob="pick" data-val="${esc(val)}">${esc(label)}</button>`).join('');
}
function fieldInput(value, type = 'number') {
  const dir = type === 'text' || type === 'number' || type === 'date' ? ' dir="ltr"' : '';
  const mode = type === 'number' ? ' inputmode="decimal"' : '';
  return `<input id="obIn" aria-labelledby="obQ" type="${type}"${type === 'number' ? ' step="any"' : ''} autocomplete="off"${dir}${mode} value="${esc(value ?? '')}">`;
}
function fieldBox(value) {
  return `<textarea id="obIn" aria-labelledby="obQ">${esc(value ?? '')}</textarea>`;
}
const pctShow = x => x == null || !Number.isFinite(x) ? '' : +(x * 100).toFixed(4);

function fundName(kind, provider, track) {
  const base = kind === 'study' ? 'קרן השתלמות' : 'קרן פנסיה';
  if (provider && track) return provider + ' — ' + track;
  if (provider) return provider;
  if (track) return base + ' — ' + track;
  return base;
}
function nid(S) { S.onboarding.seq = (S.onboarding.seq || 0) + 1; return 'h' + S.onboarding.seq; }
function cashId(S) { return 'ob-cash-' + (S.onboarding.cashI || 0); }
function penId(S) { return 'ob-pen-' + (S.onboarding.penI || 0); }
function stuId(S) { return 'ob-stu-' + (S.onboarding.stuI || 0); }
function upsert(S, h) {
  const i = S.holdings.findIndex(x => x.id === h.id);
  if (i >= 0) S.holdings[i] = h; else S.holdings.push(h);
}
function dropPrefix(S, pre) { S.holdings = S.holdings.filter(h => !String(h.id).startsWith(pre)); }

function writeFund(S, kind) {
  const d = S.onboarding.fund || {};
  const id = kind === 'study' ? stuId(S) : penId(S);
  upsert(S, {
    id, kind, currency: 'ILS',
    name: fundName(kind, d.provider, d.track),
    provider: d.provider || undefined,
    track: d.track || undefined,
    balance: d.balance == null ? undefined : d.balance,
    feeDeposit: d.feeDeposit == null ? undefined : d.feeDeposit,
    feeAccum: d.feeAccum == null ? undefined : d.feeAccum,
    monthlyDeposit: d.monthlyDeposit == null ? undefined : d.monthlyDeposit,
  });
}
function loadFund(S, kind) {
  if (S.onboarding.fund) return;
  const id = kind === 'study' ? stuId(S) : penId(S);
  const h = S.holdings.find(x => x.id === id) || {};
  S.onboarding.fund = {
    provider: h.provider || '', track: h.track || '',
    balance: h.balance ?? null, feeDeposit: h.feeDeposit ?? null, feeAccum: h.feeAccum ?? null, monthlyDeposit: h.monthlyDeposit ?? null,
  };
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
  const skip = OPTIONAL.has(step);
  const opt = '<div class="mut">אפשר לדלג. מה שחסר יישאר חסר — לא יומצא מספר.</div>';
  if (step === 'intro') return shell(S, step, {
    title: 'נבנה את התמונה שלך',
    note: 'שאלה אחת בכל מסך. אפשר לחזור אחורה, לדלג על מה שלא חובה, ולהמשיך אחר כך מאותו מקום. אין צורך בשם. הכל נשמר רק במכשיר הזה.',
    next: { label: 'מתחילים' },
  });
  if (step === 'tax') return shell(S, step, {
    title: 'מה תושבות המס שלך?',
    note: 'ברירת המחדל: ישראל. זה נשמר אצלך במכשיר בלבד.',
    field: `<label for="obSel">תושבות מס</label><select id="obSel"><option value="IL"${S.profile.taxResidency !== 'other' ? ' selected' : ''}>ישראל</option><option value="other"${S.profile.taxResidency === 'other' ? ' selected' : ''}>אחר</option></select>`,
    next: { label: 'המשך' },
  });
  if (step === 'material') return shell(S, step, {
    title: 'האם אתה בעל מניות מהותי בחברה כלשהי?',
    note: esc(TAX_NOTE),
    choices: picks([['yes', 'כן — 10% או יותר'], ['no', 'לא']], S.profile.materialShareholder == null ? '' : S.profile.materialShareholder ? 'yes' : 'no'),
  });
  if (step === 'employer') return shell(S, step, {
    title: 'יש לך מניות בתוכנית העובדים של AST SpaceMobile?',
    note: 'חלון מסחר וכללי אינסיידר של החברה חלים לפני כל פעולה. למניית מעסיק מוצגת ריכוזיות בלבד, בלי הצעת מכירה.',
    choices: picks([['yes', 'כן'], ['no', 'לא']], S.profile.employerPlan == null ? '' : S.profile.employerPlan ? 'yes' : 'no'),
  });
  if (step === 'astsQty') {
    const h = S.holdings.find(x => x.id === 'ob-asts');
    return shell(S, step, { title: 'כמה מניות ASTS יש לך?', note: opt, field: fieldInput(h?.qty ?? ''), skip: true, next: { label: 'המשך' } });
  }
  if (step === 'goal') return shell(S, step, { title: 'מה סכום היעד בדולרים?', note: 'אופציונלי. ' + opt, field: fieldInput(S.proj?.G ?? ''), skip: true, next: { label: 'המשך' } });
  if (step === 'horizon') return shell(S, step, { title: 'באיזו שנה היעד?', note: 'למשל 2036. אופציונלי.', field: fieldInput(S.proj?.horizonYear ?? '', 'number'), skip: true, next: { label: 'המשך' } });
  if (step === 'r0' || step === 'r1' || step === 'r2') {
    const idx = step === 'r0' ? 0 : step === 'r1' ? 1 : 2;
    const label = ['שמרני', 'בסיס', 'אופטימי'][idx];
    const v = S.settings.rScen?.[idx];
    return shell(S, step, {
      title: `איזו תשואה שנתית בתרחיש ${label}?`,
      note: 'באחוזים לשנה, בלי ברירת מחדל. ריק = חסר. תרחיש הבסיס משמש גם לחישובי עלות.',
      field: fieldInput(v == null ? '' : +(v * 100).toFixed(4)),
      skip: true, next: { label: 'המשך' },
    });
  }
  if (/^q[0-4]$/.test(step)) {
    const k = +step.slice(1);
    const q = RISK_Q[k];
    const cur = o.qa?.[k];
    return shell(S, step, { title: q[0], choices: picks(q[1].map((label, j) => [String(j), label]), cur == null ? '' : String(cur)) });
  }
  if (step === 'E') return shell(S, step, { title: 'כמה ההוצאה החודשית החיונית שלך?', note: 'בשקלים. בלי זה לא מחושבת קרן חירום.', field: fieldInput(S.settings.E_ils ?? ''), skip: true, next: { label: 'המשך' } });
  if (step === 'M') return shell(S, step, {
    title: 'כמה חודשי הוצאות לשמור בצד?',
    note: 'טווח מקובל: 3 עד 6.',
    choices: picks([['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], S.settings.M == null ? '' : String(S.settings.M)),
    skip: true,
  });
  if (step === 'cashSince') return shell(S, step, { title: 'ממתי העודף במזומן יושב בלי ריבית?', note: 'אופציונלי. בלי תאריך לא נספרים הימים.', field: fieldInput(S.settings.cashSince || '', 'date'), skip: true, next: { label: 'המשך' } });
  if (step === 'cashAmt') {
    const again = (o.cashI || 0) > 0;
    const saved = S.holdings.find(h => h.id === 'ob-cash-' + (o.cashI || 0));
    return shell(S, step, { title: again ? 'כמה עוד מזומן זמין?' : 'כמה מזומן זמין יש לך?', note: 'סכום שלא צובר ריבית. אם אין — דלג.', field: fieldInput(o.pendingCash ?? saved?.balance ?? ''), skip: true, next: { label: 'המשך' } });
  }
  if (step === 'cashCcy') return shell(S, step, { title: 'באיזה מטבע המזומן?', choices: picks([['ILS', 'שקל (ILS)'], ['USD', 'דולר (USD)']], '') });
  if (step === 'cashMore') return shell(S, step, { title: 'יש עוד מזומן?', choices: picks([['yes', 'כן, עוד סכום'], ['no', 'לא']], '') });
  if (step === 'holdMenu') return shell(S, step, {
    title: 'מה להוסיף לתיק?',
    note: 'מניות וקרנות סל בארה״ב, או קריפטו לתצוגה וסיכון בלבד. אפשר גם לייבא CSV.',
    choices: picks([['stock', 'מניה או קרן סל'], ['crypto', 'קריפטו'], ['csv', 'ייבוא CSV'], ['done', 'סיימתי עם ניירות']], ''),
  });
  if (step === 'hKind') return shell(S, step, { title: 'מניה או קרן סל?', choices: picks([['stock', 'מניה'], ['etf', 'קרן סל']], o.draft?.kind || '') });
  if (step === 'hSym') return shell(S, step, { title: 'מה הסמל?', note: 'למשל AAPL או VOO.', field: fieldInput(o.draft?.symbol || '', 'text'), next: { label: 'המשך' } });
  if (step === 'hQty') return shell(S, step, { title: 'כמה יחידות?', field: fieldInput(o.draft?.qty ?? ''), next: { label: 'המשך' } });
  if (step === 'hEr') return shell(S, step, { title: 'מה יחס ההוצאות השנתי?', note: 'באחוזים. 0.03 פירושו 0.03%. דילוג = חסר.', field: fieldInput(pctShow(o.draft?.er)), skip: true, next: { label: 'המשך' } });
  if (step === 'hSector') return shell(S, step, { title: 'באיזה ענף?', note: opt, field: fieldInput(o.draft?.sector || '', 'text'), skip: true, next: { label: 'המשך' } });
  if (step === 'hWhy') return shell(S, step, { title: 'למה קניתי?', note: opt, field: fieldBox(o.draft?.thesis || ''), skip: true, next: { label: 'המשך' } });
  if (step === 'hExit') return shell(S, step, { title: 'מה יגרום לי לצאת?', note: opt, field: fieldBox(o.draft?.exit || ''), skip: true, next: { label: 'המשך' } });
  if (step === 'cSym') return shell(S, step, { title: 'מה סמל הקריפטו?', note: 'תצוגה וסיכון בלבד. אין כאן המלצת קנייה או מכירה.', field: fieldInput(o.draft?.symbol || '', 'text'), next: { label: 'המשך' } });
  if (step === 'cQty') return shell(S, step, { title: 'כמה יחידות?', field: fieldInput(o.draft?.qty ?? ''), next: { label: 'המשך' } });
  if (step === 'cWhy') return shell(S, step, { title: 'למה קניתי?', note: opt, field: fieldBox(o.draft?.thesis || ''), skip: true, next: { label: 'המשך' } });
  if (step === 'cExit') return shell(S, step, { title: 'מה יגרום לי לצאת?', note: opt, field: fieldBox(o.draft?.exit || ''), skip: true, next: { label: 'המשך' } });
  if (step === 'csv') return shell(S, step, {
    title: 'ייבוא CSV מהמכשיר',
    note: 'הקובץ נקרא כאן בלבד. עמודות: kind, symbol, name, qty, balance, currency, er, feeDeposit, feeAccum, monthlyDeposit, sector, employer, thesis. אחוזים כשבר עשרוני.',
    field: '<label for="obCsvFile">קובץ</label><input id="obCsvFile" type="file" accept=".csv,text/csv"><label for="obCsv">או הדבקה</label><textarea id="obCsv" dir="ltr"></textarea>',
    skip: true,
    next: { act: 'importCsv', label: 'הוסף מהקובץ' },
  });
  if (step === 'penAsk') return shell(S, step, { title: 'יש לך קרן פנסיה?', choices: picks([['yes', 'כן'], ['no', 'אין']], '') });
  if (step === 'stuAsk') return shell(S, step, { title: 'יש לך קרן השתלמות?', choices: picks([['yes', 'כן'], ['no', 'אין']], '') });
  const fundStep = step.startsWith('pen') ? 'pension' : step.startsWith('stu') ? 'study' : null;
  if (fundStep && step.endsWith('Provider')) return fundField(S, step, fundStep, 'provider', (o.penI || o.stuI) ? 'מי הגוף המנהל של הקרן הנוספת?' : 'מי הגוף המנהל?');
  if (fundStep && step.endsWith('Track')) return fundField(S, step, fundStep, 'track', 'מה המסלול?');
  if (fundStep && step.endsWith('Bal')) return fundField(S, step, fundStep, 'balance', 'מה היתרה בשקלים?');
  if (fundStep && step.endsWith('Fd')) return fundField(S, step, fundStep, 'feeDeposit', 'כמה דמי ניהול מהפקדה?', 'באחוזים. 1.5 פירושו 1.5%.');
  if (fundStep && step.endsWith('Fa')) return fundField(S, step, fundStep, 'feeAccum', 'כמה דמי ניהול מהצבירה?', 'באחוזים לשנה. 0.25 פירושו 0.25%.');
  if (fundStep && step.endsWith('P')) return fundField(S, step, fundStep, 'monthly', 'כמה ההפקדה החודשית בשקלים?');
  if (step === 'penMore') return shell(S, step, { title: 'יש עוד קרן פנסיה?', choices: picks([['yes', 'כן'], ['no', 'לא']], '') });
  if (step === 'stuMore') return shell(S, step, { title: 'יש עוד קרן השתלמות?', choices: picks([['yes', 'כן'], ['no', 'לא']], '') });
  if (step === 'done') return shell(S, step, {
    title: 'אפשר לראות את התיק',
    note: 'החישוב משתמש רק במה שהזנת. מה שחסר יסומן כחסר, בלי מספר מומצא. מחירי השוק בקובץ האותות עדיין מדומים.',
    next: { act: 'finish', label: 'אל התיק' },
  });
  return shell(S, 'intro', { title: 'נבנה את התמונה שלך', next: { label: 'מתחילים' } });
}

function fundField(S, step, kind, key, title, note) {
  loadFund(S, kind);
  const d = S.onboarding.fund;
  let value = '';
  let type = 'text';
  if (key === 'provider') value = d.provider || '';
  else if (key === 'track') value = d.track || '';
  else if (key === 'balance') { value = d.balance ?? ''; type = 'number'; }
  else if (key === 'monthly') { value = d.monthlyDeposit ?? ''; type = 'number'; }
  else if (key === 'feeDeposit') { value = pctShow(d.feeDeposit); type = 'number'; }
  else if (key === 'feeAccum') { value = pctShow(d.feeAccum); type = 'number'; }
  return shell(S, step, { title, note: note || 'אפשר לדלג. ערך חסר יישאר חסר.', field: fieldInput(value, type), skip: true, next: { label: 'המשך' } });
}

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
  if (read.text === '') return { blank: true };
  if (!Number.isFinite(read.num)) return { bad: true };
  return { n: read.num };
}
function touchProj(S) {
  if (!S.proj) S.proj = { B0: null, P: null, fd: null, fa: null, years: null, G: null, horizonYear: null };
  return S.proj;
}
function setRisk(S) {
  const answers = S.onboarding.qa;
  if (!answers || answers.some(x => x == null)) return;
  const score = answers.reduce((s, x) => s + x, 0);
  S.risk = { answers: answers.slice(), score, profile: score <= 5 ? 'שמרני' : score <= 10 ? 'מאוזן' : 'צמיחה', date: new Date().toISOString().slice(0, 10) };
}
function commitSecurity(S) {
  const d = S.onboarding.draft;
  if (!d?.symbol || !(d.qty > 0) || (d.kind !== 'stock' && d.kind !== 'etf')) return;
  const h = {
    id: d.id, kind: d.kind, symbol: d.symbol, name: d.symbol, qty: d.qty, currency: 'USD',
    sector: d.sector || undefined, thesis: d.thesis || undefined, exit: d.exit || undefined,
    employer: !!(S.profile.employerPlan && d.symbol === 'ASTS'),
  };
  if (d.kind === 'etf') h.er = d.er == null ? undefined : d.er;
  if (h.symbol === 'ASTS' && h.employer) {
    const prev = S.holdings.find(x => x.id === 'ob-asts');
    if (prev && prev.id !== h.id) {
      Object.assign(prev, h, { id: 'ob-asts' });
      S.holdings = S.holdings.filter(x => x.id !== h.id);
      return;
    }
  }
  upsert(S, h);
}
function commitCrypto(S) {
  const d = S.onboarding.draft;
  if (!d?.symbol || !(d.qty > 0)) return;
  upsert(S, { id: d.id, kind: 'crypto', symbol: d.symbol, name: d.symbol, qty: d.qty, currency: 'USD', thesis: d.thesis || undefined, exit: d.exit || undefined });
}

function fundNext(S, kind, key, read, skip) {
  loadFund(S, kind);
  const d = S.onboarding.fund;
  const last = kind === 'study' ? 'stuMore' : 'penMore';
  const order = kind === 'study'
    ? ['stuProvider', 'stuTrack', 'stuBal', 'stuFd', 'stuFa', 'stuP']
    : ['penProvider', 'penTrack', 'penBal', 'penFd', 'penFa', 'penP'];
  const step = S.onboarding.step;
  const nxt = order[order.indexOf(step) + 1] || last;
  if (key === 'provider' || key === 'track') {
    d[key] = skip ? '' : read.text;
  } else if (key === 'balance' || key === 'monthly') {
    const p = parsed(read);
    if (p.bad) return fail(S, 'צריך מספר, או דלג');
    if (p.blank || skip) d[key === 'monthly' ? 'monthlyDeposit' : 'balance'] = null;
    else if (p.n < 0) return fail(S, 'מספר לא שלילי, או דלג');
    else d[key === 'monthly' ? 'monthlyDeposit' : 'balance'] = p.n;
  } else {
    const p = parsed(read);
    if (p.bad) return fail(S, 'צריך מספר, או דלג');
    const prop = key === 'feeDeposit' ? 'feeDeposit' : 'feeAccum';
    if (p.blank || skip) d[prop] = null;
    else if (p.n < 0) return fail(S, 'אחוז לא שלילי, או דלג');
    else d[prop] = p.n / 100;
  }
  writeFund(S, kind);
  return go(S, nxt);
}

export function acceptImport(S, rows) {
  S.holdings = S.holdings.concat(rows);
  S.onboarding.draft = null;
  S.onboarding.err = '';
  go(S, 'holdMenu');
}

export function onboardAct(S, kind, val, read) {
  if (!S.profile) S.profile = { taxResidency: 'IL', materialShareholder: null, employerPlan: null };
  if (!S.onboarding) S.onboarding = { active: true, step: 'intro', hist: [] };
  if (!S.settings) S.settings = { E_ils: null, M: null, cashSince: null, rRef: null, rScen: [null, null, null], mode: 'equal' };
  if (!S.settings.rScen) S.settings.rScen = [null, null, null];
  const step = S.onboarding.step || 'intro';
  if (kind === 'fresh') return 'empty';
  if (kind === 'keepDemo') { S.demoChoice = 'keep'; S.onboarded = true; return 'app'; }
  if (kind === 'back') return back(S);
  if (kind === 'finish') {
    const p = touchProj(S);
    S.proj = { B0: null, P: null, fd: null, fa: null, years: p.years ?? null, G: p.G ?? null, horizonYear: p.horizonYear ?? null };
    S.simulated = false;
    S.onboarded = true;
    S.demoChoice = 'fresh';
    S.onboarding = { active: false, step: 'done', hist: [] };
    return 'app';
  }
  if (kind === 'skip' && !OPTIONAL.has(step)) return fail(S, 'כאן צריך תשובה');
  if (kind === 'pick') return onPick(S, step, val);
  return onNext(S, step, kind === 'skip', read);
}

function onPick(S, step, val) {
  if (step === 'material') {
    S.profile.materialShareholder = val === 'yes';
    return go(S, 'employer');
  }
  if (step === 'employer') {
    S.profile.employerPlan = val === 'yes';
    if (!S.profile.employerPlan) S.holdings = S.holdings.filter(h => h.id !== 'ob-asts');
    return go(S, S.profile.employerPlan ? 'astsQty' : 'goal');
  }
  if (/^q[0-4]$/.test(step)) {
    const k = +step.slice(1);
    if (!S.onboarding.qa) S.onboarding.qa = [null, null, null, null, null];
    S.onboarding.qa[k] = +val;
    setRisk(S);
    return go(S, k < 4 ? 'q' + (k + 1) : 'E');
  }
  if (step === 'M') { S.settings.M = +val; return go(S, 'cashSince'); }
  if (step === 'cashCcy') {
    const amt = S.onboarding.pendingCash ?? S.holdings.find(h => h.id === cashId(S))?.balance;
    if (!(amt > 0)) return fail(S, 'חסר סכום');
    const currency = val === 'USD' ? 'USD' : 'ILS';
    upsert(S, { id: cashId(S), kind: 'cash', name: currency === 'ILS' ? 'מזומן (ILS)' : 'מזומן (USD)', balance: amt, currency });
    S.onboarding.pendingCash = null;
    return go(S, 'cashMore');
  }
  if (step === 'cashMore') {
    if (val === 'yes') { S.onboarding.cashI = (S.onboarding.cashI || 0) + 1; S.onboarding.pendingCash = null; return go(S, 'cashAmt'); }
    return go(S, 'holdMenu');
  }
  if (step === 'holdMenu') {
    if (val === 'done') { S.onboarding.draft = null; return go(S, 'penAsk'); }
    if (val === 'csv') { S.onboarding.draft = { phase: 'csv' }; return go(S, 'csv'); }
    if (val === 'crypto') { S.onboarding.draft = { phase: 'crypto', id: nid(S) }; return go(S, 'cSym'); }
    S.onboarding.draft = { phase: 'sec', id: nid(S), kind: '' };
    return go(S, 'hKind');
  }
  if (step === 'hKind') { if (!S.onboarding.draft) return go(S, 'holdMenu'); S.onboarding.draft.kind = val; return go(S, 'hSym'); }
  if (step === 'penAsk') {
    if (val === 'no') { dropPrefix(S, 'ob-pen-'); S.onboarding.pen = 'no'; S.onboarding.fund = null; return go(S, 'stuAsk'); }
    S.onboarding.pen = 'yes';
    S.onboarding.penI = 0;
    S.onboarding.fund = {};
    return go(S, 'penProvider');
  }
  if (step === 'penMore') {
    if (val === 'yes') { S.onboarding.penI = (S.onboarding.penI || 0) + 1; S.onboarding.fund = {}; return go(S, 'penProvider'); }
    S.onboarding.fund = null;
    return go(S, 'stuAsk');
  }
  if (step === 'stuAsk') {
    if (val === 'no') { dropPrefix(S, 'ob-stu-'); S.onboarding.stu = 'no'; S.onboarding.fund = null; return go(S, 'done'); }
    S.onboarding.stu = 'yes';
    S.onboarding.stuI = 0;
    S.onboarding.fund = {};
    return go(S, 'stuProvider');
  }
  if (step === 'stuMore') {
    if (val === 'yes') { S.onboarding.stuI = (S.onboarding.stuI || 0) + 1; S.onboarding.fund = {}; return go(S, 'stuProvider'); }
    S.onboarding.fund = null;
    return go(S, 'done');
  }
  return fail(S, 'בחר אפשרות');
}

function onNext(S, step, skip, read) {
  if (step === 'intro') return go(S, 'tax');
  if (step === 'tax') { S.profile.taxResidency = read.sel === 'other' ? 'other' : 'IL'; return go(S, 'material'); }
  if (step === 'astsQty') {
    const p = parsed(read);
    if (skip || p.blank) { S.holdings = S.holdings.filter(h => h.id !== 'ob-asts'); return go(S, 'goal'); }
    if (p.bad || !(p.n > 0)) return fail(S, 'כמות חיובית, או דלג');
    upsert(S, { id: 'ob-asts', kind: 'stock', symbol: 'ASTS', name: 'AST SpaceMobile', qty: p.n, currency: 'USD', employer: true });
    return go(S, 'goal');
  }
  if (step === 'goal') {
    const p = parsed(read), proj = touchProj(S);
    if (skip || p.blank) proj.G = null;
    else if (p.bad || !(p.n > 0)) return fail(S, 'סכום חיובי, או דלג');
    else proj.G = p.n;
    return go(S, 'horizon');
  }
  if (step === 'horizon') {
    const p = parsed(read), proj = touchProj(S);
    if (skip || p.blank) { proj.horizonYear = null; proj.years = null; }
    else if (p.bad) return fail(S, 'צריך שנה, או דלג');
    else {
      const y = Math.round(p.n), now = new Date().getFullYear();
      if (y <= now || y > 2100) return fail(S, 'שנה עתידית, למשל ' + (now + 10));
      proj.horizonYear = y; proj.years = y - now;
    }
    return go(S, 'r0');
  }
  if (step === 'r0' || step === 'r1' || step === 'r2') {
    const idx = step === 'r0' ? 0 : step === 'r1' ? 1 : 2;
    const p = parsed(read);
    if (skip || p.blank) S.settings.rScen[idx] = null;
    else if (p.bad) return fail(S, 'צריך מספר, או דלג');
    else S.settings.rScen[idx] = p.n / 100;
    return go(S, step === 'r0' ? 'r1' : step === 'r1' ? 'r2' : 'q0');
  }
  if (step === 'E') {
    const p = parsed(read);
    if (skip || p.blank) S.settings.E_ils = null;
    else if (p.bad || !(p.n > 0)) return fail(S, 'סכום חיובי, או דלג');
    else S.settings.E_ils = p.n;
    return go(S, 'M');
  }
  if (step === 'M' && skip) { S.settings.M = null; return go(S, 'cashSince'); }
  if (step === 'cashSince') {
    S.settings.cashSince = skip || !read.text ? null : read.text;
    return go(S, 'cashAmt');
  }
  if (step === 'cashAmt') {
    const p = parsed(read);
    if (skip || p.blank) { S.onboarding.pendingCash = null; return go(S, 'cashMore'); }
    if (p.bad || !(p.n > 0)) return fail(S, 'סכום חיובי, או דלג');
    S.onboarding.pendingCash = p.n;
    return go(S, 'cashCcy');
  }
  if (step === 'hSym' || step === 'cSym') {
    if (!S.onboarding.draft) return go(S, 'holdMenu');
    const sym = read.text.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!sym) return fail(S, 'צריך סמל');
    S.onboarding.draft.symbol = sym;
    return go(S, step === 'hSym' ? 'hQty' : 'cQty');
  }
  if (step === 'hQty' || step === 'cQty') {
    const p = parsed(read);
    if (p.bad || !(p.n > 0)) return fail(S, 'צריך כמות חיובית');
    S.onboarding.draft.qty = p.n;
    if (step === 'cQty') return go(S, 'cWhy');
    return go(S, S.onboarding.draft.kind === 'etf' ? 'hEr' : 'hSector');
  }
  if (step === 'hEr') {
    const p = parsed(read);
    if (skip || p.blank) S.onboarding.draft.er = null;
    else if (p.bad || p.n < 0) return fail(S, 'אחוז לא שלילי, או דלג');
    else S.onboarding.draft.er = p.n / 100;
    return go(S, 'hSector');
  }
  if (step === 'hSector') { S.onboarding.draft.sector = skip ? '' : read.text; return go(S, 'hWhy'); }
  if (step === 'hWhy') { S.onboarding.draft.thesis = skip ? '' : read.text; return go(S, 'hExit'); }
  if (step === 'hExit') { if (!S.onboarding.draft?.symbol) return go(S, 'holdMenu'); S.onboarding.draft.exit = skip ? '' : read.text; commitSecurity(S); return go(S, 'holdMenu'); }
  if (step === 'cWhy') { S.onboarding.draft.thesis = skip ? '' : read.text; return go(S, 'cExit'); }
  if (step === 'cExit') { if (!S.onboarding.draft?.symbol) return go(S, 'holdMenu'); S.onboarding.draft.exit = skip ? '' : read.text; commitCrypto(S); return go(S, 'holdMenu'); }
  if (step === 'csv') { S.onboarding.draft = null; return go(S, 'holdMenu'); }
  if (step.startsWith('pen') && step !== 'penAsk' && step !== 'penMore') {
    const key = step === 'penProvider' ? 'provider' : step === 'penTrack' ? 'track' : step === 'penBal' ? 'balance' : step === 'penFd' ? 'feeDeposit' : step === 'penFa' ? 'feeAccum' : 'monthly';
    return fundNext(S, 'pension', key, read, skip);
  }
  if (step.startsWith('stu') && step !== 'stuAsk' && step !== 'stuMore') {
    const key = step === 'stuProvider' ? 'provider' : step === 'stuTrack' ? 'track' : step === 'stuBal' ? 'balance' : step === 'stuFd' ? 'feeDeposit' : step === 'stuFa' ? 'feeAccum' : 'monthly';
    return fundNext(S, 'study', key, read, skip);
  }
  return fail(S, 'חסרה תשובה');
}
