"""Three key sessions every week (coach/engine/KEY-SESSIONS.md, coach/tools/key_check.py; the athlete, Nov 3, 2026)."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))
import key_check  # noqa: E402

BLOCK = {"kind": "block", "key": "b", "start": "2026-11-09", "end": "2026-11-22",
         **{f"pillar_{n}": f"p{n}" for n in (1, 2, 3)}, **{f"pillar_{n}_short": f"P{n}" for n in (1, 2, 3)}}
WEEK = [{"kind": "week", "week_start": "2026-11-09"}]


def day(date, key=False, pillar=None, why="because", typ="bike"):
    return {"kind": "day", "date": date, "title": "x", "type": typ, "key": key, "pillar": pillar, "why": why}


class TestKeyCheck(unittest.TestCase):
    def good(self):
        return WEEK + [day("2026-11-10", True, 1), day("2026-11-12", True, 2), day("2026-11-14", True, 3, typ="rest"), day("2026-11-11")]

    def test_three_with_a_rest_day_passes(self):
        self.assertEqual(key_check.problems([BLOCK], self.good()), [])

    def test_two_or_four_fail(self):
        rows = [r for r in self.good() if r.get("pillar") != 3]
        self.assertTrue(any("key session 3 appears 0" in x for x in key_check.problems([BLOCK], rows)))
        rows = self.good() + [day("2026-11-13", True, 1)]
        self.assertTrue(any("key session 1 appears 2" in x for x in key_check.problems([BLOCK], rows)))

    def test_key_pillar_why_rules(self):
        rows = self.good() + [day("2026-11-15", True, None), day("2026-11-15", False, 2), day("2026-11-16", True, 4)]
        rows[1]["why"] = ""
        p = key_check.problems([BLOCK], rows)
        for frag in ("key without a pillar", "without key true", "must be 1, 2 or 3", "needs a one-line why"):
            self.assertTrue(any(frag in x for x in p), frag)

    def test_weeks_before_the_rule_are_not_counted(self):
        old = [{"kind": "week", "week_start": "2026-10-26"}, day("2026-10-30", True, 1, why="")]
        self.assertEqual(key_check.problems([BLOCK], old), [])

    def test_a_lift_only_in_the_detail_is_flagged(self):
        # 6.36.0: Nov 13, 2026's lift lived only in a bike row's notes; from Nov 16 a lift gets its own row or its title
        hidden = dict(day("2026-11-18"), detail="Long Life Lifts 1 can follow later: upper body and core")
        named = dict(day("2026-11-19"), title="45 min easy ride + 15 min upper lift", detail="then the lift")
        own = dict(day("2026-11-20", typ="strength"), detail="Long Life Lifts upper half")
        before = dict(day("2026-11-13"), detail="Long Life Lifts 1 can follow later")
        p = [x for x in key_check.problems([BLOCK], [hidden, named, own, before]) if "lift" in x]
        self.assertEqual(len(p), 1)
        self.assertIn("2026-11-18", p[0])

    def test_block_needs_three_defaults(self):
        b = dict(BLOCK); del b["pillar_3_short"]
        self.assertTrue(any("pillar_3" in x for x in key_check.problems([b], self.good())))

    def test_frozen_plan_passes(self):
        # Real-shaped plan and week from the frozen copy; today's live files are checked in coach/tests/live/.
        here = os.path.dirname(os.path.abspath(__file__))
        fx = os.path.join(here, "fixtures", "repo", "coach")
        if not os.path.isdir(fx):
            self.skipTest("frozen athlete data is not shipped in the kit")
        self.assertEqual(key_check.problems(key_check._load(os.path.join(fx, "plan.json")), key_check._load(os.path.join(fx, "week.json"))), [])


if __name__ == "__main__":
    unittest.main()
