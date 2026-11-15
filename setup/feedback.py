#!/usr/bin/env python3
"""Send the setup log back to the kit's makers.

    python3 setup/feedback.py            # check setup/SETUP-LOG.md, then print a link and a text block
    python3 setup/feedback.py --check    # check only
    python3 setup/feedback.py --pending  # count what has not been sent yet (ideas and metric requests)
    python3 setup/feedback.py --sent     # after the athlete pressed Submit: mark the metric requests as sent

What goes back: the setup log, with its "Ideas for the kit" section (things this coach built or wished for that
other athletes could use), plus every new line of coach/metric_requests.csv (what the athlete typed under
"Want to track something else?" on the dashboard). Words only: never a reading, a file or the athlete's data.

The link opens a prefilled issue on the kit's home repository (setup/kit.json, "feedback_repo"); the
athlete reads it and presses Submit. It works for anyone invited to that repository. Everyone else
copies the text block and sends it to whoever invited them. Nothing is sent by this script.

Refuses (exit 1) when the log seems to hold something it must not: an email address, a token or
password, a health reading. Fix the lines it names and run it again.
"""
import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
LOG = HERE / "SETUP-LOG.md"
KIT = HERE / "kit.json"
REQUESTS = HERE.parent / "coach" / "metric_requests.csv"
REQ_COLS = ["saved_at", "id", "text", "status"]
MAX_URL = 7000  # browsers and GitHub accept about 8000 characters in a link

CHECKS = [
    (r"[\w.+-]+@[\w-]+\.[\w.-]+", "an email address"),
    (r"\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{10,}", "a GitHub token"),
    (r"(?i)\b(password|secret|token)\s*[:=]\s*\S+", "a password or secret value"),
    (r"\b[A-Za-z0-9+=_-]{40,}\b", "a long key-like string"),
    (r"(?i)\b\d{2,3}\s*(bpm|beats)\b", "a heart rate"),
    (r"(?i)\b\d{2,3}\s*ms\b", "an HRV reading"),
    (r"\b1\d{2}\s*/\s*\d{2,3}\b", "a blood pressure reading"),
    (r"(?i)\b\d{2,3}(\.\d)?\s*(lb|lbs|kg|pounds)\b", "a body weight"),
    (r"(?i)\b\d{1,2}(\.\d)?\s*%\s*(body ?fat|bf)\b", "a body fat reading"),
    (r"(?i)\bmmhg\b", "a blood pressure reading"),
]


def problems(text):
    body = re.sub(r"<!--.*?-->", "", text, flags=re.S)  # the template's own note is fine
    found = []
    for n, line in enumerate(body.splitlines(), 1):
        for pat, what in CHECKS:
            if re.search(pat, line):
                found.append(f"line {n}: looks like {what}: {line.strip()[:80]}")
    return found


def requests():
    try:
        with open(REQUESTS, newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def new_requests():
    return [r for r in requests() if (r.get("status") or "new") == "new" and (r.get("text") or "").strip()]


def new_ideas(text):
    """Lines under "Ideas for the kit" that are not yet marked (sent ...)."""
    m = re.search(r"^## Ideas for the kit\s*\n(.*?)(?=^## |\Z)", text, flags=re.M | re.S)
    lines = [ln.strip() for ln in (m.group(1) if m else "").splitlines() if ln.strip().startswith("- ")]
    return [ln for ln in lines if ln.lower() != "- none" and "(sent" not in ln.lower()]


def with_requests(text):
    """The log plus the metric requests that have not been sent, as the text that goes back."""
    new = new_requests()
    if not new:
        return text
    block = "## Metric requests\n" + "\n".join(f"- {' '.join(r['text'].split())}" for r in new)
    return text.rstrip() + "\n\n" + block + "\n"


def mark_sent(today):
    rows = requests()
    n = 0
    for r in rows:
        if (r.get("status") or "new") == "new":
            r["status"] = "sent " + today
            n += 1
    if n:
        with open(REQUESTS, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=REQ_COLS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
    text = LOG.read_text(encoding="utf-8") if LOG.is_file() else ""
    out, k = [], 0
    inside = False
    for ln in text.splitlines():
        if ln.startswith("## "):
            inside = ln.strip() == "## Ideas for the kit"
        if inside and ln.strip().startswith("- ") and ln.strip().lower() != "- none" and "(sent" not in ln.lower():
            ln = ln.rstrip() + f" (sent {today})"
            k += 1
        out.append(ln)
    if k:
        LOG.write_text("\n".join(out) + "\n", encoding="utf-8")
    return n, k


def issue_link(repo, version, text):
    summary = ""
    m = re.search(r"^## Summary\s*\n+(.+)$", text, flags=re.M)
    if m and not m.group(1).startswith("("):
        summary = ": " + m.group(1).strip()[:70]
    title = f"Kit feedback {version}{summary}"
    base = f"https://github.com/{repo}/issues/new?labels=kit-feedback&title={quote(title)}&body="
    body = re.sub(r"<!--.*?-->\n*", "", text, flags=re.S).strip()
    url = base + quote(body)
    if len(url) > MAX_URL:
        note = "\n\n(The rest did not fit in the link; paste the text block from setup/feedback.py below this line.)"
        while len(base + quote(body + note)) > MAX_URL:
            body = body[: int(len(body) * 0.9)]
        url = base + quote(body + note)
    return title, url


def main(argv):
    if "--sent" in argv:
        import datetime
        n, k = mark_sent(datetime.date.today().isoformat())
        print(f"Marked as sent: {n} metric request(s), {k} idea(s).")
        return 0
    text = LOG.read_text(encoding="utf-8") if LOG.is_file() else ""
    if "--pending" in argv:
        n, k = len(new_requests()), len(new_ideas(text))
        print(f"PENDING {n + k}: {n} metric request(s), {k} idea(s) not sent yet.")
        return 0
    if not LOG.is_file():
        print("No setup/SETUP-LOG.md yet: copy it from the kit, or ask Claude to start one.")
        return 1
    text = with_requests(text)
    bad = problems(text)
    if bad:
        print("NOT READY: setup/SETUP-LOG.md or a metric request seems to hold something that must not leave this repository:")
        print("\n".join(bad))
        print("Remove or reword those lines, then run this again.")
        return 1
    if "--check" in argv:
        print("OK: nothing private found.")
        return 0
    kit = json.loads(KIT.read_text()) if KIT.is_file() else {}
    repo = kit.get("feedback_repo")
    version = kit.get("version", "")
    if repo:
        title, url = issue_link(repo, version, text)
        print("LINK (opens a prefilled GitHub issue; press Submit new issue):")
        print(url)
        print()
    print("TEXT (if the link does not open for you, send this to whoever invited you):")
    print(re.sub(r"<!--.*?-->\n*", "", text, flags=re.S).strip())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
