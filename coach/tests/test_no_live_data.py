"""Guard: no test reads the athlete's live data (6.2.2, Nov 10, 2026).

Runs the rest of the suite in a child process with an audit hook on every file open. Any open of a LIVE
repo file (frozen.is_live) from test code fails this test and names the file and the test. The kit builder
is exempt: reading the repo to make a scrubbed copy is its job, and its output keeps no values.
CI runs the suite once under live_guard.py instead (6.96.2), which is this same check in one pass.
Live-data checks that are meant to read today's files live in coach/tests/live/ and run as their own step.
"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import frozen  # noqa: E402

CHILD = r'''
import json, os, sys
sys.path.insert(0, sys.argv[2])
import live_guard
result, hits = live_guard.run(stream=open(os.devnull, "w"))
print(json.dumps({"hits": hits, "ran": result.testsRun}))
'''


@unittest.skipIf(os.environ.get("COACH_LIVE_GUARD") == "child", "inside the guard's own run")
class NoLiveData(unittest.TestCase):
    def test_is_live_rule(self):
        for rel in ("data/summary.csv", "data/daily/2026-11-09.json", "coach/block_briefs.json", "coach/LOG.md",
                    "coach/dashboard/coach.json", "coach/dashboard/season.html", "coach/ops/HOME-BP.md",
                    "coach/new_feed_nobody_listed.csv", "state/backfill_progress.json"):
            self.assertTrue(frozen.is_live(rel), rel)
        for rel in ("VERSION", "coach/tools/brief.py", "coach/engine/schemas.json", "coach/ops/data_paths.json",
                    "coach/norms.json", "coach/tests/fixtures/repo/coach/plan.json", "coach/dashboard/app.js"):
            self.assertFalse(frozen.is_live(rel), rel)

    @unittest.skipIf(os.environ.get("COACH_LIVE_GUARD") == "outer", "CI runs the suite once under live_guard.py, which is this check")
    def test_no_test_opens_live_data(self):
        env = dict(os.environ, COACH_LIVE_GUARD="child")
        r = subprocess.run([sys.executable, "-c", CHILD, frozen.ROOT, HERE], capture_output=True, text=True, env=env, timeout=600)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        out = json.loads(r.stdout.strip().splitlines()[-1])
        self.assertGreater(out["ran"], 0)
        lines = [f"{path} <- {', '.join(who)}" for path, who in sorted(out["hits"].items())]
        self.assertEqual(lines, [], "tests opened live athlete data; use frozen.repo_copy() or a fixture:\n" + "\n".join(lines))


if __name__ == "__main__":
    unittest.main()
