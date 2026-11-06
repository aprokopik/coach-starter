// pillars.js: Health Pillars, the Health tab (the athlete, Nov 1, 2026). Seven pillars, each with one leading metric and a status
// (good, watch, act, unknown); metrics open to what / why / target / based on / others / progress / evidence.
// Values and status come from coach/tools/pillars.py (coach dataset rows pillar, pmetric, pbar, pfocus, pwin, pstreak, psum).
// Cockpit since Phase 5 (Nov 4, 2026): summary tile, the health map, and the pillars as list rows (ck-list, ck-row) with a
// disclosure. Phase 6 (Nov 5, 2026, the athlete's pick P2): the map is an icon ring (seven bare pillar icons on a faint track, each
// in its status colour, a name under each, the Good count in the centre); the status word is in each icon's accessible name
// and on the open row's badge, so status is never colour alone. The tally pills are gone (a hidden sentence says the counts).
(() => {
  const { N } = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const S = { good: 'Good', watch: 'Watch', act: 'Act', unknown: 'Unknown' };
  const open = { pillars: new Set(), metric: null, more: false };
  const pending = []; // charts draw after their box is in the page (they measure its width)
  try { const s = JSON.parse(localStorage.getItem('cx-hp-open') || '[]'); if (Array.isArray(s) && s.length) open.pillars.add(s[s.length - 1]); } catch (e) { /* per-viewer convenience only */ }
  const keep = () => { try { localStorage.setItem('cx-hp-open', JSON.stringify([...open.pillars])); } catch (e) { /* ignore */ } };

  // the data runtime hands nested lists and objects (opts, items, fields, hist, evidence) back as JSON text: parse them once
  const _parsed = new WeakMap();
  const unpack = (x) => { const o = { ...x }; for (const k in o) { const v = o[k]; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { o[k] = JSON.parse(v); } catch (e) { /* plain text */ } } } return o; };
  const rows = () => { const d = dash.data('coach'); if (d.status !== 'ok' || !Array.isArray(d.data)) return null; if (!_parsed.has(d.data)) _parsed.set(d.data, d.data.map(unpack)); return _parsed.get(d.data); };
  // Cockpit parts (cockpit.css) through the app.js helpers: sprite icons, the four-state badge, marks, rule words, card states
  const { icon, badge, mark, ruleSpan, cardState } = window.CX.ck;
  const PW = (id) => 'kind=pillar&id=' + id, MW = (id) => 'kind=pmetric&id=' + id, SUMW = 'kind=psum';
  const fig = (text, field, where, cls) => mark(el('span', 'ck-fig' + (cls ? ' ' + cls : ''), text), 'coach', field, where);
  const der = (e, where, what) => mark(e, 'coach', null, where, what);
  // one sprite icon per pillar, used on the health map and in the pillar rows (always beside the pillar's name)
  const PICON = { heart: 'hr', labs: 'bp', habits: 'habits', strength: 'strength', body: 'weight', sleep: 'sleep', mind: 'mind' };
  const picon = (id, cls) => icon(PICON[id] || 'health', cls || 'ck-i');
  const SHORT = { heart: 'Heart', labs: 'Labs', habits: 'Habits', strength: 'Strength', body: 'Body', sleep: 'Sleep', mind: 'Mind' };
  const chev = () => icon('chevron', 'ck-chev');
  // "improving" (a pillar or metric row field) is the cx-trend-up icon with its word, never an arrow alone; on a pillar row it
  // is a small pill beside the status badge (hp-tpill), so every row keeps two lines
  const trendUp = (cls) => { const t = el('span', 'hp-trend' + (cls ? ' ' + cls : '')); t.append(icon('trend-up'), 'Improving'); return t; };
  // the ring: icon i of n sits on a circle of radius RING_R (percent of the ring box) from the top, clockwise
  const RING_R = 30.6;
  const ringAt = (i, n) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [50 + RING_R * Math.cos(a), 50 + RING_R * Math.sin(a)]; };
  const NA = '\u2014'; // the no-value placeholder pillars.py writes into value (a data glyph, compared here, never typed as prose)
  const lc = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function seriesFor(m, r) {
    const c = m.chart || '';
    if (c.startsWith('mpt:')) { const k = c.slice(4); return r.filter((x) => x.kind === 'mpt' && x.key === k).map((x) => ({ date: x.date, v: N(x.value) })).filter((x) => x.v !== null).sort((a, b) => (a.date < b.date ? -1 : 1)); }
    if (c.startsWith('bars:')) { const k = c.slice(5); return r.filter((x) => x.kind === 'pbar' && x.key === k).map((x) => ({ date: x.week, v: N(x.value), target: N(x.target), label: x.label })).sort((a, b) => (a.date < b.date ? -1 : 1)); }
    if (c.startsWith('recovery:')) { const k = c.slice(9); const d = dash.data('recovery_roll'); if (d.status !== 'ok' || !Array.isArray(d.data)) return []; return d.data.filter((x) => N(x[k + '_mean']) !== null).map((x) => ({ date: x.date, v: N(x[k + '_mean']) })); }
    return [];
  }

  // Small trend line under a pillar's headline: the last 16 points of the lead's series (CKC.spark, or CKC.bar as a spark).
  const unitOf = (m) => (m.unit && m.unit.length <= 9 ? m.unit : '');
  const f1t = (v) => window.CX.fmt('.1f')(v).replace(/\.0$/, '');
  function spark(m, r) {
    const pts = seriesFor(m, r); if (pts.length < 4) return null;
    const isBars = (m.chart || '').startsWith('bars:');
    return { isBars, pts: isBars ? pts.slice(-16) : thin(pts, 16) };
  }
  function drawSpark(host, m, d, status) {
    const u = unitOf(m), tone = status === 'act' ? 'act' : 'series-1'; // the spark keeps the pillar's status colour (act = the act token)
    const wks = Math.round((Date.parse(d.pts[d.pts.length - 1].date) - Date.parse(d.pts[0].date)) / 6048e5) + 1; // the window from the dates, not the point count
    if (d.isBars) {
      const tgt = d.pts[d.pts.length - 1].target;
      return window.CKC.bar(host, { key: 'spark-' + m.id, spark: true, interactive: false, h: 32, minW: 80, rows: d.pts.map((p) => ({ x: p.date, v: p.v })), padding: 0.2, barMax: 40,
        toneOf: (q) => (tgt && q.v >= tgt ? 'good' : tone),
        thresholds: tgt ? [{ value: tgt, marks: { source: 'coach', field: 'target', where: 'kind=pbar&key=' + m.chart.slice(5) } }] : [],
        sentence: `${m.name}, the last ${wks} weeks: ${f1t(d.pts[d.pts.length - 1].v)}${u ? ' ' + u : ''} in the latest week${window.CX.weekSoFar && window.CX.weekSoFar(d.pts[d.pts.length - 1].date) ? ' so far' : ''}${tgt ? `; ${d.pts.filter((p) => p.v >= tgt).length} of ${d.pts.length} weeks at the target of ${tgt}` : ''}.` });
    }
    return window.CKC.spark(host, { key: 'spark-' + m.id, rows: d.pts, series: [{ key: 'v', tone }], fmt: f1t, unit: u, title: m.name, window: `the last ${wks} weeks`, per: 'week' });
  }
  function thin(pts, n) { // one point per week, the last n weeks
    const byWeek = new Map(); for (const p of pts) { const d = new Date(p.date + 'T00:00:00Z'); const k = Math.floor(d / 6048e5); byWeek.set(k, p); }
    return [...byWeek.values()].slice(-n);
  }

  // ---------- progress charts inside a metric ----------
  function bars(box, pts, m) {
    const view = window.CX.inSpan(pts);
    if (!view.length) { window.CKC.clear(box); box.replaceChildren(el('p', 'ck-note', `Nothing in ${window.CX.spanName()} yet.`)); return; }
    const tgt = view[view.length - 1].target; const ok = (v) => (m.lower_better ? v < tgt : v >= tgt); const k = (m.chart || '').slice(5);
    const part = window.CX.weekSoFar ? window.CX.weekSoFar(view[view.length - 1].date) : null;
    window.CKC.bar(box, { key: 'pbar-' + m.id, h: 120, partial: part, rows: view.map((p) => ({ x: p.date, v: p.v, t: p })), toneOf: (q) => (tgt && ok(q.v) ? 'good' : 'series-1'), padding: 0.15, barMax: 40, unit: unitOf(m),
      thresholds: tgt ? [{ value: tgt, label: `target ${tgt}`, marks: { source: 'coach', field: 'target', where: `kind=pbar&key=${k}&week=${view[view.length - 1].date}` } }] : [],
      title: m.name + ' by week', window: window.CX.spanName(), period: 'week', marks: { source: 'coach', where: 'kind=pbar&key=' + k }, xfmt: (d) => fD(d),
      tip: (q) => ({ head: 'Week of ' + fD(q.x), lines: [{ text: String(q.t.label || q.v) + (part && q.x === part.x ? ' so far' : '') }] }) });
    const fullW = view.filter((p) => !(part && p.date === part.x)); const hit = tgt ? fullW.filter((p) => ok(p.v)).length : null;
    if (hit !== null) { const pn = der(el('p', 'ck-note'), 'kind=pbar&key=' + k, 'count'); pn.append(mark(el('span', 'ck-fig', hit), null, null, null, 'count'), ' of ', mark(el('span', 'ck-fig', fullW.length), null, null, null, 'count'), ` full weeks ${m.lower_better ? 'under' : 'at'} `, fig(tgt, 'target', `kind=pbar&key=${k}&week=${view[view.length - 1].date}`), `${m.lower_better ? '' : '+'}. Dashed: target.`); box.insertAdjacentElement('afterend', pn); }
  }
  const fD = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

  function chartFor(m, r, host) {
    const c = m.chart || 'none'; const LC = window.CX.lineChart;
    const box = el('div', 'chart'); box.style.setProperty('--h', '130px');
    const head = el('span', 'ck-eyebrow', 'Progress');
    const wrap = el('div', 'hp-prog'); wrap.append(head, box);
    if (c === 'none') return null;
    if (c === 'hist') {
      const ul = el('ul', 'hp-hist'); (m.hist || []).forEach((h) => ul.append(der(el('li', null, h), MW(m.id), 'hist')));
      if (!(m.hist || []).length) ul.append(el('li', 'hp-muted', `No history yet. It comes from your ${m.cad.toLowerCase()}.`));
      head.textContent = 'History'; wrap.replaceChildren(head, ul); host.append(wrap); return;
    }
    host.append(wrap);
    if (c.startsWith('bars:')) { bars(box, seriesFor(m, r), m); return; }
    if (c.startsWith('mpt:')) {
      const pts = window.CX.inSpan(seriesFor(m, r)); if (!pts.length) { box.append(el('p', 'ck-note', 'No data in this range yet.')); return; }
      const sub = m.id === 'vo2' ? [43.4] : m.id === 'reg' ? [45] : []; // script-held targets (CHARTS.md)
      LC(box, pts, { h: 130, digits: 1, today: false, nice: false, main: 0, xDomain: [window.CX.spanStart(pts), pts[pts.length - 1].date], thresholds: sub.map((v) => ({ value: v, label: 'target ' + v, marks: { held: 'pillars.js chartFor ' + m.id + ' target' } })), key: 'p-' + m.id, title: m.name, window: window.CX.spanName(), unit: unitOf(m), marks: { source: 'coach', field: 'value', where: 'kind=mpt&key=' + c.slice(4), key: 'date' }, series: [{ key: 'v', label: m.name, tone: 'series-1', connect: true }] });
      if (sub.length) { const pn = el('p', 'ck-note', 'Dashed: target '); pn.append(ruleSpan(String(sub[0]), 'pillars.js chartFor: ' + m.id + ' target ' + sub[0] + ' (held, CHARTS.md section 10)'), '.'); wrap.append(pn); } return;
    }
    if (c.startsWith('recovery:')) {
      const k = c.slice(9); const d = dash.data('recovery_roll'); if (d.status !== 'ok' || !Array.isArray(d.data)) { box.append(el('p', 'ck-note', 'Loading…')); return; }
      const all = d.data; const rowsV = window.CX.inSpan(all); if (!rowsV.length) { box.append(el('p', 'ck-note', 'No nights in this range.')); return; }
      const data = rowsV.map((x) => ({ ...x, lo: x[k + '_mean'] !== null ? x[k + '_mean'] - x[k + '_sd'] : null, hi: x[k + '_mean'] !== null ? x[k + '_mean'] + x[k + '_sd'] : null }));
      LC(box, data, { h: 130, digits: k === 'sleep' ? 1 : 0, today: false, nice: false, xDomain: [window.CX.spanStart(all), rowsV[rowsV.length - 1].date], bands: [{ lo: 'lo', hi: 'hi', label: 'your usual range' }], key: 'p-' + m.id, title: m.name, window: window.CX.spanName(), unit: { sleep: 'h', hrv: 'ms', rhr: 'bpm' }[k] || '', marks: { source: 'recovery_roll', field: k, key: 'date' },
        per: 'night', series: [{ key: k + '_mean', label: '28-night average', tone: 'fg-3', connect: true, end: false, width: 1.5 }, { key: k, label: 'Night', tone: 'series-1', dots: true, line: false, r: 2.2 }], main: 1, head: 1 });
      { const pn = el('p', 'ck-note', 'Dots: nights'); if (k === 'sleep') pn.append(' (watch figure, before the ', ruleSpan('30 min', 'calc.js sleep: the 30 min watch correction'), ' correction)'); pn.append('. Line and band: ', ruleSpan('28-night', 'calc.js recovery_roll: 28-night window'), ' average ± ', ruleSpan('1 SD', 'calc.js recovery_roll: usual range is 1 SD'), '.'); wrap.append(pn); } return;
    }
    if (c === 'body') {
      const d = dash.data('body_trend'); if (d.status !== 'ok' || !Array.isArray(d.data)) { box.append(el('p', 'ck-note', 'Loading…')); return; }
      const key = m.id === 'lean' ? 'lean_lb' : 'body_fat_pct', avg = m.id === 'lean' ? 'lean_avg14' : 'fat_avg14';
      const all = d.data; const v = window.CX.inSpan(all); if (v.length < 2) { box.append(el('p', 'ck-note', 'Shows once the scale has sent a few morning weigh-ins.')); return; }
      LC(box, v, { key: 'p-' + m.id, h: 130, digits: 1, today: false, nice: false, main: 1, head: 0, title: m.name + ', 14-day average', window: window.CX.spanName(), unit: m.id === 'lean' ? 'lb' : '%', marks: { source: 'body_trend', field: avg, key: 'date' }, xDomain: [window.CX.spanStart(all), v[v.length - 1].date], series: [{ key: avg, label: '14-day average', tone: 'series-1', connect: true }, { key, label: 'Weigh-in', tone: 'fg-3', dots: true, line: false, r: 2.4 }] });
      { const pn = el('p', 'ck-note', 'Dots: morning weigh-ins. Line: '); pn.append(ruleSpan('14-day', 'body.js body_trend: 14-day window'), ' average. Read it over weeks; water shifts move single readings.'); wrap.append(pn); } return;
    }
    if (c === 'feel') {
      const d = dash.data('feel_series'); if (d.status !== 'ok' || !Array.isArray(d.data)) { box.append(el('p', 'ck-note', 'Loading…')); return; }
      const all = d.data; const v = window.CX.inSpan(all); if (v.length < 2) { box.append(el('p', 'ck-note', 'Shows once a few check-ins are logged.')); return; }
      LC(box, v, { h: 130, digits: 0, main: 1, yDomain: [0.5, 5.5], yTicks: [1, 2, 3, 4, 5], xDomain: [window.CX.spanStart(all), v[v.length - 1].date], key: 'p-feel', head: 0, title: 'Energy, 14-day average', window: window.CX.spanName(), axisLabel: 'score, 1 to 5', marks: { source: 'feel_series', field: 'energy_avg14', key: 'date' }, series: [{ key: 'energy_avg14', label: 'Energy, 14-day', tone: 'series-1', connect: true, smooth: true }, { key: 'legs_avg14', label: 'Legs, 14-day', short: 'Legs', tone: 'series-2', connect: true }, { key: 'energy', label: 'Energy', tone: 'fg-3', dots: true, line: false, r: 2.4 }] });
      { const pn = el('p', 'ck-note', 'Lines: '); pn.append(ruleSpan('14-day', 'calc.js feel_series: 14-day window'), ' averages of energy and legs. Dots: daily energy.'); wrap.append(pn); } return;
    }
    if (c === 'weight') {
      box.id = 'c-weight'; box.style.setProperty('--h', '200px');
      const now = el('p', 'ck-note hp-wnow'); now.id = 'g-weight-now'; const lg = el('div', 'legend'); lg.id = 'c-weight-legend';
      const pn = el('p', 'ck-note'); pn.append(ruleSpan('7-day', 'calc.js weight_trend: 7-day average'), ' average is the decision line; one weigh-in never changes the plan. Shaded strip: deficit periods.');
      wrap.replaceChildren(head, now, box, lg, pn);
      if (window.CX.drawWeight) window.CX.drawWeight();
    }
  }

  // a details section in the open metric (How it is measured, Evidence): native details, Cockpit summary with a chevron
  function sect(title, cls) {
    const d = el('details', 'hp-sect' + (cls ? ' ' + cls : '')); const sm = el('summary', 'hp-sum'); const t = el('span', 'hp-sum-t');
    t.append(...[].concat(title)); sm.append(t, chev()); d.append(sm); const body = el('div', 'hp-sbody2'); d.append(body); return [d, body];
  }
  function metricRow(m, r) {
    const li = el('li', 'hp-m'); const isOpen = open.metric === m.id; const w = MW(m.id);
    const b = el('button', 'ck-row hp-mrow'); b.type = 'button'; b.id = 'hp-m-' + m.id; b.setAttribute('aria-expanded', String(isOpen));
    const main = el('span', 'ck-row-main'); main.append(fig(m.name, 'name', w, 'ck-row-t'));
    const v = el('span', 'ck-row-s hp-mv'); v.append(fig(m.value, 'value', w)); if (m.sub && m.value !== NA) v.append(' ', der(el('span', null, m.sub.split(' · ')[0]), w, 'sub'));
    main.append(v);
    const end = el('span', 'ck-row-end hp-mend'); end.append(badge(m.status, S[m.status], 'hp-mbadge'), chev());
    b.append(main, end);
    b.addEventListener('click', () => { open.metric = open.metric === m.id ? null : m.id; render(); refocus('hp-m-' + m.id); });
    li.append(b);
    if (!isOpen) return li;
    const d = el('div', 'hp-detail'); d.id = 'hp-md-' + m.id; b.setAttribute('aria-controls', d.id); const dl = el('dl', 'hp-dl');
    const add = (k, ...v) => { if (!v.length || v[0] === null || v[0] === undefined) return; dl.append(el('dt', null, k)); const dd = el('dd'); dd.append(...v); dl.append(dd); };
    const addF = (k, field) => { if (m[field]) add(k, fig(m[field], field, w)); };
    addF('What', 'what'); addF('Why', 'why'); addF('Target', 'target');
    { const y = []; if (m.value === NA) y.push(m.sub ? der(el('span', null, lc(m.sub)), w, 'sub') : 'Unknown'); else { y.push(fig(m.value, 'value', w)); if (m.sub) y.push(' ', fig(m.sub, 'sub', w)); }
      y.push(' ', badge(m.status, S[m.status])); add('Yours', ...y); }
    if (m.improving) { const t = der(el('span', 'hp-trendt'), w, 'improving'); t.append(trendUp(), `: ${m.improving.from} → ${m.improving.to} over ${m.improving.weeks} weeks`); add('Trend', t); }
    if (m.next && (m.status === 'act' || m.status === 'watch')) addF('Next', 'next');
    d.append(dl);
    const ph = el('div', 'hp-ph'); d.append(ph); pending.push(() => chartFor(m, r, ph));
    const [more, mb] = sect(m.pop_text ? 'How it’s measured · vs others' : 'How it’s measured');
    const dl2 = el('dl', 'hp-dl'); const add2 = (k, ...v) => { dl2.append(el('dt', null, k)); const dd = el('dd'); dd.append(...v); dl2.append(dd); return dd; };
    if (m.spread || m.delta) { const parts = []; if (m.spread) parts.push(fig(m.spread, 'spread', w), ' typical day to day (', ruleSpan('1 SD', 'pillars.py spread: 1 SD of the daily values'), ')'); if (m.delta) { if (parts.length) parts.push(' · '); parts.push(fig(m.delta, 'delta', w)); } add2('Spread', ...parts); }
    // the population line never sets a colour: it is context, and own_trend metrics show it muted
    if (m.pop_text) { const dd = add2('Others', fig(m.pop_text, 'pop_text', w)); if (m.pop_verify) dd.append(' ◇'); if (m.own_trend) dd.className = 'hp-muted'; }
    if (m.basis) add2('Based on', fig(m.basis, 'basis', w));
    mb.append(dl2);
    const tags = el('div', 'ck-chips hp-tags');
    if (m.src) tags.append(mark(el('span', 'ck-chip', m.src), 'coach', 'src', w));
    if (m.cad) tags.append(mark(el('span', 'ck-chip', m.cad), 'coach', 'cad', w));
    { const c = el('span', 'ck-chip'); if (m.w) c.append('weight ', fig(m.w, 'w', w), ' of ', ruleSpan('10', 'pillars.js metricRow: metric weights run 0 to 10')); else c.append('context, not scored'); tags.append(c); }
    mb.append(tags); d.append(more);
    const ev = m.evidence || {}; const st = ev.studies || [];
    if (st.length) {
      const [det, eb] = sect(['Evidence: ', der(el('span', null, ev.level), w, 'evidence'), ' · ', der(el('span', 'ck-fig', st.length), w, 'count'), ` ${st.length === 1 ? 'study' : 'studies'}`], 'hp-ev');
      const ul = el('ul', 'hp-studies');
      for (const s of st) { const li2 = der(el('li'), w, 'evidence'); const a = el('a', null, s.cite); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; li2.append(a, ` (${s.kind}). ${s.finding}`); if (s.verify) { const v2 = el('span', 'hp-vfy', ' ◇'); v2.title = 'Link not yet checked into the research library'; li2.append(v2); } ul.append(li2); }
      eb.append(ul);
      if (st.some((s) => s.verify) || m.pop_verify) eb.append(el('p', 'ck-note', '◇ recalled from memory; to be checked into the coach research library.'));
      d.append(det);
    }
    li.append(d); return li;
  }

  // a re-render rebuilds the rows, so the control that was used gets the focus back (keyboard users stay in place)
  const refocus = (id) => { const t = $(id); if (t) t.focus({ preventScroll: true }); };
  const scrollTo = (t) => { if (!t) return; const beh = window.CK && window.CK.scrollBehavior ? window.CK.scrollBehavior() : 'auto'; t.scrollIntoView({ block: 'start', behavior: beh }); };

  function render() {
    const host = $('hp'); if (!host) return;
    const sumC = $('hp-sum'), plC = $('hp-pl'), foot = $('hp-foot'), sbody = sumC.querySelector('[data-body]'), list = $('hp-list');
    const d = dash.data('coach'); const r = rows();
    if (!r) {
      const st = d.status === 'error' || d.status === 'missing' ? 'error' : 'loading';
      cardState(sumC, st, 'The coach rows did not arrive, so the pillars cannot show. Nothing saved is lost.'); cardState(plC, st, 'Not loaded.');
      foot.hidden = true; $('hp-sum-n').replaceChildren(); return;
    }
    const P = r.filter((x) => x.kind === 'pillar').sort((a, b) => a.order - b.order);
    if (!P.length) { cardState(sumC, 'empty', 'Health Pillars appear after the next morning rebuild.'); cardState(plC, 'empty', 'No pillar rows yet.'); foot.hidden = true; $('hp-sum-n').replaceChildren(); return; }
    cardState(sumC, null); cardState(plC, null); foot.hidden = false;
    const M = r.filter((x) => x.kind === 'pmetric'); const sum = r.find((x) => x.kind === 'psum') || {};
    const nP = () => der(el('span', 'ck-fig', P.length), 'kind=pillar', 'count');
    { const n = $('hp-sum-n'); n.replaceChildren(nP(), ' health pillars'); }
    sbody.replaceChildren();

    // the health map (icon ring): one 44 px button per pillar on a faint circular track, top first and clockwise, which is
    // also the keyboard order. The icon takes its status colour; the name sits under it; the status word is in the button's
    // accessible name. Tapping opens that pillar's row (scrolled to and focused); tapping it again closes the row. The centre
    // shows the Good count over the pillar count; a hidden sentence gives every status count to screen readers. The caption
    // keeps the earned badge, or the key metrics still unknown (psum.to_fill: unknown metrics of weight 5 or more, pillars.py).
    const cnt = (s) => (typeof sum[s] === 'number' ? fig(sum[s], s, SUMW) : der(el('span', 'ck-fig', P.filter((p) => p.status === s).length), 'kind=pillar&status=' + s, 'count'));
    const map = el('div', 'hp-map'); const mh = el('div', 'hp-maphead'); const cap = el('span', 'ck-sub');
    if (sum.badge) { const bb = el('span', 'hp-earned'); bb.append(icon('badge'), fig(sum.badge, 'badge', SUMW)); cap.append(bb); }
    else if (sum.to_fill) cap.append(fig(sum.to_fill, 'to_fill', SUMW), ` key metric${sum.to_fill === 1 ? '' : 's'} unknown`);
    mh.append(el('span', 'ck-eyebrow', 'Your health map'), cap);
    const sr = el('p', 'ck-vh'); sr.append(cnt('good'), ' of ', nP(), ' pillars Good, ', cnt('watch'), ' Watch, ', cnt('act'), ' Act, ', cnt('unknown'), ' Unknown.');
    const ring = el('div', 'hp-ring'); const track = el('span', 'hp-rtrack'); track.setAttribute('aria-hidden', 'true');
    const ctr = el('span', 'hp-rc'); ctr.setAttribute('aria-hidden', 'true'); const c1 = el('span', 'hp-rc1'); const of = el('span', 'hp-rof');
    of.append('/', nP()); c1.append(cnt('good'), of); ctr.append(c1, el('span', 'hp-rc2', 'pillars in range'));
    const btns = el('ul', 'hp-rbtns'); btns.setAttribute('aria-label', 'Health map: tap a pillar to open its metrics');
    P.forEach((p, i) => {
      const [x, y] = ringAt(i, P.length); const li = el('li', 'hp-rpos'); li.style.left = x + '%'; li.style.top = y + '%';
      const isOpen = open.pillars.has(p.id); const nm = SHORT[p.id] || p.name.split(' ')[0];
      const b = el('button', 'hp-rbtn'); b.type = 'button'; b.id = 'hp-seg-' + p.id; b.dataset.s = p.status;
      b.setAttribute('aria-label', `${nm}: ${S[p.status]}. ${isOpen ? 'Close' : 'Open'} metrics`); b.setAttribute('aria-expanded', String(isOpen)); if (isOpen) b.setAttribute('aria-controls', 'hp-pb-' + p.id);
      const disc = el('span', 'hp-rdisc'); disc.append(picon(p.id, 'hp-ri')); b.append(disc, el('span', 'hp-rn', nm));
      b.addEventListener('click', () => {
        const was = open.pillars.has(p.id); open.pillars.clear(); open.metric = null; if (!was) open.pillars.add(p.id); keep(); render();
        if (was) refocus('hp-seg-' + p.id); else { scrollTo($('hp-' + p.id)); refocus('hp-ph-' + p.id); }
      });
      li.append(b); btns.append(li);
    });
    ring.append(track, ctr, btns); map.append(mh, sr, ring); sbody.append(map);

    const focus = r.filter((x) => x.kind === 'pfocus').sort((a, b) => a.order - b.order);
    if (focus.length) {
      const f = el('div', 'hp-focus'); f.append(el('span', 'ck-eyebrow', 'Focus on')); const ul = el('ul', 'hp-flist');
      focus.forEach((x) => { const li = el('li'); li.append(badge(x.status, S[x.status], 'hp-fbadge'), fig(x.text, 'text', 'kind=pfocus&order=' + x.order, 'hp-ft'));
        if (x.metric === 'checkins') { const b = el('button', 'ck-btn ck-btn--secondary ck-btn--sm hp-fgo', 'Open Check-ins'); b.type = 'button'; b.addEventListener('click', () => window.CX.show('checkins', true)); li.append(b); }
        ul.append(li); });
      f.append(ul); sbody.append(f);
    }

    // wins and streaks: a Cockpit disclosure, closed by default (kept open across re-renders while the page is open)
    const wins = r.filter((x) => x.kind === 'pwin').sort((a, b) => a.order - b.order); const streaks = r.filter((x) => x.kind === 'pstreak');
    const live = streaks.filter((s) => s.current);
    const wb = el('button', 'ck-disc hp-wins'); wb.type = 'button'; wb.id = 'hp-wins'; wb.setAttribute('aria-expanded', String(open.more)); wb.setAttribute('aria-controls', 'hp-wins-p');
    const wt = el('span', 'hp-wins-t');
    if (wins.length) { const x = el('span', 'hp-wn'); x.append(icon('trend-up'), der(el('span', 'ck-fig', wins.length), 'kind=pwin', 'count'), ` win${wins.length === 1 ? '' : 's'}`); wt.append(x); }
    if (live.length) { const x = el('span', 'hp-wn'); x.append(icon('streak'), der(el('span', 'ck-fig', live.length), 'kind=pstreak', 'count'), ` streak${live.length === 1 ? '' : 's'}`); wt.append(x); }
    wt.append(el('span', 'hp-wn', 'heart score'));
    wb.append(wt, chev());
    const wp = el('div', 'ck-disc-panel hp-wins-p'); wp.id = 'hp-wins-p'; wp.hidden = !open.more;
    wb.addEventListener('click', () => { open.more = !open.more; wb.setAttribute('aria-expanded', String(open.more)); wp.hidden = !open.more; });
    if (wins.length) { const ul = el('ul', 'hp-winl'); wins.forEach((x) => { const li = el('li'); li.append(icon(x.icon === 'star' ? 'badge' : 'trend-up'), fig(x.text, 'text', 'kind=pwin&order=' + x.order)); ul.append(li); }); wp.append(ul); }
    if (live.length) {
      const ul = el('ul', 'ck-badges hp-streaks');
      live.forEach((s) => { const sw = 'kind=pstreak&key=' + s.key; const li = el('li', 'ck-badgecard'); li.dataset.earned = 'true';
        const v = el('span', 'ck-badgecard-v'); v.append(fig(s.current, 'current', sw)); if (s.best > s.current) v.append(' (best ', fig(s.best, 'best', sw), ')'); else if (s.current) v.append(' · your best');
        li.append(icon('streak', 'ck-i'), fig(s.label, 'label', sw, 'ck-badgecard-l'), v); ul.append(li); });
      wp.append(ul);
    }
    if (sum.le8) wp.append(fig(sum.le8, 'le8', SUMW, 'ck-note hp-le8'));
    wp.append(el('p', 'ck-note', 'Tap a pillar on the map to open it. Fill in every pillar and get each one to Good; answering a check-in counts too.'));
    sbody.append(wb, wp);

    // the pillar rows: list rows with a disclosure; the open body holds the spark, the members and their details
    list.replaceChildren();
    for (const p of P) {
      const ms = M.filter((m) => m.pillar === p.id).sort((a, b) => a.order - b.order); const L = ms.find((m) => m.id === p.lead) || ms[0];
      const li = el('li', 'hp-p'); li.id = 'hp-' + p.id; const isOpen = open.pillars.has(p.id); if (isOpen) li.dataset.open = '';
      const head = el('button', 'ck-row hp-row'); head.type = 'button'; head.id = 'hp-ph-' + p.id; head.setAttribute('aria-expanded', String(isOpen)); if (isOpen) head.setAttribute('aria-controls', 'hp-pb-' + p.id); // only when the body exists
      // two lines, each laid out on its own: the name and the lead value, then the lead metric and the Improving pill, badge
      // and chevron; so Improving never adds a third line and a long value never squeezes the line under it
      const main = el('span', 'ck-row-main hp-rmain'); const l1 = el('span', 'hp-l1'), l2 = el('span', 'hp-l2');
      const sub = el('span', 'ck-row-s'); sub.append(fig(L.name, 'name', MW(L.id)));
      if (L.value === NA && L.sub) sub.append(' · ', fig(L.sub, 'sub', MW(L.id)));
      if (p.unknown_n && p.status !== 'unknown') sub.append(' · ', fig(p.unknown_n, 'unknown_n', PW(p.id)), ' unknown');
      sub.title = sub.textContent; // the line holds to one line with an ellipsis; the full text stays in the title and the button's name
      const lead = el('span', 'hp-lead');
      lead.append(fig(L.value, 'value', MW(L.id))); if (L.value !== NA && L.unit && L.unit.length <= 9 && !String(L.value).includes('%')) lead.append(' ', fig(L.unit, 'unit', MW(L.id), 'ck-unit'));
      const bl = el('span', 'hp-bl'); if (p.improving) bl.append(der(trendUp('hp-tpill'), PW(p.id), 'improving')); bl.append(badge(p.status, S[p.status]), chev());
      l1.append(fig(p.name, 'name', PW(p.id), 'ck-row-t'), lead); l2.append(sub, bl); main.append(l1, l2);
      head.append(picon(p.id, 'ck-i hp-pi'), main);
      head.addEventListener('click', () => { const was = open.pillars.has(p.id); open.pillars.clear(); open.metric = null; if (!was) open.pillars.add(p.id); keep(); render(); refocus('hp-ph-' + p.id); if (!was) { const t = $('hp-' + p.id); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); } });
      li.append(head);
      if (isOpen) {
        const body = el('div', 'hp-pbody'); body.id = 'hp-pb-' + p.id;
        body.append(fig(p.what, 'what', PW(p.id), 'ck-note hp-what'));
        // the spark sits outside the button: the button keeps a clean name and points at the sentence with aria-describedby
        const sp = spark(L, r);
        if (sp) {
          const s = el('div', 'hp-spark'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('data-rule', 'pillars.js spark: drawn from 4 points, the last 16 weekly points (held, CHARTS.md section 10)');
          const desc = der(el('span', 'ck-vh'), MW(L.id), 'sentence'); desc.id = 'hp-spk-' + p.id; head.setAttribute('aria-describedby', desc.id);
          body.append(s, desc); pending.push(() => { const o = drawSpark(s, L, sp, p.status); desc.textContent = (o && o.sentence) || ''; });
        }
        const ml = el('ul', 'ck-list hp-members'); ms.forEach((m) => ml.append(metricRow(m, r))); body.append(ml);
        li.append(body);
      }
      list.append(li);
    }
    pending.splice(0).forEach((f) => { try { f(); } catch (e) { /* one chart failing never blanks the page */ } });
  }
  window.CX.renderPillars = render;
})();
