// lvseen.js (6.77.4): a win already seen in the store must never open the level up screen, even when store reads are slow
// (the athlete, Nov 15: a dimmed Today until a tap). Usage: node lvseen.js <page built with --lvx>. Exit 1 when the screen opened.
// 6.149.1: the check learns today's wins first (open the page, press Thanks, coach on every screen, read the seen list), then
// seeds exactly those, so it no longer goes stale as the 7 day window moves (loop finding 20261117-harness-live-app-harness-
// checks-lvseen-j). The Nov 13 seed stays as a second pass: the higher of a two level jump seen must also cover the lower one.
const { chromium } = require('playwright');
const NOV13 = ['bike|stage-2|2026-11-13', 'bike|Top 20%|2026-11-13', 'bike|goal-Target|2026-11-13'];
async function learn(b, f) { // the ids of every win on today's data, as the page files them after Thanks, coach
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('file://' + f); await p.waitForTimeout(2000);
  for (let i = 0; i < 20; i++) { const open = await p.evaluate(() => { const x = document.getElementById('t-lvup'); return !!x && !x.hidden; }); if (!open) break; await p.click('.td-lvx-ok'); await p.waitForTimeout(300); }
  const ids = await p.evaluate(() => (window.CX.lvSeenShared ? window.CX.lvSeenShared() : [])); await p.close(); return ids;
}
async function check(b, f, ids, name) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript((ids) => { window.__slowReads = 1500; window.__seed = { 'seen/levelups': { ids } };
    window.__opened = 0; new MutationObserver(() => { const b = document.getElementById('t-lvup'); if (b && !b.hidden) window.__opened++; }).observe(document, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); }, ids);
  await p.goto('file://' + f); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({ opened: window.__opened, hiddenNow: document.getElementById('t-lvup').hidden, text: document.getElementById('t-lvup').innerText.replace(/\s+/g, ' ').slice(0, 80) }));
  console.log(f.split('/').pop(), name, ids.length + ' seen', JSON.stringify(r)); if (r.opened || !r.hiddenNow) process.exitCode = 1;
  await p.close();
}
(async () => { const b = await chromium.launch();
  for (const f of process.argv.slice(2)) {
    const ids = await learn(b, f);
    if (!ids.length) console.log(f.split('/').pop(), 'learned: no wins in the last 7 days on this data');
    await check(b, f, ids, 'learned');
    await check(b, f, [...ids, ...NOV13], 'nov13'); // 6.161.0: today's wins seen too, so only the Nov 13 rule is under test once new wins exist
  }
  await b.close(); })();
