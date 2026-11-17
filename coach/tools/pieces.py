"""Approved pieces, unsent notes and the pages threads make (coach/ops/PIECES.md; the athlete, Nov 16, 2026, card
"Pick how to stop approved pieces getting lost": "All three"; then "before a thread closes that generated artifacts,
we should have them be confirmed, closed and archived, or open item before closing a thread").

Owner only. The Release Board (ArtifactData) holds the rows; this tool only reads saved copies and prints.

    python3 coach/tools/pieces.py closeout --thread "<title>" --backlog backlog.json [--pages coach/ops/pages.json]
        exit 1 and list what is open when the thread still owns an open board row or an undecided page
    python3 coach/tools/pieces.py notes notes.json --backlog backlog.json
        print the board rows (JSON) to add for notes the athlete left that nobody answered and no row holds yet
    python3 coach/tools/pieces.py cleanse [--pages coach/ops/pages.json] [--days 30]
        list archived pages older than --days; deleting one still needs the athlete's yes
"""
import argparse
import json
import os
import sys
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(HERE, "..", "ops", "pages.json")
OPEN_STATES = ("idea", "next", "building")  # kept and not done; dropped, deferred, later and done close a row
PAGE_STATES = ("open", "confirmed", "archived")
NOTES_EPIC = "unanswered"


def _rows(backlog):
    """Board backlog rows as a list; accepts a list, or a dict of id to row."""
    if isinstance(backlog, dict):
        return [dict(r, id=r.get("id", k)) for k, r in backlog.items()]
    return list(backlog or [])


def load_pages(path=PAGES):
    with open(path) as f:
        return json.load(f)["pages"]


def check_pages(pages):
    """Problems in the page ledger, as words; empty when it is sound."""
    out, seen = [], set()
    for p in pages:
        url = p.get("url", "")
        if not url.startswith("https://claude.ai/artifact/"):
            out.append(f"page without an artifact link: {p.get('title')}")
        if url in seen:
            out.append(f"page listed twice: {url}")
        seen.add(url)
        if p.get("state") not in PAGE_STATES:
            out.append(f"page state must be one of {', '.join(PAGE_STATES)}: {url}")
        if not p.get("thread"):
            out.append(f"page without its thread: {url}")
        if p.get("state") == "archived" and not p.get("archived"):
            out.append(f"archived page without its date: {url}")
    return out


def closeout(thread, backlog, pages):
    """What still keeps `thread` open: its kept board rows and its pages nobody decided on."""
    rows = [r for r in _rows(backlog) if r.get("owner") == thread and r.get("state") in OPEN_STATES]
    left = [p for p in pages if p.get("thread") == thread and p.get("state") == "open"]
    return rows, left


def unanswered(notes, backlog):
    """Board rows to add for notes with no reply and no row yet. A note is
    {url, page, thread_id, at, text, answered}; its row id is n-<first 8 of the comment thread id>."""
    have = {r.get("id") for r in _rows(backlog)} | {r.get("comment") for r in _rows(backlog)}
    out = []
    for n in notes:
        rid = "n-" + str(n["thread_id"])[:8]
        if n.get("answered") or rid in have or n["thread_id"] in have:
            continue
        text = " ".join(str(n.get("text", "")).split())
        out.append({"id": rid, "epic": NOTES_EPIC, "state": "next", "title": text[:80] or "(empty note)",
                    "note": f"{n.get('page', 'a page')}, {str(n.get('at', ''))[:10]}", "source": n.get("url"),
                    "comment": n["thread_id"], "owner": n.get("owner", ""), "added": str(n.get("at", ""))[:10],
                    "from": "nightly note sweep"})
    return out


def stale_archived(pages, today=None, days=30):
    today = today or date.today()
    out = []
    for p in pages:
        if p.get("state") == "archived" and p.get("archived"):
            if (today - datetime.strptime(p["archived"], "%Y-%m-%d").date()).days >= days:
                out.append(p)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("closeout")
    c.add_argument("--thread", required=True)
    c.add_argument("--backlog", required=True)
    c.add_argument("--pages", default=PAGES)
    n = sub.add_parser("notes")
    n.add_argument("notes")
    n.add_argument("--backlog", required=True)
    s = sub.add_parser("cleanse")
    s.add_argument("--pages", default=PAGES)
    s.add_argument("--days", type=int, default=30)
    a = ap.parse_args(argv)
    if a.cmd == "closeout":
        rows, left = closeout(a.thread, json.load(open(a.backlog)), load_pages(a.pages))
        for r in rows:
            print(f"open row: {r.get('title')} ({r.get('state')})")
        for p in left:
            print(f"page not decided: {p.get('title')} {p.get('url')} (confirm, archive or keep as an open row)")
        if rows or left:
            return 1
        print("ok: nothing open")
        return 0
    if a.cmd == "notes":
        print(json.dumps(unanswered(json.load(open(a.notes)), json.load(open(a.backlog))), indent=1))
        return 0
    for p in stale_archived(load_pages(a.pages), days=a.days):
        print(f"archived {p['archived']}: {p.get('title')} {p['url']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
