#!/usr/bin/env python3
"""Race scales from finisher results (gold stage, epic Compare with anyone; the athlete, Nov 16, 2026 board notes: similar course trail
scale, more race norms, the 70.3 table, age grade and more scales "should roll into architecture determined for user specific race
scales (gold stage)").

One recipe for any race field in coach/race_fields.json that has finisher results on file: each course in coach/research/norms/courses.json is a
transcribed result list in coach/research/norms/ (no names), with the course's distance and climbing. A finish time becomes a pace per
ITRA effort km (each km counts 1, each 100 m of climbing 1 more), so courses of one distance but different climbing sit on one
scale, the way the big trail indexes compare runners across courses. The courses pooled for a person are those of their race's
field whose climbing per km is close to their own race's course (SIMILAR), or every course of the field while their course is not
on file. markers.norm_rows() adds the rows in memory, as it does the 70.3 age group rows; nothing is stored in coach/norms.json.

Rows: key "trailspeed" (min per effort km, lower is better), compare = the field id, one row for all finishers, one per sex and
one per sex and age class with at least MIN_N finishers. The page ranks the person's easy trail speed against them: where an
easy day's pace would put them among the finishers' whole race paces (aid stops and late fade are inside the finishers' times).

    python3 coach/tools/race_rows.py          # each field: courses, finishers, median pace per effort km

Standard library only.
"""
from __future__ import annotations

import json
import os
import re

ROOT = "coach"  # read from the working directory (the repo root), as the other tools do
# The course library is data, not code: coach/research/norms/courses.json (each person's own races; the starter kit ships none).
# Add a race by transcribing its finishers (time|age|sex or time|DUV class) beside it and adding one row there.
COURSES_FILE = "research/norms/courses.json"


def load_courses(root=ROOT):
    try:
        with open(os.path.join(root, COURSES_FILE), encoding="utf-8") as fh:
            rows = json.load(fh).get("rows", [])
    except (OSError, ValueError):
        return []
    return [dict(r, file="research/norms/" + r["file"]) for r in rows]


COURSES = None  # loaded on first use (tests set their own list)


def courses(root=ROOT):
    return COURSES if COURSES is not None else load_courses(root)
# Road races (the athlete, Nov 17, 2026: every event he signs up for gets a scale, "for that event or event type"): a road course ranks
# the run time tile instead, each finish carried to the mile, 5K and 10K by Riegel's rule (time x (distance ratio) ^ 1.06,
# Riegel 1981, Estimated). A course with "of" is an evenly spaced sample of that many finishers.
# A road course with "keys" ranks those distances instead (a century ranks the long bike times: t90k, t100k, t100mi).
KEY_KM = {"mile": 1.609344, "5k": 5.0, "10k": 10.0, "t90k": 90.0, "t100k": 100.0, "t100mi": 160.934,
          "swim100": 0.1, "swim400": 0.4, "swim750": 0.75, "swim1500": 1.5}
KEY_NAME = {"mile": "mile", "5k": "5K", "10k": "10K", "t90k": "90K", "t100k": "100K", "t100mi": "100 mile",
            "swim100": "100 m", "swim400": "400 m", "swim750": "750 m", "swim1500": "1,500 m"}
# A triathlon course ranks its legs: each finisher line is total|age|sex|swim|bike|run, and "legs" names each leg's distance in km
# and the keys it ranks ({"swim": [3.86, ["swim100", ...]], "bike": [180.2, ["t90k", ...]]}). The run leg follows a long bike, so
# it ranks nothing on a fresh-legs tile.
LEG_AT = {"swim": 3, "bike": 4, "run": 5}
ROAD_KEYS = ("mile", "5k", "10k")
RIEGEL = 1.06
SIMILAR = (0.6, 1.6)  # climbing per km of a pooled course, as a share of the person's own course
MIN_N = 40            # smaller groups are not filed
# Runnable pace (min/mi grade adjusted, under 10% ground) per minute per effort km: a 100K with 3,350 m up in 18 h is about 8:05 per
# effort km over the whole day and about 15:30/mi on its runnable ground (coach anchor, Nov 8, 2026). One home: markers.py reads it.
GAP_PER_SPEED = 15.5 / (18 * 60 / 133.5)
FRONT = (1, 5, 10, 20, 100 / 3, 50, 200 / 3, 80, 90, 95)  # percent of finishers ahead at each breakpoint
CLASS = re.compile(r"^(M|W)(U23|\d\d)$")


def _min(t):
    p = [float(x) for x in t.strip().split(":")]
    return p[0] * 60 + p[1] + (p[2] / 60 if len(p) > 2 else 0)


def _band(age):
    """A finisher's age class, the DUV's: under 23, 23 to 34, then five-year classes."""
    if age < 23:
        return "0-22"
    if age < 35:
        return "23-34"
    lo = age // 5 * 5
    return f"{lo}-{lo + 4}"


def finishers(course, root=ROOT):
    """[(minutes, sex or None, age band or None)] from one course's result file."""
    out = []
    try:
        with open(os.path.join(root, course["file"]), encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return out
    for ln in lines:
        if not ln.strip() or ln.startswith("#"):
            continue
        parts = ln.split("|")
        mins = _min(parts[0])
        sex = band = None
        if len(parts) >= 3:  # time|age|M or F
            sex = {"M": "male", "F": "female", "W": "female"}.get(parts[2].strip()[:1])
            if parts[1].strip().isdigit():
                band = _band(int(parts[1]))
        elif len(parts) == 2:  # time|DUV class
            m = CLASS.match(parts[1].strip())
            if m:
                sex = "male" if m.group(1) == "M" else "female"
                band = "0-22" if m.group(2) == "U23" else _band(int(m.group(2)))
        out.append((mins, sex, band))
    return out


def effort_km(course):
    return course["km"] + (course["gain_m"] or 0) / 100.0


def similar(field, course=None):
    """The courses of one field pooled for a person whose race course is `course` ({km, gain_m}), or all of them without one."""
    cs = [c for c in courses() if c["field"] == field]
    if not course or not course.get("km") or course.get("gain_m") is None:
        return cs
    if any(c.get("road") or c.get("legs") for c in cs):  # a road or triathlon field pools its courses whatever the climbing
        return cs
    want = course["gain_m"] / course["km"]
    lo, hi = SIMILAR
    keep = [c for c in cs if want == 0 or lo <= (c["gain_m"] / c["km"]) / want <= hi]
    return keep or cs


def _quantile(xs, q):
    xs = sorted(xs)
    if len(xs) == 1:
        return xs[0]
    k = (len(xs) - 1) * q
    i = int(k)
    return xs[i] + (xs[min(i + 1, len(xs) - 1)] - xs[i]) * (k - i)


def _row(field, label, paces, courses, sex=None, band=None, key="trailspeed"):
    who = "all finishers" if not sex else f"{'men' if sex == 'male' else 'women'}" + (f" {band.replace('-', ' to ')}" if band else "")
    names = sorted({c["race"] for c in courses})
    years = sorted({c["year"] for c in courses})
    gap = key == "trailgap"
    paces = [p * GAP_PER_SPEED for p in paces] if gap else paces
    r = {"kind": "norm", "key": key, "unit": "min/mi" if gap else "min/effort km", "better": -1, "tail": "log", "compare": field,
         "compare_label": f"{label} on similar courses", "derived": "race_rows", "n": len(paces),
         "population": f"{who}, {', '.join(names)} ({years[0]}{'' if len(years) == 1 else ' to ' + str(years[-1])})",
         "short": f"{who}, {label.split(' ')[0]} courses like yours",
         "source": f"Finisher times ({len(paces)}) as minutes per ITRA effort km" + (", carried to runnable pace by the coach's 100K anchor (Estimated)" if gap else ""),
         "url": "https://statistik.d-u-v.org/", "date": str(years[-1]),
         "breakpoints": [[round(_quantile(paces, p / 100), 3), round(p, 2)] for p in FRONT],
         "note": "Your easy pace against their whole race pace, stops and fade included."}
    if sex:
        r["sex"] = sex
    if band:
        r["age_band"] = band
    return r


def _road_row(field, label, key, times, courses):
    names = sorted({c["race"] for c in courses})
    years = sorted({c["year"] for c in courses})
    total = sum(c.get("of") or 0 for c in courses)
    dist = KEY_NAME[key]
    return {"kind": "norm", "key": key, "unit": "min", "better": -1, "tail": "log", "compare": field, "compare_label": label,
            "derived": "race_rows", "n": len(times), "estimated": True,
            "population": f"all finishers, {', '.join(names)} ({years[0]}{'' if len(years) == 1 else ' to ' + str(years[-1])})",
            "short": f"{', '.join(names)} finishers",
            "source": f"Finish times ({len(times)}" + (f", {courses[0]['sample']}" if courses[0].get("sample") else f" evenly spaced places of {total:,}" if total else "") + f") carried to the {dist} by Riegel's rule",
            "url": courses[0].get("url") or "https://runsignup.com/", "date": str(years[-1]),
            "breakpoints": [[round(_quantile(times, p / 100), 3), round(p, 2)] for p in FRONT],
            "note": f"Your {dist} best against their race time carried to the {dist} (Estimated)."}


def legs(course, root=ROOT):
    """{leg: [minutes]} from a triathlon course's result file (finishers with every split)."""
    out = {k: [] for k in course.get("legs", {})}
    try:
        with open(os.path.join(root, course["file"]), encoding="utf-8") as fh:
            lines = [ln for ln in fh.read().splitlines() if ln.strip() and not ln.startswith("#")]
    except OSError:
        return out
    for ln in lines:
        parts = ln.split("|")
        for k in out:
            if len(parts) > LEG_AT[k] and parts[LEG_AT[k]].strip():
                out[k].append(_min(parts[LEG_AT[k]]))
    return out


def rows_for(field, label, course=None, root=ROOT):
    cs = [c for c in similar(field, course) if os.path.exists(os.path.join(root, c["file"]))]
    if cs and all(c.get("legs") for c in cs):
        res = []
        for leg in cs[0]["legs"]:
            km, keys = cs[0]["legs"][leg]
            pts = [(m, c) for c in cs for m in legs(c, root).get(leg, [])]
            if len(pts) < MIN_N:
                continue
            for key in keys:
                r = _road_row(field, label, key, [m * (KEY_KM[key] / c["legs"][leg][0]) ** RIEGEL for m, c in pts], cs)
                r["source"] = r["source"].replace("Finish times", f"{leg.capitalize()} splits")
                r["note"] = f"Your {KEY_NAME[key]} best against their race {leg} carried to the {KEY_NAME[key]} (Estimated)."
                res.append(r)
        return res
    if cs and all(c.get("road") for c in cs):
        pts = [(m, c) for c in cs for m, _s, _b in finishers(c, root)]
        if len(pts) < MIN_N:
            return []
        keys = cs[0].get("keys") or ROAD_KEYS
        return [_road_row(field, label, key, [m * (KEY_KM[key] / c["km"]) ** RIEGEL for m, c in pts], cs) for key in keys]
    pts = [(m / effort_km(c), sx, b) for c in cs for m, sx, b in finishers(c, root)]
    if len(pts) < MIN_N:
        return []
    out = []
    for key in ("trailspeed", "trailgap"):  # whole-course speed, and runnable pace from the same finishers
        out.append(_row(field, label, [p for p, _s, _b in pts], cs, key=key))
        for sx in ("male", "female"):
            mine = [p for p, s, _b in pts if s == sx]
            if len(mine) >= MIN_N:
                out.append(_row(field, label, mine, cs, sx, key=key))
            for band in sorted({b for _p, s, b in pts if s == sx and b}):
                grp = [p for p, s, b in pts if s == sx and b == band]
                if len(grp) >= MIN_N:
                    out.append(_row(field, label, grp, cs, sx, band, key=key))
    return out


def own_courses(root=ROOT):
    """{field id: {km, gain_m}} from the person's race list (coach/races.json course_km, course_gain_m), soonest race first."""
    try:
        import compare
        with open(os.path.join(root, "races.json"), encoding="utf-8") as fh:
            rows = json.load(fh)
        rows = rows if isinstance(rows, list) else rows.get("rows", [])
    except (OSError, ValueError, ImportError):
        return {}
    out = {}
    for r in sorted((x for x in rows if x.get("kind") == "race" and x.get("course_km")), key=lambda x: str(x.get("date"))):
        f = compare.field_of(r)
        if f and f["id"] not in out:
            out[f["id"]] = {"km": float(r["course_km"]), "gain_m": float(r.get("course_gain_m") or 0)}
    return out


def build(rows, root=ROOT):
    """The norm rows with the race scale rows worked out and added (any stored race_rows rows are replaced)."""
    try:
        import compare
        fields = {f["id"]: f["label"] for f in compare.race_fields()}
    except ImportError:
        fields = {}
    keep = [r for r in rows if r.get("derived") != "race_rows"]
    if not courses(root):
        return keep
    mine = own_courses(root)
    new = []
    for fid in sorted({c["field"] for c in courses(root)}):
        new += rows_for(fid, fields.get(fid, fid), mine.get(fid), root)
    return keep + new


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    for r in build([]):
        mid = next(v for v, p in r["breakpoints"] if p == 50)
        print(f"{r['compare']:8} {r['population'][:70]:70} n={r['n']:4}  median {int(mid)}:{round(mid % 1 * 60):02d} /effort km")
