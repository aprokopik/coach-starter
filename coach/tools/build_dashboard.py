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
rows.append({
    "kind": "build",
    "built_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "garmin_pull_utc": status.get("run_at_utc") or "",
    "version": open("VERSION").read().strip() if os.path.exists("VERSION") else "",
})

for r in read_json("coach/today.json", {"rows": []}).get("rows", []):
    rows.append({"kind": "today", **r})

for r in read_json("coach/week.json", {"rows": []}).get("rows", []):
    k = r.get("kind")
    if k in ("week", "day"):
        rows.append(dict(r))

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
        "footing": text(r.get("footing")),  # hilly runs and hikes only (the athlete, Nov 8, 2026): smooth, roots, technical, mud
    })

for r in read_csv("coach/vo2max.csv"):
    rows.append({"kind": "vo2max", "date": text(r.get("date")),
                 "vo2max_run": num(r.get("vo2max_run")), "vo2max_bike": num(r.get("vo2max_bike"))})

for r in read_json("coach/plan.json", {"rows": []}).get("rows", []):
    if r.get("kind") in ("meta", "block", "milestone", "fuel", "weight", "target"):
        rows.append(dict(r))

for r in read_json("coach/races.json", {"rows": []}).get("rows", []):
    if r.get("kind") in ("race", "race_note", "race_kit"):
        rows.append(dict(r))

for name in ("coach/zones.json", "coach/benchmarks.json", "coach/strength.json", "coach/levels.json", "coach/norms.json", "coach/fitness_layout.json"):
    for r in read_json(name, {"rows": []}).get("rows", []):
        rows.append(dict(r))

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
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import markers  # noqa: E402
rows.extend(markers.build(datetime.now(ZoneInfo("America/New_York")).date(), rows))
# Block brief for the Fitness tab's This block card (the athlete, Nov 1, 2026; coach/engine/BLOCK-BRIEF.md)
import brief  # noqa: E402
rows.extend(brief.rows_for_dashboard(datetime.now(ZoneInfo("America/New_York")).date(), [r for r in rows if r.get("kind") == "marker"]))
import streak  # noqa: E402
rows.append(streak.build())
# Health Pillars (Health tab) and the Check-ins tab's survey definitions (the athlete, Nov 1, 2026)
import pillars  # noqa: E402
rows.extend(pillars.build(datetime.now(ZoneInfo("America/New_York")).date(), rows))
_ci = read_json("coach/checkins.json", {"surveys": [], "questions": []})
rows.extend({"kind": "ci_survey", **s} for s in _ci.get("surveys", []))
rows.extend({"kind": "ci_q", **q} for q in _ci.get("questions", []))

os.makedirs("coach/dashboard", exist_ok=True)
with open("coach/dashboard/coach.json", "w") as fh:
    json.dump({"rows": rows}, fh, indent=0, ensure_ascii=False)
    fh.write("\n")

counts = {}
for r in rows:
    counts[r["kind"]] = counts.get(r["kind"], 0) + 1
print(len(rows), "rows:", ", ".join(f"{k} {v}" for k, v in counts.items()))
