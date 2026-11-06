# Dashboard render harness

Renders the Coach dashboard locally, with Playwright, from this checkout. It is a mock: `dash.js` stands in for the Dashboard runtime (`dash.data`, `dash.calc`, `dash.onData`) and for the store (`window.claude.use('db')`, in memory), and `host.css` / `host-live.css` stand in for the host page. A page that passes here can still differ live, so after a publish always open the live page in light and dark at phone width and check the console (MAINTAIN.md, Publishing).

Nothing here is a page file: `pack_dashboard.py` reads only `coach/dashboard` itself, never this folder.

## Install (once)

From this folder:

    npm install --no-save d3@7 playwright

If Chromium is missing afterwards: `npx playwright install chromium`. When a Chromium is already installed for a given Playwright version, install that version instead (`playwright@1.63.0` for example). `build.py` and every script say this line when what they need is missing.

## Build a page

    python3 build.py [--host live] [--variant <name>] [--no-done] [--out <file.html>]

Reads the checkout two levels up (`--repo` to read another), assembles the page with `coach/tools/pack_dashboard.py --assemble`, and inlines the datasets (`data/summary.csv`, `data/activities.csv`, `coach/dashboard/coach.json`), the host colours, d3 and `dash.js`. Default output: `index.html` here. `--host live` adds the live host colours. Every build seeds a finished monthly check-in; `--no-done` leaves the store empty. Add `?datamode=dark` (or `light`) to the file URL to force the host's toggle.

Variants change a copy of the data, never the checkout: `pain`, `allstatus`, `error`, `empty`, `nocheckins`, `liftphase`, `fresh`, `planmissing`, `keydone` (also `nopillars`, `vo2fit`, `noseason`, `rotation`, `nolifts`). What each does is in `build.py`'s header.

## Render

- `node shoot.js <page.html> <dir>` and `node shoot-dark.js <page.html> <dir>`: one full-page PNG per tab at 360 px, light and dark.
- `node render.js [--page p.html] --tab <id> --width 360 --mode light|dark [--out x.png] [--json r.json]`, or `--all` for every tab at 360, 390, 430, 640, 900 and 1200 in both modes (PNGs in `shots/`). Prints overflow, taps under 44 px, text under 11 px, text contrast and redraw time.

Tab ids: `today`, `checkins`, `week`, `lifts`, `trends` (Fitness), `goals` (Health), `races` (Season).

## Check

- Marks: `node marks.js --page <page.html> --width 360 [--json out.json]`. Every data mark against the data; aim for 0 mismatched and 0 unresolved.
- Keyboard: `node kbwalk.js [page.html] [width]` walks the Today tab.
- `node contrast.js <page.html>`: a spot probe of a few Today and Week texts on the live host colours (build with `--host live`).

## Sweep

`sweep.js` runs one page through every tab, width and theme: console errors, marks, overflow, taps, text size, text and non-text contrast, reduced motion and a keyboard walk per tab, with PNGs at 360.

    node sweep.js --page <page.html> --variant <name> --out <data dir> [--renders <dir>] [--tabs week,lifts] [--widths 360,900] [--themes light,dark] [--nokb]
    node aggregate.js <data dir> <sweep.json>

For every variant: build `index-<variant>.html` for `default` (no `--variant`) and each of `pain allstatus error empty nocheckins liftphase fresh planmissing keydone` into one folder with `--out`, then `sh run-all.sh <pages dir> <data dir> <renders dir>` and `aggregate.js`.

Generated pages, PNGs and reports stay out of git (`.gitignore`); put them outside the repo.
