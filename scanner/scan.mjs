// STUB לסורק היומי האמיתי. לא קורא לשום API בגרסה זו.
// שלבים מתוכננים (לפי התוכנית ולפי סקירת היועץ):
//  1. קריאת universe.txt — רשימה רחבה שהסמלים של יהונתן מוסתרים בה. אין כמויות.
//  2. מחירי סגירה יומיים לכל הרשימה (ספק לבחירה: Finnhub/אחר; לאמת מכסה לפני הפעלה).
//  3. רק אחרי יום המסחר האחרון בחודש: חישוב T1–T3 ו-DD (js/logic.js) ושמירה עד החודש הבא.
//  4. יומי: מדד יומי של SEC EDGAR (8-K 2.02/4.01/4.02/5.02/8.01, going concern, טופס 4) לכל הרשימה.
//  5. כתיבת data/signals.json באותו סכמה של הקובץ המדומה. התאמה לתיק — רק בטלפון.
//  6. דחיפה (Web Push) בנוסח כללי בלי שמות סמלים — עתידי.
import { fileURLToPath } from 'node:url';
const LIVE = process.env.SCANNER_LIVE === '1';
if (!LIVE) {
  console.log('scanner stub: live mode disabled — generating simulated signals instead');
  await import(new URL('./simulate.mjs', import.meta.url));
} else {
  throw new Error('Live scanning is not implemented in v1 (by design).');
}
