#!/usr/bin/env python3
"""Build a local render page for the Coach dashboard (README.md in this folder).

1. Runs the checkout's `coach/tools/pack_dashboard.py --assemble` into page.html here (read-only use of the checkout).
2. Wraps each inlined page script in its own scope (the live runtime runs each script in its own scope).
3. Writes one full document: host colours (host.css, plus host-live.css with --host live) + d3 v7 + the inlined datasets
   + the mock runtime (dash.js) + the page inside <div id="dash-root"> + a boot script.

Usage: python3 build.py [--repo <checkout>] [--host live] [--variant <name>] [--no-done] [--out <file.html>]
  --repo     defaults to the checkout this folder sits in (two levels up from coach/dashboard/harness).
  --out      defaults to index.html in this folder; a relative path is taken from the current directory.
  --host live  appends host-live.css (the live host token values, read Nov 4, 2026) after the stand-in host.css.
  --no-done  leaves the mock store empty; by default it holds a finished monthly check-in (done_seed), so the
             Check-in tab's Done row and summary render.

Variants change a copy of the data only, never the checkout:
  pain        pain on three mornings (Watch card flagged), last night complete with resting HR 2 SD high (Watch notice)
  allstatus   every badge state on the Health surfaces
  error       the coach dataset missing (error states)
  empty       no today row
  nocheckins  no survey rows (Check-in empty state)
  liftphase   a lift block-start proposal plus an upper-body phase today (rotation adds only the proposal)
  fresh       today's check-in has arrived (the today row dated today)
  planmissing today's plan row has no strong-day or fallback size
  keydone     one key session done this week
  also: nopillars, vo2fit, noseason, rotation, nolifts

The page sits inside <div class="cds-root"> as on the live host. ?datamode=dark|light|system in the URL sets its
data-mode before any page script runs; host.css gains [data-mode] copies of its token blocks (built here), so the page
follows the host's toggle as well as prefers-color-scheme.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))  # coach/dashboard/harness -> the checkout
if "--repo" in sys.argv:
    REPO = sys.argv[sys.argv.index("--repo") + 1]

DATASETS = {  # id -> path relative to the repo (CSV = text cells; JSON = rows, nested values passed as JSON text)
    "recovery": "data/summary.csv",
    "activities": "data/activities.csv",
    "coach": "coach/dashboard/coach.json",
}
# Older ids that may still be referenced; they resolve with status "missing".
MISSING = ["today", "vo2max", "plan", "weight_reported"]


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


PAIN = {"2026-11-01": 1, "2026-11-02": 1, "2026-11-03": 3}  # harness-only pain variant


def low_night(lines):
    """Phase 7 (harness only): the pain variant's last night gets a resting HR 2 SD above the mean of the 28 nights before it
    (the worse side), so the deck's 1.5 SD Watch notice shows whatever the latest pulled night was like."""
    import csv, io, math
    head = next(csv.reader([lines[0]]))
    rows = [next(csv.reader([l])) for l in lines[1:]]
    i = head.index("resting_hr"); di = head.index("date")
    last = rows[-1]
    import datetime
    d0 = datetime.date.fromisoformat(last[di][:10])
    base = [float(r[i]) for r in rows[:-1] if r[i] not in ("", None) and 0 < (d0 - datetime.date.fromisoformat(r[di][:10])).days <= 28]
    if len(base) < 14:
        return lines
    mean = sum(base) / len(base); sd = math.sqrt(sum((v - mean) ** 2 for v in base) / (len(base) - 1))
    last[i] = str(int(math.ceil(mean + 2 * sd)))
    out = io.StringIO(); csv.writer(out, lineterminator="").writerow(last)
    return lines[:-1] + [out.getvalue()]


def done_seed():
    """Phase 7 (harness only, every build unless --no-done): a finished monthly check-in in the mock store (checkin/monthly-<this
    month>), all questions answered except the optional extra scale readings, saved today at 12:30 UTC, so the Check-in tab's
    Done row, the card's Done badge with its date and "1 skipped", and the strip's count render."""
    import datetime
    t = datetime.date.today(); per = f"{t.year}-{t.month:02d}"
    doc = {"survey": "monthly", "period": per, "answers": {"waist_in": 33.5, "who5": {"who5_1": 4, "who5_2": 3, "who5_3": 4, "who5_4": 3, "who5_5": 4}},
           "saved_at": f"{t.isoformat()}T12:30:00.000Z", "finished": True}
    return {"checkin/monthly-" + per: doc}


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def mode_blocks(css):
    """[data-mode] copies of a host stylesheet's light :root block and its dark-media :root block."""
    light = re.search(r"^:root\s*\{(.*?)\n\}", css, re.S | re.M)
    dark = re.search(r"@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{(.*?)\}\s*\}", css, re.S)
    out = []
    if dark:
        out.append(".cds-root[data-mode=dark] {" + dark.group(1) + "}")
    if light:
        vars_only = ";".join(x for x in light.group(1).split(";") if x.strip().startswith("--"))
        out.append(".cds-root[data-mode=light] {" + vars_only + ";}")
    return "\n".join(out)


def main():
    variant = arg("--variant"); host = arg("--host", "stand-in"); out_name = arg("--out", "index.html")
    d3 = os.path.join(HERE, "node_modules", "d3", "dist", "d3.min.js")
    if not os.path.exists(d3):
        sys.exit("d3 is missing. Install it once, from " + HERE + ":\n  npm install --no-save d3@7 playwright")
    page_path = os.path.join(HERE, "page.html")
    subprocess.run([sys.executable, "coach/tools/pack_dashboard.py", "--assemble", page_path], cwd=REPO, check=True)
    frag = read(page_path)

    # each inlined script in its own scope (assemble emits exactly "<script>\n" + file + "\n</script>")
    n = 0
    def wrap(m):
        nonlocal n
        n += 1
        return "<script>\n(function(){\n" + m.group(1) + "\n})();\n</script>"
    frag = re.sub(r"<script>\n(.*?)\n</script>", wrap, frag, flags=re.S)

    data = {}
    for ds_id, rel in DATASETS.items():
        p = os.path.join(REPO, rel)
        if rel.endswith(".csv"):
            text = read(p)
            if ds_id == "recovery" and variant == "pain":
                lines = text.rstrip("\n").split("\n")
                if lines[-1].startswith("2026-11-04,,"): lines = lines[:-1]
                lines = low_night(lines)
                text = "\n".join(lines) + "\n"
            data[ds_id] = {"type": "csv", "file": rel, "text": text}
        else:
            j = json.loads(read(p))
            if ds_id == "coach" and variant == "pain":
                keep = [r for r in j["rows"] if not (r.get("kind") == "feel_day" and r.get("date") in PAIN)]
                old = {r["date"]: r for r in j["rows"] if r.get("kind") == "feel_day" and r.get("date") in PAIN}
                add = [dict(old.get(d, {"kind": "feel_day", "date": d, "scale": 5, "sleep_q": 3, "energy": 4, "legs": 3, "stress": 2}), pain=v, pain_site="inside ankle;hamstring", harness_only="pain variant") for d, v in PAIN.items()]
                j["rows"] = keep + add
            if ds_id == "coach" and variant == "allstatus":  # Phase 5 Health review: every badge state on every Health surface
                for r in j["rows"]:
                    k = r.get("kind")
                    if k == "pillar" and r.get("id") == "habits": r["status"] = "watch"
                    if k == "pillar" and r.get("id") == "mind": r["status"] = "unknown"
                    if k == "pmetric" and r.get("id") == "alcohol": r["status"] = "watch"
                    if k == "pfocus" and r.get("order") == 2: r["status"] = "watch"
                    if k == "pfocus" and r.get("order") == 3: r["status"] = "good"
                    if k == "psum": r.update(good=3, watch=1, act=2, unknown=1)
            if ds_id == "coach" and variant == "nopillars":  # Phase 5 Health: the empty state (no pillar rows yet)
                j["rows"] = [r for r in j["rows"] if r.get("kind") not in ("pillar", "pmetric", "psum", "pfocus", "pwin", "pstreak", "pbar")]
            if ds_id == "coach" and variant == "vo2fit":  # Phase 5 Fitness fix: VO2max and resting HR as Fitness tiles (layout rows, harness only)
                for r in j["rows"]:
                    if r.get("kind") == "marker" and r.get("key") in ("vo2", "rhr"): r["section"] = "fitness"
                j["rows"] += [{"kind": "fit_kpi", "key": "vo2", "group": "foundation", "rank": 4, "weight": 6, "sport": "all", "why_weight": "harness variant"},
                              {"kind": "fit_kpi", "key": "rhr", "group": "foundation", "rank": 5, "weight": 5, "sport": "all", "why_weight": "harness variant"}]
            if ds_id == "coach" and variant == "noseason":  # Phase 5 Season: the empty states (no races, blocks, milestones or briefs yet)
                j["rows"] = [r for r in j["rows"] if r.get("kind") not in ("race", "race_note", "race_kit", "block", "milestone", "brief", "brief_kpi", "brief_point")]
            if ds_id == "coach" and variant == "nocheckins":  # Phase 5 Check-in: the empty state (no survey rows yet)
                j["rows"] = [r for r in j["rows"] if r.get("kind") not in ("ci_survey", "ci_q")]
            if ds_id == "coach" and variant in ("rotation", "liftphase"):  # Phase 5 Lifts: a block-start proposal (rotation card) and, for liftphase, an upper-body phase today (gates, phase line, phases grid). Harness only.
                j["rows"] += [{"kind": "lift_proposal", "routine": "lll", "block": "B2", "block_name": "Build 2", "block_key": "lll-2026-11-09", "start": "2026-11-09", "status": "proposed", "focus": "single-leg strength", "harness_only": "rotation variant",
                               "swaps": [{"ex": "2b", "from_name": "Incline DB bench", "to_name": "Push-up, feet raised", "why": "Same push, no bench needed when travelling.", "to_note": "best 20 (Sep 14)"},
                                         {"ex": "2c", "from_name": "Band face pulls", "to_name": "Prone Y raise", "why": "Same shoulder work with the light DBs."}]}]
            if ds_id == "coach" and variant == "liftphase":
                j["rows"] += [{"kind": "lift_phase", "routine": "lll", "order": 1, "label": "Race taper", "mode": "upper", "start": "2026-11-01", "end": "2026-11-08", "text": "Upper body only until race day.", "legs_note": "Legs rest until after the race", "allow": {"W": "Warm-up only, no load"}, "harness_only": "liftphase variant"},
                              {"kind": "lift_phase", "routine": "lll", "order": 2, "label": "Recovery", "mode": "light", "start": "2026-11-09", "end": "2026-11-15", "text": "Same or lighter, 3+ reps in reserve.", "harness_only": "liftphase variant"}]
            if ds_id == "coach" and variant == "nolifts":  # Phase 5 Lifts: the empty state (no lift routine rows yet)
                j["rows"] = [r for r in j["rows"] if not str(r.get("kind", "")).startswith("lift_")]
            if ds_id == "coach" and variant == "fresh":  # Phase 6 round 3: today's check-in has arrived (the today row dated today). Harness only.
                import datetime
                for r in j["rows"]:
                    if r.get("kind") == "today": r["date"] = datetime.date.today().isoformat(); r["harness_only"] = "fresh variant"
            if ds_id == "coach" and variant == "planmissing":  # Phase 6 round 3: today's week plan row has no strong-day or fallback size. Harness only.
                import datetime
                for r in j["rows"]:
                    if r.get("kind") == "day" and r.get("date") == datetime.date.today().isoformat() and r.get("order") == 1: r["upper_minutes"] = None; r.pop("fallback_minutes", None); r["harness_only"] = "planmissing variant"
            if ds_id == "coach" and variant == "keydone":  # Phase 6 round 3: one key session done this week (Mon Nov 2 strength becomes Key 1; Sat Nov 7 is no longer a key). Harness only.
                for r in j["rows"]:
                    if r.get("kind") == "day" and r.get("date") == "2026-11-02" and r.get("order") == 1: r["key"] = True; r["pillar"] = 1; r["harness_only"] = "keydone variant"
                    if r.get("kind") == "day" and r.get("date") == "2026-11-07" and r.get("order") == 1: r["key"] = False; r["pillar"] = None; r["harness_only"] = "keydone variant"
            if ds_id == "coach" and variant == "empty":
                j["rows"] = [r for r in j["rows"] if r.get("kind") != "today"]
            data[ds_id] = {"type": "json", "file": rel, "json": j}
            if ds_id == "coach" and variant == "error":
                data[ds_id] = {"type": "missing", "file": None}
    for ds_id in MISSING:
        data.setdefault(ds_id, {"type": "missing", "file": None})
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

    seed_js = "" if "--no-done" in sys.argv else "<script>window.__seed = Object.assign(" + json.dumps(done_seed()).replace("</", "<\\/") + ", window.__seed || {});</script>\n"
    host_css = read(os.path.join(HERE, "host.css")); stand_in = host_css
    host_note = "stand-in host colours (host.css)"
    if host == "live":
        live = read(os.path.join(HERE, "host-live.css"))
        host_css += "\n/* ---- live host values (host-live.css) ---- */\n" + live
        host_note = "live host colours (host-live.css over host.css)"
    host_css += "\n/* ---- harness: [data-mode] emulation of the host toggle ---- */\n" + mode_blocks(stand_in) + ("\n" + mode_blocks(live) if host == "live" else "")
    host_css += "\n.cds-root { background: var(--color-bg); color: var(--color-fg); min-height: 100vh; }\n"
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coach dashboard harness</title>
<style>
{host_css}
</style>
<script>
{read(d3)}
</script>
<script type="application/json" id="harness-data">{blob}</script>
{seed_js}<script>
{read(os.path.join(HERE, "dash.js"))}
</script>
</head>
<body>
<div class="cds-root" id="cds-root">
<script>(function(){{var m=/[?&]datamode=(dark|light|system)/.exec(location.search);if(m)document.getElementById('cds-root').setAttribute('data-mode',m[1]);}})();</script>
<div class="host-toolbar" aria-hidden="true">Harness toolbar (48 px host strip): {host_note}{', ' + variant + ' variant' if variant else ''}</div>
<div id="dash-root" data-dash-state="loading">
{frag}
</div>
</div>
<script>window.__harness.boot();</script>
</body>
</html>
"""
    out = os.path.join(HERE, out_name) if out_name == "index.html" else os.path.abspath(out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"wrapped {n} page scripts; wrote {out}: {len(html):,} chars")


if __name__ == "__main__":
    main()
