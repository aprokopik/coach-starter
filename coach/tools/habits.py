"""Habits to build: the cap on how many the athlete works on at once (the athlete, Nov 16, 2026: "You can go up to three
habits, that be the max"). HABITS_MAX is the one home for the number; profile.json habits stays the one home for
the athlete's picks (BLOCK-BRIEF.md 2.5). build_dashboard.py keeps only the first HABITS_MAX, and
test_habits_card.py fails if profile.json or BLOCK-BRIEF.md disagree with it.

    python3 coach/tools/habits.py        print the athlete's habits and the cap
"""
import json
import os
import sys

HABITS_MAX = 3


def capped(rows):
    """The athlete's habit rows, at most HABITS_MAX, in the order they were agreed."""
    rows = [r for r in (rows or []) if r]
    if len(rows) > HABITS_MAX:
        print(f"habits: {len(rows)} agreed, keeping the first {HABITS_MAX} ({', '.join(rows[:HABITS_MAX])})", file=sys.stderr)
    return rows[:HABITS_MAX]


def load(root="."):
    with open(os.path.join(root, "coach", "athlete", "profile.json"), encoding="utf-8") as fh:
        return json.load(fh).get("habits") or {}


if __name__ == "__main__":
    h = load()
    print(f"habits: {', '.join(h.get('rows') or []) or 'none agreed'} (max {HABITS_MAX})")
