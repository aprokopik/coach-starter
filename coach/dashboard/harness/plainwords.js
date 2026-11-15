// plainwords.js: the plain reading check (coach/dashboard/PLAIN-READING.md). Renders Today (or --tab)  as a first-time
// reader sees it, every disclosure closed, and lists words a newcomer cannot read: shorthand (SD, LV, XP), coach jargon
// (bound, ladder, fallback, A race, Hold:), game words (quest) and UTC clock times. Exit code 1 when any is on screen.
//   node plainwords.js <page.html> [--open] [--tab week]   (--open also opens every disclosure and checks that text too;
//   --tab reads another tab by its panel id: week, trends (Fitness), goals (Health), races (Season), checkins, lifts)
const path = require('path');
const { chromium } = require('playwright');
const RULES = [
  [/\bSD\b/, 'SD: say "from your normal"'], [/\bLV\b|\bXP\b/, 'game shorthand: say Level, % of a level'], [/\bquests?\b/, 'game word (lower case only: Quest the lab is a name)'], [/\bRPE\b/, 'say effort, 1 to 10'], [/\bKPIs?\b/, 'say goal or measure'],
  [/\bbound\b/i, 'coach jargon: say Max or Min'], [/\bladder\b/i, 'coach jargon: say level or stage'], [/\bfallback\b/i, 'coach jargon: say Min'],
  [/\bA race\b/, 'say Main race'], [/\bHold:/, 'say Keep to the plan'], [/\b\d{1,2}:\d{2}Z\b|\bUTC\b/, 'clock time in UTC: show local time'],
  [/\bstrong-day\b/i, 'say Max'], [/\bgate\b/i, 'coach jargon'],
];
(async () => {
  const page = process.argv[2]; const open = process.argv.includes('--open'); const ti = process.argv.indexOf('--tab'); const tab = ti > 0 ? process.argv[ti + 1] : 'today';
  if (!page) { console.error('usage: node plainwords.js <page.html> [--open]'); process.exit(2); }
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 360, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); // a broken page reads as empty: fail instead of passing
  await p.goto('file://' + path.resolve(page)); await p.waitForTimeout(2500);
  if (tab !== 'today') { await p.click('#tab-' + tab); await p.waitForTimeout(1500); }
  if (open) { await p.evaluate((t) => { document.querySelectorAll('#' + t + ' details').forEach((d) => { d.open = true; }); document.querySelectorAll('#' + t + ' [aria-expanded="false"]').forEach((x) => x.click()); }, tab); await p.waitForTimeout(600); }
  const lines = await p.evaluate((t) => { const root = document.getElementById(t); return root.innerText.split('\n').map((s) => s.trim()).filter(Boolean); }, tab);
  const hits = []; for (const l of lines) for (const [re, why] of RULES) if (re.test(l)) hits.push(`${why}  |  ${l.slice(0, 120)}`);
  if (errs.length) { console.log('page errors, nothing read:\n' + errs.join('\n')); await b.close(); process.exit(1); }
  if (lines.length < 10) { console.log(`only ${lines.length} lines on ${tab}: the page did not draw`); await b.close(); process.exit(1); }
  console.log(hits.length ? hits.join('\n') : 'plain reading: 0 hits'); await b.close(); process.exit(hits.length ? 1 : 0);
})();
