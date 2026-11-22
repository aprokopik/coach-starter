"""Corrections the athlete reports for a watch activity (6.167.0; the athlete, Nov 21, 2026: "i started my lift on garmin
late add about 7 min when synced").

Why: data/activities.csv is rebuilt by every Garmin pull (upsert on activity_id), so a hand edit to a row is undone
by the next pull, and there was no other place to say "this session really ran longer". Every reader (weekly hours,
the morning facts, the dashboard's activities dataset) reads activities.csv, so the fix is applied there, on every
write, from one file:

  coach/activity_fixes.csv   activity_id, field, garmin, corrected, why, reported_at

`garmin` keeps the watch value and `corrected` the value in use (RULES 11: keep original and corrected values, why
it changed, and which is current). The raw pull in data/activities/<id>.json is never touched. Applying is
idempotent: a row whose field already holds `corrected` is left alone.

    python3 coach/tools/activity_fix.py add 25150000000 --add-min 7 --why "started the watch late"
    python3 coach/tools/activity_fix.py add 2026-11-21:strength --add-min 7 --why "..."   # the day's one lift
    python3 coach/tools/activity_fix.py apply        # re-apply every fix to data/activities.csv
    python3 coach/tools/activity_fix.py list

`--add-min` moves duration_min and elapsed_min together (a late start or an early stop); moving_min is left as the
watch measured it. Labelled Reported wherever it matters.
"""
import argparse
import csv
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FIXES = os.path.join("coach", "activity_fixes.csv")
ACTS = os.path.join("data", "activities.csv")
FIELDS = ["activity_id", "field", "garmin", "corrected", "why", "reported_at"]
MINUTE_FIELDS = ("duration_min", "elapsed_min")


def _read(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def load(root=ROOT):
    """{activity_id: {field: corrected}}, the last row of an (id, field) pair wins."""
    out = {}
    for r in _read(os.path.join(root, FIXES)):
        if r.get("activity_id") and r.get("field") and r.get("corrected") not in (None, ""):
            out.setdefault(str(r["activity_id"]), {})[r["field"]] = r["corrected"]
    return out


def apply_rows(rows, fixes):
    """Set each fixed field on the rows (dicts keyed by activity_id). Returns how many values changed."""
    n = 0
    for row in rows:
        for field, val in fixes.get(str(row.get("activity_id")), {}).items():
            if field in row and str(row[field]) != str(val):
                row[field] = val
                n += 1
    return n


def apply_file(root=ROOT):
    path = os.path.join(root, ACTS)
    if not os.path.exists(path):
        return 0
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        fields, rows = reader.fieldnames, list(reader)
    n = apply_rows(rows, load(root))
    if n:
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
    return n


def find(rows, target):
    if ":" not in target:
        return [r for r in rows if r["activity_id"] == target]
    day, typ = target.split(":", 1)
    return [r for r in rows if (r.get("local_start") or "")[:10] == day and r.get("type") == typ]


def add(target, add_min, why, root=ROOT):
    rows = _read(os.path.join(root, ACTS))
    hits = find(rows, target)
    if len(hits) != 1:
        print(f"{target}: {len(hits)} activities match; give the activity_id", file=sys.stderr)
        return 1
    row, done = hits[0], load(root).get(hits[0]["activity_id"], {})
    if any(f in done for f in MINUTE_FIELDS):
        print(f"{row['activity_id']} already has a minutes fix; add a newer row by hand if it changed", file=sys.stderr)
        return 1
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    path = os.path.join(root, FIXES)
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if new:
            w.writeheader()
        for field in MINUTE_FIELDS:
            g = float(row[field])
            w.writerow({"activity_id": row["activity_id"], "field": field, "garmin": row[field],
                        "corrected": round(g + add_min, 2), "why": why, "reported_at": now})
    n = apply_file(root)
    print(f"{row['activity_id']} {row['local_start']} {row['type']}: {row['duration_min']} -> "
          f"{round(float(row['duration_min']) + add_min, 2)} min ({n} values set)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("target", help="activity_id, or DATE:type when that day has exactly one such activity")
    a.add_argument("--add-min", type=float, required=True)
    a.add_argument("--why", required=True)
    sub.add_parser("apply")
    sub.add_parser("list")
    args = ap.parse_args(argv)
    if args.cmd == "add":
        return add(args.target, args.add_min, args.why)
    if args.cmd == "apply":
        print(f"{apply_file()} values set")
        return 0
    for r in _read(os.path.join(ROOT, FIXES)):
        print(f"{r['activity_id']} {r['field']}: {r['garmin']} -> {r['corrected']} ({r['why']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
