"""When the next home blood pressure week is due (6.4.0, the athlete, Nov 10, 2026).

The home BP week (Check-ins tab survey `half`: 2 readings morning and evening for 7 days, day 1 dropped, the
average entered once) repeats on a cadence set by the status of the last week's average:
Good (under 120/80) 6 months, Watch (120 to 129 and under 80) 3 months, Act (130/80 or more) 3 months.
The months live in coach/checkins.json (`cadence_months` on the `half` survey row), so a change is one edit.

Only a formal home week sets the date: health.json rows with note "home 7-day average" (written by checkins.py
from the survey). Single cuff photos logged under coach/ops/HOME-BP.md never move it.

Used by morning_facts.py (the check-in names the week 3 days before, on its first day, and on Sundays while
overdue) and by build_dashboard.py (a `bp_week` row that checkins.js reads for the survey's period and due date).
"""
import calendar
import json
import os
import re
from datetime import date, timedelta

DEFAULT_MONTHS = {"good": 6, "watch": 3, "act": 3}
WEEK_NOTE = "home 7-day average"
OPENS_DAYS_BEFORE = 3   # the check-in names it and the survey opens this many days before the due date
WEEK_DAYS = 7           # after the due date plus a week with no new average, the week is overdue


def status(s, d):
    """The pillar's status words (pillars.py): Good under 120/80, Watch 120 to 129 with diastolic under 80, else Act."""
    return "good" if s < 120 and d < 80 else "watch" if s < 130 and d < 80 else "act"


def add_months(day, n):
    y, m = divmod(day.month - 1 + n, 12)
    y, m = day.year + y, m + 1
    return date(y, m, min(day.day, calendar.monthrange(y, m)[1]))


def _period_from_source(src):
    m = re.search(r"half (\S+?)\)?$", src or "")
    return m.group(1) if m else None


def last_week(health_rows):
    """The newest formal home week: {date, sys, dia, period} or None."""
    by_day = {}
    for r in health_rows or []:
        if not isinstance(r, dict) or r.get("kind") != "lab" or r.get("note") != WEEK_NOTE:
            continue
        if r.get("key") not in ("bp_sys", "bp_dia"):
            continue
        try:
            v, day = float(r.get("value")), date.fromisoformat(str(r.get("date"))[:10])
        except (TypeError, ValueError):
            continue
        w = by_day.setdefault(day, {"date": day, "period": _period_from_source(r.get("source"))})
        w["sys" if r["key"] == "bp_sys" else "dia"] = v
    weeks = [w for w in by_day.values() if "sys" in w and "dia" in w]
    return max(weeks, key=lambda w: w["date"]) if weeks else None


def cadence_months(survey_row):
    m = dict(DEFAULT_MONTHS)
    m.update({k: int(v) for k, v in ((survey_row or {}).get("cadence_months") or {}).items()})
    return m


def next_week(health_rows, survey_row, today):
    """Where the home BP week stands today. state: none (never done), later, soon (survey open, starts within
    3 days), on (due date to 7 days after), overdue (later than that with no new average)."""
    months = cadence_months(survey_row)
    w = last_week(health_rows)
    if not w:
        due = today
        out = {"last_date": None, "last_period": None, "last_avg": None, "status": None, "months": None}
    else:
        st = status(w["sys"], w["dia"])
        due = add_months(w["date"], months[st])
        out = {"last_date": w["date"].isoformat(), "last_period": w["period"],
               "last_avg": f"{w['sys']:.0f}/{w['dia']:.0f}", "status": st, "months": months[st]}
    days = (due - today).days
    state = ("none" if not w else "later" if days > OPENS_DAYS_BEFORE else "soon" if days > 0
             else "on" if days > -WEEK_DAYS else "overdue")
    out.update({"due": due.isoformat(), "opens": (due - timedelta(days=OPENS_DAYS_BEFORE)).isoformat(),
                "days_to_due": days, "state": state})
    return out


def say_today(nw, today):
    """True on the mornings the check-in names the week: 3 days before, the due day, and Sundays while overdue
    (or never done)."""
    d = nw["days_to_due"]
    if nw["state"] in ("soon", "on"):
        return d in (OPENS_DAYS_BEFORE, 0)
    if nw["state"] in ("overdue", "none"):
        return today.weekday() == 6
    return False


def flag_text(nw):
    due = date.fromisoformat(nw["due"])
    when = due.strftime("%A %b %-d")
    how = ("2 readings each morning and evening for 7 days, drop day 1, then enter the average on the Check-ins tab")
    if nw["state"] == "none":
        return f"No home blood pressure week on file. Say in one line: the home BP week is due ({how})."
    why = f"last week {nw['last_avg']} on {nw['last_date']}, {nw['status'].capitalize()}, so every {nw['months']} months"
    if nw["state"] == "overdue":
        return f"Home BP week overdue since {when} ({why}). Say it in one line: {how}. A fact, no health advice."
    return f"Home BP week starts {when} ({why}). Say it in one line: {how}. A fact, no health advice."


def from_repo(root, today):
    def load(rel, default):
        try:
            with open(os.path.join(root, rel)) as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return default
    health = load("coach/health.json", {}).get("rows", [])
    survey = next((s for s in load("coach/checkins.json", {}).get("surveys", []) if s.get("id") == "half"), {})
    return next_week(health, survey, today)
