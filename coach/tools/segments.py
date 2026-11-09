#!/usr/bin/env python3
"""Climbs and descents from the 5 s streams of hilly runs and hikes (data/streams/*.csv.gz, scripts/streams.py).

Writes data/segments.csv, one row per climb or descent:
  activity_id, date, idx, kind (climb or descent), start_m, length_m, vert_m, grade_pct, dur_s, speed_mps,
  vert_m_per_h, hr, cad, steep (|grade| 10% or more), route (the same stretch on another day shares it)

Method (Estimated):
  - elevation smoothed over 30 s (the watch's barometer drifts and steps);
  - turning points by hysteresis: a climb ends when the trail drops 10 m from its top, a descent when it rises 10 m
    from its bottom; segments under 20 m of vertical or 150 m long are left out;
  - flat ground at either end (within 1 m of the low or the high) is trimmed off, so a plateau never dilutes the grade;
  - heart rate on a climb skips its first 60 s, because heart rate lags the grade;
  - a repeat stretch matches when its start and its end are each within 50 m of an earlier one in the same direction.
    Starts and finishes inside the 200 m privacy trim have no position and never match.

Run from the repo root: python3 coach/tools/segments.py
"""
import csv
import glob
import gzip
import math
import os

FIELDS = ["activity_id", "date", "idx", "kind", "start_m", "length_m", "vert_m", "grade_pct", "dur_s", "speed_mps",
          "vert_m_per_h", "hr", "cad", "steep", "route"]
SMOOTH_S, TURN_M, MIN_VERT_M, MIN_LEN_M, HR_LAG_S, MATCH_M, STEEP = 30, 10.0, 20.0, 150.0, 60, 50.0, 10.0
TRIM_M = 1.0  # flat ground at either end of a climb or descent (within 1 m of its low or high) is trimmed off


def read_stream(path):
    with gzip.open(path, "rt") as fh:
        return [{k: (float(v) if v not in ("", None) else None) for k, v in r.items()} for r in csv.DictReader(fh)]


def smooth(rows):
    """Centred mean of elevation over SMOOTH_S."""
    out, j0, j1, acc, n = [], 0, 0, 0.0, 0
    for i, r in enumerate(rows):
        t = r["t_s"]
        while j1 < len(rows) and rows[j1]["t_s"] <= t + SMOOTH_S / 2:
            acc += rows[j1]["elev_m"]; n += 1; j1 += 1
        while rows[j0]["t_s"] < t - SMOOTH_S / 2:
            acc -= rows[j0]["elev_m"]; n -= 1; j0 += 1
        out.append(acc / n)
    return out


def turning_points(el):
    """Indexes of the alternating lows and highs of the smoothed elevation, each turn at least TURN_M (zigzag)."""
    if not el:
        return []
    lo = hi = 0
    pts, d, ext = [], 0, 0  # d: 1 climbing, -1 descending, 0 not yet moved TURN_M
    for i in range(1, len(el)):
        if d == 0:
            lo = i if el[i] < el[lo] else lo
            hi = i if el[i] > el[hi] else hi
            if el[i] - el[lo] >= TURN_M:
                pts, d, ext = [lo], 1, i
            elif el[hi] - el[i] >= TURN_M:
                pts, d, ext = [hi], -1, i
        elif d == 1:
            if el[i] > el[ext]:
                ext = i
            elif el[ext] - el[i] >= TURN_M:
                pts.append(ext); d, ext = -1, i
        else:
            if el[i] < el[ext]:
                ext = i
            elif el[i] - el[ext] >= TURN_M:
                pts.append(ext); d, ext = 1, i
    if d != 0:
        pts.append(ext)
    return pts


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def segments(rows):
    rows = [r for r in rows if r.get("t_s") is not None and r.get("dist_m") is not None and r.get("elev_m") is not None]
    if len(rows) < 10:
        return []
    el = smooth(rows)
    tp = turning_points(el)
    out = []
    for a, b in zip(tp, tp[1:]):
        up = el[b] > el[a]
        # trim the flat ends: start at the last point still within TRIM_M of the start, end at the first within TRIM_M of the end
        a = max(i for i in range(a, b + 1) if (el[i] <= el[a] + TRIM_M if up else el[i] >= el[a] - TRIM_M))
        b = min(i for i in range(a, b + 1) if (el[i] >= el[b] - TRIM_M if up else el[i] <= el[b] + TRIM_M))
        vert = el[b] - el[a]
        length = rows[b]["dist_m"] - rows[a]["dist_m"]
        dur = rows[b]["t_s"] - rows[a]["t_s"]
        if abs(vert) < MIN_VERT_M or length < MIN_LEN_M or dur <= 0:
            continue
        kind = "climb" if vert > 0 else "descent"
        span = rows[a:b + 1]
        hr_rows = [r for r in span if kind == "descent" or r["t_s"] - rows[a]["t_s"] >= HR_LAG_S]
        grade = vert / length * 100
        out.append({"kind": kind, "start_m": round(rows[a]["dist_m"]), "length_m": round(length), "vert_m": round(vert, 1),
                    "grade_pct": round(grade, 1), "dur_s": round(dur), "speed_mps": round(length / dur, 3),
                    "vert_m_per_h": round(abs(vert) / dur * 3600), "hr": None if _mean([r["hr"] for r in hr_rows]) is None else round(_mean([r["hr"] for r in hr_rows])),
                    "cad": None if _mean([r["cad"] for r in span]) is None else round(_mean([r["cad"] for r in span])),
                    "steep": abs(grade) >= STEEP,
                    "_ends": ((rows[a]["lat"], rows[a]["lon"]), (rows[b]["lat"], rows[b]["lon"]))})
    return out


def metres(p, q):
    if None in p or None in q:
        return math.inf
    la1, lo1, la2, lo2 = map(math.radians, (p[0], p[1], q[0], q[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def build(root="."):
    dates = {}
    ap = os.path.join(root, "data/activities.csv")
    if os.path.exists(ap):
        with open(ap) as fh:
            dates = {r["activity_id"]: (r.get("local_start") or "")[:10] for r in csv.DictReader(fh)}
    all_rows, routes = [], []  # routes: (kind, start, end, route id)
    paths = sorted(glob.glob(os.path.join(root, "data/streams/*.csv.gz")),
                   key=lambda p: (dates.get(os.path.basename(p).split(".")[0], ""), p))
    for p in paths:
        aid = os.path.basename(p).split(".")[0]
        for i, s in enumerate(segments(read_stream(p))):
            st, en = s.pop("_ends")
            rid = next((r for k, a, b, r in routes if k == s["kind"] and metres(a, st) <= MATCH_M and metres(b, en) <= MATCH_M), None)
            if rid is None and math.inf not in (metres(st, st), metres(en, en)):
                rid = f"{aid}-{i}"
                routes.append((s["kind"], st, en, rid))
            all_rows.append({"activity_id": aid, "date": dates.get(aid, ""), "idx": i, **s, "route": rid or ""})
    return all_rows


def write(rows, root="."):
    p = os.path.join(root, "data/segments.csv")
    with open(p, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("1" if r[k] is True else "0" if r[k] is False else r[k]) for k in FIELDS})
    return p


if __name__ == "__main__":
    rows = build()
    write(rows)
    print(f"{len(rows)} segments: {sum(r['kind'] == 'climb' for r in rows)} climbs, {sum(r['kind'] == 'descent' for r in rows)} descents, "
          f"{len({r['route'] for r in rows if r['route']})} distinct stretches")
