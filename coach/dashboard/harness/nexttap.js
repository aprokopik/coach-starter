// nexttap.js (the athlete, Nov 15, 2026: "Is this supposed to be a button?"): taps "Closest to a new level" on the Fitness
// Scorecard and checks that the tile it opens ends up on screen with focus. Usage: node nexttap.js <index.html>. Exit 1 if not.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await p.addInitScript(() => { window.__liveData = true; });
  await p.goto('file://' + process.argv[2]);
  await p.waitForFunction(() => { const r = document.getElementById('t-ready'); return r && r.textContent && r.textContent !== '—'; }, null, { timeout: 60000 });
  await p.click('#tab-trends'); await p.waitForTimeout(500);
  const ok = await p.$('#mx-next'); if (!ok) { console.log('no Closest to a new level card'); await b.close(); return; }
  await p.click('#mx-next'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const a = document.activeElement; const q = a && a.getBoundingClientRect(); return { id: a && a.id, top: q && Math.round(q.top), bottom: q && Math.round(q.bottom), vh: innerHeight }; });
  const seen = /^f-/.test(r.id || '') && r.top >= 0 && r.top < r.vh;
  console.log(JSON.stringify({ ...r, seen, errs })); if (!seen || errs.length) process.exitCode = 1;
  await b.close(); })();
