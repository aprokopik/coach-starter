#!/usr/bin/env node
/* Render a harness page with Playwright and measure it (overflow, taps under 44 px, text under 11 px, text contrast, redraw time).
   node render.js [--page index.html] --tab today --width 360 --mode dark --out shot.png [--full] [--open "<selector>"] [--json report.json] [--scale 2]
   node render.js [--page index.html] --all [--full] [--json report.json]   every tab x [360,390,430,640,900,1200] x [light,dark] -> shots/
   --page defaults to index.html in this folder (build.py's default output). File sizes in the report are the page files in
   coach/dashboard of this checkout. sweep.js reads measure() from this file. */
const fs = require('fs');
const path = require('path');
const playwright = require('./pw');

const HERE = __dirname;
const REPO_DASH = path.join(__dirname, '..'); // coach/dashboard of this checkout
const TABS = ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races'];
const WIDTHS = [360, 390, 430, 640, 900, 1200];
const MODES = ['light', 'dark'];

function args(argv) {
  const a = { tab: 'today', width: 390, mode: 'light', out: null, full: false, open: null, json: null, scale: 1, all: false, page: path.join(HERE, 'index.html') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--full') a.full = true;
    else if (k === '--all') a.all = true;
    else if (k.startsWith('--')) { a[k.slice(2)] = argv[++i]; }
  }
  a.width = Number(a.width); a.scale = Number(a.scale) || 1;
  return a;
}

function fileSizes() {
  const o = {};
  for (const f of fs.readdirSync(REPO_DASH).sort()) { const st = fs.statSync(path.join(REPO_DASH, f)); if (st.isFile()) o[f] = st.size; }
  return o;
}

// Runs in the page: every measurement for the current state.
function measure() {
  const vw = document.documentElement.clientWidth;
  const sel = (el) => {
    const parts = [];
    for (let e = el, d = 0; e && e.nodeType === 1 && d < 5; e = e.parentElement, d++) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + '#' + e.id); break; }
      const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : (e.className && e.className.baseVal ? e.className.baseVal.trim().split(/\s+/).slice(0, 2) : []);
      if (cls.length) s += '.' + cls.join('.');
      const p = e.parentElement;
      if (p) { const same = [...p.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; }
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const inHost = (el) => !!el.closest('.host-toolbar');
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const all = [...document.querySelectorAll('#dash-root *')].filter((e) => !inHost(e));
  const vis = all.filter(visible);
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();

  // horizontal overflow
  const se = document.documentElement;
  const over = [];
  for (const e of vis) {
    const r = e.getBoundingClientRect();
    if (r.right > vw + 0.5) {
      let clip = null;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox !== 'visible') { clip = sel(p); break; } }
      over.push({ selector: sel(e), overflowPx: Math.round(r.right - vw), clippedBy: clip });
    }
  }
  over.sort((a, b) => (a.clippedBy ? 1 : 0) - (b.clippedBy ? 1 : 0) || b.overflowPx - a.overflowPx);

  // tap targets
  const tapSel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=button], summary';
  const taps = new Set(vis.filter((e) => e.matches(tapSel)));
  for (const l of vis.filter((e) => e.tagName === 'LABEL' && e.querySelector('input'))) taps.add(l);
  const tapSmall = [];
  for (const e of taps) {
    if (e.tagName === 'INPUT' && e.closest('label') && taps.has(e.closest('label'))) continue; // label carries the target
    const r = e.getBoundingClientRect();
    if (r.width < 44 || r.height < 44) tapSmall.push({ selector: sel(e), w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30) });
  }

  // colours
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over_ = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      if (e.namespaceURI === 'http://www.w3.org/2000/svg' && e.tagName.toLowerCase() !== 'svg') continue;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : (parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]);
    while (layers.length) base = over_(layers.pop(), base);
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const contrast = []; const small = []; let textEls = 0;
  for (const e of vis) {
    const t = ownText(e); if (!t) continue;
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
    textEls++;
    const cs = getComputedStyle(e);
    const size = parseFloat(cs.fontSize);
    if (size < 11) small.push({ selector: sel(e), size, text: t.slice(0, 30) });
    const isSvg = e.namespaceURI === 'http://www.w3.org/2000/svg';
    let fg = parse(isSvg ? cs.fill : cs.color); if (!fg || fg[3] === 0) continue;
    const bg = bgOf(e);
    fg = over_([fg[0], fg[1], fg[2], fg[3] * opacityOf(e)], bg);
    const r = ratio(fg, bg);
    const bold = Number(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (r < need) contrast.push({ selector: sel(e), fg: hex(fg), bg: hex(bg), ratio: Math.round(r * 100) / 100, size, text: t.slice(0, 30) });
  }

  // svg charts
  const svgs = vis.filter((e) => e.tagName.toLowerCase() === 'svg');
  const charts = svgs.map((s) => { const r = s.getBoundingClientRect(); return { selector: sel(s), w: Math.round(r.width), h: Math.round(r.height), width100: s.getAttribute('width') === '100%', viewBox: s.hasAttribute('viewBox') }; });

  return {
    viewport: vw,
    horizontalOverflow: se.scrollWidth > se.clientWidth,
    scrollWidth: se.scrollWidth,
    overflowElements: over.slice(0, 20), overflowElementCount: over.length,
    tapTargetCount: taps.size, tapTargets: tapSmall,
    textElements: textEls, smallText: small, contrast,
    svgCharts: { count: svgs.length, charts: charts.filter((c) => c.w >= 100), icons: charts.filter((c) => c.w < 100).length, chartsMissingResponsive: charts.filter((c) => c.w >= 100 && !(c.width100 && c.viewBox)).length },
    pageHeight: se.scrollHeight,
    link: window.__harness.link,
  };
}

async function openPage(browser, width, mode, scale, pagePath) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: scale, colorScheme: mode });
  const page = await ctx.newPage();
  const log = { console: [], pageErrors: [] };
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') log.console.push(`${t}: ${m.text()}`); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e && e.stack || e)));
  await page.goto('file://' + path.resolve(pagePath));
  await page.waitForFunction(() => window.__harness && window.__harness.ready, null, { timeout: 30000 });
  return { ctx, page, log };
}

async function shoot(page, log, tab, opts) {
  const c0 = log.console.length, p0 = log.pageErrors.length;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#tab-' + tab);
  await page.waitForTimeout(300);
  if (opts.open) { await page.click(opts.open); await page.waitForTimeout(300); }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (opts.out) { fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true }); await page.screenshot({ path: opts.out, fullPage: !!opts.full }); }
  const times = [];
  for (let i = 0; i < 5; i++) times.push(await page.evaluate(() => window.__harness.redraw()));
  times.sort((a, b) => a - b);
  const m = await page.evaluate(measure);
  return Object.assign({ tab, width: opts.width, mode: opts.mode, shot: opts.out, consoleErrors: log.console.slice(c0), pageErrors: log.pageErrors.slice(p0), redrawMs: Math.round(times[2] * 10) / 10 }, m);
}

function table(reports) {
  const rows = [['tab', 'width', 'mode', 'cons', 'perr', 'hOver', 'redraw', 'tap<44', 'txt<11', 'contr', 'svg', 'height']];
  for (const r of reports) rows.push([r.tab, r.width, r.mode, r.consoleErrors.length, r.pageErrors.length, r.horizontalOverflow ? 'YES+' + (r.scrollWidth - r.viewport) : 'no', r.redrawMs, r.tapTargets.length, r.smallText.length, r.contrast.length, r.svgCharts.charts.length, r.pageHeight].map(String));
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(w[i])).join('  ')).join('\n');
}

(async () => {
  const a = args(process.argv.slice(2));
  const t0 = Date.now();
  const browser = await playwright.chromium.launch();
  const reports = []; const loadLogs = [];
  try {
    if (a.all) {
      fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
      for (const mode of MODES) for (const width of WIDTHS) {
        const { ctx, page, log } = await openPage(browser, width, mode, a.scale, a.page);
        loadLogs.push({ width, mode, console: log.console.slice(), pageErrors: log.pageErrors.slice() });
        for (const tab of TABS) reports.push(await shoot(page, log, tab, { width, mode, full: a.full, out: path.join(HERE, 'shots', `${tab}-${width}-${mode}.png`) }));
        await ctx.close();
      }
    } else {
      const { ctx, page, log } = await openPage(browser, a.width, a.mode, a.scale, a.page);
      loadLogs.push({ width: a.width, mode: a.mode, console: log.console.slice(), pageErrors: log.pageErrors.slice() });
      reports.push(await shoot(page, log, a.tab, { width: a.width, mode: a.mode, full: a.full, open: a.open, out: a.out || path.join(HERE, `shot-${a.tab}-${a.width}-${a.mode}.png`) }));
      await ctx.close();
    }
  } finally { await browser.close(); }
  const elapsed = (Date.now() - t0) / 1000;
  const out = { generated: new Date().toISOString(), elapsedSec: elapsed, fileSizes: fileSizes(), loadLogs, totals: { consoleErrors: loadLogs.reduce((s, l) => s + l.console.length, 0) + reports.reduce((s, r) => s + r.consoleErrors.length, 0), pageErrors: loadLogs.reduce((s, l) => s + l.pageErrors.length, 0) + reports.reduce((s, r) => s + r.pageErrors.length, 0) }, reports };
  const jp = a.json || (a.all ? path.join(HERE, 'report.json') : null);
  if (jp) fs.writeFileSync(jp, JSON.stringify(out, null, 1));
  console.log(table(reports));
  console.log(`\nload-time console messages: ${loadLogs.reduce((s, l) => s + l.console.length, 0)}, page errors: ${out.totals.pageErrors}, total console errors/warnings: ${out.totals.consoleErrors}`);
  for (const l of loadLogs) for (const m of l.console.concat(l.pageErrors)) console.log(`  [${l.width} ${l.mode}] ${m.slice(0, 200)}`);
  console.log(`elapsed ${elapsed.toFixed(1)} s${jp ? ', report ' + jp : ''}`);
})().catch((e) => { console.error(e); process.exit(1); });
