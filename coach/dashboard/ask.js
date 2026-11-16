// ask.js: the Today check card (#t-qc), one question at a time (roadmap week 2, Measure; the athlete, Nov 11, 2026: the lift tap
// goes on its own Today card, daily questions are answered this way, one at a time, as a 1 to 5 scale of tiles, his pick
// on the rendered options). A tap saves and moves on; a battery bar and "n of N" show where you are; Back and Skip under
// the tiles; after the last question the card folds to one summary line with Done (the card leaves Today for the day)
// and Change.
// Questions, in order:
//   Lifted yesterday?  the morning after a planned lift (a strength row, or "lift" in a row's title, as
//                      coach/tools/outcomes.py) not done in week_view, with no Lifts tab log for that day. Saved as
//                      lift_tap/<today> {for_date, answer yes|no, saved_at}; the morning run copies it into
//                      coach/lift_taps.csv (RUNBOOK Data 4) and outcomes.py counts a yes as done, a no as skipped.
//   Sleep, Energy, Legs, Stress (1 to 5) and Pain (Stop, Hurts, Niggle, None; Where? when not None): the morning feel,
//                      the same answers and the same feel_daily/<today> document as the Check-in tab form (forms.js),
//                      which reloads after each save. The first one offers Same as yesterday.
// The card is hidden when there is no store.
(() => {
  const CX = window.CX;
  const A = () => CX.app;
  const LIFT = /\blifts?\b|strength/i;
  // The answer order and words come from the Check-in tab form's fieldsets in index.html (data-opts, data-labels), the one
  // home for them, so both surfaces always match: worst on the left, best on the right (the athlete, Nov 13, 2026). Values stay
  // as stored (stress 1 Calm to 5 Maxed, pain 0 None to 6 Stop).
  const scale = (k) => { const b = document.querySelector('#fm-form fieldset[data-key="' + k + '"]'); if (!b || !b.dataset.opts) return []; const v = b.dataset.opts.split('|'), l = (b.dataset.labels || b.dataset.opts).split('|'); return v.map((x, i) => [x, l[i]]); };
  const word = (k, n) => { const o = scale(k).find(([v]) => v === String(n)); return o ? o[1] : n; };
  const SITES = ['inside ankle', 'behind knee', 'calf', 'hamstring', 'knee', 'hip', 'back', 'shoulder', 'other'];
  const FEEL = [
    { k: 'sleep_q', q: 'Sleep', sub: 'How rested?' },
    { k: 'energy', q: 'Energy', sub: 'How much is in the tank?' },
    { k: 'legs', q: 'Legs', sub: 'How do they feel?' },
    { k: 'stress', q: 'Stress', sub: 'Work, study, life.' },
  ];
  let db = null, built = false, steps = [], at = 0, open = false, where = false;
  let feel = null, yest = null, lift = null; // feel: today's morning answers; lift: {Y, name, answer}
  let monthSaved = false, mon = null; // the monthly survey when it is due on Today: {label, qs, answers} from checkins.js CX.survey

  // The day the finished card was put away. the athlete, Nov 15, 2026: "Morning check shows up on each new load, does not save I
  // already selected done in prev session". Browser storage does not last between opens in the Claude app (the level up
  // seen list met the same, 6.47.0), so Done is kept in the store, doc seen/morning-card {day, saved_at}: page state only,
  // nothing in the morning run reads it. This device's copy still counts when the store cannot be reached.
  const KEY = 'cx-qc-done';
  let goneDay = null; // the store's day, read with the answers in renderAsk
  const gone = (set) => {
    if (set) { goneDay = A().TODAY; try { localStorage.setItem(KEY, goneDay); } catch (e) { /* the store copy below */ }
      if (db) { try { Promise.resolve(db.doc('seen/morning-card').set({ day: goneDay, saved_at: new Date().toISOString() })).catch(() => { /* kept for this open */ }); } catch (e) { /* kept for this open */ } } }
    if (goneDay === A().TODAY) return true;
    try { return localStorage.getItem(KEY) === A().TODAY; } catch (e) { return false; } };
  const blank = (v) => v === null || v === undefined || v === '';
  const painWord = (p) => { p = Number(p); return p <= 0 ? 'None' : p <= 2 ? 'Niggle' : p <= 4 ? 'Hurts' : 'Stop'; };
  function summary() {
    const out = [];
    if (feel) {
      for (const f of FEEL) if (!blank(feel[f.k])) out.push(`${f.q} ${word(f.k, Number(feel[f.k]))}`);
      if (!blank(feel.pain)) out.push(`Pain: ${painWord(feel.pain)}${feel.pain_site ? ' (' + String(feel.pain_site).replace(/;/g, ', ') + ')' : ''}`);
    }
    if (monthSaved) out.push('Monthly survey saved');
    if (lift && lift.answer) out.push(lift.answer === 'yes' ? 'Lifted yesterday' : 'Skipped yesterday\'s lift');
    return out.join(' · ') || 'Nothing answered';
  }

  // Saving in the background (6.76.0, speed): a tap moves the card on at once and the save goes out behind it, instead of
  // waiting a network round trip per answer. Writes go one at a time in tap order, each the whole document as it stands,
  // so the last one to land always holds every answer. A failed write is tried twice more; if it still fails the card says
  // so on every question until a later save goes through, and the answers stay on screen to tap again.
  let chain = Promise.resolve(), unsaved = null, pending = 0;
  const syncLine = () => { const st = document.querySelector('#t-qc-body .qc-st'); if (st) st.textContent = unsaved ? `Not saved (${unsaved}). Tap an answer again, or tell the coach in chat.` : ''; };
  const tryWrite = async (fn) => { let e0 = null; for (let i = 0; i < 3; i++) { try { await fn(); return; } catch (e) { e0 = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); } } throw e0; };
  function queue(fn, after) {
    pending += 1;
    chain = chain.then(() => tryWrite(fn)).then(() => { unsaved = null; if (after) after(); }, (e) => { unsaved = (e && e.code) || 'error'; })
      .finally(() => { pending -= 1; syncLine(); });
    return chain;
  }
  CX.askPending = () => pending; // the harness waits on this before reading the store
  function saveFeel(patch) {
    const body = { date: A().TODAY, scale: 5, sleep_q: null, energy: null, legs: null, stress: null, pain: null, pain_site: '', note: '', ...(feel || {}), ...patch, saved_at: new Date().toISOString() };
    for (const k of ['sleep_q', 'energy', 'legs', 'stress', 'pain']) body[k] = blank(body[k]) ? null : Number(body[k]);
    feel = body; // on screen at once
    return queue(() => db.doc('feel_daily/' + A().TODAY).set(feel), () => {
      if (CX.reloadMorning) CX.reloadMorning(); // the Check-in tab form shows the same answers
      if (CX.onMorningSaved) CX.onMorningSaved(); // the due list and Today's check-ins line drop the morning check-in
    });
  }

  function buildSteps(withFeel) {
    const s = [];
    if (lift && (!lift.answer || open)) s.push({
      id: 'lift', q: 'Lifted yesterday?', sub: `${lift.name}, ${A().fWd(A().P(lift.Y))}. Nothing logged yet.`, cols: 2,
      opts: [['yes', 'I lifted'], ['no', 'Skipped it']], cur: () => lift.answer,
      save: (v) => { lift.answer = v; const doc = { for_date: lift.Y, answer: v, saved_at: new Date().toISOString() }; return queue(() => db.doc('lift_tap/' + A().TODAY).set(doc)); },
    });
    if (withFeel) {
      for (const f of FEEL) s.push({
        id: f.k, q: f.q, sub: f.sub, cols: 5, opts: scale(f.k),
        cur: () => (feel && !blank(feel[f.k]) ? String(feel[f.k]) : null), save: (v) => saveFeel({ [f.k]: v }),
      });
      s.push({
        id: 'pain', q: 'Pain', sub: 'Stop: changes how you move. Hurts: affects training. Niggle: noticed, changes nothing.', cols: 4,
        opts: scale('pain'), cur: () => (feel && !blank(feel.pain) ? String(feel.pain) : null),
        save: (v) => saveFeel(v === '0' ? { pain: v, pain_site: '' } : { pain: v }), more: (v) => v !== '0',
      });
    }
    if (mon) s.push(...monthSteps());
    return s;
  }

  // the monthly survey (coach/checkins.json via checkins.js), one question at a time from its first Sunday until answered:
  // choice as tiles (numbered when the answers are 1 to 5), each WHO-5 line as its own tiles question, checklists as chips,
  // numbers as inputs with Next. Answers save through CX.survey (the Check-in tab's own document and save rule); leaving
  // the last question marks the survey finished, as Finish does on the Check-in tab.
  function monthSteps() {
    const SV = CX.survey, sid = 'monthly', out = [];
    const cur = (qid) => (SV.get(sid) || { answers: {} }).answers[qid];
    for (const q of mon.qs) {
      const opts = Array.isArray(q.opts) ? q.opts.map(([v, l]) => [String(v), l]) : [];
      const num = opts.length > 0 && opts.length <= 5 && opts.every(([v], i) => v === String(i + 1));
      if (q.type === 'choice') out.push({ id: 'm-' + q.id, q: q.q, sub: q.hint || mon.label, cols: Math.min(opts.length, 5), num, opts, cur: () => (cur(q.id) === undefined || cur(q.id) === null ? null : String(cur(q.id))), save: async (v) => SV.set(sid, q.id, isNaN(Number(v)) ? v : Number(v)) });
      else if (q.type === 'grid') for (const [iid, lab] of q.items) out.push({ id: `m-${q.id}-${iid}`, q: lab, sub: q.q, cols: 3, opts, cur: () => { const g = cur(q.id) || {}; return g[iid] === undefined || g[iid] === null ? null : String(g[iid]); }, save: async (v) => SV.set(sid, q.id, { ...(cur(q.id) || {}), [iid]: Number(v) }) });
      else if (q.type === 'checklist') out.push({ id: 'm-' + q.id, kind: 'chips', q: q.q, sub: q.hint || 'Tick any, then Next.', items: q.items, cur: () => cur(q.id) || [], save: async (v) => SV.set(sid, q.id, v) });
      else if (q.type === 'number' || q.type === 'numbers' || q.type === 'date') out.push({ id: 'm-' + q.id, kind: 'inputs', q: q.q, sub: q.hint || '', type: q.type, fields: q.type === 'numbers' ? q.fields : [[q.id, '', q.unit || '', q.min, q.max, q.step]], cur: () => cur(q.id), save: async (v) => SV.set(sid, q.id, v) });
    }
    if (out.length) out[out.length - 1].last = () => SV.finish(sid);
    return out;
  }

  function paint(focus) {
    const { $, el, icon } = A();
    const card = $('t-qc'), body = $('t-qc-body'), n = $('t-qc-n'), h = $('t-qc-h');
    body.replaceChildren(); card.hidden = false;
    h.textContent = steps.some((x) => FEEL.some((f) => f.k === x.id) || x.id === 'pain') || feel ? 'Morning check-in' : steps.some((x) => x.id.startsWith('m-')) ? 'Monthly check' : 'Quick check';
    if (at >= steps.length) { // all answered: one line and Change
      n.textContent = feel && feel.saved_at ? 'Saved ' + A().stamp(feel.saved_at) : '';
      const p = el('p', 'qc-sum'); p.append(icon('check'), ' ', summary());
      const ch = el('button', 'ck-btn ck-btn--secondary', 'Change'); ch.type = 'button';
      ch.addEventListener('click', () => { open = true; steps = buildSteps(true); at = 0; where = false; paint(true); });
      // Done (the athlete, Nov 11): the finished card leaves Today for the rest of the day; the answers stay on the Check-in tab
      const dn = el('button', 'ck-btn ck-btn--primary', 'Done'); dn.type = 'button';
      dn.addEventListener('click', () => { gone(true); card.hidden = true; const t = $('t-hero'); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); } });
      const bar = el('div', 'qc-end'); bar.append(dn, ch);
      const ns = el('p', 'qc-st'); ns.setAttribute('aria-live', 'polite'); // a save still failing after the last answer shows here too
      body.append(p, bar, ns); syncLine(); if (focus) dn.focus(); return;
    }
    const s = steps[at];
    if (s.id.startsWith('m-')) h.textContent = 'Monthly check'; // the heading follows the question being asked
    n.textContent = steps.length > 1 ? `${at + 1} of ${steps.length}` : '';
    if (steps.length > 1) { const pr = el('div', 'qc-prog'); pr.setAttribute('aria-hidden', 'true'); steps.forEach((_, i) => pr.append(el('i', i < at ? 'on' : i === at ? 'now' : null))); body.append(pr); }
    const q = el('p', 'qc-q', s.q); q.id = 't-qc-q';
    body.append(q, el('p', 'qc-sub', s.sub));
    const st = el('p', 'qc-st'); st.setAttribute('aria-live', 'polite');
    if (unsaved) st.textContent = `Not saved (${unsaved}). Tap an answer again, or tell the coach in chat.`;
    const next = () => { if (s.last) { s.last(); mon = null; monthSaved = true; } at += 1; where = false; paint(true); };
    if (s.kind === 'chips' || s.kind === 'inputs') {
      if (s.kind === 'chips') {
        const on = new Set(s.cur()); const chips = el('div', 'qc-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-labelledby', 't-qc-q');
        for (const [iid, lab] of s.items) {
          const c = el('button', 'qc-chip' + (on.has(iid) ? ' sel' : ''), lab); c.type = 'button'; c.setAttribute('aria-pressed', String(on.has(iid)));
          c.addEventListener('click', () => { on.has(iid) ? on.delete(iid) : on.add(iid); c.classList.toggle('sel', on.has(iid)); c.setAttribute('aria-pressed', String(on.has(iid))); s.save(s.items.map(([x]) => x).filter((x) => on.has(x))); });
          chips.append(c);
        }
        body.append(chips);
      } else {
        const box = el('div', 'qc-inputs'); const val = s.cur();
        for (const [fid, lab, unit, lo, hi, step] of s.fields) {
          const l = el('label', 'qc-field'); if (lab) l.append(el('span', 'qc-flab', lab));
          const inp = el('input', 'qc-in'); inp.type = s.type === 'date' ? 'date' : 'number'; if (s.type !== 'date') { inp.inputMode = 'decimal'; if (lo !== undefined && lo !== null) inp.min = lo; if (hi !== undefined && hi !== null) inp.max = hi; if (step) inp.step = step; }
          const cv = s.type === 'numbers' ? (val || {})[fid] : val; inp.value = cv === undefined || cv === null ? '' : String(cv); inp.dataset.f = fid;
          l.append(inp); if (unit) l.append(el('span', 'qc-unit', unit)); box.append(l);
        }
        const commit = () => {
          const ins = [...box.querySelectorAll('input')]; const read = (i) => (i.value === '' ? null : s.type === 'date' ? i.value : Number(i.value));
          if (s.type === 'numbers') { const o = {}; for (const i of ins) o[i.dataset.f] = read(i); if (Object.values(o).some((x) => x !== null)) s.save(o); } else { const v = read(ins[0]); if (v !== null) s.save(v); }
        };
        box.addEventListener('change', commit); body.append(box);
      }
      const foot = el('div', 'qc-foot');
      if (at > 0) { const bk = el('button', 'qc-link', 'Back'); bk.type = 'button'; bk.addEventListener('click', () => { at -= 1; paint(true); }); foot.append(bk); } else foot.append(el('span'));
      const g = el('button', 'qc-link', 'Next'); g.type = 'button'; g.addEventListener('click', () => { const i = body.querySelector('.qc-in'); if (i) i.blur(); next(); }); foot.append(g);
      body.append(foot, st);
      if (focus) { const f = body.querySelector('.qc-chip, .qc-in'); if (f) f.focus(); }
      return;
    }
    // Same look as the Check-in tab's form (the athlete, Nov 15, 2026, Sprint Review: the Today card missed the round three pick 1):
    // the answers join into one step bar, worst left, best right; the tapped step fills and the steps to its left take a light fill.
    // No digits on the steps, as on the form; the words carry the answer.
    const row = el('div', 'qc-tiles qc-bar'); row.style.setProperty('--n', s.cols); row.setAttribute('role', 'group'); row.setAttribute('aria-labelledby', 't-qc-q');
    const cur = s.cur(), ci = s.opts.findIndex(([v]) => v === cur);
    s.opts.forEach(([v, label], i) => {
      const b = el('button', 'qc-tile' + (cur === v ? ' sel' : ci > i ? ' pre' : '')); b.type = 'button'; b.setAttribute('aria-pressed', String(cur === v));
      b.append(el('span', null, label));
      b.addEventListener('click', () => { // moves on at once; the save goes out behind it (queue above)
        s.save(v);
        if (s.more && s.more(v)) { where = true; paint(); const c = $('t-qc-body').querySelector('.qc-chip'); if (c) c.focus(); } else next();
      });
      row.append(b);
    });
    body.append(row);
    if (s.id === 'pain' && (where || (cur && cur !== '0'))) { // Where? for any pain but None; chips save as they toggle
      const wh = el('p', 'qc-sub qc-where', 'Where?'); wh.id = 't-qc-where';
      const chips = el('div', 'qc-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-labelledby', 't-qc-where');
      const on = new Set(String((feel && feel.pain_site) || '').split(';').filter(Boolean));
      for (const site of SITES) {
        const c = el('button', 'qc-chip' + (on.has(site) ? ' sel' : ''), site); c.type = 'button'; c.setAttribute('aria-pressed', String(on.has(site)));
        c.addEventListener('click', async () => {
          on.has(site) ? on.delete(site) : on.add(site); c.classList.toggle('sel', on.has(site)); c.setAttribute('aria-pressed', String(on.has(site)));
          saveFeel({ pain_site: SITES.filter((x) => on.has(x)).join(';') });
        });
        chips.append(c);
      }
      body.append(wh, chips);
    }
    const foot = el('div', 'qc-foot');
    if (at > 0) { const bk = el('button', 'qc-link', 'Back'); bk.type = 'button'; bk.addEventListener('click', () => { at -= 1; where = false; paint(true); }); foot.append(bk); } else foot.append(el('span'));
    const first = steps.findIndex((x) => x.id !== 'lift');
    let go;
    if (s.id === 'pain' && (where || (cur && cur !== '0'))) go = ['Next', next];
    else if (at === first && yest && !(feel && feel.saved_at)) go = ['Same as yesterday', async () => {
      const y = {}; for (const k of ['sleep_q', 'energy', 'legs', 'stress', 'pain', 'pain_site']) y[k] = yest[k];
      saveFeel(y); at = steps.length; paint(true);
    }];
    else go = ['Skip', next];
    const g = el('button', 'qc-link', go[0]); g.type = 'button'; g.addEventListener('click', go[1]); foot.append(g);
    body.append(foot, st);
    if (focus) { const f = body.querySelector('.qc-tile'); if (f) f.focus(); }
  }

  CX.renderAsk = async function () {
    const { $, rowsOk, TODAY, dayN, isoN } = A();
    if (built || !$('t-qc')) return; // built once per page load; answers move it on
    const wv = rowsOk('week_view'); if (!wv) return;
    built = true;
    try { db = await window.CX.store(); } catch (e) { db = null; }
    if (!db) return; // nowhere to save: ask nothing
    const Y = isoN(dayN(TODAY) - 1);
    const get = async (p) => { try { const d = await db.doc(p).get(); return d.exists ? d.data() : null; } catch (e) { return null; } };
    const [t, y, tap, log, put] = await Promise.all([get('feel_daily/' + TODAY), get('feel_daily/' + Y), get('lift_tap/' + TODAY), get('lift_log/' + Y), get('seen/morning-card')]);
    if (put && put.day === TODAY) goneDay = TODAY;
    feel = t; yest = y && Number(y.scale) === 5 ? y : null;
    const plan = wv.filter((r) => r.kind === 'plan' && r.date === Y && (r.type === 'strength' || LIFT.test(r.title || '')));
    if (plan.length && !plan.some((r) => ['done', 'fallback', 'swapped'].includes(r.status)) && !log) {
      lift = { Y, name: plan.map((r) => r.title || 'Strength').join(', '), answer: tap && ['yes', 'no'].includes(tap.answer) ? tap.answer : null };
    }
    for (let i = 0; i < 60 && !CX.survey; i++) await new Promise((r) => setTimeout(r, 50)); // checkins.js loads after this file
    if (CX.survey) { // the monthly survey from its first Sunday until it is answered
      await CX.survey.ready; const sv = CX.survey.get('monthly');
      const t = A().P(TODAY), d1 = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), firstSun = 1 + ((7 - d1.getUTCDay()) % 7);
      if (sv && !sv.done && sv.qs.length && t.getUTCDate() >= firstSun) mon = sv;
    }
    steps = buildSteps(!(feel && feel.saved_at)); at = 0;
    // Answered in an earlier open: no card (the athlete, Nov 15, 2026: "Morning check still pops up at the top"); the answers stay on the Check-in tab
    if (!steps.length) return;
    paint(false);
  };
})();
