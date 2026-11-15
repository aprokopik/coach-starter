"""Watch the scheduled tasks outside the coach that it feeds or depends on (roadmap priority 3, Closed loops; the athlete's pick on the
Sprint Review page, option 1 of five, Nov 15, 2026: "Daily line in the 7:45 check-in").

The coach's heartbeat (heartbeat.py) dates files in the repo, so a task that writes nothing here, or lives in another project,
can stop and nobody hears (found Nov 15, 2026: the Architect weekly scan had no recorded run since it was set up again Nov 9).
The scheduled task record already carries the schedule, on or off, why it was switched off, and its last run, so this tool
compares them.

The watch list is `watch` in coach/ops/data_paths.json (one home): each entry {id, name, grace_hours, why}.

Privacy (the athlete's projects share one account): a task record carries that task's own instructions, and other projects' are
private. The morning run reads ONLY the watched tasks, one by one by id (get_trigger), never the whole list, and this tool keeps
only id, name, schedule, on or off, the off reason, created, next run and the last run's time and status. `clean()` is that
filter; the morning run saves its output, never the raw records.

Usage (from the repo root):
  python3 coach/tools/task_watch.py clean <raw.json> > /tmp/tasks.json   keep the safe fields of each record read
  python3 coach/tools/task_watch.py check /tmp/tasks.json [--now <ISO>]   one JSON line per watched task: ok, late, failed, off, unread
  python3 coach/tools/task_watch.py line /tmp/tasks.json [--now <ISO>]    the check-in clause; prints nothing when all is well
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PATHS = "coach/ops/data_paths.json"
KEEP = ("id", "name", "cron_expression", "enabled", "suspension_reason", "ended_reason", "created_at", "next_run_at")
RUN_KEEP = ("status", "fired_at")
DEFAULT_GRACE_H = 3


def watch_list(path=PATHS):
    with open(path) as fh:
        return json.load(fh).get("watch", {}).get("tasks", [])


def clean(raw):
    """The safe fields of each task record: never its prompt, folders, connections or anything else."""
    if isinstance(raw, dict):
        raw = raw.get("triggers") or raw.get("tasks") or raw.get("items") or ([raw] if raw.get("id") or raw.get("trigger") else [])
    out = []
    for t in raw or []:
        if isinstance(t, dict) and isinstance(t.get("trigger"), dict):
            t = t["trigger"]  # get_trigger wraps its record
        if not isinstance(t, dict) or not str(t.get("id", "")).startswith("trig_"):
            continue
        c = {k: t[k] for k in KEEP if k in t}
        lr = t.get("last_run")
        if isinstance(lr, dict):
            c["last_run"] = {k: lr[k] for k in RUN_KEEP if k in lr}
        out.append(c)
    return out


# ---------- cron: "CRON_TZ=<zone> m h dom mon dow", lists, ranges, steps and * ----------
def _field(spec, lo, hi):
    vals = set()
    for part in spec.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/")
            step = int(s)
        if part == "*":
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-"))
        else:
            a = int(part)
            b = hi if step > 1 else a
        vals.update(range(a, b + 1, step))
    return vals


def parse_cron(expr):
    tz = "UTC"
    parts = expr.split()
    if parts and parts[0].startswith("CRON_TZ="):
        tz = parts[0].split("=", 1)[1]
        parts = parts[1:]
    m, h, dom, mon, dow = parts
    dows = {d % 7 for d in _field(dow, 0, 7)}  # 7 is Sunday too
    return {"tz": ZoneInfo(tz), "min": sorted(_field(m, 0, 59)), "hour": sorted(_field(h, 0, 23)),
            "dom": _field(dom, 1, 31), "mon": _field(mon, 1, 12), "dow": dows, "dom_any": dom == "*", "dow_any": dow == "*"}


def _day_ok(c, d):
    if d.month not in c["mon"]:
        return False
    dm, dw = d.day in c["dom"], (d.isoweekday() % 7) in c["dow"]
    if c["dom_any"] and c["dow_any"]:
        return True
    if c["dom_any"]:
        return dw
    if c["dow_any"]:
        return dm
    return dm or dw  # cron: both restricted means either


def last_due(expr, now):
    """The latest scheduled time at or before `now` (aware datetime), in UTC; None if none within 400 days."""
    c = parse_cron(expr)
    local = now.astimezone(c["tz"])
    for back in range(0, 400):
        d = (local - timedelta(days=back)).date()
        if not _day_ok(c, d):
            continue
        for hh in reversed(c["hour"]):
            for mm in reversed(c["min"]):
                t = datetime(d.year, d.month, d.day, hh, mm, tzinfo=c["tz"])
                if t <= local:
                    return t.astimezone(timezone.utc)
    return None


def _ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def check(tasks, watch, now):
    by_id = {t.get("id"): t for t in tasks}
    out = []
    for w in watch:
        t = by_id.get(w["id"])
        name = (t or {}).get("name") or w.get("name") or w["id"]
        row = {"id": w["id"], "name": name, "state": "ok", "detail": ""}
        if t is None:
            row.update(state="unread", detail="could not be read (deleted, or the read failed)")
        elif t.get("enabled") is False or t.get("suspension_reason") or t.get("ended_reason"):
            why = t.get("suspension_reason") or t.get("ended_reason") or "switched off"
            row.update(state="off", detail=str(why).replace("_", " ").lower())
        else:
            lr = t.get("last_run") or {}
            fired, status = _ts(lr.get("fired_at")), str(lr.get("status") or "")
            due = last_due(t["cron_expression"], now) if t.get("cron_expression") else None
            grace = timedelta(hours=float(w.get("grace_hours", DEFAULT_GRACE_H)))
            created = _ts(t.get("created_at"))
            owed = due is not None and now - due > grace and not (created and created > due)
            if owed and (fired is None or fired < due - timedelta(minutes=5)):
                row.update(state="late", detail=f"due {_when(due)}, " + (f"last ran {_when(fired)}" if fired else "no run on record"))
            elif fired and ("FAIL" in status.upper() or "ERROR" in status.upper()):
                row.update(state="failed", detail=f"last run {_when(fired)} did not finish")
            row["last_due"] = due.strftime("%Y-%m-%dT%H:%MZ") if due else ""
            row["last_run"] = fired.strftime("%Y-%m-%dT%H:%MZ") if fired else ""
        out.append(row)
    return out


def _when(t):
    lt = t.astimezone(ZoneInfo("America/New_York"))
    return lt.strftime("%a %b %-d %-I:%M %p").replace(":00 ", " ")


ADVICE = {"late": "open it and run it once", "failed": "open its last run", "off": "if on purpose, say so and I drop it from the watch",
          "unread": "check it still exists"}


def line(rows):
    bad = [r for r in rows if r["state"] != "ok"]
    if not bad:
        return ""
    return "Outside tasks: " + "; ".join(f"{r['name']} {r['state']} ({r['detail']}; {ADVICE[r['state']]})" for r in bad) + "."


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, f = argv[0], argv[1]
    now = _ts(argv[argv.index("--now") + 1]) if "--now" in argv else datetime.now(timezone.utc)
    raw = json.load(open(f))
    if cmd == "clean":
        print(json.dumps(clean(raw), indent=1))
        return 0
    rows = check(clean(raw), watch_list(), now)
    if cmd == "check":
        for r in rows:
            print(json.dumps(r))
        return 0
    if cmd == "line":
        s = line(rows)
        if s:
            print(s)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
