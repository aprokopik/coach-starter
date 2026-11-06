# Maintaining the Coach dashboard

How to change the dashboard safely. What each tab shows is in `coach/DASHBOARD.md`; the chart grammar is `coach/dashboard/CHARTS.md`.

## What the dashboard is

- A private Dashboard Artifact (URL in `coach/DASHBOARD.md`). The page is not one file: it lives in the dashboard store collection `files`, one document per page file (`files/index.html`, `files/app.js` and so on), each `{text}`.
- Each document is capped at 262,144 bytes of JSON (256 KB). `coach/tools/pack_dashboard.py` refuses a file over the cap.
- The runtime gives the page its datasets (`dash.data`, `dash.calc`, `dash.onData`) and the store (`window.claude.use('db')`). There is no network, no modules, no React, no external fonts or icon sources; images only as `data:` URLs; d3 v7 is already on the page.
- `index.html` is markup only. Its `<link>` and `<script>` tags give the load order. Scripts run in that order inside `#dash-root`, each in its own scope; anything shared goes on `window.CX`.
- Style only the page's own classes (`.ck`, `cx-`, tab prefixes), never `body`, `html` or bare tags.

## The files

| File | Holds |
|---|---|
| `index.html` | Markup, the icon sprite at the top, the load order |
| `style.css` | Page and tab rules (a section per tab, "Mobile pass" at the end) |
| `cockpit.css` | Built: Cockpit tokens, motion and parts |
| `charts.css` | Chart frame, range bar and chart motion, scoped to `.ck` |
| `calc.js` | `window.CX` helpers (`CX.round`, `CX.fixed`, `CX.fmt`) and every `dash.calc` |
| `cockpit.js` | Built: `window.CK` behaviours |
| `charts.js` | Built: the chart library, `window.CKC` |
| `app.js` | Tabs, drawing helpers, Today, Week, Fitness and Health; hands helpers on as `window.CX.app` |
| `season.js` | Season tab and the Week race-week card; registers `CX.renderRaces` and `CX.renderRaceWeek` |
| `forms.js` | Morning check-in, Rate a session, race kit ticks |
| `lifts.js` | Lifts tab |
| `records.js` | Hall of fame (All-time records) on Season |
| `body.js` | The `body_trend` calc for the Body composition pillar |
| `pillars.js` | Health tab |
| `checkins.js` | Check-in tab and the Today check-ins due line |
| `block.js` | This block card (Fitness) and the Season status panels |

Load order: calc.js, cockpit.js, charts.js, app.js, season.js, forms.js, lifts.js, records.js, body.js, pillars.js, checkins.js, block.js. `coach.json` (the `coach` dataset) and `season.html` (the shared Race Season page) sit in the same folder but are not page files. `src/` holds the readable sources of the built files and `harness/` the local render harness; neither is ever packed.

A new feature goes in its own `<feature>.js`, loaded after `app.js`, registering its renderer on `window.CX` and its `dash.calc` definitions at top level. Never grow `app.js` (about 171 KB). When a file nears the cap, split it along a `// ----------` page seam the way `season.js` was split.

## The Cockpit system

- Tokens live on `.ck` as `--ck-*`. Surfaces, text and borders read the host's own `--color-*` values (so the page follows the host's light and dark), with the Phase 3 values as fallbacks; everything that carries meaning (accent, status, sport, series, chart ink, focus) is a fixed value per mode. Dark applies under an ancestor `[data-mode=dark]` (the host toggle) or `prefers-color-scheme: dark` when no ancestor sets a mode.
- Shared parts: `ck-tile`, `ck-badge`, `ck-notice`, `ck-state`, `ck-table`, `ck-seg`, `ck-list` and `ck-row` and the rest; the Phase 3 catalogue is `components.html` beside DESIGN.md.
- Status is one of four states, set as `[data-s]` (`good`, `watch`, `act`, `unknown`) and always drawn as a glyph plus a word (`ck-badge`), never colour alone.
- Every control is at least 44 by 44 px. Text is never under 11 px; inputs are 16 px. The focus ring is 2 px in `--ck-focus`, and must clear 3:1 on whatever it sits on.
- Icons come only from the sprite in `index.html`: `<svg class="ck-i" aria-hidden="true"><use href="#cx-..."/></svg>` with the word beside it. A new glyph is a new `<symbol>` drawn to the icon rules (24 px grid, 2 px round stroke, no dashes).
- Breakpoints: base 360, then `min-width` 480, 640, 900, plus reduced motion. When a part is restyled, replace its old rules rather than layering new ones.
- `cockpit.css` and `cockpit.js` are built from `src/cockpit/` (`tokens.css`, `motion.css`, `components.css`, `components.js`) by `sh src/build-cockpit.sh`, run from `coach/dashboard`. Never edit them by hand. A part the catalogue lacks gets a spec comment above its rules in `src/cockpit/components.css`. The design rules (principles, token tables, status rule, icon rules) are the Cockpit DESIGN notes from Phase 3 (`phase3/system/DESIGN.md` in the build session's scratchpad, not in the repo).

## Charts

Every chart draws through `CKC`: which chart, anatomy, the sentence, marks, phone rules, the API, the five steps to add one and the still script-held list are in `CHARTS.md`. Build rule for both built files: change the source, rebuild, and commit source and output together so that a fresh build reproduces the committed file byte for byte.

- `charts.js`: `npx terser@5.29.2 src/charts.src.js --compress passes=2 --mangle --ecma 2017 -o charts.js`
- `cockpit.css`, `cockpit.js`: `sh src/build-cockpit.sh && git diff --exit-code cockpit.css cockpit.js`

## Data marks

- Every figure on screen names its row: `data-source` (dataset or calc), `data-field` (column), `data-where` (`col=value`, several joined with `&`); tables carry `data-row-key` and each row `data-key`.
- A figure computed on the page carries `data-derived="<what>"` and a `data-rule` naming the function and formula; a fixed rule word (a cut-off, a date) carries `data-rule` too.
- No values typed into markup or scripts. A value still held in a script is `data-derived="held"` with `data-held`, and is listed in CHARTS.md section 10.
- Numbers go through `CX.round`, `CX.fixed` or `CX.fmt`, never a bare `toFixed`.
- The check: the harness `marks.js` resolves every mark against the data. Aim for 0 mismatched and 0 unresolved on screen (the error and empty data sets name a missing dataset and show no figure, which is accepted).

## The harness

`coach/dashboard/harness/` renders the page locally with Playwright; its `README.md` has the install line, the build, the variants and every check. It mocks the runtime and the store with a copy of the checkout's data, so a live check is still needed after publishing.

- Build: `python3 coach/dashboard/harness/build.py [--host live] [--variant v] [--out <file>.html]` (default output `harness/index.html`). Variants: `pain`, `allstatus`, `error`, `empty`, `nocheckins`, `liftphase`, `fresh`, `planmissing`, `keydone`; `--no-done` leaves the store empty.
- Render: `shoot.js` and `shoot-dark.js` (one PNG per tab at 360), `render.js` (six widths). Check: `marks.js` (marks), `kbwalk.js`, `sweep.js` with `aggregate.js` (every tab, width and theme).
- Without the harness, `python3 coach/tools/pack_dashboard.py --assemble <out.html>` builds one local file with styles and scripts inlined, for a quick look; it has no runtime.

## Publishing

1. `python3 -m unittest discover -s coach/tests` is green.
2. Version: `python3 coach/tools/version.py bump major|minor|patch` (MAJOR a contract, MINOR a change the athlete signed off, PATCH a fix the athlete would not notice; the rule heads `CHANGELOG.md`), fill the new `CHANGELOG.md` entry (area, PR, what changed, the athlete's pick), and `python3 coach/tools/version.py check` passes. Data commits never bump.
3. `python3 coach/tools/pack_dashboard.py <dir>` writes one JSON document per file and prints each size against the cap. Use `--only name,name` for the changed files.
4. ArtifactData `get` each changed `files/<name>` for its current version.
5. One ArtifactData `batch`: an `update` per changed file, `file_path` the packed JSON, pinned to the version you read. A new file is a `set` without a version. Never delete store documents.
6. Open the live page in light and dark at phone width and check the console.
7. At merge: nothing to tag by hand. The `release-tag.yml` workflow runs on the push to main and tags the merge commit `vX.Y.Z` (`python3 coach/tools/version.py missing` shows what it will do). The footer shows the new number after the next morning run rebuilds coach.json.

The repo files are the record; the store copies them. The daily data (`coach.json`, the CSVs) is published by the morning run, not by a page change (RUNBOOK, Publish).

## Standing rules

- Proposal and Review Gate: propose first, change after the athlete signs it off. Nothing merges or publishes before their sign-off.
- Before any choice between UI directions, every option is rendered at phone width in light and dark with the athlete's real data and linked from the card.
- Phone first (360 px), light and dark equal; no horizontal scroll; tables reflow (cards under 640 px, a sticky first column above).
- Functionality stays as is unless the change says otherwise: controls, localStorage keys, store document ids, fields and save timing.
- A dashboard change never edits the 7:45 morning run, the data files, `coach/ops`, `coach/engine` rules or `coach/tools/build_dashboard.py`.
- No em dashes and no model names in repo text.

## Store collections the morning run reads

RUNBOOK step 4 (Data) lists these on the dashboard store each morning:

| Collection | Written by | Read by the morning run |
|---|---|---|
| `feel_daily` | Check-in tab, morning check-in | copied to `coach/feel_daily.csv` |
| `feel_sessions` | Check-in tab, Rate a session; Lifts Finish | copied to `coach/feel_sessions.csv` |
| `checkin` | Check-in tab surveys | `coach/tools/checkins.py ingest` |
| `lift_log` | Lifts tab | `coach/tools/lifts.py ingest` |
| `lift_choice` | Lifts tab, New block card | `lifts.py accept` or `keep` |
| `brief_choice` | Fitness tab, This block card | `brief.py accept` or `change` |

`race_kit` (Season kit ticks) is page state only; nothing copies it. Document shapes are in `coach/DASHBOARD.md`, "What the athlete enters on the page".

A new collection the coach must read needs, in the same change and with the athlete's sign-off (these files sit outside a dashboard change): a row in `coach/ops/data_paths.json` (route, writes, cadence, evidence, fallback, owner), a line in RUNBOOK step 4 naming the `list` and what to do with it, and a tool command that records it (a `coach/tools` script with a test). Until all three exist, the page may write it but nothing reads it.

## Checklist for a change

- [ ] The change is proposed and signed off; UI options were rendered first.
- [ ] Rendered at 360 first, then 390, 430, 640, 900 and 1200, light and dark, every variant it touches.
- [ ] 0 console errors, 0 overflow, 0 taps under 44 px, 0 text under 11 px, 0 contrast fails, keyboard order and focus checked, nothing moves with reduced motion.
- [ ] Marks: 0 mismatched, 0 unresolved on screen.
- [ ] Built files rebuilt from source and byte-identical (`charts.js`, `cockpit.css`, `cockpit.js`).
- [ ] `pack_dashboard.py` reports every file under the cap.
- [ ] Tests green.
- [ ] `VERSION` bumped and a `CHANGELOG.md` entry added; `version.py check` passes.
- [ ] `coach/DASHBOARD.md`: the tab's description updated to the new state, and one changelog line (PR, date, what changed, the athlete's pick).
- [ ] `CHARTS.md` updated when a chart changed.
