// calc.js: shared helpers (window.CX) and the dash.calc definitions every page reads. Loaded first.
(() => {
  // Shared helpers and the calculations every page reads.
  const N = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);
  const dayN = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
  const isoN = (n) => new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
  const monday = (s) => { const n = dayN(s); return isoN(n - ((new Date(n * 86400000).getUTCDay() + 6) % 7)); };
  // Shared number formatting (Phase 5, Nov 4, 2026): round half up, decimal-safe. toFixed and d3.format round the binary
  // value, so a stored 10.95 (10.9499... in binary) showed as 10.9; the 15-digit pass drops that noise first, then ties go
  // away from zero (10.95 -> 11.0, -2.25 -> -2.3). round gives a number, fixed a string like toFixed, fmt a d3 formatter
  // ('.1f', ',.0f') that rounds this way first. Every shown figure goes through these, never a bare toFixed.
  const round = (x, k = 0) => { x = Number(x); if (!isFinite(x)) return x; const f = 10 ** k; return Math.sign(x) * Math.round(Number((Math.abs(x) * f).toPrecision(15))) / f; };
  const fixed = (x, k = 0) => { const v = Number(x); if (!isFinite(v)) return v.toFixed(k); const r = round(v, k); return (v < 0 && r === 0 ? '-' : '') + r.toFixed(k); };
  const fmt = (spec) => { const f = d3.format(spec), m = /\.(\d+)f$/.exec(spec); return m ? (v) => f(round(v, Number(m[1]))) : f; };
  window.CX = { N, dayN, isoN, monday, round, fixed, fmt };

  dash.calc('night', {
    title: 'Last night vs your normal',
    description: 'The latest night of each recovery metric against the mean and SD of the 28 days before it; stress is the day before. A band needs 14 nights.',
    inputs: ['recovery'],
    fn: (recovery) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const round = (x, k) => (x === null ? null : Math.round(x * 10 ** k) / 10 ** k);
      const rows = recovery.filter((r) => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!rows.length) return [];
      const lastDay = day(rows[rows.length - 1].date);
      const defs = [
        ['sleep_h', 'Sleep', 'h', 1, 1, 0], ['sleep_score', 'Sleep score', '', 0, 1, 0], ['hrv_overnight_ms', 'HRV', 'ms', 0, 1, 0],
        ['resting_hr', 'Resting HR', 'bpm', 0, -1, 0], ['body_battery_high', 'Body Battery', '', 0, 1, 0],
        ['body_battery_charged', 'Recharge', '', 0, 1, 0], ['stress_avg', 'Stress, day before', '', 0, -1, 1],
      ];
      return defs.map(([metric, label, unit, digits, better, lag]) => {
        const target = lastDay - lag;
        const cur = rows.find((r) => day(r.date) === target);
        const value = cur ? val(cur[metric]) : null;
        const base = rows.filter((r) => day(r.date) < target && day(r.date) >= target - 28).map((r) => val(r[metric])).filter((v) => v !== null);
        const n = base.length;
        const mean = n ? base.reduce((s, v) => s + v, 0) / n : null;
        const sd = n > 1 ? Math.sqrt(base.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : null;
        return { metric, label, unit, better, date: new Date(target * 86400000).toISOString().slice(0, 10), value: round(value, digits),
          mean: round(mean, 1), sd: round(sd, 2), n, z: value !== null && sd && n >= 14 ? round((value - mean) / sd, 1) : null };
      });
    },
  });

  // Last night in one number (Phase 6, the athlete Nov 5, 2026, option A): the mean of last night's SD distances (z, as the tiles
  // show them) for sleep hours, sleep score, HRV and resting HR, each signed by its `better` so higher is better for all four
  // (resting HR flips). A metric without a band (z null: fewer than 14 nights, or not synced) is left out; `used` says how
  // many counted. Computed once here; the Today gauge only reads it.
  dash.calc('night_gauge', {
    title: 'Last night in one number',
    description: "Mean of last night's SD distances from the 28-day normal for sleep hours, sleep score, HRV and resting HR, resting HR sign flipped so higher is better; metrics without a band (under 14 nights) are left out.",
    inputs: ['night'],
    fn: (night) => {
      const keys = ['sleep_h', 'sleep_score', 'hrv_overnight_ms', 'resting_hr'];
      const rows = keys.map((k) => night.find((r) => r.metric === k)).filter(Boolean);
      if (!rows.length) return [];
      const zs = rows.filter((r) => N(r.z) !== null && N(r.value) !== null).map((r) => N(r.z) * (N(r.better) < 0 ? -1 : 1));
      const mean = zs.length ? round(zs.reduce((a, b) => a + b, 0) / zs.length, 1) : null;
      return [{ key: 'last_night', date: rows[0].date, value: mean === 0 ? 0 : mean, used: zs.length, of: keys.length, metrics: keys.join(';'), lo: -2, hi: 2 }];
    },
  });

  dash.calc('weight_trend', {
    title: 'Weight with rolling averages',
    description: 'Each weigh-in in lb with the mean of all weigh-ins in the trailing 4 and 7 calendar days (that day included).',
    inputs: ['recovery'],
    fn: (recovery) => {
      const rows = recovery.filter((r) => r.weight_lb !== '' && r.weight_lb != null && !isNaN(Number(r.weight_lb))).sort((a, b) => (a.date < b.date ? -1 : 1));
      const day = (d) => Date.parse(d + 'T00:00:00Z') / 86400000;
      const avg = (i, days) => {
        const end = day(rows[i].date);
        const win = rows.slice(0, i + 1).filter((x) => end - day(x.date) < days).map((x) => Number(x.weight_lb));
        return Math.round(win.reduce((s, v) => s + v, 0) / win.length * 10) / 10;
      };
      return rows.map((r, i) => ({ date: r.date, weight_lb: Number(r.weight_lb), avg4: avg(i, 4), avg7: avg(i, 7) }));
    },
  });

  dash.calc('weekly', {
    title: 'Training per week',
    description: 'Mon–Sun weeks: Garmin hours by discipline (walks and sauna left out), plus strength and not-yet-synced sessions logged on the dashboard, and effort load (RPE × minutes) from rated sessions.',
    inputs: ['activities', 'coach'],
    fn: (activities, coach) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const iso = (n) => new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
      const mon = (s) => { const n = day(s); return iso(n - ((new Date(n * 86400000).getUTCDay() + 6) % 7)); };
      const disc = (t, nm) => { t = String(t || '').toLowerCase(); if (/sauna/i.test(String(nm || ''))) return 'sauna'; if (/swim/.test(t)) return 'swim'; if (/(cycl|ride|bik|zwift)/.test(t)) return 'bike'; if (/run/.test(t)) return 'run'; if (/strength/.test(t)) return 'strength'; if (/hik/.test(t)) return 'hike'; if (/walk/.test(t)) return 'walk'; return 'other'; };
      const out = {};
      const wk = (w) => (out[w] = out[w] || { week: w, bike: 0, run: 0, swim: 0, strength: 0, hike: 0, other: 0, total: 0, sessions: 0, load: 0, rated: 0 });
      const seen = new Set();
      for (const a of activities) {
        const d = String(a.local_start || '').slice(0, 10); const k = disc(a.type, a.name);
        if (!d || k === 'walk' || k === 'sauna') continue;
        const h = (val(a.duration_min) || 0) / 60; const w = wk(mon(d));
        w[k] += h; w.total += h; w.sessions += 1; seen.add(d + '|' + k);
      }
      for (const f of coach.filter((r) => r.kind === 'feel_session')) {
        const w = wk(mon(f.date));
        if (String(f.activity_id).startsWith('manual-') && !['walk', 'other'].includes(f.discipline) && !seen.has(f.date + '|' + f.discipline)) {
          const h = (val(f.minutes) || 0) / 60; w[f.discipline in w ? f.discipline : 'other'] += h; w.total += h; w.sessions += 1;
        }
        if (val(f.srpe_load) !== null) { w.load += val(f.srpe_load); w.rated += 1; }
      }
      const weeks = Object.keys(out).sort();
      if (!weeks.length) return [];
      for (let n = day(weeks[0]); n <= day(weeks[weeks.length - 1]); n += 7) wk(iso(n));
      const r2 = (x) => Math.round(x * 100) / 100;
      return Object.values(out).sort((a, b) => (a.week < b.week ? -1 : 1)).map((w) => ({ ...w, bike: r2(w.bike), run: r2(w.run), swim: r2(w.swim), strength: r2(w.strength), hike: r2(w.hike), other: r2(w.other), total: r2(w.total), load: Math.round(w.load) }));
    },
  });

  dash.calc('week_view', {
    title: 'Week plan vs done',
    description: 'Each planned session matched to the Garmin activity, or the session logged on the dashboard, of the same discipline that day (or its fallback discipline); other sessions are listed as unplanned.',
    inputs: ['coach', 'activities'],
    fn: (coach, activities) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const iso = (n) => new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
      const mon = (s) => { const n = day(s); return iso(n - ((new Date(n * 86400000).getUTCDay() + 6) % 7)); };
      const disc = (t, nm) => { t = String(t || '').toLowerCase(); if (/sauna/i.test(String(nm || ''))) return 'sauna'; if (/swim/.test(t)) return 'swim'; if (/(cycl|ride|bik|zwift)/.test(t)) return 'bike'; if (/run/.test(t)) return 'run'; if (/strength/.test(t)) return 'strength'; if (/hik/.test(t)) return 'hike'; if (/walk/.test(t)) return 'walk'; return 'other'; };
      const word = { bike: 'Ride', run: 'Run', swim: 'Swim', strength: 'Strength', hike: 'Hike', walk: 'Walk', other: 'Session' };
      const plans = coach.filter((r) => r.kind === 'day');
      const feel = coach.filter((r) => r.kind === 'feel_session');
      const rated = {}; for (const f of feel) if (f.activity_id) rated[String(f.activity_id)] = f;
      const sessions = [];
      for (const a of activities) {
        const k = disc(a.type, a.name); const d = String(a.local_start || '').slice(0, 10);
        if (!d || k === 'sauna') continue;
        sessions.push({ id: String(a.activity_id), date: d, disc: k, min: val(a.duration_min), hr: val(a.avg_hr), mi: val(a.distance_mi), ft: val(a.ascent_ft), start: String(a.local_start) });
      }
      for (const f of feel) {
        if (!String(f.activity_id).startsWith('manual-')) continue;
        if (sessions.some((s) => s.date === f.date && s.disc === f.discipline && !s.manual)) continue;
        sessions.push({ id: String(f.activity_id), date: f.date, disc: f.discipline, min: val(f.minutes), hr: null, manual: true, start: f.date + ' 23:59' });
      }
      const text = (ss) => ss.map((s) => [word[s.disc] || 'Session', s.min !== null ? Math.round(s.min) + ' min' : null, s.mi ? fixed(s.mi, 1) + ' mi' : null, s.hr ? 'HR ' + Math.round(s.hr) : null, s.manual ? 'logged' : null].filter(Boolean).join(' · ')).join(' + ');
      const out = [];
      const dates = [...new Set([...plans.map((p) => p.date), ...sessions.map((s) => s.date)])].sort();
      for (const d of dates) {
        const ps = plans.filter((p) => p.date === d).sort((a, b) => (a.order || 0) - (b.order || 0));
        const ss = sessions.filter((s) => s.date === d).sort((a, b) => (a.start < b.start ? -1 : 1));
        const used = new Set(); const rows = [];
        for (const p of ps) {
          const r = { week: mon(d), date: d, kind: 'plan', order: p.order || 0, pillar: val(p.pillar), type: p.type, title: p.title, minutes: val(p.minutes), upper_minutes: val(p.upper_minutes), fallback_minutes: val(p.fallback_minutes), alt_type: p.alt_type || '', intensity: p.intensity || '', key: p.key === true || p.key === 'true', why: p.why || '', detail: p.detail || '', status: 'none', done_disc: '', done_minutes: null, done_text: '', done_ids: '', rpe: null, vs_plan: '', pain: null, flags: '' };
          if (p.type === 'rest') r.status = 'rest';
          else if (p.type === 'test') r.status = 'gate';
          else {
            const want = p.type === 'race' ? 'run' : p.type;
            let m = ss.filter((s) => !used.has(s.id) && s.disc === want); let how = 'done';
            if (!m.length && p.alt_type) { m = ss.filter((s) => !used.has(s.id) && s.disc === p.alt_type); how = 'fallback'; }
            if (m.length) { m.forEach((s) => used.add(s.id)); r.status = how; r.matched = m; }
          }
          rows.push(r);
        }
        for (const r of rows) {
          if (r.status !== 'none' || ['rest', 'test', 'walk'].includes(r.type)) continue;
          const s = ss.find((x) => !used.has(x.id) && x.disc !== 'walk');
          if (s) { used.add(s.id); r.status = 'swapped'; r.matched = [s]; }
        }
        // A key rest day (the athlete, Nov 3, 2026) is broken by any training that day; walking is allowed
        for (const r of rows) if (r.type === 'rest' && r.key && ss.some((x) => x.disc !== 'walk')) r.status = 'rest_broken';
        for (const s of ss) if (!used.has(s.id) && s.disc !== 'walk') rows.push({ week: mon(d), date: d, kind: 'extra', order: 99, type: s.disc, title: '', minutes: null, upper_minutes: null, fallback_minutes: null, alt_type: '', intensity: '', key: false, detail: '', status: 'extra', pillar: null, done_disc: s.disc, matched: [s], done_minutes: null, done_text: '', done_ids: '', rpe: null, vs_plan: '', pain: null, flags: '' });
        for (const r of rows) {
          const m = r.matched || []; delete r.matched;
          if (!m.length) { out.push(r); continue; }
          r.done_disc = m[0].disc; r.done_minutes = Math.round(m.reduce((s, x) => s + (x.min || 0), 0)); r.done_text = text(m); r.done_ids = m.map((x) => x.id).join(';');
          const f = m.map((x) => rated[x.id]).find(Boolean);
          if (f) { r.rpe = val(f.rpe); r.vs_plan = f.vs_plan || ''; r.pain = val(f.pain); }
          const flags = [];
          const hrMax = { run: 150, bike: 135 }[r.done_disc];
          if (r.intensity === 'easy' && hrMax && m.some((x) => x.hr && x.hr > hrMax)) flags.push('hr_high');
          if (r.kind === 'plan' && r.upper_minutes && r.done_minutes > r.upper_minutes * 1.1) flags.push('over');
          const floor = r.alt_type ? r.minutes : r.fallback_minutes;
          if (r.kind === 'plan' && r.status === 'done' && floor && r.done_minutes < floor * 0.85) flags.push('short');
          r.flags = flags.join(';');
          out.push(r);
        }
      }
      return out;
    },
  });

  dash.calc('feel_series', {
    title: 'Feel check with 14-day averages',
    description: 'Daily feel check (Reported) with the average of the 14 days before each morning for energy and legs; chat answers given as a range count at its midpoint.',
    inputs: ['coach'],
    fn: (coach) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const rows = coach.filter((r) => r.kind === 'feel_day' && r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      const avg = (r, k) => { const xs = rows.filter((q) => day(q.date) < day(r.date) && day(q.date) >= day(r.date) - 14).map((q) => val(q[k])).filter((v) => v !== null); return xs.length >= 3 ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length * 10) / 10 : null; };
      return rows.map((r) => ({ date: r.date, sleep_q: val(r.sleep_q), energy: val(r.energy), legs: val(r.legs), stress: val(r.stress), pain: val(r.pain), pain_site: r.pain_site || '', energy_avg14: avg(r, 'energy'), legs_avg14: avg(r, 'legs') }));
    },
  });

  dash.calc('recovery_roll', {
    title: 'Recovery with your rolling band',
    description: 'Nightly sleep hours, HRV and resting HR with the mean ± 1 SD of the 28 days before each night, once 14 nights exist.',
    inputs: ['recovery'],
    fn: (recovery) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const rows = recovery.filter((r) => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      const keys = [['sleep_h', 'sleep'], ['hrv_overnight_ms', 'hrv'], ['resting_hr', 'rhr']];
      return rows.map((r) => {
        const o = { date: r.date };
        for (const [k, p] of keys) {
          const xs = rows.filter((q) => day(q.date) < day(r.date) && day(q.date) >= day(r.date) - 28).map((q) => val(q[k])).filter((v) => v !== null);
          const m = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
          const sd = xs.length > 1 ? Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1)) : null;
          o[p] = val(r[k]); o[p + '_mean'] = xs.length >= 14 ? Math.round(m * 100) / 100 : null; o[p + '_sd'] = xs.length >= 14 ? Math.round(sd * 100) / 100 : null;
        }
        return o;
      });
    },
  });

  dash.calc('volume', {
    title: 'Volume by week and sport',
    description: 'Mon–Sun weeks per sport from Garmin: hours, distance (miles; swims in yards) and climb (ft), with each week’s longest session. Run includes trail runs, bike includes Zwift, hike/walk combines hikes and walks (the athlete, Oct 18); sauna is left out; strength, and sessions logged on the dashboard before they synced, count toward time only.',
    inputs: ['activities', 'coach'],
    fn: (activities, coach) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const iso = (n) => new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
      const mon = (s) => { const n = day(s); return iso(n - ((new Date(n * 86400000).getUTCDay() + 6) % 7)); };
      const disc = (t, nm) => { t = String(t || '').toLowerCase(); if (/sauna/i.test(String(nm || ''))) return 'sauna'; if (/swim/.test(t)) return 'swim'; if (/(cycl|ride|bik|zwift)/.test(t)) return 'bike'; if (/run/.test(t)) return 'run'; if (/strength/.test(t)) return 'strength'; if (/hik/.test(t)) return 'hike'; if (/walk/.test(t)) return 'walk'; return 'other'; };
      const out = {};
      const get = (w, s) => (out[w + '|' + s] = out[w + '|' + s] || { week: w, sport: s, sessions: 0, hours: 0, dist: 0, climb_ft: 0, longest_min: 0, longest_min_date: '', longest_dist: 0, longest_dist_date: '', top_climb_ft: 0, top_climb_date: '' });
      const seen = new Set();
      for (const a of activities) {
        const d = String(a.local_start || '').slice(0, 10); const s = disc(a.type, a.name);
        if (!d || s === 'sauna') continue;
        const r = get(mon(d), s === 'walk' ? 'hike' : s); const min = val(a.duration_min) || 0;
        const dist = s === 'swim' ? (val(a.distance_mi) || 0) * 1760 : (val(a.distance_mi) || 0);
        const ft = s === 'swim' ? 0 : (val(a.ascent_ft) || 0);
        r.sessions += 1; r.hours += min / 60; r.dist += dist; r.climb_ft += ft;
        if (min > r.longest_min) { r.longest_min = min; r.longest_min_date = d; }
        if (dist > r.longest_dist) { r.longest_dist = dist; r.longest_dist_date = d; }
        if (ft > r.top_climb_ft) { r.top_climb_ft = ft; r.top_climb_date = d; }
        seen.add(d + '|' + s);
      }
      for (const f of coach.filter((x) => x.kind === 'feel_session' && String(x.activity_id).startsWith('manual-'))) {
        const s = ['bike', 'run', 'swim', 'strength', 'hike'].includes(f.discipline) ? f.discipline : null;
        if (!s || seen.has(f.date + '|' + s)) continue;
        const r = get(mon(f.date), s); const min = val(f.minutes) || 0;
        r.sessions += 1; r.hours += min / 60; if (min > r.longest_min) { r.longest_min = min; r.longest_min_date = f.date; }
      }
      const rd = (x, k) => Math.round(x * 10 ** k) / 10 ** k;
      return Object.values(out).sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : a.sport < b.sport ? -1 : 1))
        .map((r) => ({ ...r, hours: rd(r.hours, 2), dist: rd(r.dist, r.sport === 'swim' ? 0 : 2), climb_ft: Math.round(r.climb_ft), longest_min: Math.round(r.longest_min), longest_dist: rd(r.longest_dist, r.sport === 'swim' ? 0 : 2), top_climb_ft: Math.round(r.top_climb_ft) }));
    },
  });

  dash.calc('fitness', {
    title: 'Fitness markers per session',
    description: 'Run: flat runs (under 60 ft of climb per mile, 20+ min, 7–16 min/mi, average HR 135–175), pace scaled to 150 bpm: pace × (HR − RHR) ÷ (150 − RHR). Bike: Zwift rides of 30+ min (average HR 110–165), average power scaled to 130 bpm: power × (130 − RHR) ÷ (HR − RHR). RHR is the mean resting HR of the 15 days centred on the session. avg28 is the mean of the marker over the 28 days up to the session (2+ sessions). Estimated.',
    inputs: ['activities', 'recovery'],
    fn: (activities, recovery) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const rd = (x, k) => Math.round(x * 10 ** k) / 10 ** k;
      const rhr = recovery.map((r) => ({ d: day(r.date), v: val(r.resting_hr) })).filter((r) => r.v !== null && !isNaN(r.d));
      const rhrAt = (d) => { const xs = rhr.filter((r) => Math.abs(r.d - d) <= 7).map((r) => r.v); return xs.length >= 3 ? xs.reduce((s, v) => s + v, 0) / xs.length : null; };
      const out = [];
      for (const a of activities) {
        const t = String(a.type || '').toLowerCase(); const d = String(a.local_start || '').slice(0, 10); if (!d) continue;
        const hr = val(a.avg_hr); if (hr === null) continue;
        const R = rhrAt(day(d)); if (R === null) continue;
        if (/run/.test(t) && !/treadmill|virtual/.test(t)) {
          const mi = val(a.distance_mi), ft = val(a.ascent_ft) || 0, min = val(a.moving_min) || val(a.duration_min);
          if (!mi || !min || min < 20) continue;
          const pace = min / mi;
          if (pace < 7 || pace > 16 || ft / mi >= 60 || hr < 135 || hr > 175) continue;
          out.push({ date: d, marker: 'run', value: rd(pace * (hr - R) / (150 - R), 3), raw: rd(pace, 3), hr, rhr: rd(R, 1), miles: rd(mi, 2), id: String(a.activity_id), name: String(a.name || '') });
        } else if (/virtual_ride/.test(t) || /zwift/i.test(String(a.name || ''))) {
          const p = val(a.avg_power_w), min = val(a.duration_min);
          if (!p || !min || min < 30 || hr < 110 || hr > 165) continue;
          out.push({ date: d, marker: 'bike', value: rd(p * (130 - R) / (hr - R), 1), raw: p, hr, rhr: rd(R, 1), minutes: Math.round(min), id: String(a.activity_id), name: String(a.name || '') });
        }
      }
      out.sort((a, b) => (a.date < b.date ? -1 : 1));
      for (const r of out) {
        const xs = out.filter((q) => q.marker === r.marker && day(q.date) <= day(r.date) && day(q.date) > day(r.date) - 28).map((q) => q.value);
        r.avg28 = xs.length >= 2 ? rd(xs.reduce((s, v) => s + v, 0) / xs.length, 3) : null; r.n28 = xs.length;
      }
      return out;
    },
  });

  dash.calc('scorecard', {
    title: 'Goal scorecard',
    description: 'Each goal’s latest value against its target or its own recent past: weight vs the plan path; weekly hours vs the 5–7 h budget; 28-day resting HR, HRV and sleep vs the 28 days before; Garmin VO2max vs about 90 days earlier; logged strength and swims over the last 28 days.',
    inputs: ['weight_trend', 'weekly', 'recovery', 'activities', 'coach'],
    fn: (weight_trend, weekly, recovery, activities, coach) => {
      const val = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      const day = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000;
      const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10);
      const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
      const out = [];
      // Weight vs the plan path
      const wt = weight_trend; const last = wt[wt.length - 1];
      const path = coach.filter((r) => r.kind === 'weight').sort((a, b) => (a.date < b.date ? -1 : 1));
      if (last) {
        const t = day(last.date); let pa = null;
        for (let i = 0; i < path.length; i++) {
          const b = path[i]; if (t > day(b.date)) continue;
          const a = path[i - 1] || b; const f = day(b.date) === day(a.date) ? 1 : (t - day(a.date)) / (day(b.date) - day(a.date));
          const lerp = (k) => Number(a[k]) + (Number(b[k]) - Number(a[k])) * Math.max(0, Math.min(1, f));
          pa = { lo: lerp('lo'), mid: lerp('mid'), hi: lerp('hi') }; break;
        }
        const week = wt.filter((r) => day(r.date) <= t - 7).pop();
        const status = !pa ? 'info' : last.avg7 > pa.hi + 0.3 ? 'watch' : last.avg7 < pa.lo - 0.3 ? 'watch' : 'on';
        const msg = !pa ? 'No plan path for this date' : status === 'on' ? 'On plan' : last.avg7 > pa.hi ? 'Above the plan band' : 'Below plan: losing faster';
        out.push({ goal: 'weight', short: 'weight', label: 'Weight, 7-day avg', value: last.avg7, unit: 'lb', delta: week ? r1(last.avg7 - week.avg7) : null, delta_unit: 'lb vs a week ago', better: -1, status, status_text: msg,
          note: pa ? `Plan ${fixed(pa.mid, 1)} today · 146–148 by Jan 31` : '146–148 by Jan 31', spark: wt.filter((r) => day(r.date) > t - 42).map((r) => r.avg7) });
      }
      const wk = weekly.slice(0, -1).slice(-4);
      if (wk.length) {
        const avg = r1(mean(wk.map((w) => w.total)));
        out.push({ goal: 'volume', short: 'training volume', label: 'Training, 4-week avg', value: avg, unit: 'h/wk', delta: null, delta_unit: '', better: 1, status: 'info', status_text: avg >= 5 && avg <= 7 ? 'Inside the 5–7 h budget' : avg < 5 ? 'Under the 5–7 h budget' : 'Above the 5–7 h budget, which is not a ceiling',
          note: '', spark: weekly.slice(-9, -1).map((w) => w.total) });
      }
      // Recovery 28 days vs the 28 before
      const rec = recovery.filter((r) => r.date).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (rec.length) {
        const end = day(rec[rec.length - 1].date);
        const win = (k, from, to) => rec.filter((r) => day(r.date) > end - from && day(r.date) <= end - to).map((r) => val(r[k])).filter((v) => v !== null);
        const pairs = [['resting_hr', 'rhr', 'Resting HR, 28-day avg', 'bpm', -1, 'resting HR'], ['hrv_overnight_ms', 'hrv', 'HRV, 28-day avg', 'ms', 1, 'HRV'], ['sleep_h', 'sleep', 'Sleep, 28-day avg', 'h', 1, 'sleep']];
        for (const [k, goal, label, unit, better, short] of pairs) {
          const now = win(k, 28, 0), before = win(k, 56, 28);
          if (now.length < 14) continue;
          const v = r1(mean(now)); const dlt = before.length >= 14 ? r1(mean(now) - mean(before)) : null;
          let status = 'info', st = dlt === null ? '' : Math.abs(dlt) < (goal === 'sleep' ? 0.2 : 1) ? 'Steady vs the 28 days before' : (Math.sign(dlt) === better ? 'Improving' : 'Slipping') + ' vs the 28 days before';
          if (goal === 'sleep') { status = v >= 6.5 ? 'on' : 'watch'; st = v >= 6.5 ? 'At or above your normal 6.5–6.75 h' : 'Under your normal 6.5–6.75 h'; }
          out.push({ goal, short, label, value: v, unit, delta: dlt, delta_unit: unit + ' vs prior 28 days', better, status, status_text: st, note: goal === 'sleep' ? 'Garmin reads ~30–45 min high' : '', spark: rec.filter((r) => day(r.date) > end - 28).map((r) => val(r[k])).filter((x) => x !== null) });
        }
      }
      // VO2max (Garmin estimate)
      const vo = coach.filter((r) => r.kind === 'vo2max').sort((a, b) => (a.date < b.date ? -1 : 1));
      const vr = vo.filter((r) => val(r.vo2max_run) !== null);
      if (vr.length) {
        const lastV = vr[vr.length - 1]; const then = vr.filter((r) => day(r.date) <= day(lastV.date) - 85).pop();
        out.push({ goal: 'vo2', short: 'VO2max', label: 'VO2max, running', value: r1(val(lastV.vo2max_run)), unit: '', delta: then ? r1(val(lastV.vo2max_run) - val(then.vo2max_run)) : null, delta_unit: 'vs ~3 months ago', better: 1, status: 'info', status_text: 'Garmin estimate', note: '', spark: vr.slice(-12).map((r) => val(r.vo2max_run)) });
      }
      // Minimum-week habits over the last 28 days of data
      const dates = [...activities.map((a) => String(a.local_start || '').slice(0, 10)), ...coach.filter((r) => r.kind === 'feel_session').map((r) => r.date)].filter(Boolean).sort();
      if (dates.length) {
        const end = day(dates[dates.length - 1]);
        const strength = coach.filter((r) => r.kind === 'feel_session' && r.discipline === 'strength' && day(r.date) > end - 28).length
          + activities.filter((a) => /strength/i.test(String(a.type)) && day(String(a.local_start).slice(0, 10)) > end - 28).length;
        const swims = activities.filter((a) => /swim/i.test(String(a.type)) && day(String(a.local_start).slice(0, 10)) > end - 28).length;
        out.push({ goal: 'strength', short: 'strength', label: 'Strength, last 4 weeks', value: strength, unit: 'logged', delta: null, delta_unit: '', better: 1, status: strength >= 8 ? 'on' : 'watch', status_text: strength >= 8 ? 'Meets 2 a week' : `${strength} of 8 logged`, note: 'Target 2 a week. Log it on the Lifts tab (or Rate a session on Today).', spark: [] });
        out.push({ goal: 'swim', short: 'swims', label: 'Swims, last 4 weeks', value: swims, unit: 'swims', delta: null, delta_unit: '', better: 1, status: swims >= 2 ? 'on' : 'watch', status_text: swims >= 2 ? 'Meets 2 per month' : `${swims} of 2 a month`, note: '', spark: [] });
      }
      return out;
    },
  });
})();
