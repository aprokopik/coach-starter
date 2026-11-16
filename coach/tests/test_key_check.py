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


class TestLiftRows(unittest.TestCase):
    """Every week from Nov 23, 2026 holds its lift rows (the athlete, Nov 16, 2026: "you're not scheduling me for 2 lifts a week,
    but yet you're saying that is critical")."""
    WK = [{"kind": "week", "week_start": "2026-11-23"}]
    target = 2.0
    BLK = {**BLOCK, "start": "2026-11-23", "end": "2026-12-06"}

    def keys(self):
        return self.WK + [day("2026-11-24", True, 1), day("2026-11-26", True, 2), day("2026-11-29", True, 3)]

    def lifts(self, rows):
        return [x for x in key_check.problems([self.BLK], rows, self.target) if "lift row" in x]

    def test_a_week_with_no_lifts_fails(self):
        p = self.lifts(self.keys())
        self.assertEqual(len(p), 1)
        self.assertIn("0 lift rows, the target is 2 a week", p[0])

    def test_two_strength_rows_pass(self):
        rows = self.keys() + [day("2026-11-25", typ="strength"), day("2026-11-28", typ="strength")]
        self.assertEqual(self.lifts(rows), [])

    def test_a_lift_in_a_title_counts_but_an_either_or_does_not(self):
        both = dict(day("2026-11-28"), title="45 min easy ride + 15 min upper lift")
        either = dict(day("2026-11-28"), title="FTP test, then Long Life Lifts or an easy run")
        self.assertEqual(self.lifts(self.keys() + [day("2026-11-25", typ="strength"), both]), [])
        self.assertTrue(self.lifts(self.keys() + [day("2026-11-25", typ="strength"), either]))

    def test_an_exception_with_a_reason_is_exempt(self):
        rows = self.keys()
        rows[0] = {**rows[0], "lifts_exception": "taper week before the race: one light upper body session"}
        self.assertEqual(self.lifts(rows + [day("2026-11-25", typ="strength")]), [])

    def test_weeks_before_the_rule_and_no_target_pass(self):
        old = [{"kind": "week", "week_start": "2026-11-16"}, day("2026-11-18", True, 1), day("2026-11-21", True, 2), day("2026-11-22", True, 3)]
        self.assertEqual(self.lifts(old), [])
        self.target = 0
        self.assertEqual(self.lifts(self.keys()), [])

    def test_target_has_one_home(self):
        # the routine's per_week wins; the profile minimum is only the fallback (scratch files, never the live ones)
        import json, tempfile
        root = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "coach", "athlete"))
        json.dump({"strength_minimum_per_week": 1}, open(os.path.join(root, "coach", "athlete", "profile.json"), "w"))
        self.assertEqual(key_check.lift_target(root), 1.0)
        json.dump({"rows": [{"kind": "lift_routine", "per_week": 3}]}, open(os.path.join(root, "coach", "strength.json"), "w"))
        self.assertEqual(key_check.lift_target(root), 3.0)


class TestLiftRank(unittest.TestCase):
    """Lifts rank with the key sessions inside a lift_rank "key" period (the athlete, Nov 16, 2026); the brief's lift goal follows per_week."""
    WK = [{"kind": "week", "week_start": "2026-11-23", "lifts_exception": "busy work week"}]
    KEYS = [day("2026-11-24", True, 1), day("2026-11-26", True, 2), day("2026-11-29", True, 3)]
    FUEL = {"kind": "fuel", "key": "f1", "start": "2026-11-09", "end": "2026-12-20", "mode": "deficit", "lift_rank": "key"}

    def probs(self, plan, wk):
        return key_check.problems([BLOCK] + plan, wk + self.KEYS, 2.0)

    def test_busy_is_no_excuse_in_a_deficit(self):
        p = self.probs([self.FUEL], self.WK)
        self.assertTrue(any("lifts rank with the key sessions" in x for x in p), p)

    def test_illness_is(self):
        wk = [{**self.WK[0], "lifts_exception": "ill since Tuesday"}]
        self.assertFalse([x for x in self.probs([self.FUEL], wk) if "lift" in x])

    def test_outside_the_period_a_reason_is_enough(self):
        self.assertFalse([x for x in self.probs([{**self.FUEL, "start": "2027-02-01", "end": "2027-06-13", "mode": "maintenance", "lift_rank": None}], self.WK) if "lift" in x])

    def test_every_deficit_period_carries_the_rank(self):
        p = self.probs([{**self.FUEL, "lift_rank": None}], self.WK)
        self.assertTrue(any("needs lift_rank" in x for x in p))

    def test_brief_goal_follows_per_week(self):
        rows = [{"kind": "brief", "block_key": "b", "start": "2026-12-21", "end": "2027-02-14"},
                {"kind": "brief_kpi", "block_key": "b", "key": "lifts", "count_target": 12}]
        self.assertTrue(key_check.brief_problems(rows, 2.0))  # 8 weeks x 2 = 16
        rows[1]["count_target"] = 16
        self.assertEqual(key_check.brief_problems(rows, 2.0), [])
        old = [{"kind": "brief", "block_key": "a", "start": "2026-11-09", "end": "2026-12-20"}, {"kind": "brief_kpi", "block_key": "a", "key": "lifts", "count_target": 12}]
        self.assertEqual(key_check.brief_problems(old, 2.0), [])
