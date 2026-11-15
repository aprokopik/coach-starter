"""Trips on the calendar the plan may not know about (from the Nov 15, 2026 morning run dry run; BACKLOG "Morning run reads the
calendar for trips"). the athlete's work travel Nov 16 to 17 reached the plan only because a thread replanned it; the morning run itself
never looked at the calendar.

Each morning (RUNBOOK Data 4c) the run reads the next 7 days of the athlete's calendar, read-only, saves the events as JSON and runs

    python3 coach/tools/trips.py check --events /tmp/calendar.json [--today YYYY-MM-DD]
    python3 coach/tools/trips.py seen <key> [<key> ...] [--known] [--today YYYY-MM-DD]

`check` prints {"new": [...], "seen": [...]}: every event that looks like time away from home, with the planned sessions on those
days. Each new one becomes ONE question or replan suggestion in the check-in (its `line`), never an applied change; after the
check-in names it, `seen` records its key in coach/trips_seen.json so it is asked once. `--known` records a trip the plan already
covers (CURRENT-STATE or week.json names it), with nothing said.

What counts as time away (pure rules, `away()`):
  - an out of office event, or a title with a travel word (travel, trip, flight, fly, hotel, conference, offsite, vacation,
    holiday, away, out of office, OOO);
  - or an event that runs over a night: a timed event ending on a later day, or an all-day event of 2 or more days;
  - never an event of more than 21 days (a school term, a season), and never a cancelled one.
Only the title, start and end are read; the record keeps a hashed key and the dates, never the title or anything else.
Events are the Google Calendar list_events shape ({id, summary, start: {date | dateTime}, end, eventType, status}).
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

SEEN = "coach/trips_seen.json"
WEEK = "coach/week.json"
LOOK_DAYS, MAX_DAYS = 7, 21
WORDS = re.compile(r"\b(travel\w*|trip|flights?|fly(ing)?|hotel|conference|offsite|off-site|vacation|holiday|away|out of office|ooo)\b", re.I)


def _day(v):
    """(date, timed) from a calendar start or end {date} / {dateTime}."""
    v = v or {}
    if v.get("dateTime"):
        return datetime.fromisoformat(str(v["dateTime"]).replace("Z", "+00:00")).date(), True
    if v.get("date"):
        return date.fromisoformat(str(v["date"])[:10]), False
    return None, False


def span(ev):
    """(first day, last day) the event touches; an all-day end date is exclusive in the calendar."""
    s, timed = _day(ev.get("start"))
    e, _ = _day(ev.get("end"))
    if not s:
        return None, None
    e = e or s
    if not timed and e > s:
        e -= timedelta(days=1)
    return s, max(s, e)


def away(ev):
    """True when the event looks like time away from home (rules in the module text). Pure."""
    if str(ev.get("status") or "").lower() == "cancelled":
        return False
    s, e = span(ev)
    if not s or (e - s).days + 1 > MAX_DAYS:
        return False
    if str(ev.get("eventType") or "").upper() == "OUT_OF_OFFICE" or WORDS.search(str(ev.get("summary") or "")):
        return True
    return e > s


def key(ev):
    """A stable key for one event and its dates: no title in it."""
    s, e = span(ev)
    raw = f"{ev.get('id') or ev.get('summary')}|{s}|{e}"
    return hashlib.sha1(raw.encode()).hexdigest()[:12]


def _fd(d):
    return f"{d:%a} {d:%b} {d.day}"


def planned(week, s, e):
    """The week.json session rows on the trip's days: date, type, title, minutes, key."""
    out = []
    for r in (week or {}).get("rows", []):
        if r.get("kind") != "day" or r.get("type") == "rest":
            continue
        try:
            d = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if s <= d <= e:
            out.append({"date": d.isoformat(), "type": r.get("type"), "title": r.get("title"), "minutes": r.get("minutes"), "key": bool(r.get("key"))})
    return out


def line(ev, sessions):
    """The check-in question for one new trip: names and dates only."""
    s, e = span(ev)
    when = _fd(s) if s == e else f"{_fd(s)} to {_fd(e)}"
    name = str(ev.get("summary") or "an event").strip()
    keys = [x for x in sessions if x["key"]]
    if keys:
        k = keys[0]
        return (f"Your calendar shows \"{name}\" {when}, and {_fd(date.fromisoformat(k['date']))} has a key session ({k['title']}). "
                "Want me to move it, or does the trip leave time for it?")
    if sessions:
        return f"Your calendar shows \"{name}\" {when}, with {len(sessions)} planned session{'s' if len(sessions) != 1 else ''} on those days. Will you have time and kit to train there?"
    return f"Your calendar shows \"{name}\" {when}. Anything the plan should know, like no bike or pool there?"


def check(events, today, week=None, seen=()):
    """{new, seen} for every away event touching today to today + 6. Pure."""
    end = today + timedelta(days=LOOK_DAYS - 1)
    seen = set(seen)
    out = {"new": [], "seen": []}
    for ev in events or []:
        if not away(ev):
            continue
        s, e = span(ev)
        if e < today or s > end:
            continue
        k = key(ev)
        sessions = planned(week, max(s, today), e)
        item = {"key": k, "start": s.isoformat(), "end": e.isoformat(), "sessions": sessions}
        if k in seen:
            out["seen"].append(item)
        else:
            item["line"] = line(ev, sessions)
            out["new"].append(item)
    for v in out.values():
        v.sort(key=lambda x: x["start"])
    return out


def _read(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _events(path):
    raw = _read(path, [])
    return raw.get("events", []) if isinstance(raw, dict) else raw


def record(root, keys, today, known=False, dates=None):
    """Add keys to coach/trips_seen.json (keep 60 days); returns the file's rows."""
    p = os.path.join(root, SEEN)
    data = _read(p, {"about": "Trips the morning run has already asked about (coach/tools/trips.py): hashed key and dates only.", "rows": []})
    have = {r["key"] for r in data["rows"]}
    for k in keys:
        if k not in have:
            row = {"key": k, "on": today.isoformat(), "how": "known" if known else "asked"}
            row.update((dates or {}).get(k, {}))
            data["rows"].append(row)
    cut = (today - timedelta(days=60)).isoformat()
    data["rows"] = [r for r in data["rows"] if r.get("end", r["on"]) >= cut]
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1)
        fh.write("\n")
    return data["rows"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--events", required=True)
    c.add_argument("--today")
    c.add_argument("--root", default=".")
    s = sub.add_parser("seen")
    s.add_argument("keys", nargs="+")
    s.add_argument("--known", action="store_true")
    s.add_argument("--events", help="the same events file, so the record keeps each trip's dates")
    s.add_argument("--today")
    s.add_argument("--root", default=".")
    a = ap.parse_args(argv)
    today = date.fromisoformat(a.today) if a.today else date.today()
    if a.cmd == "check":
        seen = [r["key"] for r in _read(os.path.join(a.root, SEEN), {"rows": []})["rows"]]
        print(json.dumps(check(_events(a.events), today, _read(os.path.join(a.root, WEEK), {}), seen), indent=1))
        return 0
    dates = {}
    if a.events:
        for ev in _events(a.events):
            st, en = span(ev)
            if st:
                dates[key(ev)] = {"start": st.isoformat(), "end": en.isoformat()}
    rows = record(a.root, a.keys, today, a.known, dates)
    print(f"{len(rows)} trip{'s' if len(rows) != 1 else ''} on record")
    return 0


if __name__ == "__main__":
    sys.exit(main())
