#!/usr/bin/env python3
"""Age grade for road running times (epic Compare with anyone, alpha `age_grade`; the athlete kept "Age grade on every timed tile" on
the Truer numbers page, Nov 16, 2026, (link not included in the kit)).

One percentage that compares a run time with anyone, any age or sex: the age-and-sex world standard for the distance divided
by the time. 100% is the world standard for your age; about 60% is a local club runner, 50% half the standard's speed.
Standards: the 2025 road tables (USATF Masters Long Distance Running Council, approved Jan 10, 2025; CC0), filed in
coach/age_grade.json, the only home of the numbers.

    python3 coach/tools/age_grade.py <male|female> <age> <mile|5k|10k|half|marathon> <mm:ss or h:mm:ss>

Standard library only.
"""
import json
import os
import sys

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "age_grade.json")
KEYS = ("mile", "5k", "10k", "half", "marathon")
SOURCE = "2025 USATF road tables"
_T = None


def table():
    global _T
    if _T is None:
        with open(FILE, encoding="utf-8") as fh:
            _T = json.load(fh)
    return _T


def standard(sex, age, key):
    """The age-and-sex world standard in seconds, or None when sex, age or distance is unknown."""
    if key not in KEYS or sex not in ("male", "female") or age is None:
        return None
    t = table()["rows"][sex]
    ages = sorted(int(a) for a in t["factor"])
    a = min(max(int(age), ages[0]), ages[-1])
    f = t["factor"][str(a)][KEYS.index(key)]
    return t["open_sec"][key] / f if f else None


def grade(sex, age, key, seconds):
    """Age-graded percentage (one decimal), or None."""
    std = standard(sex, age, key)
    if not std or not seconds or seconds <= 0:
        return None
    return round(std / seconds * 100, 1)


CLASSES = ((90, "world class"), (80, "national class"), (70, "regional class"), (60, "local class"), (0, "recreational"))


def words(pct):
    """'51% age-graded (recreational)' style words for a tile."""
    return f"{pct:.0f}% age-graded ({next(w for lo, w in CLASSES if pct >= lo)})"


def _secs(s):
    parts = [float(p) for p in s.split(":")]
    return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    sex, age, key, t = sys.argv[1:]
    g = grade(sex, int(age), key, _secs(t))
    print(words(g) if g else "unknown")
