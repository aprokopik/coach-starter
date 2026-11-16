"""Check-in settings: which check-ins the coach sends, and when (the athlete, Nov 16, 2026: "Id like the check ins to be part of
onboarding selection" and "you should be able to modify and enable/disable from the dashboard"; layout A, one list, with
"Add new").

One home: coach/athlete/checkins.json, the athlete's own file (a kit update never replaces it):
  {"version": 1, "tasks": [{"id", "kind", "name", "what", "on", "time" "HH:MM", "days" daily|sun..sat, "task_time",
                            "prompt", "status" ok|new, "saved_at", "source"}]}
`time` is what the athlete wants; `task_time` is the time the scheduled task really has. They differ from a dashboard tap
until a coach run moves the task (RUNBOOK "Check-in settings") and closes it with `done`. `status` new: asked for on the
dashboard ("Add new") or at onboarding, no scheduled task yet.

The dashboard's Check-ins card (coach/dashboard/tasks.js) saves one store document per check-in,
checkin_task/<id> {id, on, time, saved_at} and, for a new one, {id, kind, name, what, days, new: true}.
Off takes effect at once: every check-in task runs `gate <id>` right after the ingest and stays silent when it is off.

Usage (from the repo root):
  python3 coach/tools/checkin_tasks.py ingest <store-list.json>   copy checkin_task store documents (newer saved_at wins)
  python3 coach/tools/checkin_tasks.py gate <id>                  exit 0 when this check-in is on (or unknown), 1 when off
  python3 coach/tools/checkin_tasks.py pending                    print each task whose schedule must change, as JSON lines; exit 1 when none
  python3 coach/tools/checkin_tasks.py done <id>                  the scheduled task now has this check-in's time
  python3 coach/tools/checkin_tasks.py set <id> [--on|--off] [--time HH:MM] [--every 1|2|3|4]     (a change told in chat; --every: the refresh)
  python3 coach/tools/checkin_tasks.py follow-sleep                move the daytime refresh's window to the athlete's waking hours
  python3 coach/tools/checkin_tasks.py add <kind> --time HH:MM [--name "..."] [--what "..."] [--days sun]
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

PATH = "coach/athlete/checkins.json"
DATA_PATHS = "coach/ops/data_paths.json"
DAYS = ("daily", "mon", "tue", "wed", "thu", "fri", "sat", "sun")
# the kinds the kit has a prompt file for, in the card's order (tasks.js KINDS holds the same ids, names and words)
KINDS = {
    "morning": {"name": "Morning", "what": "Today's plan and how ready you are", "time": "07:00", "days": "daily",
                "prompt": "coach/ops/TASK-PROMPT-morning.md"},
    "evening": {"name": "Evening", "what": "How today went, three questions at most", "time": "20:30", "days": "daily",
                "prompt": "coach/ops/TASK-PROMPT-evening.md"},
    "week_review": {"name": "Sunday week review", "what": "A short look back at the week and ahead to the next", "time": "16:30",
                    "days": "sun", "prompt": "coach/ops/TASK-PROMPT-week-review.md"},
    "refresh": {"name": "Daytime refresh", "what": "Quiet: a finished workout reaches your dashboard the same day", "time": "09:00",
                "until": "21:00", "days": "daily", "prompt": "coach/ops/TASK-PROMPT-refresh.md"},
    "custom": {"name": "Check-in", "what": "", "time": "12:00", "days": "daily", "prompt": ""},
}
MAX_TASKS = 8  # the card stays one phone screen
EVERY_H = 2    # the daytime refresh runs every 2 hours inside its window unless the athlete picks another (Nov 11 and 16, 2026)
EVERY_CHOICES = (1, 2, 3, 4)  # the card's "How often" choices (tasks.js EVERY holds the same four)
MIN_NIGHTS = 7  # nights of sleep times needed before the window follows the athlete's own day
SHIFT_MIN = 60  # the window moves only when wake or bedtime moved this much, so the task is not rescheduled every week


def _now(now=None):
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _clean(s, n=120):
    return " ".join(str(s or "").split())[:n]


def hhmm(v):
    """'7:00 AM', '7 am', '19:30', '0730' as 'HH:MM'; '' when it is not a time."""
    s = str(v or "").strip().lower().replace(".", "")
    m = re.fullmatch(r"(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?", s)
    if not m:
        return ""
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ap:
        if not 1 <= h <= 12:
            return ""
        h = (h % 12) + (12 if ap == "pm" else 0)
    if h > 23 or mi > 59:
        return ""
    return f"{h:02d}:{mi:02d}"


def clock(t):
    """'19:30' as '7:30 PM'."""
    t = hhmm(t)
    if not t:
        return ""
    h, m = int(t[:2]), t[3:]
    return f"{(h % 12) or 12}:{m} {'AM' if h < 12 else 'PM'}"


def slug(s):
    return re.sub(r"[^a-z0-9_]+", "-", str(s or "").lower()).strip("-")[:32]


def read(path=PATH):
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        return list(json.load(fh).get("tasks") or [])


def write(tasks, path=PATH):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as fh:
        json.dump({"version": 1, "note": "Which check-ins the coach sends, and when. Change them on the dashboard (Check-ins) or "
                   "tell the coach; coach/tools/checkin_tasks.py is the only writer.", "tasks": tasks}, fh, indent=1)
        fh.write("\n")


def make(kind, time="", name="", what="", days="", on=True, tid="", source="chat", now=None, status="new", until=""):
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    k = KINDS[kind]
    name = _clean(name, 40) or k["name"]
    tid = slug(tid) or (kind if kind != "custom" else "custom-" + slug(name))
    t = hhmm(time) or k["time"]
    out = {"id": tid, "kind": kind, "name": name, "what": _clean(what) or k["what"], "on": bool(on), "time": t,
           "days": days if days in DAYS else k["days"], "task_time": t if status == "ok" else "", "prompt": k["prompt"],
           "status": status, "saved_at": _now(now), "source": source}
    if "until" in k:  # a window, not one time: the daytime refresh runs every EVERY_H hours from time to until
        u = hhmm(until) or k["until"]
        out.update(until=u, task_until=u if status == "ok" else "", every_h=EVERY_H, task_every_h=EVERY_H if status == "ok" else 0)
    return out


def window_text(t):
    """'Every 2 hours, 7:00 AM to 9:00 PM' for a check-in that has a window."""
    if not t.get("until"):
        return ""
    e = every(t)
    return f"Every {'hour' if e == 1 else f'{e} hours'}, {clock(t['time'])} to {clock(t['until'])}"


def every(t):
    return t.get("every_h") if t.get("every_h") in EVERY_CHOICES else EVERY_H


def cron(t):
    """The schedule a window means, in the athlete's own time zone: 'M H1-H2/2 * * *'."""
    h1, m, h2 = int(t["time"][:2]), int(t["time"][3:]), int(t["until"][:2])
    return f"{m} {h1}-{max(h1, h2)}/{every(t)} * * *"


def awake_window(daily_dir="data/daily", floor="", nights=14, today=None):
    """(start, end) 'HH:MM' from the athlete's own sleep: the usual wake time, rounded up to the half hour and never before
    `floor` (the morning check-in, which already pulls), to an hour before the usual bedtime. None with too few nights."""
    import glob
    import statistics
    wakes, beds = [], []
    for f in sorted(glob.glob(os.path.join(daily_dir, "*.json")))[-nights:]:
        try:
            with open(f) as fh:
                s = ((json.load(fh).get("responses") or {}).get("sleep") or {}).get("dailySleepDTO") or {}
        except (ValueError, OSError):
            continue
        a, b = s.get("sleepStartTimestampLocal"), s.get("sleepEndTimestampLocal")
        if a and b and b > a:
            beds.append((a / 60000 + 12 * 60) % 1440)  # minutes after noon, so a bedtime after midnight stays in order
            wakes.append((b / 60000) % 1440)
    if len(wakes) < MIN_NIGHTS:
        return None
    wake = int(-(-statistics.median(wakes) // 30) * 30)
    if hhmm(floor):
        wake = max(wake, int(floor[:2]) * 60 + int(floor[3:]) + 60)
    bed = (statistics.median(beds) + 12 * 60) % 1440
    end = int(((bed - 60) % 1440) // 60 * 60)
    if end <= wake:  # a bedtime after midnight: the window ends at the last full hour of the day
        end = 23 * 60
    end = max(end, min(wake + EVERY_H * 60, 23 * 60))
    return f"{wake // 60:02d}:{wake % 60:02d}", f"{end // 60:02d}:{end % 60:02d}"


def follow_sleep(path=PATH, daily_dir="data/daily", now=None):
    """Move the daytime refresh's window to the athlete's waking hours (the athlete, Nov 16, 2026: "not just every two hours but
    just during wake periods"). Returns the new (start, end), or None when nothing moved."""
    tasks = read(path)
    t = next((x for x in tasks if x["kind"] == "refresh" and not x.get("removed")), None)
    if t is None:
        return None
    m = next((x for x in tasks if x["id"] == "morning"), None)
    w = awake_window(daily_dir, m["time"] if m and m.get("on") else "")
    if not w:
        return None
    mins = lambda v: int(v[:2]) * 60 + int(v[3:])  # noqa: E731
    if abs(mins(w[0]) - mins(t["time"])) < SHIFT_MIN and abs(mins(w[1]) - mins(t["until"])) < SHIFT_MIN:
        return None
    t.update(time=w[0], until=w[1], saved_at=_now(now), source="sleep")
    write(tasks, path)
    return w


def docs_from(raw):
    """Store list output in any of its shapes: a list of {id, data} or plain dicts, or a dict wrapping the list."""
    if isinstance(raw, dict):
        raw = raw.get("docs") or raw.get("documents") or raw.get("items") or raw.get("rows") or []
    out = []
    for x in raw or []:
        if not isinstance(x, dict):
            continue
        d = x.get("data") if isinstance(x.get("data"), dict) else x
        if isinstance(d, str):
            try:
                d = json.loads(d)
            except ValueError:
                continue
        d = dict(d)
        d.setdefault("id", x.get("id") or x.get("doc_id") or "")
        if d.get("id") and d.get("saved_at"):
            out.append(d)
    return out


def ingest(docs, path=PATH):
    """Newer saved_at wins, per check-in. A document for an unknown id is taken only when it says new."""
    tasks, n = read(path), 0
    by = {t["id"]: t for t in tasks}
    for d in sorted(docs, key=lambda d: str(d["saved_at"])):
        tid, at = slug(d["id"]), str(d["saved_at"])
        t = by.get(tid)
        if t is None:
            if not d.get("new") or d.get("removed") or len(tasks) >= MAX_TASKS:
                continue
            kind = d.get("kind") if d.get("kind") in KINDS else "custom"
            t = make(kind, d.get("time"), d.get("name"), d.get("what"), d.get("days"), d.get("on", True), tid, "dashboard")
            t["saved_at"] = at
            tasks.append(t)
            by[tid] = t
            n += 1
            continue
        if at <= str(t.get("saved_at") or ""):
            continue
        if d.get("removed") and t["kind"] != "morning":  # the morning check-in can be turned off, never removed
            t.update(on=False, removed=True, saved_at=at, source="dashboard")
            n += 1
            continue
        if "on" in d:
            t["on"] = bool(d["on"])
        if hhmm(d.get("time")):
            t["time"] = hhmm(d["time"])
        if "until" in t and d.get("every_h") in EVERY_CHOICES:
            t["every_h"] = d["every_h"]
        t.update(saved_at=at, source="dashboard")
        n += 1
    if n:
        write(tasks, path)
    return n


def gate(tid, path=PATH):
    """True unless this check-in is known and off. No settings file (a coach from before this) means on."""
    t = next((t for t in read(path) if t["id"] == tid), None)
    return t is None or bool(t.get("on"))


def pending(path=PATH):
    """What a coach run has to do to the scheduled tasks: create, move, or delete."""
    out = []
    for t in read(path):
        if t.get("removed"):
            if t.get("status") != "gone":
                out.append({**t, "do": "delete"})
        elif t.get("status") == "new":
            if t.get("on"):
                out.append({**t, "do": "create", "clock": clock(t["time"])})
        elif (t.get("time") != t.get("task_time") or t.get("until", "") != t.get("task_until", "")
              or ("until" in t and every(t) != t.get("task_every_h", EVERY_H))):
            out.append({**t, "do": "move", "clock": clock(t["time"]), "from_clock": clock(t.get("task_time"))})
    for o in out:
        if o.get("until") and o["do"] != "delete":  # a window: the schedule is a cron line, and the words say the window
            o.update(clock=window_text(o), cron=cron(o))
    return out


def _sync_data_paths(t, path=DATA_PATHS):
    """The morning time also feeds the dashboard's "next update" words (data_paths morning_checkin "at"); keep it in step.
    A text edit, so the file keeps its hand-set layout."""
    if t["kind"] != "morning" or not os.path.exists(path):
        return
    with open(path) as fh:
        text = fh.read()
    new = re.sub(r'("id": "morning_checkin"(?:(?!\{"id").)*?"at": ")[^"]*(")', lambda m: m.group(1) + clock(t["time"]) + m.group(2),
                 text, count=1, flags=re.S)
    if new != text:
        with open(path, "w") as fh:
            fh.write(new)


def done(tid, path=PATH, data_paths=DATA_PATHS):
    tasks = read(path)
    t = next((t for t in tasks if t["id"] == tid), None)
    if t is None:
        raise KeyError(tid)
    if t.get("removed"):
        tasks = [x for x in tasks if x["id"] != tid]
    else:
        t.update(task_time=t["time"], status="ok")
        if "until" in t:
            t.update(task_until=t["until"], task_every_h=every(t))
        _sync_data_paths(t, data_paths)
    write(tasks, path)


def set_(tid, on=None, time="", path=PATH, now=None, every_h=None):
    tasks = read(path)
    t = next((t for t in tasks if t["id"] == tid), None)
    if t is None:
        raise KeyError(tid)
    if on is not None:
        t["on"] = bool(on)
    if time:
        if not hhmm(time):
            raise ValueError("time must look like 7:00 AM or 19:00")
        t["time"] = hhmm(time)
    if every_h is not None:
        if "until" not in t or every_h not in EVERY_CHOICES:
            raise ValueError("--every takes 1, 2, 3 or 4 (hours), for the daytime refresh only")
        t["every_h"] = every_h
    t.update(saved_at=_now(now), source="chat")
    write(tasks, path)


def add(kind, time="", name="", what="", days="", path=PATH, now=None):
    tasks = read(path)
    t = make(kind, time, name, what, days, now=now)
    if any(x["id"] == t["id"] for x in tasks):
        raise ValueError(f"{t['id']} is already there; use set")
    if len(tasks) >= MAX_TASKS:
        raise ValueError(f"at most {MAX_TASKS} check-ins")
    tasks.append(t)
    write(tasks, path)
    return t


def _after_morning(tasks):
    """Until a week of sleep times exists, a new daytime refresh starts an hour after the morning check-in (which already pulls)."""
    m = next((t for t in tasks if t["id"] == "morning" and t.get("on")), None)
    for t in tasks:
        if t["kind"] == "refresh" and t.get("status") == "new" and m:
            h = min(int(m["time"][:2]) + 1, int(t["until"][:2]) - EVERY_H)
            t["time"] = f"{h:02d}:{m['time'][3:]}"


def seed(choices, path=PATH, now=None):
    """Onboarding: write the file from the answers, [{kind, time}] (personalize.py). Never rewrites an existing file."""
    if os.path.exists(path):
        return False
    tasks, seen = [], set()
    for c in choices or []:
        kind = c.get("kind")
        if kind not in KINDS or kind == "custom" or kind in seen:
            continue
        seen.add(kind)
        tasks.append(make(kind, c.get("time"), on=c.get("on", True), source="onboarding", now=now))
    if "morning" not in seen:  # the morning check-in always exists; an athlete who did not tick it gets it turned off
        tasks.insert(0, make("morning", on=False, source="onboarding", now=now))
    _after_morning(tasks)
    write(tasks, path)
    return True


def ensure(kind, path=PATH, now=None):
    """Add a check-in the kit now turns on for everyone (the daytime refresh) to a file from before it. Once: a file that
    has it, on or off, is left alone."""
    tasks = read(path)
    if not tasks or any(t["kind"] == kind for t in tasks) or len(tasks) >= MAX_TASKS:
        return False
    tasks.append(make(kind, source="kit", now=now))
    _after_morning(tasks)
    write(tasks, path)
    return True


def rows(path=PATH):
    """coach.json rows (kind checkin_task): the Check-ins card draws its list from these."""
    out = []
    for i, t in enumerate(x for x in read(path) if not x.get("removed")):
        out.append({"kind": "checkin_task", "id": t["id"], "task_kind": t["kind"], "name": t["name"], "what": t.get("what", ""),
                    "on": bool(t.get("on")), "time": t["time"], "time_text": clock(t["time"]), "task_time": t.get("task_time", ""),
                    "days": t.get("days", "daily"), "status": t.get("status", "ok"), "saved_at": t.get("saved_at", ""), "order": i,
                    "until": t.get("until", ""), "task_until": t.get("task_until", ""), "window_text": window_text(t),
                    "every_h": every(t) if t.get("until") else 0, "task_every_h": t.get("task_every_h", 0)})
    return out


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    opt = lambda k: rest[rest.index(k) + 1] if k in rest and rest.index(k) + 1 < len(rest) else ""  # noqa: E731
    if cmd == "ingest":
        print(f"checkin_task: {ingest(docs_from(json.load(open(rest[0]))))} new or newer")
        return 0
    if cmd == "gate":
        on = gate(rest[0])
        print("on" if on else "off: stay silent, this check-in is turned off on the dashboard")
        return 0 if on else 1
    if cmd == "pending":
        p = pending()
        for t in p:
            print(json.dumps(t))
        return 0 if p else 1
    if cmd == "done":
        done(rest[0])
        print(f"checkin_task {rest[0]}: done")
        return 0
    if cmd == "set":
        set_(rest[0], True if "--on" in rest else False if "--off" in rest else None, opt("--time"),
             every_h=int(opt("--every")) if opt("--every").isdigit() else None)
        print(f"checkin_task {rest[0]}: saved")
        return 0
    if cmd == "follow-sleep":
        w = follow_sleep()
        print(f"refresh window: {clock(w[0])} to {clock(w[1])}" if w else "refresh window: unchanged")
        return 0
    if cmd == "add":
        t = add(rest[0], opt("--time"), opt("--name"), opt("--what"), opt("--days"))
        print(f"checkin_task {t['id']}: added")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
