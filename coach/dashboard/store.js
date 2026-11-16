// store.js 6.105.0: the one door to the store; a failed save is kept, resent and shown
(function () {
  const CX = (window.CX = window.CX || {}), K = 'cx-unsent', log = (CX.saveLog = []), now = Date.now;
  let raw = null, p = null, miss = 0, tile = null, at = 0;
  const keep = (f) => { try { const m = JSON.parse(localStorage.getItem(K) || '{}'); f(m); localStorage.setItem(K, JSON.stringify(m)); } catch (e) {} };
  const near = (e) => { const t = e.target.closest && e.target.closest('.ck-tile,article,section'); if (t) { tile = t; at = now(); } };
  addEventListener('pointerdown', near, true); addEventListener('keydown', near, true);
  const bar = (on) => {
    let b = document.getElementById('cx-savebar');
    if (!b && on) {
      b = document.createElement('div'); b.id = 'cx-savebar'; b.className = 'ck cx-savebar'; b.role = 'status';
      b.innerHTML = '<div class="ck-stale" data-s="act"><p class="ck-stale-t"><span class="ck-stale-w">Not saving</span> Your last taps did not reach the coach. They are kept on this phone and will send when they can.</p><button type="button" class="ck-btn">Try now</button></div>';
      b.querySelector('button').onclick = () => resend();
      const n = document.querySelector('.cx-tabs'); n ? n.after(b) : document.body.prepend(b);
    }
    if (b) b.hidden = !on;
  };
  const line = (t) => setTimeout(() => {
    if (!t || !t.isConnected || t.closest('[hidden]') || /Not saved/.test(t.textContent)) return;
    const l = document.createElement('p'); l.className = 'cx-unsaved'; l.role = 'status'; l.textContent = 'Not saved. Kept on this phone, trying again.'; t.append(l);
  }, 60);
  const ok = (k) => { keep((m) => { delete m[k]; }); miss = 0; bar(false); document.querySelectorAll('.cx-unsaved').forEach((l) => l.remove()); };
  const bad = (k, e, t) => { miss++; log.push((t ? 'tap ' : 'auto ') + k + ' ' + String((e && (e.code || e.message)) || e).slice(0, 80)); line(t); if (miss > 1) bar(true); };
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
      try { const d = raw.doc('probe/page'), a = new Date().toISOString(); await d.set({ at: a }); const s = await d.get(); if (!s.exists || s.data().at !== a) throw new Error('read back'); } catch (e) { miss = 1; return bad('probe/page', e, null); }
      resend();
    }, 2500);
    return api;
  })());
})();
