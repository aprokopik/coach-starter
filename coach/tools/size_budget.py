"""The dashboard's size limits, with headroom and a warning step (6.165.0; the athlete picked "Only when I must act", Nov 21, 2026).

Why: from Nov 15 to 21 the limits sat at the exact size of the day, so 7 of 21 failed runs were a few bytes over
(144 bytes on Nov 21), each raise needed a Merge (about 40 in 7 days), and a post merge data rebuild could tip main red.
Now each limit sits about 15% above the Nov 21 size, a WARNING shows from 90% (the run stays green, the nightly fixer
trims), and only 100% fails. Raise a cap only with the athlete's Merge and a CHANGELOG line saying why; the history of the
earlier raises is in coach/tests/test_dashboard_speed.py and CHANGELOG.md.

    python3 coach/tools/size_budget.py          # from the repo root: one line per budget; exit 1 when one is over
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DASH = os.path.join(ROOT, "coach", "dashboard")

# bytes as written in the repo (the packed copy the phone gets is smaller)
CAP = {
    "page files": 1_415_000,   # every .js/.css plus index.html: 1,230,495 on Nov 21, 2026 (old cap 1,231,000) + 15%
    "coach.json": 1_311_000,   # the coach dataset: 1,139,972 on Nov 21, 2026 (old cap 1,140,000) + 15%
    "garmin csv": 220_000,     # data/summary.csv + data/activities.csv: 182,412 on Nov 21 (83%), unchanged
}
WARN = 0.90


def page_bytes(root=ROOT):
    d = os.path.join(root, "coach", "dashboard")
    return sum(os.path.getsize(os.path.join(d, n)) for n in os.listdir(d)
               if n.endswith((".js", ".css")) or n == "index.html")


def measure(root=ROOT):
    return {
        "page files": page_bytes(root),
        "coach.json": os.path.getsize(os.path.join(root, "coach", "dashboard", "coach.json")),
        "garmin csv": sum(os.path.getsize(os.path.join(root, "data", f)) for f in ("summary.csv", "activities.csv")),
    }


def state(size, cap, warn=WARN):
    if size > cap:
        return "over"
    return "warn" if size >= cap * warn else "ok"


def report(sizes):
    """[(name, size, cap, state)] for each budget."""
    return [(k, sizes[k], CAP[k], state(sizes[k], CAP[k])) for k in CAP if k in sizes]


def main(root=ROOT):
    rows = report(measure(root))
    for name, size, cap, st in rows:
        pct = 100 * size / cap
        line = f"{name}: {size:,} of {cap:,} bytes ({pct:.0f}%)"
        if st == "over":
            print(f"::error::{line}: over the limit. Trim it, or raise the cap in coach/tools/size_budget.py with the athlete's Merge")
        elif st == "warn":
            print(f"::warning::{line}: past {int(WARN * 100)}%, trim before it fails (the nightly fixer picks this up)")
        else:
            print(line)
    return 1 if any(st == "over" for *_, st in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
