"""GitHub hiccup log and escalation (the athlete, Nov 12, 2026: "keep a log of how this happened and escalate appropriately
when it reaches a certain threshold"; he chose "A: Three levels" on the card).

Why: on Nov 11 GitHub gave no job a machine for about 1 h 45 min. The 3:41 PM daytime refresh pull failed at start and
GitHub emailed the athlete; three runs from that window stayed queued for good. Timed pulls also run late or not at all.
Nothing in the coach or his account caused it, but nobody kept a record and nothing decided when to tell him.

The log is coach/hiccups.json. Two kinds of rows:
  incidents  GitHub stalls: a run that failed at start (startup_failure) or sat queued over 30 minutes. Runs within
             3 hours of each other are one incident. An incident stays open while any of its runs is still queued.
             These count toward the levels.
  timed      a timed pull (pull-garmin.yml cron) that started over 90 minutes late or never ran. Logged only: the
             daytime refresh and the 7:45 run cover for them, and a stale Today view is what raises them.

Levels (option A):
  1 log only   a single stall that cleared on its own
  2 tell       2 or more stalls in 7 days, or a finished activity not on Today after 12 hours:
               one line in the next 7:45 check-in (only when something is new since the last line)
  3 escalate   4 or more stalls in 7 days, or one stuck over 24 hours, or an activity not on Today after 24 hours:
               the check-in names it and links a drafted GitHub support ticket (coach/HICCUP-TICKET.md) for the athlete
               to send, and the run adds one dated line to coach/BACKLOG.md (system work) so a thread picks it up.
               Repeats at most once a week while it holds, or sooner when a new stall arrives.

The coach never contacts GitHub support itself. Runs come from the GitHub tool actions_list (method
list_workflow_runs, perPage 50) saved as JSON; the tool's answer and the REST answer have the same shape.

    python3 coach/tools/hiccups.py scan --runs runs.json        log what the runs show; prints what changed
    python3 coach/tools/hiccups.py precheck --runs runs.json    exit 0 GitHub is running jobs, 1 it is stuck (skip the pull)
    python3 coach/tools/hiccups.py status                       prints the level and the check-in line ("" when none)
    python3 coach/tools/hiccups.py ticket                       writes coach/HICCUP-TICKET.md
    python3 coach/tools/hiccups.py told                         record that the check-in carried the line
"""
import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refresh_check  # noqa: E402

REL = "coach/hiccups.json"
TICKET = "coach/HICCUP-TICKET.md"
WORKFLOW = ".github/workflows/pull-garmin.yml"
REPO = "https://github.com/{{GITHUB_OWNER}}/{{REPO}}"
LOG_LINK = f"{REPO}/blob/main/{REL}"
TICKET_LINK = f"{REPO}/blob/main/{TICKET}"
STUCK_MIN = 30          # queued this long counts as a stall
PRECHECK_MIN = 15       # queued this long, with nothing running since, means skip the pull
JOIN_H = 3              # stalls this close are one incident
LATE_MIN = 90           # a timed pull this late is logged
MISSED_H = 6            # no timed run this long after its slot: missed
WINDOW_D = 7
TELL_COUNT, ESC_COUNT = 2, 4
TELL_STALE_H, ESC_STALE_H = 12, 24
ESC_OPEN_H = 24
KEEP = 60
NO_MACHINE = ("startup_failure", "cancelled", "skipped")


def _t(s):
    return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc) if s else None


def _iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def _now(now):
    return now or datetime.now(timezone.utc)


def load(root="."):
    p = os.path.join(root, REL)
    if not os.path.exists(p):
        return {"incidents": [], "timed": []}
    with open(p) as fh:
        d = json.load(fh)
    d.setdefault("incidents", [])
    d.setdefault("timed", [])
    return d


def save(root, log):
    log.setdefault("note", "GitHub hiccup log (coach/tools/hiccups.py; the athlete chose three levels Nov 12, 2026). "
                           "incidents count toward the levels; timed rows are logged only.")
    log["incidents"] = log["incidents"][-KEEP:]
    log["timed"] = log["timed"][-KEEP:]
    with open(os.path.join(root, REL), "w") as fh:
        json.dump(log, fh, indent=1)
        fh.write("\n")


def runs_of(data):
    return data.get("workflow_runs", []) if isinstance(data, dict) else list(data)


# ---------- reading the runs ----------

def got_machine(r):
    return r.get("status") == "in_progress" or (r.get("status") == "completed" and r.get("conclusion") not in NO_MACHINE)


def bad_runs(runs, now):
    out = []
    for r in runs:
        c = _t(r.get("created_at"))
        if r.get("conclusion") == "startup_failure":
            out.append((c, r, "failed at start"))
        elif r.get("status") in ("queued", "waiting", "requested") and c and now - c >= timedelta(minutes=STUCK_MIN):
            out.append((c, r, "stuck in the queue"))
    return sorted(out, key=lambda x: x[0])


def is_stuck(runs, now):
    """GitHub is stuck when a run has waited PRECHECK_MIN in the queue and no run created after it got a machine.
    Old runs left queued forever (Nov 11) do not block: later runs that ran prove GitHub recovered."""
    queued = [r for r in runs if r.get("status") in ("queued", "waiting", "requested")
              and now - _t(r["created_at"]) >= timedelta(minutes=PRECHECK_MIN)]
    if not queued:
        return False
    newest_q = max(_t(r["created_at"]) for r in queued)
    ran = [_t(r["created_at"]) for r in runs if got_machine(r)]
    return not ran or max(ran) < newest_q


def cron_slots(root="."):
    p = os.path.join(root, WORKFLOW)
    if not os.path.exists(p):  # a system file: fall back to this checkout's copy
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", WORKFLOW)
    if not os.path.exists(p):
        return []
    slots = []
    for m in re.finditer(r'cron:\s*"(\d+)\s+(\d+)\s+\*\s+\*\s+\*"', open(p).read()):
        slots.append((int(m.group(2)), int(m.group(1))))
    return slots


def timed_rows(runs, now, root="."):
    sched = sorted(_t(r["created_at"]) for r in runs
                   if r.get("event") == "schedule" and "garmin" in (r.get("name") or "").lower())
    earliest = min((_t(r["created_at"]) for r in runs), default=now)
    rows = []
    for day in range(3):
        d = (now - timedelta(days=day)).date()
        for h, m in cron_slots(root):
            slot = datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)
            if slot < earliest or slot > now:
                continue
            nxt = [s for s in sched if slot <= s < slot + timedelta(hours=MISSED_H)]
            if nxt:
                late = int((nxt[0] - slot).total_seconds() // 60)
                if late >= LATE_MIN:
                    rows.append({"slot_utc": _iso(slot), "state": "late", "minutes_late": late})
            elif now - slot >= timedelta(hours=MISSED_H):
                rows.append({"slot_utc": _iso(slot), "state": "missed"})
    return rows


def scan(runs, root=".", now=None):
    now = _now(now)
    log = load(root)
    changes = []
    by_id = {r.get("id"): r for r in runs}
    for c, r, how in bad_runs(runs, now):
        rid = r.get("id")
        if any(rid in i["run_ids"] for i in log["incidents"]):
            continue
        near = [i for i in log["incidents"] if abs(c - _t(i["last_seen_utc"])) <= timedelta(hours=JOIN_H)
                or _t(i["start_utc"]) <= c <= _t(i["last_seen_utc"])]
        if near:
            inc = near[-1]
            inc["run_ids"].append(rid)
            inc["last_seen_utc"] = _iso(max(c, _t(inc["last_seen_utc"])))
            inc["start_utc"] = _iso(min(c, _t(inc["start_utc"])))
        else:
            inc = {"id": _iso(c), "kind": "stall", "start_utc": _iso(c), "last_seen_utc": _iso(c), "cleared_utc": None,
                   "run_ids": [rid], "what": []}
            log["incidents"].append(inc)
            changes.append(f"new incident {inc['id']}")
        inc["what"].append(f"{r.get('name')} ({r.get('event')}) {how}, run {rid}")
    for inc in log["incidents"]:
        if inc.get("cleared_utc"):
            continue
        still = [rid for rid in inc["run_ids"] if by_id.get(rid, {}).get("status") in ("queued", "waiting", "requested")]
        later_ran = [r for r in runs if got_machine(r) and _t(r["created_at"]) > _t(inc["last_seen_utc"])]
        if not still and later_ran:
            inc["cleared_utc"] = _iso(min(_t(r["created_at"]) for r in later_ran))
            changes.append(f"cleared {inc['id']}")
        elif still:
            inc["stuck_runs"] = still
    seen = {t["slot_utc"] for t in log["timed"]}
    for row in timed_rows(runs, now, root):
        if row["slot_utc"] not in seen:
            log["timed"].append(row)
            changes.append(f"timed pull {row['state']} {row['slot_utc']}")
    log["timed"].sort(key=lambda t: t["slot_utc"])
    log["last_scan_utc"] = _iso(now)
    save(root, log)
    return changes


# ---------- levels ----------

def stale_hours(root=".", now=None, tz="America/New_York"):
    """Hours since the oldest finished activity that the dashboard has not shown yet ended (0 when none)."""
    from zoneinfo import ZoneInfo
    now = _now(now)
    if not refresh_check.load(root).get("published_ids"):
        return 0.0
    waiting = set(refresh_check.new_ids(root))
    if not waiting:
        return 0.0
    p = os.path.join(root, refresh_check.ACTS)
    worst = 0.0
    with open(p, newline="") as fh:
        for r in csv.DictReader(fh):
            if r.get("activity_id") not in waiting or not r.get("local_start"):
                continue
            start = datetime.strptime(r["local_start"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo(tz))
            end = start + timedelta(minutes=float(r.get("elapsed_min") or r.get("duration_min") or 0))
            worst = max(worst, (now - end).total_seconds() / 3600)
    return round(worst, 1)


def status(root=".", now=None, stale=None):
    now = _now(now)
    log = load(root)
    recent = [i for i in log["incidents"] if now - _t(i["start_utc"]) <= timedelta(days=WINDOW_D)]
    open_h = max([(now - _t(i["start_utc"])).total_seconds() / 3600 for i in log["incidents"] if not i.get("cleared_utc")],
                 default=0.0)
    stale = stale_hours(root, now) if stale is None else stale
    reasons = []
    level = 1
    if len(recent) >= ESC_COUNT or open_h >= ESC_OPEN_H or stale >= ESC_STALE_H:
        level = 3
    elif len(recent) >= TELL_COUNT or stale >= TELL_STALE_H:
        level = 2
    if recent:
        reasons.append(f"{len(recent)} GitHub stall{'s' if len(recent) != 1 else ''} in 7 days")
    if open_h >= ESC_OPEN_H:
        reasons.append(f"runs stuck in GitHub's queue for {int(open_h)} hours")
    if stale >= TELL_STALE_H:
        reasons.append(f"a finished activity not on Today after {int(stale)} hours")
    told = _t(log.get("told_utc"))
    newest = max([_t(i["last_seen_utc"]) for i in recent], default=None)
    fresh = told is None or (newest and newest > told) or stale >= TELL_STALE_H
    esc = _t(log.get("escalated_utc"))
    line = ""
    why = ", ".join(reasons)
    if level == 3 and (esc is None or now - esc >= timedelta(days=7) or (newest and newest > esc)):
        line = (f"GitHub escalation: {why}. Cause is on GitHub's side. I drafted a support ticket for you to send if you "
                f"agree: {TICKET_LINK} (log: {LOG_LINK}).")
    elif level == 3:
        line = f"GitHub: still escalated ({why}); ticket draft {TICKET_LINK}." if fresh else ""
    elif level == 2 and fresh:
        line = f"GitHub hiccups: {why}. Nothing for you to do; the coach skips and retries (log: {LOG_LINK})."
    return {"level": level, "recent": len(recent), "open_hours": round(open_h, 1), "stale_hours": stale, "line": line}


def told(root=".", now=None, level=None):
    now = _now(now)
    log = load(root)
    log["told_utc"] = _iso(now)
    if (level or status(root, now)["level"]) == 3:
        log["escalated_utc"] = _iso(now)
    save(root, log)


def ticket_text(root=".", now=None):
    now = _now(now)
    log = load(root)
    recent = [i for i in log["incidents"] if now - _t(i["start_utc"]) <= timedelta(days=30)]
    lines = [
        "# Draft GitHub support ticket (send it yourself at https://support.github.com/contact if you agree)",
        "",
        f"Written by the coach on {now.strftime('%b %d, %Y')}. Nothing here is sent automatically.",
        "",
        "Subject: Actions runs stuck in queue or failing at startup on {{GITHUB_OWNER}}/{{REPO}}",
        "",
        "Hello, GitHub Actions runs on my private repository {{GITHUB_OWNER}}/{{REPO}} (GitHub hosted runners, "
        "ubuntu-latest) are repeatedly stuck in the queue or end in startup_failure with no jobs. The workflows have "
        "not changed when this happens, and later runs of the same workflow succeed. Details:",
        "",
    ]
    for i in recent:
        end = i.get("cleared_utc") or "not cleared"
        lines.append(f"- {i['start_utc']} to {end}: " + "; ".join(i["what"][:6]))
    late = [t for t in log["timed"] if now - _t(t["slot_utc"]) <= timedelta(days=7)]
    if late:
        lines.append(f"- Scheduled runs: {len(late)} of the timed runs in the last 7 days started over "
                     f"{LATE_MIN} minutes late or never started.")
    lines += ["", "Could you check what is holding these runs, and cancel any still stuck? Thank you.", ""]
    return "\n".join(lines)


def main(argv, root="."):
    ap = argparse.ArgumentParser(prog="hiccups.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("scan", "precheck"):
        sub.add_parser(c).add_argument("--runs", required=True)
    for c in ("status", "ticket", "told"):
        sub.add_parser(c)
    a = ap.parse_args(argv)
    if a.cmd in ("scan", "precheck"):
        with open(a.runs) as fh:
            runs = runs_of(json.load(fh))
        if a.cmd == "scan":
            ch = scan(runs, root)
            print("\n".join(ch) if ch else "no change")
            return 0
        stuck = is_stuck(runs, _now(None))
        print("GitHub stuck: skip" if stuck else "GitHub running")
        return 1 if stuck else 0
    if a.cmd == "status":
        s = status(root)
        print(json.dumps(s))
        return 0
    if a.cmd == "ticket":
        with open(os.path.join(root, TICKET), "w") as fh:
            fh.write(ticket_text(root))
        print(TICKET)
        return 0
    told(root)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
