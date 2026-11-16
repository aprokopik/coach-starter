// tasks.js: "When your coach checks in" on the Check-ins tab (6.87.0; the athlete, Nov 16, 2026: "you should be able to modify and
// enable/disable from the dashboard"; layout A of two, one list, "but there should be an add new").
// One row per check-in the coach sends, from the coach rows kind checkin_task (coach/tools/checkin_tasks.py rows(); their one
// home is coach/athlete/checkins.json): the name, a time field and an on/off switch. A tap saves one store document,
// checkin_task/<id> {id, on, time "HH:MM", saved_at}; "Add a check-in" saves {id, kind, name, what, days, time, on, new: true}.
// The coach's side (RUNBOOK "Check-in settings"): every check-in copies the documents first and stays silent when its own is
// off, so Off counts from the tap; the next coach run moves the scheduled task to a new time and makes a new one.
// No store or no rows: the card stays hidden, and the coach chat is the way to change a check-in.
(() => {
  const CX = window.CX;
  const A = () => CX.app;
  const $ = (id) => document.getElementById(id);
  // the same kinds, names, words and times as coach/tools/checkin_tasks.py KINDS (test_checkin_tasks checks they match)
  const KINDS = [['morning', 'Morning', "Today's plan and how ready you are", '07:00', 'daily'], ['evening', 'Evening', 'How today went, three questions at most', '20:30', 'daily'], ['week_review', 'Sunday week review', 'A short look back at the week and ahead to the next', '16:30', 'sun'], ['custom', 'Something else', '', '12:00', 'daily']];
  const MAX = 8;
  const clock = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); if (!m) return ''; const h = +m[1]; return `${(h % 12) || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  let db = null, built = false, docs = new Map(), pick = '';

  // what shows: the coach's rows, each with a newer tap laid over it, then check-ins added here that the coach has not seen
  function list() {
    const rows = ((A().rowsOk('coach') || []).filter((r) => r.kind === 'checkin_task')).sort((a, b) => a.order - b.order);
    const out = rows.map((r) => {
      const d = docs.get(r.id), newer = d && String(d.saved_at || '') > String(r.saved_at || '');
      return { id: r.id, name: r.name, what: r.what || '', on: newer && 'on' in d ? !!d.on : !!r.on, time: newer && d.time ? d.time : r.time, taskTime: r.task_time || '', fresh: r.status === 'new' };
    });
    for (const [id, d] of docs) if (d.new && !rows.some((r) => r.id === id)) out.push({ id, name: d.name, what: d.what || '', on: d.on !== false, time: d.time, taskTime: '', fresh: true, doc: d });
    return out;
  }
  function sub(t) {
    if (!t.on) return ['Off', null];
    if (t.fresh) return ["Starts at your coach's next run", null];
    if (t.taskTime && t.time !== t.taskTime) return [`Moves to ${clock(t.time)} at your coach's next run`, 'tasks.js: your checkin_task tap; the scheduled task keeps its old time until a coach run moves it'];
    return [t.what, null];
  }
  async function save(t, patch, focusId) {
    const st = $('ct-st'), doc = { ...(t.doc || {}), id: t.id, on: t.on, time: t.time, ...patch, saved_at: new Date().toISOString() };
    try {
      await db.doc('checkin_task/' + t.id).set(doc);
      docs.set(t.id, doc);
      st.textContent = 'on' in patch ? (patch.on ? 'Saved. It is back on from its next time.' : 'Saved. It is off from now.') : "Saved. The new time starts after your coach's next run.";
    } catch (e) { st.textContent = 'Not saved. Try again, or tell the coach in chat.'; }
    paint(); const f = focusId && $(focusId); if (f) f.focus();
  }
  function paint() {
    const ul = $('ct-list'), items = list(); ul.replaceChildren();
    for (const t of items) {
      const li = document.createElement('li'); li.className = 'ct-row' + (t.on ? '' : ' off');
      const txt = document.createElement('div'); txt.className = 'ct-t';
      const b = document.createElement('b'); b.textContent = t.name; b.id = 'ct-n-' + t.id;
      const s = document.createElement('span'); const [w, rule] = sub(t); s.textContent = w;
      if (rule) { s.setAttribute('data-derived', 'checkin-time-pending'); s.setAttribute('data-rule', rule); }
      txt.append(b, s);
      const time = document.createElement('input'); time.type = 'time'; time.step = '300'; time.className = 'ck-input ct-time'; time.id = 'ct-t-' + t.id; time.value = t.time; time.disabled = !t.on;
      time.setAttribute('aria-label', t.name + ' time');
      time.addEventListener('change', () => { if (/^\d{2}:\d{2}$/.test(time.value) && time.value !== t.time) save(t, { time: time.value }, time.id); });
      const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'ct-sw'; sw.id = 'ct-s-' + t.id; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(t.on)); sw.setAttribute('aria-labelledby', b.id);
      sw.append(document.createElement('span'));
      sw.addEventListener('click', () => save(t, { on: !t.on }, sw.id));
      li.append(txt, time, sw); ul.append(li);
    }
    // Add a check-in: the kinds not in the list yet, and always "Something else"
    const have = new Set(items.map((t) => t.id)), box = $('ct-kinds'); box.replaceChildren();
    const open = KINDS.filter(([k]) => k === 'custom' || !have.has(k));
    if (pick && !open.some(([k]) => k === pick)) pick = '';
    for (const [k, name] of open) {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'qc-chip' + (pick === k ? ' sel' : ''); c.textContent = name; c.setAttribute('aria-pressed', String(pick === k));
      c.addEventListener('click', () => { pick = pick === k ? '' : k; if (pick) $('ct-time').value = KINDS.find(([v]) => v === k)[3]; paint(); const f = [...box.children].find((x) => x.textContent === name); if (f) f.focus(); });
      box.append(c);
    }
    $('ct-own').hidden = pick !== 'custom';
    $('ct-add-btn').hidden = items.length >= MAX;
    okAdd();
  }
  function okAdd() { $('ct-save').disabled = !pick || !/^\d{2}:\d{2}$/.test($('ct-time').value) || (pick === 'custom' && !$('ct-name').value.trim()); }
  async function add() {
    const k = KINDS.find(([v]) => v === pick); if (!k) return;
    const own = pick === 'custom', name = own ? $('ct-name').value.trim().slice(0, 40) : k[1];
    const id = own ? 'custom-' + slug(name) : pick; if (own && id === 'custom-') return;
    const doc = { id, kind: pick, name, what: own ? $('ct-what').value.trim().slice(0, 120) : k[2], days: k[4], time: $('ct-time').value, on: true, new: true, saved_at: new Date().toISOString() };
    const st = $('ct-st');
    try {
      await db.doc('checkin_task/' + id).set(doc); docs.set(id, doc);
      pick = ''; $('ct-name').value = ''; $('ct-what').value = '';
      const btn = $('ct-add-btn'); btn.setAttribute('aria-expanded', 'false'); $('ct-add').hidden = true;
      st.textContent = `${name} added. Your coach sets it up at its next run.`;
      paint(); btn.focus();
    } catch (e) { st.textContent = 'Not saved. Try again, or tell the coach in chat.'; }
  }

  CX.renderTasks = async function () {
    const card = $('ct'); if (!card || !A()) return;
    if (!built) {
      built = true;
      try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
      if (!db) return;
      try { const q = await db.collection('checkin_task').get(); docs = new Map(q.docs.filter((x) => x.exists).map((x) => [x.id, JSON.parse(JSON.stringify(x.data()))])); } catch (e) { docs = new Map(); }
      if (window.CK && window.CK.init) window.CK.init(card); // the Add a check-in disclosure
      $('ct-save').addEventListener('click', add);
      ['ct-time', 'ct-name'].forEach((id) => $(id).addEventListener('input', okAdd));
    }
    if (!db) return;
    const any = (A().rowsOk('coach') || []).some((r) => r.kind === 'checkin_task');
    card.hidden = !any; if (any) paint();
  };
})();
