"""Weekly summary rows for connected projects (roadmap week 3, One contract; 6.12.0).

A project the athlete has connected (coach/connections.json, which only the original athlete's repo has: the
kit never ships it) may read the coach's dataset, coach/dashboard/coach.json. The rows and fields each one may
rely on are written down in coach/ops/contract.json, and coach/tests/test_contract.py fails the build when one
goes missing. This tool writes the `summary` row a Sunday review reads: one row per Monday to Sunday week.

    week_ending      the Sunday that ends the week (YYYY-MM-DD)
    week_start       its Monday
    partial          true while the week is still running (the Sunday run writes it in the morning)
    readiness        1 to 5: the mean of the week's morning calls in coach/predictions.csv (GREEN 5, YELLOW 3,
                     RED 1), rounded; null when no morning was scored
    readiness_word   1 poor, 2 weak, 3 fair, 4 good, 5 strong
    mornings         how many morning calls the readiness is built on
    pain_flag        "yes" when a morning in the week had pain at hurts or stop (3 or more), or pain above none on
                     3 or more mornings (the persistent niggle rule, RULES 4); else "no". Never a site or a value
    markers_watch    names of the health and fitness markers marked watch or act (names only, never values)
    hours_7d         training hours in the week, walks and sauna left out (Garmin activities.csv)
    next_race        the next registered or planned race: "name, YYYY-MM-DD"
    coach_commitments  how many commitments the coach set on that Sunday (coach/commitments.csv)

Nothing here is a heart rate, sleep, weight, HRV, injury detail or marker value. Every number is Calculated.

    python3 coach/tools/summary.py --date 2026-11-15   # print the rows a build on that date would write
"""
import argparse
import csv
import json
import os
from datetime import date, datetime, timedelta

CONNECTIONS = "coach/connections.json"
CALL = {"GREEN": 5, "YELLOW": 3, "RED": 1}
WORD = {1: "poor", 2: "weak", 3: "fair", 4: "good", 5: "strong"}
FIRST_WEEK = date(2026, 10, 19)  # the first morning the coach scored
WEEKS = 13  # a quarter, for a quarterly review


def _csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as fh:
        return json.load(fh)


def _day(s):
    try:
        return datetime.strptime(str(s).strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def connected(kind, root="."):
    """True when a connected project reads rows of this kind. No connections file means no outside readers."""
    c = _json(os.path.join(root, CONNECTIONS), {})
    return any(kind in (p.get("reads") or []) for p in (c.get("projects") or {}).values())


def coach_commitment_cap(root="."):
    """At most 2 when a Mentor project shares the weekly cap of 3, else 3 (the athlete, Nov 11, 2026; RULES 8F)."""
    c = _json(os.path.join(root, CONNECTIONS), {})
    return 2 if (c.get("projects") or {}).get("Mentor", {}).get("shares_commitment_cap") else 3


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def week(sunday, today, rows, root="."):
    mon = sunday - timedelta(days=6)
    end = min(sunday, today)
    days = lambda s: (lambda d: d is not None and mon <= d <= end)(_day(s))  # noqa: E731

    calls = [CALL[r["readiness"].strip().upper()] for r in _csv(os.path.join(root, "coach/predictions.csv"))
             if days(r.get("date")) and (r.get("readiness") or "").strip().upper() in CALL]
    readiness = round(sum(calls) / len(calls)) if calls else None

    pains = [_num(r.get("pain")) for r in _csv(os.path.join(root, "coach/feel_daily.csv")) if days(r.get("date"))]
    pains = [p for p in pains if p is not None]
    pain_flag = "yes" if any(p >= 3 for p in pains) or sum(1 for p in pains if p >= 1) >= 3 else "no"

    mins = 0.0
    for a in _csv(os.path.join(root, "data/activities.csv")):
        if not days(a.get("local_start")):
            continue
        kind, name = (a.get("type") or "").lower(), (a.get("name") or "").lower()
        if "walk" in kind or "sauna" in name:
            continue
        mins += _num(a.get("duration_min")) or 0

    watch = [m.get("label") or m.get("key") for m in rows
             if m.get("kind") == "marker" and m.get("status") in ("watch", "act")]

    races = [r for r in _json(os.path.join(root, "coach/races.json"), {"rows": []}).get("rows", [])
             if r.get("kind") == "race" and r.get("status") in ("registered", "planned")
             and _day(r.get("date")) and _day(r.get("date")) >= end]
    races.sort(key=lambda r: r["date"])
    nxt = f"{races[0].get('name')}, {races[0]['date']}" if races else ""

    set_on = sunday.isoformat()
    commits = sum(1 for c in _csv(os.path.join(root, "coach/commitments.csv"))
                  if (c.get("set_on") or "").strip() == set_on and (c.get("owner") or "coach").strip().lower() == "coach")

    return {
        "kind": "summary",
        "week_ending": set_on,
        "week_start": mon.isoformat(),
        "partial": today <= sunday,
        "readiness": readiness,
        "readiness_word": WORD.get(readiness, ""),
        "mornings": len(calls),
        "pain_flag": pain_flag,
        "markers_watch": watch,
        "hours_7d": round(mins / 60, 1),
        "next_race": nxt,
        "coach_commitments": commits,
    }


def build(today, rows, root="."):
    """Summary rows for the last WEEKS Sundays up to today (today itself when it is a Sunday). Empty unless a
    connected project reads `summary`."""
    if not connected("summary", root):
        return []
    last = today - timedelta(days=(today.weekday() + 1) % 7)  # the latest Sunday on or before today
    first = FIRST_WEEK + timedelta(days=6)
    out, s = [], last
    while s >= first and len(out) < WEEKS:
        out.append(week(s, today, rows, root))
        s -= timedelta(days=7)
    return list(reversed(out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date", help="build as of this date (default today, America/New_York)")
    a = ap.parse_args()
    from zoneinfo import ZoneInfo
    d = _day(a.date) if a.date else datetime.now(ZoneInfo("America/New_York")).date()
    cj = _json("coach/dashboard/coach.json", {"rows": []}).get("rows", [])
    for r in build(d, cj):
        print(json.dumps(r))
