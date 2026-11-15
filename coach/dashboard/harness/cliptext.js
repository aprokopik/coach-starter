// Text cut short at phone widths: every visible element whose text is clamped (line-clamp) or cut with an ellipsis and does not
// fit, on every tab, at 360 and 390 px, with each Fitness tile's own text. A cut name hides what a tile is (found Nov 15, 2026:
// "Aerobic engine (VO2max)" showed as "Aerobic engine..." at 360 px). Exit 1 when anything is cut.
// node cliptext.js [index.html]
const { chromium } = require('./pw'); const path = require('path');
(async () => {
  const file = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
  const b = await chromium.launch(); const cut = [];
  for (const w of [360, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } }); await p.goto(file); await p.waitForTimeout(1500);
    for (const t of ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races']) {
      await p.click('#tab-' + t); await p.waitForTimeout(700);
      const r = await p.evaluate((t) => {
        const out = []; const panel = document.getElementById(t);
        for (const e of panel.querySelectorAll('*')) {
          if (!e.getClientRects().length || !e.textContent.trim()) continue;
          const c = getComputedStyle(e); const clamp = c.webkitLineClamp && c.webkitLineClamp !== 'none'; const ell = c.textOverflow === 'ellipsis';
          if (!clamp && !ell) continue;
          if ((clamp && e.scrollHeight > e.clientHeight + 1) || (ell && e.scrollWidth > e.clientWidth + 1)) out.push((e.id || e.className) + ': ' + e.textContent.trim().slice(0, 60));
        }
        return out;
      }, t);
      for (const x of r) cut.push(`${w} ${t} ${x}`);
    }
    await p.close();
  }
  await b.close();
  console.log(cut.length ? 'CUT\n' + cut.join('\n') : 'OK, no text cut at 360 or 390 px'); process.exit(cut.length ? 1 : 0);
})();
