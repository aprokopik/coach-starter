// lifts.js: the Lifts tab (Long Life Lifts log and progression).
// Cockpit, Phase 5 (Nov 4, 2026): the cards use the Cockpit parts (ck-tile, ck-list rows, ck-btn, ck-input, ck-state, the
// raised ck-finish bar) through window.CX.ck (app.js). Only the markup and the status lines changed: what is saved, the
// draft key lx-draft-<date>, the document ids, the field names and the timing of saves are as before.
(() => {
  const { dayN } = window.CX;
  const { icon, badge, mark, cardState } = window.CX.ck;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const N = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const fD = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fWD = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const stamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const mk = (tag, cls, txt, src, field, where, derived) => mark(el(tag, cls, txt), src, field, where, derived);
  // Status lines (Cockpit): the same words as before; ok = check glyph and the Good ink, retry = Watch glyph and ink (a save
  // that failed and is retrying on its own: pending, nothing to do), err = Act glyph and ink (a save that cannot run here), kept = the stale glyph and Watch ink (sets restored from this phone, not yet
  // in the store); no class = plain words (Saving…, Sets save as you type.).
  const LINE_I = { ok: 'check', err: 'act', retry: 'watch', kept: 'stale' };
  const line = (e, base, t, c) => { if (!e) return; e.className = base; e.dataset.s = c || ''; e.replaceChildren(); if (t && LINE_I[c]) e.append(icon(LINE_I[c])); if (t) e.append(el('span', null, t)); };
  const status = (t, c) => line($('l-status'), 'lx-st', t, c);
  // The log card's shared state sits inside the exercise list (#l-ex), so the date, the bar and Finish stay where they were
  // (Lifts review F1): loading while the routine is awaited, error or empty when it cannot come; the fields are never hidden.
  const exState = (st, text) => { const box = $('l-ex'); const s = el('div', 'ck-state'); s.dataset.state = st; s.setAttribute('role', st === 'error' ? 'alert' : 'status');
    if (st === 'loading') { s.setAttribute('aria-busy', 'true'); s.append(el('span', 'ck-vh', 'Loading')); for (const c of ['ck-skel ck-skel--lg', 'ck-skel', 'ck-skel ck-skel--md']) { const k = el('span', c); k.setAttribute('aria-hidden', 'true'); s.append(k); } }
    else { const w = el('span', 'ck-state-w'); w.append(icon(st === 'error' ? 'act' : 'unknown'), st === 'error' ? 'Could not load' : 'Nothing yet'); s.append(w, el('span', null, text)); }
    box.replaceChildren(s); };
  let db = null, logs = new Map(), choices = new Map(), loaded = false, builtKey = '', date = TODAY, rpeSel = null, saving = false;
  // Autosave (the athlete, Nov 2, 2026): every change saves the day's lift_log a moment after typing stops and whenever the page is hidden.
  // A copy is kept in this browser first (lx-draft-<date>), so a failed or interrupted save is restored and sent on the next try.
  const DELAY = 1200, RETRY = 15000;
  let timer = null, again = false, fsRpe = new Map();
  // Done per exercise (the athlete, Nov 2, 2026): tapping Done saves at once and folds the exercise to one line; stored as done: [<ex>] on the day.
  let doneSet = new Set(), skipSet = new Set();
  const arr = (v) => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; };
  const lsKey = (d) => 'lx-draft-' + d;
  const draftGet = (d) => { try { const t = localStorage.getItem(lsKey(d)); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const draftPut = (d, v) => { try { localStorage.setItem(lsKey(d), JSON.stringify(v)); } catch (e) { /* storage blocked: the store save still runs */ } };
  const draftDrop = (d, at) => { try { const x = draftGet(d); if (x && (!at || x.at <= at)) localStorage.removeItem(lsKey(d)); } catch (e) { /* ignore */ } };
  const bar = (t, c) => line($('l-barst'), 'lx-barst', t, c);
  const finBtn = (done) => { const b = $('l-save'); b.replaceChildren(...(done ? [icon('check'), 'Session saved'] : ['Finish session'])); b.classList.toggle('done', !!done); };

  // The data runtime hands nested lists and objects back as JSON text (as checkins.js and pillars.js unpack): parse the lift
  // rows' fields once per data set, so legacy_ids (old pre-id logs), a phase's allow (the allowed-leg note) and a proposal's
  // swaps read as they did when the runtime returned real objects.
  const _parsed = new WeakMap();
  const unpack = (x) => { if (!String(x.kind || '').startsWith('lift_')) return x; const o = { ...x }; for (const k in o) { const v = o[k]; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { o[k] = JSON.parse(v); } catch (e) { /* plain text */ } } } return o; };
  // Use today (6.130.0; the athlete, Nov 16 in a hotel: "Make a routine for me to follow. That should have been default."): any
  // library or own routine with a plan (plan_ex, built from exercises.json) runs for one day. The pick is kept per date on
  // this phone (lx-today) and in the day's saved log (routine), so a reload keeps it; the routine itself never changes.
  const TK = 'lx-today';
  let todayPick = (() => { try { const v = JSON.parse(localStorage.getItem(TK) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } })();
  // the day of a split picked for today (Do today on the routine page; this phone only until a set saves the day in lift_log)
  let dayPick = (() => { try { const v = JSON.parse(localStorage.getItem('lx-day') || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } })();
  const setDay = (k) => { dayPick = { ...dayPick, [date]: k }; try { localStorage.setItem('lx-day', JSON.stringify(dayPick)); } catch (e) { /* this phone only */ } };
  const setToday = (id) => { todayPick = { ...todayPick, [date]: id }; try { localStorage.setItem(TK, JSON.stringify(todayPick)); } catch (e) { /* this phone only */ } };
  // Made by you on this phone (A2 G/H and A3, the athlete's comments Nov 16): lift_mine/<id> holds a routine picked lift by lift
  // or saved from another (Keep this routine?, + Save to my routines); lift_ask/<id> holds a Tell the coach request. The
  // coach copies both into coach/my_routines.json (RUNBOOK, Routines made on the dashboard); the copy in the data wins.
  let mineDocs = new Map(), asks = new Map(), keepAsk = '';
  const mineRows = (m) => [...mineDocs.entries()].filter(([id, d]) => d && !d.hidden && Array.isArray(arr(d.plan)) && arr(d.plan).length && !m.lib.some((x) => x.id === id))
    .map(([id, d]) => ({ kind: 'lift_lib', id, name: d.name || 'My routine', minutes: N(d.minutes) || 20, needs: d.needs || '', mine: true, plan_ex: arr(d.plan), lifts: arr(d.plan).map((p) => p.name || p.id).join('; ') }));
  const runnable = (x) => !!(x && Array.isArray(x.plan_ex) && x.plan_ex.length);
  // a plan row carries the exercise id, its block and only the dose it changes; the rest comes from the exercise list
  const planEx = (m, x, rid) => x.plan_ex.map((p, i) => ({ busy: i < 4, ...(m.xlib.get(p.id) || {}), ...p, ex: p.id, id: p.id, order: i, routine: rid || x.id }));
  function model() {
    const b = baseModel(); if (!b) return null; b.lib = [...b.lib, ...mineRows(b)];
    const own = b.routine.routine, dr = window.CX.app ? window.CX.app.kind('day').find((x) => x.date === date && x.type === 'strength' && x.routine) : null;
    const s = Object.prototype.hasOwnProperty.call(todayPick, date) ? todayPick[date] : (logs.get(date) || {}).routine || (dr && dr.routine);
    const g = s && s !== own ? b.lib.find((x) => x.id === s && runnable(x)) : null; if (!g) return b;
    return { ...b, base: b, guest: g, routine: { ...b.routine, routine: g.id, name: g.name, subtitle: `Today only \u00b7 back to ${b.routine.name} tomorrow`, minutes: g.minutes, busy_minutes: g.busy_minutes },
      ex: planEx(b, g), blocks: (arr(g.plan_blocks).length ? arr(g.plan_blocks) : [...new Set(arr(g.plan_ex).map((p) => p.block || '1'))].map((k, i) => ({ block: k, order: i, label: k === '1' ? 'Block 1 \u00b7 superset' : 'Block ' + k, note: k === '1' ? 'about 90 s between rounds' : 'in order, about a minute between sets' }))).map((x) => ({ ...x, routine: g.id })) };
  }
  // Season sets (the athlete, Nov 16, 2026, card "Endurance first, two lift steps"): a lift_phase row may carry `sets` for the slots in
  // `sets_ex`, and `per_week` / `minutes` for the routine; the session on that date uses them, and the phase list shows them ahead
  // Day types (the athlete, Nov 17, 2026, card "Show Feb 1 heavy and moderate days through rotation A"): a phase's `days` take turns in
  // order. The session takes the day after the last session logged with one (lift_log `day`), so a missed day never skips a
  // type; a day already saved keeps its type. Each day sets lo and hi on the `days_ex` slots and may change block notes.
  const dayOf = (ph, d, rid) => {
    const D = arr(ph.days); if (!D.length) return null; const at = (k) => Math.max(0, D.findIndex((x) => x.key === k));
    const own = logs.get(d); if (own && own.day && D.some((x) => x.key === own.day)) return { i: at(own.day), D };
    if (dayPick[d] && D.some((x) => x.key === dayPick[d])) return { i: at(dayPick[d]), D };
    const prev = [...logs.values()].filter((x) => x && x.day && x.date < d && (!x.routine || x.routine === rid) && D.some((y) => y.key === x.day)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return { i: prev ? (at(prev.day) + 1) % D.length : 0, D };
  };
  // A split (rotation A for people who keep more than one routine, the athlete, Nov 16, 2026): the same `days` on the lift_routine row,
  // each with `ex`, the slots that day holds (Upper body, Lower body); a phase's own days win while it runs.
  const withPhase = (m) => {
    const ph = m.phases.find((p) => date >= p.start && date <= p.end) || null;
    const src = ph && arr(ph.days).length ? ph : arr(m.routine.days).length ? m.routine : null; if (!ph && !src) return m;
    const ids = new Set(arr(ph && ph.sets_ex)), n = N(ph && ph.sets);
    let ex = n ? m.ex.map((e) => (ids.has(e.ex) ? { ...e, sets: n } : e)) : m.ex, blocks = m.blocks, day = null;
    const dt = src ? dayOf(src, date, m.routine.routine) : null;
    if (dt) {
      const cur = dt.D[dt.i], nx = dt.D[(dt.i + 1) % dt.D.length], dx = new Set(arr(src.days_ex).length ? arr(src.days_ex) : arr(src.sets_ex));
      day = { key: cur.key, label: cur.label, next: nx.key !== cur.key ? nx.label : '', hint: cur.hint || '' };
      // a split is one bundle (the athlete, Nov 17, 2026: "multiple days, set up into one bundle"): every day with its own lifts, in
      // order from today's, for the routine's own page
      if (dt.D.every((d) => arr(d.ex).length)) { const all = ex, L = dt.D.length; day.bundle = dt.D.map((d, k) => ({ key: d.key, label: d.label, at: (k - dt.i + L) % L, ex: all.filter((e) => arr(d.ex).includes(e.ex)) })).sort((x, y) => x.at - y.at); }
      if (arr(cur.ex).length) { const only = new Set(arr(cur.ex)); ex = ex.filter((e) => only.has(e.ex)); }
      ex = ex.map((e) => (dx.has(e.ex) ? { ...e, ...(N(cur.lo) ? { lo: N(cur.lo) } : {}), ...(N(cur.hi) ? { hi: N(cur.hi) } : {}), day_key: cur.key, day_hint: cur.hint || '' } : e));
      const nt = cur.notes && typeof cur.notes === 'object' ? cur.notes : {}; blocks = m.blocks.map((b) => (nt[b.block] ? { ...b, note: nt[b.block] } : b));
    }
    if (!ph) return { ...m, day, blocks, ex };
    return { ...m, day, blocks, routine: { ...m.routine, ...(N(ph.per_week) ? { per_week: N(ph.per_week), when: `Any ${N(ph.per_week)} days that fit` } : {}), ...(N(ph.minutes) ? { minutes: N(ph.minutes) } : {}) }, ex };
  };
  function baseModel() {
    const d = dash.data('coach'); if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    if (!_parsed.has(d.data)) _parsed.set(d.data, d.data.map(unpack));
    const r = _parsed.get(d.data); const routine = r.find((x) => x.kind === 'lift_routine'); if (!routine) return null;
    const mine = (k) => r.filter((x) => x.kind === k && x.routine === routine.routine).sort((a, b) => (N(a.order) ?? 0) - (N(b.order) ?? 0));
    return withPhase({ routine, blocks: mine('lift_block'), ex: mine('lift_ex'), phases: mine('lift_phase'), rules: mine('lift_rule'),
      hist: new Map(r.filter((x) => x.kind === 'lift_hist').map((x) => [x.id, x])), xlib: new Map(r.filter((x) => x.kind === 'lift_xlib').map((x) => [x.id, x])), proposals: r.filter((x) => x.kind === 'lift_proposal'),
      // my_routines.json rows come after routines.json in the data: a same-id row is the person's edit and wins; hidden drops one
      lib: [...r.filter((x) => x.kind === 'lift_lib').reduce((a, x) => a.set(x.id, x), new Map()).values()].filter((x) => !x.hidden && x.lifts).sort((a, b) => (N(a.order) ?? 99) - (N(b.order) ?? 99)) });
  }
  const hasLoad = (e) => e.load === 'lb' || e.load === 'lb_added';
  // kg for a metric person (6.108.0): loads stay lb in the data, converted only here
  const alpha = (id) => !!(window.CX.app && window.CX.app.kind('alpha').some((b) => b.id === id));
  // Clean session (alpha lift_clean; the athlete's option 1 notes on the cleanup page, Nov 16, 2026): one hint line (last time and
  // the aim), column heads carry the range, grey boxes hold last time, one Done per block, skip reasons, Time for more,
  // Easy / Steady / Hard, and a Routines page of tiles in place of the dropdown.
  const CL = () => alpha('lift_clean');
  const KG = () => !!(window.CX.U && window.CX.U.metric()) && alpha('lift_kg'), wU = () => (KG() ? 'kg' : 'lb');
  const toU = (lb) => (KG() && lb !== null && lb !== undefined ? Math.round(lb * 0.45359237 * 2) / 2 : lb);
  const fromU = (v) => (KG() && v !== null && v !== undefined ? Math.round((v / 0.45359237) * 100) / 100 : v);
  const setU = (t) => (KG() ? String(t || '').replace(/(\+?)(\d+(?:\.\d+)?)×/g, (x, p, n) => `${p}${toU(+n)}×`) : t);
  const side = (e) => (e.per_side ? (e.unit === 's' ? ' /side' : ' /leg') : '');
  const doseTxt = (e) => `${e.sets} × ${N(e.lo) === N(e.hi) ? e.lo : e.lo + '–' + e.hi}${e.unit === 's' ? ' s' : ''}${side(e)}${e.extra ? ' ' + e.extra : ''}`;
  const loadTxt = (e, lb) => (e.load === 'lb_added' ? (lb > 0 ? `+${toU(lb)}` : 'BW') : `${toU(lb)}`);
  const setTxt = (e, st) => `${hasLoad(e) && N(st.lb) !== null ? loadTxt(e, N(st.lb)) + '×' : ''}${N(st.reps) ?? '?'}${e.unit === 's' ? ' s' : ''}`;
  const exWhere = (e) => `kind=lift_ex&routine=${e.routine}&ex=${e.ex}`;
  const phaseAt = (m, d) => m.phases.find((p) => d >= p.start && d <= p.end) || null;
  // History follows the exercise id, not the slot (the athlete, Oct 24): a lift that rotates out and back keeps its record.
  // Documents saved before ids were recorded map slot to exercise with the routine's legacy_ids.
  let legacy = {};
  const idOf = (d, slot) => (d.ids && d.ids[slot]) || legacy[slot] || slot;
  const history = (exId) => [...logs.values()].filter((d) => d && d.sets).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => { const slot = Object.keys(d.sets).find((k) => idOf(d, k) === exId && Array.isArray(d.sets[k]) && d.sets[k].length); return slot ? { date: d.date, sets: d.sets[slot], day: d.day || '', rpe: N(d.rpe) } : null; })
    .filter(Boolean);
  const lastBefore = (exId, d, dk) => { const h = history(exId).filter((x) => x.date < d); const s = dk ? h.filter((x) => x.day === dk) : []; return s.length ? s[s.length - 1] : h.length ? h[h.length - 1] : null; };
  // The next step as a key and a short value (the athlete, Nov 5, point 4): the log row shows them as a chip ("Next · same load,
  // aim for 8"); the Progress tile keeps the whole sentence (t), which adds what the chip leaves out (" on every set").
  const H = (up, k, v, more) => ({ up, k, v, t: (k ? k + ': ' : '') + v + (more || '') });
  function hint(e, last, mode) {
    if (!last) return null;
    if (mode === 'light') return H(false, 'Light phase', 'same or lighter, stop with 3+ reps left');
    if (mode === 'upper' && e.legs) return H(false, null, 'Not in this phase yet');
    const full = last.sets.length >= N(e.sets) && last.sets.every((st) => N(st.reps) !== null && N(st.reps) >= N(e.hi));
    if (full && last.rpe >= 6) return H(false, 'Next', `same, ${e.hi} again`, ' (felt Hard)');
    if (full) {
      if (hasLoad(e)) { const top = Math.max(...last.sets.map((st) => N(st.lb) ?? 0)); return H(true, 'Next', `${loadTxt(e, top + (N(e.step) || 5))} ${wU()}, back to ${e.lo}${e.unit === 's' ? ' s' : ''}`); }
      return H(true, 'Next', e.next_hard || 'make it harder');
    }
    return H(false, 'Next', `same ${hasLoad(e) ? 'load' : 'setup'}, aim for ${e.hi}${e.unit === 's' ? ' s' : ''}`, ' on every set');
  }

  // "Last time 55 lb 2×8 · aim 55×9" (the athlete: just last time, weight sets×reps; BW = body weight; every lift with history has an aim)
  const rng = (a) => (a.length ? (Math.min(...a) === Math.max(...a) ? String(a[0]) : Math.min(...a) + '–' + Math.max(...a)) : '?');
  function cleanHint(e, last, mode) {
    if (!last) return null;
    const S = last.sets.filter((st) => N(st.reps) !== null), u = e.unit === 's' ? ' s' : '', ps = e.per_side ? ' a side' : '';
    const top = hasLoad(e) ? Math.max(0, ...S.map((st) => N(st.lb) ?? 0)) : null;
    const ld = hasLoad(e) ? (e.load === 'lb_added' && !(top > 0) ? 'BW ' : loadTxt(e, top) + ' ' + wU() + ' ') : '';
    const t = `Last time ${ld}${S.length}×${rng(S.map((st) => N(st.reps)))}${u}${ps}`;
    if (mode === 'light') return { t, aim: 'same or lighter' };
    if (e.day_key && last.day !== e.day_key && e.day_hint) return { t, aim: '', say: e.day_hint };
    const best = Math.max(0, ...S.map((st) => N(st.reps) ?? 0)), full = S.length >= N(e.sets) && S.every((st) => N(st.reps) >= N(e.hi));
    let aim;
    if (full && last.rpe >= 6) aim = `${hasLoad(e) ? loadTxt(e, top) + '×' : ''}${e.hi}${u}${ps} again (felt Hard)`;
    else if (full && hasLoad(e)) aim = `${loadTxt(e, top + (N(e.step) || 5))}×${e.lo}${u}`;
    else if (full) aim = e.next_hard || 'make it harder';
    else aim = `${hasLoad(e) ? (e.load === 'lb_added' && !(top > 0) ? 'BW×' : loadTxt(e, top) + '×') : ''}${Math.min(best + 1, N(e.hi))}${u}${ps}`;
    return { t, aim };
  }
  const colHead = (e) => `${e.unit === 's' ? (e.per_side ? 's per side' : 'sec') : e.per_side ? 'per side' : 'reps'} (${N(e.lo) === N(e.hi) ? e.lo : e.lo + '–' + e.hi})`;
  let skipWhy = {};
  const WHY = ['Pain', 'No time', 'No kit', 'Other'];
  function chips(box, opts, labels, get, setv) {
    box.replaceChildren(...opts.map((v, i) => { const b = el('button', 'lx-opt'); b.append(icon('check'), labels ? labels[i] : v + ' min'); b.type = 'button'; b.dataset.v = v; b.addEventListener('click', () => { setv(get() === v ? null : v); paint(); }); return b; }));
    const paint = () => { for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(get() === b.dataset.v)); };
    paint(); return paint;
  }
  let paintRpe = () => {}, rpe3 = false;

  const extraSets = new Map(); // extra set rows added with + set, per exercise, for the day being logged
  // Lift day: the day's strength plan row (week.json `lifts`, `lifts_busy`) sets which lifts are open; the rest fold.
  let dayView = 'plan', dayFor = '', dayMins = 0;
  // Minus and plus (alpha lift_time; the athlete, Nov 16, 2026, option 1C): the minutes rebuild the session. About 1.25 min a set
  // (1.75 per side) and 2 to set up. Over time: extras go first (not loaded, not in the busy version), then the busy-version
  // lifts, then sets drop to 1; with nothing cut, spare time adds a set to main lifts (loaded, both sides).
  function fitTime(ex, mins) {
    const main = (e) => /^lb/.test(e.load || '') && !e.per_side, rank = (e) => (main(e) ? 0 : e.busy ? 1 : 2);
    const per = (e) => (e.per_side ? 1.75 : 1.25), cost = (L) => 2 + L.reduce((s, x) => s + x.n * per(x.e), 0);
    let L = ex.map((e) => ({ e, n: N(e.sets) || 2 })).sort((a, b) => rank(a.e) - rank(b.e) || a.e.order - b.e.order); const k = L.length;
    while (cost(L) > mins && L.length > 1 && rank(L[L.length - 1].e) > 0) L.pop();
    for (let i = L.length - 1; cost(L) > mins && i >= 0; i--) L[i].n = 1;
    while (cost(L) > mins && L.length > 1) L.pop();
    if (L.length === k && L.every((x) => x.n === (N(x.e.sets) || 2))) for (const x of L) if (main(x.e) && cost(L) + per(x.e) <= mins) x.n++;
    return new Map(L.map((x) => [x.e.ex, x.n]));
  }
  const codes = (v) => String(v || '').split(/[;,\s]+/).filter(Boolean);
  function dayPlan(m) {
    const A = window.CX.app; if (!A) return null;
    const r = A.kind('day').filter((x) => x.date === date && x.type === 'strength').sort((a, b) => (a.order || 0) - (b.order || 0))[0];
    if (!r) return null;
    const own = new Set(m.ex.map((e) => e.ex)), pick = (v) => codes(v).filter((c) => own.has(c));
    let full = pick(r.lifts); if (!full.length && /upper/i.test(r.title || '')) full = m.ex.filter((e) => !e.legs).map((e) => e.ex);
    return { r, full, busy: pick(r.lifts_busy) };
  }
  function build(m) {
    const box = $('l-ex'); box.replaceChildren(); box.classList.remove('dash-skeleton');
    const dp = dayPlan(m), tm = alpha('lift_time');
    if (dayFor !== date) { dayView = 'plan'; dayFor = date; mfy = null; dayMins = N(dp && dp.r.minutes) || N(m.routine.minutes) || 25; }
    const fit = tm && dayView !== 'all' ? fitTime(m.ex.filter((e) => (mfy ? mfy.ex.includes(e.ex) : !dp || !dp.full.length || dp.full.includes(e.ex))), dayMins) : null;
    const want = fit ? [...fit.keys()] : mfy ? mfy.ex : dp && (dayView === 'busy' && dp.busy.length ? dp.busy : dp.full);
    // a lift with sets already saved or typed that day always shows, so saving never drops it (collect reads the open inputs)
    const has = (e) => !!(saved && saved.sets && Array.isArray(saved.sets[e.ex]) && saved.sets[e.ex].length) || doneSet.has(e.ex) || skipSet.has(e.ex);
    const inDay = (e) => !want || !want.length || dayView === 'all' || want.includes(e.ex) || has(e);
    if (tm) {
      const pr = el('div', 'lx-day lx-time'), lab = (dp ? (date === TODAY ? 'Today: ' : fWD(date) + ': ') + dp.r.title : 'Time you have');
      const st = (d, t) => { const b = el('button', 'ck-btn ck-btn--secondary lx-tbtn', t); b.type = 'button'; b.setAttribute('aria-label', (d > 0 ? 'Add' : 'Take off') + ' 5 minutes');
        b.disabled = d > 0 ? dayMins >= 60 : dayMins <= 10; b.addEventListener('click', () => { flush(); dayMins += d; build(m); const nb = document.querySelector(`.lx-tbtn[aria-label^="${d > 0 ? 'Add' : 'Take'}"]`); if (nb) nb.focus(); }); return b; };
      const mn = el('b', 'lx-tmin', dayMins + ' min'); mn.setAttribute('aria-live', 'polite'); mn.setAttribute('aria-label', 'Time you have: ' + dayMins + ' min');
      const row = el('div', 'lx-trow'); row.append(st(-5, '−'), mn, st(5, '+'));
      if (CL()) { // UI pass (the athlete, Nov 17, 2026, 12:06 AM: "I still prefer the plus and minus on time"; 12:23 AM, A): one joined − | TIME 25 min | + bar
        pr.classList.add('lx-tclean'); pr.append(el('span', 'ck-sub', 'Time'), row);
      } else pr.append(mk('span', 'ck-sub', lab, dp ? 'coach' : null, null, dp ? `kind=day&date=${dp.r.date}&order=${dp.r.order}` : null, 'plan'), row); box.append(pr);
    } else if (dp) {
      const pr = mk('div', 'lx-day', null, 'coach', null, `kind=day&date=${dp.r.date}&order=${dp.r.order}`, 'plan');
      const busy = dayView === 'busy' && dp.busy.length, mins = busy ? N(dp.r.fallback_minutes) : N(dp.r.minutes);
      pr.append(el('b', null, (date === TODAY ? 'Today: ' : fWD(date) + ': ') + (busy ? 'busy version' : dp.r.title) + (mins ? `, ${mins} min` : '')));
      if (dp.busy.length) { const bb = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-daybtn', busy ? 'Back to the full plan' : `Short on time? Busy version${N(dp.r.fallback_minutes) ? ', ' + N(dp.r.fallback_minutes) + ' min' : ''}`); bb.type = 'button';
        bb.addEventListener('click', () => { dayView = busy ? 'plan' : 'busy'; build(m); }); pr.append(bb); }
      box.append(pr);
    }
    const ph = phaseAt(m, date) || {}; const mode = ph.mode || 'normal';
    const stored = logs.get(date) || null; const dr = draftGet(date);
    // A draft newer than the stored day (typed but not yet saved, e.g. the page closed mid-save) wins and is sent again below.
    const restored = !!(dr && dr.at && (!stored || dr.at > (stored.saved_at || '')));
    const saved = restored ? { ...(stored || {}), date, sets: dr.sets || {}, rpe: dr.rpe, note: dr.note, done: dr.done, skipped: dr.skipped, skip_why: dr.skip_why } : stored;
    doneSet = new Set(arr(saved && saved.done)); skipSet = new Set(arr(saved && saved.skipped));
    { let w = saved && saved.skip_why; if (typeof w === 'string') { try { w = JSON.parse(w); } catch (x) { w = null; } } skipWhy = w && typeof w === 'object' ? { ...w } : {}; }
    const cl = CL();
    const gate = (e) => { if (mode !== 'upper' || !e.legs) return null; const al = ph.allow && ph.allow[e.ex]; return al ? { off: false, t: al } : { off: true, t: ph.legs_note || 'Not in this phase' }; };
    for (const b of m.blocks) {
      const bw = `kind=lift_block&routine=${b.routine}&block=${b.block}`;
      const blk = el('div', 'lx-block' + (cl ? ' lx-cl' : '')); const bh = el('div', 'lx-bh'); bh.append(mk('h3', 'ck-eyebrow', b.label, 'coach', 'label', bw), mk('span', 'lx-bnote', b.note || '', 'coach', 'note', bw)); blk.append(bh);
      // A block whose exercises are all Done folds to one line (the athlete, Nov 2); tapping it shows the slim lines again.
      const bs = el('button', 'lx-bsum'); bs.type = 'button'; bs.dataset.label = b.label; bs.setAttribute('aria-expanded', 'false');
      bs.addEventListener('click', () => { blk.classList.toggle('peek'); bs.setAttribute('aria-expanded', String(blk.classList.contains('peek'))); }); blk.append(bs);
      const list = el('ul', 'ck-list lx-list'); blk.append(list);
      const bex = m.ex.filter((x) => x.block === b.block && inDay(x)); if (!bex.length) continue;
      for (const e0 of bex) {
        const e = fit && fit.has(e0.ex) ? { ...e0, sets: fit.get(e0.ex) } : e0;
        const gt = gate(e); const ew = exWhere(e);
        const row = el('li', 'ck-row lx-row' + (gt && gt.off ? ' off' : ''));
        const ok = el('span', 'lx-ok'); ok.dataset.ok = e.ex;
        const main = el('span', 'ck-row-main'); main.append(mk('span', 'ck-row-t', e.name, 'coach', 'name', ew), mk('span', 'ck-row-s lx-dose', doseTxt(e), 'coach', null, ew, 'dose'));
        if (gt && gt.off) main.append(el('span', 'ck-chip lx-offchip', 'Not this phase')); // a dimmed leg lift says so in a word, read with the row (the dimming is ink, not opacity)
        const end = el('span', 'ck-row-end'); end.append(ok);
        row.append(mk('span', 'lx-id', e.ex, 'coach', 'ex', ew), main, end);
        if (gt) { const tg = mk('div', 'lx-gate' + (gt.off ? '' : ' ok'), gt.t, 'coach', null, 'kind=lift_phase&routine=' + e.routine + '&mode=upper', 'phase-gate'); row.append(tg); }
        const last = lastBefore(e.id || e.ex, date, e.day_key); const h = gt ? null : hint(e, last, mode);
        if (cl) {
          const ch = gt ? null : cleanHint(e, last, mode), hl = mk('div', 'lx-hint', null, 'coach', null, ew, last ? 'store:lift_log/' + last.date + ' sets, next-step' : 'first-time');
          if (ch) { hl.append(el('span', 'lx-nw', ch.t)); if (ch.aim) hl.append(' · ', el('span', 'lx-nw', 'aim ' + ch.aim)); else if (ch.say) hl.append(' · ', el('span', null, ch.say)); }
          else if (!gt) hl.append(el('span', null, e.day_hint || (hasLoad(e) ? 'First time: pick a load you could lift a few more times' : 'First time: easy version, stop with reps to spare')));
          if (!gt) row.append(hl);
          // How to do it (approved on the Lifts Tab Cleanup page, Nov 16, 2026): first-time lifts fold out the coach's cues
          const how = !last && !gt && (e.how || (m.xlib.get(e.id || e.ex) || {}).how);
          if (how) { const dt = el('details', 'lx-how'), sm = el('summary', null, 'How to do it'), ol = el('ol');
            for (const c of String(how).split(';').map((t) => t.trim()).filter(Boolean)) ol.append(mk('li', null, c.charAt(0).toUpperCase() + c.slice(1), 'coach', 'how', 'kind=lift_xlib&id=' + (e.id || e.ex)));
            dt.append(sm, ol); row.append(dt); }
          const cols = el('div', 'lx-cols2' + (hasLoad(e) ? '' : ' one')); cols.setAttribute('aria-hidden', 'true');
          cols.append(el('span', null, 'Set')); if (hasLoad(e)) cols.append(el('span', null, e.load === 'lb_added' ? '+' + wU() : wU())); cols.append(el('span', null, colHead(e))); row.append(cols);
        } else if (last) {
          const ln = mk('div', 'ck-row-s lx-last', null, null, null, null, 'store:lift_log/' + last.date + ' sets');
          ln.append('Last ' + fD(last.date) + ' · '); ln.append(el('b', null, last.sets.map((st) => setTxt(e, st)).join(', ')));
          row.append(ln);
          if (h) {
            const nx = mk('div', 'ck-chip lx-next' + (h.up ? ' up' : ''), null, 'coach', null, ew, 'next-step');
            if (h.up) nx.append(icon('trend-up'));
            if (h.k) nx.append(el('span', 'ck-chip-k', h.k), ' · ');
            nx.append(el('span', null, h.v)); row.append(nx);
          }
        }
        const sets = el('div', 'lx-sets');
        const cur = saved && saved.sets && Array.isArray(saved.sets[e.ex]) ? saved.sets[e.ex] : [];
        // One input row per set; the routine's set count is the minimum, saved sets or the + set button add more (the athlete, Oct 23)
        const setRow = (i) => {
          const g = el('div', 'lx-set' + (hasLoad(e) ? '' : ' one')); g.append(mk('span', 'lx-setn', `S${i + 1}`, null, null, null, 'set-number'));
          const prev = last && last.sets[i] && !(e.day_key && last.day !== e.day_key) ? last.sets[i] : null; const mine = cur[i] || {}; // grey boxes come only from the same day type
          if (hasLoad(e)) {
            const w = el('input', 'ck-input lx-in'); w.type = 'number'; w.inputMode = 'decimal'; w.step = 'any'; w.min = '0'; w.dataset.ex = e.ex; w.dataset.i = i; w.dataset.f = 'lb';
            w.placeholder = prev && N(prev.lb) !== null ? String(toU(N(prev.lb))) : (cl ? '' : e.load === 'lb_added' ? '+' + wU() : wU()); w.setAttribute('aria-label', `${e.name} set ${i + 1} ${e.load === 'lb_added' ? 'added ' + wU() : wU()}`);
            if (N(mine.lb) !== null) w.value = toU(N(mine.lb)); g.append(w);
          }
          const r = el('input', 'ck-input lx-in'); r.type = 'number'; r.inputMode = 'numeric'; r.step = '1'; r.min = '0'; r.dataset.ex = e.ex; r.dataset.i = i; r.dataset.f = 'reps';
          r.placeholder = prev && N(prev.reps) !== null ? String(prev.reps) : (cl ? '' : e.unit === 's' ? 'sec' : 'reps'); r.setAttribute('aria-label', `${e.name} set ${i + 1} ${e.unit === 's' ? 'seconds' : 'reps'}`);
          if (N(mine.reps) !== null) r.value = mine.reps; g.append(r);
          return g;
        };
        const nSets = Math.max(N(e.sets) || 0, cur.length, extraSets.get(e.ex) || 0);
        for (let i = 0; i < nSets; i++) sets.append(setRow(i));
        const add = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-add', '+ set'); add.type = 'button'; add.setAttribute('aria-label', `Add a set to ${e.name}`);
        add.addEventListener('click', () => { const i = sets.querySelectorAll('.lx-set').length; sets.append(setRow(i)); extraSets.set(e.ex, i + 1); const last2 = sets.querySelectorAll('.lx-set input'); if (last2.length) last2[last2.length - (hasLoad(e) ? 2 : 1)].focus(); });
        const fin = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-done'); fin.append(icon('check'), 'Done'); fin.type = 'button'; fin.setAttribute('aria-label', `${e.name} done`);
        fin.addEventListener('click', () => markDone(e, row, true));
        // Skip (the athlete, Nov 2): only while the exercise has no entries, so typed sets are never thrown away; stored as skipped: [<ex>].
        const sk = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-skip'); sk.append(icon('skip'), 'Skip'); sk.type = 'button'; sk.setAttribute('aria-label', `Skip ${e.name}`);
        sk.addEventListener('click', () => markDone(e, row, true, true));
        const acts = el('div', 'lx-acts'); if (cl) { acts.append(add); end.prepend(sk); } else acts.append(add, sk, fin);
        const sum = el('button', 'lx-sum'); sum.type = 'button'; sum.setAttribute('aria-label', `Edit ${e.name}`);
        sum.addEventListener('click', () => markDone(e, row, false));
        row.dataset.ex = e.ex; row.append(sets, acts, sum); list.append(row);
        if (doneSet.has(e.ex)) fold(e, row, true);
      }
      if (cl) { // one Done per block (superset): untouched grey boxes keep last time's figures
        const ft = el('div', 'lx-bfoot'), nx = el('span', 'ck-sub lx-nset'); nx.setAttribute('aria-live', 'polite');
        const bd = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-bdone'); bd.type = 'button'; bd.append(icon('check'), 'Done'); bd.setAttribute('aria-label', b.label + ' done');
        bd.addEventListener('click', () => blockDone(m, blk)); ft.append(nx, bd); blk.append(ft);
      }
      box.append(blk);
    }
    const out = want && want.length ? m.ex.filter((e) => !want.includes(e.ex) && !has(e)) : [];
    if (out.length && cl && fit) box.append(moreBox(m, out, dp));
    // Looking for something else? (approved on the Lifts Tab Cleanup page): the end of the session opens Something else today
    if (cl) { const lk = el('button', 'lx-look', '\u21bb Looking for something else?'); lk.type = 'button'; lk.addEventListener('click', () => { goR(m, 'need'); $('l-pick').scrollIntoView({ block: 'start' }); }); box.append(lk); }
    else if (out.length) { const fb = el('button', 'lx-dayfold'); fb.type = 'button'; fb.setAttribute('aria-expanded', String(dayView === 'all'));
      fb.append(el('span', null, dayView === 'all' ? 'Back to today\'s plan' : `Not in ${fit ? dayMins + ' min' : 'today\'s plan'} (${out.length}): ${out.map((e) => e.name).join(', ')}`), el('span', 'lx-dayfold-a', dayView === 'all' ? 'Hide' : 'Show'));
      fb.addEventListener('click', () => { dayView = dayView === 'all' ? 'plan' : 'all'; build(m); }); box.append(fb); }
    rpeSel = saved && N(saved.rpe) !== null ? String(saved.rpe) : null;
    paintRpe(); $('l-note').value = saved ? saved.note || '' : '';
    finBtn(!restored && stored && stored.finished_at);
    paintTicks(m); paintSkips(); paintNext();
    if (cl) { rtLine = m.day && !m.guest ? `${m.day.label}${m.day.next ? ' \u00b7 ' + m.day.next + ' next' : ''}` : `${box.querySelectorAll('.lx-row').length} lifts \u00b7 ${dayMins || N(m.routine.minutes) || 25} min`; const rs = document.querySelector('#l-pick .lx-rtsub'); if (rs) rs.textContent = rtLine; else if (!rView && !mfy) renderRoutines(m); }
    if (restored) { bar('Restored sets kept on this phone. Saving…', 'kept'); status(''); schedule(0); }
    else if (stored) { status('Saved ' + fWD(stored.date) + (stored.saved_at ? ', ' + stamp(stored.saved_at) : ''), 'ok'); bar('All sets saved · ' + stamp(stored.saved_at), 'ok'); }
    else { status(db ? (cl ? '' : date === TODAY ? 'No sets saved today yet' : 'No sets saved for ' + fWD(date)) : (loaded ? '' : 'Loading…')); bar(db ? 'Sets save as you type.' : (loaded ? 'Saving is not available in this view.' : '')); }
  }

  // Block Done: fill the empty boxes that show last time's figures (grey), then fold every lift in the block.
  function blockDone(m, blk) {
    for (const r of blk.querySelectorAll('.lx-row:not(.done)')) {
      for (const i of r.querySelectorAll('.lx-sets input')) if (i.value === '' && i.placeholder !== '' && !isNaN(Number(i.placeholder))) i.value = i.placeholder;
      const e = m.ex.find((x) => x.ex === r.dataset.ex); if (e) { const has = [...r.querySelectorAll('.lx-sets input')].some((i) => i.value !== ''); markDone(e, r, true, !has); }
    }
    paintNext();
  }
  // "Next: set 2 of 3 on each lift" under each open block
  function paintNext() {
    for (const f of document.querySelectorAll('#l-ex .lx-bfoot')) {
      const rows = [...f.closest('.lx-block').querySelectorAll('.lx-row:not(.done):not(.off)')];
      if (!rows.length) { f.hidden = true; continue; } f.hidden = false;
      const per = rows.map((r) => [...r.querySelectorAll('.lx-set')].map((g) => [...g.querySelectorAll('input')].some((i) => i.value !== '')));
      const n = Math.min(...per.map((p) => p.filter(Boolean).length)), M = Math.max(...per.map((p) => p.length));
      f.firstChild.textContent = n >= M ? 'All sets in. Tap Done.' : `Next: set ${n + 1} of ${M}${rows.length > 1 ? ' on each lift' : ''}`;
    }
  }
  // Time for more (the athlete, Nov 16): +5, +10 and +15 minutes add NEW lifts at the end in the coach's order, never sets on a lift
  // already done; each button lists what it adds. Show all opens every lift, as before.
  function moreBox(m, out, dp) {
    const pool = m.ex.filter((e) => (mfy ? mfy.ex.includes(e.ex) : !dp || !dp.full.length || dp.full.includes(e.ex))), now = new Set(fitTime(pool, dayMins).keys());
    const box = el('div', 'lx-more'), hd = el('div', 'lx-morehd'); hd.append(el('b', null, 'Time for more?'));
    const sa = el('button', 'lx-showall', 'Show all'); sa.type = 'button'; sa.addEventListener('click', () => { dayView = 'all'; build(m); }); hd.append(sa); box.append(hd);
    const row = el('div', 'lx-more3'); let seen = '';
    for (const d of [5, 10, 15]) {
      if (dayMins + d > 60) break;
      const add = [...fitTime(pool, dayMins + d).keys()].filter((k) => !now.has(k)).map((k) => m.ex.find((e) => e.ex === k)).filter(Boolean);
      const key = add.map((e) => e.ex).join(); if (!add.length || key === seen) continue; seen = key;
      const b = el('button', 'lx-tmb'); b.type = 'button'; b.append(el('b', null, `+${d} min`)); for (const e of add) b.append(el('span', null, e.name));
      b.setAttribute('aria-label', `Add ${d} minutes: ${add.map((e) => e.name).join(', ')}`);
      b.addEventListener('click', () => { flush(); dayMins += d; build(m); }); row.append(b);
    }
    if (row.childNodes.length) box.append(row);
    box.append(el('p', 'ck-sub', `Not in ${dayMins} min: ${out.map((e) => e.name).join(', ')}`));
    return box;
  }
  // This week's lifts as discs beside the title (game look pass, the athlete's pick 4, Nov 14, 2026): one disc per lift in the week's
  // target, filled for each day with a lift on record (coach outcome_week, the Doing the plan count), plus a lift saved on this
  // phone this week that the data has not caught up with yet (data-derived live). The next disc rings when today is still open.
  function weekDiscs() {
    const A = window.CX.app; const head = $('l-name-h'); if (!A || !head) return;
    const old = document.getElementById('l-wk'); if (old) old.remove();
    const wk = A.monday(TODAY), row = A.kind('outcome_week').find((x) => x.start === wk);
    const tgt = row ? N(row.lifts_target != null ? row.lifts_target : row.lifts_planned) || 2 : 2;
    const days = new Set(String(row ? row.lifts_days || '' : '').split(';').filter(Boolean));
    const fromRow = row ? N(row.lifts_done) || 0 : 0;
    const live = [...logs.keys()].filter((d) => dayN(d) >= dayN(wk) && dayN(d) <= dayN(TODAY) && !days.has(d)).length;
    const n = fromRow + live, nS = Math.max(tgt, n);
    const box = el('span', 'lx-wk'); box.id = 'l-wk';
    const lab = el('span', 'lx-wk-l', 'this week'); box.append(lab);
    const ds = el('span', 'lx-wk-d'); ds.setAttribute('role', 'img');
    ds.setAttribute('aria-label', `Lifts this week: ${n} of ${tgt}` + (live ? `, ${live} saved on this phone` : ''));
    for (let i = 0; i < nS; i++) { const d = el('i', i < n ? 'on' : i === n && !logs.has(TODAY) ? 'next' : null); d.textContent = String(i + 1); d.setAttribute('aria-hidden', 'true'); ds.append(d); }
    // the count in words beside the discs (plain reading, the athlete Nov 15, 2026: the check runs on every proposed change), so a
    // first reader never has to work out that a filled disc means done; the discs' own label says it for screen readers
    const fig = live ? mk('span', null, String(n), null, null, null, 'live') : mk('span', null, String(n), 'coach', 'lifts_done', 'kind=outcome_week&start=' + wk);
    const cnt = el('span', 'lx-wk-n'); cnt.setAttribute('aria-hidden', 'true'); cnt.append(fig, ' of ', mk('span', null, String(tgt), null, null, null, 'lift-target'), ' done');
    box.append(ds, cnt);
    head.parentNode.insertBefore(box, $('l-status'));
  }
  // Routine picker (6.102.0): library coach/routines.json; the current routine is preselected; a pick is a request (lift_pref/routine).
  let pickPending = null, pickView = '', rtLine = '', dOpen = false; // rtLine: "8 lifts · 25 min" on the routine row (UI pass)
  function renderPicker(m) {
    const box = $('l-pick'); if (!box) return; box.hidden = m.lib.length < 2; if (box.hidden) return;
    const cur = m.routine.routine, view = pickView || cur, row = m.lib.find((x) => x.id === view) || m.lib[0];
    const lab = el('label', 'ck-label', 'Routine'); lab.htmlFor = 'l-picksel';
    const sel = el('select', 'ck-input lx-picksel'); sel.id = 'l-picksel';
    for (const x of m.lib) { const o = el('option', null, x.name + (x.id === cur ? ' · recommended' : '')); o.value = x.id; if (x.id === view) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => { pickView = sel.value; renderPicker(m); const s2 = $('l-picksel'); if (s2) s2.focus(); });
    const lw = `kind=lift_lib&id=${row.id}`;
    const card = el('div', 'lx-pickcard' + (row.id === cur ? ' rec' : ''));
    const lite = alpha('lift_lite');
    if (lite) card.append(mk('p', 'ck-sub', `Needs ${String(row.needs || '').replace(/^\w/, (c) => c.toLowerCase())} · ${row.minutes} min · ${row.per_week}× a week`, 'coach', 'needs', lw));
    else if (row.id === cur) card.append(mk('p', 'lx-pickwhy', null, 'coach', 'pick_why', 'kind=lift_routine&routine=' + cur));
    if (!lite && row.id === cur) card.firstChild.append(el('b', null, 'Recommended for you. '), m.routine.pick_why || 'The routine your coach set up with you.');
    if (!lite) card.append(mk('p', 'ck-sub', `${row.needs} · ${row.minutes} min, busy ${row.busy_minutes} · ${row.per_week}× a week`, 'coach', 'needs', lw), mk('p', 'lx-picklifts', row.lifts.split(';').map((t) => t.trim()).join(' · '), 'coach', 'lifts', lw));
    if (pickPending && pickPending !== cur) { const pr = m.lib.find((x) => x.id === pickPending); card.append(mk('p', 'lx-pickpend', `Switch to ${pr ? pr.name : pickPending} asked. Your coach checks it against your equipment and preferences and moves you over at the next check-in.`, null, null, null, 'store:lift_pref/routine')); }
    if (row.id !== cur && pickPending !== row.id) { const b = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Ask to switch to ' + row.name); b.type = 'button'; b.addEventListener('click', () => savePick(m, row.id)); card.append(b); }
    if (pickPending && pickPending !== cur && row.id === pickPending) { const b = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Cancel the switch'); b.type = 'button'; b.addEventListener('click', () => savePick(m, cur)); card.append(b); }
    if (row.mine) card.prepend(el('p', 'ck-sub', 'Your version'));
    // editing is a quiet line, not a form (the athlete, Nov 16, 2026): routines change by telling the coach in plain words
    const ed = el('p', 'ck-sub lx-pickedit', 'To change a routine or add your own, tell your coach in chat, e.g. "swap step-ups for lunges".');
    const f = el('div', 'ck-field'); f.append(lab, sel); box.replaceChildren(f, card); if (!lite) box.append(ed);
  }
  // Routines page (alpha lift_clean; the athlete picked A2, Nov 16: "this is the way forward"): a tile row with Change ›, then a page
  // of tiles like made-for-you playlists (today's pick on top, Made by you, Library); a tile opens its own page.
  let rView = '', mfy = null;
  // Made for you (the athlete, Nov 16: "i dont see any made for me today alternatives"): today-only versions of the current routine
  // that the page can run at once, since they use its own lifts: the short version, upper body only, legs only.
  function mfyList(m) {
    const r = m.routine, est = (L) => Math.max(10, Math.round((2 + L.reduce((t, e) => t + (N(e.sets) || 2) * (e.per_side ? 1.75 : 1.25), 0)) / 5) * 5), L = [];
    const add = (id, name, ex, why, mins) => { if (ex.length && ex.length < m.ex.length) L.push({ id: 'mfy_' + id, name, ex: ex.map((e) => e.ex), minutes: mins || est(ex), best_for: why, mfy: true }); };
    add('short', 'Short version', m.ex.filter((e) => e.busy), 'The main lifts only, for a short day', N(r.busy_minutes));
    add('upper', 'Upper body', m.ex.filter((e) => !e.legs), 'Leaves your legs fresh for running and riding');
    add('legs', 'Legs and lower leg', m.ex.filter((e) => e.legs), 'Rests your upper body');
    // a routine the coach made for this date (Tell the coach, or a chat request) leads the shelf; it runs like any plan
    return [...m.lib.filter((x) => x.made_for === date && runnable(x)), ...L];
  }
  // Recommended today: reasons from the plan rows the page already has (`day`), and the lift log
  const plusD = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  function recsFor(m, ready) {
    const A = window.CX.app, days = A ? A.kind('day') : [], out = [], seen = new Set(), base = (m.base || m).routine.routine;
    const add = (x, why) => { if (x && !seen.has(x.id) && out.length < 3) { seen.add(x.id); out.push({ x, why }); } };
    const by = (id) => ready.find((x) => x.id === id);
    for (const x of ready.filter((y) => y.made_for === date)) add(x, 'Made for you today');
    const legsDay = (r) => /^(run|bike|brick|trail|hike)/i.test(r.type || '');
    const soon = [1, 2].map((k) => days.find((r) => r.date === plusD(date, k) && r.key && legsDay(r))).find(Boolean);
    if (soon) add(by('mfy_upper'), `Legs fresh for ${fWD(soon.date).split(',')[0]}\u2019s key ${/bike/i.test(soon.type) ? 'ride' : /brick/i.test(soon.type) ? 'brick' : 'run'}`);
    const lift = days.find((r) => r.date === date && r.type === 'strength'), other = days.filter((r) => r.date === date && r.type !== 'strength').reduce((t, r) => t + (N(r.minutes) || 0), 0);
    if (lift && N(lift.minutes) && N(lift.minutes) <= 20) add(by('mfy_short'), `Today's plan has ${lift.minutes} min for lifting`);
    else if (other >= 60) add(by('mfy_short'), `${other} min of other training planned today`);
    const trip = days.find((r) => r.date === date && /travel|hotel|trip/i.test(r.title || ''));
    if (trip) { const tr = ready.filter((x) => /hotel|travel|trip/i.test(`${x.name} ${x.best_for || ''}`)).sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0)); add(tr[0], 'Travel in today\u2019s plan'); }
    const recent = [...logs.values()].filter((l) => l.date < date && l.date >= plusD(date, -14) && l.routine && l.routine !== base).sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const l of recent) add(by(l.routine), `You used it ${fWD(l.date).split(',')[0]}`);
    add(by('mfy_short'), 'The main lifts only, when time is short'); add(by('mfy_upper'), 'Leaves your legs fresh for running and riding');
    return out;
  }
  const hue = (id) => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const ini = (n) => String(n).split(/[\s,]+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const art = (x, big) => { const a = el('span', 'lx-art' + (big ? ' big' : '')); a.style.setProperty('--h', hue(x.id)); a.setAttribute('aria-hidden', 'true'); a.append(el('b', null, big ? x.name.split(',')[0] : ini(x.name))); return a; };
  // the plan of a routine as lift_mine rows: library and coach plans as they are, a Made for you version from its lifts
  const planOf = (m, x) => (runnable(x) ? arr(x.plan_ex) : (x.mfy ? m.ex.filter((e) => x.ex.includes(e.ex)) : x.id === m.routine.routine ? m.ex : [])
    .map((e) => Object.fromEntries(Object.entries({ id: e.id || e.ex, block: e.block, name: e.name, sets: N(e.sets), lo: N(e.lo), hi: N(e.hi) }).filter(([, v]) => v !== null && v !== undefined))));
  async function saveMine(m, x, name) {
    const id = 'mine_' + Date.now().toString(36), doc = { name: name || x.name, plan: planOf(m, x), minutes: N(x.minutes) || 20, needs: x.needs || '', from: x.id || '', saved: new Date().toISOString() };
    if (!doc.plan.length) return null;
    mineDocs.set(id, doc);
    if (db) { try { await db.doc('lift_mine/' + id).set(doc); } catch (e) { status('Could not save the routine.', 'err'); } }
    return id;
  }
  const saveBtn = (m, x) => { const b = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', '+ Save to my routines'); b.type = 'button';
    b.addEventListener('click', async () => { b.disabled = true; const id = await saveMine(m, x); b.replaceChildren(icon('check'), id ? 'Saved to Made by you' : 'Nothing to save'); }); return b; };
  // Make your own (the athlete's comments on the cleanup page, Nov 16: "Tell the coach" is the default, "Pick lifts" second; same
  // tile page as the shelves). Tell the coach saves the ask; the coach drafts it onto Made for you at the next refresh.
  let ownTab = 'tell', ownPick = [], ownName = '';
  function makeOwn(m) {
    const w = el('div', 'lx-mown'), hero = el('div', 'lx-hero'), hx = el('span', 'lx-hx');
    hx.append(el('span', 'lx-mh', 'Make your own'), el('b', null, ownName || 'New routine'), el('span', 'ck-sub', ownTab === 'tell' ? 'Say what you have; your coach builds it' : `${ownPick.length} lifts`));
    hero.append(art({ id: 'new', name: ownName || 'New routine' }, true), hx);
    const tabs = el('div', 'lx-otabs'); tabs.setAttribute('role', 'tablist');
    for (const [k, t] of [['tell', 'Tell the coach'], ['pick', 'Pick lifts']]) { const b = el('button', 'lx-otab', t); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(ownTab === k));
      b.addEventListener('click', () => { ownTab = k; renderRoutines(m); const nb = [...document.querySelectorAll('.lx-otab')].find((y) => y.textContent === t); if (nb) nb.focus(); }); tabs.append(b); }
    w.append(hero, tabs);
    if (ownTab === 'tell') {
      const lab = el('label', 'ck-sub', 'What do you have, and how long?'); const ta = el('textarea', 'ck-input lx-ask'); ta.id = 'l-ask'; lab.htmlFor = 'l-ask'; ta.rows = 3;
      ta.placeholder = 'e.g. 25 minutes in a hotel gym, dumbbells to 50 lb, keep my legs fresh';
      const go = el('button', 'ck-btn ck-btn--primary ck-btn--sm', 'Send to the coach'); go.type = 'button';
      const note = el('p', 'ck-sub', 'It lands on Made for you, today, within about two hours (9 AM to 9 PM), ready to use and log.');
      go.addEventListener('click', async () => { const t = ta.value.trim(); if (!t) { ta.focus(); return; }
        const id = 'ask_' + Date.now().toString(36), doc = { text: t, date, asked: new Date().toISOString() }; asks.set(id, doc);
        if (db) { try { await db.doc('lift_ask/' + id).set(doc); } catch (e) { status('Could not send it. Try again.', 'err'); asks.delete(id); } }
        renderRoutines(m); });
      w.append(lab, ta, go, note);
      if (window.CX.chatOpen) { const now = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Talk to the coach now'); now.type = 'button'; now.addEventListener('click', () => window.CX.chatOpen(now)); w.append(now); }
      const open = [...asks.entries()].filter(([id, a]) => a && a.date === date && !m.lib.some((x) => x.ask === id));
      for (const [, a] of open) w.append(el('p', 'ck-sub lx-asked', `Sent ${stamp(a.asked)}: “${a.text}” · your coach is building it`));
      return w;
    }
    const nm = el('input', 'ck-input'); nm.id = 'l-ownname'; nm.placeholder = 'Name it, e.g. Hotel upper'; nm.value = ownName; const nl = el('label', 'ck-sub', 'Name'); nl.htmlFor = 'l-ownname';
    nm.addEventListener('input', () => { ownName = nm.value; });
    const chosen = el('ol', 'lx-rlifts');
    ownPick.forEach((id, i) => { const e = m.xlib.get(id) || { name: id }; const li = el('li', null, `${e.name} · ${doseTxt(e)} `); const x = el('button', 'lx-oxbtn', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + e.name);
      x.addEventListener('click', () => { ownPick.splice(i, 1); renderRoutines(m); }); li.append(x); chosen.append(li); });
    w.append(nl, nm, chosen);
    const L = ownPick.map((id) => m.xlib.get(id)).filter(Boolean), mins = Math.max(10, Math.round((2 + L.reduce((t, e) => t + (N(e.sets) || 2) * (e.per_side ? 1.75 : 1.25), 0)) / 5) * 5);
    if (L.length) {
      const x = { id: '', name: ownName || 'My routine', minutes: mins, plan_ex: ownPick.map((id, i) => ({ id, block: i < 2 ? '1' : '2' })) };
      const row = el('div', 'lx-racts'), use = el('button', 'ck-btn ck-btn--primary ck-btn--sm', 'Use today'); use.type = 'button';
      use.addEventListener('click', async () => { flush(); const id = await saveMine(m, x); if (!id) return; ownPick = []; ownName = ''; mfy = null; setToday(id); dayView = 'plan'; dayMins = mins; builtKey = ''; goR(m, ''); renderLifts(); });
      const sv = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', '+ Save to my routines'); sv.type = 'button';
      sv.addEventListener('click', async () => { const id = await saveMine(m, x); if (!id) return; ownPick = []; ownName = ''; goR(m, 'list'); });
      row.append(use, sv, el('span', 'ck-sub', `About ${mins} min; the first two lifts pair as a superset.`)); w.append(row);
    }
    const PAT = [['single_leg_warmup', 'Warm-up'], ['squat', 'Squat'], ['hinge', 'Hinge'], ['pull', 'Pull'], ['push', 'Push'], ['shoulder', 'Shoulder'], ['calf', 'Calf'], ['core', 'Core']];
    for (const [pt, h] of PAT) { const xs = [...m.xlib.values()].filter((e) => e.pattern === pt && !ownPick.includes(e.id)); if (!xs.length) continue;
      const sec = el('div', 'lx-oadd'); sec.append(el('span', 'lx-mh', h));
      for (const e of xs) { const b = el('button', 'lx-opt', '+ ' + e.name); b.type = 'button'; b.title = e.needs ? 'Needs ' + e.needs : 'No kit';
        b.addEventListener('click', () => { ownPick.push(e.id); renderRoutines(m); }); sec.append(b); }
      w.append(sec); }
    return w;
  }
  // Keep this routine? (A3, the athlete: "this should also show at the end if selected and completed"): after Finish on a routine
  // that is not yours, one card offers + Save to my routines or Not now.
  function keepCard(m) {
    let c = $('l-keep'); const x = m.guest && !m.guest.mine ? m.guest : mfy && mfy.mfy ? mfy : null;
    const on = x && keepAsk === date + '|' + x.id;
    if (!on) { if (c) c.hidden = true; return; }
    if (!c) { c = el('div', 'ck-notice lx-keep'); c.id = 'l-keep'; $('l-bar').before(c); }
    c.hidden = false; const no = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Not now'); no.type = 'button'; no.addEventListener('click', () => { keepAsk = ''; c.hidden = true; });
    c.replaceChildren(el('b', null, 'Keep this routine?'), el('span', 'ck-sub', `${x.name} goes on your Made by you shelf, with today’s weights as last time.`), saveBtn(m, x), no);
  }
  const goR = (m, v) => { rView = v; renderRoutines(m); const f = $('l-pick').querySelector('button'); if (f) f.focus(); if (!v) $('l-log').scrollIntoView({ block: 'start' }); };
  function renderRoutines(m) {
    const box = $('l-pick'); if (!box) return; box.hidden = false;
    const cur = m.routine.routine, r = m.routine;
    const cr = m.lib.find((x) => x.id === cur) || { id: cur, name: r.name, minutes: r.minutes, needs: '', lifts: m.ex.map((e) => e.name).join('; ') };
    const lib = m.lib.some((x) => x.id === cur) ? m.lib : [cr, ...m.lib];
    const mf = mfyList(m), src = (x) => (x.mfy ? 'Made for you \u00b7 today only' : x.id === cur && m.guest ? 'Today only' : x.id === cur ? 'Today\u2019s pick' : x.mine ? 'Made by you' : 'Library');
    $('l-log').classList.toggle('lx-browse', !!rView);
    const pend = pickPending && pickPending !== (m.base || m).routine.routine ? lib.find((x) => x.id === pickPending) : null;
    if (!rView) {
      const b = el('button', 'lx-rt'); b.type = 'button'; b.setAttribute('aria-label', `Routine: ${cr.name}. Change`);
      const sh = mfy || cr, t = el('span', 'lx-rtt'); t.append(mk('b', null, sh.name, 'coach', 'name', 'kind=lift_routine&routine=' + cur), el('span', 'ck-sub' + (!pend && !mfy && sh.id === cur && rtLine ? ' lx-rtsub' : ''), pend ? `Switch to ${pend.name} asked` : !mfy && sh.id === cur && rtLine ? rtLine : src(sh)));
      b.append(art(sh), t, el('span', 'lx-chg', 'Change \u203a')); b.addEventListener('click', () => goR(m, 'list')); box.replaceChildren(b);
      // the athlete, Nov 16, 2026: "a button that says ... need something else now ... that opens the chat"; the coach builds it
      // onto Made for you within minutes (coach/ops/DASHBOARD-CHAT.md step 6)
      // the athlete, Nov 16, 2026, 8:47 PM: the button opens the ready-made alternatives first, each one tap to use today;
      // the coach chat is the last line for anything not there
      // the athlete, Nov 16, 2026, 11:36 PM: "put the session date and need something else now next to each other"
      const n = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-need', 'Need something else now?'); n.type = 'button'; n.addEventListener('click', () => goR(m, 'need'));
      // the athlete, Nov 17, 2026, 12:00 AM ("let's do that"): the session date hides behind a small Log an earlier day link under the
      // button. 12:06 AM ("show me what pops up"): the link opens a row of the last 7 days on the page; Other date keeps the
      // phone's picker (the real date input lies invisibly over it). On an earlier day the link reads "Logging 11/15/26"
      const dt = document.querySelector('#l-log .lx-date'); if (dt) { const o = dt.querySelector('.lx-need'); if (o) o.remove(); dt.prepend(n); dt.classList.add('lx-dlink');
        const mdy = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(2, 4)}`, pick = (d) => { dOpen = false; const x = $('l-date'); x.value = d; x.dispatchEvent(new Event('change')); };
        for (const x of dt.querySelectorAll('.lx-dlinkb, .lx-dback, .lx-dpick')) { if (!x.contains(dt.querySelector('.ck-field'))) x.remove(); }
        const fd = dt.querySelector('.ck-field'); let face = fd.querySelector('.lx-dface'); if (!face) { face = el('span', 'lx-dface'); face.setAttribute('aria-hidden', 'true'); fd.append(face); }
        face.textContent = 'Other date'; $('l-date').setAttribute('aria-label', 'Other date');
        // 12:15 AM (the athlete picked A): the way in is a small calendar button in the card head, beside this week's discs
        let cb = document.querySelector('#l-log .lx-dcal'); if (!cb) { cb = el('button', 'lx-dcal'); cb.type = 'button';
          cb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4M9.5 15h5M12 12.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
          cb.addEventListener('click', () => { dOpen = !dOpen; renderRoutines(m); const f = document.querySelector(dOpen ? '.lx-dpick button' : '#l-log .lx-dcal'); if (f) f.focus(); }); }
        if ($('l-wk').nextElementSibling !== cb) $('l-wk').after(cb);
        cb.setAttribute('aria-label', 'Log an earlier day'); cb.setAttribute('aria-expanded', String(dOpen)); cb.classList.toggle('on', dOpen || date !== TODAY);
        if (date !== TODAY) { dt.append(el('span', 'lx-dlinkb', `Logging ${mdy(date)}`)); const bk = el('button', 'lx-dback', 'Back to today'); bk.type = 'button'; bk.addEventListener('click', () => pick(TODAY)); dt.append(bk); }
        let pk = fd.closest('.lx-dpick'); if (!pk) { pk = el('div', 'lx-dpick'); pk.setAttribute('role', 'group'); pk.setAttribute('aria-label', 'Pick the day to log'); }
        pk.replaceChildren(); for (let k = 1; k <= 7; k++) { const d = plusD(TODAY, -k); const c = el('button', 'lx-dday' + (d === date ? ' on' : ''));
          c.type = 'button'; c.setAttribute('aria-pressed', String(d === date)); c.append(el('span', null, k === 1 ? 'Yesterday' : fWD(d).split(',')[0]), el('b', null, `${d.slice(5, 7)}/${d.slice(8, 10)}`));
          c.addEventListener('click', () => pick(d)); pk.append(c); }
        pk.append(fd); pk.hidden = !dOpen; dt.append(pk); } else box.append(n);
      return;
    }
    const useNow = (x) => { flush(); mfy = x.mfy ? x : null; if (!x.mfy) setToday(x.id); dayView = 'plan'; dayMins = N(x.minutes) || dayMins; builtKey = ''; goR(m, ''); renderLifts(); };
    if (rView === 'need') {
      const nb = el('button', 'lx-back', '\u2039 Back to today'); nb.type = 'button'; nb.addEventListener('click', () => goR(m, ''));
      const nt = el('div', 'lx-rtop'); nt.append(nb, el('h3', 'ck-h3', 'Something else today'));
      const pre = lib.filter((x) => x.id !== cur && !x.made_for && runnable(x)), ready = [...mf, ...pre.filter((x) => x.mine), ...pre.filter((x) => !x.mine)];
      // the athlete, Nov 16, 2026, 9:11 PM: "show this better with recommended alternatives today": up to three picks with the reason
      // from today's plan (a key session soon, the time planned today, what he used lately); the rest under More options
      const rec = recsFor(m, ready), recIds = new Set(rec.map((r) => r.x.id));
      const rowOf = (x, why) => {
        const row = el('div', 'lx-rrow'), info = el('button', 'lx-rinfo'); info.type = 'button';
        const tx = el('span', 'lx-rtt'); tx.append(el('b', null, x.name));
        if (why) tx.append(mk('span', 'lx-rwhy', why, 'coach', 'day', 'kind=day', 'reason picked by the page from the plan rows (key sessions in the next 2 days, minutes today) and the lift log'));
        tx.append(el('span', 'ck-sub', [`${x.minutes} min`, x.needs, why ? '' : x.best_for].filter(Boolean).join(' \u00b7 ')));
        info.append(art(x), tx); info.setAttribute('aria-label', `${x.name}: see the lifts`); info.addEventListener('click', () => goR(m, x.id));
        const u = el('button', 'ck-btn ck-btn--' + (why ? 'primary' : 'secondary') + ' ck-btn--sm', 'Use today'); u.type = 'button'; u.setAttribute('aria-label', `Use ${x.name} today`); u.addEventListener('click', () => useNow(x));
        row.append(info, u); return row;
      };
      const R = el('div', 'lx-ready lx-recs'), L = el('div', 'lx-ready');
      for (const r of rec) R.append(rowOf(r.x, r.why));
      for (const x of ready.filter((y) => !recIds.has(y.id))) L.append(rowOf(x));
      const parts = [];
      if (rec.length) parts.push(el('span', 'lx-mh', 'Recommended today'), R);
      if (L.children.length) parts.push(el('span', 'lx-mh', rec.length ? 'More options' : 'Ready to use now'), L);
      const own = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-own', '+ Make your own'); own.type = 'button'; own.addEventListener('click', () => goR(m, 'new'));
      const tail = [el('span', 'ck-sub', 'Today only. Your sets save and count for the week.'), own];
      if (window.CX.chatOpen) { const c = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-need', 'None of these? Ask the coach'); c.type = 'button'; c.addEventListener('click', () => window.CX.chatOpen(c)); tail.push(c); }
      box.replaceChildren(nt, ...parts, ...tail);
      return;
    }
    const top = el('div', 'lx-rtop'), back = el('button', 'lx-back', rView === 'list' ? '\u2039 Back to today' : '\u2039 Routines'); back.type = 'button';
    back.addEventListener('click', () => goR(m, rView === 'list' ? '' : 'list')); top.append(back);
    if (rView === 'list') {
      top.append(el('h3', 'ck-h3', 'Routines'));
      const hero = el('button', 'lx-hero'); hero.type = 'button'; const hx = el('span', 'lx-hx');
      const bd = m.day && m.day.bundle && !m.guest ? m.day.bundle : null;
      hx.append(el('span', 'lx-mh', 'Today\u2019s pick'), el('b', null, cr.name), el('span', 'ck-sub', bd ? `${bd.length} days \u00b7 ${bd.map((d) => d.label).join(', ')}` : `${cr.minutes} min${cr.needs ? ' \u00b7 ' + cr.needs : ''}`));
      if (r.pick_why) hx.append(mk('span', 'lx-bc', r.pick_why, 'coach', 'pick_why', 'kind=lift_routine&routine=' + cur));
      hero.append(art(cr, true), hx); hero.addEventListener('click', () => goR(m, cur));
      const shelf = (h, L) => { if (!L.length) return []; const row = el('div', 'lx-shelf'); for (const x of L) { const t = el('button', 'lx-tile'); t.type = 'button'; t.append(art(x, true), el('span', 'ck-sub', `${x.minutes} min`)); t.setAttribute('aria-label', `${x.name}, ${x.minutes} min`); t.addEventListener('click', () => goR(m, x.id)); row.append(t); } return [el('span', 'lx-mh', h), row]; };
      const rest = lib.filter((x) => x.id !== cur && !x.made_for);
      const own = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-own'); own.type = 'button'; own.textContent = '+ Make your own'; own.addEventListener('click', () => goR(m, 'new'));
      box.replaceChildren(top, hero, ...shelf('Made for you, today', mf), ...shelf('Made by you', rest.filter((x) => x.mine)), ...shelf('Library', rest.filter((x) => !x.mine)),
        own);
      return;
    }
    if (rView === 'new') { box.replaceChildren(top, makeOwn(m)); return; }
    const x = mf.find((y) => y.id === rView) || lib.find((y) => y.id === rView) || cr, lw = `kind=lift_lib&id=${x.id}`;
    const hero = el('div', 'lx-hero'), hx = el('span', 'lx-hx');
    hx.append(el('span', 'lx-mh', src(x)), el('b', null, x.name), mk('span', 'ck-sub', `${x.minutes} min${x.needs ? ' \u00b7 ' + x.needs : ''}`, 'coach', 'needs', lw));
    if (x.best_for) hx.append(mk('span', 'lx-bc', x.best_for, 'coach', 'best_for', lw));
    hero.append(art(x, true), hx);
    const acts = el('div', 'lx-racts');
    const baseId = (m.base || m).routine.routine, baseName = (m.base || m).routine.name;
    if (x.id === cur || x.mfy || x.id === baseId || runnable(x)) { const u = el('button', 'ck-btn ck-btn--primary ck-btn--sm', 'Use today'); u.type = 'button';
      u.addEventListener('click', () => useNow(x)); acts.append(u);
      if (!x.mfy && x.id !== baseId) acts.append(el('span', 'ck-sub', `Today only. Your sets save and count for the week; tomorrow is ${baseName} again.`)); }
    if (!x.mfy && x.id !== baseId) {
      if (pickPending === x.id) { acts.append(el('span', 'ck-sub', 'Asked to make it your routine. Your coach moves you over at the next check-in.')); const c = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Cancel the switch'); c.type = 'button'; c.addEventListener('click', () => savePick(m, baseId)); acts.append(c); }
      else { const a = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'Make it my routine'); a.type = 'button'; a.addEventListener('click', () => savePick(m, x.id)); acts.append(a); }
      if (!x.mine) acts.append(saveBtn(m, x));
    }
    const ul = mk('ul', 'lx-rlifts', null, 'coach', 'lifts', lw);
    const names = x.mfy ? m.ex.filter((e) => x.ex.includes(e.ex)).map((e) => `${e.name} \u00b7 ${doseTxt(e)}`) : x.id === cur ? m.ex.map((e) => `${e.name} \u00b7 ${doseTxt(e)}`) : runnable(x) ? planEx(m, x).map((e) => `${e.name} \u00b7 ${doseTxt(e)}`) : String(x.lifts || '').split(';').map((t) => t.trim()).filter(Boolean);
    for (const n of names) ul.append(el('li', null, n.replace(/^\w/, (c) => c.toUpperCase())));
    if (x.id === baseId && !x.mfy && window.CX.chatOpen) { // edit a routine (the athlete, Nov 17, 2026: "how do you edit a routine?"): in plain words, anchored here
      const e = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-edit', 'Edit with the coach'); e.type = 'button'; e.addEventListener('click', () => window.CX.chatOpen(hero)); acts.append(e, el('span', 'ck-sub', 'Say what to change, like \u201cswap floor press for push ups\u201d.')); }
    const bd = x.id === cur && m.day && m.day.bundle && !m.guest ? m.day.bundle : null;
    if (bd) { // the split as one bundle: each day and its lifts, today's first, then the order they take turns in
      const days = el('div', 'lx-bundle');
      const saved = !!(logs.get(date) || {}).day;
      bd.forEach((d, k) => { const h = el('div', 'lx-bday'); h.append(el('span', 'lx-mh', `Day ${k + 1}`), el('b', null, d.label));
        if (k === 0) h.append(el('span', 'ck-sub', 'Today'));
        else if (!saved) { const u = el('button', 'ck-btn ck-btn--secondary ck-btn--sm lx-dodays', 'Do today'); u.type = 'button'; u.setAttribute('aria-label', `Do ${d.label} today`);
          u.addEventListener('click', () => { flush(); setDay(d.key); builtKey = ''; goR(m, ''); renderLifts(); }); h.append(u); }
        else h.append(el('span', 'ck-sub', k === 1 ? 'Next' : 'Then'));
        const l = el('ul', 'lx-rlifts'); for (const e of d.ex) l.append(el('li', null, `${e.name} \u00b7 ${doseTxt(e)}`.replace(/^\w/, (c) => c.toUpperCase())));
        days.append(h, l); });
      days.append(el('p', 'ck-sub', 'The days take turns in this order, carrying on from the one you do. A missed day never skips one.'));
      box.replaceChildren(top, hero, acts, days); return;
    }
    box.replaceChildren(top, hero, acts, ul);
  }
  async function savePick(m, id) {
    pickPending = id; if (CL()) renderRoutines(m); else renderPicker(m);
    if (db) { try { await db.doc('lift_pref/routine').set({ pick: id, from: (m.base || m).routine.routine, saved: new Date().toISOString() }); } catch (e) { status('Could not save your routine pick.', 'err'); } }
  }
  function renderStatic(m) {
    const r = m.routine; const rw = 'kind=lift_routine&routine=' + r.routine;
    // UI pass (the athlete, Nov 16, 2026, 11:52 PM, card "Pick the cleaner Lifts card top"): the card title says Lifts, so the routine name shows once
    $('l-name').textContent = CL() ? 'Lifts' : r.name; $('l-sub').textContent = r.subtitle || ''; $('l-log').classList.toggle('lx-clean', CL());
    // the routine chips: the same four facts, each marked with its field
    // game look pass (the athlete's pick 4, Nov 14, 2026): the four facts fold into one plain line, each part still marked
    { const parts = [[`${r.per_week}× a week`, 'per_week'], [`~${r.minutes} min`, 'minutes'], [r.days || r.when, r.days ? 'days' : 'when'], [r.rir, 'rir']].filter((x) => x[0]);
      const box = $('l-chips'); box.className = 'ck-sub lx-facts'; box.replaceChildren(); parts.forEach(([t, f], i) => { if (i) box.append(' · '); box.append(mk('span', null, t, 'coach', f, rw)); }); }
    // the routine's goal and plan lines live on its Routines page, not on the session card (the athlete, Nov 16, 2026, 11:36 PM:
    // "What is strong for the long run? ... What is it doing here?")
    $('l-sub').hidden = CL(); $('l-chips').hidden = CL();
    weekDiscs(); if (CL()) renderRoutines(m); else renderPicker(m);
    $('l-chips').classList.remove('dash-skeleton');
    // a dated step shows from 14 days ahead ("From Feb 1"), then while it runs
    const soonP = (() => { const t = new Date(TODAY + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 14); const lim = t.toISOString().slice(0, 10); return m.phases.find((p) => p.start > TODAY && p.start <= lim) || null; })();
    const ph = phaseAt(m, TODAY) || soonP; const pn = $('l-phasenow'); pn.hidden = !ph;
    if (ph) { const pw = `kind=lift_phase&routine=${ph.routine}&label=${encodeURIComponent(ph.label)}`; const w = el('span', 'ck-notice-w'); w.append(icon('info'), mk('span', null, ph.label, 'coach', 'label', pw)); pn.replaceChildren(w, mk('p', 'ck-notice-t', ph.text, 'coach', 'text', pw)); }
    $('l-phases').hidden = !m.phases.length;
    $('l-phases').replaceChildren(...m.phases.map((p) => { const pw = `kind=lift_phase&routine=${p.routine}&label=${encodeURIComponent(p.label)}`; const on = p === phaseAt(m, TODAY); const d = el('li', 'ck-row lx-phaserow'); if (on) d.dataset.key = 'now';
      const main = el('span', 'ck-row-main'); main.append(mk('span', 'ck-row-t', p.label, 'coach', 'label', pw), mk('span', 'ck-row-s', p.text, 'coach', 'text', pw));
      d.append(icon(on ? 'go' : 'session'), main); if (on) { const end = el('span', 'ck-row-end'); end.append(mk('span', 'ck-chip', 'Now', null, null, null, 'phase-today')); d.append(end); } return d; }));
    $('l-phases').classList.remove('dash-skeleton');
    // rules: one row each; a warning rule (stop signals) carries the Watch glyph and word with its label
    $('l-rulelist').replaceChildren(...m.rules.map((x) => { const xw = `kind=lift_rule&routine=${x.routine}&order=${x.order}`; const li = el('li', 'ck-row lx-rule' + (x.warn ? ' warn' : ''));
      const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t');
      if (x.warn) { const bd = badge('watch', ''); bd.lastChild && bd.lastChild.nodeType === 3 && bd.lastChild.remove(); bd.append(mk('span', null, x.label, 'coach', 'label', xw)); t.append(bd); } else t.append(mk('span', null, x.label, 'coach', 'label', xw));
      main.append(t, mk('span', 'ck-row-d', x.text, 'coach', 'text', xw)); li.append(main); return li; }));
    $('l-rulelist').classList.remove('dash-skeleton'); cardState($('l-rules'), null);
  }

  // Strength progress (6.100.0; the athlete's notes on layout 1, Nov 16, 2026: no status pills, no weekly bars, and the lifts a person
  // cares most about sit at the top). One line for the block's sessions (coach outcome_week lifts_days, the one home for sessions a
  // week), then "Your key lifts" (store lift_pref/pinned; until set, the three lifts with the most logged sessions), then the rest.
  // Each row has its sparkline and a plain status word; a row opens to its chart (lift_hist series), the last four sessions,
  // the next step and the Show at top switch.
  const SW = { progressing: 'Progressing', holding: 'Holding', new: 'First session', back: 'Coming back', stalled: 'Stalled', down: 'Down' };
  let opened = '', pinned = null;
  const svgEl = (t, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const pts = (h) => String((h && h.series) || '').split('|').filter(Boolean).map((x) => { const [d, v] = x.split(' '); const n = N(v); return [d, n !== null && h.basis === 'e1rm' && KG() ? Math.round(n * 0.45359237 * 10) / 10 : n]; }).filter((x) => x[1] !== null);
  function sline(p, w, h, big) {
    const s = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: big ? 'lx-sch' : 'lx-spk', role: 'img' });
    if (!p.length) return s;
    const v = p.map((x) => x[1]), lo = Math.min(...v), hi = Math.max(...v), pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.04);
    const L = big ? 40 : 3, R = big ? 12 : 4, T = big ? 18 : 3, B = big ? 22 : 3;
    const x = (i) => (p.length === 1 ? (L + w - R) / 2 : L + i * (w - L - R) / (p.length - 1)), y = (z) => T + (hi + pad - z) / (hi - lo + 2 * pad) * (h - T - B);
    if (big) for (const t of [lo, hi]) { s.append(svgEl('line', { x1: L, x2: w - R, y1: y(t), y2: y(t), class: 'lx-sgrid' })); const tx = svgEl('text', { x: L - 5, y: y(t) + 4, 'text-anchor': 'end' }); tx.textContent = t.toFixed(0); s.append(tx); }
    s.append(svgEl('path', { d: p.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q[1]).toFixed(1)}`).join(''), class: 'lx-sline' }));
    p.forEach((q, i) => { if (big || i === p.length - 1) s.append(svgEl('circle', { cx: x(i), cy: y(q[1]), r: big ? 4 : 3, class: 'lx-sdot' }));
      if (big && (i === 0 || i === p.length - 1)) { const tx = svgEl('text', { x: x(i), y: h - 6, 'text-anchor': p.length === 1 ? 'middle' : i ? 'end' : 'start' }); tx.textContent = fD(q[0]); s.append(tx); } });
    return s;
  }
  function summary(box, m) {
    const A = window.CX.app; if (!A) return;
    const outs = A.kind('outcome_week').slice().sort((a, b) => (a.start < b.start ? -1 : 1));
    const br = A.kind('brief').find((b) => b.start <= TODAY && TODAY <= b.end);
    const k = br && A.kind('brief_kpi').find((x) => x.block_key === br.block_key && x.key === 'lifts');
    if (k && N(k.count_target)) {
      const done = outs.filter((o) => o.start >= A.monday(br.start)).reduce((n, o) => n + String(o.lifts_days || '').split(';').filter((d) => d && d >= br.start).length, 0);
      const pace = Math.round(N(k.count_target) * (dayN(TODAY) - dayN(br.start) + 1) / (dayN(br.end) - dayN(br.start) + 1));
      const p = el('p', 'lx-sblk'); p.append(mk('span', 'ck-big', String(done), null, null, null, 'coach outcome_week lifts_days in the block'), ' ', el('span', 'ck-sub', `of ${k.count_target} sessions in ${br.block || 'this block'} · steady pace ${pace} by today`)); box.append(p);
    }
  }
  const pinIds = (m) => {
    if (pinned) return pinned.filter((id) => m.ex.some((e) => e.id === id));
    return m.ex.map((e, i) => [e.id, N((m.hist.get(e.id) || {}).sessions) || 0, i]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, 3).map((x) => x[0]);
  };
  async function setPin(m, id, on) {
    const cur = pinIds(m).filter((x) => x !== id); if (on) cur.push(id); pinned = cur;
    if (db) { try { await db.doc('lift_pref/pinned').set({ ids: cur.join(';'), saved: new Date().toISOString() }); } catch (e) { status('Could not save your key lifts.', 'err'); } }
    renderProgress(m);
  }
  // the chart a lift's row opens, also drawn in its Fitness strength panel (metrics.js ladderPanel; the athlete, Nov 16, 2026, "Both":
  // the Strength progress card leaves the Lifts tab once the strength levels are on, and each lift's chart moves to its panel)
  window.CX.liftChart = (id) => {
    const A = window.CX.app; const hr = A && A.kind('lift_hist').find((x) => x.id === id); const p = pts(hr); if (!hr || !p.length) return null;
    const lb = A.kind('lift_ex').find((x) => x.id === id) || {}; const o = el('div', 'lx-sopen'); const c = sline(p, 320, 140, true);
    c.setAttribute('aria-label', `${hr.name}, ${hr.basis === 'e1rm' ? 'estimated best single in ' + wU() : hr.basis}: ` + p.map((q) => `${fD(q[0])} ${q[1]}`).join(', '));
    o.append(el('p', 'ck-sub', hr.basis === 'e1rm' ? 'Estimated best single, ' + wU() + (lb.load === 'lb_added' ? ', body weight included' : '') : 'Best set, ' + (hr.basis || 'reps')), c); o.dataset.source = 'coach'; o.dataset.where = 'kind=lift_hist&id=' + id; return o;
  };
  function renderProgress(m) {
    if (alpha('strength_levels')) { $('l-prog').hidden = true; return; } // alpha strength_levels: each lift's chart is in its Fitness panel
    const body = $('l-progbody'); const n = logs.size; const anyHist = [...m.hist.values()].some((h) => N(h.sessions));
    $('l-progn').textContent = n ? `${n} session${n === 1 ? '' : 's'} logged` : '';
    // shared states: loading until the store answers, empty before the first saved session (same sentence as before)
    if (!n && !anyHist) { cardState($('l-prog'), loaded ? 'empty' : 'loading', 'Your sets show here after the first saved session, with the next step for each lift.'); return; }
    cardState($('l-prog'), null);
    const mode = (phaseAt(m, TODAY) || {}).mode || 'normal';
    const lite = alpha('lift_lite'), top = el('div', 'lx-ssum'); if (!lite) summary(top, m); // alpha lift_lite (the athlete, Nov 16, 2A)
    const pins = pinIds(m), keyEx = pins.map((id) => m.ex.find((e) => e.id === id)).filter(Boolean), rest = m.ex.filter((e) => !pins.includes(e.id));
    const row = (e) => {
      const h = history(e.id || e.ex), hr = m.hist.get(e.id) || {}, p = pts(hr), st = hr.status || 'none', ew = exWhere(e), on = opened === e.ex;
      const li = el('li', 'lx-srow'); const b = el('button', 'lx-sbtn'); b.type = 'button'; b.setAttribute('aria-expanded', String(on));
      const nm = el('span', 'lx-snm'); nm.append(mk('span', null, e.name, 'coach', 'name', ew), el('span', 'ck-sub', hr.best_set ? `best ${setU(hr.best_set)}, ${fD(hr.best_date)}` : 'Not logged yet'));
      b.append(nm, sline(p, 64, 26, false)); if (!lite) b.append(mk('span', 'lx-sw ' + st, SW[st] || 'Not logged yet', 'coach', 'status', 'kind=lift_hist&id=' + e.id));
      b.addEventListener('click', () => { opened = on ? '' : e.ex; renderProgress(m); const nb = document.querySelector(`#l-progbody .lx-sbtn[data-ex="${e.ex}"]`); if (nb) nb.focus(); });
      b.dataset.ex = e.ex; li.append(b);
      if (on) {
        const o = el('div', 'lx-sopen');
        if (p.length) { const c = sline(p, 320, 140, true); c.setAttribute('aria-label', `${e.name}, ${hr.basis === 'e1rm' ? 'estimated best single in ' + wU() : hr.basis}: ` + p.map((q) => `${fD(q[0])} ${q[1]}`).join(', ')); o.append(el('p', 'ck-sub', hr.basis === 'e1rm' ? 'Estimated best single, ' + wU() + (e.load === 'lb_added' ? ', body weight included' : '') : 'Best set, ' + (hr.basis || 'reps')), c); }
        if (h.length) { const hl = mk('ol', 'lx-phist', null, null, null, null, 'store:lift_log last four sessions'); hl.setAttribute('aria-label', 'Last sessions, oldest first');
          for (const x of h.slice(-4)) { const t = [...x.sets].sort((a, c) => ((N(c.lb) ?? 0) - (N(a.lb) ?? 0)) || ((N(c.reps) ?? 0) - (N(a.reps) ?? 0)))[0]; const q = el('li'); q.append(el('span', null, fD(x.date)), ' ', el('b', null, setTxt(e, t))); hl.append(q); } o.append(hl);
          const hn = hint(e, h[h.length - 1], mode); if (hn) { const nx = mk('p', 'lx-nx' + (hn.up ? ' up' : ''), null, 'coach', null, ew, 'next-step'); if (hn.up) nx.append(icon('trend-up')); nx.append(el('span', null, hn.t)); o.append(nx); } }
        if (hr.note && (hr.gap || hr.stalled)) o.append(mk('p', 'ck-sub', setU(hr.note), 'coach', 'note', 'kind=lift_hist&id=' + e.id));
        if (!p.length && !h.length) o.append(el('p', 'ck-sub', 'Log it on this tab and its line starts here.'));
        const isPin = pins.includes(e.id), pb = el('button', 'ck-btn lx-spin', isPin ? 'Remove from top' : 'Show at top'); pb.type = 'button'; pb.setAttribute('aria-pressed', String(isPin));
        pb.addEventListener('click', () => setPin(m, e.id, !isPin)); o.append(pb);
        li.append(o);
      }
      return li;
    };
    const parts = [top];
    if (keyEx.length) { parts.push(el('h3', 'lx-shd', pinned || lite ? 'Your key lifts' : 'Your key lifts (most logged, open one to change)')); const k = el('ul', 'lx-srows'); k.append(...keyEx.map(row)); parts.push(k); }
    if (rest.length) { if (keyEx.length) parts.push(el('h3', 'lx-shd', 'Other lifts')); const r = el('ul', 'lx-srows'); r.append(...rest.map(row)); parts.push(r); }
    body.replaceChildren(...parts);
  }

  function collect(m) {
    const sets = {};
    for (const e of m.ex) {
      const arr = [];
      const nIn = document.querySelectorAll(`#l-ex input[data-ex="${e.ex}"][data-f="reps"]`).length;
      for (let i = 0; i < nIn; i++) {
        const q = (f) => { const x = document.querySelector(`#l-ex input[data-ex="${e.ex}"][data-i="${i}"][data-f="${f}"]`); return x ? N(x.value) : null; };
        const reps = q('reps'), lb = hasLoad(e) ? fromU(q('lb')) : null;
        if (reps === null && lb === null) continue;
        const st = { reps }; if (hasLoad(e)) st.lb = lb ?? (e.load === 'lb_added' ? 0 : null); arr.push(st);
      }
      if (arr.length) sets[e.ex] = arr;
    }
    return sets;
  }

  function fold(e, row, on) {
    row.classList.toggle('done', on);
    if (on) {
      const m = model(); const st = m ? collect(m)[e.ex] : null;
      const sum = row.querySelector('.lx-sum');
      const has = st && st.length; const sl = mk('span', 'lx-sl', null, 'coach', null, exWhere(e), has ? 'entered-sets' : 'skipped');
      sum.replaceChildren(mk('span', 'lx-id', e.ex, 'coach', 'ex', exWhere(e)), icon(has ? 'check' : 'skip'), sl, icon('edit', 'ck-i lx-edit'));
      sl.append(e.name + ' · ', el('b', null, has ? st.map((x) => setTxt(e, x)).join(', ') : 'Skipped' + (skipWhy[e.ex] ? ': ' + skipWhy[e.ex].toLowerCase() : '')));
      const old = row.querySelector('.lx-why'); if (old) old.remove();
      if (CL() && !has) { // why skipped: optional, one tap; the coach reads it at the next check-in
        const w = el('div', 'lx-why'); w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Why skip ' + e.name + '? Optional');
        w.append(el('span', 'ck-sub', 'Why? (optional)'));
        for (const r of WHY) { const b = el('button', 'lx-opt', r); b.type = 'button'; b.setAttribute('aria-pressed', String(skipWhy[e.ex] === r));
          b.addEventListener('click', () => { if (skipWhy[e.ex] === r) delete skipWhy[e.ex]; else skipWhy[e.ex] = r; fold(e, row, true); const mm = model(); if (mm && db) { draftPut(date, snap(mm)); schedule(DELAY); } }); w.append(b); }
        row.append(w);
      }
    } else { const old = row.querySelector('.lx-why'); if (old) old.remove(); }
    foldBlock(row.closest('.lx-block'));
  }
  function foldBlock(blk) {
    if (!blk) return;
    const rows = [...blk.querySelectorAll('.lx-row:not(.off)')], n = rows.filter((r) => r.classList.contains('done')).length;
    const all = rows.length > 0 && n === rows.length; blk.classList.toggle('alldone', all); if (!all) blk.classList.remove('peek');
    const bs = blk.querySelector('.lx-bsum'); bs.setAttribute('aria-expanded', String(blk.classList.contains('peek')));
    const sl = mk('span', 'lx-sl', null, null, null, null, 'done-count'); sl.append(bs.dataset.label + ' · ', el('b', null, `${n} of ${rows.length} done`)); bs.replaceChildren(icon('check'), sl, icon('chevron', 'ck-i ck-chev'));
  }
  function markDone(e, row, on, skip) {
    if (on) doneSet.add(e.ex); else doneSet.delete(e.ex);
    if (on && skip) skipSet.add(e.ex); else skipSet.delete(e.ex);
    fold(e, row, on);
    if (!on) { row.closest('.lx-block').classList.remove('peek'); const f = row.querySelector('.lx-sets input'); if (f) f.focus(); }
    else { const blk = row.closest('.lx-block'); const t = blk.classList.contains('alldone') && !blk.classList.contains('peek') ? blk.querySelector('.lx-bsum') : row.querySelector('.lx-sum'); if (t) t.focus(); } // keyboard: focus stays on the folded line (Phase 5)
    const m = model(); if (!m || !db) return;
    draftPut(date, snap(m)); finBtn(false); bar('Saving…'); schedule(0);
  }
  function paintSkips() { for (const r of document.querySelectorAll('#l-ex .lx-row')) { const k = r.querySelector('.lx-skip'); if (k) k.hidden = [...r.querySelectorAll('.lx-sets input')].some((i) => i.value !== ''); } }
  // Per-exercise tick: ✓ when what is on screen matches the stored day, … while a change waits to save.
  function paintTicks(m) {
    const cur = collect(m), st = (logs.get(date) || {}).sets || {};
    for (const x of document.querySelectorAll('#l-ex .lx-ok')) {
      const k = x.dataset.ok, on = JSON.stringify(cur[k] || null), sv = JSON.stringify(st[k] || null);
      if (!cur[k] && !st[k]) { x.replaceChildren(); x.className = 'lx-ok'; }
      else if (on === sv) { x.replaceChildren(icon('check'), 'saved'); x.className = 'lx-ok ok'; }
      else { x.textContent = saving ? 'saving…' : 'not saved yet'; x.className = 'lx-ok'; }
    }
  }
  const snap = (m) => ({ date, sets: collect(m), rpe: N(rpeSel), note: $('l-note').value.trim(), done: [...doneSet], skipped: [...skipSet].filter((k) => doneSet.has(k) && !collect(m)[k]), skip_why: Object.fromEntries(Object.entries(skipWhy).filter(([k]) => skipSet.has(k))), at: new Date().toISOString() });
  // Any edit: keep a copy on this phone right away, then save to the store after a short pause.
  function edited() {
    const m = model(); if (!m || !db) return;
    const v = snap(m); draftPut(date, v); finBtn(false); paintTicks(m); paintSkips(); paintNext(); bar('Saving…'); schedule(DELAY);
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => persist(false), ms); }
  function flush() { if (timer) { clearTimeout(timer); timer = null; persist(false); } }

  // Writes lift_log/<date> (same document shape as before, plus finished_at). The session rating in feel_sessions is written
  // on Finish or when the effort answer changes, keeping earlier answers, so autosaves never add blank ratings.
  async function persist(finish) {
    clearTimeout(timer); timer = null;
    const m = model(); if (!m) return;
    if (!db) { bar('Saving is not available in this view; reply to the check-in instead.', 'err'); return; }
    if (saving) { again = again || 'auto'; if (finish) again = 'finish'; return; }
    const v = snap(m), d = v.date, prevDoc = logs.get(d) || null;
    if (!Object.keys(v.sets).length && !v.done.length && !prevDoc) {
      if (finish) bar('Enter at least one set first.', 'err'); else { bar('Sets save as you type.'); draftDrop(d); }
      return;
    }
    saving = true; $('l-save').disabled = true; paintTicks(m); bar('Saving…');
    const at = v.at;
    const ad = dash.data('activities'); const g = ad.status === 'ok' ? ad.data.filter((a) => /strength/i.test(String(a.type)) && String(a.local_start).slice(0, 10) === d)
      .sort((a, b) => Number(b.duration_min) - Number(a.duration_min))[0] : null;
    const mins = g ? Math.round(Number(g.duration_min)) || null : null;
    const id = g ? String(g.activity_id) : `manual-${d}-strength`;
    const ids = {}; for (const e of m.ex) if (v.sets[e.ex] && e.id) ids[e.ex] = e.id;
    // a switch mid-day (Use today) never drops sets already saved under the other routine's slots
    if (prevDoc && prevDoc.sets) { const pi = prevDoc.ids || {}; for (const k of Object.keys(prevDoc.sets)) if (!m.ex.some((e) => e.ex === k) && !(k in v.sets)) { v.sets[k] = prevDoc.sets[k]; if (pi[k]) ids[k] = pi[k]; } }
    const fin = finish ? at : (prevDoc && prevDoc.finished_at) || null;
    const doc = { date: d, routine: m.routine.routine, routine_name: m.routine.name, sets: v.sets, ids, rpe: v.rpe, activity_id: g ? id : null, minutes: mins, note: v.note, done: v.done, skipped: v.skipped, skip_why: v.skip_why || {}, saved_at: at, finished_at: fin };
    if (m.day && !m.guest) doc.day = m.day.key; else if (prevDoc && prevDoc.day && m.guest) doc.day = prevDoc.day;
    try {
      await db.doc('lift_log/' + d).set(doc); logs.set(d, doc); draftDrop(d, at); weekDiscs();
      const rateKey = id + '|' + (v.rpe ?? '');
      if (finish || (v.rpe !== null && fsRpe.get(d) !== rateKey)) {
        let prev = null; try { const r = await db.doc('feel_sessions/' + id).get(); prev = r.exists ? r.data() : null; } catch (e) { prev = null; }
        const fs = { ...(prev || {}), date: d, activity_id: id, activity: g ? `${g.type}: ${g.name} (${m.routine.name})` : `strength (${m.routine.name}, logged on the dashboard)`, type: 'strength', minutes: mins ?? (prev ? prev.minutes ?? null : null),
          rpe: v.rpe ?? (prev ? prev.rpe ?? null : null), vs_plan: prev ? prev.vs_plan || '' : '', pain: prev ? prev.pain ?? null : null, pain_site: prev ? prev.pain_site || '' : '',
          fuel: '', note: prev ? prev.note || '' : '', saved_at: at };
        fs.srpe_load = typeof fs.rpe === 'number' && fs.minutes ? Math.round(fs.rpe * fs.minutes) : null;
        await db.doc('feel_sessions/' + id).set(fs); fsRpe.set(d, rateKey);
        if (window.CX.live && typeof window.CX.live.set === 'function') window.CX.live.set(id, fs);
      }
      if (d === date) {
        status('Saved ' + fWD(d) + ', ' + stamp(at), 'ok');
        bar((finish ? 'Session saved · ' : 'All sets saved · ') + stamp(at), 'ok');
        if (finish) { finBtn(true); const kx = m.guest && !m.guest.mine ? m.guest : mfy && mfy.mfy ? mfy : null; if (kx) { keepAsk = date + '|' + kx.id; keepCard(m); } }
      }
      renderProgress(m.base || m);
    } catch (e) {
      if (d === date) bar(`Not saved yet (${e && e.code ? e.code : 'no connection'}). Kept on this phone; retrying.`, 'retry');
      if (!timer) timer = setTimeout(() => persist(false), RETRY);
    } finally {
      saving = false; $('l-save').disabled = false; if (d === date) paintTicks(m);
      if (again) { const f = again === 'finish'; again = false; persist(f); }
    }
  }

  // Block-start exercise rotation (the athlete, Oct 24): the coach proposes swaps; the athlete taps to use them or keep the routine.
  // The tap is saved to lift_choice/<block_key>; the next morning run records it and applies accepted swaps from the block start.
  function renderRotation(m) {
    const card = $('l-rot'); if (!card) return;
    const fresh = (p) => p.status === 'proposed' || (p.decided_on && dayN(TODAY) - dayN(p.decided_on) <= 14) || (choices.has(p.block_key) && dayN(TODAY) <= dayN(p.start) + 14);
    const p = m.proposals.filter(fresh).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    card.hidden = !p; if (!p) return;
    const ch = choices.get(p.block_key);
    const decided = ch ? ch.choice : ({ accepted: 'accept', applied: 'accept', kept: 'keep' })[p.status] || null;
    // the proposal's swaps may arrive as JSON text (the runtime hands nested values to the page that way): read them with arr()
    const pw = 'kind=lift_proposal&block_key=' + encodeURIComponent(p.block_key); const swaps = arr(p.swaps);
    for (const id of ['l-rothead', 'l-rotsub', 'l-rotlist', 'l-rotstatus']) mark($(id), 'coach', null, pw, id === 'l-rotlist' ? 'swaps' : id === 'l-rotstatus' ? 'choice' : 'proposal');
    $('l-rothead').textContent = `New block: ${p.block}${p.block_name ? ' · ' + p.block_name : ''}`;
    $('l-rotsub').textContent = `Starts ${fWD(p.start)}${p.focus ? '. Focus: ' + p.focus : ''}.`;
    $('l-rotlist').replaceChildren(...swaps.map((s) => {
      const li = el('li', 'ck-row lx-swap'); li.append(el('span', 'lx-id', s.ex));
      const main = el('span', 'ck-row-main'); const t = el('span', 'ck-row-t'); t.append(s.from_name + ' → ', el('b', null, s.to_name)); main.append(t);
      main.append(el('span', 'ck-row-s', s.why));
      if (s.to_note) main.append(el('span', 'ck-row-s', 'Your record: ' + s.to_note));
      li.append(main); return li;
    }));
    const bA = $('l-rotyes'), bK = $('l-rotkeep');
    bA.setAttribute('aria-pressed', String(decided === 'accept')); bK.setAttribute('aria-pressed', String(decided === 'keep'));
    const st = $('l-rotstatus');
    st.textContent = decided === 'accept' ? (p.status === 'applied' ? 'In your routine now.' : `Saved: the changes start ${fD(p.start)}.`)
      : decided === 'keep' ? 'Saved: your routine stays as it is.' : 'Your logged sets stay with each exercise either way, so a lift that comes back is compared with its own best.';
    const pick = async (choice) => {
      if (!db) { st.textContent = 'Saving is not available in this view; reply to the check-in instead.'; return; }
      const doc = { block_key: p.block_key, choice, swaps: swaps.map((s) => s.ex), saved_at: new Date().toISOString() };
      try { await db.doc('lift_choice/' + p.block_key).set(doc); choices.set(p.block_key, doc); renderRotation(m); }
      catch (e) { st.textContent = `Not saved (${e && e.code ? e.code : 'error'}). Reply to the check-in instead.`; }
    };
    bA.onclick = () => pick('accept'); bK.onclick = () => pick('keep');
    // once answered the card folds to one line (the athlete, Nov 16, 2026: "this doesnt go away"); Change opens it again
    let sm = $('l-rotsum'); if (!sm) { sm = el('button', 'lx-rotsum'); sm.type = 'button'; sm.id = 'l-rotsum'; sm.addEventListener('click', () => { rotOpen = !rotOpen; renderRotation(m); }); card.prepend(sm); }
    card.classList.toggle('lx-rotfold', !!decided && !rotOpen); sm.hidden = !decided; sm.setAttribute('aria-expanded', String(rotOpen));
    sm.replaceChildren(icon('check'), el('span', null, `${p.block} block, ${fD(p.start)}: ` + (decided === 'accept' ? 'changes saved' : 'routine stays')), el('span', 'lx-chg', rotOpen ? 'Hide' : 'Change'));
  }
  let rotOpen = false;

  function renderLifts() {
    const m = model();
    // shared states (Cockpit ck-state) on every card: loading until the routine and the store have answered, error when the
    // coach data failed (your logged sets stay in the store and on this phone), empty when there is no lift routine yet
    // no routine (a new coach before its first one): only the message shows, not a form with nothing to log (6.55.0)
    $('l-log').toggleAttribute('data-none', !m && dash.data('coach').status === 'ok');
    if (!m) { const d = dash.data('coach'); const st = d.status === 'ok' ? 'empty' : d.status === 'error' || d.status === 'missing' ? 'error' : 'loading';
      exState(st, st === 'error' ? 'The lift routine did not load. Your logged sets are safe in your log and on this phone.' : 'No routine yet. Your coach proposes one in your first week that fits the equipment you have, and nothing starts until you say yes. Until then, log any lift under Check-in, Rate a session.');
      cardState($('l-prog'), st, st === 'error' ? 'The lift routine did not load. Your logged sets are safe.' : 'Progress shows once there is a routine.');
      cardState($('l-rules'), st, st === 'error' ? 'The rules did not load.' : 'The rules come with the routine.'); $('l-rot').hidden = true; return; }
    legacy = m.routine.legacy_ids || {};
    if (CL() && !rpe3) { rpe3 = true; $('l-rpe').classList.add('lx-opts3'); $('l-rpe-l').textContent = 'How did it feel?'; paintRpe = chips($('l-rpe'), ['3', '4', '6'], ['Easy', 'Steady', 'Hard'], () => rpeSel, (v) => { rpeSel = v; edited(); }); }
    $('l-copy').hidden = CL();
    // Rules card (the athlete, Nov 16: "do we still need rules at the bottom"): with the aim line and the minutes in the session it goes;
    // a stop-signal rule stays as one Watch line above the effort question. The rules stay in the routine for the coach.
    { const rc = $('l-rules'); if (rc) rc.hidden = CL(); let sl = $('l-stop'); const w = CL() && m.rules.find((x) => x.warn);
      if (w && !sl) { sl = el('p', 'lx-stop'); sl.id = 'l-stop'; $('l-rpe').closest('.lx-rpe').before(sl); }
      if (sl) { sl.hidden = !w; if (w) sl.replaceChildren(icon('watch'), mk('span', null, null, 'coach', 'text', `kind=lift_rule&routine=${w.routine}&order=${w.order}`)); if (w) sl.lastChild.append(el('b', null, w.label + ': '), w.text); } }
    renderStatic(m); renderRotation(m.base || m);
    const key = JSON.stringify([m.ex, m.phases, date, loaded]);
    if (key !== builtKey) { if (builtKey && db) { const v = snap(m); if (Object.keys(v.sets).length || v.note) draftPut(date, v); } builtKey = key; build(m); }
    $('l-rot').setAttribute('aria-busy', String(!loaded)); // the rotation choice is read from the store: busy until it answers
    renderProgress(m.base || m);
  }
  window.CX.renderLifts = renderLifts;

  const dIn = $('l-date'); dIn.value = TODAY; dIn.max = TODAY;
  dIn.addEventListener('change', () => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dIn.value)) return; flush(); date = dIn.value; extraSets.clear(); doneSet = new Set(); skipSet = new Set(); builtKey = ''; renderLifts(); });
  paintRpe = chips($('l-rpe'), ['2', '3', '4', '6', '8'], ['Very easy', 'Easy', 'Steady', 'Hard', 'Very hard'], () => rpeSel, (v) => { rpeSel = v; edited(); });
  $('l-save').addEventListener('click', () => persist(true));
  $('l-ex').addEventListener('input', edited);
  // keyboard: a control focused under the pinned save bar scrolls up clear of it (Phase 5; presentation only)
  $('l-ex').addEventListener('focusin', (ev) => { const bb = $('l-bar').getBoundingClientRect(), r = ev.target.getBoundingClientRect(); if (r.bottom > bb.top - 8 && r.top < bb.bottom) window.scrollBy({ top: r.bottom - bb.top + 16, behavior: window.CK && CK.scrollBehavior ? CK.scrollBehavior() : 'auto' }); });
  $('l-note').addEventListener('input', edited);
  // Leaving the app, switching tabs or closing the page sends whatever is waiting.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('online', () => { if (draftGet(date)) schedule(0); });
  $('l-copy').addEventListener('click', () => {
    const m = model(); if (!m) return;
    for (const e of m.ex) {
      const last = lastBefore(e.id || e.ex, date, e.day_key); if (!last) continue;
      last.sets.forEach((st, i) => {
        for (const f of ['lb', 'reps']) { const x = document.querySelector(`#l-ex input[data-ex="${e.ex}"][data-i="${i}"][data-f="${f}"]`); if (x && N(st[f]) !== null && x.value === '') x.value = f === 'lb' ? toU(N(st[f])) : st[f]; }
      });
    }
    status(''); edited(); bar('Copied last session; edit what changed. Saving…');
  });
  dash.onData(() => { if (window.CX.state && window.CX.state.page === 'lifts') renderLifts(); });

  (async () => {
    try { db = await window.CX.store(); } catch (e) { db = null; }
    if (db) {
      try { const q = await db.collection('lift_log').get(); logs = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, { date: x.id, ...x.data() }])); }
      catch (e) { status('Could not load your sets.', 'err'); }
      try { const r = await db.doc('lift_pref/routine').get(); if (r.exists) pickPending = r.data().pick || null; } catch (e) { pickPending = null; }
      try { const r = await db.doc('lift_pref/pinned').get(); if (r.exists) { const v = r.data().ids; pinned = typeof v === 'string' ? v.split(';').filter(Boolean) : null; } } catch (e) { pinned = null; }
      try { const q = await db.collection('lift_mine').get(); mineDocs = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); } catch (e) { mineDocs = new Map(); }
      try { const q = await db.collection('lift_ask').get(); asks = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); } catch (e) { asks = new Map(); }
      try { const q = await db.collection('lift_choice').get(); choices = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); } catch (e) { choices = new Map(); }
    }
    loaded = true; builtKey = '';
    if (window.CX.state && window.CX.state.page === 'lifts') renderLifts();
  })();
})();
