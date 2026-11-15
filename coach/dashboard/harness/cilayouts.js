// The Check-ins layouts (6.55.0; checkins.js layoutTab, review item q-checkins-lists). For each of the five layouts, at 360 px:
// counts how often each survey name shows (1 shows them twice; 2 to 5 at most once as a card, 5 adds the due line), checks the
// reading order puts the Surveys section first in 3 and 4, that the folded line opens from the keyboard, that Start moves focus
// to the first question, and that every button there is at least 44 px tall. Exit code 1 on any failure.
// node cilayouts.js [index.html]
const { chromium } = require('./pw'); const path = require('path');
(async () => {
  const file = 'file://' + path.resolve(process.argv[2] || path.join(__dirname, 'index.html'));
  const b = await chromium.launch(); const fails = []; const errs = [];
  for (const L of [1, 2, 3, 4, 5]) {
    const ctx = await b.newContext({ viewport: { width: 360, height: 740 } }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(`L${L} ${e}`));
    await p.goto(file); await p.waitForTimeout(1500);
    await p.evaluate((L) => { document.documentElement.dataset.ciLayout = String(L); }, L);
    await p.click('#tab-checkins'); await p.waitForTimeout(600); await p.evaluate(() => window.CX.renderCheckins()); await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const tab = document.getElementById('checkins'); const vis = (e) => !!(e && e.getClientRects().length);
      const names = [...document.querySelectorAll('#ci-surveys .ci-card h3')].map((h) => h.textContent);
      const count = {}; for (const n of names) count[n] = [...tab.querySelectorAll('.ck-row-t, .ci-card h3')].filter((e) => vis(e) && e.textContent === n).length;
      const first = tab.querySelector('.ci-cols').firstElementChild.id;
      const small = [...tab.querySelectorAll('button, summary')].filter((e) => vis(e) && e.getBoundingClientRect().height < 44 && !e.closest('[hidden]')).map((e) => e.textContent.trim().slice(0, 30));
      return { layout: tab.dataset.ciLayout, count, first, small, due: vis(document.getElementById('ci-due')), more: !!tab.querySelector('.ci-more') };
    });
    const want = L === 1 ? 2 : 1; const twice = Object.entries(r.count).filter(([, c]) => c > want);
    if (r.layout !== String(L)) fails.push(`L${L}: tab says layout ${r.layout}`);
    if (L !== 4 && L !== 1 && twice.length) fails.push(`L${L}: shown twice ${twice.map((x) => x[0])}`);
    if (L === 4 && Object.values(r.count).some((c) => c > 1)) fails.push(`L4: a survey shows twice`);
    if ((L === 3 || L === 4) && r.first !== 'ci-sv') fails.push(`L${L}: Surveys is not first in reading order (${r.first})`);
    if ((L === 2 || L === 3 || L === 4) === r.due) fails.push(`L${L}: Due today ${r.due ? 'shows' : 'is hidden'}`);
    if (r.small.length) fails.push(`L${L}: under 44 px: ${r.small.join(', ')}`);
    if (L === 4) {
      if (!r.more) fails.push('L4: no folded line'); else {
        await p.focus('.ci-moresum'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
        if (!(await p.evaluate(() => document.querySelector('.ci-more').open))) fails.push('L4: Enter does not open the folded line');
      }
      await p.click('#ci-weekly-go'); await p.waitForTimeout(250);
      const f = await p.evaluate(() => document.activeElement && document.activeElement.id);
      if (f !== 'ci-weekly-qh') fails.push(`L4: Start leaves focus on ${f}`);
      if (!(await p.evaluate(() => document.querySelector('.ci-more') && document.querySelector('.ci-more').open))) fails.push('L4: folded line closed itself after Start');
    }
    if (L === 5) { await p.click('#ci-duelist button'); await p.waitForTimeout(250); const f = await p.evaluate(() => document.activeElement && document.activeElement.id); if (!/^ci-.*-qh$/.test(f || '')) fails.push(`L5: Go leaves focus on ${f}`); }
    console.log(`layout ${L}:`, JSON.stringify(r.count), 'first', r.first, 'due card', r.due);
    await ctx.close();
  }
  await b.close();
  for (const e of errs) fails.push(e);
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'OK, five layouts');
  process.exit(fails.length ? 1 : 0);
})();
