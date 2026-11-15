// metrics.js: the Fitness tab's metric catalog (the athlete, Nov 12, 2026: "clean up the cards and structure", tiles that unlock
// with new hardware, and "the add metric button at the bottom populated with the catalog by sport/activity category (each
// collapsible)" with "want to track something else").
//   Locked tile   a metric on the athlete's layout whose data is not connected (coach row cat_metric, state locked, worked
//                 out by coach/tools/catalog.py from their own records). Same size as any tile; a tap opens what it would
//                 show, what it needs and the steps to unlock it. When the data arrives the row turns ready and the tile is
//                 drawn as every other tile is: nothing here is set by hand.
//   Waiting tile  a metric that is ready but has no figure yet and no tile of its own (no swim on record, say): a plain
//                 tile with a dash and what fills it.
//   Figure tile   a simple metric with no level ladder (longest ride, a habit count): its figure, chip and note come on
//                 the cat_metric row (catalog.py figures).
//   Add a metric  a button under the tiles. It opens the whole catalog, one collapsible group per sport or activity, each
//                 metric with Add or Remove. A tap saves metric_pick/<key> {key, on, saved_at} to the store and the tab
//                 shows it at once; the morning run writes it into coach/fitness_layout.json (catalog.py ingest).
//   Want to track something else?  one text line, saved as metric_request/<id> {text, saved_at}; the morning run hands
//                 it to the coach as a proposal for the catalog.
//   Scorecard and Map (6.32.0; the athlete, Nov 12, 2026: "levels and skill trees"): a switch on top. The Scorecard is the tiles; the
//                 Map is every catalog metric as a tree read from the bottom up and replaces the Add a metric list: a metric
//                 opens its ladder and the "Show on my Scorecard" switch (the same metric_pick document as Add a metric was).
//                 Reorder saves metric_order/groups {order, saved_at}. Details: coach/DASHBOARD.md, Scorecard and Map.
// With no store (a preview) the list still opens; Add, Remove and Send say they cannot save here.
(() => {
  const CX = window.CX;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const arr = (v) => { if (Array.isArray(v)) return v; if (typeof v === 'string' && /^\s*\[/.test(v)) { try { return JSON.parse(v); } catch (e) { return []; } } return []; };
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';
  let db = null, loaded = false;
  const picks = new Map(); // key -> {on, saved_at}
  const VIEW = 'cx-fit-view';
  const ui = { open: null, add: false, cats: new Set(), other: false, sent: '', err: '', draft: '', node: null, shut: new Set(), habits: new Set(), reorder: false,
    view: (() => { try { return localStorage.getItem(VIEW) === 'map' ? 'map' : 'score'; } catch (e) { return 'score'; } })() };
  let order = null; // the athlete's own order of the Scorecard groups (store doc metric_order/groups), else the layout's
  let cards = {}; // the athlete's own order of the cards inside each group (store doc metric_order/cards {cards: {group: [metric keys]}}), else the coach's rank
  let focusNext = null;

  const cats = () => CX.kind('cat_cat').slice().sort((a, b) => Number(a.order) - Number(b.order));
  const inputs = () => new Map(CX.kind('cat_input').map((i) => [i.key, { ...i, steps: arr(i.steps) }]));
  const metrics = () => CX.kind('cat_metric').slice().sort((a, b) => Number(a.order) - Number(b.order)).map((m) => ({ ...m, needs: arr(m.needs), missing: arr(m.missing), shown: truthy(m.shown) }));
  // on the dashboard now: the layout, changed by any tap not yet written into it
  const isOn = (m) => (picks.has(m.key) ? !!picks.get(m.key).on : m.shown);
  const rerender = () => { if (CX.render) CX.render(); };

  function lockIcon() {
    const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ck-i mx-lk'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></g>';
    return s;
  }
  const needWords = (m, I) => [...new Set(m.missing.map((k) => (I.get(k) || {}).label || k))].join(' and ');
  const mw = (m) => 'kind=cat_metric&key=' + m.key;
  // plain words for a rung name that does not say what it counts (the athlete, Nov 15, 2026, card "Both"); the ladder keeps its name
  const LV_SAY = { consistency: { '3 days': '3 days a week', '3 weeks': '3 weeks of 3 days', '3 months': '3 months of 3 days' } };

  // ---------- tiles ----------
  function lockedTile(m, I) {
    const { mark } = CX.ck;
    const b = el('button', 'ck-tile ck-tile-btn ft-tile mx-lock'); b.type = 'button'; b.dataset.k = m.key; b.id = 'f-' + m.key; b.dataset.sport = CX.sportTok(m.sport);
    b.setAttribute('aria-expanded', String(ui.open === m.key)); b.setAttribute('aria-controls', 'mx-unlock');
    const head = el('span', 'ck-tile-head'); head.append(mark(el('span', 'ck-tile-label ft-label', m.name), 'coach', 'name', mw(m)), CX.ck.icon('chevron', 'ck-chev ft-chev')); b.append(head);
    const chip = el('span', 'mx-chip'); chip.append(lockIcon(), 'Locked'); mark(chip, 'coach', 'state', mw(m)); b.append(chip);
    const need = el('span', 'ck-sub ft-subl'); need.append('Needs ', mark(el('span', null, needWords(m, I)), 'coach', 'missing', mw(m), 'input-labels')); b.append(need);
    b.append(el('span', 'ck-sub ft-subl mx-how', 'How to unlock'));
    b.setAttribute('aria-label', `${m.name}, locked, needs ${needWords(m, I)}. How to unlock`);
    b.addEventListener('click', () => { ui.open = ui.open === m.key ? null : m.key; if (ui.open) CX.state.fit = null; focusNext = '#f-' + m.key; rerender(); });
    return b;
  }
  function waitingTile(m) {
    const { mark } = CX.ck;
    const b = el('div', 'ck-tile ft-tile mx-wait'); b.dataset.k = m.key; b.id = 'f-' + m.key; b.dataset.sport = CX.sportTok(m.sport);
    const head = el('span', 'ck-tile-head'); head.append(mark(el('span', 'ck-tile-label ft-label', m.name), 'coach', 'name', mw(m))); b.append(head);
    b.append(el('span', 'ck-big ft-fig', '—'));
    b.append(m.sub ? mark(el('span', 'ck-sub ft-subl', m.sub), 'coach', 'sub', mw(m)) : mark(el('span', 'ck-sub ft-subl', 'No figure yet. It fills in from your next sessions.'), 'coach', 'state', mw(m), 'waiting')); // a figure may say how to start (the push-up test, a key lift not logged yet)
    return b;
  }
  // a simple metric (catalog.py figures): one figure with its chip and note, no level ladder
  function figureTile(m) {
    const { mark } = CX.ck;
    const b = el('div', 'ck-tile ft-tile mx-fig'); b.dataset.k = m.key; b.id = 'f-' + m.key; b.dataset.sport = CX.sportTok(m.sport);
    const head = el('span', 'ck-tile-head'); head.append(mark(el('span', 'ck-tile-label ft-label', m.name), 'coach', 'name', mw(m))); b.append(head);
    const fig = el('span', 'ck-big ft-fig'); fig.append(mark(el('span', null, m.value), 'coach', 'value', mw(m)));
    if (m.unit) fig.append(' ', mark(el('small', 'mx-unit', m.unit), 'coach', 'unit', mw(m))); b.append(fig);
    if (m.chip) { const c = el('span', 'mx-chip'); c.append(mark(el('span', null, m.chip), 'coach', 'chip', mw(m))); b.append(c); }
    if (m.note) b.append(mark(el('span', 'ck-sub ft-subl', m.note), 'coach', 'note', mw(m)));
    return b;
  }
  // A simple metric's tile opens its ladder; the figure, level and ladder all come on its cat_metric row (ladders.py).
  function ladderTile(m) {
    const { mark } = CX.ck;
    const b = el('button', 'ck-tile ck-tile-btn ft-tile mx-fig'); b.type = 'button'; b.dataset.k = m.key; b.id = 'f-' + m.key; b.dataset.sport = CX.sportTok(m.sport);
    b.setAttribute('aria-expanded', String(ui.open === m.key)); b.setAttribute('aria-controls', 'mx-ladder');
    const head = el('span', 'ck-tile-head'); head.append(mark(el('span', 'ck-tile-label ft-label', m.name), 'coach', 'name', mw(m)), CX.ck.icon('chevron', 'ck-chev ft-chev')); b.append(head);
    const fig = el('span', 'ck-big ft-fig'); fig.append(mark(el('span', null, m.value), 'coach', 'value', mw(m)));
    // the unit as the marker tiles set it (app.js fitTile: ck-unit, "/mi" against the figure, a word after a space)
    if (m.unit) fig.append(mark(el('span', 'ck-unit', String(m.unit).startsWith('/') ? m.unit : ' ' + m.unit), 'coach', 'unit', mw(m))); b.append(fig);
    // a rung name that does not say what it counts gets plain words on the tile; the ladder keeps its own name (the athlete, Nov 15, 2026,
    // card "Both": Consistency read "Level 3 days"; its 3-3-3 rungs count weeks with three or more training days)
    if (m.level) { const say = (LV_SAY[m.key] || {})[m.level]; const c = el('span', 'ft-chip'); c.append(el('span', 'ft-chip-k', 'Level'), ' ', say ? mark(el('span', null, say), 'coach', null, mw(m), 'formatted') : mark(el('span', null, m.level), 'coach', 'level', mw(m))); b.append(c); }
    // the same three-step bar under the chip as the marker tiles (app.js levelBadge, option 4): how far through its level the reading is
    const thru = m.pct === '' || m.pct === null || m.pct === undefined ? NaN : Number(m.pct);
    if (m.level && Number.isFinite(thru)) {
      const n = 3, x = Math.min(Math.max(thru, 0) * n, n - 1e-9), k = Math.floor(x), tt = `step ${k + 1} of ${n}, ${Math.round((x - k) * 100)}% through this step`;
      const bar = mark(el('span', 'ft-steps'), 'coach', null, mw(m), 'level-steps'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `Level ${m.level}: ${tt}`); bar.title = tt;
      for (let i = 0; i < n; i++) { const sg = el('span', i === k ? 'ft-step is-now' : i < k ? 'ft-step is-done' : 'ft-step'); const f = el('i'); f.style.width = `${i < k ? 100 : i === k ? Math.round((x - k) * 100) : 0}%`; sg.append(f); bar.append(sg); }
      b.append(bar);
    }
    if (m.next) b.append(mark(el('span', 'ck-sub ft-subl', m.next), 'coach', 'next', mw(m)));
    if (m.sub) b.append(mark(el('span', 'ck-sub ft-subl', m.sub), 'coach', 'sub', mw(m)));
    b.setAttribute('aria-label', [m.name, `${m.value} ${m.unit || ''}`.trim(), m.level ? 'Level ' + m.level : ''].filter(Boolean).join(', '));
    b.addEventListener('click', () => { ui.open = ui.open === m.key ? null : m.key; if (ui.open) CX.state.fit = null; focusNext = '#f-' + m.key; rerender(); });
    return b;
  }
  // The ladder of a simple metric, top rung first, with the athlete's rung marked; habits add their 12 weeks.
  function ladderBody(m) {
    const { mark } = CX.ck; const f = document.createDocumentFragment();
    // a key lift (ladder reps; the athlete picked "Only the reps that count", Nov 15, 2026): the goal sentence, then one numbered box per rep
    // of the range on each set, filled when done last session; the weight list and Next line are left out
    if (m.ladder === 'reps' && m.goal) {
      const lo = Number(m.box_lo), hi = Number(m.box_hi), reps = String(m.box_reps || '').split(',').map(Number);
      f.append(mark(el('p', 'mx-goal', m.goal), 'coach', 'goal', mw(m)));
      const g = el('div', 'mx-reps'); g.style.setProperty('--n', String(hi - lo + 1));
      g.setAttribute('role', 'img'); g.setAttribute('aria-label', reps.map((r, i) => `Set ${i + 1}: ${r} of ${hi} reps`).join('. '));
      g.append(el('span'));
      for (let r = lo; r <= hi; r++) g.append(el('span', 'mx-reps-h', String(r)));
      reps.forEach((done, i) => { g.append(el('span', 'mx-reps-set', `Set ${i + 1}`)); for (let r = lo; r <= hi; r++) g.append(el('b', done >= r ? 'mx-rep is-on' : 'mx-rep', done >= r ? '✓' : '')); });
      f.append(mark(g, 'coach', 'box_reps', mw(m)));
      f.append(el('p', 'ck-sub', `Boxes are reps ${lo} to ${hi}, your range. Filled = done last session (${m.box_when}).`));
      if (m.note) f.append(mark(el('p', 'ck-sub', m.note), 'coach', 'note', mw(m)));
      return f;
    }
    const rungs = String(m.rungs || '').split('|').filter(Boolean); const ev = m.event || 'your event';
    if (m.weeks) {
      const on = (String(m.weeks).match(/1/g) || []).length; const wk = el('div', 'mx-weeks'); wk.setAttribute('role', 'img'); wk.setAttribute('aria-label', `${on} of ${String(m.weeks).length} weeks on target, oldest first`);
      for (const c of String(m.weeks)) wk.append(el('i', c === '1' ? 'mx-wk mx-wk--on' : 'mx-wk')); mark(wk, 'coach', 'weeks', mw(m));
      f.append(wk, el('p', 'ck-sub', 'Your last 12 finished weeks, oldest first. Filled is on target.'));
    }
    if (rungs.length) {
      const ol = el('ol', 'mx-rungs'); ol.setAttribute('aria-label', (m.ladder_label || 'Levels') + ', top rung first');
      for (const r of rungs) { const lab = r.replace('your event', ev); const me = !!m.level && m.level === lab; const li = el('li', me ? 'mx-rung mx-rung--me' : 'mx-rung', lab); if (me) { li.setAttribute('aria-current', 'true'); li.append(el('b', 'mx-you', 'You')); } ol.append(li); }
      f.append(el('span', 'ck-eyebrow', m.ladder_label || 'Levels'), ol);
      if (m.level && !rungs.some((r) => r.replace('your event', ev) === m.level)) f.append(el('p', 'ck-note', m.level + '.'));
    }
    if (m.next) { const n = el('p', 'ck-note'); n.append(el('b', null, 'Next: '), mark(el('span', null, m.next), 'coach', 'next', mw(m)), '.'); f.append(n); }
    if (m.note) f.append(mark(el('p', 'ck-sub', m.note), 'coach', 'note', mw(m)));
    if (m.rule) f.append(mark(el('p', 'ck-sub', m.rule), 'coach', 'rule', mw(m)));
    return f;
  }
  function ladderPanel(m) {
    const p = el('div', 'ft-expand mx-unlock mx-ladder'); p.id = 'mx-ladder'; if (m.ladder === 'reps') p.dataset.sport = CX.sportTok(m.sport); // the rep boxes take the tile's sport colour p.setAttribute('role', 'region'); p.setAttribute('aria-label', 'Levels for ' + m.name);
    p.append(el('h3', 'ck-h3', m.name)); const what = el('p', 'ck-note'); what.append(CX.ck.mark(el('span', null, m.what), 'coach', 'what', mw(m))); p.append(what, ladderBody(m));
    // a habit that had its own chart keeps it inside the panel (Consistency, the training days per week bars; 6.47.0, back from 6.40.0)
    const A = CX.app || {}; const mk = A.kind ? A.kind('marker').find((x) => x.key === m.key && x.chart) : null;
    if (mk && A.drawMarker) { const box = el('div', 'chart mx-ladder-chart'); box.id = 'mx-ladder-chart'; box.style.setProperty('--h', '170px'); box.dataset.source = 'coach'; p.append(box);
      requestAnimationFrame(() => { if (box.isConnected) { try { A.drawMarker(mk, box, null, null, false); } catch (e) { box.replaceChildren(el('p', 'ck-note', 'The chart could not draw.')); } } }); }
    return p;
  }
  const plainTile = (m) => (m.value !== undefined && m.value !== null && String(m.value) !== '' ? (m.level || m.rungs ? ladderTile(m) : figureTile(m)) : waitingTile(m));
  function unlockPanel(m, I) {
    const { mark } = CX.ck;
    const p = el('div', 'ft-expand mx-unlock'); p.id = 'mx-unlock'; p.setAttribute('role', 'region'); p.setAttribute('aria-label', 'How to unlock ' + m.name);
    p.append(el('span', 'ck-eyebrow', 'Unlock'), el('h3', 'ck-h3', m.name));
    const what = el('p', 'ck-note'); what.append(el('b', null, 'What you get: '), mark(el('span', null, m.what), 'coach', 'what', mw(m))); p.append(what);
    for (const k of m.missing) {
      const i = I.get(k); if (!i) continue; const iw = 'kind=cat_input&key=' + k;
      const need = el('p', 'ck-note'); need.append(el('b', null, 'What it needs: '), mark(el('span', null, i.have), 'coach', 'have', iw), '.'); p.append(need);
      const ol = el('ol', 'mx-steps'); mark(ol, 'coach', 'steps', iw); for (const s of i.steps) ol.append(el('li', null, s)); p.append(ol);
    }
    const also = metrics().filter((x) => x.key !== m.key && x.state === 'locked' && x.missing.some((k) => m.missing.includes(k)) && x.missing.every((k) => m.missing.includes(k)));
    if (also.length) { const a = el('p', 'ck-note'); a.append('The same step also unlocks ', mark(el('span', null, also.map((x) => x.name).join(', ')), 'coach', 'name', 'kind=cat_metric', 'same-inputs'), '.'); p.append(a); }
    p.append(el('p', 'ck-note', 'A locked tile never counts against you, and nothing needs buying.'));
    const row = el('div', 'ck-btn-row'); const hide = el('button', 'ck-btn ck-btn--quiet', 'Hide this tile'); hide.type = 'button';
    hide.addEventListener('click', () => { ui.open = null; pick(m.key, false); }); row.append(hide); p.append(row);
    return p;
  }
  // put a full-width panel after the last tile of the row that holds `tile`
  function afterRow(box, tile, panel) {
    let last = tile; const top = tile.offsetTop;
    for (let n = tile.nextElementSibling; n && n.classList.contains('ft-tile') && Math.abs(n.offsetTop - top) < 2; n = n.nextElementSibling) last = n;
    last.after(panel);
  }

  // ---------- scales: who a tile's levels are read against (app.js scalePicker) ----------
  const scaleSaved = {};
  CX.scaleSaved = () => scaleSaved;
  CX.saveScale = (tile, id, when) => { const at = when || new Date().toISOString(); scaleSaved[tile] = { id, at }; // the newest pick wins (app.js pickFor)
   if (db) db.doc('metric_compare/' + tile).set({ key: tile, compare: id, saved_at: at }).catch(() => { /* kept on this device; the next tap saves again */ }); };

  // ---------- level-up ribbon: seen on any device is seen on all (6.47.0; app.js renderKudos) ----------
  // store doc seen/levelups {ids, saved_at}; page state only, nothing in the morning run reads it. The union of the store's ids
  // and this device's cx-lvseen counts, so a "Nice" on one phone never shows the same ribbon again on another.
  let lvShared = [];
  CX.lvSeenShared = () => lvShared;
  CX.saveLvSeen = (ids) => { lvShared = [...new Set([...lvShared, ...ids])].slice(-200);
    if (db) db.doc('seen/levelups').set({ ids: lvShared, saved_at: new Date().toISOString() }).catch(() => { /* kept on this device */ }); };

  // ---------- saving ----------
  function pick(key, on) {
    const at = new Date().toISOString(); picks.set(key, { on, saved_at: at }); ui.err = '';
    if (!db) { ui.err = 'Not saved: this view cannot save. Open the dashboard from your Claude app.'; rerender(); return; }
    db.doc('metric_pick/' + key).set({ key, on, saved_at: at }).catch((e) => { picks.delete(key); ui.err = `Not saved (${e && e.code ? e.code : 'error'}). Try again.`; rerender(); });
    rerender();
  }
  function saveOrder(keys) {
    order = keys; ui.err = '';
    if (!db) { ui.err = 'Not saved: this view cannot save. Open the dashboard from your Claude app.'; rerender(); return; }
    db.doc('metric_order/groups').set({ order: keys, saved_at: new Date().toISOString() }).catch((e) => { ui.err = `Order not saved (${e && e.code ? e.code : 'error'}). Try again.`; rerender(); });
    rerender();
  }
  // Cards inside a section (the athlete, Nov 12, 2026: "I'd like to be able to reorder ... cards in each section, unless you're dictating the order of importance"):
  // the coach's rank is the default and keeps its number on the tile; the athlete's own order wins where saved, and one tap goes back.
  CX.cardOrder = (group) => (cards[group] && cards[group].length ? cards[group] : null);
  function saveCards(next) {
    cards = next; ui.err = '';
    if (!db) { ui.err = 'Not saved: this view cannot save. Open the dashboard from your Claude app.'; rerender(); return; }
    db.doc('metric_order/cards').set({ cards: next, saved_at: new Date().toISOString() }).catch((e) => { ui.err = `Order not saved (${e && e.code ? e.code : 'error'}). Try again.`; rerender(); });
    rerender();
  }
  // Foundation is every sport's base: it always sits last (the athlete, Nov 12, 2026: "foundational things are at the bottom")
  const isBase = (k) => k === 'foundation' || k === 'cat-all';
  CX.fitOrder = (groups) => {
    const at = (g) => (order && order.includes(g.key) ? order.indexOf(g.key) : 1000 + Number(g.order || 0));
    return groups.slice().sort((a, b) => (isBase(a.key) - isBase(b.key)) || at(a) - at(b));
  };
  function sendRequest(text) {
    const t = text.trim(); if (!t) return;
    if (!db) { ui.err = 'Not sent: this view cannot save. Tell your coach in chat instead.'; rerender(); return; }
    const at = new Date().toISOString(); const id = at.replace(/[^0-9]/g, '').slice(0, 14);
    db.doc('metric_request/' + id).set({ text: t.slice(0, 300), saved_at: at })
      .then(() => { ui.sent = t; ui.draft = ''; ui.other = false; ui.err = ''; focusNext = '#mx-sent'; rerender(); })
      .catch((e) => { ui.err = `Not sent (${e && e.code ? e.code : 'error'}). Try again, or tell your coach in chat.`; rerender(); });
  }

  // ---------- shared pieces ----------
  const setView = (v) => { ui.view = v; ui.node = null; ui.open = null; CX.state.fit = null; try { localStorage.setItem(VIEW, v); } catch (e) { /* private window */ } focusNext = '#mx-view input:checked'; rerender(); };
  function viewBar() {
    const bar = el('fieldset', 'ck-seg ft-seg mx-view'); bar.id = 'mx-view'; bar.append(el('legend', 'ck-vh', 'View'));
    for (const [v, label] of [['score', 'Scorecard'], ['map', 'Map']]) {
      const opt = el('label', 'ck-seg-opt'); const inp = el('input', 'ck-vh-input'); inp.type = 'radio'; inp.name = 'mx-view'; inp.value = v; inp.checked = ui.view === v;
      inp.addEventListener('change', () => { if (inp.checked) setView(v); }); opt.append(inp, label); bar.append(opt);
    }
    return bar;
  }
  // this block's focus metrics (the live block brief): a Focus chip on their tile and on their Map row
  function focusKeys() {
    const t = CX.app.TODAY; const b = CX.kind('brief').find((x) => x.status === 'live' && String(x.start) <= t && t <= String(x.end));
    return new Set(b ? CX.kind('brief_kpi').filter((k) => k.block_key === b.block_key).map((k) => k.key) : []);
  }
  // performance stages (the athlete, Nov 12, 2026: not steps on the Map, "a small badge on performance that has 1, 2, 3, an
  // overlapped badge"): three overlapped discs, the stage in use filled, a stage with no scale on file dashed
  function stageBadge(key) {
    const si = CX.stageInfo ? CX.stageInfo(key) : null; if (!si) return null;
    const b = el('span', 'mx-stage'); b.setAttribute('role', 'img'); const names = { 1: 'general population', 2: 'your race or sport', 3: 'elite' };
    b.setAttribute('aria-label', `Stage ${si.cur} of 3: ${si.label}`); b.title = `Stage ${si.cur} of 3, compared with ${si.label}. 1 ${names[1]}, 2 ${names[2]}, 3 ${names[3]}.`;
    for (const n of [1, 2, 3]) { const d = el('i', 'mx-stage-d' + (n === si.cur ? ' is-cur' : si.have.includes(n) ? '' : ' is-none'), String(n)); d.setAttribute('aria-hidden', 'true'); b.append(d); }
    return b;
  }
  const focusChip = () => { const c = el('span', 'mx-focus', 'Focus'); c.title = 'One of this block\'s focus metrics'; return c; };
  // level of any metric: a simple metric carries it on its row; a marker's is read off the tile app.js drew for it
  function levelOf(m, tiles) {
    if (m.level !== undefined && m.level !== null && String(m.level) !== '') return { label: String(m.level), pct: m.pct === '' || m.pct === null || m.pct === undefined ? null : Number(m.pct), next: m.next || '' };
    const t = tiles.get(m.key); const c = t && t.querySelector('.ft-chip[data-level]');
    return c ? { label: c.dataset.level, pct: c.dataset.pct === '' ? null : Number(c.dataset.pct), next: '' } : null;
  }
  const figOf = (m, tiles) => { if (m.value !== undefined && m.value !== null && String(m.value) !== '') return `${m.value} ${m.unit || ''}`.trim(); const t = tiles.get(m.key); const f = t && t.querySelector('.ft-fig'); const x = f ? f.textContent.replace(/\s+/g, ' ').trim() : ''; return x && x !== '—' ? x : ''; };
  // the one metric on the Scorecard nearest its next level
  function nextBox(M, tiles) {
    let best = null;
    for (const m of M) { if (!isOn(m) || m.state === 'locked') continue; const lv = levelOf(m, tiles); if (lv && lv.pct !== null && !Number.isNaN(lv.pct) && (!best || lv.pct > best.lv.pct)) best = { m, lv }; }
    if (!best) return null;
    const b = el('button', 'mx-next'); b.type = 'button'; b.id = 'mx-next';
    const tx = el('span', 'mx-nextt'); tx.append(el('span', 'ck-eyebrow', 'Closest to a new level'), el('b', null, best.m.name), el('span', 'ck-sub', `${best.lv.label} · ${Math.round(best.lv.pct * 100)}% of the way to the next level` + (best.lv.next ? ` · ${best.lv.next}` : '')));
    b.append(tx, CX.ck.icon('chevron', 'ck-chev'));
    b.addEventListener('click', () => { const k = best.m.key; if (ui.view === 'map') { ui.node = k; focusNext = '#mx-n-' + k; } else if (tiles.has(k) && !best.m.rungs) { CX.state.fit = k; ui.open = null; } else { ui.open = k; CX.state.fit = null; focusNext = '#f-' + k; } rerender(); });
    return b;
  }
  function requestBox() {
    const oth = el('section', 'mx-other');
    if (ui.sent) { const ok = el('p', 'ck-note mx-sent'); ok.id = 'mx-sent'; ok.tabIndex = -1; ok.setAttribute('role', 'status'); ok.append(CX.ck.icon('check'), ' Sent: "', el('span', null, ui.sent), '". Your coach will bring it up, and it goes to the kit\'s makers as an idea.'); oth.append(ok); }
    if (!ui.other) {
      const ob = el('button', 'ck-btn ck-btn--quiet mx-otherb', ui.sent ? 'Ask for another' : 'Want to track something else?'); ob.type = 'button'; ob.id = 'mx-otherb';
      ob.addEventListener('click', () => { ui.other = true; focusNext = '#mx-othert'; rerender(); }); oth.append(ob);
    } else {
      const lab = el('label', 'ck-field'); lab.append(el('span', 'ck-label', 'What would you like to track?'));
      const inp = el('input', 'ck-input'); inp.type = 'text'; inp.id = 'mx-othert'; inp.maxLength = 300; inp.placeholder = 'For example: deadlift max, Hyrox sled time'; inp.value = ui.draft;
      inp.addEventListener('input', () => { ui.draft = inp.value; });
      lab.append(inp); oth.append(lab, el('p', 'ck-note', 'Your coach reads this tomorrow morning. If it can be measured, it is proposed for the catalog.'));
      const row = el('div', 'ck-btn-row'); const send = el('button', 'ck-btn ck-btn--primary', 'Send'); send.type = 'button'; send.addEventListener('click', () => sendRequest(inp.value));
      const cancel = el('button', 'ck-btn ck-btn--quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => { ui.other = false; focusNext = '#mx-otherb'; rerender(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendRequest(inp.value); } });
      row.append(cancel, send); oth.append(row);
    }
    return oth;
  }

  // ---------- the Map: every metric as a tree, read from the bottom up ----------
  // One branch per category, most relevant first (the order of the Scorecard's groups), Foundation last. Inside a branch
  // the steps run Performance, Capacity, Habit, so the habit a new person starts with is at the bottom. A node opens its
  // ladder and the "Show on my Scorecard" switch; a locked node shows what unlocks it. Nothing is locked behind a level.
  // Skill tree look (the athlete, Nov 12, 2026: no "You are here"; "solid line when you have access, dotted, grayed out" when it
  // can still be unlocked): an unlocked node has a solid border, a locked one is dotted and grey. hereOf only folds habits.
  const STEADY = /^(3 months|\d+ months)/; // a habit held three months or more
  function hereOf(ms, tiles) {
    const lv = (m) => (m.state === 'locked' ? null : levelOf(m, tiles));
    const habits = ms.filter((m) => m.step === 'habit' && m.ladder === 'habit' && lv(m));
    if (habits.some((m) => !STEADY.test(lv(m).label))) return 'habit';
    const has = (s) => ms.some((m) => m.step === s && lv(m));
    return has('performance') ? 'performance' : has('capacity') ? 'capacity' : ms.some((m) => lv(m)) ? 'habit' : null;
  }
  function nodeDetail(m, I, tiles) {
    const { mark } = CX.ck; const p = el('div', 'mx-detail'); p.id = 'mx-d-' + m.key;
    const what = el('p', 'ck-note'); what.append(mark(el('span', null, m.what), 'coach', 'what', mw(m))); p.append(what);
    if (m.state === 'locked') {
      for (const k of m.missing) { const i = I.get(k); if (!i) continue; const iw = 'kind=cat_input&key=' + k;
        const need = el('p', 'ck-note'); need.append(el('b', null, 'What it needs: '), mark(el('span', null, i.have), 'coach', 'have', iw), '.'); p.append(need);
        const ol = el('ol', 'mx-steps'); mark(ol, 'coach', 'steps', iw); for (const s of i.steps) ol.append(el('li', null, s)); p.append(ol); }
      p.append(el('p', 'ck-sub', 'It unlocks by itself when the data arrives. A locked metric never counts against you, and nothing needs buying.'));
    } else if (m.rungs || m.level) p.append(ladderBody(m));
    else { const lv = levelOf(m, tiles); const fg = figOf(m, tiles);
      if (fg || lv) { const n = el('p', 'ck-note'); if (fg) n.append(el('b', null, fg)); if (lv) n.append(fg ? ' · ' : '', 'Level ', el('b', null, lv.label)); p.append(n); }
      else p.append(el('p', 'ck-note', 'No figure yet. It fills in from your next sessions.'));
      if (m.rule) p.append(mark(el('p', 'ck-sub', (m.ladder_label ? m.ladder_label + '. ' : '') + m.rule), 'coach', 'rule', mw(m))); }
    const row = el('div', 'ck-btn-row'); const on = isOn(m);
    const sw = el('button', 'mx-switch'); sw.type = 'button'; sw.id = 'mx-s-' + m.key; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(on));
    sw.append(el('span', 'mx-switch-t'), el('span', null, 'Show on my Scorecard'));
    sw.addEventListener('click', () => { focusNext = '#mx-s-' + m.key; pick(m.key, !on); }); row.append(sw);
    if (on && m.state !== 'locked' && tiles.has(m.key) && !m.rungs) { const ch = el('button', 'ck-btn ck-btn--quiet', 'Open its chart'); ch.type = 'button';
      ch.addEventListener('click', () => { ui.view = 'score'; try { localStorage.setItem(VIEW, 'score'); } catch (e) { /* private window */ } ui.node = null; CX.state.fit = m.key; rerender(); const t = document.getElementById('f-' + m.key); if (t) t.scrollIntoView({ block: 'center' }); }); row.append(ch); }
    p.append(row);
    return p;
  }
  function mapView(M, I, tiles) {
    const { mark } = CX.ck; const wrap = el('div', 'mx-map'); wrap.id = 'mx-map'; const focus = focusKeys();
    wrap.append(el('p', 'ck-note', 'Every metric the coach can measure, read from the bottom up: Foundation at the bottom, habits at the bottom of each sport, what your next event needs at the top. Tap a metric for its ladder and to show or hide it.'));
    const steps = CX.kind('cat_step').slice().sort((a, b) => Number(b.order) - Number(a.order));
    // branch order follows the Scorecard: a category ranks by the first group that shows one of its metrics
    const gOrd = new Map(CX.fitOrder(CX.kind('fit_group').slice().sort((a, b) => Number(a.order) - Number(b.order))).map((g, i) => [g.key, i]));
    const kpiG = new Map(CX.kind('fit_kpi').map((k) => [k.key, k.group])); const kpiR = new Map(CX.kind('fit_kpi').map((k) => [k.key, Number(k.rank) || 0]));
    const rank = (c) => { if (c.key === 'all') return 1e6; const r = M.filter((m) => m.category === c.key && isOn(m) && gOrd.has(kpiG.get(m.key))).map((m) => gOrd.get(kpiG.get(m.key)) * 100 + kpiR.get(m.key)); return r.length ? Math.min(...r) : 1e5 + Number(c.order); };
    for (const c of cats().sort((a, b) => rank(a) - rank(b))) {
      const ms = M.filter((m) => m.category === c.key); if (!ms.length) continue;
      const on = ms.filter(isOn).length; const open = on ? !ui.shut.has(c.key) : ui.cats.has(c.key); const cw = 'kind=cat_cat&key=' + c.key;
      const sec = el('section', 'mx-br'); sec.dataset.sport = CX.sportTok(c.sport);
      const h = el('button', 'ck-disc mx-cath'); h.type = 'button'; h.id = 'mx-cat-' + c.key; h.setAttribute('aria-expanded', String(open)); h.setAttribute('aria-controls', 'mx-catb-' + c.key);
      const nm = el('span', 'mx-catn'); const sw = el('i', 'ft-sw'); sw.dataset.sport = CX.sportTok(c.sport); sw.setAttribute('aria-hidden', 'true'); nm.append(sw, mark(el('span', null, c.label), 'coach', 'label', cw));
      const cnt = el('span', 'ck-sub'); cnt.append(mark(el('span', null, String(on)), 'coach', null, 'kind=cat_metric&category=' + c.key, 'on-count'), ' of ', mark(el('span', null, String(ms.length)), 'coach', null, 'kind=cat_metric&category=' + c.key, 'count'), ' on');
      h.append(nm, cnt, CX.ck.icon('chevron', 'ck-chev'));
      h.addEventListener('click', () => { if (on) { if (open) ui.shut.add(c.key); else ui.shut.delete(c.key); } else if (open) ui.cats.delete(c.key); else ui.cats.add(c.key); focusNext = '#mx-cat-' + c.key; rerender(); });
      sec.append(h);
      if (open) {
        const body = el('div', 'mx-brb'); body.id = 'mx-catb-' + c.key; const here = hereOf(ms, tiles);
        for (const st of steps) {
          const sm = ms.filter((m) => m.step === st.key); if (!sm.length) continue;
          const sh = el('h4', 'mx-step'); sh.append(mark(el('span', null, st.label), 'coach', 'label', 'kind=cat_step&key=' + st.key));
          if (sm.every((m) => m.state === 'locked')) sh.classList.add('mx-step--lock'); // nothing on this step is unlocked yet
          body.append(sh);
          // habits that are all steady fold to one line (someone well past habit forming does not need them in the way)
          const hk = c.key + ':' + st.key; const lvs = sm.map((m) => (m.state === 'locked' ? null : levelOf(m, tiles)));
          if (st.key === 'habit' && here && here !== 'habit' && sm.length > 1 && !ui.habits.has(hk) && !sm.some((m) => m.key === ui.node) && lvs.every((l, i) => !l || sm[i].ladder !== 'habit' || STEADY.test(l.label))) {
            const fb = el('button', 'mx-node mx-node--fold'); fb.type = 'button'; fb.id = 'mx-h-' + c.key; fb.setAttribute('aria-expanded', 'false');
            fb.append(el('span', 'mx-noden', 'Habits held'), el('span', 'ck-sub', `Show the ${sm.length} habit metrics`)); fb.addEventListener('click', () => { ui.habits.add(hk); focusNext = '#mx-n-' + sm[0].key; rerender(); }); body.append(fb); continue;
          }
          for (const m of sm) {
            const isOpen = ui.node === m.key; const lv = m.state === 'locked' ? null : levelOf(m, tiles); const fg = m.state === 'locked' ? '' : figOf(m, tiles);
            const b = el('button', 'mx-node' + (m.state === 'locked' ? ' mx-node--lock' : ' mx-node--open' + (isOn(m) ? ' mx-node--on' : ''))); b.type = 'button'; b.id = 'mx-n-' + m.key; b.setAttribute('aria-expanded', String(isOpen)); b.setAttribute('aria-controls', 'mx-d-' + m.key);
            const top = el('span', 'mx-noden'); top.append(mark(el('span', null, m.name), 'coach', 'name', mw(m))); if (focus.has(m.key)) top.append(focusChip()); if (m.state !== 'locked') { const sb = stageBadge(m.key); if (sb) top.append(sb); } if (isOn(m)) { const o = el('span', 'mx-on'); o.append(CX.ck.icon('check'), 'On'); top.append(o); }
            const sub = el('span', 'ck-sub');
            if (m.state === 'locked') sub.append(lockIcon(), ' Locked: needs ', mark(el('span', null, needWords(m, I)), 'coach', 'missing', mw(m), 'input-labels'));
            else sub.append([fg, lv ? lv.label : ''].filter(Boolean).join(' · ') || 'No figure yet');
            b.append(top, sub, CX.ck.icon('chevron', 'ck-chev'));
            b.addEventListener('click', () => { ui.node = isOpen ? null : m.key; focusNext = '#mx-n-' + m.key; rerender(); });
            body.append(b); if (isOpen) body.append(nodeDetail(m, I, tiles));
          }
        }
        sec.append(body);
      }
      wrap.append(sec);
    }
    wrap.append(requestBox());
    return wrap;
  }

  // ---------- the hook: called by app.js groupFitness after it has laid the tiles out ----------
  // box: #f-tiles; tiles: Map key -> tile element for every metric that has a marker (shown or not)
  CX.metricTiles = (box, tiles) => {
    const M = metrics(); if (!M.length) return;
    const I = inputs(); const byKey = new Map(M.map((m) => [m.key, m]));
    const finish = () => { if (ui.err) { const e = el('p', 'ck-note mx-err'); e.setAttribute('role', 'alert'); e.textContent = ui.err; box.append(e); } if (focusNext) { const f = box.querySelector(focusNext); focusNext = null; if (f) f.focus({ preventScroll: true }); } };
    if (ui.view === 'map') {
      const ex = document.getElementById('f-expand'); if (ex && box.contains(ex)) { ex.hidden = true; box.after(ex); } // the chart panel lives in the box while a tile is open: keep it
      const nb = nextBox(M, tiles); box.replaceChildren(viewBar(), ...(nb ? [nb] : []), mapView(M, I, tiles)); finish(); return;
    }
    const inBox = (k) => box.querySelector(`:scope > .ft-tile[data-k="${k}"]`);
    // 1. hidden by a tap: off the tab
    for (const m of M) if (!isOn(m)) { const t = inBox(m.key); if (t) { if (CX.state.fit === m.key) CX.state.fit = null; t.remove(); } }
    // 2. on the layout: locked instead of an empty tile; a ready metric with no tile of its own gets a waiting tile
    const groupOf = new Map(CX.kind('fit_kpi').map((k) => [k.key, k.group]));
    const heads = Array.from(box.querySelectorAll(':scope > .ft-grp'));
    for (const m of M) {
      if (!isOn(m) || !m.shown) continue;
      const have = inBox(m.key);
      if (m.state === 'locked') { const t = withRank(lockedTile(m, I)); if (have) have.replaceWith(t); else placeInGroup(box, heads, groupOf.get(m.key), t); } else if (!have) placeInGroup(box, heads, groupOf.get(m.key), withRank(plainTile(m)));
      // a habit that also has a chart tile (Consistency; the athlete, Nov 12, 2026: "Yes, move it") reads like every other habit: its habit-ladder tile takes the place
      else if (m.ladder === 'habit' && m.level && !have.classList.contains('mx-fig')) { if (CX.state.fit === m.key) CX.state.fit = null; have.replaceWith(withRank(ladderTile(m))); }
    }
    // 3. added by a tap, not yet on the layout: under their own header until the morning run files them
    const added = M.filter((m) => isOn(m) && !m.shown);
    if (added.length) {
      const h = el('h3', 'ft-grp'); h.append(el('span', 'ck-eyebrow', 'Added by you'), el('span', 'ft-grp-race', 'sorted into place tomorrow')); box.append(h);
      for (const m of added) { const t = m.state === 'locked' ? lockedTile(m, I) : tiles.get(m.key) || plainTile(m); t.dataset.sport = CX.sportTok(m.sport); box.append(t); }
    }
    // a group left with no tiles loses its header
    for (const h of Array.from(box.querySelectorAll(':scope > .ft-grp'))) { const n = h.nextElementSibling; if (!n || !n.classList.contains('ft-tile')) h.remove(); }
    // this block's focus metrics carry a chip
    for (const k of focusKeys()) { const t = inBox(k); const hd = t && t.querySelector('.ck-tile-head'); if (hd && !t.querySelector('.mx-focus')) { hd.after(focusChip()); t.setAttribute('aria-label', `${t.getAttribute('aria-label') || ''}, focus this block`); } }
    // Reorder (rare, so it hides behind one quiet control): Up and Down on each group but Foundation
    if (ui.reorder) {
      const hs = Array.from(box.querySelectorAll(':scope > .ft-grp')).map((h) => { const s = h.querySelector('[data-where^="kind=fit_group&key="]'); return { h, key: s ? s.getAttribute('data-where').replace('kind=fit_group&key=', '') : '' }; }).filter((x) => x.key && !isBase(x.key));
      hs.forEach((x, i) => { const row = el('span', 'mx-move');
        for (const [lab, d] of [['Up', -1], ['Down', 1]]) { const b = el('button', 'ck-btn ck-btn--quiet mx-moveb', lab); b.type = 'button'; b.id = `mx-mv-${x.key}-${lab.toLowerCase()}`; b.setAttribute('aria-label', `Move ${x.h.querySelector('.ck-eyebrow').textContent} ${lab.toLowerCase()}`); b.disabled = i + d < 0 || i + d >= hs.length;
          b.addEventListener('click', () => { const keys = hs.map((y) => y.key); [keys[i], keys[i + d]] = [keys[i + d], keys[i]]; focusNext = `#mx-mv-${x.key}-${lab.toLowerCase()}`; saveOrder(keys); }); row.append(b); }
        x.h.append(row); });
    }
    if (ui.reorder) {
      for (const h of Array.from(box.querySelectorAll(':scope > .ft-grp'))) {
        const sp = h.querySelector('[data-where^="kind=fit_group&key="]'); const gk = sp ? sp.getAttribute('data-where').replace('kind=fit_group&key=', '') : ''; if (!gk) continue;
        const ts = []; for (let n = h.nextElementSibling; n && n.classList.contains('ft-tile'); n = n.nextElementSibling) ts.push(n);
        if (ts.length < 2) continue; const keys = ts.map((t) => t.dataset.k); const gname = (h.querySelector('.ck-eyebrow') || {}).textContent || 'this section';
        const list = el('div', 'mx-cardmv'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', `Order of the cards in ${gname}`);
        keys.forEach((k, i) => { const row = el('span', 'mx-cardrow'); const nm = (byKey.get(k) || {}).name || k; row.append(el('span', 'mx-cardnm', nm));
          for (const [lab, d] of [['Up', -1], ['Down', 1]]) { const b = el('button', 'ck-btn ck-btn--quiet mx-moveb', lab); b.type = 'button'; b.id = `mx-cm-${k}-${lab.toLowerCase()}`; b.setAttribute('aria-label', `Move ${nm} ${lab.toLowerCase()}`); b.disabled = i + d < 0 || i + d >= keys.length;
            b.addEventListener('click', () => { const nk = keys.slice(); [nk[i], nk[i + d]] = [nk[i + d], nk[i]]; focusNext = `#mx-cm-${k}-${lab.toLowerCase()}`; saveCards({ ...cards, [gk]: nk }); }); row.append(b); }
          list.append(row); });
        h.after(list);
      }
    }
    // 4. the open panel of a locked or simple tile, then the next-level box on top and the Map and Reorder controls below
    const om = ui.open && byKey.get(ui.open); const ot = om && inBox(om.key);
    if (om && ot && ot.classList.contains('mx-lock')) afterRow(box, ot, unlockPanel(om, I)); else if (om && ot && ot.classList.contains('mx-fig') && ot.tagName === 'BUTTON') afterRow(box, ot, ladderPanel(om)); else ui.open = null;
    const nb = nextBox(M, tiles); const key = box.querySelector(':scope > .ft-key');
    box.prepend(viewBar(), ...(nb ? [nb] : [])); if (key) box.querySelector(':scope > .mx-view').after(key);
    const foot = el('div', 'mx-add'); foot.id = 'mx-add';
    const mb = el('button', 'ck-btn ck-btn--secondary mx-addbtn', 'Add or remove metrics'); mb.type = 'button'; mb.id = 'mx-addbtn'; mb.addEventListener('click', () => setView('map'));
    const rb = el('button', 'ck-btn ck-btn--quiet mx-reorder', ui.reorder ? 'Done reordering' : 'Reorder'); rb.type = 'button'; rb.id = 'mx-reorder'; rb.setAttribute('aria-pressed', String(ui.reorder)); rb.addEventListener('click', () => { ui.reorder = !ui.reorder; focusNext = '#mx-reorder'; rerender(); });
    foot.append(mb, rb);
    if (ui.reorder && Object.keys(cards).some((g) => cards[g] && cards[g].length)) { const cb = el('button', 'ck-btn ck-btn--quiet mx-reorder', "Back to the coach's card order"); cb.type = 'button'; cb.id = 'mx-cards-reset'; cb.addEventListener('click', () => { focusNext = '#mx-reorder'; saveCards({}); }); foot.append(cb); }
    box.append(foot);
    finish();
  };
  // the layout rank in front of the name, as app.js gives the marker tiles (one look for every tile in a group)
  function withRank(t) {
    const k = CX.kind('fit_kpi').find((x) => x.key === t.dataset.k); const l = t.querySelector('.ft-label');
    if (k && l && k.rank !== undefined && k.rank !== '' && !l.querySelector('.ft-rk')) {
      // 6.55.5: the label itself carries the name mark on a catalog tile, so the name moves into its own marked span first
      // and the number sits beside it, as on the marker tiles (marks read "1Consistency" against "Consistency")
      if (l.hasAttribute('data-field')) { const nm = el('span', 'ft-nm'); nm.append(...l.childNodes); for (const a of ['data-source', 'data-field', 'data-where', 'data-derived']) if (l.hasAttribute(a)) { nm.setAttribute(a, l.getAttribute(a)); l.removeAttribute(a); } l.append(nm); }
      const rk = CX.ck.mark(el('span', 'ft-rk', String(k.rank)), 'coach', 'rank', 'kind=fit_kpi&key=' + k.key); rk.title = `Weight ${k.weight} of 10 for this race type: ${k.why_weight || ''}`; l.prepend(rk); }
    return t;
  }
  function placeInGroup(box, heads, group, tile) {
    // after the last tile of the tile's group (its header is found by the layout's own label mark), else at the end
    const h = heads.find((x) => { const s = x.querySelector('[data-where]'); return s && s.getAttribute('data-where') === 'kind=fit_group&key=' + group; });
    if (!h) { const g = el('h3', 'ft-grp'); const lay = CX.kind('fit_group').find((x) => x.key === group); g.append(CX.ck.mark(el('span', 'ck-eyebrow', lay ? lay.label : 'More'), 'coach', lay ? 'label' : null, lay ? 'kind=fit_group&key=' + group : null, lay ? null : 'ungrouped')); const ord = (k) => { const x = CX.kind('fit_group').find((y) => y.key === k); return x ? Number(x.order) : 1e9; };
      const keyOf = (x) => { const s = x.querySelector('[data-where]'); return s ? String(s.getAttribute('data-where')).replace('kind=fit_group&key=', '') : ''; };
      const before = heads.find((x) => box.contains(x) && ord(keyOf(x)) > ord(group));
      if (before) before.before(g, tile); else { const add = box.querySelector(':scope > .mx-add'); if (add) add.before(g, tile); else box.append(g, tile); }
      heads.push(g); return; }
    let last = h; for (let n = h.nextElementSibling; n && n.classList.contains('ft-tile'); n = n.nextElementSibling) last = n;
    last.after(tile);
  }

  (async () => {
    try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (db) { try { const q = await db.collection('metric_pick').get(); for (const d of q.docs) if (d.exists) { const v = d.data(); picks.set(d.id, { on: !!v.on, saved_at: v.saved_at }); } } catch (e) { /* no picks yet */ } }
    if (db) { try { const d = await db.doc('metric_order/groups').get(); const v = d && d.exists ? d.data() : null; const o = v && (Array.isArray(v.order) ? v.order : arr(v.order)); if (o && o.length) order = o.map(String); } catch (e) { /* no order saved */ } }
    if (db) { try { const d = await db.doc('metric_order/cards').get(); const v = d && d.exists ? d.data() : null; let c = v && v.cards; if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } } if (c && typeof c === 'object') { cards = {}; for (const g of Object.keys(c)) { const l = Array.isArray(c[g]) ? c[g] : arr(c[g]); if (l && l.length) cards[g] = l.map(String); } } } catch (e) { /* no card order saved */ } }
    let sc = 0; if (db) { try { const q = await db.collection('metric_compare').get(); for (const d of q.docs) if (d.exists) { const v = d.data(); if (v && v.compare) { scaleSaved[d.id] = { id: String(v.compare), at: String(v.saved_at || '') }; sc += 1; } } } catch (e) { /* no scale choices yet */ } }
    let lv = 0; if (db) { try { const d = await db.doc('seen/levelups').get(); const v = d && d.exists ? d.data() : null; const ids = v && (Array.isArray(v.ids) ? v.ids : arr(v.ids)); if (ids && ids.length) { lvShared = [...new Set([...lvShared, ...ids.map(String)])]; lv = ids.length; } } catch (e) { /* nothing seen yet */ } }
    loaded = true; if (picks.size || order || sc || lv || Object.keys(cards).length) rerender();
  })();
})();
