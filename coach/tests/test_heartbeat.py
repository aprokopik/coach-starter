"""Heartbeat (morning_facts.section_heartbeat): every feed and task in data_paths.json, late or not.

Synthetic files in a temp directory; no live data."""
import json
import os
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))
os.chdir(ROOT)

import morning_facts as mf  # noqa: E402

SPEC = {"paths": [
    {"id": "garmin", "what": "Garmin", "cadence": "daily", "evidence": {"kind": "json_field", "file": "last_run.json", "field": "run_at_utc"}, "max_age_hours": 26, "alert": True, "fallback": "dispatch"},
    {"id": "scale", "what": "Scale", "cadence": "twice daily", "evidence": {"kind": "csv_max", "file": "body.csv", "column": "received_utc"}, "max_age_hours": 48, "alert": True, "fallback": "Shortcut by hand"},
    {"id": "race_watch", "what": "Race watch", "cadence": "weekly", "evidence": {"kind": "json_rows_max", "file": "races.json", "field": "reg_checked"}, "max_age_days": 8, "alert": True, "fallback": "run by hand"},
    {"id": "research_scan", "what": "Research", "cadence": "monthly", "evidence": {"kind": "text_date", "file": "queue.md", "prefix": "Last monthly scan:"}, "max_age_days": 33, "alert": True, "fallback": "run by hand"},
    {"id": "missing", "what": "Never written", "cadence": "daily", "evidence": {"kind": "csv_max", "file": "nope.csv", "column": "date"}, "max_age_days": 1, "alert": True},
    {"id": "feel", "what": "Feel", "cadence": "when answered", "evidence": {"kind": "csv_max", "file": "feel.csv", "column": "date"}, "alert": False},
]}


def write(root, name, text):
    p = os.path.join(root, name)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as fh:
        fh.write(text)


class Heartbeat(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        r = self.tmp.name
        write(r, "coach/ops/data_paths.json", json.dumps(SPEC))
        write(r, "last_run.json", json.dumps({"run_at_utc": "2026-11-03T12:47:00Z"}))
        write(r, "body.csv", "date,received_utc\n2026-10-31,2026-10-31T13:00:00Z\n2026-11-01,2026-11-01T11:00:00Z\n")
        write(r, "races.json", json.dumps({"rows": [{"reg_checked": "2026-10-18"}, {"reg_checked": "2026-11-01"}, {"kind": "race"}]}))
        write(r, "queue.md", "# Queue\n\nLast monthly scan: 2026-09-20 (next due Oct 1).\n")
        write(r, "feel.csv", "date\n2026-10-01\n")
        self.root = r
        self.now = datetime(2026, 11, 3, 13, 0, tzinfo=timezone.utc)

    def tearDown(self):
        self.tmp.cleanup()

    def run_hb(self, today=date(2026, 11, 3)):
        hb = mf.section_heartbeat(today, root=self.root, now_utc=self.now)
        return hb, {s["id"]: s for s in hb["sources"]}

    def test_fresh_and_late(self):
        hb, by = self.run_hb()
        self.assertFalse(by["garmin"]["late"])
        self.assertEqual(by["garmin"]["age_hours"], 0.2)
        self.assertFalse(by["race_watch"]["late"])  # 2 days, weekly
        self.assertTrue(by["scale"]["late"])  # 50 h since the last new weigh-in
        self.assertTrue(by["research_scan"]["late"])  # 44 days
        self.assertEqual(by["research_scan"]["fallback"], "run by hand")

    def test_missing_file_is_late(self):
        hb, by = self.run_hb()
        self.assertIsNone(by["missing"]["last"])
        self.assertTrue(by["missing"]["late"])
        self.assertEqual(set(hb["late"]), {"scale", "research_scan", "missing"})

    def test_hand_filled_feed_is_never_flagged(self):
        hb, by = self.run_hb()
        self.assertIsNone(by["feel"]["late"])
        self.assertNotIn("feel", hb["late"])
        self.assertEqual(by["feel"]["age_days"], 33)

    def test_rebuild_of_past_day_is_never_late_for_newer_values(self):
        hb, by = self.run_hb(today=date(2026, 10, 20))
        self.assertFalse(by["garmin"]["late"])
        self.assertFalse(by["race_watch"]["late"])

    def test_flags_skip_garmin_when_freshness_already_flags(self):
        f = {"freshness": {"flags": ["Garmin pull is 30 h old."]}, "heartbeat": {"sources": [
            {"id": "garmin", "what": "Garmin", "cadence": "daily", "last": "x", "age_days": 1, "late": True, "fallback": "dispatch"},
            {"id": "scale", "what": "Scale", "cadence": "twice daily", "last": "y", "age_days": 3, "late": True, "fallback": "Shortcut"}]}}
        texts = [t for t in mf.heartbeat_flags(f)]
        self.assertEqual(len(texts), 1)
        self.assertIn("Scale", texts[0]["text"])

    def test_live_spec_parses_and_every_alert_has_a_limit(self):
        spec = json.load(open(os.path.join(ROOT, "coach/ops/data_paths.json")))
        for p in spec["paths"]:
            self.assertIn(p["evidence"]["kind"], ("json_field", "json_rows_max", "csv_max", "text_date"), p["id"])
            if p.get("alert"):
                self.assertTrue(p.get("max_age_hours") is not None or p.get("max_age_days") is not None, p["id"])


if __name__ == "__main__":
    unittest.main()
