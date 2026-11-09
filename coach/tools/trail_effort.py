"""Trail pace and climbing speed at 150 bpm from the 5 s streams of hilly runs (the athlete, Nov 8, 2026; scripts/streams.py).

Two per-run numbers, both Estimated, both scaled to 150 bpm the same way as run pace at 150 bpm on the page
(calc.js: value x (HR - RHR) / (150 - RHR), RHR the mean resting heart rate of the 15 days centred on the run):

  trail pace (grade adjusted), min/mi: the run cut into 60 s pieces after the first 10 minutes; each piece's distance
    is turned into flat-equivalent distance with the Minetti 2002 energy cost of running on a grade; pieces on steep
    descents (steeper than -10%), hiking pieces (cadence under 130 steps/min) and stops are left out; at least 10
    minutes must remain.
  climbing, ft/h up, by grade band (5 to 10%, 10 to 20%, 20%+): the climbs of 3 minutes or longer that
    coach/tools/segments.py finds; vertical feet per hour with heart rate from after each climb's first minute, scaled climb
    by climb; running and power hiking both count, and the share hiked (cadence under 130 steps/min) is reported beside it.

Heart rate must sit 20+ bpm above resting, and the average inside 135 to 175 bpm for trail pace (as run pace at 150 bpm)
and 125 to 180 bpm for climbing: scaling a very easy hike or an all-out effort to 150 bpm stretches the line too far.
"""
import csv
import glob
import gzip
import os
from datetime import date, timedelta

import segments as seg

HIKE_SPM = 130  # steps per minute: under this a piece is hiking
STEEP_DOWN = -0.10
PIECE_S, SKIP_S, MIN_KEPT_S = 60, 600, 600
CLIMB_GRADE, CLIMB_MIN_S = 5.0, 180
HR_REF = 150
PACE_HR = (135, 175)  # the run's average heart rate window, as run pace at 150 bpm uses (calc.js)
CLIMB_HR = (125, 180)  # climbs: easy hikes under 125 bpm stretch too far to 150 bpm to trust
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
    return (HR_REF - rhr) / (hr - rhr)


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
        if g < STEEP_DOWN or not hrs or (cs and sum(cs) / len(cs) < HIKE_SPM):
            continue
        eq += dd * cost(g) / cost(0)
        t += dt
        hrw += sum(hrs) / len(hrs) * dt
    if t < MIN_KEPT_S or eq <= 0:
        return None
    hr = hrw / t
    if not PACE_HR[0] <= hr <= PACE_HR[1]:
        return None
    f = scale(hr, rhr)
    if f is None:
        return None
    pace = t / 60 / (eq / MI)  # min per flat-equivalent mile
    return {"value": round(pace / f, 3), "raw": round(pace, 3), "hr": round(hr), "min": round(t / 60)}


# Grade bands for climbing (the athlete chose grade-specific levels, Nov 8, 2026): key, lowest grade %, top grade % (None = open), name
BANDS = (("climbrun", 5.0, 10.0, "Run 5–10%"), ("climb150", 10.0, 20.0, "Hike 10–20%"), ("climbsteep", 20.0, None, "Steep 20%+"))


def climbing(rows, rhr, lo=CLIMB_GRADE, hi=None):
    """Climbing speed on climbs from lo% up to hi% (3+ min), ft/h scaled to 150 bpm climb by climb, with the share hiked.
    Each climb's own heart rate (after its first minute) must sit in CLIMB_HR. None without such a climb."""
    rows = [r for r in rows if r.get("t_s") is not None and r.get("dist_m") is not None and r.get("elev_m") is not None]
    cs = [s for s in seg.segments(rows) if s["kind"] == "climb" and s["grade_pct"] >= lo and (hi is None or s["grade_pct"] < hi)
          and s["dur_s"] >= CLIMB_MIN_S and s.get("hr") and CLIMB_HR[0] <= s["hr"] <= CLIMB_HR[1]]
    cad = full_cadence(rows)
    vert = dur = hrw = hike = scaled = 0.0
    n = 0
    for s in cs:
        f = scale(s["hr"], rhr)
        if f is None:
            continue
        n += 1
        vam = s["vert_m"] * FT / s["dur_s"] * 3600
        vert += s["vert_m"]; dur += s["dur_s"]; hrw += s["hr"] * s["dur_s"]; scaled += vam * f * s["dur_s"]
        span = [r for r in rows if s["start_m"] <= r["dist_m"] <= s["start_m"] + s["length_m"]]
        cc = [cad(r) for r in span if cad(r)]
        if cc:
            hike += s["dur_s"] * sum(1 for c in cc if c < HIKE_SPM) / len(cc)
    if not n:
        return None
    return {"value": round(scaled / dur), "raw": round(vert * FT / dur * 3600), "hr": round(hrw / dur), "climbs": n, "vert_ft": round(vert * FT),
            "hiked_pct": round(hike / dur * 100)}


def per_run(acts, summary, root="."):
    """One row per hilly run or hike with a stream: date, id, name, type, trail pace and climbing (either may be None)."""
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
                    "pace": trail_pace(rows, rhr) if run else None, **{k: climbing(rows, rhr, lo, hi) for k, lo, hi, _ in BANDS}})
    return sorted(out, key=lambda r: (r["date"], r["id"]))


def rolling(points, days=28):
    """At each point, the mean of the values in the days up to it (inclusive) and how many went in."""
    out = []
    for i, (d, v) in enumerate(points):
        w = [x for dd, x in points[: i + 1] if date.fromisoformat(dd) > date.fromisoformat(d) - timedelta(days=days)]
        out.append((d, sum(w) / len(w), len(w)))
    return out
