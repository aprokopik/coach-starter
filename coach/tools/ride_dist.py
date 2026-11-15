"""Best time over a set distance inside one outdoor ride (the athlete, Nov 12, 2026: "an equivalent of the 5K time to biking and
swimming. This is just race times at different distances").

Garmin files a best split for 40 km only, so the other distances are worked out here, from the best source on hand:
  track   data/ride_tracks/<activityId>.csv.gz (scripts/streams.py, t_s and dist_m about every 5 s): the fastest stretch of
          the distance anywhere in the ride, timer time (stops under auto-pause are not counted, as on Garmin's own splits);
  laps    the ride's auto laps in data/activities/<id>.json: the fastest run of whole laps that covers the distance, scaled
          down to the distance. Close when laps are short against the distance, a little slow otherwise. Estimated.
Pure functions; no file is written here.
"""
from __future__ import annotations

import gzip
import csv
import json
import os

DISTANCES = (("t20k", "20K", 20000, 25, 120), ("t40k", "40K", 40000, 50, 240), ("t90k", "90K", 90000, 120, 480),
             ("t100k", "100K", 100000, 135, 540), ("t100mi", "100 mi", 160934, 220, 900))  # key, label, metres, sane minutes lo..hi


def is_outdoor_ride(type_key) -> bool:
    t = str(type_key or "").lower()
    return ("cycl" in t or "rid" in t or "bik" in t) and "virtual" not in t and "indoor" not in t


def best_from_track(rows, metres):
    """rows: [(t_s, dist_m)] rising. Fastest time in seconds over `metres`, ends interpolated; None when the ride is shorter."""
    rows = [(float(t), float(d)) for t, d in rows if t is not None and d is not None]
    if len(rows) < 2 or rows[-1][1] - rows[0][1] < metres:
        return None
    best, i = None, 0
    for j in range(1, len(rows)):
        tj, dj = rows[j]
        if dj - rows[0][1] < metres:
            continue
        while i + 1 < j and dj - rows[i + 1][1] >= metres:
            i += 1
        (t0, d0), (t1, d1) = rows[i], rows[i + 1]  # the start lies between rows i and i+1
        need = dj - metres
        ts = t0 if d1 <= d0 else t0 + (t1 - t0) * min(1.0, max(0.0, (need - d0) / (d1 - d0)))
        if best is None or tj - ts < best:
            best = tj - ts
    return best


def best_from_laps(laps, metres):
    """laps: [(dist_m, seconds)] in ride order. Fastest run of whole laps covering `metres`, scaled to it. None when too short."""
    laps = [(float(d), float(s)) for d, s in laps if d and s]
    best = None
    for i in range(len(laps)):
        dist = sec = 0.0
        for d, s in laps[i:]:
            dist, sec = dist + d, sec + s
            if dist >= metres:
                est = sec * metres / dist
                best = est if best is None or est < best else best
                break
    return best


def read_track(path):
    with gzip.open(path, "rt") as fh:
        return [(float(r["t_s"]), float(r["dist_m"])) for r in csv.DictReader(fh) if r.get("t_s") not in (None, "") and r.get("dist_m") not in (None, "")]


def ride_best(aid, metres, root="."):
    """(seconds, source) for one ride: 'garmin' (its own 40 km split), 'track', or 'laps'; (None, None) with nothing to read."""
    p = os.path.join(root, "data", "activities", f"{aid}.json")
    doc = json.load(open(p)) if os.path.exists(p) else {}
    summ = doc.get("summary") or {}
    g = summ.get(f"fastestSplit_{metres}")
    if g:
        return float(g), "garmin"
    tp = os.path.join(root, "data", "ride_tracks", f"{aid}.csv.gz")
    if os.path.exists(tp):
        v = best_from_track(read_track(tp), metres)
        if v:
            return v, "track"
    laps = [(l.get("distance"), l.get("duration") or l.get("movingDuration")) for l in ((doc.get("splits") or {}).get("lapDTOs") or [])]
    v = best_from_laps(laps, metres)
    return (v, "laps") if v else (None, None)


def efforts(acts, key, root="."):
    """[(date, minutes, source)] oldest first for one DISTANCES key, outdoor rides only, inside the sane range."""
    _k, _l, metres, lo, hi = next(d for d in DISTANCES if d[0] == key)
    out = []
    for a in acts:
        if not is_outdoor_ride(a.get("type")):
            continue
        try:
            if float(a.get("distance_km") or 0) * 1000 < metres:
                continue
        except ValueError:
            continue
        sec, src = ride_best(a["activity_id"], metres, root)
        if sec and lo * 60 <= sec <= hi * 60:
            out.append((a["local_start"][:10], round(sec / 60, 2), src))
    return sorted(out)
