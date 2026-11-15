#!/usr/bin/env python3
"""Workouts from Strava into data/activities.csv, for athletes without Garmin.

Apple Health workouts cannot be read by an iPhone Shortcut, so workouts come from Strava, where
Apple Watch, Oura, Ultrahuman, Wahoo, Zwift and most apps can post them. Runs in GitHub Actions
(.github/workflows/pull-strava.yml) with three repository secrets made once at setup
(scripts/setup_strava.py): STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN.

Writes data/activities.csv with the Garmin pull's columns (type mapped to Garmin's type keys so
every coach tool reads it unchanged) and data/status/strava_last_run.json.
EXTRA_DAYS_BACK (default 2) sets how far back to look; the first run can ask for 90.
Never prints tokens.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pull_garmin import ACTIVITY_FIELDS, upsert_csv  # noqa: E402

# Strava sport_type -> the Garmin typeKey the coach tools expect
TYPES = {
    "Run": "running", "TrailRun": "trail_running", "VirtualRun": "treadmill_running",
    "Ride": "cycling", "VirtualRide": "virtual_ride", "GravelRide": "gravel_cycling",
    "MountainBikeRide": "mountain_biking", "EBikeRide": "e_bike_fitness", "Swim": "lap_swimming",
    "WeightTraining": "strength_training", "Crossfit": "strength_training", "Walk": "walking",
    "Hike": "hiking", "Yoga": "yoga", "Rowing": "rowing", "Workout": "other",
}


def post(url: str, data: dict) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(url: str, token: str) -> list | dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


STATE = ROOT / "state" / "strava_refresh.enc"


def _fernet(secret: str):
    import base64

    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=b"coach/strava/v1", iterations=390_000)
    return Fernet(base64.urlsafe_b64encode(kdf.derive(secret.encode())))


def current_refresh(secret: str, from_secret: str) -> str:
    """Strava may rotate the refresh token; the newest one is kept encrypted in state/."""
    if STATE.exists():
        try:
            return _fernet(secret).decrypt(STATE.read_bytes()).decode()
        except Exception:  # noqa: BLE001  (secret changed: start again from the repository secret)
            pass
    return from_secret


def save_refresh(secret: str, token: str) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_bytes(_fernet(secret).encrypt(token.encode()))


def row(a: dict) -> dict:
    mins = lambda s: round(s / 60, 2) if isinstance(s, (int, float)) else None
    dist, asc, spd = a.get("distance"), a.get("total_elevation_gain"), a.get("average_speed")
    return {
        "activity_id": f"strava-{a['id']}",
        "local_start": (a.get("start_date_local") or "").replace("T", " ").replace("Z", ""),
        "type": TYPES.get(a.get("sport_type") or a.get("type"), "other"),
        "name": a.get("name"),
        "device": a.get("device_name") or "strava",
        "duration_min": mins(a.get("elapsed_time")),
        "moving_min": mins(a.get("moving_time")),
        "elapsed_min": mins(a.get("elapsed_time")),
        "distance_km": round(dist / 1000, 2) if dist else None,
        "distance_mi": round(dist / 1609.344, 2) if dist else None,
        "ascent_m": round(asc, 1) if asc is not None else None,
        "ascent_ft": round(asc * 3.28084) if asc is not None else None,
        "avg_hr": a.get("average_heartrate"),
        "max_hr": a.get("max_heartrate"),
        "avg_power_w": a.get("average_watts"),
        "norm_power_w": a.get("weighted_average_watts"),
        "avg_speed_kmh": round(spd * 3.6, 2) if spd else None,
        "calories": a.get("calories") or (round(a["kilojoules"]) if a.get("kilojoules") else None),
    }


def main() -> int:
    cid, secret, refresh = (os.environ.get(k, "").strip() for k in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN"))
    if not (cid and secret and refresh):
        print("Strava secrets not set: nothing to do (setup: scripts/setup_strava.py)")
        return 0
    days = os.environ.get("EXTRA_DAYS_BACK", "").strip()
    days = int(days) if days.isdigit() and int(days) > 0 else 2
    status = {"run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "strava", "days_back": days}
    try:
        used = current_refresh(secret, refresh)
        tok = post("https://www.strava.com/oauth/token", {"client_id": cid, "client_secret": secret,
                                                          "grant_type": "refresh_token", "refresh_token": used})
        if tok.get("refresh_token") and tok["refresh_token"] != used:
            save_refresh(secret, tok["refresh_token"])
        after = int((datetime.now(timezone.utc) - timedelta(days=days + 1)).timestamp())
        acts, page = [], 1
        while True:
            batch = get(f"https://www.strava.com/api/v3/athlete/activities?after={after}&per_page=100&page={page}", tok["access_token"])
            acts += batch
            if len(batch) < 100 or page >= 10:
                break
            page += 1
    except Exception as e:  # noqa: BLE001  (any HTTP or token failure is reported, never the token)
        status["error"] = type(e).__name__ + (f" {e.code}" if hasattr(e, "code") else "")
        (ROOT / "data/status").mkdir(parents=True, exist_ok=True)
        (ROOT / "data/status/strava_last_run.json").write_text(json.dumps(status, indent=1) + "\n")
        print("Strava pull failed:", status["error"])
        return 1
    rows = [row(a) for a in acts if a.get("id")]
    if rows:
        upsert_csv(ROOT / "data" / "activities.csv", ACTIVITY_FIELDS, "activity_id", rows)
    status["activities"] = len(rows)
    (ROOT / "data/status").mkdir(parents=True, exist_ok=True)
    (ROOT / "data/status/strava_last_run.json").write_text(json.dumps(status, indent=1) + "\n")
    print(f"{len(rows)} Strava activities in the last {days} days")
    return 0


if __name__ == "__main__":
    sys.exit(main())
