"""Bike speed at easy effort: the bike engine tile for riders with no power meter and no indoor trainer (the athlete, Nov 14, 2026:
his dashboard request "Bike speed by heart rate 130", then "What about people that dont have power meters or indoor").

Without power, the only bike fitness signal in the data is how fast someone rides on flat ground at the same easy heart rate.
It is noisy (wind, stops, drafting in a group), so it is built only from the parts of outdoor rides that are fair to compare:

  - outdoor rides only (indoor speed is whatever the trainer says);
  - laps of 1 km or more that are nearly flat: climbing plus descending under 1.5% of the lap's distance;
  - lap average heart rate within 8 bpm of the athlete's own bike anchor (hr_anchor.py: 130 for the original athlete);
  - moving speed, so stops at lights do not count against the rider;
  - a ride counts with at least 3 km of such laps; its value is the distance-weighted speed of those laps.

The tile figure is the average of those rides over the last 28 days; the baseline (for the coach guide ladder: against your own
baseline from four or more weeks ago) is the average of rides 28 to 112 days ago. No population norm exists for speed at a
set heart rate, so the levels are the coach's guidance from the person (catalog ladder "guide"). Estimated.

Usage:
    python3 coach/tools/bike_speed.py     # print the rides that count and the figure
"""
import json
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hr_anchor  # noqa: E402
import fit_ladder  # noqa: E402
import markers  # noqa: E402
import vo2_norms  # noqa: E402

MIN_LAP_M, MAX_GRADE, HR_BAND, MIN_RIDE_M = 1000.0, 0.015, 8, 3000.0
MPS_TO_MPH = 2.236936


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _outdoor_ride(t):
    t = str(t or "").lower()
    return ("cycl" in t or "rid" in t or "bik" in t) and "virtual" not in t and "indoor" not in t


def ride_value(laps, anchor):
    """Distance-weighted moving speed (mph) of the flat laps at the easy heart rate, with the metres that counted. None when
    under MIN_RIDE_M qualify. Pure."""
    dist = secs = 0.0
    for lap in laps or []:
        d, hr = _num(lap.get("distance")), _num(lap.get("averageHR"))
        sp = _num(lap.get("averageMovingSpeed")) or _num(lap.get("averageSpeed"))
        if not d or d < MIN_LAP_M or hr is None or not sp or sp <= 0:
            continue
        climb = (_num(lap.get("elevationGain")) or 0) + (_num(lap.get("elevationLoss")) or 0)
        if climb / d >= MAX_GRADE or abs(hr - anchor) > HR_BAND:
            continue
        dist += d
        secs += d / sp
    if dist < MIN_RIDE_M or not secs:
        return None
    return {"mph": round(dist / secs * MPS_TO_MPH, 2), "km": round(dist / 1000, 1)}


def rides(root=".", acts=(), anchor=None):
    """[{date, id, mph, km}] for every outdoor ride whose lap file has enough flat, easy laps, oldest first."""
    anchor = anchor or hr_anchor.current()["bike"]
    out = []
    for a in acts:
        if not _outdoor_ride(a.get("type")):
            continue
        try:
            d = date.fromisoformat(str(a.get("local_start") or "")[:10])
        except ValueError:
            continue
        p = os.path.join(root, "data", "activities", f"{a.get('activity_id')}.json")
        try:
            with open(p, encoding="utf-8") as fh:
                laps = ((json.load(fh).get("splits") or {}).get("lapDTOs")) or []
        except (OSError, ValueError):
            continue
        v = ride_value(laps, anchor)
        if v:
            out.append({"date": d, "id": str(a.get("activity_id")), **v})
    return sorted(out, key=lambda r: r["date"])


def scale(g, anchor, kg=None):
    """The general population scale for speed at the bike anchor (the athlete, Nov 14, 2026: "search and research for a basis of
    scale"): the same modelled adults as Bike power at 130 bpm (markers.easy_general: FRIEND VO2max on cycle tests for the
    athlete's age band and sex, the share of it a typical adult uses at that heart rate, ACSM watts) turned into speed on a flat,
    windless road with the power model Bike time already uses (markers.speed_for_watts: road bike on the hoods). Percentile
    levels as on every ranked tile (vo2_norms.FIT_BANDS). None with no age band and sex. Estimated. Pure."""
    n = markers.easy_general("bike", g, kg or markers.RIDER_KG, hr=anchor) if g else None
    if not n:
        return None
    norm = {"breakpoints": [[round(markers.speed_for_watts(w) * MPS_TO_MPH, 2), p] for w, p in n["breakpoints"]], "better": 1}
    rungs = [[lab, -1000.0 if lo is None else round(fit_ladder.value_at(norm, lo)[0], 2)] for lab, lo, _hi in vo2_norms.FIT_BANDS]
    return {"rungs": rungs, "unit": "mph", "sign": 1, "label": f"{g['label'].capitalize()}, general population (modelled)",
            "rule": (f"Where your speed at {anchor} bpm sits among {g['label']}: the same modelled adults as Bike power at {anchor} bpm "
                     f"(FRIEND fitness tests, ACSM equations), turned into speed on a flat road with no wind with the power model Bike time uses "
                     f"(road bike on the hoods). Real roads with wind and corners read a little slower. Estimated.")}


def figure(rs, today, anchor):
    """The catalog figure {value, unit, chip, note, baseline} or None when no ride in 28 days counts. Pure."""
    now = [r for r in rs if today - timedelta(days=27) <= r["date"] <= today]
    if not now:
        return None
    old = [r for r in rs if today - timedelta(days=112) <= r["date"] < today - timedelta(days=27)]
    mean = lambda xs: sum(r["mph"] for r in xs) / len(xs)
    km = sum(r["km"] for r in now)
    return {"value": f"{mean(now):.1f}", "unit": "mph", "chip": "Flat outdoor miles", "sub": f"{len(now)} ride{'s' if len(now) != 1 else ''}, 28 days",
            "baseline": round(mean(old), 2) if old else None,
            "note": f"{len(now)} ride{'s' if len(now) != 1 else ''} in 4 weeks, {km * 0.621371:.0f} flat miles near {anchor} bpm. Wind and group riding move it; read it over several rides. Estimated."}


if __name__ == "__main__":
    import csv
    acts = list(csv.DictReader(open("data/activities.csv"))) if os.path.exists("data/activities.csv") else []
    anc = hr_anchor.use(".")
    rs = rides(".", acts, anc["bike"])
    for r in rs[-12:]:
        print(r["date"], r["mph"], "mph", r["km"], "km")
    print(json.dumps(figure(rs, date.today(), anc["bike"]), default=str))
