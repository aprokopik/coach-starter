// qcdone.js (6.80.3, reworked 6.141.1): Done on the finished Morning check-in card keeps the card away on the next open the
// same day, with browser storage that does not last (the athlete, Nov 15, 2026: "Morning check shows up on each new load, does not
// save I already selected done in prev session"). Since 6.84.0 a card whose answers are all saved never shows again, so the
// case left is a card finished with questions still open: open 1 starts with nothing saved, skips every question and taps
// Done with localStorage throwing; open 2 starts from that store. Exit 1 if the card shows again (finding
// 20261111-state-morning-card) or if open 1 never reached Done.
// Usage: node qcdone.js <index.html>
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
  const f = process.argv[2];
  const open = async (seed) => { const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p.addInitScript((s) => { window.__liveData = true; window.__seed = s;
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('no storage in the app frame'); } }); }, seed);
    await p.goto('file://' + f); await p.waitForTimeout(2500); return p; };
  const shown = (p) => p.evaluate(() => { const c = document.getElementById('t-qc'); return !!c && !c.hidden; });
  const p1 = await open({});
  const shown1 = await shown(p1);
  let skips = 0;
  for (let i = 0; i < 40; i++) { // Skip through every question (the morning five, a lift question, a monthly survey)
    if (await p1.locator('#t-qc-body .qc-end .ck-btn--primary').count()) break;
    const sk = p1.locator('#t-qc-body .qc-foot .qc-link', { hasText: 'Skip' });
    if (!(await sk.count())) break;
    await sk.last().click(); skips += 1; await p1.waitForTimeout(120); }
  const dn = p1.locator('#t-qc-body .qc-end .ck-btn--primary'); const reached = (await dn.count()) > 0;
  if (reached) await dn.click();
  await p1.waitForTimeout(400);
  const hidden1 = !(await shown(p1));
  const store = await p1.evaluate(() => { const H = window.__harness || window.H; const st = H && H.store; if (!st) return {};
    const out = {}; for (const k of ['seen/morning-card']) { const v = st.get(k); if (v) out[k] = v; } return out; });
  await p1.close();
  const p2 = await open(JSON.parse(JSON.stringify(store)));
  const shown2 = await shown(p2);
  console.log(JSON.stringify({ shown1, skips, reached, hidden1, saved: store['seen/morning-card'] || null, shown2 }));
  if (!shown1 || !reached || !hidden1 || !store['seen/morning-card'] || shown2) process.exitCode = 1;
  await b.close(); })();
