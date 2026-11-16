"""Next week's review on Today (the athlete, Nov 16, 2026, on the Release Board: "send user visual not text"; he picked option 1 of
five, "i like this to show up on the today card on the friday before the next monday starting week").

On the plan check day (profile.json plan_check_day, default Friday) the Today tab shows next week's pencilled days as a path
(coach/dashboard/review.js). One tap answers it: Looks good, Busy week, or Change a day (pick days, then what is true for each:
Can't train, Short on time, Travel, Move this session). The page saves one store document per week:
    week_review/<next Monday> {week, answer: good | busy | change, days: [{date, what}], note, saved_at}, or {..., cleared: true}
This tool copies it into coach/week_reviews.csv; the next refresh or morning run moves the pencilled rows (RUNBOOK
"Next week review") and closes it with `done`. The card then reads "Updated <time>: <note>".

Usage (from the repo root):
  python3 coach/tools/week_review.py ingest <store-list.json>    copy week_review store documents (newer saved_at wins)
  python3 coach/tools/week_review.py pending                     open reviews as JSON lines; exit 1 when none
  python3 coach/tools/week_review.py done <week> --note "<what moved>"
  python3 coach/tools/week_review.py heads-up                    the morning check-in's Heads up line for each move not told yet
  python3 coach/tools/week_review.py told <week>                 mark it told once the check-in carried it
  python3 coach/tools/week_review.py add <week> --answer good|busy|change [--days "Wed:no_train;Thu:travel"] [--note "..."]
"""
import csv
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

PATH = "coach/week_reviews.csv"
FIELDS = ["week", "answer", "days", "note", "saved_at", "source", "status", "done_at", "done_note", "told"]
# the page's words, in its order (review.js ANSWERS and WHAT hold the same keys; test_week_review checks they match)
ANSWERS = {"good": "Looks good", "busy": "Busy week", "change": "Change a day"}
WHAT = {"no_train": "Can't train", "short": "Short on time", "travel": "Travel", "move": "Move this session"}
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def read(path=PATH):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return [{k: (r.get(k) or "") for k in FIELDS} for r in csv.DictReader(fh)]


def write(rows, path=PATH):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["week"]))


def _clean(s, n=200):
    return " ".join(str(s or "").split())[:n]


def _monday(s):
    d = date.fromisoformat(str(s)[:10])
    if d.weekday():
        raise ValueError(f"{s} is not a Monday")
    return d


def days_text(days, week):
    """[{date, what}] -> "Wed:no_train;Thu:travel", only days inside the week and known answers, in day order."""
    m = _monday(week)
    out = {}
    for x in days or []:
        if not isinstance(x, dict):
            continue
        try:
            d = date.fromisoformat(str(x.get("date") or "")[:10])
        except ValueError:
            continue
        if 0 <= (d - m).days <= 6 and x.get("what") in WHAT:
            out[(d - m).days] = x["what"]
    return ";".join(f"{DOW[k]}:{out[k]}" for k in sorted(out))


def plain(row):
    """One line for the coach: "Change a day: Wed can't train, Thu travel. Note: ..." """
    parts = [ANSWERS.get(row["answer"], row["answer"])]
    if row["days"]:
        parts[0] += ": " + ", ".join(f"{d} {WHAT.get(w, w).lower()}" for d, w in (p.split(":") for p in row["days"].split(";") if ":" in p))
    if row["note"]:
        parts.append("Note: " + row["note"])
    return ". ".join(parts)


def docs_from(raw):
    """Store list output in any of its shapes: a list of {id, data} or plain dicts, or a dict wrapping the list."""
    if isinstance(raw, dict):
        raw = raw.get("docs") or raw.get("documents") or raw.get("items") or raw.get("rows") or []
    out = []
    for x in raw or []:
        if not isinstance(x, dict):
            continue
        d = dict(x.get("data")) if isinstance(x.get("data"), dict) else dict(x)
        d.setdefault("week", str(x.get("id") or x.get("doc_id") or "").split("/")[-1])
        out.append(d)
    return out


def ingest(docs, path=PATH):
    """A document replaces its week's row only when its saved_at is newer, and reopens it (pending). Looks good needs no
    replan, so it lands done straight away; `cleared` (Undo) closes it with nothing moved."""
    rows = {r["week"]: r for r in read(path)}
    changed = 0
    for d in docs:
        try:
            wk = _monday(d.get("week")).isoformat()
        except (ValueError, TypeError):
            continue
        saved = str(d.get("saved_at") or "")
        old = rows.get(wk)
        if old and old["saved_at"] >= saved:
            continue
        ans = d.get("answer") if d.get("answer") in ANSWERS else "change"
        cleared = d.get("cleared") is True or str(d.get("cleared")).lower() == "true"
        status = "cleared" if cleared else "done" if ans == "good" else "pending"
        rows[wk] = {"week": wk, "answer": ans, "days": days_text(d.get("days"), wk), "note": _clean(d.get("note")), "saved_at": saved,
                    "source": "dashboard", "status": status, "done_at": saved if status == "done" else "",
                    "done_note": "Plan kept as pencilled." if status == "done" else "", "told": ""}
        changed += 1
    write(list(rows.values()), path)
    return changed


def pending(path=PATH):
    return [r for r in read(path) if r["status"] == "pending"]


def done(week, note, path=PATH, now=None):
    rows = read(path)
    hit = [r for r in rows if r["week"] == week]
    if not hit:
        raise KeyError(week)
    now = now or datetime.now(timezone.utc)
    for r in hit:
        r.update(status="done", done_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"), done_note=_clean(note, 300))
    write(rows, path)


def heads_up(path=PATH):
    """One line per move the coach made from a dashboard answer and the check-in has not said yet (the athlete, Nov 16, 2026: the
    chat says what moved, not only the card). Looks good and chat answers need no line: he already knows."""
    return [(r["week"], f"Next week updated from your answer: {r['done_note']}") for r in read(path)
            if r["status"] == "done" and r["answer"] != "good" and r["source"] == "dashboard" and r["told"] != "true" and r["done_note"]]


def told(week, path=PATH):
    rows = read(path)
    for r in rows:
        if r["week"] == week:
            r["told"] = "true"
    write(rows, path)


def add(week, answer, days="", note="", path=PATH, now=None):
    wk = _monday(week).isoformat()
    if answer not in ANSWERS:
        raise ValueError(f"answer must be one of {', '.join(ANSWERS)}")
    m = _monday(wk)
    parsed = []
    for p in filter(None, (days or "").split(";")):
        d, _, w = p.partition(":")
        if d[:3].title() in DOW:
            parsed.append({"date": (m + timedelta(days=DOW.index(d[:3].title()))).isoformat(), "what": w})
    now = now or datetime.now(timezone.utc)
    rows = [r for r in read(path) if r["week"] != wk]
    st = "done" if answer == "good" else "pending"
    stamp = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    rows.append({"week": wk, "answer": answer, "days": days_text(parsed, wk), "note": _clean(note), "saved_at": stamp, "source": "chat",
                 "status": st, "done_at": stamp if st == "done" else "", "done_note": "Plan kept as pencilled." if st == "done" else "", "told": ""})
    write(rows, path)


def rows(today, path=PATH):
    """coach.json rows (kind week_review) for next week and later: the Today card reads next week's to show what moved."""
    nxt = (today + timedelta(days=7 - today.weekday())).isoformat()
    return [{"kind": "week_review", "week": r["week"], "answer": r["answer"], "answer_text": ANSWERS.get(r["answer"], ""),
             "days": r["days"], "note": r["note"], "status": r["status"], "saved_at": r["saved_at"], "done_at": r["done_at"],
             "done_note": r["done_note"], "source": r["source"]} for r in read(path) if r["week"] >= nxt]


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    opt = lambda k: rest[rest.index(k) + 1] if k in rest and rest.index(k) + 1 < len(rest) else ""  # noqa: E731
    if cmd == "ingest":
        n = ingest(docs_from(json.load(open(rest[0]))))
        print(f"week_review: {n} new or newer")
        return 0
    if cmd == "pending":
        p = pending()
        for r in p:
            print(json.dumps({**r, "plain": plain(r)}))
        return 0 if p else 1
    if cmd == "done":
        done(rest[0], opt("--note"))
        print(f"week_review {rest[0]}: done")
        return 0
    if cmd == "heads-up":
        for _, line in heads_up():
            print(line)
        return 0
    if cmd == "told":
        told(rest[0])
        print(f"week_review {rest[0]}: told")
        return 0
    if cmd == "add":
        add(rest[0], opt("--answer") or "change", opt("--days"), opt("--note"))
        print(f"week_review {rest[0]}: added")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
