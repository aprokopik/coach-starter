// lvseen.js (6.77.4): a win already seen in the store must never open the level up screen, even when store reads are slow
// (the athlete, Nov 15: a dimmed Today until a tap). Usage: node lvseen.js <page built with --lvx>. Exit 1 when the screen opened.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.addInitScript(() => { window.__slowReads = 1500; window.__seed = { 'seen/levelups': { ids: ['bike|stage-2|2026-11-13','bike|Top 20%|2026-11-13','bike|goal-Target|2026-11-13'] } };
      window.__opened = 0; new MutationObserver(() => { const b = document.getElementById('t-lvup'); if (b && !b.hidden) window.__opened++; }).observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); });
    await p.goto('file://' + f); await p.waitForTimeout(3000);
    const r = await p.evaluate(() => ({ opened: window.__opened, hiddenNow: document.getElementById('t-lvup').hidden })); console.log(f.split('/').pop(), JSON.stringify(r)); if (r.opened || !r.hiddenNow) process.exitCode = 1;
    await p.close(); }
  await b.close(); })();
