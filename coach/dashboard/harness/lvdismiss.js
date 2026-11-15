// lvdismiss.js (6.77.2): the level up screen must close on "Thanks, coach" and free the page even when every store call throws
// (the athlete, Nov 15: on his phone the store failed and the button did nothing). Usage: node lvdismiss.js <page built with --lvx>. Exit 1 on a failure.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const mode of ['ok', 'throwing']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }); const errs = [];
    p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
    
    await p.goto('file://' + process.argv[2]); await p.waitForTimeout(1500);
    if (mode === 'throwing') await p.evaluate(async () => { const db = await window.claude.use('db'); const d0 = db.doc; db.doc = (x) => { throw new TypeError('store refused'); }; });
    const H = await p.evaluate(() => document.documentElement.scrollHeight); await p.setViewportSize({ width: 390, height: H }); await p.waitForTimeout(1500);
    const top = await p.evaluate(() => Math.round(document.querySelector('.td-lvx-card').getBoundingClientRect().top));
    await p.locator('.td-lvx-ok').tap({ timeout: 4000 }); await p.waitForTimeout(400);
    const closed = await p.evaluate(() => document.getElementById('t-lvup').hidden);
    await p.locator('#tab-week').tap({ timeout: 4000 }); await p.waitForTimeout(400);
    const week = await p.evaluate(() => !document.getElementById('week').hidden); console.log(mode, JSON.stringify({ top, closed, week, errs })); if (!closed || !week || errs.length) process.exitCode = 1;
    await p.close(); }
  await b.close(); })();
