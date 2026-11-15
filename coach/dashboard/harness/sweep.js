#!/usr/bin/env node
/* Verification sweep. One harness page (one variant), every tab x widths x themes.
   node sweep.js --page <html> --variant <name> --out <dir> [--renders <dir>] [--tabs today,week] [--widths 360,390,...] [--themes light,dark] [--shots 360] [--nokb]
   Reuses the harness measurements verbatim: measure() is read from render.js in this folder (overflow, taps under 44,
   text under 11 px, text contrast) and check() from marks.js in this folder (data marks). Adds, per tab:
   - nontext(): 3:1 checks for status glyphs (svg under [data-s] or .ck-g), icon-only buttons (icon colour), and visible
     native form controls (border or fill against the backdrop);
   - motion(): with prefers-reduced-motion: reduce emulated, every element in #dash-root whose computed transition or
     animation duration is above 0 s (plus scroll-behavior: smooth);
   - kbwalk(): focus the tab button, press Tab until focus has entered and left the tab panel (cap 220 presses); for each
     focused element: a visible focus change (outline / box-shadow / border / background on the element or up to three
     ancestors differs from the blurred state), focus ring contrast against the backdrop (3:1), tabindex > 0, focus on an
     invisible element.
   Writes <out>/<variant>-<width>-<theme>.json and, at the shot widths, full-page PNGs <renders>/<variant>/<tab>-<theme>.png
   (<renders> defaults to <out>/renders). aggregate.js sums the JSON files. */
const fs = require('fs');
const path = require('path');
const pw = require('./pw');
const renderSrc = fs.readFileSync(path.join(__dirname, 'render.js'), 'utf8');
const marksSrc = fs.readFileSync(path.join(__dirname, 'marks.js'), 'utf8');
const MEASURE = renderSrc.slice(renderSrc.indexOf('function measure()'), renderSrc.indexOf('\nasync function openPage'));
const CHECK = marksSrc.slice(marksSrc.indexOf('function check()'), marksSrc.indexOf('\n(async'));
const CHECKV = CHECK.split('const item = { selector: sel(e),').join('const item = { vis: !!(e.getClientRects().length && getComputedStyle(e).visibility !== \'hidden\'), selector: sel(e),');
if (MEASURE.length < 1000 || CHECK.length < 1000) throw new Error('could not read measure()/check()');

const ALL_TABS = ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races'];
const a = { widths: '360,390,430,640,900,1200', themes: 'light,dark', shots: '360', nokb: false, tabs: ALL_TABS.join(',') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) { const k = argv[i].slice(2); if (k === 'nokb') a.nokb = true; else a[k] = argv[++i]; }
if (!a.page || !a.variant || !a.out) { console.error('usage: node sweep.js --page <html> --variant <name> --out <dir> [--tabs ...] [--widths ...]'); process.exit(2); }
const TABS = a.tabs.split(',').filter((t) => ALL_TABS.includes(t));

// ---- page-side helpers (strings evaluated in the page) ----
const COLOR = `
  const parse = (c) => { const m = c && c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over_ = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { if (e.namespaceURI === 'http://www.w3.org/2000/svg' && e.tagName.toLowerCase() !== 'svg') continue; const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let base = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : (parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1]); while (layers.length) base = over_(layers.pop(), base); return base; };
  const sel = (el) => { const parts = []; for (let e = el, d = 0; e && e.nodeType === 1 && d < 5; e = e.parentElement, d++) { let s = e.tagName.toLowerCase(); if (e.id) { parts.unshift(s + '#' + e.id); break; } const cls = typeof e.className === 'string' ? e.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2) : (e.className && e.className.baseVal ? e.className.baseVal.trim().split(/\\s+/).slice(0, 2) : []); if (cls.length) s += '.' + cls.join('.'); parts.unshift(s); } return parts.join(' > '); };
  const vis = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
`;

const NONTEXT = `(() => { ${COLOR}
  const out = [];
  const root = document.getElementById('dash-root');
  const glyphs = [...root.querySelectorAll('svg')].filter((s) => vis(s) && (s.classList.contains('ck-g') || s.closest('[data-s]')) && s.getBoundingClientRect().width < 40);
  for (const s of glyphs) { const c = parse(getComputedStyle(s).color); if (!c) continue; const bg = bgOf(s.parentElement); const r = ratio(over_(c, bg), bg); if (r < 3) out.push({ kind: 'glyph', selector: sel(s), fg: hex(c), bg: hex(bg), ratio: Math.round(r * 100) / 100 }); }
  const iconBtns = [...root.querySelectorAll('button, [role=button], a[href]')].filter((b) => vis(b) && !b.textContent.trim() && b.querySelector('svg'));
  for (const b of iconBtns) { const s = b.querySelector('svg'); const c = parse(getComputedStyle(s).color); if (!c) continue; const bg = bgOf(b); const r = ratio(over_(c, bg), bg); if (r < 3) out.push({ kind: 'icon-button', selector: sel(b), fg: hex(c), bg: hex(bg), ratio: Math.round(r * 100) / 100 }); }
  const ctrls = [...root.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((e) => vis(e) && e.getBoundingClientRect().width >= 8 && getComputedStyle(e).appearance !== 'none' || (vis(e) && ['text','number','date','search','email'].includes(e.type)) || (vis(e) && e.tagName !== 'INPUT'));
  for (const e of ctrls) { const cs = getComputedStyle(e); const back = bgOf(e.parentElement); let best = 0, what = '';
    const bw = parseFloat(cs.borderTopWidth); const bc = parse(cs.borderTopColor); if (bw > 0 && bc && bc[3] > 0) { const r = ratio(over_(bc, back), back); if (r > best) { best = r; what = 'border ' + hex(over_(bc, back)); } }
    const fc = parse(cs.backgroundColor); if (fc && fc[3] > 0) { const r = ratio(over_(fc, back), back); if (r > best) { best = r; what = 'fill ' + hex(over_(fc, back)); } }
    if (cs.appearance !== 'none' && (e.type === 'radio' || e.type === 'checkbox' || e.type === 'range')) { const ac = parse(cs.accentColor); if (ac) { const r = ratio(ac, back); if (r > best) { best = r; what = 'accent ' + hex(ac); } } else continue; }
    if (best < 3) out.push({ kind: 'control', selector: sel(e), type: e.type || e.tagName.toLowerCase(), what, bg: hex(back), ratio: Math.round(best * 100) / 100 }); }
  return { glyphs: glyphs.length, iconButtons: iconBtns.length, controls: ctrls.length, fails: out };
})()`;

const MOTION = `(() => { ${COLOR}
  const dur = (s) => Math.max(0, ...s.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000) || 0));
  const out = [];
  for (const e of [document.getElementById('dash-root'), ...document.querySelectorAll('#dash-root *')]) {
    const cs = getComputedStyle(e);
    const t = cs.transitionProperty !== 'none' ? dur(cs.transitionDuration) : 0;
    const an = cs.animationName !== 'none' ? dur(cs.animationDuration) : 0;
    const sb = cs.scrollBehavior === 'smooth';
    if (t > 0 || an > 0 || sb) out.push({ selector: sel(e), transitionMs: t, transitionProperty: cs.transitionProperty, animationMs: an, animation: cs.animationName, smoothScroll: sb, visible: vis(e) });
  }
  return out;
})()`;

const FOCUSINFO = `((pid) => { ${COLOR}
  const e = document.activeElement; if (!e || e === document.body) { window.__kbPrevOut = window.__kbPrev ? window.__kbPrev.map((x) => { const cs = getComputedStyle(x); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|'); }) : null; window.__kbPrev = null; return { none: true, prevBlurred: window.__kbPrevOut }; }
  const panel = document.getElementById(pid);
  const chain = []; for (let x = e, d = 0; x && d < 4 && x !== document.body; x = x.parentElement, d++) chain.push(x);
  const snap = () => chain.map((x) => { const cs = getComputedStyle(x); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|'); });
  const focused = snap();
  let prevBlurred = null; if (window.__kbPrev) { prevBlurred = window.__kbPrev.map((x) => { const cs = getComputedStyle(x); return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset, cs.boxShadow, cs.borderColor, cs.backgroundColor].join('|'); }); } window.__kbPrev = chain;
  const cs = getComputedStyle(e);
  let ringColor = null, ringOn = null;
  for (const x of chain) { const c = getComputedStyle(x); if (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 && vis(x) && !x.classList.contains('ck-vh-input')) { ringColor = c.outlineColor; ringOn = x; break; } }
  const r = e.getBoundingClientRect();
  const label = e.closest('label') || (e.labels && e.labels[0]) || null; const isBox = (e.type === 'radio' || e.type === 'checkbox') && label; const box = isBox ? label.getBoundingClientRect() : r;
  const name = (e.getAttribute('aria-label') || (e.labels && e.labels[0] ? e.labels[0].textContent : '') || e.textContent || e.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  let ringRatio = null;
  // the colour just outside the ring: the parent's backdrop for a ring outside the box; for an inset ring (negative offset) an inset
  // box-shadow band when one covers the gap, else the element's own fill
  let ringAdj = null;
  if (ringColor) { const c = parse(ringColor); const rc = getComputedStyle(ringOn); const off = parseFloat(rc.outlineOffset) || 0; const ow = parseFloat(rc.outlineWidth) || 0;
    let bg = bgOf(ringOn.parentElement || ringOn);
    if (off < 0) { bg = bgOf(ringOn); const m = rc.boxShadow.match(/(rgba?\\([^)]+\\))\\s+0px\\s+0px\\s+0px\\s+([\\d.]+)px\\s+inset/); if (m && parseFloat(m[2]) >= -off - ow) bg = over_(parse(m[1]), bgOf(ringOn)); }
    if (c) { ringRatio = Math.round(ratio(over_(c, bg), bg) * 100) / 100; ringAdj = hex(bg); } }
  const all = [...document.querySelectorAll('#dash-root *')];
  return { sel: sel(e), idx: all.indexOf(e), name, inPanel: !!(panel && panel.contains(e)), tabindex: e.getAttribute('tabindex'), visible: (isBox ? vis(label) : vis(e)) && box.width > 1 && box.height > 1, w: Math.round(box.width), h: Math.round(box.height), top: Math.round(r.top + scrollY), left: Math.round(r.left), focused, prevBlurred, ring: ringColor, ringRatio, ringAdj };
})`;

async function kbwalk(page, tab) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.focus('#tab-' + tab);
  await page.evaluate(() => { window.__kbPrev = null; });
  const seen = []; let entered = false; let lastSel = null; let repeats = 0;
  const settle = (f) => { if (seen.length && f && f.prevBlurred && f.sel !== seen[seen.length - 1].sel && seen[seen.length - 1].focused) { const L = seen[seen.length - 1]; L.focusChange = L.focused.some((x, j) => x !== f.prevBlurred[j]); delete L.focused; } };
  for (let i = 0; i < 220; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(FOCUSINFO + '(' + JSON.stringify(tab) + ')');
    settle(f);
    if (f.none) { if (entered) break; else continue; }
    if (!f.inPanel) { if (entered) break; if (i > 40) break; continue; }
    entered = true;
    if (f.sel === lastSel) { if (++repeats > 6) break; continue; } repeats = 0; lastSel = f.sel;
    seen.push(f);
  }
  // the previous stop's blurred state is read after focus has moved on (no programmatic blur, so no blur handlers run)
  for (const L of seen) if (L.focused) { L.focusChange = null; delete L.focused; }
  const issues = [];
  for (const f of seen) {
    if (f.focusChange === false) issues.push({ what: 'no visible focus change', sel: f.sel, name: f.name });
    else if (f.ringRatio !== null && f.ringRatio < 3) issues.push({ what: 'focus ring under 3:1 (' + f.ringRatio + ' on ' + f.ringAdj + ')', sel: f.sel, name: f.name });
    if (f.tabindex && Number(f.tabindex) > 0) issues.push({ what: 'tabindex ' + f.tabindex, sel: f.sel, name: f.name });
    if (!f.visible) issues.push({ what: 'focus lands on an invisible element', sel: f.sel, name: f.name });
  }
  let domBack = 0; for (let i = 1; i < seen.length; i++) if (seen[i].idx < seen[i - 1].idx) domBack++;
  return { stops: seen.length, domOrderBreaks: domBack, issues, order: seen.map((f) => ({ sel: f.sel, name: f.name, w: f.w, h: f.h, ring: f.ring, ringRatio: f.ringRatio, focusChange: f.focusChange })) };
}

(async () => {
  const widths = a.widths.split(',').map(Number); const themes = a.themes.split(','); const shots = a.shots.split(',').map(Number);
  fs.mkdirSync(a.out, { recursive: true });
  const browser = await pw.chromium.launch();
  try {
    for (const theme of themes) for (const width of widths) {
      const t0 = Date.now();
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme });
      const page = await ctx.newPage(); const log = [];
      page.on('console', (m) => { if (m.type() === 'error') log.push('console: ' + m.text()); });
      page.on('pageerror', (e) => log.push('pageerror: ' + String(e && e.message || e)));
      await page.goto('file://' + path.resolve(a.page) + '?datamode=' + theme);
      await page.waitForFunction(() => window.__harness && window.__harness.ready, null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const loadErrors = log.slice();
      const tabs = [];
      for (const tab of TABS) {
        const c0 = log.length;
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.click('#tab-' + tab); await page.waitForTimeout(450);
        await page.evaluate(() => window.scrollTo(0, 0));
        let shot = null;
        if (shots.includes(width)) { shot = path.join(a.renders || path.join(a.out, 'renders'), a.variant, `${tab}-${theme}.png`); fs.mkdirSync(path.dirname(shot), { recursive: true }); await page.mouse.move(0, 0); await page.screenshot({ path: shot, fullPage: true }); }
        const m = await page.evaluate('(' + MEASURE + ')()');
        const marks = await page.evaluate('(' + CHECKV + ')()');
        const nt = await page.evaluate(NONTEXT);
        await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(50);
        const motion = await page.evaluate(MOTION);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const kb = a.nokb ? null : await kbwalk(page, tab);
        tabs.push({ tab, shot, errors: log.slice(c0), measure: { horizontalOverflow: m.horizontalOverflow, scrollWidth: m.scrollWidth, overflowElements: m.overflowElements.filter((o) => !o.clippedBy), clippedOverflow: m.overflowElements.filter((o) => o.clippedBy).length, tapTargetCount: m.tapTargetCount, tapSmall: m.tapTargets, textElements: m.textElements, smallText: m.smallText, contrast: m.contrast, pageHeight: m.pageHeight },
          marks: { total: marks.total, resolved: marks.resolved, mismatched: marks.mismatched, unresolved: marks.unresolved, sourceOnly: marks.sourceOnly, items: marks.items.map((i) => ({ vis: i.vis, k: i.selector + '|' + i.field + '|' + i.where, r: i.result, why: i.why, text: i.text, value: i.value, source: i.source })) },
          nontext: nt, motion, kb });
      }
      await ctx.close();
      // a header mark (outside any panel) is seen on every tab: count it once (as marks.js does)
      const seenK = new Set();
      for (const t of tabs) { const items = t.marks.items.filter((i) => { if (seenK.has(i.k)) return false; seenK.add(i.k); return true; }); const c = { total: 0, resolved: 0, mismatched: 0, unresolved: 0, sourceOnly: 0 }; for (const i of items) { c.total++; c[i.r === 'source-only' ? 'sourceOnly' : i.r]++; } c.unresolvedOnScreen = items.filter((i) => i.r === 'unresolved' && i.vis).length; c.mismatchedOnScreen = items.filter((i) => i.r === 'mismatched' && i.vis).length; t.marks = Object.assign(c, { bad: items.filter((i) => i.r === 'mismatched' || i.r === 'unresolved') }); t.marksAll = items.length; }
      const out = { variant: a.variant, width, theme, page: a.page, loadErrors, tabs, sec: (Date.now() - t0) / 1000 };
      fs.writeFileSync(path.join(a.out, `${a.variant}-${width}-${theme}.json`), JSON.stringify(out));
      console.log(`${a.variant} ${width} ${theme}: ${out.sec.toFixed(1)} s, errors ${loadErrors.length + tabs.reduce((s, t) => s + t.errors.length, 0)}`);
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
