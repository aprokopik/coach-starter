"""Personal experiments record (roadmap week 3, One contract, PR 4).

coach/experiments.json holds each change the athlete tries, with a start, an end, measures (baseline, target,
source, value), a result and a decision. This module gives the morning facts what is running and what is due to
be read, so the review on the read date works from the record, not from the LOG.

    python3 coach/tools/experiments.py --date 2026-11-29
"""
import argparse
import json
import os
from datetime import date, datetime

REL = "coach/experiments.json"


def _d(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def load(root="."):
    p = os.path.join(root, REL)
    if not os.path.exists(p):
        return []
    with open(p) as fh:
        return json.load(fh).get("rows", [])


def section(today, root="."):
    running, due, pending = [], [], []
    for x in load(root):
        st, end, read_on = x.get("status"), _d(x.get("end")), _d(x.get("read_on") or x.get("end"))
        if st == "running":
            running.append({"id": x.get("id"), "name": x.get("name"), "end": x.get("end"),
                            "days_left": (end - today).days if end else None})
            if read_on and today >= read_on:
                due.append(x.get("id"))
        elif st == "read":
            pending.append(x.get("id"))
    return {
        "running": running,
        "read_due": due,
        "decision_pending": pending,
        "rule": "On the read date: fill each measure's value from its source, write the result in one line, ask the "
                "athlete's verdict if the record names one, set status read; after the athlete decides, write decision "
                "and decided_on and set status decided. Never start an experiment without the athlete's approval.",
        "provenance": REL,
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date")
    a = ap.parse_args()
    d = _d(a.date) if a.date else date.today()
    print(json.dumps(section(d), indent=1))
