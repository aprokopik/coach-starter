// openlog.js: how long the dashboard takes to open on the viewer's own phone (6.76.0; the athlete, Nov 15, 2026: "it took at
// least 6 seconds when I opened the app on my home screen on my phone till the coach readiness score showed up").
// A thread cannot open the live page, so the page times itself: from the start of this page's own load (performance
// time 0, after the Claude app has opened the artifact) to the page files run, each dataset arrived, and the readiness
// word on screen. One store document per day, `open_log/<YYYY-MM-DD>` {opens: [...], saved_at}, at most 12 opens kept;
// timings only, nothing the athlete entered. Read with ArtifactData; never copied into the repo. What happens before the page
// starts loading (the app opening, sign in) is not seen here: the app's own wait is the gap between a stopwatch and "ready".
(() => {
  const ms = () => Math.round(performance.now());
  const rec = { at: new Date().toISOString(), scripts_ms: ms(), data: {}, ready_ms: null, w: window.innerWidth };
  function timings() { // read when saving, so the data downloads are in the lists too
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) { rec.page_response_ms = Math.round(nav.responseEnd); rec.page_dom_ms = Math.round(nav.domContentLoadedEventEnd) || null; }
      const res = performance.getEntriesByType('resource');
      rec.fetches = res.length; rec.fetch_kb = Math.round(res.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024);
      rec.slowest = res.slice().sort((a, b) => b.duration - a.duration).slice(0, 5).map((r) => ({ ms: Math.round(r.duration), end_ms: Math.round(r.responseEnd), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024), what: String(r.name).split('?')[0].split('/').slice(-2).join('/') }));
    } catch (e) { /* timing lists missing: the marks below still say when each part arrived */ }
  }
  let saved = false;
  async function save() {
    if (saved) return; saved = true;
    timings();
    try {
      const db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; if (!db) return;
      const day = rec.at.slice(0, 10), ref = db.doc('open_log/' + day);
      let opens = []; try { const d = await ref.get(); const v = d && d.exists ? d.data() : null; opens = v && Array.isArray(v.opens) ? v.opens : v && typeof v.opens === 'string' ? JSON.parse(v.opens) : []; } catch (e) { opens = []; }
      opens.push(rec); await ref.set({ opens: opens.slice(-12), saved_at: new Date().toISOString() });
    } catch (e) { /* a timing record is never worth an error on screen */ }
  }
  dash.onData(() => {
    for (const id of ['coach', 'recovery', 'activities']) { const d = dash.data(id); if (d && d.status === 'ok' && rec.data[id] === undefined) rec.data[id] = ms(); }
    const r = document.getElementById('t-ready');
    if (rec.ready_ms === null && r && r.textContent && r.textContent !== '—') rec.ready_ms = ms();
    if (rec.ready_ms !== null && Object.keys(rec.data).length === 3) save();
  });
  setTimeout(() => { if (rec.ready_ms === null) rec.ready_ms = -1; save(); }, 30000); // a page that never got there still says so
})();
