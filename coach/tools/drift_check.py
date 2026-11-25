"""Plan drift checks (6.173.0; RCA Nov 25, 2026, thread "Adjust training for work crunch").

Observed: the plan pencilled Nov 30 to Dec 6, 2026 as a recovery week with no fatigue signal, against RULES 3 ("Deloads are not
scheduled by calendar"). Root cause: the recovery weeks came from the Oct 17 P5 weight plan (a deficit in a deload week every
fourth week); P5 was replaced on Nov 11 but nothing removed what it had written into plan.json, and the Sunday plan copied it.

Two checks close the class:

1. Deload reasons. A lighter week ("recovery week", "deload week", "lighter week", "down week", "easy week") written in a
   plan.json block (volume, guide) or a week.json week row (label, focus) must name its reason in the same text as
   "(reason: <why>)", where <why> starts with taper, after <event> or one of the RULES 3 signals (fatigue, soreness, sleep,
   session quality, motivation, recovery strain, life stress, load jump, illness, injury). A calendar slot alone fails.
   Recover and Taper blocks are exempt (the phase is the reason), and so is a phrase that says the week is NOT one
   ("no recovery week", "not a recovery week").
2. Supersession sweep. A History line in CURRENT-STATE.md dated SWEEP_FROM or later that replaces or supersedes a decision
   names what was swept from the plan files: "Swept: <files or items>" or "Swept: none".

CLI: python3 coach/tools/drift_check.py   prints the problems, or "ok". Exit code 1 when there are problems.
key_check.py runs both checks too, so the morning run, the Sunday plan and the tests see them where they already look.
"""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULE_FROM = date(2026, 11, 30)   # week rows from this Monday; earlier weeks keep what was written at the time
SWEEP_FROM = date(2026, 11, 25)  # History lines from the day of the RCA
LIGHT = re.compile(r"\b(recovery|recover|deload|lighter|down|easy)\s+weeks?\b", re.I)
NEGATED = re.compile(r"\b(no|not a|not an|instead of a|without a)\s*$", re.I)
REASON = re.compile(r"\(reason:\s*(taper|after\s+\S+|fatigue|soreness|sleep|session quality|motivation|recovery strain|"
                    r"life stress|load jump|illness|injury)", re.I)
EXEMPT_PHASES = {"recover", "taper"}
HISTORY_LINE = re.compile(r"^- (\d{4}-\d{2}-\d{2}):(.*)$")
REPLACES = re.compile(r"\b(replaced|supersed\w*)\b", re.I)
SWEPT = re.compile(r"\bSwept:\s*\S", re.I)


def _light_without_reason(text):
    """True when the text names a lighter week that is not negated and carries no (reason: ...) tag."""
    if not text:
        return False
    hits = [m for m in LIGHT.finditer(text) if not NEGATED.search(text[:m.start()])]
    return bool(hits) and not REASON.search(text)


def deload_problems(plan_rows, week_rows, today=None):
    today = today or date.today()
    out = []
    for b in plan_rows:
        if b.get("kind") != "block" or str(b.get("phase", "")).lower() in EXEMPT_PHASES:
            continue
        if b.get("end") and date.fromisoformat(b["end"]) < today:
            continue
        for field in ("volume", "guide"):
            if _light_without_reason(b.get(field)):
                out.append(f"plan.json {b.get('key')} {field}: a lighter week needs '(reason: taper | after <event> | "
                           f"<RULES 3 signal>)'; deloads are not scheduled by calendar (RULES 3)")
    for w in week_rows:
        if w.get("kind") != "week" or date.fromisoformat(w["week_start"]) < RULE_FROM:
            continue
        if w.get("deload_reason"):
            continue
        text = " ".join(str(w.get(k) or "") for k in ("label", "focus"))
        if _light_without_reason(text):
            out.append(f"week.json week of {w['week_start']}: a lighter week needs deload_reason or '(reason: ...)' "
                       f"(RULES 3)")
    return out


def sweep_problems(current_state_text):
    out = []
    in_history = False
    for line in current_state_text.splitlines():
        if line.startswith("## "):
            in_history = line.strip().lower() == "## history"
            continue
        m = HISTORY_LINE.match(line) if in_history else None
        if not m or date.fromisoformat(m.group(1)) < SWEEP_FROM:
            continue
        if REPLACES.search(m.group(2)) and not SWEPT.search(m.group(2)):
            out.append(f"CURRENT-STATE History {m.group(1)}: a replaced decision names what was swept from the plan "
                       f"files ('Swept: ...' or 'Swept: none')")
    return out


def _load(rel):
    with open(os.path.join(ROOT, rel)) as f:
        j = json.load(f)
    return j.get("rows", j) if isinstance(j, dict) else j


def _plan_rows():
    with open(os.path.join(ROOT, "coach/plan.json")) as f:
        j = json.load(f)
    if isinstance(j, list):
        return j
    return next((v for v in j.values() if isinstance(v, list)), [])


def problems():
    probs = deload_problems(_plan_rows(), _load("coach/week.json"))
    cs = os.path.join(ROOT, "coach/CURRENT-STATE.md")
    if os.path.exists(cs):
        with open(cs) as f:
            probs += sweep_problems(f.read())
    return probs


def main():
    probs = problems()
    print("\n".join(probs) if probs else "ok")
    sys.exit(1 if probs else 0)


if __name__ == "__main__":
    main()
