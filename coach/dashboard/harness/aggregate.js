#!/usr/bin/env node
/* node aggregate.js <data dir> <sweep.json out>: per tab x width x theme x variant numbers, totals, and every distinct finding
   (signature -> where it occurs). Prints a short summary. */
const fs = require('fs'); const path = require('path');
const [dir, outPath] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const TABN = { today: 'Today', checkins: 'Check-in', week: 'Week', lifts: 'Lifts', trends: 'Fitness', goals: 'Health', races: 'Season' };
const rows = []; const findings = new Map();
const add = (cat, sig, where, detail) => { const k = cat + ' | ' + sig; if (!findings.has(k)) findings.set(k, { cat, sig, detail, where: [] }); findings.get(k).where.push(where); };
let loadErrors = 0;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
  loadErrors += r.loadErrors.length; for (const e of r.loadErrors) add('console', e.slice(0, 160), `${r.variant}/${r.width}/${r.theme}/load`);
  for (const t of r.tabs) {
    const w = `${r.variant}/${t.tab}/${r.width}/${r.theme}`; const m = t.measure;
    const kbI = t.kb ? t.kb.issues : [];
    const row = { variant: r.variant, tab: TABN[t.tab], width: r.width, theme: r.theme, consoleErrors: t.errors.length, marks: { total: t.marks.total, resolved: t.marks.resolved, sourceOnly: t.marks.sourceOnly, mismatched: t.marks.mismatched, unresolved: t.marks.unresolved, unresolvedOnScreen: t.marks.unresolvedOnScreen || 0, mismatchedOnScreen: t.marks.mismatchedOnScreen || 0 }, horizontalOverflow: m.horizontalOverflow, overflowElements: m.overflowElements.length, tapsUnder44: m.tapSmall.length, textUnder11: m.smallText.length, textContrastFails: m.contrast.length, nonTextContrastFails: t.nontext.fails.length, nonTextChecked: t.nontext.glyphs + t.nontext.iconButtons + t.nontext.controls, reducedMotionMoving: t.motion.filter((x) => x.transitionMs > 0 || x.animationMs > 0).length, smoothScroll: t.motion.filter((x) => x.smoothScroll).length, kbStops: t.kb ? t.kb.stops : null, kbIssues: kbI.length, kbDomOrderBreaks: t.kb ? t.kb.domOrderBreaks : null };
    rows.push(row);
    for (const e of t.errors) add('console', e.slice(0, 160), w);
    for (const i of t.marks.bad) add('marks ' + i.r + (i.vis ? ' ON SCREEN' : ' hidden'), i.k + ' ' + (i.why || ''), w, { text: i.text, value: i.value });
    for (const o of m.overflowElements) add('overflow', o.selector, w, { px: o.overflowPx });
    if (m.horizontalOverflow) add('overflow', 'page scrollWidth > viewport', w, { scrollWidth: m.scrollWidth });
    for (const o of m.tapSmall) add('tap<44', o.selector + ' "' + o.text + '"', w, { w: o.w, h: o.h });
    for (const o of m.smallText) add('text<11', o.selector + ' "' + o.text + '"', w, { size: o.size });
    for (const o of m.contrast) add('contrast text', o.selector + ' "' + o.text + '"', w, { fg: o.fg, bg: o.bg, ratio: o.ratio, size: o.size });
    for (const o of t.nontext.fails) add('contrast non-text', o.kind + ' ' + o.selector, w, o);
    for (const o of t.motion) if (o.transitionMs > 0 || o.animationMs > 0 || o.smoothScroll) add('reduced motion', o.selector + ' ' + (o.transitionMs ? 'transition ' + o.transitionProperty + ' ' + o.transitionMs + 'ms ' : '') + (o.animationMs ? 'animation ' + o.animation + ' ' + o.animationMs + 'ms' : '') + (o.smoothScroll ? 'smooth scroll' : ''), w);
    for (const o of kbI) add('keyboard', o.what + ' ' + o.sel + ' "' + o.name + '"', w);
  }
}
const sum = (k) => rows.reduce((s, r) => s + (typeof r[k] === 'boolean' ? (r[k] ? 1 : 0) : (r[k] || 0)), 0);
const totals = { renders: rows.length, pages: files.length, loadConsoleErrors: loadErrors, consoleErrors: sum('consoleErrors'), marks: ['total', 'resolved', 'sourceOnly', 'mismatched', 'unresolved', 'unresolvedOnScreen', 'mismatchedOnScreen'].reduce((o, k) => (o[k] = rows.reduce((s, r) => s + r.marks[k], 0), o), {}), horizontalOverflow: sum('horizontalOverflow'), overflowElements: sum('overflowElements'), tapsUnder44: sum('tapsUnder44'), textUnder11: sum('textUnder11'), textContrastFails: sum('textContrastFails'), nonTextContrastFails: sum('nonTextContrastFails'), nonTextChecked: sum('nonTextChecked'), reducedMotionMoving: sum('reducedMotionMoving'), smoothScroll: sum('smoothScroll'), kbStops: sum('kbStops'), kbIssues: sum('kbIssues'), kbDomOrderBreaks: sum('kbDomOrderBreaks') };
const F = [...findings.values()].map((x) => ({ cat: x.cat, sig: x.sig, count: x.where.length, detail: x.detail, where: x.where }));
F.sort((a, b) => a.cat.localeCompare(b.cat) || b.count - a.count);
fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), totals, findings: F, rows }, null, 1));
console.log(JSON.stringify(totals));
for (const x of F) console.log(`[${x.cat}] x${x.count} ${x.sig.slice(0, 200)} ${x.detail ? JSON.stringify(x.detail).slice(0, 120) : ''}\n    e.g. ${x.where.slice(0, 4).join(', ')}`);
