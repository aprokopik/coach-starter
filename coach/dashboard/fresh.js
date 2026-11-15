// fresh.js: the refresh status icon at the very top (#cx-fresh, after the as-of line).
// History: 6.23.0 (the athlete, Nov 12, 2026) made a tap start the Coach daytime refresh task through the Claude Code Remote
// connector. Tested on his phone the same day: dashboard pages cannot use that connector ("Couldn't load this
// connector"), and there is no GitHub connector on the account, so a page cannot start a refresh. the athlete then chose
// "A. Status, runs every 2 h": the icon shows when the next update lands, and a tap says so and points to "pull" in chat.
// Next update: the 2 hour daytime refresh runs at 9:41 AM to 9:41 PM (coach/ops/data_paths.json daytime_refresh), the
// morning check-in at 7:45 AM. The word beside the icon (#cx-fresh-s) always reads "next <time>"; for 8 s after a tap
// it reads "Next update <time>. Need it now? Type pull in chat". Nothing is written and no connector is called.
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (h, m) => `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  // the next scheduled update in the viewer's local time (the athlete's is ET, the schedule's zone)
  function nextRun() {
    const n = new Date(); const m = n.getHours() * 60 + n.getMinutes();
    // 6.54.0: the check-in time and whether a daytime refresh exists come from the build row (app.js sched)
    const sc = window.CX && window.CX.sched ? window.CX.sched() : { at: '7:45 AM', min: 7 * 60 + 45, refresh: true };
    if (m < sc.min) return sc.at;
    if (sc.refresh) for (let h = 9; h <= 21; h += 2) if (h * 60 + 41 > m) return fmt(h, 41);
    return 'tomorrow ' + sc.at;
  }
  window.CX.nextUpdate = nextRun; // change.js says when a changed day is replanned
  let until = 0; // a tap's longer message shows until this time
  function render(tapped) {
    const btn = $('cx-fresh'), word = $('cx-fresh-s'); if (!btn || !word) return;
    const next = nextRun();
    btn.hidden = false; word.hidden = false;
    tapped = tapped || Date.now() < until;
    word.textContent = tapped ? `Next update ${next}. Need it now? Type pull in chat` : `next update ${next}`;
    const label = `Next data update ${next}. For fresh data now, type pull in chat`;
    btn.setAttribute('aria-label', label); btn.title = label;
  }
  const btn = $('cx-fresh');
  if (btn) btn.addEventListener('click', () => { until = Date.now() + 8000; render(true); setTimeout(() => render(false), 8100); });
  if (window.CX) window.CX.freshRender = () => render(false);
  render(false);
  setInterval(() => render(false), 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(false); });
})();
