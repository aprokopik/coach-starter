// Spot contrast probe on the live host colours: a few Today hero and Week race-week texts against their backgrounds, light and dark at 360.
// node contrast.js <page.html>   (build the page with --host live). For the full 4.5:1 text and 3:1 non-text check use sweep.js.
const { chromium } = require('./pw'); const path = require('path');
(async () => { const b = await chromium.launch();
  for (const mode of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 360, height: 800 }, colorScheme: mode });
    await p.goto('file://' + path.resolve(process.argv[2]) + '?datamode=' + mode); await p.waitForTimeout(1200);
    await p.click('#tab-today'); await p.waitForTimeout(300); const a = await p.evaluate(probe, [['.td-nm-end', '#t-hero'], ['.td-nm-k', '#t-hero'], ['.td-nm-u', '#t-hero'], ['#t-nm-v', '#t-hero'], ['.td-nm-sd', '#t-nm-bar', 'bg'], ['.td-nm-sd', '#t-hero', 'bg']]);
    await p.click('#tab-week'); await p.waitForTimeout(300); const c = await p.evaluate(probe, [['.wk-rwname', '#w-race'], ['.wk-rwline', '#w-race']]);
    console.log(mode, JSON.stringify(a.concat(c)));
  }
  await b.close();
  function probe(pairs) {
    const cv = document.createElement('canvas').getContext('2d');
    const rgb = (s) => { cv.fillStyle = '#000'; cv.fillStyle = s; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
    const solidBg = (e) => { for (; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(.*, 0\)$/.test(c) && c !== 'transparent') return c; } return 'white'; };
    const L = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    return pairs.map(([fs, bs, kind]) => { const f = document.querySelector(fs), bgEl = document.querySelector(bs); if (!f) return fs + ':none';
      let fc = kind === 'bg' ? getComputedStyle(f).backgroundImage.match(/(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\))/)?.[0] : getComputedStyle(f).color;
      const bc = solidBg(bgEl); const l1 = L(rgb(fc)), l2 = L(rgb(bc)); return `${fs}/${bs}: ${((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)}`; });
  }
})();
