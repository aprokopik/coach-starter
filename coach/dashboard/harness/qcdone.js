// qcdone.js (6.80.3): Done on the finished Morning check-in card keeps the card away on the next open the same day, with
// browser storage that does not last (the athlete, Nov 15, 2026: "Morning check shows up on each new load, does not save I already
// selected done in prev session"). Open 1 taps Done with localStorage throwing; open 2 starts from that store. Exit 1 if it shows.
// Usage: node qcdone.js <index.html>
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const f = process.argv[2];
  const d = new Date(), pad = (n) => String(n).padStart(2, '0'), TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const feel = { date: TODAY, scale: 5, sleep: 4, energy: 4, legs: 4, stress: 4, pain: 0, saved_at: new Date().toISOString() };
  const open = async (seed) => { const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.addInitScript((s) => { window.__liveData = true; window.__seed = s;
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('no storage in the app frame'); } }); }, seed);
    await p.goto('file://' + f); await p.waitForTimeout(2500); return p; };
  const p1 = await open({ ['feel_daily/' + TODAY]: feel });
  const shown1 = await p1.evaluate(() => !document.getElementById('t-qc').hidden);
  const dn = p1.locator('#t-qc-body .qc-end .ck-btn--primary'); if (await dn.count()) await dn.click(); await p1.waitForTimeout(300);
  const doc = await p1.evaluate(() => { const H = window.__harness || window.H; const st = H && H.store; return st ? st.get('seen/morning-card') || null : null; });
  await p1.close();
  const p2 = await open({ ['feel_daily/' + TODAY]: feel, ...(doc ? { 'seen/morning-card': JSON.parse(JSON.stringify(doc)) } : {}) });
  const shown2 = await p2.evaluate(() => !document.getElementById('t-qc').hidden);
  console.log(JSON.stringify({ shown1, saved: doc, shown2 })); if (!shown1 || !doc || shown2) process.exitCode = 1;
  await b.close(); })();
