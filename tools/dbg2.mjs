import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
for (const t of ['portfolio','alerts','screen','projection','journal','more']) {
await page.goto('http://127.0.0.1:8765/#'+t); await page.waitForTimeout(400);
console.log(t, await page.evaluate(()=>{ const w=[]; document.querySelectorAll('#view *').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width>380) w.push(e.tagName+'.'+e.className+' '+Math.round(r.width)+' '+(e.textContent||'').slice(0,40))}); return [innerWidth, w.slice(-4)]; }));
}
await browser.close();
