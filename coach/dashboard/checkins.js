// checkins.js: the Check-ins tab (the athlete, Nov 1, 2026). Daily and after-session check-ins are the existing forms (forms.js, moved here);
// this file adds the weekly, monthly, quarterly, home-BP and yearly surveys defined in coach/checkins.json (coach rows ci_survey, ci_q).
// One question at a time, every one skippable; answers save as you go to the store as checkin/<survey>-<period>
// {survey, period, answers, saved_at}. The morning run ingests them (coach/tools/checkins.py) and Health Pillars update then.
(() => {
  const { N, dayN, isoN, monday } = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const DOW = now.getDay(); // 0 Sun … 6 Sat
  const stamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const fD = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  let db = null, docs = new Map(), loaded = false, loadErr = '', morningDone = null, morningSaved = false, liftDays = null;
  const ui = {}; // survey id -> {step, open}
  const timers = {};

  // the data runtime hands nested lists and objects (opts, items, fields, hist, evidence) back as JSON text: parse them once
  const _parsed = new WeakMap();
  const unpack = (x) => { const o = { ...x }; for (const k in o) { const v = o[k]; if (typeof v === 'string' && /^\s*[\[{]/.test(v)) { try { o[k] = JSON.parse(v); } catch (e) { /* plain text */ } } } return o; };
  const rows = () => { const d = dash.data('coach'); if (d.status !== 'ok' || !Array.isArray(d.data)) return null; if (!_parsed.has(d.data)) _parsed.set(d.data, d.data.map(unpack)); return _parsed.get(d.data); };

  // ---------- periods ----------
  function periodOf(sid) {
    const y = now.getFullYear(), m = now.getMonth() + 1;
    if (sid === 'weekly') {
      const thisMon = monday(TODAY), lastMon = isoN(dayN(thisMon) - 7);
      // the week's survey opens Friday; Monday to Thursday the previous week stays open until answered
      if (DOW === 0 || DOW >= 5) return { period: thisMon, label: `week of ${fD(thisMon)}`, next: null };
      if (!docs.has('weekly-' + lastMon)) return { period: lastMon, label: `last week (${fD(lastMon)})`, next: null };
      return { period: lastMon, label: `last week (${fD(lastMon)})`, next: `Opens Friday for the week of ${fD(thisMon)}` };
    }
    if (sid === 'monthly') return { period: `${y}-${pad2(m)}`, label: now.toLocaleDateString(undefined, { month: 'long' }) };
    if (sid === 'quarterly') { const q = Math.ceil(m / 3); return { period: `${y}-Q${q}`, label: `Q${q} ${y}` }; }
    if (sid === 'half') { const h = m <= 6 ? 1 : 2; return { period: `${y}-H${h}`, label: h === 1 ? `Jan–Jun ${y}` : `Jul–Dec ${y}` }; }
    return { period: String(y), label: String(y) };
  }
  const docId = (sid) => `${sid}-${periodOf(sid).period}`;

  // ---------- adaptive question sets ----------
  function questions(sid, Q) {
    let qs = Q.filter((q) => q.survey === sid);
    const weekly = [...docs.values()].filter((d) => d.survey === 'weekly').sort((a, b) => (a.period < b.period ? 1 : -1));
    const alc = weekly.map((d) => N((d.answers || {}).alcohol)).filter((v) => v !== null);
    const quietAlc = alc.length >= 8 && alc.slice(0, 8).every((v) => v === 0); // 8 weeks of 0: ask monthly instead
    const yearly = [...docs.values()].filter((d) => d.survey === 'yearly' || d.survey === 'monthly').sort((a, b) => ((a.saved_at || '') < (b.saved_at || '') ? 1 : -1));
    const nic = (yearly.find((d) => (d.answers || {}).nicotine) || { answers: {} }).answers.nicotine;
    if (sid === 'weekly' && quietAlc) qs = qs.filter((q) => q.id !== 'alcohol');
    if (sid === 'monthly') {
      const extra = [];
      if (quietAlc) { const a = Q.find((q) => q.id === 'alcohol'); if (a) extra.push({ ...a, survey: 'monthly', q: 'About how many drinks a week this month?', order: 0.5 }); }
      if (nic === 'current') { const n = Q.find((q) => q.id === 'nicotine'); if (n) extra.push({ ...n, survey: 'monthly', q: 'Still using nicotine?', order: 0.6 }); }
      qs = [...extra, ...qs];
    }
    return qs.sort((a, b) => a.order - b.order);
  }

  const answered = (q, a) => {
    const v = a[q.id];
    if (v === undefined || v === null || v === '') return false;
    if (Array.isArray(v)) return true;
    if (typeof v === 'object') return Object.values(v).some((x) => x !== null && x !== '' && x !== undefined);
    return true;
  };

  // ---------- save ----------
  function save(sid, survey) {
    const id = docId(sid); const cur = docs.get(id) || { survey: sid, period: periodOf(sid).period, answers: {} };
    cur.saved_at = new Date().toISOString(); docs.set(id, cur);
    // the card's status line, found when it is written: an answer that moves to the next question redraws the card
    const line = (text, cls, iso) => { const st = $('ci-st-' + sid); if (st) window.CX.ciStatus(st, text, cls, iso); };
    line('Saving…');
    clearTimeout(timers[sid]);
    timers[sid] = setTimeout(() => {
      if (!db) { line('Not saved: the store is not available here', 'err'); return; }
      db.doc('checkin/' + id).set({ survey: cur.survey, period: cur.period, answers: cur.answers, saved_at: cur.saved_at, ...(cur.finished ? { finished: true } : {}) })
        .then(() => { line('Saved ' + new Date(cur.saved_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), 'ok', cur.saved_at); renderStrip(); refreshDue(); })
        .catch((e) => { line(`Not saved (${e && e.code ? e.code : 'error'})`, 'err'); });
    }, 700);
  }

  // ---------- one question ----------
  // ---------- what the record already holds for a weekly "extra sessions" question ----------
  const EXTRA = { str_extra: 'strength', sauna_extra: 'sauna' };
  function recorded(kind, mon) {
    const end = isoN(dayN(mon) + 6); const items = new Map();
    const d = dash.data('activities'); const ok = d.status === 'ok' && Array.isArray(d.data);
    if (ok) {
      for (const x of d.data) {
        const day = String(x.local_start || '').slice(0, 10); if (day < mon || day > end) continue;
        const hit = kind === 'sauna' ? /sauna/i.test(String(x.name || '')) : /strength/i.test(String(x.type || ''));
        if (!hit) continue;
        const min = N(x.duration_min); const it = items.get(day) || { day, parts: [], src: [] };
        it.parts.push(`${kind === 'sauna' ? 'Sauna' : x.name || 'Strength'}${min ? `, ${Math.round(min)} min` : ''} (watch)`); it.src.push({ aid: x.activity_id, min, name: kind === 'sauna' ? null : x.name }); items.set(day, it);
      }
    }
    if (kind === 'strength' && liftDays) for (const day of liftDays) if (day >= mon && day <= end) { const it = items.get(day) || { day, parts: [], src: [] }; it.parts.push('Lifts log'); it.src.push({ lift: day }); items.set(day, it); }
    return { ok: ok && (kind !== 'strength' || liftDays !== null), list: [...items.values()].sort((p, q) => (p.day < q.day ? -1 : 1)), end };
  }
  // Cockpit parts (app.js window.CX.ck) and marks: every figure names its row (data-source, data-field, data-where) or says
  // how it was made (data-derived) or which held rule it is (data-rule).
  const { icon, badge, neutralChip, mark, ruleSpan, cardState } = window.CX.ck;
  const mk = (tag, cls, txt, src, field, where, derived) => mark(el(tag, cls, txt), src, field, where, derived);
  const SQ = (sid) => 'kind=ci_survey&id=' + sid;
  const QQ = (q) => 'kind=ci_q&id=' + q.id + (q.survey ? '&survey=' + q.survey : '');
  const QW = (q) => (q.order % 1 ? null : QQ(q)); // the monthly follow-ups (order 0.5, 0.6) reuse a row from another survey
  function recordedBox(kind, mon) {
    const r = recorded(kind, mon); const box = el('div', 'ci-rec'); mark(box, 'activities', null, null, 'recorded');
    const what = kind === 'sauna' ? 'sauna sessions' : 'strength or mobility sessions';
    const h = el('p', 'ci-rec-h'); const n = r.list.length;
    h.append('Already recorded ', mk('span', null, `${fD(mon)}–${fD(r.end)}`, null, null, null, 'week-range'), ': ', n ? mk('span', null, `${n} ${n === 1 ? what.replace('sessions', 'session') : what}`, 'activities', null, null, 'count') : 'none');
    box.append(h);
    if (n) {
      const ul = el('ul', 'ci-rec-l');
      for (const it of r.list) {
        const li = el('li'); li.append(mk('span', null, new Date(it.day + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }), 'activities', null, null, 'formatted'), ': ');
        it.parts.forEach((t, i) => {
          const sv = it.src[i]; if (i) li.append(' + ');
          if (sv.lift) { li.append(mk('span', null, t, null, null, null, 'store:lift_log/' + sv.lift)); return; }
          const w = 'activity_id=' + sv.aid; const part = mk('span', null, null, 'activities', null, w);
          part.append(sv.name === null ? 'Sauna' : sv.name ? mk('span', null, sv.name, 'activities', 'name', w) : 'Strength');
          if (sv.min) part.append(', ', mk('span', null, String(Math.round(sv.min)), 'activities', 'duration_min', w), ' min');
          part.append(' (watch)'); li.append(part);
        });
        ul.append(li);
      }
      box.append(ul);
    }
    if (!r.ok) box.append(el('p', 'ck-note', 'Still loading the watch record…'));
    box.append(el('p', 'ck-note', n ? 'Count only sessions that are not on this list.' : 'Nothing on the watch' + (kind === 'strength' ? ' or the Lifts log' : '') + ' this week, so count every session you did.'));
    return box;
  }

  // a choice group: radios in a ck-choices fieldset (one row for up to five short words, else wrapped), a tap on the chosen
  // one clears it; a pointer tap or Space on a new choice moves on (as before), the arrow keys only move the choice
  let lastKey = '';
  document.addEventListener('keydown', (e) => { lastKey = e.key; }, true);
  document.addEventListener('pointerdown', () => { lastKey = ''; }, true);
  function choiceGroup(name, legend, opts, cur, pick, where) {
    const row = opts.length <= 5 && opts.every(([, l]) => String(l).length <= 10);
    const fs = el('fieldset', 'ck-choices ' + (row ? 'ck-choices--row' : 'ci-wrap')); mark(fs, 'coach', null, where, where ? 'options' : null);
    if (!where) fs.setAttribute('data-rule', 'checkins.js questions(): a monthly follow-up of a weekly or yearly question');
    const lg = el('legend', 'ck-label' + (legend.vh ? ' ck-vh' : ''), legend.text); fs.append(lg);
    let sel = cur;
    for (const [v, lab] of opts) {
      const l = el('label', 'ck-choice'); const inp = el('input', 'ck-vh-input'); inp.type = 'radio'; inp.name = name; inp.value = String(v); inp.dataset.v = String(v);
      inp.checked = sel !== undefined && sel !== null && String(sel) === String(v);
      if (window.CX.radioKey) inp.addEventListener('keydown', window.CX.radioKey);
      inp.addEventListener('click', () => {
        sel = sel !== null && sel !== undefined && String(sel) === String(v) ? null : v;
        for (const x of fs.querySelectorAll('input')) x.checked = x === inp && sel !== null;
        pick(sel, !/^Arrow/.test(lastKey));
      });
      const bx = el('span', 'ck-choice-box'); if (row) bx.append(icon('check')); l.append(inp, bx, String(lab)); fs.append(l);
    }
    return fs;
  }

  function qView(sid, q, a, onChange, period) {
    const box = el('div', 'ci-q'); const W = QW(q);
    const h = mk('h3', 'ck-h3 ci-qh', q.q, 'coach', W ? 'q' : null, W); if (!W) h.setAttribute('data-rule', 'checkins.js questions(): the monthly wording'); h.tabIndex = -1; h.id = `ci-${sid}-qh`; box.append(h);
    if (q.hint) box.append(mk('p', 'ck-note', q.hint, 'coach', W ? 'hint' : null, W));
    if (sid === 'weekly' && EXTRA[q.id] && period) box.append(recordedBox(EXTRA[q.id], period));
    if (q.type === 'choice') box.append(choiceGroup(`ci-${sid}-${q.id}`, { text: q.q, vh: true }, q.opts, a[q.id], (v, go) => { a[q.id] = v; onChange(v !== null && go); }, W));
    else if (q.type === 'number' || q.type === 'numbers' || q.type === 'date') {
      const fields = q.type === 'numbers' ? q.fields : [[q.id, '', q.unit || '', q.min, q.max, q.step]];
      const grid = el('div', 'ci-nums'); mark(grid, 'coach', null, W, 'fields');
      for (const [fid, lab, unit, lo, hi, step] of fields) {
        const lb = el('label', 'ck-field ci-num'); const inp = el('input', 'ck-input'); inp.id = `ci-${sid}-${q.id}-${fid}`;
        if (q.type === 'date') { inp.type = 'date'; inp.max = TODAY; inp.value = a[q.id] || ''; }
        else { inp.type = 'number'; inp.inputMode = 'decimal'; if (lo !== undefined) inp.min = lo; if (hi !== undefined) inp.max = hi; if (step) inp.step = step; const cur = q.type === 'numbers' ? (a[q.id] || {})[fid] : a[q.id]; inp.value = cur === undefined || cur === null ? '' : cur; }
        inp.setAttribute('aria-label', lab || q.q);
        const err = el('span', 'ck-err'); err.id = inp.id + '-e'; err.hidden = true;
        inp.addEventListener('change', () => {
          let v = q.type === 'date' ? inp.value || null : inp.value === '' ? null : N(inp.value);
          if (v !== null && q.type !== 'date' && ((lo !== undefined && v < lo) || (hi !== undefined && v > hi))) {
            inp.setCustomValidity(`Between ${lo} and ${hi}`); inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', err.id);
            err.replaceChildren(icon('act'), 'Between ', mk('span', null, String(lo), null, null, null, 'field-min'), ' and ', mk('span', null, String(hi), null, null, null, 'field-max')); err.hidden = false;
            inp.reportValidity(); return;
          }
          inp.setCustomValidity(''); inp.removeAttribute('aria-invalid'); inp.removeAttribute('aria-describedby'); err.hidden = true;
          if (q.type === 'numbers') { a[q.id] = { ...(a[q.id] || {}) }; a[q.id][fid] = v; } else a[q.id] = v;
          onChange(false);
        });
        if (lab) lb.append(el('span', 'ck-label', lab)); const w = el('span', 'ci-inp'); w.append(inp); if (unit) w.append(el('span', 'ck-unit', unit)); lb.append(w, err); grid.append(lb);
      }
      box.append(grid);
    } else if (q.type === 'grid') {
      const g = el('div', 'ci-grid');
      for (const [iid, lab] of q.items) { const r = choiceGroup(`ci-${sid}-${q.id}-${iid}`, { text: lab }, q.opts, (a[q.id] || {})[iid], (v) => { a[q.id] = { ...(a[q.id] || {}) }; a[q.id][iid] = v; onChange(false); }, W); r.classList.add('ci-gridrow'); g.append(r); }
      box.append(g);
    } else if (q.type === 'checklist') {
      const set = new Set(a[q.id] || []); const fs = el('fieldset', 'ck-choices ci-check'); mark(fs, 'coach', null, W, 'items'); fs.append(el('legend', 'ck-label ck-vh', q.q));
      const cnt = mk('p', 'ck-note', `${set.size} of ${q.items.length} ticked`, null, null, null, 'ticked-count'); cnt.setAttribute('aria-live', 'polite');
      for (const [iid, lab] of q.items) {
        const l = el('label', 'ck-choice'); const inp = el('input', 'ck-vh-input'); inp.type = 'checkbox'; inp.dataset.v = iid; inp.checked = set.has(iid);
        inp.addEventListener('click', () => { set.has(iid) ? set.delete(iid) : set.add(iid); inp.checked = set.has(iid); cnt.textContent = `${set.size} of ${q.items.length} ticked`; a[q.id] = [...set]; onChange(false); });
        const bx = el('span', 'ck-choice-box'); bx.append(icon('check')); l.append(inp, bx, lab); fs.append(l);
      }
      box.append(fs, cnt);
    }
    return box;
  }

  // ---------- status of a survey (and the morning check-in) on the four badges ----------
  // Done = Good; Due and part answered = Unknown (no answer yet); Overdue = Watch (its period has ended: last week's weekly
  // survey, Monday to Thursday; the morning check-in from 12:00, when its form folds away); not open yet = a plain chip.
  // Act stays for pain and data-quality flags (the Phase 3 status rule).
  const overdue = (sid) => sid === 'weekly' && periodOf('weekly').period < monday(TODAY);
  const countBadge = (k, sid, total) => { const b = badge('unknown', ''); b.append(mk('span', null, String(k), null, null, null, 'answered-count'), ' of ', mk('span', null, String(total), 'coach', null, 'kind=ci_q&survey=' + sid, 'question-count'), ' answered'); return b; };
  function surveyState(s, Q) {
    const sid = s.id; const qs = questions(sid, Q); const per = periodOf(sid); const doc = docs.get(docId(sid)); const a = doc ? doc.answers || {} : {};
    const n = qs.filter((q) => answered(q, a)).length; const done = doc && (n === qs.length || doc.finished === true); const skipped = qs.length - n;
    if (done) { const b = badge('good', 'Done '); b.append(mk('span', null, stamp(doc.saved_at), null, null, null, 'store:checkin saved_at')); if (skipped) b.append(' · ', mk('span', null, String(skipped), null, null, null, 'skipped-count'), ' skipped'); return b; }
    if (doc) return countBadge(n, sid, qs.length);
    if (per.next) { const c = neutralChip(''); c.append(mk('span', null, per.next, null, null, null, 'period')); return c; }
    if (overdue(sid)) { const b = badge('watch', 'Overdue'); b.setAttribute('data-rule', 'checkins.js periodOf: last week stays open Monday to Thursday'); return b; }
    return badge('unknown', 'Due');
  }
  const morningLate = () => new Date().getHours() >= 12;

  // ---------- one survey card ----------
  let focusNext = null; // after a re-render, where focus goes (the question heading, or the card's open button)
  function surveyCard(s, Q) {
    const sid = s.id; const qs = questions(sid, Q); const per = periodOf(sid); const sw = SQ(sid);
    const doc = docs.get(docId(sid)); const a = doc ? doc.answers || (doc.answers = {}) : {};
    const n = qs.filter((q) => answered(q, a)).length; const done = doc && (n === qs.length || doc.finished === true);
    const u = ui[sid] || (ui[sid] = { step: Math.min(n, qs.length - 1), open: false });
    const card = el('article', 'ck-tile ci-card'); card.id = 'ci-' + sid; card.dataset.state = done ? 'done' : doc ? 'part' : 'due'; card.setAttribute('aria-labelledby', `ci-${sid}-h`);
    const head = el('div', 'ck-tile-head'); const h = mk('h3', 'ck-h3', s.name, 'coach', 'name', sw); h.id = `ci-${sid}-h`; head.append(h);
    const st = el('span', 'ci-st'); st.id = 'ci-st-' + sid; st.setAttribute('role', 'status'); head.append(st); card.append(head);
    const meta = el('p', 'ck-sub ci-meta'); meta.append(mk('span', null, per.label, 'coach', null, sw, 'period'), ' · ', mk('span', null, s.when, 'coach', 'when', sw), ' · feeds ', mk('span', null, s.feeds, 'coach', 'feeds', sw)); card.append(meta);
    const bwrap = el('div', 'ci-badge'); bwrap.append(surveyState(s, Q)); card.append(bwrap);
    if (!loaded) { card.append(el('p', 'ck-note', 'Loading your answers…')); return card; }
    if (loadErr) { const e = el('div', 'ck-state'); e.dataset.state = 'error'; e.setAttribute('role', 'alert'); const w = el('span', 'ck-state-w'); w.append(icon('act'), 'Not saved here'); e.append(w, el('span', null, loadErr)); card.append(e); }
    if (!u.open) {
      const b = el('button', 'ck-btn ck-btn--secondary ci-open', done ? 'Review or change' : doc ? 'Continue' : 'Start'); b.type = 'button'; b.id = `ci-${sid}-go`;
      b.addEventListener('click', () => { u.open = true; if (done) u.step = 0; focusNext = `ci-${sid}-qh`; renderTab(); });
      card.append(b); return card;
    }
    const step = Math.max(0, Math.min(u.step, qs.length - 1)); const q = qs[step];
    const body = el('div', 'ci-body');
    const eb = el('span', 'ck-eyebrow'); eb.append(mk('span', null, String(step + 1), null, null, null, 'step'), ' of ', mk('span', null, String(qs.length), 'coach', null, 'kind=ci_q&survey=' + sid, 'question-count')); body.append(eb);
    const target = docs.get(docId(sid)) || { survey: sid, period: per.period, answers: a };
    if (!docs.has(docId(sid))) docs.set(docId(sid), target);
    let skip = null;
    body.append(qView(sid, q, target.answers, (advance) => {
      save(sid, s);
      { const k = qs.filter((x) => answered(x, target.answers)).length; bwrap.replaceChildren(countBadge(k, sid, qs.length)); card.dataset.state = 'due'; }
      if (advance && step < qs.length - 1) { u.step = step + 1; focusNext = `ci-${sid}-qh`; renderTab(); return; }
      if (skip && step < qs.length - 1) skip.textContent = answered(q, target.answers) ? 'Next' : 'Skip';
      fuView(followUp(sid, target.answers));
    }, per.period));
    const nav = el('div', 'ck-btn-row ci-nav');
    const back = el('button', 'ck-btn ck-btn--quiet', 'Back'); back.type = 'button'; back.disabled = step === 0; back.addEventListener('click', () => { u.step = step - 1; focusNext = `ci-${sid}-qh`; renderTab(); });
    skip = el('button', 'ck-btn ' + (step === qs.length - 1 ? 'ck-btn--primary' : 'ck-btn--secondary'), step === qs.length - 1 ? 'Finish' : answered(q, target.answers) ? 'Next' : 'Skip'); skip.type = 'button';
    // Finish closes the survey as done, skipped questions included (they stay unknown and can be answered later with Review)
    skip.addEventListener('click', () => { if (step < qs.length - 1) { u.step = step + 1; focusNext = `ci-${sid}-qh`; } else { u.open = false; target.finished = true; save(sid, s); focusNext = `ci-${sid}-go`; } renderTab(); });
    nav.append(back, skip); body.append(nav);
    const fu = el('div', 'ck-notice ci-fu'); fu.dataset.s = 'info'; fu.dataset.fu = '1'; fu.setAttribute('role', 'status');
    const fuView = (msg) => { fu.hidden = !msg; fu.replaceChildren(); if (!msg) return; const w = el('span', 'ck-notice-w'); w.append(icon('info'), 'Follow-up'); const t = el('p', 'ck-notice-t'); t.append(...msg); fu.append(w, t); };
    fuView(followUp(sid, target.answers)); body.append(fu);
    card.append(body);
    return card;
  }
  // the follow-up after an answer: '' or the message as parts (same words as before; the answers it quotes are marked
  // as answers, its fixed numbers as the held rules they are)
  function followUp(sid, a) {
    const R = (t, rule) => ruleSpan(t, 'checkins.js followUp: ' + rule), A = (t) => mk('span', null, String(t), null, null, null, 'store:checkin answer');
    if (a.who5 && Object.keys(a.who5).length === 5) { const t = Object.values(a.who5).reduce((s, v) => s + (N(v) || 0), 0); if (t < 13) return ['Your wellbeing score is ', mk('span', null, String(t), null, null, null, 'who5-total'), ' of ', R('25', 'WHO-5 maximum 25'), '. Under ', R('13', 'WHO-5 low wellbeing under 13'), ' suggests low wellbeing; please mention it to your clinician. If you ever feel unsafe, call or text ', R('988', 'the US crisis line 988'), ' (US).']; }
    const bp = a.bp_home || a.labs; if (bp && N(bp.bp_sys) !== null && N(bp.bp_dia) !== null && (bp.bp_sys >= 130 || bp.bp_dia >= 80)) return [A(bp.bp_sys), '/', A(bp.bp_dia), ' is above ', R('130/80', 'blood pressure 130/80'), '. Bring it to your clinician; the home week will repeat every ', R('3', 'home blood pressure week every 3 months while high'), " months until it's under."];
    return '';
  }

  // ---------- due list (tab header and Today strip) ----------
  function dueList() {
    const r = rows(); if (!r || !loaded) return [];
    const S = r.filter((x) => x.kind === 'ci_survey'); const Q = r.filter((x) => x.kind === 'ci_q');
    const out = [];
    if (morningDone === false) out.push({ id: 'morning', name: 'Morning check-in' });
    for (const s of S.sort((a, b) => a.order - b.order)) {
      const per = periodOf(s.id); if (per.next) continue;
      const d = docs.get(docId(s.id)); const qs = questions(s.id, Q);
      if (!d || qs.some((q) => !answered(q, d.answers || {}) && !d.saved_at)) out.push({ id: s.id, name: s.name });
    }
    return out;
  }
  function renderStrip() {
    const box = $('t-ci'); if (!box) return;
    // the count goes straight into data-n (app.js shows it in #t-ci-n); the names go into the hidden #t-ci-text
    const due = dueList(); box.dataset.n = String(due.length); box.hidden = !due.length; if (!due.length) return;
    const p = $('t-ci-text'); p.textContent = `Due: ${due.map((d) => d.name).join(', ')}.`;
  }

  // the due list: the morning check-in and every survey as a list row with its status badge (surveyState). Which ones are
  // due is dueList(), unchanged; the rows add the ones that are done or started.
  function renderDue(S, Q, due) {
    const list = $('ci-duelist'); if (!list) return; list.replaceChildren();
    // each row is a 44 px button (the athlete, Nov 5, point 13): it opens its form below and focuses the first open question, or,
    // when that form is folded to its summary (done), brings the summary into view; aria-expanded says whether the form's
    // questions are showing, aria-controls names the card. The cards keep their place and order under the list.
    const row = (ic, name, sub, b, key, ctrl, open, go) => { const li = el('li'); const btn = el('button', 'ck-row ci-drow'); btn.type = 'button'; btn.dataset.ci = key; btn.setAttribute('aria-controls', ctrl); btn.setAttribute('aria-expanded', String(open)); btn.addEventListener('click', go); const main = el('span', 'ck-row-main'); main.append(name); if (sub) main.append(sub); const end = el('span', 'ck-row-end'); end.append(b, icon('chevron', 'ck-chev')); btn.append(icon(ic), main, end); li.append(btn); list.append(li); };
    // a morning check-in saved today shows Done at any hour, whether it was saved before the page opened or on it
    // (morningSaved, display only: dueList() still reads morningDone)
    if (morningDone !== null) {
      const done = morningDone || morningSaved; const late = morningLate(); const b = done ? badge('good', 'Done') : late ? badge('watch', 'Overdue') : badge('unknown', 'Due');
      if (!done && late) b.setAttribute('data-rule', 'forms.js morningView: from 12:00 the morning form folds');
      const sub = el('span', 'ck-row-s'); if (done) sub.append('Saved for today'); else if (late) sub.append('Not logged this morning'); else sub.append('Before the ', RUN_AT(), ' check-in');
      const fm = $('fm-form'); row('sleep', el('span', 'ck-row-t', 'Morning check-in'), sub, b, 'morning', 't-feel', !!fm && !fm.hidden, openMorning);
    }
    for (const s of S) {
      const sw = SQ(s.id);
      const sub = el('span', 'ck-row-s'); sub.append(mk('span', null, periodOf(s.id).label, 'coach', null, sw, 'period'), ' · ', mk('span', null, s.when, 'coach', 'when', sw));
      row('checkin', mk('span', 'ck-row-t', s.name, 'coach', 'name', sw), sub, surveyState(s, Q), s.id, 'ci-' + s.id, !!(ui[s.id] && ui[s.id].open), () => openSurvey(s.id, Q));
    }
  }
  const goTo = (t) => { if (!t) return; t.scrollIntoView({ block: 'start', behavior: window.CK && window.CK.scrollBehavior ? window.CK.scrollBehavior() : 'auto' }); };
  const focusIn = (f) => { if (f) f.focus({ preventScroll: true }); };
  // the morning row: the open form gets its first choice focused; a form folded to its summary after a save shows that summary;
  // folded at 12:00 with nothing saved ("Log it now"), the row opens the form the way that button does
  function openMorning() {
    const card = $('t-feel'), fm = $('fm-form'), sm = $('fm-summary'); if (!card) return;
    goTo(card);
    if (fm && !fm.hidden) { focusIn(fm.querySelector('input')); return; }
    if (sm && !sm.hidden) { if (morningDone || morningSaved) { const t = $('fm-sumtext'); t.tabIndex = -1; focusIn(t); } else { $('fm-edit').click(); goTo(card); } }
  }
  // a survey row: Done shows the card's summary (its Done badge, date and Review or change); anything else opens the survey
  // at its first unanswered question, as Start or Continue does
  function openSurvey(sid, Q) {
    const doc = docs.get(docId(sid)); const qs = questions(sid, Q); const a = doc ? doc.answers || {} : {};
    const n = qs.filter((q) => answered(q, a)).length; const done = doc && (n === qs.length || doc.finished === true);
    const u = ui[sid] || (ui[sid] = { step: Math.min(n, qs.length - 1), open: false });
    if (done && !u.open) { const card = $('ci-' + sid); goTo(card); const h = $(`ci-${sid}-h`); if (h) { h.tabIndex = -1; focusIn(h); } return; }
    if (!u.open) { u.open = true; u.step = Math.min(n, qs.length - 1); }
    focusNext = `ci-${sid}-qh`; renderTab(); goTo($('ci-' + sid));
  }
  // after a save, the due rows catch up with the cards under them (no other part of the tab is redrawn)
  function refreshDue() { const r = rows(); if (!r || !loaded) return; renderDue(r.filter((x) => x.kind === 'ci_survey').sort((a, b) => a.order - b.order), r.filter((x) => x.kind === 'ci_q')); }
  window.CX.onMorningSaved = () => { morningSaved = true; refreshDue(); };
  window.CX.renderCiDue = refreshDue;
  const RUN_AT = () => ruleSpan('7:45', 'coach/ops/data_paths.json morning_checkin: 7:45 AM ET');

  function renderTab() {
    const host = $('ci-surveys'); if (!host) return;
    const sv = $('ci-sv'), dc = $('ci-due'), d = dash.data('coach');
    if (d.status !== 'ok' || !Array.isArray(d.data)) { const st = d.status === 'error' || d.status === 'missing' ? 'error' : 'loading'; const msg = 'The check-in list did not load. Your saved answers are safe; the two forms still save.'; cardState(dc, st, msg); cardState(sv, st, 'The surveys did not load. Your saved answers are safe.'); return; }
    const r = rows();
    const S = r.filter((x) => x.kind === 'ci_survey').sort((a, b) => a.order - b.order); const Q = r.filter((x) => x.kind === 'ci_q');
    host.replaceChildren();
    if (!S.length) { cardState(sv, 'empty', 'Check-ins appear after the next morning rebuild.'); cardState(dc, 'empty', 'Check-ins appear after the next morning rebuild.'); return; }
    if (!loaded) { cardState(sv, 'loading'); cardState(dc, 'loading'); return; }
    cardState(sv, null); cardState(dc, null);
    const due = dueList(); const lead = $('ci-lead');
    if (lead) lead.textContent = due.length ? 'Every question can be skipped; a skipped answer stays unknown.' : 'All caught up. Your answers update Health Pillars at the next morning run.';
    renderDue(S, Q, due);
    for (const s of S) host.append(surveyCard(s, Q));
    if (focusNext) { const f = $(focusNext); focusNext = null; if (f) f.focus({ preventScroll: false }); }
  }

  (async () => {
    try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (!db) { loadErr = 'Your answers can be saved only inside the dashboard.'; loaded = true; renderTab(); return; }
    try {
      const q = await db.collection('checkin').get();
      // the store hands back frozen objects: copy them so new answers can be written in
      docs = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, JSON.parse(JSON.stringify(x.data()))]));
      loaded = true;
    } catch (e) { loadErr = 'Could not load your answers. Reopen the page to try again.'; loaded = true; }
    try { const t = await db.doc('feel_daily/' + TODAY).get(); morningDone = t.exists; } catch (e) { morningDone = null; }
    try { const l = await db.collection('lift_log').get(); liftDays = l.docs.filter((x) => x.exists).map((x) => x.id); } catch (e) { liftDays = []; }
    renderTab(); renderStrip();
  })();
  window.CX.renderCheckins = renderTab;
  window.CX.renderCiStrip = renderStrip;
})();
