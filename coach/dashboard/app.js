// app.js: tabs, drawing helpers, and the Today, Week, Fitness and Health pages; marker tiers, levels, milestones and block lines.
// The Season tab and the Week race-week card are in season.js (loaded right after this file), which reads these helpers from
// window.CX.app and registers CX.renderRaces and CX.renderRaceWeek; the other tabs' files load after it (index.html, MAINTAIN.md).
(() => {
  const { N, dayN, isoN, monday, U } = window.CX; // U: the person's units (calc.js)
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
  const state = { zoom: {}, page: 'today', bound: 'nominal', week: monday(TODAY), mode: 'hours', range: 28, race: null, open: new Set(), openDays: new Set(), openBlock: null, linked: false, vSport: 'all', vMeasure: 'time', zSport: 'all', span: (() => { try { return localStorage.getItem('cx-span') || '3m'; } catch (e) { return '3m'; } })(), fit: null, fitSport: {}, openTest: null };
  window.CX.state = state;

  const ds = (id) => dash.data(id);
  const rowsOk = (id) => { const d = dash.data(id); return d.status === 'ok' && Array.isArray(d.data) ? d.data : null; };
  // Speed (6.76.0): the coach rows are grouped by kind once per data arrival (keyed on the rows array), not scanned on every call.
  // Each call still hands back its own array, so a caller that sorts or trims it changes nothing for the next one.
  const kindIx = new WeakMap();
  const kind = (k) => { const rows = rowsOk('coach'); if (!rows) return []; let ix = kindIx.get(rows);
    // 6.77.5: marker rows are held as this page's own copies. The live runtime hands back read-only rows, and applyScales sets the
    // scale in use on each marker row, so on the phone a scale pick never took (the athlete, Nov 15: "Changing scale on tile doesnt seem to work")
    if (!ix) { ix = new Map(); for (const r0 of rows) { const r = r0 && r0.kind === 'marker' ? { ...r0 } : r0; const a = ix.get(r.kind); if (a) a.push(r); else ix.set(r.kind, [r]); } kindIx.set(rows, ix); }
    return (ix.get(k) || []).slice(); };
  // the athlete's own easy heart rates the markers are read at (coach.json hr_anchor row, coach/tools/hr_anchor.py; the athlete, Nov 14, 2026)
  const ANC = () => { const a = kind('hr_anchor')[0] || {}; const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v)); return { run: n(a.run) || 150, bike: n(a.bike) || 130, grun: n(a.guard_run) || 150, gbike: n(a.guard_bike) || 135 }; };
  const fail = (box) => { if (window.CKC) window.CKC.clear(box); box.replaceChildren(el('div', 'fail', 'Failed to load')); box.classList.remove('dash-skeleton'); };
  // coach-written plan text in plain words (Nov 15 plain reading pass): the engine writes RPE and HR (coach/engine/RULES.md
  // keeps them); the page says effort out of 10 and heart rate. An element whose text changes says so in data-derived.
  const plainCoach = (v) => String(v).replace(/\bRPE (\d+)\s*(?:-|–|to)\s*(\d+)/g, 'effort $1 to $2 of 10').replace(/\bRPE (\d+)/g, 'effort $1 of 10').replace(/\bHR guardrail\b/g, 'heart rate cap').replace(/\bHR\b/g, 'heart rate');
  const plainEl = (e) => { if (!e) return e; const t = e.textContent, p = plainCoach(t); if (p !== t || e.dataset.plain) { e.dataset.plain = '1'; e.textContent = p; e.removeAttribute('data-field'); e.setAttribute('data-derived', 'coach text in plain words (RPE as effort of 10, HR as heart rate)'); } return e; };
  const set = (id, v) => { const e = $(id); if (!e) return; delete e.dataset.plain; e.textContent = v === null || v === undefined || v === '' ? '—' : String(v); e.classList.remove('dash-skeleton'); };
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
  // Wide view switch (the athlete, Nov 15, 2026, Option 3): the page opens as the phone column; on a window wider than the column
  // the switch widens it to the earlier layout. Per computer, so it lives in this browser's storage (a convenience only).
  { const b = $('cx-wide'), root = $('cx'); if (b && root) {
    let on = false; try { on = localStorage.getItem('cx-wide') === '1'; } catch (e) { on = false; }
    const paint = () => { const can = window.innerWidth >= 700; b.hidden = !can; const w = on && can; root.classList.toggle('cx--wide', w); b.setAttribute('aria-pressed', String(w)); };
    b.addEventListener('click', () => { on = !on; try { localStorage.setItem('cx-wide', on ? '1' : '0'); } catch (e) { /* per-viewer convenience only */ } paint(); window.dispatchEvent(new Event('resize')); });
    window.addEventListener('resize', paint); paint(); } }
  { const bar = document.querySelector('.cx-tabs'); if (bar) { const edge = () => bar.classList.toggle('at-end', bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 2); bar.addEventListener('scroll', edge, { passive: true }); window.addEventListener('resize', edge); edge(); } }
  // Speed (6.76.0): a tap on the tab strip or a range answers on the next paint and draws right after it, so the phone shows
  // the tab or the range picked at once instead of after the whole tab is drawn. Several taps before that draw make one draw.
  let drawSoon = false;
  const renderSoon = () => { if (drawSoon) return; drawSoon = true; requestAnimationFrame(() => setTimeout(() => { drawSoon = false; render(); }, 0)); };
  function show(page, link, soon) {
    if (!PAGES.includes(page)) page = 'today';
    const changed = state.page !== page;
    state.page = page;
    for (const p of PAGES) {
      $(p).hidden = p !== page;
      const t = $('tab-' + p); t.setAttribute('aria-selected', String(p === page)); t.tabIndex = p === page ? 0 : -1;
    }
    if (link) dash.setLink(page);
    const place = () => { keepTabInView(page); if (changed) { const top = $('cx-top').getBoundingClientRect().top; if (top < 0) $('cx-top').scrollIntoView(); } };
    if (soon) { requestAnimationFrame(() => setTimeout(place, 0)); renderSoon(); } else { place(); render(); } // both read the layout, so a tap leaves them until after the paint
  }
  PAGES.forEach((p, i) => {
    const t = $('tab-' + p);
    t.addEventListener('click', () => show(p, true, true));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = PAGES[(i + (e.key === 'ArrowRight' ? 1 : PAGES.length - 1)) % PAGES.length]; show(n, true, true); $('tab-' + n).focus();
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
    syncSpan(); if (state.page === 'trends' || state.page === 'goals') renderSoon();
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

  // Close up and Nearby levels cut the chart to a few bands, so older values far from today leave the plot at its edge (the athlete, Nov 12, 2026: "lines went off graph in the run one").
  // Say so under the chart instead of leaving a line that seems to run off: one plain sentence, only when something is cut.
  // Close up and Nearby levels zoom on the bands around the latest value, but never cut a value off (the athlete, Nov 14, 2026, the run
  // chart): the range stretches to every value in the chosen time span, with a little air, and the bands fill what is left.
  const stretch = (r, vals) => { if (!r) return r; const v = vals.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); if (!v.length) return r;
    const a = Math.min(r[0], r[1]), b = Math.max(r[0], r[1]), lo = Math.min(...v), hi = Math.max(...v); if (lo >= a && hi <= b) return r;
    const air = (Math.max(b, hi) - Math.min(a, lo)) * 0.04; const out = [lo < a ? lo - air : a, hi > b ? hi + air : b]; return r[0] <= r[1] ? out : [out[1], out[0]]; };
  function lineChart(box, rows, o) {
    box.querySelectorAll(':scope > .seg.zoom, :scope > .ft-zoom, :scope > .ft-clipnote').forEach((n) => n.remove());
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
    const ra = $('ci-run-at'); if (ra) ra.replaceWith(Object.assign(RUN_AT(), { id: 'ci-run-at' }));
    if (window.CX.freshRender) window.CX.freshRender();
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
  // When the morning check-in runs and whether a daytime refresh exists come from the build row (6.54.0), which reads
  // coach/ops/data_paths.json: its morning_checkin "at" (7:45 AM when absent) and whether it has a daytime_refresh row.
  const sched = () => { const b = kind('build')[0] || {}; const at = /^\d{1,2}:\d{2} [AP]M$/.test(b.checkin_at || '') ? b.checkin_at : '7:45 AM'; const [h, m] = at.split(/[: ]/).map(Number); return { at, min: (h % 12 + (at.endsWith('PM') ? 12 : 0)) * 60 + m, refresh: b.daytime_refresh !== false }; };
  window.CX.sched = sched;
  const clockAt = (x) => `${Math.floor(x / 60) % 12 || 12}:${String(x % 60).padStart(2, '0')} ${x >= 720 ? 'PM' : 'AM'}`;
  const RUN_AT = () => ruleSpan(sched().at.replace(' AM', ''), 'coach/ops/data_paths.json morning_checkin: ' + sched().at);
  window.CX.runAt = RUN_AT;
  // minutes after midnight: past this, a missing check-in reads Missed. With a daytime refresh it is that task's first
  // run, 9:41 AM (data_paths morning_checkin fallback); without one, two hours after the check-in's own time.
  const missedAt = () => (sched().refresh ? 9 * 60 + 41 : Math.min(sched().min + 120, 23 * 60 + 59));
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

  // Skills read-out (the athlete, Nov 14, 2026: "read like skills being monitored in a rpg video game developed in 2060", card option A
  // "Skill panel"). Every marker that moved in the last 7 days is a skill: LV = its band counted up from the bottom of its own
  // ladder (levelOf, the one home for a level number), the band name as its rank, and an XP bar toward the NEXT level (the share
  // of the current band already covered toward its better edge). This week's gain inside the same band is the green sliver.
  // Plain words (the athlete, Nov 14, 2026: the game is an analogy for look and feel only, "still a fitness platform"): Level, never LV or XP.
  // A tag says what happened: Level up, +N% to next, −N% to next or −N levels, and the right-hand figure says how far it is to the next LV.
  function standingOf(m, v) {
    const ts = tiersOf(m); const band = ts.find((t) => inTier(t, v)) || null;
    const pct = band ? pctThrough(m, band, v).pct : null;
    return { band, pct, sub: subtiersOf(m).find((t) => inTier(t, v)) || null };
  }
  // the ladder worst first: higher-is-better ladders by their low edge, lower-is-better by their high edge (open ends at the bottom)
  function ladderOf(m) {
    const better = Number(m.better) || 1; const ts = tiersOf(m).slice();
    return better === 1 ? ts.sort((a, b) => (a.lo === null ? -Infinity : a.lo) - (b.lo === null ? -Infinity : b.lo)) : ts.sort((a, b) => (b.hi === null ? Infinity : b.hi) - (a.hi === null ? Infinity : a.hi));
  }
  // LV for a value: { n (1 = bottom band), max, band, pct toward the next LV, next band, edge to cross, toNext distance }
  function levelOf(m, v) {
    if (v === null || v === undefined || !m.tiers) return null;
    const lad = ladderOf(m); const i = lad.findIndex((t) => inTier(t, v)); if (i < 0) return null;
    const better = Number(m.better) || 1; const band = lad[i], next = lad[i + 1] || null; const edge = next ? (better === 1 ? band.hi : band.lo) : null;
    return { n: i + 1, max: lad.length, band, pct: pctThrough(m, band, v).pct, next, edge, toNext: edge === null ? null : Math.abs(edge - v) };
  }
  function seriesFor(m) {
    let rows = kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }));
    if (['consistency', 'strength', 'sauna'].includes(m.key)) { const full = rows.filter((r) => !/so far/.test(String(r.extra || ''))); rows = full.map((r, i) => ({ date: r.date, value: avgOf(full.slice(Math.max(0, i - 3), i + 1).map((x) => x.value)) })); }
    return rows;
  }
  // the performance stage of the scale a marker is read on (stageInfo: 1 everyone, 2 your race or sport, 3 elite); null when the
  // marker has one scale only (a coach guide, a Health marker), which then reads a plain LV
  const stageOf = (m) => { try { return stageInfo(m.key); } catch (e) { return null; } };
  const SKILL_ICON = (k) => (/^swim/.test(k) ? 'swim' : /^(bike|ftp|wkg|p1|p5|p20|p60|t20k|t40k|t90k|t100k|vo2bike)$/.test(k) ? 'bike' : /^(run|5k|mile|10k|half|marathon|aerobic|durability)$/.test(k) || /^(trail|climb)/.test(k) ? 'run' : k === 'sleepreg' ? 'sleep' : k === 'rhr' || k === 'vo2' || k === 'le8' ? 'hr' : k === 'strength' || k === 'lifts' ? 'strength' : k === 'sauna' ? 'sauna' : k === 'consistency' ? 'streak' : 'badge');
  function skillTag(cls, text) { const t = el('span', 'td-sk-tag ' + cls, text); return t; }
  function progressItem(m, prev, last) {
    const a = levelOf(m, prev.value), b = levelOf(m, last.value); if (!b) return null; const vf = valFmt(m), df = deltaFmt(m); const better = Number(m.better) || 1;
    const improved = better === 1 ? last.value > prev.value : last.value < prev.value; if (last.value === prev.value) return null;
    const dLv = a ? b.n - a.n : 0; const dp = a && dLv === 0 ? Math.round((b.pct - a.pct) * 100) : null;
    if (dLv === 0 && dp === 0) return null;
    const item = el('div', 'td-sk'); mark(item, 'coach', null, m.key && kind('mpt').some((q) => q.key === m.key) ? 'kind=mpt&key=' + m.key : null, 'progress');
    const r1 = el('div', 'td-sk-r1'); const ic = el('span', 'td-sk-ic'); ic.append(icon(SKILL_ICON(m.key)));
    const nm = el('span', 'td-sk-nm'); nm.append(el('b', null, m.label), el('span', 'ck-sub', `${stageOf(m) ? stageOf(m).label + ' · ' : ''}${vf(last.value)}`)); // the level name is in the chip beside it
    // Game look pass (the athlete, Nov 14, 2026, pick 2 "blend of current and option 1"): the row keeps the icon, name and value line, and
    // the right side and the bar are the Fitness tile's own parts: the stage discs beside the level name chip, and the step bar
    // inside the level (levelBadge, stageChip, withStage), so one skill reads the same on Today and on Fitness
    const lvTxt = (n) => { const t = ladderOf(m)[n - 1]; return t && /^(Top|Bottom) /.test(t.label) ? t.label : 'the next level'; }; // a rank reads as a place ("Bottom 20%"); other ladder names ("At the reference") read oddly after "to"
    const parts = withStage(levelBadge(levelFor(m, last.value), m.key), stageChip(m));
    const lv = el('span', 'td-sk-lv'); const steps = parts.querySelector ? parts.querySelector('.ft-steps, .ft-meter') : null; if (steps) steps.remove();
    lv.append(parts); nm.append(lv); r1.append(ic, nm); item.append(r1); // under the name, so a long skill name keeps one line
    if (steps) { steps.classList.add('td-sk-steps'); item.append(steps);
      // the part gained (filled green) or lost (outlined) since the start of the 7 days, drawn on the same steps when both readings
      // sit in the same level; a level change says so in the tag instead
      const lp = levelFor(m, prev.value), ln = levelFor(m, last.value);
      if (lp && ln && lp.label === ln.label && lp.of === ln.of && lp.pct !== null && ln.pct !== null) {
        item.classList.add('has-delta'); const at = (lv) => (lv.step - 1 + lv.pct) / lv.of; const x0 = at(lp), x1 = at(ln); const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        [...steps.children].forEach((sg, i) => { const a = Math.max(lo, i / ln.of), b2 = Math.min(hi, (i + 1) / ln.of); if (b2 <= a) return;
          const d = el('b', x1 >= x0 ? 'td-sk-gain' : 'td-sk-loss'); d.style.left = `${(a * ln.of - i) * 100}%`; d.style.width = `${(b2 - a) * ln.of * 100}%`; d.setAttribute('aria-hidden', 'true'); sg.append(d); });
      } }
    { const spk = SKILL_ICON(m.key); if (['bike', 'run', 'swim'].includes(spk)) item.dataset.sport = sportTok(spk); } // the step bar in the sport colour, as on the tile
    const r3 = el('div', 'td-sk-r3'); const what = el('span');
    if (dLv > 0) what.append(skillTag('up', dLv === 1 ? 'Level up' : `+${dLv} levels`));
    else if (dLv < 0) what.append(skillTag('dn', (dLv === -1 ? '−1 level' : `−${-dLv} levels`)));
    else what.append(skillTag(dp > 0 ? 'up' : 'dn', `${dp > 0 ? '+' : '−'}${Math.abs(dp)}% of a level`)); // plain reading (6.47.0): "to next" read as what is left
    const word = m.key === 'swim' || RT(m.key) || m.key === 'run' || m.key === 'trailgap' ? (improved ? 'faster' : 'slower') : m.key === 'sleepreg' ? (improved ? 'steadier' : 'less steady') : (last.value > prev.value ? 'up' : 'down'); // the word follows the value, the colour follows better or worse
    const dtx = df(Math.abs(last.value - prev.value)); const ch = el('span', improved ? 'td-up' : 'td-down', /^0(\D|$)/.test(dtx) ? `slightly ${word}` : `${dtx} ${word}`); what.append(ch);
    const nx = el('span', 'td-sk-next'); nx.append(b.next ? `${df(Math.max(b.toNext, 0))} to ${lvTxt(b.n + 1)}` : 'Top level');
    r3.append(what, nx); item.append(r3);
    { const was = el('p', 'ck-sub td-sk-was'); was.append(`Was ${vf(prev.value)}${a ? ` (${a.band.label})` : ''} on ${fDay(P(prev.date))}, now ${vf(last.value)}.`); item.append(was); } // visible: where the 7 days began
    item.dataset.mag = String((improved ? 1000 : 0) + (dLv ? 100 * Math.abs(dLv) : Math.abs(dp || 0))); // gains first, the biggest move first within each
    return item;
  }
  // the skills to read: every laddered marker plus the page-calculated run pace at 150 and bike power at 130
  function skillSeries() {
    const out = [];
    for (const m of kind('marker').filter((x) => x.tiers && x.chart && x.section !== 'calc' && !x.quiet)) out.push({ m, rows: seriesFor(m) }); // quiet: the same series climbs another marker's ladder (Health vo2 and Fitness aerobic)
    const fit = rowsOk('fitness');
    if (fit) for (const k of ['run', 'bike']) {
      const bc = blockContext(k, fit.filter((r) => r.marker === k && N(r.avg28) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) }))); if (!bc || !tiersOf(bc.cm).length) continue;
      out.push({ m: bc.cm, rows: bc.full, bc });
    }
    return out;
  }
  function renderProgress() {
    const box = $('t-progress'), list = $('t-progress-list'); if (!box) return;
    const items = [];
    for (const { m, rows } of skillSeries()) {
      if (rows.length < 2) continue; const last = rows[rows.length - 1];
      // where you stood when the 7 days began (the athlete, Nov 15, 2026: "see where you were before these past seven days"): the last
      // reading on or before that day, else the one before the latest
      const before = rows.slice(0, -1).filter((r) => dayN(r.date) <= TN - 7); const prev = before.length ? before[before.length - 1] : rows[rows.length - 2];
      if (dayN(last.date) <= TN - 7) continue; const it = progressItem(m, prev, last); if (it) items.push(it);
    }
    items.sort((x, y) => Number(y.dataset.mag) - Number(x.dataset.mag));
    list.replaceChildren(...items); box.hidden = !items.length;
    const n = $('t-progress-n'); if (n) n.textContent = `${items.length} changed`;
  }
  // Level ups (the athlete, Nov 14, 2026: "when you open up the app after level up, there should be some kind of badge or ribbon.
  // Congratulations."): a skill reaching a new LV (a band first crossed in the last 7 days and still held), a stage up or a block
  // goal (Target, Strong). renderKudos below shows them as the gold level up moment; the seen list is per device plus the store
  // (metrics.js), and the Skills card keeps its Level up tag for the 7 days. markers.py kudos follow the same rule for the
  // morning message (RUNBOOK 2b).
  function levelUps() {
    const out = [];
    for (const { m, rows, bc } of skillSeries()) {
      if (!rows.length) continue; const better = Number(m.better) || 1; const beyond = (v, e) => (better === 1 ? v >= e : v <= e); const latest = rows[rows.length - 1].value;
      const lad = ladderOf(m); const now = levelOf(m, latest);
      for (const [i, t] of lad.entries()) {
        if (i === 0) continue; const e = better === 1 ? t.lo : t.hi; if (e === null || e === undefined) continue;
        const first = rows.find((r) => beyond(r.value, e)); if (!first || dayN(first.date) <= TN - 7 || !beyond(latest, e)) continue;
        const before = rows.filter((r) => r.date < first.date); if (!before.length) continue; // a first reading is a start, not a level up
        const sg = stageOf(m); const lt = (n) => (sg ? `level ${sg.cur}-${n}` : `level ${n}`);
        out.push({ id: `${m.key}|${t.label}|${first.date}`, key: m.key, label: m.label, lv: i + 1, lvTxt: lt(i + 1), rank: t.label, nextName: now && now.next && now.n === i + 1 ? now.next.label : '', date: first.date, top: now && now.n === i + 1, next: now && now.next && now.n === i + 1 ? `${deltaFmt(m)(Math.max(now.toNext, 0))} to ${lt(now.n + 1)}` : '' });
      }
      if (bc && bc.goal && bc.goal.target !== null) { // block goal: first day inside the block at or past Target / Strong, still held
        for (const [lab, e] of [['Target', bc.goal.target], ['Strong', bc.goal.strong]]) { if (e === null) continue; const first = bc.series.find((r) => beyond(r.value, e)); if (first && dayN(first.date) > TN - 7 && beyond(bc.goal.latest, e)) out.push({ id: `${m.key}|goal-${lab}|${first.date}`, key: m.key, label: m.label, goal: `${lab} ${valFmt(m)(e)}`, block: bc.goal.block, date: first.date, top: true }); }
      }
    }
    for (const [tile, st] of stateOf) { // stage ups (the athlete, Nov 14, 2026): a stage reached in the last 7 days and still in use
      const au = st.auto; if (st.manual || !au.promoted || dayN(au.promoted) <= TN - 7 || au.cur < 2 || au.graceEnd) continue; const m = kind('marker').find((x) => x.key === tile); if (!m) continue;
      out.push({ id: `${tile}|stage-${au.cur}|${au.promoted}`, key: tile, label: m.label, stage: au.cur, scale: au.scale.label, date: au.promoted, goal: null });
    }
    // one entry per skill: its highest new LV (a jump of two shows once, as the higher LV), goals after levels
    const best = new Map(); for (const u of out) { if (u.goal || u.stage) continue; const b = best.get(u.key); if (!b || u.lv > b.lv) best.set(u.key, u); }
    const byDate = (x, y) => (x.date < y.date ? 1 : -1); return [...out.filter((u) => u.stage).sort(byDate), ...[...best.values()].sort(byDate), ...out.filter((u) => u.goal).sort(byDate)];
  }
  const lvSeen = () => { let loc = []; try { loc = JSON.parse(localStorage.getItem('cx-lvseen') || '[]') || []; } catch (e) { loc = []; } return [...new Set([...loc, ...(window.CX.lvSeenShared ? window.CX.lvSeenShared() : [])])]; }; // this device's and the store's (metrics.js)
  // Level up moment (6.48.0). the athlete, Nov 14, 2026, picked S2 "Lean" from the gold full screen takes (options pages
  // (link not included in the kit), then (link not included in the kit), then
  // (link not included in the kit), picked from (link not included in the kit)). It replaces the green
  // ribbon. The first open after a win shows one gold screen per skill, always in the same order (the standard he asked for):
  // gold rings with the new number, the win in words, the skill with what it measures, the stage path (or the level steps), one
  // sentence on why, the activity that earned it ("attach the achievement to the activity that pushed"), the button. A block goal
  // reached on the same skill rides along as one line. "Thanks, coach" files that screen as seen on every device and opens the next.
  const SKILL_MEAN = { bike: 'Watts at an easy heart rate', run: 'Pace at a steady heart rate', ftp: 'Power you can hold for about an hour', swim: 'Swim pace', vo2: 'Cardio fitness', aerobic: 'Cardio fitness', rhr: 'Resting heart rate, lower is fitter', consistency: 'Weeks with 3 or more training days', strength: 'Strength sessions a week', sleepreg: 'How steady your bedtime is' };
  const SKILL_AREA = { bike: 'Bike', run: 'Run', swim: 'Swim', hr: 'Health', strength: 'Strength', streak: 'Habits', sleep: 'Sleep', sauna: 'Recovery' };
  const GARMIN_ACT = (id) => `https://connect.garmin.com/modern/activity/${encodeURIComponent(id)}`;
  // the session that pushed the skill over: the run or Zwift ride behind the page's own run and bike markers on that day, else the
  // longest activity of the skill's sport that day; Health and habit skills have none
  function earnedOf(u) {
    const sp = SKILL_ICON(u.key); const fw = (d) => (dayN(d) > TN - 7 ? d3.utcFormat('%A')(P(d)) + "'s" : `the ${fDay(P(d))}`);
    if (u.key === 'run' || u.key === 'bike') {
      const r = (rowsOk('fitness') || []).filter((x) => x.marker === u.key && x.date === u.date).pop(); if (!r) return null;
      const what = u.key === 'bike' ? (/zwift/i.test(r.name) ? 'Zwift ride' : 'ride') : 'run';
      return { id: r.id, text: `${fw(r.date)} ${what}`, aria: u.key === 'bike' ? `${r.minutes} minutes, ${Math.round(r.raw)} watts at ${Math.round(r.hr)} beats per minute` : `${r.miles} miles at ${Math.round(r.hr)} beats per minute` };
    }
    if (!['bike', 'run', 'swim'].includes(sp)) return null;
    const re = { bike: /ride|cycl|bik/, run: /run/, swim: /swim/ }[sp];
    const a = (rowsOk('activities') || []).filter((x) => String(x.local_start || '').slice(0, 10) === u.date && re.test(String(x.type || '').toLowerCase())).sort((x, y) => (N(y.duration_min) || 0) - (N(x.duration_min) || 0))[0];
    return a ? { id: String(a.activity_id), text: `${fw(u.date)} ${{ bike: 'ride', run: 'run', swim: 'swim' }[sp]}`, aria: String(a.name || '') } : null;
  }
  // one screen per skill: its stage up first, else its new level, else its goal; the skill's goal rides along
  function lvGroups(ups) {
    const by = new Map(); for (const u of ups) { if (!by.has(u.key)) by.set(u.key, []); by.get(u.key).push(u); }
    return [...by.values()].map((g) => { const main = g.find((u) => u.stage) || g.find((u) => !u.goal) || g[0]; return { main, goals: g.filter((u) => u.goal && u !== main), ids: g.map((u) => u.id) }; });
  }
  function lvPath(u) { // the stages (a stage up) or the level before, the new one and the next (a level up), in the Map's language
    const m = kind('marker').find((x) => x.key === u.key); if (!m || (u.goal && !u.stage)) return null; let nodes = [];
    if (u.stage) {
      const sc = scaleSort(scalesOf(m)); const st = [...new Set(sc.map(stageNo))].sort((a, b) => a - b); if (!st.includes(3)) st.push(3); // the Map shows Elite even before a scale is on file
      nodes = st.map((n) => { const s0 = sc.find((x) => stageNo(x) === n); const who = !s0 ? 'best in sport' : /^General population$/i.test(s0.label || '') ? 'everyone' : String(s0.short || s0.label || '').replace(/^IRONMAN /, '');
        return { n: String(n), name: (s0 && s0.stage_label) || (n === 3 ? 'Elite' : `Stage ${n}`), who, s: n < u.stage ? 'done' : n === u.stage ? 'new' : 'lock' }; });
    } else { const lad = ladderOf(m); const sg = stageOf(m); const nm = (i) => String(i + 1); /* the level alone (the athlete, Nov 15); the stage is named in the ring */ void sg;
      nodes = [u.lv - 2, u.lv - 1, u.lv].filter((i) => i >= 0 && i < lad.length).map((i) => ({ n: nm(i), name: lad[i].label, who: '', s: i < u.lv - 1 ? 'done' : i === u.lv - 1 ? 'new' : 'lock' })); }
    if (nodes.length < 2) return null;
    const ol = el('ol', 'td-lvp'); ol.setAttribute('aria-label', nodes.map((x) => `${u.stage ? 'Stage ' : 'Level '}${x.n}, ${x.name}${x.who ? ', ' + x.who : ''}, ${x.s === 'done' ? 'reached' : x.s === 'new' ? 'new' : 'next'}`).join('; '));
    nodes.forEach((x, i) => { const li = el('li', 'td-lvp-n is-' + x.s); li.setAttribute('aria-hidden', 'true'); li.append(el('span', 'td-lvp-d', x.n), el('span', 'td-lvp-l', x.name)); if (x.who) li.append(el('small', 'td-lvp-w', x.who)); if (i) ol.append(el('li', 'td-lvp-k' + (x.s === 'lock' ? '' : ' is-on'))); ol.append(li); });
    return ol;
  }
  function lvWhy(u) { // one sentence: what earned it and what comes next
    if (u.stage) {
      const sm = kind('marker').find((x) => x.key === u.key); const below = sm ? scaleSort(scalesOf(sm)).filter((x) => stageNo(x) < u.stage).pop() : null;
      const ranked = below && tiersOf({ tiers: below.tiers }).some((x) => /^(Top|Bottom) /.test(x.label)); const who = below ? String(below.label || '').replace(/^General population$/i, 'everyone') : '';
      const p = el('p', 'td-lvx-why'); p.append(below ? (ranked ? `Top 20% of ${who}. ` : `Best level on the ${below.label} scale. `) : '', 'Now you climb among ', el('b', null, String(u.scale || '').replace(/^IRONMAN /, '')), '.'); return p;
    }
    if (u.goal) { const p = el('p', 'td-lvx-why'); p.append('You reached ', el('b', null, u.goal), ` in your ${u.block} block.`); return p; }
    const p = el('p', 'td-lvx-why'); const nx = u.next ? (u.nextName ? u.next.replace(/level \d+-\d+|level \d+/, u.nextName) : u.next.replace(/level \d+-(\d+)/, 'level $1')) : ''; /* the athlete, Nov 15: say level once (the heading) */ p.append(el('b', null, u.rank), '. ', nx ? nx.charAt(0).toUpperCase() + nx.slice(1) + '.' : 'That is the top level.'); return p;
  }
  let lvOpen = null; // the screen showing now: { ids, prev focus }
  function renderKudos() {
    const box = $('t-lvup'); if (!box || document.documentElement.dataset.lvx === 'off') return; // harness/build.py sets lvx off (the screen covers Today) unless --lvx
    if (!window.CX.lvReady) return; // 6.77.4: not before metrics.js has the store's seen list
    const seen = new Set(lvSeen()); const groups = lvGroups(levelUps().filter((u) => !seen.has(u.id)));
    if (!groups.length) { box.hidden = true; box.replaceChildren(); if (lvOpen) { document.documentElement.classList.remove('td-lvx-on'); lvOpen = null; } return; }
    const g = groups[0]; if (lvOpen && lvOpen.ids.join() === g.ids.join() && !box.hidden) return; // a re-render keeps the screen as it is
    const u = g.main; const lvSt = (/^level (\d+)-/.exec(u.lvTxt || '') || [])[1]; // the athlete, Nov 15: no "1-4" on this screen; the level alone, the stage in words
    const num = u.stage ? String(u.stage) : u.goal ? '✓' : String(u.lv || String(u.lvTxt || '').replace(/^level /, ''));
    const card = el('div', 'td-lvx-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 't-lvx-h'); card.setAttribute('aria-describedby', 't-lvx-d');
    mark(card, 'coach', null, null, 'level-up');
    const rings = el('div', 'td-lvx-rings' + (num.length > 2 ? ' is-long' : '') + (u.goal && !u.stage ? '' : ' no-cap')); rings.setAttribute('aria-hidden', 'true');
    rings.append(el('span', 'td-lvx-r r3'), el('span', 'td-lvx-r r2'), el('span', 'td-lvx-r r1'), el('span', 'td-lvx-wave'), el('span', 'td-lvx-wave w2'), el('b', 'td-lvx-num', num), ...(u.goal && !u.stage ? [el('small', 'td-lvx-cap', 'Goal')] : [])); // a level up: the number alone (the athlete, Nov 15: "level" said once, in the heading)
    const h = el('h2', 'td-lvx-h', u.stage ? `Stage ${u.stage} unlocked!` : u.goal ? 'Block goal reached!' : 'Level up!'); h.id = 't-lvx-h';
    const sk = el('div', 'td-lvx-sk'); const ic = el('span', 'td-lvx-ic'); ic.append(icon(SKILL_ICON(u.key))); sk.append(ic, el('b', null, u.label));
    const area = SKILL_AREA[SKILL_ICON(u.key)]; const mean = SKILL_MEAN[u.key]; const stW = !u.stage && !u.goal && lvSt ? `Stage ${lvSt}` : ''; const sm = (mean || area || stW) ? el('p', 'td-lvx-mean', [mean, area, stW].filter(Boolean).join(' · ')) : null;
    const why = lvWhy(u); why.id = 't-lvx-d'; const path = lvPath(u);
    card.append(rings, h, sk, ...(sm ? [sm] : []), ...(path ? [path] : []), why);
    const ea = earnedOf(u);
    if (ea) { const a = el('a', 'td-lvx-earn'); a.href = GARMIN_ACT(ea.id); a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('aria-label', `Earned on ${ea.text}: ${ea.aria}. Open it in Garmin Connect`);
      a.append(icon(SKILL_ICON(u.key)), el('span', null, 'Earned on '), el('b', null, ea.text), el('span', 'td-lvx-go', 'Open')); card.append(a); }
    const btn = el('button', 'td-lvx-ok', 'Thanks, coach'); btn.type = 'button'; card.append(btn);
    for (const gl of g.goals) { const p = el('p', 'td-lvx-also'); const t = el('i', null, '✓'); t.setAttribute('aria-hidden', 'true'); p.append(t, `Also reached your block goal: ${gl.goal}`); card.append(p); }
    if (groups.length > 1) card.append(el('p', 'td-lvx-more', `1 of ${groups.length} wins`));
    const conf = el('div', 'td-lvx-conf'); conf.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 30; i++) { const c = el('i'); c.style.left = `${(i * 37) % 97 + 1}%`; c.style.animationDelay = `${0.5 + ((i * 13) % 10) / 10}s`; c.style.setProperty('--y', `${105 + ((i * 7) % 25)}vh`); c.style.setProperty('--c', ['var(--ck-gold-ring)', 'var(--ck-gold-hi)', 'var(--ck-gold)'][i % 3]); conf.append(c); }
    const prev = lvOpen ? lvOpen.prev : document.activeElement;
    box.classList.toggle('is-level', !u.stage && !u.goal); // the athlete, Nov 15: silver for a level up, gold (and confetti) only for a stage or a goal
    box.replaceChildren(conf, card); box.hidden = false; document.documentElement.classList.add('td-lvx-on'); lvOpen = { ids: g.ids, prev };
    const done = () => {
      const s = lvSeen(); for (const id of g.ids) if (!s.includes(id)) s.push(id);
      try { localStorage.setItem('cx-lvseen', JSON.stringify(s.slice(-200))); } catch (e) { /* the store copy below still saves */ }
      // 6.77.2: a store error can never keep the screen open (the athlete, Nov 15: "the Thanks coach button does not work"); the
      // seen list is in page memory either way, so the screen closes first and the store save follows on its own
      try { if (window.CX.saveLvSeen) window.CX.saveLvSeen(g.ids); } catch (e) { /* kept on this device; the next open saves again */ }
      if (groups.length > 1) { renderKudos(); return; }
      box.hidden = true; box.replaceChildren(); document.documentElement.classList.remove('td-lvx-on'); const back = lvOpen && lvOpen.prev; lvOpen = null;
      const ph = $('t-progress-h'); const to = back && document.contains(back) && back !== document.body ? back : ph; if (to) { if (to === ph) to.setAttribute('tabindex', '-1'); to.focus(); }
    };
    btn.addEventListener('click', done);
    box.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(); return; } if (e.key !== 'Tab') return; const f = [...card.querySelectorAll('a[href], button')]; const i = f.indexOf(document.activeElement); if (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1)) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); } };
    card.tabIndex = -1; requestAnimationFrame(() => card.focus({ preventScroll: true })); // the screen reader starts at the heading; Tab reaches Open and the button
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
    const wv = rowsOk('week_view'); if (!wv) return null; const w0 = dayN(monday(TODAY)), r0 = dayN(monday(keyFrom()));
    const at = (k) => weekAdh(isoN(w0 - 7 * k), wv); const l4 = [3, 2, 1, 0].map(at), sum = (f) => l4.reduce((t, w) => t + w[f], 0);
    const n = Math.max(1, Math.min(8, Math.floor((w0 - r0) / 7) + 1)); // weeks since the rule started, this week included
    const strip = Array.from({ length: n }, (_, i) => at(n - 1 - i)), kw = strip.slice(-4), ks = (f) => kw.reduce((t, w) => t + w[f], 0);
    return { strip, now: l4[3], k4: ks('kDone'), kN4: ks('kN'), k4w: kw.length, s4: sum('sDone'), sN4: sum('sN') };
  }
  function adhStrip(weeks) {
    const n = weeks.length, from = fDay(P(keyFrom())), ol = el('ol', 'td-adh-strip'); ol.style.setProperty('--n', n);
    ol.setAttribute('aria-label', n === 1 ? `Key sessions done this week, the first week of three a week (since ${from})` : `Key sessions done each week, ${weeks[0].wk === monday(keyFrom()) ? `since ${from}, ${n} weeks` : `the last ${n} weeks`}, this week last`);
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
    if (window.CX.renderPlanCard) { window.CX.renderPlanCard(); return; } // plan.js (Nov 11, 2026): key sessions and the three outcomes in one grid
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
  // plain reading (6.47.0): what each call means, in the words of RULES 3, 13 and the pain ladder, read by a first-time user
  const READY_MEAN = { GREEN: 'Train as planned', YELLOW: 'Ease off: the shorter or easier size is the smart pick', RED: 'Stop the planned stress today' };
  const CALL_WORD = { push: 'Go for more', hold: 'Keep to the plan', restrain: 'Back off' };
  function renderToday() {
    applyScales(); // stages first, so Skills and the ribbon read the stage in use
    renderKudos(); renderProgress(); renderAdh(); if (window.CX.renderAsk) window.CX.renderAsk();
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
      { const cw = CALL_WORD[String(t.call || '').toLowerCase()]; if (cw) { $('t-call').textContent = cw; $('t-call').removeAttribute('data-field'); $('t-call').setAttribute('data-derived', 'call in plain words'); $('t-call').setAttribute('data-rule', 'app.js CALL_WORD: push, hold, restrain (RULES 13)'); } }
      { const rm = $('t-ready-m'); if (rm) { const w = READY_MEAN[String(t.readiness || '').toUpperCase()]; rm.textContent = w || ''; rm.hidden = !w; } }
      { const dq = $('t-dq'); if (dq && /\d{1,2}:\d{2}Z/.test(dq.textContent)) { dq.textContent = dq.textContent.replace(/(\d{1,2}):(\d{2})Z/g, (x, h, mi) => { const lt = new Date(`${TODAY}T${String(h).padStart(2, '0')}:${mi}:00Z`); return Number.isNaN(lt.getTime()) ? x : lt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }); dq.removeAttribute('data-field'); dq.setAttribute('data-derived', 'data_quality with UTC times shown in local time'); } }
      set('t-title', noTime(t.workout_title)); $('t-title').removeAttribute('data-field'); $('t-title').setAttribute('data-derived', 'workout_title without its time'); set('t-purpose', t.purpose); set('t-b-nominal', t.nominal); set('t-b-upper', t.upper); set('t-b-fallback', t.fallback); set('t-rule', t.choice_rule); ['t-purpose', 't-b-nominal', 't-b-upper', 't-b-fallback', 't-rule'].forEach((id) => plainEl($(id))); set('t-q', t.question);
      const stale = t.date !== TODAY;
      // stale: the banner above the call says so and how old the check-in is; the call below keeps full contrast
      $('t-stale').hidden = !stale; $('t-hero').classList.toggle('is-stale', stale);
      // missed (6.27.1, the athlete chose the same-day safety net Nov 12, 2026): from 9:41 AM, the first daytime refresh, a missing
      // check-in is a red Missed line with what to do, so a morning that never ran is seen the same day. It needs no task.
      const missed = stale && now.getHours() * 60 + now.getMinutes() >= missedAt();
      if (missed) $('t-stale').dataset.s = 'act'; else delete $('t-stale').dataset.s; $('t-stale-w').textContent = missed ? 'Missed' : 'Out of date';
      if (stale) { const st = $('t-stale-t'); st.replaceChildren(); if (!missed) st.append(`This is ${fDow(P(t.date))}'s check-in. Today's arrives after the `, RUN_AT(), ' run.'); else st.append('No check-in today: the ', RUN_AT(), ` run has not landed by `, ruleSpan(clockAt(missedAt()), 'app.js missedAt: the first daytime refresh, 9:41 AM (data_paths daytime_refresh), or two hours after the check-in when there is none'), `. Ask the coach in a chat for today's call. This is ${fDow(P(t.date))}'s.`); $('t-stale-age').textContent = t.generated_at_utc ? `Check-in ${stamp(t.generated_at_utc)}.` : ''; }
      const box = $('t-planned'); box.replaceChildren();
      const todays = kind('day').filter((r) => r.date === TODAY).sort((a, b) => (a.order || 0) - (b.order || 0));
      // week-plan state (Phase 6 round 3, the athlete: the size control and Help me pick every day): before today's check-in the tile
      // shows the week plan for today; its first day row drives Fallback / Plan / Strong day and their size texts, its details
      // go in Help me pick, and yesterday's purpose, choice rule and question stay out. A rest day has no sizes.
      const usePlan = stale && todays.length > 0, pd = usePlan ? todays[0] : null, pdw = pd ? `kind=day&date=${pd.date}&order=${pd.order}` : null;
      const sized = !pd || pd.type !== 'rest', det = $('t-pdet'); det.replaceChildren(); det.hidden = !usePlan;
      box.hidden = !usePlan; $('t-presc-a').hidden = usePlan; $('t-presc-b').hidden = !sized; $('t-presc-s').hidden = !sized; $('t-purpose').hidden = usePlan || !t.purpose; $('t-rule').hidden = usePlan || !t.choice_rule;
      state.usePlan = usePlan; state.sized = sized;
      state.from = usePlan || !stale ? '' : `From ${fWd(P(t.date))}'s check-in`;
      if (usePlan) {
        for (const r of todays) {
          const w = `kind=day&date=${r.date}&order=${r.order}`;
          box.append(mark(el('h3', 'ck-session-title', noTime(r.title)), 'coach', null, w, 'title without its time'));
          if (r.detail) det.append(plainEl(mark(el('p', 'ck-session-text', r.detail), 'coach', 'detail', w)));
        }
      }
      $('t-ask').hidden = !t.question || usePlan; // Coach asks only from today's check-in
      // the size texts (More info): the check-in's (kind=today); in the week-plan state the day row's details stand in, and a size
      // the row leaves blank is disabled
      for (const [k, f] of [['nominal', 'minutes'], ['upper', 'upper_minutes'], ['fallback', 'fallback_minutes']]) {
        document.querySelector(`#t-bounds input[value=${k}]`).disabled = !!pd && N(pd[f]) === null;
        const sp = $('t-b-' + k); sp.removeAttribute('data-derived'); mark(sp, 'coach', k, 'kind=today'); plainEl(sp);
      }
      // the session's minutes, sport and the minutes of each size, from the week plan row of the session's day
      const pr = (rowsOk('week_view') || []).find((r) => r.date === t.date && r.kind === 'plan' && Number(r.order) === 1) || null;
      const pw = pr ? `kind=day&date=${pr.date}&order=${pr.order}` : null; // marks name the coach day row week_view copies these from
      // the big minutes figure left the tile in 6.39.0: the size control carries every size in hours and minutes
      const sm = $('t-sess-min'); sm.replaceChildren(); sm.hidden = true;
      // the sport as one icon at the top right (6.39.0, the athlete's markup), its name read aloud; from the week plan row or the session's plan row
      const sr = pd || pr, srw = pd ? pdw : pw;
      const sp = $('t-sport'); sp.replaceChildren(); sp.hidden = !sr || sr.type === 'rest'; sp.classList.add('td-sport');
      if (!sp.hidden) sp.append(sportIcon(sr.type), mark(el('span', 'ck-vh', String(sr.type)), 'coach', 'type', srw)); // the Week tab's sport glyph and colour
      state.sizeRow = pd || (pr ? kind('day').filter((r) => r.date === pr.date).sort((a, b) => (a.order || 0) - (b.order || 0))[0] || null : null);
      state.sizePlan = pd ? { row: pd, w: pdw } : pr ? { row: pr, w: pw } : null;
      coachCall(t, stale);
      for (const [k, f] of [['fallback', 'fallback_minutes'], ['nominal', 'minutes'], ['upper', 'upper_minutes']]) {
        const sub = $('t-bm-' + k); sub.replaceChildren(); const v = pd ? N(pd[f]) : pr ? N(pr[f]) : null;
        if (v !== null) sub.append(mark(el('span', null, hmin(v)), 'coach', null, pd ? pdw : pw, 'h:mm of ' + f)); else if (pd) sub.append('not set');
      }
    }
    const keyToday = kind('day').filter((r) => r.date === TODAY && (r.key === true || r.key === 'true' || N(r.pillar) !== null));
    state.keyN = keyToday.length ? (N(keyToday[0].pillar) !== null ? `Key ${N(keyToday[0].pillar)} of 3` : 'Key session') : '';
    renderPath();
    const doneBox = $('t-done'); doneBox.replaceChildren();
    const doneToday = (rowsOk('week_view') || []).filter((r) => r.date === TODAY && r.done_text);
    doneBox.hidden = !doneToday.length;
    if (doneToday.length) {
      const dw = el('span', 'ck-notice-w'); dw.append(icon('check'), 'Done today'); doneBox.append(dw);
      for (const r of doneToday) {
        const fl = String(r.flags || '');
        const hmm = (x) => { x = Math.round(Number(x)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; }; // plain reading (6.47.0): the size control's own h:mm
        const note = fl.includes('over') ? ` · longer than Max (${hmm(r.upper_minutes)})` : fl.includes('short') ? ' · under the plan' : r.status === 'fallback' ? ' · the Min size, which counts' : r.status === 'swapped' ? ' · a different discipline than planned' : '';
        doneBox.append(mark(el('span', null, r.done_text + note), 'week_view', null, `date=${r.date}&kind=${r.kind}&order=${r.order}`, 'done'));
      }
      const ids = doneToday.flatMap((r) => String(r.done_ids || '').split(';').filter(Boolean));
      const rated = ids.map((id) => (window.CX.live && window.CX.live.get(id)) || null).find(Boolean) || doneToday.find((r) => r.rpe !== null && r.rpe !== undefined);
      if (rated) doneBox.append(mark(el('span', 'ck-sub', `You rated it ${rated.rpe} of 10 for effort.`), 'week_view', null, null, 'rpe'));
      else { const go = el('button', 'ck-btn ck-btn--quiet td-rate', 'Rate how hard it felt'); go.type = 'button'; go.addEventListener('click', () => { show('checkins', true); const f = $('t-session'); if (f) { f.scrollIntoView({ block: 'start' }); const h = $('t-session-h'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } } }); const p = el('span', 'ck-sub', 'The coach uses your effort rating to set the next days. '); doneBox.append(p, go); }
    }
    const chips = $('t-chips'); chips.replaceChildren();
    const b = blockAt(TODAY);
    if (b) { const wk = Math.floor((TN - dayN(b.start)) / 7) + 1, weeks = Math.max(1, Math.round((dayN(b.end) - dayN(b.start) + 1) / 7)); chips.append(mark(chip(b.label || b.short, `week ${Math.min(wk, weeks)} of ${weeks}`), 'coach', null, b.key ? 'kind=block&key=' + b.key : null, 'block-week')); }
    const r = nextRace(); if (r) chips.append(mark(chip(r.name.replace('IRONMAN 70.3 ', ''), inDays(daysTo(r.date))), 'coach', null, 'kind=race&race_id=' + r.race_id, 'days-until'));
    const fu = fuelFor(TODAY); if (fu) chips.append(mark(chip('Fuel', fu.chip), 'coach', null, 'kind=fuel', 'fuel'));
    $('t-fuel').textContent = fu ? `Fuel today: ${fu.text}` : '';
    // Help me pick (Phase 6; was the How to choose card): a closed disclosure at the bottom of the plan card. With today's check-in it
    // holds the purpose, choice rule, Coach asks and fuel; in the week-plan state the day row's details and the fuel line.
    // It hides only when it would be empty.
    { const wh = $('t-when'); wh.replaceChildren(); const plain = !t || state.usePlan || !t.choice_rule;
      if (plain && state.sized !== false) for (const [k, txt] of PICK_WHEN) { const d = el('div'); d.append(el('dt', null, k), el('dd', null, txt)); wh.append(d); }
      if (keyToday.length && N(keyToday[0].pillar) !== null) { const d = el('div'); d.append(el('dt', null, `Key ${N(keyToday[0].pillar)} of 3`), el('dd', null, "One of this week's three sessions that matter most.")); wh.append(d); }
      else if (keyToday.length) { const d = el('div'); d.append(el('dt', null, 'Key session'), el('dd', null, "One of this week's three sessions that matter most.")); wh.append(d); }
      wh.hidden = !wh.children.length;
      const hb = $('t-pick-btn'); hb.hidden = wh.hidden && $('t-rule').hidden && $('t-ask').hidden;
      if (hb.hidden) { hb.setAttribute('aria-expanded', 'false'); $('t-pick').hidden = true; } }
    renderBound();
    renderRaceTile(r);
    renderNight();
    renderWatch();
    if (window.CX.renderChange) window.CX.renderChange(); // change.js: Today changed?, after the size is drawn
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
    if (!al.hidden) al.append('Main race: ', mark(el('b', null, ar.name.replace('IRONMAN 70.3 ', '')), 'coach', null, 'kind=race&race_id=' + ar.race_id, 'formatted'), ' in ', mark(el('span', null, String(Math.round(daysTo(ar.date) / 7))), 'coach', null, 'kind=race&race_id=' + ar.race_id, 'weeks-until'), ' wk');
    // Game look pass (the athlete's pick 1, Nov 14, 2026): a thin track from today to the main race, every race on the way as a small
    // stop and the next race as the marked stop; the main race line becomes the track's right label
    { const old = card.querySelector('.ck-race-track'); if (old) old.remove(); }
    const end = ar || r, endN = Math.max(1, daysTo(end.date));
    const on = kind('race').filter((x) => x.status !== 'done' && dayN(x.date) >= TN && dayN(x.date) <= dayN(end.date)).sort((x, y) => (x.date < y.date ? -1 : 1));
    const trk = el('div', 'ck-race-track'); const line = el('span', 'ck-rt-line');
    for (const x of on) {
      const st = el('i', 'ck-rt-stop' + (x.race_id === r.race_id ? ' is-next' : '') + (x.race_id === end.race_id ? ' is-end' : ''));
      st.style.left = Math.max(0, Math.min(100, (daysTo(x.date) / endN) * 100)).toFixed(1) + '%'; line.append(st);
    }
    CKC().describe(line, ar && ar.race_id !== r.race_id ? `Track from today to ${ar.name} in ${daysTo(ar.date)} days: ${r.name} is the next stop, in ${n} days${on.length > 2 ? `, ${on.length - 2} more race${on.length > 3 ? 's' : ''} on the way` : ''}.` : `Track from today to ${r.name} in ${n} days.`, { source: 'coach', where: 'kind=race&race_id=' + end.race_id, derived: 'days-until' });
    const lab = el('div', 'ck-rt-lab'); lab.append(el('span', null, 'Today'));
    if (!al.hidden) { const rl = el('span'); rl.append(...al.childNodes); lab.append(rl); al.hidden = true; }
    else lab.append(el('span', null, 'race day'));
    trk.append(line, lab);
    card.querySelector('.ck-race-main').after(trk);
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
    // before today's check-in the coach's pick is the week plan as written (Plan, green); the pending line left in 6.39.0 (the athlete's markup)
    state.rec = stale ? 'nominal' : ['fallback', 'nominal', 'upper'].includes(c) ? c : 'nominal';
    if (stale) return;
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
    box.hidden = !t.swap; // direction G: the green size says what the call says; a swap still needs its words
  }
  // Session size (Fallback / Plan / Strong day): native radios in a Cockpit segmented control, one state key (state.bound).
  // 6.39.0 (the athlete, Nov 14, 2026, option C with his markup): the coach's size is green (state.rec), the chosen size reads in one line
  // under the control (time, sport, then the day row's target_rpe and hr_cap when the plan carries them) with More info on the right.
  // the session's name without its time (the athlete, Nov 14, 2026: "Long ride, outdoor"; the size control carries the times):
  // drops "2:30", "35 min", "1.5 h" or "90'" from a title and tidies the commas left behind
  function noTime(s) {
    if (!s) return s;
    // a range goes as one ("50 to 60 min", "20-30 min", "1:30 to 2:00"); 6.55.4: it read "Easy run 50 to, flat"
    const o = String(s).replace(/\s*\b\d{1,2}:\d{2}(?:\s*(?:-|–|to)\s*\d{1,2}:\d{2})?\b/g, '')
      .replace(/\s*\b\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(?:min|mins|minutes|h|hr|hrs|hours)\b\.?/gi, '')
      .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ');
    return o || String(s);
  }
  // minutes as h:mm from an hour up ("1:45"), else "35 min"
  function hmin(v) { v = Math.round(v); return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v} min`; }
  // when to pick each size (6.39.0): plain words from push contract B (coach/engine/TEAM.md), shown before today's check-in
  const PICK_WHEN = [['Min', 'Short on time, tired, or something hurts. Still counts as done.'], ['Plan', 'You feel normal.'], ['Max', 'Energy and legs 4 or better, slept 6.5 h or more, nothing hurts.']];
  // the week path (direction G; Sprint Review pick 1, Nov 15: nodes on one line, key sessions are diamonds, the line fills as
  // days are done, today glows softly): one node a day, Mon to Sun; a key session shows its number (1 to 3), a done session is filled
  // (week_view status done, fallback or swapped), today is ringed; the head counts key sessions done
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function renderPath() {
    const ol = $('t-path'); ol.replaceChildren(); const m0 = dayN(monday(TODAY)), wv = rowsOk('week_view') || [];
    let keys = 0, keysDone = 0;
    for (let i = 0; i < 7; i++) {
      const d = isoN(m0 + i), rs = kind('day').filter((r) => r.date === d);
      const key = rs.find((r) => r.type !== 'rest' && (truthy(r.key) || N(r.pillar) !== null));
      const done = wv.some((r) => r.date === d && r.kind === 'plan' && ['done', 'fallback', 'swapped'].includes(r.status));
      const planned = rs.some((r) => r.type !== 'rest');
      const li = el('li', 'td-day' + (d === TODAY ? ' is-now' : '') + (done ? ' is-done' : '')), nd = el('span', 'td-node' + (key ? ' is-key' : '') + (done ? ' is-done' : '') + (!planned ? ' is-rest' : '') + (d === TODAY ? ' is-now' : ''));
      nd.append(el('b', null, key ? String(N(key.pillar) !== null ? N(key.pillar) : 'K') : done ? '✓' : planned ? '' : '·')); nd.setAttribute('aria-hidden', 'true');
      li.append(nd, el('span', 'td-dow', DOW[i]), el('span', 'ck-vh', (key ? `, key session ${N(key.pillar) || ''}` : planned ? ', session' : ', rest') + (done ? ', done' : '') + (d === TODAY ? ', today' : '')));
      ol.append(li);
      if (key) { keys++; if (done) keysDone++; }
    }
    $('t-path-n').textContent = keys ? `${keysDone} of ${keys} key done` : '';
  }
  function renderBound() {
    for (const inp of document.querySelectorAll('#t-bounds input[type=radio]')) { inp.checked = inp.value === state.bound; inp.closest('.ck-seg-opt').classList.toggle('is-rec', inp.value === state.rec); }
    for (const k of ['nominal', 'upper', 'fallback']) $('t-b-' + k).hidden = state.usePlan || k !== state.bound || !$('t-b-' + k).textContent.replace('—', '').trim();
    const line = $('t-size'); line.replaceChildren();
    const sp = state.sizePlan, f = { nominal: 'minutes', upper: 'upper_minutes', fallback: 'fallback_minutes' }[state.bound];
    const v = sp ? N(sp.row[f]) : null;
    if (v !== null && state.bound === 'fallback' && sp.row.alt_type && sp.row.alt_type !== sp.row.type) line.append(mark(el('span', 'td-cap', String(sp.row.alt_type)), 'coach', 'alt_type', sp.w), ' instead');
    const dr = state.sizeRow, dw = dr ? `kind=day&date=${dr.date}&order=${dr.order}` : null;
    const sep = () => { if (line.childNodes.length) line.append(el('span', 'td-dot', ' · ')); };
    if (dr && dr.target_rpe !== undefined && dr.target_rpe !== null && dr.target_rpe !== '') { const g = el('span', 'td-nw', 'Effort '); g.append(mark(el('span', null, String(dr.target_rpe)), 'coach', 'target_rpe', dw), ' of 10'); sep(); line.append(g); }
    if (dr && N(dr.hr_cap) !== null) { const g = el('span', 'td-nw', 'HR about '); g.append(mark(el('span', null, String(N(dr.hr_cap))), 'coach', 'hr_cap', dw)); sep(); line.append(g); }
    // the line under the title: key number, then what the coach says, or the day an older check-in is from
    const sub = $('t-sub'); sub.replaceChildren(); const rf = { nominal: 'minutes', upper: 'upper_minutes', fallback: 'fallback_minutes' }[state.rec || 'nominal'], rv = sp ? N(sp.row[rf]) : null;
    const bits = [state.keyN, state.from, rv !== null ? 'coach says ' + hmin(rv) : ''].filter(Boolean);
    bits.forEach((b, i) => { if (i) sub.append(' · '); sub.append(i === bits.length - 1 && rv !== null ? mark(el('span', null, b), 'coach', null, sp.w, 'coach size h:mm') : b); });
    const more = $('t-more'), mb = $('t-more-btn');
    const hasMore = [...more.children].some((c) => !c.hidden && c.textContent.replace('—', '').trim());
    mb.hidden = !hasMore; if (!hasMore) { more.hidden = true; mb.setAttribute('aria-expanded', 'false'); }
    mb.textContent = more.hidden ? 'More info' : 'Less';
  }
  $('t-more-btn').addEventListener('click', () => { const m = $('t-more'); m.hidden = !m.hidden; $('t-more-btn').setAttribute('aria-expanded', String(!m.hidden)); $('t-more-btn').textContent = m.hidden ? 'More info' : 'Less'; });
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
    // plain reading (Nov 15, 2026): the words carry the reading; the SD figure was statistics shorthand a first reader cannot use
    if (a < 1) return { text: 'typical', warn: false, pos: 'inside' };
    return { text: `${a >= 2 ? 'well ' : ''}${dir} usual`, warn: worse && a >= 1.5, pos: dir };
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
  // the night date. With no gauge figure because the night is loading or failed, the meter hides and #t-hn shows open, so the
  // state message is never behind a closed row.
  // When the call itself cannot show (coach data loading, missing or empty) the night still can: the meter and #t-hn move
  // out of the call's body to sit under its state message, and go back once the call is drawn.
  function nightHome() {
    const hero = $('t-hero'), body = hero.querySelector(':scope > [data-body]'), mb = $('t-nm-btn'), hn = $('t-hn');
    if (body.hidden) { if (mb.parentNode !== hero) hero.append(mb, hn); }
    else if (mb.parentNode !== body) { ($('t-ready-m') || body.querySelector('.ck-call-main')).after(mb, hn); }
  }
  function nightOpen(on) {
    const mb = $('t-nm-btn'); mb.hidden = !on; $('t-hn').hidden = on ? mb.getAttribute('aria-expanded') !== 'true' : false;
  }
  // A new athlete (no gauge figure yet: under 14 nights, or nothing synced) gets the same closed row as everyone else, saying
  // what the coach is waiting for; the vitals open from it. Only an error or a load shows the section open (the athlete, Nov 14, 2026).
  const LEARN = ['sleep_h', 'sleep_score', 'hrv_overnight_ms', 'resting_hr'];
  function nightLearn() {
    const mb = $('t-nm-btn'), rows = rowsOk('night') || [], by = Object.fromEntries(rows.map((r) => [r.metric, r]));
    const any = VITALS.some((m) => by[m]), n = Math.min(...LEARN.map((m) => (by[m] ? N(by[m].n) || 0 : 0)));
    mb.dataset.learn = '1'; $('t-nm-v').textContent = ''; $('t-nm-bar').replaceChildren();
    const w = $('t-nm-word'); w.replaceChildren(neutralChip(any ? 'Learning your normal' : 'No night synced yet'));
    if (any) w.append(' ', mark(el('span', null, String(n)), 'night', 'n', 'metric=sleep_h'), ' of ', ruleSpan('14', 'calc.js night: a band needs 14 nights (min n)'), ' nights');
    mb.setAttribute('aria-label', any ? `Last night: learning your normal, ${n} of 14 nights so far. Show the vitals` : 'Last night: no night synced yet. Show details');
    nightOpen(true);
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
    if (!VITALS.some((m) => by[m])) { nightLearn(); cardState(sect, 'empty', 'No night synced yet. The vitals appear after your watch next syncs.'); renderCall(by); return; }
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
      const val = el('td', 'ck-c-val'); val.append(mark(el('span', null, r.value === null ? '—' : String(r.value)), 'night', 'value', w)); if (r.unit && r.value !== null) val.append(mark(el('span', 'ck-unit', r.unit), 'night', 'unit', w));
      if (m === 'body_battery_high' && by.body_battery_charged && by.body_battery_charged.value !== null) { const rc = el('span', 'ck-sub td-recharge', 'recharge +'); rc.append(mark(el('span', null, String(by.body_battery_charged.value)), 'night', 'value', 'metric=body_battery_charged')); val.append(rc); }
      const bandOk = N(r.mean) !== null && N(r.sd) !== null && N(r.n) >= 14;
      const lo = bandOk ? N(r.mean) - N(r.sd) : null, hi = bandOk ? N(r.mean) + N(r.sd) : null;
      const rg = mark(el('td', 'ck-c-range'), 'night', null, w, 'usual-range'); rg.dataset.label = 'Usual';
      // the same words and rounding as the range bar's sentence (charts.js CKC.say.band), so they never disagree
      const bw = bandOk && r.value !== null ? CKC().say.band(N(r.value), lo, hi, vFmt(r), r.unit || '', z.pos) : '';
      if (bandOk) rg.textContent = bw ? bw.replace(/^.*your usual /, '') : `${vFmt(r)(lo)} to ${vFmt(r)(hi)}${r.unit ? ' ' + r.unit : ''}`;
      else { rg.replaceChildren(); rg.append('No band yet, ', mark(el('span', null, String(N(r.n) || 0)), 'night', 'n', w), ' of ', ruleSpan('14', 'calc.js night: a band needs 14 nights (min n)'), ' nights'); }
      const sc = mark(el('td', 'ck-c-status'), 'night', null, w, 'vstate'); sc.append(vs.s === 'plain' ? neutralChip(vs.word, 'ck-badge--md') : badge(vs.s, vs.word, 'ck-badge--md'));
      // the SD figure beside the badge is gone (plain reading, Nov 15, 2026): the badge word and the range bar carry the reading
      const bar = el('td', 'ck-c-bar'); const svgEl = el('div'); bar.append(svgEl);
      tr.append(th, val, rg, sc, bar); box.append(tr);
      // script-held (CHARTS.md): the 14-night gate, the 2.5 SD track width and the usual range = average ± 1 SD.
      // position: the row's own comparison (zText), so the sentence and the row text never disagree
      // no band yet: the tile already says so in words, so the empty hatched bar and its caption are left out
      if (bandOk) CKC().rangeBar(svgEl, { key: 'night-' + m, label: r.label, when: 'last night', value: r.value, mean: r.mean, sd: r.sd, lo, hi, position: z.pos, n: r.n, minN: 14, span: 2.5, unit: r.unit, fmt: vFmt(r), marks: { source: 'night', where: w } });
    }
    const foot = $('n-foot'); foot.replaceChildren();
    if (s) { const r1 = el('span', null, 'a normal night-to-night swing'), r2 = el('span', null, '28 days'), r3 = el('span', null, '30–45 min'); r1.setAttribute('data-rule', 'calc.js night: usual range = average ± 1 SD'); r2.setAttribute('data-rule', 'calc.js night: 28-day window'); r3.setAttribute('data-rule', 'app.js renderNight: Garmin sleep note');
      foot.append('Bar: your average, give or take ', r1, ', over the ', r2, ' before (', mark(el('span', null, String(s.n)), 'night', 'n', 'metric=sleep_h'), ' nights); the dot is last night. It informs the call; it never decides it alone. Garmin reads sleep about ', r3, ' high.'); }
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
    if (r) { $('n-g-used').textContent = String(used); $('n-g-of').textContent = String(N(r.of)); }
    if (v === null) { nightLearn(); return; }
    delete $('t-nm-btn').dataset.learn; nightOpen(true);
    const lo = N(r.lo), hi = N(r.hi), a = Math.abs(v), dir = v > 0 ? 'high' : 'low', word = a < 1 ? 'Typical' : a >= 2 ? 'Well ' + dir : dir.charAt(0).toUpperCase() + dir.slice(1);
    const s = a < 1 ? 'good' : v <= -1.5 ? 'watch' : 'plain';
    $('n-g-v').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + f1(a);
    const b = $('n-g-b'); b.replaceChildren(s === 'plain' ? neutralChip(word, 'ck-badge--md') : badge(s, word, 'ck-badge--md'));
    $('n-g-s').textContent = v === 0 ? 'at your normal' : `${a < 1 ? 'a little ' : a >= 2 ? 'well ' : ''}${v > 0 ? 'above' : 'below'} your normal`;
    // Bell curve (the athlete, Nov 15, 2026: "really like the Bell curve ... for when you expand"; then "show plus or minus 1 sigma
    // and plus or minus 2 sigma" and, on the sigma options page E1nGjsBnsHSDBg1gvqfB7M, a blend of options 1, 2 and 3 with
    // "the last 3 nights as dots on the graph, more and more faded the farther back"). Drawn from -3 to +3 SD so the 2 SD
    // edge shows: within 1 SD shaded (about 2 in 3 nights), 1 to 2 SD lighter (about 1 in 7 each side), beyond 2 SD a
    // faint tint. The dots are calc night_week (night_gauge run for each night, read here, never recomputed): last night
    // solid, the two nights before it fainter with age. Cut-offs and words unchanged. 1 unit = 1 px (280 by 156).
    const BL = 3, W = 280, H = 136, x0 = 16, x1 = 264, base = 94, top = 18, NS = 'http://www.w3.org/2000/svg';
    const X = (u) => x0 + (Math.max(-BL, Math.min(BL, u)) + BL) / (2 * BL) * (x1 - x0), Y = (u) => base - (base - top) * Math.exp(-u * u / 2);
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'td-g-svg td-bell');
    const wk = (rowsOk('night_week') || []).filter((x) => x.date && N(x.value) !== null).slice(-3);
    const past = wk.filter((x) => x.date !== r.date).slice(-2);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Bell curve of your nights around your normal, shaded within 1 sigma, 1 to 2 sigma and beyond 2 sigma. Last night sits ${$('n-g-s').textContent}, ${word.toLowerCase()}.${past.length ? ' The nights before it are the fainter dots; the list below reads them.' : ''}`);
    const add = (tag, at, txt) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (txt) e.textContent = txt; svg.append(e); return e; };
    const pts = (from, to) => { const o = []; for (let u = from; u <= to + 1e-9; u += (to - from) / 60) o.push(`${X(u).toFixed(1)} ${Y(u).toFixed(1)}`); return o; };
    const area = (a, b, c) => add('path', { d: `M ${X(a).toFixed(1)} ${base} L ${pts(a, b).join(' L ')} L ${X(b).toFixed(1)} ${base} Z`, class: c });
    area(-BL, -2, 'td-bell-b3'); area(2, BL, 'td-bell-b3'); area(-2, -USUAL, 'td-bell-b2'); area(USUAL, 2, 'td-bell-b2'); area(-USUAL, USUAL, 'td-bell-band');
    add('path', { d: `M ${pts(-BL, BL).join(' L ')}`, class: 'td-bell-line' });
    add('line', { x1: x0, y1: base, x2: x1, y2: base, class: 'td-bell-base' });
    add('line', { x1: X(0), y1: top - 4, x2: X(0), y2: base, class: 'td-g-mid' });
    // The nights sit on the curve (the athlete, Nov 15, 2026: "put these back on the curve"); older nights fainter
    past.forEach((x, i) => { const pv = N(x.value); add('circle', { cx: X(pv).toFixed(1), cy: Y(pv).toFixed(1), r: 6, class: 'td-g-dot td-bell-past', style: `opacity:${i === past.length - 1 ? 0.5 : 0.25}` }); });
    add('line', { x1: X(v).toFixed(1), y1: Y(v).toFixed(1), x2: X(v).toFixed(1), y2: base, class: 'td-bell-stem', 'data-s': s });
    add('circle', { cx: X(v).toFixed(1), cy: Y(v).toFixed(1), r: 7, class: 'td-g-dot' });
    for (const [u, t] of [[-2, '−2σ'], [-1, '−1σ'], [0, 'normal'], [1, '+1σ'], [2, '+2σ']]) add('text', { x: X(u).toFixed(1), y: base + 16, class: 'td-g-w' }, t);
    // No band frequencies on the curve (the athlete, Nov 15, 2026: no "2 in 3" or "1 in 7"); the shading and σ labels carry it.
    const wdn = (iso) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T00:00:00Z').getUTCDay()];
    // The key draws the dots themselves (the athlete, Nov 15, 2026: "instead of saying big dot.. faint dot.. use the actual symbol in
    // the key"): last night's dot, then each night before it at its own fade, named by weekday
    if (past.length) {
      const items = [[7, 1, 'last night', ''], ...past.slice().reverse().map((x, i) => [6, i === 0 ? 0.5 : 0.25, wdn(x.date), ' td-bell-past'])];
      const wd = items.map(([, , t]) => 18 + t.length * 6.3 + 14), tot = wd.reduce((a, b) => a + b, 0) - 14; let at = X(0) - tot / 2 + 7;
      items.forEach(([rr, op, t, c], i) => { const cx = at; at += wd[i]; add('circle', { cx: cx.toFixed(1), cy: base + 30, r: rr, class: 'td-g-dot' + c, style: `opacity:${op}` }); add('text', { x: (cx + 11).toFixed(1), y: base + 34, class: 'td-g-w td-bell-cap td-bell-key' }, t); });
    }
    // Context under the curve (the athlete, Nov 15, 2026: "give you context for where you land today and your previous nights, very
    // simply, and what it should mean for what you're doing today"). The nights are night_week in plain zone words; the
    // advice is the coach's own call for today (READY_MEAN of the today row), never decided here (one home: the engine).
    const zw = (pv) => { const pa = Math.abs(pv); return pa < 1 ? 'normal' : `${pa >= 2 ? '2σ' : '1σ'} ${pv > 0 ? 'above' : 'below'}`; };
    // As a small table, colour coded like the track's steps (the athlete, Nov 15: "can you make this a table? Or color code"):
    // within 1σ the usual-range green, 1σ to 2σ the light accent, beyond 2σ the warm tint; the words carry the direction.
    { const cd = $('n-g-ctx-d'), cn = $('n-g-ctx-n'); cd.replaceChildren(); cn.replaceChildren();
      wk.forEach((x) => { const pv = N(x.value), pa = Math.abs(pv), th = el('th', null, x.date === r.date ? 'Today' : wdn(x.date)); th.scope = 'col'; cd.append(th);
        const td = el('td'); td.append(mark(el('span', 'td-nz td-nz-' + (pa < 1 ? 'b1' : pa < 2 ? 'b2' : 'b3'), zw(pv)), 'night_week', null, 'key=' + x.date, 'zone')); cn.append(td); });
      const td = kind('today')[0], rw = td ? READY_MEAN[String(td.readiness || '').toUpperCase()] : null;
      $('n-g-ctx-t').textContent = rw || 'Arrives with the morning check-in.';
      $('n-g-ctx-t').closest('p').hidden = false; }
    const lst = $('n-g-last'); lst.replaceChildren();
    for (const x of wk) { const pv = N(x.value), pa = Math.abs(pv), li = el('li', null, (x.date === r.date ? 'Last night' : wdn(x.date)) + ': ');
      li.append(mark(el('span', null, (pv > 0 ? '+' : pv < 0 ? '−' : '') + f1(pa)), 'night_week', 'value', 'key=' + x.date), ` sigma, ${pa < 1 ? 'within 1 sigma' : pa < 2 ? 'between 1 and 2 sigma ' + (pv > 0 ? 'above' : 'below') : 'beyond 2 sigma ' + (pv > 0 ? 'above' : 'below')}`); lst.append(li); }
    draw.append(svg);
    if (window.CK && window.CK.firstDraw) window.CK.firstDraw(draw, 'night-gauge');
    // the meter line in the call (the same figure and word, marked the same): a bar from lo to hi, the fill from 0 to the
    // value in the status colour, a mark at 0, dashed marks at -1 and +1, and the dot at the value
    $('t-nm-v').textContent = $('n-g-v').textContent;
    $('t-nm-word').replaceChildren(s === 'plain' ? neutralChip(word) : badge(s, word));
    // Sigma blend (the athlete, Nov 15, 2026: options 1, 2 and 3 together, sigma options page E1nGjsBnsHSDBg1gvqfB7M): the track
    // runs -2.5 to +2.5 SD in five joined steps like the level bars (beyond 2 SD, 1 to 2 SD, within 1 SD, 1 to 2 SD, beyond
    // 2 SD); the step last night sits in is filled, the dot marks the spot, and the 1 and 2 SD edges are labelled under it.
    const TR = 2.5, at = (u) => Math.max(0, Math.min(1, (u + TR) / (2 * TR))) * 100, bar = $('t-nm-bar'); bar.replaceChildren(); bar.dataset.s = s;
    for (const [a0, a1, c] of [[-TR, -2, 'b3'], [-2, -USUAL, 'b2'], [-USUAL, USUAL, 'b1'], [USUAL, 2, 'b2'], [2, TR, 'b3']]) {
      const g = el('i', 'td-nm-seg td-nm-' + c + (v >= a0 && (v < a1 || (a1 === TR && v >= a1)) ? ' on' : '')); g.style.left = at(a0) + '%'; g.style.width = (at(a1) - at(a0)) + '%'; bar.append(g);
    }
    const mk = (c, u) => { const i = el('i', c); i.style.left = at(u) + '%'; return i; };
    bar.append(mk('td-nm-mid', 0), mk('td-nm-pt', v));
    for (const [u, t] of [[-2, '2σ'], [-1, '1σ'], [0, 'normal'], [1, '1σ'], [2, '2σ']]) { const k = mk('td-nm-tk', u); k.textContent = t; bar.append(k); }
    $('t-nm-btn').setAttribute('aria-label', `Last night ${$('t-nm-v').textContent} SD, ${word}, on a scale from -${TR} to +${TR} sigma; within 1 sigma is usual, 1 to 2 sigma is outside usual, beyond 2 sigma is well outside. Show the gauge and all vitals`);
  }
  // The deck's Watch notice: the six vitals under the rule above (no new rule).
  function renderCall(by) {
    const rows = by ? VITALS.map((m) => by[m]).filter(Boolean) : [];
    const sts = rows.map((r) => ({ r, v: vState(r) }));
    const watch = sts.filter((x) => x.v.s === 'watch');
    const note = $('t-watchnote'), t = $('t-watchnote-t'); t.replaceChildren(); note.hidden = !watch.length; placeWatch();
    if (watch.length) {
      watch.forEach((x, i) => { if (i) t.append(i === watch.length - 1 ? ' and ' : ', '); const b = el('b', null, x.r.label + ' '); b.append(mark(el('span', null, String(x.r.value)), 'night', 'value', 'metric=' + x.r.metric), x.r.unit ? ' ' + x.r.unit : ''); t.append(b); });
      const r1 = el('span', null, '28-day'), r2 = el('span', null, 'well outside'); r1.setAttribute('data-rule', 'calc.js night: 28-day window'); r2.setAttribute('data-rule', 'app.js zText: Watch from 1.5 SD on the worse side');
      t.append(watch.length === 1 ? ' is' : ' are', ' ', r2, ' your ', r1, ' normal, on the worse side. On its own it does not change the plan. Open Last night above to see every reading.');
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
  // plain reading (6.49.0): a size reads like the Today sizes, h:mm from an hour (2:45), minutes below it
  const hmSpan = (r, f) => { const v = N(r[f]); return v >= 60 ? mark(el('span', null, hmin(v)), 'week_view', null, wvWhere(r), 'h:mm') : mark(el('span', null, `${v} min`), 'week_view', f, wvWhere(r)); };
  const minSpan = (r, f) => { const v = N(r[f]); return v >= 120 ? mark(el('span', null, `${f1(v / 60)} h`), 'week_view', null, wvWhere(r), 'hours') : mark(el('span', null, `${v} min`), 'week_view', f, wvWhere(r)); };
  // a re-render rebuilds the list, so the control that was pressed gets the focus back (keyboard users keep their place)
  const wkFocus = (sel, pick) => { const t = [...document.querySelectorAll(sel)].find(pick); if (t) t.focus({ preventScroll: true }); };
  const HR_RULE = 'calc.js week_view: easy HR target + band (easy_hr_guardrail)';
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
      // the three sizes in Today's words (plain reading, 6.49.0; a training partner was confused by "up to 165, fallback 105"): Min, Plan, Max
      const t2 = el('span', 'ck-row-s'); const bits = [];
      if (r.fallback_minutes) bits.push(['Min ', hmSpan(r, 'fallback_minutes'), r.alt_type ? ' ' + (NAME[r.alt_type] || r.alt_type).toLowerCase() : '']);
      bits.push(['Plan ', hmSpan(r, 'minutes')]);
      if (r.upper_minutes && N(r.upper_minutes) !== N(r.minutes)) bits.push(['Max ', hmSpan(r, 'upper_minutes')]);
      bits.forEach((x, i) => { if (i) t2.append(' · '); t2.append(...x); });
      t.append(t2);
    }
    let liveR = false;
    if (r.rpe === null && r.done_ids) { const live = String(r.done_ids).split(';').map((id) => window.CX.live && window.CX.live.get(id)).find(Boolean); if (live) { r = { ...r, rpe: live.rpe, vs_plan: live.vs_plan || '', pain: live.pain }; liveR = true; } }
    // a rating saved on this phone and not yet in the data carries data-derived="live" (no dataset row holds it yet)
    const rpeSpan = () => (liveR ? mark(el('span', null, String(r.rpe)), null, null, null, 'live') : mark(el('span', null, String(r.rpe)), 'week_view', 'rpe', w));
    if (r.done_text) {
      const t3 = el('span', 'ck-row-d'); { const dt = String(r.done_text).replace(/\b(\d{2,3}) min\b/, (m0, n) => (Number(n) >= 60 ? hmin(Number(n)) : m0)); t3.append('Done: ', dt === String(r.done_text) ? mark(el('span', null, dt), 'week_view', 'done_text', w) : mark(el('span', null, dt), 'week_view', null, w, 'h:mm')); }
      if (r.rpe !== null && r.rpe !== undefined) t3.append(' · effort ', rpeSpan(), ' of 10', r.vs_plan ? ' ' + r.vs_plan : '');
      if (r.pain) t3.append(' · pain ', liveR ? mark(el('span', null, String(r.pain)), null, null, null, 'live') : mark(el('span', null, String(r.pain)), 'week_view', 'pain', w));
      t.append(t3);
    }
    b.append(sportIcon(tpOf(r)), t, el('span', 'ck-row-end'));
    b.lastChild.append(stBadge(statusOf(r), w));
    if (open) {
      const d = el('span', 'ck-row-more');
      const line = (...parts) => { const s = el('span'); s.append(...parts); d.append(s); return s; };
      const flag = (...parts) => { const s = el('span', 'wk-flag'), t = el('span'); t.append(...parts); s.append(icon('watch', 'ck-i wk-fg'), t); d.append(s); }; // flex only on the outer span: the sentence stays one item
      const more = r.detail ? wkLines(d, r, w) : [];
      const fl = String(r.flags || '');
      if (fl.includes('hr_high')) flag('Heart rate ran 5+ over the easy target (', ruleSpan(r.done_disc === 'run' ? `run ~${ANC().grun}` : `bike ~${ANC().gbike}`, HR_RULE), ').');
      if (r.intensity === 'easy' && ((r.rpe !== null && r.rpe !== undefined && Number(r.rpe) >= 5) || r.vs_plan === '+')) flag('Rated effort ', rpeSpan(), `${r.vs_plan === '+' ? ', harder than planned' : ''} on an easy day.`);
      if (fl.includes('over')) flag('Longer than Max (', mark(el('span', null, hmin(N(r.upper_minutes))), 'week_view', null, w, 'h:mm'), ').');
      if (fl.includes('short')) flag('Under the fallback (', mark(el('span', null, String(r.fallback_minutes)), 'week_view', 'fallback_minutes', w), ' min).');
      if (isKey(r) && r.why) more.unshift(['Why', plainEl(mark(el('span', null, r.why), 'week_view', 'why', w))]);
      if (r.status === 'fallback') line('Done as the fallback, which counts as success.');
      if (r.status === 'swapped') line(`Done as a different discipline (${NAME[r.done_disc] || r.done_disc}).`);
      if (r.done_text && (r.rpe === null || r.rpe === undefined) && dayN(r.date) <= TN) line('No effort rating yet: rate it on Today.').className = 'ck-row-s';
      if (!d.childNodes.length) line('No details.').className = 'ck-row-s';
      b.append(d);
      if (more.length) { const x = el('details', 'wk-more'); const sm = el('summary', 'ck-row-s', 'More detail'); x.append(sm); for (const [k, v] of more) wkKv(x, k).append(v); return [b, x]; }
    }
    b.addEventListener('click', () => { if (state.open.has(key)) state.open.delete(key); else state.open.add(key); renderWeek(); wkFocus('#w-days .wk-item', (e) => e.dataset.k === key); });
    return b;
  }
  // Week session detail as short labelled lines (the athlete, Nov 16: "This is too text blocky"). The coach still writes one
  // detail paragraph (week.json); the page sorts its sentences by what they say, and effort comes from target_rpe and hr_cap.
  const WK_LAB = [['Effort', /^(RPE|effort|HR\b|heart rate)/i], ['Fallback', /\bfallback\b|^not well|^if (it|you)\b.*\b(move|skip)/i], ['Extra', /push contract|free choice|bonus/i],
    ['Food', /maintenance day|\b(carb|eat|fuel)/i], ['When', /^(after|before|optional|log it|on base|replanned)\b|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) if\b/i]];
  function wkKv(d, label) { const s = el('span', 'wk-kv'); const v = el('span', 'wk-kv-v'); s.append(el('span', 'wk-kv-k', label), v); d.append(s); return v; }
  function wkLines(d, r, w) { // at the open row: Plan (as steps), Effort, Fallback; the rest goes to More detail (returned)
    const sent = String(r.detail).replace(/\.\.+/g, '.').match(/[^.;]+(?:\([^)]*\)[^.;]*)*[.;]?/g) || [];
    const by = new Map(); const add = (k, t) => { if (!by.has(k)) by.set(k, []); by.get(k).push(t); };
    const dr = kind('day').find((x) => x.date === r.date && x.title === r.title) || {}; const rpe = dr.target_rpe, hr = N(dr.hr_cap);
    for (let t of sent) { t = t.trim().replace(/[;.]$/, ''); if (!t || /^log it\b/i.test(t)) continue; const hit = WK_LAB.find(([, re]) => re.test(t)); const k = hit ? hit[0] : 'Plan';
      if (k === 'Effort' && rpe) continue; // said once from the day row's own fields
      add(k, k === 'Food' && /^maintenance day$/i.test(t) ? 'eat to maintenance' : t.replace(/^fallback:?\s+/i, '')); }
    const txt = (t) => plainEl(mark(el('span', null, t.charAt(0).toUpperCase() + t.slice(1)), 'week_view', 'detail', w));
    const plan = by.get('Plan') || [], more = [];
    if (plan.length) { const first = plan[0], paren = first.match(/\([^)]*\)/g) || []; wkKv(d, 'Plan').append(txt(first.replace(/\s*\([^)]*\)/g, '').split(/,\s+/).filter((x) => !(rpe && /^(RPE|effort)\b/i.test(x))).join(' · '))); paren.forEach((x) => more.push(['Detail', x.slice(1, -1)])); plan.slice(1).forEach((x) => more.push(['Notes', x])); }
    if (rpe || hr !== null) { const v = wkKv(d, 'Effort'); if (rpe) v.append(mark(el('span', null, String(rpe).replace('-', ' to ')), 'coach', 'target_rpe', `kind=day&date=${dr.date}&order=${dr.order}`), ' of 10'); if (hr !== null) v.append(rpe ? ' · heart rate ' : 'Heart rate ', mark(el('span', null, String(hr)), 'coach', 'hr_cap', `kind=day&date=${dr.date}&order=${dr.order}`), ' or under'); }
    else (by.get('Effort') || []).forEach((t, i) => wkKv(d, i ? '' : 'Effort').append(txt(t)));
    (by.get('Fallback') || []).forEach((t, i) => wkKv(d, i ? '' : 'Fallback').append(txt(t)));
    for (const k of ['Extra', 'Food', 'When']) (by.get(k) || []).forEach((t) => more.push([k, t]));
    return more.map(([k, t]) => [k, txt(t)]);
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
  // A Week totals ring (game look pass, the athlete's pick 2, Nov 14, 2026): a small ring that fills toward the plan with the figure
  // inside, the label and "of N" under it. The ring track is the role=img meter (CKC.meter sentence and marks); the figure is
  // a sibling over it, so it stays readable text. Each ring is a tab over the chart below (wkTab).
  function wkTile(label, fig, unit, sub, frac, wk, tone) {
    const t = el('div', 'wk-rcell'); t.dataset.tone = tone || 'accent';
    const ring = el('span', 'wk-ring'); const tr = el('span', 'wk-ring-t');
    if (frac !== undefined && frac !== null) {
      const f = Math.max(0, Math.min(1, frac)); tr.style.setProperty('--p', Math.round(f * 100) + '%');
      CKC().meter(tr, { frac: f, fill: '.none', sentence: `${label}: ${Math.round(f * 100)}% of the plan`, marks: { source: 'week_view', where: wk ? 'week=' + wk : null, derived: 'meter' } });
    } else { tr.classList.add('wk-ring-t--none'); tr.setAttribute('aria-hidden', 'true'); }
    const v = el('span', 'wk-ring-v'); v.append(fig); ring.append(tr, v); t.append(ring);
    t.append(el('span', 'wk-rl', label));
    if (unit) { const u = el('span', 'wk-ru'); u.append(...[].concat(unit)); t.append(u); }
    if (sub && !(Array.isArray(sub) && !sub.length)) t.wkSub = sub;
    return t;
  }
  const dv = (txt, d, wk, src) => mark(el('span', null, txt), src || 'week_view', null, wk ? 'week=' + wk : null, d);
  // Key sessions (the athlete, Nov 3, 2026; rules coach/engine/KEY-SESSIONS.md): the three things that must happen each week for
  // progress or the right discipline, numbered 1 to 3; a rest day can be one. Every week from KEY_RULE_FROM shows three
  // slots: the week's key row, or the block's default (pillar_n_short) while the coach has not written that week yet.
  // Weeks before then show what was tagged at the time. Never borrows a session from another week.
  const KEY_RULE_FROM = '2026-11-02';
  // 6.54.0: nothing is counted before the person's own first week. keyFrom() is the later of the rule's date and the
  // Monday of the week this coach started (the plan's meta row, season_start), so a new coach shows no misses for
  // weeks before it existed. A start before the rule's date changes nothing.
  const startDay = () => { const m = kind('meta').find((r) => r.season_start); return m && /^\d{4}-\d{2}-\d{2}/.test(m.season_start) ? m.season_start.slice(0, 10) : null; };
  // the first two weeks of a new coach: its day number, 1 to 14, or null afterwards (and always null for a coach whose
  // start is older). The Check-in list and the Health map read it so day one shows what is due now, not everything.
  const firstDays = () => { const s = startDay(); if (!s) return null; const n = TN - dayN(s) + 1; return n >= 1 && n <= 14 ? n : null; };
  const keyFrom = () => { const s = startDay(), m = s ? monday(s) : null; return m && m > KEY_RULE_FROM ? m : KEY_RULE_FROM; };
  Object.assign(window.CX, { keyFrom, firstDays, startDay }); // read by plan.js, season.js, checkins.js and pillars.js
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
    const ruled = dayN(wk) >= dayN(keyFrom());
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
      // the block goal moved into About this block (the athlete, Nov 15, 2026: "too much text")
    }
    if (!ruled && dayN(wk) < dayN(KEY_RULE_FROM)) { const p = el('p', 'ck-note', 'Before '); p.append(ruleSpan('Nov 2', 'app.js KEY_RULE_FROM: 2026-11-02'), ' the plan tagged key sessions differently; shown as recorded.'); more.append(p); }
    if (!slots.length) box.append(el('p', 'ck-note', 'No key sessions were tagged this week.'));
    // Game look pass (the athlete's pick, Nov 14, 2026): the three keys sit side by side as slots. A slot's disc fills in its sport
    // colour when done, rings when it is today, and outlines in red when missed. Tapping a slot opens what it is: the day,
    // its sizes, what it is for, what was done and a link to it in the week list (the athlete: "selecting should give more info").
    box.classList.add('wk-slots--3');
    const info = el('div', 'wk-kinfo'); info.id = 'w-kinfo'; info.setAttribute('aria-live', 'polite');
    const why = [];
    const sel = state.keySel && state.keySel.wk === wk ? state.keySel.i : null;
    slots.forEach((x, i) => {
      const w = x.row ? wvWhere(x.row) : null;
      const restT = x.row && x.row.type === 'rest' && !/rest/i.test(x.row.title || '');
      const title = x.row ? (restT ? `Rest: ${x.row.title}` : x.row.title) : x.short || 'To be set';
      const when = x.row ? [fWd(P(x.row.date)), x.row.why].filter(Boolean).join(' · ') : (bl ? 'Block default · not in the plan yet' : 'Not in the plan yet');
      // the week this coach started: an empty key slot is still to come (the first plan fills it), not a warning
      const firstWeek = curWeek && startDay() && monday(startDay()) === wk;
      const st = x.row ? statusOf(x.row) : { t: (pastWeek || curWeek) && !firstWeek ? 'Not scheduled' : 'To schedule', c: (pastWeek || curWeek) && !firstWeek ? 'warn' : '' };
      const s = WK_ST[st.c] || (st.c === 'now' ? 'now' : 'unknown');
      const b = el('button', 'wk-slot'); b.type = 'button'; b.dataset.s = s; b.setAttribute('aria-pressed', String(sel === i)); if (sel === i) b.setAttribute('aria-controls', 'w-kinfo');
      if (x.row) b.dataset.sport = sportTok(tpOf(x.row) === 'race' ? 'run' : tpOf(x.row));
      const disc = el('span', 'wk-sdisc'); disc.append(x.n === null ? '★' : x.row ? mark(el('span', null, String(x.n)), 'week_view', 'pillar', w) : ruleSpan(String(x.n), KEY_RULE));
      const t1 = el('span', 'wk-stitle');
      if (x.row) t1.append(mark(el('span', null, title), 'week_view', restT ? null : 'title', w, restT ? 'formatted' : null));
      else t1.append(x.short ? mark(el('span', null, title), 'coach', x.shortF, bw, x.shortF ? null : 'formatted') : title);
      const d = el('span', 'wk-sday');
      if (x.row) d.append(mark(el('span', null, fDow(P(x.row.date))), 'week_view', null, w, 'formatted'), ' · ');
      d.append(x.row ? mark(el('span', null, st.t), 'week_view', null, w, 'status') : mark(el('span', null, st.t), 'coach', null, bw, 'status'));
      const top = el('span', 'wk-stop'); top.append(disc, el('span', 'wk-skey', 'Key'));
      b.append(top, t1, d); spaced(b);
      b.setAttribute('aria-label', `Key session ${x.n === null ? '' : x.n}: ${title}, ${when}, ${st.t}`);
      b.addEventListener('click', () => {
        state.keySel = sel === i ? null : { wk, i };
        renderKeys(wk, items, wv);
        { const nb = document.querySelectorAll('#w-slots .wk-slot')[i]; if (nb) nb.focus({ preventScroll: true }); }
      });
      box.append(b);
      if (sel === i) {
        const h = el('p', 'wk-kh'); { const tc = t1.cloneNode(true); tc.className = ''; h.append(el('b', null, x.n === null ? 'Key' : `Key ${x.n}`), ' · ', tc); }
        info.append(h);
        const line = (...parts) => { const q = el('p', 'ck-row-s'); q.append(...parts); info.append(q); return q; };
        if (x.row) {
          line(mark(el('span', null, fWd(P(x.row.date))), 'week_view', null, w, 'formatted'), ' · ', mark(el('span', null, st.t), 'week_view', null, w, 'status'));
          const r = x.row;
          if (r.minutes && r.type !== 'rest') {
            const q = line(); const bits = [];
            if (r.fallback_minutes) bits.push(['Min ', hmSpan(r, 'fallback_minutes')]);
            bits.push(['Plan ', hmSpan(r, 'minutes')]);
            if (r.upper_minutes && N(r.upper_minutes) !== N(r.minutes)) bits.push(['Max ', hmSpan(r, 'upper_minutes')]);
            bits.forEach((y, k) => { if (k) q.append(' · '); q.append(...y); });
          }
          if (r.why) { const q = el('p'); q.append(el('b', null, 'For: '), mark(el('span', null, r.why), 'week_view', 'why', w)); info.append(q); }
          // the coach's full session text stays in the week list (Show the full session), so the panel reads at a glance (the athlete, Nov 15)
          if (r.done_text) { const q = line('Done: ', mark(el('span', null, r.done_text), 'week_view', 'done_text', w)); if (r.rpe !== null && r.rpe !== undefined) q.append(' · effort ', mark(el('span', null, String(r.rpe)), 'week_view', 'rpe', w), ' of 10'); }
          const go = el('button', 'ck-btn ck-btn--sm wk-kgo', 'Show the full session'); go.type = 'button';
          go.addEventListener('click', () => {
            const k = itemKey(r); state.open.add(k);
            if (r.week !== state.week) state.week = r.week;
            renderWeek();
            const target = [...document.querySelectorAll('#w-days .wk-item')].find((e) => e.dataset.k === k);
            if (target) { target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true }); }
          });
          info.append(go);
        } else {
          line(when);
          if (x.text) { const q = el('p'); q.append(el('b', null, 'For: '), mark(el('span', null, x.text), 'coach', 'pillar_' + x.n, bw)); info.append(q); }
        }
      }
    });
    { const old = $('w-kinfo'); if (old) old.remove(); }
    if (sel !== null && info.childNodes.length) box.after(info);
    if (bl && (bl.energy || bl.volume || bl.objectives)) {
      const fv = true;
      const btn = el('button', 'ck-disc'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'w-fuel'); btn.dataset.ck = 'disc';
      btn.append('About this block', icon('chevron', 'ck-chev'));
      const p = el('div', 'ck-disc-panel'); p.id = 'w-fuel'; p.hidden = true;
      if (bl && bl.objectives) { const q = el('p'); q.append(el('b', null, 'Goal: '), mark(el('span', null, bl.objectives), 'coach', 'objectives', bw)); p.append(q); }
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
    $('w-prev').disabled = false; $('w-next').disabled = dayN(wk) >= dayN(monday(TODAY)) + 21; // three weeks ahead (the athlete, Nov 15, 2026: "Tentative plan made up to 3 weeks advance")
    const meta = kind('week').find((w) => w.week_start === wk);
    const ww = 'kind=week&week_start=' + wk;
    const wf = $('w-focus'); wf.replaceChildren(); wf.hidden = !meta;
    // plain reading (6.49.0; a training partner was confused by the plan card): the week note opens with its first sentence, the rest
    // (the coach's reasons, replans, fasting notes) sits behind "Read the full week note" so the days come first
    if (meta) { const fx = String(meta.focus || ''); const cut = fx.search(/\.\s/); const first = cut > 0 && cut < fx.length - 2 ? fx.slice(0, cut + 1) : fx;
      wf.append(mark(el('b', null, meta.label), 'coach', 'label', ww), '. ');
      if (first === fx) wf.append(mark(el('span', null, fx), 'coach', 'focus', ww));
      else { wf.append(mark(el('span', null, first), 'coach', null, ww, 'first-sentence'), ' ');
        const dt = el('details', 'wk-note-more'); const sm = el('summary', null, 'Read the full week note'); dt.append(sm, mark(el('span', null, fx), 'coach', 'focus', ww)); wf.append(dt); } }
    // A pencilled week (week.json week row status "pencilled", RUNBOOK coach-3s): the Sunday check-in sets the coming week
    // and pencils the two after it; the tag says the days can still move and on which Sunday the week firms up
    const pen = !!meta && String(meta.status || '') === 'pencilled';
    $('w-list').classList.toggle('wk-pencil', pen);
    if (pen) { const tag = el('p', 'wk-pentag'); tag.append(icon('edit', 'ck-i'), ' ', mark(el('b', null, 'Pencilled'), 'coach', null, ww, 'pencilled-week'), ' · '); const cd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(String(meta.check_day || '')); const chk = cd >= 0 ? dayN(wk) - 7 + cd : null; if (chk !== null && chk >= TN) tag.append('the coach checks it with you ', mark(el('span', null, fWd(P(isoN(chk)))), 'coach', null, ww, 'plan-check-day'), ' and '); tag.append('it firms up ', mark(el('span', null, fWd(P(isoN(dayN(wk) - 1)))), 'coach', null, ww, 'firms-up-sunday'), '. Days can still move; tests and races keep their dates.'); wf.append(tag); }
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
    const cells = [
      wkTile('Hours done', dv(f1(doneMin / 60), 'done-hours', wm), planMin ? ['of ', dv(f1(planMin / 60), 'plan-hours', wm), ' h'] : 'h', planMin ? '' : 'No plan for this week', planMin ? doneMin / planMin : null, wm, 'accent'),
      kIn.length ? wkTile('Key sessions', dv(String(kDone), 'key-done', wm), ['of ', dv(String(kIn.length), 'key-n', wm)], [dv(String(doneN), 'sessions-done', wm), ' of ', dv(String(plan.length), 'sessions-planned', wm), ' sessions overall'], kDone / kIn.length, wm, 'good')
        : wkTile('Sessions done', dv(String(doneN), 'sessions-done', wm), plan.length ? ['of ', dv(String(plan.length), 'sessions-planned', wm)] : '', doneRows.length > doneN ? ['+', dv(String(doneRows.length - doneN), 'sessions-unplanned', wm), ' not in the plan'] : '', plan.length ? doneN / plan.length : null, wm, 'good'),
      (() => { // Effort mix (the athlete, Nov 15, 2026, picked "Easy, steady, hard minutes" over a bare effort load number): the week's
        // rated minutes in the words of "How hard was it?", Easy (Very easy, Easy), Steady and Hard (Hard, Very hard); calc weekly
        // holds the sums. Then (the athlete on the options page: "my concern is trying to push to fill this up to have completion";
        // "always a full ring but partitioned by wedge of effort easy/steady/hard using the colors in the bar chart. there should
        // be a target ratio or mix for the week depending on the plan"): the ring is always closed, split by the rated minutes
        // with no grey to fill, and its centre is the easy share. A thin outer line is the week's planned mix: the plan's own
        // minutes summed by each planned session's intensity, as RULES.md 4 "Planned effort mix" says (the athlete picked "Add it as
        // proposed", Nov 15, 2026); PLAN_EFFORT mirrors that line and test_effort_mix.py holds the two together.
        const ez = wl ? N(wl.easy_min) || 0 : 0, sd = wl ? N(wl.steady_min) || 0 : 0, hd = wl ? N(wl.hard_min) || 0 : 0;
        const rated = ez + sd + hd, pc = (x, t) => Math.round(x / t * 100);
        const INT = PLAN_EFFORT;
        const tg = { e: 0, s: 0, h: 0 }; let guess = false;
        for (const r of plan) { const m = N(r.minutes) || 0; if (!m) continue; const k = INT[String(r.intensity || '').toLowerCase()]; if (!k) guess = true; tg[k || 'e'] += m; }
        const tAll = tg.e + tg.s + tg.h;
        const wedges = (a, b, c) => { const T = a + b + c, gap = [a, b, c].filter((x) => x > 0).length > 1 ? 1.2 : 0; let at = 0; const st = [];
          for (const [x, col] of [[a, 'var(--ck-seq-1)'], [b, 'var(--ck-seq-3)'], [c, 'var(--ck-seq-5)']]) { if (!(x > 0)) continue; const e = at + x / T * 100; st.push(`${col} ${at + (at ? gap / 2 : 0)}% ${e - gap / 2}%`, `transparent ${e - gap / 2}% ${e}%`); at = e; }
          return `conic-gradient(${st.join(', ')})`; };
        const t = el('div', 'wk-rcell wk-mix'); t.dataset.tone = 'fg-3';
        const ring = el('span', 'wk-ring wk-ring--mix'), tr = el('span', 'wk-ring-t');
        if (rated > 0) { tr.style.background = wedges(ez, sd, hd);
          tr.setAttribute('role', 'img'); tr.setAttribute('aria-label', `Effort mix of rated minutes: easy ${pc(ez, rated)}%, steady ${pc(sd, rated)}%, hard ${pc(hd, rated)}%` + (tAll ? `; planned ${pc(tg.e, tAll)}, ${pc(tg.s, tAll)}, ${pc(tg.h, tAll)}` : '')); }
        else { tr.classList.add('wk-ring-t--none'); tr.setAttribute('aria-hidden', 'true'); }
        ring.append(tr);
        if (tAll) { const o = el('span', 'wk-ring-o'); o.style.background = wedges(tg.e, tg.s, tg.h); o.setAttribute('aria-hidden', 'true'); ring.append(o); }
        const v = el('span', 'wk-ring-v'); v.append(rated ? mark(el('span', null, pc(ez, rated) + '%'), 'weekly', null, lw, 'easy_min of rated minutes') : mark(el('span', null, '—'), 'weekly', null, null, 'none'));
        ring.append(v);
        const cap = el('span', 'wk-ru');
        if (!rated) cap.append('nothing rated yet');
        else { cap.append('easy'); if (tAll) cap.append(' · plan ', mark(el('span', null, pc(tg.e, tAll) + '%'), 'week_view', null, wm ? 'week=' + wm : null, 'planned easy minutes of planned minutes'), guess ? ' estimated' : ''); }
        t.append(ring, el('span', 'wk-rl', 'Effort mix'), cap);
        return t;
      })(),
      wkTile('Strength', dv(String(strDone), 'strength-done', wm), ['of ', strOf], '', strDone / Math.max(2, strPlan), wm, 'strength'),
    ];
    // The rings are tabs over the chart below (the athlete, Nov 15, 2026: "when the rings above are selected, to look like a tab that
    // flowed down to the chart. There was too much text between it, and there's already a key at the bottom of the graph"):
    // each ring picks what the chart shows; the line of notes under the row and the Hours / Effort mix switch are gone.
    tiles.replaceChildren(...cells.map((c, i) => wkTab(c, WK_MODES[i])));

    days.replaceChildren();
    const list = $('w-list');
    // a week the coach has not written yet still shows what the season plan already fixes in it (plan.json milestones: tests,
    // checks), and says which check-in writes the week (the athlete, Nov 15, 2026: "My dashboard says my ftp test is monday ... but
    // the next week plan says un scheduled"; the Sunday check-in writes the coming Mon to Sun week, RUNBOOK coach-3s)
    const msOf = (d) => kind('milestone').filter((m) => m.date === d);
    const msLine = (m) => { const sp = el('span'); sp.append(mark(el('b', null, m.name), 'coach', 'name', 'kind=milestone&key=' + m.key), ' on ', mark(el('span', null, fWd(P(m.date))), 'coach', null, 'kind=milestone&key=' + m.key, 'formatted')); return sp; };
    if (!items.length) {
      const sun = dayN(wk) - 1, ms = kind('milestone').filter((m) => dayN(m.date) >= dayN(wk) && dayN(m.date) <= dayN(wk) + 6);
      const when = sun >= TN ? ['The coach writes it on ', fWd(P(isoN(sun))), ' at the ', RUN_AT(), ' check-in.'] : ['The coach writes it at the next ', RUN_AT(), ' check-in.'];
      const set = ms.length ? [' Already set in your season plan: ', ...ms.flatMap((m, i) => (i ? ['; ', msLine(m)] : [msLine(m)])), '.'] : [];
      cardState(list, 'empty', dayN(wk) + 6 < TN ? 'Nothing was planned or recorded this week.' : ['No day by day plan for this week yet. ', ...when, ...set]); return;
    }
    cardState(list, null);
    // the day discs from game look round three are gone: the athlete kept the list as it is (Nov 15, 2026)
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
        if (!its.length) { const ms = msOf(d); if (ms.length) { const p = el('p', 'ck-sub wk-none'); p.append(...ms.flatMap((m, i) => (i ? ['; ', msLine(m)] : [msLine(m)])), ' (season plan; the day\'s details come with the week plan)'); de.append(p); } else de.append(el('p', 'ck-sub wk-none', dayN(d) > TN ? 'No plan yet' : 'Nothing planned or recorded')); }
        if (its.length) { const ul = el('div', 'ck-list'); for (const r of its) ul.append(...[].concat(itemRow(r))); de.append(ul); }
      }
      days.append(de);
    }
  }
  // RULES.md 4 "Planned effort mix": a planned session's intensity counts toward easy (e), steady (s) or hard (h) minutes
  const PLAN_EFFORT = { easy: 'e', long: 'e', recovery: 'e', steady: 's', quality: 'h', race: 'h', test: 'h' };
  // Week totals rings as tabs (6.81.0): the order of the four rings; state.mode is the one selected
  const WK_MODES = ['hours', 'key', 'load', 'strength'];
  const WK_TITLE = { hours: 'Hours by week', key: 'Key sessions by week', load: 'Effort mix by week', strength: 'Strength sessions by week' };
  function wkTab(cell, mode) {
    const b = el('button', cell.className + ' wk-tab'); b.type = 'button'; b.dataset.tone = cell.dataset.tone; b.append(...cell.childNodes);
    b.id = 'w-tab-' + mode; b.dataset.mode = mode; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'w-load');
    const on = state.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    b.addEventListener('click', () => pickTab(mode));
    b.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return; e.preventDefault();
      const m = WK_MODES[(WK_MODES.indexOf(mode) + d + WK_MODES.length) % WK_MODES.length]; pickTab(m); const n = $('w-tab-' + m); if (n) n.focus(); });
    return b;
  }
  function pickTab(mode) {
    state.mode = mode;
    for (const b of document.querySelectorAll('#w-tiles .wk-tab')) { const on = b.dataset.mode === mode; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    drawLoad();
  }
  $('w-prev').addEventListener('click', () => { state.week = isoN(dayN(state.week) - 7); renderWeek(); });
  $('w-next').addEventListener('click', () => { state.week = isoN(dayN(state.week) + 7); renderWeek(); });

  function drawLoad() {
    const card = $('w-load'), box = $('c-load'); const wk = rowsOk('weekly'); const st = dsState('weekly');
    if (st) { if (st === 'error' && window.CKC) window.CKC.clear(box); cardState(card, st, 'The weekly totals did not arrive. Nothing saved is lost.'); return; }
    cardState(card, null);
    if (!wk) return;
    const cur = monday(TODAY), last = isoN(Math.max(dayN(cur), dayN(state.week)) + 0);
    const weeks = d3.range(11, -1, -1).map((i) => isoN(dayN(last) - 7 * i));
    const by = Object.fromEntries(wk.map((w) => [w.week, w]));
    const plannedBy = {}; for (const r of rowsOk('week_view') || []) if (r.kind === 'plan' && !['rest', 'test'].includes(r.type)) plannedBy[r.week] = (plannedBy[r.week] || 0) + (N(r.minutes) || 0) / 60;
    { const h = $('w-load-h'); if (h) h.textContent = WK_TITLE[state.mode] || WK_TITLE.hours; }
    // the dashed bar mark, named in the chart key (6.81.4)
    const refKey = (host, text) => { let kp = host.querySelector('.ck-chart-key'); if (!kp) { kp = el('p', 'ck-chart-key'); const cap = host.querySelector('.ck-chart-cap'); cap ? cap.before(kp) : host.append(kp); }
      const it = el('span'), sw = el('i', 'ck-chart-sw wk-ref-sw'); sw.setAttribute('aria-hidden', 'true'); it.append(sw, text); kp.append(it); };
    // Key sessions and Strength tabs: done per week against the week's number (3 key sessions; strength at least 2 a week,
    // the ring's own denominator), counted from the week's rows as the rings count them
    if (state.mode === 'key' || state.mode === 'strength') {
      const wv = rowsOk('week_view') || [], isKey = state.mode === 'key', ok = ['done', 'fallback', 'swapped', 'extra'];
      const cnt = (w) => { if (isKey) { const a = weekAdh(w, wv); return { n: a.kDone, of: a.kN }; }
        const it = wv.filter((r) => r.week === w); const pl = it.filter((r) => r.kind === 'plan' && r.type === 'strength').length;
        return { n: it.filter((r) => r.done_disc === 'strength' && ok.includes(r.status)).length, of: Math.max(2, pl) }; };
      const rows = weeks.map((w) => { const c = cnt(w); return { x: w, parts: { n: c.n }, ref: c.of || null, t: { week: w, ...c } }; });
      CKC().bar(box, {
        key: 'week-' + state.mode, h: 190, rows, stack: [{ key: 'n', label: isKey ? 'Key sessions done' : 'Strength sessions done', tone: isKey ? 'good' : 'strength' }],
        tone: isKey ? 'good' : 'strength', partKey: 'all', floor: 4, unit: '', vfmt: (v) => String(v), fmt: (v) => String(v),
        refLabel: null, selected: state.week, valueLabel: (v) => String(v),
        title: isKey ? 'Key sessions done by week' : 'Strength sessions done by week', window: `the 12 weeks to ${fDay(P(last))}`, period: 'week',
        marks: { source: 'week_view' }, onPick: (r) => { state.week = r.x; renderWeek(); },
        tip: (r) => ({ head: `Week of ${fDay(P(r.t.week))}`, lines: [{ text: `${r.t.n} of ${r.t.of} done` }] }),
      });
      refKey(box, isKey ? 'Key sessions planned' : 'Strength target');
      return;
    }
    const keys = ['bike', 'run', 'swim', 'strength', 'hike', 'other'];
    const hours = state.mode === 'hours';
    const MIX = [['easy', 'Easy', 'seq-1'], ['steady', 'Steady', 'seq-3'], ['hard', 'Hard', 'seq-5'], ['unrated', 'Not rated', 'fg-3']]; // effort mix, Nov 15, 2026
    // 6.87.1 (the athlete, Nov 16): a dashboard rating counts here before the morning run copies it to the repo
    const repoFeel = new Map(kind('feel_session').map((f) => [String(f.activity_id), f]));
    const grp = (e) => (e <= 3 ? 'easy' : e < 6 ? 'steady' : 'hard');
    const liveMix = (o) => { o.live = 0; if (!window.CX.live || typeof window.CX.live.forEach !== 'function') return;
      window.CX.live.forEach((d, id) => { const e = N(d && d.rpe), m = N(d && d.minutes); if (e === null || !m || !d.date || monday(String(d.date).slice(0, 10)) !== o.week) return;
        const old = repoFeel.get(String(id)), oe = old ? N(old.rpe) : null, om = old ? N(old.minutes) : null;
        if (oe !== null && om) { if (oe === e && om === m) return; o[grp(oe)] -= om / 60; } else o.rated += 1;
        o[grp(e)] += m / 60; o.live += 1; }); };
    const table = weeks.map((w) => { const o = { week: w }; for (const k of keys) o[k] = by[w] ? N(by[w][k]) || 0 : 0; o.load = by[w] ? N(by[w].load) || 0 : 0; o.rated = by[w] ? by[w].rated : 0; for (const m of ['easy', 'steady', 'hard']) o[m] = by[w] ? (N(by[w][m + '_min']) || 0) / 60 : 0; liveMix(o); o.total = keys.reduce((s, k) => s + o[k], 0); o.unrated = Math.max(0, o.total - o.easy - o.steady - o.hard); o.plan = plannedBy[w] || null; return o; });
    const present = keys.filter((k) => table.some((t) => t[k] > 0));
    const curIn = hours && weeks.includes(cur) && TN - dayN(cur) + 1 < 7 ? { x: cur, days: TN - dayN(cur) + 1, of: 7 } : null;
    { const lg = $('c-load-legend'); lg.replaceChildren(); lg.hidden = true; } // direct labels replace the legend
    // the budget band is the hours target row (home: coach/athlete/profile.json budget_hours); script-held (CHARTS.md): the 7.5 h / 100 load floors
    const hb = kind('target').find((t) => t.key === 'hours' && t.lo != null && t.hi != null);
    CKC().bar(box, {
      key: 'week-load', h: 190, rows: table.map((t) => ({ x: t.week, parts: hours ? Object.fromEntries(present.map((k) => [k, t[k]])) : Object.fromEntries(MIX.map(([k]) => [k, t[k]])), ref: hours ? t.plan : null, t })),
      stack: hours ? present.map((k) => ({ key: k, label: NAME[k], tone: SPORT_TONE[k], outline: k === 'hike' })) : MIX.map(([key, label, tone]) => ({ key, label, tone })), tone: 'series-2',
      partKey: 'all',
      floor: hours ? 7.5 : 2, unit: 'h', vfmt: f1, fmt: (v) => String(v), partial: curIn,
      bands: hours && hb && !table.some((t) => t.plan) ? [{ lo: N(hb.lo), hi: N(hb.hi), label: `${N(hb.lo)} to ${N(hb.hi)} h budget`, marks: { source: 'coach', where: 'kind=target&key=hours' } }] : [],
      refLabel: null, selected: state.week, valueLabel: (v) => `${f1(v)} h`,
      title: hours ? 'Training hours by week' : 'Easy, steady and hard hours by week', window: `the 12 weeks to ${fDay(P(last))}`, period: 'week',
      marks: { source: 'weekly', key: 'week' },
      onPick: (r) => { state.week = r.x; renderWeek(); },
      tip: (r) => { const t = r.t; return { head: `Week of ${fDay(P(t.week))}`, lines: hours ? [{ text: `${f1(t.total)} h done${t.plan ? ` · ${f1(t.plan)} h planned` : ''}` }, ...present.filter((k) => t[k] > 0).map((k) => ({ tone: SPORT_TONE[k], text: `${NAME[k]}: ${f1(t[k])} h` }))] : MIX.filter(([k]) => t[k] > 0).map(([k, lab, tone]) => ({ tone, text: `${lab}: ${f1(t[k])} h` })).concat([{ text: (t.rated ? `${t.rated} session${t.rated > 1 ? 's' : ''} rated` : 'No rated sessions') + (t.live ? `, ${t.live} saved since the morning run` : '') }]) }; },
    });
    if (hours && table.some((t) => t.plan)) refKey(box, 'Planned');
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
    // The path is drawn to two weeks past the target date (the weight target row), never past a typed date; no row in range falls back to today.
    const capN = target && target.start ? dayN(target.start) + 14 : Infinity;
    const inCap = plan.filter((p) => dayN(p.date) <= capN);
    const endD = inCap.length ? inCap[inCap.length - 1].date : TODAY;
    const rows = [...wIn.map((r) => ({ ...r })), ...plan.filter((p) => dayN(p.date) <= dayN(endD)).map((p) => ({ date: p.date, p_lo: p.lo, p_mid: p.mid, p_hi: p.hi }))].sort((a, b) => (a.date < b.date ? -1 : 1));
    const strips = kind('fuel').filter((f) => f.mode !== 'maintenance').map((f) => ({ start: f.start, end: f.end, color: 'var(--color-fg-muted)', opacity: f.mode === 'recovery_deficit' ? 0.75 : 0.35, label: f.mode === 'recovery_deficit' ? 'recovery deficit' : 'deficit' }));
    const wv = [...rows.flatMap((r) => [N(r.weight_lb), N(r.p_lo), N(r.p_hi)]), target ? N(target.lo) : null].filter((v) => v !== null);
    const yLo = Math.floor(d3.min(wv)) - 1, yHi = Math.ceil(d3.max(wv)) + 1;
    const last = wt[wt.length - 1]; const sc = (rowsOk('scorecard') || []).find((r) => r.goal === 'weight');
    // the scorecard status is a Cockpit badge (on plan = Good, off the band = Watch, no plan path = Unknown), glyph and word
    const scw = sc ? mark(badge({ on: 'good', watch: 'watch' }[sc.status] || 'unknown', sc.status_text, 'hp-wbadge'), 'scorecard', null, 'goal=weight', 'status') : null;
    const gw = $('g-weight-now'); gw.replaceChildren();
    if (last) { gw.append('Now ', mark(el('span', 'ck-fig', f1(last.avg7)), 'weight_trend', 'avg7', 'date=' + last.date), ' ' + U.wtU() + ' (', ruleSpan('7-day', 'calc.js weight_trend: 7-day average'), ')'); if (sc && sc.note) gw.append(' · ', mark(el('span', null, sc.note), 'scorecard', 'note', 'goal=weight')); if (scw) gw.append(' ', scw); }
    lineChart(box, rows, {
      key: 'weight', h: 230, digits: 0, unit: U.wtU(), xDomain: [from, endD], yDomain: [yLo, yHi], yTicks: d3.ticks(yLo, yHi, 4),
      title: 'Weight, 7-day average', window: spanName(), marks: { source: 'weight_trend', field: 'avg7', key: 'date' },
      bands: [{ lo: 'p_lo', hi: 'p_hi', tone: 'series-2', opacity: 0.14, personal: false }],
      boxes: target ? [{ start: target.start, end: target.end, lo: N(target.lo), hi: N(target.hi), label: `${f0(N(target.lo))} to ${f0(N(target.hi))} ${U.wtU()} target`, marks: { source: 'coach', where: 'kind=target&key=weight', field: 'hi' } }] : [],
      strips: strips.map((s) => ({ ...s, tone: 'fg-3' })),
      series: [
        { key: 'avg7', label: '7-day average', tone: 'series-1', connect: true, endFmt: f1 },
        { key: 'weight_lb', label: 'Weigh-in', tone: 'fg-3', dots: true, line: false, end: false },
        { key: 'p_mid', label: 'Plan', short: 'Plan', tone: 'series-2', dashed: true, connect: true },
      ],
      tipLines: (r) => [r.avg7 !== undefined ? { tone: 'series-1', text: `7-day average: ${f1(r.avg7)} ${U.wtU()}` } : null, r.weight_lb !== undefined ? { text: `Weigh-in: ${f1(r.weight_lb)} ${U.wtU()}` } : null, r.p_mid !== undefined ? { tone: 'series-2', text: `Plan: ${f1(r.p_mid)} (${f1(r.p_lo)}–${f1(r.p_hi)})` } : null].filter(Boolean),
    });
    { const lg = $('c-weight-legend'); if (lg) { lg.replaceChildren(); lg.hidden = true; } } // direct labels replace the legend
  }
  // ---------- TRENDS (the Fitness tab, page id trends; Cockpit since Phase 5) ----------
  // run best-time markers: the 5K tile and the distances its switch offers (markers.py RUN_DIST); an hour or more reads h:mm:ss
  const RT = (k) => ['5k', 'mile', '10k', 'half', 'marathon', 't40k', 't20k', 't90k', 't100k', 't100mi', 'swim100', 'swim400', 'swim750', 'swim1500'].includes(k);
  const rtime = (v) => { if (v === null || v === undefined || isNaN(v) || v < 60) return mss(v); let t = Math.round(v * 60); const h = Math.floor(t / 3600); t -= h * 3600; return `${h}:${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };
  const mss = (v) => { if (v === null || v === undefined || isNaN(v)) return '—'; let m = Math.floor(v), s = Math.round((v - m) * 60); if (s === 60) { m += 1; s = 0; } return `${m}:${pad2(s)}`; };
  const hm = (min) => { min = Math.round(min); if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; };
  const fInt = window.CX.fmt(',.0f');
  const avgOf = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  // the segmented controls on this tab are native radios (Cockpit ck-seg): sync the checked one to the state key
  function segRadio(id, value) { for (const i of document.querySelectorAll(`#${id} input`)) i.checked = i.value === String(value); }
  // a re-render rebuilds a control, so the one that was used gets the focus back
  // A Fitness tile tap keeps the tile where it was (the athlete, Nov 15, 2026: "still getting shunted to the bottom"). His phone's record
  // (store open_log/2026-11-15-jump): the app scrolls a box around the page, and as the tab redraws that box jumped near its end with
  // no scroll call from the page. So for 0.6 s after a tap the tapped tile is held at its place on screen, until a finger scrolls.
  { const sbox = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) return e; return document.scrollingElement; };
    // every open or close tap, on every tab (the athlete, Nov 16: Week and Map jumped too); a tap that scrolls on purpose (scrollIntoView) is left alone
    let intent = 0; const siv = Element.prototype.scrollIntoView; Element.prototype.scrollIntoView = function (...a) { intent = performance.now(); return siv.apply(this, a); };
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target.closest('[aria-expanded], [role=switch], #f-tiles .ft-tile, #f-bkseg, #f-sport') : null; if (!t || t.closest('.cx-tabs')) return;
      const id = t.id === 'f-bkseg' ? 'f-bike' : t.id, k = t.dataset.k, tag = t.tagName, p = (id && $(id)) || t;
      const find = () => (id && $(id)) || (k && [...document.querySelectorAll(tag + '[data-k]')].find((n) => n.dataset.k === k)) || (t.isConnected ? t : null);
      const at = performance.now(), sc = sbox(p), top = p.getBoundingClientRect().top, end = at + 600; let off = false;
      addEventListener('touchmove', () => { off = true; }, { passive: true, once: true });
      const hold = () => { const n = find(); if (off || intent > at || !n) return; const d = n.getBoundingClientRect().top - top; if (Math.abs(d) > 2) sc.scrollTop += d; if (performance.now() < end) requestAnimationFrame(hold); };
      requestAnimationFrame(hold); }, true); }
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
    // only what needs a look (the athlete, Nov 15, 2026, card "Both": the "On track: ..." line repeated what every tile already shows;
    // "Closest to a new level" stays); with nothing on Watch the line is gone
    const w = ms.filter((m) => m.status === 'watch');
    if (w.length) e.append(el('b', null, 'Watch: '), ...list(w, true), '.');
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
    if (!vr.length) { CKC().clear(box); cardState(card, 'empty', 'No sessions yet. Weeks fill in as activities sync.'); return; }
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
    const unit = m === 'time' ? 'h' : m === 'climb' ? U.elevU() : sp === 'swim' ? U.ydU() : U.distU();
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
      ' This week is lighter until it ends. History starts ', vd(fDay(P(firstW)), 'first-week', 'week=' + firstW), '.');
  }
  // Measure and sport: native radios in Cockpit segmented controls (arrow keys move); the same pairing rules as before
  for (const inp of document.querySelectorAll('#v-sport input')) inp.addEventListener('change', () => { if (!inp.checked) return; state.vSport = inp.value; if (state.vSport === 'all' && state.vMeasure === 'dist') state.vMeasure = 'time'; drawVolume(); ftFocus('#v-sport input:checked'); });
  for (const inp of document.querySelectorAll('#v-measure input')) inp.addEventListener('change', () => { if (!inp.checked) return; state.vMeasure = inp.value; if (state.vMeasure === 'dist' && state.vSport === 'all') state.vSport = 'run'; if (state.vMeasure === 'climb' && state.vSport === 'swim') state.vSport = 'all'; drawVolume(); ftFocus('#v-measure input:checked'); });

  // Heart-rate zones: one column per zone, Z1 to Z5, with the period before as a dashed mark (Nov 8, 2026)
  const ZONE_RULE = 'calc.js hrz rows: Garmin 2-minute heart-rate samples during each session';
  function renderZones() {
    segRadio('z-sport', state.zSport);
    const box = $('z-bars'), card = $('z-card');
    const st = dsState('coach');
    if (st) { if (window.CKC) box.querySelectorAll('.ck-chart').forEach((c) => CKC().clear(c)); cardState(card, st, st === 'error' ? 'The heart-rate zones did not arrive. Nothing saved is lost.' : ''); return; }
    const rows = kind('hrz'); const zr = kind('zone');
    if (!rows.length || !zr.length) { cardState(card, 'empty', ['No heart-rate zone data yet. It fills in from your watch’s ', ruleSpan('2-minute', ZONE_RULE), ' heart rate after each session.']); return; }
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
    // Zone columns (Nov 8, 2026, the athlete picked A1 "Clean" in thread "Redesign heart-rate zone chart"): Z1 to Z5 left to right,
    // height scaled to the biggest share in either period, the zone's ramp colour, the share on top, a dashed mark for the
    // period before. Each column is a button: a tap shows its time in #z-sum.
    const hasPrev = pt >= 30 && !!prevName;
    const psh = pm.map((v) => (pt ? v / pt : 0));
    const mx = Math.max(...share, ...(hasPrev ? psh : [0])) || 1;
    const pc = (v) => Math.round(v * 100) + '%';
    const zname = (z) => zdef(z).name || '';
    const wrap = el('div', 'ft-zc');
    const sentence = `Heart-rate zone time${state.zSport === 'all' ? '' : ', ' + (NAME[state.zSport] || state.zSport).toLowerCase()}, ${spanName()}: ` +
      share.map((v, i) => `Z${i + 1} ${pc(v)}`).join(', ') + (hasPrev ? `. ${prevName.charAt(0).toUpperCase() + prevName.slice(1)}: ` + psh.map((v, i) => `Z${i + 1} ${pc(v)}`).join(', ') : '') + '.';
    wrap.append(el('p', 'ck-vh', sentence));
    const leg = el('div', 'ft-zleg'); leg.setAttribute('aria-hidden', 'true');
    { const a1 = el('span'); a1.append(el('span', 'ft-zsw'), spanName()); leg.append(a1); }
    if (hasPrev) { const a2 = el('span'); a2.append(el('span', 'ft-ztick'), prevName); leg.append(a2); }
    wrap.append(leg);
    const grid = el('div', 'ft-zcols');
    const sum = $('z-sum');
    const hint = () => sum.replaceChildren('Tap a column for its time.');
    let sel = -1; const btns = [];
    const pick1 = (i) => {
      sel = sel === i ? -1 : i; btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === sel)));
      if (sel < 0) { hint(); return; }
      const z = sel + 1;
      sum.replaceChildren(mark(el('b', null, `Z${z} ${zname(z)}`), 'coach', null, zw(z), 'zone'), ': ', mark(el('span', null, cm[sel] ? hm(cm[sel]) : '0 min'), 'coach', null, 'kind=hrz', 'zone-minutes'), ` of ${hm(ct)}`);
      if (hasPrev) sum.append(` · ${prevName} `, mark(el('span', null, pc(psh[sel])), 'coach', null, 'kind=hrz', 'zone-share-before'));
    };
    share.forEach((v, i) => {
      const z = i + 1, b = el('button', 'ft-zcol' + (i === top ? ' is-top' : '')); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', `Zone ${z}${zname(z) ? ' ' + zname(z) : ''}: ${pc(v)}, ${cm[i] ? hm(cm[i]) : '0 min'}${hasPrev ? `; ${prevName} ${pc(psh[i])}` : ''}`);
      const val = mark(el('span', 'ft-zpct', pc(v)), 'coach', null, 'kind=hrz', 'zone-share');
      const well = el('span', 'ft-zwell'); well.setAttribute('aria-hidden', 'true');
      const bar = el('i', 'ft-zbar'); bar.style.height = `${(v / mx * 100).toFixed(1)}%`; bar.style.background = `var(--ck-seq-${z})`; well.append(bar);
      if (hasPrev) { const t = el('i', 'ft-zprev'); t.style.bottom = `${(psh[i] / mx * 100).toFixed(1)}%`; well.append(t); }
      const lab = el('span', 'ft-zlab'); lab.append(mark(el('b', null, `Z${z}`), 'coach', null, zw(z), 'zone'), state.zSport === 'all' ? mark(el('span', 'ck-sub', zname(z)), 'coach', 'name', zw(z)) : mark(el('span', 'ck-sub', z === 1 ? `<${N(zdef(z).hi) + 1}` : z === 5 ? `${N(zdef(z).lo)}+` : `${N(zdef(z).lo)}–${N(zdef(z).hi)}`), 'coach', null, zw(z), 'zone-range'));
      b.append(val, well, lab); b.addEventListener('click', () => pick1(i)); btns.push(b); grid.append(b);
    });
    wrap.append(grid); box.append(wrap); hint();
    const rz = (s) => { const z2 = zr.find((r) => r.set === s && N(r.zone) === 2); return z2 ? mark(el('span', null, String(N(z2.hi))), 'coach', 'hi', `kind=zone&set=${s}&zone=2`) : el('span', null, 'not set'); };
    const det = el('details', 'ft-zdet'); det.append(el('summary', null, 'How zones are measured'), `Zones are provisional (wrist HR, estimated thresholds) and get recalculated after the November tests. Time comes from Garmin's 2-minute heart rate samples during each session, stops included, so short surges are smoothed.${state.zSport === 'all' ? ' All includes hikes and swims on standard zones; walks are left out.' : ''}`);
    const nt = $('z-note'); nt.replaceChildren('Easy days stay in Recovery and Easy (Z1–2): heart rate at most ', rz('run'), ' running, ', rz('bike'), ' riding.', det);
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
    b.addEventListener('click', (e) => o.onPick(key, e));
    return b;
  }
  // refocus only after a keyboard press (6.81.5)
  const ftPick = (k, e) => { state.fit = state.fit === k ? null : k; renderFitness(); if (!e || e.detail === 0) ftFocus(`#f-tiles .ft-tile[data-k="${k}"]`); };
  // Scales (the athlete, Nov 12, 2026): every level reads against a scale; a marker row may carry other scales (field scales, JSON:
  // id, label, stage and the ladder fields). The choice belongs to the tile (a distance switch shares it).
  // Stages follow fitness and history (the athlete, Nov 14, 2026: "If a user has history that shows they had been capable of the top
  // 20% they should have it unlocked even if their current fitness is less. They should be default at the stage based on their
  // fitness. If they pass up to a new stage set up a grace period before defaulting back"). autoStage() reads the tile's own
  // history: a stage unlocks the first time any reading reaches Top 20% (or the best category of a scale with no percentiles)
  // on the stage below, and stays unlocked; the stage in use by default is the highest one current fitness earns; after a step
  // up, the stage holds through STAGE_GRACE days below the level that earned it before it drops back one stage. A pick in the
  // Scale panel (Automatic, or one unlocked scale) overrides it. The newest pick wins wherever it was made: the store's
  // metric_compare/<tile> (saved_at) or this device's cx-scales2 {id, at}, which only bridges until the store answers.
  const STAGE_GRACE = 28; // days; the athlete's pick on the grace card (Nov 14, 2026)
  const STEP_UP = /^Top (20|10|5|1|0\.5)%/;
  const scalesMemo = new WeakMap(); // Speed (6.76.0): a marker's scales text is read once per row, not on every draw
  const scalesOf = (m) => { if (!m || !m.scales) return []; if (scalesMemo.has(m)) return scalesMemo.get(m); let out = []; try { const v = typeof m.scales === 'string' ? JSON.parse(m.scales) : m.scales; out = Array.isArray(v) ? v : []; } catch (e) { out = []; } scalesMemo.set(m, out); return out; };
  const scaleTile = (m) => { const o = kind('marker').find((x) => String(x.pair || '').split(',').map((k) => k.trim()).includes(m.key)); return o ? o.key : m.key; };
  const scaleSort = (sc) => sc.slice().sort((x, y) => (Number(x.stage) || 2) - (Number(y.stage) || 2) || (y.stage_label === 'Your race') - (x.stage_label === 'Your race'));
  const stageNo = (s) => Number(s.stage) || 2;
  const scaleLevel = (m, s, v) => { if (v === null || v === undefined) return ''; const st = standingOf({ ...m, tiers: s.tiers, splits: s.splits, basis: s.basis }, v); return st.band ? st.band.label : ''; };
  // does a value earn the stage above this scale: Top 20% or better, or the best category of a scale with no percentiles
  function earnsNext(m, s, v) {
    if (v === null || v === undefined) return false; const mm = { ...m, tiers: s.tiers, splits: s.splits, basis: s.basis };
    const st = standingOf(mm, v); if (!st.band) return false; const ts = tiersOf(mm); const better = Number(m.better) || 1;
    const ranked = ts.some((t) => /^(Top|Bottom) /.test(t.label)); const best = better === 1 ? st.band.hi === null : st.band.lo === null;
    return ranked ? STEP_UP.test(st.band.label) : best;
  }
  // a tile's history, oldest first: the run and bike page calculations from the fitness rows, every other marker from its points
  function tileSeries(m) {
    if (m.section === 'calc' && (m.key === 'run' || m.key === 'bike')) { const f = rowsOk('fitness'); if (!f) return null; return f.filter((r) => r.marker === m.key && N(r.avg28) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) })); }
    return seriesFor(m);
  }
  // the automatic stage from history: { cur, unlocked, promoted (date), lastOk (last date the stage was earned), graceEnd, scale }
  function autoStage(m) {
    const sc = scaleSort(scalesOf(m)); if (sc.length < 2) return null; const rows = tileSeries(m); if (!rows) return null;
    const stages = [...new Set(sc.map(stageNo))].sort((a, b) => a - b); const scaleAt = (st) => sc.find((s) => stageNo(s) === st);
    let i = 0, top = 0, promoted = null, lastOk = null;
    const step = (date, v) => {
      while (i + 1 < stages.length && earnsNext(m, scaleAt(stages[i]), v)) { i += 1; top = Math.max(top, i); promoted = date; lastOk = date; }
      if (i > 0) { if (earnsNext(m, scaleAt(stages[i - 1]), v)) lastOk = date; else if (dayN(date) - dayN(lastOk) > STAGE_GRACE) { i -= 1; lastOk = date; } }
    };
    for (const r of rows) step(r.date, r.value);
    if (i > 0 && rows.length && TN - dayN(lastOk) > STAGE_GRACE && !earnsNext(m, scaleAt(stages[i - 1]), rows[rows.length - 1].value)) i -= 1; // no reading since: the grace still runs out
    const inGrace = i > 0 && rows.length && !earnsNext(m, scaleAt(stages[i - 1]), rows[rows.length - 1].value);
    return { cur: stages[i], unlocked: stages[top], promoted, lastOk, graceEnd: inGrace ? isoN(dayN(lastOk) + STAGE_GRACE) : null, scale: scaleAt(stages[i]), stages };
  }
  // the pick for a tile: the newer of the store's and this device's; 'auto' or none = automatic
  const localPicks = () => { try { return JSON.parse(localStorage.getItem('cx-scales2') || '{}') || {}; } catch (e) { return {}; } };
  function pickFor(tile) {
    const saved = window.CX.scaleSaved ? window.CX.scaleSaved()[tile] : null; const loc = localPicks()[tile];
    const a = saved && typeof saved === 'object' ? saved : saved ? { id: saved, at: '' } : null; const b = loc && loc.id ? loc : null;
    const p = a && b ? (String(b.at) > String(a.at) ? b : a) : a || b; return p && p.id !== 'auto' ? p.id : null;
  }
  const stateOf = new Map(); // tile → { auto, manual, scale } as last applied
  function applyScales() {
    for (const m of kind('marker')) {
      const sc = scalesOf(m); if (sc.length < 2) continue; const tile = scaleTile(m);
      const host = kind('marker').find((x) => x.key === tile) || m; const au = autoStage(host); if (!au) continue;
      const want = pickFor(tile); let s = want ? sc.find((x) => x.id === want) : null;
      if (s && stageNo(s) > au.unlocked) s = null; // a locked stage is never in use
      stateOf.set(tile, { auto: au, manual: !!s }); if (!s) s = sc.find((x) => x.id === au.scale.id) || au.scale;
      if (m.compare === s.id && m._scaled) continue;
      for (const f of ['tiers', 'splits', 'rank', 'rank_src', 'gap', 'basis', 'anchor', 'population', 'pop_norm']) m[f] = s[f];
      m.compare = s.id; m._scaled = true;
    }
  }
  function pickScale(m, id) {
    const tile = scaleTile(m); const at = new Date().toISOString(); const loc = localPicks(); loc[tile] = { id, at };
    try { localStorage.setItem('cx-scales2', JSON.stringify(loc)); localStorage.removeItem('cx-scales'); } catch (e) { /* per-viewer convenience only */ }
    if (window.CX.saveScale) window.CX.saveScale(tile, id, at);
    state.scaleOpen = m.key; applyScales(); renderFitness(); ftFocus(`#f-scales input[value="${id}"]`);
  }
  // for the Map (metrics.js), Skills and the ribbon: the stage in use, its scale's name, the stages on file, and how it got there
  function stageInfo(key) {
    const m = kind('marker').find((x) => x.key === key); const sc = scalesOf(m); if (sc.length < 2) return null;
    const cur = sc.find((s) => s.id === m.compare); if (!cur) return null; const st = stateOf.get(scaleTile(m));
    return { cur: stageNo(cur), label: cur.label, have: [...new Set(sc.map(stageNo))], manual: st ? st.manual : false, unlocked: st ? st.auto.unlocked : stageNo(cur), promoted: st ? st.auto.promoted : null, graceEnd: st && !st.manual ? st.auto.graceEnd : null };
  }
  // on the closed tile: a stage held in its grace period says so, with the date it drops back (words, not colour alone)
  function stepChip(m) { const si = stageInfo(scaleTile(m)); if (!si || !si.graceEnd) return null; const c = el('span', 'ft-chip ft-chip--up ft-subl', `Held to ${fDay(P(si.graceEnd))}`); c.title = `Below the level that earned stage ${si.cur}. It stays until ${fDay(P(si.graceEnd))}, then drops back a stage unless a reading earns it again.`; return c; }
  // on the closed tile after stepping up (the athlete, Nov 12, 2026: "Yes, after stepping up"): the stage in use, so a lower level reads as a harder ladder
  // the athlete, Nov 15, 2026 ("I thought we had badges now. This is too big"): the stage is the Map's small overlapped 1, 2, 3 badge,
  // inside the Level chip, the stage in use filled; its name is in the badge's label and title, not on the tile
  function stageChip(m) { const cur = scalesOf(m).find((s) => s.id === m.compare); const n = cur ? Number(cur.stage) || 1 : 1; if (n < 2) return null;
    const have = new Set(scalesOf(m).map((x) => Number(x.stage) || 1)); const who = String(cur.short || cur.label || cur.stage_label || 'a harder group').replace(/^IRONMAN /, '');
    const b = mark(el('span', 'mx-stage ft-stage'), 'coach', null, 'kind=marker&key=' + m.key, 'stage'); b.setAttribute('role', 'img'); b.setAttribute('aria-label', `Stage ${n} of 3: compared with ${who}`); b.title = `Stage ${n} of 3, compared with ${who}. 1 everyone, 2 your race or sport, 3 elite.`;
    for (const k of [1, 2, 3]) { const d = el('i', 'mx-stage-d' + (k === n ? ' is-cur' : have.has(k) ? '' : ' is-none'), String(k)); d.setAttribute('aria-hidden', 'true'); b.append(d); }
    return b; }
  // the badge and the Level chip share one line (the athlete, Nov 15, 2026: "If you are at stages can we abv. To lvl and get all on one
  // line?"); "Lvl" still did not fit every level name at 360 to 390 px, so the athlete picked dropping the word beside the discs (card, Nov 15).
  const withStage = (frag, badge) => { if (!badge) return frag; const chip = frag.querySelector && frag.querySelector('.ft-chip'); if (!chip) { frag.prepend(badge); return frag; }
    const k = chip.querySelector('.ft-chip-k'); if (k) k.className = 'ck-vh'; // beside the discs the chip shows only the level name; screen readers still hear "Level"
    const row = el('span', 'ft-lvrow'); chip.replaceWith(row); row.append(badge, chip); return frag; };
  function scalePicker(m, v) {
    const sc = scaleSort(scalesOf(m)); if (sc.length < 2) return null; const tile = scaleTile(m); const st = stateOf.get(tile); const au = st ? st.auto : null;
    const box = el('fieldset', 'ft-scales'); box.id = 'f-scales'; box.append(el('legend', null, 'Your path'));
    const radio = (id, checked, disabled) => { const inp = el('input'); inp.type = 'radio'; inp.name = 'f-scale-' + m.key; inp.value = id; inp.checked = checked; inp.disabled = !!disabled; if (!disabled) inp.addEventListener('change', () => { if (inp.checked) pickScale(m, id); }); return inp; };
    // No separate Automatic row (the athlete, Nov 15, 2026): the scale in use is the one checked. The scale automatic stages pick carries
    // a "Recommended by your fitness" pill; choosing it goes back to automatic, choosing another holds until you choose again.
    let last = '';
    for (const s of sc) {
      const n = stageNo(s); const locked = au && n > au.unlocked;
      const head = `Stage ${n} · ${s.stage_label || 'Your sport'}${locked ? ' · Locked' : ''}`; if (head !== last) { box.append(el('div', 'ft-stage', head)); last = head; }
      if (locked && head.endsWith('Locked') && !box.querySelector(`[data-lock="${n}"]`)) { const p = el('p', 'ft-stage-none', `Unlocks the first time a reading reaches Top 20% (or the top category) on stage ${n - 1}.`); p.dataset.lock = n; box.append(p); }
      const isAuto = !!(au && au.scale && s.id === au.scale.id); const inUse = s.id === m.compare;
      const opt = el('label', 'ft-scale-opt' + (locked ? ' is-locked' : ''));
      const t = el('span'); const lv = scaleLevel(m, s, v); t.append(el('b', null, s.label), lv ? ` · ${lv}` : '');
      const pills = el('span', 'ft-scale-pills');
      if (isAuto) pills.append(el('span', 'ft-here', 'Recommended by your fitness')); // the athlete, Nov 15, 2026: "recommended", and no "Your pick" pill
      if (pills.childNodes.length) t.append(pills);
      if (isAuto && au.graceEnd) t.append(el('span', 'ft-stage-none', ` Held to ${fDay(P(au.graceEnd))}, then back a stage unless a reading earns it again.`));
      opt.append(radio(isAuto ? 'auto' : s.id, inUse, locked), t); box.append(opt);
    }
    if (!sc.some((s) => Number(s.stage) === 3)) { box.append(el('div', 'ft-stage', 'Stage 3 · Elite'), el('p', 'ft-stage-none', 'Not on file yet. The coach is looking for one.')); }
    return box;
  }
  function renderFitness() {
    applyScales();
    const tilesBox = $('f-tiles'), card = $('f-card');
    const st = dsState('fitness') || dsState('coach');
    if (st) { $('f-expand').hidden = true; cardState(card, st, st === 'error' ? 'The fitness markers did not arrive. Nothing saved is lost.' : ''); return; }
    const fit = rowsOk('fitness');
    cardState(card, null);
    const run = fit.filter((r) => r.marker === 'run'), bike = fit.filter((r) => r.marker === 'bike');
    const calcRow = (k) => kind('marker').find((x) => x.key === k && x.section === 'calc');
    // the run and bike tiles are computed here from the fitness rows: the latest 28-day mean, its change over 8 weeks
    const RULE_28 = 'calc.js fitness: avg28, the mean of the 28 days up to the session';
    // Bike power goes stale on outdoor riding (Closed loops, the athlete's pick, option 1 of five, Nov 15, 2026): the tile names the last
    // power ride, and after 14 days with none the level chip reads Out of date, the way an old trail tile says how old it is
    const BIKE_STALE_DAYS = 14, RULE_STALE = 'app.js renderFitness: Out of date when the last power ride is more than 14 days old (BIKE_STALE_DAYS)';
    const RULE_8W = 'app.js markerSummary: the 28-day mean now against the 28 days ending 8 weeks earlier';
    const tiles = [];
    const sR = markerSummary(run, 'value', TN);
    tiles.push({ key: 'run', label: `Run pace at ${ANC().run} bpm`, value: sR ? mss(sR.now) : '—', unit: U.paceU(), delta: sR && sR.then !== null ? sR.now - sR.then : null, better: -1, rnd: (d) => Math.round(d * 60) / 60, dtext: (d) => `${mss(Math.abs(d))} ${d < 0 ? 'faster' : 'slower'}`, n: sR ? sR.n : 0, what: ['flat run', 'flat runs'], none: 'No flat runs yet', asOf: sR ? sR.asOf : null });
    const sB = markerSummary(bike, 'value', TN);
    tiles.push({ key: 'bike', label: `Bike power at ${ANC().bike} bpm`, value: sB ? f0(sB.now) : '—', unit: 'W', delta: sB && sB.then !== null ? sB.now - sB.then : null, better: 1, rnd: (d) => Math.round(d), dtext: (d) => `${d > 0 ? '+' : '−'}${f0(Math.abs(d))} W`, n: sB ? sB.n : 0, what: ['Zwift ride', 'Zwift rides'], none: 'No indoor rides with power yet', asOf: sB ? sB.asOf : null, lastD: bike.length ? Math.max(...bike.map((r) => dayN(r.date))) : null, staleAfter: BIKE_STALE_DAYS });
    { const pn = $('f-expand'); if (pn && pn.parentNode === tilesBox) tilesBox.after(pn); }
    tilesBox.replaceChildren();
    for (const t of tiles) {
      const fw = 'marker=' + t.key; const cr = calcRow(t.key);
      // the label is the calc marker row's own (the 150 and 130 bpm references are calc.js rules, CHARTS.md 10)
      const label = cr && cr.label ? mark(el('span', null, cr.label), 'coach', 'label', 'kind=marker&key=' + t.key) : ruleSpan(t.label, 'calc.js fitness: pace and power at your own easy heart rates (hr_anchor)');
      const extra = [], stale = t.staleAfter && t.lastD !== null && TN - t.lastD > t.staleAfter;
      { const src = t.key === 'run' ? run : bike; const bc = blockContext(t.key, src.filter((r) => N(r.avg28) !== null).sort((a, c) => (a.date < c.date ? -1 : 1)).map((r) => ({ date: r.date, value: N(r.avg28) })));
        if (stale) { const b = badge('watch', 'Out of date', 'ft-old'); b.setAttribute('data-rule', RULE_STALE); extra.push(b); }
        else if (bc && bc.full.length && tiersOf(bc.cm).length) { extra.push(withStage(levelBadge(levelFor(bc.cm, bc.full[bc.full.length - 1].value), t.key), stageChip(bc.cm))); const uc = stepChip(bc.cm, bc.full[bc.full.length - 1].value); if (uc) extra.push(uc); } /* no Goal chip: This block's goals is its one home */ }
      if (t.delta !== null) t.delta = t.rnd(t.delta);
      const subs = [];
      if (t.delta !== null && t.delta !== 0) subs.push([mark(el('b', null, t.dtext(t.delta)), 'fitness', null, fw, 'change-8wk'), ' vs ', ruleSpan('8 wk', RULE_8W), ' earlier']);
      else if (t.delta !== null) subs.push(['Same as ', ruleSpan('8 wk', RULE_8W), ' earlier']);
      subs.push(t.n ? [mark(el('span', null, String(t.n)), 'fitness', null, fw, 'count'), ` ${t.what[t.n === 1 ? 0 : 1]}, `, ruleSpan('28 days', RULE_28), t.asOf < TN - 1 ? [' to ', mark(el('span', null, fDay(P(isoN(t.asOf)))), 'fitness', null, fw, 'date')] : ''].flat() : t.none);
      if (t.lastD !== undefined && t.lastD !== null) { // the last power ride, always named; its age once it is out of date
        const ld = mark(el('span', null, fDay(P(isoN(t.lastD)))), 'fitness', null, fw, 'last-date'), ago = TN - t.lastD;
        if (stale) subs.splice(0, subs.length, ['Last ', t.what[0], ' ', ld, ', ', mark(el('span', null, String(ago)), 'fitness', null, fw, 'days-since-last'), ' days ago']);
        else subs.push(['Last ', t.what[0], ' ', ld]);
      }
      tilesBox.append(fitTile(t.key, { sel: state.fit, label, fig: mark(el('span', null, t.value), 'fitness', null, fw, t.key === 'run' ? 'formatted' : 'avg-28d'), unit: el('span', 'ck-unit', t.unit), extra, subs, onPick: ftPick }));
    }
    for (const m of kind('marker').filter((x) => x.section === 'fitness').sort((a, b) => a.order - b.order)) tilesBox.append(markerTile(m, state.fit, ftPick));
    groupFitness(tilesBox);
    if (!tilesBox.querySelector('.ft-tile, .mx-map')) { cardState(card, 'empty', 'No fitness markers yet. They fill in as your sessions sync.'); return; }
    const panel = $('f-expand');
    if (!placeExpand(tilesBox, panel, state.fit)) { state.fit = null; return; }
    if (state.fit === 'run' || state.fit === 'bike') { for (const id of ['f-sport', 'f-sportn']) { const o = $(id); if (o) o.remove(); } $('f-expand').querySelectorAll(':scope > .ft-basis').forEach((x) => x.remove()); $('f-detail').replaceChildren(); const wr = calcRow(state.fit); if (wr && wr.why_hr) $('f-detail').append(dLine(`Why ${String(wr.why_hr).split(' ')[0]} bpm: `, mark(el('span', null, wr.why_hr), 'coach', 'why_hr', 'kind=marker&key=' + wr.key))); drawFitChart(run, bike); }
    else { const m0 = kind('marker').find((x) => x.key === state.fit); if (!m0) { state.fit = null; return renderFitness(); } const m = sportPick(m0); drawMarker(m, $('c-fit'), $('c-fit-legend'), null, false, true); $('f-note').textContent = ''; $('f-detail').replaceChildren(markerDetail(m, { why: m.why && !m0.pair ? m.why : null })); }
  }
  // A marker row with pair names a second marker for the same tile (the athlete, Nov 8, 2026: the Aerobic engine tile, VO2max per sport). The open
  // tile gets a switch above its chart (Run / Bike, from each row's sport_label) and shows one sport at a time, with that sport's own ladder.
  // The paired row has section 'pair', so it is never a tile. One sport only: no pair, no switch. Returns the marker to draw.
  function sportPick(m) {
    for (const id of ['f-sport', 'f-sportn']) { const o = $(id); if (o) o.remove(); }
    if (m.key === 'climb') return m; // no selector on Climbing: its opened tile is the run by run chart with all three grades (the athlete, Nov 12, 2026)
    // m.pair names one paired row, or several separated by commas (Climbing: Run, Hike and Steep grade bands, the athlete Nov 8, 2026);
    // a row's seg orders the options (lowest first), else the tile's own row comes first
    const pms = String(m.pair || '').split(',').map((k) => kind('marker').find((x) => x.key === k.trim())).filter(Boolean); if (!pms.length) return m;
    const all = [m, ...pms].map((x, i) => ({ x, o: x.seg !== undefined && x.seg !== null && x.seg !== '' ? Number(x.seg) : i })).sort((a, b) => a.o - b.o).map((a) => a.x);
    const pick = all.find((x) => x.key === state.fitSport[m.key]) || m;
    const bar = el('fieldset', 'ck-seg ft-seg ft-sport'); bar.id = 'f-sport'; bar.append(el('legend', 'ck-vh', m.seg_legend || 'Sport'));
    for (const x of all) {
      const opt = el('label', 'ck-seg-opt'); const inp = el('input', 'ck-vh-input'); inp.type = 'radio'; inp.name = 'f-sport-' + m.key; inp.value = x.key; inp.checked = x === pick;
      inp.addEventListener('change', () => { if (!inp.checked) return; state.fitSport[m.key] = x.key; renderFitness(); ftFocus(`#f-sport input[value="${x.key}"]`); });
      opt.append(inp, mark(el('span', null, x.sport_label || x.label), 'coach', 'sport_label', 'kind=marker&key=' + x.key)); bar.append(opt);
    }
    // a plain line under the switch says what the chosen part measures (the athlete, Nov 15, 2026: "have the overall/runnable toggles be more explainable")
    const nt = el('p', 'ck-note ft-segnote'); nt.id = 'f-sportn'; if (pick.why) nt.append(mark(el('span', null, pick.why), 'coach', 'why', 'kind=marker&key=' + pick.key)); $('c-fit').before(bar, nt);
    return pick;
  }
  // Fitness KPIs grouped by race type and ordered by weight (the athlete, Nov 1, 2026; coach/fitness_layout.json): a header per group with its
  // current target race, a rank number on each tile, the tile's top stripe in its sport token (the only thing colour means here).
  // A KPI missing from the layout is left off the tab (W/kg rides on the FTP tile). With no layout rows the tiles stay as built.
  // Widths: 2 across, from 900 px 4 across; every tile is the same size, a short last row leaves its gap (the athlete, Nov 11, 2026).
  const FT_SPORTS = { swim: 'Swim', bike: 'Bike', run: 'Run', trail: 'Trail', strength: 'Strength', all: 'All sports' };
  function groupFitness(box) {
    let groups = kind('fit_group').sort((a, b) => N(a.order) - N(b.order)); const kpis = kind('fit_kpi');
    if (window.CX.fitOrder) groups = window.CX.fitOrder(groups); // the athlete's own order of the groups (metrics.js Reorder)
    if (!groups.length || !kpis.length) return;
    const tiles = new Map(Array.from(box.querySelectorAll(':scope > .ft-tile')).map((t) => [t.dataset.k, t]));
    const key = el('p', 'ft-key'); key.append(el('span', 'ck-vh', 'Colour key: the stripe on each tile is its sport. '));
    for (const [k, lab] of Object.entries(FT_SPORTS)) { const s = el('span', 'ft-keyi'); const i = el('i', 'ft-sw'); i.setAttribute('aria-hidden', 'true'); i.dataset.sport = sportTok(k); s.append(i, lab); key.append(s); }
    box.replaceChildren(key);
    for (const g of groups) {
      const co = window.CX.cardOrder && window.CX.cardOrder(g.key); // the athlete's own order of the cards in this group (metrics.js Reorder), else the coach's rank
      const at = (k) => (co && co.includes(k.key) ? co.indexOf(k.key) : 1000 + N(k.rank));
      const ks = kpis.filter((k) => k.group === g.key && tiles.has(k.key)).sort((a, b) => (co ? at(a) - at(b) : N(a.rank) - N(b.rank))); if (!ks.length) continue;
      const gw = 'kind=fit_group&key=' + g.key;
      const h = el('h3', 'ft-grp'); h.append(mark(el('span', 'ck-eyebrow', g.label), 'coach', 'label', gw)); if (g.race) h.append(mark(el('span', 'ft-grp-race', g.race), 'coach', 'race', gw)); box.append(h);
      ks.forEach((k) => {
        const t = tiles.get(k.key); t.dataset.sport = sportTok(k.sport);
        // every tile stays the same size, an odd last tile included (the athlete, Nov 11, 2026: tile size and placement consistent)
        const l = t.querySelector('.ft-label');
        if (l) { const rk = mark(el('span', 'ft-rk', String(k.rank)), 'coach', 'rank', 'kind=fit_kpi&key=' + k.key); rk.title = `Weight ${k.weight} of 10 for this race type: ${k.why_weight || ''}`; l.prepend(rk); t.setAttribute('aria-label', `${t.getAttribute('aria-label')}, rank ${k.rank}`); }
        box.append(t);
      });
    }
    // locked tiles, tiles the athlete added or hid, and the Add a metric list (metrics.js; the athlete, Nov 12, 2026)
    if (window.CX.metricTiles) window.CX.metricTiles(box, tiles);
    if (window.CX.pairBike) window.CX.pairBike(box);
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
  // a space between the parts of a grid or flex button, so its accessible name reads "Nov 7 Sat Trail race a past trail race ..." (the
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
    const nextText = next ? `${next.block}, from ${fDay(P(next.start))}: ` + (N(next.target) === null ? 'hold' : `Target ${vf(N(next.target))}, Strong ${vf(N(next.strong))}`) + ' (provisional)' : ''; // 6.98.0: what provisional means is in LEVELS_HELP
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
  // Bike speed at 130 bpm draws like the power chart (the athlete, Nov 15, 2026: "I also have no data for bike speed at 130 charted"):
  // each flat outdoor ride and its 28-day average, from the figure's rides (bike_speed.py)
  function speedChart(box, m) {
    const all = String(m.rides || '').split('|').map((s) => s.split(' ')).filter((p) => p.length === 2 && N(p[1]) !== null).map(([date, v]) => ({ date, value: U.speed(N(v)) }));
    if (!all.length) { box.style.removeProperty('--h'); box.replaceChildren(el('p', 'ck-note', 'No ride history yet.')); return; }
    for (const r of all) { const d = dayN(r.date), w = all.filter((x) => dayN(x.date) > d - 28 && dayN(x.date) <= d); r.avg28 = d3.mean(w, (x) => x.value); }
    const vals = all.flatMap((r) => [r.value, r.avg28]); let lo = d3.min(vals), hi = d3.max(vals); const pad = (hi - lo) * 0.15 || 0.5; lo = Math.max(0, lo - pad); hi += pad;
    lineChart(box, all, { key: 'fit-bikespeed', h: 190, today: true, main: 1, head: 0, fmt: f1, unit: U.speedU(), endUnit: U.speedU(), title: `Bike speed at ${ANC().bike} bpm, 28-day average`,
      marks: { source: 'coach', field: 'rides', where: 'kind=cat_metric&key=bikespeed', key: 'date' }, yDomain: [lo, hi], yTicks: d3.ticks(lo, hi, 4), xDomain: [all[0].date, TODAY],
      series: [{ key: 'avg28', label: '28-day average', tone: SPORT_TONE.bike, connect: false, width: 2.5 }, { key: 'value', label: 'Ride', tone: 'fg-3', dots: true, line: false, r: 3, end: false }],
      tipLines: (r) => [{ text: `${f1(r.value)} ${U.speedU()} near ${ANC().bike} bpm` }, { tone: SPORT_TONE.bike, text: `28-day average: ${f1(r.avg28)} ${U.speedU()}` }] });
  }
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
      if (closeR) { [lo, hi] = stretch(closeR, vals); if (k === 'bike' && lo < 0) lo = 0; }
      const ticks = closeR ? (() => { const step = k === 'run' ? (hi - lo > 4 ? 1 : hi - lo > 2 ? 0.5 : 0.25) : d3.tickStep(lo, hi, 4); return d3.range(Math.ceil(lo / step) * step, hi + 1e-9, step); })() : d3.ticks(lo, hi, 4);
      lineChart(box, rows, {
        key: 'fit-' + k, h: 190, narrow: pts2.length ? { h: 280 } : undefined, today: true, main: 1, head: 0, fmt: k === 'run' ? mss : f0, unit: k === 'run' ? 'min' + U.paceU() : 'W', endUnit: k === 'run' ? U.paceU() : 'W',
        words: k === 'run' ? ['slower', 'faster'] : undefined, title: k === 'run' ? `Run pace at ${ANC().run} bpm, 28-day average` : `Bike power at ${ANC().bike} bpm, 28-day average`, window: spanName(), marks: { source: 'fitness', field: 'avg28', where: 'marker=' + k, key: 'date' }, yDomain: k === 'run' ? [hi, lo] : [lo, hi], yTicks: ticks, xDomain: [spanStart(allRows), xEnd], clip: !!closeR,
        blocks: blockDraw.map((b) => ({ ...b, goal: undefined })), sublines: cm && zoom !== 'close' ? subEdges(cm) : undefined, tbands: !pts2.length ? undefined : zoom === 'close' && closeR ? subBands(cm, latest, () => basisOf('research').tone) : pts2.map((t) => ({ ...t, now: latest !== undefined && inTier(t, latest), tone: basisOf('research').tone })),
        series: [{ key: 'avg28', label: '28-day average', tone: SPORT_TONE[k], connect: false, width: 2.5 }, { key: 'value', label: k === 'run' ? 'Run' : 'Ride', tone: 'fg-3', dots: true, line: false, r: 3, end: false }],
        tipLines: (r) => k === 'run'
          ? [{ text: `${mss(r.raw)}${U.paceU()} at ${r.hr} bpm, ${f1(r.miles)} ${U.distU()}` }, { text: `At ${N(r.anchor) || ANC().run} bpm: ${mss(r.value)}${U.paceU()}` }, r.avg28 !== null ? { tone, text: `28-day average: ${mss(r.avg28)}` } : null].filter(Boolean)
          : [{ text: `${r.raw} W at ${r.hr} bpm, ${r.minutes} min` }, { text: `At ${N(r.anchor) || ANC().bike} bpm: ${f0(r.value)} W` }, r.avg28 !== null ? { tone, text: `28-day average: ${f0(r.avg28)} W` } : null].filter(Boolean),
      });
      lg.replaceChildren(); lg.hidden = true; // direct labels replace the legend
      if (blockDraw.length) box.append(zoomBar(k, renderFitness));
      note.textContent = '';
      const calcNote = k === 'run'
        ? `Each flat run’s pace, scaled to ${ANC().run} bpm with your resting heart rate. Heat raises heart rate, so part of a gain after summer is cooler weather. Estimated.`
        : `Each Zwift ride’s average power, scaled to ${ANC().bike} bpm with your resting heart rate. Indoor rides only: no power outdoors. Estimated.`;
      if (cm && latest !== undefined) {
        const vf = k === 'run' ? (v) => mss(v) + U.paceU() : (v) => f0(v) + ' W'; const sg = (g) => (k === 'run' ? `${g >= 0 ? '+' : '−'}${mss(Math.abs(g))}` : `${g >= 0 ? '+' : '−'}${f0(Math.abs(g))} W`);
        const better = k === 'run' ? -1 : 1; const edge = cur ? (better === 1 ? cur.hi : cur.lo) : null; const nextBand = cur ? ts.find((t) => (better === 1 ? t.lo === cur.hi : t.hi === cur.lo)) : null;
        const gap = edge !== null && edge !== undefined && nextBand ? `${sg(latest - edge)} vs ${nextBand.label} (${vf(edge)})` : '—';
        $('f-detail').replaceChildren(markerDetail({ ...cm, gap, rank: cur ? cur.label : '' }, { rows: bc.full, how: calcNote, goal: bc.goal, nextText: bc.nextText, line: "Line: 28-day average", lineColor: tokv(SPORT_TONE[k]), dot: `Dots: each ${k === 'run' ? 'run' : 'ride'}, scaled to ${ANC()[k]} bpm` }));
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
    // an open-ended level (Bottom 10%, Top 0.5%) has no steps of its own: it gets the marker's step count over the notional
    // width the bar already uses (closedSpan), so every tile reads in steps (the athlete, Nov 15, 2026: "bike power at 130 is one bar")
    if ((!st.sub || !st.sub.of) && (st.band.lo === null || st.band.hi === null) && st.pct !== null) {
      const n = Math.max(2, Number(m.split) || 3), x = Math.min(st.pct * n, n - 1e-9), k = Math.floor(x);
      return { label: st.band.label, bandPct: st.pct, step: k + 1, of: n, pct: x - k, notional: true, basis: st.band.basis || m.basis || 'coach' };
    }
    return { label: st.band.label, bandPct: st.pct, step: st.sub && st.sub.step ? st.sub.step : 1, of: st.sub && st.sub.of ? st.sub.of : 1, pct: pt.pct, notional: pt.notional, basis: st.band.basis || m.basis || 'coach' };
  }
  // the level and block-goal lines on a tile: a label chip ("Level", "Goal") with its value, and a meter in the sport token
  function tileMeter(pct, sentence, where, derived) {
    const bar = el('span', 'ck-zone-track ft-meter'); bar.append(el('i', 'ck-zone-fill'));
    CKC().meter(bar, { frac: pct, sentence, marks: { source: 'coach', where, derived } }); return bar;
  }
  function levelBadge(lv, key) {
    const frag = document.createDocumentFragment(); if (!lv) return frag; const w = 'kind=marker&key=' + key;
    const bd = el('span', 'ft-chip'); bd.append(el('span', 'ft-chip-k', 'Level'), ' ', mark(el('span', null, lv.label), 'coach', null, w, 'level')); frag.append(bd);
    bd.dataset.level = lv.label; const bp = lv.bandPct !== undefined ? lv.bandPct : lv.pct; bd.dataset.pct = bp === null || bp === undefined ? '' : String(bp); // read by the Map (metrics.js): the share of the whole level, now that the chip names the level, not the step
    if (lv.pct !== null && lv.of > 1) {
      // option 4 (the athlete, Nov 15, 2026): one segment per step inside the level; steps passed are full, the current one fills by
      // how far through it the reading is, steps above are empty
      const tt = `step ${lv.step} of ${lv.of}, ${Math.round(lv.pct * 100)}% through this step${lv.notional ? ' (open-ended level, shown as wide as its neighbour)' : ''}`;
      const bar = mark(el('span', 'ft-steps'), 'coach', null, w, 'level-steps'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `Level ${lv.label}: ${tt}`); bar.title = tt;
      for (let i = 1; i <= lv.of; i++) { const sg = el('span', i === lv.step ? 'ft-step is-now' : i < lv.step ? 'ft-step is-done' : 'ft-step'); const f = el('i'); f.style.width = `${i < lv.step ? 100 : i === lv.step ? Math.round(lv.pct * 100) : 0}%`; sg.append(f); bar.append(sg); }
      frag.append(bar);
    } else if (lv.pct !== null) { const tt = `${Math.round(lv.pct * 100)}% of the way to the next level${lv.notional ? ' (open-ended level, shown as wide as its neighbour)' : ''}`; const bar = tileMeter(lv.pct, `Level ${lv.label}: ${tt}`, w, 'level-progress'); bar.title = tt; frag.append(bar); }
    return frag;
  }
  // A marker tile from its coach marker row; every figure is marked from that row
  function markerTile(m, sel, onPick) {
    const w = 'kind=marker&key=' + m.key;
    const fig = m.value === '' || m.value == null ? mark(el('span', null, '—'), 'coach', null, w, 'none') : mark(el('span', null, m.value), 'coach', 'value', w);
    const rows = m.tiers && m.chart ? seriesFor(m) : []; const extra = [];
    // Two bars on one tile (the athlete, Nov 11, 2026: Sustainable trail speed and Climbing): m.bars names the rows, each bar a line with its
    // part name and own figure, then the usual Level chip and meter. Without bars the tile shows its own level as before.
    const bars = String(m.bars || '').split(',').map((k) => k.trim()).filter(Boolean).map((k) => (k === m.key ? m : kind('marker').find((x) => x.key === k))).filter(Boolean);
    if (bars.length) for (const x of bars) {
      const xw = 'kind=marker&key=' + x.key; const xr = x.tiers && x.chart ? seriesFor(x) : [];
      const ln = el('span', 'ft-barname'); ln.append(mark(el('b', null, x.sport_label || x.label), 'coach', 'sport_label', xw), x.value && x.value !== '—' ? ((u) => { const v = el('b'); v.append(mark(el('span', null, x.value), 'coach', 'value', xw), u.startsWith('/') ? u : u ? ' ' + u : ''); return v; })(String(x.unit || '').replace('/effort km', '/km')) : el('span', 'ck-sub', 'none yet'));
      extra.push(ln); if (xr.length) extra.push(withStage(levelBadge(levelFor(x, xr[xr.length - 1].value), x.key), stageChip(x))); // each bar shows the stage its own scale is on
    }
    else if (rows.length) { extra.push(withStage(levelBadge(levelFor(m, rows[rows.length - 1].value), m.key), stageChip(m))); const uc = stepChip(m, rows[rows.length - 1].value); if (uc) extra.push(uc); }
    // no Goal chip on a tile (the athlete, Nov 15, 2026: "Do we need goal target in the card if we have it at the top?"): the goal's
    // one home is This block's goals; the Focus tag on the tile points there
    const s = FT_ST[m.status];
    const b = fitTile(m.key, { sel, label: mark(el('span', null, m.tile_label || m.label), 'coach', m.tile_label ? 'tile_label' : 'label', w), fig, unit: m.unit ? mark(el('span', 'ck-unit', m.unit), 'coach', 'unit', w) : null,
      status: s ? mark(badge(s[0], s[1], 'ft-badge'), 'coach', null, w, 'status') : null, extra, subs: m.sub ? [mark(el('span', null, m.sub), 'coach', 'sub', w)] : [], onPick });
    b.setAttribute('data-source', 'coach'); b.setAttribute('data-where', w);
    return b;
  }
  // The basis of a scale band: a chart band token (series-8 research, series-2 race target, chart-threshold coach), the same tokens the chart draws
  const BASIS = { research: { label: 'Research / population', word: 'research', color: () => tokv('series-8'), tone: 'series-8' }, race: { label: 'Race target', word: 'race target', color: () => tokv('series-2'), tone: 'series-2' }, coach: { label: 'Coach estimate', word: 'coach', color: () => tokv('chart-threshold'), tone: 'chart-threshold' } };
  const basisOf = (b) => BASIS[b] || BASIS.coach;
  function tiersOf(m) { return String(m.tiers || '').split(';').filter(Boolean).map((t) => { const [label, lo, hi, note, basis] = t.split('|'); return { label, lo: lo === '' ? null : +lo, hi: hi === '' ? null : +hi, note, basis: basis || m.basis || 'coach' }; }); }
  function basisTag(b) { const t = el('span', 'ft-btag', basisOf(b).label); t.style.color = basisOf(b).color(); /* the tag names a chart band: the band's own token */ return t; }
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
  // steps inside a level are counted, never Roman numerals (the athlete, Nov 15, 2026, option 4: "getting rid of the" numerals;
  // the tile shows the level name and one bar segment per step)
  function subtiersOf(m) {
    // 3 steps per level when a row carries no split (the athlete, Nov 15, 2026: exactly 3 on every level; 6.55.5)
    const ts = tiersOf(m); const n0 = Math.max(1, Number(m.split) || 3); const better = Number(m.better) || 1; const out = [];
    const per = String(m.splits || '').split(',').filter((x) => x.trim() !== '').map(Number); // per-band sub-levels: finer near the top (the athlete, Nov 8, 2026)
    for (const [ti, t] of ts.entries()) {
      const n = ti < per.length ? Math.max(1, per[ti]) : n0;
      if (t.lo === null || t.hi === null || n === 1) { out.push({ ...t, parent: t.label }); continue; }
      const step = (t.hi - t.lo) / n;
      for (let i = 0; i < n; i++) { const lo = t.lo + step * i, hi = i === n - 1 ? t.hi : t.lo + step * (i + 1); const num = better === 1 ? i + 1 : n - i; out.push({ label: `${t.label} ${num}/${n}`, full: `${t.label}, step ${num} of ${n}`, lo, hi, parent: t.label, step: num, of: n, note: '', basis: t.basis }); }
    }
    return out;
  }
  // Close up draws the sub-levels as its bands (the athlete, Nov 5, 2026): one tint and one name per sub-tier ("Lower half II"),
  // the one the value is in bold, a solid hairline at each edge inside a band (sub), the band edges dashed (CHARTS.md 5)
  function subBands(m, v, tone) { const ts = tiersOf(m); return subtiersOf(m).map((t) => { const p = ts.find((x) => x.label === t.parent) || t; return { lo: t.lo, hi: t.hi, label: t.label, now: v !== undefined && v !== null && inTier(t, v), tone: tone(p), sub: t.hi !== null && t.hi !== p.hi }; }); }
  function subEdges(m) { const main = new Set(tiersOf(m).flatMap((t) => [t.lo, t.hi])); return subtiersOf(m).flatMap((t) => [t.lo, t.hi]).filter((v) => v !== null && !main.has(v)); }
  const inTier = (t, v) => (t.lo === null || v >= t.lo) && (t.hi === null || v < t.hi);
  function valFmt(m, short) {
    const k = m.key, u = short ? '' : (m.unit || (k === 'ftp' ? 'W' : '')); // the FTP row carries no unit
    if (k === 'swim') return (v) => `${mss(v / 60)}${short ? '' : ' ' + U.swimU()}`;
    if (RT(k)) return (v) => rtime(v);
    if (k === 'run' || k === 'trailgap') return (v) => `${mss(v)}${short ? '' : U.paceU()}`;
    if (k === 'trailspeed') return (v) => `${mss(v)}${short ? '' : ' /effort km'}`;
    if (k === 'trail') return (v) => `${mss(v)}${short ? '' : ' h'}`; // hours as h:mm (stranger test finding 8)
    if (k === 'wkg') return (v) => `${window.CX.fixed(v, 2)}${short ? '' : ' W/kg'}`;
    if (k === 'sleepreg') return (v) => `±${f0(v)}${short ? '' : ' min'}`;
    if (k === 'durability' || k === 'traildur') return (v) => `${f1(v)}%`;
    if (['bike', 'ftp', 'rhr', 'le8', 'strength', 'sauna', 'consistency', 'climb150'].includes(k)) return (v) => `${f0(v)}${u ? ' ' + u : ''}`;
    return (v) => `${f1(v)}${u ? ' ' + u : ''}`;
  }
  function deltaFmt(m) {
    const k = m.key, u = m.unit || (k === 'ftp' ? 'W' : '');
    if (k === 'swim') return (d) => `${Math.round(d)} s`;
    if (RT(k) || k === 'run' || k === 'trailgap') return (d) => mss(d) + (RT(k) ? '' : U.paceU());
    if (k === 'trailspeed') return (d) => mss(d) + ' /effort km';
    if (k === 'trail') return (d) => mss(d) + ' h';
    if (k === 'wkg') return (d) => `${window.CX.fixed(d, 2)} W/kg`;
    if (k === 'sleepreg') return (d) => `${f0(d)} min`;
    if (k === 'durability' || k === 'traildur' || k === 'le8' || k === 'vo2') return (d) => `${f1(d)} points`;
    if (['bike', 'ftp', 'rhr', 'climb150'].includes(k)) return (d) => `${f0(d)} ${u}`;
    return (d) => `${f1(d)}${u ? ' ' + u : ''}`;
  }
  function milestoneInfo(m, rows) {
    const subs = subtiersOf(m); const better = Number(m.better) || 1; if (!subs.length || !rows.length) return null;
    const latest = rows[rows.length - 1].value;
    const beyond = (v, e) => (better === 1 ? v >= e : v <= e);
    const edges = []; // the edge you cross to enter each sub-tier from the worse side
    for (const t of subs) { const e = better === 1 ? t.lo : t.hi; if (e !== null && e !== undefined) edges.push({ v: e, label: t.full || t.label }); }
    edges.sort((a, b) => (better === 1 ? a.v - b.v : b.v - a.v));
    const reached = edges.map((e) => { const first = rows.find((r) => beyond(r.value, e.v)); return first ? { ...e, date: first.date, held: beyond(latest, e.v) } : null; }).filter(Boolean);
    const next = edges.find((e) => !beyond(latest, e.v)) || null;
    const cur = subs.find((t) => inTier(t, latest)) || null; const band = tiersOf(m).find((t) => inTier(t, latest)) || null;
    const pt = band ? pctThrough(m, band, latest) : { pct: null, notional: false };
    return { latest, cur, band, pct: pt.pct, notional: pt.notional, next, reached, dist: next ? Math.abs(next.v - latest) : null };
  }
  function pctFromFront(norm, v) {
    const raw = typeof norm.breakpoints === 'string' ? JSON.parse(norm.breakpoints) : norm.breakpoints; // the runtime returns nested fields as JSON text (6.98.0: read raw, the percentile came out as 100th)
    const bp = [...raw].map((b) => [N(b[0]), N(b[1])]).sort((a, b) => a[0] - b[0]); const better = Number(norm.better) || 1;
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
  // What levels, steps and block lines are, said once for every ranked tile (6.98.0); markers.py ANCHOR keeps only what is special to a tile
  const LEVELS_HELP = [
    'Levels run from Bottom 10% to Top 0.5% of the group named in Compared with, the same way on every ranked tile.',
    'Each level has equal steps; a higher step is nearer the next level. Levels carry the evidence, steps pace your progress (coach estimate).',
    'Levels stay fixed until their source is refreshed or your age group changes. Past the last published point the edges are Estimated.',
    'The lowest and highest levels have no outer edge, so progress through them is read as if they were as wide as the level next door.',
    'Block lines: Baseline is your 28-day average on the block’s first day. Target and Strong are where the coach expects you to finish, set at the start and never moved.',
    'A new block starts from a new baseline. Earlier blocks stay on the chart; later ones are provisional until they start.',
  ];
  const sentences = (s) => String(s || '').split(/(?<=[.!?])\s+(?=[A-Z(])/).map((x) => x.trim()).filter(Boolean);
  function kvRow(dl, label, ...content) { const dt = el('dt', null, label); const dd = el('dd'); dd.append(...content.flat()); dl.append(dt, dd); return dd; }
  function keyRow(box, kind_, color, ...content) { const r = el('p', 'ft-krow'); const sw = el('i', 'ft-sw ft-sw--' + kind_); if (color) sw.style.setProperty('--sw', color); r.append(sw); const t = el('span'); t.append(...content.flat()); r.append(t); box.append(r); return r; }
  // Tile detail (6.98.0, the athlete Nov 15: labelled lines plus the chart key): key, labelled lines, then folds (DASHBOARD.md Fitness 4)
  function markerDetail(m, ctx) {
    const wrap = el('div', 'ft-det');
    const mw = 'kind=marker&key=' + m.key; const md = (txt, d, where) => mark(el('span', null, txt), 'coach', null, where || mw, d); const mf = (f) => mark(el('span', null, m[f]), 'coach', f, mw);
    let rows = ctx && ctx.rows ? ctx.rows : kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }));
    if (['consistency', 'strength', 'sauna'].includes(m.key)) {
      const full = rows.filter((r) => !/so far/.test(String(r.extra || '')));
      rows = full.map((r, i) => ({ date: r.date, value: avgOf(full.slice(Math.max(0, i - 3), i + 1).map((x) => x.value)) }));
    }
    const vf = valFmt(m), sf = valFmt(m, true), df = deltaFmt(m); const mi = milestoneInfo(m, rows);
    const ts = tiersOf(m); const latest = rows.length ? rows[rows.length - 1].value : null;
    const rankExtra = String(m.rank || '').includes(' (') ? ' (' + String(m.rank).split(' (').slice(1).join(' (') : '';
    const levelText = mi && mi.cur ? (mi.cur.parent || mi.cur.label) : String(m.rank || '').split(' (')[0]; // the level name; its step is said once, in Now
    const goal = ctx && ctx.goal ? ctx.goal : (kind('level_block').some((x) => x.key === m.key) ? (blockContext(m.key, rows) || {}).goal : null);
    const gw = goal ? `kind=level_block&key=${m.key}&block_key=${goal.block_key}` : null;

    const key = el('div', 'ft-ckey'); key.setAttribute('aria-label', 'Chart key');
    if (ts.length && levelText) keyRow(key, 'band', basisOf(m.basis).color(), 'Bands: levels');
    if (goal) {
      const race = basisOf('race').color(); const fin = fDay(P(goal.end));
      if (goal.baseline !== null && goal.baseline !== undefined) keyRow(key, 'base', race, md(`Baseline ${vf(goal.baseline)}`, 'baseline', gw), ': block start');
      if (goal.target !== null && goal.target !== undefined) keyRow(key, 'dash', race, goal.strong !== null && goal.strong !== undefined ? 'Target and Strong' : 'Target', `: block goal by ${fin}`); // their values are in This block
    }
    if (ctx && ctx.line) keyRow(key, 'line', ctx.lineColor || null, ctx.line);
    if (ctx && ctx.dot) keyRow(key, 'dot', null, ctx.dot);
    if (goal || (ctx && (ctx.line || ctx.dot))) wrap.append(key); // a bands-only key repeats the chart's own legend

    // at rest only Next and This block (the athlete, Nov 15: "way too much showing by default"); Now and the rest open under More detail
    const dl = el('dl', 'ft-kv'), dl2 = el('dl', 'ft-kv');
    if (latest !== null && levelText) {
      const dd = kvRow(dl2, 'Now', md(`${vf(latest)} · ${levelText}${mi && mi.cur && mi.cur.step ? `, step ${mi.cur.step} of ${mi.cur.of}` : ''}${m.population || m.pop_norm ? '' : rankExtra}`, 'level'));
      if (mi && mi.pct !== null && mi.band) {
        const bar = el('span', 'ck-zone-track ft-meter'); bar.append(el('i', 'ck-zone-fill'));
        const nextBand = ts.find((t) => (Number(m.better) || 1) === 1 ? t.lo === mi.band.hi : t.hi === mi.band.lo);
        CKC().meter(bar, { frac: Math.max(0, Math.min(1, mi.pct)), sentence: `${Math.round(mi.pct * 100)}% of the way through ${mi.band.label}`, marks: { source: 'coach', where: mw, derived: 'band-progress' } });
        dd.append(bar, md(`${Math.round(mi.pct * 100)}% of the way${nextBand ? '' : ' through ' + mi.band.label}`, 'band-progress')); // Next names the next level
      }
    } else if (levelText) kvRow(dl2, 'Level', md(levelText + rankExtra, 'level'));
    if (mi) {
      const wk = ['consistency', 'strength', 'sauna'].includes(m.key); const nv = wk ? (v) => `${f1(v)} ${m.key === 'consistency' ? 'days' : 'sessions'}/week` : vf, nd = wk ? (v) => `${f1(v)} per week` : df;
      kvRow(dl, 'Next', mi.next ? md(`${nv(mi.next.v)} for ${mi.next.label}, ${nd(mi.dist)} away${wk ? ' (4-week average)' : ''}`, 'milestone') : 'Top of the scale reached');
    }
    if (goal) {
      const st = goal.status === 'proposed' ? ' · proposed, waiting for your OK' : goal.status === 'provisional' ? ' · provisional until it starts' : '';
      const dd = kvRow(dl, 'This block', md(goal.text + st, 'goal-progress', gw)); kvRow(dl2, 'Block', md(`${goal.block}, ${fDay(P(goal.start))}–${fDay(P(goal.end))}`, 'block', gw));
      if (goal.pct !== null) { const bar = el('span', 'ck-zone-track ft-meter ft-meter--race'); bar.append(el('i', 'ck-zone-fill')); CKC().meter(bar, { frac: goal.pct, sentence: `Block goal: ${goal.text}`, marks: { source: 'coach', where: gw, derived: 'goal-progress' } }); dd.append(bar); }
      if (ctx && ctx.nextText) kvRow(dl2, 'Next block', md(ctx.nextText, 'next-block', 'kind=level_block&key=' + m.key));
    } else if (m.target) kvRow(dl2, 'Target', mf('target'), m.gap && m.gap !== '—' ? [' · ', md(m.gap, 'gap')] : '');
    const how = ctx && ctx.how ? ctx.how : m.how; const howS = sentences(how);
    if (howS.length) kvRow(dl2, 'Measured', ctx && ctx.how ? ruleSpan(howS[0], 'app.js drawFitChart: calculation note (calc.js fitness description)') : md(howS[0], 'how'));
    const whyS = sentences(ctx && ctx.why); if (whyS.length) kvRow(dl2, 'What it shows', md(whyS[0], 'why'));
    if (m.why_hr) kvRow(dl2, `Why ${String(m.why_hr).split(' ')[0]} bpm`, mf('why_hr'));
    // plain reading (Nov 15, 2026): "effort km" is coach shorthand; say once what it counts (trail_effort.py effort_pace, ITRA: km + gain / 100 m)
    if (m.key === 'trailspeed' || /effort km/.test(String(m.unit || ''))) kvRow(dl2, 'Effort km', 'Each km run, plus 1 km for every 100 m climbed, so hilly and flat runs compare');
    if (m.more) kvRow(dl2, 'By grade', mf('more'));
    const anc = sentences(m.anchor); const ancRace = anc.find((x) => /^Race day:/.test(x)); const ancMore = anc.slice(1).filter((x) => x !== ancRace);
    if (anc.length) kvRow(dl2, 'Compared with', md(anc[0].replace(/^Levels come from /, '').replace(/^./, (c) => c.toUpperCase()), 'anchor'));
    if (ancRace) kvRow(dl2, 'Race day', md(ancRace.replace(/^Race day:\s*/, '').replace(/^./, (c) => c.toUpperCase()), 'anchor'));
    if (m.population) kvRow(dl2, 'Percentile', mf('population'));
    else if (m.pop_norm && latest !== null) {
      const nr = kind('norm').find((x) => x.key === m.pop_norm);
      if (nr) {
        const pf = pctFromFront(nr, latest); const ord = (n) => { n = Math.round(n); const s = (10 <= n % 100 && n % 100 <= 20) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); return n + s; };
        const leg = /^hm703/.test(String(nr.key)) && !/if held/.test(String(nr.short || '')) ? ' if held for the whole leg' : '';
        kvRow(dl2, 'Percentile', md(`About ${ord(100 - pf)} of ${nr.short || nr.population}${leg} (${Math.round(pf)}% ahead of you)`, 'percentile', 'kind=norm&key=' + m.pop_norm));
      }
    }
    if (dl.children.length) wrap.append(dl);

    const moreS = [...whyS.slice(1), ...howS.slice(1)];
    if (moreS.length || dl2.children.length) { const f = section('More detail'); if (dl2.children.length) f.body.append(dl2); if (moreS.length) { const ul = el('ul', 'ft-howl'); moreS.forEach((x) => ul.append(el('li', null, x))); mark(ul, 'coach', null, mw, 'why-how-rest'); f.body.append(ul); } wrap.append(f.dt); }

    const tagWrap = el('span'); if (m.basis && ts.length) { tagWrap.append(basisTag(m.basis)); if (ts.some((t) => t.basis !== m.basis)) tagWrap.append(' with ', ...[...new Set(ts.filter((t) => t.basis !== m.basis).map((b) => b.basis))].map((b) => basisTag(b)), ' bands'); }
    const scale = section('Scale', tagWrap.childNodes.length ? tagWrap : null); const sc = scale.dt, scb = scale.body;
    const sp = scalePicker(m, latest); if (sp) { scb.append(sp); if (state.scaleOpen === m.key) { sc.open = true; state.scaleOpen = null; } }
    if (ts.length) {
      const ul = el('ul', 'ft-tiers'); mark(ul, 'coach', null, mw, 'tiers'); const curBand = mi && mi.band ? mi.band.label : String(m.rank || '').split(' (')[0];
      const subs = subtiersOf(m);
      for (const t of ts) {
        const here = t.label === curBand; const li = el('li', here ? 'is-here' : null); li.append(el(here ? 'b' : 'span', null, t.label)); if (t.basis !== m.basis) li.append(' ', basisTag(t.basis)); if (t.note) li.append(': ' + (/percentile of/.test(t.note) ? t.note.split(':')[0] : t.note));
        const mine = subs.filter((x) => x.parent === t.label && x.label !== t.label);
        if (mine.length) { const sl = el('span', 'ft-subs'); sl.append(mine.map((x) => `step ${x.step} ${sf(x.lo)}–${sf(x.hi)}${mi && mi.cur && mi.cur.label === x.label ? ' (you)' : ''}`).join(' · ')); li.append(sl); }
        ul.append(li);
      }
      scb.append(ul);
    }
    if (mi && mi.reached.length) {
      const r2 = el('div', 'ft-reached'); r2.append(el('b', null, 'Milestones reached'));
      const ul = el('ul', 'ft-howl'); mark(ul, 'coach', null, mw, 'milestones-reached');
      mi.reached.slice(-6).forEach((e) => { const li = el('li', null, `${e.label} · ${fDay(P(e.date))}${e.held ? '' : ' (slipped)'}`); if (e.held && dayN(e.date) > TN - 7) li.append(' ', el('span', 'ck-chip ft-new', 'New')); ul.append(li); });
      r2.append(ul); scb.append(r2);
    }
    if (ancMore.length) { const ul = el('ul', 'ft-howl'); mark(ul, 'coach', null, mw, 'anchor'); ancMore.forEach((x) => ul.append(el('li', null, x))); const r = el('div', 'ft-reached'); r.append(el('b', null, 'About these levels'), ul); scb.append(r); }
    if (m.pop_norm && !m.population) { const nr = kind('norm').find((x) => x.key === m.pop_norm); if (nr && nr.note) scb.append(dLine('About the comparison: ', md(`${nr.note} n about ${Number(nr.n).toLocaleString('en-US')}.`, 'percentile', 'kind=norm&key=' + m.pop_norm))); }
    if (scb.children.length) wrap.append(sc);
    if (ts.length) { const h = section('How levels and steps work'); const ul = el('ul', 'ft-howl'); LEVELS_HELP.forEach((x) => ul.append(el('li', null, x))); ul.setAttribute('data-rule', 'app.js LEVELS_HELP: the one home for what levels, steps and block lines are'); h.body.append(ul); wrap.append(h.dt); }
    return wrap;
  }
  // Climbing, run by run (the athlete, Nov 12, 2026: "use C run by run"): one column per hilly run or hike with a dot for each grade split
  // that had 3+ min in it, joined by a stem. Read each colour against its own past: steeper ground gives more height per hour at the
  // same effort (Minetti 2002), so a colour sitting higher is physics, not fitness. script-held: the three splits and their tones.
  const CLIMB_SPLITS = [['g1', '10–15%', 'series-1'], ['g2', '15–20%', 'series-2'], ['g3', '20%+', 'series-3']];
  function drawClimbRuns(m, box, lg, pts, allPts) {
    if (box.parentNode) box.parentNode.querySelectorAll(':scope > .ft-basis').forEach((x) => x.remove());
    if (lg) { lg.replaceChildren(); lg.hidden = true; }
    const runs = pts.map((p) => ({ date: p.date, v: CLIMB_SPLITS.map(([k]) => N(p[k])) })).filter((r) => r.v.some((v) => v !== null));
    const all = runs.flatMap((r) => r.v).filter((v) => v !== null);
    let lo = Math.floor(d3.min(all) / 200) * 200, hi = Math.ceil(d3.max(all) / 200) * 200; if (hi - lo < 400) { lo -= 200; hi += 200; }
    const last = CLIMB_SPLITS.map((g, i) => { const r = [...runs].reverse().find((q) => q.v[i] !== null); return r ? { v: r.v[i], date: r.date } : null; });
    const fN = (v) => Math.round(v).toLocaleString('en-US');
    const sentence = `Climbing at ${ANC().run} bpm by grade, run by run, ${spanName()}: ` + CLIMB_SPLITS.map(([, nm], i) => (last[i] ? `${nm} ${fN(last[i].v)} ${U.elevU()}/h on ${fDay(P(last[i].date))}` : `${nm} no run yet`)).join('; ') + '. Steeper ground reads higher at the same effort, so compare each grade with its own past.';
    const H = 230;
    CKC().custom(box, { key: 'marker-climb-runs', h: H, minW: 280, interactive: false, marks: { source: 'coach', field: 'g1', where: 'kind=mpt&key=climb', key: 'date' }, sentence,
      draw: ({ svg: node, W, T }) => {
        const svg = d3.select(node); const L = 44, Rr = 64, Tp = 12, B = 26;
        const d0 = P(spanStart(allPts)).getTime(), d1 = P(TODAY).getTime() + 4 * 86400000;
        const x = (iso) => L + (P(iso).getTime() - d0) / Math.max(1, d1 - d0) * (W - L - Rr);
        const y = (v) => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
        const step = hi - lo > 1600 ? 400 : 200;
        for (let v = lo; v <= hi; v += step) {
          svg.append('line').attr('x1', L).attr('x2', W - Rr).attr('y1', y(v)).attr('y2', y(v)).style('stroke', T('chart-grid'));
          svg.append('text').attr('x', L - 6).attr('y', y(v) + 4).attr('text-anchor', 'end').style('fill', T('chart-tick')).text(fN(v));
        }
        const months = d3.utcMonth.range(new Date(d0), new Date(d1)); const byYear = months.length > 14; const every = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor((W - L - Rr) / 44))));
        months.forEach((mm, i) => { if (byYear ? mm.getUTCMonth() !== 0 : i % every) return; const mx = L + (mm.getTime() - d0) / Math.max(1, d1 - d0) * (W - L - Rr); if (mx < L) return; svg.append('text').attr('x', mx).attr('y', H - 8).attr('text-anchor', 'middle').style('fill', T('chart-tick')).text(byYear ? mm.getUTCFullYear() : fMon(mm)); });
        for (const r of runs) {
          const vs = r.v.filter((v) => v !== null); const cx = x(r.date);
          if (vs.length > 1) svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', y(d3.max(vs))).attr('y2', y(d3.min(vs))).style('stroke', T('fg-3')).attr('stroke-width', 2);
          r.v.forEach((v, i) => { if (v === null) return; svg.append('circle').attr('cx', cx).attr('cy', y(v)).attr('r', 4).style('fill', T(CLIMB_SPLITS[i][2])).style('stroke', T('surface')).attr('stroke-width', 1).append('title').text(`${fDay(P(r.date))} · ${CLIMB_SPLITS[i][1]}: ${fN(v)} ft/h`); });
        }
        const ends = CLIMB_SPLITS.map(([, nm, tone], i) => (last[i] ? { y: y(last[i].v), nm, tone, v: last[i].v } : null)).filter(Boolean).sort((a, b) => a.y - b.y);
        for (let i = 0; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, i ? ends[i - 1].y + 27 : Tp + 8);
        for (let i = ends.length - 1; i >= 0; i--) ends[i].y = Math.min(ends[i].y, i < ends.length - 1 ? ends[i + 1].y - 27 : H - B - 12);
        for (const e of ends) {
          svg.append('text').attr('x', W - Rr + 8).attr('y', e.y).style('fill', T(e.tone)).style('font-weight', 700).text(e.nm);
          svg.append('text').attr('x', W - Rr + 8).attr('y', e.y + 13).style('fill', T('fg-2')).text(fN(e.v));
        }
        return { H, sentence };
      } });
    const nb = el('p', 'ck-note ft-basis'); nb.append(ruleSpan(`Each column is one hilly run or hike: a dot per grade, ${U.metric() ? 'metres' : 'ft'} per hour at ${ANC().run} bpm. Compare each colour with its own past; steeper ground reads higher at the same effort.`, 'app.js drawClimbRuns: the splits 10 to 15%, 15 to 20% and 20%+ come from trail_effort.SPLITS, each needing 3 min in the run'));
    box.before(nb);
  }
  function drawMarker(m, box, lg, note, withWhy, ownKey) { // ownKey: markerDetail draws the block key under the chart (Fitness tab, 6.98.0)
    const allPts = kind('mpt').filter((p) => p.key === m.key && N(p.value) !== null).sort((a, b) => (a.date < b.date ? -1 : 1));
    const pts = inSpan(allPts);
    box.querySelectorAll(':scope > .ft-zoom, :scope > .ft-clipnote').forEach((n) => n.remove()); // a chart with its own layout (climb, consistency) must not keep the previous tile's range bar above it
    if (lg) lg.replaceChildren();
    if (note) note.textContent = withWhy ? [m.why, m.how].filter(Boolean).join(' ') : (m.how || '');
    if (!m.chart || allPts.length < 1) { CKC().clear(box); box.replaceChildren(el('p', 'ck-note', !m.chart ? 'This marker is a status, not a measurement over time, so it has no chart.' : 'No data points yet: the chart starts with the first one.')); return; }
    if (!pts.length) { const lp = allPts[allPts.length - 1]; CKC().clear(box); const p0 = el('p', 'ck-note'); p0.append(`Nothing in ${spanName()}: the latest point is from `, mark(el('span', null, `${fDay(P(lp.date))}, ${lp.date.slice(0, 4)}`), 'coach', null, `kind=mpt&key=${m.key}&date=${lp.date}`, 'date'), '. Pick a longer range above.'); box.replaceChildren(p0); return; }
    const col = /^swim/.test(m.key) ? 'swim' : /^t\d+(k|mi)$/.test(m.key) ? 'series-1' : m.key === 'vo2' || RT(m.key) ? 'run' : 'series-1';
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
    if (m.key === 'climb' && pts.some((p) => ['g1', 'g2', 'g3'].some((k) => N(p[k]) !== null))) { drawClimbRuns(m, box, lg, pts, allPts); return; }
    const rows = pts.map((p) => ({ date: p.date, value: N(p.value), raw: N(p.raw), off: N(p.off), extra: p.extra })); // off: a session shown but not scored (durability: hard or uneven days, outdoor rides)
    const hasOff = rows.some((r) => r.off !== null);
    const hasRaw = rows.some((r) => r.raw !== null);
    const fmt = m.key === 'swim' ? (v) => mss(v / 60) : RT(m.key) ? (v) => rtime(v) : (m.key === 'trailgap' || m.key === 'trailspeed') ? (v) => mss(v) : (v) => f1(v).replace(/\.0$/, '');
    const hasBlocks = kind('level_block').some((b) => b.key === m.key); const bcm = hasBlocks ? blockContext(m.key, allPts.map((p) => ({ date: p.date, value: N(p.value), extra: p.extra }))) : null; const blockDraw = bcm ? blockDrawFor(bcm, fmt) : [];
    const bxEnd = bcm ? isoN(Math.max(TN + 28, bcm.cur ? dayN(bcm.cur.end) : TN)) : null;
    const ts = tiersOf(m); const vmin = d3.min(rows, (r) => r.value), vmax = d3.max(rows.flatMap((r) => [r.value, r.raw, r.off]).filter((v) => v !== null));
    const last = rows[rows.length - 1].value; const cur = ts.find((t) => (t.lo === null || last >= t.lo) && (t.hi === null || last < t.hi));
    const zoom = zoomOf(m.key); const inc = tierInclude(ts, vmin, vmax, zoom);
    const nearLines = blockDraw.filter((b) => b.current || dayN(b.start) > TN).flatMap((b) => b.lines.map((l) => l.v));
    const closeR = stretch(zoom === 'close' && ts.length ? closeRange(m, last) : zoom === 'near' && ts.length ? nearRange(ts, rows.flatMap((r) => [r.value, r.raw]), last) : null, rows.flatMap((r) => [r.value, r.raw, r.off])); const lowerIsBetter = (Number(m.better) || 1) === -1;
    const tbands = ts.map((t) => ({ ...t, now: cur && t.label === cur.label, tone: basisOf(t.basis).tone }));
    // Where the bands come from, said once above the chart instead of after every band name (the athlete, Nov 8, 2026). Mixed sources name
    // the bands that differ from the main one; the band tint still follows its source.
    { if (box.parentNode) box.parentNode.querySelectorAll(':scope > .ft-basis').forEach((x) => x.remove());
      if (ts.length) {
        const cnt = new Map(); for (const t of ts) cnt.set(t.basis, (cnt.get(t.basis) || 0) + 1);
        const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const odd = [...cnt.keys()].filter((b) => b !== main).map((b) => `${basisOf(b).label}: ${ts.filter((t) => t.basis === b).map((t) => t.label).join(', ')}`);
        const bl = el('p', 'ck-note ft-basis'); bl.append(ruleSpan(`Bands: ${basisOf(main).label}${odd.length ? ' · ' + odd.join(' · ') : ''}`, 'app.js drawMarker: each band carries its basis in the marker row tiers (research, race target or coach guide)'));
        box.before(bl);
      } }
    const dotTag = m.key === 'durability' && hasRaw ? 'each steady session' : hasRaw ? (/^swim/.test(m.key) ? 'each swim' : /^(p1|p5|p20|p60|t\d+(k|mi))$/.test(m.key) ? 'each ride' : 'each run') : m.key === 'durability' ? 'each long session' : m.key === 'traildur' ? 'each long trail run' : m.key === 'swim' ? 'each swim' : null;
    // level charts: the series names sit on one key line above the chart, not as floating tags inside it (the athlete, Nov 15:
    // "best 90-day effort" and "each ride" floating among the bands read as clutter)
    const lineTag = m.key === 'durability' && hasRaw ? 'middle of last 3 steady' : hasRaw ? 'best of 90 days' : m.key === 'rhr' ? '28-night average' : dotTag;
    const keyed = ts.length > 0;
    if (keyed && box.parentNode) {
      const parts = [m.chart === 'line' && lineTag ? `Line: ${lineTag}` : !hasRaw && dotTag ? `Dots: ${dotTag}` : null, hasRaw && dotTag ? `Dots: ${dotTag}` : null, hasOff ? 'Grey dots: hard, uneven or outdoor, not scored' : null].filter(Boolean);
      if (parts.length) { const kl = el('p', 'ck-note ft-basis ft-key'); kl.textContent = parts.join(' · '); box.before(kl); }
    }
    const axisL = m.key === 'trailgap' ? (U.metric() ? 'min:s per km' : 'min:s per mile') : m.key === 'trailspeed' ? 'min:s per effort km' : RT(m.key) ? (/^(half|marathon|t40k|t90k|t100k|t100mi)$/.test(m.key) ? 'time, h:mm:ss' : m.key === '10k' ? 'time' : 'time, min:s') : m.key === 'swim' ? 'min:s per 100 yd' : undefined;
    const lowerBetter = m.key === 'swim' || (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed') || m.key === 'durability' || m.key === 'traildur' || m.key === 'rhr' || m.key === 'sleepreg';
    lineChart(box, rows, {
      key: 'marker-' + m.key, h: 190, narrow: ts.length ? { h: 280 } : undefined, today: false, axisLabel: axisL, nice: !lowerBetter || m.key === 'rhr' || m.key === 'sleepreg', main: 0, head: 0, fmt, unit: m.unit || '', words: (m.key === 'swim' || (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed')) ? ['slower', 'faster'] : undefined, title: m.chart_title || m.label, window: spanName(), marks: { source: 'coach', field: 'value', where: 'kind=mpt&key=' + m.key, key: 'date' },
      yFixed: closeR ? ((m.key === 'swim' || (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed')) ? [closeR[1], closeR[0]] : closeR) : undefined, clip: !!closeR,
      yDomain: (m.key === 'swim' || (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed')) ? [d3.max([vmax, ...inc]) + (m.key === 'swim' ? 5 : 0.5), d3.min([vmin, ...inc]) - (m.key === 'swim' ? 5 : 0.5)] : undefined,
      yTicks: (m.key === 'swim' || (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed') || closeR) ? (() => { const hi = closeR ? closeR[1] : d3.max([vmax, ...inc]), lo = closeR ? closeR[0] : d3.min([vmin, ...inc]); const span = hi - lo; const step = m.key === 'swim' ? (span > 150 ? 30 : span > 60 ? 20 : span > 24 ? 5 : 2) : (RT(m.key) || m.key === 'trailgap' || m.key === 'trailspeed') ? (span > 12 ? 4 : span > 8 ? 2 : span > 3 ? 1 : 0.5) : d3.tickStep(lo, hi, 4); return d3.range(Math.ceil(lo / step) * step, hi + 1e-9, step); })() : undefined,
      yInclude: [...inc, ...(blockDraw.length && zoom !== 'close' ? nearLines : [])], blocks: blockDraw.length ? (ownKey ? blockDraw.map((b) => ({ ...b, goal: undefined })) : blockDraw) : undefined, xDomain: [spanStart(allPts), bxEnd || TODAY], today: !!bxEnd,
      tbands: !ts.length ? undefined : zoom === 'close' ? subBands(m, last, (t) => basisOf(t.basis).tone) : tbands, sublines: zoom === 'close' ? undefined : subEdges(m), yMin: ['strength', 'sauna', 'le8', 'sleepreg', 'wkg'].includes(m.key) ? 0 : undefined,
      hbands: (m.key === 'durability' || m.key === 'traildur') && !ts.length ? [[0, 5]] : undefined,
      series: [{ key: 'value', label: m.label, tone: col, dots: !hasRaw, line: m.chart === 'line', connect: m.chart === 'line', r: 3, width: hasRaw ? 2.5 : 2, smooth: hasRaw || m.key === 'rhr', tag: keyed ? undefined : lineTag }, ...(hasRaw ? [{ key: 'raw', label: m.key === 'durability' ? 'Steady session' : 'This run', tone: m.key === 'durability' ? col : 'fg-3', dots: true, line: false, r: m.key === 'durability' ? 3 : 2.5, end: false, tag: keyed ? undefined : dotTag }] : []), ...(hasOff ? [{ key: 'off', label: 'Not scored', tone: 'fg-3', dots: true, line: false, r: 2.5, end: false, tag: keyed ? undefined : 'hard, uneven or outdoor: not scored' }] : [])],
      tipLines: (r) => [{ text: `${fmt(m.key === 'durability' ? (r.raw !== null ? r.raw : r.off !== null ? r.off : r.value) : r.value)}${m.unit ? ' ' + m.unit : ''}` }, r.extra ? { text: r.extra } : null].filter(Boolean),
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
    else if (state.page === 'checkins') { renderCiStale(); if (window.CX.renderCheckins) window.CX.renderCheckins(); if (window.CX.renderTasks) window.CX.renderTasks(); }
    else if (state.page === 'week') renderWeek();
    else if (state.page === 'goals') renderGoals();
    else if (state.page === 'trends') renderTrends();
    else if (state.page === 'lifts') { if (window.CX.renderLifts) window.CX.renderLifts(); }
    else if (window.CX.renderRaces) window.CX.renderRaces(); // season.js
    window.CX.rendered = true;
  }
  window.CX.render = render;
  // the helpers season.js (loaded next) reads
  window.CX.app = { $, CKC, drawMarker, section, sentences, kvRow, plainEl, speedChart, levelUps, COL, GARMIN_MAX_H, KEY_RULE_FROM, N, P, RACE_TONE, TN, TODAY, adhOf, cardState, dayN, daysTo, dsState, el, f1, fDay, fDow, fMon, fWd, hm, icon, inDays, isoN, autoStage, kind, ladderOf, levelOf, mark, milestoneInfo, mkSpan, monday, neutralChip, nextRace, now, pad2, renderRaceTile, rowsOk, ruleSpan, seasonTile, seriesFor, skillSeries, startDay, SKILL_ICON, spaced, sportGroups, stamp, state, truthy };
  Object.assign(window.CX, { stageInfo, lineChart, legend, inSpan, spanStart, spanName, drawWeight, sportCol, sportTok, sportGroups, seasonTile, blockContext, kind, ck: { icon, badge, neutralChip, mark, ruleSpan, cardState, dsState },
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
