// livedata.js (6.77.5): times the open, a Week tap and a Fitness tap with the store handing back fresh read-only data and running
// calcs on every dash.data call, as the live runtime does (window.__liveData; the athlete's Nov 15 phone record: 1,054 calls, 38 s).
// Usage: node livedata.js <page.html> [more pages]. Exit 1 when the open takes over 1,000 ms or a page error shows.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
    await p.addInitScript(() => { window.__liveData = true; });
    const t0 = Date.now(); await p.goto('file://' + f);
    await p.waitForFunction(() => { const r = document.getElementById('t-ready'); return r && r.textContent && r.textContent !== '—'; }, null, { timeout: 120000 });
    const ready = Date.now() - t0; await p.waitForTimeout(500);
    const t1 = Date.now(); await p.click('#tab-week'); await p.waitForFunction(() => !document.getElementById('week').hidden); await p.waitForTimeout(50); const wk = Date.now() - t1;
    const t2 = Date.now(); await p.click('#tab-trends'); await p.waitForTimeout(50); await p.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r)))); const fit = Date.now() - t2;
    console.log(f.split('/').pop(), JSON.stringify({ ready_ms: ready, week_ms: wk, fitness_ms: fit, errs: errs.slice(0, 3) })); if (ready > 1000 || errs.length) process.exitCode = 1;
    await p.close(); }
  await b.close(); })();
