/* Speed check (6.76.0): how fast the page answers a tap, on a phone-like CPU, against the budget in speed-budget.json.
   node speed.js --page <page.html> [--runs 5] [--rate 4] [--width 390] [--json out.json]
   rate 4 slows the computer's CPU four times (a mid range phone); every figure is the middle of the runs.
   "shows" = tap to the next frame (the tab or answer is on screen); "drawn" = until the tab is fully drawn after it.
   The quick check answer is timed with every save held 400 ms (a phone network), as the card must not wait for it.
   Exit 1 when a figure is over its budget. Local mock only: the live page also waits on its download (MAINTAIN.md). */
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('playwright is missing: npm install --no-save d3@7 playwright (README.md)'); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const page = path.resolve(arg('--page', path.join(__dirname, 'index.html'))), runs = +arg('--runs', 5), rate = +arg('--rate', 4), width = +arg('--width', 390);
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-budget.json'), 'utf8'));
const med = (a) => { a = a.slice().sort((x, y) => x - y); return Math.round(a[Math.floor(a.length / 2)]); };
(async () => {
  const b = await chromium.launch(); const res = {}; const add = (k, v) => (res[k] = res[k] || []).push(v);
  for (let r = 0; r < runs; r++) {
    const ctx = await b.newContext({ viewport: { width, height: 844 } });
    await ctx.addInitScript(() => { window.__slowWrites = 400; });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const t0 = Date.now(); await p.goto('file://' + page, { timeout: 180000 }); await p.waitForFunction(() => window.__harness && window.__harness.ready, null, { timeout: 180000 }); add('open (page work only)', Date.now() - t0);
    const tap = (find) => p.evaluate(async (find) => {
      const e = new Function('return ' + find)(); if (!e) return null;
      const s = performance.now(); e.click(); await new Promise((r) => requestAnimationFrame(r)); const a = performance.now() - s;
      await new Promise((r) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => setTimeout(r, 0)), 0))); return [a, performance.now() - s];
    }, find);
    const rec = (k, v) => { if (v) { add(k + ' shows', v[0]); add(k + ' drawn', v[1]); } };
    for (const t of ['week', 'trends', 'goals', 'races', 'lifts', 'checkins', 'today']) { await p.waitForTimeout(200); rec('tab ' + t, await tap(`document.getElementById('tab-${t}')`)); }
    for (const [tab, l] of [['trends', '1y'], ['trends', 'all'], ['goals', '1y']]) {
      await p.click('#tab-' + tab); await p.waitForTimeout(400);
      rec((tab === 'trends' ? 'Fitness' : 'Health') + ' range ' + l, await tap(`[...document.querySelectorAll('#${tab} input[type=radio]')].find((i) => i.value === '${l}' && i.offsetParent)`));
    }
    await p.click('#tab-today'); await p.waitForTimeout(400);
    const qc = await p.evaluate(async () => { const t = [...document.querySelectorAll('#t-qc .qc-tile')].find((x) => x.offsetParent); if (!t) return null; const q0 = (document.getElementById('t-qc-q') || {}).textContent; const s = performance.now(); t.click();
      return new Promise((res) => { const c = () => { const q = document.getElementById('t-qc-q'); if (!q || q.textContent !== q0) res(performance.now() - s); else if (performance.now() - s > 5000) res(5000); else requestAnimationFrame(c); }; c(); }); });
    if (qc !== null) add('quick check answer to next question', qc);
    await ctx.close();
  }
  await b.close();
  const out = {}; let over = 0;
  console.log(['figure', 'ms', 'budget'].join('\t'));
  for (const k of Object.keys(res)) {
    const v = med(res[k]); const lim = budget[k] !== undefined ? budget[k] : k.endsWith(' shows') ? budget['* shows'] : k.endsWith(' drawn') ? budget['* drawn'] : undefined;
    out[k] = { ms: v, budget: lim }; const bad = lim !== undefined && v > lim; if (bad) over++;
    console.log([k, v, lim === undefined ? '' : lim + (bad ? '  OVER' : '')].join('\t'));
  }
  const j = arg('--json'); if (j) fs.writeFileSync(j, JSON.stringify(out, null, 1));
  console.log(over ? `${over} over budget` : 'all within budget'); process.exit(over ? 1 : 0);
})();
