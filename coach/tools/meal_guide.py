"""Meal guide rows for a connected meal planner (roadmap week 3, One contract, PR 2; 7.1.0).

the athlete asked (Nov 3 and again Nov 11, 2026, on the Project Board): give Chef concrete dietary targets that follow
training, as guidance, not gospel. One `meal_guide` row per date for today and the next 13 days, built only
when coach/connections.json names a project that reads `meal_guide` (only the original athlete's repo has it).
Fields are fixed in coach/ops/contract.json; coach/tests/test_meal_guide.py guards them.

    date             YYYY-MM-DD
    day_type         rest, easy, quality, long, test, race, or unplanned (no week.json row yet)
    session          the plan row's title, or "" (no health detail)
    day_before       "long", "quality", "test" or "race" when tomorrow is one, else ""
    fuel_key         the plan.json fuel period in force (shortest covering period wins, as morning_facts)
    energy           deficit or maintenance, by the same rule as morning_facts.fuel_mode: maintenance on a key,
                     quality, long, test or race day and the day before; a deficit day only once 2 lifts are on
                     record in the 7 days before (the A plus C blend, 6.8.0)
    kcal_offset_lo, kcal_offset_hi   versus maintenance (deficit -300 to -200, maintenance 0 to 0)
    protein_g_lo, protein_g_hi       140 to 160 in a deficit period (about 150 g a day, 6.8.0), else 120 to 150
    carb_emphasis    moderate (rest, easy), high (quality, long, test, race, or the day before one)
    carb_g_per_kg_lo, carb_g_per_kg_hi   3 to 5 moderate, 5 to 7 quality, 6 to 8 long, test, race or day before
    carb_g_lo, carb_g_hi             the same in grams at the plan path weight for the date
    timing           one line
    minutes          planned training minutes that day (0 on a rest day; the Coach owns the calendar, the athlete Nov 11)
    time_of_day      morning, midday or evening when the plan row carries a `time`, else ""
    extras           nutrition practices and supplements that apply that date, from coach/nutrition_extras.json
                     (the athlete chose the full list on the card, Nov 11, 2026): [{item, kind, timing, why, evidence}].
                     Only items with status active; hold items (waiting on labs) are never sent
    basis            what drives the row, in words
    confidence       high (planned day, today or tomorrow), medium (planned day further out), low (unplanned)
    generated_at     UTC time of the build

Maintenance itself is not estimated: the data has no resting energy measure, so Chef applies the offsets to its
own portions. Every number is Estimated guidance. Never a weight, heart rate or marker value beyond the plan path
weight the grams are computed from (not written to the row).

    python3 coach/tools/meal_guide.py --date 2026-11-12
"""
import argparse
import csv
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import morning_facts as mf  # noqa: E402
import summary  # noqa: E402

DAYS = 14
EXTRAS = "coach/nutrition_extras.json"



def _person_tz():
    """Today on the person's own clock: profile.json `timezone`, else the original athlete's (6.93.0)."""
    from zoneinfo import ZoneInfo
    try:
        return ZoneInfo(json.load(open("coach/athlete/profile.json")).get("timezone") or "America/New_York")
    except Exception:  # noqa: BLE001
        return ZoneInfo("America/New_York")

def extras_for(rules_hit, catalog, day=None):
    return [{"item": x["item"], "kind": x.get("kind", ""), "timing": x.get("timing", ""), "why": x.get("why", ""),
             "evidence": x.get("evidence", "")}
            for x in catalog if x.get("status") == "active" and x.get("when") in rules_hit
            and not (day and x.get("active_from") and day.isoformat() < x["active_from"])]
HARD = ("quality", "long", "test", "race")
CARB_KG = {"moderate": (3, 5), "quality": (5, 7), "long": (6, 8)}
LB_PER_KG = 2.20462


def _json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as fh:
        return json.load(fh)


def _csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _d(s):
    return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()


def _day_ok(s):
    try:
        _d(s)
        return True
    except ValueError:
        return False


def plan_weight_kg(plan, day):
    """The plan path midpoint for the date (plan.json weight points, linear between them), in kg."""
    pts = sorted(((_d(x["date"]), x["mid"]) for x in plan if x.get("kind") == "weight" and x.get("mid") is not None))
    if not pts:
        return None
    if day <= pts[0][0]:
        return pts[0][1] / LB_PER_KG
    for (d0, a), (d1, b) in zip(pts, pts[1:]):
        if d0 <= day <= d1:
            return (a + (b - a) * (day - d0).days / max((d1 - d0).days, 1)) / LB_PER_KG
    return pts[-1][1] / LB_PER_KG


def day_type(rows):
    if not rows:
        return "unplanned"
    kinds = [r.get("intensity") or r.get("type") for r in rows]
    for k in ("race", "test", "long", "quality"):
        if k in kinds:
            return k
    if any(r.get("key") for r in rows if r.get("type") != "rest"):
        return "quality" if any((r.get("minutes") or 0) >= 60 for r in rows) else "easy"
    return "rest" if all(r.get("type") == "rest" for r in rows) else "easy"


def build(today, root=".", now=None):
    if not summary.connected("meal_guide", root):
        return []
    plan = _json(os.path.join(root, "coach/plan.json"), {"rows": []}).get("rows", [])
    week = [r for r in _json(os.path.join(root, "coach/week.json"), {"rows": []}).get("rows", []) if r.get("kind") == "day"]
    data = {"strength_log": _csv(os.path.join(root, "coach/strength_log.csv")),
            "feel_sessions": _csv(os.path.join(root, "coach/feel_sessions.csv")),
            "acts": [a for a in _csv(os.path.join(root, "data/activities.csv")) if (a.get("local_start") or "")[:10] <= today.isoformat()]}
    catalog = _json(os.path.join(root, EXTRAS), {"items": []}).get("items", [])
    # Big days for around_big: races (week plan, or registered or planned in races.json) get 5 days before to 3
    # after; tests (week plan, or a test milestone in plan.json) are short, so only the day before to the day after.
    # Keeps tart cherry a recovery tool, not a daily habit.
    races = {r.get("date") for r in week if "race" in (r.get("intensity"), r.get("type"))}
    races |= {r.get("date") for r in _json(os.path.join(root, "coach/races.json"), {"rows": []}).get("rows", [])
              if r.get("kind") == "race" and r.get("status") in ("registered", "planned")}
    tests = {r.get("date") for r in week if "test" in (r.get("intensity"), r.get("type"))}
    tests |= {m.get("date") for m in plan if m.get("kind") == "milestone" and "test" in (m.get("name") or "").lower()}
    windows = [(_d(b), 5, 3) for b in races if b and _day_ok(b)] + [(_d(b), 1, 1) for b in tests if b and _day_ok(b)]
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def rows_on(day):
        return sorted([r for r in week if r.get("date") == day.isoformat()], key=lambda r: r.get("order", 1))

    def hard(rows):
        return any(r.get("key") and r.get("type") != "rest" or r.get("intensity") in HARD for r in rows)

    out = []
    for i in range(DAYS):
        day = today + timedelta(days=i)
        rows, nxt = rows_on(day), rows_on(day + timedelta(days=1))
        dt, nt = day_type(rows), day_type(nxt)
        before = nt if nt in HARD else ""
        periods = [p for p in plan if p.get("kind") == "fuel" and _d(p["start"]) <= day <= _d(p["end"])]
        period = min(periods, key=lambda p: (_d(p["end"]) - _d(p["start"])).days) if periods else {}
        mode = period.get("mode") or "maintenance"
        why = [period.get("label") or "no fuel period"]
        energy = "deficit" if mode == "deficit" else "maintenance"
        if energy == "deficit" and (hard(rows) or hard(nxt)):
            energy = "maintenance"
            why.append("key or hard session today or tomorrow")
        if energy == "deficit":
            lifts = mf.lift_days(data, day - timedelta(days=7), min(day - timedelta(days=1), today))
            if len(lifts) < mf.LIFT_GATE:
                energy = "maintenance"
                why.append(f"{len(lifts)} of {mf.LIFT_GATE} lifts on record in the 7 days before: lift first, then the deficit day unlocks")
        if dt == "unplanned":
            why.append("no plan row yet; refreshed each morning")
        band = "long" if dt in ("long", "test", "race") or before in ("long", "test", "race") else "quality" if dt == "quality" or before == "quality" else "moderate"
        lo_kg, hi_kg = CARB_KG[band]
        kg = plan_weight_kg(plan, day)
        if dt in ("long", "race", "test"):
            timing = "Carbs at breakfast and in the meal 2 to 3 h before; 60 to 90 g carb per hour during sessions over 90 min; protein and carbs within an hour after."
        elif dt == "quality":
            timing = "Carbs in the meal 2 to 3 h before the session; protein and carbs within an hour after."
        elif before:
            timing = f"Carb forward dinner tonight for tomorrow's {before} session."
        else:
            timing = "Protein spread over three feedings; carbs around any session."
        live = [r for r in rows if r.get("type") != "rest"]
        hit = {"daily"}
        if any(b - timedelta(days=pre) <= day <= b + timedelta(days=post) for b, pre, post in windows):
            hit.add("around_big")
        if dt in HARD:
            hit.add("before_key")
        if dt in HARD or any(r.get("type") == "strength" for r in live):
            hit.add("lift_or_hard")
        if any((r.get("minutes") or 0) >= 120 for r in live):
            hit.add("long_2h")
        if any(r.get("type") == "strength" or any(w in (r.get("title") or "").lower() for w in ("hill", "jump", "plyo")) for r in live):
            hit.add("lift_or_hills")
        if any(r.get("type") == "bike" and (r.get("minutes") or 0) >= 90 for r in live):
            hit.add("ride_90")
        if any(r.get("type") == "bike" and (r.get("key") or r.get("intensity") in ("quality", "test")) for r in live):
            hit.add("trial_key_bike")
        out.append({
            "kind": "meal_guide",
            "date": day.isoformat(),
            "day_type": dt,
            "session": "; ".join(r.get("title") or "" for r in rows if r.get("type") != "rest"),
            "day_before": before,
            "fuel_key": period.get("key") or "",
            "energy": energy,
            "kcal_offset_lo": -300 if energy == "deficit" else 0,
            "kcal_offset_hi": -200 if energy == "deficit" else 0,
            "protein_g_lo": 140 if mode == "deficit" else 120,
            "protein_g_hi": 160 if mode == "deficit" else 150,
            "carb_emphasis": "moderate" if band == "moderate" else "high",
            "carb_g_per_kg_lo": lo_kg,
            "carb_g_per_kg_hi": hi_kg,
            "carb_g_lo": round(lo_kg * kg / 10) * 10 if kg else None,
            "carb_g_hi": round(hi_kg * kg / 10) * 10 if kg else None,
            "timing": timing,
            "minutes": sum(int(r.get("minutes") or 0) for r in live),
            "time_of_day": next((r["time"] for r in live if r.get("time")), ""),
            "extras": extras_for(hit, catalog, day),
            "basis": "; ".join(why),
            "confidence": "low" if dt == "unplanned" else "high" if i <= 1 else "medium",
            "generated_at": stamp,
        })
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date", help="first day (default today on the person's own clock, profile.json timezone)")
    a = ap.parse_args()
    from zoneinfo import ZoneInfo
    d = _d(a.date) if a.date else datetime.now(_person_tz()).date()
    for r in build(d):
        print(json.dumps(r))
