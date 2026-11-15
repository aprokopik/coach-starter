// openlog.js: how long the dashboard takes to open on the viewer's own phone (6.76.0; the athlete, Nov 15, 2026: "it took at
// least 6 seconds when I opened the app on my home screen on my phone till the coach readiness score showed up").
// A thread cannot open the live page, so the page times itself. Loaded FIRST (before calc.js), so it sees everything after.
// One store document per day, `open_log/<YYYY-MM-DD>` {opens: [...], saved_at}, at most 12 opens kept; timings only,
// nothing the athlete entered. Read with ArtifactData; never copied into the repo.
// 6.77.1: also saves when the app closes before 20 s, and records frame and page heights.
// 6.77.0 (the athlete's first live record, Nov 15: the page's data was ready 40 ms after its code started, yet the screen stayed
// part black and taps did nothing for 6 to 7 s, and the record took 8 s to save): every time is now in ms from this
// file's start (the page's own clock started long before, as the app keeps the frame alive), and each open also records
//   stalls   every gap of 250 ms or more in a 100 ms heartbeat for 20 s: the page's main thread was busy (no taps, no paint)
//   store    (6.77.0 only; removed in 6.77.2, the wrapper broke store writes on the phone)
//   errors   6.77.2: uncaught errors and rejected promises; taps: each tap, its delay and target; lvx: level up screen state
//   data     calls to the datasets (dash.data): count and total ms, and when each dataset first arrived
//   draws    each data draw (dash.onData handlers): when and how long
// What happens before the page code starts (the app opening, sign in, the page files arriving) is not seen here.
(() => {
  const T0 = performance.now(), ms = () => Math.round(performance.now() - T0);
  const rec = { v: 3, at: new Date().toISOString(), page_age_ms: Math.round(T0), data: {}, ready_ms: null, w: window.innerWidth, h: window.innerHeight,
    stalls: [], store: [], dash: { calls: 0, ms: 0 }, draws: [] };
  const readyCheck = () => { const r = document.getElementById('t-ready'); if (rec.ready_ms === null && r && r.textContent && r.textContent !== '—') rec.ready_ms = ms(); };
  // heartbeat: a late tick means the main thread was busy for that long
  let last = performance.now(), beats = 0;
  const hb = setInterval(() => { const n = performance.now(), gap = n - last; last = n; beats++; readyCheck(); if (saved) return;
    if (gap >= 250 && rec.stalls.length < 40) rec.stalls.push([Math.round(n - T0 - gap), Math.round(gap)]);
    if (beats >= 200) clearInterval(hb); }, 100);
  // 6.77.2: the store is no longer wrapped. Since 6.77.0 wrapped it (a Proxy around window.claude.use('db')), not one store
  // write from the athlete's phone arrived (no open record, no level up seen), so the page now uses the store untouched.
  // page errors: every uncaught error and rejected promise, so a failure on the phone shows in the record
  rec.errors = [];
  window.addEventListener('error', (e) => { if (rec.errors.length < 10) rec.errors.push([ms(), String(e.message || e.type).slice(0, 200), String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0)]); });
  window.addEventListener('unhandledrejection', (e) => { if (rec.errors.length < 10) rec.errors.push([ms(), 'promise: ' + String(e.reason && (e.reason.message || e.reason.code) || e.reason).slice(0, 200), '']); });
  // taps: each tap and how long until the page handled it, so a dead button shows
  rec.taps = []; document.addEventListener('click', (e) => { if (rec.taps.length < 20) { const t = e.target && e.target.closest ? e.target.closest('button, a, [role=tab]') : null; rec.taps.push([ms(), Math.round(performance.now() - e.timeStamp), t ? (t.className || t.tagName).toString().slice(0, 40) : 'none']); } }, true);
  // the datasets and each draw
  try {
    const data = dash.data.bind(dash), onData = dash.onData.bind(dash);
    dash.data = (id) => { const s = performance.now(); const r = data(id); rec.dash.calls++; rec.dash.ms += performance.now() - s; return r; };
    dash.onData = (fn) => onData(() => { const s = ms(); try { fn(); } finally { const d = ms() - s; if (rec.draws.length < 60 && d >= 5) rec.draws.push([s, d]); } });
    onData(() => {
      for (const id of ['coach', 'recovery', 'activities']) { const d = data(id); if (d && d.status === 'ok' && rec.data[id] === undefined) rec.data[id] = ms(); }
      setTimeout(readyCheck, 0); // after the page's own draw, which registers after this file
    });
  } catch (e) { /* the runtime's dash object is fixed: no draw timing */ }
  let saved = false;
  async function save() {
    if (saved) return; saved = true; clearInterval(hb);
    rec.dash.ms = Math.round(rec.dash.ms); rec.saved_ms = ms(); rec.lvx = (() => { const b = document.getElementById('t-lvup'); return b ? (b.hidden ? 'closed' : 'open') : 'none'; })(); rec.h_now = window.innerHeight; rec.doc_h = document.documentElement.scrollHeight;
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) rec.page_dom_ms = Math.round(nav.domContentLoadedEventEnd - T0) || null;
      const res = performance.getEntriesByType('resource').filter((r) => r.startTime >= T0 - 60000);
      rec.fetches = res.length;
      rec.slowest = res.slice().sort((a, b) => b.duration - a.duration).slice(0, 6).map((r) => ({ start_ms: Math.round(r.startTime - T0), ms: Math.round(r.duration), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024), what: String(r.name).split('?')[0].split('/').slice(-2).join('/') }));
    } catch (e) { /* timing lists missing */ }
    try {
      const db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; if (!db) return;
      const day = rec.at.slice(0, 10), ref = db.doc('open_log/' + day);
      let opens = []; try { const d = await ref.get(); const v = d && d.exists ? d.data() : null; opens = v && Array.isArray(v.opens) ? v.opens : v && typeof v.opens === 'string' ? JSON.parse(v.opens) : []; } catch (e) { opens = []; }
      opens.push(rec); await ref.set({ opens: opens.slice(-12), saved_at: new Date().toISOString() });
    } catch (e) { /* a timing record is never worth an error on screen */ }
  }
  // 6.77.1: an open closed before 20 s still saves (the athlete's Nov 15 open left none); h and doc_h tell a frame as tall as the page
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
  setTimeout(save, 10000); // 6.77.2: at 10 s (the 6.76.0 record saved at 8 s; none saved at 20 s)
})();
