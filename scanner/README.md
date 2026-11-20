# סורק יומי — STUB

לא פעיל, לא מחובר לשום API, לא נפרס. כרגע `node scanner/scan.mjs` (או `simulate.mjs`) מייצר את
`data/signals.json` מנתונים מדומים לגמרי.

- `universe.txt` — רשימת סריקה רחבה (69 סמלים בדוגמה). הסמלים מהתיק מוסתרים בה; אין כמויות/סכומים.
- `simulate.mjs` — מחולל מחירים מדומים (seed קבוע) ומחשב אותות לפי `js/logic.js` (אותה לוגיקה שהאפליקציה משתמשת בה).
- `scan.mjs` — נקודת כניסה עתידית ל-GitHub Actions. במצב לא-חי קורא ל-simulate.
- `workflow-template/daily-scan.yml` — תבנית workflow, לא בתיקיית `.github`, לכן לא תרוץ.

## סכמת signals.json (schema 1)
`{ generatedAt, simulated, technicalAsOf, fx{USDILS,date,source}, crypto{BTC,ETH}, symbols:[{ symbol, lastClose, prevClose, closeDate, asOf, r12_1, r12, sma10m, t1, t2, t3, dd, peak252, decile, events:[{type,date,source}], form4:[{code,plan10b51,date,note,source}], fund{pe,revGrowth} }] }`

האפליקציה מורידה את הקובץ ומצליבה מקומית מול הכמויות שבמכשיר.
