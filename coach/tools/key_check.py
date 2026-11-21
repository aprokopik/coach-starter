"""Key sessions: exactly three every week (the athlete, Nov 3, 2026; rules in coach/engine/KEY-SESSIONS.md), and every week holds its
lift rows (the athlete, Nov 16, 2026).

The three key sessions are the three things that must happen that week for progress or the right discipline (80/20); a rest
day can be one of them. In coach/week.json a day row is a key session exactly when key is true and pillar is 1, 2 or 3, with
a one-line why. Every week from RULE_FROM on holds exactly one key row for each of 1, 2 and 3. Each block in coach/plan.json
carries three defaults (pillar_n and pillar_n_short), shown on the dashboard until the coach writes the week.

CLI: python3 coach/tools/key_check.py   prints the problems, or "ok". Exit code 1 when there are problems.
"""
import json
import os
import re
import sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULE_FROM = date(2026, 11, 2)  # weeks before this keep what was tagged at the time
# A lift gets its own row (6.36.0): on Nov 13, 2026 a lift lived only in a bike row's notes, so the plan never showed it
LIFT_RULE_FROM = date(2026, 11, 16)
# a title is what the person does, never a scheduling note (the athlete, Nov 21, 2026: "if it doesnt matter dont say", "this feels out of place")
NOTE_RULE_FROM = date(2026, 11, 23)
TITLE_NOTE = re.compile(r"any (?:day|time) that (?:fits|day)|\bafter the (?:ride|run|swim|lift)\b|\bbefore or after\b", re.I)
LIFT_WORD = re.compile(r"\blifts?\b", re.I)
# Every week holds its lift rows (the athlete, Nov 16, 2026: "you're not scheduling me for 2 lifts a week, but yet you're saying that
# is critical"). The week of Nov 9 had none and Nov 16 one plus an either-or, because CURRENT-STATE kept lifts out of the rows.
# From the week of LIFTS_FROM, each week needs as many lift rows as the target: the routine's per_week in coach/strength.json
# (the one home), else the profile's strength_minimum_per_week. A strength row counts; so does another row whose title names
# a lift, unless the title offers it as an either-or ("then a lift or an easy run"). A week whose week row carries
# lifts_exception (one line why: recover, taper, race, illness) is exempt.
LIFTS_FROM = date(2026, 11, 23)
EITHER_OR = re.compile(r"\bor\b", re.I)
# Where lifts rank in a short week (the athlete's choice, Nov 16, 2026: both lifts rank with the key sessions while weight comes off).
# layers). Baseline for everyone: lifts outrank easy volume (RULES.md minimum week). Scenario layer: a dated period in
# coach/plan.json carrying lift_rank "key" (every deficit period must carry it, so muscle is held while weight comes off) makes
# lifts rank with the three key sessions: a week inside it may only fall short for a reason that also stops key work.
# Block layer: the block brief's lift goal is per_week times the block's weeks.
HARD_STOP = re.compile(r"\b(ill|illness|sick|injur\w*|pain|recover\w*|taper|race)\b", re.I)


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


def counts_as_lift(r):
    if r.get("type") == "strength":
        return True
    t = r.get("title") or ""
    return bool(LIFT_WORD.search(t)) and not EITHER_OR.search(t)


def lift_target(root=ROOT):
    """Lift sessions a week: coach/strength.json lift_routine per_week, else the profile's strength_minimum_per_week, else 0."""
    for path, pick in (("coach/strength.json", lambda j: next((r.get("per_week") for r in j.get("rows", []) if r.get("kind") == "lift_routine"), None)),
                       ("coach/athlete/profile.json", lambda j: j.get("strength_minimum_per_week"))):
        f = os.path.join(root, path)
        if os.path.exists(f):
            with open(f) as fh:
                v = pick(json.load(fh))
            try:
                if v not in (None, ""):
                    return float(v)
            except (TypeError, ValueError):
                pass
    return 0


def problems(plan_rows, week_rows, target=0):
    """target: lift rows a week (main passes lift_target()); 0 skips the lift count."""
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
        if (d(r["date"]) >= LIFT_RULE_FROM and r.get("type") != "strength" and not LIFT_WORD.search(r.get("title") or "")
                and LIFT_WORD.search(r.get("detail") or "")):
            out.append(f"{where}: a lift is named only in the detail; give it its own strength row or name it in the title")
        if d(r["date"]) >= NOTE_RULE_FROM and TITLE_NOTE.search(r.get("title") or ""):
            out.append(f"{where}: drop the scheduling note from the title (order only when it matters goes in the detail)")
    exc = {r["week_start"]: r.get("lifts_exception") for r in week_rows if r.get("kind") == "week" and r.get("week_start")}
    fuel = [r for r in plan_rows if r.get("kind") == "fuel"]
    for r in fuel:  # a deficit period ranks lifts with the key sessions
        if r.get("mode") in ("deficit", "recovery_deficit") and r.get("lift_rank") != "key":
            out.append(f"{r.get('key')}: a deficit period needs lift_rank \"key\" (lifts hold muscle while weight comes off)")
    for wk in weeks:  # the week's lifts are on the calendar
        mon = d(wk)
        why = str(exc.get(wk) or "").strip()
        ranked = any(r.get("lift_rank") == "key" and d(r["start"]) <= mon + timedelta(days=6) and d(r["end"]) >= mon for r in fuel)
        if why and ranked and not HARD_STOP.search(why) and target and mon >= LIFTS_FROM:
            out.append(f"week of {wk}: lifts rank with the key sessions in this period; lifts_exception needs illness, injury, "
                       "pain, recovery, taper or a race, not {!r}".format(why))
            continue
        if not target or mon < LIFTS_FROM or why:
            continue
        n = sum(1 for r in days if mon <= d(r["date"]) <= mon + timedelta(days=6) and counts_as_lift(r))
        if n < target:
            out.append(f"week of {wk}: {n} lift row{'s' if n != 1 else ''}, the target is {target:g} a week "
                       "(add strength rows on days that fit, or give the week row a lifts_exception with the reason)")
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


def brief_problems(brief_rows, target):
    """The block brief's lift goal is the routine's per_week times the block's full weeks (one home: strength.json)."""
    out = []
    if not target:
        return out
    briefs = {r.get("block_key"): r for r in brief_rows if r.get("kind") == "brief"}
    for k in brief_rows:
        b = briefs.get(k.get("block_key"))
        if k.get("kind") != "brief_kpi" or k.get("key") != "lifts" or not b or not k.get("count_target"):
            continue
        if d(b["start"]) < LIFTS_FROM:  # briefs set before the rule keep what was agreed (Base: 12 = 2 x 6)
            continue
        want = round(target * ((d(b["end"]) - d(b["start"])).days + 1) // 7)
        if int(k["count_target"]) != want:
            out.append(f"{k['block_key']}: brief lift goal {k['count_target']} but {target:g} a week over the block is {want}")
    return out


def main():
    t = lift_target()
    probs = problems(_load("coach/plan.json"), _load("coach/week.json"), t)
    if os.path.exists(os.path.join(ROOT, "coach/block_briefs.json")):
        probs += brief_problems(_load("coach/block_briefs.json"), t)
    print("\n".join(probs) if probs else "ok")
    sys.exit(1 if probs else 0)


if __name__ == "__main__":
    main()
