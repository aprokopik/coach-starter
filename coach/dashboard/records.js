// records.js: the All-time records card on the Season page, under Season so far (bests over the whole Garmin record),
// grouped by sport like Season so far (the athlete, Nov 1, 2026).
(() => {
  const { N, monday } = window.CX;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fDay = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const hm = (min) => { min = Math.round(min); if (min < 60) return `${min} min`; const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; };
  const mss = (v) => { let m = Math.floor(v), s = Math.round((v - m) * 60); if (s === 60) { m += 1; s = 0; } return `${m}:${pad2(s)}`; };
  const f1 = (v) => window.CX.fixed(v, 1), f0 = (v) => window.CX.round(v).toLocaleString('en-US');

  // Phase 5 (Season): Cockpit tiles (CX.seasonTile), every figure, unit and date marked with its activity row; the panel has the
  // shared states (CX.ck.cardState). Thresholds in the copy (3 mi, an hour) are rules held here, marked data-rule.
  function renderRecords() {
    const box = $('r-rec-tiles'), panel = $('r-p-records'); if (!box) return;
    const ck = window.CX.ck || {}; const mk = (t, src, field, where, derived) => (ck.mark ? ck.mark(el('span', null, t), src, field, where, derived) : el('span', null, t));
    const rule = (t, r) => (ck.ruleSpan ? ck.ruleSpan(t, r) : t);
    const d = dash.data('activities'); const acts = d.status === 'ok' && Array.isArray(d.data) ? d.data : null;
    if (ck.cardState && d.status !== 'ok') { ck.cardState(panel, d.status === 'error' || d.status === 'missing' ? 'error' : 'loading', 'Your Garmin activities did not arrive, so the records cannot be read. Nothing saved is lost.'); return; }
    const all = (acts || []).filter((a) => !/walk/i.test(String(a.type)) && !/sauna/i.test(String(a.name || '')));
    if (!all.length) { box.replaceChildren(); if (ck.cardState) ck.cardState(panel, 'empty', 'Hall of fame fills from your Garmin activities once the first one is in.'); return; }
    if (ck.cardState) ck.cardState(panel, null);
    const best = (rows, f) => rows.filter((a) => f(a) > 0).sort((a, b) => f(b) - f(a))[0];
    const isRun = (a) => /run/i.test(String(a.type)), isRide = (a) => /cycl|ride|bik/i.test(String(a.type));
    const yNow = String(new Date().getFullYear());
    const A = 'activities', aw = (a) => 'activity_id=' + a.activity_id;
    const when = (a) => mk(fDay(a.local_start) + (String(a.local_start).slice(0, 4) !== yNow ? ', ' + String(a.local_start).slice(0, 4) : ''), A, null, aw(a), 'formatted');
    const first = all.slice().sort((a, b) => (String(a.local_start) < String(b.local_start) ? -1 : 1))[0];
    const recStart = String(first.local_start).slice(0, 10);
    const hours = all.reduce((t, a) => t + (N(a.duration_min) || 0), 0) / 60;
    // road and trail runs apart (the athlete, Oct 25): on trails the climbing matters as much as the distance
    const isTrail = (a) => /trail/i.test(String(a.type)), isRoad = (a) => isRun(a) && !isTrail(a) && !/treadmill|indoor|virtual/i.test(String(a.type));
    const lr = best(all.filter(isRoad), (a) => N(a.distance_mi) || 0), lt = best(all.filter(isTrail), (a) => N(a.distance_mi) || 0), lb = best(all.filter(isRide), (a) => N(a.distance_mi) || 0);
    const climbT = best(all.filter(isTrail), (a) => N(a.ascent_ft) || 0), climbB = best(all.filter((a) => isRide(a) && !/virtual|indoor/i.test(String(a.type))), (a) => N(a.ascent_ft) || 0);
    const ft = (a) => (N(a.ascent_ft) ? [mk(f0(N(a.ascent_ft)), A, 'ascent_ft', aw(a)), ' ft · '] : []);
    const mi = (a) => mk(f1(N(a.distance_mi)), A, 'distance_mi', aw(a));
    const dur = (a) => mk(hm(N(a.duration_min)), A, null, aw(a), 'h-min');
    // fastest pace: road runs of 3 mi or more, so strides and short shakeouts do not count
    const fast = best(all.filter((a) => /^running$/i.test(String(a.type)) && (N(a.distance_mi) || 0) >= 3), (a) => N(a.avg_speed_kmh) || 0);
    // best ride power: normalized power on rides of an hour or more
    const pw = best(all.filter((a) => isRide(a) && (N(a.duration_min) || 0) >= 60), (a) => N(a.norm_power_w) || 0);
    const wk = {}; for (const a of all) { const m = monday(a.local_start); wk[m] = (wk[m] || 0) + (N(a.duration_min) || 0); }
    const bw = Object.entries(wk).sort((a, b) => b[1] - a[1])[0];
    const cd = dash.data('coach'); const st = cd.status === 'ok' && Array.isArray(cd.data) ? cd.data.find((r) => r.kind === 'streak') : null;
    const doneRaces = cd.status === 'ok' && Array.isArray(cd.data) ? cd.data.filter((r) => r.kind === 'race' && r.status === 'done') : [];
    const raceOn = (a) => { const r = doneRaces.find((x) => x.date === String(a.local_start).slice(0, 10)); return r ? [' · ', mk(r.name.replace(/\s*\(.*\)$/, ''), 'coach', null, 'kind=race&race_id=' + r.race_id, 'race-name')] : []; };
    const tile = window.CX.seasonTile;
    const swims = all.filter((a) => /swim/i.test(String(a.type))); const lsw = best(swims, (a) => N(a.distance_mi) || 0);
    const groups = [
      { label: 'Overall', sport: 'all', tiles: [
        tile('Total training', f1(hours), 'h', [A, null, null, 'sum-hours'], [mk(String(all.length), A, null, null, 'count'), ' sessions since ', mk(fDay(recStart), A, null, aw(first), 'formatted'), ', ', mk(recStart.slice(0, 4), A, null, aw(first), 'year')]),
        tile('Biggest week', bw ? hm(bw[1]) : '—', '', [A, null, null, 'week-sum'], bw ? ['week of ', mk(fDay(bw[0]), A, null, null, 'week-start')] : ''),
        tile('Best plan streak', st ? String(st.best) : '—', 'd', ['coach', 'best', 'kind=streak'], st ? ['scored since ', mk(fDay(st.start), 'coach', null, 'kind=streak', 'formatted')] : '')] },
      { label: 'Bike', sport: 'bike', tiles: [
        tile('Longest ride', lb ? f1(N(lb.distance_mi)) : '—', 'mi', lb ? [A, 'distance_mi', aw(lb)] : null, lb ? [...ft(lb), dur(lb), ' · ', when(lb), ...raceOn(lb)] : ''),
        tile('Most climbing, ride', climbB ? f0(N(climbB.ascent_ft)) : '—', 'ft', climbB ? [A, 'ascent_ft', aw(climbB)] : null, climbB ? [mi(climbB), ' mi outdoors · ', when(climbB)] : ''),
        tile('Best ride power', pw ? f0(N(pw.norm_power_w)) : '—', 'W', pw ? [A, 'norm_power_w', aw(pw)] : null, pw ? ['normalized, ', dur(pw), ' · ', when(pw)] : ['no ride of ', rule('an hour', 'records.js: ride power counts rides of 60 min or more'), ' with power yet'])] },
      { label: 'Run', sport: 'run', tiles: [
        tile('Longest road run', lr ? f1(N(lr.distance_mi)) : '—', 'mi', lr ? [A, 'distance_mi', aw(lr)] : null, lr ? [dur(lr), ' · ', when(lr)] : ''),
        tile('Fastest road pace', fast ? mss(60 / (N(fast.avg_speed_kmh) / 1.609344)) : '—', '/mi', fast ? [A, null, aw(fast), 'pace'] : null, fast ? [mi(fast), ' mi road run · ', when(fast)] : ['no road run of ', rule('3', 'records.js: fastest pace counts road runs of 3 mi or more'), ' mi yet'])] },
      { label: 'Trail', sport: 'trail', tiles: [
        tile('Longest trail run', lt ? f1(N(lt.distance_mi)) : '—', 'mi', lt ? [A, 'distance_mi', aw(lt)] : null, lt ? [...ft(lt), dur(lt), ' · ', when(lt), ...raceOn(lt)] : 'no trail run yet'),
        tile('Most climbing, trail run', climbT ? f0(N(climbT.ascent_ft)) : '—', 'ft', climbT ? [A, 'ascent_ft', aw(climbT)] : null, climbT ? [mi(climbT), ' mi · ', when(climbT)] : '')] },
      { label: 'Swim', sport: 'swim', tiles: lsw ? [
        tile('Longest swim', f0(N(lsw.distance_mi) * 1760), 'yd', [A, null, aw(lsw), 'yards'], [dur(lsw), ' · ', when(lsw)])] : [] }];
    if (window.CX.sportGroups) window.CX.sportGroups(box, groups); else box.replaceChildren(...groups.flatMap((g) => g.tiles));
    $('r-rec-cap').textContent = 'personal bests';
    $('r-rec-note').replaceChildren(`From every Garmin activity on record (since `, mk(fDay(recStart), A, null, aw(first), 'formatted'), ', ', mk(recStart.slice(0, 4), A, null, aw(first), 'year'), '); walks and sauna are not counted. Weeks run Monday to Sunday. Trail and road runs are kept apart (treadmill runs count in neither); ride climbing counts outdoor rides only. Fastest pace counts road runs of ', rule('3', 'records.js: fastest pace counts road runs of 3 mi or more'), ' mi or more; ride power is normalized power on rides of ', rule('an hour', 'records.js: ride power counts rides of 60 min or more'), ' or more.');
  }
  window.CX.renderRecords = renderRecords;
  renderRecords(); // the Season page may have rendered before this file loaded
})();
