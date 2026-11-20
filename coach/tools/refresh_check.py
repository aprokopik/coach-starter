"""Daytime refresh check (roadmap week 4; the athlete chose "Every 2 hours, 9 AM to 9 PM" on the card, Nov 11, 2026).

A scheduled task (coach/ops/TASK-PROMPT-refresh.md) starts a Garmin pull every 2 hours from 9 AM to 9 PM and
republishes the dashboard only when the pull brought an activity the dashboard has not shown yet. This tool keeps the
record of what was last published, in coach/refresh.json, so a run with nothing new stops at once and commits nothing.

    python3 coach/tools/refresh_check.py check      exit 0 and print the new activity ids, or exit 1 "nothing new"
    python3 coach/tools/refresh_check.py mark --by "<who>"
                                                    record that the dashboard now shows every activity on main
    python3 coach/tools/refresh_check.py missed --steps store,board,publish --by "<who>"
                                                    the 7:45 run records the steps a blocked or failed tool call made it skip
    python3 coach/tools/refresh_check.py catchup    exit 0 and print today's missed steps, or exit 1 "nothing to catch up"
    python3 coach/tools/refresh_check.py caught --steps store,publish
                                                    a later run records the steps it caught up (all done clears the record)

Catch up (6.157.0; the athlete, Nov 20, 2026, "Build it"): on Nov 20 one blocked dashboard read made the 7:45 run skip the
store copy, the Project Board and the publish, and the gap waited for the next morning. Now the morning run writes what
it skipped and the first daytime refresh (9:41 AM) does it. A record from an earlier day is never caught up here: the
next 7:45 run does those steps anyway.

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


STEPS = ("store", "board", "publish")


def _steps(text):
    out = []
    for part in (text or "").split(","):
        part = part.strip().lower()
        if not part:
            continue
        if part not in STEPS:
            raise SystemExit("unknown step %r (use %s)" % (part, ", ".join(STEPS)))
        if part not in out:
            out.append(part)
    return out


def _save(root, rec):
    with open(os.path.join(root, REL), "w") as fh:
        json.dump(rec, fh, indent=1)
        fh.write("\n")


def missed(root=".", steps=(), by="", now=None):
    now = now or datetime.now(timezone.utc)
    rec = load(root)
    rec["catchup"] = {"date": local_date(now), "steps": list(steps), "by": by,
                      "at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
    _save(root, rec)
    return rec


def local_date(now):
    """The athlete's date (America/New_York), so a 7:45 AM record and a 9:41 AM refresh share a day."""
    try:
        from zoneinfo import ZoneInfo
        return now.astimezone(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
    except Exception:  # no tz database: UTC minus 5 h is close enough for a same-morning match
        from datetime import timedelta
        return (now - timedelta(hours=5)).strftime("%Y-%m-%d")


def pending(root=".", now=None):
    c = load(root).get("catchup") or {}
    if not c.get("steps") or c.get("date") != local_date(now or datetime.now(timezone.utc)):
        return []
    return list(c["steps"])


def caught(root=".", steps=(), now=None):
    rec = load(root)
    c = rec.get("catchup") or {}
    left = [s for s in c.get("steps", []) if s not in steps]
    if left:
        c["steps"] = left
        rec["catchup"] = c
    else:
        rec.pop("catchup", None)
    _save(root, rec)
    return left


def main(argv, root="."):
    ap = argparse.ArgumentParser(prog="refresh_check.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    m = sub.add_parser("mark")
    m.add_argument("--by", default="")
    ms = sub.add_parser("missed")
    ms.add_argument("--steps", required=True)
    ms.add_argument("--by", default="")
    sub.add_parser("catchup")
    cg = sub.add_parser("caught")
    cg.add_argument("--steps", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "missed":
        missed(root, _steps(a.steps), a.by)
        print("recorded: " + ",".join(_steps(a.steps)))
        return 0
    if a.cmd == "catchup":
        steps = pending(root)
        print(("catch up: " + ",".join(steps)) if steps else "nothing to catch up")
        return 0 if steps else 1
    if a.cmd == "caught":
        left = caught(root, _steps(a.steps))
        print(("still missed: " + ",".join(left)) if left else "caught up")
        return 0
    if a.cmd == "check":
        ids = new_ids(root)
        print(("new: " + " ".join(ids)) if ids else "nothing new")
        return 0 if ids else 1
    mark(root, a.by)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
