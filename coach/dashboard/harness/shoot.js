// One full-page PNG per tab at 360 px, light (the host toggle left alone). Fitness opens its first tile, Health its first row.
// node shoot.js <page.html> <out dir>
const { chromium } = require('./pw');
const path = require('path'); const fs = require('fs');
(async () => {
  fs.mkdirSync(process.argv[3], { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.resolve(process.argv[2])); await p.waitForTimeout(1500);
  const tabs = ['today','checkins','week','lifts','trends','goals','races'];
  for (const t of tabs) {
    await p.evaluate((t) => { const el = document.querySelector(`[role=tab][aria-controls="${t}"]`) || [...document.querySelectorAll('[role=tab]')].find(x => (x.textContent||'').toLowerCase().includes(t === 'trends' ? 'fitness' : t === 'goals' ? 'health' : t === 'races' ? 'season' : t === 'checkins' ? 'check' : t)); el && el.click(); }, t);
    await p.waitForTimeout(900);
    if (t === 'trends') { await p.evaluate(() => { const b = document.querySelector('#trends .ck-tile[aria-expanded]') || document.querySelector('#trends button.ck-tile'); b && b.click(); }); await p.waitForTimeout(800); }
    if (t === 'goals') { await p.evaluate(() => { const b = document.querySelector('#hp-list button.ck-row'); b && b.click(); }); await p.waitForTimeout(800); }
    await p.screenshot({ path: process.argv[3] + '/' + t + '.png', fullPage: true });
  }
  console.log('errors', errs.length, errs.slice(0,3).join(' | '));
  await b.close();
})();
