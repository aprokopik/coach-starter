"""One home for dated goals (6.28.0 or later; the athlete, Nov 12, 2026: "Two sources of truth should not happen", and he chose
"Yes, build it" on the card "Build one home for goals with a morning mismatch flag?").

The home of the weight goal is coach/athlete/profile.json `weight` (target_lo, target_hi, target_by): morning_facts.py
reads it into facts.json `weight.target`, and the starter kit writes it at setup. Every other place points to it. This
check finds any copy that still states a weight goal and disagrees with the home, so the morning check-in can name both
places instead of the coach silently following one of them. Race dates have their own home and check (races.json,
race_check.py).

What it reads:
  - coach/plan.json rows `target` key `weight` (lo, hi, start) and `milestone` key `wt` (date, and the range in its name)
  - the coaching text files in TEXT_FILES: any "N to M lb ... by <Mon> <D>" or "N lb by <Mon> <D>" statement. Struck
    rows (~~...~~) and the History section of CURRENT-STATE.md are history, not goals, and are skipped.
A single number counts as agreeing when it sits inside the target range; a range must equal it; a date must equal
target_by (a statement with no year takes the home's year).

    python3 coach/tools/goal_check.py      prints the mismatches; exit 1 if any
"""
import json
import os
import re
import sys
from datetime import date

PROFILE = "coach/athlete/profile.json"
PLAN = "coach/plan.json"
TEXT_FILES = ["coach/CURRENT-STATE.md", "coach/athlete/PROFILE.md", "coach/athlete/RESPONSE-PROFILE.md",
              "coach/engine/RULES.md", "coach/engine/TEAM.md", "coach/ops/RUNBOOK.md", "coach/COACH-SPEC.md"]
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
NUM = r"(\d{3}(?:\.\d)?)"
STATEMENT = re.compile(NUM + r"(?:\s*(?:to|-|–)\s*" + NUM + r")?\s*lb\b[^|;\n]{0,60}?\bby\s+([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?")


def _read_json(root, rel):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        return None
    with open(p) as fh:
        return json.load(fh)


def home(root="."):
    """(lo, hi, by date) from profile.json, or None when no weight goal is set."""
    w = ((_read_json(root, PROFILE) or {}).get("weight") or {})
    if w.get("target_lo") is None or w.get("target_hi") is None or not w.get("target_by"):
        return None
    return float(w["target_lo"]), float(w["target_hi"]), date.fromisoformat(w["target_by"])


def _differs(lo, hi, d, h):
    hlo, hhi, hby = h
    if hi is None:
        bad_val = not (hlo <= lo <= hhi)
    else:
        bad_val = (lo, hi) != (hlo, hhi)
    return bad_val or d != hby


def text_mismatches(root=".", h=None):
    h = h or home(root)
    out = []
    if not h:
        return out
    for rel in TEXT_FILES:
        p = os.path.join(root, rel)
        if not os.path.exists(p):
            continue
        in_history = False
        with open(p) as fh:
            for n, line in enumerate(fh, 1):
                if line.startswith("## "):
                    in_history = rel.endswith("CURRENT-STATE.md") and line.strip().lower().startswith("## history")
                if in_history or "~~" in line:
                    continue
                for m in STATEMENT.finditer(line):
                    mon = MONTHS.get(m.group(3).lower())
                    if not mon:
                        continue
                    try:
                        d = date(int(m.group(5)) if m.group(5) else h[2].year, mon, int(m.group(4)))
                    except ValueError:
                        continue
                    lo, hi = float(m.group(1)), (float(m.group(2)) if m.group(2) else None)
                    if _differs(lo, hi, d, h):
                        out.append({"where": f"{rel}:{n}", "says": m.group(0).strip()})
    return out


def plan_mismatches(root=".", h=None):
    h = h or home(root)
    out = []
    if not h:
        return out
    hlo, hhi, hby = h
    for r in (_read_json(root, PLAN) or {}).get("rows", []):
        if r.get("kind") == "target" and r.get("key") == "weight":
            if (float(r.get("lo")), float(r.get("hi"))) != (hlo, hhi) or r.get("start") != hby.isoformat():
                out.append({"where": f"{PLAN} target weight", "says": f"{r.get('lo')} to {r.get('hi')} lb from {r.get('start')}"})
        if r.get("kind") == "milestone" and r.get("key") == "wt":
            m = re.search(NUM + r"\s*(?:to|-|–)\s*" + NUM, r.get("name") or "")
            rng = (float(m.group(1)), float(m.group(2))) if m else (hlo, hhi)
            if rng != (hlo, hhi) or r.get("date") != hby.isoformat():
                out.append({"where": f"{PLAN} milestone wt", "says": f"{r.get('name')} on {r.get('date')}"})
    return out


def section(root="."):
    h = home(root)
    if not h:
        return {"home": None, "mismatches": [], "provenance": f"{PROFILE} has no weight goal"}
    mism = plan_mismatches(root, h) + text_mismatches(root, h)
    return {"home": {"file": PROFILE, "lo": h[0], "hi": h[1], "by": h[2].isoformat()}, "mismatches": mism,
            "provenance": f"{PROFILE} weight is the home; {PLAN} and the coaching text files checked against it (goal_check.py)"}


def main(root="."):
    s = section(root)
    if not s["home"]:
        print("no weight goal set")
        return 0
    if not s["mismatches"]:
        print(f"ok: every copy agrees with {PROFILE} ({s['home']['lo']:g} to {s['home']['hi']:g} lb by {s['home']['by']})")
        return 0
    for m in s["mismatches"]:
        print(f"{m['where']}: says \"{m['says']}\"; home says {s['home']['lo']:g} to {s['home']['hi']:g} lb by {s['home']['by']}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
