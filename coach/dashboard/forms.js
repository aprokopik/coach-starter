// forms.js: what the athlete enters on the page (morning feel, session rating, race kit) and the store writes.
(() => {
  const { dayN, isoN } = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const TODAY = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const YESTERDAY = isoN(dayN(TODAY) - 1);
  const stamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  const RPE = { 0: 'rest', 1: 'very easy', 2: 'easy', 3: 'comfortable, full sentences', 4: 'steady, shorter sentences', 5: 'moderate-hard, phrases', 6: 'hard', 7: 'very hard, a few words', 8: 'near max', 9: 'near max', 10: 'max' };
  let db = null;

  // Answer groups (Phase 5, Cockpit forms): each fieldset[data-key] in a form becomes a radio group (a checkbox group with
  // data-multi) of 44 px ck-choice labels around native inputs, the legend its label and hint. The answers and how they
  // toggle are as before: a tap on the chosen option clears it; pain sites add and remove. The arrow keys move the choice
  // within a group, as in any radio group.
  const { icon } = window.CX.ck;
  // Enter picks a radio and Space on the chosen one clears it, as Enter and Space did on the old buttons (a native radio
  // ignores both); the click then runs the same toggle as a tap
  const radioKey = (e) => { const i = e.currentTarget; if (e.key === 'Enter' || (e.key === ' ' && i.checked)) { e.preventDefault(); i.click(); } };
  window.CX.radioKey = radioKey;
  function build(form, onChange) {
    const st = {};
    const paint = (box, v) => { for (const i of box.querySelectorAll('input')) i.checked = Array.isArray(v) ? v.includes(i.dataset.v) : v === i.dataset.v; };
    for (const box of form.querySelectorAll('fieldset[data-key]')) {
      const k = box.dataset.key, multi = !!box.dataset.multi, lo = Number(box.dataset.min), hi = Number(box.dataset.max);
      const opts = box.dataset.opts ? box.dataset.opts.split('|') : Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i));
      const labels = (box.dataset.labels || box.dataset.opts || opts.join('|')).split('|');
      const lg = el('legend', 'ck-label', box.dataset.label); if (box.dataset.hint) lg.append(' ', el('span', 'ck-hint', box.dataset.hint));
      const name = (form.id || 'f') + '-' + k; const items = [lg]; const row = box.classList.contains('ck-choices--row');
      opts.forEach((o, i) => {
        const lab = el('label', 'ck-choice'); const inp = el('input', 'ck-vh-input'); inp.type = multi ? 'checkbox' : 'radio'; inp.name = name; inp.value = o; inp.dataset.v = o;
        if (!multi) inp.addEventListener('keydown', radioKey);
        const bx = el('span', 'ck-choice-box'); if (multi || row) bx.append(icon('check')); lab.append(inp, bx, labels[i]); items.push(lab); // a chosen radio in a wrapped group shows the filled dot
      });
      box.replaceChildren(...items);
      box.addEventListener('click', (e) => {
        const b = e.target; if (!b || b.tagName !== 'INPUT') return;
        if (multi) { const s = new Set(st[k] || []); s.has(b.dataset.v) ? s.delete(b.dataset.v) : s.add(b.dataset.v); st[k] = [...s]; } else st[k] = st[k] === b.dataset.v ? undefined : b.dataset.v;
        paint(box, st[k]); onChange(k);
      });
      box._paint = () => paint(box, st[k]);
    }
    const sites = () => { const p = Number(st.pain); for (const s of form.querySelectorAll('[data-sites]')) s.hidden = !(p > 0 || (st.pain_site || []).length); };
    return {
      st,
      load(data) {
        for (const k of Object.keys(st)) delete st[k];
        if (data) for (const [k, v] of Object.entries(data)) {
          if (k === 'pain_site') st[k] = v ? String(v).split(';').filter(Boolean) : [];
          else if (v !== null && v !== undefined && v !== '') st[k] = String(v);
        }
        for (const b of form.querySelectorAll('fieldset[data-key]')) b._paint && b._paint();
        sites();
      },
      sites,
    };
  }
  const numOrNull = (v) => (v === undefined || v === null || v === '' ? null : isNaN(Number(v)) ? v : Number(v));
  // Status lines: the race kit's (Season) as before; the two Check-in forms' as Cockpit status lines (polite live regions):
  // Saved with the check glyph and its time marked, errors with the Act glyph, Saving and the rest as plain words.
  const status = (id, text, cls, iso) => paint($(id), text, cls, iso);
  function paint(e, text, cls, iso) {
    if (!e.classList.contains('ci-st')) { e.textContent = text; e.className = 'status' + (cls ? ' ' + cls : ''); return; }
    e.dataset.s = cls || ''; e.replaceChildren();
    if (cls === 'ok' || cls === 'err') e.append(icon(cls === 'ok' ? 'check' : 'act'));
    const t = iso ? stamp(iso) : '';
    if (t && text.endsWith(t)) { const sp = el('span', null, t); sp.dataset.derived = 'saved-at'; e.append(text.slice(0, text.length - t.length), sp); } else e.append(text);
  }
  window.CX.ciStatus = paint; // the survey status lines (checkins.js) use the same line
  // the shared loading state on a form card: the form shows once the store has answered (or is not there); load and save
  // errors show in the card's status line with the Act glyph, and never hide the form or what is on it
  const formState = (card, st) => {
    const slot = card.querySelector(':scope > [data-slot]'), body = card.querySelector(':scope > [data-body]'); if (!slot || !body) return;
    body.hidden = st === 'loading'; slot.hidden = st !== 'loading'; card.setAttribute('aria-busy', String(st === 'loading'));
  };
  const LAB5 = { sleep_q: ['Awful', 'Poor', 'OK', 'Good', 'Great'], energy: ['Drained', 'Low', 'OK', 'Good', 'Great'], legs: ['Trashed', 'Heavy', 'OK', 'Good', 'Fresh'], stress: ['Calm', 'Low', 'Some', 'High', 'Maxed'] };
  const PAINW = (p) => { p = Number(p); return p <= 0 ? 'None' : p <= 2 ? 'Niggle' : p <= 4 ? 'Hurts' : 'Stop'; };
  const EFFW = (r) => { r = Number(r); return r <= 2 ? 'Very easy' : r <= 3 ? 'Easy' : r <= 4 ? 'Steady' : r <= 6 ? 'Hard' : 'Very hard'; };
  const to5 = (d) => { if (!d || Number(d.scale) === 5) return d; const o = { ...d }; for (const k of Object.keys(LAB5)) if (o[k] !== null && o[k] !== undefined && o[k] !== '' && !isNaN(Number(o[k]))) o[k] = Math.min(5, Math.max(1, Math.round(1 + (Number(o[k]) - 1) * 4 / 9))); for (const k of ['pain']) if (o[k] !== null && o[k] !== undefined && o[k] !== '') { const p = Number(o[k]); o[k] = p <= 0 ? 0 : p <= 2 ? 1 : p <= 4 ? 3 : 6; } o.scale = 5; return o; };
  const words = (d) => {
    const parts = []; d = to5(d);
    for (const [k, l] of [['sleep_q', 'Sleep'], ['energy', 'Energy'], ['legs', 'Legs'], ['stress', 'Stress']]) if (d[k] !== null && d[k] !== undefined && d[k] !== '') parts.push(`${l} ${LAB5[k][Number(d[k]) - 1] || d[k]}`);
    if (d.pain !== null && d.pain !== undefined && d.pain !== '') parts.push(`Pain: ${PAINW(d.pain)}${d.pain_site ? ' (' + String(d.pain_site).replace(/;/g, ', ') + ')' : ''}`);
    return parts.join(' · ') || 'Nothing scored';
  };

  // ---------- morning ----------
  const mForm = $('fm-form');
  let mTimer = null, mSaving = Promise.resolve(), mEditing = false, yesterday = null, mSaved = null;
  const m = build(mForm, (k) => { if (k === 'pain' || k === 'pain_site') m.sites(); saveSoon(); });
  $('fm-note').addEventListener('input', () => saveSoon());
  function saveSoon() { mEditing = true; $('fm-done').hidden = false; status('fm-status', 'Saving…'); clearTimeout(mTimer); mTimer = setTimeout(saveMorning, 900); }
  function saveMorning() {
    if (!db) { status('fm-status', 'Saving is not available in this view; reply to the check-in instead.', 'err'); return; }
    const s = m.st;
    const body = { date: TODAY, scale: 5, sleep_q: numOrNull(s.sleep_q), energy: numOrNull(s.energy), legs: numOrNull(s.legs), stress: numOrNull(s.stress), pain: numOrNull(s.pain), pain_site: (s.pain_site || []).join(';'), note: $('fm-note').value.trim(), saved_at: new Date().toISOString() };
    mSaving = mSaving.then(() => db.doc('feel_daily/' + TODAY).set(body)).then(() => { mSaved = body; status('fm-status', 'Saved ' + stamp(body.saved_at), 'ok', body.saved_at); $('fm-sumtext').textContent = words(body); if (window.CX.onMorningSaved) window.CX.onMorningSaved(); }).catch((e) => status('fm-status', `Not saved (${e && e.code ? e.code : 'error'}). Reply to the check-in instead.`, 'err'));
  }
  function morningView(saved) {
    const late = new Date().getHours() >= 12;
    const collapsed = (!!saved || late) && !mEditing;
    $('fm-summary').hidden = !collapsed; mForm.hidden = collapsed;
    $('fm-sumtext').textContent = saved ? words(saved) : 'Not logged this morning.';
    $('fm-edit').textContent = saved ? 'Edit' : 'Log it now';
    dueSync();
  }
  // the Check-in tab's Morning row says whether this form is open (aria-expanded); it follows every fold and unfold
  const dueSync = () => { if (window.CX.renderCiDue) window.CX.renderCiDue(); };
  $('fm-edit').addEventListener('click', () => { mEditing = true; $('fm-summary').hidden = true; mForm.hidden = false; $('fm-done').hidden = false; dueSync(); const f = mForm.querySelector('input'); if (f) f.focus(); });
  $('fm-done').addEventListener('click', () => { clearTimeout(mTimer); saveMorning(); mEditing = false; mSaving.then(() => { $('fm-done').hidden = true; morningView(mSaved); if (!$('fm-summary').hidden) $('fm-edit').focus(); }); });
  $('fm-same').addEventListener('click', () => {
    if (!yesterday) return;
    { const y5 = to5(yesterday); m.load({ sleep_q: y5.sleep_q, energy: y5.energy, legs: y5.legs, stress: y5.stress, pain: y5.pain, pain_site: y5.pain_site }); }
    saveSoon();
  });
  async function loadMorning() {
    try {
      const [t, y] = await Promise.all([db.doc('feel_daily/' + TODAY).get(), db.doc('feel_daily/' + YESTERDAY).get()]);
      yesterday = y.exists ? y.data() : null;
      $('fm-same').hidden = !yesterday || t.exists;
      const saved = t.exists ? t.data() : null; mSaved = saved;
      m.load(saved ? to5(saved) : saved); $('fm-note').value = saved ? saved.note || '' : '';
      status('fm-status', saved ? 'Saved ' + stamp(saved.saved_at) : new Date().getHours() >= 12 ? '' : 'Not logged yet', saved ? 'ok' : '', saved ? saved.saved_at : null);
      morningView(saved);
    } catch (e) { status('fm-status', 'Could not load your answers.', 'err'); }
  }

  // ---------- session ----------
  const sForm = $('fs-form'); const sel = $('fs-act');
  let acts = [], logged = new Map(), sTimer = null, sSaving = Promise.resolve(), sEditing = false;
  const s = build(sForm, (k) => { if (k === 'pain' || k === 'pain_site') s.sites(); sSaveSoon(); });
  const man = build($('fs-manual'), () => { fuelVis(); sSaveSoon(); });
  $('fs-note').addEventListener('input', () => sSaveSoon());
  const isManual = () => sel.value === '__manual';
  const cur = () => acts.find((a) => String(a.activity_id) === sel.value) || null;
  const minutes = () => (isManual() ? Number(man.st.m_min) || null : cur() ? Math.round(Number(cur().duration_min)) || null : null);
  function fuelVis() { $('fs-fuelq').hidden = !((minutes() || 0) >= 90); }
  function docId() { if (isManual()) return man.st.m_type ? `manual-${TODAY}-${man.st.m_type}` : null; return sel.value || null; }
  function sSaveSoon() { sEditing = true; $('fs-done').hidden = false; status('fs-status', 'Saving…'); clearTimeout(sTimer); sTimer = setTimeout(saveSession, 900); }
  function saveSession() {
    if (!db) { status('fs-status', 'Saving is not available in this view; reply to the check-in instead.', 'err'); return; }
    const id = docId(); if (!id) { status('fs-status', isManual() ? 'Pick the session type first.' : 'Pick a session first.', 'err'); return; }
    const a = cur(); const mins = minutes(); const rpe = numOrNull(s.st.rpe);
    const body = { date: isManual() ? TODAY : String(a.local_start).slice(0, 10), activity_id: id, activity: isManual() ? `${man.st.m_type} (logged on the dashboard)` : `${a.type}: ${a.name}`,
      minutes: mins, rpe, srpe_load: typeof rpe === 'number' && mins ? Math.round(rpe * mins) : null, vs_plan: s.st.vs_plan || '', pain: numOrNull(s.st.pain), pain_site: (s.st.pain_site || []).join(';'),
      fuel: (mins || 0) >= 90 ? s.st.fuel || '' : '', note: $('fs-note').value.trim(), saved_at: new Date().toISOString() };
    if (isManual()) body.type = man.st.m_type;
    sSaving = sSaving.then(() => db.doc('feel_sessions/' + id).set(body)).then(() => { logged.set(id, body); window.CX.live = logged; status('fs-status', 'Saved ' + stamp(body.saved_at), 'ok', body.saved_at); $('fs-sumtext').textContent = sWords(body); paintOptions(); })
      .catch((e) => status('fs-status', `Not saved (${e && e.code ? e.code : 'error'}). Reply to the check-in instead.`, 'err'));
  }
  const sWords = (d) => [d.rpe !== null && d.rpe !== undefined ? EFFW(d.rpe) : 'No effort rating', d.vs_plan ? { '-': 'easier', '=': 'as planned', '+': 'harder' }[d.vs_plan] : null, d.pain ? `pain: ${PAINW(d.pain)}${d.pain_site ? ' (' + String(d.pain_site).replace(/;/g, ', ') + ')' : ''}` : null, d.fuel || null].filter(Boolean).join(' · ');
  function sessionView() {
    const id = docId(); const saved = id ? logged.get(id) : null;
    $('fs-manual').hidden = !isManual();
    const collapsed = !!saved && !sEditing;
    $('fs-summary').hidden = !collapsed; sForm.hidden = collapsed;
    if (saved) $('fs-sumtext').textContent = sWords(saved);
    s.load(saved); $('fs-note').value = saved ? saved.note || '' : '';
    status('fs-status', saved ? 'Saved ' + stamp(saved.saved_at) : id || isManual() ? 'Not rated yet' : '', saved ? 'ok' : '', saved ? saved.saved_at : null);
    fuelVis();
  }
  sel.addEventListener('change', () => { clearTimeout(sTimer); sEditing = false; $('fs-done').hidden = true; if (isManual()) man.load(null); sessionView(); });
  $('fs-edit').addEventListener('click', () => { sEditing = true; $('fs-summary').hidden = true; sForm.hidden = false; $('fs-done').hidden = false; const f = sForm.querySelector('input'); if (f) f.focus(); });
  $('fs-done').addEventListener('click', () => { clearTimeout(sTimer); saveSession(); sEditing = false; sSaving.then(() => { sessionView(); $('fs-done').hidden = true; if (!$('fs-summary').hidden) $('fs-edit').focus(); }); });
  const label = (a) => {
    const d = new Date(String(a.local_start).slice(0, 10) + 'T00:00:00Z');
    return `${d3.utcFormat('%a %b %-d')(d)} · ${String(a.type).replace(/_/g, ' ')} · ${Math.round(Number(a.duration_min))} min${logged.has(String(a.activity_id)) ? ' · rated' : ''}`;
  };
  function paintOptions() {
    const keep = sel.value;
    sel.replaceChildren(...acts.map((a) => new Option(label(a), String(a.activity_id))), new Option('Not on the list yet: log it', '__manual'));
    if (keep) sel.value = keep;
  }
  function pickDefault() {
    const recent = acts.filter((a) => dayN(String(a.local_start).slice(0, 10)) >= dayN(TODAY) - 3);
    const open = recent.find((a) => !logged.has(String(a.activity_id)));
    sel.value = String((open || acts[0] || {}).activity_id || '__manual');
  }
  let picked = false;
  dash.onData(() => {
    const d = dash.data('activities');
    if (d.status !== 'ok') { if (!acts.length) sel.replaceChildren(new Option(d.status === 'error' ? 'Sessions did not load' : 'Loading sessions…', '')); return; }
    const fresh = [...d.data].filter((r) => !/walk/.test(String(r.type)) && !/sauna/i.test(String(r.name))).sort((x, y) => (x.local_start < y.local_start ? 1 : -1)).slice(0, 12);
    if (fresh.map((r) => r.activity_id).join() === acts.map((r) => r.activity_id).join()) return;
    acts = fresh; paintOptions();
    if (db && !picked) { picked = true; pickDefault(); sessionView(); }
  });
  async function loadSessions() {
    try { const q = await db.collection('feel_sessions').get(); logged = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, x.data()])); window.CX.live = logged; window.CX.render && ['week', 'today'].includes(window.CX.state.page) && window.CX.render(); }
    catch (e) { status('fs-status', 'Could not load your ratings.', 'err'); }
    if (acts.length) { paintOptions(); if (!picked) { picked = true; pickDefault(); } }
    sessionView();
  }

  // ---------- race kit ----------
  let kitRace = null, kit = {}, kSaving = Promise.resolve();
  function paintKit() {
    const list = $('rk-list'); const items = [...list.querySelectorAll('button')];
    for (const b of items) b.setAttribute('aria-pressed', String(!!kit[b.dataset.item]));
    const done = items.filter((b) => kit[b.dataset.item]).length;
    window.CKC.meter($('rk-meter').parentNode, { frac: items.length ? done / items.length : 0, fill: '#rk-meter', decorative: true }); // the status text beside it carries the count
    status('rk-status', items.length ? `${done} of ${items.length} packed` : '');
  }
  async function loadKit(race) {
    kitRace = race; kit = {};
    if (db) { try { const d = await db.doc('race_kit/' + race).get(); kit = d.exists ? { ...(d.data().checked || {}) } : {}; } catch (e) { status('rk-status', 'Could not load your ticks.', 'err'); return; } }
    paintKit();
  }
  window.addEventListener('cx-kit', (e) => loadKit(e.detail));
  $('rk-list').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !kitRace) return;
    if (!db) { status('rk-status', 'Ticks cannot be saved in this view.', 'err'); return; }
    kit[b.dataset.item] = !kit[b.dataset.item]; paintKit();
    const race = kitRace, body = { race_id: race, checked: { ...kit }, saved_at: new Date().toISOString() };
    kSaving = kSaving.then(() => db.doc('race_kit/' + race).set(body)).catch((err) => status('rk-status', `Not saved (${err && err.code ? err.code : 'error'})`, 'err'));
  });

  (async () => {
    db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null;
    if (!db) {
      for (const id of ['fm-status', 'fs-status']) status(id, 'Saving is not available in this view; reply to the check-in instead.', 'err');
      morningView(null); sessionView(); formState($('t-feel'), null); formState($('t-session'), null); return;
    }
    loadMorning().then(() => formState($('t-feel'), null)); loadSessions().then(() => formState($('t-session'), null)); if (kitRace) loadKit(kitRace);
  })();
})();
