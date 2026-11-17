#!/usr/bin/env python3
"""Elite (stage 3) scales from record tables (the athlete picked "Swim, bike and VO2", Nov 16, 2026).

The bands are a share of the record speed for the athlete's own age group and sex, the way age grade reads the run tiles:
100% is record pace, then within 10%, within 20%, and further. Records come from coach/elite_records.json (US Masters
Swimming short course yard freestyle records, USA Cycling masters road time trial records). A distance with no record of
its own is read off the nearest filed ones (power law between them), so it is Estimated.

Standard library only.
"""
import json
import math
import os

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "elite_records.json")
BIKE_EXP = 1.05  # time grows a little faster than distance in a time trial (coach estimate between filed distances)
CLASSES = (("Record pace", 100, None), ("Within 10% of record", 90, 100), ("Within 20% of record", 80, 90), ("Over 20% off record", None, 80))


def _doc():
    try:
        with open(FILE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def band(age):
    if age is None:
        return None
    lo = 18 if age < 25 else int(age) // 5 * 5
    return f"{lo}-{lo + 4}" if lo >= 25 else "18-24"


def swim_record(sex, age, yards):
    """Record time in seconds for a freestyle swim of this many yards, or None."""
    sw = _doc().get("swim", {})
    row = (sw.get(sex) or {}).get(band(age) or "")
    if not row:
        return None
    pts = list(zip(sw["yards"], row))
    if yards <= pts[0][0]:
        (d1, t1), (d2, t2) = pts[0], pts[1]
    elif yards >= pts[-1][0]:
        (d1, t1), (d2, t2) = pts[-2], pts[-1]
    else:
        i = next(i for i, (d, _t) in enumerate(pts) if d >= yards)
        (d1, t1), (d2, t2) = pts[i - 1], pts[i]
    k = math.log(t2 / t1) / math.log(d2 / d1)
    return t1 * (yards / d1) ** k


def bike_record(sex, age, km):
    """Record time in seconds for a time trial of this many km, or None."""
    bk = _doc().get("bike", {})
    row = (bk.get(sex) or {}).get(band(age) or "")
    if not row:
        return None
    d, t = row
    return t * (km / d) ** BIKE_EXP


def tiers(record_s, fmt):
    """Category bands in minutes, fastest first: (label, faster bound, slower bound, words)."""
    r = record_s / 60
    at = lambda pc: round(r / (pc / 100), 3)
    out = []
    for l, lo, hi in CLASSES:
        if hi is None:
            w = f"{fmt(at(lo))} or faster"
        elif lo is None:
            w = f"slower than {fmt(at(hi))}"
        else:
            w = f"{fmt(at(hi))} to {fmt(at(lo))}"
        out.append((l, None if hi is None else at(hi), None if lo is None else at(lo), w))
    return out


def source(kind):
    d = _doc().get(kind, {})
    return d.get("source", ""), d.get("url", "")
