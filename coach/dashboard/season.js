// season.js: the Season tab (Season so far, the race timeline, the race details hub, the Season list and the roadmap) and
// the Week tab's race-week card. Moved out of app.js in Phase 7 (Nov 5, 2026) unchanged, so app.js stays well under the
// 256 KB per-file cap. Loaded right after app.js: it reads the app.js helpers from window.CX.app and registers
// window.CX.renderRaces and window.CX.renderRaceWeek, which app.js render() and renderWeek() call.
(() => {
  const { $, CKC, COL, GARMIN_MAX_H, KEY_RULE_FROM, N, P, RACE_TONE, TN, TODAY, adhOf, cardState, dayN, daysTo, dsState, el, f1, fDay, fDow, fMon, fWd, hm, icon, inDays, isoN, kind, mark, milestoneInfo, mkSpan, monday, neutralChip, nextRace, now, pad2, renderRaceTile, rowsOk, ruleSpan, seasonTile, seriesFor, spaced, sportGroups, stamp, state, truthy } = window.CX.app;
  // Race start time (the athlete, Nov 7, 2026): start_time is 'HH:MM' local at the start line, start_basis posted or expected
  // (the previous edition's time); an expected time shows with ≈, the way an approximate date does.
  const fStart = (r) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String((r && r.start_time) || '').trim()); if (!m) return ''; const h = +m[1];
    const t = m[2] === '00' && h === 0 ? 'midnight' : m[2] === '00' && h === 12 ? 'noon' : `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
    return (String(r.start_basis || '').toLowerCase() === 'posted' ? '' : '≈') + t; };

  // ---------- SEASON SO FAR (endowed progress: credit already earned) ----------
  // Phase 5: Cockpit tiles (seasonTile) with every figure, unit and date marked; the panel has the shared states.
  function renderSoFar() {
    const box = $('r-sofar-tiles'), panel = $('r-p-sofar'); if (!box) return;
    { const st = dsState('activities') || dsState('coach'); if (st) { cardState(panel, st, st === 'error' ? 'Your activities or the plan did not arrive, so the season totals cannot be added up. Nothing saved is lost.' : ''); return; } }
    const acts = rowsOk('activities'); const blocks = kind('block').sort((a, b) => (a.start < b.start ? -1 : 1));
    if (!acts || !blocks.length) { box.replaceChildren(); cardState(panel, 'empty', 'Season so far fills once the plan has a training block and your Garmin activities are in.'); return; }
    cardState(panel, null);
    const meta = kind('meta').find((r) => r.season_start); const start = [meta && meta.season_start, blocks[0].start].filter(Boolean).sort()[0]; const since = acts.filter((a) => String(a.local_start).slice(0, 10) >= start && !/walk/i.test(String(a.type)) && !/sauna/i.test(String(a.name || '')));
    const sw = meta && meta.season_start === start ? 'kind=meta&key=' + meta.key : 'kind=block&key=' + blocks[0].key;
    const hours = since.reduce((t, a) => t + (N(a.duration_min) || 0), 0) / 60; const sessions = since.length;
    const isTrail = (a) => /trail/i.test(String(a.type)), isRoad = (a) => /run/i.test(String(a.type)) && !isTrail(a), isRide = (a) => /cycl|ride|bik/i.test(String(a.type)), isSwim = (a) => /swim/i.test(String(a.type));
    const longestOf = (f) => since.filter(f).sort((a, b) => (N(b.duration_min) || 0) - (N(a.duration_min) || 0))[0];
    const sum = (f, k) => since.filter(f).reduce((t, a) => t + (N(a[k]) || 0), 0);
    const cnt = (f) => since.filter(f).length;
    let milestones = 0, latest = null;
    for (const m of kind('marker').filter((x) => x.tiers && x.chart && x.section !== 'calc')) { const rows = seriesFor(m); const mi = milestoneInfo(m, rows); const first = rows.length ? rows[0].date : null;
      // Levels climbed this season (the athlete, Oct 25): the level held now against the level held on the season start, so a level
      // regained this season counts even if it was first reached in an earlier year; markers that dropped are not subtracted here.
      if (!mi || !first) continue; const pre = rows.filter((r) => r.date < start); const atStart = pre.length ? pre[pre.length - 1] : rows.find((r) => r.date >= start);
      const m0 = atStart ? milestoneInfo(m, [atStart]) : null; const held0 = m0 ? m0.reached.length : 0; const heldNow = mi.reached.filter((e) => e.held).length;
      if (heldNow > held0) { milestones += heldNow - held0; const top = mi.reached.filter((e) => e.held).slice(-1)[0]; const better = Number(m.better) || 1;
        const hit = rows.find((r) => r.date >= start && (better === 1 ? r.value >= top.v : r.value <= top.v)); const d = hit ? hit.date : rows[rows.length - 1].date;
        if (!latest || d > latest.date) latest = { label: `${top.label} (${m.label})`, date: d, key: m.key }; } }
    const goals = kind('level_block').filter((b) => b.status === 'closed' && b.outcome);
    const lr = longestOf(isRoad), lt = longestOf(isTrail), lb = longestOf(isRide), ls = longestOf(isSwim);
    const A = 'activities', aw = (a) => 'activity_id=' + a.activity_id;
    const hrs = (f) => window.CX.fixed(sum(f, 'duration_min') / 60, 1);
    const nS = (f) => { const n = cnt(f); return [mkSpan(String(n), A, null, null, 'count'), ` session${n === 1 ? '' : 's'}`]; };
    const day = (a) => mkSpan(fDay(P(a.local_start)), A, null, aw(a), 'formatted');
    const mi = (a) => mkSpan(f1(N(a.distance_mi)), A, 'distance_mi', aw(a));
    const ft = (a) => mkSpan(Math.round(N(a.ascent_ft) || 0).toLocaleString('en-US'), A, 'ascent_ft', aw(a));
    const dur = (a) => [A, null, aw(a), 'h-min'];
    const sportT = (lab, f) => seasonTile(lab, hrs(f), 'h', [A, null, null, 'sum-hours'], nS(f));
    sportGroups(box, [
      { label: 'Overall', sport: 'all', tiles: [
        seasonTile(['Training since ', mkSpan(fDay(P(start)), 'coach', null, sw, 'season-start')], window.CX.fixed(hours, 1), 'h', [A, null, null, 'sum-hours'], [...nS(() => true).slice(0, 1), ' sessions, walks not counted']),
        seasonTile('Levels climbed', String(milestones), '', ['coach', null, 'kind=marker', 'levels-climbed'], latest ? ['latest: ', mkSpan(latest.label, 'coach', null, 'kind=marker&key=' + latest.key, 'level'), ', ', mkSpan(fDay(P(latest.date)), 'coach', null, 'kind=marker&key=' + latest.key, 'formatted')] : 'none since the season start'),
        (() => { const a = adhOf(); const s = a && a.k4w < 4; return seasonTile(s ? `Key sessions (since ${fDay(P(KEY_RULE_FROM))})` : 'Key sessions (4 wk)', a ? `${a.k4} of ${a.kN4}` : '—', '', ['week_view', null, null, 'key-done-4wk'], s ? `Key sessions done since ${fDay(P(KEY_RULE_FROM))}` : 'Key sessions done over the last 4 weeks'); })(),
        seasonTile('Block goals closed', String(goals.length), '', ['coach', null, 'kind=level_block', 'count'], goals.length ? mkSpan(goals.slice(-1)[0].outcome, 'coach', 'outcome', `kind=level_block&key=${goals.slice(-1)[0].key}&block_key=${goals.slice(-1)[0].block_key}`) : ruleSpan('first block closes Dec 20', 'season.js renderSoFar: typed "first block closes Dec 20" (row: the first level_block end)'))] },
      { label: 'Bike', sport: 'bike', tiles: cnt(isRide) ? [
        seasonTile('Riding', hrs(isRide), 'h', [A, null, null, 'sum-hours'], [...nS(isRide), ' · ', mkSpan(f1(sum(isRide, 'distance_mi')), A, null, null, 'sum-miles'), ' mi']),
        seasonTile('Longest ride', hm(N(lb.duration_min)), '', dur(lb), [mi(lb), ' mi · ', day(lb), /century|thurmont/i.test(String(lb.name || '')) ? ruleSpan(' · Civil War Century', 'season.js renderSoFar: race name typed for an activity named century or Thurmont (row: the done race on that date)') : ''])] : [] },
      { label: 'Run', sport: 'run', tiles: cnt(isRoad) ? [
        seasonTile('Road running', hrs(isRoad), 'h', [A, null, null, 'sum-hours'], [...nS(isRoad), ' · ', mkSpan(f1(sum(isRoad, 'distance_mi')), A, null, null, 'sum-miles'), ' mi']),
        seasonTile('Longest road run', hm(N(lr.duration_min)), '', dur(lr), [mi(lr), ' mi · ', day(lr)])] : [] },
      { label: 'Trail', sport: 'trail', tiles: cnt(isTrail) ? [
        seasonTile('Trail running', hrs(isTrail), 'h', [A, null, null, 'sum-hours'], [...nS(isTrail), ' · ', mkSpan(Math.round(sum(isTrail, 'ascent_ft')).toLocaleString('en-US'), A, null, null, 'sum-feet'), ' ft climbed']),
        seasonTile('Longest trail run', hm(N(lt.duration_min)), '', dur(lt), [mi(lt), ' mi · ', ft(lt), ' ft · ', day(lt)])] : [] },
      { label: 'Swim', sport: 'swim', tiles: cnt(isSwim) ? [
        seasonTile('Swimming', hrs(isSwim), 'h', [A, null, null, 'sum-hours'], [...nS(isSwim), ' · ', mkSpan(Math.round(sum(isSwim, 'distance_mi') * 1760).toLocaleString('en-US'), A, null, null, 'sum-yards'), ' yd']),
        seasonTile('Longest swim', Math.round(N(ls.distance_mi) * 1760).toLocaleString('en-US'), 'yd', [A, null, aw(ls), 'yards'], [mkSpan(hm(N(ls.duration_min)), ...dur(ls)), ' · ', day(ls)])] : [] }]);
    $('r-sofar-cap').textContent = 'credit already earned';
    const note = $('r-sofar-note'); note.replaceChildren('Hours and sessions from your Garmin activities since the season start (', mkSpan(fDay(P(start)), 'coach', null, sw, 'season-start'), '); per sport: time, sessions and the longest session since the season start, trail and road runs apart (all-time bests are under Hall of fame); levels climbed: the level each Fitness and Health marker holds now against the level it held on the season start (regained levels count; markers that slipped are not subtracted); block goals from the record. Walks and sauna are not counted as training.');
  }
  // ---------- RACES ----------
  // Race-type glyphs live once, in the index.html sprite (cx-race-*); they inherit stroke and fill from the svg or g that uses them.
  const RUSE = (k) => `<use href="#cx-race-${k}" width="24" height="24"/>`;
  const RNAME = { bike: 'Bike ride', run: 'Road race', trail: 'Trail race', tri: 'Triathlon', adventure: 'Adventure race' };
  function raceType(r) {
    const sp = String(r.sport || '').toLowerCase();
    if (/adventure/.test(sp)) return 'adventure';
    if (/triathlon/.test(sp)) return 'tri';
    if (/trail/.test(sp)) return 'trail';
    if (/ride|bike|cycl/.test(sp)) return 'bike';
    if (/run/.test(sp)) return 'run';
    const t = `${r.sport || ''} ${r.name || ''}`.toLowerCase();
    if (/adventure/.test(t)) return 'adventure';
    if (/\btriathlon\b|ironman/.test(t)) return 'tri';
    if (/trail|ultra|mountain/.test(t)) return 'trail';
    if (/ride|bike|cycl|fondo|century/.test(t)) return 'bike';
    return 'run';
  }
  const RSTAT = { registered: 'Registered', planned: 'Planned', considering: 'Considering', exploring: 'Exploring', done: 'Done' };
  const RSTAT_HELP = { registered: 'entered', planned: 'committed, registration pending', considering: 'specific event that fits the schedule', exploring: 'type and timing only, not committed' };
  // Race status chip (the athlete, Oct 25: Done green, Registered blue, Planned in the text colour, Considering dashed, Exploring dotted).
  // Phase 5: Cockpit tokens, so every word clears 4.5:1 in light and dark (Registered was 2.82:1 in dark): Registered on the
  // accent, Done on the Good colour, Planned on the text colour, each with the surface or on-accent ink. The word is the meaning.
  const statusChip = (st) => { const k = RSTAT[st] ? st : 'exploring'; const c = el('span', 'sn-rst', RSTAT[k]); c.dataset.r = k; return c; };
  function raceIcon(r) {
    const k = raceType(r); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ricon'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', RNAME[k]);
    svg.innerHTML = `<title>${RNAME[k]}</title>` + RUSE(k);
    svg.style.color = k === 'bike' ? COL().bike : k === 'run' ? COL().run : k === 'trail' ? COL().other : k === 'adventure' ? COL().adv : 'var(--ck-fg)';
    return svg;
  }
  // Out of date (shared stale state): Season so far and Hall of fame run to the last Garmin pull; one banner serves the tab.
  // Lateness follows coach/ops/data_paths.json (path garmin, max_age_hours 26), the Week, Fitness and Health rule.
  function renderSeasonStale() {
    const b = kind('build')[0], box = $('r-stale'); if (!box) return;
    const pull = b && b.garmin_pull_utc ? new Date(b.garmin_pull_utc) : null;
    const ageH = pull && !isNaN(pull) ? (now - pull) / 3600000 : null;
    const on = ageH !== null && ageH > GARMIN_MAX_H; box.hidden = !on; if (!on) return;
    const pd = `${pull.getFullYear()}-${pad2(pull.getMonth() + 1)}-${pad2(pull.getDate())}`, age = TN - dayN(pd), t = $('r-stale-t'); t.replaceChildren();
    t.append(` Season totals and records run to the Garmin pull of ${stamp(b.garmin_pull_utc)}, ${age <= 1 ? 'over a day' : age + ' days'} ago, later than the `, ruleSpan(String(GARMIN_MAX_H), 'coach/ops/data_paths.json garmin max_age_hours: 26'), ' h the pull should take. Later sessions arrive with the next pull.');
  }
  // Planned hours per week for a timeline bar: the volume text's range midpoint or single figure, else a taper's percent of the
  // block before, else the held fallback (3.5 h a taper or recovery, 5 h otherwise; data-rule, CHARTS.md section 10).
  const TL_FALLBACK = { short: 3.5, other: 5 };
  function blockHours(blocks) {
    const hrsRaw = (b) => { const m = String(b.volume || '').match(/(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*h/); if (m) return (Number(m[1]) + Number(m[2])) / 2; const m1 = String(b.volume || '').match(/(\d+(?:\.\d+)?)\s*h\/week/); if (m1) return Number(m1[1]); return null; };
    const memo = new Map();
    return (b) => {
      if (memo.has(b.key)) return memo.get(b.key);
      let v = hrsRaw(b), src = 'volume';
      if (v === null) { const pc = [...String(b.volume || '').matchAll(/(\d+)\s*%/g)].map((x) => Number(x[1])); const prev = blocks[blocks.indexOf(b) - 1]; if (pc.length && prev && hrsRaw(prev) !== null) { v = hrsRaw(prev) * pc.reduce((s2, q) => s2 + q, 0) / pc.length / 100; src = 'percent'; } }
      if (v === null) { v = /taper|pre-race/i.test(b.label + ' ' + b.name) ? TL_FALLBACK.short : /transition|recover/i.test(b.label + ' ' + b.name) ? TL_FALLBACK.short : TL_FALLBACK.other; src = 'fallback'; }
      const o = { v, src }; memo.set(b.key, o); return o;
    };
  }
  const PHASE_INIT = { Base: 'Ba', Build: 'Bu', Specific: 'Sp', Taper: 'Ta', Recover: 'Re' };
  const phaseOf = (b) => b.phase || (/taper/i.test(b.label) ? 'Taper' : /recover|transition/i.test(b.label) ? 'Recover' : 'Build');
  // A timeline or roadmap entry opened from the chart or its list: the block opens in the Roadmap, a race under its row in the
  // Season list; focus follows to the row that opened (preventScroll; the scroll itself honours Reduce Motion).
  function openBlockAt(key) {
    state.openBlock = key; renderRaces(); $('r-road').scrollIntoView({ block: 'start' });
    const b = $('r-blk-' + key); if (b) b.focus({ preventScroll: true });
  }
  function renderTimeline(races) {
    const box = $('r-timeline'), card = $('r-tl');
    const blocks = kind('block').filter((b) => b.start && b.end).sort((a, b) => (a.start < b.start ? -1 : 1));
    $('r-tl-cap').hidden = !blocks.length;
    if (!blocks.length) { if (window.CKC) window.CKC.clear(box); box.replaceChildren(); cardState(card, 'empty', 'The season timeline fills when the plan has training blocks.'); return; }
    cardState(card, null);
    const hrs = blockHours(blocks), hv = (b) => hrs(b).v;
    const PH = { Recover: 0.18, Base: 0.34, Build: 0.5, Specific: 0.72, Taper: 0.28 };
    const d0 = dayN(blocks[0].start), d1 = dayN(blocks[blocks.length - 1].end) + 1;
    const rs = races.filter((r) => dayN(r.date) >= d0 && dayN(r.date) <= d1 && r.status !== 'done');
    const later = races.filter((r) => dayN(r.date) > d1);
    const cap = $('r-tl-cap'); cap.replaceChildren(`${fDay(P(blocks[0].start))} – ${fDay(P(blocks[blocks.length - 1].end))}`); if (later.length) cap.append(' · ', mkSpan(String(later.length), 'coach', null, 'kind=race', 'count'), ` more race${later.length > 1 ? 's' : ''} after`);
    const curB = blocks.find((b) => TN >= dayN(b.start) && TN <= dayN(b.end)); const nextR = rs.find((r) => dayN(r.date) >= TN);
    CKC().custom(box, { key: 'season-timeline', h: 176, minW: 280, interactive: false, marks: { source: 'coach', where: 'kind=block' },
      sentence: `Season timeline, ${fDay(P(blocks[0].start))} to ${fDay(P(blocks[blocks.length - 1].end))}: ${blocks.length} training blocks, bar height is planned hours per week${curB ? `; now in ${curB.label}` : ''}; ${rs.length} race${rs.length === 1 ? '' : 's'} on the timeline${nextR ? `, next ${nextR.name} on ${fDay(P(nextR.date))}` : ''}.`,
      draw: ({ svg: node, W, T, m }) => {
        const H = 176, L = 30, R = 4, base = 118, topR = 30, maxBar = 70; const svg = d3.select(node);
        const x = (n) => L + (n - d0) / (d1 - d0) * (W - L - R);
        const m0 = P(isoN(d0)); let mm = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth(), 1));
        // months on one row, years on their own row below it (Phase 5: 3 px lower, so a year never touches a month initial)
        while (mm.getTime() / 86400000 <= d1) {
          const n = mm.getTime() / 86400000; if (n >= d0) { const mx = x(n); svg.append('line').attr('x1', mx).attr('x2', mx).attr('y1', topR).attr('y2', base).style('stroke', T('chart-grid')); svg.append('text').attr('x', mx + 2).attr('y', base + 35).style('fill', T('chart-tick')).text(W < 520 ? fMon(mm)[0] : fMon(mm)); if (mm.getUTCMonth() === 0) svg.append('text').attr('x', mx + 2).attr('y', base + 50).style('fill', T('chart-tick')).text(mm.getUTCFullYear()); }
          mm = new Date(Date.UTC(mm.getUTCFullYear(), mm.getUTCMonth() + 1, 1));
        }
        svg.append('text').attr('x', x(d0) + 2).attr('y', base + 50).style('fill', T('chart-tick')).text(m0.getUTCFullYear());
        const cyc = []; for (const b of blocks) { const t = b.target || ''; const lastC = cyc[cyc.length - 1]; if (lastC && lastC.t === t) lastC.z = dayN(b.end) + 1; else cyc.push({ t, a: dayN(b.start), z: dayN(b.end) + 1 }); }
        const cycBoxes = []; let nowAt = null;
        for (const c of cyc) { if (!c.t) continue; const xa = x(c.a) + 2, xz = x(c.z) - 2; if (xz - xa > 34) { const cw = m(c.t, 'bl'); cycBoxes.push([(xa + xz) / 2 - cw / 2, (xa + xz) / 2 + cw / 2]); } svg.append('path').attr('d', `M${xa},${base + 5}v4H${xz}v-4`).style('fill', 'none').style('stroke', T('fg-3')).attr('stroke-width', 1); if (xz - xa > 34) svg.append('text').attr('class', 'bl').attr('x', (xa + xz) / 2).attr('y', base + 21).attr('text-anchor', 'middle').style('fill', T('fg')).text(c.t); }
        const hmax = Math.max(8, Math.ceil(d3.max(blocks, hv) / 2) * 2);
        const yh = d3.scaleLinear([0, hmax], [base, base - maxBar]);
        const step = hmax >= 10 ? 4 : 2;
        for (let t = 0; t <= hmax; t += step) { svg.append('line').attr('x1', L).attr('x2', W - R).attr('y1', yh(t)).attr('y2', yh(t)).style('stroke', T('chart-grid')).attr('stroke-dasharray', t ? '2 3' : null); svg.append('text').attr('x', L - 4).attr('y', yh(t)).attr('dy', '0.32em').attr('text-anchor', 'end').style('fill', T('chart-tick')).text(t); }
        svg.append('text').attr('class', 'ck-c-unit').attr('x', 2).attr('y', base - maxBar - 12).style('fill', T('fg-3')).text('h/wk');
        // Phase labels (Phase 5, review fix): every bar names its phase above it, horizontally: the full name when it fits the
        // bar's measured width, else two letters (Ba, Bu, Sp, Ta, Re; the note under the chart says so). Placement follows the
        // charts.js inside-label rule: each label tries its places in order (centred, then just clear of each line that crosses
        // its bar, sliding at most half its width past the bar's edge, then one or two rows higher); the first that touches no line, race icon, bar or placed label wins, else the one touching
        // least (every label has the charts.js halo, so a line behind it breaks around the letters). A label with no place clear of the labels already placed is left out (counted in data-unlabelled; the bar's
        // tooltip, the sentence and the list below name it).
        const rows = [], stems = [];
        for (const r of rs) { const cx = x(dayN(r.date)); let row = 0; while (rows.some((p) => p.row === row && Math.abs(p.x - cx) < 22)) row++; rows.push({ x: cx, row, r }); stems.push(cx); }
        const vx = stems.concat([x(TN)]);
        const icons = rows.map((p) => { const cy = topR - 12 - p.row * 16; return [p.x - 9, p.x + 9, cy - 9, cy + 9]; });
        const over = (p, q) => p[0] < q[1] + 1 && p[1] > q[0] - 1 && p[2] < q[3] && p[3] > q[2];
        const bars = blocks.map((b) => [x(dayN(b.start)) + 1, x(dayN(b.end) + 1) - 1, base - Math.max(2, base - yh(hv(b))), base]);
        const placed = [], hits = (bx) => vx.filter((v) => v > bx[0] - 1 && v < bx[1] + 1).length + icons.filter((q) => over(bx, q)).length + bars.filter((q) => over(bx, q)).length;
        const tws = new Map(), twOf = (t) => { if (!tws.has(t)) tws.set(t, m(t, 'bl')); return tws.get(t); }; // one measure per word
        let unlabelled = 0;
        for (const b of blocks) {
          const a = dayN(b.start), z = dayN(b.end) + 1; const cur = TN >= a && TN < z, past = z <= TN;
          const h = Math.max(2, base - yh(hv(b)));
          const g = svg.append('g').style('cursor', 'pointer').on('click', () => openBlockAt(b.key));
          g.append('title').text(`${b.label}: ${b.name}, ${fDay(P(b.start))} – ${fDay(P(b.end))} · about ${f1(hv(b))} h/week planned${b.volume ? ' (' + b.volume + ')' : ''}`);
          g.append('rect').attr('x', x(a) + 1).attr('width', Math.max(2, x(z) - x(a) - 2)).attr('y', base - h).attr('height', h).attr('rx', 3)
            .style('fill', T('fg')).attr('opacity', (PH[phaseOf(b)] || 0.4) * (past ? 0.55 : 1))
            .style('stroke', cur ? T('good') : null).attr('stroke-width', cur ? 2 : null);
          const xa = x(a), xz = x(z), wpx = xz - xa, mid = (xa + xz) / 2;
          const full = phaseOf(b), forms = [full, PHASE_INIT[full] || full.slice(0, 2)];
          const cands = [];
          for (const dy of [0, -14, -28]) for (const f of forms) {
            const tw = twOf(f); if (f === full && tw + 2 > wpx) continue;
            const ly = base - h - 4 + dy; const xs = [mid];
            for (const v of vx) if (v > xa - tw && v < xz + tw) xs.push(v + 2 + tw / 2, v - 2 - tw / 2);
            for (const cx of xs) { if (cx < xa - tw / 2 + 2 || cx > xz + tw / 2 - 2 || cx - tw / 2 < 1 || cx + tw / 2 > W - 1) continue; cands.push({ f, cx, ly, bx: [cx - tw / 2, cx + tw / 2, ly - 12, ly + 2] }); }
          }
          let pick = null, best = Infinity;
          for (const c of cands) { if (placed.some((q) => over(c.bx, q))) continue; const n = hits(c.bx); if (n < best) { best = n; pick = c; } if (n === 0) break; }
          if (pick) { placed.push(pick.bx); g.append('text').attr('class', 'bl').style('fill', T('fg')).attr('font-weight', cur ? 680 : null).attr('x', pick.cx).attr('y', pick.ly).attr('text-anchor', 'middle').attr('paint-order', 'stroke').style('stroke', T('surface')).attr('stroke-width', 3).text(pick.f); }
          else unlabelled++;
          if (cur) nowAt = mid;
        }
        node.setAttribute('data-unlabelled', String(unlabelled));
        svg.append('line').attr('x1', x(TN)).attr('x2', x(TN)).attr('y1', topR - 6).attr('y2', base + 2).style('stroke', T('good')).attr('stroke-width', 1.5).attr('stroke-dasharray', '3 2');
        if (nowAt !== null) { const nw = m('now', 'bl'), free = (nx) => nx >= 2 && nx + nw <= W - 2 && !cycBoxes.some(([p, q]) => nx < q + 4 && nx + nw > p - 4);
          const nx = [x(TN) + 3, x(TN) - 3 - nw].find(free);
          if (nx !== undefined) svg.append('text').attr('class', 'bl').attr('x', nx).attr('y', base + 21).style('fill', T('good')).attr('font-weight', 680).text('now'); }
        for (const { x: cx, row, r } of rows) {
          const k = raceType(r); const col = T(RACE_TONE[k] || 'fg'); const cy = topR - 12 - row * 16;
          const g = svg.append('g').style('cursor', 'pointer').on('click', () => openRace(r.race_id, false));
          g.append('title').text(`${r.name}, ${fWd(P(r.date))}${r.priority ? ' · ' + r.priority + ' race' : ''}`);
          g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', cy + 10).attr('y2', base - 2).style('stroke', col).attr('stroke-width', r.priority === 'A' ? 1.5 : 1).attr('opacity', 0.6).attr('stroke-dasharray', r.status === 'registered' || r.status === 'planned' ? null : '2 2');
          g.append('g').attr('transform', `translate(${cx - 9},${cy - 9}) scale(${18 / 24})`).style('color', col).style('fill', 'none').style('stroke', 'currentColor').attr('stroke-width', 1.9).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').html(RUSE(k));
        }
        return { H };
      } }); // the phase-shade legend is gone: phases are labelled on their bars
    // Keyboard and screen-reader mirror of the chart (Phase 5): every block and race on it as a list row with the same open
    // action as a tap on the chart. Folded under a 44 px disclosure; open state kept while the page is open.
    const more = $('r-tl-more'), list = $('r-tl-list');
    more.setAttribute('aria-expanded', String(state.tlList)); list.hidden = !state.tlList;
    if (!more._wired) { more._wired = true; more.addEventListener('click', () => { state.tlList = !state.tlList; more.setAttribute('aria-expanded', String(state.tlList)); list.hidden = !state.tlList; }); }
    list.replaceChildren();
    const ents = [...blocks.map((b) => ({ d: b.start, b })), ...rs.map((r) => ({ d: r.date, r }))].sort((p, q) => (p.d < q.d ? -1 : p.d > q.d ? 1 : p.b ? -1 : 1));
    for (const e of ents) {
      const li = el('li'); const row = el('button', 'ck-row sn-tlrow'); row.type = 'button';
      const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t'), sub = el('span', 'ck-row-s');
      if (e.b) {
        const b = e.b, bw = 'kind=block&key=' + b.key, hb = hrs(b), cur = TN >= dayN(b.start) && TN <= dayN(b.end);
        row.id = 'r-tlb-' + b.key; row.append(icon('week'));
        t.append(mkSpan(b.label, 'coach', 'label', bw));
        sub.append(mkSpan(fDay(P(b.start)), 'coach', null, bw, 'formatted'), ' – ', mkSpan(fDay(P(b.end)), 'coach', null, bw, 'formatted'), ' · about ',
          hb.src === 'fallback' ? ruleSpan(f1(hb.v), `season.js blockHours: held fallback ${TL_FALLBACK.short} h a taper or recovery, ${TL_FALLBACK.other} h otherwise (row: the block's volume hours)`) : mkSpan(f1(hb.v), 'coach', null, bw, hb.src === 'percent' ? 'hours-from-percent' : 'hours-midpoint'), ' h/wk');
        row.setAttribute('aria-label', `Block ${b.label}: ${b.name}, ${fDay(P(b.start))} to ${fDay(P(b.end))}${cur ? ', now' : ''}. Opens it in the Roadmap.`);
        row.addEventListener('click', () => openBlockAt(b.key));
        if (cur) row.dataset.key = '1';
      } else {
        const r = e.r, rw = 'kind=race&race_id=' + r.race_id;
        row.id = 'r-tlr-' + r.race_id; row.append(raceIcon(r)); row.firstChild.setAttribute('aria-hidden', 'true');
        t.append(mkSpan(r.name, 'coach', 'name', rw));
        sub.append(mkSpan(fWd(P(r.date)), 'coach', null, rw, 'formatted'), r.priority ? ` · ${r.priority} race` : '');
        row.setAttribute('aria-label', `Race ${r.name}, ${fWd(P(r.date))}, ${RSTAT[r.status] || 'Exploring'}. Opens its details in the Season list.`);
        row.addEventListener('click', () => openRace(r.race_id, false));
      }
      main.append(t, sub); row.append(main);
      const end = el('span', 'ck-row-end'); if (e.r) end.append(statusChip(e.r.status)); else if (e.b && TN >= dayN(e.b.start) && TN <= dayN(e.b.end)) end.append(neutralChip('now')); row.append(end);
      li.append(row); list.append(li);
    }
  }
  function renderRaces() {
    renderSeasonStale();
    const r0 = nextRace(); renderRaceTile(r0, 'r', 'No race booked yet. Races appear here once one is on the calendar.');
    renderSoFar(); if (window.CX.renderRecords) window.CX.renderRecords(); if (window.CX.renderSeasonTabs) window.CX.renderSeasonTabs();
    const races = kind('race').sort((a, b) => (a.date < b.date ? -1 : 1));
    const cst = dsState('coach');
    if (cst) { $('r-tl-cap').hidden = true; $('r-doc').hidden = true; for (const id of ['r-tl', 'r-season', 'r-road']) cardState($(id), cst, cst === 'error' ? (id === 'r-tl' ? 'The plan did not arrive, so the timeline cannot be drawn. Nothing saved is lost.' : 'Not loaded.') : ''); return; }
    renderTimeline(races);
    if (!races.length) { cardState($('r-season'), 'empty', 'No races on the calendar yet.'); renderRoadmap(races); return; }
    // Race details open inline under the tapped race in the Season list, closed by default (the athlete, Nov 2, 2026)
    if (state.race && !races.some((r) => r.race_id === state.race)) state.race = null;
    const r = state.race ? races.find((x) => x.race_id === state.race) : null;
    if (r) fillRaceHub(r);
    renderSeasonList(races, r);
  }
  // One race-detail block (#r-hub: hero, until race day, plan, kit), filled for one race and moved to where it is shown:
  // under the race in the Season list, or onto the Week tab in the 7 days before a race. Kit ticks keep working because
  // the element ids never change.
  const HUB = $('r-hub');
  state.tlList = false; // the timeline list's disclosure, open state kept while the page is open
  const doneOpen = new Set((() => { try { return (localStorage.getItem('cx-done-open') || '').split(',').filter(Boolean); } catch (e) { return []; } })());
  function openRace(id, toggle) {
    state.race = toggle && state.race === id ? null : id;
    renderRaces();
    const rc = $('r-rc-' + id);
    if (state.race && HUB.previousElementSibling) HUB.previousElementSibling.scrollIntoView({ block: 'start', behavior: window.CK && CK.scrollBehavior ? CK.scrollBehavior() : 'auto' });
    if (rc) rc.focus({ preventScroll: true });
  }
  function raceWeekRace() {
    const r = nextRace(); if (!r) return null;
    const n = daysTo(r.date); return n >= 0 && n <= 7 ? r : null;
  }
  // Race week (the athlete, Nov 2, 2026): in the 7 days before a race its details also sit on the Week tab, for this week and the
  // race's own week, then go away after race day. Same block as the Season list, moved here while the Week tab is shown.
  // Here it folds to one line (closed by default, open state kept per viewer) and leaves out Until race day, which the
  // week plan below already lists.
  let rwOpen = false;
  try { rwOpen = localStorage.getItem('cx-raceweek-open') === '1'; } catch (e) { /* per-viewer convenience only */ }
  function renderRaceWeek(wk) {
    const box = $('w-race'); const r = raceWeekRace();
    const on = !!r && (wk === monday(TODAY) || wk === monday(r.date));
    box.hidden = !on; if (!on) return;
    const n = daysTo(r.date), w = 'kind=race&race_id=' + r.race_id;
    // the fold line is a Cockpit disclosure (44 px, chevron turns); its figures are marked from the race row
    const head = el('button', 'ck-disc wk-rwhead'); head.type = 'button'; head.setAttribute('aria-expanded', String(rwOpen)); head.setAttribute('aria-controls', 'r-hub');
    // the banner (Phase 6 round 2, the athlete's pick): under the week navigation, tinted with the race's sport colour (a stripe on
    // the left), "Race week · <name>" on the first line
    const t = el('span', 'wk-rwt'), ri = raceIcon(r), nm = el('b', 'wk-rwname');
    nm.append(ri, el('span', null, 'Race week · '), mark(el('span', null, r.name), 'coach', 'name', w)); t.append(nm);
    box.style.setProperty('--sp', ri.style.color);
    const line = el('span', 'ck-sub wk-rwline');
    line.append(mark(el('span', null, fWd(P(r.date))), 'coach', null, w, 'formatted'));
    if (fStart(r)) line.append(' · ', mark(el('span', null, fStart(r) + ' start'), 'coach', null, w, 'start-time'));
    line.append(' · ', mark(el('span', null, n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`), 'coach', null, w, 'days-until'));
    if (r.wx_hi != null && r.wx_hi !== '') line.append(' · ', mark(el('span', null, `${Math.round(r.wx_hi)}°`), 'coach', 'wx_hi', w), '/', mark(el('span', null, `${Math.round(r.wx_lo)}°`), 'coach', 'wx_lo', w), `F${r.wx_kind === 'forecast' ? '' : ' typical'}`);
    t.append(line);
    head.append(t, icon('chevron', 'ck-chev'));
    head.addEventListener('click', () => { rwOpen = !rwOpen; try { localStorage.setItem('cx-raceweek-open', rwOpen ? '1' : '0'); } catch (e) { /* ignore */ } renderRaceWeek(wk); const h2 = $('w-race').querySelector('.wk-rwhead'); if (h2) h2.focus({ preventScroll: true }); });
    box.replaceChildren(head, HUB);
    HUB.hidden = !rwOpen; fillRaceHub(r);
  }
  // Race plan stages fold the way the Week race card does: a 44 px fold line per stage (closed by default), the stage's text
  // under it; the open stages are kept while the page is open (race id and stage). Toggled in place, focus stays.
  const planOpen = new Set();
  function fillRaceHub(r) {
    const rwh = 'kind=race&race_id=' + r.race_id; // marks (Phase 5, Week pass): the hub's figures name the race row
    const hero = $('r-hero'); hero.replaceChildren();
    const n = daysTo(r.date);
    const head = el('div', 'ck-tile-head sn-hhead'); const eb = el('span', 'sn-heb'); eb.append(statusChip(r.status)); if (r.priority) eb.append(el('span', 'ck-eyebrow', `${r.priority} race`));
    const when = el('span', 'ck-sub'); when.append(mkSpan(fWd(P(r.date)), 'coach', null, rwh, 'formatted')); if (fStart(r)) when.append(' · ', mkSpan(fStart(r) + ' start', 'coach', null, rwh, 'start-time'));
    head.append(eb, when);
    const name = el('h2', 'ck-h3 sn-hname'); name.append(raceIcon(r), mkSpan(r.name, 'coach', 'name', rwh));
    const cnt = el('div', 'sn-count'); const big = el('span', 'ck-big'); big.append(mkSpan(n >= 0 ? String(n) : '✓', 'coach', null, rwh, 'days-until')); cnt.append(big, el('span', 'ck-unit', n === 1 ? 'day to go' : n >= 0 ? 'days to go' : 'done'));
    const dl = el('dl', 'sn-facts');
    const startDd = () => { if (!fStart(r)) return null; const dd = el('dd'); dd.append(mkSpan(fStart(r), 'coach', null, rwh, 'start-time'), String(r.start_basis || '').toLowerCase() === 'posted' ? ' (posted)' : ' (last edition\'s time, not yet posted)');
      if (r.start_note) { dd.append(el('br')); dd.append(mark(el('small', 'ck-sub', r.start_note), 'coach', 'start_note', rwh)); } return dd; };
    for (const [k, v, f] of [['Where', r.location, 'location'], ['Distance', r.distance, 'distance'], ['Start', startDd, null], ['Result', r.result, 'result'], ['Goal', r.goal, 'goal'], ['Registration', r.status !== 'registered' && r.registration ? `${r.registration}${r.reg_checked ? ' (checked ' + fDay(P(r.reg_checked)) + ')' : ''}` : '', null], ['Forecast', r.forecast, 'forecast'], ['Limit', r.limit, 'limit']]) { if (typeof v === 'function') { const dd = v(); if (dd) dl.append(el('dt', null, k), dd); } else if (v) dl.append(el('dt', null, k), mark(el('dd', null, v), 'coach', f, rwh, f ? null : 'formatted')); }
    hero.append(head, name, cnt);
    if (r.status === 'done' && r.stats) { const st = el('div', 'sn-stats'); for (const pair of String(r.stats).split(';')) { const [v, l] = pair.split('|'); const s1 = mark(el('span'), 'coach', null, rwh, 'stats'); s1.append(el('b', null, v), l || ''); st.append(s1); } hero.append(st); }
    hero.append(dl);
    if (r.wx_hi != null && r.wx_hi !== '' && r.status !== 'done') {
      const fc = r.wx_kind === 'forecast';
      const wx = el('div', 'sn-wx'); wx.setAttribute('data-source', 'coach'); wx.setAttribute('data-where', rwh);
      const t = el('span', 'sn-temps'); t.append(mark(el('span', null, `${Math.round(r.wx_hi)}°`), 'coach', 'wx_hi', rwh), mark(el('small', null, `/ ${Math.round(r.wx_lo)}°F`), 'coach', 'wx_lo', rwh));
      const side = el('span', 'sn-wxside'); side.append(el('span', 'ck-eyebrow', fc ? 'Race-day forecast' : 'Typical for the date'), mark(el('span', null, r.wx_text || ''), 'coach', 'wx_text', rwh));
      wx.append(t, side);
      if (r.water) { const wa = el('span', 'sn-wxl', 'Water: '); wa.append(mark(el('span', null, r.water), 'coach', 'water', rwh)); wx.append(wa); }
      if (r.wx_plan) { const pl = el('span', 'sn-wxl'); pl.append(el('b', null, 'Plan for it: '), mark(el('span', null, r.wx_plan), 'coach', 'wx_plan', rwh)); wx.append(pl); }
      const src = el('span', 'sn-wxl sn-wxsrc', fc ? 'Forecast · ' : 'Estimated · '); src.append(mark(el('span', null, r.wx_src || ''), 'coach', 'wx_src', rwh));
      if (r.wx_at) src.append(' · updated ', mark(el('span', null, fDay(P(r.wx_at))), 'coach', null, rwh, 'formatted'));
      if (!fc) src.append(' · a forecast replaces this from ', ruleSpan('7', 'season.js fillRaceHub: forecast from 7 days out'), ' days out');
      wx.append(src);
      hero.append(wx);
    }
    // the race page link: a 44 px Cockpit button (was a 40 px caption link; Week review note)
    if (r.url) { const a = el('a', 'ck-btn ck-btn--secondary ck-btn--sm sn-rlink', 'Race page'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.append(icon('external')); hero.append(a); }
    const until = kind('day').filter((d) => dayN(d.date) >= TN && dayN(d.date) <= dayN(r.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order || 0) - (b.order || 0)));
    const rw = $('r-week'), rd = $('r-days'); rd.replaceChildren();
    rw.hidden = !(n >= 0 && n <= 14 && until.length);
    const wxd = {}; for (const w of String(r.wx_days || '').split(';').filter(Boolean)) { const [dd, hi, lo, tx] = w.split('|'); wxd[dd] = `${hi}°/${lo}° ${tx ? tx.split(',')[0].toLowerCase() : ''}`.trim(); }
    for (const d of until) {
      const dw = `kind=day&date=${d.date}${d.order !== undefined ? '&order=' + d.order : ''}`;
      const li = el('li', 'ck-row sn-r1 sn-day'); const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t');
      t.append(mkSpan(fDow(P(d.date)), 'coach', null, dw, 'weekday'), ' · ', mkSpan(d.title, 'coach', 'title', dw)); main.append(t);
      const end = el('span', 'ck-row-s');
      if (d.minutes && d.type !== 'race') end.append(mkSpan(String(d.minutes), 'coach', 'minutes', dw), ' min'); else if (d.date === TODAY) end.append('today');
      if (wxd[d.date]) { if (end.childNodes.length) end.append(' · '); end.append(mkSpan(wxd[d.date], 'coach', null, rwh, 'forecast-day')); }
      if (end.childNodes.length) main.append(end); li.append(main); rd.append(li);
    }
    const notes = kind('race_note').filter((x) => x.race_id === r.race_id).sort((a, b) => a.order - b.order);
    const ul = $('r-notes'); ul.replaceChildren();
    $('r-plan').hidden = false;
    if (!notes.length) ul.append(el('li', 'ck-note', 'The race plan gets written closer to race day.'));
    for (const x of notes) {
      const key = r.race_id + '|' + x.section, pid = `r-pl-${r.race_id}-${x.order}`, open = planOpen.has(key);
      const li = el('li', 'sn-stage'); li.dataset.section = x.section;
      const b = el('button', 'ck-row sn-r2 sn-plrow'); b.type = 'button'; b.setAttribute('aria-expanded', String(open)); b.setAttribute('aria-controls', pid);
      const t = el('span', 'ck-row-t', x.section); b.append(t, icon('chevron', 'ck-chev'));
      const body = el('p', 'sn-pltext'); body.id = pid; body.hidden = !open; body.append(mark(el('span', null, x.text), 'coach', 'text', `kind=race_note&race_id=${r.race_id}&order=${x.order}`));
      b.addEventListener('click', () => { const on = !planOpen.has(key); if (on) planOpen.add(key); else planOpen.delete(key); b.setAttribute('aria-expanded', String(on)); body.hidden = !on; });
      li.append(b, body); ul.append(li);
    }
    const kit = kind('race_kit').filter((x) => x.race_id === r.race_id).sort((a, b) => a.order - b.order);
    const kl = $('rk-list'); $('r-kit').hidden = !kit.length;
    if (kl.dataset.race !== r.race_id || kl.childElementCount !== kit.length) {
      kl.replaceChildren(); kl.dataset.race = r.race_id;
      for (const k of kit) { const b = el('button', 'sn-kitb'); b.type = 'button'; b.dataset.item = k.item_id; b.setAttribute('aria-pressed', 'false'); const bx = el('span', 'sn-kbox'); bx.append(icon('check')); b.append(bx, mark(el('span', 'lbl', k.item), 'coach', 'item', `kind=race_kit&race_id=${r.race_id}&item_id=${k.item_id}`)); kl.append(b); }
      window.dispatchEvent(new CustomEvent('cx-kit', { detail: r.race_id }));
    }
  }
  function renderSeasonList(races, r) {
    if (HUB.parentNode !== $('races')) $('races').insertBefore(HUB, $('r-tl').nextSibling);
    HUB.hidden = true;
    cardState($('r-season'), null);
    const rk = $('r-key'); rk.replaceChildren();
    const kt = el('div', 'sn-kg'); kt.append(el('b', 'ck-eyebrow', 'Type'));
    for (const k of ['bike', 'run', 'trail', 'tri', 'adventure']) { const sp = el('span', 'sn-kt'); sp.append(raceIcon({ sport: { bike: 'Ride', run: 'Run', trail: 'Trail run', tri: 'Triathlon', adventure: 'Adventure race' }[k] }), RNAME[k]); sp.firstChild.setAttribute('aria-hidden', 'true'); kt.append(sp); }
    const ks = el('div', 'sn-kg'); ks.append(el('b', 'ck-eyebrow', 'Status')); for (const k of ['done', 'registered', 'planned', 'considering', 'exploring']) ks.append(statusChip(k));
    const kh = el('p', 'ck-note'); kh.append(el('b', null, 'Planned'), ' committed, not entered yet · ', el('b', null, 'Considering'), ' a specific event that fits · ', el('b', null, 'Exploring'), ' type and timing only');
    rk.append(kt, ks, kh);
    const list = $('r-list'); list.replaceChildren();
    const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const y of [...new Set(races.map((x) => x.date.slice(0, 4)))]) {
      const rs = races.filter((x) => x.date.startsWith(y));
      const sec = el('section', 'sn-year'); sec.setAttribute('aria-labelledby', 'r-y-' + y);
      const h = el('div', 'sn-yh'); const yh = el('h3', 'ck-h3'); yh.id = 'r-y-' + y; yh.append(mkSpan(y, 'coach', null, 'kind=race', 'year'));
      h.append(yh, el('span', 'ck-sub')); h.lastChild.append(mkSpan(String(rs.length), 'coach', null, 'kind=race', 'count'), ` event${rs.length > 1 ? 's' : ''}`);
      const strip = el('div', 'sn-strip'); sec.append(h, strip);
      const RS = { registered: 'accent', done: 'good', planned: 'fg' };
      // Each race on the strip is also a row below it (the same race, the same open action), so the strip needs no focus stop.
      sec._draw = () => CKC().custom(strip, { key: 'year-' + y, h: 78, minW: 280, fallbackW: list.clientWidth || 340, interactive: false, marks: { source: 'coach', where: 'kind=race' },
        sentence: `${y} at a glance: ${rs.length} event${rs.length > 1 ? 's' : ''}: ${rs.map((x) => `${x.name}, ${fDay(P(x.date))}, ${x.status}`).join('; ')}. Each is a row below.`,
        draw: ({ svg: node, W, T }) => {
          const svg = d3.select(node).append('g').attr('transform', 'translate(0,10)');
          const yx = (iso) => { const t = Date.parse(iso + 'T12:00:00Z'), a = Date.UTC(+y, 0, 1), b = Date.UTC(+y + 1, 0, 1); return 4 + (t - a) / (b - a) * (W - 8); };
          for (let m = 0; m < 12; m++) { const mx = yx(`${y}-${String(m + 1).padStart(2, '0')}-01`); svg.append('line').attr('x1', mx).attr('x2', mx).attr('y1', 0).attr('y2', 50).style('stroke', T('line')); svg.append('text').attr('x', mx + 2).attr('y', 63).style('fill', T('chart-tick')).text(W < 520 ? MONS[m][0] : MONS[m]); }
          svg.append('line').attr('x1', 4).attr('x2', W - 4).attr('y1', 34).attr('y2', 34).style('stroke', T('edge')).attr('stroke-width', 2);
          const placed = [];
          for (const x of rs) {
            const cx = yx(x.date); let row = 0; while (placed.some((p) => p.row === row && Math.abs(p.x - cx) < 24)) row++; placed.push({ x: cx, row });
            const g = svg.append('g').style('cursor', 'pointer').on('click', () => openRace(x.race_id, false));
            g.append('title').text(`${x.name}, ${fDay(P(x.date))}`);
            g.append('circle').attr('cx', cx).attr('cy', 34).attr('r', 4).style('fill', T(RS[x.status] || 'surface')).style('stroke', T('fg')).attr('stroke-width', 1.5).attr('stroke-dasharray', x.status === 'considering' ? '3 2' : x.status === 'exploring' ? '1 2' : null);
            const k = raceType(x); const col = T(RACE_TONE[k] || 'fg');
            g.append('g').attr('transform', `translate(${cx - 10},${8 - row * 14}) scale(${20 / 24})`).style('color', col).style('fill', 'none').style('stroke', 'currentColor').attr('stroke-width', 1.8).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').html(RUSE(k));
          }
        } });
      // Completed races fold into one bucket per year, closed by default (the athlete, Nov 2, 2026); upcoming races stay listed.
      // It opens on tap, and by itself when the race opened from the timeline is a completed one.
      const doneRs = rs.filter((x) => x.status === 'done');
      let doneBox = null;
      if (doneRs.length) {
        const open = doneOpen.has(y) || (!!r && r.status === 'done' && r.date.startsWith(y));
        const db = el('button', 'ck-disc sn-doneh'); db.type = 'button'; db.id = 'r-done-' + y; db.setAttribute('aria-expanded', String(open)); db.setAttribute('aria-controls', 'r-donebox-' + y);
        const dl = el('span', 'sn-donet'); const dt = el('b'); dt.append('Completed · ', mkSpan(String(doneRs.length), 'coach', null, 'kind=race&status=done', 'count'), ` race${doneRs.length > 1 ? 's' : ''}`);
        const names = el('span', 'ck-sub'); doneRs.forEach((x, i) => { if (i) names.append(' · '); names.append(mkSpan(x.name, 'coach', 'name', 'kind=race&race_id=' + x.race_id)); });
        dl.append(dt, names);
        const chev = el('span', 'sn-donec'); chev.append(el('span', null, open ? 'Hide' : 'Show'), icon('chevron', 'ck-chev'));
        db.append(dl, chev); spaced(dl, chev, db);
        db.addEventListener('click', () => { if (doneOpen.has(y)) doneOpen.delete(y); else doneOpen.add(y); try { localStorage.setItem('cx-done-open', [...doneOpen].join(',')); } catch (e) { /* ignore */ } if (!doneOpen.has(y) && r && r.status === 'done' && r.date.startsWith(y)) state.race = null; renderRaces(); const b2 = $('r-done-' + y); if (b2) b2.focus({ preventScroll: true }); });
        doneBox = el('div', 'sn-donebox'); doneBox.id = 'r-donebox-' + y; doneBox.hidden = !open;
        const grp = el('div', 'sn-done' + (open ? ' is-open' : '')); grp.append(db, doneBox);
        sec.append(grp);
      }
      for (const x of rs) {
        const tgt = x.status === 'done' && doneBox ? doneBox : sec; const rw = 'kind=race&race_id=' + x.race_id;
        const b = el('button', 'sn-rc'); b.type = 'button'; b.id = 'r-rc-' + x.race_id; b.dataset.r = x.status || ''; b.setAttribute('aria-expanded', String(!!r && x.race_id === r.race_id)); b.setAttribute('aria-controls', 'r-hub');
        const dt = P(x.date); const dn = daysTo(x.date);
        const dtb = mark(el('span', 'sn-rdt'), 'coach', null, rw, 'formatted'); dtb.append(el('span', null, MONS[dt.getUTCMonth()]), el('b', null, (x.approx === true || x.approx === 'true' ? '≈' : '') + dt.getUTCDate()), el('span', null, fDow(dt)));
        const bd = el('span', 'sn-rbd');
        const t1 = el('span', 'sn-rt'); t1.append(raceIcon(x), mkSpan(x.name, 'coach', 'name', rw)); bd.append(t1);
        const row = el('span', 'sn-rrow'); row.append(statusChip(x.status));
        for (const w of String(x.with || '').split(';').filter(Boolean)) row.append(el('span', 'sn-who', 'with ' + w));
        if (dn >= 0) row.append(mkSpan(dn > 0 ? `in ${dn} d` : 'today', 'coach', null, rw, 'days-until')); row.lastChild.classList.add('ck-sub');
        bd.append(row);
        const t2 = el('span', 'ck-sub sn-rt2'); const xst = x.status !== 'done' ? fStart(x) : ''; if (xst) t2.append(mkSpan('Starts ' + xst, 'coach', null, rw, 'start-time'));
        [['distance', x.distance], ['location', x.location]].filter((p2) => p2[1]).forEach((p2, i) => { if (i || xst) t2.append(' · '); t2.append(mkSpan(p2[1], 'coach', p2[0], rw)); }); bd.append(t2);
        if (x.status === 'done' && x.stats) { const st = el('span', 'sn-stats'); for (const pair of String(x.stats).split(';')) { const [v, l] = pair.split('|'); const s1 = mark(el('span'), 'coach', null, rw, 'stats'); s1.append(el('b', null, v), l || ''); st.append(s1); } bd.append(st); }
        else if (x.status === 'done' && x.result) { const t3 = el('span', 'sn-rt3', 'Result: '); t3.append(mkSpan(x.result, 'coach', 'result', rw)); bd.append(t3); }
        if (x.status !== 'done' && x.wx_hi != null && x.wx_hi !== '') { const wl = el('span', 'ck-sub sn-rwx', `${x.wx_kind === 'forecast' ? 'Forecast' : 'Typical'} `); wl.append(mkSpan(`${Math.round(x.wx_hi)}°`, 'coach', 'wx_hi', rw), '/', mkSpan(`${Math.round(x.wx_lo)}°`, 'coach', 'wx_lo', rw), 'F'); if (x.wx_text) wl.append(' · ', mkSpan(x.wx_text.split(/[;,]/)[0], 'coach', null, rw, 'first-clause')); bd.append(wl); }
        if (x.status === 'planned' && x.registration) { const t3 = el('span', 'sn-rt3', 'Registration: '); t3.append(mkSpan(x.registration.split('. ')[0].replace(/\.$/, ''), 'coach', null, rw, 'first-sentence'), '.'); bd.append(t3); }
        b.append(dtb, bd); spaced(dtb, t1, row, bd, b);
        b.addEventListener('click', () => openRace(x.race_id, true));
        tgt.append(b);
        if (r && x.race_id === r.race_id) { tgt.append(HUB); HUB.hidden = false; }
      }
      list.append(sec); if (sec._draw) sec._draw(); // drawn once in the page, so it measures its width and reads its tokens
    }
    renderRoadmap(races);
  }
  // Roadmap (Phase 5): Cockpit list rows. A block is a 44 px row button (aria-expanded) with its dates and weeks; the current
  // block carries the emphasised edge, a "now" chip and its meter; an open block lists its objectives, pillars, guide, fuel and
  // volume. Milestones and races are plain rows with their date and how far off they are.
  function renderRoadmap(races) {
    const road = $('r-blocks');
    const meta = kind('meta')[0]; if (meta && meta.url) $('r-doc').href = meta.url; $('r-doc').hidden = !(meta && meta.url);
    const blocks = kind('block').map((b) => ({ ...b, _t: 'block', _d: b.start }));
    // Races come straight from races.json (the athlete, Nov 3, 2026): registered, planned and done ones, plus roadmap: true;
    // milestone rows in plan.json hold only non-race items, so a sign-up reaches the Roadmap with no second edit.
    const ms = [...kind('milestone').map((m) => ({ ...m, _t: 'ms', _d: m.date, _w: 'kind=milestone&key=' + m.key })),
      ...races.filter((x) => ['registered', 'planned', 'done'].includes(x.status) || truthy(x.roadmap)).map((x) => ({ name: (truthy(x.approx) ? '≈ ' : '') + (x.public_name || x.name), date: x.date, _t: 'ms', _d: x.date, _w: 'kind=race&race_id=' + x.race_id, _race: true, _st: x.status !== 'done' ? fStart(x) : '' }))];
    const items = [...blocks, ...ms].sort((a, b) => (a._d < b._d ? -1 : a._d > b._d ? 1 : a._t === 'block' ? -1 : 1));
    if (!items.length) { road.replaceChildren(); $('r-doc').hidden = true; cardState($('r-road'), 'empty', 'The roadmap fills when the plan has blocks or milestones.'); return; }
    cardState($('r-road'), null); road.replaceChildren();
    for (const it of items) {
      const li = el('li', 'sn-rm');
      if (it._t === 'block') {
        const bw = 'kind=block&key=' + it.key;
        const past = dayN(it.end) < TN, cur = TN >= dayN(it.start) && TN <= dayN(it.end), open = state.openBlock === it.key;
        if (past) li.classList.add('is-past');
        const btn = el('button', 'ck-row sn-blk'); btn.type = 'button'; btn.id = 'r-blk-' + it.key; btn.setAttribute('aria-expanded', String(open)); if (open) btn.setAttribute('aria-controls', 'r-blkm-' + it.key);
        if (cur) btn.dataset.key = '1';
        const weeks = Math.max(1, Math.round((dayN(it.end) - dayN(it.start) + 1) / 7));
        const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t'); t.append(mkSpan(it.label, 'coach', 'label', bw), ': ', mkSpan(it.name, 'coach', 'name', bw));
        const s2 = el('span', 'ck-row-s'); s2.append(mkSpan(fDay(P(it.start)), 'coach', null, bw, 'formatted'), ' – ', mkSpan(fDay(P(it.end)), 'coach', null, bw, 'formatted'), ' · ');
        if (cur) s2.append('week ', mkSpan(String(Math.min(weeks, Math.floor((TN - dayN(it.start)) / 7) + 1)), 'coach', null, bw, 'week-of'), ' of ', mkSpan(String(weeks), 'coach', null, bw, 'weeks')); else s2.append(mkSpan(String(weeks), 'coach', null, bw, 'weeks'), ' wk');
        main.append(t, s2);
        const end = el('span', 'ck-row-end sn-blkend'); if (cur) end.append(neutralChip('now')); end.append(icon('chevron', 'ck-chev'));
        btn.append(icon('week'), main, end); spaced(main, end, btn);
        btn.addEventListener('click', () => { state.openBlock = state.openBlock === it.key ? null : it.key; renderRaces(); const b2 = $('r-blk-' + it.key); if (b2) b2.focus({ preventScroll: true }); });
        li.append(btn);
        if (cur) { const m = el('span', 'ck-zone-track sn-bmeter'); m.append(el('i', 'ck-zone-fill')); const fr = Math.min(1, (TN - dayN(it.start) + 1) / (dayN(it.end) - dayN(it.start) + 1)); CKC().meter(m, { frac: fr, sentence: `${it.label}: ${Math.round(fr * 100)}% of the block's days gone`, marks: { source: 'coach', where: bw } }); li.append(m); }
        if (open) {
          const more = el('div', 'sn-blkmore'); more.id = 'r-blkm-' + it.key; if (it.objectives) more.append(mkSpan(it.objectives, 'coach', 'objectives', bw));
          const ul2 = el('ul', 'sn-pillars'); for (const k of ['pillar_1', 'pillar_2', 'pillar_3']) if (it[k]) { const li2 = el('li'); if (it[k + '_short']) li2.append(mark(el('b', null, it[k + '_short']), 'coach', k + '_short', bw), ': '); li2.append(mkSpan(it[k], 'coach', k, bw)); ul2.append(li2); } more.append(ul2);
          for (const [lab, f] of [['Guide', 'guide'], ['Fuel', 'energy'], ['Volume', 'volume']]) if (it[f]) { const p = el('span'); p.append(el('b', null, lab + ': '), mkSpan(it[f], 'coach', f, bw)); more.append(p); }
          li.append(more);
        }
      } else {
        if (dayN(it.date) < TN) li.classList.add('is-past');
        const row = el('div', 'ck-row sn-ms'); const rr = races.find((x) => x.date === it.date);
        if (rr) { const ic = raceIcon(rr); row.append(ic); } else row.append(icon('flag'));
        const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t'); t.append(it._race ? mkSpan(it.name, 'coach', null, it._w, 'public-name') : mkSpan(it.name, 'coach', 'name', it._w));
        const s2 = el('span', 'ck-row-s'); s2.append(mkSpan(fWd(P(it.date)), 'coach', null, it._w, 'formatted')); if (it._st) s2.append(' · ', mkSpan(it._st, 'coach', null, it._w, 'start-time')); s2.append(' · ', mkSpan(inDays(daysTo(it.date)), 'coach', null, it._w, 'days-until'));
        main.append(t, s2); row.append(main, el('span'));
        li.append(row);
      }
      road.append(li);
    }
  }
  Object.assign(window.CX, { renderRaces, renderRaceWeek });
  if (window.CX.rendered) window.CX.render(); // the page may have rendered before this file loaded
})();
