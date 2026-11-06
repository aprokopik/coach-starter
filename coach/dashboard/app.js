// app.js: tabs, drawing helpers, and the Today, Week, Fitness and Health pages; marker tiers, levels, milestones and block lines.
// The Season tab and the Week race-week card are in season.js (loaded right after this file), which reads these helpers from
// window.CX.app and registers CX.renderRaces and CX.renderRaceWeek; the other tabs' files load after it (index.html, MAINTAIN.md).
(() => {
  const { N, dayN, isoN, monday } = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const TN = dayN(TODAY);
  const P = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const fDay = d3.utcFormat('%b %-d'), fWd = d3.utcFormat('%a %b %-d'), fDow = d3.utcFormat('%a'), fMon = d3.utcFormat('%b');
  const f1 = window.CX.fmt('.1f'), f0 = window.CX.fmt('.0f'); // half up, decimal-safe (calc.js)
  function themeIsDark() {
    try {
      const probe = document.createElement('span'); probe.style.color = 'var(--color-bg)'; document.getElementById('cx').appendChild(probe);
      const c = getComputedStyle(probe).color; probe.remove();
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const ctx = cv.getContext('2d'); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.35;
    } catch (e) { return false; }
  }
  // One sport palette (Phase 5, Fitness): tiles, keys, icons and charts all read the Cockpit sport tokens (tokens.css), so a
  // theme switch follows and Run is the same colour everywhere. The old PAL hex lists are gone.
  const tokv = (t) => `var(--ck-${t})`;
  const COL = () => ({ bike: tokv('bike'), run: tokv('run'), swim: tokv('swim'), strength: tokv('strength'), hike: tokv('surface'), other: tokv('other'), adv: tokv('series-7'), race: tokv('run'), walk: tokv('fg-3'), test: tokv('fg-3'), rest: tokv('line') });
  const NAME = { bike: 'Bike', run: 'Run', swim: 'Swim', strength: 'Strength', hike: 'Hike/walk', walk: 'Walk', other: 'Other', race: 'Race', test: 'Check', rest: 'Rest' };
  const PAGES = ['today', 'checkins', 'week', 'lifts', 'trends', 'goals', 'races'];
  const state = { zoom: {}, page: 'today', bound: 'nominal', week: monday(TODAY), mode: 'hours', range: 28, race: null, open: new Set(), openDays: new Set(), openBlock: null, linked: false, vSport: 'all', vMeasure: 'time', zSport: 'all', span: (() => { try { return localStorage.getItem('cx-span') || '3m'; } catch (e) { return '3m'; } })(), fit: null, openTest: null };
  window.CX.state = state;

  const ds = (id) => dash.data(id);
  const rowsOk = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : null; };
  const kind = (k) => (rowsOk('coach') || []).filter((r) => r.kind === k);
  const fail = (box) => { if (window.CKC) window.CKC.clear(box); box.replaceChildren(el('div', 'fail', 'Failed to load')); box.classList.remove('dash-skeleton'); };
  const set = (id, v) => { const e = $(id); if (!e) return; e.textContent = v === null || v === undefined || v === '' ? '—' : String(v); e.classList.remove('dash-skeleton'); };
  const daysTo = (d) => Math.round(dayN(d) - TN);
  const inDays = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'yesterday' : `${-n} days ago`);
  const stamp = (iso) => { const d = new Date(iso); if (isNaN(d)) return ''; const same = d.toDateString() === now.toDateString(); return (same ? '' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  // ---------- tabs and links ----------
  // Phones: the tab strip scrolls sideways (style.css, mobile pass), so keep the open tab in view and drop the edge fade at the end.
  function keepTabInView(page) {
    const bar = document.querySelector('.cx-tabs'); const t = $('tab-' + page); if (!bar || !t || bar.scrollWidth <= bar.clientWidth + 1) return;
    const l = t.offsetLeft - bar.offsetLeft, r = l + t.offsetWidth;
    if (l < bar.scrollLeft + 24 || r > bar.scrollLeft + bar.clientWidth - 24) bar.scrollTo({ left: Math.max(0, l - (bar.clientWidth - t.offsetWidth) / 2), behavior: 'smooth' });
  }
  // The sticky bar's height (Phase 6): the range row on Fitness and Health docks under it, and scroll margins clear both
  { const bar = $('cx-bar'), root = $('cx'); if (bar && root && window.ResizeObserver) new ResizeObserver(() => root.style.setProperty('--cx-bar-h', bar.offsetHeight + 'px')).observe(bar); }
  { const bar = document.querySelector('.cx-tabs'); if (bar) { const edge = () => bar.classList.toggle('at-end', bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2); bar.addEventListener('scroll', edge, { passive: true }); window.addEventListener('resize', edge); edge(); } }
  function show(page, link) {
    if (!PAGES.includes(page)) page = 'today';
    const changed = state.page !== page;
    state.page = page;
    for (const p of PAGES) {
      $(p).hidden = p !== page;
      const t = $('tab-' + p); t.setAttribute('aria-selected', String(p === page)); t.tabIndex = p === page ? 0 : -1;
    }
    if (link) dash.setLink(page);
    keepTabInView(page);
    if (changed) { const top = $('cx-top').getBoundingClientRect().top; if (top < 0) $('cx-top').scrollIntoView(); }
    render();
  }
  PAGES.forEach((p, i) => {
    const t = $('tab-' + p);
    t.addEventListener('click', () => show(p, true));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = PAGES[(i + (e.key === 'ArrowRight' ? 1 : PAGES.length - 1)) % PAGES.length]; show(n, true); $('tab-' + n).focus();
    });
  });
  window.CX.show = show;

  // ---------- small drawing helpers ----------
  // Every chart draws through charts.js (window.CKC; rules in CHARTS.md). Colours reach it as token names only.
  const SPORT_TONE = { bike: 'bike', run: 'run', swim: 'swim', strength: 'strength', hike: 'surface', other: 'other', walk: 'fg-3', race: 'run', test: 'fg-3', rest: 'fg-3' };
  const RACE_TONE = { bike: 'bike', run: 'run', trail: 'other', adventure: 'series-7' };
  const TONE = { 'var(--color-fg)': 'fg', 'var(--color-fg-muted)': 'fg-3', 'var(--cds-chart-muted)': 'fg-3', 'var(--cds-chart-reference)': 'chart-threshold' };
  const toneOf = (x) => (x ? x.tone || TONE[x.color] : undefined);
  const CKC = () => window.CKC;
  function legend(box, items) {
    box.replaceChildren();
    for (const it of items) { const s = el('span'); const i = el('i', it.cls || ''); if (it.color) { i.style.background = it.color; i.style.color = it.color; } s.append(i, it.label); box.append(s); }
  }

  // Shared time range for every Fitness and Health chart (the athlete, Oct 24): 1M, 3M, 1Y or All, one choice for both tabs
  const SPANS = { '1m': [30, 'the month before'], '3m': [91, 'the 3 months before'], '1y': [365, 'the year before'], all: [null, ''] };
  const spanFrom = () => (SPANS[state.span] && SPANS[state.span][0] ? isoN(TN - SPANS[state.span][0] + 1) : null);
  const inSpan = (rows) => { const f = spanFrom(); return f ? rows.filter((r) => r.date >= f) : rows; };
  const spanStart = (rows) => spanFrom() || (rows.length ? rows[0].date : TODAY);
  const spanName = () => ({ '1m': 'the last month', '3m': 'the last 3 months', '1y': 'the last year', all: 'the record' }[state.span]);
  // Fitness (#f-span) and Health (#g-span) each have a Cockpit segmented control (radios); one state key, cx-span.
  function syncSpan() {
    for (const i of document.querySelectorAll('#f-span input, #g-span input')) i.checked = i.value === state.span;
  }
  function setSpan(v) {
    state.span = v; try { localStorage.setItem('cx-span', state.span); } catch (e) { /* per-viewer convenience only */ }
    syncSpan(); if (state.page === 'trends') renderTrends(); else if (state.page === 'goals') renderGoals();
  }
  for (const inp of document.querySelectorAll('#f-span input, #g-span input')) inp.addEventListener('change', () => { if (inp.checked) setSpan(inp.value); });
  // x-axis ticks: months under ~10 months, then every 2, 3, 6 or 12 months with the year, at most one label per ~46 px
  function timeTicks(x, xd, W0) {
    const span = (xd[1] - xd[0]) / 86400000;
    if (span <= 75) return { ticks: x.ticks(Math.max(2, Math.floor(W0 / 80))), fmt: fDay };
    const fit = Math.max(2, Math.floor(W0 / 46)); const months = span / 30.4;
    const step = [1, 2, 3, 6, 12].find((k) => months / k <= fit) || 12;
    const fY = d3.utcFormat("%b '%y"), fYY = d3.utcFormat('%Y');
    return { ticks: x.ticks(d3.utcMonth.every(step)), fmt: step === 12 ? fYY : span > 300 ? (d) => (d.getUTCMonth() === 0 || step >= 3 ? fY(d) : fMon(d)) : fMon };
  }

  function lineChart(box, rows, o) {
    box.querySelectorAll(':scope > .seg.zoom, :scope > .ft-zoom').forEach((n) => n.remove());
    const fix = (a) => (a ? a.map((x) => (x && x.color !== undefined && !x.tone ? { ...x, tone: toneOf(x) } : x)) : a);
    return CKC().line(box, { ...o, key: o.key || box.id || 'line', rows, today: o.today === false ? null : TODAY, unit: String(o.unit || '').trim(),
      series: fix(o.series), bands: fix(o.bands), tbands: fix(o.tbands), blocks: fix(o.blocks), strips: fix(o.strips),
      tipLines: o.tipLines ? (r) => o.tipLines(r).filter(Boolean).map((l) => ({ tone: toneOf(l), text: l.text })) : undefined });
  }

  // ---------- header ----------
  function renderHeader() {
    const b = kind('build')[0], t = kind('today')[0];
    const parts = [];
    if (t && t.generated_at_utc) parts.push('Check-in ' + stamp(t.generated_at_utc));
    if (b && b.garmin_pull_utc) parts.push('Garmin ' + stamp(b.garmin_pull_utc));
    $('cx-asof').textContent = parts.join(' · ');
    // footer: "Coach 4.0.0 · built Nov 6, 7:45 AM" from the build row; no version span when the row carries none
    const ft = $('cx-foot-t'), bd = b && b.built_at_utc ? new Date(b.built_at_utc) : null; $('cx-foot').hidden = !b; ft.replaceChildren(); if (!b) return;
    ft.append('Coach'); if (b.version) ft.append(' ', mark(el('span', null, b.version), 'coach', 'version', 'kind=build'));
    if (bd && !isNaN(bd)) { const t = mark(el('span', null, bd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + bd.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })), 'coach', null, 'kind=build', 'formatted'); t.setAttribute('data-rule', 'app.js renderHeader: built_at_utc as local month, day and time'); ft.append(' · built ', t); }
  }

  // ---------- TODAY ----------
  function nextRace() {
    const rs = kind('race').filter((r) => r.status !== 'done' && dayN(r.date) >= TN).sort((a, b) => (a.date < b.date ? -1 : 1));
    return rs[0] || null;
  }
  function fuelFor(date) {
    const ws = kind('fuel').filter((f) => dayN(f.start) <= dayN(date) && dayN(date) <= dayN(f.end)).sort((a, b) => (dayN(a.end) - dayN(a.start)) - (dayN(b.end) - dayN(b.start)));
    const w = ws[0]; if (!w) return null;
    if (w.mode !== 'deficit') return { chip: w.label, text: w.text };
    const days = kind('day');
    const keyish = (d) => days.some((r) => r.date === d && r.type !== 'rest' && (r.key === true || r.key === 'true' || ['quality', 'long', 'test', 'race'].includes(r.intensity)));  // a key rest day is not a fuel day (Nov 3)
    if (keyish(date)) return { chip: 'Maintenance: key day', text: 'Key session today: eat to maintenance, carbs around the session.' };
    if (keyish(isoN(dayN(date) + 1))) return { chip: 'Maintenance: key day tomorrow', text: 'Key session tomorrow: eat to maintenance today.' };
    return { chip: 'Deficit day', text: w.text };
  }
  function blockAt(date) {
    const bs = kind('block').sort((a, b) => (a.start < b.start ? -1 : 1));
    return bs.find((b) => dayN(date) >= dayN(b.start) && dayN(date) <= dayN(b.end)) || null;
  }
  function chip(label, value) { const c = el('span', 'ck-chip'); c.append(el('span', 'ck-chip-k', label)); if (value) c.append(el('span', null, value)); return c; }
  // Cockpit helpers (cockpit.css): an icon from the sprite, a status badge (glyph + word + the hidden state word), marks,
  // and the shared card states. An icon never carries meaning alone; the word sits beside it.
  const SVGNS = 'http://www.w3.org/2000/svg';
  function icon(name, cls) { const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', cls || 'ck-i'); s.setAttribute('aria-hidden', 'true'); const u = document.createElementNS(SVGNS, 'use'); u.setAttribute('href', '#cx-' + name); s.append(u); return s; }
  // the four status states; a badge always carries one of them (glyph, word, hidden state name)
  const ST_NAME = { good: 'Good', watch: 'Watch', act: 'Act', unknown: 'Unknown' };
  function badge(st, word, cls) {
    const b = el('span', 'ck-badge' + (cls ? ' ' + cls : '')); b.dataset.s = st;
    b.append(icon(st, 'ck-g'));
    if (word !== ST_NAME[st]) b.append(el('span', 'ck-sr', ST_NAME[st] + ': '));
    b.append(word); return b;
  }
  // a neutral chip: a plain word in the badge's shape, no glyph and no status (a Low or High that is not a Watch)
  function neutralChip(word, cls) { const b = el('span', 'ck-badge td-neutral' + (cls ? ' ' + cls : '')); b.dataset.s = 'plain'; b.append(word); return b; }
  // fixed numbers in copy carry data-rule naming where the rule lives (held values, listed in the Phase 5 report)
  const ruleSpan = (text, rule) => { const e = el('span', null, text); e.setAttribute('data-rule', rule); return e; };
  const RUN_AT = () => ruleSpan('7:45', 'coach/ops/data_paths.json morning_checkin: 7:45 AM ET');
  function mark(e, src, field, where, derived) { if (src) e.setAttribute('data-source', src); if (field) e.setAttribute('data-field', field); if (where) e.setAttribute('data-where', where); if (derived) e.setAttribute('data-derived', derived); return e; }
  // Shared states (ck-state): each Today card has a [data-slot] beside its [data-body]. loading keeps the card's place,
  // empty says what fills it, error says what is safe and never wipes saved data; null shows the body.
  function cardState(card, st, text) {
    if (!card) return; const slot = card.querySelector(':scope > [data-slot]'), body = card.querySelector(':scope > [data-body]'); if (!slot || !body) return;
    slot.hidden = !st; body.hidden = !!st; card.setAttribute('aria-busy', String(st === 'loading'));
    if (!st || (st === 'loading' && slot.dataset.state === 'loading')) return;
    slot.dataset.state = st; slot.removeAttribute('aria-busy'); slot.setAttribute('role', st === 'error' ? 'alert' : 'status'); slot.replaceChildren();
    if (st === 'loading') { slot.append(el('span', 'ck-vh', 'Loading')); for (const c of ['ck-skel ck-skel--lg', 'ck-skel', 'ck-skel ck-skel--md']) { const k = el('span', c); k.setAttribute('aria-hidden', 'true'); slot.append(k); } return; }
    const w = el('span', 'ck-state-w'); w.append(icon(st === 'error' ? 'act' : 'unknown'), st === 'error' ? 'Could not load' : 'Nothing yet'); const tx = el('span'); tx.append(...[].concat(text)); slot.append(w, tx);
  }
  // a dataset's state for a card: loading until it arrives, error when it failed, else null
  const dsState = (id) => { const d = ds(id); return d.status === 'ok' ? null : d.status === 'error' || d.status === 'missing' ? 'error' : 'loading'; };

  // Progress read-out (the athlete, Oct 23: the post-day brief, points toward the next level): markers that moved in the last 7 days
  function standingOf(m, v) {
    const ts = tiersOf(m); const band = ts.find((t) => inTier(t, v)) || null;
    const pct = band ? pctThrough(m, band, v).pct : null;
    return { band, pct, sub: subtiersOf(m).find((t) => inTier(t, v)) || null };
  }
  function seriesFor(m) {
    let rows = kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }));
    if (['consistency', 'strength', 'sauna'].includes(m.key)) { const full = rows.filter((r) => !/so far/.test(String(r.extra || ''))); rows = full.map((r, i) => ({ date: r.date, value: avgOf(full.slice(Math.max(0, i - 3), i + 1).map((x) => x.value)) })); }
    return rows;
  }
  function progressItem(m, prev, last) {
    const a = standingOf(m, prev.value), b = standingOf(m, last.value); const vf = valFmt(m); const better = Number(m.better) || 1;
    const improved = better === 1 ? last.value > prev.value : last.value < prev.value; const same = last.value === prev.value;
    const bandUp = a.band && b.band && a.band.label !== b.band.label && improved; const bandDown = a.band && b.band && a.band.label !== b.band.label && !improved;
    const dp = a.pct !== null && b.pct !== null && a.band && b.band && a.band.label === b.band.label ? Math.round((b.pct - a.pct) * 100) : null;
    if (same || (dp !== null && dp === 0 && !bandUp && !bandDown)) return null;
    const item = el('div', 'td-pi'); mark(item, 'coach', null, m.key && kind('mpt').some((q) => q.key === m.key) ? 'kind=mpt&key=' + m.key : null, 'progress'); const head = el('span'); head.append(el('b', null, m.label), ` · ${vf(prev.value)} → ${vf(last.value)} · ${fDay(P(last.date))}`); item.append(head);
    if (b.band && b.pct !== null) {
      const bar = el('div', 'ck-zone-track td-pbar'); const fill = el('i', 'ck-zone-fill'); fill.style.width = `calc(${Math.round(b.pct * 100)}% - 4px)`; bar.append(fill);
      if (a.pct !== null && a.band && a.band.label === b.band.label) { const tick = el('s', 'td-ptick'); tick.style.left = `calc(${Math.round(a.pct * 100)}% - 1px)`; bar.append(tick); }
      CKC().describe(bar, `${m.label}: ${Math.round(b.pct * 100)}% of the way through ${b.band.label}${a.pct !== null && a.band && a.band.label === b.band.label ? `, from ${Math.round(a.pct * 100)}%` : ''}.`, { derived: 'meter' });
      item.append(bar);
    }
    const line = el('span', 'ck-sub');
    if (bandUp) line.append(el('span', 'td-up', `Level up: ${a.band.label} → ${b.band.label}`), b.pct !== null ? ` · ${Math.round(b.pct * 100)}% through ${b.band.label}` : '');
    else if (bandDown) line.append(el('span', 'td-down', `Back to ${b.band.label}`), ` from ${a.band.label}`);
    else if (dp !== null) line.append(`${b.band.label}: ${Math.round(a.pct * 100)}% → ${Math.round(b.pct * 100)}% `, el('span', dp >= 0 ? 'td-up' : 'td-down', `${dp >= 0 ? '+' : ''}${dp} pts`), b.sub ? ` · ${b.sub.label}` : '');
    else { const df = deltaFmt(m); line.append(b.band ? `${b.band.label}${b.sub && b.sub.label !== b.band.label ? ' · ' + b.sub.label : ''} · ` : '', el('span', improved ? 'td-up' : 'td-down', `${improved ? 'better' : 'worse'} by ${df(Math.abs(last.value - prev.value))}`)); }
    item.append(line); item.dataset.mag = String(bandUp || bandDown ? 100 : Math.abs(dp || 0));
    return item;
  }
  function renderProgress() {
    const box = $('t-progress'), list = $('t-progress-list'); if (!box) return;
    const items = [];
    for (const m of kind('marker').filter((x) => x.tiers && x.chart && x.section !== 'calc')) {
      const rows = seriesFor(m); if (rows.length < 2) continue; const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      if (dayN(last.date) <= TN - 7) continue; const it = progressItem(m, prev, last); if (it) items.push(it);
    }
    const fit = rowsOk('fitness');
    if (fit) for (const k of ['run', 'bike']) {
      const bc = blockContext(k, fit.filter((r) => r.marker === k && N(r.avg28) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) }))); if (!bc || !tiersOf(bc.cm).length) continue;
      const rows = bc.full; if (rows.length < 2) continue; const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      if (dayN(last.date) <= TN - 7) continue; const it = progressItem(bc.cm, prev, last); if (it) items.push(it);
    }
    items.sort((x, y) => Number(y.dataset.mag) - Number(x.dataset.mag));
    list.replaceChildren(...items); box.hidden = !items.length;
  }
  function renderKudos() {
    const box = $('t-kudos'), ul = $('t-kudos-list'); if (!box) return;
    const items = kind('kudos').map((k) => ({ label: k.label, level: k.level, date: k.date }));
    const fit = rowsOk('fitness'); // run pace at 150 and bike power at 130 are page calculations, so their crossings are found here
    if (fit) for (const k of ['run', 'bike']) {
      const bc = blockContext(k, fit.filter((r) => r.marker === k && N(r.avg28) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) }))); if (!bc) continue;
      if (tiersOf(bc.cm).length) { const mi = milestoneInfo(bc.cm, bc.full); if (mi) for (const e of mi.reached) if (e.held && dayN(e.date) > TN - 7) items.push({ label: bc.cm.label, level: e.label, date: e.date }); }
      if (bc.goal && bc.goal.target !== null) { // goal kudos: first day inside the block at or past Target / Strong, within the last 7 days
        const better = bc.lb ? -1 : 1; const ahead = (v, e) => (better === 1 ? v >= e : v <= e);
        for (const [lab, e] of [['Target', bc.goal.target], ['Strong', bc.goal.strong]]) { if (e === null) continue; const first = bc.series.find((r) => ahead(r.value, e)); if (first && dayN(first.date) > TN - 7 && ahead(bc.goal.latest, e)) items.push({ label: `${bc.cm.label} · ${bc.goal.block}`, level: `Goal: ${lab} ${valFmt(bc.cm)(e)} reached`, date: first.date }); }
      }
    }
    items.sort((a, b) => (a.date < b.date ? 1 : -1));
    ul.replaceChildren(); for (const it of items) { const li = mark(el('li'), 'coach', null, null, 'kudos'); li.append(el('b', null, it.level), ` · ${it.label} · ${fDay(P(it.date))}`); ul.append(li); }
    box.hidden = !items.length;
  }
  // Doing the plan (the athlete picked S-A "two lines", Phase 6, Nov 5, 2026; it replaces the Plan streak card): key-session
  // adherence first, then every scheduled session. The counts are the Week card's (weekAdh); every figure is derived from
  // week_view and names the rule. The strip shows the weeks since the three-a-week rule (KEY_RULE_FROM, the date keySlots
  // counts from), at most 8, oldest left and this week last. The 4-week key sum reads the same window, capped at 4 weeks (k4w
  // says how many; until the rule is 4 weeks old the line reads "since" the rule date); the all-sessions sums read the last 4 weeks.
  // Round 5 (the athlete, Nov 5): the default is two figure lines, key and all sessions this week; the strip and the 4-week lines are
  // built only once the rule has two weeks behind it (strip of 2+ cells); the rule sits behind the What counts disclosure.
  const ADH_RULE = 'app.js weekAdh: keys done (done, fallback, swapped, or a key rest day rested) of the week\'s key slots, three from KEY_RULE_FROM; sessions done of planned, rest days and tests left out';
  function adhSpan(txt, d, wk) { const e = mark(el('span', null, String(txt)), 'week_view', null, wk ? 'week=' + wk : null, d); e.setAttribute('data-rule', ADH_RULE); return e; }
  function adhOf() {
    const wv = rowsOk('week_view'); if (!wv) return null; const w0 = dayN(monday(TODAY)), r0 = dayN(monday(KEY_RULE_FROM));
    const at = (k) => weekAdh(isoN(w0 - 7 * k), wv); const l4 = [3, 2, 1, 0].map(at), sum = (f) => l4.reduce((t, w) => t + w[f], 0);
    const n = Math.max(1, Math.min(8, Math.floor((w0 - r0) / 7) + 1)); // weeks since the rule started, this week included
    const strip = Array.from({ length: n }, (_, i) => at(n - 1 - i)), kw = strip.slice(-4), ks = (f) => kw.reduce((t, w) => t + w[f], 0);
    return { strip, now: l4[3], k4: ks('kDone'), kN4: ks('kN'), k4w: kw.length, s4: sum('sDone'), sN4: sum('sN') };
  }
  function adhStrip(weeks) {
    const n = weeks.length, from = fDay(P(KEY_RULE_FROM)), ol = el('ol', 'td-adh-strip'); ol.style.setProperty('--n', n);
    ol.setAttribute('aria-label', n === 1 ? `Key sessions done this week, the first week of three a week (since ${from})` : `Key sessions done each week, ${weeks[0].wk === monday(KEY_RULE_FROM) ? `since ${from}, ${n} weeks` : `the last ${n} weeks`}, this week last`);
    for (const w of weeks) {
      const li = el('li', 'td-adh-wk' + (w === weeks[n - 1] ? ' is-now' : '')), wm = w.items.length ? w.wk : null;
      const cell = el('span', 'td-adh-cell'); cell.setAttribute('aria-hidden', 'true'); if (w.kN) { const f = el('i'); f.style.height = `${Math.round((w.kDone / w.kN) * 100)}%`; cell.append(f); }
      const fr = el('span', 'td-adh-f'); fr.append(adhSpan(w.kDone, 'key-done', wm), '/', adhSpan(w.kN, 'key-n', wm));
      li.append(cell, fr, el('span', 'ck-vh', w === weeks[n - 1] ? ' this week' : ` week of ${fDay(P(w.wk))}`)); ol.append(li);
    }
    const ax = el('p', 'td-adh-ax'); ax.setAttribute('aria-hidden', 'true'); ax.style.setProperty('--n', n);
    if (n > 1) ax.append(el('span', null, fDay(P(weeks[0].wk)))); ax.append(el('span', null, 'This week'));
    const wrap = el('div', 'td-adh-sw'); wrap.append(ol, ax); return wrap;
  }
  function renderAdh() {
    const card = $('t-adh'), body = $('t-adh-body'); body.replaceChildren(); card.hidden = true; const a = adhOf();
    if (!a || !(a.strip.some((w) => w.kN || w.sN) || a.kN4 || a.sN4)) return; card.hidden = false; const n = a.now, wm = n.items.length ? n.wk : null;
    const of = (x, y, dx, dy, w) => [adhSpan(x, dx, w), ' of ', adhSpan(y, dy, w)];
    const r = $('t-adh-rule'); r.replaceChildren('Done: the session, its fallback or a swap. A key rest day counts when you rest; any training breaks it. A key not done is a miss; nothing is frozen. ', ruleSpan('Three', KEY_RULE), ' key sessions a week since ', ruleSpan(fDay(P(KEY_RULE_FROM)), 'app.js KEY_RULE_FROM: ' + KEY_RULE_FROM), '.');
    const line = (lab, x, y, dx, dy) => { const p = el('p', 'td-adh-big'), fig = el('span', 'ck-big'), fu = el('span', 'ck-unit'); fu.append('of ', adhSpan(y, dy, wm)); fig.append(adhSpan(x, dx, wm), fu); p.append(el('span', 'ck-tile-label', lab), ' ', fig, el('span', 'ck-sub', 'this week')); return p; };
    const k = el('div', 'td-adh-k'), s = el('div', 'td-adh-k'), two = a.strip.length > 1;
    k.append(line('Key sessions', n.kDone, n.kN, 'key-done', 'key-n')); s.append(line('All sessions', n.sDone, n.sN, 'sessions-done', 'sessions-planned'));
    if (two) { const k4 = el('p', 'ck-sub'), s4 = el('p', 'ck-sub'); k4.append(...of(a.k4, a.kN4, 'key-done-4wk', 'key-n-4wk'), a.k4w < 4 ? ' since ' : ' over the last 4 weeks'); if (a.k4w < 4) k4.append(ruleSpan(fDay(P(KEY_RULE_FROM)), 'app.js KEY_RULE_FROM: ' + KEY_RULE_FROM));
      s4.append(...of(a.s4, a.sN4, 'sessions-done-4wk', 'sessions-planned-4wk'), ' over the last 4 weeks'); k.append(adhStrip(a.strip), k4); s.append(s4); }
    body.append(k, s);
  }
  // Today (Cockpit, Phase 5): the deck is the call, the session with its size control, the Watch notice and the next race.
  // Readiness GREEN / YELLOW / RED reads as the good / watch / act badge with the readiness word; no row = unknown.
  const READY_S = { GREEN: 'good', YELLOW: 'watch', RED: 'act' };
  function renderToday() {
    renderKudos(); renderProgress(); renderAdh();
    const t = kind('today')[0];
    $('t-cc').hidden = true; // coachCall shows it again when there is a call to show
    const cst = dsState('coach');
    for (const id of ['t-hero', 't-workout', 't-race']) cardState($(id), cst, cst === 'error' ? 'The coach data did not arrive. Your saved check-ins are safe.' : '');
    $('t-conf-w').hidden = !t || !t.confidence; // the confidence line belongs to a call; none without one
    if (!cst && !t) for (const [id, msg] of [['t-hero', 'No call yet. It arrives with the '], ['t-workout', 'No session yet. It arrives with the ']]) cardState($(id), 'empty', [msg, RUN_AT(), ' check-in.']);
    if (t) {
      $('t-hero').dataset.r = String(t.readiness || '');
      const rs = READY_S[String(t.readiness || '').toUpperCase()] || 'unknown';
      const g = $('t-ready-g'); g.dataset.s = rs; g.replaceChildren(icon(rs, 'ck-g'));
      $('t-ready-sr').textContent = ST_NAME[rs] + ': ';
      set('t-ready', t.readiness); set('t-conf', t.confidence); set('t-reason', t.reason); set('t-dq', t.data_quality);
      set('t-call', t.call); set('t-call-t', t.workout_title);
      set('t-title', t.workout_title); set('t-purpose', t.purpose); set('t-b-nominal', t.nominal); set('t-b-upper', t.upper); set('t-b-fallback', t.fallback); set('t-rule', t.choice_rule); set('t-q', t.question);
      const stale = t.date !== TODAY;
      // stale: the banner above the call says so and how old the check-in is; the call below keeps full contrast
      $('t-stale').hidden = !stale; $('t-hero').classList.toggle('is-stale', stale);
      if (stale) { const st = $('t-stale-t'); st.replaceChildren(); if (now.getHours() < 10) st.append(`This is ${fDow(P(t.date))}'s check-in. Today's arrives after the `, RUN_AT(), ' run.'); else st.append(`No check-in yet today; this is ${fDow(P(t.date))}'s.`); $('t-stale-age').textContent = t.generated_at_utc ? `Check-in ${stamp(t.generated_at_utc)}.` : ''; }
      const box = $('t-planned'); box.replaceChildren();
      const todays = kind('day').filter((r) => r.date === TODAY).sort((a, b) => (a.order || 0) - (b.order || 0));
      // week-plan state (Phase 6 round 3, the athlete: the size control and Help me pick every day): before today's check-in the tile
      // shows the week plan for today; its first day row drives Fallback / Plan / Strong day and their size texts, its details
      // go in Help me pick, and yesterday's purpose, choice rule and question stay out. A rest day has no sizes.
      const usePlan = stale && todays.length > 0, pd = usePlan ? todays[0] : null, pdw = pd ? `kind=day&date=${pd.date}&order=${pd.order}` : null;
      const sized = !pd || pd.type !== 'rest', det = $('t-pdet'); det.replaceChildren(); det.hidden = !usePlan;
      box.hidden = !usePlan; $('t-presc-a').hidden = usePlan; $('t-presc-b').hidden = !sized; $('t-presc-s').hidden = !sized; $('t-purpose').hidden = usePlan; $('t-rule').hidden = usePlan;
      $('t-wk-eyebrow').textContent = usePlan ? "Today's plan" : stale ? `Session from ${fWd(P(t.date))}` : "Today's session";
      if (usePlan) {
        for (const r of todays) {
          const w = `kind=day&date=${r.date}&order=${r.order}`;
          box.append(mark(el('h3', 'ck-session-title', r.title), 'coach', 'title', w));
          if (r.detail) det.append(mark(el('p', 'ck-session-text', r.detail), 'coach', 'detail', w));
        }
        const fp = el('p', 'ck-note', 'From the week plan; the '); fp.append(RUN_AT(), ' check-in may adjust it.'); box.append(fp);
      }
      $('t-presc-c').hidden = usePlan && !det.children.length; $('t-ask').hidden = !t.question || usePlan; // Coach asks only from today's check-in
      // the size texts: the check-in's (kind=today), or in the week-plan state one line built from the day row's fields;
      // a size the row leaves blank is disabled and says so
      for (const [k, f] of [['nominal', 'minutes'], ['upper', 'upper_minutes'], ['fallback', 'fallback_minutes']]) {
        const sp = $('t-b-' + k), v = pd ? N(pd[f]) : null; document.querySelector(`#t-bounds input[value=${k}]`).disabled = !!pd && v === null;
        if (!pd) { sp.removeAttribute('data-derived'); mark(sp, 'coach', k, 'kind=today'); continue; }
        sp.removeAttribute('data-field'); mark(sp, 'coach', null, pdw, 'plan-size'); sp.replaceChildren();
        if (v === null) { sp.append(`No ${k === 'upper' ? 'strong-day' : 'fallback'} size in the week plan today.`); continue; }
        const word = (fd) => mark(el('span', null, String(pd[fd])), 'coach', fd, pdw), alt = k === 'fallback' && pd.alt_type;
        sp.append(k === 'upper' ? 'Up to ' : '', mark(el('span', null, String(v)), 'coach', f, pdw), ' min');
        if (pd.intensity && (k !== 'fallback' || pd.intensity === 'easy')) sp.append(' ', word('intensity'));
        if (alt || pd.type) sp.append(' ', word(alt ? 'alt_type' : 'type'));
      }
      // the session's minutes, sport and the minutes of each size, from the week plan row of the session's day
      const pr = (rowsOk('week_view') || []).find((r) => r.date === t.date && r.kind === 'plan' && Number(r.order) === 1) || null;
      const pw = pr ? `kind=day&date=${pr.date}&order=${pr.order}` : null; // marks name the coach day row week_view copies these from
      const sm = $('t-sess-min'); sm.replaceChildren(); sm.hidden = !(pr && N(pr.minutes) !== null && N(pr.minutes) > 0);
      if (!sm.hidden) sm.append(mark(el('span', null, String(N(pr.minutes))), 'coach', 'minutes', pw), el('span', 'ck-unit', 'min'));
      const sp = $('t-sport'); sp.replaceChildren(); sp.hidden = !pr || usePlan;
      if (pr) { const tp = SPORT_TONE[pr.type] && ['bike', 'run', 'swim', 'strength'].includes(pr.type) ? pr.type : 'other'; sp.dataset.sport = tp; sp.append(icon(['bike', 'run', 'swim', 'strength'].includes(pr.type) ? pr.type : 'session'), mark(el('span', 'td-cap', pr.type), 'coach', 'type', pw)); if (pr.intensity) sp.append(' · ', mark(el('span', null, pr.intensity), 'coach', 'intensity', pw)); }
      coachCall(t, stale);
      for (const [k, f] of [['fallback', 'fallback_minutes'], ['nominal', 'minutes'], ['upper', 'upper_minutes']]) {
        const sub = $('t-bm-' + k); sub.replaceChildren(); const v = pd ? N(pd[f]) : pr ? N(pr[f]) : null;
        if (v !== null) sub.append(mark(el('span', null, String(v)), 'coach', f, pd ? pdw : pw), ' min'); else if (pd) sub.append('not set');
      }
    }
    renderBound();
    const keyToday = kind('day').filter((r) => r.date === TODAY && (r.key === true || r.key === 'true' || N(r.pillar) !== null));
    const ebh = $('t-wk-eyebrow-h');
    ebh.querySelectorAll('.td-key').forEach((n) => n.remove());
    if (keyToday.length) ebh.append(mark(el('span', 'ck-chip td-key', N(keyToday[0].pillar) !== null ? `Key ${N(keyToday[0].pillar)} of ` : 'Key session'), 'coach', null, `kind=day&date=${TODAY}`, 'key')); const kc = ebh.querySelector('.td-key:last-child'); if (kc && N(keyToday[0].pillar) !== null) kc.append(ruleSpan('3', 'coach/engine/KEY-SESSIONS.md: three key sessions a week'));
    const doneBox = $('t-done'); doneBox.replaceChildren();
    const doneToday = (rowsOk('week_view') || []).filter((r) => r.date === TODAY && r.done_text);
    doneBox.hidden = !doneToday.length;
    if (doneToday.length) {
      const dw = el('span', 'ck-notice-w'); dw.append(icon('check'), 'Done today'); doneBox.append(dw);
      for (const r of doneToday) {
        const fl = String(r.flags || '');
        const note = fl.includes('over') ? ` · longer than the ${r.upper_minutes} min strong-day bound` : fl.includes('short') ? ' · under the plan' : r.status === 'fallback' ? ' · the fallback, which counts' : r.status === 'swapped' ? ' · a different discipline than planned' : '';
        doneBox.append(mark(el('span', null, r.done_text + note), 'week_view', null, `date=${r.date}&kind=${r.kind}&order=${r.order}`, 'done'));
      }
      const ids = doneToday.flatMap((r) => String(r.done_ids || '').split(';').filter(Boolean));
      const rated = ids.map((id) => (window.CX.live && window.CX.live.get(id)) || null).find(Boolean) || doneToday.find((r) => r.rpe !== null && r.rpe !== undefined);
      doneBox.append(mark(el('span', 'ck-sub', rated ? `Rated RPE ${rated.rpe}.` : 'Rate it below so the coach sees the effort.'), 'week_view', null, null, 'rpe'));
    }
    const chips = $('t-chips'); chips.replaceChildren();
    const b = blockAt(TODAY);
    if (b) { const wk = Math.floor((TN - dayN(b.start)) / 7) + 1, weeks = Math.max(1, Math.round((dayN(b.end) - dayN(b.start) + 1) / 7)); chips.append(mark(chip(b.label || b.short, `week ${Math.min(wk, weeks)} of ${weeks}`), 'coach', null, b.key ? 'kind=block&key=' + b.key : null, 'block-week')); }
    const r = nextRace(); if (r) chips.append(mark(chip(r.name.replace('IRONMAN 70.3 ', ''), inDays(daysTo(r.date))), 'coach', null, 'kind=race&race_id=' + r.race_id, 'days-until'));
    const fu = fuelFor(TODAY); if (fu) chips.append(mark(chip('Fuel', fu.chip), 'coach', null, 'kind=fuel', 'fuel'));
    $('t-fuel').textContent = fu ? `Fuel today: ${fu.text}` : '';
    // Help me pick (Phase 6; was the How to choose card): a closed disclosure under the size control. With today's check-in it
    // holds the purpose, choice rule, Coach asks and fuel; in the week-plan state the day row's details and the fuel line.
    // It hides only when it would be empty.
    { const hb = $('t-pick-btn'); hb.hidden = !!t && $('t-presc-c').hidden && $('t-ask').hidden && !$('t-fuel').textContent;
      if (hb.hidden) { hb.setAttribute('aria-expanded', 'false'); $('t-pick').hidden = true; } }
    renderRaceTile(r);
    renderNight();
    renderWatch();
  }
  // Race tile: days to the next race, the next A race in weeks when it is a different race, and the next key session
  // (never a rest day). Every figure is computed from the race and day rows and says so (data-derived).
  // One part, two places (Phase 5, Season): Today's tile (prefix t) and the tile at the top of Season (prefix r, with the race
  // date in its head and the shared states for an error too). Same figures, same marks.
  function renderRaceTile(r, p, emptyText) {
    p = p || 't'; const card = $(p + '-race'); const cst = dsState('coach'); const rd = $(p + '-race-d'); if (rd) rd.hidden = true;
    if (cst) { if (p !== 't') cardState(card, cst, cst === 'error' ? 'The race calendar did not arrive. Nothing saved is lost.' : ''); return; }
    if (!r) { cardState(card, 'empty', emptyText || 'No race booked. The Season tab has the calendar.'); return; }
    cardState(card, null);
    const w = 'kind=race&race_id=' + r.race_id, n = daysTo(r.date);
    const rn = $(p + '-race-n'); rn.setAttribute('data-where', w); rn.textContent = n === 0 ? 'Today' : String(n); $(p + '-race-u').textContent = n === 0 ? '' : n === 1 ? 'day' : 'days';
    const nm = $(p + '-race-name'); nm.setAttribute('data-where', w); nm.textContent = r.name;
    if (rd) { rd.setAttribute('data-where', w); rd.textContent = fWd(P(r.date)); rd.hidden = false; }
    const ar = kind('race').filter((x) => x.priority === 'A' && x.status !== 'done' && dayN(x.date) >= TN).sort((x, y) => (x.date < y.date ? -1 : 1))[0];
    const al = $(p + '-race-a'); al.replaceChildren(); al.hidden = !ar || ar.race_id === r.race_id;
    if (!al.hidden) al.append('A race: ', mark(el('b', null, ar.name.replace('IRONMAN 70.3 ', '')), 'coach', null, 'kind=race&race_id=' + ar.race_id, 'formatted'), ' in ', mark(el('span', null, String(Math.round(daysTo(ar.date) / 7))), 'coach', null, 'kind=race&race_id=' + ar.race_id, 'weeks-until'), ' wk');
    const key = kind('day').filter((d) => d.type !== 'rest' && (truthy(d.key) || N(d.pillar) !== null) && dayN(d.date) >= TN).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.order || 0) - (y.order || 0)))[0];
    const kl = $(p + '-race-key'); kl.replaceChildren(); kl.hidden = !key;
    if (key) { const kw = `kind=day&date=${key.date}&order=${key.order}`; kl.append('Next key session: ', mark(el('b', null, key.title), 'coach', 'title', kw), ' · ', mark(el('span', null, daysTo(key.date) === 0 ? 'today' : fDow(P(key.date))), 'coach', null, kw, 'weekday')); }
  }
  // Coach's call on the plan tile (Phase 6 round 4, the athlete's pick C-A, Nov 5: today's call and today's plan read as two things).
  // The call tile keeps readiness; the Call line sits at the top of the Why panel (index.html), and the decision heads the plan
  // tile in words from the today row: a swap in the row's own words when it carries one (swap), else expected.completion (the
  // size the coach expects, a JSON text in the data) picks the phrase and pre-selects that size once per check-in (the athlete can
  // still change it), with the call word for a plain plan. Neither completion nor call: hidden. Before today's check-in: when
  // it arrives.
  const CC_RULE = 'app.js coachCall: expected.completion fallback = Trim to the fallback, upper = Strong day: take the upper bound, nominal = the plan with the call word';
  function coachCall(t, stale) {
    const box = $('t-cc');
    box.replaceChildren(); box.hidden = true; box.classList.remove('is-pending');
    let x = t.expected || {}; if (typeof x === 'string') try { x = JSON.parse(x) || {}; } catch (e) { x = {}; }
    const k = el('span', 'td-cc-k', "Coach's call"), c = String(x.completion || '').toLowerCase();
    if (stale) { box.classList.add('is-pending'); box.append(k, ' arrives with the ', RUN_AT(), ' check-in'); box.hidden = false; return; }
    const d = (txt) => { const e = mark(el('span', null, String(txt)), 'coach', null, 'kind=today', 'coach-call'); e.setAttribute('data-rule', CC_RULE); return e; };
    const cw = () => mark(el('span', 'ck-action-w', String(t.call)), 'coach', 'call', 'kind=today'), w = el('span', 'td-cc-w');
    if (t.swap) w.append('Swap: ', mark(el('span', null, String(t.swap)), 'coach', 'swap', 'kind=today'));
    else if (c === 'fallback') w.append(d('Trim to the fallback'));
    else if (c === 'upper') w.append(d('Strong day: take the upper bound'));
    else if (c === 'nominal' && t.call) w.append(...(String(t.call).toLowerCase() === 'hold' ? [cw(), ' the plan'] : [cw(), ': ', d('the plan as written')]));
    else if (c === 'nominal') w.append(d('The plan as written'));
    else if (t.call) w.append(cw());
    else return;
    box.append(k, w); box.hidden = false;
    // the decision pre-selects its size once per check-in, unless that size is disabled
    const key = `${t.date}|${t.generated_at_utc || ''}`, inp = ['fallback', 'nominal', 'upper'].includes(c) ? document.querySelector(`#t-bounds input[value=${c}]`) : null;
    if (state.ccKey !== key) { state.ccKey = key; if (inp && !inp.disabled) state.bound = c; }
  }
  // Session size (Fallback / Plan / Strong day): native radios in a Cockpit segmented control, one state key (state.bound).
  // The size note is still held in this script (data-rule on #t-b-note) until a data row carries it.
  function renderBound() {
    for (const inp of document.querySelectorAll('#t-bounds input[type=radio]')) inp.checked = inp.value === state.bound;
    for (const k of ['nominal', 'upper', 'fallback']) $('t-b-' + k).hidden = k !== state.bound;
    $('t-b-note').textContent = state.bound === 'fallback' ? 'The fallback counts as success.' : state.bound === 'upper' ? 'Optional: only if you feel strong and the first 10–20 min are clearly controlled.' : '';
  }
  for (const inp of document.querySelectorAll('#t-bounds input[type=radio]')) inp.addEventListener('change', () => { if (inp.checked) { state.bound = inp.value; renderBound(); } });
  // Cockpit behaviours on Today (cockpit.js): the Why disclosure on the call tile
  if (window.CK && window.CK.init) window.CK.init($('today'));

  // The live vitals rule, unchanged: inside 1 SD of the 28-day average is typical; from 1 SD the value is above or below
  // usual (well above or below from 2 SD); it warns only when it sits on the worse side by 1.5 SD or more
  // (warn: worse && a >= 1.5). A value outside 1 SD that does not warn (better side, or worse side under 1.5 SD) is a plain word.
  function zText(r) {
    if (r.value === null) return { text: 'not synced yet', warn: false };
    if (r.z === null) return { text: r.n < 14 ? `no band yet (${r.n} nights)` : '', warn: false };
    const a = Math.abs(r.z), dir = r.z > 0 ? 'above' : 'below', worse = Math.sign(r.z) === -r.better;
    const sd = a < 0.05 ? '0.0 SD' : `${r.z > 0 ? '+' : '−'}${f1(a)} SD`;
    if (a < 1) return { text: `typical · ${sd}`, warn: false, pos: 'inside' };
    return { text: `${a >= 2 ? 'well ' : ''}${dir} usual · ${sd}`, warn: worse && a >= 1.5, pos: dir };
  }
  // The badge for a vital, from zText (the rule above): good Typical, watch Low or High (only when zText warns), plain
  // Low or High otherwise, unknown when not synced or without a band.
  function vState(r) {
    const z = zText(r);
    if (r.value === null) return { z, s: 'unknown', word: 'Not synced' };
    if (r.z === null) return { z, s: 'unknown', word: r.n < 14 ? 'No band yet' : 'Unknown' };
    if (z.pos === 'inside') return { z, s: 'good', word: 'Typical' };
    const w = (Math.abs(r.z) >= 2 ? 'Well ' : '') + (z.pos === 'above' ? 'high' : 'low');
    return { z, s: z.warn ? 'watch' : 'plain', word: w.charAt(0).toUpperCase() + w.slice(1) };
  }
  const VITALS = ['sleep_h', 'sleep_score', 'hrv_overnight_ms', 'resting_hr', 'body_battery_high', 'stress_avg'];
  const vFmt = (r) => (v) => (Math.abs(N(r.mean) || 0) >= 20 ? f0(v) : f1(v));
  // Last night: one table (Cockpit ck-vtab). Under 640 px each row is a tile (2 across); from 640 a table with a sticky
  // first column, an edge fade and a visible scrollbar when it is wider than its frame. The Watch notice reads the same rows
  // with the same rule.
  // Phase 6 round 2 (T-B, the athlete's pick): the section lives inside the call tile (#t-hn, opened from the meter line #t-nm-btn
  // under the readiness word, directly under it; round 3 moved the Call line down to sit with Why); its own state slot,
  // stale line, gauge and the vitals table are in index.html. The tile's head carries
  // the night date. With no gauge figure (loading, error, empty, no band yet) the meter hides and #t-hn shows open, so the
  // state message is never behind a closed row.
  // When the call itself cannot show (coach data loading, missing or empty) the night still can: the meter and #t-hn move
  // out of the call's body to sit under its state message, and go back once the call is drawn.
  function nightHome() {
    const hero = $('t-hero'), body = hero.querySelector(':scope > [data-body]'), mb = $('t-nm-btn'), hn = $('t-hn');
    if (body.hidden) { if (mb.parentNode !== hero) hero.append(mb, hn); }
    else if (mb.parentNode !== body) { body.querySelector('.ck-call-main').after(mb, hn); }
  }
  function nightOpen(on) {
    const mb = $('t-nm-btn'); mb.hidden = !on; $('t-hn').hidden = on ? mb.getAttribute('aria-expanded') !== 'true' : false;
  }
  function renderNight() {
    nightHome();
    const sect = $('t-hn'), box = $('n-grid'), d = ds('night');
    const st = dsState('night');
    if (st) { nightOpen(false); cardState(sect, st, 'Last night\'s data did not arrive. Nothing saved is lost.'); renderCall(null); return; }
    renderGauge();
    box.replaceChildren();
    const by = Object.fromEntries(d.data.map((r) => [r.metric, r]));
    const s = by.sleep_h;
    if (!VITALS.some((m) => by[m])) { nightOpen(false); cardState(sect, 'empty', 'No night synced yet. The vitals appear after the next Garmin pull.'); renderCall(by); return; }
    cardState(sect, null);
    $('n-date').textContent = s ? `Morning of ${fWd(P(s.date))}` : '';
    // stale: the newest night is older than this morning
    const age = s ? TN - dayN(s.date) : 0;
    $('n-stale').hidden = !(s && age >= 1);
    if (s && age >= 1) $('n-stale-t').textContent = `The newest night is from ${fWd(P(s.date))}, ${age === 1 ? '1 day' : age + ' days'} ago. Today's arrives with the next Garmin pull.`;
    for (const m of VITALS) {
      const r = by[m]; if (!r) continue;
      const w = 'metric=' + m, vs = vState(r), z = vs.z;
      const tr = el('tr'); tr.dataset.key = m; tr.id = 'n-' + m; if (vs.s === 'watch') tr.dataset.s = 'watch';
      const th = mark(el('th', 'ck-c-name', r.label), 'night', 'label', w); th.scope = 'row';
      const val = el('td', 'ck-c-val'); val.append(mark(el('span', null, r.value === null ? '—' : String(r.value)), 'night', 'value', w)); if (r.unit) val.append(mark(el('span', 'ck-unit', r.unit), 'night', 'unit', w));
      if (m === 'body_battery_high' && by.body_battery_charged && by.body_battery_charged.value !== null) { const rc = el('span', 'ck-sub td-recharge', 'recharge +'); rc.append(mark(el('span', null, String(by.body_battery_charged.value)), 'night', 'value', 'metric=body_battery_charged')); val.append(rc); }
      const bandOk = N(r.mean) !== null && N(r.sd) !== null && N(r.n) >= 14;
      const lo = bandOk ? N(r.mean) - N(r.sd) : null, hi = bandOk ? N(r.mean) + N(r.sd) : null;
      const rg = mark(el('td', 'ck-c-range'), 'night', null, w, 'usual-range'); rg.dataset.label = 'Usual';
      // the same words and rounding as the range bar's sentence (charts.js CKC.say.band), so they never disagree
      const bw = bandOk && r.value !== null ? CKC().say.band(N(r.value), lo, hi, vFmt(r), r.unit || '', z.pos) : '';
      if (bandOk) rg.textContent = bw ? bw.replace(/^.*your usual /, '') : `${vFmt(r)(lo)} to ${vFmt(r)(hi)}${r.unit ? ' ' + r.unit : ''}`;
      else { rg.replaceChildren(); rg.append('No band yet, ', mark(el('span', null, String(N(r.n) || 0)), 'night', 'n', w), ' of ', ruleSpan('14', 'calc.js night: a band needs 14 nights (min n)'), ' nights'); }
      const sc = mark(el('td', 'ck-c-status'), 'night', null, w, 'vstate'); sc.append(vs.s === 'plain' ? neutralChip(vs.word, 'ck-badge--md') : badge(vs.s, vs.word, 'ck-badge--md'));
      if (r.z !== null && r.value !== null) sc.append(' ', mark(el('span', 'ck-sub', z.text.split(' · ')[1] || ''), 'night', 'z', w));
      const bar = el('td', 'ck-c-bar'); const svgEl = el('div'); bar.append(svgEl);
      tr.append(th, val, rg, sc, bar); box.append(tr);
      // script-held (CHARTS.md): the 14-night gate, the 2.5 SD track width and the usual range = average ± 1 SD.
      // position: the row's own comparison (zText), so the sentence and the row text never disagree
      CKC().rangeBar(svgEl, { key: 'night-' + m, label: r.label, when: 'last night', value: r.value, mean: r.mean, sd: r.sd, lo, hi, position: z.pos, n: r.n, minN: 14, span: 2.5, unit: r.unit, fmt: vFmt(r), marks: { source: 'night', where: w } });
    }
    const foot = $('n-foot'); foot.replaceChildren();
    if (s) { const r1 = el('span', null, '1 SD'), r2 = el('span', null, '28 days'), r3 = el('span', null, '30–45 min'); r1.setAttribute('data-rule', 'calc.js night: usual range = average ± 1 SD'); r2.setAttribute('data-rule', 'calc.js night: 28-day window'); r3.setAttribute('data-rule', 'app.js renderNight: Garmin sleep note');
      foot.append('Bar: your average ± ', r1, ' over the ', r2, ' before (', mark(el('span', null, String(s.n)), 'night', 'n', 'metric=sleep_h'), ' nights); the dot is last night. Descriptive, not a gate. Garmin reads sleep about ', r3, ' high.'); }
    renderCall(by);
  }
  // Last night in one number (Phase 6, option A): a fuel-style half arc from the row's lo (-2 SD, empty, left) to hi (+2 SD,
  // full, right), a tick at 0, the fill in the status colour and a dot at the value. The number is calc night_gauge (the mean
  // of the four SD distances, read here, never recomputed). The word uses the tiles' cut-offs (zText): Typical inside 1 SD,
  // Low or High from 1 (Well from 2), Watch colour only on the low side from 1.5; higher is better for all four.
  const USUAL = 1; // script-held (CHARTS.md 10): the usual range is average ± 1 SD (calc.js night), drawn as dashed marks
  function renderGauge() {
    const g = rowsOk('night_gauge'), r = g && g[0], used = r ? N(r.used) || 0 : 0, v = r ? N(r.value) : null;
    const draw = $('n-g-draw'); draw.replaceChildren();
    for (const id of ['n-g-dial', 'n-g-n']) $(id).hidden = v === null; $('n-g-b').parentNode.hidden = v === null; $('n-g-empty').hidden = v !== null;
    nightOpen(v !== null); if (v === null) return;
    $('n-g-used').textContent = String(used); $('n-g-of').textContent = String(N(r.of));
    const lo = N(r.lo), hi = N(r.hi), a = Math.abs(v), dir = v > 0 ? 'high' : 'low', word = a < 1 ? 'Typical' : a >= 2 ? 'Well ' + dir : dir.charAt(0).toUpperCase() + dir.slice(1);
    const s = a < 1 ? 'good' : v <= -1.5 ? 'watch' : 'plain';
    $('n-g-v').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + f1(a);
    const b = $('n-g-b'); b.replaceChildren(s === 'plain' ? neutralChip(word, 'ck-badge--md') : badge(s, word, 'ck-badge--md'));
    $('n-g-s').textContent = v === 0 ? 'at your normal' : `${a < 1 ? 'a little ' : a >= 2 ? 'well ' : ''}${v > 0 ? 'above' : 'below'} your normal`;
    // geometry: 1 unit = 1 px (280 by 164), so the 11 px scale words stay 11 px; the arc's centre is (140, 140), radius 106
    const W = 280, H = 164, cx = 140, cy = 140, R = 106, f = Math.max(0, Math.min(1, (v - lo) / (hi - lo))), ang = Math.PI * (1 - f);
    const px = cx + R * Math.cos(ang), py = cy - R * Math.sin(ang), NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'td-g-svg');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Gauge from ${lo} SD, low, to +${hi} SD, high, with normal at 0; usual range is -${USUAL} to +${USUAL} SD: last night sits at ${$('n-g-v').textContent.trim()} SD, ${word.toLowerCase()}.`);
    const add = (tag, at, txt) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (txt) e.textContent = txt; svg.append(e); return e; };
    const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
    add('path', { d: arc, class: 'td-g-edge' }); add('path', { d: arc, class: 'td-g-track' });
    add('path', { d: `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${px.toFixed(1)} ${py.toFixed(1)}`, class: 'td-g-fill', 'data-s': s, pathLength: 1 });
    add('line', { x1: cx, y1: cy - R - 15, x2: cx, y2: cy - R + 15, class: 'td-g-mid' });
    // the usual range's edges (-1 and +1 SD): 1 px dashed radial marks across the track, in the muted token
    for (const u of [-USUAL, USUAL]) { const ua = Math.PI * (1 - (u - lo) / (hi - lo)), c = Math.cos(ua), sn = Math.sin(ua); add('line', { x1: (cx + (R - 15) * c).toFixed(1), y1: (cy - (R - 15) * sn).toFixed(1), x2: (cx + (R + 15) * c).toFixed(1), y2: (cy - (R + 15) * sn).toFixed(1), class: 'td-g-sd' }); }
    add('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 8, class: 'td-g-dot' });
    add('text', { x: cx - R, y: cy + 22, class: 'td-g-w' }, 'low'); add('text', { x: cx, y: cy - R - 20, class: 'td-g-w' }, 'normal'); add('text', { x: cx + R, y: cy + 22, class: 'td-g-w' }, 'high');
    draw.append(svg);
    if (window.CK && window.CK.firstDraw) window.CK.firstDraw(draw, 'night-gauge');
    // the meter line in the call (the same figure and word, marked the same): a bar from lo to hi, the fill from 0 to the
    // value in the status colour, a mark at 0, dashed marks at -1 and +1, and the dot at the value
    $('t-nm-v').textContent = $('n-g-v').textContent;
    $('t-nm-word').replaceChildren(s === 'plain' ? neutralChip(word) : badge(s, word));
    const at = (u) => Math.max(0, Math.min(1, (u - lo) / (hi - lo))) * 100, bar = $('t-nm-bar'); bar.replaceChildren(); bar.dataset.s = s;
    const fill = el('i', 'td-nm-fill'); fill.style.left = Math.min(at(0), at(v)) + '%'; fill.style.width = Math.abs(at(v) - at(0)) + '%';
    const mk = (c, u) => { const i = el('i', c); i.style.left = at(u) + '%'; return i; };
    bar.append(fill, mk('td-nm-sd', -USUAL), mk('td-nm-sd', USUAL), mk('td-nm-mid', 0), mk('td-nm-pt', v));
    $('t-nm-btn').setAttribute('aria-label', `Last night ${$('t-nm-v').textContent} SD, ${word}, on a scale from ${lo} to +${hi} SD; usual range is -${USUAL} to +${USUAL} SD. Show the gauge and all vitals`);
  }
  // The deck's Watch notice: the six vitals under the rule above (no new rule).
  function renderCall(by) {
    const rows = by ? VITALS.map((m) => by[m]).filter(Boolean) : [];
    const sts = rows.map((r) => ({ r, v: vState(r) }));
    const watch = sts.filter((x) => x.v.s === 'watch');
    const note = $('t-watchnote'), t = $('t-watchnote-t'); t.replaceChildren(); note.hidden = !watch.length; placeWatch();
    if (watch.length) {
      watch.forEach((x, i) => { if (i) t.append(i === watch.length - 1 ? ' and ' : ', '); const b = el('b', null, x.r.label + ' '); b.append(mark(el('span', null, String(x.r.value)), 'night', 'value', 'metric=' + x.r.metric), x.r.unit ? ' ' + x.r.unit : ''); t.append(b); });
      const r1 = el('span', null, '28-day'), r2 = el('span', null, '1.5 SD'); r1.setAttribute('data-rule', 'calc.js night: 28-day window'); r2.setAttribute('data-rule', 'app.js zText: Watch from 1.5 SD on the worse side');
      t.append(watch.length === 1 ? ' is' : ' are', ' on the worse side of your ', r1, ' average by ', r2, ' or more. Tap Last night in Today\'s call for every vital.');
    }
  }
  // The deck's Watch slot (Phase 3 order: call, session, Watch, race) holds the vitals notice and, when it shows, the pain
  // watch card (Watch or Act); the card goes back to its place below when it has nothing to flag or cannot load.
  const WHOME = document.createComment('t-watch home');
  function placeWatch() {
    const card = $('t-watch'), slot = $('t-watchslot'), note = $('t-watchnote'); if (!card || !slot) return;
    if (!WHOME.parentNode) card.before(WHOME);
    const flag = !card.hidden && card.dataset.flag === '1';
    if (flag && card.parentNode !== slot) slot.append(card); else if (!flag && card.parentNode === slot) WHOME.after(card);
    slot.hidden = note.hidden && !flag;
  }
  function renderWatch() { renderWatchCard(); placeWatch(); }
  function renderWatchCard() {
    const box = $('t-watch'); const fst = dsState('feel_series'); const fs = rowsOk('feel_series');
    delete box.dataset.flag;
    if (fst === 'error') { box.hidden = false; cardState(box, 'error', 'The morning check-ins did not arrive, so the pain watch cannot be read. Your saved check-ins are safe.'); return; }
    if (!fs) { box.hidden = true; return; }
    cardState(box, null);
    const recent = fs.filter((r) => dayN(r.date) > TN - 8 && dayN(r.date) <= TN);
    const withPain = recent.filter((r) => N(r.pain) > 0);
    box.hidden = !withPain.length; if (!withPain.length) return;
    const last = withPain[withPain.length - 1];
    const sites = [...new Set(withPain.flatMap((r) => String(r.pain_site || '').split(';').filter(Boolean)))];
    const vals = recent.map((r) => N(r.pain)).filter((v) => v !== null);
    const a = vals.slice(-3), b = vals.slice(-6, -3);
    const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const trend = a.length && b.length ? (avg(a) - avg(b) >= 1 ? 'rising' : avg(b) - avg(a) >= 1 ? 'easing' : 'steady') : 'steady';
    const where = sites.join(', ') || 'pain';
    let streak = 0; for (let d = TN; d > TN - 30; d--) { const r = fs.find((q) => dayN(q.date) === d); if (r && N(r.pain) > 0) streak++; else if (r || d < TN) break; }
    const soon = kind('day').filter((d) => d.type !== 'rest' && (truthy(d.key) || d.type === 'race' || d.intensity === 'race' || d.intensity === 'long') && dayN(d.date) >= TN && dayN(d.date) <= TN + 3).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    const pw = (p) => (p <= 0 ? 'none' : p <= 2 ? 'a niggle' : p <= 4 ? 'hurts' : 'stop');
    const flags = [];
    if (streak >= 5) flags.push(`${streak} mornings in a row: get it checked by a physio or sports doctor`);
    else if (streak >= 3) flags.push(`${streak} mornings in a row: treat it as more than a niggle, keep load the same or lower, no new stress`);
    if (soon && N(last.pain) > 0 && dayN(last.date) >= TN - 1) flags.push(`${soon.title} ${inDays(daysTo(soon.date))}: do a load test first (walk, stairs, hops), and drop to the fallback if it isn't clearly better`);
    const wt = $('w-watch-text'); wt.setAttribute('data-where', 'date=' + last.date);
    wt.textContent = `${where.charAt(0).toUpperCase() + where.slice(1)}: ${pw(N(last.pain))} on ${fDow(P(last.date))}; pain on ${withPain.length} of the last ${recent.length} check-ins, ${trend}.` + (flags.length ? ' Flag: ' + flags.join('; ') + '.' : '') + ' Hurts or Stop, rising, or changing your stride: injury rules apply.';
    // a pain flag is Act (the one live trigger for Act on Today); otherwise Watch. Glyph and word, never colour alone.
    const flagged = flags.length > 0; $('t-watch').classList.toggle('flagged', flagged); box.dataset.flag = '1';
    if (flagged) box.dataset.s = 'act'; else delete box.dataset.s;
    const bd = $('t-watch-b'); bd.dataset.s = flagged ? 'act' : 'watch'; bd.replaceChildren(icon(flagged ? 'act' : 'watch', 'ck-g'), flagged ? 'Act' : 'Watch');
    const c = $('c-pain'); const byD = Object.fromEntries(fs.map((r) => [r.date, r]));
    const days14 = d3.range(14).map((i) => isoN(TN - 13 + i));
    // script-held (CHARTS.md): the dashed line at 3/10, the 0 to 10 scale, 14 days
    CKC().bar(c, { key: 'pain', h: 96, rows: days14.map((d, i) => { const r = byD[d]; const p = r ? N(r.pain) : null; return { x: d, v: p === null ? null : Math.max(0.25, p), p, label: i === 13 ? 'Today' : null }; }),
      yMax: 10, nice: false, yTicks: [0, 5, 10], axisLabel: 'pain, 0 to 10', tone: 'fg-3', barMax: 16, padding: 0.25, xGap: 64,
      thresholds: [{ value: 3, label: '3/10', marks: { held: 'app.js renderWatch pain line' } }],
      title: 'Morning pain', window: 'the last 14 days', marks: { source: 'feel_series', where: 'date=' + last.date },
      sentence: `Morning pain, the last 14 days: ${N(last.pain)} of 10 on ${fDow(P(last.date))}; pain on ${withPain.length} of the last ${recent.length} check-ins, ${trend}.`,
      tip: (r) => ({ head: fWd(P(r.x)), lines: [{ text: r.p === null ? 'No check-in' : `Pain ${r.p}/10` }] }) });
  }

  // ---------- WEEK ----------
  const fmtMin = (m) => (N(m) >= 120 ? `${f1(N(m) / 60)} h` : `${N(m)} min`);
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';
  const isKey = (r) => r && r.kind === 'plan' && (truthy(r.key) || N(r.pillar) !== null);
  const keyLabel = (r) => (N(r.pillar) !== null ? `Key ${N(r.pillar)}` : 'Key');
  const itemKey = (r) => r.date + '|' + r.kind + '|' + r.order + '|' + (r.title || r.done_disc);
  function weekTitle(wk) { const k = Math.round((dayN(wk) - dayN(monday(TODAY))) / 7); return k === 0 ? 'This week' : k === -1 ? 'Last week' : k === 1 ? 'Next week' : `Week of ${fDay(P(wk))}`; }
  function weekRange(wk) { const a = P(wk), b = P(isoN(dayN(wk) + 6)); return a.getUTCMonth() === b.getUTCMonth() ? `${fDay(a)} – ${b.getUTCDate()}` : `${fDay(a)} – ${fDay(b)}`; }
  function statusOf(r) {
    const past = dayN(r.date) < TN, today = r.date === TODAY;
    const fl = String(r.flags || '');
    if (r.kind === 'extra') return { t: 'Unplanned', c: '' };
    const hardForEasy = r.intensity === 'easy' && (fl.includes('hr_high') || (r.rpe !== null && r.rpe !== undefined && Number(r.rpe) >= 5) || r.vs_plan === '+');
    if (['done', 'fallback', 'swapped'].includes(r.status) && hardForEasy) return { t: 'Above easy', c: 'warn' };
    if (r.status === 'done') return fl.includes('short') ? { t: 'Short', c: 'warn' } : { t: 'Done', c: 'done' };
    if (r.status === 'fallback') return { t: 'Fallback', c: 'done' };
    if (r.status === 'swapped') return { t: 'Swapped', c: '' };
    if (r.status === 'rest_broken') return { t: 'Trained', c: 'miss' };
    if (r.status === 'rest') return isKey(r) ? (past ? { t: 'Rested', c: 'done' } : today ? { t: 'Today', c: 'now' } : { t: 'Planned', c: '' }) : { t: 'Rest', c: past || today ? 'done' : '' };
    if (r.status === 'gate') return { t: today ? 'Today' : past ? 'Self-check' : 'Planned', c: today ? 'now' : '' };
    if (today) return { t: 'Today', c: 'now' };
    if (past && isKey(r)) return { t: 'Missed', c: 'miss' };
    if (past) return { t: r.type === 'strength' ? 'Not logged' : 'Not recorded', c: '' };
    return { t: 'Planned', c: '' };
  }
  // Week on the Cockpit system (Phase 5). Statuses keep the words statusOf gives; each class maps onto one of the four
  // badges: done -> good (Done, Fallback, Rested, Rest), warn -> watch (Above easy, Short, Not scheduled),
  // miss -> act (Missed, Trained; red before Phase 5 too), anything else -> unknown (Planned, Today, Unplanned, Swapped,
  // Not recorded, Not logged, Self-check, To schedule). Today keeps its emphasis as a tinted pill.
  const WK_ST = { done: 'good', warn: 'watch', miss: 'act' };
  function stBadge(st, where) {
    const b = badge(WK_ST[st.c] || 'unknown', st.t, st.c === 'now' ? 'ck-badge--pill' : null);
    return mark(b, 'week_view', null, where, 'status');
  }
  // the week_view row a figure comes from (an unplanned session is told apart by its activity ids)
  const wvWhere = (r) => `date=${r.date}&kind=${r.kind}&order=${r.order}` + (r.kind === 'extra' && r.done_ids ? '&done_ids=' + encodeURIComponent(r.done_ids) : '');
  // sport glyphs from the sprite, coloured by the sport tokens; hike and walk stay neutral (outline), as before
  const SGLYPH = { bike: 'bike', run: 'run', swim: 'swim', strength: 'strength', hike: 'trail', walk: 'steps', trail: 'trail', rest: 'rest', test: 'check', race: 'flag', other: 'session' };
  function sportIcon(tp) {
    const s = icon(SGLYPH[tp] || 'session', 'ck-i wk-sg');
    const sp = ['bike', 'run', 'swim', 'strength', 'other'].includes(tp) ? tp : tp === 'race' ? 'run' : null;
    if (sp) s.setAttribute('data-sport', sp); return s;
  }
  const tpOf = (r) => (r.kind === 'extra' ? r.done_disc : r.status === 'swapped' || r.status === 'fallback' ? (r.done_disc || r.type) : r.type);
  const minSpan = (r, f) => { const v = N(r[f]); return v >= 120 ? mark(el('span', null, `${f1(v / 60)} h`), 'week_view', null, wvWhere(r), 'hours') : mark(el('span', null, `${v} min`), 'week_view', f, wvWhere(r)); };
  // a re-render rebuilds the list, so the control that was pressed gets the focus back (keyboard users keep their place)
  const wkFocus = (sel, pick) => { const t = [...document.querySelectorAll(sel)].find(pick); if (t) t.focus({ preventScroll: true }); };
  const HR_RULE = 'calc.js week_view: easy-day heart-rate limit, run 150, bike 135';
  const KEY_RULE = 'coach/engine/KEY-SESSIONS.md: three key sessions a week';
  function itemRow(r) {
    const key = itemKey(r), w = wvWhere(r);
    const open = state.open.has(key);
    const b = el('button', 'ck-row wk-item'); b.type = 'button'; b.setAttribute('aria-expanded', String(open)); b.dataset.k = key;
    if (isKey(r)) b.dataset.key = '1';
    const t = el('span', 'ck-row-main');
    const t1 = el('span', 'ck-row-t');
    if (isKey(r)) { const k = el('span', 'ck-chip wk-key', '★ '); if (N(r.pillar) !== null) k.append('Key ', mark(el('span', null, String(N(r.pillar))), 'week_view', 'pillar', w)); else k.append('Key'); t1.append(k, ' '); }
    if (r.kind === 'extra') t1.append(mark(el('span', null, `${NAME[r.done_disc] || 'Session'} (not in the plan)`), 'week_view', null, w, 'formatted'));
    else t1.append(mark(el('span', null, r.title), 'week_view', 'title', w));
    t.append(t1);
    if (r.kind === 'plan' && r.minutes && !['rest'].includes(r.type)) {
      const t2 = el('span', 'ck-row-s'); t2.append('Plan ', minSpan(r, 'minutes'));
      const bits = [];
      if (r.upper_minutes) bits.push(['up to ', mark(el('span', null, String(r.upper_minutes)), 'week_view', 'upper_minutes', w)]);
      if (r.fallback_minutes) bits.push(['fallback ', mark(el('span', null, String(r.fallback_minutes)), 'week_view', 'fallback_minutes', w), r.alt_type ? ' ' + (NAME[r.alt_type] || r.alt_type).toLowerCase() : '']);
      if (bits.length) { t2.append(' ('); bits.forEach((x, i) => { if (i) t2.append(', '); t2.append(...x); }); t2.append(')'); }
      t.append(t2);
    }
    let liveR = false;
    if (r.rpe === null && r.done_ids) { const live = String(r.done_ids).split(';').map((id) => window.CX.live && window.CX.live.get(id)).find(Boolean); if (live) { r = { ...r, rpe: live.rpe, vs_plan: live.vs_plan || '', pain: live.pain }; liveR = true; } }
    // a rating saved on this phone and not yet in the data carries data-derived="live" (no dataset row holds it yet)
    const rpeSpan = () => (liveR ? mark(el('span', null, String(r.rpe)), null, null, null, 'live') : mark(el('span', null, String(r.rpe)), 'week_view', 'rpe', w));
    if (r.done_text) {
      const t3 = el('span', 'ck-row-d'); t3.append('Did: ', mark(el('span', null, r.done_text), 'week_view', 'done_text', w));
      if (r.rpe !== null && r.rpe !== undefined) t3.append(' · RPE ', rpeSpan(), r.vs_plan ? ' ' + r.vs_plan : '');
      if (r.pain) t3.append(' · pain ', liveR ? mark(el('span', null, String(r.pain)), null, null, null, 'live') : mark(el('span', null, String(r.pain)), 'week_view', 'pain', w));
      t.append(t3);
    }
    b.append(sportIcon(tpOf(r)), t, el('span', 'ck-row-end'));
    b.lastChild.append(stBadge(statusOf(r), w));
    if (open) {
      const d = el('span', 'ck-row-more');
      const line = (...parts) => { const s = el('span'); s.append(...parts); d.append(s); return s; };
      const flag = (...parts) => { const s = el('span', 'wk-flag'), t = el('span'); t.append(...parts); s.append(icon('watch', 'ck-i wk-fg'), t); d.append(s); }; // flex only on the outer span: the sentence stays one item
      if (r.detail) line(mark(el('span', null, r.detail), 'week_view', 'detail', w));
      const fl = String(r.flags || '');
      if (fl.includes('hr_high')) flag('Heart rate ran above the easy guardrail (', ruleSpan(r.done_disc === 'run' ? 'run ~150' : 'bike ~135', HR_RULE), ').');
      if (r.intensity === 'easy' && ((r.rpe !== null && r.rpe !== undefined && Number(r.rpe) >= 5) || r.vs_plan === '+')) flag('Rated RPE ', rpeSpan(), `${r.vs_plan === '+' ? ', harder than planned' : ''} on an easy day.`);
      if (fl.includes('over')) flag('Longer than the strong-day bound (', mark(el('span', null, String(r.upper_minutes)), 'week_view', 'upper_minutes', w), ' min).');
      if (fl.includes('short')) flag('Under the fallback (', mark(el('span', null, String(r.fallback_minutes)), 'week_view', 'fallback_minutes', w), ' min).');
      if (isKey(r)) { const s = line('Key session '); if (N(r.pillar) !== null) s.append(mark(el('span', null, String(N(r.pillar))), 'week_view', 'pillar', w), ' of ', ruleSpan('3', KEY_RULE)); if (r.why) s.append(': ', mark(el('span', null, r.why), 'week_view', 'why', w)); s.append(`. ${r.type === 'rest' ? 'Keep this day free of training; walking is fine.' : "If it can't happen today, move it to another day; never drop it."}`); }
      if (r.status === 'fallback') line('Done as the fallback, which counts as success.');
      if (r.status === 'swapped') line(`Done as a different discipline (${NAME[r.done_disc] || r.done_disc}).`);
      if (r.done_text && (r.rpe === null || r.rpe === undefined) && dayN(r.date) <= TN) line('No effort rating yet: rate it on Today.').className = 'ck-row-s';
      if (!d.childNodes.length) line('No details.').className = 'ck-row-s';
      b.append(d);
    }
    b.addEventListener('click', () => { if (state.open.has(key)) state.open.delete(key); else state.open.add(key); renderWeek(); wkFocus('#w-days .wk-item', (e) => e.dataset.k === key); });
    return b;
  }
  function tile(label, value, unit, sub, frac) {
    const t = el('div', 'tile'); t.append(el('span', 'l', label));
    const v = el('span', 'v', value); if (unit) v.append(el('small', null, unit)); t.append(v);
    if (frac !== undefined && frac !== null) { const m = el('div', 'meter'); m.append(el('i')); CKC().meter(m, { frac, sentence: `${label}: ${Math.round(Math.max(0, Math.min(1, frac)) * 100)}% of the plan`, marks: { derived: 'meter' } }); t.append(m); }
    if (sub) t.append(el('span', 'l', sub));
    return t;
  }
  // A Week totals tile (Cockpit ck-tile): label, figure with its unit, a zone-style meter and a subline. Every part is a
  // marked element the caller builds; the meter names the week it reads.
  function wkTile(label, fig, unit, sub, frac, wk) {
    const t = el('div', 'ck-tile wk-tile'); t.append(el('span', 'ck-tile-label', label));
    const v = el('span', 'ck-big'); v.append(fig); if (unit) { const u = el('span', 'ck-unit'); u.append(...[].concat(unit)); v.append(u); } t.append(v);
    if (frac !== undefined && frac !== null) { const m = el('span', 'ck-zone-track wk-meter'); m.append(el('i', 'ck-zone-fill')); CKC().meter(m, { frac, sentence: `${label}: ${Math.round(Math.max(0, Math.min(1, frac)) * 100)}% of the plan`, marks: { source: 'week_view', where: wk ? 'week=' + wk : null, derived: 'meter' } }); t.append(m); }
    if (sub) { const s = el('span', 'ck-sub'); s.append(...[].concat(sub)); t.append(s); }
    return t;
  }
  const dv = (txt, d, wk, src) => mark(el('span', null, txt), src || 'week_view', null, wk ? 'week=' + wk : null, d);
  // Key sessions (the athlete, Nov 3, 2026; rules coach/engine/KEY-SESSIONS.md): the three things that must happen each week for
  // progress or the right discipline, numbered 1 to 3; a rest day can be one. Every week from KEY_RULE_FROM shows three
  // slots: the week's key row, or the block's default (pillar_n_short) while the coach has not written that week yet.
  // Weeks before then show what was tagged at the time. Never borrows a session from another week.
  const KEY_RULE_FROM = '2026-11-02';
  const keyDone = (r) => ['done', 'fallback', 'swapped'].includes(r.status) || (r.status === 'rest' && dayN(r.date) < TN);
  // a week's key slots (one place, used by the Week card and Today's Doing the plan card): the week's key rows, and from
  // KEY_RULE_FROM an empty slot for each of the three keys the coach has not written yet
  function keySlots(wk, items) {
    const w0 = dayN(wk), w6 = w0 + 6;
    const blocks = kind('block').filter((b) => dayN(b.start) <= w6 && dayN(b.end) >= w0)
      .map((b) => ({ b, days: Math.min(w6, dayN(b.end)) - Math.max(w0, dayN(b.start)) + 1 })).sort((x, y) => y.days - x.days);
    const bl = blocks.length ? blocks[0].b : null;
    const bw = bl ? 'kind=block&key=' + bl.key : null;
    const pastWeek = w6 < TN, curWeek = w0 <= TN && TN <= w6;
    const inWeek = items.filter((r) => isKey(r));
    const ruled = dayN(wk) >= dayN(KEY_RULE_FROM);
    const slots = [];
    if (ruled) {
      for (const n of [1, 2, 3]) {
        const rows = inWeek.filter((r) => N(r.pillar) === n);
        if (rows.length) rows.forEach((r) => slots.push({ n, row: r, where: 'week' }));
        else slots.push({ n, row: null, where: 'none', short: bl ? (bl['pillar_' + n + '_short'] || String(bl['pillar_' + n] || '').split(':')[0]) : '', shortF: bl ? (bl['pillar_' + n + '_short'] ? 'pillar_' + n + '_short' : null) : null, text: bl ? bl['pillar_' + n] : '' });
      }
      inWeek.filter((r) => ![1, 2, 3].includes(N(r.pillar))).forEach((r) => slots.push({ n: null, row: r, where: 'week' }));
    } else {
      inWeek.sort((x, y) => (N(x.pillar) || 9) - (N(y.pillar) || 9)).forEach((r) => slots.push({ n: N(r.pillar), row: r, where: 'week' }));
    }
    return { slots, bl, bw, ruled, pastWeek, curWeek };
  }
  // a week's adherence, the Week card's counts: keys done (keyDone) of the week's key slots; sessions done (done, fallback,
  // swapped) of the planned sessions, rest days and tests left out
  function weekAdh(wk, wv) {
    const items = wv.filter((r) => r.week === wk), plan = items.filter((r) => r.kind === 'plan' && !['rest', 'test'].includes(r.type));
    const ks = keySlots(wk, items).slots;
    return { wk, items, ks, kN: ks.length, kDone: ks.filter((x) => x.row && keyDone(x.row)).length, sN: plan.length, sDone: plan.filter((r) => ['done', 'fallback', 'swapped'].includes(r.status)).length };
  }
  function renderKeys(wk, items, wv) {
    const sect = $('w-keys'), box = $('w-slots'), more = $('w-keys-more'); box.replaceChildren(); more.replaceChildren();
    const { slots, bl, bw, ruled, pastWeek, curWeek } = keySlots(wk, items);
    const cnt = $('w-keys-n'); cnt.replaceChildren();
    if (!slots.length && !bl) { cardState(sect, 'empty', 'No key sessions were tagged this week, and no block covers it.'); return slots; }
    cardState(sect, null);
    const inN = ruled ? 3 : slots.length;
    const doneN = slots.filter((x) => x.row && keyDone(x.row)).length;
    const wm = items.length ? wk : null;
    if (inN) cnt.append(dv(String(doneN), 'key-done', wm), ' of ', ruled ? ruleSpan('3', KEY_RULE) : dv(String(inN), 'key-n', wm), ' done this week');
    const bk = $('w-keys-blk'); bk.replaceChildren(); bk.hidden = !bl;
    if (bl) {
      const weeks = Math.max(1, Math.round((dayN(bl.end) - dayN(bl.start) + 1) / 7)), n = Math.min(weeks, Math.max(1, Math.floor((dayN(wk) - dayN(bl.start)) / 7) + 1));
      bk.append(mark(el('b', null, bl.label), 'coach', 'label', bw), ' · ', mark(el('span', null, bl.name), 'coach', 'name', bw), ' · week ', mark(el('span', null, String(n)), 'coach', null, bw, 'block-week'), ' of ', mark(el('span', null, String(weeks)), 'coach', null, bw, 'block-weeks'), ' · ', mark(el('span', null, `${fDay(P(bl.start))} – ${fDay(P(bl.end))}`), 'coach', null, bw, 'formatted'));
      if (bl.objectives) { bk.append(el('br')); bk.append(mark(el('span', null, bl.objectives), 'coach', 'objectives', bw)); }
    }
    if (!ruled) { const p = el('p', 'ck-note', 'Before '); p.append(ruleSpan('Nov 2', 'app.js KEY_RULE_FROM: 2026-11-02'), ' the plan tagged key sessions differently; shown as recorded.'); more.append(p); }
    if (!slots.length) box.append(el('p', 'ck-note', 'No key sessions were tagged this week.'));
    // Phase 6 (the athlete, Nov 5, 2026): one compact row per key session (status glyph, name, day) in one small card; what each
    // session is for moves behind one disclosure with the block's fuel and volume. The day list keeps its Key chips.
    const why = [];
    for (const x of slots) {
      const w = x.row ? wvWhere(x.row) : null;
      const restT = x.row && x.row.type === 'rest' && !/rest/i.test(x.row.title || '');
      const title = x.row ? (restT ? `Rest: ${x.row.title}` : x.row.title) : x.short || 'To be set';
      const when = x.row ? [fWd(P(x.row.date)), x.row.why].filter(Boolean).join(' · ') : (bl ? 'Block default · not in the plan yet' : 'Not in the plan yet');
      const st = x.row ? statusOf(x.row) : { t: pastWeek || curWeek ? 'Not scheduled' : 'To schedule', c: pastWeek || curWeek ? 'warn' : '' };
      const s = WK_ST[st.c] || 'unknown';
      const b = el(x.row ? 'button' : 'div', 'ck-row wk-krow'); if (x.row) b.type = 'button';
      const g = el('span', 'ck-badge wk-kg'); g.dataset.s = s; g.append(icon(s, 'ck-g'), el('span', 'ck-vh', st.t));
      const kn = el('span', 'wk-kn'); if (x.n === null) kn.append('★ Key'); else kn.append('Key ', x.row ? mark(el('span', null, String(x.n)), 'week_view', 'pillar', w) : ruleSpan(String(x.n), KEY_RULE));
      const t1 = el('span', 'ck-row-t'); t1.append(kn, ' ');
      if (x.row) t1.append(mark(el('span', null, title), 'week_view', restT ? null : 'title', w, restT ? 'formatted' : null));
      else t1.append(x.short ? mark(el('span', null, title), 'coach', x.shortF, bw, x.shortF ? null : 'formatted') : title);
      const d = el('span', 'ck-row-d wk-kday');
      if (x.row) d.append(mark(el('span', null, fDow(P(x.row.date))), 'week_view', null, w, 'formatted')); else d.append(st.t);
      b.append(x.row ? mark(g, 'week_view', null, w, 'status') : mark(g, 'coach', null, bw, 'status'), t1, d);
      b.setAttribute('aria-label', `Key session ${x.n === null ? '' : x.n}: ${title}, ${when}, ${st.t}`);
      if (x.row) b.addEventListener('click', () => {
        const k = itemKey(x.row); state.open.add(k);
        if (x.row.week !== state.week) state.week = x.row.week;
        renderWeek();
        const target = [...document.querySelectorAll('#w-days .wk-item')].find((e) => e.dataset.k === k);
        if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
      });
      box.append(b);
      // the bold lead carries the same marks as the row (key number and title from week_view, or the block default)
      const lb = el('b'); if (x.n === null) lb.append('Key'); else lb.append('Key ', x.row ? mark(el('span', null, String(x.n)), 'week_view', 'pillar', w) : ruleSpan(String(x.n), KEY_RULE));
      lb.append(' · ');
      if (x.row) lb.append(mark(el('span', null, title), 'week_view', restT ? null : 'title', w, restT ? 'formatted' : null));
      else lb.append(x.short ? mark(el('span', null, title), 'coach', x.shortF, bw, x.shortF ? null : 'formatted') : title);
      lb.append(': ');
      const q = el('p'); q.append(lb);
      if (x.row && x.row.why) q.append(mark(el('span', null, x.row.why), 'week_view', 'why', w));
      else if (!x.row && x.text) q.append(mark(el('span', null, x.text), 'coach', 'pillar_' + x.n, bw));
      else q.append(when);
      why.push(q);
    }
    if (why.length || (bl && (bl.energy || bl.volume))) {
      const fv = bl && (bl.energy || bl.volume);
      const btn = el('button', 'ck-disc'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'w-fuel'); btn.dataset.ck = 'disc';
      btn.append(why.length ? (fv ? 'What each is for, fuel and volume' : 'What each is for') : 'Fuel and volume for this block', icon('chevron', 'ck-chev'));
      const p = el('div', 'ck-disc-panel'); p.id = 'w-fuel'; p.hidden = true; p.append(...why);
      if (bl && bl.energy) { const q = el('p'); q.append(el('b', null, 'Fuel: '), mark(el('span', null, bl.energy), 'coach', 'energy', bw)); p.append(q); }
      if (bl && bl.volume) { const q = el('p'); q.append(el('b', null, 'Volume: '), mark(el('span', null, bl.volume), 'coach', 'volume', bw)); p.append(q); }
      if (fv) p.append(el('p', 'ck-note', 'Key sessions anchor the block: move one to another day if needed, never drop it.'));
      more.append(btn, p); if (window.CK && window.CK.disclosure) window.CK.disclosure(btn);
    }
    return slots;
  }

  // the Week tab's stale banner: the done side comes from the Garmin pull; when the newest pull is older than today and the
  // shown week runs past it, the banner says how old it is (the cards below keep full contrast)
  // the Week tab's stale banner: the done side comes from the Garmin pull. Lateness follows coach/ops/data_paths.json
  // (path garmin, max_age_hours 26): the banner shows only when the newest pull is more than 26 h old and the shown week
  // runs past the pull day, so the normal gap before the morning pull never shows it. The 26 is typed here, marked data-rule.
  const GARMIN_MAX_H = 26;
  function renderWeekStale(wk) {
    const b = kind('build')[0], box = $('w-stale');
    const pull = b && b.garmin_pull_utc ? new Date(b.garmin_pull_utc) : null;
    const ageH = pull && !isNaN(pull) ? (now - pull) / 3600000 : null;
    const pd = ageH !== null ? `${pull.getFullYear()}-${pad2(pull.getMonth() + 1)}-${pad2(pull.getDate())}` : null;
    const on = ageH !== null && ageH > GARMIN_MAX_H && dayN(wk) + 6 > dayN(pd);
    box.hidden = !on; if (!on) return;
    const age = TN - dayN(pd), t = $('w-stale-t'); t.replaceChildren();
    t.append(` Done counts run to the Garmin pull of ${stamp(b.garmin_pull_utc)}, ${age <= 1 ? 'over a day' : age + ' days'} ago, later than the `, ruleSpan(String(GARMIN_MAX_H), 'coach/ops/data_paths.json garmin max_age_hours: 26'), ' h the pull should take. Later sessions arrive with the next pull.');
  }

  function renderWeek() {
    const wk = state.week;
    set('w-title', weekTitle(wk)); set('w-range', weekRange(wk));
    $('w-prev').disabled = false; $('w-next').disabled = dayN(wk) >= dayN(monday(TODAY)) + 14;
    for (const inp of document.querySelectorAll('#w-mode input')) inp.checked = inp.value === state.mode;
    const meta = kind('week').find((w) => w.week_start === wk);
    const ww = 'kind=week&week_start=' + wk;
    const wf = $('w-focus'); wf.replaceChildren(); wf.hidden = !meta; if (meta) wf.append(mark(el('b', null, meta.label), 'coach', 'label', ww), '. ', mark(el('span', null, meta.focus), 'coach', 'focus', ww));
    renderWeekStale(wk);
    if (window.CX.renderRaceWeek) window.CX.renderRaceWeek(wk); // season.js
    drawLoad();
    const wst = dsState('week_view');
    if (wst) { const msg = wst === 'error' ? 'The week plan did not arrive. Nothing saved is lost.' : ''; for (const id of ['w-keys', 'w-list', 'w-totals']) cardState($(id), wst, msg); return; }
    const wv = rowsOk('week_view');
    const tiles = $('w-tiles'), days = $('w-days');
    const items = wv.filter((r) => r.week === wk);
    const plan = items.filter((r) => r.kind === 'plan' && !['rest', 'test'].includes(r.type));
    const doneRows = items.filter((r) => ['done', 'fallback', 'swapped', 'extra'].includes(r.status));
    const planMin = plan.reduce((s, r) => s + (N(r.minutes) || 0), 0);
    const doneMin = doneRows.reduce((s, r) => s + (N(r.done_minutes) || 0), 0);
    const adh = weekAdh(wk, wv), doneN = adh.sDone; // the counts Today's Doing the plan card reads too
    renderKeys(wk, items, wv);
    const kIn = adh.ks, kDone = adh.kDone;
    const wl = (rowsOk('weekly') || []).find((w) => w.week === wk);
    const lw = 'week=' + wk;
    const wm = items.length ? wk : null; // derived figures name the week's rows; a week with none names only the dataset
    const strPlan = plan.filter((r) => r.type === 'strength').length, strDone = items.filter((r) => (r.done_disc === 'strength') && ['done', 'fallback', 'swapped', 'extra'].includes(r.status)).length;
    // script-held (CHARTS.md 10): the strength denominator is at least 2 a week, max(2, planned strength sessions)
    const strOf = ruleSpan(String(Math.max(2, strPlan)), 'app.js renderWeek: strength denominator max(2, planned strength sessions)');
    cardState($('w-totals'), null);
    tiles.replaceChildren(
      wkTile('Hours done', dv(f1(doneMin / 60), 'done-hours', wm), planMin ? ['of ', dv(f1(planMin / 60), 'plan-hours', wm), ' h'] : 'h', planMin ? '' : 'No plan for this week', planMin ? doneMin / planMin : null, wm),
      kIn.length ? wkTile('Key sessions', dv(String(kDone), 'key-done', wm), ['of ', dv(String(kIn.length), 'key-n', wm)], [dv(String(doneN), 'sessions-done', wm), ' of ', dv(String(plan.length), 'sessions-planned', wm), ' sessions overall'], kDone / kIn.length, wm)
        : wkTile('Sessions done', dv(String(doneN), 'sessions-done', wm), plan.length ? ['of ', dv(String(plan.length), 'sessions-planned', wm)] : '', doneRows.length > doneN ? ['+', dv(String(doneRows.length - doneN), 'sessions-unplanned', wm), ' not in the plan'] : '', plan.length ? doneN / plan.length : null, wm),
      wkTile('Effort load', wl && wl.rated ? mark(el('span', null, String(wl.load)), 'weekly', 'load', lw) : mark(el('span', null, '—'), 'weekly', null, null, 'none'), 'RPE×min', wl && wl.rated ? [mark(el('span', null, String(wl.rated)), 'weekly', 'rated', lw), ` rated session${wl.rated > 1 ? 's' : ''}`] : 'Rate sessions on Today', null, wm),
      wkTile('Strength', dv(String(strDone), 'strength-done', wm), ['of ', strOf], 'logged this week', strDone / Math.max(2, strPlan), wm),
    );
    days.replaceChildren();
    const list = $('w-list');
    if (!items.length) { cardState(list, 'empty', dayN(wk) + 6 < TN ? 'Nothing was planned or recorded this week.' : ['No plan for this week yet. The coach writes it at the ', RUN_AT(), ' check-in.']); return; }
    cardState(list, null);
    for (let i = 0; i < 7; i++) {
      const d = isoN(dayN(wk) + i);
      const its = items.filter((r) => r.date === d).sort((a, b) => a.order - b.order);
      // Past days fold to one line (sport, status) and open on tap; today and later stay open (comment, Oct 23)
      const past = dayN(d) < TN; const openDay = !past || state.openDays.has(d);
      const de = el('div', 'wk-day' + (d === TODAY ? ' is-today' : '') + (past ? ' is-past' : '') + (openDay ? '' : ' is-folded'));
      const h = el(past ? 'button' : 'div', 'wk-dayh'); if (past) { h.type = 'button'; h.setAttribute('aria-expanded', String(openDay)); h.dataset.d = d; h.addEventListener('click', () => { if (state.openDays.has(d)) state.openDays.delete(d); else state.openDays.add(d); renderWeek(); wkFocus('#w-days .wk-dayh', (e) => e.dataset.d === d); }); }
      const dn = el('span', 'wk-dayn'); dn.append(el('b', null, fDow(P(d))), ' ', mark(el('span', null, fDay(P(d))), null, null, null, 'date')); h.append(dn);
      if (d === TODAY) h.setAttribute('aria-current', 'date'); // the session badges say Today; no second Today chip on the header
      if (past && !openDay) {
        const sum = el('span', 'wk-daysum');
        if (!its.length) sum.append(el('span', 'ck-sub', 'nothing planned'));
        for (const r of its) { const c = el('span', 'wk-dchip'); c.append(sportIcon(tpOf(r)), stBadge(statusOf(r), wvWhere(r))); sum.append(c); }
        h.append(sum);
      }
      if (past) h.append(icon('chevron', 'ck-chev wk-chev'));
      de.append(h);
      if (openDay) {
        if (!its.length) de.append(el('p', 'ck-sub wk-none', dayN(d) > TN ? 'No plan yet' : 'Nothing planned or recorded'));
        if (its.length) { const ul = el('div', 'ck-list'); for (const r of its) ul.append(itemRow(r)); de.append(ul); }
      }
      days.append(de);
    }
  }
  $('w-prev').addEventListener('click', () => { state.week = isoN(dayN(state.week) - 7); renderWeek(); });
  $('w-next').addEventListener('click', () => { state.week = isoN(dayN(state.week) + 7); renderWeek(); });
  // Hours / Effort load: native radios in a Cockpit segmented control (arrow keys move between them); one state key, state.mode
  for (const inp of document.querySelectorAll('#w-mode input')) inp.addEventListener('change', () => { if (inp.checked) { state.mode = inp.value; drawLoad(); } });

  function drawLoad() {
    const card = $('w-load'), box = $('c-load'); const wk = rowsOk('weekly'); const st = dsState('weekly');
    if (st) { if (st === 'error' && window.CKC) window.CKC.clear(box); cardState(card, st, 'The weekly totals did not arrive. Nothing saved is lost.'); return; }
    cardState(card, null);
    if (!wk) return;
    const cur = monday(TODAY), last = isoN(Math.max(dayN(cur), dayN(state.week)) + 0);
    const weeks = d3.range(11, -1, -1).map((i) => isoN(dayN(last) - 7 * i));
    const by = Object.fromEntries(wk.map((w) => [w.week, w]));
    const plannedBy = {}; for (const r of rowsOk('week_view') || []) if (r.kind === 'plan' && !['rest', 'test'].includes(r.type)) plannedBy[r.week] = (plannedBy[r.week] || 0) + (N(r.minutes) || 0) / 60;
    const keys = ['bike', 'run', 'swim', 'strength', 'hike', 'other'];
    const hours = state.mode === 'hours';
    const table = weeks.map((w) => { const o = { week: w }; for (const k of keys) o[k] = by[w] ? N(by[w][k]) || 0 : 0; o.load = by[w] ? N(by[w].load) || 0 : 0; o.rated = by[w] ? by[w].rated : 0; o.total = keys.reduce((s, k) => s + o[k], 0); o.plan = plannedBy[w] || null; return o; });
    const present = keys.filter((k) => table.some((t) => t[k] > 0));
    const curIn = hours && weeks.includes(cur) && TN - dayN(cur) + 1 < 7 ? { x: cur, days: TN - dayN(cur) + 1, of: 7 } : null;
    { const lg = $('c-load-legend'); lg.replaceChildren(); lg.hidden = true; } // direct labels replace the legend
    // script-held (CHARTS.md): the 5 to 7 h budget band and the 7.5 h / 100 load floors
    CKC().bar(box, {
      key: 'week-load', h: 190, rows: table.map((t) => ({ x: t.week, parts: hours ? Object.fromEntries(present.map((k) => [k, t[k]])) : null, v: t.load, ref: hours ? t.plan : null, t })),
      stack: hours ? present.map((k) => ({ key: k, label: NAME[k], tone: SPORT_TONE[k], outline: k === 'hike' })) : null, tone: 'series-2',
      floor: hours ? 7.5 : 100, unit: hours ? 'h' : 'RPE x min', vfmt: hours ? f1 : f0, fmt: (v) => String(v), partial: curIn,
      bands: hours ? [{ lo: 5, hi: 7, label: '5 to 7 h budget', marks: { held: 'app.js drawLoad weekly budget' } }] : [],
      refLabel: hours ? 'Planned' : null, selected: state.week, valueLabel: hours ? (v) => `${f1(v)} h` : null,
      title: hours ? 'Training hours by week' : 'Effort load by week', window: `the 12 weeks to ${fDay(P(last))}`, period: 'week',
      marks: { source: 'weekly', key: 'week' },
      onPick: (r) => { state.week = r.x; renderWeek(); },
      tip: (r) => { const t = r.t; return { head: `Week of ${fDay(P(t.week))}`, lines: hours ? [{ text: `${f1(t.total)} h done${t.plan ? ` · ${f1(t.plan)} h planned` : ''}` }, ...present.filter((k) => t[k] > 0).map((k) => ({ tone: SPORT_TONE[k], text: `${NAME[k]}: ${f1(t[k])} h` }))] : [{ text: t.rated ? `${t.load} effort load · ${t.rated} rated` : 'No rated sessions' }] }; },
    });
  }

  // ---------- GOALS (the Health tab, page id goals; Cockpit since Phase 5). pillars.js draws the cards. ----------
  function renderGoals() {
    syncSpan(); renderHealthStale();
    if (window.CX.renderPillars) window.CX.renderPillars();
  }
  // Out of date (shared stale state): the pillar figures come from the morning coach build, which reads the Garmin pull.
  // Lateness follows coach/ops/data_paths.json (path garmin, max_age_hours 26), the Week tab's rule; one banner serves the tab.
  function renderHealthStale() {
    const b = kind('build')[0], box = $('g-stale'); if (!box) return;
    const pull = b && b.garmin_pull_utc ? new Date(b.garmin_pull_utc) : null;
    const ageH = pull && !isNaN(pull) ? (now - pull) / 3600000 : null;
    const on = ageH !== null && ageH > GARMIN_MAX_H; box.hidden = !on; if (!on) return;
    const pd = `${pull.getFullYear()}-${pad2(pull.getMonth() + 1)}-${pad2(pull.getDate())}`, age = TN - dayN(pd), t = $('g-stale-t'); t.replaceChildren();
    t.append(` Health figures run to the Garmin pull of ${stamp(b.garmin_pull_utc)}, ${age <= 1 ? 'over a day' : age + ' days'} ago, later than the `, ruleSpan(String(GARMIN_MAX_H), 'coach/ops/data_paths.json garmin max_age_hours: 26'), ' h the pull should take. Later nights and sessions arrive with the next pull.');
  }
  function drawWeight() {
    const box = $('c-weight'); const wt = rowsOk('weight_trend'); const c = rowsOk('coach');
    if (ds('weight_trend').status === 'error' || ds('coach').status === 'error') return fail(box);
    if (!wt || !c) return;
    const plan = kind('weight').sort((a, b) => (a.date < b.date ? -1 : 1));
    const target = kind('target').find((t) => t.key === 'weight');
    const wIn = inSpan(wt); const start = wIn.length ? wIn[0] : null; const from = spanStart(wt);
    const endD = plan.length ? plan.filter((p) => dayN(p.date) <= dayN('2027-02-14')).pop().date : TODAY;
    const rows = [...wIn.map((r) => ({ ...r })), ...plan.filter((p) => dayN(p.date) <= dayN(endD)).map((p) => ({ date: p.date, p_lo: p.lo, p_mid: p.mid, p_hi: p.hi }))].sort((a, b) => (a.date < b.date ? -1 : 1));
    const strips = kind('fuel').filter((f) => f.mode !== 'maintenance').map((f) => ({ start: f.start, end: f.end, color: 'var(--color-fg-muted)', opacity: f.mode === 'recovery_deficit' ? 0.75 : 0.35, label: f.mode === 'recovery_deficit' ? 'recovery deficit' : 'deficit' }));
    const wv = [...rows.flatMap((r) => [N(r.weight_lb), N(r.p_lo), N(r.p_hi)]), target ? N(target.lo) : null].filter((v) => v !== null);
    const yLo = Math.floor(d3.min(wv)) - 1, yHi = Math.ceil(d3.max(wv)) + 1;
    const last = wt[wt.length - 1]; const sc = (rowsOk('scorecard') || []).find((r) => r.goal === 'weight');
    // the scorecard status is a Cockpit badge (on plan = Good, off the band = Watch, no plan path = Unknown), glyph and word
    const scw = sc ? mark(badge({ on: 'good', watch: 'watch' }[sc.status] || 'unknown', sc.status_text, 'hp-wbadge'), 'scorecard', null, 'goal=weight', 'status') : null;
    const gw = $('g-weight-now'); gw.replaceChildren();
    if (last) { gw.append('Now ', mark(el('span', 'ck-fig', f1(last.avg7)), 'weight_trend', 'avg7', 'date=' + last.date), ' lb (', ruleSpan('7-day', 'calc.js weight_trend: 7-day average'), ')'); if (sc && sc.note) gw.append(' · ', mark(el('span', null, sc.note), 'scorecard', 'note', 'goal=weight')); if (scw) gw.append(' ', scw); }
    lineChart(box, rows, {
      key: 'weight', h: 230, digits: 0, unit: 'lb', xDomain: [from, endD], yDomain: [yLo, yHi], yTicks: d3.ticks(yLo, yHi, 4),
      title: 'Weight, 7-day average', window: spanName(), marks: { source: 'weight_trend', field: 'avg7', key: 'date' },
      bands: [{ lo: 'p_lo', hi: 'p_hi', tone: 'series-2', opacity: 0.14, personal: false }],
      boxes: target ? [{ start: target.start, end: target.end, lo: N(target.lo), hi: N(target.hi), label: `${f0(N(target.lo))} to ${f0(N(target.hi))} lb target`, marks: { source: 'coach', where: 'kind=target&key=weight', field: 'hi' } }] : [],
      strips: strips.map((s) => ({ ...s, tone: 'fg-3' })),
      series: [
        { key: 'avg7', label: '7-day average', tone: 'series-1', connect: true, endFmt: f1 },
        { key: 'weight_lb', label: 'Weigh-in', tone: 'fg-3', dots: true, line: false, end: false },
        { key: 'p_mid', label: 'Plan', short: 'Plan', tone: 'series-2', dashed: true, connect: true },
      ],
      tipLines: (r) => [r.avg7 !== undefined ? { tone: 'series-1', text: `7-day average: ${f1(r.avg7)} lb` } : null, r.weight_lb !== undefined ? { text: `Weigh-in: ${f1(r.weight_lb)} lb` } : null, r.p_mid !== undefined ? { tone: 'series-2', text: `Plan: ${f1(r.p_mid)} (${f1(r.p_lo)}–${f1(r.p_hi)})` } : null].filter(Boolean),
    });
    { const lg = $('c-weight-legend'); if (lg) { lg.replaceChildren(); lg.hidden = true; } } // direct labels replace the legend
  }
  // ---------- TRENDS (the Fitness tab, page id trends; Cockpit since Phase 5) ----------
  const mss = (v) => { if (v === null || v === undefined || isNaN(v)) return '—'; let m = Math.floor(v), s = Math.round((v - m) * 60); if (s === 60) { m += 1; s = 0; } return `${m}:${pad2(s)}`; };
  const hm = (min) => { min = Math.round(min); if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; };
  const fInt = window.CX.fmt(',.0f');
  const avgOf = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  // the segmented controls on this tab are native radios (Cockpit ck-seg): sync the checked one to the state key
  function segRadio(id, value) { for (const i of document.querySelectorAll(`#${id} input`)) i.checked = i.value === String(value); }
  // a re-render rebuilds a control, so the one that was used gets the focus back
  const ftFocus = (sel) => { const t = document.querySelector(sel); if (t) t.focus({ preventScroll: true }); };

  function renderTrends() {
    syncSpan(); renderFitStale();
    if (window.CX.renderBlock) window.CX.renderBlock();
    renderFitness(); drawVolume(); renderZones(); markerLead('f-lead', 'fitness');
  }
  // Out of date (shared stale state): the figures on this tab run to the last Garmin pull; one banner serves the tab.
  // Lateness follows coach/ops/data_paths.json (path garmin, max_age_hours 26), the Week and Health rule.
  function renderFitStale() {
    const b = kind('build')[0], box = $('f-stale'); if (!box) return;
    const pull = b && b.garmin_pull_utc ? new Date(b.garmin_pull_utc) : null;
    const ageH = pull && !isNaN(pull) ? (now - pull) / 3600000 : null;
    const on = ageH !== null && ageH > GARMIN_MAX_H; box.hidden = !on; if (!on) return;
    const pd = `${pull.getFullYear()}-${pad2(pull.getMonth() + 1)}-${pad2(pull.getDate())}`, age = TN - dayN(pd), t = $('f-stale-t'); t.replaceChildren();
    t.append(` Fitness figures run to the Garmin pull of ${stamp(b.garmin_pull_utc)}, ${age <= 1 ? 'over a day' : age + ' days'} ago, later than the `, ruleSpan(String(GARMIN_MAX_H), 'coach/ops/data_paths.json garmin max_age_hours: 26'), ' h the pull should take. Later sessions arrive with the next pull.');
  }
  // One-line read of a marker section from the tile statuses (every name and value is marked from its marker row)
  function markerLead(id, section) {
    const ms = kind('marker').filter((m) => m.section === section);
    const e = $(id); e.replaceChildren(); e.hidden = !ms.length;
    if (!ms.length) return;
    const mw = (m) => 'kind=marker&key=' + m.key;
    const name = (m) => mark(el('span', null, m.label.toLowerCase().replace(/ \(.*\)/, '')), 'coach', null, mw(m), 'label');
    const list = (arr, withVal) => arr.flatMap((m, i) => {
      const out = i ? [', ', name(m)] : [name(m)];
      if (withVal && m.value && m.value !== '—') out.push(' (', mark(el('span', null, m.value), 'coach', 'value', mw(m)), m.unit && m.unit.length <= 4 ? (/^[%/]/.test(m.unit) ? '' : ' ') + m.unit : '', ')');
      return out;
    });
    const w = ms.filter((m) => m.status === 'watch'), g = ms.filter((m) => m.status === 'good');
    if (g.length) e.append(el('b', null, 'On track: '), ...list(g, false), '. ');
    if (w.length) e.append(el('b', null, 'Watch: '), ...list(w, true), '.'); else if (g.length) e.append('Nothing to watch.');
    if (!e.childNodes.length) e.hidden = true;
  }

  // Volume: weekly bars by sport, Time / Distance / Climb
  // a Volume stat: a small Cockpit tile with a label, a marked figure and unit, and a subline
  function volStat(label, fig, unit, sub) {
    const t = el('div', 'ck-tile ft-stat'); t.append(el('span', 'ck-tile-label', label));
    const v = el('span', 'ck-big'); v.append(fig); if (unit) v.append(el('span', 'ck-unit', unit)); t.append(v);
    const s = el('span', 'ck-sub'); s.append(...[].concat(sub)); t.append(s); return t;
  }
  function drawVolume() {
    const box = $('c-vol'), card = $('v-card');
    segRadio('v-sport', state.vSport); segRadio('v-measure', state.vMeasure);
    const st = dsState('volume');
    if (st) { if (window.CKC) CKC().clear(box); cardState(card, st, st === 'error' ? 'The volume by week did not arrive. Nothing saved is lost.' : ''); return; }
    const vr = rowsOk('volume');
    if (!vr.length) { CKC().clear(box); cardState(card, 'empty', 'No sessions from Garmin yet. Weeks fill in as activities sync.'); return; }
    cardState(card, null);
    const sp = state.vSport, m = state.vMeasure;
    const cur = monday(TODAY);
    const firstW = vr.reduce((a, r) => (r.week < a ? r.week : a), cur);
    const startN = Math.max(dayN(firstW), spanFrom() ? dayN(monday(spanFrom())) : dayN(firstW));
    const weeks = []; for (let n = startN; n <= dayN(cur); n += 7) weeks.push(isoN(n));
    const field = { time: 'hours', dist: 'dist', climb: 'climb_ft' }[m];
    const all = m === 'climb' ? ['run', 'hike', 'bike'] : ['bike', 'run', 'swim', 'strength', 'hike', 'other'];
    const sports = sp === 'all' ? all : [sp];
    const by = {}; for (const r of vr) by[r.week + '|' + r.sport] = r;
    const table = weeks.map((w) => { const o = { week: w, sessions: 0 }; for (const k of sports) { const r = by[w + '|' + k]; o[k] = r ? N(r[field]) || 0 : 0; o.sessions += r && (m === 'time' || o[k] > 0) ? r.sessions : 0; } o.total = sports.reduce((s, k) => s + o[k], 0); return o; });
    const present = sports.filter((k) => table.some((t) => t[k] > 0));
    const unit = m === 'time' ? 'h' : m === 'climb' ? 'ft' : sp === 'swim' ? 'yd' : 'mi';
    const fv = m === 'time' ? f1 : m === 'climb' || sp === 'swim' ? fInt : f1;
    const full = table.filter((t) => t.week !== cur);
    const avg = avgOf(full.map((t) => t.total));
    const thisW = table.find((t) => t.week === cur) || { total: 0, sessions: 0 };
    const rowsIn = vr.filter((r) => sports.includes(r.sport) && dayN(r.week) >= startN);
    const lk = m === 'time' ? ['longest_min', 'longest_min_date'] : m === 'dist' ? ['longest_dist', 'longest_dist_date'] : ['top_climb_ft', 'top_climb_date'];
    const best = rowsIn.reduce((a, r) => (N(r[lk[0]]) > (a ? N(a[lk[0]]) : 0) ? r : a), null);
    const spw = sp === 'all' ? '' : '&sport=' + sp; // derived figures name the week (and sport) rows they add up
    const vd = (txt, d, where) => mark(el('span', null, txt), 'volume', null, where, d);
    const bw = best ? `week=${best.week}&sport=${best.sport}` : null;
    const bestFig = !best ? vd('—', 'none', null) : m === 'time' ? vd(mss(N(best.longest_min) / 60), 'formatted', bw) : mark(el('span', null, fv(N(best[lk[0]]))), 'volume', lk[0], bw);
    $('v-stats').replaceChildren(
      volStat('This week', vd(fv(thisW.total), 'week-total', 'week=' + cur + spw), unit, [vd(String(thisW.sessions), 'sessions', 'week=' + cur + spw), ` session${thisW.sessions === 1 ? '' : 's'}`]),
      volStat('Weekly average', vd(avg === null ? '—' : fv(avg), 'mean of full weeks', sp === 'all' ? null : 'sport=' + sp), unit, [vd(String(full.length), 'full-weeks', null), ` full week${full.length === 1 ? '' : 's'}`]),
      volStat(m === 'climb' ? 'Biggest climb' : 'Longest', bestFig, best ? (m === 'time' ? 'h' : unit) : '', best ? [sp === 'all' ? NAME[best.sport] + ' · ' : '', vd(fDay(P(best[lk[1]])), 'date', bw)] : 'No sessions'),
    );
    // script-held (CHARTS.md): the y floors 1 h, 500 ft, 1000 yd, 5 mi
    const tf = m === 'time' || (m === 'dist' && sp !== 'swim') ? d3.format('~g') : fInt;
    const fWk = weeks.length > 40 ? d3.utcFormat("%b '%y") : fDay;
    const part = TN - dayN(cur) + 1 < 7 ? { x: cur, days: TN - dayN(cur) + 1, of: 7 } : null;
    { const lgv = $('c-vol-legend'); lgv.replaceChildren(); lgv.hidden = true; } // direct labels replace the legend
    CKC().bar(box, {
      key: 'volume', h: 200, rows: table.map((t) => ({ x: t.week, parts: Object.fromEntries(present.map((k) => [k, t[k]])), t })),
      stack: present.map((k) => ({ key: k, label: NAME[k], tone: SPORT_TONE[k], outline: k === 'hike' })), directLabels: sp === 'all',
      floor: Math.max(m === 'time' ? 1 : m === 'climb' ? 500 : sp === 'swim' ? 1000 : 5, avg || 0), unit, fmt: tf, vfmt: fv, xfmt: (w) => fWk(P(w)), partial: part, avg,
      thresholds: avg ? [{ value: avg, label: `average ${fv(avg)}`, at: 'start', tone: 'fg', marks: { derived: 'mean of full weeks' } }] : [],
      title: ({ time: 'Training time', dist: 'Distance', climb: 'Climb' })[m] + ' by week' + (sp === 'all' ? '' : ', ' + NAME[sp].toLowerCase()), window: spanName(), period: 'week',
      marks: { source: 'volume', where: sp === 'all' ? '' : 'sport=' + sp },
      tip: (r) => { const t = r.t; return { head: `Week of ${fDay(P(t.week))}`, lines: [{ text: `${fv(t.total)} ${unit}${t.week === cur ? ' so far' : ''}` }, ...(sp === 'all' ? present.filter((k) => t[k] > 0).map((k) => ({ tone: SPORT_TONE[k], text: `${NAME[k]}: ${fv(t[k])} ${unit}` })) : [])] }; },
    });
    $('c-vol-note').replaceChildren(m === 'dist' ? 'Distance is per sport' + (sp === 'swim' ? ' (swims in yards).' : '.') : m === 'climb' ? 'Climb: elevation gain from Garmin (Zwift counts its virtual climbing).' : 'Mon–Sun weeks; hikes and walks combined; sauna not counted.',
      ' This week is lighter until it ends. Garmin history starts ', vd(fDay(P(firstW)), 'first-week', 'week=' + firstW), '.');
  }
  // Measure and sport: native radios in Cockpit segmented controls (arrow keys move); the same pairing rules as before
  for (const inp of document.querySelectorAll('#v-sport input')) inp.addEventListener('change', () => { if (!inp.checked) return; state.vSport = inp.value; if (state.vSport === 'all' && state.vMeasure === 'dist') state.vMeasure = 'time'; drawVolume(); ftFocus('#v-sport input:checked'); });
  for (const inp of document.querySelectorAll('#v-measure input')) inp.addEventListener('change', () => { if (!inp.checked) return; state.vMeasure = inp.value; if (state.vMeasure === 'dist' && state.vSport === 'all') state.vSport = 'run'; if (state.vMeasure === 'climb' && state.vSport === 'swim') state.vSport = 'all'; drawVolume(); ftFocus('#v-measure input:checked'); });

  // Heart-rate zones: the Phase 4 share bar, then one Cockpit zone row per zone on the fixed 0 to 100 percent track
  const ZONE_RULE = 'calc.js hrz rows: Garmin 2-minute heart-rate samples during each session';
  function renderZones() {
    segRadio('z-sport', state.zSport);
    const box = $('z-bars'), card = $('z-card');
    const st = dsState('coach');
    if (st) { if (window.CKC) box.querySelectorAll('.ck-chart').forEach((c) => CKC().clear(c)); cardState(card, st, st === 'error' ? 'The heart-rate zones did not arrive. Nothing saved is lost.' : ''); return; }
    const rows = kind('hrz'); const zr = kind('zone');
    if (!rows.length || !zr.length) { cardState(card, 'empty', ['No heart-rate zone data yet. It fills in from Garmin’s ', ruleSpan('2-minute', ZONE_RULE), ' heart rate after each session.']); return; }
    cardState(card, null);
    const firstZ = rows.reduce((a, r) => (r.date < a ? r.date : a), TODAY);
    const len = SPANS[state.span][0] || TN - dayN(firstZ) + 1; const prevName = SPANS[state.span][1];
    const pn = () => ruleSpan(prevName, 'app.js SPANS: the period before, the same length as the range');
    const start = TN - len + 1, pStart = start - len, pEnd = start - 1;
    const pick = (a, b) => rows.filter((r) => (state.zSport === 'all' || r.discipline === state.zSport) && dayN(r.date) >= a && dayN(r.date) <= b);
    const mins = (rs) => [1, 2, 3, 4, 5].map((z) => rs.reduce((s, r) => s + (N(r['z' + z]) || 0), 0));
    const cur = pick(start, TN), cm = mins(cur), ct = d3.sum(cm);
    const pm = mins(pick(pStart, pEnd)), pt = d3.sum(pm);
    const set1 = state.zSport === 'all' ? 'default' : state.zSport;
    const zdef = (z) => zr.find((r) => r.set === set1 && N(r.zone) === z) || {};
    const zw = (z) => `kind=zone&set=${set1}&zone=${z}`;
    box.replaceChildren();
    const rg = $('z-range'); rg.replaceChildren(`${fDay(P(isoN(Math.max(start, dayN(firstZ)))))}${start < dayN(firstZ) ? ', ' + firstZ.slice(0, 4) : ''} – ${fDay(P(TODAY))} · ${cur.length} session${cur.length === 1 ? '' : 's'}${ct ? ' · ' + hm(ct) : ''}`);
    if (start <= dayN(firstZ)) rg.append(' · zone history starts here: Garmin no longer serves the ', ruleSpan('2-minute', ZONE_RULE), ' heart rate for older days');
    if (!ct) { $('z-big').textContent = '—'; $('z-in').textContent = 'No heart rate data in this period'; $('z-delta').replaceChildren(); $('z-sum').replaceChildren(); return; }
    const share = cm.map((v) => v / ct); const top = share.indexOf(Math.max(...share));
    $('z-big').textContent = Math.round(share[top] * 100) + '%';
    $('z-in').replaceChildren('in ', mark(el('span', null, `Zone ${top + 1} (${zdef(top + 1).name || ''})`), 'coach', null, zw(top + 1), 'top-zone'));
    const dl = $('z-delta'); dl.replaceChildren();
    if (pt >= 30 && prevName) {
      const ps = pm[top] / pt, d = Math.round((share[top] - ps) * 100);
      if (d === 0) dl.append('Same share as ', pn());
      else { dl.append(mark(el('b', null, `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'}`), 'coach', null, 'kind=hrz', 'share-change'), ' vs ', pn(), ' (', mark(el('span', null, `${Math.round(ps * 100)}%`), 'coach', null, 'kind=hrz', 'zone-share-before'), ')'); }
    } else if (prevName) dl.append('No data for ', pn(), ' to compare');
    { const shost = el('div', 'z-share'); box.append(shost);
      const parts = (ms) => ms.map((v, i) => ({ key: 'z' + (i + 1), label: 'Z' + (i + 1), name: `Zone ${i + 1}${zdef(i + 1).name ? ' (' + zdef(i + 1).name + ')' : ''}`, value: v, tip: `${hm(v)}${zdef(i + 1).name ? ' · ' + zdef(i + 1).name : ''}` }));
      const capz = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      CKC().share(shost, { key: 'zones', title: 'Heart-rate zone time' + (state.zSport === 'all' ? '' : ', ' + (NAME[state.zSport] || state.zSport).toLowerCase()), window: spanName(),
        rows: [{ label: capz(spanName()), parts: parts(cm) }, ...(pt >= 30 && prevName ? [{ label: capz(prevName), parts: parts(pm) }] : [])], marks: { source: 'coach', where: 'kind=hrz' } }); }
    // the zone rows: name and range from the zone row, share and time from the hrz rows; the track is fixed 0 to 100 (Phase 0 item 21)
    const list = el('ul', 'ck-zones ft-zones');
    for (let z = 5; z >= 1; z--) {
      const d = zdef(z);
      const range = state.zSport === 'all' ? mark(el('span', 'ck-sub', d.name || ''), 'coach', 'name', zw(z)) : mark(el('span', 'ck-sub', z === 1 ? `under ${N(d.hi) + 1}` : z === 5 ? `${N(d.lo)}+ bpm` : `${N(d.lo)}–${N(d.hi)}`), 'coach', null, zw(z), 'zone-range');
      const li = el('li', 'ck-zone ft-zone' + (z - 1 === top ? ' is-top' : ''));
      const nm = el('span', 'ck-zone-name ft-zn'); nm.append(mark(el('b', null, `Z${z}`), 'coach', null, zw(z), 'zone'));
      if (z - 1 === top) { const g = el('span', 'ft-ztop', '●'); g.setAttribute('aria-hidden', 'true'); nm.append(el('span', 'ck-vh', ' most time'), g); }
      nm.append(range);
      const track = el('span', 'ck-zone-track'); track.setAttribute('aria-hidden', 'true'); const fill = el('i', 'ck-zone-fill'); fill.style.width = `calc(${(share[z - 1] * 100).toFixed(1)}% - 4px)`; track.append(fill);
      const zv = el('span', 'ck-zone-val ft-zv'); zv.append(mark(el('b', null, Math.round(share[z - 1] * 100) + '%'), 'coach', null, 'kind=hrz', 'zone-share'), mark(el('span', 'ck-sub', cm[z - 1] ? hm(cm[z - 1]) : '0 min'), 'coach', null, 'kind=hrz', 'zone-minutes'));
      li.append(nm, track, zv); list.append(li);
    }
    const axis = el('div', 'ck-zone-axis ft-zaxis'); axis.setAttribute('aria-hidden', 'true'); const ax = el('span'); ax.setAttribute('data-rule', 'fixed 0 to 100 percent scale (Phase 0 item 21)'); ax.append(el('span', null, '0'), el('span', null, '50'), el('span', null, '100%')); axis.append(el('span'), ax, el('span')); list.append(axis);
    box.append(list);
    const pct = (a, b) => Math.round((share.slice(a, b).reduce((s, v) => s + v, 0)) * 100);
    const sum = $('z-sum'); sum.replaceChildren();
    sum.append(el('b', null, `Easy Z1–2 ${pct(0, 2)}%`), ` · Steady Z3 ${pct(2, 3)}% · Hard Z4–5 ${pct(3, 5)}%`);
    const rz = (s) => { const z2 = zr.find((r) => r.set === s && N(r.zone) === 2); return z2 ? mark(el('span', null, String(N(z2.hi))), 'coach', 'hi', `kind=zone&set=${s}&zone=2`) : el('span', null, 'not set'); };
    $('z-note').replaceChildren('Easy days belong in Z1–2: the guardrail is the top of Z2 (run ', rz('run'), ', bike ', rz('bike'), `). Zones are provisional (wrist HR, estimated thresholds) and get recalculated after the November tests. Time comes from Garmin's 2-minute heart rate samples during each session, stops included, so short surges are smoothed. ${state.zSport === 'all' ? 'All includes hikes and swims on standard zones; walks are left out.' : ''}`);
  }
  for (const inp of document.querySelectorAll('#z-sport input')) inp.addEventListener('change', () => { if (!inp.checked) return; state.zSport = inp.value; renderZones(); ftFocus('#z-sport input:checked'); });

  function markerSummary(rows, key, endN) {
    const pts = rows.map((r) => ({ d: dayN(r.date), v: N(r[key]) })).filter((p) => p.v !== null);
    if (!pts.length) return null;
    let end = endN; if (!pts.some((p) => p.d > end - 28 && p.d <= end)) end = pts[pts.length - 1].d;
    const win = (e) => pts.filter((p) => p.d > e - 28 && p.d <= e).map((p) => p.v);
    const now = win(end), then = win(end - 56);
    return { now: avgOf(now), n: now.length, then: then.length ? avgOf(then) : null, asOf: end };
  }
  // Fitness tile (Cockpit ck-tile as a button): the label (with its rank), the big latest figure and unit, the status badge
  // when the row has one, the level and block goal with their meters, then the sublines. The top stripe is the sport token
  // (data-sport, set by groupFitness). The tile opens its chart below (aria-expanded, aria-controls f-expand).
  // status words on a tile: each is a badge with the tab's own word and the hidden state word, as Today shows Low and
  // Typical; ok is a status (the Good state), so it keeps the Good glyph with the word OK
  const FT_ST = { good: ['good', 'On track'], ok: ['good', 'OK'], watch: ['watch', 'Watch'] };
  function fitTile(key, o) {
    const b = el('button', 'ck-tile ck-tile-btn ft-tile'); b.type = 'button'; b.dataset.k = key; b.id = 'f-' + key;
    b.setAttribute('aria-expanded', String(o.sel === key)); b.setAttribute('aria-controls', 'f-expand');
    const head = el('span', 'ck-tile-head'); const lab = el('span', 'ck-tile-label ft-label'); lab.append(o.label); head.append(lab, icon('chevron', 'ck-chev ft-chev')); b.append(head);
    const fig = el('span', 'ck-big ft-fig'); fig.append(o.fig); if (o.unit) fig.append(o.unit); b.append(fig);
    if (o.status) b.append(o.status);
    for (const x of o.extra || []) if (x) b.append(x);
    for (const s of o.subs || []) { if (!s) continue; const n = el('span', 'ck-sub ft-subl'); n.append(...[].concat(s)); b.append(n); }
    // the accessible name reads label first: "Bike power at 130 bpm, 91 W, Level Bottom 5% II"; the sublines describe it
    const tx = (e) => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
    const nm = [tx(lab), [tx(o.fig), tx(o.unit)].filter(Boolean).join(' '), tx(o.status), ...Array.from(b.querySelectorAll('.ft-chip'), tx)].filter(Boolean);
    b.setAttribute('aria-label', nm.join(', '));
    const ds = Array.from(b.querySelectorAll('.ft-subl')); ds.forEach((d, i) => { d.id = `f-${key}-d${i}`; });
    if (ds.length) b.setAttribute('aria-describedby', ds.map((d) => d.id).join(' '));
    b.addEventListener('click', () => o.onPick(key));
    return b;
  }
  const ftPick = (k) => { state.fit = state.fit === k ? null : k; renderFitness(); ftFocus(`#f-tiles .ft-tile[data-k="${k}"]`); };
  function renderFitness() {
    const tilesBox = $('f-tiles'), card = $('f-card');
    const st = dsState('fitness') || dsState('coach');
    if (st) { $('f-expand').hidden = true; cardState(card, st, st === 'error' ? 'The fitness markers did not arrive. Nothing saved is lost.' : ''); return; }
    const fit = rowsOk('fitness');
    cardState(card, null);
    const run = fit.filter((r) => r.marker === 'run'), bike = fit.filter((r) => r.marker === 'bike');
    const calcRow = (k) => kind('marker').find((x) => x.key === k && x.section === 'calc');
    // the run and bike tiles are computed here from the fitness rows: the latest 28-day mean, its change over 8 weeks
    const RULE_28 = 'calc.js fitness: avg28, the mean of the 28 days up to the session';
    const RULE_8W = 'app.js markerSummary: the 28-day mean now against the 28 days ending 8 weeks earlier';
    const tiles = [];
    const sR = markerSummary(run, 'value', TN);
    tiles.push({ key: 'run', label: 'Run pace at 150 bpm', value: sR ? mss(sR.now) : '—', unit: '/mi', delta: sR && sR.then !== null ? sR.now - sR.then : null, better: -1, rnd: (d) => Math.round(d * 60) / 60, dtext: (d) => `${mss(Math.abs(d))} ${d < 0 ? 'faster' : 'slower'}`, n: sR ? sR.n : 0, what: ['flat run', 'flat runs'], none: 'No flat runs yet', asOf: sR ? sR.asOf : null });
    const sB = markerSummary(bike, 'value', TN);
    tiles.push({ key: 'bike', label: 'Bike power at 130 bpm', value: sB ? f0(sB.now) : '—', unit: 'W', delta: sB && sB.then !== null ? sB.now - sB.then : null, better: 1, rnd: (d) => Math.round(d), dtext: (d) => `${d > 0 ? '+' : '−'}${f0(Math.abs(d))} W`, n: sB ? sB.n : 0, what: ['Zwift ride', 'Zwift rides'], none: 'No Zwift rides yet', asOf: sB ? sB.asOf : null });
    { const pn = $('f-expand'); if (pn && pn.parentNode === tilesBox) tilesBox.after(pn); }
    tilesBox.replaceChildren();
    for (const t of tiles) {
      const fw = 'marker=' + t.key; const cr = calcRow(t.key);
      // the label is the calc marker row's own (the 150 and 130 bpm references are calc.js rules, CHARTS.md 10)
      const label = cr && cr.label ? mark(el('span', null, cr.label), 'coach', 'label', 'kind=marker&key=' + t.key) : ruleSpan(t.label, 'calc.js fitness: pace at 150 bpm, power at 130 bpm');
      const extra = [];
      { const src = t.key === 'run' ? run : bike; const bc = blockContext(t.key, src.filter((r) => N(r.avg28) !== null).sort((a, c) => (a.date < c.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) })));
        if (bc && bc.full.length && tiersOf(bc.cm).length) extra.push(levelBadge(levelFor(bc.cm, bc.full[bc.full.length - 1].value), t.key)); if (bc && bc.goal) extra.push(goalBadge(bc.goal, t.key)); }
      if (t.delta !== null) t.delta = t.rnd(t.delta);
      const subs = [];
      if (t.delta !== null && t.delta !== 0) subs.push([mark(el('b', null, t.dtext(t.delta)), 'fitness', null, fw, 'change-8wk'), ' vs ', ruleSpan('8 wk', RULE_8W), ' earlier']);
      else if (t.delta !== null) subs.push(['Same as ', ruleSpan('8 wk', RULE_8W), ' earlier']);
      subs.push(t.n ? [mark(el('span', null, String(t.n)), 'fitness', null, fw, 'count'), ` ${t.what[t.n === 1 ? 0 : 1]}, `, ruleSpan('28 days', RULE_28), t.asOf < TN - 1 ? [' to ', mark(el('span', null, fDay(P(isoN(t.asOf)))), 'fitness', null, fw, 'date')] : ''].flat() : t.none);
      tilesBox.append(fitTile(t.key, { sel: state.fit, label, fig: mark(el('span', null, t.value), 'fitness', null, fw, t.key === 'run' ? 'formatted' : 'avg-28d'), unit: el('span', 'ck-unit', t.unit), extra, subs, onPick: ftPick }));
    }
    for (const m of kind('marker').filter((x) => x.section === 'fitness').sort((a, b) => a.order - b.order)) tilesBox.append(markerTile(m, state.fit, ftPick));
    groupFitness(tilesBox);
    if (!tilesBox.querySelector('.ft-tile')) { cardState(card, 'empty', 'No fitness markers yet. They fill in as runs and Zwift rides arrive from Garmin.'); return; }
    const panel = $('f-expand');
    if (!placeExpand(tilesBox, panel, state.fit)) { state.fit = null; return; }
    if (state.fit === 'run' || state.fit === 'bike') { $('f-detail').replaceChildren(); drawFitChart(run, bike); }
    else { const m = kind('marker').find((x) => x.key === state.fit); if (!m) { state.fit = null; return renderFitness(); } drawMarker(m, $('c-fit'), $('c-fit-legend'), null, false); $('f-note').textContent = ''; $('f-detail').replaceChildren(markerDetail(m, { note: m.why ? mark(el('span', null, m.why), 'coach', 'why', 'kind=marker&key=' + m.key) : null })); }
  }
  // Fitness KPIs grouped by race type and ordered by weight (the athlete, Nov 1, 2026; coach/fitness_layout.json): a header per group with its
  // current target race, a rank number on each tile, the tile's top stripe in its sport token (the only thing colour means here).
  // A KPI missing from the layout is left off the tab (W/kg rides on the FTP tile). With no layout rows the tiles stay as built.
  // Widths: 2 across (an odd last tile spans the row); from 900 px 4 across, the last row of a group shares the width evenly.
  const FT_SPORTS = { swim: 'Swim', bike: 'Bike', run: 'Run', trail: 'Trail', strength: 'Strength', all: 'All sports' };
  function groupFitness(box) {
    const groups = kind('fit_group').sort((a, b) => N(a.order) - N(b.order)); const kpis = kind('fit_kpi');
    if (!groups.length || !kpis.length) return;
    const tiles = new Map(Array.from(box.querySelectorAll(':scope > .ft-tile')).map((t) => [t.dataset.k, t]));
    const key = el('p', 'ft-key'); key.append(el('span', 'ck-vh', 'Colour key: the stripe on each tile is its sport. '));
    for (const [k, lab] of Object.entries(FT_SPORTS)) { const s = el('span', 'ft-keyi'); const i = el('i', 'ft-sw'); i.setAttribute('aria-hidden', 'true'); i.dataset.sport = sportTok(k); s.append(i, lab); key.append(s); }
    box.replaceChildren(key);
    for (const g of groups) {
      const ks = kpis.filter((k) => k.group === g.key && tiles.has(k.key)).sort((a, b) => N(a.rank) - N(b.rank)); if (!ks.length) continue;
      const gw = 'kind=fit_group&key=' + g.key;
      const h = el('h3', 'ft-grp'); h.append(mark(el('span', 'ck-eyebrow', g.label), 'coach', 'label', gw)); if (g.race) h.append(mark(el('span', 'ft-grp-race', g.race), 'coach', 'race', gw)); box.append(h);
      const n = ks.length, r2 = ((n - 1) % 2) + 1, r4 = ((n - 1) % 4) + 1;
      ks.forEach((k, i) => {
        const t = tiles.get(k.key); t.dataset.sport = sportTok(k.sport);
        if (i === n - 1 && r2 === 1) t.dataset.w2 = '2';
        if (i >= n - r4) t.dataset.w4 = String(r4 === 3 ? (i === n - 1 ? 2 : 1) : 4 / r4);
        const l = t.querySelector('.ft-label');
        if (l) { const rk = mark(el('span', 'ft-rk', String(k.rank)), 'coach', 'rank', 'kind=fit_kpi&key=' + k.key); rk.title = `Weight ${k.weight} of 10 for this race type: ${k.why_weight || ''}`; l.prepend(rk); t.setAttribute('aria-label', `${t.getAttribute('aria-label')}, rank ${k.rank}`); }
        box.append(t);
      });
    }
  }
  // Tiles grouped under sport headers with the sport stripe (the athlete, Nov 1, 2026: Season so far and All-time records by sport).
  // groups: [{ label, sport, tiles: [element] }]; empty groups are skipped; an odd last tile spans the row. Phase 5 (Season):
  // the header is the sport glyph and word, the tiles are Cockpit tiles (seasonTile) whose 3 px top band reads the sport token
  // through data-sport, as the Fitness tiles do.
  const GRP_ICON = { bike: 'bike', run: 'run', trail: 'trail', swim: 'swim' };
  function sportGroups(box, groups) {
    box.replaceChildren();
    for (const g of groups) {
      const ts = g.tiles.filter(Boolean); if (!ts.length) continue;
      const h = el('h3', 'sn-grp'); if (GRP_ICON[g.sport]) h.append(icon(GRP_ICON[g.sport])); h.append(el('span', null, g.label)); if (g.note) h.append(el('span', 'ck-sub', g.note)); box.append(h);
      ts.forEach((t, i) => { t.dataset.sport = sportTok(g.sport); if (i === ts.length - 1 && ts.length % 2) t.classList.add('sn-wide'); box.append(t); });
    }
  }
  // A Season tile: label, the big figure (marked by mk = [source, field, where, derived]) with its unit, then sublines (each an
  // array of strings and marked nodes). A missing figure is the dash with no mark.
  function seasonTile(label, fig, unit, mk, ...subs) {
    const t = el('div', 'ck-tile sn-tile'); const lab = el('span', 'ck-tile-label'); lab.append(...[].concat(label));
    const big = el('span', 'ck-big sn-fig'); const v = el('span', null, fig); if (mk && fig !== '—') mark(v, ...mk); big.append(v); if (unit && fig !== '—') big.append(el('span', 'ck-unit', unit));
    t.append(lab, big);
    for (const sb of subs) { if (!sb || (Array.isArray(sb) && !sb.length)) continue; const ln = el('span', 'ck-sub sn-tsub'); ln.append(...[].concat(sb)); t.append(ln); }
    return t;
  }
  const mkSpan = (text, src, field, where, derived) => mark(el('span', null, text), src, field, where, derived);
  // a space between the parts of a grid or flex button, so its accessible name reads "Nov 7 Sat Trail race Bobcat ..." (the
  // layout ignores whitespace between grid and flex items, so nothing moves)
  const spaced = (...boxes) => { for (const bx of boxes) for (const c of [...bx.children].slice(1)) bx.insertBefore(document.createTextNode(' '), c); };
  // a sport's colour as its token: trail is the other-sport token, all sports the tertiary ink
  const sportTok = (s) => (s === 'trail' ? 'other' : s === 'all' ? 'fg-3' : SPORT_TONE[s] || 'fg-3');
  const sportCol = (s) => tokv(sportTok(s));
  function blockContext(k, rowsIn) {
    const cm = kind('marker').find((x) => x.key === k && (x.section === 'calc' || x.tiers !== undefined)); if (!cm) return null;
    const lb = (Number(cm.better) || 1) === -1;
    const series = rowsIn.map((r) => ({ d: dayN(r.date), date: r.date, value: N(r.value !== undefined ? r.value : r.avg28) })).filter((p) => p.value !== null).sort((a, b) => a.d - b.d);
    const blocks = kind('level_block').filter((b) => b.key === k).sort((a, b) => (a.start < b.start ? -1 : 1));
    const baselineOf = (b) => { if (N(b.baseline) !== null) return N(b.baseline); const before = series.filter((p) => p.d <= dayN(b.start)); if (before.length) return before[before.length - 1].value; const after = series.find((p) => p.d > dayN(b.start)); return after ? after.value : null; };
    const cur = blocks.find((b) => dayN(b.start) <= TN && dayN(b.end) >= TN) || null;
    const tiersFor = (b) => {
      const base = baselineOf(b); if (base === null) return [];
      const T = N(b.target), S = N(b.strong); let ts;
      if (T === null) ts = lb ? [{ label: 'Below baseline', lo: base, hi: null }, { label: 'Holding or better', lo: null, hi: base }] : [{ label: 'Below baseline', lo: null, hi: base }, { label: 'Holding or better', lo: base, hi: null }];
      else ts = lb ? [{ label: 'Below baseline', lo: base, hi: null }, { label: 'Baseline to Target', lo: T, hi: base }, { label: 'Target to Strong', lo: S, hi: T }, { label: 'Above and beyond', lo: null, hi: S }]
        : [{ label: 'Below baseline', lo: null, hi: base }, { label: 'Baseline to Target', lo: base, hi: T }, { label: 'Target to Strong', lo: T, hi: S }, { label: 'Above and beyond', lo: S, hi: null }];
      return ts.filter((t) => t.lo === null || t.hi === null || t.hi > t.lo).map((t) => ({ ...t, note: '', basis: 'race' }));
    };
    const inBlock = cur ? series.filter((p) => p.d >= dayN(cur.start)) : series;
    const latest = series.length ? series[series.length - 1].value : null;
    const vf = valFmt(cm); const next = blocks.find((b) => dayN(b.start) > TN) || null;
    const goal = cur ? (() => {
      const base = baselineOf(cur), T = N(cur.target), S = N(cur.strong); const better = lb ? -1 : 1;
      const ahead = (v, e) => (better === 1 ? v >= e : v <= e); const frac = (v, a, b) => (b === a ? 1 : Math.max(0, Math.min(1, (v - a) / (b - a))));
      let phase = 'hold', pct = null, text = '';
      if (T === null) { phase = 'hold'; text = base !== null && latest !== null ? `Hold: baseline ${vf(base)} · now ${vf(latest)} (${ahead(latest, base) ? 'holding' : 'below baseline'})` : 'Hold block'; }
      else if (latest === null || base === null) { text = `Target ${vf(T)}${S !== null ? `, Strong ${vf(S)}` : ''}`; }
      else if (S !== null && ahead(latest, S)) { phase = 'strong'; pct = 1; text = `Strong ${vf(S)} reached`; }
      else if (ahead(latest, T)) { phase = 'to strong'; pct = S !== null ? frac(latest, T, S) : 1; text = `Target ${vf(T)} reached · ${Math.round(pct * 100)}% of the way to Strong ${vf(S)}`; }
      else { phase = 'to target'; pct = frac(latest, base, T); text = `${Math.round(pct * 100)}% of the way from baseline ${vf(base)} to Target ${vf(T)}`; }
      return { block: cur.block, block_key: cur.block_key, start: cur.start, end: cur.end, status: cur.status, baseline: base, target: T, strong: S, latest, phase, pct, text,
               short: T === null ? 'Hold' : phase === 'strong' ? 'Strong reached' : phase === 'to strong' ? `Target met · to Strong ${vf(S)}` : `Target ${vf(T)}` };
    })() : null;
    const nextText = next ? `Next block ${next.block} (from ${fDay(P(next.start))}): ` + (N(next.target) === null ? 'hold' : `Target ${vf(N(next.target))}, Strong ${vf(N(next.strong))}`) + ' (provisional; set from the measured baseline on its first day)' : '';
    return { cm: { ...cm }, goal, nextText, series: inBlock.map((p) => ({ date: p.date, value: p.value })), full: series.map((p) => ({ date: p.date, value: p.value })), blocks, cur, baselineOf, tiersFor, lb };
  }
  function blockDrawFor(bc, fmt) {
    if (!bc) return [];
    const xStart = bc.series.length ? dayN(bc.series[0].date) : TN - 90;
    return bc.blocks.filter((b) => dayN(b.end) >= xStart - 120).map((b) => { const base = bc.baselineOf(b); const T = N(b.target), S = N(b.strong); const current = bc.cur && b.block_key === bc.cur.block_key; const future = dayN(b.start) > TN;
      const lines = [base !== null ? { v: base, label: `Baseline ${fmt(base)}`, solid: true } : null, T !== null ? { v: T, label: `Target ${fmt(T)}` } : null, S !== null ? { v: S, label: `Strong ${fmt(S)}` } : null].filter(Boolean);
      const shade = (base !== null && T !== null) ? [[base, T, future ? 0.04 : 0.08], ...(S !== null ? [[T, S, future ? 0.08 : 0.16]] : [])] : [];
      const lm = (f) => ({ source: 'coach', where: `kind=level_block&key=${b.key}&block_key=${b.block_key}`, field: f });
      lines.forEach((l) => { if (/^Target/.test(l.label)) l.marks = lm('target'); else if (/^Strong/.test(l.label)) l.marks = lm('strong'); else l.marks = N(b.baseline) !== null ? lm('baseline') : { ...lm(null), derived: 'block-baseline' }; });
      // the block the chart's key names (CHARTS.md 5): the current block when it has a Target, else the next block that has one
      const gb = bc.blocks.find((x) => dayN(x.end) >= TN && N(x.target) !== null);
      const goal = gb && gb.block_key === b.block_key ? (current ? 'this block' : `${String(b.block).split(' · ')[0]} from ${fDay(P(b.start))}`) : undefined;
      return { start: b.start, end: b.end, label: b.block, current, goal, provisional: b.status === 'provisional' || b.status === 'proposed' || future, tone: current || future ? basisOf('race').tone : 'chart-threshold', lines, shade }; });
  }
  // the run and bike tiles' chart (calc rows). Every other tile, VO2max and resting HR included when a layout row puts them
  // on this tab, draws through drawMarker, which follows the shared range (inSpan, spanStart).
  function drawFitChart(run, bike) {
    const box = $('c-fit'); const lg = $('c-fit-legend'); const note = $('f-note');
    const k = state.fit; const tone = SPORT_TONE[k];
    if (k === 'run' || k === 'bike') {
      const allRows = k === 'run' ? run : bike; const rows = inSpan(allRows);
      if (!rows.length) { CKC().clear(box); box.replaceChildren(el('p', 'ck-note', allRows.length ? `No qualifying ${k === 'run' ? 'runs' : 'rides'} in ${spanName()}. Pick a longer range above.` : 'No sessions qualify yet.')); lg.replaceChildren(); note.textContent = ''; return; }
      const vals = rows.flatMap((r) => [N(r.value), N(r.avg28)]).filter((v) => v !== null);
      const bc = blockContext(k, allRows.filter((r) => N(r.avg28) !== null).map((r) => ({ date: r.date, value: N(r.avg28) }))); const cm = bc ? bc.cm : null; const ts = cm ? tiersOf(cm) : [];
      const pts2 = ts;
      const latest = rows.map((r) => N(r.avg28)).filter((v) => v !== null).pop(); const cur = ts.find((t) => (t.lo === null || latest >= t.lo) && (t.hi === null || latest < t.hi));
      const zoom = zoomOf(k);
      const nextB = bc ? bc.blocks.find((b) => dayN(b.start) > TN) : null;
      const xEnd = isoN(Math.max(TN + 28, bc && bc.cur ? dayN(bc.cur.end) : TN, nextB ? dayN(nextB.end) : TN));
      const blockDraw = blockDrawFor(bc, k === 'run' ? mss : f0).filter((b) => dayN(b.end) >= dayN(rows[0].date) && dayN(b.start) <= dayN(xEnd));
      const lineVals = (bl) => bl.flatMap((b) => b.lines.map((l) => l.v));
      const popInc = tierInclude(pts2, d3.min(vals), d3.max(vals), zoom === 'close' ? 'close' : 'near');
      const inc = zoom === 'all' ? [...lineVals(blockDraw), ...tierInclude(pts2, d3.min(vals), d3.max(vals), 'all')] : zoom === 'near' ? [...lineVals(blockDraw.filter((b) => b.current || dayN(b.start) > TN)), ...popInc] : [];
      const closeR = zoom === 'close' && cm && latest !== undefined && ts.length ? closeRange(cm, latest) : zoom === 'near' && latest !== undefined ? nearRange(ts, vals, latest) : null;
      let lo = d3.min([...vals, ...inc]), hi = d3.max([...vals, ...inc]); const pad = (hi - lo) * 0.12 || 0.5; lo -= pad; hi += pad; if (k === 'bike' && lo < 0) lo = 0;
      if (closeR) { [lo, hi] = closeR; }
      const ticks = closeR ? (() => { const step = k === 'run' ? (hi - lo > 4 ? 1 : hi - lo > 2 ? 0.5 : 0.25) : d3.tickStep(lo, hi, 4); return d3.range(Math.ceil(lo / step) * step, hi + 1e-9, step); })() : d3.ticks(lo, hi, 4);
      lineChart(box, rows, {
        key: 'fit-' + k, h: 190, narrow: pts2.length ? { h: 280 } : undefined, today: true, main: 1, head: 0, fmt: k === 'run' ? mss : f0, unit: k === 'run' ? 'min/mi' : 'W', endUnit: k === 'run' ? '/mi' : 'W',
        words: k === 'run' ? ['slower', 'faster'] : undefined, title: k === 'run' ? 'Run pace at 150 bpm, 28-day average' : 'Bike power at 130 bpm, 28-day average', window: spanName(), marks: { source: 'fitness', field: 'avg28', where: 'marker=' + k, key: 'date' }, yDomain: k === 'run' ? [hi, lo] : [lo, hi], yTicks: ticks, xDomain: [spanStart(allRows), xEnd], clip: !!closeR,
        blocks: blockDraw, sublines: cm && zoom !== 'close' ? subEdges(cm) : undefined, tbands: !pts2.length ? undefined : zoom === 'close' && closeR ? subBands(cm, latest, () => basisOf('research').tone) : pts2.map((t) => ({ ...t, now: latest !== undefined && inTier(t, latest), tone: basisOf('research').tone })),
        series: [{ key: 'avg28', label: '28-day average', tone: SPORT_TONE[k], connect: false, width: 2.5 }, { key: 'value', label: k === 'run' ? 'Run' : 'Ride', tone: 'fg-3', dots: true, line: false, r: 3, end: false }],
        tipLines: (r) => k === 'run'
          ? [{ text: `${mss(r.raw)}/mi at ${r.hr} bpm, ${f1(r.miles)} mi` }, { text: `At 150 bpm: ${mss(r.value)}/mi` }, r.avg28 !== null ? { tone, text: `28-day average: ${mss(r.avg28)}` } : null].filter(Boolean)
          : [{ text: `${r.raw} W at ${r.hr} bpm, ${r.minutes} min` }, { text: `At 130 bpm: ${f0(r.value)} W` }, r.avg28 !== null ? { tone, text: `28-day average: ${f0(r.avg28)} W` } : null].filter(Boolean),
      });
      lg.replaceChildren(); lg.hidden = true; // direct labels replace the legend
      if (blockDraw.length) box.append(zoomBar(k, renderFitness));
      note.textContent = '';
      const calcNote = k === 'run'
        ? 'Each run’s pace scaled to the same 150 bpm (your easy guardrail) using your resting HR, so easy and hard runs compare. Up is faster. Flat runs only. Summer heat pushed HR up, so part of the gain since August is cooler weather. Estimated.'
        : 'Each Zwift ride’s average power scaled to the same 130 bpm using your resting HR. Up is more power for the same heart rate. Indoor rides only (no power outdoors). Estimated.';
      if (cm && latest !== undefined) {
        const vf = k === 'run' ? (v) => mss(v) + '/mi' : (v) => f0(v) + ' W'; const sg = (g) => (k === 'run' ? `${g >= 0 ? '+' : '−'}${mss(Math.abs(g))}` : `${g >= 0 ? '+' : '−'}${f0(Math.abs(g))} W`);
        const better = k === 'run' ? -1 : 1; const edge = cur ? (better === 1 ? cur.hi : cur.lo) : null; const nextBand = cur ? ts.find((t) => (better === 1 ? t.lo === cur.hi : t.hi === cur.lo)) : null;
        const gap = edge !== null && edge !== undefined && nextBand ? `${sg(latest - edge)} vs ${nextBand.label} (${vf(edge)})` : '—';
        $('f-detail').replaceChildren(markerDetail({ ...cm, gap, rank: cur ? cur.label : '' }, { rows: bc.full, note: ruleSpan(calcNote, 'app.js drawFitChart: calculation note (calc.js fitness description)'), goal: bc.goal, nextText: bc.nextText }));
      }
    }
  }

  const STW = { good: 'On track', ok: 'OK', watch: 'Watch' };
  // Expand panel (the athlete, Oct 23): the chart and detail open directly under the selected tile's row; tapping the selected tile again closes it
  function placeExpand(tilesBox, panel, selKey) {
    const tiles = Array.from(tilesBox.querySelectorAll(':scope > .ft-tile'));
    const sel = tiles.find((t) => t.getAttribute('aria-expanded') === 'true');
    if (!sel || !selKey) { panel.hidden = true; tilesBox.parentNode.insertBefore(panel, tilesBox.nextSibling); return false; }
    const top = sel.offsetTop; let last = sel;
    for (const t of tiles) if (Math.abs(t.offsetTop - top) < 2) last = t;
    last.after(panel); panel.hidden = false; return true;
  }
  // Level badge and the bar to the next level on a tile (the athlete, Oct 23): the current sub-tier, and how far through it toward its better edge
  // An open-ended band has no far edge to measure from: give it its neighbour's width (the band next to it), so every level gets a bar
  function closedSpan(m, t) {
    if (t.lo !== null && t.hi !== null) return { lo: t.lo, hi: t.hi, notional: false };
    const ts = tiersOf(m); const i = ts.findIndex((x) => x.label === (t.parent || t.label)); const nb = ts[i + 1] && ts[i + 1].lo !== null && ts[i + 1].hi !== null ? ts[i + 1] : ts[i - 1] && ts[i - 1].lo !== null && ts[i - 1].hi !== null ? ts[i - 1] : null;
    const w = nb ? (nb.hi - nb.lo) : Math.max(1, Math.abs(t.lo !== null ? t.lo : t.hi) * 0.25);
    return t.lo === null ? { lo: t.hi - w, hi: t.hi, notional: true } : { lo: t.lo, hi: t.lo + w, notional: true };
  }
  function pctThrough(m, t, v) { const sp = closedSpan(m, t); const better = Number(m.better) || 1; return { pct: Math.max(0, Math.min(1, better === 1 ? (v - sp.lo) / (sp.hi - sp.lo) : (sp.hi - v) / (sp.hi - sp.lo))), notional: sp.notional }; }
  function levelFor(m, v) {
    if (v === null || v === undefined || !m.tiers) return null;
    const st = standingOf(m, v); if (!st.band) return null; const sub = st.sub || st.band;
    const pt = pctThrough(m, sub, v);
    return { label: sub.label, pct: pt.pct, notional: pt.notional, basis: st.band.basis || m.basis || 'coach' };
  }
  // the level and block-goal lines on a tile: a label chip ("Level", "Goal") with its value, and a meter in the sport token
  function tileMeter(pct, sentence, where, derived) {
    const bar = el('span', 'ck-zone-track ft-meter'); bar.append(el('i', 'ck-zone-fill'));
    CKC().meter(bar, { frac: pct, sentence, marks: { source: 'coach', where, derived } }); return bar;
  }
  function levelBadge(lv, key) {
    const frag = document.createDocumentFragment(); if (!lv) return frag; const w = 'kind=marker&key=' + key;
    const bd = el('span', 'ft-chip'); bd.append(el('span', 'ft-chip-k', 'Level'), ' ', mark(el('span', null, lv.label), 'coach', null, w, 'level')); frag.append(bd);
    if (lv.pct !== null) { const tt = `${Math.round(lv.pct * 100)}% of the way to the next level${lv.notional ? ' (open-ended level, shown as wide as its neighbour)' : ''}`; const bar = tileMeter(lv.pct, `Level ${lv.label}: ${tt}`, w, 'level-progress'); bar.title = tt; frag.append(bar); }
    return frag;
  }
  function goalBadge(goal, key) {
    const frag = document.createDocumentFragment(); if (!goal) return frag; const w = `kind=level_block&key=${key}&block_key=${goal.block_key}`;
    const bd = el('span', 'ft-chip ft-chip--goal'); bd.append(el('span', 'ft-chip-k', 'Goal'), ' ', mark(el('span', null, goal.short + (goal.status === 'proposed' ? ' (proposed)' : goal.status === 'provisional' ? ' (provisional)' : '')), 'coach', null, w, 'block-goal')); frag.append(bd);
    if (goal.pct !== null) { const bar = tileMeter(goal.pct, `Goal ${goal.short}: ${goal.text}`, w, 'goal-progress'); bar.title = goal.text; frag.append(bar); }
    return frag;
  }
  // A marker tile from its coach marker row; every figure is marked from that row
  function markerTile(m, sel, onPick) {
    const w = 'kind=marker&key=' + m.key;
    const fig = m.value === '' || m.value == null ? mark(el('span', null, '—'), 'coach', null, w, 'none') : mark(el('span', null, m.value), 'coach', 'value', w);
    const rows = m.tiers && m.chart ? seriesFor(m) : []; const extra = [];
    if (rows.length) extra.push(levelBadge(levelFor(m, rows[rows.length - 1].value), m.key));
    if (kind('level_block').some((x) => x.key === m.key)) { const bc = blockContext(m.key, rows); if (bc && bc.goal) extra.push(goalBadge(bc.goal, m.key)); }
    const s = FT_ST[m.status];
    const b = fitTile(m.key, { sel, label: mark(el('span', null, m.label), 'coach', 'label', w), fig, unit: m.unit ? mark(el('span', 'ck-unit', m.unit), 'coach', 'unit', w) : null,
      status: s ? mark(badge(s[0], s[1], 'ft-badge'), 'coach', null, w, 'status') : null, extra, subs: m.sub ? [mark(el('span', null, m.sub), 'coach', 'sub', w)] : [], onPick });
    b.setAttribute('data-source', 'coach'); b.setAttribute('data-where', w);
    return b;
  }
  // The basis of a scale band: a chart band token (series-8 research, series-2 race target, chart-threshold coach), the same tokens the chart draws
  const BASIS = { research: { label: 'Research / population', word: 'research', color: () => tokv('series-8'), tone: 'series-8' }, race: { label: 'Race target', word: 'race target', color: () => tokv('series-2'), tone: 'series-2' }, coach: { label: 'Coach guide', word: 'coach', color: () => tokv('chart-threshold'), tone: 'chart-threshold' } };
  const basisOf = (b) => BASIS[b] || BASIS.coach;
  function tiersOf(m) { return String(m.tiers || '').split(';').filter(Boolean).map((t) => { const [label, lo, hi, note, basis] = t.split('|'); return { label, lo: lo === '' ? null : +lo, hi: hi === '' ? null : +hi, note, basis: basis || m.basis || 'coach' }; }); }
  function basisTag(b) { const t = el('span', 'ft-btag', basisOf(b).label); t.style.color = basisOf(b).color(); /* the tag names a chart band: the band's own token */ return t; }
  function basisLegend(ts) { const seen = [...new Set(ts.map((t) => t.basis))]; return seen.map((b) => ({ label: basisOf(b).label + ' bands', color: basisOf(b).color() })); }
  function tierLines(m) {
    const ts = tiersOf(m); const out = [];
    for (let i = 0; i < ts.length - 1; i++) if (ts[i].hi !== null) out.push({ v: ts[i].hi, label: m.key === 'swim' ? ts[i + 1].label : ts[i + 1].label });
    return out;
  }
  const ZOOMS = [['close', 'Close up'], ['near', 'Nearby levels'], ['all', 'All levels']];
  function zoomOf(key) { return state.zoom[key] || 'near'; }
  function tierInclude(ts, vmin, vmax, zoom) {
    const edges = ts.flatMap((t) => [t.lo, t.hi]).filter((v) => v !== null); const inc = [];
    if (zoom === 'close' || !edges.length) return inc;
    if (zoom === 'all') { const lo = d3.min(edges), hi = d3.max(edges); const span = Math.max(hi, vmax) - Math.min(lo, vmin); return [Math.min(lo, vmin) - span * 0.06, Math.max(hi, vmax) + span * 0.06]; }
    const below = d3.max(edges.filter((v) => v <= vmin)), above = d3.min(edges.filter((v) => v > vmax));
    if (below !== undefined) inc.push(below - (vmax - below) * 0.15 - 0.01); if (above !== undefined) inc.push(above + (above - vmin) * 0.15 + 0.01);
    return inc;
  }
  // Nearby levels shows at most three bands (the athlete, Nov 5, 2026): the band the latest value sits in, one above and one below
  // (at the end of the scale, the two nearest). The chart's range is that window; points outside it are clipped, as in
  // Close up. An open end (no edge) reaches the points inside it. Three bands or fewer: null, the old padded range stays.
  function nearRange(ts, vals, latest) {
    const t = ts.slice().sort((a, b) => (a.lo === null ? -Infinity : a.lo) - (b.lo === null ? -Infinity : b.lo));
    const i = t.findIndex((x) => (x.lo === null || latest >= x.lo) && (x.hi === null || latest < x.hi));
    if (t.length <= 3 || i < 0) return null;
    const a = Math.max(0, Math.min(i - 1, t.length - 3)), lo0 = t[a].lo, hi0 = t[a + 2].hi;
    const inW = [latest, ...vals].filter((v) => v !== null && v !== undefined && (lo0 === null || v >= lo0) && (hi0 === null || v <= hi0));
    const mid = t[a + 1], w = mid.lo !== null && mid.hi !== null ? mid.hi - mid.lo : Math.abs(latest) * 0.1 || 1;
    return [lo0 !== null ? lo0 : Math.min(d3.min(inW), t[a].hi) - w * 0.3, hi0 !== null ? hi0 : Math.max(d3.max(inW), t[a + 2].lo) + w * 0.3];
  }
  function closeRange(m, latest) {
    const E = [...new Set(subtiersOf(m).flatMap((t) => [t.lo, t.hi]).filter((v) => v !== null))].sort((a, b) => a - b);
    if (!E.length) return null;
    let iLo = -1; for (let i = 0; i < E.length; i++) if (E[i] <= latest) iLo = i;
    const iHi = iLo + 1;
    const width = (iLo >= 0 && iHi < E.length) ? E[iHi] - E[iLo] : (E.length > 1 ? E[1] - E[0] : Math.abs(latest) * 0.1 || 1);
    const lo = iLo - 1 >= 0 ? E[iLo - 1] : iLo >= 0 ? E[iLo] - width : latest - width;
    const hi = iHi + 1 < E.length ? E[iHi + 1] : iHi < E.length ? E[iHi] + width : latest + width;
    const FLOOR = { strength: 0, sauna: 0, le8: 0, sleepreg: 0, wkg: 0, ftp: 0, bike: 0, consistency: 0, durability: 0 }, CAP = { le8: 100 };
    const pad = (hi - lo) * 0.04; let a = lo - pad, b = hi + pad;
    if (FLOOR[m.key] !== undefined) a = Math.max(a, FLOOR[m.key]); if (CAP[m.key] !== undefined) b = Math.min(b, CAP[m.key] + (CAP[m.key] - a) * 0.04);
    return [a, b];
  }
  // Chart range (Close up / Nearby levels / All levels): a Cockpit segmented control of native radios, one per chart key
  function zoomBar(key, rerender) {
    const bar = el('fieldset', 'ck-seg ft-seg ft-zoom'); bar.append(el('legend', 'ck-vh', 'Chart range'));
    for (const [z, label] of ZOOMS) {
      const opt = el('label', 'ck-seg-opt'); const inp = el('input', 'ck-vh-input'); inp.type = 'radio'; inp.name = 'f-zoom-' + key; inp.value = z; inp.checked = zoomOf(key) === z;
      inp.addEventListener('change', () => { if (!inp.checked) return; state.zoom[key] = z; rerender(); ftFocus(`.ft-zoom input[name="f-zoom-${key}"]:checked`); });
      opt.append(inp, label); bar.append(opt);
    }
    return bar;
  }
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  function subtiersOf(m) {
    const ts = tiersOf(m); const n = Math.max(1, Number(m.split) || 2); const better = Number(m.better) || 1; const out = [];
    for (const t of ts) {
      if (t.lo === null || t.hi === null || n === 1) { out.push({ ...t, parent: t.label }); continue; }
      const step = (t.hi - t.lo) / n;
      for (let i = 0; i < n; i++) { const lo = t.lo + step * i, hi = i === n - 1 ? t.hi : t.lo + step * (i + 1); const num = better === 1 ? i + 1 : n - i; out.push({ label: `${t.label} ${ROMAN[num - 1]}`, lo, hi, parent: t.label, note: '', basis: t.basis }); }
    }
    return out;
  }
  // Close up draws the sub-levels as its bands (the athlete, Nov 5, 2026): one tint and one name per sub-tier ("Lower half II"),
  // the one the value is in bold, a solid hairline at each edge inside a band (sub), the band edges dashed (CHARTS.md 5)
  function subBands(m, v, tone) { const ts = tiersOf(m); return subtiersOf(m).map((t) => { const p = ts.find((x) => x.label === t.parent) || t; return { lo: t.lo, hi: t.hi, label: t.label, now: v !== undefined && v !== null && inTier(t, v), tone: tone(p), sub: t.hi !== null && t.hi !== p.hi }; }); }
  function subEdges(m) { const main = new Set(tiersOf(m).flatMap((t) => [t.lo, t.hi])); return subtiersOf(m).flatMap((t) => [t.lo, t.hi]).filter((v) => v !== null && !main.has(v)); }
  const inTier = (t, v) => (t.lo === null || v >= t.lo) && (t.hi === null || v < t.hi);
  function valFmt(m, short) {
    const k = m.key, u = short ? '' : (m.unit || '');
    if (k === 'swim') return (v) => `${mss(v / 60)}${short ? '' : ' /100 yd'}`;
    if (k === '5k') return (v) => mss(v);
    if (k === 'run') return (v) => `${mss(v)}${short ? '' : '/mi'}`;
    if (k === 'wkg') return (v) => `${window.CX.fixed(v, 2)}${short ? '' : ' W/kg'}`;
    if (k === 'sleepreg') return (v) => `±${f0(v)}${short ? '' : ' min'}`;
    if (k === 'durability') return (v) => `${f1(v)}%`;
    if (['bike', 'ftp', 'rhr', 'le8', 'strength', 'sauna', 'consistency'].includes(k)) return (v) => `${f0(v)}${u ? ' ' + u : ''}`;
    return (v) => `${f1(v)}${u ? ' ' + u : ''}`;
  }
  function deltaFmt(m) {
    const k = m.key, u = m.unit || '';
    if (k === 'swim') return (d) => `${Math.round(d)} s`;
    if (k === '5k' || k === 'run') return (d) => mss(d) + (k === 'run' ? '/mi' : '');
    if (k === 'wkg') return (d) => `${window.CX.fixed(d, 2)} W/kg`;
    if (k === 'sleepreg') return (d) => `${f0(d)} min`;
    if (k === 'durability' || k === 'le8' || k === 'vo2') return (d) => `${f1(d)} points`;
    if (['bike', 'ftp', 'rhr'].includes(k)) return (d) => `${f0(d)} ${u}`;
    return (d) => `${f1(d)}${u ? ' ' + u : ''}`;
  }
  function milestoneInfo(m, rows) {
    const subs = subtiersOf(m); const better = Number(m.better) || 1; if (!subs.length || !rows.length) return null;
    const latest = rows[rows.length - 1].value;
    const beyond = (v, e) => (better === 1 ? v >= e : v <= e);
    const edges = []; // the edge you cross to enter each sub-tier from the worse side
    for (const t of subs) { const e = better === 1 ? t.lo : t.hi; if (e !== null && e !== undefined) edges.push({ v: e, label: t.label }); }
    edges.sort((a, b) => (better === 1 ? a.v - b.v : b.v - a.v));
    const reached = edges.map((e) => { const first = rows.find((r) => beyond(r.value, e.v)); return first ? { ...e, date: first.date, held: beyond(latest, e.v) } : null; }).filter(Boolean);
    const next = edges.find((e) => !beyond(latest, e.v)) || null;
    const cur = subs.find((t) => inTier(t, latest)) || null; const band = tiersOf(m).find((t) => inTier(t, latest)) || null;
    const pt = band ? pctThrough(m, band, latest) : { pct: null, notional: false };
    return { latest, cur, band, pct: pt.pct, notional: pt.notional, next, reached, dist: next ? Math.abs(next.v - latest) : null };
  }
  function pctFromFront(norm, v) {
    const bp = [...norm.breakpoints].map((b) => [N(b[0]), N(b[1])]).sort((a, b) => a[0] - b[0]); const better = Number(norm.better) || 1;
    if (better === -1) {
      if (v <= bp[0][0]) return bp[0][1] * (bp[0][0] ? v / bp[0][0] : 1);
      for (let i = 0; i < bp.length - 1; i++) if (v >= bp[i][0] && v <= bp[i + 1][0]) return bp[i][1] + (v - bp[i][0]) / (bp[i + 1][0] - bp[i][0]) * (bp[i + 1][1] - bp[i][1]);
      return Math.min(100, bp[bp.length - 1][1] + (v - bp[bp.length - 1][0]) / Math.max(1e-9, bp[bp.length - 1][0]) * (100 - bp[bp.length - 1][1]));
    }
    if (v >= bp[bp.length - 1][0]) return bp[bp.length - 1][1];
    for (let i = 0; i < bp.length - 1; i++) if (v >= bp[i][0] && v <= bp[i + 1][0]) return bp[i][1] + (v - bp[i][0]) / (bp[i + 1][0] - bp[i][0]) * (bp[i + 1][1] - bp[i][1]);
    return Math.min(100, bp[0][1] + (bp[0][0] - v) / Math.max(1e-9, bp[0][0]) * (100 - bp[0][1]));
  }
  // A folded section of the detail (native details; the summary is a 44 px Cockpit disclosure line with a turning chevron)
  function section(title, tag) {
    const dt = el('details', 'ft-sect'); const sm = el('summary', 'ck-disc ft-sum'); const t = el('span', 'ft-sum-t'); t.append(el('b', null, title)); if (tag) t.append(' ', tag); sm.append(t, icon('chevron', 'ck-chev')); dt.append(sm);
    const body = el('div', 'ft-sbody'); dt.append(body); return { dt, body };
  }
  // one line of the detail: a bold label and its content (marked by the caller)
  const dLine = (label, ...content) => { const r = el('p', 'ft-dl'); if (label) r.append(el('b', null, label)); r.append(...content.flat()); return r; };
  function markerDetail(m, ctx) {
    const wrap = el('div', 'ft-det');
    const mw = 'kind=marker&key=' + m.key; const md = (txt, d, where) => mark(el('span', null, txt), 'coach', null, where || mw, d); const mf = (f) => mark(el('span', null, m[f]), 'coach', f, mw);
    const main = section('Progress details'); const d = main.body;
    let rows = ctx && ctx.rows ? ctx.rows : kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }));
    if (['consistency', 'strength', 'sauna'].includes(m.key)) {
      const full = rows.filter((r) => !/so far/.test(String(r.extra || '')));
      rows = full.map((r, i) => ({ date: r.date, value: avgOf(full.slice(Math.max(0, i - 3), i + 1).map((x) => x.value)) }));
    }
    const vf = valFmt(m), sf = valFmt(m, true), df = deltaFmt(m); const mi = milestoneInfo(m, rows);
    // The scale (basis, anchor, bands, population bands, source) folds away under one disclosure (the athlete, Oct 23); the current standing stays in view
    const tagWrap = el('span'); if (m.basis && tiersOf(m).length) { tagWrap.append(basisTag(m.basis)); if (tiersOf(m).some((t) => t.basis !== m.basis)) tagWrap.append(' with ', ...[...new Set(tiersOf(m).filter((t) => t.basis !== m.basis).map((b) => b.basis))].map((b) => basisTag(b)), ' bands'); }
    const scale = section('Scale', tagWrap.childNodes.length ? tagWrap : null); const sc = scale.dt, scb = scale.body;
    if (ctx && ctx.note) scb.append(dLine(null, ctx.note));
    if (m.anchor) scb.append(dLine('Anchor: ', mf('anchor')));
    const goal = ctx && ctx.goal ? ctx.goal : (kind('level_block').some((x) => x.key === m.key) ? (blockContext(m.key, rows) || {}).goal : null);
    if (goal) {
      const gw = `kind=level_block&key=${m.key}&block_key=${goal.block_key}`;
      const g = el('div', 'ft-prog'); g.append(dLine('Block goal: ', basisTag('race'), ' ', md(`${goal.block} (${fDay(P(goal.start))}–${fDay(P(goal.end))})${goal.status === 'proposed' ? ' · proposed, awaiting your confirmation' : goal.status === 'provisional' ? ' · provisional until the block starts' : ''}`, 'block', gw)));
      if (goal.pct !== null) { const bar = el('span', 'ck-zone-track ft-meter ft-meter--race'); bar.append(el('i', 'ck-zone-fill')); CKC().meter(bar, { frac: goal.pct, sentence: `Block goal: ${goal.text}`, marks: { source: 'coach', where: gw, derived: 'goal-progress' } }); g.append(bar); }
      g.append(dLine(null, md(goal.text, 'goal-progress', gw), ctx && ctx.nextText ? ['. ', md(ctx.nextText, 'next-block', 'kind=level_block&key=' + m.key)] : '')); d.append(g);
    } else if (m.target) d.append(dLine('Target: ', mf('target')));
    if (m.gap && m.gap !== '—') d.append(dLine('Gap: ', md(m.gap, 'gap')));
    if (m.population) d.append(dLine('Population: ', mf('population')));
    if (m.pop_norm && rows.length) {
      const nr = kind('norm').find((x) => x.key === m.pop_norm);
      if (nr) { const pf = pctFromFront(nr, rows[rows.length - 1].value); const ord = (n) => { n = Math.round(n); const s = (10 <= n % 100 && n % 100 <= 20) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); return n + s; }; d.append(dLine('Population: ', md(`About ${ord(100 - pf)} percentile of ${nr.population} if held for the whole leg (${Math.round(pf)}% better; n about ${Number(nr.n).toLocaleString()}). ${nr.note || ''}`, 'percentile', 'kind=norm&key=' + m.pop_norm))); }
    }
    const rankExtra = String(m.rank || '').includes(' (') ? ' (' + String(m.rank).split(' (').slice(1).join(' (') : '';
    const levelText = mi && mi.cur ? mi.cur.label + rankExtra : m.rank;
    if (levelText) d.append(dLine('Level: ', md(levelText, 'level')));
    if (mi && mi.pct !== null && mi.band) {
      const pw = el('div', 'ft-prog'); const bar = el('span', 'ck-zone-track ft-meter'); bar.append(el('i', 'ck-zone-fill'));
      const nextBand = tiersOf(m).find((t) => (Number(m.better) || 1) === 1 ? t.lo === mi.band.hi : t.hi === mi.band.lo);
      CKC().meter(bar, { frac: Math.max(0, Math.min(1, mi.pct)), sentence: `${Math.round(mi.pct * 100)}% of the way through ${mi.band.label}`, marks: { source: 'coach', where: mw, derived: 'band-progress' } });
      pw.append(bar, dLine(null, md(`${Math.round(mi.pct * 100)}% of the way through ${mi.band.label}${nextBand ? ' toward ' + nextBand.label : ''}${mi.notional ? ' (open-ended band, measured as if as wide as its neighbour)' : ''}`, 'band-progress'))); d.append(pw);
    }
    if (mi) {
      const wk = ['consistency', 'strength', 'sauna'].includes(m.key); const nv = wk ? (v) => `${f1(v)} ${m.key === 'consistency' ? 'days' : 'sessions'}/week` : vf, nd = wk ? (v) => `${f1(v)} per week` : df;
      d.append(dLine('Next milestone: ', mi.next ? md(`${mi.next.label} at ${nv(mi.next.v)} · ${nd(mi.dist)} away${wk ? ' (4-week average)' : ''}`, 'milestone') : 'top of the scale reached'));
      if (mi.reached.length) {
        const r2 = dLine('Reached: '); const rs = el('span'); mark(rs, 'coach', null, mw, 'milestones-reached');
        const last = mi.reached.slice(-6);
        last.forEach((e, i) => { if (i) rs.append(' → '); rs.append(`${e.label} · ${fDay(P(e.date))}${e.held ? '' : ' (slipped)'}`); if (e.held && dayN(e.date) > TN - 7) rs.append(' ', el('span', 'ck-chip ft-new', 'New')); });
        r2.append(rs); d.append(r2);
      }
    }
    const ts = tiersOf(m);
    if (ts.length) {
      const ul = el('ul', 'ft-tiers'); mark(ul, 'coach', null, mw, 'tiers'); const curBand = mi && mi.band ? mi.band.label : String(m.rank || '').split(' (')[0];
      const subs = subtiersOf(m);
      for (const t of ts) {
        const here = t.label === curBand; const li = el('li', here ? 'is-here' : null); li.append(el(here ? 'b' : 'span', null, t.label)); li.append(' ', basisTag(t.basis)); if (t.note) li.append(': ' + t.note);
        const mine = subs.filter((x) => x.parent === t.label && x.label !== t.label);
        if (mine.length) { const sl = el('span', 'ft-subs'); sl.append(mine.map((x) => `${x.label.slice(t.label.length + 1)} ${sf(x.lo)}–${sf(x.hi)}${mi && mi.cur && mi.cur.label === x.label ? ' (you)' : ''}`).join(' · ')); li.append(sl); }
        ul.append(li);
      }
      scb.append(ul);
      scb.append(dLine(null, `Sub-tiers (I, II${(Number(m.split) || 2) > 2 ? ', III' : ''}) are equal steps inside each band, higher is nearer the next band; the bands carry the evidence, the steps are for pacing progress.`));
    }
    if (m.how) scb.append(dLine(null, mf('how')));
    if (d.children.length) wrap.append(main.dt);
    if (scb.children.length) wrap.append(sc);
    return wrap;
  }
  function drawMarker(m, box, lg, note, withWhy) {
    const allPts = kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
    const pts = inSpan(allPts);
    if (lg) lg.replaceChildren();
    if (note) note.textContent = withWhy ? [m.why, m.how].filter(Boolean).join(' ') : (m.how || '');
    if (!m.chart || allPts.length < 1) { CKC().clear(box); box.replaceChildren(el('p', 'ck-note', !m.chart ? 'This marker is a status, not a measurement over time, so it has no chart.' : 'No data points yet: the chart starts with the first one.')); return; }
    if (!pts.length) { const lp = allPts[allPts.length - 1]; CKC().clear(box); const p0 = el('p', 'ck-note'); p0.append(`Nothing in ${spanName()}: the latest point is from `, mark(el('span', null, `${fDay(P(lp.date))}, ${lp.date.slice(0, 4)}`), 'coach', null, `kind=mpt&key=${m.key}&date=${lp.date}`, 'date'), '. Pick a longer range above.'); box.replaceChildren(p0); return; }
    const col = m.key === 'swim' ? 'swim' : m.key === 'vo2' || m.key === '5k' ? 'run' : 'series-1';
    if (m.chart === 'bars') {
      // script-held (CHARTS.md): Good 3 (research), Better 4 and Best 5 (coach), the 3-day fill rule, the 0 to 7 scale
      const TL = [[3, 'Good 3 (research)'], [4, 'Better 4 (coach)'], [5, 'Best 5 (coach)']];
      const lastP = pts[pts.length - 1]; const part = /so far/.test(String(lastP.extra || '')) ? { x: lastP.date, days: Math.min(7, TN - dayN(lastP.date) + 1), of: 7 } : null;
      CKC().bar(box, { key: 'marker-' + m.key, h: 170, rows: pts.map((p) => ({ x: p.date, v: N(p.value) })), unit: 'days', yMax: Math.max(7, d3.max(pts, (p) => N(p.value))), nice: false, yTicks: [0, 2, 4, 6],
        padding: pts.length > 60 ? 0.1 : 0.3, barMax: 40, xfmt: (d) => (pts.length > 40 ? d3.utcFormat("%b '%y") : fDay)(P(d)), partial: part,
        toneOf: (r) => (N(r.v) >= 3 ? 'good' : 'fg-3'),
        bands: [[0, 3, 0.07, 'research'], [3, 4, 0.16, 'research'], [4, 5, 0.07, 'coach'], [5, 7, 0.16, 'coach']].map(([lo, hi, op, b]) => ({ lo, hi, opacity: op, tone: basisOf(b).tone })),
        thresholds: TL.map(([v, label]) => ({ value: v, label, marks: { held: 'app.js drawMarker consistency tiers' } })),
        title: 'Training days per week', window: spanName(), period: 'week', marks: { source: 'coach', where: 'kind=mpt&key=' + m.key },
        tip: (r) => ({ head: 'Week of ' + fDay(P(r.x)), lines: [{ text: `${r.v} training day${r.v === 1 ? '' : 's'}${part && r.x === part.x ? ' so far' : ''}` }] }) });
      if (lg) { lg.replaceChildren(); lg.hidden = true; }
      return;
    }
    const rows = pts.map((p) => ({ date: p.date, value: N(p.value), raw: N(p.raw), extra: p.extra }));
    const hasRaw = rows.some((r) => r.raw !== null);
    const fmt = m.key === 'swim' ? (v) => mss(v / 60) : m.key === '5k' ? (v) => mss(v) : (v) => f1(v).replace(/\.0$/, '');
    const hasBlocks = kind('level_block').some((b) => b.key === m.key); const bcm = hasBlocks ? blockContext(m.key, allPts.map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }))) : null; const blockDraw = bcm ? blockDrawFor(bcm, fmt) : [];
    const bxEnd = bcm ? isoN(Math.max(TN + 28, bcm.cur ? dayN(bcm.cur.end) : TN)) : null;
    const ts = tiersOf(m); const vmin = d3.min(rows, (r) => r.value), vmax = d3.max(rows.flatMap((r) => [r.value, r.raw]).filter((v) => v !== null));
    const last = rows[rows.length - 1].value; const cur = ts.find((t) => (t.lo === null || last >= t.lo) && (t.hi === null || last < t.hi));
    const zoom = zoomOf(m.key); const inc = tierInclude(ts, vmin, vmax, zoom);
    const nearLines = blockDraw.filter((b) => b.current || dayN(b.start) > TN).flatMap((b) => b.lines.map((l) => l.v));
    const closeR = zoom === 'close' && ts.length ? closeRange(m, last) : zoom === 'near' && ts.length ? nearRange(ts, rows.flatMap((r) => [r.value, r.raw]), last) : null; const lowerIsBetter = (Number(m.better) || 1) === -1;
    const tbands = ts.map((t) => ({ ...t, label: `${t.label} (${basisOf(t.basis).word})`, now: cur && t.label === cur.label, tone: basisOf(t.basis).tone }));
    const dotTag = hasRaw ? (m.key === 'swim' ? 'each swim' : 'each run') : m.key === 'durability' ? 'each long session' : m.key === 'swim' ? 'each swim' : null;
    const axisL = m.key === '5k' ? 'time, min:s' : m.key === 'swim' ? 'min:s per 100 yd' : undefined;
    const lowerBetter = m.key === 'swim' || m.key === '5k' || m.key === 'durability' || m.key === 'rhr' || m.key === 'sleepreg';
    lineChart(box, rows, {
      key: 'marker-' + m.key, h: 190, narrow: ts.length ? { h: 280 } : undefined, today: false, axisLabel: axisL, nice: !lowerBetter || m.key === 'rhr' || m.key === 'sleepreg', main: 0, head: 0, fmt, unit: m.unit || '', words: (m.key === 'swim' || m.key === '5k') ? ['slower', 'faster'] : undefined, title: m.label, window: spanName(), marks: { source: 'coach', field: 'value', where: 'kind=mpt&key=' + m.key, key: 'date' },
      yFixed: closeR ? ((m.key === 'swim' || m.key === '5k') ? [closeR[1], closeR[0]] : closeR) : undefined, clip: !!closeR,
      yDomain: (m.key === 'swim' || m.key === '5k') ? [d3.max([vmax, ...inc]) + (m.key === 'swim' ? 5 : 0.5), d3.min([vmin, ...inc]) - (m.key === 'swim' ? 5 : 0.5)] : undefined,
      yTicks: (m.key === 'swim' || m.key === '5k' || closeR) ? (() => { const hi = closeR ? closeR[1] : d3.max([vmax, ...inc]), lo = closeR ? closeR[0] : d3.min([vmin, ...inc]); const span = hi - lo; const step = m.key === 'swim' ? (span > 150 ? 30 : span > 60 ? 20 : span > 24 ? 5 : 2) : m.key === '5k' ? (span > 12 ? 4 : span > 8 ? 2 : span > 3 ? 1 : 0.5) : d3.tickStep(lo, hi, 4); return d3.range(Math.ceil(lo / step) * step, hi + 1e-9, step); })() : undefined,
      yInclude: [...inc, ...(blockDraw.length && zoom !== 'close' ? nearLines : [])], blocks: blockDraw.length ? blockDraw : undefined, xDomain: [spanStart(allPts), bxEnd || TODAY], today: !!bxEnd,
      tbands: !ts.length ? undefined : zoom === 'close' ? subBands(m, last, (t) => basisOf(t.basis).tone) : tbands, sublines: zoom === 'close' ? undefined : subEdges(m), yMin: ['strength', 'sauna', 'le8', 'sleepreg', 'wkg'].includes(m.key) ? 0 : undefined,
      hbands: m.key === 'durability' && !ts.length ? [[0, 5]] : undefined,
      series: [{ key: 'value', label: m.label, tone: col, dots: !hasRaw, line: m.chart === 'line', connect: m.chart === 'line', r: 3, width: hasRaw ? 2.5 : 2, smooth: hasRaw || m.key === 'rhr', tag: hasRaw ? 'best 90-day effort' : m.key === 'rhr' ? '28-night average' : dotTag }, ...(hasRaw ? [{ key: 'raw', label: 'This run', tone: 'fg-3', dots: true, line: false, r: 2.5, end: false, tag: dotTag }] : [])],
      tipLines: (r) => [{ text: `${fmt(r.value)}${m.unit && m.unit !== '/100 yd' ? ' ' + m.unit : m.unit === '/100 yd' ? ' /100 yd' : ''}` }, r.extra ? { text: r.extra } : null].filter(Boolean),
      digits: 0,
    });
    if (lg) { lg.replaceChildren(); lg.hidden = true; } // direct labels replace the legend
    if (ts.length) box.append(zoomBar(m.key, () => renderFitness()));
  }


  // Check-in (Phase 5): the session list and the "already recorded" lists run to the last Garmin pull; one banner, same rule.
  function renderCiStale() {
    const b = kind('build')[0], box = $('ci-stale'); if (!box) return;
    const pull = b && b.garmin_pull_utc ? new Date(b.garmin_pull_utc) : null;
    const ageH = pull && !isNaN(pull) ? (now - pull) / 3600000 : null;
    const on = ageH !== null && ageH > GARMIN_MAX_H; box.hidden = !on; if (!on) return;
    const pd = `${pull.getFullYear()}-${pad2(pull.getMonth() + 1)}-${pad2(pull.getDate())}`, age = TN - dayN(pd), t = $('ci-stale-t'); t.replaceChildren();
    t.append(` The session list and the already recorded counts run to the Garmin pull of ${stamp(b.garmin_pull_utc)}, ${age <= 1 ? 'over a day' : age + ' days'} ago, later than the `, ruleSpan(String(GARMIN_MAX_H), 'coach/ops/data_paths.json garmin max_age_hours: 26'), ' h the pull should take. Later sessions arrive with the next pull.');
  }

  // ---------- render loop ----------
  function render() {
    state.dark = themeIsDark();
    renderHeader();
    if (state.page === 'today') { renderToday(); if (window.CX.renderCiStrip) window.CX.renderCiStrip(); }
    else if (state.page === 'checkins') { renderCiStale(); if (window.CX.renderCheckins) window.CX.renderCheckins(); }
    else if (state.page === 'week') renderWeek();
    else if (state.page === 'goals') renderGoals();
    else if (state.page === 'trends') renderTrends();
    else if (state.page === 'lifts') { if (window.CX.renderLifts) window.CX.renderLifts(); }
    else if (window.CX.renderRaces) window.CX.renderRaces(); // season.js
    window.CX.rendered = true;
  }
  window.CX.render = render;
  // the helpers season.js (loaded next) reads
  window.CX.app = { $, CKC, COL, GARMIN_MAX_H, KEY_RULE_FROM, N, P, RACE_TONE, TN, TODAY, adhOf, cardState, dayN, daysTo, dsState, el, f1, fDay, fDow, fMon, fWd, hm, icon, inDays, isoN, kind, mark, milestoneInfo, mkSpan, monday, neutralChip, nextRace, now, pad2, renderRaceTile, rowsOk, ruleSpan, seasonTile, seriesFor, spaced, sportGroups, stamp, state, truthy };
  Object.assign(window.CX, { lineChart, legend, inSpan, spanStart, spanName, drawWeight, sportCol, sportTok, sportGroups, seasonTile, blockContext, kind, ck: { icon, badge, neutralChip, mark, ruleSpan, cardState, dsState },
    weekSoFar: (w) => { const d = TN - dayN(w) + 1; return d >= 1 && d < 7 ? { x: w, days: d, of: 7 } : null; } }); // the open week of a per-week bar chart
  // Check-ins due on Today (Phase 6): checkins.js renderStrip writes the due count into #t-ci's data-n, the names into
  // #t-ci-text, and shows #t-ci; the line shows the count from data-n
  { const go = $('t-ci');
    if (go) { go.addEventListener('click', () => show('checkins', true));
      // the count's mark names the coach survey rows only while there are some (with none, the count is the morning check-in alone)
      const sync = () => { const n = Number(go.dataset.n) || 0, c = $('t-ci-n'); c.textContent = String(n); $('t-ci-u').textContent = n === 1 ? 'check-in' : 'check-ins';
        if (kind('ci_survey').length) { c.setAttribute('data-source', 'coach'); c.setAttribute('data-where', 'kind=ci_survey'); } else { c.removeAttribute('data-source'); c.removeAttribute('data-where'); } };
      sync(); try { new MutationObserver(sync).observe(go, { attributes: true, attributeFilter: ['data-n'] }); } catch (e) { /* the count stays as first written */ } } }
  // The host's own light or dark toggle ([data-mode] on an ancestor, cockpit.js): repaint what reads colours in script.
  if (window.CK && window.CK.onModeChange) window.CK.onModeChange(() => { render(); if (window.CKC) window.CKC.redrawAll(true); });
  dash.onData(() => {
    render();
    if (!state.linked && ds('coach').status === 'ok') {
      state.linked = true;
      const name = location.hash.slice(1);
      if (PAGES.includes(name)) show(name, false);
      else { const t = name && document.getElementById(name); const pg = t && t.closest && t.closest('.page'); if (pg) { show(pg.id, false); t.scrollIntoView(); } }
    }
  });
})();
