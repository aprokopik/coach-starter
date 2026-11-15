// openlog.js: how long the dashboard takes to open on the viewer's own phone (6.76.0; the athlete, Nov 15, 2026: "it took at
// least 6 seconds when I opened the app on my home screen on my phone till the coach readiness score showed up").
// A thread cannot open the live page, so the page times itself. Loaded FIRST (before calc.js), so it sees everything after.
// One store document per day, `open_log/<YYYY-MM-DD>` {opens: [...], saved_at}, at most 12 opens kept; timings only,
// nothing the athlete entered. Read with ArtifactData; never copied into the repo.
// 6.77.0 (the athlete's first live record, Nov 15: the page's data was ready 40 ms after its code started, yet the screen stayed
// part black and taps did nothing for 6 to 7 s, and the record took 8 s to save): every time is now in ms from this
// file's start (the page's own clock started long before, as the app keeps the frame alive), and each open also records
//   stalls   every gap of 250 ms or more in a 100 ms heartbeat for 20 s: the page's main thread was busy (no taps, no paint)
//   store    each dashboard store read and write: what, when it started, how long it took
//   data     calls to the datasets (dash.data): count and total ms, and when each dataset first arrived
//   draws    each data draw (dash.onData handlers): when and how long
// What happens before the page code starts (the app opening, sign in, the page files arriving) is not seen here.
(() => {
  const T0 = performance.now(), ms = () => Math.round(performance.now() - T0);
  const rec = { v: 2, at: new Date().toISOString(), page_age_ms: Math.round(T0), data: {}, ready_ms: null, w: window.innerWidth,
    stalls: [], store: [], dash: { calls: 0, ms: 0 }, draws: [] };
  const readyCheck = () => { const r = document.getElementById('t-ready'); if (rec.ready_ms === null && r && r.textContent && r.textContent !== '—') rec.ready_ms = ms(); };
  // heartbeat: a late tick means the main thread was busy for that long
  let last = performance.now(), beats = 0;
  const hb = setInterval(() => { const n = performance.now(), gap = n - last; last = n; beats++; readyCheck();
    if (gap >= 250 && rec.stalls.length < 40) rec.stalls.push([Math.round(n - T0 - gap), Math.round(gap)]);
    if (beats >= 200) clearInterval(hb); }, 100);
  // the store: time each read and write the page makes
  const timed = (what, p) => { const s = ms(); const row = [what, s, null]; if (rec.store.length < 60) rec.store.push(row);
    return Promise.resolve(p).then((v) => { row[2] = ms() - s; return v; }, (e) => { row[2] = -(ms() - s); throw e; }); };
  // a Proxy forwards everything else to the real object, with its own `this`, so the page's calls behave as before
  const proxy = (o, over) => new Proxy(o, { get: (t, k) => (k in over ? over[k] : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
  const wrapDb = (db) => (!db ? db : proxy(db, {
    doc: (p) => { const d = db.doc(p); return proxy(d, { get: (...a) => timed('get ' + p.split('/')[0], d.get(...a)), set: (...a) => timed('set ' + p.split('/')[0], d.set(...a)) }); },
    collection: (p) => { const c = db.collection(p); return proxy(c, { get: (...a) => timed('list ' + p, c.get(...a)) }); },
  }));
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const use = window.claude.use.bind(window.claude); let dbp = null;
      window.claude.use = (cap, ...a) => (cap === 'db' ? (dbp = dbp || timed('use db', use(cap, ...a)).then(wrapDb)) : use(cap, ...a));
    }
  } catch (e) { /* no timing of the store; the rest still records */ }
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
    rec.dash.ms = Math.round(rec.dash.ms); rec.saved_ms = ms();
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
  setTimeout(save, 20500); // after the heartbeat's 20 s, so every stall of the open is in the record
})();
