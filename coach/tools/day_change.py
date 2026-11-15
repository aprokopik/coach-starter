"""When today changes (roadmap priority 3, Closed loops; the athlete's pick on the Sprint Review page, option 4 of five, Nov 15, 2026).

A day-of change (gym closed, a trip, less time, two sessions swapped) reaches the coach two ways:
  - the Today card's "Today changed?" panel (coach/dashboard/change.js) saves one store document a day,
    day_change/<YYYY-MM-DD> {date, reason, note, use_min, saved_at}; "Use Min today" is the Plan B for today, there and then;
  - a chat message in any session, recorded with `add`.
Either way it lands as one row in coach/day_changes.csv. The next daytime refresh (or the morning run, or any session)
replans the rest of the week by RUNBOOK "Day-of answers in any session" step 3 and closes the row with `done`, and the
Today card then shows "Replanned <time>: <note>" from the `day_change` rows build_dashboard writes.

Usage (from the repo root):
  python3 coach/tools/day_change.py ingest <store-list.json>      copy day_change store documents (newer saved_at wins)
  python3 coach/tools/day_change.py pending                       print open changes as JSON lines; exit 1 when none
  python3 coach/tools/day_change.py done <date> --note "<what changed in the plan>"
  python3 coach/tools/day_change.py add <date> --reason travel [--note "..."] [--use-min]   (a change told in chat)
"""
import csv
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

PATH = "coach/day_changes.csv"
FIELDS = ["date", "reason", "note", "use_min", "saved_at", "source", "status", "done_at", "done_note"]
# the reasons the card offers, in its order, and their words (change.js REASONS holds the same five)
REASONS = {"gym_closed": "Gym closed", "travel": "Traveling", "less_time": "Less time", "swap_order": "Swap order", "other": "Something else"}
DAYS_SHOWN = 7  # build_dashboard carries the last week of changes


def read(path=PATH):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return [{k: (r.get(k) or "") for k in FIELDS} for r in csv.DictReader(fh)]


def write(rows, path=PATH):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    rows = sorted(rows, key=lambda r: r["date"])
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def _truth(v):
    return "true" if v is True or str(v).strip().lower() in ("true", "1", "yes") else "false"


def _clean(s, n=200):
    return " ".join(str(s or "").split())[:n]


def docs_from(raw):
    """Store list output in any of its shapes: a list of {id, data} or plain dicts, or a dict wrapping the list."""
    if isinstance(raw, dict):
        raw = raw.get("docs") or raw.get("documents") or raw.get("items") or raw.get("rows") or []
    out = []
    for x in raw or []:
        if not isinstance(x, dict):
            continue
        d = dict(x.get("data")) if isinstance(x.get("data"), dict) else dict(x)
        did = str(x.get("id") or x.get("doc_id") or "").split("/")[-1]
        d.setdefault("date", did)
        out.append(d)
    return out


def ingest(docs, path=PATH):
    """Copy store documents into the csv. A document replaces its date's row only when its saved_at is newer, and then
    reopens it (pending), since the change it describes has not been replanned yet. `cleared` closes it unplanned."""
    rows = {r["date"]: r for r in read(path)}
    changed = 0
    for d in docs:
        day = str(d.get("date") or "")[:10]
        try:
            date.fromisoformat(day)
        except ValueError:
            continue
        reason = d.get("reason") if d.get("reason") in REASONS else "other"
        saved = str(d.get("saved_at") or "")
        old = rows.get(day)
        if old and old["saved_at"] >= saved:
            continue
        cleared = d.get("cleared") is True or str(d.get("cleared")).lower() == "true"
        rows[day] = {"date": day, "reason": reason, "note": _clean(d.get("note")), "use_min": _truth(d.get("use_min")),
                     "saved_at": saved, "source": "dashboard", "status": "cleared" if cleared else "pending", "done_at": "", "done_note": ""}
        changed += 1
    write(list(rows.values()), path)
    return changed


def pending(path=PATH):
    return [r for r in read(path) if r["status"] == "pending"]


def done(day, note, path=PATH, now=None):
    rows = read(path)
    hit = [r for r in rows if r["date"] == day]
    if not hit:
        raise KeyError(day)
    now = now or datetime.now(timezone.utc)
    for r in hit:
        r.update(status="done", done_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), done_note=_clean(note, 300))
    write(rows, path)


def add(day, reason, note="", use_min=False, path=PATH, now=None):
    date.fromisoformat(day)
    if reason not in REASONS:
        raise ValueError(f"reason must be one of {', '.join(REASONS)}")
    now = now or datetime.now(timezone.utc)
    rows = [r for r in read(path) if r["date"] != day]
    rows.append({"date": day, "reason": reason, "note": _clean(note), "use_min": _truth(use_min),
                 "saved_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "chat", "status": "pending", "done_at": "", "done_note": ""})
    write(rows, path)


def rows(today, path=PATH):
    """coach.json rows (kind day_change) for the last week: the Today card reads today's to show the replan."""
    since = (today - timedelta(days=DAYS_SHOWN - 1)).isoformat()
    out = []
    for r in read(path):
        if r["date"] < since or r["date"] > today.isoformat():
            continue
        out.append({"kind": "day_change", "date": r["date"], "reason": r["reason"], "reason_text": REASONS.get(r["reason"], "Something else"),
                    "note": r["note"], "use_min": r["use_min"] == "true", "status": r["status"], "saved_at": r["saved_at"],
                    "done_at": r["done_at"], "done_note": r["done_note"], "source": r["source"]})
    return out


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    opt = lambda k: rest[rest.index(k) + 1] if k in rest and rest.index(k) + 1 < len(rest) else ""  # noqa: E731
    if cmd == "ingest":
        n = ingest(docs_from(json.load(open(rest[0]))))
        print(f"day_change: {n} new or newer")
        return 0
    if cmd == "pending":
        p = pending()
        for r in p:
            print(json.dumps({**r, "reason_text": REASONS.get(r["reason"], "Something else")}))
        return 0 if p else 1
    if cmd == "done":
        done(rest[0], opt("--note"))
        print(f"day_change {rest[0]}: done")
        return 0
    if cmd == "add":
        add(rest[0], opt("--reason") or "other", opt("--note"), "--use-min" in rest)
        print(f"day_change {rest[0]}: added")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
