// תיק מדומה לבדיקה — כל המספרים בדויים. אין כאן נתונים אמיתיים של יהונתן.
export const SAMPLE_PORTFOLIO = {
  simulated: true,
  holdings: [
    { id: 'h1', kind: 'etf',   symbol: 'VOO',  name: 'Vanguard S&P 500 ETF', qty: 100, currency: 'USD', er: 0.0003, sector: 'מדד רחב ארה״ב', thesis: 'ליבה ארוכת טווח (דוגמה)' },
    { id: 'h2', kind: 'etf',   symbol: 'QQQ',  name: 'Invesco QQQ', qty: 50, currency: 'USD', er: 0.0020, sector: 'טכנולוגיה', thesis: '' },
    { id: 'h3', kind: 'stock', symbol: 'NVDA', name: 'NVIDIA', qty: 800, currency: 'USD', sector: 'טכנולוגיה', thesis: 'ביקוש לשבבי AI (דוגמה)' },
    { id: 'h4', kind: 'stock', symbol: 'MSFT', name: 'Microsoft', qty: 30, currency: 'USD', sector: 'טכנולוגיה', thesis: '' },
    { id: 'h5', kind: 'stock', symbol: 'ASTS', name: 'AST SpaceMobile (מניית מעסיק)', qty: 4000, currency: 'USD', sector: 'תקשורת לוויינית', employer: true, thesis: 'מניות עובד' },
    { id: 'h6', kind: 'stock', symbol: 'SIMX', name: 'Simulated Corp (בדיוני)', qty: 500, currency: 'USD', sector: 'דמו', thesis: '' },
    { id: 'h7', kind: 'pension', name: 'קרן פנסיה חדשה מקיפה — מסלול כללי (מדומה)', balance: 420000, currency: 'ILS', feeDeposit: 0.015, feeAccum: 0.0025, monthlyDeposit: 2500, track: 'כללי' },
    { id: 'h8', kind: 'study', name: 'קרן השתלמות — מסלול מניות (מדומה)', balance: 160000, currency: 'ILS', feeDeposit: 0, feeAccum: 0.008, monthlyDeposit: 1200, track: 'מניות' },
    { id: 'h9', kind: 'study', name: 'קרן השתלמות — מסלול כללי (מדומה)', balance: 40000, currency: 'ILS', feeDeposit: 0, feeAccum: null, track: 'כללי' },
    { id: 'h10', kind: 'crypto', symbol: 'BTC', name: 'Bitcoin', qty: 0.15, currency: 'USD' },
    { id: 'h11', kind: 'crypto', symbol: 'ETH', name: 'Ethereum', qty: 2, currency: 'USD' },
    { id: 'h12', kind: 'cash', name: 'מזומן בחשבון ברוקר', balance: 5000, currency: 'USD', interest: 0 },
    { id: 'h13', kind: 'cash', name: 'עו״ש בבנק', balance: 90000, currency: 'ILS', interest: 0 },
  ],
  settings: { E_ils: 12000, M: 4, cashSince: '2026-09-01', rRef: null, rScen: [null, null, null], mode: 'equal' },
  journal: [],
  reviewed: {},
  risk: null,
};
export const CSV_TEMPLATE = 'kind,symbol,name,qty,balance,currency,er,feeDeposit,feeAccum,monthlyDeposit,sector,employer,thesis\n' +
  'stock,AAPL,Apple,10,,USD,,,,,טכנולוגיה,,דוגמה\n' +
  'etf,SPY,SPDR S&P 500,5,,USD,0.0009,,,,מדד רחב ארה״ב,,\n' +
  'pension,,קרן פנסיה,,300000,ILS,,0.01,0.0022,2000,,,\n' +
  'cash,,עו״ש,,20000,ILS,,,,,,,\n';
