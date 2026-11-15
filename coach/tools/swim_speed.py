"""Swim pace at easy effort: the swim engine tile read at one heart rate, the way run pace is (the athlete, Nov 14, 2026: "I want to
have the heart rate shown just like running and I want one for swimming. There are endurance speeds").

Each swim of 400 m or more with an average heart rate inside the swim window is scaled to the athlete's swim anchor
(hr_anchor.py: the bike anchor unless the profile sets one, 130 for the original athlete), the same heart rate reserve scaling the
run pace tile uses: speed x (anchor - RHR) / (HR - RHR), RHR the median resting heart rate of the 14 days before the swim.

The figure is the average pace per 100 yd of those swims over the last 28 days; the baseline is the average of swims 28 to 112 days
back (catalog ladder "guide": against your own baseline), and a level shows only with two or more swims on each side. Wrist heart rate in water often reads low or jumps, so one swim says
little; read it over several. Estimated.

Usage:
    python3 coach/tools/swim_speed.py     # print the swims that count and the figure
"""
import json
import os
import statistics
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hr_anchor  # noqa: E402
import markers  # noqa: E402

MIN_M, YD = 400.0, 0.9144
MIN_SWIMS = 2  # wrist heart rate in water is rough: no level from a single swim on either side


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _rhr(summ):
    out = []
    for r in summ or []:
        v = _num(r.get("resting_hr"))
        try:
            d = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if v:
            out.append((d, v))
    return sorted(out)


def rhr_on(rhr, d):
    """Median resting heart rate of the 14 days up to d, else the nearest earlier reading, else None."""
    vals = [v for x, v in rhr if d - timedelta(days=14) <= x <= d]
    if vals:
        return statistics.median(vals)
    before = [v for x, v in rhr if x <= d]
    return before[-1] if before else None


def swim_value(metres, minutes, hr, rhr, anchor, window):
    """Pace per 100 yd (seconds) scaled to the anchor, or None when the swim does not count. Pure."""
    if not metres or metres < MIN_M or not minutes or minutes <= 0 or hr is None or rhr is None:
        return None
    if not (window[0] <= hr <= window[1]) or hr - rhr <= 5 or anchor - rhr <= 5:
        return None
    speed = metres / (minutes * 60) * (anchor - rhr) / (hr - rhr)
    return round(100 * YD / speed, 1)


def swims(acts, summ, anchors=None):
    """[{date, id, sec, hr, m}] for every swim that counts, oldest first."""
    a = anchors or hr_anchor.current()
    anchor, window = a["swim"], a["window"]["swim"]
    rhr = _rhr(summ)
    out = []
    for x in acts or []:
        if "swim" not in str(x.get("type") or "").lower():
            continue
        try:
            d = date.fromisoformat(str(x.get("local_start") or "")[:10])
        except ValueError:
            continue
        km = _num(x.get("distance_km"))
        m = km * 1000 if km else (_num(x.get("distance_mi")) or 0) * 1609.344
        mins = _num(x.get("moving_min")) or _num(x.get("duration_min"))
        hr = _num(x.get("avg_hr"))
        s = swim_value(m, mins, hr, rhr_on(rhr, d), anchor, window)
        if s:
            out.append({"date": d, "id": str(x.get("activity_id")), "sec": s, "hr": hr, "m": round(m)})
    return sorted(out, key=lambda r: r["date"])


SWIM_MAX_LESS = 7  # maximum heart rate in front crawl is about 7 bpm under running (Olstad et al. 2019, Sports 7:235)
SWIM_POWER_EXP = 2.6  # metabolic power of front crawl grows about as speed^2.6 (energy cost C = 0.67 v^1.61, Capelli et al. 1998, in Zamparo et al. 2020)


def scale(g, anchor):
    """The general population scale for swim pace at the swim anchor (the athlete, Nov 14, 2026: "search and research for a basis of
    scale"). Cooper's 12-minute swim test categories for the athlete's age band and sex (Cooper 1982, the Swim pace tile's general
    scale), carried down to the anchor heart rate: a typical adult (rest markers.REST_HR, swimming maximum 220 minus age less
    SWIM_MAX_LESS) at the anchor uses that share of heart rate reserve, taken as the same share of the metabolic power of the
    all-out 12 minutes, and speed follows power to the 1/SWIM_POWER_EXP. Five categories, not percentiles. None with no group.
    Estimated. Pure. Rungs are on minus seconds per 100 yd, so higher is better."""
    if not g or g.get("sex") not in markers.COOPER_SWIM:
        return None
    lo_age = int(g["band"].split("-")[0])
    edges = markers.COOPER_SWIM[g["sex"]][max(a for a in markers.COOPER_SWIM[g["sex"]] if a <= max(13, lo_age))]
    mx = 220 - (lo_age + 5) - SWIM_MAX_LESS
    share = max(0.05, min(1.0, (anchor - markers.REST_HR) / max(1, mx - markers.REST_HR)))
    pace = lambda yd: 72000 / yd / share ** (1 / SWIM_POWER_EXP)  # s per 100 yd at the anchor
    rungs = [[markers.COOPER_LABELS[0], -10000.0]] + [[lab, -round(pace(e), 1)] for lab, e in zip(markers.COOPER_LABELS[1:], edges)]
    return {"rungs": rungs, "unit": "s/100 yd", "sign": -1, "label": f"{g['label'].capitalize()}, Cooper 12-minute swim (carried to {anchor} bpm)",
            "rule": (f"Where your pace at {anchor} bpm sits among {g['label']}: Cooper's 12-minute swim test categories (Cooper 1982), the Swim pace "
                     f"tile's scale, carried down to {anchor} bpm. A typical adult at {anchor} bpm uses about {share * 100:.0f}% of their heart rate reserve "
                     f"(swimming maximum about {SWIM_MAX_LESS} bpm under running, Olstad 2019), and swim speed grows with about the {SWIM_POWER_EXP} root of "
                     f"effort (Zamparo 2020). Five categories, not percentiles. Estimated.")}


def _mss(sec):
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def figure(rs, today, anchor):
    """The catalog figure {value, num, unit, chip, note, baseline} or None when no swim in 28 days counts. Pure."""
    now = [r for r in rs if today - timedelta(days=27) <= r["date"] <= today]
    if not now:
        return None
    old = [r for r in rs if today - timedelta(days=112) <= r["date"] < today - timedelta(days=27)]
    mean = lambda xs: sum(r["sec"] for r in xs) / len(xs)
    yd = sum(r["m"] for r in now) / YD
    base = round(mean(old), 1) if len(old) >= MIN_SWIMS and len(now) >= MIN_SWIMS else None
    wait = None if len(now) >= MIN_SWIMS else f"A level appears with {MIN_SWIMS} swims in the last 4 weeks (now {len(now)})"
    return {"wait": wait, "n": len(now), "value": _mss(mean(now)), "num": round(mean(now), 1), "unit": "/100 yd", "chip": "Scaled like run pace", "sub": f"{len(now)} swim{'s' if len(now) != 1 else ''}, 28 days",
            "baseline": base,
            "note": f"{len(now)} swim{'s' if len(now) != 1 else ''} in 4 weeks, {yd:,.0f} yd, each scaled to {anchor} bpm. Wrist heart rate in water often reads low, so read it over several swims. Estimated."}


if __name__ == "__main__":
    import csv
    acts = list(csv.DictReader(open("data/activities.csv"))) if os.path.exists("data/activities.csv") else []
    summ = list(csv.DictReader(open("data/summary.csv"))) if os.path.exists("data/summary.csv") else []
    anc = hr_anchor.use(".")
    rs = swims(acts, summ, anc)
    for r in rs[-12:]:
        print(r["date"], _mss(r["sec"]), "/100 yd", r["hr"], "bpm", r["m"], "m")
    print(json.dumps(figure(rs, date.today(), anc["swim"]), default=str))
