"""Morning run steps record (6.28.0; Architect review item 7, the athlete chose "Yes, start now" on Nov 12, 2026).

The morning run lists the RUNBOOK step ids it did, so a step skipped quietly is seen the next morning instead of never.
The checklist is coach/ops/steps.json; the record is coach/run_steps.json (the last 14 runs, newest last).

    python3 coach/tools/steps.py record --date YYYY-MM-DD --done data-2,data-3,... [--skipped coach-2e:"no block within 14 days"]
    python3 coach/tools/steps.py check [--date YYYY-MM-DD]     the required steps the run of that date (default: the latest
                                                               record) neither did nor skipped with a reason; exit 1 if any
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timezone

SPEC = "coach/ops/steps.json"
REC = "coach/run_steps.json"
KEEP = 14


def _read(root, rel, default):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        return default
    with open(p) as fh:
        return json.load(fh)


def required(day, root="."):
    """Step ids the run of `day` must account for."""
    spec = _read(root, SPEC, {"steps": []})
    board = os.path.exists(os.path.join(root, "coach/board.json"))
    cal = os.path.exists(os.path.join(root, "coach/trips_seen.json"))
    out = []
    for s in spec.get("steps", []):
        if str(s.get("since") or "") > day.isoformat():
            continue  # a step added after this run was not owed by it (Nov 15, 2026 dry run: coach-3f flagged on the Nov 13 run)
        w = s.get("when", "daily")
        if w == "daily" or (w == "sunday" and day.weekday() == 6) or (w == "board" and board) or (w == "calendar" and cal):
            out.append(s["id"])
    return out


def records(root="."):
    return _read(root, REC, {}).get("runs", [])


def record(day, done, skipped, root=".", now=None):
    known = {s["id"] for s in _read(root, SPEC, {"steps": []}).get("steps", [])}
    unknown = [i for i in list(done) + list(skipped) if i not in known]
    if unknown:
        raise ValueError(f"unknown step ids: {', '.join(unknown)} (see {SPEC})")
    rec = _read(root, REC, {})
    runs = [r for r in rec.get("runs", []) if r.get("date") != day.isoformat()]
    runs.append({"date": day.isoformat(), "recorded_at_utc": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "done": sorted(set(done)), "skipped": dict(sorted(skipped.items()))})
    rec["runs"] = runs[-KEEP:]
    rec.setdefault("note", "Morning run steps record (coach/tools/steps.py): the RUNBOOK step ids each run did or skipped with a "
                           "reason; the next morning flags the gaps. Checklist: coach/ops/steps.json.")
    with open(os.path.join(root, REC), "w") as fh:
        json.dump(rec, fh, indent=1)
        fh.write("\n")
    return rec


def gaps(day=None, root="."):
    """(run date, missing ids) for the run of `day`, or the latest run; (None, []) when there is no record yet."""
    runs = records(root)
    if not runs:
        return None, []
    run = next((r for r in runs if r["date"] == day.isoformat()), None) if day else runs[-1]
    if run is None:
        return None, []
    seen = set(run.get("done", [])) | set((run.get("skipped") or {}).keys())
    return run["date"], [i for i in required(date.fromisoformat(run["date"]), root) if i not in seen]


def section(today, root="."):
    """For facts.json: the latest run before today and the required steps it did not account for."""
    runs = [r for r in records(root) if r["date"] < today.isoformat()]
    if not runs:
        return {"last_run": None, "missing": [], "provenance": f"{REC}; no record yet"}
    run = runs[-1]
    _, missing = gaps(date.fromisoformat(run["date"]), root)
    spec = {s["id"]: s["what"] for s in _read(root, SPEC, {"steps": []}).get("steps", [])}
    return {"last_run": run["date"], "missing": [{"id": i, "what": spec.get(i, i)} for i in missing],
            "skipped": run.get("skipped") or {}, "provenance": f"{REC} against {SPEC}; Calculated"}


def main(argv, root="."):
    ap = argparse.ArgumentParser(prog="steps.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("--date", required=True)
    r.add_argument("--done", default="")
    r.add_argument("--skipped", action="append", default=[], help='id:reason, repeatable')
    c = sub.add_parser("check")
    c.add_argument("--date")
    a = ap.parse_args(argv)
    if a.cmd == "record":
        skipped = {}
        for item in a.skipped:
            sid, _, why = item.partition(":")
            if not why.strip():
                print(f"skipped {sid!r} needs a reason (id:reason)")
                return 2
            skipped[sid.strip()] = why.strip()
        done = [x.strip() for x in a.done.split(",") if x.strip()]
        try:
            record(date.fromisoformat(a.date), done, skipped, root)
        except ValueError as e:
            print(e)
            return 2
        _, missing = gaps(date.fromisoformat(a.date), root)
        print("ok" if not missing else "recorded; not accounted for: " + ", ".join(missing))
        return 0
    run_date, missing = gaps(date.fromisoformat(a.date) if a.date else None, root)
    if run_date is None:
        print("no record")
        return 0
    print(f"{run_date}: " + ("all required steps accounted for" if not missing else "missing " + ", ".join(missing)))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
