// savesweep.js (6.105.0): every tap that saves must land in the store (the athlete, Nov 15, 2026: dashboard taps stopped saving,
// and nothing on screen said so; root cause the 6.77.0 Proxy around the frozen live store, which the unfrozen stand-in hid).
// Taps every button on every tab, once, against the stand-in store (frozen like the live one since 6.105.0), then checks:
//   1. every store kind in savesweep-expect.json got at least one write (a tap that used to save still saves),
//   2. no page error and no failed save the page recorded (window.CX.saveLog),
//   3. with every write refused (__failWrites), the tapped card shows the red "Not saved" chip (6.111.0; the top bar is gone, the athlete: "less intrusive").
// Usage: node savesweep.js <page.html> [--learn]   (--learn prints the kinds written, to refresh savesweep-expect.json)
// Exit 1 on a failure. Build the page with build.py --lvx so the level up screen and its "Thanks, coach" are in the sweep.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const TABS = ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races'];
const SKIP = /^(Open Garmin|Refresh|Reload)/i; // links out and the fresh-data pull do not save to the store

async function sweep(b, page, fail) {
  const kinds = new Set(), errs = [], saveLog = [];
  for (const tab of TABS) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    p.on('pageerror', (e) => errs.push(tab + ': ' + e.message.slice(0, 140)));
    if (fail) await p.addInitScript(() => { window.__failWrites = true; });
    await p.goto('file://' + page); await p.waitForTimeout(1500);
    // count the buttons with the tab open, and again as taps add more (Nov 17, 2026: counted on the first tab, the sweep ran out
    // before the Lifts set Done buttons once the day picker added 8 buttons above them, so lift_log looked missing)
    await p.evaluate((t) => { const b = document.getElementById('tab-' + t); if (b) b.click(); }, tab); await p.waitForTimeout(300);
    for (let i = 0; i < 400; i++) {
      if (i >= await p.evaluate(() => document.querySelectorAll('button').length)) break;
      await p.evaluate((t) => { const b = document.getElementById('tab-' + t); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); }, tab);
      const ok = await p.evaluate(([i, skip]) => {
        const all = [...document.querySelectorAll('button')]; const el = all[i];
        if (!el || el.disabled || el.id.startsWith('tab-') || new RegExp(skip, 'i').test(el.textContent.trim())) return false;
        // the routine row, Need something else now? and Looking for something else? swap the Lifts session for a routine list, so
        // the sweep never reached a set box again and lift_log went missing (Nov 17, 2026); the list's Use today still saves lift_choice
        if (el.matches('#l-pick .lx-rt, .lx-need, .lx-look')) return false;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height || el.closest('[hidden]')) return false;
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.click(); return true;
      }, [i, SKIP.source]);
      if (ok) await p.waitForTimeout(fail ? 30 : 15);
    }
    await p.waitForTimeout(fail ? 1500 : 600);
    const r = await p.evaluate(() => ({ writes: window.__harness.writes.map((w) => w[0].split('/')[0]), log: (window.CX && window.CX.saveLog) || [],
      line: (document.body.innerText.match(/Not saved/g) || []).length, failed: window.__harness.failed || 0 }));
    r.writes.forEach((k) => kinds.add(k)); saveLog.push(...r.log.map((x) => tab + ': ' + x));
    if (fail) { const taps = r.log.filter((x) => /^tap /.test(x)); if (taps.length && !r.line) errs.push(`${tab}: refused ${taps.join('; ') || 'probe only'}, Not saved lines ${r.line}`); }
    await p.close();
  }
  return { kinds: [...kinds].sort(), errs, saveLog };
}

(async () => {
  const page = path.resolve(process.argv[2] || 'index.html'), learn = process.argv.includes('--learn');
  const b = await chromium.launch();
  const ok = await sweep(b, page, false);
  if (learn) { console.log(JSON.stringify(ok.kinds)); await b.close(); return; }
  const expect = JSON.parse(fs.readFileSync(path.join(__dirname, 'savesweep-expect.json'), 'utf8')).kinds;
  const missing = expect.filter((k) => !ok.kinds.includes(k));
  const bad = await sweep(b, page, true);
  await b.close();
  const out = { written: ok.kinds, missing, errors: ok.errs, failed_saves: ok.saveLog, refused_run: bad.errs };
  console.log(JSON.stringify(out, null, 1));
  if (missing.length || ok.errs.length || out.failed_saves.length || bad.errs.length) process.exitCode = 1;
})();
