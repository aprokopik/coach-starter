// daypick.js: tap a day on Today's This week path to see that day's workout (alpha day_pick; the athlete, Nov 20, 2026: "I would
// like to be able to select these to see the workout"; he picked "Card switches to that day" with the gold ring as the
// marker: "I like the gold ring"). Loaded right after ready.js: reads the app.js helpers from window.CX.app and registers
// window.CX.renderDayPick, which app.js renderPath calls each time it draws the path.
// The picked day takes today's gold ring (today keeps its bold name); the plan card shows that day in place of today:
// a coming day as the coach's day rows with Min / Plan / Max, Effort and More info (the two-session layout of Today),
// a past day as planned beside done from week_view (the Week tab's rows). Back to today, or a tap on today, returns.
// The today-only parts of the card are hidden by one class on the card (style.css), so a redraw of Today cannot undo it.
(() => {
  const A = window.CX.app;
  const { $, N, TN, TODAY, state, el, mark, fWd, P, dayN, isoN, monday, rowsOk, alpha, sizeBar, sessFoot, noTime, hmin, glyphOf, dayRows, statusOf, stBadge, wvWhere, isKey, sportIcon } = A;
  const wvOf = (d) => { const wv = rowsOk('week_view') || []; return (window.CX.movedWeek ? window.CX.movedWeek(wv) : wv).filter((r) => r.date === d).sort((a, b) => (a.order || 0) - (b.order || 0)); };
  const icn = (r) => { const ic = el('span', 'ck-sport td-sport td-sport-s'); ic.append(sportIcon(glyphOf(r)), el('span', 'ck-vh', String(r.type))); return ic; };
  const subLine = (bits) => { const p = el('p', 'td-sub'); bits.forEach((x, i) => { if (i) p.append(' · '); p.append(...x); }); return bits.length ? [p] : []; };
  function focusDay(d) { const b = document.querySelector(`#t-path .td-dbtn[data-d="${d}"]`); if (b) b.focus({ preventScroll: true }); }
  function pick(d) { state.dayPick = d === TODAY ? null : d; draw(); focusDay(d); }
  // a past day: what was planned and what was done, in the Week tab's words (rows from week_view)
  function pastSess(r) {
    const w = wvWhere(r), box = el('div', 'dp-sess'), row = el('div', 'td-sess-row'), st = el('span', 'dp-st');
    st.append(stBadge(statusOf(r), w));
    row.append(icn(r), mark(el('h3', 'ck-session-title', noTime(r.title) || 'Session'), 'week_view', 'title', w), st); box.append(row);
    const bits = [];
    if (isKey(r) && N(r.pillar) !== null) bits.push(['Key ', mark(el('span', null, String(N(r.pillar))), 'week_view', 'pillar', w), ' of 3']);
    if (N(r.minutes) && r.type !== 'rest') bits.push(['Plan ', mark(el('span', null, hmin(N(r.minutes))), 'week_view', null, w, 'h:mm')]);
    box.append(...subLine(bits));
    if (r.done_text) { const p = el('p', 'dp-done'); p.append(el('b', null, 'Done '), mark(el('span', null, r.done_text), 'week_view', 'done_text', w)); if (r.rpe !== null && r.rpe !== undefined) p.append(' · effort ', mark(el('span', null, String(r.rpe)), 'week_view', 'rpe', w), ' of 10'); box.append(p); }
    return box;
  }
  // a coming day: the coach's day rows, each with its sizes, Effort and More info
  function nextSess(r, i) {
    const w = `kind=day&date=${r.date}&order=${r.order}`, box = el('div', 'dp-sess'), row = el('div', 'td-sess-row');
    row.append(icn(r), mark(el('h3', 'ck-session-title', noTime(r.title)), 'coach', null, w, 'title without its time')); box.append(row);
    const bits = [];
    if (r.type !== 'rest' && N(r.pillar) !== null) bits.push(['Key ', mark(el('span', null, String(N(r.pillar))), 'coach', 'pillar', w), ' of 3']);
    if (r.type === 'rest') bits.push(['Rest day']);
    box.append(...subLine(bits));
    if (r.type !== 'rest') box.append(sizeBar(r, w, 'dp' + i), ...sessFoot(r, w));
    return box;
  }
  function dayBody(d) {
    if (dayN(d) < TN) { const its = wvOf(d); return its.length ? its.map(pastSess) : [el('p', 'ck-sub', 'Nothing planned or recorded')]; }
    const rs = dayRows().filter((r) => r.date === d).sort((a, b) => (a.order || 0) - (b.order || 0));
    return rs.length ? rs.map(nextSess) : [el('p', 'ck-sub', 'No plan yet')];
  }
  function draw() {
    const ol = $('t-path'), card = $('t-workout'); if (!ol || !card) return;
    const m0 = dayN(monday(TODAY)), p = state.dayPick, d = p && dayN(p) >= m0 && dayN(p) < m0 + 7 && p !== TODAY ? p : null; state.dayPick = d;
    for (const b of ol.querySelectorAll('.td-dbtn')) { const on = b.dataset.d === (d || TODAY); b.setAttribute('aria-pressed', String(on)); b.parentNode.classList.toggle('is-pick', !!d && b.dataset.d === d); }
    ol.classList.toggle('has-pick', !!d); card.classList.toggle('dp-on', !!d);
    { const old = $('t-dp'); if (old) old.remove(); }
    if (!d) return;
    const pan = el('div', 'dp-pan'); pan.id = 't-dp'; pan.setAttribute('role', 'region'); pan.setAttribute('aria-label', 'Workout for ' + fWd(P(d)));
    const head = el('div', 'dp-head'), back = el('button', 'ck-btn ck-btn--quiet ck-btn--sm dp-back', 'Back to today'); back.type = 'button';
    back.addEventListener('click', () => pick(TODAY));
    head.append(mark(el('b', 'dp-day', fWd(P(d))), null, null, null, 'date'), back);
    pan.append(head, ...dayBody(d));
    ol.after(pan);
  }
  window.CX.renderDayPick = function () {
    const ol = $('t-path'); if (!ol) return;
    if (!alpha('day_pick')) { state.dayPick = null; const c = $('t-workout'); if (c) c.classList.remove('dp-on'); return; }
    const m0 = dayN(monday(TODAY));
    [...ol.children].forEach((li, i) => {
      const d = isoN(m0 + i), b = el('button', 'td-dbtn'); b.type = 'button'; b.dataset.d = d;
      b.append(...li.childNodes); li.append(b);
      b.addEventListener('click', () => pick(d));
    });
    ol.setAttribute('aria-label', "This week's sessions: tap a day to see its workout");
    draw();
  };
})();
