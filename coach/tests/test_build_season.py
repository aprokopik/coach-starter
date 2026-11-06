"""Shared Race Season page generated from races.json (coach/tools/build_season.py; the athlete, Nov 3, 2026)."""
import json
import os
import sys
import unittest
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))
import build_season  # noqa: E402
import race_check  # noqa: E402

ROWS = json.load(open(os.path.join(ROOT, "coach", "races.json")))["rows"]
HTML = open(build_season.PAGE).read()


class TestSeason(unittest.TestCase):
    def test_repo_page_is_in_sync(self):
        self.assertEqual(race_check.shared_page_status(ROWS), "in sync")

    def test_every_race_on_the_page_once(self):
        block = build_season.races_block(ROWS)
        for r in ROWS:
            if r.get("kind") == "race":
                self.assertIn(f'd: "{r["date"]}"', block)
        self.assertEqual(block.count("{ d: "), sum(1 for r in ROWS if r.get("kind") == "race"))

    def test_no_private_fields_reach_the_shared_page(self):
        block = build_season.races_block(ROWS)
        for r in ROWS:
            if r.get("kind") != "race":
                continue
            for f in build_season.PRIVATE_FIELDS:
                v = r.get(f)
                if isinstance(v, str) and len(v) > 12:
                    self.assertNotIn(v, block, f"{r['race_id']}.{f} leaked to the shared page")
        notes = [r["text"] for r in ROWS if r.get("kind") in ("race_note",)] + [r["item"] for r in ROWS if r.get("kind") == "race_kit"]
        for t in notes:
            self.assertNotIn(t, block)

    def test_new_race_changes_page_and_footer(self):
        rows = ROWS + [{"kind": "race", "race_id": "t", "name": "Test 10K", "date": "2027-01-01", "sport": "Run", "status": "registered", "goal": "secret goal text here"}]
        out, changed = build_season.render(HTML, rows, today=date(2027, 1, 2))
        self.assertTrue(changed)
        self.assertIn("Test 10K", out)
        self.assertIn("Updated Jan 2, 2027.", out)
        self.assertNotIn("secret goal", out)
        self.assertEqual(race_check.shared_page_status(rows).split(":")[0], "stale")


if __name__ == "__main__":
    unittest.main()
