import { chromium, devices } from 'playwright-core';
const base = 'http://127.0.0.1:8765/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('dialog', d => d.accept());
const out = process.argv[2] || '/workspace/portfolio-pwa/screenshots';
await page.goto(base); await page.waitForSelector('.big');
await page.screenshot({ path: out + '/1-portfolio.png' });
await page.screenshot({ path: out + '/1b-portfolio-full.png', fullPage: true });
const txt = await page.textContent('#view'); console.log('total:', await page.textContent('.big'));
await page.click('[data-tab=alerts]'); await page.waitForSelector('.alert');
const titles = await page.$$eval('.alert h3', es => es.map(e => e.textContent));
console.log('alerts:', titles);
console.log('reloc visible before tap:', await page.$('.reloc') !== null);
const rb = await page.$('[data-reloc]'); await rb.click(); await page.waitForSelector('.reloc');
await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: out + '/2-alerts.png' });
await page.$eval('.alert.red details', d => d.open = true);
await page.$eval('.alert.red .tax', e => e.scrollIntoView({ block: 'start' })); await page.evaluate(() => scrollBy(0, -70)); await page.screenshot({ path: out + '/2a-red-alert-reloc.png' });
await page.screenshot({ path: out + '/2b-alerts-full.png', fullPage: true });
// projection
await page.click('[data-tab=projection]');
await page.fill('#r0', '3'); await page.fill('#r1', '6'); await page.fill('#r2', '9'); await page.fill('#pG', '1500000');
await page.click('[data-act=saveProj]'); await page.waitForSelector('svg polyline');
await page.screenshot({ path: out + '/3-projection.png' });
// journal via reviewed
await page.click('[data-tab=alerts]'); await page.click('[data-reviewed]');
await page.click('[data-tab=journal]'); await page.selectOption('#jDec', 'לא עקבתי'); await page.fill('#jNote', 'בדיקה <script>x</script>'); await page.click('[data-act=addJournal]');
console.log('journal entries:', await page.$$eval('#view .card.small', e => e.length));
await page.waitForTimeout(2000); await page.screenshot({ path: out + '/4-journal.png' });
// screen
await page.click('[data-tab=screen]'); await page.waitForSelector('#testAmt');
await page.screenshot({ path: out + '/5-screen.png' });
// more: risk + holding edit + csv
await page.click('#moreBtn'); await page.selectOption('#q1', '3'); await page.click('[data-act=saveRisk]');
await page.click('[data-act=appendCsv]');
await page.click('[data-tab=portfolio]'); console.log('holdings after csv append:', await page.$$eval('[data-hold]', e => e.length));
await page.click('[data-hold=h3]'); await page.waitForSelector('#f_thesis'); await page.fill('#f_thesis', 'תזה חדשה'); await page.screenshot({ path: out + '/6-holding-thesis.png' });
await page.click('[data-act=saveHolding]');
console.log('thesis saved:', (await page.textContent('#view')).includes('תזה חדשה'));
// SW + manifest
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
console.log('sw registered:', sw);
// offline reload
await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.waitForSelector('.big'); console.log('controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller)); await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.big', { timeout: 5000 }).then(() => console.log('offline reload OK')).catch(() => console.log('offline reload FAILED'));
await ctx.setOffline(false);
console.log('errors:', errs);
await browser.close();
