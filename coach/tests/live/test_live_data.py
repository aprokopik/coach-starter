"""Live data checks: today's athlete files, as the coach and the data routes left them (6.2.2, Nov 10, 2026).

These are not unit tests. They read the live repo on purpose, so they live outside the unit suite
(`python3 -m unittest discover -s coach/tests` does not enter this folder) and never block a pull request.
CI runs them as their own step after the unit tests (tests.yml, "Live data checks"); a failure there means
a data file needs fixing, not the code. Run by hand from the repo root:

    python3 -m unittest discover -s coach/tests/live -v
"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))
os.chdir(ROOT)
import brief  # noqa: E402
import goal_check  # noqa: E402
import key_check  # noqa: E402
import lifts  # noqa: E402
import race_check  # noqa: E402


class LiveData(unittest.TestCase):
    def test_goal_copies_agree_with_home(self):
        # One home for dated goals (the athlete, Nov 12, 2026): no copy of the weight goal disagrees with profile.json
        self.assertEqual(goal_check.section(ROOT)["mismatches"], [])

    def test_week_has_three_key_sessions(self):
        self.assertEqual(key_check.problems(key_check._load("coach/plan.json"), key_check._load("coach/week.json")), [])

    def test_shared_race_page_in_sync(self):
        rows = json.load(open(os.path.join(ROOT, "coach", "races.json")))["rows"]
        self.assertEqual(race_check.shared_page_status(rows), "in sync")

    def test_briefs_flat_and_complete(self):
        briefs, rows = brief.load()
        for r in rows:
            for k, v in r.items():
                self.assertNotIsInstance(v, (list, dict), f"{r.get('kind')}.{k} must be flat for the dashboard runtime")
        for b in briefs:
            ks = [r for r in rows if r.get("kind") == "brief_kpi" and r["block_key"] == b["block_key"]]
            self.assertTrue(1 <= len(ks) <= 3, "1 to 3 focus KPIs per brief")

    def test_lift_rotation_uses_the_library(self):
        lib = lifts.library()
        _, slots = lifts.routine_rows()
        for s in slots:
            self.assertIn(s["id"], lib, s["ex"])
        short = {b["key"]: b.get("short") for b in lifts.blocks()}
        for r in lifts.rot_doc()["rows"]:
            self.assertLessEqual(len(r["swaps"]), 2, r["block_key"])
            self.assertNotIn(short.get(r["block_key"]), ("Recover", "Taper"), r["block_key"])
            for s in r["swaps"]:
                self.assertEqual(lib[s["from"]]["pattern"], lib[s["to"]]["pattern"], (r["block_key"], s["ex"]))


if __name__ == "__main__":
    unittest.main()
