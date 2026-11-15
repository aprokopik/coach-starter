"""Waiting on you: the Sunday check-in line about changes that wait for the athlete's review.

Why (roadmap priority 3, Closed loops, Nov 15, 2026): open pull requests piled up over the weekend sprint
(six waited for a "Merge" on Nov 15, one since Nov 3) and nothing in the morning message said so. A change
nobody is reminded of either goes stale or gets merged in a hurry. Once a week, the Sunday check-in names
how many wait, the oldest, and one line each, so the list is cleared on purpose.

Input: the open pull requests as JSON, from the GitHub tool list_pull_requests (state "open", perPage 50)
or the REST answer of GET /repos/<owner>/<repo>/pulls?state=open; both have the same shape. A draft is
still being written by its author, so it does not wait on the athlete and is counted apart.

    python3 coach/tools/waiting.py line --prs prs.json [--today YYYY-MM-DD] [--any-day]

Prints the lines to put in the check-in, or nothing: nothing on days other than Sunday (unless --any-day),
and nothing when no change waits. Exit 0 either way; a file that cannot be read prints one line saying the
list could not be read, so the check-in says so instead of going quiet.
"""
import argparse
import json
import re
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/New_York")  # the check-in's clock, as build_dashboard.py

MAX_LISTED = 8
VERSION_TAIL = re.compile(r"\s*\(\d+\.\d+\.\d+\)\s*$")
VERSION_HEAD = re.compile(r"^\s*\d+\.\d+\.\d+\s+")


def _created(pr):
    raw = pr.get("created_at") or pr.get("createdAt") or ""
    try:
        t = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return (t.astimezone(TZ) if t.tzinfo else t).date()
    except ValueError:
        return None


def _title(pr):
    t = str(pr.get("title") or "").strip()
    t = VERSION_HEAD.sub("", VERSION_TAIL.sub("", t))
    return t or "(no title)"


def _age(days):
    if days is None:
        return "age unknown"
    if days <= 0:
        return "opened today"
    return "1 day" if days == 1 else f"{days} days"


def summary(prs, today):
    """Count, oldest and one row each, oldest first. Drafts are counted apart."""
    rows, drafts = [], 0
    for pr in prs or []:
        if not isinstance(pr, dict) or pr.get("number") is None:
            continue
        if pr.get("draft"):
            drafts += 1
            continue
        made = _created(pr)
        days = (today - made).days if made else None
        rows.append({"number": pr["number"], "title": _title(pr), "days": days,
                     "url": pr.get("html_url") or pr.get("url") or ""})
    rows.sort(key=lambda r: (-(r["days"] if r["days"] is not None else -1), r["number"]))
    return {"count": len(rows), "drafts": drafts, "rows": rows, "oldest": rows[0] if rows else None}


def lines(s):
    """The check-in text: a head line, then one line per change (at most MAX_LISTED)."""
    if not s["count"]:
        return []
    n = s["count"]
    o = s["oldest"]
    head = f"Waiting on you: {n} change{'s' if n != 1 else ''} to review."
    if n > 1:
        head += f" Oldest: PR {o['number']}, {_age(o['days'])}."
    if s["drafts"]:
        head += f" ({s['drafts']} draft{'s' if s['drafts'] != 1 else ''} still being written, not counted.)"
    out = [head]
    for r in s["rows"][:MAX_LISTED]:
        out.append(f"PR {r['number']}: {r['title']} ({_age(r['days'])})")
    if n > MAX_LISTED:
        out.append(f"and {n - MAX_LISTED} more")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("line")
    p.add_argument("--prs", required=True)
    p.add_argument("--today")
    p.add_argument("--any-day", action="store_true")
    a = ap.parse_args(argv)
    today = date.fromisoformat(a.today) if a.today else datetime.now(TZ).date()
    if today.weekday() != 6 and not a.any_day:
        return 0
    try:
        with open(a.prs, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        print("Waiting on you: the list of open changes could not be read today.")
        return 0
    if isinstance(data, dict):  # some tools wrap the list
        data = data.get("items") or data.get("pull_requests") or []
    for ln in lines(summary(data, today)):
        print(ln)
    return 0


if __name__ == "__main__":
    sys.exit(main())
