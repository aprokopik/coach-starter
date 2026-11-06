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
  function model() {
    const d = dash.data('coach'); if (d.status !== 'ok' || !Array.isArray(d.data)) return null;
    if (!_parsed.has(d.data)) _parsed.set(d.data, d.data.map(unpack));
    const r = _parsed.get(d.data); const routine = r.find((x) => x.kind === 'lift_routine'); if (!routine) return null;
    const mine = (k) => r.filter((x) => x.kind === k && x.routine === routine.routine).sort((a, b) => (N(a.order) ?? 0) - (N(b.order) ?? 0));
    return { routine, blocks: mine('lift_block'), ex: mine('lift_ex'), phases: mine('lift_phase'), rules: mine('lift_rule'),
      hist: new Map(r.filter((x) => x.kind === 'lift_hist').map((x) => [x.id, x])), proposals: r.filter((x) => x.kind === 'lift_proposal') };
  }
  const hasLoad = (e) => e.load === 'lb' || e.load === 'lb_added';
  const side = (e) => (e.per_side ? (e.unit === 's' ? ' /side' : ' /leg') : '');
  const doseTxt = (e) => `${e.sets} × ${N(e.lo) === N(e.hi) ? e.lo : e.lo + '–' + e.hi}${e.unit === 's' ? ' s' : ''}${side(e)}${e.extra ? ' ' + e.extra : ''}`;
  const loadTxt = (e, lb) => (e.load === 'lb_added' ? (lb > 0 ? `+${lb}` : 'BW') : `${lb}`);
  const setTxt = (e, st) => `${hasLoad(e) && N(st.lb) !== null ? loadTxt(e, N(st.lb)) + '×' : ''}${N(st.reps) ?? '?'}${e.unit === 's' ? ' s' : ''}`;
  const exWhere = (e) => `kind=lift_ex&routine=${e.routine}&ex=${e.ex}`;
  const phaseAt = (m, d) => m.phases.find((p) => d >= p.start && d <= p.end) || null;
  // History follows the exercise id, not the slot (the athlete, Oct 24): a lift that rotates out and back keeps its record.
  // Documents saved before ids were recorded map slot to exercise with the routine's legacy_ids.
  let legacy = {};
  const idOf = (d, slot) => (d.ids && d.ids[slot]) || legacy[slot] || slot;
  const history = (exId) => [...logs.values()].filter((d) => d && d.sets).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => { const slot = Object.keys(d.sets).find((k) => idOf(d, k) === exId && Array.isArray(d.sets[k]) && d.sets[k].length); return slot ? { date: d.date, sets: d.sets[slot] } : null; })
    .filter(Boolean);
  const lastBefore = (exId, d) => { const h = history(exId).filter((x) => x.date < d); return h.length ? h[h.length - 1] : null; };
  // The next step as a key and a short value (the athlete, Nov 5, point 4): the log row shows them as a chip ("Next · same load,
  // aim for 8"); the Progress tile keeps the whole sentence (t), which adds what the chip leaves out (" on every set").
  const H = (up, k, v, more) => ({ up, k, v, t: (k ? k + ': ' : '') + v + (more || '') });
  function hint(e, last, mode) {
    if (!last) return null;
    if (mode === 'light') return H(false, 'Light phase', 'same or lighter, 3+ reps in reserve');
    if (mode === 'upper' && e.legs) return H(false, null, 'Not in this phase yet');
    const full = last.sets.length >= N(e.sets) && last.sets.every((st) => N(st.reps) !== null && N(st.reps) >= N(e.hi));
    if (full) {
      if (hasLoad(e)) { const top = Math.max(...last.sets.map((st) => N(st.lb) ?? 0)); return H(true, 'Next', `${loadTxt(e, top + (N(e.step) || 5))} lb, back to ${e.lo}${e.unit === 's' ? ' s' : ''}`); }
      return H(true, 'Next', e.next_hard || 'make it harder');
    }
    return H(false, 'Next', `same ${hasLoad(e) ? 'load' : 'setup'}, aim for ${e.hi}${e.unit === 's' ? ' s' : ''}`, ' on every set');
  }

  function chips(box, opts, labels, get, setv) {
    box.replaceChildren(...opts.map((v, i) => { const b = el('button', 'lx-opt'); b.append(icon('check'), labels ? labels[i] : v + ' min'); b.type = 'button'; b.dataset.v = v; b.addEventListener('click', () => { setv(get() === v ? null : v); paint(); }); return b; }));
    const paint = () => { for (const b of box.querySelectorAll('button')) b.setAttribute('aria-pressed', String(get() === b.dataset.v)); };
    paint(); return paint;
  }
  let paintRpe = () => {};

  const extraSets = new Map(); // extra set rows added with + set, per exercise, for the day being logged
  function build(m) {
    const box = $('l-ex'); box.replaceChildren(); box.classList.remove('dash-skeleton');
    const ph = phaseAt(m, date) || {}; const mode = ph.mode || 'normal';
    const stored = logs.get(date) || null; const dr = draftGet(date);
    // A draft newer than the stored day (typed but not yet saved, e.g. the page closed mid-save) wins and is sent again below.
    const restored = !!(dr && dr.at && (!stored || dr.at > (stored.saved_at || '')));
    const saved = restored ? { ...(stored || {}), date, sets: dr.sets || {}, rpe: dr.rpe, note: dr.note, done: dr.done } : stored;
    doneSet = new Set(arr(saved && saved.done)); skipSet = new Set(arr(saved && saved.skipped));
    const gate = (e) => { if (mode !== 'upper' || !e.legs) return null; const al = ph.allow && ph.allow[e.ex]; return al ? { off: false, t: al } : { off: true, t: ph.legs_note || 'Not in this phase' }; };
    for (const b of m.blocks) {
      const bw = `kind=lift_block&routine=${b.routine}&block=${b.block}`;
      const blk = el('div', 'lx-block'); const bh = el('div', 'lx-bh'); bh.append(mk('h3', 'ck-eyebrow', b.label, 'coach', 'label', bw), mk('span', 'lx-bnote', b.note || '', 'coach', 'note', bw)); blk.append(bh);
      // A block whose exercises are all Done folds to one line (the athlete, Nov 2); tapping it shows the slim lines again.
      const bs = el('button', 'lx-bsum'); bs.type = 'button'; bs.dataset.label = b.label; bs.setAttribute('aria-expanded', 'false');
      bs.addEventListener('click', () => { blk.classList.toggle('peek'); bs.setAttribute('aria-expanded', String(blk.classList.contains('peek'))); }); blk.append(bs);
      const list = el('ul', 'ck-list lx-list'); blk.append(list);
      for (const e of m.ex.filter((x) => x.block === b.block)) {
        const gt = gate(e); const ew = exWhere(e);
        const row = el('li', 'ck-row lx-row' + (gt && gt.off ? ' off' : ''));
        const ok = el('span', 'lx-ok'); ok.dataset.ok = e.ex;
        const main = el('span', 'ck-row-main'); main.append(mk('span', 'ck-row-t', e.name, 'coach', 'name', ew), mk('span', 'ck-row-s lx-dose', doseTxt(e), 'coach', null, ew, 'dose'));
        if (gt && gt.off) main.append(el('span', 'ck-chip lx-offchip', 'Not this phase')); // a dimmed leg lift says so in a word, read with the row (the dimming is ink, not opacity)
        const end = el('span', 'ck-row-end'); end.append(ok);
        row.append(mk('span', 'lx-id', e.ex, 'coach', 'ex', ew), main, end);
        if (gt) { const tg = mk('div', 'lx-gate' + (gt.off ? '' : ' ok'), gt.t, 'coach', null, 'kind=lift_phase&routine=' + e.routine + '&mode=upper', 'phase-gate'); row.append(tg); }
        const last = lastBefore(e.id || e.ex, date); const h = gt ? null : hint(e, last, mode);
        // two short lines (the athlete, Nov 5, point 4): "Last Oct 30 · +5×8, +5×6", then the next step as a chip "Next · same load, aim for 8"
        if (last) {
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
          const prev = last && last.sets[i] ? last.sets[i] : null; const mine = cur[i] || {};
          if (hasLoad(e)) {
            const w = el('input', 'ck-input lx-in'); w.type = 'number'; w.inputMode = 'decimal'; w.step = 'any'; w.min = '0'; w.dataset.ex = e.ex; w.dataset.i = i; w.dataset.f = 'lb';
            w.placeholder = prev && N(prev.lb) !== null ? String(prev.lb) : (e.load === 'lb_added' ? '+lb' : 'lb'); w.setAttribute('aria-label', `${e.name} set ${i + 1} ${e.load === 'lb_added' ? 'added lb' : 'lb'}`);
            if (N(mine.lb) !== null) w.value = mine.lb; g.append(w);
          }
          const r = el('input', 'ck-input lx-in'); r.type = 'number'; r.inputMode = 'numeric'; r.step = '1'; r.min = '0'; r.dataset.ex = e.ex; r.dataset.i = i; r.dataset.f = 'reps';
          r.placeholder = prev && N(prev.reps) !== null ? String(prev.reps) : (e.unit === 's' ? 'sec' : 'reps'); r.setAttribute('aria-label', `${e.name} set ${i + 1} ${e.unit === 's' ? 'seconds' : 'reps'}`);
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
        const acts = el('div', 'lx-acts'); acts.append(add, sk, fin);
        const sum = el('button', 'lx-sum'); sum.type = 'button'; sum.setAttribute('aria-label', `Edit ${e.name}`);
        sum.addEventListener('click', () => markDone(e, row, false));
        row.dataset.ex = e.ex; row.append(sets, acts, sum); list.append(row);
        if (doneSet.has(e.ex)) fold(e, row, true);
      }
      box.append(blk);
    }
    rpeSel = saved && N(saved.rpe) !== null ? String(saved.rpe) : null;
    paintRpe(); $('l-note').value = saved ? saved.note || '' : '';
    finBtn(!restored && stored && stored.finished_at);
    paintTicks(m); paintSkips();
    if (restored) { bar('Restored sets kept on this phone. Saving…', 'kept'); status(''); schedule(0); }
    else if (stored) { status('Saved ' + fWD(stored.date) + (stored.saved_at ? ', ' + stamp(stored.saved_at) : ''), 'ok'); bar('All sets saved · ' + stamp(stored.saved_at), 'ok'); }
    else { status(db ? (date === TODAY ? 'Not logged yet' : 'Nothing logged ' + fWD(date)) : (loaded ? '' : 'Loading…')); bar(db ? 'Sets save as you type.' : (loaded ? 'Saving is not available in this view.' : '')); }
  }

  function renderStatic(m) {
    const r = m.routine; const rw = 'kind=lift_routine&routine=' + r.routine;
    $('l-name').textContent = r.name; $('l-sub').textContent = r.subtitle || '';
    // the routine chips: the same four facts, each marked with its field
    $('l-chips').replaceChildren(...[[`${r.per_week}× / week`, 'per_week'], [`~${r.minutes} min`, 'minutes'], [r.days || r.when, r.days ? 'days' : 'when'], [r.rir, 'rir']].filter((x) => x[0]).map(([t, f]) => mk('span', 'ck-chip', t, 'coach', f, rw)));
    $('l-chips').classList.remove('dash-skeleton');
    const ph = phaseAt(m, TODAY); const pn = $('l-phasenow'); pn.hidden = !ph;
    if (ph) { const pw = `kind=lift_phase&routine=${ph.routine}&label=${encodeURIComponent(ph.label)}`; const w = el('span', 'ck-notice-w'); w.append(icon('info'), mk('span', null, ph.label, 'coach', 'label', pw)); pn.replaceChildren(w, mk('p', 'ck-notice-t', ph.text, 'coach', 'text', pw)); }
    $('l-phases').hidden = !m.phases.length;
    $('l-phases').replaceChildren(...m.phases.map((p) => { const pw = `kind=lift_phase&routine=${p.routine}&label=${encodeURIComponent(p.label)}`; const on = ph && p === ph; const d = el('li', 'ck-row lx-phaserow'); if (on) d.dataset.key = 'now';
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

  function renderProgress(m) {
    const body = $('l-progbody'); const n = logs.size;
    $('l-progn').textContent = n ? `${n} session${n === 1 ? '' : 's'} logged` : '';
    // shared states: loading until the store answers, empty before the first saved session (same sentence as before)
    if (!n) { cardState($('l-prog'), loaded ? 'empty' : 'loading', 'Your sets show here after the first saved session, with the next step for each lift.'); return; }
    cardState($('l-prog'), null);
    const mode = (phaseAt(m, TODAY) || {}).mode || 'normal';
    // one tile per exercise: the latest top set (heaviest load, then most reps, as before), the best top set of the earlier
    // sessions, and the comparison word with its trend glyph; then the last four sessions, the next step and any stall note
    const ul = el('ul', 'lx-prog');
    const rank = (st) => [N(st.lb) ?? 0, N(st.reps) ?? 0];
    const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
    for (const e of m.ex) {
      const h = history(e.id || e.ex); const ew = exWhere(e); const li = el('li', 'ck-tile lx-ptile');
      const head = el('div', 'ck-tile-head'); const lab = el('span', 'ck-tile-label'); lab.append(mk('span', 'lx-id', e.ex, 'coach', 'ex', ew), ' ', mk('span', null, e.name, 'coach', 'name', ew)); head.append(lab); li.append(head);
      if (!h.length) { li.append(el('p', 'ck-note', 'Not logged yet')); ul.append(li); continue; }
      const topSet = (x) => [...x.sets].sort((a, b) => ((N(b.lb) ?? 0) - (N(a.lb) ?? 0)) || ((N(b.reps) ?? 0) - (N(a.reps) ?? 0)))[0];
      const topOf = (x) => setTxt(e, topSet(x));
      const lastS = h[h.length - 1], earlier = h.slice(0, -1);
      const best = earlier.length ? earlier.reduce((acc, x) => (cmp(rank(topSet(x)), rank(topSet(acc))) > 0 ? x : acc), earlier[0]) : null;
      const fig = el('p', 'lx-pfig'); fig.append(mk('span', 'ck-big lx-pv', topOf(lastS), null, null, null, 'store:lift_log/' + lastS.date + ' top set'), mk('span', 'ck-unit', fD(lastS.date), null, null, null, 'store:lift_log/' + lastS.date + ' date')); li.append(fig);
      if (best) {
        const c = cmp(rank(topSet(lastS)), rank(topSet(best))); const word = c > 0 ? 'better' : c < 0 ? 'lower' : 'same';
        const vs = el('p', 'ck-sub lx-pvs'); const w = el('span', 'lx-cmp'); w.dataset.c = word; w.append(icon(c > 0 ? 'trend-up' : c < 0 ? 'trend-down' : 'trend-flat'), mk('span', null, word, null, null, null, 'compare-top-set'));
        vs.append(w, c === 0 ? ' as the earlier best ' : ' than the earlier best ', mk('b', null, topOf(best), null, null, null, 'store:lift_log/' + best.date + ' top set'), ' ', mk('span', null, '(' + fD(best.date) + ')', null, null, null, 'store:lift_log/' + best.date + ' date')); li.append(vs);
      } else li.append(el('p', 'ck-sub lx-pvs', 'First session logged'));
      // the last four sessions, one step each, so the chain wraps between sessions and never mid-session (point 4)
      const hl = mk('ol', 'lx-phist', null, null, null, null, 'store:lift_log last four sessions'); hl.setAttribute('aria-label', 'Last sessions, oldest first');
      for (const x of h.slice(-4)) { const st = el('li'); st.append(el('span', null, fD(x.date)), ' ', el('b', null, topOf(x))); hl.append(st); }
      li.append(hl);
      const hn = hint(e, lastS, mode); if (hn) { const nx = mk('p', 'lx-nx' + (hn.up ? ' up' : ''), null, 'coach', null, ew, 'next-step'); if (hn.up) nx.append(icon('trend-up')); nx.append(el('span', null, hn.t)); li.append(nx); }
      const hr = m.hist.get(e.id); if (hr && (hr.gap || hr.stalled) && hr.note) li.append(mk('p', 'ck-sub', hr.note, 'coach', 'note', 'kind=lift_hist&id=' + e.id));
      ul.append(li);
    }
    body.replaceChildren(ul);
  }

  function collect(m) {
    const sets = {};
    for (const e of m.ex) {
      const arr = [];
      const nIn = document.querySelectorAll(`#l-ex input[data-ex="${e.ex}"][data-f="reps"]`).length;
      for (let i = 0; i < nIn; i++) {
        const q = (f) => { const x = document.querySelector(`#l-ex input[data-ex="${e.ex}"][data-i="${i}"][data-f="${f}"]`); return x ? N(x.value) : null; };
        const reps = q('reps'), lb = hasLoad(e) ? q('lb') : null;
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
      sl.append(e.name + ' · ', el('b', null, has ? st.map((x) => setTxt(e, x)).join(', ') : 'Skipped'));
    }
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
  const snap = (m) => ({ date, sets: collect(m), rpe: N(rpeSel), note: $('l-note').value.trim(), done: [...doneSet], skipped: [...skipSet].filter((k) => doneSet.has(k) && !collect(m)[k]), at: new Date().toISOString() });
  // Any edit: keep a copy on this phone right away, then save to the store after a short pause.
  function edited() {
    const m = model(); if (!m || !db) return;
    const v = snap(m); draftPut(date, v); finBtn(false); paintTicks(m); paintSkips(); bar('Saving…'); schedule(DELAY);
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
    const fin = finish ? at : (prevDoc && prevDoc.finished_at) || null;
    const doc = { date: d, routine: m.routine.routine, routine_name: m.routine.name, sets: v.sets, ids, rpe: v.rpe, activity_id: g ? id : null, minutes: mins, note: v.note, done: v.done, skipped: v.skipped, saved_at: at, finished_at: fin };
    try {
      await db.doc('lift_log/' + d).set(doc); logs.set(d, doc); draftDrop(d, at);
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
        if (finish) finBtn(true);
      }
      renderProgress(m);
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
    const fresh = (p) => p.status === 'proposed' || (p.decided_on && dayN(TODAY) - dayN(p.decided_on) <= 14) || choices.has(p.block_key);
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
    st.textContent = decided === 'accept' ? (p.status === 'applied' ? 'In your routine now.' : `Saved: the new exercises start ${fD(p.start)}.`)
      : decided === 'keep' ? 'Saved: your routine stays as it is.' : 'Your logged sets stay with each exercise either way, so a lift that comes back is compared with its own best.';
    const pick = async (choice) => {
      if (!db) { st.textContent = 'Saving is not available in this view; reply to the check-in instead.'; return; }
      const doc = { block_key: p.block_key, choice, swaps: swaps.map((s) => s.ex), saved_at: new Date().toISOString() };
      try { await db.doc('lift_choice/' + p.block_key).set(doc); choices.set(p.block_key, doc); renderRotation(m); }
      catch (e) { st.textContent = `Not saved (${e && e.code ? e.code : 'error'}). Reply to the check-in instead.`; }
    };
    bA.onclick = () => pick('accept'); bK.onclick = () => pick('keep');
  }

  function renderLifts() {
    const m = model();
    // shared states (Cockpit ck-state) on every card: loading until the routine and the store have answered, error when the
    // coach data failed (your logged sets stay in the store and on this phone), empty when there is no lift routine yet
    if (!m) { const d = dash.data('coach'); const st = d.status === 'ok' ? 'empty' : d.status === 'error' || d.status === 'missing' ? 'error' : 'loading';
      exState(st, st === 'error' ? 'The lift routine did not load. Your logged sets are safe in your log and on this phone.' : 'The lift routine appears here after the next morning rebuild.');
      cardState($('l-prog'), st, st === 'error' ? 'The lift routine did not load. Your logged sets are safe.' : 'Progress shows once there is a routine.');
      cardState($('l-rules'), st, st === 'error' ? 'The rules did not load.' : 'The rules come with the routine.'); $('l-rot').hidden = true; return; }
    legacy = m.routine.legacy_ids || {};
    renderStatic(m); renderRotation(m);
    const key = JSON.stringify([m.ex, m.phases, date, loaded]);
    if (key !== builtKey) { if (builtKey && db) { const v = snap(m); if (Object.keys(v.sets).length || v.note) draftPut(date, v); } builtKey = key; build(m); }
    $('l-rot').setAttribute('aria-busy', String(!loaded)); // the rotation choice is read from the store: busy until it answers
    renderProgress(m);
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
      const last = lastBefore(e.id || e.ex, date); if (!last) continue;
      last.sets.forEach((st, i) => {
        for (const f of ['lb', 'reps']) { const x = document.querySelector(`#l-ex input[data-ex="${e.ex}"][data-i="${i}"][data-f="${f}"]`); if (x && N(st[f]) !== null && x.value === '') x.value = st[f]; }
      });
    }
    status(''); edited(); bar('Copied last session; edit what changed. Saving…');
  });
  dash.onData(() => { if (window.CX.state && window.CX.state.page === 'lifts') renderLifts(); });

  (async () => {
    try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (db) {
      try { const q = await db.collection('lift_log').get(); logs = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, { date: x.id, ...x.data() }])); }
      catch (e) { status('Could not load your sets.', 'err'); }
      try { const q = await db.collection('lift_choice').get(); choices = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); } catch (e) { choices = new Map(); }
    }
    loaded = true; builtKey = '';
    if (window.CX.state && window.CX.state.page === 'lifts') renderLifts();
  })();
})();
