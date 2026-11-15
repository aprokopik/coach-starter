#!/usr/bin/env node
/* Data-mark resolution check (modelled on the Dashboard type's rule) against the harness mock.
   node marks.js [--page index.html] [--width 390] [--mode light] [--json marks.json]
   --page defaults to index.html in this folder; --json defaults to marks.json in this folder. sweep.js reads check() from this file.
   For each tab (clicked so its panel is drawn) every visible-or-hidden element with data-source is checked:
   - data-field + data-where (col=value[&col=value], percent-decoded) or data-row (row index): find the row in
     dash.data(source); compare trimmed textContent with String(value), or accept when the text contains a number
     equal to the value rounded to the shown decimals. Null/'' values shown as a dash (U+2014) count as a match.
   - data-where without data-field: the where must name at least one row.
   - tables with data-row-key: each tbody row's key (tr[data-key] or the key column's cell) names exactly one row;
     each th[data-field] is a known column. */
const fs = require('fs');
const path = require('path');
const playwright = require('./pw');
const TABS = ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races'];

const a = { width: 390, mode: 'light', json: path.join(__dirname, 'marks.json'), page: path.join(__dirname, 'index.html') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[++i];

function check() {
  const sel = (el) => { const parts = []; for (let e = el, d = 0; e && e.nodeType === 1 && d < 5; e = e.parentElement, d++) { let s = e.tagName.toLowerCase(); if (e.id) { parts.unshift(s + '#' + e.id); break; } const p = e.parentElement; if (p) { const same = [...p.children].filter((c) => c.tagName === e.tagName); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'; } parts.unshift(s); } return parts.join(' > '); };
  const parseWhere = (w) => w.split('&').filter(Boolean).map((kv) => { const i = kv.indexOf('='); const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }; return [dec(i < 0 ? kv : kv.slice(0, i)), dec(i < 0 ? '' : kv.slice(i + 1))]; });
  const matchRows = (rows, conds) => rows.filter((r) => conds.every(([k, v]) => r[k] !== undefined && r[k] !== null && String(r[k]) === v));
  const numMatch = (text, v) => {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null);
    if (n === null) return false;
    const nums = (text.replace(/[,  ](?=\d{3}\b)/g, '').replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) || []);
    return nums.some((s) => { const dec = (s.split('.')[1] || '').length; const f = Math.pow(10, dec); return Math.abs(Math.round(n * f) / f - Number(s)) < 0.5 / f + 1e-9 || Math.abs(Math.round(Math.abs(n) * f) / f - Math.abs(Number(s))) < 1e-9; });
  };
  const page = document.querySelector('.page:not([hidden])');
  const out = { tab: page ? page.id : null, total: 0, resolved: 0, mismatched: 0, unresolved: 0, sourceOnly: 0, items: [] };
  const els = [...document.querySelectorAll('[data-source]')].filter((e) => !e.closest('.page[hidden]'));
  for (const e of els) {
    out.total++;
    const src = e.getAttribute('data-source'); const field = e.getAttribute('data-field'); const where = e.getAttribute('data-where'); const rowIx = e.getAttribute('data-row');
    const srcs = src.trim().split(/\s+/);
    if (srcs.length > 1) { // several datasets named: each must resolve; no field compare possible
      const st = srcs.map((s) => s + ':' + window.dash.data(s).status); const bad = st.filter((x) => !x.endsWith(':ok'));
      const item = { selector: sel(e), source: src, field, where, status: st.join(' ') };
      if (bad.length) { item.result = 'unresolved'; item.why = 'dataset status ' + bad.join(' '); out.unresolved++; } else { item.result = 'source-only'; out.sourceOnly++; }
      out.items.push(item); continue;
    }
    const d = window.dash.data(src);
    const item = { selector: sel(e), source: src, field, where, row: rowIx, status: d.status };
    const rows = Array.isArray(d.data) ? d.data : [];
    if (d.status !== 'ok') { item.result = 'unresolved'; item.why = 'dataset status ' + d.status; out.unresolved++; out.items.push(item); continue; }
    if (e.tagName === 'TABLE' && e.hasAttribute('data-row-key')) {
      const key = e.getAttribute('data-row-key'); const cols = new Set(d.columns || Object.keys(rows[0] || {}));
      const ths = [...e.querySelectorAll('th[data-field]')]; const ki = [...e.querySelectorAll('thead th')].findIndex((t) => t.getAttribute('data-field') === key);
      const bad = [];
      for (const t of ths) if (!cols.has(t.getAttribute('data-field'))) bad.push('unknown column ' + t.getAttribute('data-field'));
      for (const tr of e.querySelectorAll('tbody tr')) { const kv = tr.getAttribute('data-key') || (ki >= 0 && tr.children[ki] ? tr.children[ki].textContent.trim() : null); const n = kv === null ? -1 : rows.filter((r) => String(r[key]) === kv).length; if (n !== 1) bad.push(`row key ${kv} names ${n} rows`); }
      item.result = bad.length ? 'mismatched' : 'resolved'; if (bad.length) item.why = bad.slice(0, 10); out[bad.length ? 'mismatched' : 'resolved']++; out.items.push(item); continue;
    }
    let row = null;
    if (rowIx !== null && rowIx !== '') { row = rows[Number(rowIx)] || null; if (!row) { item.result = 'unresolved'; item.why = 'data-row out of range'; out.unresolved++; out.items.push(item); continue; } }
    else if (where) {
      const hits = matchRows(rows, parseWhere(where));
      item.hits = hits.length;
      if (!hits.length) { item.result = 'unresolved'; item.why = 'matches no row'; out.unresolved++; out.items.push(item); continue; }
      row = hits[0];
    }
    if (!field) { out.sourceOnly++; item.result = 'source-only'; out.items.push(item); continue; }
    if (!row) { item.result = 'unresolved'; item.why = 'data-field without data-where/data-row'; out.unresolved++; out.items.push(item); continue; }
    const v = row[field]; const text = (e.textContent || '').trim();
    item.value = v === undefined ? '(no such field)' : v; item.text = text.slice(0, 80);
    const ok = v !== undefined && (text === String(v) || ((v === null || v === '') && (text === '\u2014' || text === '')) || numMatch(text, v));
    item.result = ok ? 'resolved' : 'mismatched'; if (!ok && v === undefined) item.why = 'row has no field ' + field; else if (!ok && v !== null && String(v) !== '' && text.includes(String(v))) item.why = 'text contains the value plus extra text';
    out[ok ? 'resolved' : 'mismatched']++; out.items.push(item);
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number(a.width), height: 800 }, colorScheme: a.mode });
  if (a.opt) await ctx.addInitScript((o) => { window.__p6opt = { C: o }; }, a.opt);
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + path.resolve(a.page));
  await page.waitForFunction(() => window.__harness && window.__harness.ready, null, { timeout: 30000 });
  const per = [];
  for (const tab of TABS) { await page.click('#tab-' + tab); await page.waitForTimeout(300); per.push(await page.evaluate(check)); }
  await browser.close();
  // a header mark (outside any .page) is seen on every tab: count it once, on the first tab
  const seen = new Set();
  for (const p of per) { p.items = p.items.filter((i) => { const k = i.selector + '|' + i.field + '|' + i.where; if (seen.has(k)) return false; seen.add(k); return true; }); for (const k of ['total', 'resolved', 'mismatched', 'unresolved', 'sourceOnly']) p[k] = 0; for (const i of p.items) { p.total++; p[i.result === 'source-only' ? 'sourceOnly' : i.result]++; } }
  const tot = { total: 0, resolved: 0, mismatched: 0, unresolved: 0, sourceOnly: 0 };
  for (const p of per) for (const k in tot) tot[k] += p[k];
  fs.writeFileSync(a.json, JSON.stringify({ generated: new Date().toISOString(), width: a.width, mode: a.mode, totals: tot, consoleErrors: errs, tabs: per }, null, 1));
  console.log('tab       total  resolved  mismatched  unresolved  source-only');
  for (const p of per) console.log(`${p.tab.padEnd(9)} ${String(p.total).padEnd(6)} ${String(p.resolved).padEnd(9)} ${String(p.mismatched).padEnd(11)} ${String(p.unresolved).padEnd(11)} ${p.sourceOnly}`);
  console.log(`${'TOTAL'.padEnd(9)} ${String(tot.total).padEnd(6)} ${String(tot.resolved).padEnd(9)} ${String(tot.mismatched).padEnd(11)} ${String(tot.unresolved).padEnd(11)} ${tot.sourceOnly}`);
  for (const p of per) for (const i of p.items) if (i.result === 'mismatched' || i.result === 'unresolved') console.log(`  [${p.tab}] ${i.result}: ${i.selector} src=${i.source} field=${i.field} where=${i.where} ${i.why || ''} text="${i.text || ''}" value=${JSON.stringify(i.value)}`.slice(0, 260));
  console.log(`console errors: ${errs.length}; ${((Date.now() - t0) / 1000).toFixed(1)} s; report ${a.json}`);
})().catch((e) => { console.error(e); process.exit(1); });
