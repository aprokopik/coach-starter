"""Daytime refresh check (roadmap week 4; the athlete chose "Every 2 hours, 9 AM to 9 PM" on the card, Nov 11, 2026).

A scheduled task (coach/ops/TASK-PROMPT-refresh.md) starts a Garmin pull every 2 hours from 9 AM to 9 PM and
republishes the dashboard only when the pull brought an activity the dashboard has not shown yet. This tool keeps the
record of what was last published, in coach/refresh.json, so a run with nothing new stops at once and commits nothing.

    python3 coach/tools/refresh_check.py check      exit 0 and print the new activity ids, or exit 1 "nothing new"
    python3 coach/tools/refresh_check.py mark --by "<who>"
                                                    record that the dashboard now shows every activity on main

Walks and sauna count too: any new row in data/activities.csv is something Today can show.
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime, timezone

REL = "coach/refresh.json"
ACTS = "data/activities.csv"
KEEP = 60


def activity_ids(root="."):
    p = os.path.join(root, ACTS)
    if not os.path.exists(p):
        return []
    with open(p, newline="") as fh:
        return [r["activity_id"] for r in csv.DictReader(fh) if r.get("activity_id")]


def load(root="."):
    p = os.path.join(root, REL)
    if not os.path.exists(p):
        return {}
    with open(p) as fh:
        return json.load(fh)


def new_ids(root="."):
    seen = set(load(root).get("published_ids", []))
    ids = activity_ids(root)
    if not seen:  # first run: only the newest counts, so the first refresh publishes once
        return ids[-1:]
    return [i for i in ids[-KEEP:] if i not in seen]


def mark(root=".", by="", now=None):
    rec = load(root)
    rec["published_ids"] = activity_ids(root)[-KEEP:]
    rec["published_at_utc"] = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rec["by"] = by
    rec.setdefault("note", "Daytime refresh record (coach/tools/refresh_check.py): activity ids the dashboard already shows. "
                           "Written by the refresh task and the 7:45 run after each publish.")
    with open(os.path.join(root, REL), "w") as fh:
        json.dump(rec, fh, indent=1)
        fh.write("\n")
    return rec


def main(argv, root="."):
    ap = argparse.ArgumentParser(prog="refresh_check.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    m = sub.add_parser("mark")
    m.add_argument("--by", default="")
    a = ap.parse_args(argv)
    if a.cmd == "check":
        ids = new_ids(root)
        print(("new: " + " ".join(ids)) if ids else "nothing new")
        return 0 if ids else 1
    mark(root, a.by)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
