"""Steady miles near the run anchor, per run (6.171.0; the athlete, Nov 23, 2026: "give me the most optimal solution").

Why: Run pace at 150 bpm scaled each run's WHOLE average to the anchor. Heart rate lags in the first mile and drifts up in long
runs, so the same easy fitness read 10:56/mi on runs under 30 min and 12:34/mi on runs over 70 min (the athlete's 2026 runs), and one
run whose first mile read 130 bpm (Oct 15) scored 9:26 and then dropped out of the window as a fake decline. The fix reads only
the miles that carry the answer: the laps after the first, each within STEADY_BAND bpm of the anchor, flat, and at a running
pace. A run counts when it has MIN_LAPS of them.

Source: the lap list Garmin keeps in data/activities/<id>.json (splits.lapDTOs). An athlete without lap files (a Strava kit)
keeps the whole-run rule (calc.js falls back to runs averaging within hr_anchor.RUN_PACE_BAND of the anchor).

build_dashboard.py writes one coach.json row {kind: steady_run, runs: "id:pace:hr:laps;..."}; calc.js 'fitness' and its twin
brief.fitness_series read it.

Usage:
    python3 coach/tools/steady_run.py        # print each run's steady miles
"""
import json
import os
import sys

STEADY_BAND = 20      # a lap counts within 20 bpm of the anchor (130 to 170 at 150): the stretch the scaling makes stays short
MIN_LAPS = 2          # two steady laps (about 2 miles) make a run count
MIN_LAP_M = 1200      # laps under 1.2 km (a stop, a short closing lap) are left out
FLAT_FT_MI = 60       # the same flat cut as the whole run: under 60 ft of climb per mile
PACE_MIN, PACE_MAX = 7, 16
WINDOW_DAYS, MIN_RUNS = 42, 3   # the tile: middle value (median) of the runs in 42 days, 3 or more


def laps(aid, root="."):
    p = os.path.join(root, "data", "activities", f"{aid}.json")
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as fh:
            j = json.load(fh)
    except (OSError, ValueError):
        return None
    return ((j.get("splits") or {}).get("lapDTOs")) or []


def steady(lap_list, anchor):
    """(pace min/mi, time-weighted HR, laps used) over the steady laps, or None when fewer than MIN_LAPS."""
    t = m = h = 0.0
    n = 0
    for i, lap in enumerate(lap_list or []):
        if i == 0:
            continue  # mile 1: heart rate has not caught up with the pace yet
        dist = lap.get("distance") or 0
        dur = lap.get("movingDuration") or lap.get("duration") or 0
        hr = lap.get("averageHR")
        if dist < MIN_LAP_M or not dur or not hr or abs(hr - anchor) > STEADY_BAND:
            continue
        climb_ft_mi = ((lap.get("elevationGain") or 0) + (lap.get("elevationLoss") or 0)) / 2 * 3.28084 / (dist / 1609.344)
        pace = dur / 60 / (dist / 1609.344)
        if climb_ft_mi >= FLAT_FT_MI or pace < PACE_MIN or pace > PACE_MAX:
            continue
        t += dur; m += dist; h += hr * dur; n += 1
    if n < MIN_LAPS:
        return None
    return round(t / 60 / (m / 1609.344), 3), round(h / t, 1), n


def values(acts, anchor, root="."):
    """{activity_id: (pace, hr, laps) or None} for outdoor runs with a lap file; runs without one are absent (fallback)."""
    out = {}
    for a in acts:
        t = (a.get("type") or "").lower()
        if "run" not in t or "treadmill" in t or "virtual" in t:
            continue
        ls = laps(a.get("activity_id"), root)
        if ls is None:
            continue
        out[str(a.get("activity_id"))] = steady(ls, anchor)
    return out


def row(acts, anchor, root="."):
    """The coach.json row: 'id:pace:hr:laps' per run, '' after the id when the lap file holds no steady miles."""
    parts = []
    for aid, v in values(acts, anchor, root).items():
        parts.append(f"{aid}:{v[0]}:{v[1]}:{v[2]}" if v else f"{aid}:")
    return {"kind": "steady_run", "anchor": anchor, "band": STEADY_BAND, "min_laps": MIN_LAPS, "window_days": WINDOW_DAYS,
            "min_runs": MIN_RUNS, "runs": ";".join(parts), "source": "data/activities/<id>.json laps, coach/tools/steady_run.py"}


def median(xs):
    xs = sorted(xs)
    k = len(xs)
    return None if not k else (xs[k // 2] if k % 2 else (xs[k // 2 - 1] + xs[k // 2]) / 2)


if __name__ == "__main__":
    import csv
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import hr_anchor
    A = hr_anchor.anchors(".")["run"]
    with open(os.path.join("data", "activities.csv"), encoding="utf-8") as fh:
        acts = list(csv.DictReader(fh))
    when = {a["activity_id"]: a["local_start"][:10] for a in acts}
    for aid, v in sorted(values(acts, A).items(), key=lambda kv: when.get(kv[0], "")):
        if v:
            print(when.get(aid), aid, f"{int(v[0])}:{round(v[0] % 1 * 60):02d}/mi at {v[1]} bpm, {v[2]} laps")
