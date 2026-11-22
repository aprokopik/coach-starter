// ready.js: Today's Readiness card beyond the coach's call. The survey's early read and feel meter (alpha survey_read),
// the one readiness level Primed / Ready / Ease off / Stressed with the day strip, confidence bars and Survey and Watch ticks
// (alpha one_readiness), and the offer to move a key session (saved through change.js CX.sendMove). Moved out of app.js
// (6.151.0) so app.js stays under the 256 KB per-file cap. Loaded right after app.js: it reads the app.js helpers from
// window.CX.app and registers window.CX.renderEarly, which app.js renderToday, ask.js and change.js call.
(() => {
  const { $, N, TN, state, renderBound, renderPath, renderToday, renderWeek, TODAY, READY_S, READY_MEAN, ST_NAME, alpha, badge, dayN, el, f1, icon, isoN, kind, neutralChip, nmBar, now, rowsOk, show, truthy } = window.CX.app;
  // Early read (the athlete, Nov 18, 2026, option 3; alpha survey_read): before the call, the answers against the coach's thresholds
  // (feel_rule, schemas.json); with last night not in, the meter shows this morning's feel against the mornings before it
  const FEELK = ['sleep_q', 'energy', 'legs'];
  const feelScore = (d) => { const v = [...FEELK.map((k) => N(d[k])), N(d.stress) === null ? null : 6 - N(d.stress)].filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  // The mornings before today and "a full point under your usual" (RULES 5a), shared by surveyRead and oneReady
  function feelCtx(r) {
    const past = kind('feel_day').filter((d) => Number(d.scale) === 5 && d.date < TODAY);
    const ref = (k, before) => { const v = past.filter((d) => d.date < before && dayN(d.date) >= dayN(before) - N(r.feel_reference_days)).map((d) => (k ? N(d[k]) : feelScore(d))).filter((x) => x !== null); return v; };
    const avg = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const Y = isoN(TN - 1), yd = past.find((d) => d.date === Y), dp = N(r.feel_departure_points);
    const low = (d, at) => FEELK.some((k) => { const v = ref(k, at); return d && N(d[k]) !== null && v.length && N(d[k]) - avg(v) <= -dp; });
    // spread never under a full point: answers move in whole steps (6.154.0)
    const z = (d) => { const sc = ref(null, TODAY), n = sc.length, s0 = d && feelScore(d); if (n < N(r.feel_meter_min_mornings) || s0 == null) return null;
      const m = avg(sc), sd = Math.sqrt(sc.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { v: Math.round((s0 - m) / Math.max(sd, dp) * 10) / 10, n }; };
    return { past, ref, avg, Y, yd, low, z };
  }
  function surveyRead() {
    const note = $('t-early'), r = kind('feel_rule')[0], t = kind('today')[0], f = window.CX.feelToday;
    if (note) note.hidden = true;
    if (!alpha('survey_read') || !r || !t) return;
    const pre = t.date !== TODAY, mb = $('t-nm-btn'); // pre: before today's call
    if (!f || !f.saved_at || feelScore(f) === null) { if (!pre) return; // no answers yet: No info yet asks for them (the athlete, Nov 18, 2026)
      const watch = (rowsOk('night') || []).length > 0, go = el('button', 'qc-link td-early-go', 'Do your morning check-in'); go.type = 'button';
      go.addEventListener('click', () => { const c = $('t-qc'), b = c && !c.hidden && c.querySelector('.qc-tile'); if (b) { c.scrollIntoView({ block: 'center' }); b.focus(); } else { show('checkins', true); if (window.CX.openMorning) setTimeout(window.CX.openMorning, 60); } });
      $('t-ready-m').replaceChildren(go);
      note.replaceChildren(watch ? 'Your answers make today\'s call more accurate.' : 'Your answers give an early read right away.'); note.hidden = false;
      const mb0 = $('t-nm-btn'); if (mb0.parentNode && note.nextSibling !== mb0) mb0.before(note);
      return;
    }
    const { yd, Y, low, z } = feelCtx(r);
    if (pre) { // one readiness on the card (the athlete, Nov 18): after the call a late survey adds no second read
    const p = N(f.pain) || 0, fb = N(r.feel_fallback_at_or_below), e = N(f.energy), l = N(f.legs);
    const call = p >= N(r.pain_stop) ? 'RED' : p >= N(r.pain_hurts) || (e !== null && e <= fb) || (l !== null && l <= fb) || (low(f, TODAY) && low(yd, Y)) ? 'YELLOW' : 'GREEN';
    const strong = call === 'GREEN' && e >= N(r.feel_strong_day_at_or_above) && l >= N(r.feel_strong_day_at_or_above);
    const rs = READY_S[call], g = $('t-ready-g'), rd = $('t-ready'), rm = $('t-ready-m');
    g.dataset.s = rs; g.replaceChildren(icon(rs, 'ck-g')); $('t-ready-sr').textContent = ST_NAME[rs] + ': '; rd.textContent = call; rd.setAttribute('data-derived', 'early read from this morning\'s survey');
    rd.setAttribute('data-rule', 'ready.js surveyRead: pain Stop RED; Hurts, energy or legs at feel_fallback_at_or_below or two low mornings YELLOW; else GREEN (schemas.json, RULES 5a and 6)');
    rm.textContent = strong ? 'Train as planned. The strong-day size is on offer' : READY_MEAN[call]; rm.hidden = false;
    note.replaceChildren('Early read from your survey.'); note.hidden = false;
    if (mb.parentNode && note.nextSibling !== mb) mb.before(note);
    }
    const gz = rowsOk('night_gauge'), nr = gz && gz[0];
    if (nr && nr.date === TODAY && N(nr.value) !== null) return; // last night is in: its own meter stays
    const fz = z(f); if (!fz) return;
    const { v, n } = fz, a = Math.abs(v), word = a < 1 ? 'Typical' : (a >= 2 ? 'Well ' : '') + (v > 0 ? (a >= 2 ? 'high' : 'High') : (a >= 2 ? 'low' : 'Low'));
    const s = a < 1 ? 'good' : v <= -1.5 ? 'watch' : 'plain';
    delete mb.dataset.learn; mb.hidden = false; const scl = mb.querySelector('.td-nm-scale'); if (scl) scl.hidden = false;
    mb.querySelector('.td-nm-k').textContent = "This morning's feel";
    const nv = $('t-nm-v'); nv.textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + f1(a); nv.removeAttribute('data-field'); nv.setAttribute('data-derived', 'survey feel vs the mornings before');
    $('t-nm-word').replaceChildren(s === 'plain' ? neutralChip(word) : badge(s, word));
    const TR = nmBar(v, s);
    mb.setAttribute('aria-label', `This morning's feel ${nv.textContent} SD, ${word}, against your last ${n} mornings, on a scale from -${TR} to +${TR} sigma. Show last night's vitals`);
  }
  // Based on (the athlete, Nov 18, 2026: "some kind of indication if you've done either just the survey or just have watch data"):
  // what today's read has in, beside the confidence: the survey, last night from the watch, both or neither
  function basedOn() {
    const e = $('t-src'); if (!e) return; e.hidden = true;
    if (!alpha('survey_read') || alpha('one_readiness')) return; // one readiness says it in chips (oneTop)
    const f = window.CX.feelToday, row = kind('feel_day').some((d) => d.date === TODAY);
    const nt = rowsOk('night') || [], wt = nt.some((r) => r.date === TODAY && r.value !== null && r.value !== undefined);
    const sv = row || !!(f && f.saved_at);
    e.textContent = sv && wt ? 'Survey and watch' : sv ? 'Survey only' : wt ? 'Watch only' : 'Nothing yet';
    e.dataset.s = sv && wt ? 'good' : sv || wt ? 'part' : 'none'; e.hidden = false;
  }
  // One readiness (the athlete, Nov 18, 2026: "There should only be one indication of readiness that either comes from just the
  // watch, just the survey, or both combined"; Primed rule A, three nights at or above normal). The same table as
  // morning_facts.section_readiness_level (RULES 5, One readiness), thresholds from the feel_rule row, never restated.
  // After the call the coach's level stands; a survey saved later moves it by the table, never above a level the coach lowered.
  const LEVEL = { primed: ['Primed', 'good', 'Take the bigger size'], ready: ['Ready', 'good', 'Train as planned'], ease_off: ['Ease off', 'watch', 'Take the shorter or easier size'], stressed: ['Stressed', 'act', 'Stop the planned stress today'] };
  const SIZE = { primed: 'upper', ready: 'nominal', ease_off: 'fallback' };
  const LOW_SD = 1; const LEVEL_OF = { GREEN: 'ready', YELLOW: 'ease_off', RED: 'stressed' }, RANK = ['stressed', 'ease_off', 'ready', 'primed'];
  // The card's top (the athlete, Nov 18, 2026: the day on top; "chips in the top right corner ... confidence, it'll always be in the
  // same place, as well as survey, and then watch ... grey if you don't have it yet, or green if you do, and then confidence
  // can be color-coded"; "as small vertically that's still well legible")
  function oneTop() {
    const hero = $('t-hero'), on = alpha('one_readiness'); hero.classList.toggle('td-one', on); $('t-day').hidden = !on; $('t-rchips').hidden = !on;
    hero.querySelector('.ck-tile-head').classList.toggle('ck-vh', on);
    if (!on) return;
    // today's forecast on the right of the strip (alpha day_weather; a coach row kind weather, only when today has one)
    { const wx = $('t-wx'), w = alpha('day_weather') ? kind('weather').find((x) => x.date === TODAY && N(x.high_f) !== null && N(x.low_f) !== null) : null; wx.hidden = !w; wx.replaceChildren();
      if (w) { const where = 'kind=weather&date=' + TODAY, m = (v, fld) => { const e = el('span', null, String(v)); e.setAttribute('data-source', 'coach'); e.setAttribute('data-field', fld); e.setAttribute('data-where', where); return e; };
        if (w.text) wx.append(m(w.text, 'text'), ' · '); wx.append(m(N(w.high_f), 'high_f'), '° / ', m(N(w.low_f), 'low_f'), '°');
        wx.setAttribute('role', 'group'); wx.setAttribute('aria-label', `${w.town ? w.town + ' today' : 'Today'}: ${w.text ? w.text + ', ' : ''}high ${N(w.high_f)}, low ${N(w.low_f)} degrees Fahrenheit`); }
      $('t-day-d').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(w ? {} : { year: 'numeric' }) }); } // with the forecast beside it the year leaves, so the strip stays on one line
    // today's date and forecast pinned under the tab bar at the top of Today, not on the Readiness card (alpha day_top; the athlete,
    // Nov 20, 2026: "today's date and weather stick at the top instead of being attached to the readiness card", picked
    // "Pinned under the tabs"); it docks like the Fitness range row
    { const day = $('t-day'), top = alpha('day_top'), pg = $('today');
      if (top && day.parentNode !== pg) pg.insertBefore(day, $('t-deck')); else if (!top && day.parentNode === pg) $('t-hero').prepend(day);
      day.classList.toggle('td-daytop', top); }
    const t = kind('today')[0], f = window.CX.feelToday, conf = t && t.date === TODAY ? String(t.confidence || '').toLowerCase() : '';
    const sv = kind('feel_day').some((d) => d.date === TODAY) || !!(f && f.saved_at), wt = alpha('readiness_score') ? (kind('ready_inputs') || []).some((r) => r.date === TODAY) : (rowsOk('night') || []).some((r) => r.date === TODAY && r.value !== null && r.value !== undefined); // the score's watch side when it is on
    const chip = (id, text, s, say) => { const e = $(id); e.textContent = text; e.dataset.s = s; e.setAttribute('aria-label', say); };
    chip('t-chip-c', conf ? 'Confidence' : 'Early read', conf === 'high' ? 'good' : conf === 'moderate' ? 'watch' : 'none', conf ? 'Confidence ' + conf : 'Early read, the coach has not confirmed it yet');
    { const n = conf === 'high' ? 3 : conf === 'moderate' ? 2 : conf ? 1 : 0, bars = el('span', 'td-bars'); bars.setAttribute('aria-hidden', 'true'); for (let i = 0; i < 3; i++) bars.append(el('i', i < n ? 'on' : null)); $('t-chip-c').prepend(bars); } // signal bars: high 3, moderate 2, low 1, none before the call
    chip('t-chip-s', 'Survey', sv ? 'in' : 'none', sv ? 'Survey in' : 'Survey not in yet'); chip('t-chip-w', 'Watch', wt ? 'in' : 'none', wt ? 'Watch night in' : 'Watch night not in yet');
  }
  // Readiness score (alpha readiness_score; RULES 5, the athlete, Nov 21, 2026: raw watch values only, one weighted score, "clear
  // for a user to identify what the weights of each area are", standard deviations on a bell curve). The watch side comes
  // from the coach's ready_inputs row (readiness.py), the survey side from this morning's feel (feelCtx z); weights and
  // cutoffs from the feel_rule row. Same arithmetic as readiness.py score and level.
  const RS_IN = [['survey', 'Survey'], ['hrv', 'HRV, 7 day'], ['load', "Yesterday's load"], ['rhr', 'Resting HR, 7 day'], ['sleep', 'Total sleep, 3 nights']];
  function scoreOf(r, f, z) {
    const w = Object.fromEntries(RS_IN.map(([k]) => [k, N(r['readiness_weight_' + k])])), clip = N(r.readiness_clip_sd) || 3;
    const wr = (kind('ready_inputs') || []).find((x) => x.date === TODAY), fz = f ? z(f) : null, v = {};
    if (fz) v.survey = fz.v;
    if (wr) for (const [k] of RS_IN) if (k !== 'survey' && N(wr[k]) !== null) v[k] = N(wr[k]);
    const ks = Object.keys(v).filter((k) => w[k]), tw = ks.reduce((a, k) => a + w[k], 0);
    if (!tw) return null;
    const c = (x) => Math.max(-clip, Math.min(clip, x)), S = ks.reduce((a, k) => a + w[k] * c(v[k]), 0) / tw;
    return { S: Math.round(S * 100) / 100, rows: RS_IN.map(([k, name]) => ({ k, name, w: w[k], z: k in v ? c(v[k]) : null, add: k in v ? w[k] / tw * c(v[k]) : null })), tw };
  }
  function scoreLevel(r, sc, f) {
    const p = f ? N(f.pain) || 0 : 0, fb = N(r.feel_fallback_at_or_below), lowEL = !!f && ['energy', 'legs'].some((k) => N(f[k]) !== null && N(f[k]) <= fb);
    if (f && p >= N(r.pain_stop)) return 'stressed';
    if (!sc) return null;
    let lv = sc.S > N(r.readiness_primed_above) ? 'primed' : sc.S < N(r.readiness_stressed_below) ? 'stressed' : sc.S < N(r.readiness_ease_off_below) ? 'ease_off' : 'ready';
    if (f && (p >= N(r.pain_hurts) || lowEL) && (lv === 'primed' || lv === 'ready')) lv = 'ease_off';
    else if (f && p > 0 && lv === 'primed') lv = 'ready';
    return lv;
  }
  const sg = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
  // One Readiness section (the athlete, Nov 21, 2026, option C): the score, its bell, the last 3 days as the score read them and the
  // map of its inputs (built by app.js renderNight into #n-scroll, moved here). Last night's recovery row and its gauge step
  // aside while this is on, since the level, the coach size and the key session moves all come from this score.
  function renderScore(r, sc, lv) {
    let box = $('t-rs'); if (!box) { box = el('details', 'td-rs'); box.id = 't-rs'; const mb = $('t-nm-btn'); mb.parentNode.insertBefore(box, mb); }
    document.documentElement.dataset.rs = '1';
    const keep = [$('n-scroll'), $('n-foot')].filter(Boolean);
    box.hidden = !sc; if (!sc) return;
    const open = box.open; box.replaceChildren();
    const sum = el('summary', 'td-rs-sum'); sum.append(el('span', 'td-nm-k', 'Readiness'), ' ', el('b', 'td-rs-v', sg(sc.S) + 'σ'), el('span', 'td-rs-u', ' vs your normal'));
    const v = sum.querySelector('.td-rs-v'); v.setAttribute('data-derived', 'readiness score'); v.setAttribute('data-rule', 'ready.js scoreOf: weighted mean of survey, HRV, load, resting HR and sleep in σ (feel_rule readiness_weight_*), RULES 5 Readiness score');
    // the bar in the collapsed row (the athlete, Nov 21, 2026: "i still want a bar in the collapsed view"): the same low to high
    // scale as the night meter, its segments at the level cutoffs, the live one filled, the dot at today's score
    { const TR = 2.5, at = (u) => Math.max(0, Math.min(1, (u + TR) / (2 * TR))) * 100, cuts = [-TR, N(r.readiness_stressed_below), N(r.readiness_ease_off_below), N(r.readiness_primed_above), TR];
      const bar = el('span', 'td-nm-bar'); bar.dataset.s = LEVEL[lv] ? LEVEL[lv][1] : 'plain';
      ['b3', 'b2', 'b1', 'b1'].forEach((c, i) => { const g = el('i', 'td-nm-seg td-nm-' + c + (sc.S >= cuts[i] && (sc.S < cuts[i + 1] || i === 3) ? ' on' : '')); g.style.left = at(cuts[i]) + '%'; g.style.width = (at(cuts[i + 1]) - at(cuts[i])) + '%'; bar.append(g); });
      const mk = (c, u, t) => { const i = el('i', c); i.style.left = at(u) + '%'; if (t) i.textContent = t; return i; };
      bar.append(mk('td-nm-mid', 0), mk('td-nm-pt', sc.S)); for (const [u, t] of [[-2, '2σ'], [-1, '1σ'], [0, 'normal'], [1, '1σ'], [2, '2σ']]) bar.append(mk('td-nm-tk', u, t));
      const scl = el('span', 'td-nm-scale td-rs-scale'); scl.setAttribute('aria-hidden', 'true'); scl.append(el('span', 'td-nm-end', 'low'), bar, el('span', 'td-nm-end', 'high')); sum.append(scl); }
    box.append(sum);
    // the bell curve: bands at the level cutoffs, a line at today's score, the axis at ±3σ
    const W = 300, H = 74, X = (x) => (Math.max(-3, Math.min(3, x)) + 3) / 6 * W, Y = (x) => H - 16 - 50 * Math.exp(-x * x / 2);
    const cut = [-3, N(r.readiness_stressed_below), N(r.readiness_ease_off_below), N(r.readiness_primed_above), 3], cls = ['act', 'watch', 'plain', 'good'];
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'td-rs-bell'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Bell curve: Stressed under ${sg(cut[1], 1)}σ, Ease off to ${sg(cut[2], 1)}σ, Ready to ${sg(cut[3], 1)}σ, Primed above. Today ${sg(sc.S)}σ, ${LEVEL[lv] ? LEVEL[lv][0] : ''}`);
    for (let i = 0; i < 4; i++) { let d = `M${X(cut[i])},${H - 16}`; for (let x = cut[i]; x <= cut[i + 1] + 1e-9; x += 0.05) d += `L${X(x).toFixed(1)},${Y(x).toFixed(1)}`; d += `L${X(cut[i + 1])},${H - 16}Z`;
      const pa = document.createElementNS(ns, 'path'); pa.setAttribute('d', d); pa.setAttribute('class', 'td-rs-b' + cls[i]); svg.append(pa); }
    const ln = document.createElementNS(ns, 'line'), sx = X(sc.S); Object.entries({ x1: sx, x2: sx, y1: 2, y2: H - 16, class: 'td-rs-now' }).forEach(([a, b]) => ln.setAttribute(a, b)); svg.append(ln);
    [['Stressed', -2.2, 'middle'], ['Ease off', cut[2] + 0.05, 'end'], ['Ready', 0.15, 'middle'], ['Primed', 1.8, 'middle']].forEach(([t, x, a]) => { const tx = document.createElementNS(ns, 'text'); tx.textContent = t; tx.setAttribute('x', X(x)); tx.setAttribute('y', H - 3); tx.setAttribute('text-anchor', a); tx.setAttribute('class', 'td-rs-tk'); svg.append(tx); });
    box.append(svg);
    // the last 3 days as the score read them: two days before from the coach (ready_day rows), today from this card
    const days = (kind('ready_day') || []).filter((d) => d.date < TODAY && dayN(d.date) >= TN - 2).sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({ ...d, mk: 1 }));
    days.push({ date: TODAY, score: sc.S, level: lv });
    const row = el('div', 'td-rs-days'); row.append(el('span', 'td-rs-dk', 'Last 3 days'));
    for (const d of days) { const c = el('div', 'td-rs-day'), L0 = LEVEL[d.level];
      const wd = d.date === TODAY ? 'Today' : new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
      const sv = el('span', null, N(d.score) === null ? '—' : sg(N(d.score))); if (d.mk) { sv.setAttribute('data-source', 'coach'); sv.setAttribute('data-field', 'score'); sv.setAttribute('data-where', 'kind=ready_day;date=' + d.date); }
      const hd = el('span', 'td-rs-dw', wd + ' '); hd.append(sv);
      c.append(hd, L0 ? (L0[1] === 'plain' ? neutralChip(L0[0]) : badge(L0[1], L0[0])) : neutralChip('No read')); row.append(c); }
    box.append(row, ...keep);
    box.open = open;
  }
  function oneReady() {
    const hero = $('t-hero'); delete hero.dataset.lv; oneTop();
    const was = !!state.off; state.off = false;
    const plan = () => { if (was !== !!state.off) renderPath(); renderBound(); }; // the plan card under it follows the level
    moveOffer(null);
    const r = kind('feel_rule')[0], t = kind('today')[0], f = window.CX.feelToday;
    if (!alpha('one_readiness') || !r || !t) { if (was) plan(); return; }
    const pre = t.date !== TODAY, sv = !!(f && f.saved_at && feelScore(f) !== null), { past, Y, yd, low, z } = feelCtx(r);
    const nw = (rowsOk('night_week') || []).filter((x) => x.date), last = nw[nw.length - 1], lastV = last ? N(last.value) : null;
    const watch = !!last && last.date === TODAY && lastV !== null, k = N(r.primed_good_nights), tail = nw.slice(-k).map((x) => N(x.value));
    const goodN = watch && tail.length >= k && tail.every((v) => v !== null && v >= N(r.primed_night_min_sd));
    let lowRun = 0; for (let i = nw.length - 1; i >= 0; i--) { const v = N(nw[i].value); if (v === null || v > N(r.night_pattern_low_sd)) break; lowRun++; }
    const rsOn = alpha('readiness_score'), sc = rsOn ? scoreOf(r, sv ? f : null, z) : null;
    const table = () => {
      if (rsOn) return scoreLevel(r, sc, sv ? f : null);
      if (!sv && !watch) return null;
      const p = sv ? N(f.pain) || 0 : 0, fb = N(r.feel_fallback_at_or_below), st = N(r.feel_strong_day_at_or_above), e = sv ? N(f.energy) : null, l = sv ? N(f.legs) : null;
      const fz = sv ? z(f) : null, feelLow = !!fz && fz.v <= -LOW_SD;
      const fresh = (d) => !!d && N(d.energy) !== null && N(d.legs) !== null && N(d.energy) >= st && N(d.legs) >= st;
      if ((sv && p >= N(r.pain_stop)) || (watch && lowRun >= N(r.stressed_low_nights))) return 'stressed';
      if (sv && (p >= N(r.pain_hurts) || (e !== null && e <= fb) || (l !== null && l <= fb) || (low(f, TODAY) && low(yd, Y)))) return 'ease_off';
      if (watch && (lowRun >= N(r.night_pattern_yellow_low_nights) || (sv && lastV <= N(r.night_pattern_well_low_sd) && low(f, TODAY)))) return 'ease_off';
      if (feelLow) return 'ready';
      if (watch) return goodN && (!sv || fresh(f)) ? 'primed' : 'ready';
      let run = 0; for (; run < N(r.primed_fresh_mornings); run++) if (!fresh(run ? past.find((d) => d.date === isoN(TN - run)) : f)) break;
      return run >= N(r.primed_fresh_mornings) ? 'primed' : 'ready';
    };
    let lv = null;
    if (pre) lv = table();
    else {
      const coach = LEVEL[t.level] ? t.level : LEVEL_OF[String(t.readiness || '').toUpperCase()]; if (!coach) { if (was) plan(); return; }
      const late = sv && !kind('feel_day').some((d) => d.date === TODAY) && t.generated_at_utc && f.saved_at > t.generated_at_utc, tb = late ? table() : null;
      lv = !tb ? coach : RANK.indexOf(coach) >= RANK.indexOf('ready') ? tb : RANK[Math.min(RANK.indexOf(tb), RANK.indexOf(coach))];
    }
    if (rsOn) renderScore(r, sc, lv); else if ($('t-rs')) { $('t-rs').hidden = true; delete document.documentElement.dataset.rs; const na = $('n-all'); if (na && $('n-scroll') && $('n-scroll').parentNode !== na) na.append($('n-scroll'), $('n-foot')); }
    if (!lv) { if (was) plan(); return; }
    const [w, s, mean] = LEVEL[lv], g = $('t-ready-g'), rd = $('t-ready'), rm = $('t-ready-m');
    hero.dataset.lv = lv; g.dataset.s = s; g.replaceChildren(icon(s, 'ck-g')); $('t-ready-sr').textContent = ST_NAME[s] + ': ';
    rd.textContent = w; rd.removeAttribute('data-field'); rd.setAttribute('data-derived', 'readiness level');
    rd.setAttribute('data-rule', 'ready.js oneReady, the table of morning_facts.section_readiness_level: pain Stop or three low nights in a row Stressed; Hurts, low energy or legs, two low mornings or low nights Ease off; three nights at or above normal and a fresh survey Primed; else Ready (schemas.json, RULES 5 One readiness)');
    if (!pre || sv) { rm.textContent = mean; rm.hidden = false; } // before the call with no survey the check-in button stays
    moveOffer(lv);
    // The level picks the size (RULES 5, One readiness): the green coach size on the plan card is the level's, chosen once
    // per level so a size the person picked afterwards stays; Stressed takes the session off
    state.off = lv === 'stressed';
    const want = SIZE[lv], inp = want && document.querySelector(`#t-bounds input[value=${want}]`), size = inp && !inp.disabled ? want : 'nominal';
    if (!state.off) { state.rec = size; if (state.lvKey !== TODAY + lv) { state.lvKey = TODAY + lv; state.bound = size; } }
    plan();
  }
  // Key sessions move with readiness (RULES 5, One readiness; the athlete, Nov 18, 2026: "Up to two days", "present ... 2 to 3
  // options for moving", and the push keeps rolling: still Ease off or Stressed on the new day, the offer shows again).
  // Never automatic: a tap saves the same day_change document as "Today changed?" (change.js), reason swap_order with the
  // two dates, and the coach's next refresh swaps the rows (RUNBOOK, Today changed). The window comes from the feel_rule row.
  function moveOffer(lv) {
    const box = $('t-move'); if (!box) return; box.hidden = true; box.replaceChildren();
    const r = kind('feel_rule')[0], max = r ? N(r.key_move_max_days) : null;
    if (!lv || lv === 'ready' || !max || !window.CX.sendMove) return;
    const isKey = (x) => truthy(x.key) || N(x.pillar) !== null, fixedT = (x) => !!x && ['test', 'race'].some((w) => x.type === w || x.intensity === w);
    const main = (i) => { const rs = kind('day').filter((x) => x.date === isoN(TN + i) && x.type !== 'strength').sort((a, b) => (a.order || 0) - (b.order || 0)); return rs.find(isKey) || rs[0] || null; };
    const fixed = (i) => fixedT(main(i)) || fixedT(main(i + 1)); // a test or a race, and the day before it, never move
    const hard = (i) => { const x = main(i); return !!x && x.type !== 'rest' && (isKey(x) || fixedT(x) || x.intensity === 'long' || x.intensity === 'quality'); };
    const week = (i) => Math.floor((TN + i + 3) / 7), wd = (i) => new Date(isoN(TN + i) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
    const say = (t) => { box.append(el('p', null, t)); box.hidden = false; const mb = $('t-nm-btn'); if (mb && mb.parentNode === box.parentNode && box.nextSibling !== mb) mb.before(box); }; // right under the call, above last night
    const mv = window.CX.movedDoc && window.CX.movedDoc();
    if (mv && !mv.cleared && mv.move) { say(`Moved: ${mv.move.title} is now on ${mv.move.to === TODAY ? 'today' : new Date(mv.move.to + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })}. Your week updates by ${window.CX.nextUpdate ? window.CX.nextUpdate() : 'the next update'}.`); return; }
    let kept = false; try { kept = sessionStorage.getItem('cx-move-keep') === TODAY; } catch (e) { /* no storage: the offer just shows again */ }
    const t0 = main(0); if (!t0 || kept) return;
    const opts = []; let text, keep;
    if (lv === 'primed') {
      if (hard(0) || fixed(0) || hard(-1)) return;
      for (let i = 1; i <= max && !opts.length; i++) { const x = main(i); if (x && isKey(x) && x.type !== 'rest' && !fixed(i) && week(i) === week(0) && (i === 1 || !hard(1))) opts.push([i, 'Move it to today', x.title]); }
      if (!opts.length) return;
      text = `Pull ${wd(opts[0][0])}'s ${opts[0][2]} forward to today? ${wd(opts[0][0])} takes today's session.`; keep = 'Keep the plan';
    } else {
      if (!isKey(t0) || t0.type === 'rest' || fixed(0)) return;
      for (let i = 1; i <= max; i++) if (week(i) === week(0) && !hard(i) && !fixed(i) && !(i > 1 && hard(i - 1)) && !hard(i + 1)) opts.push([i, wd(i), t0.title]);
      if (!opts.length) return;
      text = lv === 'stressed' ? `Today's ${t0.title} comes off. Pick a new day for it. If you are still Stressed that day, it offers to move again.` : `Move today's ${t0.title} to a better day? Today takes that day's session.`;
      keep = lv === 'stressed' ? null : 'Keep today';
    }
    say(text);
    const row = el('div', 'ck-btn-row'); box.append(row);
    opts.forEach(([i, label, title], n) => {
      const b = el('button', 'ck-btn ck-btn--sm ' + (n ? 'ck-btn--secondary' : 'ck-btn--primary'), label); b.type = 'button';
      b.addEventListener('click', async () => {
        const from = lv === 'primed' ? isoN(TN + i) : TODAY, to = lv === 'primed' ? TODAY : isoN(TN + i);
        const note = `Readiness ${LEVEL[lv][0]}: move ${title} from ${from} to ${to}; ${lv === 'stressed' ? 'today becomes rest' : 'the two days swap'}`;
        try { await window.CX.sendMove({ date: TODAY, reason: 'swap_order', note: note.slice(0, 200), use_min: false, move: { from, to, title, level: lv }, saved_at: new Date().toISOString() }); window.CX.redrawPlan(); }
        catch (e) { box.append(el('p', 'ck-note', 'Not saved. Try again, or tell the coach in chat.')); }
      });
      row.append(b);
    });
    if (keep) { const k = el('button', 'ck-btn ck-btn--sm ck-btn--secondary', keep); k.type = 'button'; k.addEventListener('click', () => { try { sessionStorage.setItem('cx-move-keep', TODAY); } catch (e) { /* hidden for this view only */ } box.hidden = true; }); row.append(k); }
  }
  // A move shows at once (the athlete, Nov 18, 2026, "Yes, all four"): until the coach's refresh swaps the rows, the plan card, the
  // week path and the Week tab read the day rows through the move. Ease off and Primed: the two days trade their main
  // session. Stressed: today becomes rest and the session takes the place of the new day's main session.
  // Once the coach has replanned (the session no longer sits on its old day) the rows already say it and nothing is mapped.
  const ord = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0), keyRow = (x) => truthy(x.key) || N(x.pillar) !== null;
  function moved(rows, plan) {
    const d = alpha('one_readiness') && window.CX.movedDoc && window.CX.movedDoc(), m = d && !d.cleared && d.date === TODAY ? d.move : null;
    if (!m) return rows;
    const main = (dt) => { const rs = rows.filter((x) => x.date === dt && plan(x) && x.type !== 'strength').sort(ord); return rs.find(keyRow) || rs[0] || null; };
    const a = main(m.from), b = main(m.to), off = m.level === 'stressed';
    if (!a || a.title !== m.title) return rows;
    const out = [];
    for (const r of rows) {
      if (r === a) out.push({ ...r, date: m.to, moved: m.from, moved_word: off ? 'Moved from' : 'Swapped with' }, ...(off ? [{ ...r, type: 'rest', title: 'Rest', key: false, pillar: null, intensity: 'rest', minutes: null, upper_minutes: null, fallback_minutes: null, detail: '', target_rpe: null, hr_cap: null, status: 'rest', moved: m.to, moved_word: 'Moved to' }] : []));
      else if (r === b) { if (!off) out.push({ ...r, date: m.from, moved: m.to, moved_word: 'Swapped with' }); }
      else out.push(r);
    }
    return out;
  }
  window.CX.planDays = () => moved(kind('day'), () => true);
  window.CX.movedWeek = (wv) => moved(wv, (x) => x.kind === 'plan');
  window.CX.redrawPlan = () => { renderToday(); if (state.page === 'week') renderWeek(); }; // change.js, after a move or its Undo
  window.CX.renderEarly = () => { surveyRead(); oneReady(); basedOn(); }; // ask.js and forms.js, after a morning save
  if (kind('today').length) renderToday(); // a first draw that ran before this file loaded
})();
