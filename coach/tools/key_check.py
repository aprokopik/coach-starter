"""Key sessions: exactly three every week (the athlete, Nov 3, 2026; rules in coach/engine/KEY-SESSIONS.md).

The three key sessions are the three things that must happen that week for progress or the right discipline (80/20); a rest
day can be one of them. In coach/week.json a day row is a key session exactly when key is true and pillar is 1, 2 or 3, with
a one-line why. Every week from RULE_FROM on holds exactly one key row for each of 1, 2 and 3. Each block in coach/plan.json
carries three defaults (pillar_n and pillar_n_short), shown on the dashboard until the coach writes the week.

CLI: python3 coach/tools/key_check.py   prints the problems, or "ok". Exit code 1 when there are problems.
"""
import json
import os
import sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULE_FROM = date(2026, 11, 2)  # weeks before this keep what was tagged at the time


def _load(path):
    with open(os.path.join(ROOT, path)) as fh:
        return json.load(fh).get("rows", [])


def d(s):
    return date.fromisoformat(str(s)[:10])


def monday(day):
    return day - timedelta(days=day.weekday())


def defaults(block):
    """The block's three default key sessions: [{n, text, short}]."""
    return [{"n": n, "text": block.get(f"pillar_{n}"), "short": block.get(f"pillar_{n}_short")} for n in (1, 2, 3)]


def problems(plan_rows, week_rows):
    blocks = [b for b in plan_rows if b.get("kind") == "block"]
    days = [r for r in week_rows if r.get("kind") == "day" and r.get("date")]
    weeks = sorted({r["week_start"] for r in week_rows if r.get("kind") == "week" and r.get("week_start")} |
                   {monday(d(r["date"])).isoformat() for r in days})
    out = []
    for b in blocks:  # every block names its three defaults
        for p in defaults(b):
            if not p["text"] or not p["short"]:
                out.append(f"{b['key']}: pillar_{p['n']} needs both pillar_{p['n']} and pillar_{p['n']}_short")
    for r in days:  # key and pillar together, pillar 1 to 3, a why on current weeks
        key, pil = bool(r.get("key")), r.get("pillar")
        where = f"{r['date']} {r.get('title')!r}"
        if key and pil in (None, ""):
            out.append(f"{where}: key without a pillar number (1, 2 or 3)")
        elif pil not in (None, "") and not key:
            out.append(f"{where}: pillar {pil} without key true")
        elif key and str(pil) not in ("1", "2", "3"):
            out.append(f"{where}: pillar must be 1, 2 or 3")
        elif key and d(r["date"]) >= RULE_FROM and not str(r.get("why") or "").strip():
            out.append(f"{where}: key session needs a one-line why")
    for wk in weeks:  # exactly three per week
        mon = d(wk)
        if mon < monday(RULE_FROM):
            continue
        rows = [r for r in days if r.get("key") and mon <= d(r["date"]) <= mon + timedelta(days=6)]
        for n in (1, 2, 3):
            hits = [r for r in rows if str(r.get("pillar")) == str(n)]
            if len(hits) != 1:
                out.append(f"week of {wk}: key session {n} appears {len(hits)} times (needs exactly 1)")
    return out


def main():
    probs = problems(_load("coach/plan.json"), _load("coach/week.json"))
    print("\n".join(probs) if probs else "ok")
    sys.exit(1 if probs else 0)


if __name__ == "__main__":
    main()
