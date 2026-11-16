// earned.js: Earned badges and the Race tree on the Season page (6.96.0; the athlete, Oct 23, 2026, BACKLOG "Earned badge art" and
// "Skill tree", picked for the Nov 16 overnight build).
//   Badges     one per new level a skill reaches (the same ladders and the one level function, app.js levelOf) and one per
//              stage unlocked (app.js autoStage). Earned on the first crossing, kept when the level later slips (drawn dimmed),
//              never for a crossing before the person's start (the plan's season_start, so a new coach's first day shows none).
//              Colour climbs with the level tier; the level's basis (research, race target, coach) is said in the badge's line.
//              Earned badges are saved to the dashboard store, badges/earned {items (JSON text), saved_at}, so a later ladder
//              or stage change never takes one away; page state only, nothing in the morning run reads it.
//   Race tree  event distances per line (coach/race_tree.json, one home), each opened by the one before it. Filled from the
//              Garmin activities and races.json: Done (a race, or one session covering the distance), Open (the next one,
//              with the longest session of the last weeks against it), Locked. Planned and registered races sit on their node;
//              a race longer than a line's top step adds its own step (the athlete: "250 miler").
(() => {
  const CX = window.CX;
  const $ = (id) => document.getElementById(id);
  const A = () => CX.app || {};
  let db = null, loaded = false; const kept = new Map(); // id -> badge saved in the store
  const ui = { open: null, node: null, all: false, wide: new Set() };
  const BASIS = { research: ['series-8', 'Research'], race: ['series-2', 'Race target'], coach: ['chart-threshold', 'Coach estimate'] };
  const basisOf = (b) => BASIS[b] || BASIS.coach;
  const SPORT = (k) => { const s = A().SKILL_ICON ? A().SKILL_ICON(k) : 'badge'; return s; };
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };

  // ---------- which badges the record has earned ----------
  function earnedNow() {
    const { skillSeries, ladderOf, levelOf, autoStage, kind, startDay, stageInfo } = { ...A(), stageInfo: CX.stageInfo };
    if (!skillSeries || !ladderOf) return [];
    const start = (startDay && startDay()) || '0000'; const out = [];
    for (const { m, rows } of skillSeries()) {
      if (rows.length < 2) continue; const better = Number(m.better) || 1; const beyond = (v, e) => (better === 1 ? v >= e : v <= e);
      const lad = ladderOf(m); const latest = rows[rows.length - 1].value; const now = levelOf(m, latest); let si = null; try { si = stageInfo ? stageInfo(m.key) : null; } catch (e) { si = null; }
      const stage = si ? si.cur : 0;
      for (const [i, t] of lad.entries()) {
        if (i === 0) continue; const e = better === 1 ? t.lo : t.hi; if (e === null || e === undefined) continue;
        const first = rows.find((r) => beyond(r.value, e)); if (!first || String(first.date) < start) continue; // held before the start: not earned here
        if (!rows.some((r) => r.date < first.date)) continue; // a first reading is a start, not a new level
        out.push({ id: `${m.key}|${stage}|${t.label}`, key: m.key, label: m.label, rank: t.label, lv: i + 1, of: lad.length, stage, basis: t.basis || m.basis || 'coach', date: String(first.date).slice(0, 10), value: first.value, held: !!(now && now.n >= i + 1) });
      }
    }
    if (autoStage && kind) for (const m of kind('marker')) { // stages unlocked since the start, one per tile (a paired marker is read on its tile)
      if (!m.scales || kind('marker').some((x) => String(x.pair || '').split(',').map((k) => k.trim()).includes(m.key))) continue;
      let au = null; try { au = autoStage(m); } catch (e) { au = null; } if (!au || !au.promoted || au.unlocked < 2 || String(au.promoted) < start) continue;
      const sr = (skillSeries().find((x) => x.m.key === m.key) || {}).rows || A().seriesFor(m); if (!sr.some((r) => String(r.date) < String(au.promoted))) continue; // the first reading is a start, not a step up
      out.push({ id: `${m.key}|stage${au.unlocked}`, key: m.key, label: m.label, rank: `Stage ${au.unlocked}`, stageUp: au.unlocked, lv: 0, of: 0, stage: au.unlocked, basis: 'research', date: String(au.promoted).slice(0, 10), held: au.cur >= au.unlocked });
    }
    return out;
  }
  // the record's badges plus every badge the store kept; a kept one the record no longer shows stays, dimmed
  function badges() {
    const now = earnedNow(); const byId = new Map(now.map((b) => [b.id, b]));
    for (const [id, b] of kept) if (!byId.has(id)) byId.set(id, { ...b, held: false });
    const fresh = now.filter((b) => !kept.has(b.id)); if (fresh.length && loaded) save(fresh);
    return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.lv - a.lv));
  }
  function save(list) {
    for (const b of list) { const { held, ...k } = b; kept.set(b.id, k); }
    if (!db) return; const items = JSON.stringify([...kept.values()].slice(-400));
    try { Promise.resolve(db.doc('badges/earned').set({ items, saved_at: new Date().toISOString() })).catch(() => { /* drawn from the record again next open */ }); } catch (e) { /* same */ }
  }

  // ---------- the art (round 3, from the athlete's notes on the options page, Nov 16, 2026: the Star map gold, medals for races):
  // original, drawn here. A skill badge is a cut gem; its colour and glow climb with the level's place on its own ladder
  // (silver for a level, gold for a stage, as on the congrats screen; the glow and one dot per tier climb with the level), a sparkle once earned. A finished race
  // distance is a gold medal on a ribbon in its sport colour. The basis (research, race target, coach) is said in the badge's line.
  const tierOf = (b) => (b.stageUp ? 4 : b.of > 1 ? Math.round((4 * (b.lv - 1)) / (b.of - 1)) : 0);
  // two metals, as on the congrats screen (the athlete, Nov 16, 2026: "keep silver and gold colors like we use in the pop up"):
  // a new level is silver, a new stage is gold (the level up screen's dark tokens; the panel is dark in both themes)
  const SILVER = ['#e8f0f8', '#9db2c9'], GOLD = ['#ffd27a', '#c98a10'];
  const TIER = [SILVER, SILVER, SILVER, SILVER, GOLD];
  const ring = (n, r, cx, cy) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const pts = (l) => l.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  let gid = 0;
  function glow(s, sd) { const id = 'ebf' + (gid++); const f = sv('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' }); const m = sv('feMerge', {}); m.append(sv('feMergeNode', { in: 'b' }), sv('feMergeNode', { in: 'SourceGraphic' })); f.append(sv('feGaussianBlur', { stdDeviation: sd, result: 'b' }), m); const d = sv('defs', {}); d.append(f); s.append(d); return { id, d }; }
  const glyph = (name, x, y, w, col) => { const g = sv('g', { class: 'eb-g' }); g.style.color = col; g.append(sv('use', { href: '#cx-' + name, x, y, width: w, height: w })); return g; };
  const label = (txt, y, col) => { const t = sv('text', { x: 32, y, 'text-anchor': 'middle', class: 'eb-n', fill: col }); t.textContent = txt; return t; };
  function art(b, size, next) { // the gem
    const t = next ? 0 : tierOf(b); const [c1, c2] = b.stageUp ? GOLD : SILVER; const s = sv('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'eb-art', 'aria-hidden': 'true' });
    const { id, d } = glow(s, 1.4 + t * 0.8); const gr = sv('linearGradient', { id: id + 'l', x1: 0, y1: 0, x2: 1, y2: 1 });
    gr.append(sv('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.9 }), sv('stop', { offset: 0.35, 'stop-color': next ? '#3a3770' : c1 }), sv('stop', { offset: 1, 'stop-color': next ? '#1c1a44' : c2 })); d.append(gr);
    const o = ring(8, 26, 32, 31); const g = sv('g', next ? {} : { filter: `url(#${id})` });
    o.forEach((p, i) => { const q = o[(i + 1) % 8]; g.append(sv('polygon', { points: pts([[32, 31], p, q]), fill: `url(#${id}l)`, opacity: (0.55 + 0.15 * (i % 4)).toFixed(2) })); });
    g.append(sv('polygon', { points: pts(ring(8, 14, 32, 31)), fill: '#0d0b28', opacity: 0.88 })); s.append(g);
    if (!next) s.append(sv('path', { d: 'M47 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', fill: '#fff', opacity: 0.95 }));
    for (let i = 0; i <= t; i++) s.append(sv('circle', { cx: 32 - t * 3.5 + i * 7, cy: 60, r: 2, fill: next ? '#6e66c8' : c1 }));
    s.append(next ? label('?', 36, '#c8bfff') : b.stageUp ? label('S' + b.stageUp, 36, c1) : glyph(SPORT(b.key), 24, 23, 16, c1));
    return s;
  }
  const lockedArt = (size) => art({}, size, true);
  function medal(sport, rib, size) { // a finished race distance
    const s = sv('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true' }); const { id, d } = glow(s, 1.6);
    const rg = sv('radialGradient', { id: id + 'r', cx: 0.35, cy: 0.3 }); rg.append(sv('stop', { offset: 0, 'stop-color': '#fff3d6' }), sv('stop', { offset: 0.45, 'stop-color': '#f0b54a' }), sv('stop', { offset: 1, 'stop-color': '#a8700c' })); d.append(rg);
    s.append(sv('path', { d: 'M20 2h10l6 24H26z', fill: rib }), sv('path', { d: 'M44 2H34l-6 24h10z', fill: '#3b6dff' }));
    const g = sv('g', { filter: `url(#${id})` }); g.append(sv('circle', { cx: 32, cy: 40, r: 20, fill: `url(#${id}r)` }));
    for (const [x, y] of ring(16, 20, 32, 40)) g.append(sv('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.4, fill: '#fff2b8' }));
    g.append(sv('circle', { cx: 32, cy: 40, r: 13.5, fill: '#2a1a00', stroke: '#ffe9a6', 'stroke-width': 1.5 })); s.append(g, glyph(sport, 25, 33, 14, '#ffe9a6'));
    return s;
  }

  // ---------- the shelf: a fourth choice in the season summary, by sport, a row per skill ----------
  const GROUPS = [['run', 'Run', 'run'], ['bike', 'Bike', 'bike'], ['swim', 'Swim', 'swim'], ['health', 'Heart and health', 'hr'], ['habits', 'Strength and habits', 'streak'], ['other', 'Other', 'badge']];
  const groupOf = (key) => { const i = SPORT(key); return ['run', 'bike', 'swim'].includes(i) ? i : ['hr', 'sleep', 'sauna'].includes(i) ? 'health' : ['strength', 'streak'].includes(i) ? 'habits' : 'other'; };
  function badgeCell(b, el, fDay) {
    const btn = el('button', 'eb-cell' + (b.held ? '' : ' is-slipped')); btn.type = 'button'; btn.dataset.id = b.id; btn.setAttribute('aria-expanded', String(ui.open === b.id));
    btn.setAttribute('aria-label', `${b.label}: ${b.rank}${b.stageUp ? ' unlocked' : ''}, earned ${fDay(b.date)}${b.held ? '' : ', since slipped'}`);
    btn.append(art(b, 52), el('b', 'eb-rank', b.rank), el('span', 'eb-when', fDay(b.date)));
    btn.addEventListener('click', () => { ui.open = ui.open === b.id ? null : b.id; render(); const n = document.querySelector(`#r-eb .eb-cell[data-id="${CSS.escape(b.id)}"]`); if (n) n.focus({ preventScroll: true }); });
    return btn;
  }
  function detail(b, el, fDay) {
    const p = el('p', 'eb-det'); const [, word] = basisOf(b.basis);
    p.append(el('b', null, b.label), b.stageUp ? `: stage ${b.stageUp} unlocked on ${fDay(b.date)}, by a reading in the Top 20% of the stage before. ` : `: ${b.rank} reached on ${fDay(b.date)}${b.stage ? ` on the stage ${b.stage} scale` : ''}. `,
      `Level basis: ${word}. `, b.held ? 'You hold it today.' : 'Your level has slipped since; the badge stays yours.');
    if (window.CX.ck && window.CX.ck.mark) window.CX.ck.mark(p, 'coach', null, `kind=mpt&key=${b.key}`, 'badge');
    return p;
  }
  // the starting point (the athlete, Nov 16, 2026: "Give a starting point. My concern is this list could get really long"): one
  // marker per skill for the level held on the start date, from the last reading before it; history before the start earns
  // no badges, it shows only as this one marker.
  function startOf(key) {
    const { skillSeries, levelOf, startDay } = A(); if (!skillSeries || !levelOf) return null; const start = (startDay && startDay()) || '0000';
    const s = skillSeries().find((x) => x.m.key === key); if (!s) return null; const before = s.rows.filter((r) => String(r.date) < start); if (!before.length) return null;
    const r = before[before.length - 1]; const lv = levelOf(s.m, r.value); return lv ? { label: lv.band.label, n: lv.n, of: lv.max, date: start, when: String(r.date).slice(0, 10) } : null;
  }
  function startCell(sp, label, el, fDay) {
    const c = el('div', 'eb-cell is-start'); c.setAttribute('aria-label', `${label}: starting point ${sp.label}, the level held on ${fDay(sp.date)}`);
    const ring = el('span', 'eb-start'); ring.textContent = 'Start'; c.append(ring, el('b', 'eb-rank', sp.label), el('span', 'eb-when', fDay(sp.date))); return c;
  }
  function renderShelf() {
    const box = $('r-eb'); if (!box) return; const { el, icon, P } = A(); if (!el) return; const fDay = (s) => A().fDay(P(s));
    const list = badges(); const body = el('div', 'eb-body');
    const cap = $('r-eb-cap'); if (cap) cap.textContent = list.length ? `${list.length} earned` : '';
    if (!list.length) { body.append(el('p', 'ck-note', 'Your first badge comes with your first new level. Every level you reach from your start date earns one, and you keep it.')); box.replaceChildren(body); return; }
    const bySkill = new Map(); for (const b of list) { if (!bySkill.has(b.key)) bySkill.set(b.key, []); bySkill.get(b.key).push(b); }
    let shown = 0; const cut = ui.all ? Infinity : 6; const total = bySkill.size;
    for (const [g, name, ic] of GROUPS) {
      const skills = [...bySkill.entries()].filter(([k]) => groupOf(k) === g); if (!skills.length || shown >= cut) continue;
      const sec = el('section', 'eb-sp'); const h = el('h3', 'eb-sph'); const n = skills.reduce((t, [, bs]) => t + bs.length, 0); h.append(icon(ic), name, el('span', 'ck-sub', `${n} badge${n > 1 ? 's' : ''}`)); sec.append(h);
      for (const [key, bs] of skills) {
        if (shown++ >= cut) break; const row = el('div', 'eb-row'); row.append(el('h4', 'eb-sk', bs[0].label));
        const grid = el('div', 'eb-grid'); const sorted = bs.slice().sort((a, b) => (a.stageUp ? 100 : a.lv) - (b.stageUp ? 100 : b.lv));
        const sp = startOf(key); if (sp) grid.append(startCell(sp, bs[0].label, el, fDay));
        const top0 = sorted.filter((b) => !b.stageUp).pop(); const slots = 4 - (sp ? 1 : 0) - (top0 && top0.lv < top0.of ? 1 : 0); // one line of four: start, badges, next
        const hidden = ui.wide.has(key) || sorted.length <= slots ? 0 : sorted.length - Math.max(1, slots - 1); // a long row shows its newest levels and a count
        if (hidden) { const m = el('button', 'eb-cell eb-hid'); m.type = 'button'; m.setAttribute('aria-expanded', 'false'); m.setAttribute('aria-label', `Show ${hidden} earlier ${bs[0].label} badges`); m.append(el('span', 'eb-start', `+${hidden}`), el('b', 'eb-rank', 'earlier'), el('span', 'eb-when', 'show'));
          m.addEventListener('click', () => { ui.wide.add(key); render(); }); grid.append(m); }
        for (const b of sorted.slice(hidden)) grid.append(badgeCell(b, el, fDay));
        if (ui.wide.has(key) && sorted.length > slots) { const f = el('button', 'eb-cell eb-hid'); f.type = 'button'; f.setAttribute('aria-expanded', 'true'); f.setAttribute('aria-label', `Fold ${bs[0].label} back to one line`); f.append(el('span', 'eb-start', '\u2212'), el('b', 'eb-rank', 'fewer'), el('span', 'eb-when', 'fold')); f.addEventListener('click', () => { ui.wide.delete(key); render(); }); grid.append(f); }
        const top = sorted.filter((b) => !b.stageUp).pop(); // the next level up, as an outline
        if (top && top.lv < top.of) { const nx = el('div', 'eb-cell is-next'); nx.setAttribute('aria-label', `${top.label}: next level not reached yet`); nx.append(lockedArt(52), el('b', 'eb-rank', 'Next'), el('span', 'eb-when', 'to earn')); grid.append(nx); }
        row.append(grid); const op = bs.find((b) => b.id === ui.open); if (op) row.append(detail(op, el, fDay)); sec.append(row);
      }
      body.append(sec);
    }
    if (total > 6) { const more = el('button', 'ck-btn eb-more', ui.all ? 'Show fewer' : `Show all ${total} skills`); more.type = 'button'; more.setAttribute('aria-expanded', String(ui.all)); more.addEventListener('click', () => { ui.all = !ui.all; render(); const m = document.querySelector('#r-eb .eb-more'); if (m) m.focus({ preventScroll: true }); }); body.append(more); }
    box.replaceChildren(body);
  }

  // ---------- the race tree: a column per sport, climbing; a longer race on the calendar adds its own step on top ----------
  const LINES = [['run', 'Run', 'run', '#ff7a59'], ['bike', 'Bike', 'bike', '#5ee0ff'], ['swim', 'Swim', 'swim', '#5dffa8'], ['tri', 'Tri', 'race-tri', '#cf95ff']];
  const sportOf = (a) => { const t = String(a.type || ''); return /swim/i.test(t) ? 'swim' : /cycl|ride|bik/i.test(t) ? 'bike' : /run/i.test(t) ? 'run' : null; };
  const legKm = (n) => Object.fromEntries(String(n.legs || '').split(',').filter(Boolean).map((x) => { const [s, v] = x.split(':'); return [s, Number(v)]; }));
  function raceDist(r) { // a race's line and distance from its text ("recommends the 100K" wins)
    const sp = /tri/i.test(r.sport) ? 'tri' : /ride|bike|cycl/i.test(r.sport) ? 'bike' : /run/i.test(r.sport) ? 'run' : /swim/i.test(r.sport) ? 'swim' : null; if (!sp) return null;
    const txt = String(r.distance || '');
    if (sp === 'tri') { const run = /(\d+(?:\.\d+)?)\s*mi run/i.exec(txt); return run ? { sp, run: +run[1] * 1.609 } : null; }
    const mm = /recommends the (\d+(?:\.\d+)?)\s*(k|km|m|mi)\b/i.exec(txt) || /(\d+(?:\.\d+)?)\s*(k|km|mi|m)\b/i.exec(txt); if (!mm) return null; const u = mm[2].toLowerCase();
    return { sp, km: +mm[1] * (u === 'mi' ? 1.609 : u === 'm' && sp !== 'swim' ? 1.609 : u === 'm' ? 0.001 : 1), txt: `${mm[1]} ${u === 'k' ? 'K' : u}`.replace(/ K$/, 'K') };
  }
  function raceNode(r, nodes) {
    const d = raceDist(r); if (!d) return null;
    if (d.sp === 'tri') return nodes.filter((n) => n.line === 'tri').map((n) => [n, Math.abs(legKm(n).run - d.run)]).sort((a, b) => a[1] - b[1])[0][0];
    const best = nodes.filter((n) => n.line === d.sp).map((n) => [n, Math.abs(Number(n.km) - d.km) / Number(n.km)]).sort((a, b) => a[1] - b[1])[0]; return best && best[1] < 0.1 ? best[0] : null;
  }
  function treeState() {
    const { kind, N, TN, dayN } = A(); if (!kind) return null; const base = kind('tree_node'); if (!base.length) return null;
    const meta = kind('tree_meta')[0] || {}; const share = Number(meta.cover_share) || 0.95; const weeks = Number(meta.window_weeks) || 12;
    const races = kind('race'); const nodes = base.slice();
    for (const [line] of LINES) { // a race past the top of its line becomes the next step up (a 250 miler grows the run column)
      if (line === 'tri') continue; const longer = races.map((r) => [r, raceDist(r)]).filter(([r, d]) => d && d.sp === line && ['done', 'registered', 'planned'].includes(r.status)).sort((a, b) => a[1].km - b[1].km);
      for (const [, d] of longer) { const ln = nodes.filter((n) => n.line === line); const top = ln[ln.length - 1]; if (!top || d.km <= Number(top.km) * 1.1) continue; nodes.push({ kind: 'tree_node', id: `x-${line}-${Math.round(d.km)}`, line, label: d.txt, short: d.txt, km: d.km, after: top.id, added: true }); }
    }
    const d = dash.data('activities'); const acts = d.status === 'ok' && Array.isArray(d.data) ? d.data : [];
    const longest = { run: null, bike: null, swim: null }, recent = { run: null, bike: null, swim: null };
    for (const a of acts) { const s = sportOf(a); const km = N(a.distance_km); if (!s || !km) continue; if (!longest[s] || km > N(longest[s].distance_km)) longest[s] = a; if (dayN(String(a.local_start).slice(0, 10)) > TN - weeks * 7 && (!recent[s] || km > N(recent[s].distance_km))) recent[s] = a; }
    const pinned = new Map(), raced = new Map();
    for (const r of races) { const n = raceNode(r, nodes); if (!n) continue; if (r.status === 'done') { if (!raced.has(n.id)) raced.set(n.id, r); } else if (['registered', 'planned'].includes(r.status) && String(r.date) >= A().TODAY) { const p = pinned.get(n.id); if (!p || r.date < p.date) pinned.set(n.id, r); } }
    const covered = (s, km) => longest[s] && N(longest[s].distance_km) >= km * share;
    const st = new Map();
    for (const n of nodes) {
      let s = 'locked', how = null;
      if (n.line === 'tri') { const lg = legKm(n); if (raced.has(n.id)) { s = 'done'; how = 'race'; } else if (Object.entries(lg).every(([sp, km]) => covered(sp, km))) how = 'legs'; }
      else if (raced.has(n.id) || [...raced.entries()].some(([id]) => { const o = nodes.find((x) => x.id === id); return o && o.line === n.line && Number(o.km) >= Number(n.km); })) { s = 'done'; how = 'race'; }
      else if (covered(n.line, Number(n.km))) { s = 'done'; how = 'training'; }
      st.set(n.id, { n, s, how });
    }
    for (const n of nodes) { const x = st.get(n.id); if (x.s !== 'done' && (!n.after || st.get(n.after).s === 'done')) x.s = 'open'; }
    const beyond = Object.fromEntries(String(meta.beyond || '').split(',').filter(Boolean).map((x) => x.split(':').map((v) => v.trim())));
    return { nodes, st, longest, recent, pinned, raced, meta, weeks, beyond };
  }
  function renderTree() {
    const box = $('r-rt'); if (!box) return; const { el, icon, N, mark, P } = A(); if (!el) return; const fDay = (s) => A().fDay(P(s));
    const T = treeState(); const body = el('div', 'rt-body');
    if (!T) { box.replaceChildren(el('p', 'ck-note', 'The race tree fills from your activities once they arrive.')); return; }
    const cap = $('r-rt-cap'); const nDone = T.nodes.filter((n) => T.st.get(n.id).s === 'done').length; if (cap) cap.textContent = `${nDone} of ${T.nodes.length} done`;
    const STW = { done: 'Done', open: 'Open', locked: 'Locked' }; const cols = el('div', 'rt-cols'); let open = null;
    const tap = (id) => () => { ui.node = ui.node === id ? null : id; render(); const f = document.querySelector(`#r-rt .rt-n[data-id="${id}"] .rt-dot`); if (f) f.focus({ preventScroll: true }); };
    for (const [line, name, ic, rib] of LINES) {
      const ns = T.nodes.filter((n) => n.line === line); if (!ns.length) continue;
      const wrap = el('div', 'rt-c'); wrap.style.display = 'grid'; const ol = el('ol', 'rt-col'); ol.setAttribute('aria-label', `${name}, shortest first`);
      ns.forEach((n, i) => {
        const x = T.st.get(n.id); const li = el('li', `rt-n is-${x.s}${i ? '' : ' is-first'}`); const pin = T.pinned.get(n.id); li.dataset.id = n.id;
        const b = el('button', 'rt-dot'); b.type = 'button'; b.setAttribute('aria-expanded', String(ui.node === n.id));
        b.setAttribute('aria-label', `${n.label}: ${STW[x.s]}${x.how === 'training' ? ', covered in training' : x.how === 'race' ? ', raced' : x.how === 'legs' ? ', every leg covered' : ''}${pin ? `, ${pin.name} ${fDay(pin.date)}` : ''}`);
        if (x.s === 'done') b.append(medal(ic, rib, 40)); else { b.append(el('span', 'rt-star')); if (x.how === 'legs') b.append(icon('check', 'ck-i rt-part')); }
        b.addEventListener('click', tap(n.id)); li.append(b, el('span', 'rt-lab', String(n.short || n.label).replace(/­/g, '')));
        if (pin) { const f = el('span', 'rt-pin'); f.append(icon('flag'), fDay(pin.date)); li.append(f); }
        ol.append(li); if (ui.node === n.id) open = n;
      });
      const gid2 = 'beyond-' + line; const gh = el('li', 'rt-n rt-ghost'); gh.dataset.id = gid2; const gb = el('button', 'rt-dot', '+'); gb.type = 'button'; gb.setAttribute('aria-expanded', String(ui.node === gid2));
      gb.setAttribute('aria-label', `Past the ${name} list: a longer race on your calendar adds its own step here`); gb.addEventListener('click', tap(gid2)); gh.append(gb, el('span', 'rt-lab', T.beyond[line] || 'Longer')); ol.append(gh); if (ui.node === gid2) open = { ghost: line, name };
      const c = el('div', 'rt-cap'); const nd = ns.filter((n) => T.st.get(n.id).s === 'done').length; c.append(icon(ic), name, el('span', 'ck-sub', `${nd}/${ns.length}`));
      wrap.append(ol, c); cols.append(wrap);
    }
    body.append(cols);
    if (open) body.append(open.ghost ? el('p', 'rt-det', `Past the list. Put a longer ${open.name.toLowerCase()} race on your calendar (or finish one) and it climbs onto this column as its own step${T.beyond[open.ghost] ? `, ${T.beyond[open.ghost]} for example` : ''}.`) : nodeDetail(open, T, el, fDay, N, mark));
    body.append(el('p', 'ck-sub rt-prop', `Every finished distance earns a medal; tap one for the detail.${T.meta.confirmed ? '' : ' Gates proposed by your coach, waiting for your OK.'}`));
    box.replaceChildren(body);
  }
  function nodeDetail(n, T, el, fDay, N, mark) {
    const x = T.st.get(n.id); const p = el('div', 'rt-det'); const mi = (km) => `${CX.fixed(km / 1.609, km < 5 ? 2 : 1)} mi`;
    const head = el('p'); head.append(el('b', null, n.label), ' · ', x.s === 'done' ? (x.how === 'race' ? 'Raced' : 'Covered in training') : x.s === 'open' ? 'Open: the next step on this line' : `Locked: opens after ${(T.nodes.find((o) => o.id === n.after) || {}).label || 'the step before'}`); p.append(head);
    if (n.added) p.append(el('p', 'ck-sub', 'Added because a race of this distance is on your calendar or record.'));
    const r = T.raced.get(n.id); if (r) p.append(el('p', 'ck-sub', `${r.name}, ${fDay(r.date)}.`));
    if (n.line === 'tri') { const lg = legKm(n); const q = el('p', 'ck-sub'); q.append('Legs on your record: ', Object.entries(lg).map(([s, km]) => `${s} ${mi(km)} ${T.longest[s] && N(T.longest[s].distance_km) >= km * (Number(T.meta.cover_share) || 0.95) ? 'covered' : 'not yet'}`).join(', '), '.'); p.append(q); }
    else if (x.s !== 'locked') { const a = T.longest[n.line], rc = T.recent[n.line]; const q = el('p', 'ck-sub');
      if (x.how === 'training' && a) q.append(`Longest ${n.line === 'bike' ? 'ride' : n.line === 'swim' ? 'swim' : 'run'}: ${mi(N(a.distance_km))} on ${fDay(String(a.local_start).slice(0, 10))}.`);
      else if (x.s === 'open') q.append(rc ? `Longest in the last ${T.weeks} weeks: ${mi(N(rc.distance_km))} of ${mi(Number(n.km))}.` : `Nothing in the last ${T.weeks} weeks yet; ${mi(Number(n.km))} covers it.`);
      if (q.childNodes.length) { if (mark) mark(q, 'activities', 'distance_km', a ? 'activity_id=' + a.activity_id : null, 'longest'); p.append(q); } }
    const pin = T.pinned.get(n.id); if (pin) p.append(el('p', 'ck-sub', `On your calendar: ${pin.name}, ${fDay(pin.date)}.`));
    return p;
  }

  function render() { if (!$('r-tree')) mount(); renderShelf(); renderTree(); }
  function mount() { // the Race tree card under the season summary; Badges is a panel inside it (index.html #r-p-badges)
    const { el, icon } = A(); const after = $('r-st'); if (!after || !el) return;
    const a = el('article', 'ck-tile sn-earn eb-space'); a.id = 'r-tree'; a.setAttribute('aria-labelledby', 'r-rt-h'); const hd = el('div', 'ck-tile-head sn-head'); const h = el('h2', 'ck-h3'); h.id = 'r-rt-h'; h.append(icon('flag'), 'Race tree');
    const cap = el('span', 'ck-sub'); cap.id = 'r-rt-cap'; hd.append(h, cap); const tb = el('div'); tb.id = 'r-rt'; a.append(hd, tb); after.after(a);
  }
  const wrap = () => { const orig = CX.renderRaces; if (!orig || orig.__eb) return; const f = () => { orig(); try { render(); } catch (e) { /* the rest of Season still draws */ } }; f.__eb = true; CX.renderRaces = f; };
  wrap();
  (async () => {
    try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (db) { try { const d = await db.doc('badges/earned').get(); const v = d && d.exists ? d.data() : null; let items = v ? v.items : null; if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = null; } }
      if (Array.isArray(items)) for (const b of items) if (b && b.id) kept.set(String(b.id), b); } catch (e) { /* drawn from the record */ } }
    loaded = true; if (window.CX.state && window.CX.state.page === 'races') render();
  })();
  CX.badges = { earnedNow, badges, treeState, raceDist };
})();
