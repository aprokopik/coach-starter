"""Apple Health ingest (scripts/apple_health.py) and the Strava row mapping (scripts/pull_strava.py).

Made-up samples only. The merge runs on a temp copy of the repo layout, never the checkout."""
import csv
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import apple_health as ah  # noqa: E402
import pull_strava as ps  # noqa: E402

TZ = ZoneInfo("America/Chicago")
SLEEP = "\n".join([
    # ring: 7 h asleep, ending the morning of Nov 4
    "2026-11-03T22:30:00-06:00;2026-11-04T06:30:00-06:00;In Bed;Oura",
    "2026-11-03T22:45:00-06:00;2026-11-04T01:00:00-06:00;Core;Oura",
    "2026-11-04T01:00:00-06:00;2026-11-04T02:30:00-06:00;Deep;Oura",
    "2026-11-04T02:30:00-06:00;2026-11-04T02:45:00-06:00;Awake;Oura",
    "2026-11-04T02:45:00-06:00;2026-11-04T04:30:00-06:00;REM;Oura",
    "2026-11-04T04:30:00-06:00;2026-11-04T06:00:00-06:00;Core;Oura",
    # phone guess for the same night, shorter: must not be added on top
    "2026-11-03T23:30:00-06:00;2026-11-04T05:30:00-06:00;Asleep;iPhone",
])
PAYLOAD = {
    "sleep": SLEEP,
    "hrv": "2026-11-04T02:00:00-06:00;40;Oura\n2026-11-04T04:00:00-06:00;50;Oura\n2026-11-04T18:00:00-06:00;90;Oura",
    "rhr": "2026-11-04T07:00:00-06:00;52;Oura\n2026-11-04T09:00:00-06:00;51;Oura",
    "steps": "2026-11-04T10:00:00-06:00;4000;iPhone\n2026-11-04T15:00:00-06:00;3000;iPhone\n2026-11-04T10:00:00-06:00;6500;Oura",
    "weight": "2026-11-04T07:05:00-06:00;70;kg;Withings",
}


class Build(unittest.TestCase):
    def setUp(self):
        self.days, self.warn, self.seen = ah.build(PAYLOAD, TZ)
        self.d = self.days["2026-11-04"]

    def test_night_from_one_source_on_wake_date(self):
        # 2:15 core + 1:30 deep + 1:45 REM + 1:30 core = 7.0 h; the phone's 6 h are not added
        self.assertEqual(self.d["sleep_h"], 7.0)
        self.assertEqual((self.d["sleep_deep_h"], self.d["sleep_rem_h"], self.d["sleep_awake_h"]), (1.5, 1.75, 0.25))

    def test_hrv_is_overnight_mean(self):
        self.assertEqual(self.d["hrv_overnight_ms"], 45)  # the 6 PM reading is outside the night

    def test_rhr_latest_steps_best_source_weight_kg(self):
        self.assertEqual(self.d["resting_hr"], 51)
        self.assertEqual(self.d["steps"], 7000)
        self.assertEqual((self.d["weight_lb"], self.d["weight_source"]), (154.3, "scale"))

    def test_bad_lines_skipped(self):
        days, warn, _ = ah.build({"sleep": "nonsense\n2026-11-04T06:00;2026-11-04T05:00;Core;X", "rhr": "2026-11-04;300;X"}, TZ)
        self.assertEqual(days, {})
        self.assertTrue(warn)


class Merge(unittest.TestCase):
    def test_merge_is_idempotent_and_marks_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = ah.ROOT
            try:
                ah.ROOT = Path(tmp)
                days, _, _ = ah.build(PAYLOAD, TZ)
                self.assertEqual(ah.merge_summary(days), ["2026-11-04"])
                self.assertEqual(ah.merge_summary(days), [])
                with open(Path(tmp) / "data/summary.csv") as f:
                    row = next(csv.DictReader(f))
                self.assertEqual((row["sleep_h"], row["missing"]), ("7.0", ""))
                partial, _, _ = ah.build({"rhr": PAYLOAD["rhr"].replace("2026-11-04", "2026-11-05")}, TZ)
                ah.merge_summary(partial)
                with open(Path(tmp) / "data/summary.csv") as f:
                    rows = {r["date"]: r for r in csv.DictReader(f)}
                self.assertEqual(rows["2026-11-05"]["missing"], "sleep_h;hrv_overnight_ms")
            finally:
                ah.ROOT = old


class Strava(unittest.TestCase):
    def test_row_maps_to_garmin_columns(self):
        r = ps.row({"id": 123, "name": "Morning Run", "sport_type": "TrailRun", "start_date_local": "2026-11-04T06:30:00Z",
                    "elapsed_time": 3600, "moving_time": 3300, "distance": 10000, "total_elevation_gain": 250.0,
                    "average_heartrate": 141.2, "max_heartrate": 165, "average_speed": 3.0})
        self.assertEqual((r["activity_id"], r["type"], r["local_start"]), ("strava-123", "trail_running", "2026-11-04 06:30:00"))
        self.assertEqual((r["duration_min"], r["distance_mi"], r["ascent_ft"], r["avg_speed_kmh"]), (60.0, 6.21, 820, 10.8))

    def test_no_secrets_is_a_quiet_no_op(self):
        env = {k: os.environ.pop(k) for k in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN") if k in os.environ}
        try:
            self.assertEqual(ps.main(), 0)
        finally:
            os.environ.update(env)


if __name__ == "__main__":
    unittest.main()
