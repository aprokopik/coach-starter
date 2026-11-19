// spanhold.js (the athlete, Nov 19, 2026: "Went from 1 year to full time, and the page jumped up to the top"): with the 5K tile
// open on Fitness, taps every range (1M 3M 1Y All) and checks the tile stays where it was on screen; then the same on Health
// for the block under the range row. Each run twice: the window scrolls, and (like the Claude app) a box around the page
// scrolls and is thrown to its top one frame after the tap. Usage: node spanhold.js <index.html>. Exit 1 when anything moves.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); let bad = 0;
  for (const box of [false, true]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
    await p.addInitScript(() => { window.__liveData = true; try { localStorage.setItem('cx-span', '1y'); } catch (e) { /* private */ } });
    await p.goto('file://' + process.argv[2]);
    await p.waitForFunction(() => { const r = document.getElementById('t-ready'); return r && r.textContent && r.textContent !== '—'; }, null, { timeout: 60000 });
    if (box) await p.evaluate(() => { const w = document.createElement('div'); w.id = 'hostbox'; w.style.cssText = 'height:100vh;overflow-y:auto'; const cx = document.getElementById('cx'); cx.parentNode.insertBefore(w, cx); w.append(cx); document.documentElement.style.overflow = 'hidden';
      // the app's box jump: one frame after a range tap the box is thrown to its top
      document.addEventListener('change', (e) => { if (e.target.closest('.ft-span')) requestAnimationFrame(() => { w.scrollTop = 0; }); }); });
    const sc = box ? "document.getElementById('hostbox')" : 'document.scrollingElement';
    for (const [tab, seg, tile] of [['trends', 'f-span', 'f-5k'], ['goals', 'g-span', null]]) {
      await p.click('#tab-' + tab); await p.waitForTimeout(600);
      if (tile) { await p.evaluate(([t, s]) => { const n = document.getElementById(t); eval(s).scrollTop += n.getBoundingClientRect().top - 300; }, [tile, sc]); await p.click('#' + tile); await p.waitForTimeout(700); }
      else { await p.evaluate((s) => { eval(s).scrollTop = 1500; }, sc); await p.waitForTimeout(300); }
      // the block to watch: the open tile, else the named block nearest the bottom of the range row
      const watch = await p.evaluate(([t, seg]) => { if (t) return t; const line = document.getElementById(seg).getBoundingClientRect().bottom; let best = null, bt = Infinity;
        for (const n of document.getElementById(seg).closest('.page').querySelectorAll('[id]')) { if (n.closest('.ft-span') || n.hidden) continue; const r = n.getBoundingClientRect(); if (r.height && r.top >= line && r.top < innerHeight && r.top < bt) { best = n.id; bt = r.top; } } return best; }, [tile, seg]);
      const top = () => p.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top), watch);
      for (const v of ['all', '1m', '3m', '1y']) {
        const t0 = await top(); await p.click(`#${seg} label:has(input[value="${v}"])`); await p.waitForTimeout(1800);
        const t1 = await top(), on = await p.evaluate(([s, v]) => document.querySelector(`#${s} input[value="${v}"]`).checked, [seg, v]);
        const ok = Math.abs(t1 - t0) <= 3 && on; if (!ok) bad++;
        console.log(`${box ? 'box   ' : 'window'} ${tab} ${watch} ${v}: ${t0} -> ${t1}${on ? '' : ' (range not picked)'} ${ok ? 'ok' : 'MOVED'}`);
      }
    }
    if (errs.length) { bad++; console.log('page errors', errs); }
    await p.close();
  }
  await b.close(); if (bad) { console.log(bad + ' failed'); process.exitCode = 1; } })();
