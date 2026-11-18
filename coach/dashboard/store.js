// store.js 6.111.0: the one door to the store; a failed save is kept, resent and shown
(function () {
  const CX = (window.CX = window.CX || {}), K = 'cx-unsent', log = (CX.saveLog = []), now = Date.now;
  let raw = null, p = null, tile = null, at = 0;
  const keep = (f) => { try { const m = JSON.parse(localStorage.getItem(K) || '{}'); f(m); localStorage.setItem(K, JSON.stringify(m)); } catch (e) {} };
  const near = (e) => { const t = e.target.closest && e.target.closest('.ck-tile,article,section'); if (t) { tile = t; at = now(); } };
  addEventListener('pointerdown', near, true); addEventListener('keydown', near, true);
  // 6.149.1: a card with a refused tap keeps its chip through redraws until a save lands
  const pend = new Set(); let mo, mt;
  const put = (t) => { // the athlete, Nov 16: a chip by the card title, a tap retries
    if (!t || !t.isConnected || t.closest('[hidden]') || t.querySelector('.cx-unsaved')) return;
    const c = document.createElement('button'); c.type = 'button'; c.className = 'cx-unsaved'; c.textContent = '↻ Not saved'; c.setAttribute('aria-label', 'Not saved. Kept on this phone. Tap to try again'); c.onclick = (e) => { e.stopPropagation(); resend(); };
    const h = t.querySelector('.ck-tile-head'); h ? h.insertBefore(c, h.children[1] || null) : t.prepend(c);
  };
  const again = () => { clearTimeout(mt); mt = setTimeout(() => { for (const id of pend) put(document.getElementById(id)); }, 60); };
  const chip = (t) => setTimeout(() => {
    if (t && t.id) { pend.add(t.id); if (!mo && window.MutationObserver) { mo = new MutationObserver(again); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] }); } t = document.getElementById(t.id) || t; }
    put(t);
  }, 60);
  const ok = (k) => { keep((m) => { delete m[k]; }); pend.clear(); document.querySelectorAll('.cx-unsaved').forEach((l) => l.remove()); };
  const bad = (k, e, t) => { log.push((t ? 'tap ' : 'auto ') + k + ' ' + String((e && (e.code || e.message)) || e).slice(0, 80)); chip(t); };
  async function write(k, body) {
    const t = now() - at < 3e3 ? tile : null, v = JSON.parse(JSON.stringify(body));
    try { await raw.doc(k).set(v); ok(k); } catch (e) { keep((m) => { m[k] = { v, t: now() }; }); bad(k, e, t); throw e; }
  }
  async function resend() {
    let m = {}; keep((x) => { m = x; });
    for (const k in m) { if (!(now() - m[k].t < 1728e5)) { keep((x) => { delete x[k]; }); continue; } try { await raw.doc(k).set(m[k].v); ok(k); } catch (e) { bad(k, e, null); return; } }
  }
  const api = { doc: (k) => { const r = raw.doc(k); return { get: (...a) => r.get(...a), set: (v) => write(k, v) }; }, collection: (k) => raw.collection(k) };
  CX.store = () => p || (p = (async () => {
    try { raw = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { raw = null; }
    if (!raw) return null;
    setTimeout(async () => {
      try { const d = raw.doc('probe/page'), a = new Date().toISOString(); await d.set({ at: a }); const s = await d.get(); if (!s.exists || s.data().at !== a) throw new Error('read back'); } catch (e) { return bad('probe/page', e, null); }
      resend();
    }, 2500);
    return api;
  })());
})();
