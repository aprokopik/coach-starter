// review.js: change a pencilled week by tap (alpha week_review, 6.117.0). Two places, one builder:
// - Today, "Next week" (#t-nw; the athlete's pick, option 1 of five, Nov 16, 2026): from the plan check day (row kind plan_check)
//   through Sunday (the athlete, Nov 16: "only populate in today tab on a friday/sat/sunday"), next Mon to Sun as the This week path with Looks good, Change a day and Busy week.
// - Week tab, any pencilled week (#w-nw; the athlete, Nov 16: "always go into a future week on the weekly and look at the penciled in
//   to move things around"): Change a day and Busy week under the week note; the day list above is the picture.
// Both save week_review/<that Monday> (one document a week, shared); coach/tools/week_review.py and RUNBOOK "Next week review"
// move the rows, and the line under the controls then reads "Updated <time>: <note>" from the coach row kind week_review.
(() => {
  const CX = window.CX;
  const A = () => CX.app;
  const $ = (id) => document.getElementById(id);
  // the same keys, in the same order, as coach/tools/week_review.py ANSWERS and WHAT (test_week_review checks they match)
  const ANSWERS = [['good', 'Looks good'], ['change', 'Change a day'], ['busy', 'Busy week']];
  const WHAT = [['no_train', "Can't train"], ['short', 'Short on time'], ['travel', 'Travel'], ['move', 'Move this session']];
  const SHORT = { no_train: "Can't", short: 'Short', travel: 'Travel', move: 'Move' }; // under a day you flagged (the athlete, Nov 16: blue plus a short word)
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const word = (list, k) => (list.find(([v]) => v === k) || [k, k])[1];
  const clock = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }); };
  const alpha = (id) => !!(A() && A().kind('alpha').some((b) => b.id === id));
  const FORCE = /[?&]review=show\b/.test(location.search); // harness renders on any weekday
  let db = null, dbTried = false;
  const saved = {}; // week -> the store document as last read or written (undefined: not read yet)

  async function store() { if (!dbTried) { dbTried = true; try { db = await CX.store(); } catch (e) { db = null; } } return db; }
  async function load(wk) {
    if (saved[wk] !== undefined || !db) return;
    try { const d = await db.doc('week_review/' + wk).get(); saved[wk] = d.exists ? d.data() : null; } catch (e) { saved[wk] = null; }
  }
  const live = (wk) => (saved[wk] && !saved[wk].cleared ? saved[wk] : null);
  function dayRows(d) { return A().kind('day').filter((r) => r.date === d); }
  function keyOf(rs) { const { truthy, N } = A(); return rs.find((r) => r.type !== 'rest' && (truthy(r.key) || N(r.pillar) !== null)); }
  const dowOf = (d) => DOW[(A().P(d).getDay() + 6) % 7];
  function btn(cls, txt, fn) { const b = A().el('button', cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; }

  // One mount: a root element, the week it shows, and whether it draws the path and offers Looks good (Today) or not (Week tab)
  function mount(root, opts) {
    const m = { root, wk: '', open: false, cur: null, picks: {}, busy: false, path: !!opts.path, good: !!opts.good, onSent: opts.onSent };
    m.set = (wk) => { if (wk === m.wk) return; m.wk = wk; m.open = false; m.cur = null; const s = live(wk); m.picks = {}; if (s && s.answer === 'change') for (const x of s.days || []) m.picks[x.date] = x.what; };
    m.paint = () => paint(m);
    return m;
  }

  function paintPath(m, box) {
    const { el, isoN, dayN, N, mark, hm } = A(), ol = el('ol', 'td-path td-nw-path'); ol.setAttribute('aria-label', "Next week's sessions"); mark(ol, 'coach', null, null, 'next-week-path');
    const m0 = dayN(m.wk); let mins = 0, keys = 0, any = false;
    for (let i = 0; i < 7; i++) {
      const d = isoN(m0 + i), rs = dayRows(d), key = keyOf(rs), planned = rs.some((r) => r.type !== 'rest' && N(r.minutes) !== 0);
      const mn = rs.reduce((s, r) => s + (N(r.minutes) || 0), 0); mins += mn; if (rs.length) any = true; if (key) keys++;
      const flag = m.picks[d];
      const li = el('li', 'td-day' + (flag ? ' is-flag' : '')), nd = el('span', 'td-node' + (key ? ' is-key' : '') + (!planned ? ' is-rest' : '') + (flag ? ' is-flag' : ''));
      nd.append(el('b', null, key ? String(N(key.pillar) !== null ? N(key.pillar) : 'K') : planned ? '' : '·')); nd.setAttribute('aria-hidden', 'true');
      const len = flag ? el('span', 'td-nw-min is-flag', SHORT[flag] || '') : el('span', 'td-nw-min', mn ? (mn >= 60 ? `${Math.floor(mn / 60)}:${String(mn % 60).padStart(2, '0')}` : `${mn}m`) : '');
      if (mn && !flag) mark(len, 'coach', 'minutes', 'kind=day&date=' + d);
      const sg = el('span', 'td-nw-sg'); sg.setAttribute('aria-hidden', 'true'); // the Week tab's sport glyphs, one per session (the athlete, Nov 16)
      for (const r of rs) if (r.type && r.type !== 'rest' && A().sportIcon) sg.append(A().sportIcon(r.type));
      li.append(nd, sg, el('span', 'td-dow', DOW[i]), len,
        el('span', 'ck-vh', (rs.length ? ': ' + rs.map((r) => r.title).join(', ') : ': nothing written') + (key ? `, key session ${N(key.pillar) || ''}` : '') + (flag ? `, you said ${word(WHAT, flag).toLowerCase()}` : '')));
      ol.append(li);
    }
    const sum = el('p', 'td-nw-sum');
    if (any) {
      const a = mark(el('span', null, hm(mins)), null, null, null, 'next-week-minutes'), b = mark(el('span', null, String(keys)), null, null, null, 'next-week-keys');
      a.setAttribute('data-rule', "review.js: sum of next week's day row minutes"); b.setAttribute('data-rule', 'review.js: key day rows (key or pillar) from Mon to Sun of next week');
      sum.append(a, ' planned · ', b, ` key session${keys === 1 ? '' : 's'}`);
    } else sum.textContent = "Next week isn't written yet. Tell the coach what's coming up and Sunday's plan is built around it.";
    box.append(ol, sum);
    return any;
  }

  function paintChange(m, box) {
    const { el, N, isoN, dayN } = A(), m0 = dayN(m.wk);
    const panel = el('div', 'td-nw-chg');
    const f1 = el('fieldset', 'td-chg-why'); f1.append(el('legend', 'td-chg-l', 'Which day?'));
    const days = el('div', 'td-nw-days');
    for (let i = 0; i < 7; i++) {
      const d = isoN(m0 + i), b = btn('qc-chip td-nw-day' + (m.cur === d ? ' sel' : '') + (m.picks[d] ? ' is-flag' : ''), DOW[i], () => { m.cur = m.cur === d ? null : d; paint(m); const f = m.root.querySelectorAll('.td-nw-day')[i]; if (f) f.focus(); });
      b.setAttribute('aria-pressed', String(m.cur === d)); if (m.picks[d]) b.setAttribute('aria-label', `${DOW[i]}, ${word(WHAT, m.picks[d])}`);
      days.append(b);
    }
    f1.append(days); panel.append(f1);
    if (m.cur) {
      const rs = dayRows(m.cur), key = keyOf(rs), f2 = el('fieldset', 'td-chg-why');
      f2.append(el('legend', 'td-chg-l', "What's true that day?"), el('p', 'td-nw-dayt', `${dowOf(m.cur)}: ` + (rs.length ? rs.map((r) => r.title).join(' + ') + (key ? ` (key ${N(key.pillar) || ''})` : '') : 'nothing planned yet')));
      const what = el('div', 'qc-chips');
      for (const [k, w] of WHAT) { const b = btn('qc-chip' + (m.picks[m.cur] === k ? ' sel' : ''), w, () => { if (m.picks[m.cur] === k) delete m.picks[m.cur]; else m.picks[m.cur] = k; paint(m); }); b.setAttribute('aria-pressed', String(m.picks[m.cur] === k)); what.append(b); }
      f2.append(what); panel.append(f2);
    }
    const nid = m.root.id + '-note', lb = el('label', 'td-chg-l', 'Anything the coach should know? '); lb.htmlFor = nid; lb.append(el('span', 'ck-sub', 'Optional'));
    const inp = el('input', 'ck-input'); inp.id = nid; inp.type = 'text'; inp.maxLength = 200; inp.autocomplete = 'off'; inp.value = m.note || ''; inp.addEventListener('input', () => { m.note = inp.value; });
    const act = el('div', 'td-chg-act'), send = btn('ck-btn ck-btn--primary', 'Send to the coach', () => sendIt(m, 'change'));
    send.disabled = m.busy || !Object.keys(m.picks).length;
    act.append(send, btn('ck-btn ck-btn--quiet', 'Cancel', () => { m.open = false; m.cur = null; paint(m); }));
    panel.append(lb, inp, act); box.append(panel);
  }

  function statusLine(m) {
    const { el, mark } = A(), st = el('p', 'td-chg-st'); st.setAttribute('role', 'status');
    const row = A().kind('week_review').find((r) => r.week === m.wk) || null, s = live(m.wk);
    if (row && row.status === 'done' && (!s || String(row.saved_at || '') >= String(s.saved_at || ''))) {
      st.append(row.answer === 'good' && !s ? 'Looks good. ' : `Updated ${clock(row.done_at)}: `, mark(el('span', null, row.done_note || 'the week is updated.'), 'coach', 'done_note', 'kind=week_review&week=' + m.wk));
    } else if (s) {
      const days = (s.days || []).map((x) => `${dowOf(x.date)} ${word(WHAT, x.what).toLowerCase()}`).join(', ');
      st.append(s.answer === 'good' ? `Looks good, saved ${clock(s.saved_at)}. Sunday firms up the week as it is.`
        : `${word(ANSWERS, s.answer)}${days ? ': ' + days : ''}, sent ${clock(s.saved_at)}. The coach moves the pencilled days by ${CX.nextUpdate ? CX.nextUpdate() : 'the next update'}.`);
    }
    if (m.err) { st.replaceChildren('Not saved. Try again, or tell the coach in chat.'); }
    return st.childNodes.length ? st : null;
  }

  function paint(m) {
    const { el } = A(), box = m.root.querySelector('.td-nw-body'); box.replaceChildren();
    const any = m.path ? paintPath(m, box) : A().kind('day').some((r) => r.date >= m.wk && r.date <= A().isoN(A().dayN(m.wk) + 6));
    const s = live(m.wk);
    if (!s && !m.open) {
      const act = el('div', 'td-nw-act' + (m.good ? '' : ' is-two'));
      if (m.good && any) act.append(btn('ck-btn ck-btn--primary', 'Looks good', () => sendIt(m, 'good')));
      act.append(btn('ck-btn', 'Change a day', () => { m.open = true; paint(m); const f = m.root.querySelector('.td-nw-day'); if (f) f.focus(); }), btn('ck-btn', 'Busy week', () => sendIt(m, 'busy')));
      box.append(act);
    }
    if (m.open) paintChange(m, box);
    const st = statusLine(m); if (st) box.append(st);
    if (s && !m.open) box.append(btn('ck-btn ck-btn--quiet', 'Change my answer', () => sendIt(m, null, true)));
  }

  async function sendIt(m, answer, cleared) {
    const now = new Date().toISOString(), prev = live(m.wk);
    const doc = cleared ? { ...(prev || { week: m.wk, answer: 'change', days: [], note: '' }), cleared: true, saved_at: now }
      : { week: m.wk, answer, days: answer === 'change' ? Object.entries(m.picks).sort().map(([date, what]) => ({ date, what })) : [], note: answer === 'good' ? '' : String(m.note || '').trim().slice(0, 200), saved_at: now };
    m.busy = true; m.err = false; paint(m);
    try {
      await db.doc('week_review/' + m.wk).set(doc);
      saved[m.wk] = doc; m.open = false; m.cur = null;
      if (cleared) { m.picks = {}; m.note = ''; }
    } catch (e) { m.err = true; }
    m.busy = false; paint(m);
    if (m.onSent) m.onSent(m.wk);
  }

  let today = null, week = null;
  function shell(root) { if (!root.querySelector('.td-nw-body')) root.append(A().el('div', 'td-nw-body')); }

  // Today: the Next week card on the plan check day
  CX.renderReview = async function () {
    const card = $('t-nw'); if (!card || !A()) return;
    if (!alpha('week_review') || !(await store())) { card.hidden = true; return; }
    const { TODAY, dayN, monday, isoN, P, fDay, kind, el, mark } = A(), wk = isoN(dayN(monday(TODAY)) + 7);
    await load(wk);
    const pc = kind('plan_check')[0], di = DOW.indexOf(pc ? String(pc.day || 'Fri').slice(0, 3) : 'Fri'), ti = (P(TODAY).getDay() + 6) % 7;
    if (!(FORCE || ti >= di)) { card.hidden = true; return; }
    shell(card);
    if (!today) today = mount(card, { path: true, good: true, onSent: (w) => { if (week && week.wk === w) week.paint(); } });
    today.set(wk);
    const meta = kind('week').find((r) => r.week_start === wk), pen = !!meta && String(meta.status || '') === 'pencilled';
    $('t-nw-dates').textContent = `${fDay(P(wk))} to ${fDay(P(isoN(dayN(wk) + 6)))}`;
    const tag = $('t-nw-tag'); tag.replaceChildren();
    if (pen) tag.append(mark(el('span', 'td-nw-pen', 'Pencilled'), 'coach', 'status', 'kind=week&week_start=' + wk), ` · firms up ${fDay(P(isoN(dayN(wk) - 1)))}`);
    card.classList.toggle('wk-pencil', pen);
    card.hidden = false; today.paint();
  };

  // Week tab: any pencilled week (app.js renderWeek calls this with the week shown)
  CX.renderWeekReview = async function (wk) {
    const box = $('w-nw'); if (!box || !A()) return;
    const meta = A().kind('week').find((r) => r.week_start === wk);
    if (!alpha('week_review') || !meta || String(meta.status || '') !== 'pencilled' || !(await store())) { box.hidden = true; return; }
    await load(wk);
    if (A().state.week !== wk) return; // the person moved on while the store answered
    shell(box);
    if (!week) week = mount(box, { path: false, good: false, onSent: (w) => { if (today && today.wk === w) today.paint(); } });
    week.set(wk); box.hidden = false; week.paint();
  };
})();
