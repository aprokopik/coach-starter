// plan.js: the Doing the plan card on Today (roadmap week 2, Measure, Nov 2026). the athlete asked on Nov 11, 2026 to blend the
// three outcomes into the key sessions visual: one grid, four rows (key sessions, days on plan, easy days kept easy, lifts
// done) by Monday to Sunday week, the last two finished weeks and this week. Each cell is a battery with one segment per planned
// item: green when done, solid red when missed, grey when still to come (the athlete, Nov 11: mark the miss in the cell, not
// a block of text). Tap a cell for that week's one line reason. No digits on the card; the counts are in each cell's label
// for screen readers. A dashed outline is a week with nothing planned for that row.
// Key sessions come from app.js adhOf (week_view, the Week card's rule); the outcomes from coach rows kind outcome_week
// (coach/tools/outcomes.py, the same numbers as the Sunday check-in line). Replaces the S-A "two lines" body of Nov 5.
(() => {
  const CX = window.CX;
  const A = () => CX.app;
  const WEEKS = 3; // the last two finished weeks and this one
  const ROWS = [
    { id: 'key', label: 'Key sessions' },
    { id: 'plan', label: 'Days on plan', done: 'on_plan', n: 'scored' },
    { id: 'easy', label: 'Easy days kept easy', done: 'easy_kept', n: 'easy_done' },
    { id: 'lift', label: 'Lifts done', done: 'lifts_done', n: 'lifts_target', n0: 'lifts_planned' },
  ];
  const WHERE = { key: 'key sessions in Week totals', plan: 'days on plan in the Sunday check-in', easy: 'easy days in the Sunday check-in', lift: 'lifts on the Lifts tab' }; // the rows a habits card leaves out
  const KEY_DONE_RULE = 'app.js weekAdh: keys done (done, fallback, swapped, or a key rest day rested) of the week\'s key slots, three from KEY_RULE_FROM';
  const OUT_RULE = 'coach/tools/outcomes.py: days on plan = rest, fallback, nominal or upper of scored days; easy kept easy = no overrun and avg HR at or under the guardrail; lifts done = days with a lift on record, planned or not, of lifts_target (the profile\'s strength minimum, or the planned lifts when more; 6.36.0)';

  const TAP = !/[?&]plan=plain\b/.test(location.search); // plain: the no-tap render for the options picture
  // The battery is the picture (role img, its count in the label); the figure it shows sits in a hidden, marked span so the
  // data-mark check reads it (aria-hidden: the label already says it). pend = segments still to come (this week's key slots).
  function cell(a, n, pend, now, label, markFig) {
    const { el } = A();
    if (!n) { const e = el('span', 'pl-na'); e.setAttribute('role', 'img'); e.setAttribute('aria-label', label + ': nothing planned'); return e; }
    const miss = Math.max(0, n - a - pend);
    const b = el('span', 'pl-bat' + (now ? ' is-now' : ''));
    b.setAttribute('role', 'img'); b.setAttribute('aria-label', `${label}: ${a} of ${n} done` + (miss ? `, ${miss} missed` : '') + (pend ? `, ${pend} to come` : ''));
    for (let k = 0; k < n; k++) b.append(el('i', k < a ? 'on' : k < a + miss ? 'miss' : null));
    const fig = markFig(el('span', 'ck-vh', String(a))); fig.setAttribute('aria-hidden', 'true'); b.append(fig);
    return b;
  }
  const dows = (list) => list.map((d) => A().fDow(A().P(d))).join(', ');
  // Short reasons (the athlete, Nov 11: no line runs under the label at 360 px). An easy day names the HR when HR broke it,
  // else "ran long"; the full why stays in the coach row.
  const easyWhy = (why) => { const m = /avg HR (\d+) over (\d+)/.exec(why); return m ? `HR ${m[1]}, target ${m[2]}` : /RPE/.test(why) ? why.replace('rated ', '').replace(/RPE (\d+)/, 'effort $1 of 10') : 'ran long'; };
  function reasons(row, keyWeek) {
    const out = [];
    if (keyWeek && keyWeek.kN) {
      const miss = keyWeek.ks.filter((x) => !(x.row && ['done', 'fallback', 'swapped', 'rest'].includes(x.row.status)));
      out.push(['key', miss.length ? `Missed ${miss.map((x) => (x.row && x.row.title) || 'an open slot').join(', ')}` : 'All done']);
    }
    if (row) {
      const md = String(row.missed_days || '').split(';').filter(Boolean);
      out.push(['plan', row.scored ? (md.length ? `Off plan ${dows(md)}` : 'All on plan') : 'No days scored']);
      const eb = String(row.easy_broke || '').split(';').filter(Boolean).map((x) => x.split('|'));
      out.push(['easy', !Number(row.easy_done) ? 'None done' : eb.length ? eb.map(([d, t, why]) => `${A().fDow(A().P(d))} ${t}, ${easyWhy(why)}`).join('; ') : 'All kept easy']);
      const sk = String(row.lifts_skipped || '').split(';').filter(Boolean), ul = String(row.lifts_unlogged || row.lifts_missing || '').split(';').filter(Boolean);
      // 6.36.0 (the athlete, Nov 14, 2026, option A): every lift counts, out of the week's target; a short week says how many to go
      const ld = String(row.lifts_days || '').split(';').filter(Boolean), lt = Number(row.lifts_target != null ? row.lifts_target : row.lifts_planned) || 0;
      const togo = Math.max(0, lt - Number(row.lifts_done || 0));
      out.push(['lift', [ld.length ? `Done ${dows(ld)}` : 'None yet', sk.length ? `Skipped ${dows(sk)}` : '', ul.length ? `Not logged ${dows(ul)}` : '',
        togo ? (row.partial ? `${togo} more to reach ${lt}` : `${togo} short of ${lt}`) : ''].filter(Boolean).join('; ')]);
    }
    return out;
  }

  CX.renderPlanCard = function () {
    const { $, el, mark, ruleSpan, monday, dayN, isoN, TODAY, adhOf, kind, fDay, P } = A(); const KEY_RULE_FROM = window.CX.keyFrom();
    const card = $('t-adh'), body = $('t-adh-body'); body.replaceChildren(); card.hidden = true;
    const adh = adhOf(), outs = kind('outcome_week'), tN = dayN(TODAY);
    const w0 = dayN(monday(TODAY)), weeks = Array.from({ length: WEEKS }, (_, i) => isoN(w0 - 7 * (WEEKS - 1 - i)));
    // weeks before the person's own first week show nothing at all: no date, no empty boxes (a new coach has no past)
    const first = (() => { const s = window.CX.startDay && window.CX.startDay(); return s ? monday(s) : null; })();
    const before = (w) => !!first && w < first;
    const keyBy = {}; if (adh) for (const w of adh.strip) keyBy[w.wk] = w;
    const outBy = {}; for (const r of outs) outBy[r.start] = r;
    if (!weeks.some((w) => keyBy[w] || outBy[w])) return;
    card.hidden = false;
    const grid = el('div', 'pl-grid'); grid.setAttribute('role', 'table'); grid.setAttribute('aria-label', 'Doing the plan by week');
    const head = el('div', 'pl-row pl-head'); head.setAttribute('role', 'row'); head.append(el('span', null, ''));
    weeks.forEach((w, i) => { const h = el('span', i === WEEKS - 1 ? 'is-now' : null, i === WEEKS - 1 ? 'This week' : before(w) ? '' : fDay(P(w))); h.setAttribute('role', 'columnheader'); head.append(h); });
    grid.append(head);
    const why = el('p', 'pl-why'); why.id = 't-adh-why'; why.setAttribute('aria-live', 'polite'); why.hidden = true;
    let open = null;
    // Habits to build (the athlete, Nov 15, 2026: this card "is actually about habit forming and specifically what each individual needs to work on"):
    // only the rows the coach and the athlete agreed (profile.json habits, BLOCK-BRIEF.md 2.5); none agreed shows all four
    const hab = kind('habits')[0], pick = hab ? String(hab.rows || '').split('|').filter((k) => ROWS.some((r) => r.id === k)) : [];
    $('t-adh-h').textContent = pick.length ? 'Habits to build' : 'Doing the plan';
    for (const r of pick.length ? ROWS.filter((x) => pick.includes(x.id)) : ROWS) {
      const line = el('div', 'pl-row'); line.setAttribute('role', 'row');
      const lab = el('span', 'pl-lab', r.label); lab.setAttribute('role', 'rowheader'); line.append(lab);
      weeks.forEach((w, i) => {
        const now = i === WEEKS - 1, when = now ? 'this week' : 'week of ' + fDay(P(w)), wlab = `${r.label}, ${when}`;
        if (before(w)) { const none = el('span', 'pl-none'); none.setAttribute('role', 'cell'); line.append(none); return; }
        let c, n;
        if (r.id === 'key') {
          const k = w >= KEY_RULE_FROM ? keyBy[w] : null; n = k ? k.kN : 0;
          // this week's key slots dated today or later, or not yet filled, are still to come, not missed
          const pend = k && now ? k.ks.filter((x) => !(x.row && ['done', 'fallback', 'swapped'].includes(x.row.status)) && (!x.row || !x.row.date || dayN(x.row.date) >= tN)).length : 0;
          c = cell(k ? k.kDone : 0, n, pend, now, wlab, (e) => { mark(e, 'week_view', null, 'week=' + w, 'key-done'); e.setAttribute('data-rule', KEY_DONE_RULE); return e; });
        } else {
          const o = outBy[w], a = o ? Number(o[r.done]) || 0 : 0;
          // lifts: rows before 6.36.0 have no lifts_target, so fall back to lifts_planned; extra lifts get their own segment
          n = o ? Number(o[r.n] != null ? o[r.n] : o[r.n0]) || 0 : 0; if (r.id === 'lift') n = Math.max(n, a);
          // this week's lifts still short of the target are to come (grey), not missed, until the week ends
          const pend = r.id === 'lift' && now && o && o.partial ? Math.max(0, n - a) : 0;
          c = cell(a, n, pend, now, wlab, (e) => mark(e, 'coach', r.done, `kind=outcome_week&start=${w}`));
        }
        const rs = n && TAP ? reasons(outBy[w], w >= KEY_RULE_FROM ? keyBy[w] : null).find((x) => x[0] === r.id) : null;
        if (rs) {
          const bt = el('button', 'pl-tap'); bt.type = 'button'; bt.setAttribute('aria-expanded', 'false'); bt.setAttribute('aria-controls', 't-adh-why');
          bt.append(c);
          bt.addEventListener('click', () => {
            const same = open === bt; if (open) { open.setAttribute('aria-expanded', 'false'); open.classList.remove('is-open'); }
            open = same ? null : bt; why.hidden = same; if (same) return;
            bt.setAttribute('aria-expanded', 'true'); bt.classList.add('is-open');
            why.replaceChildren(el('b', null, `${r.label}, ${when}: `), mark(el('span', null, rs[1]), r.id === 'key' ? 'week_view' : 'coach', null, r.id === 'key' ? 'week=' + w : `kind=outcome_week&start=${w}`, 'reason-' + r.id));
          });
          const td = el('span', 'pl-td'); td.setAttribute('role', 'cell'); td.append(bt); line.append(td);
        } else { c.setAttribute('role', 'cell'); line.append(c); }
      });
      grid.append(line);
    }
    // plain reading (6.47.0): the key under the grid, so a first reader needs no disclosure to read the colours; a missed
    // segment is an outlined empty step and one to come is dotted, so the cell never reads by colour alone (WCAG 1.4.1;
    // game look pass, the athlete's pick 1, Nov 14, 2026: no red stripes)
    const key = el('p', 'pl-key'); key.setAttribute('aria-hidden', 'true');
    for (const [c, w] of [['on', 'Done'], ['miss', 'Missed'], ['', 'To come']]) { const k = el('span', 'pl-k'); k.append(el('i', c || null), w); key.append(k); }
    if (TAP) key.append(el('span', 'pl-k pl-k-tap', 'Tap a cell for why'));
    body.append(grid, key, why);
    if (pick.length) { const hn = el('p', 'ck-note'); hn.append('Agreed ', mark(el('span', null, fDay(P(hab.confirmed))), 'coach', 'confirmed', 'kind=habits'), ' with your coach; new ones come with each block brief.'); const rest = ROWS.filter((x) => !pick.includes(x.id)).map((x) => WHERE[x.id]); if (rest.length) hn.append(' Also tracked: ', rest.join(', '), '.'); body.append(hn); }
    const r = $('t-adh-rule'); r.replaceChildren('Each step is one planned item: filled done, outlined missed, dotted still to come. ' + (TAP ? 'Tap a cell for the reason. ' : '') + 'Key sessions: the session at any size (Min, Plan or Max) or a swap; a key rest day counts when you rest. Days on plan: rest, or the session at Min, Plan or Max, scored against the plan that stood at the end of the day. Easy days kept easy: not longer than Max, average heart rate at or under the easy limit (150 running, 135 riding). Lifts done: every lift on the watch, the Lifts tab, the session form or the morning tap, planned or not, out of 2 a week (more when the plan has more); lifts still to do this week are grey. ', ruleSpan('Weeks run Monday to Sunday', OUT_RULE), '.');
  };
})();
