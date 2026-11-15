"""Trail speed, runnable pace and climbing speed at 150 bpm from hilly runs (the athlete, Nov 8 and Nov 11, 2026; scripts/streams.py).

  trail speed, min per effort km: moving time over the run's effort distance (ITRA: km + every 100 m of climbing counts one
    more km), scaled to 150 bpm by the run's average heart rate (135 to 175 bpm). The whole run: running, hiking, climbs and
    descents. It turns into a moving time for any course from its distance and climbing.

Three per-run numbers, all Estimated, all scaled to 150 bpm the same way as run pace at 150 bpm on the page
(calc.js: value x (HR - RHR) / (150 - RHR), RHR the mean resting heart rate of the 15 days centred on the run):

  runnable pace (grade adjusted), min/mi: the run cut into 60 s pieces after the first 10 minutes; each piece's distance
    is turned into flat-equivalent distance with the Minetti 2002 energy cost of running on a grade; pieces on steep
    descents (steeper than -10%), climbs of 10% or more (they count in climbing), hiking pieces (cadence under 130 steps/min) and stops are left out; at least 10
    minutes must remain.
  climbing, ft/h up, on 10% and steeper, with lines for 10 to 15%, 15 to 20% and 20%+: the run cut into 60 s pieces,
    each uphill piece filed in the band of its own grade (minute by minute, the athlete Nov 11, 2026; whole climbs averaged steep pitches away), with heart
    rate read 30 s later; vertical feet per hour scaled to 150 bpm piece by piece; a band needs 3 minutes in the run;
    running and power hiking both count, and the share hiked (cadence under 130 steps/min) is reported beside it.

Heart rate must sit 20+ bpm above resting, and the average inside 135 to 175 bpm for trail pace (as run pace at 150 bpm)
and 125 to 180 bpm for climbing: scaling a very easy hike or an all-out effort to 150 bpm stretches the line too far.
"""
import bisect
import csv
import glob
import gzip
import os
from datetime import date, timedelta

import segments as seg

HIKE_SPM = 130  # steps per minute: under this a piece is hiking
STEEP_DOWN = -0.10
RUNNABLE_MAX = 0.10  # runnable ground stops at 10% up: steeper minutes count in Climbing (walk-run switch, Brill 2021, Finiel 2026)
PIECE_S, SKIP_S, MIN_KEPT_S = 60, 600, 600
CLIMB_GRADE, CLIMB_MIN_S = 5.0, 180  # a band needs 3 min of climbing in the run
HR_LAG_S, MOVE_M = 30, 5.0  # heart rate read 30 s later on a climb; a piece under 5 m is standing
import hr_anchor  # noqa: E402  the athlete's own run anchor and its windows (the athlete, Nov 14, 2026): 150, 135 to 175 and 125 to 180 for the athlete


def HR_REF():
    return hr_anchor.current()["run"]


def PACE_HR():
    """The run's average heart rate window, as run pace at the anchor uses (calc.js)."""
    return tuple(hr_anchor.current()["window"]["run"])


def CLIMB_HR():
    """Climbs: easy hikes far under the anchor stretch too far to trust."""
    return tuple(hr_anchor.current()["window"]["climb"])


FT = 3.28084
MI = 1609.344


def cost(g):
    """Minetti 2002 energy cost of running (J/kg/m) at grade g (rise over run), valid about -0.45 to 0.45."""
    g = max(-0.45, min(0.45, g))
    return 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6


def read(path):
    with gzip.open(path, "rt") as fh:
        return [{k: (float(v) if v not in ("", None) else None) for k, v in r.items()} for r in csv.DictReader(fh)]


def full_cadence(rows):
    """Garmin's run cadence is sometimes one foot (strides per minute): when the run's median is under 120, double it."""
    c = sorted(r["cad"] for r in rows if r.get("cad"))
    k = 2 if c and c[len(c) // 2] < 120 else 1
    return lambda r: None if not r.get("cad") else r["cad"] * k


def rhr_on(summary, day):
    """Mean resting heart rate of the 15 days centred on day (summary.csv resting_hr)."""
    lo, hi = day - timedelta(days=7), day + timedelta(days=7)
    xs = []
    for r in summary:
        try:
            d = date.fromisoformat(r["date"][:10])
            v = float(r.get("resting_hr") or "nan")
        except (ValueError, KeyError):
            continue
        if lo <= d <= hi and v == v:
            xs.append(v)
    return sum(xs) / len(xs) if xs else None


def scale(hr, rhr):
    """Factor (150 - RHR) / (HR - RHR): above 1 when the effort ran below 150 bpm."""
    if hr is None or rhr is None or hr - rhr < 20:
        return None
    return (HR_REF() - rhr) / (hr - rhr)


def trail_pace(rows, rhr):
    """Grade-adjusted pace scaled to 150 bpm, min/mi, with the kept minutes and the raw heart rate. None when too little is left."""
    rows = [r for r in rows if r.get("t_s") is not None and r.get("dist_m") is not None and r.get("elev_m") is not None]
    if len(rows) < 20:
        return None
    el = seg.smooth(rows)
    cad = full_cadence(rows)
    eq = t = hrw = 0.0
    i = 0
    while i < len(rows) - 1:
        j = i
        while j < len(rows) - 1 and rows[j]["t_s"] - rows[i]["t_s"] < PIECE_S:
            j += 1
        a, b = rows[i], rows[j]
        i = j
        dt, dd = b["t_s"] - a["t_s"], b["dist_m"] - a["dist_m"]
        if a["t_s"] < SKIP_S or dt <= 0 or dd <= 0 or dd / dt < 0.8:  # warm-up, stopped or standing
            continue
        piece = [r for r in rows if a["t_s"] <= r["t_s"] <= b["t_s"]]
        hrs = [r["hr"] for r in piece if r.get("hr")]
        cs = [cad(r) for r in piece if cad(r)]
        g = (el[rows.index(b)] - el[rows.index(a)]) / dd
        if g < STEEP_DOWN or g >= RUNNABLE_MAX or not hrs or (cs and sum(cs) / len(cs) < HIKE_SPM):
            continue
        eq += dd * cost(g) / cost(0)
        t += dt
        hrw += sum(hrs) / len(hrs) * dt
    if t < MIN_KEPT_S or eq <= 0:
        return None
    hr = hrw / t
    if not PACE_HR()[0] <= hr <= PACE_HR()[1]:
        return None
    f = scale(hr, rhr)
    if f is None:
        return None
    pace = t / 60 / (eq / MI)  # min per flat-equivalent mile
    return {"value": round(pace / f, 3), "raw": round(pace, 3), "hr": round(hr), "min": round(t / 60)}


# Climbing is every minute at 10% or steeper (the athlete, Nov 11, 2026: under 10% is runnable ground, read as grade adjusted pace);
# SPLITS are the lines shown inside it: 10 to 15% (running and hiking mixed), 15 to 20% (hiking), 20%+ (steep)
CLIMB_MIN_GRADE = 10.0
SPLITS = (("10–15%", 10.0, 15.0), ("15–20%", 15.0, 20.0), ("20%+", 20.0, None))
EFFORT_M_PER_KM = 100.0  # ITRA effort distance: km + every 100 m of climbing counts one more km


def effort_pace(a, rhr):
    """Moving minutes per effort km (ITRA: km + gain / 100 m), scaled to 150 bpm by the run's average heart rate, from the
    activities.csv row. None outside PACE_HR or without distance."""
    km, gain = _num(a.get("distance_km")), _num(a.get("ascent_m")) or 0.0
    mins = _num(a.get("moving_min")) or _num(a.get("duration_min"))
    hr = _num(a.get("avg_hr"))
    if not km or not mins or hr is None or not PACE_HR()[0] <= hr <= PACE_HR()[1]:
        return None
    f = scale(hr, rhr)
    if f is None:
        return None
    ek = km + gain / EFFORT_M_PER_KM
    raw = mins / ek
    return {"value": round(raw / f, 3), "raw": round(raw, 3), "hr": round(hr), "effort_km": round(ek, 1), "km": round(km, 1), "gain_m": round(gain)}


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None


def climbing(rows, rhr, lo=CLIMB_GRADE, hi=None):
    """Climbing speed on ground from lo% up to hi%, ft/h scaled to 150 bpm minute by minute, with the share hiked.
    The run is cut into PIECE_S pieces and each uphill piece goes to the band of its own grade (the athlete chose this Nov 11, 2026:
    a whole climb averaged its steep pitches away). Heart rate is read HR_LAG_S later, since it lags the hill, and must
    sit in CLIMB_HR. A band needs CLIMB_MIN_S of such pieces in the run, else None."""
    rows = [r for r in rows if r.get("t_s") is not None and r.get("dist_m") is not None and r.get("elev_m") is not None]
    if len(rows) < 20:
        return None
    el = seg.smooth(rows)
    cad = full_cadence(rows)
    ts = [r["t_s"] for r in rows]
    vert = dur = hrw = hike = scaled = 0.0
    i = 0
    while i < len(rows) - 1:
        j = i
        while j < len(rows) - 1 and rows[j]["t_s"] - rows[i]["t_s"] < PIECE_S:
            j += 1
        a, b, ia, ib = rows[i], rows[j], i, j
        i = j
        dt, dd = b["t_s"] - a["t_s"], b["dist_m"] - a["dist_m"]
        if dt <= 0 or dt > 2 * PIECE_S or dd < MOVE_M:  # a gap in the record, or standing
            continue
        up = el[ib] - el[ia]
        g = up / dd * 100
        if g < lo or (hi is not None and g >= hi):
            continue
        k0 = bisect.bisect_left(ts, a["t_s"] + HR_LAG_S)
        k1 = bisect.bisect_right(ts, b["t_s"] + HR_LAG_S)
        hrs = [r["hr"] for r in rows[k0:k1] if r.get("hr")]
        if not hrs:
            continue
        hr = sum(hrs) / len(hrs)
        f = scale(hr, rhr)
        if f is None or not CLIMB_HR()[0] <= hr <= CLIMB_HR()[1]:
            continue
        vert += up; dur += dt; hrw += hr * dt; scaled += up * FT / dt * 3600 * f * dt
        cc = [cad(r) for r in rows[ia:ib + 1] if cad(r)]
        if cc:
            hike += dt * sum(1 for c in cc if c < HIKE_SPM) / len(cc)
    if dur < CLIMB_MIN_S:
        return None
    return {"value": round(scaled / dur), "raw": round(vert * FT / dur * 3600), "hr": round(hrw / dur), "min": round(dur / 60),
            "vert_ft": round(vert * FT), "hiked_pct": round(hike / dur * 100)}


DRIFT_MIN_S = 75 * 60  # trail durability needs 75+ moving minutes, the same floor as a long flat run


def drift(rows):
    """Trail durability (the athlete, Nov 11, 2026): how much grade adjusted speed per heartbeat falls from the first half of the
    moving time to the second half, in percent (lower is better; under 0 means the second half was more efficient). Every
    moving minute after the first 10 counts at its own grade by the energy cost of running there (Minetti 2002), hiking
    included, so the hills do not decide the answer the way raw speed would. None under 75 moving minutes, without heart
    rate, or past 25% either way (a broken record)."""
    rows = [r for r in rows if r.get("t_s") is not None and r.get("dist_m") is not None and r.get("elev_m") is not None]
    if len(rows) < 50:
        return None
    el = seg.smooth(rows)
    pieces, i = [], 0
    while i < len(rows) - 1:
        j = i
        while j < len(rows) - 1 and rows[j]["t_s"] - rows[i]["t_s"] < PIECE_S:
            j += 1
        a, b = rows[i], rows[j]
        dt, dd = b["t_s"] - a["t_s"], b["dist_m"] - a["dist_m"]
        hrs = [r["hr"] for r in rows[i:j + 1] if r.get("hr")]
        if a["t_s"] >= SKIP_S and 0 < dt <= 2 * PIECE_S and dd / dt > 0.5 and hrs:
            g = (el[j] - el[i]) / dd
            pieces.append((dt, dd * cost(g) / cost(0), sum(hrs) / len(hrs)))
        i = j
    total = sum(x[0] for x in pieces)
    if total < DRIFT_MIN_S:
        return None
    acc, h = 0.0, [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]
    for dt, eq, hr in pieces:
        k = 0 if acc + dt / 2 < total / 2 else 1
        acc += dt
        h[k][0] += dt
        h[k][1] += eq
        h[k][2] += hr * dt
    if not h[0][0] or not h[1][0]:
        return None
    ef = [(x[1] / x[0]) / (x[2] / x[0]) for x in h]
    dec = (ef[0] - ef[1]) / ef[0] * 100
    if abs(dec) > 25:
        return None
    return {"value": round(dec, 1), "min": round(total / 60), "hr1": round(h[0][2] / h[0][0]), "hr2": round(h[1][2] / h[1][0])}


def per_run(acts, summary, root="."):
    """One row per hilly run or hike with a stream: date, id, name, type, trail speed per effort km and runnable pace (runs only),
    climbing on 10%+ and its splits, and trail durability (runs only) (any may be None)."""
    by_id = {a["activity_id"]: a for a in acts}
    out = []
    for p in sorted(glob.glob(os.path.join(root, "data/streams/*.csv.gz"))):
        aid = os.path.basename(p).split(".")[0]
        a = by_id.get(aid)
        if not a or not a.get("local_start"):
            continue
        day = date.fromisoformat(a["local_start"][:10])
        rows = read(p)
        rhr = rhr_on(summary, day)
        run = "run" in (a.get("type") or "").lower()
        out.append({"date": str(day), "id": aid, "name": a.get("name") or "", "type": a.get("type") or "",
                    "speed": effort_pace(a, rhr) if run else None, "pace": trail_pace(rows, rhr) if run else None,
                    "drift": drift(rows) if run else None,
                    "climb": climbing(rows, rhr, CLIMB_MIN_GRADE, None), "c1020": climbing(rows, rhr, 10.0, 20.0),
                    "c20": climbing(rows, rhr, 20.0, None), "splits": {nm: climbing(rows, rhr, lo, hi) for nm, lo, hi in SPLITS}})
    return sorted(out, key=lambda r: (r["date"], r["id"]))


def rolling(points, days=28):
    """At each point, the mean of the values in the days up to it (inclusive) and how many went in."""
    out = []
    for i, (d, v) in enumerate(points):
        w = [x for dd, x in points[: i + 1] if date.fromisoformat(dd) > date.fromisoformat(d) - timedelta(days=days)]
        out.append((d, sum(w) / len(w), len(w)))
    return out
