"""The heart rates the easy-effort markers are read at, for this athlete (the athlete, Nov 14, 2026: "same rule is for all heart rate
based metrics").

Run pace, bike power, trail pace and climbing are each scaled to one easy heart rate so sessions compare. That heart rate is
the athlete's own, never a fixed number: 150 bpm can be a recovery jog for one person and threshold for another.

One home: `coach/athlete/profile.json` field `hr_anchor` {run, bike}. When it is not set, the anchor follows from what the
profile already holds, in this order:
    1. easy_hr_guardrail {run, bike}: run at the run limit, bike 5 bpm under the bike limit (the gap the original athlete uses);
    2. hr_max (number, or {default}), else 220 minus age from birth_year or age_band: run 78% and bike 74% of it, less 5 for the
       bike (the same shares the kit's setup uses for the guardrail);
    3. run 150, bike 130 (the original athlete's numbers), said as a default.
The heart rate windows a session must sit in follow the anchor (run anchor -15 to +25, bike -20 to +35, climbs -25 to +30), the
windows the original 150 and 130 used. Swimming (6.55.0, the athlete: "I want one for swimming") reads at `hr_anchor.swim` when the profile
sets it, else the bike anchor, with the bike's window. Changing an anchor restarts the marker's history, so it is pinned once set.

Every tool and the page read it from here: build_dashboard.py writes it to coach.json as one `hr_anchor` row, calc.js
('fitness', 'week_view') reads that row, brief.py and trail_effort.py read current() after use() (build_dashboard.py, markers.build, brief.py main).

Usage:
    python3 coach/tools/hr_anchor.py        # print this athlete's anchors
"""
import json
import os
import sys
from datetime import date

PROFILE = os.path.join("coach", "athlete", "profile.json")
DEFAULT = {"run": 150, "bike": 130}
WINDOW = {"run": (-15, 25), "bike": (-20, 35), "climb": (-25, 30), "swim": (-20, 35)}


def _num(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def _age(prof, today):
    if _num(prof.get("birth_year")):
        return today.year - _num(prof["birth_year"])
    band = str(prof.get("age_band") or "")
    if "-" in band and _num(band.split("-")[0]):
        return _num(band.split("-")[0]) + 5
    return None


def _hr_max(prof, today):
    m = prof.get("hr_max")
    if isinstance(m, dict):
        m = m.get("default") or m.get("run")
    if _num(m):
        return _num(m), "your maximum heart rate"
    age = _age(prof, today)
    if age:
        return 220 - age, "220 minus your age"
    return None, ""


def from_profile(prof, today=None):
    """{run, bike, windows, basis, label} for one profile dict. Pure: no files read."""
    today = today or date.today()
    a = prof.get("hr_anchor") or {}
    g = prof.get("easy_hr_guardrail") or {}
    if _num(a.get("run")) and _num(a.get("bike")):
        run, bike, basis = _num(a["run"]), _num(a["bike"]), "set in your profile"
    elif _num(g.get("run")) and _num(g.get("bike")):
        run, bike, basis = _num(g["run"]), _num(g["bike"]) - 5, "your easy heart rate limits (run at the limit, bike 5 under it)"
    else:
        mx, how = _hr_max(prof, today)
        if mx:
            run, bike, basis = round(mx * 0.78), round(mx * 0.74) - 5, f"78% and 74% of {how} ({mx}), bike 5 under"
        else:
            run, bike, basis = DEFAULT["run"], DEFAULT["bike"], "a starting default until your profile has an easy heart rate or a maximum"
    swim = _num(a.get("swim")) or bike  # swimming heart rate runs nearer the bike's than the run's
    base = {"run": run, "climb": run, "bike": bike, "swim": swim}
    win = {k: [base[k] + lo, base[k] + hi] for k, (lo, hi) in WINDOW.items()}
    guard = {"run": _num(g.get("run")) or run, "bike": _num(g.get("bike")) or bike + 5}
    return {"run": run, "bike": bike, "climb": run, "swim": swim, "window": win, "guard": guard, "basis": basis,
            "label": {"run": f"Run pace at {run} bpm", "bike": f"Bike power at {bike} bpm",
                      "trail": f"Trail pace at {run} bpm", "climb": f"Climbing at {run} bpm",
                      "bikespeed": f"Bike speed at {bike} bpm", "swimspeed": f"Swim pace at {swim} bpm"}}


_CUR = None


def use(root=".", today=None):
    """Read this athlete's anchors once for the run (build_dashboard, markers.build, brief.py); later current() calls return them."""
    global _CUR
    _CUR = anchors(root, today)
    return _CUR


def current():
    """The anchors use() read, else the original 150 and 130 (a tool or test that never called use())."""
    return _CUR or from_profile({})


def anchors(root=".", today=None):
    p = os.path.join(root, PROFILE)
    prof = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            prof = json.load(fh)
    return from_profile(prof, today)


def row(root=".", today=None):
    """The coach.json row the page reads (kind hr_anchor); nested fields as they are, the page parses them."""
    a = anchors(root, today)
    return {"kind": "hr_anchor", "run": a["run"], "bike": a["bike"], "run_lo": a["window"]["run"][0], "run_hi": a["window"]["run"][1],
            "bike_lo": a["window"]["bike"][0], "bike_hi": a["window"]["bike"][1], "guard_run": a["guard"]["run"], "guard_bike": a["guard"]["bike"],
            "basis": a["basis"], "source": "coach/athlete/profile.json (hr_anchor), coach/tools/hr_anchor.py"}


if __name__ == "__main__":
    print(json.dumps(anchors(), indent=1))
    sys.exit(0)
