"""Compute every number the morning check-in uses and write coach/facts.json.

The model reads facts.json and interprets; it does not derive numbers in prose.
Run from the repo root, after the Garmin pull and before the check-in:
    python3 coach/tools/morning_facts.py            # today, America/New_York
    python3 coach/tools/morning_facts.py --date 2026-10-15   # rebuild a past morning (tests, audits)

Inputs: data/summary.csv, data/body_comp.csv (scale, if present), data/activities.csv, data/status/last_run.json, data/daily/<date>.json,
coach/feel_daily.csv, coach/feel_sessions.csv, coach/week.json, coach/plan.json, coach/races.json,
coach/outcomes.csv (if present), coach/engine/schemas.json, coach/athlete/profile.json.

Sections of facts.json (every number carries its label; a missing value is null, never 0):
  meta        date, generated_at_utc, pull run_at_utc and age, inputs used
  freshness   is the latest night complete, which night it is, weigh-in date, data flags
  night       latest night's metrics against the athlete's own 28-day band (n, mean, sd, z, position)
  feel        today's and yesterday's answers (on the 1-5 scale), 14-day means, departures, pain streaks
  yesterday   activities yesterday and so far today, matched to week.json rows, completion class, guardrail
  load        7- and 28-day minutes/km/ascent by discipline; sRPE 7-day; longest run in 30 days and the spike cap
  week        this week's plan vs done, key sessions, planned minutes vs budget
  block       current block, days in, its stated weekly hours vs the budget for the period
  weight      latest, 4- and 7-day rolling means, 21-day slope, plan path, fuel mode today and tomorrow;
              body_comp: scale lean mass and body fat as 14-day means, vs the pre-deficit baseline
  races       upcoming races: days to go, start time (start_time HH:MM local, start_basis posted|expected), forecast, limit, cutoffs and margins; registration: reg_dates within 14 days
              and whether the check-in says each today (coach/tools/race_check.py)
  calibration easy-day RPE vs HR agreement; guardrail retire check
  predictions reconciliation summary from coach/outcomes.csv (7 and 28 days)
  response    observed patterns with counts (easy-day overrun, strength completion)
  heartbeat   every feed and scheduled task in coach/ops/data_paths.json: last landing, age, late or not
  flags       plain-language flags the rules say to act on, each with the rule it comes from
"""
import argparse
import csv
import json
import os
import re
import statistics
import sys
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

ROOT = os.getcwd()


# ---------- small helpers ----------

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


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", s)
    if m:
        return (float(m.group(1)) + float(m.group(2))) / 2
    try:
        return float(s)
    except ValueError:
        return None


def r(v, nd=1):
    return None if v is None else round(v, nd)


def d(s):
    return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()


def iso(x):
    return x.strftime("%Y-%m-%d")


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


def mean_sd(xs):
    xs = [x for x in xs if x is not None]
    n = len(xs)
    if n == 0:
        return None, None, 0
    m = statistics.fmean(xs)
    sd = statistics.stdev(xs) if n > 1 else None
    return m, sd, n


def hms(minutes):
    if minutes is None:
        return None
    m = int(round(minutes))
    return f"{m // 60}:{m % 60:02d}"


def parse_hm(s):
    """'7:15' -> 435 minutes; '8:30' -> 510; '10 h' or '10 hours' -> 600; 'none' -> None."""
    m = re.search(r"(\d{1,2}):(\d{2})", str(s))
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    m = re.search(r"(\d{1,2}(?:\.\d)?)\s*(?:h\b|hours?\b|hr\b)", str(s))
    return int(round(float(m.group(1)) * 60)) if m else None


def parse_range_hm(s):
    """'about 7:15 to 8:45 (Estimated...)' -> (435, 525)."""
    ms = re.findall(r"(\d{1,2}):(\d{2})", str(s or ""))
    vals = [int(a) * 60 + int(b) for a, b in ms]
    if not vals:
        return None, None
    return min(vals), max(vals)


def parse_hours_range(text):
    """'6.5 to 8 h/week; ...' -> (6.5, 8.0); '5 to 7 h' -> (5, 7); 'About 85%...' -> (None, None)."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)\s*h", str(text or ""))
    if m:
        return float(m.group(1)), float(m.group(2))
    m = re.search(r"(?:about\s*)?(\d+(?:\.\d+)?)\s*h/week", str(text or ""))
    if m:
        return float(m.group(1)), float(m.group(1))
    return None, None


# ---------- loading ----------

def load_all():
    return {
        "summary": read_csv("data/summary.csv"),
        "body_comp": read_csv("data/body_comp.csv"),
        "acts": read_csv("data/activities.csv"),
        "status": read_json("data/status/last_run.json", {}),
        "feel_daily": read_csv("coach/feel_daily.csv"),
        "feel_sessions": read_csv("coach/feel_sessions.csv"),
        "week": read_json("coach/week.json", {"rows": []}).get("rows", []),
        "plan": read_json("coach/plan.json", {"rows": []}).get("rows", []),
        "races": read_json("coach/races.json", {"rows": []}).get("rows", []),
        "outcomes": read_csv("coach/outcomes.csv"),
        "predictions": read_csv("coach/predictions.csv"),
        "schemas": read_json("coach/engine/schemas.json", {}),
        "profile": read_json("coach/athlete/profile.json", {}),
    }


# ---------- sections ----------

def section_freshness(today, data):
    st = data["status"]
    run_at = st.get("run_at_utc")
    age_h = None
    if run_at:
        age_h = (datetime.now(timezone.utc) - datetime.strptime(run_at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() / 3600
    by_date = {row["date"]: row for row in data["summary"]}
    t = by_date.get(iso(today), {})
    y = by_date.get(iso(today - timedelta(days=1)), {})
    today_sleep = num(t.get("sleep_h")) is not None
    # the daily file says whether Garmin returned a sleep record at all
    daily = read_json(f"data/daily/{iso(today)}.json", {})
    dto = (((daily.get("responses") or {}).get("sleep") or {}).get("dailySleepDTO")) or {}
    sleep_record = bool(dto.get("sleepTimeSeconds"))
    latest_night = None
    for row in reversed(data["summary"]):
        if num(row.get("sleep_h")) is not None:
            latest_night = row["date"]
            break
    weigh_dates = [row["date"] for row in data["summary"] if num(row.get("weight_lb")) is not None]
    flags = []
    # Daily health comes from the Garmin pull, or for athletes without Garmin from the Apple Health
    # Shortcut (scripts/apple_health.py writes source "apple_health" into the same status file).
    apple = st.get("source") == "apple_health"
    if not today_sleep:
        flags.append("Last night's sleep is missing: the iPhone Shortcut has probably not sent it yet (unlocking the phone after waking, or running 'Send health to coach', sends it). Lowers confidence, never readiness."
                     if apple else
                     "Last night's sleep is missing: the watch has probably not synced to Garmin Connect yet (opening the Connect app syncs it). Lowers confidence, never readiness.")
    if age_h is not None and age_h > 6:
        flags.append(f"{'Apple Health send' if apple else 'Garmin pull'} is {age_h:.1f} h old.")
    # Trail detail (scripts/streams.py, Nov 8, 2026): a hilly run whose 5 s stream failed to land is flagged the same day
    bad = sorted(aid for aid, a in (st.get("activities") or {}).items()
                 if isinstance(a, dict) and a.get("stream") and a["stream"] not in ("ok", "kept", "skipped"))
    if bad:
        flags.append(f"Trail detail did not land for {len(bad)} hilly run{'s' if len(bad) > 1 else ''} ({', '.join(bad)}): the trail pace and descent numbers skip {'them' if len(bad) > 1 else 'it'} until the next pull retries.")
    core = ("hrv_overnight_ms", "resting_hr") if apple else ("hrv_overnight_ms", "resting_hr", "body_battery_high")
    core_missing = [k for k in core if num(t.get(k)) is None]
    return {
        "source": "apple_health" if apple else "garmin",
        "pull_run_at_utc": run_at,
        "pull_age_hours": r(age_h, 1),
        "today_sleep_complete": today_sleep,
        "today_sleep_record_from_garmin": sleep_record,
        "today_core_missing": core_missing,
        "yesterday_complete": num(y.get("sleep_h")) is not None and num(y.get("resting_hr")) is not None,
        "latest_complete_night": latest_night,
        "latest_weigh_in": weigh_dates[-1] if weigh_dates else None,
        "flags": flags,
        "provenance": "Measured",
    }


def band(values_prior, value, n_min, n_pref):
    m, sd, n = mean_sd(values_prior)
    out = {"n": n, "mean": r(m, 1), "sd": r(sd, 1), "value": value, "z": None, "position": None,
           "band_ok": n >= n_min, "band_note": None}
    if n < n_min:
        out["band_note"] = f"only {n} comparable nights (need {n_min}, prefer {n_pref}): qualitative read only"
    elif value is not None and sd:
        z = (value - m) / sd
        out["z"] = r(z, 1)
        out["position"] = "within band" if abs(z) <= 1 else ("above band" if z > 1 else "below band")
    return out


def section_night(today, data, th):
    rows = data["summary"]
    by_date = {row["date"]: row for row in rows}
    night_date = iso(today) if num(by_date.get(iso(today), {}).get("sleep_h")) is not None else None
    if night_date is None:
        for row in reversed(rows):
            if num(row.get("sleep_h")) is not None:
                night_date = row["date"]
                break
    if night_date is None:
        return {"night": None, "note": "no complete night on file"}
    nd = d(night_date)
    window = [row for row in rows if nd - timedelta(days=th["bands_window_days"]) <= d(row["date"]) < nd]
    cur = by_date[night_date]
    metrics = {
        "sleep_h": ("sleep_h", "Sleep hours (Garmin; reads ~30-45 min high)"),
        "sleep_score": ("sleep_score", "Sleep score"),
        "hrv_overnight_ms": ("hrv_overnight_ms", "Overnight HRV ms"),
        "resting_hr": ("resting_hr", "Resting HR"),
        "body_battery_high": ("body_battery_high", "Body Battery high"),
        "body_battery_charged": ("body_battery_charged", "Body Battery charged (day total in summary.csv; not the overnight recharge quoted in check-ins before Oct 19)"),
    }
    out = {"night": night_date, "is_last_night": night_date == iso(today), "window": f"{iso(nd - timedelta(days=th['bands_window_days']))} to {iso(nd - timedelta(days=1))}", "metrics": {}, "provenance": "Measured; bands Calculated"}
    for key, (col, name) in metrics.items():
        vals = [num(row.get(col)) for row in window]
        out["metrics"][key] = {"name": name, **band(vals, num(cur.get(col)), th["bands_min_nights"], th["bands_preferred_nights"])}
    # yesterday's average stress (the day before the night)
    yrow = by_date.get(iso(nd - timedelta(days=1)), {})
    vals = [num(row.get("stress_avg")) for row in rows if nd - timedelta(days=th["bands_window_days"] + 1) <= d(row["date"]) < nd - timedelta(days=1)]
    out["metrics"]["stress_avg_prev_day"] = {"name": "Average stress, previous day", **band(vals, num(yrow.get("stress_avg")), th["bands_min_nights"], th["bands_preferred_nights"])}
    out["hrv_status"] = cur.get("hrv_status") or None
    out["hrv_weekly_ms"] = num(cur.get("hrv_weekly_ms"))
    out["overlap_note"] = "HRV, sleep score and Body Battery overlap; they are one signal read three ways, not three confirmations."
    return out


def to5(v, scale):
    if v is None:
        return None
    if str(scale).strip() in ("", "10"):
        return round(1 + (v - 1) * 4 / 9, 1)
    return v


def section_feel(today, data, th):
    rows = []
    for row in data["feel_daily"]:
        if not (row.get("date") or "").strip():
            continue
        sc = (row.get("scale") or "").strip() or "10"
        rows.append({
            "date": row["date"], "scale": sc,
            "sleep_q": to5(num(row.get("sleep_q")), sc), "energy": to5(num(row.get("energy")), sc),
            "legs": to5(num(row.get("legs")), sc), "stress": to5(num(row.get("stress")), sc),
            "pain": num(row.get("pain")), "pain_site": (row.get("pain_site") or "").strip(),
        })
    rows.sort(key=lambda x: x["date"])
    by = {x["date"]: x for x in rows}
    t = by.get(iso(today))
    y = by.get(iso(today - timedelta(days=1)))
    ref_start = today - timedelta(days=th["feel_reference_days"])
    ref = [x for x in rows if ref_start <= d(x["date"]) < today]
    means = {k: r(mean_sd([x[k] for x in ref])[0], 1) for k in ("sleep_q", "energy", "legs", "stress")}
    n_ref = len(ref)

    def departure(day):
        if not day:
            return None
        out = {}
        for k in ("sleep_q", "energy", "legs"):
            if day.get(k) is not None and means.get(k) is not None:
                out[k] = r(day[k] - means[k], 1)
        return out

    # two mornings in a row a full point or more below the 14-day mean (any of sleep, energy, legs)
    two_low = False
    if t and y:
        for k in ("sleep_q", "energy", "legs"):
            dt, dy = departure(t).get(k), departure(y).get(k)
            if dt is not None and dy is not None and dt <= -th["feel_departure_points"] and dy <= -th["feel_departure_points"]:
                two_low = True
    # pain streaks by site: consecutive mornings ending today (or yesterday if today not answered) with pain > 0
    streak_end = today if t else today - timedelta(days=1)
    streak = 0
    sites = set()
    cur = streak_end
    while True:
        x = by.get(iso(cur))
        if not x or x.get("pain") is None or x["pain"] <= 0:
            break
        streak += 1
        for s in (x.get("pain_site") or "").split(";"):
            if s.strip():
                sites.add(s.strip())
        cur -= timedelta(days=1)
    missing_today = t is None
    unanswered_days = 0
    cur = today
    while cur > today - timedelta(days=30):
        if by.get(iso(cur)):
            break
        unanswered_days += 1
        cur -= timedelta(days=1)
    return {
        "scale": "1 to 5 (older 1-10 answers rescaled)",
        "today": t, "yesterday": y,
        "today_missing": missing_today,
        "days_since_last_answer": unanswered_days,
        "reference_days": th["feel_reference_days"], "reference_n": n_ref, "reference_means": means,
        "today_departure": departure(t), "yesterday_departure": departure(y),
        "two_mornings_low": two_low,
        "energy_or_legs_at_or_below_2": bool(t and ((t.get("energy") or 9) <= th["feel_fallback_at_or_below"] or (t.get("legs") or 9) <= th["feel_fallback_at_or_below"])),
        "energy_and_legs_at_or_above_4": bool(t and (t.get("energy") or 0) >= th["feel_strong_day_at_or_above"] and (t.get("legs") or 0) >= th["feel_strong_day_at_or_above"]),
        "stress_at_or_above_4": bool(t and (t.get("stress") or 0) >= th["stress_trim_at_or_above"]),
        "pain_streak_mornings": streak, "pain_streak_sites": sorted(sites), "pain_streak_ends": iso(streak_end) if streak else None,
        "provenance": "Reported",
    }


def activity_rows(data, day):
    out = []
    for a in data["acts"]:
        if (a.get("local_start") or "")[:10] != iso(day):
            continue
        out.append({
            "activity_id": a.get("activity_id"), "start": a.get("local_start"), "type": a.get("type"),
            "discipline": discipline(a.get("type")), "name": a.get("name"),
            "minutes": r(num(a.get("duration_min")), 1), "moving_min": r(num(a.get("moving_min")), 1),
            "distance_mi": r(num(a.get("distance_mi")), 2), "ascent_ft": r(num(a.get("ascent_ft")), 0),
            "avg_hr": num(a.get("avg_hr")), "max_hr": num(a.get("max_hr")),
            "avg_power_w": num(a.get("avg_power_w")), "norm_power_w": num(a.get("norm_power_w")),
            "te_aerobic": num(a.get("training_effect_aerobic")), "training_load": num(a.get("training_load")),
        })
    return out


def plan_rows(data, day):
    return sorted([x for x in data["week"] if x.get("kind") == "day" and x.get("date") == iso(day)], key=lambda x: x.get("order", 1))


def classify(row, acts, feel_rpe=None):
    """Completion class for one plan row against the day's activities (same discipline, or alt_type = fallback)."""
    if row is None:
        return "unknown", None
    typ = row.get("type")
    if typ == "rest":
        training = [a for a in acts if a["discipline"] not in ("walk", "other")]
        return ("rest", None) if not training else ("over", training[0])
    same = [a for a in acts if a["discipline"] == typ]
    alt = [a for a in acts if row.get("alt_type") and a["discipline"] == row.get("alt_type")]
    if typ in ("strength", "test") and not same:
        return "none", None  # strength is rarely recorded by the watch; the dashboard's manual log is the source
    if not same and alt:
        return "fallback", alt[0]
    if not same:
        return "none", None
    a = same[0]
    mins = sum(x["minutes"] or 0 for x in same)
    nominal, upper, fb = num(row.get("minutes")), num(row.get("upper_minutes")), num(row.get("fallback_minutes"))
    if upper and mins > upper * 1.10:
        return "over", a
    if feel_rpe is not None and row.get("intensity") == "easy" and feel_rpe >= 5:
        return "over", a
    if upper and mins >= upper * 0.90:
        return "upper", a
    if fb and nominal and mins < min(fb, nominal) * 0.9 and mins <= fb * 1.1:
        return "fallback", a
    if nominal and mins < nominal * 0.75:
        return "fallback", a
    return "nominal", a


def section_yesterday(today, data, prof, th):
    y = today - timedelta(days=1)
    rpe_by_id = {}
    for s in data["feel_sessions"]:
        aid = (s.get("activity_id") or "").strip()
        if aid:
            rpe_by_id[aid] = s
    out = {}
    for label, day in (("yesterday", y), ("today", today)):
        acts = activity_rows(data, day)
        rows = plan_rows(data, day)
        for a in acts:
            s = rpe_by_id.get(str(a["activity_id"]))
            a["reported"] = {"rpe": num(s.get("rpe")), "vs_plan": s.get("vs_plan"), "pain": num(s.get("pain")), "pain_site": s.get("pain_site"), "fuel": s.get("fuel")} if s else None
            g = prof.get("easy_hr_guardrail", {}).get(a["discipline"])
            a["guardrail"] = g
            a["above_guardrail"] = bool(g and a.get("avg_hr") and a["avg_hr"] > g)
        matched = []
        used = set()
        for row in rows:
            rpe = None
            for a in acts:
                if a["discipline"] == row.get("type") and a.get("reported"):
                    rpe = a["reported"]["rpe"]
            cls, act = classify(row, [a for a in acts if a["activity_id"] not in used], rpe)
            if act:
                used.add(act["activity_id"])
            matched.append({"planned": {k: row.get(k) for k in ("type", "title", "minutes", "upper_minutes", "fallback_minutes", "alt_type", "intensity", "key", "pillar")},
                            "completion": cls, "activity_id": act["activity_id"] if act else None,
                            "minutes_vs_nominal_pct": r((act["minutes"] / num(row.get("minutes")) - 1) * 100, 0) if act and num(row.get("minutes")) else None,
                            "easy_but_hard": bool(act and row.get("intensity") == "easy" and ((act.get("above_guardrail")) or (act.get("reported") and (act["reported"]["rpe"] or 0) >= th["easy_session_hard_rpe"])))})
        unplanned = [a for a in acts if a["activity_id"] not in used and a["discipline"] not in ("walk",)]
        out[label] = {"date": iso(day), "activities": acts, "plan": matched, "unplanned": unplanned,
                      "already_trained": bool([a for a in acts if a["discipline"] not in ("walk", "other")]) if label == "today" else None,
                      "long_session_fuel_ask": [a["activity_id"] for a in acts if (a["minutes"] or 0) >= th["long_session_fuel_ask_min"] and not (a.get("reported") or {}).get("fuel")]}
    out["provenance"] = "Measured (activities), Reported (RPE), Calculated (classes)"
    return out


def section_load(today, data, th):
    acts = data["acts"]

    def window(days):
        start = today - timedelta(days=days)
        return [a for a in acts if start <= d(a["local_start"][:10]) < today]

    def totals(ws):
        t = {}
        for a in ws:
            k = discipline(a.get("type"))
            e = t.setdefault(k, {"sessions": 0, "minutes": 0.0, "miles": 0.0, "ascent_ft": 0.0})
            e["sessions"] += 1
            e["minutes"] += num(a.get("duration_min")) or 0
            e["miles"] += num(a.get("distance_mi")) or 0
            e["ascent_ft"] += num(a.get("ascent_ft")) or 0
        for e in t.values():
            e["minutes"], e["miles"], e["ascent_ft"] = r(e["minutes"], 0), r(e["miles"], 1), r(e["ascent_ft"], 0)
        return t

    w7, w28 = window(7), window(28)
    train7 = sum(num(a.get("duration_min")) or 0 for a in w7 if discipline(a.get("type")) not in ("walk", "other"))
    train28 = sum(num(a.get("duration_min")) or 0 for a in w28 if discipline(a.get("type")) not in ("walk", "other"))
    # sRPE, last 7 days
    srpe = [s for s in data["feel_sessions"] if today - timedelta(days=7) <= d(s["date"]) < today and num(s.get("srpe_load")) is not None]
    rated_ids = {(s.get("activity_id") or "").strip() for s in data["feel_sessions"]}
    unrated = [a["activity_id"] for a in w7 if discipline(a.get("type")) not in ("walk", "other") and a["activity_id"] not in rated_ids]
    # longest run in the prior N days and the spike cap
    runs = [a for a in acts if discipline(a.get("type")) == "run" and today - timedelta(days=th["single_run_lookback_days"]) <= d(a["local_start"][:10]) < today]
    longest = max(runs, key=lambda a: num(a.get("duration_min")) or 0, default=None)
    cap = None
    if longest:
        cap = {"date": longest["local_start"][:10], "minutes": r(num(longest.get("duration_min")), 0), "miles": r(num(longest.get("distance_mi")), 2),
               "next_run_cap_minutes": r((num(longest.get("duration_min")) or 0) * (1 + th["single_run_spike_pct"] / 100), 0),
               "next_run_cap_miles": r((num(longest.get("distance_mi")) or 0) * (1 + th["single_run_spike_pct"] / 100), 2),
               "rule": f"single-run spike rule: next run within ~{th['single_run_spike_pct']}% of the longest in the prior {th['single_run_lookback_days']} days unless a named exception"}
    return {
        "last_7_days": totals(w7), "last_28_days": totals(w28),
        "training_hours_7d_excl_walks": r(train7 / 60, 1), "training_hours_28d_avg_per_week_excl_walks": r(train28 / 60 / 4, 1),
        "srpe_7d": {"load": r(sum(num(s["srpe_load"]) for s in srpe), 0), "rated_sessions": len(srpe), "unrated_activity_ids": unrated},
        "longest_run_30d": cap,
        "provenance": "Measured; totals Calculated; sRPE Reported x minutes",
    }


def budget_for(day, prof):
    b = prof.get("budget_hours", {})
    for p in b.get("periods", []):
        if d(p["start"]) <= day <= d(p["end"]):
            return [p["lo"], p["hi"]], p.get("label")
    return b.get("default"), "default"


def section_week(today, data, prof):
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    rows = [x for x in data["week"] if x.get("kind") == "day" and monday <= d(x["date"]) <= sunday]
    wk = next((x for x in data["week"] if x.get("kind") == "week" and x.get("week_start") == iso(monday)), None)
    planned = sum(num(x.get("minutes")) or 0 for x in rows if x.get("type") not in ("rest", "walk"))
    done = 0.0
    for a in data["acts"]:
        ad = d(a["local_start"][:10])
        if monday <= ad <= today and discipline(a.get("type")) not in ("walk", "other"):
            done += num(a.get("duration_min")) or 0
    keys = []
    for x in rows:
        if x.get("key"):
            day = d(x["date"])
            acts = activity_rows(data, day)
            cls, _ = classify(x, acts)
            status = "upcoming" if day > today else ("today" if day == today else ("missed" if cls == "none" else cls))
            if x.get("type") in ("strength", "test") and day < today and cls == "none":
                status = "unknown (not recorded by the watch)"
            if x.get("type") == "rest":  # a key rest day is kept when nothing but walking was recorded (KEY-SESSIONS.md)
                trained = [a for a in acts if a["discipline"] not in ("walk", "other")]  # same test classify() uses for rest days
                status = "upcoming" if day > today else ("today" if day == today else ("missed (trained on a key rest day)" if trained else "done (rested)"))
            keys.append({"pillar": x.get("pillar"), "date": x["date"], "title": x.get("title"), "why": x.get("why"), "status": status})
    budget, label = budget_for(today, prof)
    soon = [{"date": x["date"], "type": x.get("type"), "title": x.get("title"), "intensity": x.get("intensity"), "key": bool(x.get("key"))}
            for x in data["week"] if x.get("kind") == "day" and today <= d(x["date"]) <= today + timedelta(days=3)
            and x.get("type") != "rest" and (x.get("key") or x.get("intensity") in ("long", "race", "quality", "test"))]
    try:  # key-session rules (coach/engine/KEY-SESSIONS.md, Nov 2, 2026); never block the check-in
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import key_check
        key_problems = key_check.problems(data["plan"], data["week"])
    except Exception as e:
        key_problems = [f"key_check.py failed: {e}"]
    return {
        "key_session_problems": key_problems,
        "key_long_or_race_within_3_days": soon,
        "week_start": iso(monday), "label": (wk or {}).get("label"), "focus": (wk or {}).get("focus"),
        "planned_minutes_excl_walks": r(planned, 0), "planned_hours": r(planned / 60, 1),
        "done_minutes_to_date_excl_walks": r(done, 0),
        "budget_hours": budget, "budget_period": label,
        "planned_over_budget": bool(budget and planned / 60 > budget[1]),
        "key_sessions": keys,
        "rows_today": plan_rows(data, today),
        "provenance": "plan.json/week.json (plan); Measured (done)",
    }


def upcoming_over_budget(blocks, today, prof, horizon_days=200):
    """Blocks starting within the horizon whose stated weekly hours top out above the budget for their period."""
    out = []
    for b in blocks:
        if not (today < d(b["start"]) <= today + timedelta(days=horizon_days)):
            continue
        lo, hi = parse_hours_range(b.get("volume"))
        mid = d(b["start"]) + (d(b["end"]) - d(b["start"])) / 2
        budget, label = budget_for(mid, prof)
        if hi is None or not budget:
            continue
        if hi > budget[1] + 0.5:
            out.append({"label": b.get("label"), "name": b.get("name"), "start": b["start"], "stated": [lo, hi], "budget": budget, "budget_period": label,
                        "severity": "clearly over" if (lo or 0) > budget[1] else "top of range over"})
    return out


def section_block(today, data, prof):
    blocks = [x for x in data["plan"] if x.get("kind") == "block"]
    cur = next((b for b in blocks if d(b["start"]) <= today <= d(b["end"])), None)
    if not cur:
        return {"block": None}
    lo, hi = parse_hours_range(cur.get("volume"))
    budget, label = budget_for(today, prof)
    # the budget that applies in the middle of the block, in case the period changes inside it
    mid = d(cur["start"]) + (d(cur["end"]) - d(cur["start"])) / 2
    budget_mid, label_mid = budget_for(mid, prof)
    over = bool(budget_mid and hi is not None and hi > budget_mid[1] + 0.5)
    clearly = bool(budget_mid and lo is not None and lo > budget_mid[1])
    nxt = next((b for b in blocks if d(b["start"]) > today), None)
    return {
        "key": cur.get("key"), "label": cur.get("label"), "name": cur.get("name"), "start": cur["start"], "end": cur["end"],
        "day_of_block": (today - d(cur["start"])).days + 1, "days_left": (d(cur["end"]) - today).days,
        "pillars": [cur.get("pillar_1"), cur.get("pillar_2"), cur.get("pillar_3")],
        "key_session_defaults": [{"pillar": n, "short": cur.get(f"pillar_{n}_short")} for n in (1, 2, 3) if cur.get(f"pillar_{n}")],
        "guide": cur.get("guide"),
        "stated_hours_per_week": [lo, hi], "budget_hours_in_block": budget_mid, "budget_period": label_mid,
        "stated_hours_exceed_budget": over, "stated_hours_clearly_exceed_budget": clearly,
        "energy": cur.get("energy"),
        "next_block": {"label": nxt.get("label"), "start": nxt.get("start"), "stated_hours_per_week": list(parse_hours_range(nxt.get("volume")))} if nxt else None,
        "upcoming_blocks_over_budget": upcoming_over_budget(blocks, today, prof),
        "provenance": "plan.json; budget from athlete/profile.json",
    }


def section_weight(today, data, prof, th):
    pts = [(d(row["date"]), num(row.get("weight_lb"))) for row in data["summary"] if num(row.get("weight_lb")) is not None and d(row["date"]) <= today]
    if not pts:
        return {"latest": None}
    latest_d, latest = pts[-1]

    def rolling(days):
        xs = [w for dd, w in pts if latest_d - timedelta(days=days - 1) <= dd <= latest_d]
        return r(statistics.fmean(xs), 1) if xs else None, len(xs)

    r4, n4 = rolling(4)
    r7, n7 = rolling(7)
    # slope over the last 21 days (lb per week), ordinary least squares on day index
    recent = [(dd, w) for dd, w in pts if latest_d - timedelta(days=20) <= dd <= latest_d]
    slope = None
    if len(recent) >= 5:
        xs = [(dd - recent[0][0]).days for dd, _ in recent]
        ys = [w for _, w in recent]
        mx, my = statistics.fmean(xs), statistics.fmean(ys)
        sxx = sum((x - mx) ** 2 for x in xs)
        slope = r(sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx * 7, 2) if sxx else None
    # plan path: linear between the plan.json weight points around today
    path = sorted([(d(x["date"]), x) for x in data["plan"] if x.get("kind") == "weight"], key=lambda t: t[0])
    plan_mid = None
    for (d0, a), (d1, b) in zip(path, path[1:]):
        if d0 <= today <= d1:
            f = (today - d0).days / max((d1 - d0).days, 1)
            plan_mid = {"lo": r(a["lo"] + (b["lo"] - a["lo"]) * f, 1), "mid": r(a["mid"] + (b["mid"] - a["mid"]) * f, 1), "hi": r(a["hi"] + (b["hi"] - a["hi"]) * f, 1)}
            break
    # fuel mode today and tomorrow: shortest covering period wins; key/quality/long/test/race today or tomorrow means maintenance
    def fuel_mode(day):
        periods = [x for x in data["plan"] if x.get("kind") == "fuel" and d(x["start"]) <= day <= d(x["end"])]
        if not periods:
            return "unknown", None
        p = min(periods, key=lambda x: (d(x["end"]) - d(x["start"])).days)
        mode = p.get("mode")
        reason = p.get("label")
        for dd in (day, day + timedelta(days=1)):
            for row in plan_rows(data, dd):
                if row.get("key") or row.get("intensity") in ("quality", "long", "test", "race"):
                    if mode != "maintenance":
                        return "maintenance", f"{p.get('label')} period, but a {row.get('intensity')} session on {iso(dd)} means maintenance"
        return mode, reason

    tm, tr = fuel_mode(today)
    nm, nr = fuel_mode(today + timedelta(days=1))
    return {
        "latest": {"date": iso(latest_d), "lb": latest, "days_ago": (today - latest_d).days},
        "rolling_4d": {"lb": r4, "n": n4}, "rolling_7d": {"lb": r7, "n": n7},
        "slope_lb_per_week_21d": slope, "slope_n": len(recent),
        "plan_path_today": plan_mid,
        "target": {"lo": prof.get("weight", {}).get("target_lo"), "hi": prof.get("weight", {}).get("target_hi"), "by": prof.get("weight", {}).get("target_by")},
        "fuel_mode_today": {"mode": tm, "reason": tr}, "fuel_mode_tomorrow": {"mode": nm, "reason": nr},
        "rule": "one weigh-in never changes intake; act when the 4-day and 7-day means agree for about a week",
        "provenance": "Measured (scale); means and slope Calculated; plan path Estimated",
    }


LEAN_DROP_FLAG_LB = 2.0  # CURRENT-STATE "Body composition" row (Oct 24, 2026)
BASELINE_DAYS = 10       # weigh-ins in the days just before a deficit season starts


def deficit_seasons(plan):
    """Deficit fuel periods merged when less than 15 days apart: [(start, end)]."""
    rows = sorted((d(x["start"]), d(x["end"])) for x in plan if x.get("kind") == "fuel" and x.get("mode") in ("deficit", "recovery_deficit"))
    out = []
    for a, b in rows:
        if out and (a - out[-1][1]).days < 15:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def section_body_comp(today, data):
    pts = [(d(x["date"]), x) for x in data["body_comp"] if x.get("date") and d(x["date"]) <= today]
    if not pts:
        return {"latest": None, "note": "No scale weigh-ins yet (data/body_comp.csv, from the iPhone Shortcut)."}
    by_day = {}
    for dd, x in sorted(pts, key=lambda t: t[1]["measured_at"]):
        by_day.setdefault(dd, x)  # the day's first weigh-in
    # Hume does not write lean mass to Apple Health (the athlete, Oct 29, 2026): derive it as
    # weight x (1 - body fat %) when the row has both, labelled Calculated.
    lean_calc = False
    for dd, x in list(by_day.items()):
        w, f = num(x.get("weight_lb")), num(x.get("body_fat_pct"))
        if num(x.get("lean_lb")) is None and w is not None and f is not None:
            by_day[dd] = dict(x, lean_lb=round(w * (1 - f / 100), 1))
            lean_calc = True
    days = sorted(by_day)

    def mean(field, lo, hi):
        xs = [num(by_day[dd].get(field)) for dd in days if lo <= dd <= hi]
        xs = [v for v in xs if v is not None]
        return {"mean": r(statistics.fmean(xs), 1) if xs else None, "n": len(xs)}

    def change(a, b):
        return r(a["mean"] - b["mean"], 1) if a["mean"] is not None and b["mean"] is not None and a["n"] >= 4 and b["n"] >= 4 else None

    now = (today - timedelta(days=13), today)
    prev = (today - timedelta(days=27), today - timedelta(days=14))
    lean, lean_p = mean("lean_lb", *now), mean("lean_lb", *prev)
    fat, fat_p = mean("body_fat_pct", *now), mean("body_fat_pct", *prev)
    last = by_day[days[-1]]
    baseline = None
    for s0, s1 in deficit_seasons(data["plan"]):
        if s0 - timedelta(days=BASELINE_DAYS) <= today <= s1 + timedelta(days=28):
            win = (s0 - timedelta(days=BASELINE_DAYS), s0 - timedelta(days=1))
            bl = mean("lean_lb", *win)
            baseline = {"season": [iso(s0), iso(s1)], "window": [iso(win[0]), iso(win[1])], "lean_lb": bl,
                        "lean_change_now": change(lean, bl) if today > s0 else None}
            break
    return {
        "latest": {"date": iso(days[-1]), "days_ago": (today - days[-1]).days, "weight_lb": num(last.get("weight_lb")),
                   "body_fat_pct": num(last.get("body_fat_pct")), "lean_lb": num(last.get("lean_lb")), "source": last.get("source") or None},
        "weigh_ins_28d": len([dd for dd in days if dd >= prev[0]]),
        "lean_lb_14d": lean, "lean_lb_prev_14d": lean_p, "lean_change_14d": change(lean, lean_p),
        "body_fat_pct_14d": fat, "body_fat_pct_prev_14d": fat_p, "body_fat_change_14d": change(fat, fat_p),
        "deficit_baseline": baseline,
        "rule": "trend only: never comment on one reading; compare 14-day means (4+ weigh-ins each); water shifts after races, long sessions, salt and alcohol move BIA numbers for days",
        "lean_source": "Calculated: weight x (1 - body fat %); Hume does not write lean mass to Apple Health" if lean_calc else "Measured",
        "provenance": "Measured (Hume BIA scale via Apple Health): weight and body fat; lean mass Calculated as weight x (1 - body fat) because Hume does not send it (body_comp.csv lean_basis); means and changes Calculated. Body fat from BIA can be 3 to 5 points off a lab scan for one person; the trend is what counts",
    }


def section_races(today, data):
    out = []
    for x in data["races"]:
        if x.get("kind") != "race" or not x.get("date"):
            continue
        rd = d(x["date"])
        days = (rd - today).days
        # The date decides what is upcoming, not today's status: a race marked done later must still
        # count as upcoming when an earlier morning is rebuilt (--date), or audits and tests drift.
        if days < 0 or days > 400:
            continue
        lo, hi = parse_range_hm(x.get("forecast"))
        limit_min = parse_hm(x.get("limit")) if x.get("limit") else None
        cut = []
        for part in (x.get("cutoffs") or "").split(";"):
            if "|" in part:
                seg, t = part.split("|", 1)
                cut.append({"segment": seg.strip(), "cutoff": t.strip(), "minutes": parse_hm(t)})
        margin = None
        if limit_min and lo is not None:
            margin = {"best_case": hms(limit_min - lo), "worst_case": hms(limit_min - hi), "thin": (limit_min - hi) < 60}
        out.append({"race_id": x.get("race_id"), "name": x.get("name"), "date": x["date"], "days_to_go": days, "status": x.get("status"), "priority": x.get("priority"),
                    "forecast": x.get("forecast"), "forecast_minutes": [lo, hi], "limit": x.get("limit"), "limit_minutes": limit_min, "cutoffs": cut, "cutoffs_src": x.get("cutoffs_src"),
                    "margin_overall": margin, "within_3_days": days <= 3,
                    "start_time": x.get("start_time"), "start_basis": x.get("start_basis"), "start_note": x.get("start_note")})
    try:  # gaps against coach/race_template.json (Nov 2, 2026); never block the check-in
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import race_check
        tpl = race_check.template()
        for o in out:
            race = next(x for x in data["races"] if x.get("kind") == "race" and x.get("race_id") == o["race_id"])
            o["missing"] = race_check.missing(race, data["races"], today, tpl)
    except Exception as e:
        for o in out:
            o["missing_error"] = f"race_check.py failed: {e}"
    out.sort(key=lambda z: z["days_to_go"])
    try:
        shared = race_check.shared_page_status(data["races"])
    except Exception as e:
        shared = f"check failed: {e}"
    reg, reg_error = [], None
    try:  # registration watch (Nov 5, 2026): every reg_dates entry within 14 days, and whether the check-in says it today
        for item in race_check.registration_due(data["races"], today):
            reg.append(dict(item, said_today=race_check.says_today(item, today), line=race_check.registration_line(item)))
    except Exception as e:  # never block the check-in
        reg_error = f"race_check.py failed: {e}"
    return {"upcoming": out[:6], "shared_page": shared, "registration": reg, "registration_error": reg_error,
            "provenance": "races.json; forecasts Estimated; margins Calculated; missing = gaps against coach/race_template.json, fill them this run; shared_page = the shared Race Season page vs races.json (RUNBOOK Publish step 5); registration = reg_dates within 14 days (posted or expected), said_today per race_check.says_today"}


def section_calibration(today, data, prof, th):
    """Easy-day RPE vs HR agreement over 28 days, per discipline, for the guardrail retire check."""
    acts = {a["activity_id"]: a for a in data["acts"]}
    pairs = []
    for s in data["feel_sessions"]:
        aid = (s.get("activity_id") or "").strip()
        a = acts.get(aid)
        if not a or num(s.get("rpe")) is None or not (today - timedelta(days=28) <= d(s["date"]) < today):
            continue
        disc = discipline(a.get("type"))
        g = prof.get("easy_hr_guardrail", {}).get(disc)
        if not g:
            continue
        rpe = num(s.get("rpe"))
        hr = num(a.get("avg_hr"))
        pairs.append({"date": s["date"], "discipline": disc, "rpe": rpe, "avg_hr": hr, "guardrail": g,
                      "agree": (rpe <= 3 and hr is not None and hr <= g) or (rpe >= 4 and hr is not None and hr > g)})
    easy = [p for p in pairs if p["rpe"] <= 3]
    n = len(easy)
    agree = sum(1 for p in easy if p["agree"])
    return {"pairs": pairs, "easy_sessions_rated": n, "easy_under_guardrail": agree,
            "guardrail_retire_candidate": n >= th["profile_fact_min_observations"] and agree == n,
            "note": "retire or move a guardrail when enough easy-rated sessions sit under it (RULES 5a)", "provenance": "Reported RPE vs Measured HR"}


def section_predictions(today, data):
    rows = [x for x in data["outcomes"] if x.get("date")]

    def summarise(days):
        w = [x for x in rows if today - timedelta(days=days) <= d(x["date"]) < today]
        n = len(w)
        if not n:
            return {"n": 0}
        matches = sum(1 for x in w if (x.get("match") or "").lower() == "yes")
        over = sum(1 for x in w if x.get("actual_completion") == "over")
        none = sum(1 for x in w if x.get("actual_completion") == "none")
        deltas = [num(x.get("rpe_delta")) for x in w if num(x.get("rpe_delta")) is not None]
        return {"n": n, "completion_match_rate": r(matches / n, 2), "over_rate": r(over / n, 2), "none_rate": r(none / n, 2),
                "mean_rpe_delta": r(statistics.fmean(deltas), 1) if deltas else None}

    pending = [x["date"] for x in data["predictions"] if x.get("date") and d(x["date"]) < today and not any(o.get("date") == x["date"] for o in rows)]
    return {"last_7_days": summarise(7), "last_28_days": summarise(28), "unscored_predictions": pending,
            "last": rows[-1] if rows else None, "provenance": "Calculated from coach/outcomes.csv (run coach/tools/reconcile.py first)"}


def section_response(today, data, th):
    """Observed patterns with counts. Facts graduate to athlete/RESPONSE-PROFILE.md once they reach the minimum count."""
    # easy-day overrun: planned easy rows in the last 28 days with a matching activity
    over = tot = 0
    examples = []
    for row in data["week"]:
        if row.get("kind") != "day" or row.get("intensity") != "easy" or not (today - timedelta(days=28) <= d(row["date"]) < today):
            continue
        acts = activity_rows(data, d(row["date"]))
        cls, act = classify(row, acts)
        if cls in ("none", "unknown", "rest"):
            continue
        tot += 1
        pct = (act["minutes"] / num(row.get("minutes")) - 1) * 100 if act and num(row.get("minutes")) else None
        hard = act and act.get("avg_hr") and row.get("type") in ("run", "bike") and act["avg_hr"] > {"run": 150, "bike": 135}.get(row["type"], 999)
        if cls == "over" or (pct is not None and pct > 25) or hard:
            over += 1
            examples.append({"date": row["date"], "type": row["type"], "planned_min": row.get("minutes"), "done_min": act["minutes"] if act else None, "pct_over": r(pct, 0), "avg_hr": act.get("avg_hr") if act else None})
    # strength completion: planned strength rows vs logged manual- sessions
    planned_s = [row for row in data["week"] if row.get("kind") == "day" and row.get("type") == "strength" and today - timedelta(days=28) <= d(row["date"]) < today]
    logged_s = {s["date"] for s in data["feel_sessions"] if "strength" in (s.get("activity_id") or "").lower() or "strength" in (s.get("activity") or "").lower()}
    done_s = sum(1 for row in planned_s if row["date"] in logged_s)
    return {
        "easy_day_overrun": {"n_easy_days_matched": tot, "overrun": over, "rate": r(over / tot, 2) if tot else None, "examples": examples[-6:],
                              "graduates_at_n": th["profile_fact_min_observations"]},
        "strength": {"planned_28d": len(planned_s), "logged_28d": done_s, "rate": r(done_s / len(planned_s), 2) if planned_s else None,
                     "note": "strength is logged on the dashboard as manual-<date>-strength; the watch does not record it"},
        "provenance": "Calculated over the last 28 days",
    }


# ---------- heartbeat (Nov 3, 2026) ----------

def _hb_last(root, ev):
    """The newest value of one evidence source in coach/ops/data_paths.json, as a string, or None."""
    path = os.path.join(root, ev["file"])
    if not os.path.exists(path):
        return None
    kind = ev["kind"]
    try:
        if kind == "json_field":
            with open(path) as fh:
                return json.load(fh).get(ev["field"])
        if kind == "json_rows_max":
            with open(path) as fh:
                rows = json.load(fh).get("rows", [])
            where = ev.get("where") or {}
            vals = [str(x[ev["field"]]) for x in rows if isinstance(x, dict) and x.get(ev["field"])
                    and all(x.get(k) == v for k, v in where.items())]
            return max(vals) if vals else None
        if kind == "csv_max":
            with open(path, newline="") as fh:
                vals = [row.get(ev["column"]) for row in csv.DictReader(fh)]
            vals = [v for v in vals if v]
            return max(vals) if vals else None
        if kind == "text_date":
            with open(path) as fh:
                for line in fh:
                    if line.startswith(ev["prefix"]):
                        m = re.search(r"\d{4}-\d{2}-\d{2}", line)
                        return m.group(0) if m else None
            return None
    except Exception:
        return None
    return None


def section_heartbeat(today, root=None, now_utc=None):
    """Last landing of every feed and task in coach/ops/data_paths.json against its expected cadence.

    A value newer than `today` (rebuilding a past morning) is never late. Garmin lateness under 26 h is
    left to freshness, which flags a pull older than 6 h."""
    root = root or ROOT
    spec = read_json(os.path.join(root, "coach/ops/data_paths.json"), {})
    now_utc = now_utc or datetime.now(timezone.utc)
    if today < now_utc.date() - timedelta(days=1):  # a rebuild: judge as of that day's evening
        now_utc = datetime(today.year, today.month, today.day, 23, 59, tzinfo=timezone.utc)
    out, late = [], []
    for p in spec.get("paths", []):
        last = _hb_last(root, p["evidence"])
        row = {"id": p["id"], "what": p["what"], "cadence": p.get("cadence"), "last": last,
               "age_hours": None, "age_days": None, "late": None, "alert": bool(p.get("alert"))}
        if last:
            try:
                if "T" in last:
                    dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    row["age_hours"] = r((now_utc - dt).total_seconds() / 3600, 1)
                    row["age_days"] = (today - dt.date()).days
                else:
                    row["age_days"] = (today - d(last[:10])).days
                    row["age_hours"] = row["age_days"] * 24
            except ValueError:
                row["error"] = f"unreadable value {last!r}"
        if p.get("alert"):
            if last is None:
                row["late"] = True
            elif p.get("max_age_hours") is not None and row["age_hours"] is not None:
                row["late"] = row["age_hours"] > p["max_age_hours"]
            elif p.get("max_age_days") is not None and row["age_days"] is not None:
                row["late"] = row["age_days"] > p["max_age_days"]
            if row["late"]:
                late.append(p["id"])
                row["fallback"] = p.get("fallback")
        out.append(row)
    return {"sources": out, "late": late,
            "provenance": "coach/ops/data_paths.json evidence files; ages Calculated; a feed the athlete fills by hand (alert false) is shown, never flagged"}


def heartbeat_flags(f):
    """One data-quality flag per late feed or task; Garmin is left to freshness when it already flags."""
    out = []
    fr = f.get("freshness") or {}
    for src in (f.get("heartbeat") or {}).get("sources", []):
        if not src.get("late"):
            continue
        if src["id"] == "garmin" and fr.get("flags"):
            continue
        seen = f"last seen {src['last']}" if src.get("last") else "never seen"
        age = f", {src['age_days']} d ago" if src.get("age_days") is not None else ""
        out.append({"rule": "data quality (heartbeat)", "text": f"{src['what']}: {seen}{age}, expected {src['cadence']}. Say it in the check-in's last line. Fallback: {src.get('fallback')}."})
    return out


def registration_flags(f):
    """One flag per race whose registration line the check-in carries today (race_check.says_today): 14 and 7 days out,
    the day before and the day itself; a planned race also every Sunday in the window, every morning of the last 3 days,
    and every Sunday while its registration is open and not done. An unreadable reg_dates entry is fixed, not said."""
    rc = f.get("races") or {}
    if rc.get("registration_error"):
        return [{"rule": "data quality", "text": f"Registration watch failed ({rc['registration_error']}). Say it in the check-in's last line."}]
    out, by_race = [], {}
    for x in rc.get("registration") or []:
        if not x.get("said_today"):
            continue
        if x.get("error"):
            out.append({"rule": "registration watch (format)", "text": x["line"]})
        else:
            by_race.setdefault(x.get("race_id"), []).append(x["line"])
    out += [{"rule": "registration watch", "text": " ".join(lines) + " Say it in one line of the check-in; when the athlete says the registration is done, mark the race registered in coach/races.json."}
            for lines in by_race.values()]
    return out


def build_flags(f, th):
    flags = []
    fr, fe, ya, ld, wk, bl, wt, rc = f["freshness"], f["feel"], f["yesterday"], f["load"], f["week"], f["block"], f["weight"], f["races"]
    flags += [{"rule": "data quality", "text": t} for t in fr["flags"]]
    if fe.get("today_missing"):
        flags.append({"rule": "5a feel", "text": f"No feel answers today ({fe['days_since_last_answer']} days since the last). Unknown, not assumed; link the dashboard only if a missing answer changes a decision."})
    if fe.get("energy_or_legs_at_or_below_2"):
        flags.append({"rule": "5a", "text": "Energy or legs at 2 or below: fallback."})
    if fe.get("two_mornings_low"):
        flags.append({"rule": "5a", "text": "Two mornings in a row a full point or more below the 14-day mean: back off."})
    if fe.get("stress_at_or_above_4"):
        flags.append({"rule": "5a", "text": "Stress 4 or above: trim the optional layer and protect sleep."})
    if fe.get("energy_and_legs_at_or_above_4"):
        flags.append({"rule": "5a / 13 push", "text": "Energy and legs both 4 or above: the strong-day bound is allowed if nothing else objects."})
    s = fe.get("pain_streak_mornings") or 0
    if s >= th["pain_persistent_mornings_physio"]:
        flags.append({"rule": "5a persistent niggle", "text": f"Pain above none at {', '.join(fe['pain_streak_sites']) or 'a site'} on {s} mornings in a row: recommend a physio or sports medicine look; hold load, no new stressor, load test before running."})
    elif s >= th["pain_persistent_mornings_flag"]:
        flags.append({"rule": "5a persistent niggle", "text": f"Pain above none at {', '.join(fe['pain_streak_sites']) or 'a site'} on {s} mornings in a row: hold load at or below current, no new stressor, load test before running."})
    # pain near a key session
    key_soon = [k for k in rc.get("upcoming", []) if k["within_3_days"]]
    near = f["week"].get("key_long_or_race_within_3_days", [])
    today_pain = (fe.get("today") or {}).get("pain") or 0
    if (near or key_soon) and today_pain > 0:
        flags.append({"rule": "5a pain near a key session", "text": "Pain above none within 3 days of a key, long or race session: load test first (walk, stairs, hops) and the fallback unless clearly better."})
    for m in ya["yesterday"]["plan"]:
        if m["completion"] == "over":
            flags.append({"rule": "13 restraint signal", "text": f"Yesterday's {m['planned']['type']} went beyond the strong-day bound ({m['minutes_vs_nominal_pct']:+.0f}% vs nominal). Name it once with numbers; adjust the next easy day."})
        if m["easy_but_hard"]:
            flags.append({"rule": "5a", "text": f"Yesterday's easy {m['planned']['type']} ran hard (HR above the guardrail or RPE 5+). Name it once; adjust the next easy day."})
    if ya["today"]["already_trained"]:
        flags.append({"rule": "5.5", "text": "A session already happened today: assess it and prescribe nothing extra."})
    for aid in ya["yesterday"]["long_session_fuel_ask"]:
        flags.append({"rule": "13 fueling", "text": f"Session {aid} was 90 min+ with no fuel note: ask once what was eaten and drunk."})
    if ld.get("longest_run_30d"):
        c = ld["longest_run_30d"]
        flags.append({"rule": "3 spike", "text": f"Next run cap: about {c['next_run_cap_minutes']} min / {c['next_run_cap_miles']} mi (longest in 30 days {c['minutes']} min on {c['date']}), unless a named exception."})
    if wk.get("planned_over_budget"):
        flags.append({"rule": "4 budget", "text": f"This week plans {wk['planned_hours']} h against a {wk['budget_hours'][0]} to {wk['budget_hours'][1]} h budget ({wk['budget_period']}). Say which optional session gives."})
    if bl.get("block") is not False and bl.get("stated_hours_exceed_budget"):
        flags.append({"rule": "4 budget", "text": f"The current block states {bl['stated_hours_per_week']} h/week against a {bl['budget_hours_in_block']} h budget ({bl['budget_period']}). A recorded decision is needed."})
    for b in bl.get("upcoming_blocks_over_budget", []):
        flags.append({"rule": "4 budget (upcoming)", "text": f"{b['label']} ({b['name']}) from {b['start']} states {b['stated'][0]} to {b['stated'][1]} h/week against a {b['budget'][0]} to {b['budget'][1]} h budget ({b['budget_period']}; {b['severity']}). Resolve before the block starts (goal conflict 6)."})
    for race in rc.get("upcoming", []):
        if race.get("margin_overall") and race["margin_overall"]["thin"]:
            flags.append({"rule": "10 cutoffs", "text": f"{race['name']}: worst-case margin to the overall limit is {race['margin_overall']['worst_case']} (thin)."})
        if race.get("limit_minutes") is None and (race.get("limit") or "").strip().lower() != "none" and race.get("priority") in ("A", "B") and race["days_to_go"] <= 240:
            flags.append({"rule": "10 cutoffs", "text": f"{race['name']} has no time limit on file; every A/B race forecast must state its cutoff margin."})
    flags += registration_flags(f)
    bc = wt.get("body_comp") or {}
    flags += heartbeat_flags(f)
    lc = (bc.get("deficit_baseline") or {}).get("lean_change_now")
    if lc is not None and lc <= -LEAN_DROP_FLAG_LB:
        flags.append({"rule": "body composition (CURRENT-STATE)", "text": f"Lean mass 14-day mean is {lc:+.1f} lb vs the pre-deficit baseline: check protein (~150 g) and that both lift sessions happen; if it holds another week, a week at maintenance."})
    if wt.get("fuel_mode_today", {}).get("mode") in ("deficit", "recovery_deficit"):
        flags.append({"rule": "7 fuel", "text": f"Fuel mode today: {wt['fuel_mode_today']['mode']} ({wt['fuel_mode_today']['reason']}); tomorrow: {wt['fuel_mode_tomorrow']['mode']}."})
    pr = f["predictions"]
    if pr.get("unscored_predictions"):
        flags.append({"rule": "reconcile", "text": f"Unscored predictions: {', '.join(pr['unscored_predictions'])}. Run coach/tools/reconcile.py."})
    rs = f["response"]["easy_day_overrun"]
    if rs["n_easy_days_matched"] >= th["profile_fact_min_observations"] and (rs["rate"] or 0) >= 0.5:
        flags.append({"rule": "response profile", "text": f"Easy days overrun {rs['overrun']} of {rs['n_easy_days_matched']} in 28 days: narrow the band or move the stop condition inside the session (RESPONSE-PROFILE.md)."})
    if f["calibration"].get("guardrail_retire_candidate"):
        flags.append({"rule": "5a guardrail", "text": "All recent easy-rated sessions sat under the HR guardrail: propose retiring it."})
    return flags


def section_block_brief(today):
    """The block brief's focus KPIs with progress and Sunday lines, and what the coach owes (coach/engine/BLOCK-BRIEF.md)."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import brief
        return brief.facts(today)
    except Exception as e:  # never block the check-in
        return {"error": f"brief.py failed: {e}"}


def build(today):
    data = load_all()
    th = data["schemas"].get("thresholds", {})
    prof = data["profile"]
    f = {"meta": {"date": iso(today), "weekday": today.strftime("%A"), "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  "timezone": prof.get("timezone"), "schemas_version": data["schemas"].get("version"),
                  "inputs": {"summary_rows": len(data["summary"]), "activities": len(data["acts"]), "feel_daily_rows": len(data["feel_daily"]), "feel_session_rows": len(data["feel_sessions"]), "outcomes_rows": len(data["outcomes"])}}}
    f["freshness"] = section_freshness(today, data)
    f["night"] = section_night(today, data, th)
    f["feel"] = section_feel(today, data, th)
    f["yesterday"] = section_yesterday(today, data, prof, th)
    f["load"] = section_load(today, data, th)
    f["week"] = section_week(today, data, prof)
    f["block"] = section_block(today, data, prof)
    f["block_brief"] = section_block_brief(today)
    f["weight"] = section_weight(today, data, prof, th)
    f["weight"]["body_comp"] = section_body_comp(today, data)
    f["races"] = section_races(today, data)
    f["calibration"] = section_calibration(today, data, prof, th)
    f["predictions"] = section_predictions(today, data)
    f["response"] = section_response(today, data, th)
    f["heartbeat"] = section_heartbeat(today)
    f["flags"] = build_flags(f, th)
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", help="YYYY-MM-DD (default: today in the athlete's timezone)")
    ap.add_argument("--out", default="coach/facts.json")
    ap.add_argument("--print", action="store_true", help="print a short summary")
    args = ap.parse_args()
    prof = read_json("coach/athlete/profile.json", {})
    tz = ZoneInfo(prof.get("timezone", "America/New_York"))
    today = d(args.date) if args.date else datetime.now(tz).date()
    f = build(today)
    with open(args.out, "w") as fh:
        json.dump(f, fh, indent=1, ensure_ascii=False, default=str)
        fh.write("\n")
    if args.print:
        n = f["night"]
        print(f"{f['meta']['date']} night {n.get('night')} ({'last night' if n.get('is_last_night') else 'OLDER'})")
        for k, m in (n.get("metrics") or {}).items():
            print(f"  {k}: {m['value']} (mean {m['mean']} sd {m['sd']} n {m['n']} z {m['z']})")
        print("flags:")
        for fl in f["flags"]:
            print(f"  [{fl['rule']}] {fl['text']}")
    print(f"wrote {args.out}: {len(f['flags'])} flags")


if __name__ == "__main__":
    main()
