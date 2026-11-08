#!/usr/bin/env python3
"""Turn a fresh Coach starter kit into one athlete's coach, from their answers.

    python3 setup/personalize.py setup/answers.json            # write the personal files
    python3 setup/personalize.py setup/answers.json --check    # say what is still missing, change nothing
    python3 setup/personalize.py setup/answers.json --refresh  # after a kit update (setup/update.py): re-apply settings only

Claude runs this during onboarding (ONBOARDING-PROMPT.md) after the interview has filled
setup/answers.json (shape: setup/answers.example.json). Without --refresh it rewrites every personal
file from the answers, so after onboarding use --refresh (a full run would reset CURRENT-STATE and LOG), and every {{PLACEHOLDER}} still present in the tree is filled
from the answers (so adding the dashboard link later and re-running finishes the job).

It writes: coach/athlete/profile.json, PROFILE.md, screen.json, RESPONSE-PROFILE.md;
coach/CURRENT-STATE.md, coach/LOG.md, coach/races.json, coach/plan.json (season start),
coach/fitness_layout.json, coach/zones.json, coach/ops/data_paths.json task ids, and
the Garmin pull schedule in .github/workflows/pull-garmin.yml for the athlete's time zone.
Standard library only.
"""
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
TEXT = {".md", ".json", ".py", ".js", ".css", ".html", ".sh", ".yml", ".yaml", ".txt"}
NO_REWRITE = {"coach/dashboard/charts.js", "coach/dashboard/cockpit.js", "setup/personalize.py",
              "setup/answers.example.json", "setup/answers.json"}

SCREEN_QUESTIONS = [
    "heart condition or high blood pressure", "chest pain or pressure",
    "dizziness or loss of consciousness in 12 months", "other chronic condition",
    "prescribed medication for a chronic condition", "musculoskeletal problem in 12 months",
    "medical supervision or restriction", "exertional symptoms",
    "family history of sudden death or inherited heart disease", "murmur or abnormal heart test",
    "currently exercising regularly", "anything else",
]
# A "yes" to any of these (or "unsure") holds hard training until a clinician clears it (engine/SCREEN.md).
SCREEN_STOP = set(range(1, 11))

# Fitness tab groups and KPIs offered per focus (weights out of 10, as on the original dashboard).
FOCUS = {
    "tri": ("Triathlon", [("bike", 9, "bike", "The bike is about half of a triathlon by time; this is its aerobic engine."),
                          ("ftp", 8, "bike", "Sets the bike ceiling and the power zones."),
                          ("run", 8, "run", "The run off the bike is about a third of race time."),
                          ("swim", 5, "swim", "A short share of race time; mainly a safety and comfort item.")]),
    "ultra": ("Trail ultra", [("trail", 10, "trail", "Time on feet decides whether an ultra is finishable; climbing speed decides how long it takes."),
                              ("durability", 9, "all", "Holding efficiency late is the back half of any ultra.")]),
    "run": ("Running", [("run", 9, "run", "Aerobic running economy, read on every easy run."),
                        ("5k", 7, "run", "A repeatable test that sets the run paces.")]),
    "ride": ("Cycling", [("bike", 10, "bike", "The aerobic engine on the bike, read on every steady ride."),
                         ("ftp", 9, "bike", "Sets the bike ceiling and the power zones.")]),
}
FOUNDATION = [("consistency", 10, "all", "Showing up predicts progress and injury risk better than any single session."),
              ("lifts", 8, "strength", "Strength protects joints and holds muscle for the long run.")]
ZONE_NAMES = ["Recovery", "Easy", "Steady", "Threshold", "VO2max"]
ZONE_CUTS = [0.0, 0.70, 0.78, 0.85, 0.92, 1.0]  # share of max HR at each zone's lower edge

# Sections the support team (coach/engine/TEAM.md) reads. Written at onboarding, and added by --refresh
# to coaches set up before they existed. The coach fills them in over time; setup never overwrites them.
PERSONA = """## Persona
- Not set yet. The coach learns how the athlete likes to be spoken to and pushed from their replies and the feel
  check, and writes it here once it has seen it a few times. The athlete can also just say it ("be blunt", "less data").
"""
PUSH = """## Push contract
- None yet. After the baseline weeks the coach may propose one (when to push harder, the data gate, the stop rules).
  Nothing changes until the athlete says yes.
"""
ENSURE = {"coach/athlete/PROFILE.md": ("## Persona", PERSONA), "coach/CURRENT-STATE.md": ("## Push contract", PUSH)}


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def save(p, obj):
    (ROOT / p).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / p).write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def write(p, text):
    (ROOT / p).parent.mkdir(parents=True, exist_ok=True)
    (ROOT / p).write_text(text, encoding="utf-8")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def missing(a):
    """Answers the coach cannot run without. Optional answers are never listed."""
    need = []
    ath, gh = a.get("athlete", {}), a.get("github", {})
    for k in ("name", "timezone", "pronouns"):
        if not ath.get(k):
            need.append(f"athlete.{k}")
    for k in ("owner", "repo"):
        if not gh.get(k):
            need.append(f"github.{k}")
    if ath.get("timezone"):
        try:
            ZoneInfo(ath["timezone"])
        except Exception:
            need.append("athlete.timezone (not a valid IANA zone such as America/Chicago)")
    if not a.get("goals", {}).get("why"):
        need.append("goals.why")
    if not a.get("schedule", {}).get("hours_per_week"):
        need.append("schedule.hours_per_week")
    scr = a.get("screen", {})
    if len(scr.get("answers", [])) != len(SCREEN_QUESTIONS):
        need.append(f"screen.answers ({len(SCREEN_QUESTIONS)} answers: yes, no or unsure)")
    for i, r in enumerate(a.get("races", [])):
        for k in ("name", "date", "sport"):
            if not r.get(k):
                need.append(f"races[{i}].{k}")
    return need


def hr_zones(hr_max, set_, label):
    rows = []
    for z in range(5):
        lo = 0 if z == 0 else round(hr_max * ZONE_CUTS[z])
        hi = hr_max if z == 4 else round(hr_max * ZONE_CUTS[z + 1]) - 1
        rows.append({"kind": "zone", "set": set_, "label": label, "zone": z + 1, "lo": lo, "hi": hi, "name": ZONE_NAMES[z]})
    return rows


def build(a, today):
    ath, gh, goals, sch = a["athlete"], a["github"], a.get("goals", {}), a.get("schedule", {})
    phys, opts = a.get("physiology", {}), a.get("options", {})
    name, tz = ath["name"].strip(), ath["timezone"]
    lo, hi = sch["hours_per_week"]
    birth_year = ath.get("birth_year")
    hr_max = phys.get("hr_max") or (round(208 - 0.7 * (today.year - birth_year)) if birth_year else 185)
    hr_label = "Measured" if phys.get("hr_max") else "Estimated (Tanaka 208 - 0.7 x age)" if birth_year else "Estimated (placeholder 185; set from a max effort)"
    easy_run = phys.get("easy_hr_run") or round(hr_max * 0.78)
    easy_bike = phys.get("easy_hr_bike") or round(hr_max * 0.74)

    # profile.json: the parameters the tools read
    w = goals.get("weight") or {}
    profile = {
        "about": "Machine-readable athlete parameters read by coach/tools/morning_facts.py. The human-readable profile is coach/athlete/PROFILE.md; live decisions are in coach/CURRENT-STATE.md. Change a number here, not in prose.",
        "athlete": name,
        "pronouns": ath["pronouns"],
        "timezone": tz,
        "units": ath.get("units", "imperial"),
        "budget_hours": {"default": [lo, hi], "note": f"Planning budget, not a ceiling ({name}, {today.isoformat()}).", "periods": []},
        "easy_hr_guardrail": {"run": easy_run, "bike": easy_bike, "since": today.isoformat(),
                              "retire_when": "a few weeks of easy-day RPE lining up with HR (RULES 5a); morning_facts reports the agreement rate"},
        "hr_max": {"run": hr_max, "bike": max(hr_max - 7, 120), "default": hr_max, "label": hr_label},
        "sleep_calibration": {"normal_hours": sch.get("sleep_hours", [7, 8]), "normal_score": [75, 85],
                              "note": "Starting guess; the coach replaces it after 4 weeks of data. Watch item, not a gate."},
        "feel_scale_cutover": today.isoformat(),
        "run_history_notes": a.get("health", {}).get("injury_notes", ""),
        "strength_minimum_per_week": sch.get("strength_per_week", 2),
        "swims_per_month_minimum": sch.get("swims_per_month", 0),
        "office_days_default": False,
        "data_source": source_of(a),
        "strava": bool(a.get("strava")),
        "equipment": a.get("equipment", []),
        "not_measured": a.get("not_measured", ["SpO2", "blood pressure", "body fat", "outdoor power"]),
    }
    if w.get("target_lo") and w.get("target_hi"):
        profile["weight"] = {"unit": w.get("unit", "lb"), "target_lo": w["target_lo"], "target_hi": w["target_hi"],
                             "target_by": w.get("target_by"), "rate_lb_per_week": [0.3, 0.6], "no_deficit_from": w.get("no_deficit_from")}
    save("coach/athlete/profile.json", profile)

    # screen.json
    ans = [str(x).lower() for x in a["screen"]["answers"]]
    items = [{"id": i + 1, "question": q, "answer": ans[i], "date": today.isoformat(),
              "source": "Reported (onboarding)", "note": (a["screen"].get("notes") or {}).get(str(i + 1), "")}
             for i, q in enumerate(SCREEN_QUESTIONS)]
    flagged = [it for it in items if it["id"] in SCREEN_STOP and it["answer"] in ("yes", "unsure")]
    save("coach/athlete/screen.json", {
        "about": "Pre-participation screen answers, per coach/engine/SCREEN.md (DRAFT, unreviewed by a clinician). unknown means not yet answered, never no.",
        "status": "needs clinician" if flagged else "answered", "asked": today.isoformat(), "last_answered": today.isoformat(),
        "next_due": (today + timedelta(days=365)).isoformat(), "items": items})

    # races.json
    rows = []
    for r in sorted(a.get("races", []), key=lambda r: r["date"]):
        rows.append({"kind": "race", "race_id": slug(r["name"]) + "-" + r["date"][:4], "name": r["name"], "date": r["date"],
                     "location": r.get("location", ""), "sport": r["sport"], "distance": r.get("distance", ""),
                     "status": r.get("status", "planned"), "priority": r.get("priority", ""), "goal": r.get("goal", ""),
                     "result": "", "forecast": "", "limit": r.get("limit", ""), "url": r.get("url", ""),
                     "registration": r.get("registration", ""), "with": r.get("with", ""),
                     "public_distance": r.get("distance", ""), "public_location": r.get("location", "")})
    races = load("coach/races.json")
    races["rows"] = rows
    save("coach/races.json", races)

    # plan.json: the season start; blocks are written by the coach in the first check-in week
    plan = load("coach/plan.json")
    plan["rows"] = [r for r in plan["rows"] if r.get("kind") != "meta"]
    plan["rows"].insert(0, {"kind": "meta", "key": "doc", "name": f"{name}'s training plan", "url": "",
                            "updated": today.isoformat(), "season_start": a.get("season_start") or today.isoformat(),
                            "season_start_note": "Season so far counts from this date (onboarding)."})
    save("coach/plan.json", plan)

    # fitness_layout.json
    layout = load("coach/fitness_layout.json")
    focus = [f for f in a.get("focus", []) if f in FOCUS] or ["run"]
    upcoming = {r["sport"].lower(): r for r in sorted(a.get("races", []), key=lambda r: r["date"]) if r["date"] >= today.isoformat()}
    out, seen = [], set()
    for order, f in enumerate(focus, 1):
        label, kpis = FOCUS[f]
        race = next((r for s, r in upcoming.items() if f in s or label.lower() in s or (f == "ride" and "ride" in s) or (f == "tri" and "tri" in s)), None)
        out.append({"kind": "fit_group", "key": f, "order": order, "label": label,
                    "race": f"{race['name']}, {datetime.strptime(race['date'], '%Y-%m-%d').strftime('%b %-d')}" if race else ""})
        for rank, (k, wt, sport, why) in enumerate([x for x in kpis if x[0] not in seen], 1):
            seen.add(k)
            out.append({"kind": "fit_kpi", "key": k, "group": f, "rank": rank, "weight": wt, "sport": sport, "why_weight": why})
    out.append({"kind": "fit_group", "key": "foundation", "order": len(focus) + 1, "label": "Foundation", "race": "every race"})
    for rank, (k, wt, sport, why) in enumerate(FOUNDATION, 1):
        out.append({"kind": "fit_kpi", "key": k, "group": "foundation", "rank": rank, "weight": wt, "sport": sport, "why_weight": why})
    layout["rows"] = out
    save("coach/fitness_layout.json", layout)

    # zones.json
    zones = load("coach/zones.json")
    zones["rows"] = hr_zones(hr_max, "run", "Run") + hr_zones(profile["hr_max"]["bike"], "bike", "Bike") + hr_zones(hr_max, "default", "Other")
    zones["about"] = (f"Heart rate zones for time-in-zone, from max HR {hr_max} ({hr_label}). Provisional, low confidence: "
                      "the coach replaces them after a threshold test.")
    save("coach/zones.json", zones)

    # PROFILE.md, CURRENT-STATE.md, LOG.md, RESPONSE-PROFILE.md
    race_lines = "\n".join(f"- {r['date']}: {r['name']} ({r['sport']}{', ' + r['distance'] if r.get('distance') else ''}), "
                           f"{r.get('status', 'planned')}{'; goal: ' + r['goal'] if r.get('goal') else ''}" for r in sorted(a.get("races", []), key=lambda r: r["date"])) or "- None yet."
    pr = ath["pronouns"]
    write("coach/athlete/PROFILE.md", f"""# Athlete profile: {name}

Stable facts and preferences. Numbers the tools read live in `profile.json`; live decisions in `../CURRENT-STATE.md`.
Written at onboarding on {today.isoformat()} from {name}'s own answers (Reported).

## Who
- Name: {name} ({pr}). Time zone: {tz}. Units: {profile['units']}.
- Birth year: {birth_year or 'not given'}. Sex for reference ranges: {ath.get('sex') or 'not given'}.

## Why and priorities
- Why: {goals.get('why', '')}
- Priority order: {goals.get('priority_order') or 'health and safety first, enjoyment second, speed third (default)'}.
- Long-term: {goals.get('long_term', 'not given')}.
- Coaching style wanted: {goals.get('style', 'not given')}.

## Events
{race_lines}

## Time and schedule
- Training budget {lo} to {hi} h a week (a plan, not a ceiling). Days that usually do not work: {sch.get('blocked_days', 'none given')}.
- Strength sessions a week: {profile['strength_minimum_per_week']}. Swims a month: {profile['swims_per_month_minimum']}.

## Health context (Reported)
- Injuries and niggles: {a.get('health', {}).get('injury_notes') or 'none reported'}.
- Conditions or medications that affect exercise: {a.get('health', {}).get('conditions') or 'none reported'}.
- Pre-participation screen: {'NEEDS CLINICIAN: ' + ', '.join(i['question'] for i in flagged) if flagged else 'all clear'} (`screen.json`).

## Equipment and data
- Data source: {'Apple Health via the iPhone Shortcut' + (', workouts from Strava' if a.get('strava') else ', no workout feed (workouts are reported in words)') if profile['data_source'] == 'apple_health' else 'Garmin Connect'}.
- {'; '.join(profile['equipment']) or 'not given'}.
- Not measured: {', '.join(profile['not_measured'])}.

{PERSONA}""")
    weight_line = (f"- Weight goal: {w['target_lo']} to {w['target_hi']} {w.get('unit', 'lb')} by {w.get('target_by')}, gradual and training first; lift through it."
                   if w.get("target_lo") else "- Weight goal: none set.")
    write("coach/CURRENT-STATE.md", f"""# Current state

Live decisions. This file outranks the rules (engine/RULES.md) where they differ. Coach-maintained.

Last updated: {today.isoformat()} (onboarding).

## Goals
- Why: {goals.get('why', '')}
- Priority order: {goals.get('priority_order') or 'health and safety first, enjoyment second, speed third'}.
{weight_line}

## Events
{race_lines}

## Phase
- Onboarding week: the first 7 to 14 days are a baseline. The coach learns {name}'s normal sleep, resting HR and HRV,
  keeps every session easy, and writes the first training block into plan.json by the end of week 2.
{'- SCREEN HOLD: no hard or high-intensity sessions until a clinician clears: ' + ', '.join(i['question'] for i in flagged) + '.' if flagged else ''}

{PUSH}
## Open questions
- None yet.
""")
    write("coach/LOG.md", f"""# Coach log

One short dated entry per check-in, plus Reported facts. Newest last.

## {today.isoformat()} Onboarding
- {name} set up the coach. Goals, events, schedule and the pre-participation screen recorded from {name}'s answers (Reported).
""")
    write("coach/athlete/RESPONSE-PROFILE.md", f"""# Response profile: {name}

Observed individual response facts, each with a count of observations. Empty at onboarding; the monthly review adds facts
once they are seen at least 3 times (for example: legs the morning after a long run, sleep after late sessions).
""")

    kit_owned(a, today)
    return {"hr_max": hr_max, "screen_flagged": [i["question"] for i in flagged]}


def kit_owned(a, today):
    """The athlete's settings inside kit-owned files: the feeds in data_paths.json and the pull schedules.
    Run at onboarding and again after every kit update (--refresh), which replaces these files."""
    sch, opts, tz = a.get("schedule", {}), a.get("options", {}), a["athlete"]["timezone"]
    # data_paths.json: drop feeds the athlete does not use
    dp = load("coach/ops/data_paths.json")
    off = set()
    if not opts.get("scale"):
        off.add("scale")
    if not opts.get("home_bp"):
        off.add("home_bp")
    if not opts.get("race_watch", True):
        off.add("race_watch")
    if not opts.get("research_scan", True):
        off.add("research_scan")
    dp["paths"] = [p for p in dp["paths"] if p["id"] not in off]
    when = f"{sch.get('checkin_time', '7:45 AM')} {tz}"
    for p in dp["paths"]:
        if p["id"] == "morning_checkin":
            p["what"] = f"Daily morning check-in (scheduled task, {when})"
            p["route"] = "scheduled task made at onboarding, prompt coach/ops/TASK-PROMPT-morning.md, steps coach/ops/RUNBOOK.md"
        elif p["id"] == "race_watch":
            p["what"] = "Race calendar watch (scheduled task, Sundays early morning, silent)"
            p["route"] = "scheduled task made at onboarding; its prompt reads coach/ops/TASK-PROMPT-weekly.md from the repo at each run, so edit that file, not the task"
        elif p["id"] == "research_scan":
            p["what"] = "Monthly research scan (scheduled task, 1st of the month, silent)"
            p["route"] = "scheduled task made at onboarding, prompt coach/ops/TASK-PROMPT-research.md, method coach/research/PROTOCOL.md"
    dp["consumers_outside_repo"] = []
    if source_of(a) == "apple_health":
        for p in dp["paths"]:
            if p["id"] == "garmin":
                p.update({"id": "apple_health", "what": "Daily health from Apple Health (sleep, HRV, resting HR, steps, weight)",
                          "route": "iPhone Shortcut 'Send health to coach' (coach/ops/APPLE-HEALTH-SHORTCUT.md), run by personal automations when the wake-up alarm stops and at 9 PM; repository_dispatch apple_health, ingest-apple-health.yml, scripts/apple_health.py",
                          "writes": ["data/summary.csv", "data/status/last_run.json"], "cadence": "each morning after waking",
                          "fallback": "open Shortcuts and run 'Send health to coach' by hand; until then the check-in runs on the data on hand and says so",
                          "owner": "athlete (iPhone)"})
        if a.get("strava") and not any(p["id"] == "strava" for p in dp["paths"]):  # safe to run twice
            dp["paths"].insert(1, {"id": "strava", "what": "Workouts from Strava",
                                   "route": "GitHub Actions pull-strava.yml (schedule set at onboarding) plus the morning check-in's dispatch; scripts/pull_strava.py",
                                   "writes": ["data/activities.csv", "data/status/strava_last_run.json"], "cadence": "four times a day",
                                   "evidence": {"kind": "json_field", "file": "data/status/strava_last_run.json", "field": "run_at_utc"},
                                   "max_age_hours": 26, "alert": True,
                                   "fallback": "run Pull Strava workouts from the Actions tab; a workout missing from Strava can be told to the coach in words",
                                   "owner": "pipeline"})
    dp["updated"] = today.isoformat()
    save("coach/ops/data_paths.json", dp)

    # Garmin pull schedule at about 6:20 AM, 7:20 AM, 12:20 PM and 7:20 PM local, in UTC for standard and daylight time
    cron_rewrite(tz, source_of(a), bool(a.get("strava")))


def restore_workflows():
    """Copy setup/workflows/* into .github/workflows/ for any file that is missing there."""
    import shutil
    src, dst = ROOT / "setup" / "workflows", ROOT / ".github" / "workflows"
    n = 0
    if src.is_dir():
        dst.mkdir(parents=True, exist_ok=True)
        for f in sorted(src.glob("*.yml")):
            if not (dst / f.name).exists():
                shutil.copy2(f, dst / f.name)
                n += 1
    return n


def source_of(a):
    return "apple_health" if str(a.get("data_source", "garmin")).lower().replace(" ", "_") in ("apple_health", "apple", "oura", "ultrahuman", "apple_watch") else "garmin"


def cron_rewrite(tz, source="garmin", strava=False):
    """Garmin athletes: the Garmin pull runs four times a day in local time. Apple Health athletes:
    the Garmin pull keeps no schedule, and the Strava pull (if connected) takes those times."""
    zone = ZoneInfo(tz)
    hours = set()
    for d in (date(2026, 1, 15), date(2026, 7, 15)):
        for h in (6, 7, 12, 19):
            utc = datetime(d.year, d.month, d.day, h, 23, tzinfo=zone).astimezone(ZoneInfo("UTC"))
            hours.add(utc.hour)
    block = (f"  schedule:\n    # UTC times for about 6:23 AM, 7:23 AM, 12:23 PM and 7:23 PM in {tz} (set by setup/personalize.py)\n"
             + "\n".join(f'    - cron: "23 {h} * * *"' for h in sorted(hours)) + "\n")
    garmin = ROOT / ".github/workflows/pull-garmin.yml"
    text = garmin.read_text(encoding="utf-8")
    text = re.sub(r"  schedule:\n(?:    #.*\n)*(?:    - cron: .*\n)+", "", text)
    if source == "garmin":  # the kit ships with no schedule; the athlete's own is added here
        text = text.replace("on:\n", "on:\n" + block, 1)
    garmin.write_text(text, encoding="utf-8")
    sv = ROOT / ".github/workflows/pull-strava.yml"
    if sv.exists():
        text = sv.read_text(encoding="utf-8")
        text = re.sub(r"  schedule:\n(?:    #.*\n)*(?:    - cron: .*\n)+", "", text)
        if source == "apple_health" and strava:
            text = text.replace("on:\n", "on:\n" + block, 1)
        sv.write_text(text, encoding="utf-8")


def fill_placeholders(a):
    ath, gh, links = a["athlete"], a["github"], a.get("links", {})
    tz = ath["timezone"]
    subs = {"{{ATHLETE}}": ath["name"].strip(), "{{GITHUB_OWNER}}": gh["owner"], "{{REPO}}": gh["repo"],
            "{{TIMEZONE}}": tz, "{{PRONOUNS}}": ath["pronouns"],
            "{{CHECKIN_TIME}}": a.get("schedule", {}).get("checkin_time", "7:45 AM")}
    if links.get("dashboard_url"):
        subs["{{DASHBOARD_URL}}"] = links["dashboard_url"]
    if links.get("season_url"):
        subs["{{SEASON_URL}}"] = links["season_url"]
    left = {}
    for p in ROOT.rglob("*"):
        rel = p.relative_to(ROOT).as_posix()
        if not p.is_file() or p.suffix not in TEXT or rel in NO_REWRITE or rel.startswith(".git/"):
            continue
        text = p.read_text(encoding="utf-8")
        new = text
        for k, v in subs.items():
            new = new.replace(k, v)
        if tz != "America/New_York":
            new = new.replace('"America/New_York"', f'"{tz}"')
        if new != text:
            p.write_text(new, encoding="utf-8")
        for m in re.findall(r"\{\{[A-Z_]+\}\}", new):
            left.setdefault(m, []).append(rel)
    return left


def ensure_sections():
    """Add a section the engine reads to an athlete file that predates it. Never rewrites existing text."""
    added = []
    for rel, (head, text) in ENSURE.items():
        f = ROOT / rel
        if f.is_file() and head not in f.read_text(encoding="utf-8"):
            body = f.read_text(encoding="utf-8").rstrip("\n")
            f.write_text(body + "\n\n" + text, encoding="utf-8")
            added.append(f"{rel}: {head[3:]}")
    return added


def sha(path):
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record_installed():
    """Fingerprint every kit-owned file as installed (setup/installed.json). setup/update.py compares against
    it: a file whose fingerprint still matches was not edited here and can be replaced by a newer kit."""
    man = ROOT / "setup" / "kit-manifest.json"
    if not man.is_file():
        return 0
    m = json.loads(man.read_text(encoding="utf-8"))
    files = {rel: sha(ROOT / rel) for rel in m["kit_files"] if (ROOT / rel).is_file()}
    save("setup/installed.json", {"about": "Fingerprints of the kit's own files as installed here. Written by setup/personalize.py; read by setup/update.py. Do not edit.",
                                  "version": (ROOT / "VERSION").read_text().strip(), "files": files})
    return len(files)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    a = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    need = missing(a)
    if need:
        print("Still needed before setup can finish:")
        print("\n".join("- " + n for n in need))
        return 1
    if "--check" in argv:
        print("All required answers are present.")
        return 0
    restored = restore_workflows()
    if restored:
        print(f"Restored {restored} workflow file(s) into .github/workflows (the upload had skipped the hidden folder).")
    today = datetime.now(ZoneInfo(a["athlete"]["timezone"])).date()
    import subprocess
    if "--refresh" in argv:
        # After a kit update: put the athlete's settings back into the kit's own files. Personal files
        # (profile, current state, log, plans, data) are left exactly as they are.
        kit_owned(a, today)
        left = fill_placeholders(a)
        added = ensure_sections()
        subprocess.run([sys.executable, str(ROOT / "coach/tools/build_season.py")], cwd=ROOT, capture_output=True)
        n = record_installed()
        print(f"Refreshed for {a['athlete']['name']}: settings, links and schedules re-applied; {n} kit files fingerprinted.")
        for line in added:
            print(f"Added section: {line}")
        for k, files in sorted(left.items()):
            print(f"Still to fill: {k} in {', '.join(sorted(set(files))[:3])}")
        return 0
    info = build(a, today)
    left = fill_placeholders(a)
    subprocess.run([sys.executable, str(ROOT / "coach/tools/build_season.py")], cwd=ROOT, capture_output=True)
    record_installed()
    print(f"Personalized for {a['athlete']['name']}: max HR used {info['hr_max']}.")
    if info["screen_flagged"]:
        print("SCREEN: see a clinician before hard training: " + "; ".join(info["screen_flagged"]))
    for k, files in sorted(left.items()):
        print(f"Still to fill: {k} in {len(files)} file(s) (add it to answers.json 'links' and run again)" if k in ("{{DASHBOARD_URL}}", "{{SEASON_URL}}")
              else f"Still to fill: {k} in {', '.join(sorted(set(files))[:3])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
