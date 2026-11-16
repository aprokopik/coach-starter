"""Build coach/dashboard/coach.json, the dashboard's one coach-owned dataset.

Combines the coach's own files into rows tagged by `kind`, so each morning run
uploads a single file for everything the coach writes. Garmin data stays in
data/summary.csv and data/activities.csv (their own datasets).

Run from the repo root, after coach/tools/vo2max.py:
    python3 coach/tools/build_dashboard.py
"""
import csv
import json
import os
import re
from datetime import datetime, timezone


def num(v):
    """Number from a cell; a bucket like "6-7" or "8-10" becomes its midpoint; blank -> None."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", s)
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def text(v):
    return "" if v is None else str(v).strip()


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as fh:
        return json.load(fh)


def discipline(t):
    t = (t or "").lower()
    if "swim" in t:
        return "swim"
    if any(k in t for k in ("cycl", "ride", "bik", "zwift")):
        return "bike"
    if "run" in t:
        return "run"
    if "strength" in t:
        return "strength"
    if any(k in t for k in ("walk", "hik")):
        return "walk"
    return "other"


rows = []

status = read_json("data/status/last_run.json", {})
# when the morning check-in runs and whether a daytime refresh task exists: one home, coach/ops/data_paths.json
_paths = {p.get("id"): p for p in read_json("coach/ops/data_paths.json", {}).get("paths", [])}
rows.append({
    "kind": "build",
    "built_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "garmin_pull_utc": status.get("run_at_utc") or "",
    "version": open("VERSION").read().strip() if os.path.exists("VERSION") else "",
    "checkin_at": _paths.get("morning_checkin", {}).get("at") or "7:45 AM",
    "daytime_refresh": "daytime_refresh" in _paths,
})

for r in read_json("coach/today.json", {"rows": []}).get("rows", []):
    rows.append({"kind": "today", **r})

_check_day = ((read_json("coach/athlete/profile.json", {}).get("plan_check_day") or {}).get("day") or "Fri")[:3].title()
for r in read_json("coach/week.json", {"rows": []}).get("rows", []):
    k = r.get("kind")
    if k in ("week", "day"):
        row = dict(r)
        if k == "week" and row.get("status") == "pencilled":
            row["check_day"] = _check_day  # the day the coach checks the week with the person (profile.json plan_check_day)
        rows.append(row)

def to5(v, scale):
    """Feel scores are 1-5 from Oct 18, 2026 (the athlete); older 1-10 answers are rescaled linearly for trends."""
    if v is None or scale == "5":
        return v
    return round(1 + (v - 1) * 4 / 9, 1)


for r in read_csv("coach/feel_daily.csv"):
    if not text(r.get("date")):
        continue
    sc = text(r.get("scale")) or "10"
    rows.append({
        "kind": "feel_day",
        "date": text(r.get("date")),
        "scale": 5,
        "sleep_q": to5(num(r.get("sleep_q")), sc),
        "energy": to5(num(r.get("energy")), sc),
        "legs": to5(num(r.get("legs")), sc),
        "stress": to5(num(r.get("stress")), sc),
        "pain": num(r.get("pain")),
        "pain_site": text(r.get("pain_site")),
        "raw": ";".join(text(r.get(k)) for k in ("sleep_q", "energy", "legs", "stress", "pain")),
    })

for r in read_csv("coach/feel_sessions.csv"):
    if not text(r.get("date")):
        continue
    act = text(r.get("activity"))
    aid = text(r.get("activity_id"))
    if not aid:
        m = re.search(r"\((\d{6,})\)", act)
        aid = m.group(1) if m else ""
    rows.append({
        "kind": "feel_session",
        "date": text(r.get("date")),
        "activity_id": aid,
        "activity": act,
        "discipline": discipline(act.split(":")[0] if ":" in act else act),
        "minutes": num(r.get("minutes")),
        "rpe": num(r.get("rpe")),
        "srpe_load": num(r.get("srpe_load")),
        "vs_plan": text(r.get("vs_plan")),
        "pain": num(r.get("pain")),
        "pain_site": text(r.get("pain_site")),
        "fuel": text(r.get("fuel")),
        "footing": text(r.get("footing")),  # hilly runs and hikes only: easy, moderate, tough, hard, expert (the athlete, Nov 12, 2026); older rows smooth, roots, technical, mud
        "ground": text(r.get("ground")),  # wet;mud;snow ticks, empty = dry (Nov 12, 2026)
    })

for r in read_csv("coach/vo2max.csv"):
    rows.append({"kind": "vo2max", "date": text(r.get("date")),
                 "vo2max_run": num(r.get("vo2max_run")), "vo2max_bike": num(r.get("vo2max_bike"))})

# The weight goal's home is coach/athlete/profile.json (one home, the athlete, Nov 12, 2026): the plan.json target and wt
# milestone rows take their range and date from it, so the dashboard can never show a stale copy.
_wgoal = (read_json("coach/athlete/profile.json", {}).get("weight") or {})
for r in read_json("coach/plan.json", {"rows": []}).get("rows", []):
    if r.get("kind") in ("meta", "block", "milestone", "fuel", "weight", "target"):
        r = dict(r)
        if _wgoal.get("target_lo") is not None and _wgoal.get("target_by"):
            lo, hi, by = _wgoal["target_lo"], _wgoal["target_hi"], _wgoal["target_by"]
            if r.get("kind") == "target" and r.get("key") == "weight":
                r.update({"lo": lo, "hi": hi, "start": by, "name": f"Target {lo:g} to {hi:g} lb"})
            if r.get("kind") == "milestone" and r.get("key") == "wt":
                r.update({"date": by, "name": f"Weight target {lo:g} to {hi:g} lb"})
        rows.append(r)

# The weekly hours budget's home is coach/athlete/profile.json too (budget_hours): one target row with today's range,
# so the page never types a budget of its own (6.61.0; the scorecard said "5 to 7 h" to everyone before).
_bh = read_json("coach/athlete/profile.json", {}).get("budget_hours") or {}
_day = datetime.now(timezone.utc).date().isoformat()
_per = next((p for p in _bh.get("periods", []) if str(p.get("start", "")) <= _day <= str(p.get("end", ""))), None)
_rng = [_per["lo"], _per["hi"]] if _per else _bh.get("default")
if _rng and len(_rng) == 2 and None not in _rng:
    rows.append({"kind": "target", "key": "hours", "name": f"Weekly budget {_rng[0]:g} to {_rng[1]:g} h", "lo": _rng[0], "hi": _rng[1]})

for r in read_json("coach/races.json", {"rows": []}).get("rows", []):
    if r.get("kind") in ("race", "race_note", "race_kit"):
        rows.append(dict(r))

for name in ("coach/zones.json", "coach/benchmarks.json", "coach/strength.json", "coach/routines.json", "coach/my_routines.json", "coach/levels.json", "coach/norms.json", "coach/fitness_layout.json", "coach/race_tree.json"):
    for r in read_json(name, {"rows": []}).get("rows", []):
        rows.append(dict(r))
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alpha  # noqa: E402
import key_lifts  # noqa: E402
if alpha.on("strength_levels"):
    rows[:] = key_lifts.strength_order(rows)  # alpha strength_levels: Strength group in health order, old lift tiles off

# Per-exercise lift history and block-start rotation proposals for the Lifts tab (coach/tools/lifts.py, Oct 24, 2026)
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lifts  # noqa: E402

for r in read_json("coach/lift_history.json", {"rows": []}).get("rows", []):
    rows.append({k: v for k, v in r.items() if k != "recent"})
rows.extend(lifts.proposal_rows())

# Time in heart rate zones per activity: Garmin's 2-minute all-day HR samples inside each
# activity's window, binned with the zones in coach/zones.json (sport-specific). Walks and
# sauna are left out. Each sample counts as 2 minutes.
import glob
from datetime import timedelta

zones = {}
for z in read_json("coach/zones.json", {"rows": []}).get("rows", []):
    zones.setdefault(z["set"], []).append((int(z["zone"]), float(z["lo"])))
for k in zones:
    zones[k].sort()


def zone_of(hr, zset):
    found = 1
    for n, lo in zones.get(zset, []):
        if hr >= lo:
            found = n
    return found


hr_cache = {}


def day_hr(date):
    if date not in hr_cache:
        d = read_json(f"data/daily/{date}.json", {})
        vals = (((d.get("responses") or {}).get("heart_rates") or {}).get("heartRateValues")) or []
        hr_cache[date] = [(int(t), int(v)) for t, v in vals if t is not None and v]
    return hr_cache[date]


for f in sorted(glob.glob("data/activities/*.json")):
    a = read_json(f, {})
    s = a.get("summary") or {}
    tkey = ((s.get("activityType") or {}).get("typeKey")) or ""
    name = s.get("activityName") or ""
    disc = "sauna" if "sauna" in name.lower() else discipline(tkey)
    if disc in ("walk", "sauna") or not s.get("startTimeGMT"):
        continue
    start = datetime.strptime(s["startTimeGMT"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    secs = float(s.get("elapsedDuration") or s.get("duration") or 0)
    t0, t1 = start.timestamp() * 1000, start.timestamp() * 1000 + secs * 1000
    local = (s.get("startTimeLocal") or s["startTimeGMT"])[:10]
    nxt = (datetime.strptime(local, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    samples = [v for t, v in day_hr(local) + day_hr(nxt) if t0 <= t < t1]
    if not samples:
        continue
    zset = "run" if disc == "run" else "bike" if disc == "bike" else "default"
    mins = {n: 0 for n in range(1, 6)}
    for v in samples:
        mins[zone_of(v, zset)] += 2
    rows.append({"kind": "hrz", "activity_id": str(a.get("activity_id") or s.get("activityId")), "date": local,
                 "discipline": disc, "set": zset, "n": len(samples),
                 "z1": mins[1], "z2": mins[2], "z3": mins[3], "z4": mins[4], "z5": mins[5]})

for r in read_csv("coach/weight_reported.csv"):
    rows.append({"kind": "weight_reported", "start": text(r.get("start")), "end": text(r.get("end")),
                 "low_lb": num(r.get("low_lb")), "high_lb": num(r.get("high_lb")),
                 "source": text(r.get("source")), "note": text(r.get("note"))})

# Fitness performance and health/longevity markers (Trends tab), coach/tools/markers.py
import sys
from zoneinfo import ZoneInfo
# Today on the person's own clock: profile.json `timezone` (the original athlete's is America/New_York); 6.93.0
try:
    TZ = ZoneInfo(read_json("coach/athlete/profile.json", {}).get("timezone") or "America/New_York")
except Exception:  # noqa: BLE001 - an unknown zone name keeps the original clock
    TZ = ZoneInfo("America/New_York")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import markers  # noqa: E402
import hr_anchor  # noqa: E402
# The heart rates the easy-effort markers are read at, this athlete's own (the athlete, Nov 14, 2026); calc.js reads this row
hr_anchor.use(".", datetime.now(TZ).date())
rows.append(hr_anchor.row(".", datetime.now(TZ).date()))
rows.extend(markers.build(datetime.now(TZ).date(), rows))
# Habits to build, the rows the Today card shows (the athlete, Nov 15, 2026); profile.json habits is their one home (BLOCK-BRIEF.md 2.5)
# At most three at once (the athlete, Nov 16, 2026); habits.py HABITS_MAX is the one home for that number
import habits  # noqa: E402
_hab = habits.load(".")
if habits.capped(_hab.get("rows")):
    rows.append({"kind": "habits", "rows": "|".join(habits.capped(_hab["rows"])), "confirmed": _hab.get("confirmed", "")})
# Block brief for the Fitness tab's This block card (the athlete, Nov 1, 2026; coach/engine/BLOCK-BRIEF.md)
import brief  # noqa: E402
rows.extend(brief.rows_for_dashboard(datetime.now(TZ).date(), [r for r in rows if r.get("kind") == "marker"]))
import streak  # noqa: E402
rows.append(streak.build())
# The three outcomes, one row per finished Sunday to Saturday week (roadmap week 2, Measure; 6.8.0)
import outcomes  # noqa: E402
rows.extend(outcomes.history(datetime.now(TZ).date()))
# Health Pillars (Health tab) and the Check-ins tab's survey definitions (the athlete, Nov 1, 2026)
import pillars  # noqa: E402
rows.extend(pillars.build(datetime.now(TZ).date(), rows))
# The metric catalog with each metric's state for this athlete (the athlete, Nov 12, 2026; 6.30.0): locked tiles and Add a metric
# Lab results with trend and retest date, and the health gate (roadmap week 5, Medicine in the loop; 6.42.0)
import labs  # noqa: E402
rows.extend(labs.build(datetime.now(TZ).date(), "."))
import catalog  # noqa: E402
rows.extend(catalog.rows("."))
_ci = read_json("coach/checkins.json", {"surveys": [], "questions": []})
# Goal-first onboarding (kit, 6.31.0): the "setup" survey shows only to a coach whose profile.json has goals, until
# setup_answers.py closes it; a question with a `module` shows only when goals.modules names it.
_prof = read_json("coach/athlete/profile.json", {})
_mods = (_prof.get("goals") or {}).get("modules")
_setup_on = _mods is not None and not (_prof.get("setup") or {}).get("closed")
# The home blood pressure week survey shows only to someone who keeps those weeks (setup drops the home_bp path
# when it was not chosen; same rule as morning_facts.bp_week_flags; 6.90.0)
_off = set() if any(p.get("id") == "home_bp" for p in read_json("coach/ops/data_paths.json", {}).get("paths", [])) else {"half"}
rows.extend({"kind": "ci_survey", **s} for s in _ci.get("surveys", [])
            if (s.get("id") != "setup" or _setup_on) and s.get("id") not in _off)
rows.extend({"kind": "ci_q", **q} for q in _ci.get("questions", [])
            if (q.get("survey") != "setup" or _setup_on) and q.get("survey") not in _off
            and (not q.get("module") or q["module"] in (_mods or [])))
# Alpha features (the athlete, Nov 16, 2026): coach/ops/alpha.json is their one home and never ships in the kit, so only the
# original athlete gets kind alpha rows; a page feature in alpha stays off without its row (lifts.js alpha(id)).
rows.extend({"kind": "alpha", "id": b.get("id"), "name": b.get("name")}
            for b in read_json("coach/ops/alpha.json", {}).get("rows", []) if b.get("status") == "alpha")
# When the next home BP week is due: 6 months after a Good week, 3 after Watch or Act (the athlete, Nov 10, 2026; 6.4.0)
import bp_cadence  # noqa: E402
rows.append({"kind": "bp_week", **bp_cadence.from_repo(".", datetime.now(TZ).date())})
# Weekly summary rows for a connected project's Sunday review (roadmap week 3, One contract; 6.12.0).
# Written only when coach/connections.json names a reader; fields fixed in coach/ops/contract.json.
import summary  # noqa: E402
rows.extend(summary.build(datetime.now(TZ).date(), rows))
# When today changes (6.64.0, Closed loops): the last week of day-of changes; Today shows today's replan note
import day_change  # noqa: E402
rows.extend(day_change.rows(datetime.now(TZ).date()))
# Next week's review on Today (alpha week_review; the athlete's pick, option 1 of five, Nov 16, 2026): the plan check day and next
# week's answer, so review.js shows the card on that day and, after a tap, what the coach moved
import week_review  # noqa: E402
rows.append({"kind": "plan_check", "day": _check_day})
rows.extend(week_review.rows(datetime.now(TZ).date()))
import checkin_tasks  # noqa: E402
rows.extend(checkin_tasks.rows())  # the Check-ins card (tasks.js): which check-ins the coach sends, and when
# Meal guide rows for a connected meal planner, today and 13 days ahead (the athlete, Nov 3 and Nov 11, 2026; week 3 PR 2)
import meal_guide  # noqa: E402
rows.extend(meal_guide.build(datetime.now(TZ).date()))

# Units (A coach for any person, Nov 16, 2026): numbers and words in the person's own units, at this one edge.
import units  # noqa: E402
rows = units.rows(rows)

os.makedirs("coach/dashboard", exist_ok=True)
with open("coach/dashboard/coach.json", "w") as fh:
    json.dump({"rows": rows}, fh, indent=0, ensure_ascii=False)
    fh.write("\n")

counts = {}
for r in rows:
    counts[r["kind"]] = counts.get(r["kind"], 0) + 1
print(len(rows), "rows:", ", ".join(f"{k} {v}" for k, v in counts.items()))
