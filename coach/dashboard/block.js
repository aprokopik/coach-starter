// block.js: the This block card at the top of the Fitness tab (the athlete, Nov 1, 2026). The current block's brief; since Nov 5, 2026
// the next block's brief sits behind a This block / Next selector, never in its place. Why the block exists, its focus KPIs
// with progress toward their goals, the feedback points, and the full brief (goal, how, why, success, what it takes). Rows from coach/tools/brief.py (coach dataset kinds brief, brief_kpi, brief_point);
// progress fields p_* are computed in the morning run, the same numbers the check-in uses. Rules: coach/engine/BLOCK-BRIEF.md.
(() => {
  const CX = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const N = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
  const fd = (s) => new Date(day(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  let openFull = false;
  try { openFull = localStorage.getItem('cx-brief-open') === '1'; } catch (e) { /* per-viewer convenience only */ }

  // Cockpit parts (Phase 5, Fitness): CX.ck holds the shared icon, badge, mark and card-state helpers from app.js. The same card
  // renders on Fitness (#b-card, with the shared states) and inside Season's Current block panel (#r-block, no state slot).
  // Every figure is marked from its brief, brief_kpi or brief_point row. A focus KPI's progress state is a status badge:
  // on track and target reached are Good, behind is Watch, no reading is Unknown (words unchanged). Not started is a normal
  // state, not an unknown one: its own word in the neutral chip (no glyph, no hidden state word), as Today shows Low and Typical.
  const P_ST = { 'on track': 'good', 'target reached': 'good', behind: 'watch', 'not started': 'plain', 'no reading': 'unknown' };
  // Phase 6 round 5 (the athlete, Nov 5, 2026): the card always leads with THIS block (the plan's block row covering today), never
  // silently with the next one. While a brief for a later block is near (starts within 21 days) or proposed, a two-option
  // segmented control under the head ("This block" / "Next · <block>") shows that brief; a proposed one carries the decision:
  // Accept as proposed, or I want changes with a one-line note. The tap mirrors the Lifts rotation tap: store collection
  // brief_choice, doc <block_key> = { block_key, choice: 'accept' | 'change', note, saved_at }; the morning run records it
  // with brief.py accept|change <block_key> --by dashboard (RUNBOOK step 4). The selected option is page state only.
  const NEXT_DAYS = 21;
  const views = {}; // card id -> 'this' | 'next'
  let db = null, choices = new Map(), loaded = false, asking = null, draft = '', saving = false, msg = '';
  const isCur = (b) => b.is_current === true || b.is_current === 'true';
  const fdT = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const DAY = 864e5;
  function renderBlock(target) {
    const card = target || $('b-card'); if (!card || !CX.kind) return;
    const ck = CX.ck || {}; const mk = ck.mark || ((e) => e);
    const body = card.querySelector(':scope > [data-body]') || card;
    // the shared states wherever the card has a state slot (Fitness #b-card; Season #r-block since Phase 5)
    const slotted = !!card.querySelector(':scope > [data-slot]');
    if (slotted && ck.dsState) { const st = ck.dsState('coach'); if (st) { card.hidden = false; ck.cardState(card, st, st === 'error' ? 'The block brief did not arrive. Nothing saved is lost.' : ''); return; } }
    const T = todayIso();
    const briefs = CX.kind('brief').slice().sort((x, y) => (x.start < y.start ? -1 : 1));
    const blk = CX.kind('block').find((x) => x.start <= T && T <= x.end) || null;
    const curB = briefs.find((b) => isCur(b) || (blk && b.block_key === blk.key)) || null;
    const later = briefs.filter((b) => b !== curB && b.start > T);
    const nextB = later.find((b) => (day(b.start) - day(T)) / DAY <= NEXT_DAYS || b.status === 'proposed') || null;
    const NONE = 'No block brief yet: the coach writes one before each training block starts.';
    if (!blk && !curB && !nextB) { if (target && slotted && ck.cardState) ck.cardState(card, 'empty', NONE); else if (target) card.replaceChildren(el('p', 'ck-note', NONE)); else card.hidden = true; return; }
    if (slotted && ck.cardState) ck.cardState(card, null);
    const cid = card.id || 'b-card'; const view = nextB && views[cid] === 'next' ? 'next' : 'this';
    const f = (txt, field, where, derived) => mk(el('span', null, txt), 'coach', field, where, derived);
    const again = () => renderBlock(target);
    card.hidden = false; body.replaceChildren();
    const pane = el('div', 'bk-pane'); pane.id = cid + '-pane';

    const seg = () => { // radio semantics like #t-bounds: native radios in a ck-seg, 44 px options
      const fs = el('fieldset', 'ck-seg bk-seg'); fs.append(el('legend', 'ck-vh', 'Show this block or the next one'));
      const nw = 'kind=brief&block_key=' + nextB.block_key, nbl = CX.kind('block').find((x) => x.key === nextB.block_key);
      for (const [v, lab] of [['this', ['This block']], ['next', ['Next · ', nbl && nbl.short ? f(nbl.short, 'short', 'kind=block&key=' + nbl.key) : f(nextB.block, 'block', nw)]]]) {
        const l = el('label', 'ck-seg-opt'); const inp = el('input', 'ck-vh-input'); inp.type = 'radio'; inp.name = cid + '-view'; inp.value = v; inp.id = cid + '-v-' + v;
        inp.checked = view === v; inp.setAttribute('aria-controls', pane.id);
        inp.addEventListener('change', () => { if (!inp.checked) return; views[cid] = v; again(); const n = $(inp.id); if (n) n.focus(); });
        const t = el('span'); t.append(...lab); l.append(inp, t);
        if (v === 'next') { const c = f(nextB.status === 'proposed' ? 'Proposed' : nextB.status === 'closed' ? 'Closed' : 'Live', null, nw, 'status'); c.className = 'bk-seg-chip'; l.append(c); }
        fs.append(l);
      }
      return fs;
    };

    // This block without a brief (a recovery or taper block, or no brief written): name, dates and one line; no fallback
    if (view === 'this' && !curB) {
      const head = el('div', 'bk-head'), t = el('div', 'bk-title'), eb = el('span', 'ck-eyebrow'), lead = el('p', 'ck-sub bk-lead');
      if (blk) {
        const bkw = 'kind=block&key=' + blk.key, s = day(blk.start), weeks = Math.max(1, Math.round((day(blk.end) - s + DAY) / 7 / DAY)), wk = Math.min(weeks, Math.floor((day(T) - s) / 7 / DAY) + 1);
        eb.append('This block · week ', f(String(wk), null, bkw, 'block-week'), ' of ', f(String(weeks), null, bkw, 'block-weeks'));
        lead.append(f(blk.label, 'label', bkw), ' · ', f(blk.name, 'name', bkw));
        t.append(eb, el('h2', 'ck-h2 bk-name', 'This block’s KPIs'), lead); head.append(t); body.append(head);
        if (nextB) body.append(seg());
        const dl = el('p', 'ck-sub bk-dates'); dl.append(f(fd(blk.start), null, bkw, 'date'), ' – ', f(fd(blk.end), null, bkw, 'date'));
        const nb = later[0], note = el('p', 'ck-note bk-none');
        const kindW = /recover/i.test(blk.phase || '') ? 'a recovery block' : /taper/i.test(blk.phase || '') ? 'a taper block' : 'no brief was written for it';
        if (nb) note.append('No focus KPIs for ', f(blk.label, 'label', bkw), ': ', f(kindW, null, bkw, 'phase'), '; briefs start with ', f(nb.block, 'block', 'kind=brief&block_key=' + nb.block_key), '.');
        else note.append(NONE);
        pane.append(dl, note);
      } else {
        eb.append('This block'); lead.append('No training block covers today.');
        t.append(eb, el('h2', 'ck-h2 bk-name', 'This block’s KPIs'), lead); head.append(t); body.append(head);
        if (nextB) body.append(seg());
      }
      body.append(pane); return;
    }

    const b = view === 'next' ? nextB : curB; const cur = view === 'this';
    const kpis = CX.kind('brief_kpi').filter((k) => k.block_key === b.block_key).sort((x, y) => N(x.rank) - N(y.rank));
    const pts = CX.kind('brief_point').filter((p) => p.block_key === b.block_key).sort((x, y) => (x.date < y.date ? -1 : 1));
    const bw = 'kind=brief&block_key=' + b.block_key;

    const head = el('div', 'bk-head');
    const t = el('div', 'bk-title');
    const eb = el('span', 'ck-eyebrow');
    if (cur) eb.append('This block · week ', f(String(b.week), 'week', bw), ' of ', f(String(b.weeks), 'weeks', bw)); else eb.append('Next block · starts ', f(fd(b.start), null, bw, 'date'));
    // Phase 6 (the athlete, Nov 5, 2026): the card names what it holds, the block's focus KPIs; the block name moves to the subline.
    // The count word follows the brief_kpi rows (derived), so a block with two or four focus KPIs reads right.
    const h = el('h2', 'ck-h2 bk-name', cur ? 'This block’s KPIs' : 'Next block’s KPIs');
    const lead = el('p', 'ck-sub bk-lead'); const nw = ['no', 'one', 'two', 'three', 'four', 'five', 'six'][kpis.length] || String(kpis.length);
    lead.append(kpis.length ? 'The ' : 'No focus KPIs yet in ', ...(kpis.length ? [f(nw, null, 'kind=brief_kpi&block_key=' + b.block_key, 'count'), ' to move in '] : []), f(b.block, 'block', bw), ' · ', f(b.name, 'name', bw));
    t.append(eb, h, lead);
    head.append(t);
    const st = el('span', 'ck-chip bk-status', b.status === 'proposed' ? 'Proposed' : b.status === 'closed' ? 'Closed' : 'Live');
    st.title = b.status === 'proposed' ? `Answer below or in the check-in; it goes live ${fd(b.decide_by || b.start)} if unanswered` : '';
    head.append(st);
    body.append(head);
    if (nextB) body.append(seg());
    { const dl = el('p', 'ck-sub bk-dates'); dl.append(f(fd(b.start), null, bw, 'date'), ' – ', f(fd(b.end), null, bw, 'date')); pane.append(dl); }

    const list = el('ul', 'bk-kpis');
    for (const k of kpis) {
      const kw = `kind=brief_kpi&block_key=${b.block_key}&key=${k.key}`;
      const row = el('li', 'bk-kpi'); row.dataset.sport = CX.sportTok ? CX.sportTok(k.sport) : 'fg-3';
      const top = el('div', 'bk-row'); const tt = el('b', 'bk-kpi-t'); tt.append(f(String(k.rank), 'rank', kw), '. ', f(k.label, 'label', kw)); top.append(tt, f(k.p_now_text || '', 'p_now_text', kw));
      const bar = el('span', 'ck-zone-track bk-bar'); const fill = el('i', 'ck-zone-fill'); const pct = Math.max(0, Math.min(1, N(k.p_pct) || 0)); fill.style.width = Math.round(pct * 100) + '%'; bar.append(fill);
      const exp = N(k.p_expected); if (cur && exp !== null && exp > 0 && exp < 1) { const m = el('span', 'bk-exp'); m.style.left = Math.round(exp * 100) + '%'; m.title = 'Where you would be if progress were even through the block'; bar.append(m); }
      if (window.CKC) window.CKC.describe(bar, `${k.label}: ${Math.round(pct * 100)}% of the block goal${cur && exp !== null && exp > 0 && exp < 1 ? `; even pace would be ${Math.round(exp * 100)}%` : ''}.`, { source: 'coach', where: kw, derived: 'block-progress' });
      const goal = k.key === 'lifts' ? [' goal ', f(String(k.count_target), 'count_target', kw), ' sessions'] : [f((k.goal || '').split(';')[0], null, kw, 'goal-first-clause')];
      const foot = el('div', 'bk-row'); const g = el('span', 'ck-sub bk-goal'); g.append(...goal); foot.append(g);
      if (k.p_state && ck.badge) { const ps = P_ST[k.p_state] || 'unknown', pw = k.p_state.charAt(0).toUpperCase() + k.p_state.slice(1);
        foot.append(mk(ps === 'plain' && ck.neutralChip ? ck.neutralChip(pw, 'bk-state') : ck.badge(ps === 'plain' ? 'unknown' : ps, pw, 'bk-state'), 'coach', null, kw, 'status')); }
      row.append(top, bar, foot); list.append(row);
    }
    pane.append(list);
    if (b.status === 'proposed') pane.append(decide(b, bw, f, mk, again, cid));

    if (pts.length) {
      const tl = el('ol', 'bk-steps');
      for (const p of pts.filter((x) => x.type !== 'sunday')) { const li = el('li', p.date < T ? 'is-done' : p.date === T ? 'is-now' : ''); const pw = `kind=brief_point&block_key=${b.block_key}&date=${p.date}`; li.append(f(p.label, 'label', pw), f(fd(p.date), null, pw, 'date')); if (p.date === T) li.setAttribute('aria-current', 'date'); tl.append(li); }
      pane.append(tl);
      pane.append(el('p', 'ck-note', 'Plus one line per focus KPI in every Sunday check-in.'));
    }

    const det = el('details', 'bk-full'); det.open = openFull;
    det.addEventListener('toggle', () => { openFull = det.open; try { localStorage.setItem('cx-brief-open', det.open ? '1' : '0'); } catch (e) { /* ignore */ } });
    const sm = el('summary', 'ck-disc bk-sum'); sm.append(el('span', null, 'Full brief: what, how, why, what it takes')); if (ck.icon) sm.append(ck.icon('chevron', 'ck-chev')); det.append(sm);
    if (b.why) { const w = el('p', 'bk-why'); w.append(el('b', null, 'Why this block. '), f(b.why, 'why', bw)); det.append(w); }
    for (const k of kpis) {
      const kw = `kind=brief_kpi&block_key=${b.block_key}&key=${k.key}`;
      const sec = el('div', 'bk-sec'); sec.dataset.sport = CX.sportTok ? CX.sportTok(k.sport) : 'fg-3';
      const h3 = el('h3', 'ck-h3'); h3.append('Focus ', f(String(k.rank), 'rank', kw), ' · ', f(k.label, 'label', kw)); sec.append(h3);
      const dl = el('dl');
      for (const [lab, fl] of [['Goal', 'goal'], ['How', 'how'], ['Why', 'why'], ['Success', 'success'], ['It takes', 'needs'], ['Outcome', 'outcome']]) { if (!k[fl]) continue; const dd = el('dd'); dd.append(f(k[fl], fl, kw)); dl.append(el('dt', null, lab), dd); }
      sec.append(dl); det.append(sec);
    }
    if (b.measured) { const m = el('p', 'ck-note'); m.append(el('b', null, 'Measured, not focus. '), f(b.measured, 'measured', bw)); det.append(m); }
    pane.append(det);
    body.append(pane);
  }

  // The decision on a proposed brief, mirroring the Lifts rotation tap. The chosen state comes from the store doc (when it is
  // not older than the brief's set_on: a revised brief asks again) or else the row (change_note set by brief.py change).
  function decide(b, bw, f, mk, again, cid) {
    const box = el('div', 'bk-decide'); box.setAttribute('aria-busy', String(!loaded));
    const by = el('p', 'bk-decide-by'); by.append('Decide by ', f(fd(b.decide_by || b.start), null, bw, 'date'));
    const ch = choices.get(b.block_key), chOk = ch && String(ch.saved_at || '').slice(0, 10) >= String(b.set_on || '') ? ch : null;
    const d = chOk ? { choice: chOk.choice, on: chOk.saved_at, note: chOk.note || '' } : b.change_note ? { choice: 'change', on: b.change_asked_on, note: b.change_note } : null;
    const line = mk(el('p', 'ck-note bk-choice'), 'coach', null, bw, 'choice'); line.setAttribute('role', 'status'); line.id = cid + '-choice'; line.tabIndex = -1;
    if (d) {
      line.textContent = d.choice === 'accept' ? `Accepted ${d.on ? fdT(d.on) : ''} · goes live ${fd(b.start)}` : `Change asked ${d.on ? fdT(d.on) : ''}: ${d.note} · the coach answers in the next check-in`;
      box.append(line); return box;
    }
    box.append(by);
    const off = !db || !loaded || saving;
    const save = async (choice, note) => {
      if (!db) return;
      const doc = { block_key: b.block_key, choice, note: note || '', saved_at: new Date().toISOString() };
      saving = true; msg = ''; again();
      try { await db.doc('brief_choice/' + b.block_key).set(doc); choices.set(b.block_key, doc); asking = null; draft = ''; }
      catch (e) { msg = `Not saved (${e && e.code ? e.code : 'error'}). Try again or reply to the check-in.`; }
      saving = false; again(); const n = $(msg ? cid + '-msg' : cid + '-choice'); if (n) n.focus();
    };
    const row = el('div', 'bk-choose');
    const yes = el('button', 'ck-btn ck-btn--primary ck-btn--sm', 'Accept as proposed'); yes.type = 'button'; yes.disabled = off; yes.onclick = () => save('accept');
    const chg = el('button', 'ck-btn ck-btn--secondary ck-btn--sm', 'I want changes'); chg.type = 'button'; chg.disabled = off;
    const open = asking === b.block_key; chg.setAttribute('aria-expanded', String(open)); chg.setAttribute('aria-controls', cid + '-ask');
    chg.onclick = () => { asking = open ? null : b.block_key; msg = ''; again(); const n = $(cid + (asking ? '-note' : '-chg')); if (n) n.focus(); };
    chg.id = cid + '-chg'; row.append(yes, chg); box.append(row);
    const ask = el('div', 'ck-field bk-ask'); ask.id = cid + '-ask'; ask.hidden = !open;
    if (open) {
      const lab = el('label', 'ck-label', 'What to change'); lab.htmlFor = cid + '-note';
      const inp = el('input', 'ck-input'); inp.id = cid + '-note'; inp.type = 'text'; inp.maxLength = 300; inp.value = draft; inp.disabled = off; inp.autocomplete = 'off';
      inp.addEventListener('input', () => { draft = inp.value; inp.removeAttribute('aria-invalid'); });
      const go = el('button', 'ck-btn ck-btn--secondary', 'Save'); go.type = 'button'; go.disabled = off;
      const send = () => { const v = inp.value.trim(); if (!v) { inp.setAttribute('aria-invalid', 'true'); msg = 'Say what to change first.'; const m = $(cid + '-msg'); if (m) m.textContent = msg; inp.focus(); return; } save('change', v); };
      go.onclick = send; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
      const r = el('div', 'bk-ask-row'); r.append(inp, go); ask.append(lab, r);
    }
    box.append(ask);
    const m = el('p', 'ck-note bk-msg', !db && loaded ? 'Saving needs the live dashboard' : saving ? 'Saving…' : msg); m.id = cid + '-msg'; m.setAttribute('role', 'status'); m.tabIndex = -1; box.append(m);
    return box;
  }
  CX.renderBlock = renderBlock;
  const redraw = () => { if (CX.state && CX.state.page === 'trends') renderBlock(); const p = $('r-p-block'); if (p && !p.hidden) renderBlock($('r-block')); };
  (async () => {
    try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (db) { try { const q = await db.collection('brief_choice').get(); choices = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); } catch (e) { choices = new Map(); } }
    loaded = true; redraw();
  })();

  // Season tabs (the athlete, Nov 2, 2026): Current block, Season so far and Hall of fame in one strip at the top of Season,
  // all collapsed by default; choosing a tab opens its panel, choosing it again folds it away. The open tab is a per-viewer
  // convenience kept in localStorage. Phase 5: the strip is a Cockpit segmented control (native radios, 44 px). Arrow keys
  // move between the three like any radio group; a click, Space or Enter on the one already open folds it away.
  let stOpen = null;
  try { stOpen = localStorage.getItem('cx-season-tab') || null; } catch (e) { /* per-viewer convenience only */ }
  const setSt = (k) => { stOpen = k; try { if (stOpen) localStorage.setItem('cx-season-tab', stOpen); else localStorage.removeItem('cx-season-tab'); } catch (e) { /* ignore */ } renderSeasonTabs(); };
  function renderSeasonTabs() {
    const bar = $('r-st-tabs'); if (!bar) return;
    for (const inp of bar.querySelectorAll('input[type=radio]')) {
      const k = inp.value; const on = stOpen === k; inp.checked = on;
      const panel = $('r-p-' + k); if (panel) panel.hidden = !on;
      if (!inp._wired) {
        inp._wired = true;
        inp.addEventListener('pointerdown', () => { inp._was = inp.checked; });
        inp.parentNode.addEventListener('pointerdown', () => { inp._was = inp.checked; });
        inp.addEventListener('change', () => { if (inp.checked && stOpen !== k) setSt(k); });
        // a click on the open option (pointer, or Space on a focused radio) folds it away
        inp.addEventListener('click', () => { if (inp._was && stOpen === k) { inp._was = false; setSt(null); } inp._was = false; });
        inp.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && stOpen === k) { e.preventDefault(); setSt(null); } else if (e.key === 'Enter' && stOpen !== k) { e.preventDefault(); setSt(k); } });
      }
    }
    $('r-st').classList.toggle('is-open', !!stOpen);
    if (stOpen === 'block') renderBlock($('r-block'));
  }
  CX.renderSeasonTabs = renderSeasonTabs;
  renderSeasonTabs();
})();
