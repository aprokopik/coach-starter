#!/usr/bin/env python3
"""Race scales from finisher results (gold stage, epic Compare with anyone; the athlete, Nov 16, 2026 board notes: similar course trail
scale, more race norms, the 70.3 table, age grade and more scales "should roll into architecture determined for user specific race
scales (gold stage)").

One recipe for any race field in coach/race_fields.json that has finisher results on file: each course in COURSES (below) is a
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
# The course library. Add a race by transcribing its finishers (time|age|sex or time|DUV class) and one line here.
COURSES = [
    {"file": "research/norms/patapsco50k_2019.txt", "race": "a past 50K", "year": 2019, "field": "run50k", "km": 54.7, "gain_m": 1468, "limit_h": 10},
    {"file": "research/norms/patapsco50k_2025.txt", "race": "a past 50K", "year": 2025, "field": "run50k", "km": 54.7, "gain_m": 1468, "limit_h": 10},
    {"file": "research/norms/patapsco50k_2026.txt", "race": "a past 50K", "year": 2026, "field": "run50k", "km": 54.7, "gain_m": 1468, "limit_h": 10},
    {"file": "research/norms/grindstone50k_2025.txt", "race": "the fall 100K 50K", "year": 2025, "field": "run50k", "km": 50, "gain_m": 1530, "limit_h": None},
    {"file": "research/norms/grindstone100k_2023.txt", "race": "the fall 100K", "year": 2023, "field": "run100k", "km": 100, "gain_m": 3350, "limit_h": 18},
    {"file": "research/norms/grindstone100k_2024.txt", "race": "the fall 100K", "year": 2024, "field": "run100k", "km": 100, "gain_m": 3350, "limit_h": 18},
    {"file": "research/norms/grindstone100k_2025.txt", "race": "the fall 100K", "year": 2025, "field": "run100k", "km": 100, "gain_m": 3350, "limit_h": 18},
    {"file": "research/norms/grindstone100k_2026.txt", "race": "the fall 100K", "year": 2026, "field": "run100k", "km": 100, "gain_m": 3350, "limit_h": 18},
]
# Course notes: a past 50K 54.7 km and 1,468 m are the 2026 course as measured by GPS (the listing's figures disagree with each other);
# the fall 100K 100 km and 3,350 m are the UTMB race page's; the fall 100K 50K 50 km and 1,530 m (5,020 ft) UltraRunning's course page. Some later finishers ran past 18 h in 2024 to 2026 (the listed limit
# is the 2026 race watch's figure): they stay in, as finishers.
SIMILAR = (0.6, 1.6)  # climbing per km of a pooled course, as a share of the person's own course
MIN_N = 40            # smaller groups are not filed
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
    return course["km"] + course["gain_m"] / 100.0


def similar(field, course=None):
    """The courses of one field pooled for a person whose race course is `course` ({km, gain_m}), or all of them without one."""
    cs = [c for c in COURSES if c["field"] == field]
    if not course or not course.get("km") or course.get("gain_m") is None:
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


def _row(field, label, paces, courses, sex=None, band=None):
    who = "all finishers" if not sex else f"{'men' if sex == 'male' else 'women'}" + (f" {band.replace('-', ' to ')}" if band else "")
    names = sorted({c["race"] for c in courses})
    years = sorted({c["year"] for c in courses})
    r = {"kind": "norm", "key": "trailspeed", "unit": "min/effort km", "better": -1, "tail": "log", "compare": field,
         "compare_label": f"{label} on similar courses", "derived": "race_rows", "n": len(paces),
         "population": f"{who}, {', '.join(names)} ({years[0]}{'' if len(years) == 1 else ' to ' + str(years[-1])})",
         "short": f"{who}, {label.split(' ')[0]} courses like yours",
         "source": f"Finisher times ({len(paces)}) as minutes per ITRA effort km",
         "url": "https://statistik.d-u-v.org/", "date": str(years[-1]),
         "breakpoints": [[round(_quantile(paces, p / 100), 3), round(p, 2)] for p in FRONT],
         "note": "Your easy pace against their whole race pace, stops and fade included."}
    if sex:
        r["sex"] = sex
    if band:
        r["age_band"] = band
    return r


def rows_for(field, label, course=None, root=ROOT):
    cs = [c for c in similar(field, course) if os.path.exists(os.path.join(root, c["file"]))]
    pts = [(m / effort_km(c), sx, b) for c in cs for m, sx, b in finishers(c, root)]
    if len(pts) < MIN_N:
        return []
    out = [_row(field, label, [p for p, _s, _b in pts], cs)]
    for sx in ("male", "female"):
        mine = [p for p, s, _b in pts if s == sx]
        if len(mine) >= MIN_N:
            out.append(_row(field, label, mine, cs, sx))
        for band in sorted({b for _p, s, b in pts if s == sx and b}):
            grp = [p for p, s, b in pts if s == sx and b == band]
            if len(grp) >= MIN_N:
                out.append(_row(field, label, grp, cs, sx, band))
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
    if not COURSES:
        return keep
    mine = own_courses(root)
    new = []
    for fid in sorted({c["field"] for c in COURSES}):
        new += rows_for(fid, fields.get(fid, fid), mine.get(fid), root)
    return keep + new


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    for r in build([]):
        mid = next(v for v, p in r["breakpoints"] if p == 50)
        print(f"{r['compare']:8} {r['population'][:70]:70} n={r['n']:4}  median {int(mid)}:{round(mid % 1 * 60):02d} /effort km")
