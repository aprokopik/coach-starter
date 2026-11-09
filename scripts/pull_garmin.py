#!/usr/bin/env python3
"""Pull the athlete's Garmin Connect data for today and yesterday and commit-ready JSON.

Runs inside GitHub Actions. Never prints tokens or credentials.

Layout written (relative to repo root):
  data/daily/YYYY-MM-DD.json        exact Garmin responses per method for that date
  data/activities/<activityId>.json exact activity summary, splits, HR zones, weather
  data/streams/<activityId>.csv.gz  hilly runs and hikes only: a compact 5 s stream (scripts/streams.py)
  data/summary.csv                  one row per date of key metrics (derived, labeled); weight
                                    comes from data/body_comp.csv (the scale) when there is one
  data/activities.csv               one row per activity (derived)
  data/status/last_run.json         what succeeded, failed or was empty on the latest run
  state/garmin_tokens.enc           Fernet-encrypted Garmin token, refreshed when it rotates

A daily file is rewritten only when Garmin's content changed, so git history
holds every distinct capture (partial morning record, later completed record).
"""
from __future__ import annotations

import csv
import json
import os
import sys
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import body_comp  # scale weigh-ins from Apple Health; the scale wins over a Garmin manual entry
import streams  # per-second detail for hilly runs and hikes (Nov 8, 2026)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DAILY = DATA / "daily"
ACTS = DATA / "activities"
STATUS = DATA / "status"
TOKEN_FILE = ROOT / "state" / "garmin_tokens.enc"
LOCAL_TZ = ZoneInfo("America/New_York")
SCHEMA = "alex-garmin-daily/1"

# (key, method name, argument style). "d" = date, "dd" = start,end both the date.
DAILY_METHODS = [
    ("user_summary", "get_user_summary", "d"),
    ("sleep", "get_sleep_data", "d"),
    ("hrv", "get_hrv_data", "d"),
    ("resting_hr", "get_rhr_day", "d"),
    ("heart_rates", "get_heart_rates", "d"),
    ("stress", "get_all_day_stress", "d"),
    ("body_battery", "get_body_battery", "dd"),
    ("body_battery_events", "get_body_battery_events", "d"),
    ("respiration", "get_respiration_data", "d"),
    ("spo2", "get_spo2_data", "d"),
    ("training_readiness", "get_training_readiness", "d"),
    ("morning_training_readiness", "get_morning_training_readiness", "d"),
    ("training_status", "get_training_status", "d"),
    ("body_composition", "get_body_composition", "dd"),
    ("blood_pressure", "get_blood_pressure", "dd"),
    ("intensity_minutes", "get_intensity_minutes_data", "d"),
    ("max_metrics", "get_max_metrics", "d"),
]
ACTIVITY_EXTRAS = [
    ("splits", "get_activity_splits"),
    ("hr_zones", "get_activity_hr_in_timezones"),
    ("weather", "get_activity_weather"),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def is_empty(value) -> bool:
    return value is None or value == {} or value == [] or value == ""


# ---------- token handling ----------

def token_key() -> bytes | None:
    """Encryption key for the saved Garmin session.

    Uses the GARMIN_TOKEN_KEY secret if present (advanced setup); otherwise derives
    a key from the GARMIN_PASSWORD secret, so the simple setup needs only two secrets.
    """
    explicit = os.environ.get("GARMIN_TOKEN_KEY", "").strip()
    if explicit:
        return explicit.encode()
    password = os.environ.get("GARMIN_PASSWORD", "")
    if not password:
        return None
    import base64

    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=b"{{REPO}}/token/v1", iterations=390_000)
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def load_token() -> str | None:
    key = token_key()
    if not key or not TOKEN_FILE.exists():
        return None
    from cryptography.fernet import Fernet, InvalidToken

    try:
        return Fernet(key).decrypt(TOKEN_FILE.read_bytes()).decode()
    except InvalidToken:  # password or key changed: fall back to a fresh login
        print("Saved Garmin session could not be decrypted; logging in fresh.")
        return None


def save_token_if_rotated(old_plain: str | None, new_plain: str) -> bool:
    key = token_key()
    if not key or not new_plain:
        return False
    if old_plain is not None and json.loads(old_plain) == json.loads(new_plain):
        return False
    from cryptography.fernet import Fernet

    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_bytes(Fernet(key).encrypt(new_plain.encode()))
    return True


def connect():
    from garminconnect import Garmin

    token = load_token()
    email = os.environ.get("GARMIN_EMAIL") or None
    password = os.environ.get("GARMIN_PASSWORD") or None
    if token is None and not (email and password):
        raise SystemExit(
            "No usable login: add the GARMIN_EMAIL and GARMIN_PASSWORD secrets (see SETUP.md)."
        )
    # return_on_mfa makes an MFA-protected account fail fast with a clear message
    # instead of waiting for a code nobody can type in GitHub.
    g = Garmin(email=email, password=password, return_on_mfa=token is None)
    result = g.login(tokenstore=token)
    if token is None and result and result[0]:
        raise SystemExit(
            "Garmin asked for a two-step verification code. Use the advanced setup in SETUP.md."
        )
    if token is None:  # early-return mode skips the profile load on success; do it now
        g._load_profile_and_settings()
    return g, token


# ---------- pulling ----------

def call(g, method: str, *args):
    fn = getattr(g, method, None)
    if fn is None:
        return "missing_method", None, f"library has no {method}"
    try:
        value = fn(*args)
    except Exception as exc:  # keep going; record the failure
        return "error", None, f"{type(exc).__name__}: {str(exc)[:300]}"
    return ("empty" if is_empty(value) else "ok"), value, None


def pull_day(g, day: str) -> dict:
    responses, status = {}, {}
    for key, method, style in DAILY_METHODS:
        args = (day,) if style == "d" else (day, day)
        state, value, err = call(g, method, *args)
        status[key] = state if err is None else f"{state}: {err}"
        if state in ("ok", "empty"):
            responses[key] = value
    return {"responses": responses, "method_status": status}


def write_if_changed(path: Path, payload: dict, content_keys: list[str]) -> bool:
    new_content = {k: payload.get(k) for k in content_keys}
    if path.exists():
        try:
            old = json.loads(path.read_text())
            if canonical({k: old.get(k) for k in content_keys}) == canonical(new_content):
                return False
        except json.JSONDecodeError:
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, sort_keys=True, default=str) + "\n")
    return True


# ---------- derived summary (labeled as derived; exact data stays in daily files) ----------

def dig(obj, *path):
    for p in path:
        if isinstance(obj, dict):
            obj = obj.get(p)
        elif isinstance(obj, list) and isinstance(p, int) and -len(obj) <= p < len(obj):
            obj = obj[p]
        else:
            return None
    return obj


def first_number(*vals):
    for v in vals:
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return v
    return None


SUMMARY_FIELDS = [
    "date", "last_changed_utc", "sleep_h", "sleep_score", "sleep_deep_h", "sleep_rem_h",
    "sleep_awake_h", "hrv_overnight_ms", "hrv_weekly_ms", "hrv_status", "resting_hr",
    "body_battery_high", "body_battery_low", "body_battery_charged", "body_battery_drained",
    "stress_avg", "steps", "active_kcal", "intensity_min_moderate", "intensity_min_vigorous",
    "training_readiness", "training_readiness_level", "weight_kg", "weight_lb",
    "body_fat_pct", "lean_lb", "weight_source", "spo2_avg", "resp_avg_sleep", "missing",
]


def summarize(day: str, rec: dict) -> dict:
    r = rec["responses"]
    us, sl, hrv = r.get("user_summary") or {}, r.get("sleep") or {}, r.get("hrv") or {}
    dto = sl.get("dailySleepDTO") or {}
    h = lambda s: round(s / 3600, 2) if isinstance(s, (int, float)) else None
    tr = r.get("morning_training_readiness") or dig(r.get("training_readiness"), 0) or {}
    bc = r.get("body_composition") or {}
    w_g = first_number(dig(bc, "totalAverage", "weight"), dig(bc, "dateWeightList", -1, "weight"))
    fat = first_number(dig(bc, "totalAverage", "bodyFat"), dig(bc, "dateWeightList", -1, "bodyFat"))
    row = {
        "date": day,
        "sleep_h": h(dto.get("sleepTimeSeconds")),
        "sleep_score": dig(dto, "sleepScores", "overall", "value"),
        "sleep_deep_h": h(dto.get("deepSleepSeconds")),
        "sleep_rem_h": h(dto.get("remSleepSeconds")),
        "sleep_awake_h": h(dto.get("awakeSleepSeconds")),
        "hrv_overnight_ms": first_number(dig(hrv, "hrvSummary", "lastNightAvg"), sl.get("avgOvernightHrv")),
        "hrv_weekly_ms": dig(hrv, "hrvSummary", "weeklyAvg"),
        "hrv_status": dig(hrv, "hrvSummary", "status") or sl.get("hrvStatus"),
        "resting_hr": first_number(us.get("restingHeartRate"), sl.get("restingHeartRate")),
        "body_battery_high": us.get("bodyBatteryHighestValue"),
        "body_battery_low": us.get("bodyBatteryLowestValue"),
        "body_battery_charged": us.get("bodyBatteryChargedValue"),
        "body_battery_drained": us.get("bodyBatteryDrainedValue"),
        "stress_avg": first_number(us.get("averageStressLevel"), dig(r.get("stress"), "avgStressLevel")),
        "steps": us.get("totalSteps"),
        "active_kcal": us.get("activeKilocalories"),
        "intensity_min_moderate": us.get("moderateIntensityMinutes"),
        "intensity_min_vigorous": us.get("vigorousIntensityMinutes"),
        "training_readiness": tr.get("score") if isinstance(tr, dict) else None,
        "training_readiness_level": tr.get("level") if isinstance(tr, dict) else None,
        "weight_kg": round(w_g / 1000, 2) if w_g else None,
        "weight_lb": round(w_g / 453.59237, 1) if w_g else None,
        "body_fat_pct": fat,
        "spo2_avg": first_number(dig(r.get("spo2"), "averageSpO2"), dig(r.get("spo2"), "avgSleepSpO2")),
        "resp_avg_sleep": first_number(dig(r.get("respiration"), "avgSleepRespirationValue")),
    }
    core = ["sleep_h", "sleep_score", "hrv_overnight_ms", "resting_hr", "body_battery_high"]
    row["missing"] = ";".join(k for k in core if row[k] is None)
    return body_comp.apply(row)


def upsert_csv(path: Path, fields: list[str], key: str, rows: list[dict]) -> None:
    existing = {}
    if path.exists():
        with path.open(newline="") as f:
            for row in csv.DictReader(f):
                existing[row[key]] = row
    for row in rows:
        existing[str(row[key])] = {k: ("" if row.get(k) is None else row.get(k)) for k in fields}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for k in sorted(existing):
            w.writerow(existing[k])


ACTIVITY_FIELDS = [
    "activity_id", "local_start", "type", "name", "device", "duration_min", "moving_min",
    "elapsed_min", "distance_km", "distance_mi", "ascent_m", "ascent_ft", "avg_hr", "max_hr",
    "avg_power_w", "norm_power_w", "avg_speed_kmh", "training_effect_aerobic",
    "training_effect_anaerobic", "training_load", "calories",
]


def r1(v, nd):
    return round(v, nd) if isinstance(v, (int, float)) and not isinstance(v, bool) else v


def activity_row(a: dict) -> dict:
    mins = lambda s: round(s / 60, 2) if isinstance(s, (int, float)) else None
    dist, asc, spd = a.get("distance"), a.get("elevationGain"), a.get("averageSpeed")
    return {
        "activity_id": a.get("activityId"),
        "local_start": a.get("startTimeLocal"),
        "type": dig(a, "activityType", "typeKey"),
        "name": a.get("activityName"),
        "device": a.get("deviceId"),
        "duration_min": mins(a.get("duration")),
        "moving_min": mins(a.get("movingDuration")),
        "elapsed_min": mins(a.get("elapsedDuration")),
        "distance_km": round(dist / 1000, 3) if dist else None,
        "distance_mi": round(dist / 1609.344, 3) if dist else None,
        "ascent_m": asc,
        "ascent_ft": round(asc * 3.28084) if isinstance(asc, (int, float)) else None,
        "avg_hr": a.get("averageHR"),
        "max_hr": a.get("maxHR"),
        "avg_power_w": r1(a.get("avgPower"), 0),
        "norm_power_w": r1(a.get("normPower"), 0),
        "avg_speed_kmh": round(spd * 3.6, 2) if isinstance(spd, (int, float)) else None,
        "training_effect_aerobic": r1(a.get("aerobicTrainingEffect"), 1),
        "training_effect_anaerobic": r1(a.get("anaerobicTrainingEffect"), 1),
        "training_load": r1(a.get("activityTrainingLoad"), 1),
        "calories": a.get("calories"),
    }


# ---------- main ----------

def main() -> int:
    run_at = utc_now()
    today_local = datetime.now(LOCAL_TZ).date()
    days = [(today_local - timedelta(days=i)).isoformat() for i in (1, 0)]
    extra = os.environ.get("EXTRA_DAYS_BACK", "").strip()
    if extra.isdigit() and int(extra) > 0:  # manual backfill from the Actions page
        days = [(today_local - timedelta(days=i)).isoformat() for i in range(int(extra) + 1, -1, -1)]
        days = sorted(set(days))

    status = {"run_at_utc": run_at, "requested_dates": days, "dates": {}, "activities": {},
              "token_rotated": False, "fatal": None}
    try:
        g, old_token = connect()
    except BaseException as exc:
        status["fatal"] = f"login failed: {type(exc).__name__}: {str(exc)[:300]}"
        STATUS.mkdir(parents=True, exist_ok=True)
        (STATUS / "last_run.json").write_text(json.dumps(status, indent=1) + "\n")
        print(status["fatal"], file=sys.stderr)
        return 2

    summary_rows = []
    for day in days:
        rec = pull_day(g, day)
        prev_path = DAILY / f"{day}.json"
        if prev_path.exists():  # a transient error must not erase an earlier good capture
            prev = json.loads(prev_path.read_text()).get("responses", {})
            for key, value in prev.items():
                if key not in rec["responses"]:
                    rec["responses"][key] = value
                    rec["method_status"][key] += " (kept earlier capture)"
        payload = {"schema": SCHEMA, "date": day, "pulled_at_utc": run_at, **rec}
        changed = write_if_changed(DAILY / f"{day}.json", payload, ["responses"])
        row = summarize(day, rec)
        row["last_changed_utc"] = run_at if changed else None
        if not changed:  # keep the original change time in the csv
            prev = json.loads((DAILY / f"{day}.json").read_text())
            row["last_changed_utc"] = prev.get("pulled_at_utc")
        summary_rows.append(row)
        status["dates"][day] = {"changed": changed, "missing_core": row["missing"],
                                "methods": rec["method_status"]}

    state, acts, err = call(g, "get_activities_by_date", days[0], days[-1])
    status["activities_list"] = state if err is None else f"{state}: {err}"
    act_rows = []
    for a in acts or []:
        aid = a.get("activityId")
        if aid is None:
            continue
        extras, ex_status = {}, {}
        for key, method in ACTIVITY_EXTRAS:
            s, v, e = call(g, method, str(aid))
            ex_status[key] = s if e is None else f"{s}: {e}"
            if s in ("ok", "empty"):
                extras[key] = v
        payload = {"schema": SCHEMA, "activity_id": aid, "pulled_at_utc": run_at,
                   "summary": a, **extras, "method_status": ex_status}
        changed = write_if_changed(ACTS / f"{aid}.json", payload, ["summary"] + [k for k, _ in ACTIVITY_EXTRAS])
        status["activities"][str(aid)] = {"changed": changed, "methods": ex_status}
        st = streams.pull(g, call, a)  # never raises past call(); a failure is only recorded
        if st != "skipped":
            status["activities"][str(aid)]["stream"] = st
        act_rows.append(activity_row(a))

    upsert_csv(DATA / "summary.csv", SUMMARY_FIELDS, "date", summary_rows)
    if act_rows:
        upsert_csv(DATA / "activities.csv", ACTIVITY_FIELDS, "activity_id", act_rows)

    try:
        status["token_rotated"] = save_token_if_rotated(old_token, g.client.dumps())
    except Exception as exc:
        status["token_rotated"] = f"not saved: {type(exc).__name__}"

    STATUS.mkdir(parents=True, exist_ok=True)
    (STATUS / "last_run.json").write_text(json.dumps(status, indent=1, sort_keys=True) + "\n")
    for d, s in status["dates"].items():
        print(f"{d}: changed={s['changed']} missing={s['missing_core'] or 'none'}")
    print(f"activities: {len(act_rows)}  token_rotated={status['token_rotated']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
