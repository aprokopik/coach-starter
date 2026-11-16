/* Mock of the Dashboard type's page runtime (window.dash) for local rendering. NOT the real runtime.
   Datasets come from <script type="application/json" id="harness-data"> (inlined by build.py). */
(function () {
  'use strict';
  const H = (window.__harness = { ready: false, link: null, lastRedrawMs: null, redraws: 0, errors: [] });

  // ---------- CSV: quoted fields, "" escapes, commas/newlines inside quotes, CRLF ----------
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const out = []; let row = []; let f = ''; let q = false; let i = 0; const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
        f += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(f); f = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; i++; continue; }
      f += c; i++;
    }
    if (f !== '' || row.length) { row.push(f); out.push(row); }
    const cols = out.shift() || [];
    const rows = out.filter((r) => !(r.length === 1 && r[0] === '')).map((r) => { const o = {}; cols.forEach((k, j) => { o[k] = r[j] === undefined ? '' : r[j]; }); return o; });
    return { columns: cols, rows };
  }

  // JSON rows: nested arrays/objects become JSON text, as the live runtime hands them to the page
  function jsonRows(j) {
    const rows = Array.isArray(j) ? j : (j && (j.rows || j.data || j.results)) || [];
    const cols = []; const seen = new Set();
    const out = rows.map((r) => {
      const o = {};
      for (const k in r) {
        if (!seen.has(k)) { seen.add(k); cols.push(k); }
        const v = r[k];
        o[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      }
      return o;
    });
    return { columns: cols, rows: out };
  }

  const files = {}; // id -> result object
  const calcs = {}; // id -> {inputs, fn, title, description}
  let calcCache = {};
  const loaders = {};
  const handlers = [];
  let params = {};

  function result(status, rows, columns, extra) {
    return Object.assign({ status, data: rows, rows, columns: columns || [], message: null, refreshing: false, meta: {} }, extra || {});
  }

  function load() {
    const el = document.getElementById('harness-data');
    const raw = el ? JSON.parse(el.textContent) : {};
    for (const id in raw) {
      const d = raw[id];
      try {
        if (d.type === 'csv') { const p = parseCSV(d.text); files[id] = result('ok', p.rows, p.columns, { meta: { file: d.file, rowCount: p.rows.length } }); }
        else if (d.type === 'json') { const p = jsonRows(d.json); files[id] = result('ok', p.rows, p.columns, { meta: { file: d.file, rowCount: p.rows.length } }); }
        else files[id] = result('missing', [], [], { message: 'No such dataset in the harness' });
      } catch (e) { files[id] = result('error', [], [], { message: String(e && e.message || e) }); console.error('[harness] dataset ' + id + ' failed to parse', e); }
    }
    calcCache = {};
  }

  // 6.80.2: the mock acts like the live runtime by default (calcs rerun and a fresh read-only copy on every dash.data call), so
  // every check sees what the phone sees; window.__liveData = false (an init script) turns it off (Dashboard slowness RCA, Nov 15)
  const LIVE = () => window.__liveData !== false;
  function evalCalc(id, stack) {
    if (calcCache[id] && !LIVE()) return calcCache[id]; // 6.77.5: __liveData acts like the live runtime, which runs a calc again on every dash.data call
    const c = calcs[id];
    if ((stack || []).includes(id)) { return result('error', [], [], { message: 'calc cycle: ' + stack.concat(id).join(' -> ') }); }
    const ins = [];
    for (const inp of c.inputs || []) {
      const r = get(inp, (stack || []).concat(id));
      if (r.status !== 'ok') { const res = result(r.status === 'missing' ? 'error' : r.status, [], [], { message: `input ${inp} is ${r.status}` }); calcCache[id] = res; return res; }
      ins.push(r.data);
    }
    let res;
    try {
      const v = c.fn(...ins);
      const cols = Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' ? Object.keys(v[0]) : [];
      res = result('ok', v, cols, { meta: { calc: true, title: c.title || null } });
    } catch (e) {
      console.error('[harness] dash.calc ' + id + ' threw: ' + (e && e.stack || e));
      res = result('error', [], [], { message: String(e && e.message || e) });
    }
    calcCache[id] = res;
    return res;
  }

  function get(id, stack) {
    if (calcs[id]) return evalCalc(id, stack);
    if (files[id]) return files[id];
    return result('missing', [], [], { message: 'Unknown dataset ' + id });
  }

  const LIGHT = ['#2f6fdb', '#d9480f', '#2b8a3e', '#9c36b5', '#c48a00', '#0b7285', '#c2255c', '#5f3dc4'];
  const DARK = ['#74a5f5', '#ff8a50', '#5fcf7a', '#d080e8', '#f2c14e', '#4fc3d4', '#f0739e', '#9d85f0'];
  const colors = LIGHT.slice();
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyMode() { const src = mq && mq.matches ? DARK : LIGHT; for (let i = 0; i < 8; i++) colors[i] = src[i]; }
  applyMode();

  function redraw() {
    const t0 = performance.now();
    for (const fn of handlers) {
      try { fn(); } catch (e) { console.error('[harness] onData handler threw: ' + (e && e.stack || e)); }
    }
    const ms = performance.now() - t0;
    H.lastRedrawMs = ms; H.redraws++;
    return ms;
  }

  let booted = false;
  window.dash = {
    data: (id) => { const r = get(id); if (!LIVE()) return r; const fz = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) fz(o[k]); } return o; }; return fz(structuredClone(r)); }, // 6.77.5: __liveData also hands back a fresh read-only copy each call, as the live runtime does (the athlete's Nov 15 open: 1,054 calls, 38 s of work)
    onData: (fn) => { handlers.push(fn); if (booted) { try { fn(); } catch (e) { console.error('[harness] onData handler threw: ' + (e && e.stack || e)); } } },
    calc: (id, def) => { calcs[id] = Object.assign({ inputs: [] }, def || {}); calcCache = {}; },
    loader: (id, def) => { loaders[id] = def || {}; },
    colors,
    params: () => Object.assign({}, params),
    setParams: (o) => { params = Object.assign({}, params, o || {}); redraw(); },
    resetParams: () => { params = {}; redraw(); },
    setLink: (name) => { H.link = name; },
    refresh: () => {},
  };

  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redraw, 50); });
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { applyMode(); redraw(); });

  H.redraw = redraw;
  H.calcIds = () => Object.keys(calcs);
  H.fileIds = () => Object.keys(files);
  H.boot = function () {
    load();
    booted = true;
    redraw();
    const root = document.getElementById('dash-root'); if (root) root.setAttribute('data-dash-state', 'ready');
    requestAnimationFrame(() => requestAnimationFrame(() => { H.ready = true; }));
  };

  // window.claude.use('db'): in-memory, empty store (no saved check-ins / feel / lift logs). HARNESS-ONLY.
  const store = new Map(); // Phase 5 Check-in: H.store and H.writes (every set, in order, as JSON text) for the save round-trip; window.__seed (an init script) pre-fills docs
  H.store = store; H.writes = []; if (window.__seed) for (const k in window.__seed) store.set(k, JSON.parse(JSON.stringify(window.__seed[k])));
  // 6.105.0: the stand-in follows the live runtime contract (0.2.96, db.d.ts and claude.d.ts): the namespace, every ref and
  // every snapshot and its data() are frozen; a body must be a plain JSON object under 256 KiB. On Nov 15 the stand-in was a
  // plain object, so the 6.77.0 Proxy around the store worked here and threw on every call on the phone (taps-not-saving RCA).
  const deep = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deep(o[k]); } return o; };
  const snap = (id, v) => Object.freeze({ id, exists: v !== undefined, metadata: Object.freeze({ fromCache: false, hasPendingWrites: false }), data: () => (v === undefined ? undefined : deep(JSON.parse(JSON.stringify(v)))) });
  const hold = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : null);
  const body = (v) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) throw new TypeError('db: a document body must be a plain object'); const t = JSON.stringify(v); if (t.length > 262144) { const e = new Error('db: body over 256 KiB'); e.code = 'invalid_argument'; throw e; } return t; };
  const db = Object.freeze({
    doc: (path) => { if (window.__throwStore) throw new TypeError('store refused'); if (typeof path !== 'string' || path.split('/').length % 2) throw new TypeError('db.doc: path needs an even number of segments'); return Object.freeze({
      path,
      get: async () => { await hold(window.__slowReads); return snap(path.split('/').pop(), store.get(path)); }, // 6.77.4: __slowReads holds doc reads too (the phone's store is a network round trip)
      set: async (v) => { const t = body(v); if (window.__failWrites) { H.failed = (H.failed || 0) + 1; const e = new Error('harness: write refused'); e.code = 'unavailable'; throw e; } await hold(window.__slowWrites); H.writes.push([path, t]); store.set(path, JSON.parse(t)); }, // __slowWrites (ms) holds each write; __failWrites makes every write fail (the retrying state)
    }); },
    collection: (name) => { if (window.__throwStore) throw new TypeError('store refused'); return Object.freeze({
      get: async () => { await hold(window.__slowReads); return Object.freeze({ docs: Object.freeze([...store.entries()].filter(([k]) => k.startsWith(name + '/') && k.split('/').length === name.split('/').length + 1).map(([k, v]) => snap(k.slice(name.length + 1), v))) }); },
    }); },
  });
  if (!/[?&]nodb\b/.test(location.search)) window.claude = Object.assign(window.claude || {}, { use: async (cap) => (cap === 'db' ? db : cap === 'mcp' ? (window.__mcp || null) : null) }); // window.__mcp (an init script): a stand-in for the mcp capability (fresh.js)
})();
