"""Race template gaps (coach/race_template.json, coach/tools/race_check.py; Nov 2, 2026)."""
import os
import sys
import unittest
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))
import race_check  # noqa: E402

BASE = {"kind": "race", "race_id": "x", "name": "X", "date": "2026-11-20", "location": "L", "sport": "Trail run", "distance": "11 mi",
        "status": "registered", "priority": "C", "goal": "g", "wx_kind": "typical", "wx_hi": 50, "wx_lo": 35, "wx_text": "t", "wx_plan": "p",
        "wx_src": "s", "url": "u", "limit": "5:00", "cutoffs": "none", "lat": 39.6, "lon": -77.4,
        "start_time": "09:00", "start_basis": "posted"}


class TestRaceCheck(unittest.TestCase):
    def test_far_race_complete(self):
        self.assertEqual(race_check.missing(dict(BASE), [], date(2026, 10, 1)), [])

    def test_prep_window_needs_plan_and_kit(self):
        gaps = race_check.missing(dict(BASE), [], date(2026, 11, 2))
        for s in ("forecast", "plan: Lead-in", "plan: Pacing", "plan: Fueling", "plan: Stop rule", "plan: After"):
            self.assertIn(s, gaps)
        self.assertTrue(any(g.startswith("kit") for g in gaps))
        self.assertNotIn("plan: Decision point", gaps)

    def test_race_week_needs_fresh_forecast(self):
        r = dict(BASE, forecast="3:00")
        rows = [{"kind": "race_note", "race_id": "x", "section": s, "text": "t"} for s in ("Lead-in", "Pacing", "Fueling", "Stop rule", "After")]
        rows += [{"kind": "race_kit", "race_id": "x", "item_id": str(i)} for i in range(5)]
        gaps = race_check.missing(r, rows, date(2026, 11, 15))
        self.assertIn("wx_kind forecast (NWS, RUNBOOK step 6)", gaps)
        r.update(wx_kind="forecast", wx_at="2026-11-10", wx_days="d")
        self.assertTrue(any(g.startswith("forecast refresh") for g in race_check.missing(r, rows, date(2026, 11, 15))))
        r["wx_at"] = "2026-11-15"
        self.assertEqual(race_check.missing(r, rows, date(2026, 11, 15)), [])

    def test_start_time_required_once_committed_and_posted_by_prep(self):
        r = {k: v for k, v in BASE.items() if k not in ("start_time", "start_basis")}
        gaps = race_check.missing(r, [], date(2026, 10, 1))
        self.assertIn("start_time", gaps)
        self.assertIn("start_basis", gaps)
        r.update(start_time="09:00", start_basis="expected")
        self.assertEqual(race_check.missing(r, [], date(2026, 10, 1)), [])  # far out: last edition's time is enough
        self.assertTrue(any(g.startswith("start_time posted") for g in race_check.missing(r, [], date(2026, 11, 2))))
        r["start_basis"] = "posted"
        self.assertFalse(any(g.startswith("start_time posted") for g in race_check.missing(r, [], date(2026, 11, 2))))

    def test_exploring_needs_registration_dates_not_location(self):
        r = {k: v for k, v in BASE.items() if k not in ("url", "limit", "cutoffs", "lat", "lon")}
        r["status"] = "exploring"
        self.assertEqual(race_check.missing(r, [], date(2026, 10, 1)), ["reg_dates", "reg_checked"])
        r.update(reg_dates="none", reg_checked="2026-09-27")  # a placeholder with no event named yet
        self.assertEqual(race_check.missing(r, [], date(2026, 10, 1)), [])

    def test_registered_race_needs_no_registration_dates(self):
        self.assertNotIn("reg_dates", race_check.missing(dict(BASE), [], date(2026, 10, 1)))


def watched(**kw):
    """The Spring 50K case (Nov 5, 2026): an exploring row with two candidate openings."""
    r = dict(BASE, race_id="s50", name="Spring 50K", date="2027-03-20", status="exploring", reg_checked="2026-11-08",
             reg_dates="2026-11-27|HAT Run 50K registration opens|posted;2026-12-01|Terrapin Mountain 50K registration opens|posted")
    r.update(kw)
    return r


class TestRegistrationWatch(unittest.TestCase):
    """Registration dates reach the check-in at least 14 days out (coach/tools/race_check.py, Nov 5, 2026)."""

    def test_parse(self):
        p = race_check.parse_reg_dates("2026-11-27|opens|posted; 2027-10-12|opens|expected;2027-01-05|price rises")
        self.assertEqual([e["date"].isoformat() for e in p], ["2026-11-27", "2027-10-12", "2027-01-05"])
        self.assertEqual([e["basis"] for e in p], ["posted", "expected", "posted"])
        self.assertEqual(race_check.parse_reg_dates("none"), [])
        self.assertEqual(race_check.parse_reg_dates(""), [])
        self.assertIn("error", race_check.parse_reg_dates("Nov 27|opens|posted")[0])

    def test_due_from_14_days_out(self):
        self.assertEqual(race_check.registration_due([watched()], date(2026, 11, 12)), [])  # 15 days out
        due = race_check.registration_due([watched()], date(2026, 11, 13))
        self.assertEqual([(x["date"], x["days"]) for x in due], [("2026-11-27", 14)])
        due = race_check.registration_due([watched()], date(2026, 11, 17))
        self.assertEqual([x["days"] for x in due], [10, 14])
        self.assertEqual(race_check.registration_due([watched()], date(2026, 12, 2)), [])  # both passed, exploring

    def test_done_and_passed_races_drop(self):
        self.assertEqual(race_check.registration_due([watched(status="done")], date(2026, 11, 20)), [])
        self.assertEqual(race_check.registration_due([watched(date="2026-11-19")], date(2026, 11, 20)), [])
        self.assertEqual(race_check.registration_due([dict(BASE)], date(2026, 11, 1)), [])  # registered, no deadlines

    def test_registered_race_deadlines_still_count(self):
        r = dict(BASE, date="2027-09-25", reg_dates="2027-08-19|deferral deadline|expected")
        due = race_check.registration_due([r], date(2027, 8, 5))
        self.assertEqual([(x["days"], x["basis"]) for x in due], [(14, "expected")])
        self.assertTrue(race_check.says_today(due[0], date(2027, 8, 5)))

    def test_cadence_for_a_race_not_picked(self):
        def said(day):
            return [x["days"] for x in race_check.registration_due([watched()], day) if race_check.says_today(x, day)]
        self.assertEqual(said(date(2026, 11, 13)), [14])      # Fri: HAT 14 days out
        self.assertEqual(said(date(2026, 11, 15)), [])        # Sun: not committed, so no Sunday line
        self.assertEqual(said(date(2026, 11, 17)), [14])      # Terrapin 14 days out
        self.assertEqual(said(date(2026, 11, 20)), [7])
        self.assertEqual(said(date(2026, 11, 24)), [7])       # HAT 3 days out is silent; Terrapin 7
        self.assertEqual(said(date(2026, 11, 26)), [1])
        self.assertEqual(said(date(2026, 11, 27)), [0])

    def test_cadence_for_a_planned_race(self):
        r = watched(status="planned", reg_dates="2026-11-27|registration opens|posted")
        def said(day):
            return [x["days"] for x in race_check.registration_due([r], day) if race_check.says_today(x, day)]
        self.assertEqual(said(date(2026, 11, 13)), [14])
        self.assertEqual(said(date(2026, 11, 14)), [])        # Sat
        self.assertEqual(said(date(2026, 11, 15)), [12])      # Sun inside the window
        self.assertEqual(said(date(2026, 11, 16)), [])        # Mon
        self.assertEqual(said(date(2026, 11, 20)), [7])
        for day, n in ((24, 3), (25, 2), (26, 1), (27, 0)):  # every morning of the last 3 days
            self.assertEqual(said(date(2026, 11, day)), [n])

    def test_planned_race_open_and_not_done(self):
        r = watched(status="planned", reg_dates="2026-11-03|Priority opens|posted;2026-11-05|General opens|posted;"
                                                 "2027-09-19|online registration closes, or earlier at sellout|posted")
        due = race_check.registration_due([r], date(2026, 11, 8))
        self.assertEqual(len(due), 1)
        self.assertTrue(due[0]["open"])
        self.assertEqual(due[0]["what"], "General opens")
        self.assertTrue(race_check.says_today(due[0], date(2026, 11, 8)))        # Sunday
        self.assertFalse(race_check.says_today(due[0], date(2026, 11, 9)))       # Monday
        self.assertIn("still not done", race_check.registration_line(due[0]))
        after_close = race_check.registration_due([r], date(2027, 9, 20))
        self.assertEqual(after_close, [])                                         # closed, nothing to nag
        exploring = race_check.registration_due([dict(r, status="exploring")], date(2026, 11, 8))
        self.assertEqual(exploring, [])                                           # no nag for a race not picked

    def test_opening_that_mentions_a_sellout_is_still_an_opening(self):
        r = watched(status="planned", reg_dates="2026-10-12|registration opens, usually sold out the same day|posted")
        due = race_check.registration_due([r], date(2026, 11, 8))
        self.assertTrue(due and due[0]["open"])

    def test_stale_and_lines(self):
        due = race_check.registration_due([watched()], date(2026, 11, 13))
        self.assertFalse(due[0]["stale"])                                         # checked 5 days ago
        self.assertEqual(race_check.registration_line(due[0]),
                         "Spring 50K: HAT Run 50K registration opens, in 14 days (Fri Nov 27). Exploring, so it only matters if you pick it.")
        due = race_check.registration_due([watched(reg_checked="2026-10-18")], date(2026, 11, 26))
        self.assertTrue(due[0]["stale"])
        self.assertTrue(race_check.registration_line(due[0]).endswith("tomorrow (Fri Nov 27). Exploring, so it only matters if you pick it. Last checked Oct 18, so confirm on the official page."))
        exp = race_check.registration_due([watched(status="planned", date="2028-04-22", reg_dates="2027-10-12|registration opens|expected")], date(2027, 10, 9))
        self.assertIn("Expected from last year's pattern, not posted yet.", race_check.registration_line(exp[0]))

    def test_bad_reg_checked_never_breaks_the_line(self):
        due = race_check.registration_due([watched(reg_checked="last week")], date(2026, 11, 13))
        self.assertTrue(due[0]["stale"])
        self.assertTrue(race_check.registration_line(due[0]).endswith("Last checked last week, so confirm on the official page."))
        due = race_check.registration_due([watched(reg_checked=None)], date(2026, 11, 13))
        self.assertTrue(race_check.registration_line(due[0]).endswith("Never checked, so confirm on the official page."))

    def test_unreadable_entry_is_said_until_fixed(self):
        due = race_check.registration_due([watched(reg_dates="Nov 27|opens|posted")], date(2026, 11, 13))
        self.assertEqual(len(due), 1)
        self.assertTrue(race_check.says_today(due[0], date(2026, 11, 14)))
        self.assertIn("no line to the athlete", race_check.registration_line(due[0]))


if __name__ == "__main__":
    unittest.main()
