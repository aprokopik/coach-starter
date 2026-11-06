// body.js: the body_trend calc (Hume scale via Apple Health; trend only), read by the Body composition pillar's chart in
// pillars.js (chartFor, chart "body"). The old Body composition card (renderBody) went in Phase 5: its host was not on the page.
(() => {
  const { N, dayN } = window.CX;

  dash.calc('body_trend', {
    title: 'Body composition with 14-day averages',
    description: 'Scale weigh-ins (the day\'s first) with lean mass in lb and body fat in %, Measured by BIA, and the mean of the weigh-ins in the trailing 14 calendar days, Calculated.',
    inputs: ['recovery'],
    fn: (recovery) => {
      const rows = recovery.filter((r) => r.weight_source === 'scale' && (N(r.lean_lb) !== null || N(r.body_fat_pct) !== null)).sort((a, b) => (a.date < b.date ? -1 : 1));
      const avg = (i, k) => { const end = dayN(rows[i].date); const v = rows.slice(0, i + 1).filter((x) => end - dayN(x.date) < 14).map((x) => N(x[k])).filter((x) => x !== null); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null; };
      return rows.map((r, i) => ({ date: r.date, lean_lb: N(r.lean_lb), body_fat_pct: N(r.body_fat_pct), lean_avg14: avg(i, 'lean_lb'), fat_avg14: avg(i, 'body_fat_pct') }));
    },
  });
})();
