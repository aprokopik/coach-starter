"""Which session leads on a day with two or more, and what to trim when time is short (coach/engine/session_rank.json).

Works for any person and goal mix: floors and focus come from coach/athlete/profile.json, then the block in plan.json,
then the defaults in the rule file. build_dashboard.py calls annotate() so every day row of a two session day carries
rank (0 leads), rank_why (one short line) and rank_keep (true: shorten, never skip). The morning check-in runs
    python3 coach/tools/session_rank.py [YYYY-MM-DD]
and names the lead first in workout_title, with the printed trim line.
"""
import datetime as dt
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _read(rel, default):
    p = os.path.join(ROOT, rel)
    try:
        with open(p) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _d(s):
    return dt.date.fromisoformat(str(s)[:10])


def _truthy(v):
    return v is True or v in ("true", 1, "1")


def kind_of(row, rules):
    t = str(row.get("type") or "").lower()
    for k, types in rules["kinds"].items():
        if t in types:
            return k
    return "other"


def _is_key(row):
    return _truthy(row.get("key")) or row.get("pillar") not in (None, "")


def _period(rows, kind, date):
    for r in rows:
        if r.get("kind") == kind and r.get("start") and r.get("end") and _d(r["start"]) <= date <= _d(r["end"]):
            return r
    return None


def settings(rules, profile, plan_rows, date):
    """Floors and focus for this person on this date: profile, then block, then rule defaults."""
    floors = {}
    for k, f in rules["floors"].items():
        v = profile.get(f.get("profile_key")) if profile else None
        floors[k] = int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else int(f["per_week"])
    focus = dict(rules["focus_default"])
    focus.update({k: float(v) for k, v in (profile or {}).get(rules["focus_profile_key"], {}).items() if isinstance(v, (int, float))})
    block = _period(plan_rows, "block", date)
    if block:
        focus.update({k: float(v) for k, v in (block.get(rules["focus_block_key"]) or {}).items() if isinstance(v, (int, float))})
    fuel = _period(plan_rows, "fuel", date)
    lift_key = bool(fuel and fuel.get("lift_rank") == "key")
    if lift_key:
        focus["strength"] = focus.get("strength", 1) * float(rules["lift_rank_key"]["factor"])
    return floors, focus, lift_key


def rank_day(day_rows, week_rows, date, rules, profile=None, plan_rows=(), today=None):
    """day_rows: the date's non-rest day rows. week_rows: every day row of that Monday to Sunday week.
    Returns [(row, rank, why, keep)] in lead-first order."""
    date = _d(date)
    floors, focus, lift_key = settings(rules, profile or {}, list(plan_rows), date)
    counts = {}
    for r in week_rows:
        if r.get("kind", "day") == "day" and str(r.get("type")) != "rest":
            k = kind_of(r, rules)
            counts[k] = counts.get(k, 0) + 1
    health = False
    if today and str(today.get("date", ""))[:10] == date.isoformat():
        h = rules["health_levels"]
        health = str(today.get("readiness", "")).upper() in h["readiness"] or str(today.get("level", "")).lower() in h["level"]
    load = rules["load_order"]
    scored = []
    for r in day_rows:
        k = kind_of(r, rules)
        n = max(counts.get(k, 1), 1)
        fixed = str(r.get("type")) in ("test", "race") or str(r.get("intensity")) in ("test", "race")
        below = k in floors and n - 1 < floors[k]
        lift_floor = k == "strength" and lift_key
        keep = _is_key(r) or fixed or below or lift_floor
        word = {"strength": "lift", "cardio": "cardio session"}.get(k, "session")
        if fixed:
            tier, why = 1, "Fixed date"
        elif _is_key(r):
            tier, why = 2, "Key session"
        elif below:
            tier, why = 3, f"Only {n} {word}{'' if n == 1 else 's'} this week and {floors[k]} a week is the floor ({rules['floors'][k]['source']})"
        elif lift_floor:
            tier, why = 3, f"Lifts count as a floor in a deficit ({rules['lift_rank_key']['source']})"
        else:
            tier, why = 4, f"One of {n} {word}{'' if n == 1 else 's'} this week"
        score = focus.get(k, focus.get("other", 0.5)) / n
        if health:
            tier, why, keep = 0, "Health first today: the easiest session leads", False
            score = -load.get(str(r.get("intensity") or ""), 2)
        scored.append((tier, -score, r.get("order") or 0, r, why, keep))
    scored.sort(key=lambda x: x[:3])
    return [(s[3], i, s[4], s[5]) for i, s in enumerate(scored)]


def annotate(rows, today=None, rules=None, profile=None, plan_rows=None):
    """Adds rank, rank_why and rank_keep to the day rows of every day holding two or more sessions."""
    rules = rules or _read("coach/engine/session_rank.json", None)
    if not rules:
        return rows
    profile = profile if profile is not None else _read("coach/athlete/profile.json", {})
    plan_rows = plan_rows if plan_rows is not None else _read("coach/plan.json", {"rows": []}).get("rows", [])
    days = [r for r in rows if r.get("kind") == "day" and r.get("date")]
    by_date = {}
    for r in days:
        by_date.setdefault(str(r["date"])[:10], []).append(r)
    for date, rs in by_date.items():
        live = [r for r in rs if str(r.get("type")) != "rest"]
        if len(live) < 2:
            continue
        mon = _d(date) - dt.timedelta(days=_d(date).weekday())
        week = [r for r in days if mon <= _d(r["date"]) <= mon + dt.timedelta(days=6)]
        for r, rank, why, keep in rank_day(live, week, date, rules, profile, plan_rows, today):
            r["rank"], r["rank_why"], r["rank_keep"] = rank, why, keep
    return rows


def trim_line(ranked, rules=None):
    """One plain line: what stays and what goes when time is short."""
    if len(ranked) < 2:
        return ""
    lead = ranked[0][0]
    parts = [f"Short on time: keep {lead.get('title', 'the first session')} whole"]
    for r, _, _, keep in ranked[1:]:
        m = r.get("fallback_minutes")
        cut = f"cut {r.get('title', 'the next session')} to {m} min" if m else f"shorten {r.get('title', 'the next session')}"
        parts.append(cut + ("" if keep else ", or skip it"))
    return "; ".join(parts) + "."


def main(argv):
    date = argv[1] if len(argv) > 1 else dt.date.today().isoformat()
    rules = _read("coach/engine/session_rank.json", None)
    rows = _read("coach/week.json", {"rows": []}).get("rows", [])
    today = (_read("coach/today.json", {"rows": []}).get("rows") or [None])[0]
    annotate(rows, today, rules)
    ranked = sorted([r for r in rows if r.get("kind") == "day" and str(r.get("date"))[:10] == date and "rank" in r], key=lambda r: r["rank"])
    if not ranked:
        print(f"{date}: one session or none, nothing to rank")
        return 0
    for r in ranked:
        print(f"{r['rank'] + 1}. {r.get('title')} | {r['rank_why']} | {'shorten, never skip' if r['rank_keep'] else 'may be skipped'}")
    print(trim_line([(r, r["rank"], r["rank_why"], r["rank_keep"]) for r in ranked]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
