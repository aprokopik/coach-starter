"""The three outcomes the coach is judged on (roadmap week 2, Measure; audit Nov 9, 2026, user finding 3).

    days on plan          scored days that followed the plan (rest, fallback, nominal or upper), from coach/outcomes.csv,
                          the fair scorer's record (6.6.0). Frozen days (streak.json, RED mornings) are left out, as in
                          the streak.
    easy days kept easy   planned easy run, ride or swim sessions that were done and stayed easy: no overrun (scorer
                          class "over"; more than 25% past the nominal when the plan sets no upper bound) and average HR at or under the
                          profile's easy guardrail for that sport. The same test as facts.json response.easy_day_overrun.
    lifts done            days with a lift on record, planned or not: a strength activity on the watch, a set saved on
                          the Lifts tab, a strength session rated in the feel form, or a "Lifted yesterday?" yes the
                          next morning (6.36.0). Out of the week's target: the profile's strength_minimum_per_week (2),
                          or the planned lift rows when the plan holds more (the athlete, Nov 14, 2026, card option A "Every
                          lift, out of 2"; the deficit gate and the monthly scorecard use the same goal). A planned lift
                          with none on record that day is "skipped" when the morning tap said no, else "unlogged".

A week is Monday to Sunday, the same week as the dashboard's key sessions (the athlete, Nov 11, 2026: one Doing the plan card).
The current week counts through yesterday and is marked partial; the Sunday check-in reads it as Monday to Saturday so
far, and the finished week lands on Monday. Every number is Calculated.

    python3 coach/tools/outcomes.py                 # weeks from the first scored day to the last finished one
    python3 coach/tools/outcomes.py --date 2026-11-22
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import morning_facts as mf  # noqa: E402
import reconcile as rc  # noqa: E402

FOLLOWED = {"rest", "fallback", "nominal", "upper"}
EASY_SPORTS = ("run", "bike", "swim")
EASY_OVERRUN_PCT = 25
LIFT_IN_TITLE = re.compile(r"\blifts?\b|strength", re.I)  # as section_response's easy_day_overrun

LIFT_MINIMUM = 2  # profile strength_minimum_per_week when it is missing
PROVENANCE = "Calculated from coach/outcomes.csv (fair scorer), week.json, Garmin activities and the lifts you log"


def monday(day):
    return day - timedelta(days=day.weekday())


def _frozen(data):
    sj = data["streak"] if "streak" in data else mf.read_json("coach/streak.json", {"freezes": []})
    fz = {f.get("date") for f in sj.get("freezes", [])}
    preds = rc.latest_predictions(data["predictions"])
    fz |= {dt for dt, p in preds.items() if p.get("readiness") == "RED"}
    return fz


def days_on_plan(start, end, data, frozen):
    rows = [o for o in data["outcomes"] if o.get("date") and start <= mf.d(o["date"]) <= end]
    by = {}
    for o in rows:
        by[o["date"]] = o  # a rescored row replaces in place, so one row per date; last wins regardless
    scored = [o for dt, o in by.items() if not (dt in frozen and o.get("actual_completion") not in FOLLOWED)]
    on = [o for o in scored if o.get("actual_completion") in FOLLOWED]
    return {"on_plan": len(on), "scored": len(scored), "frozen": len(by) - len(scored),
            "missed": sorted(o["date"] for o in scored if o.get("actual_completion") not in FOLLOWED)}


def easy_kept(start, end, data, prof):
    guard = prof.get("easy_hr_guardrail", {})
    done = kept = 0
    broke = []
    for row in data["week"]:
        if row.get("kind") != "day" or row.get("intensity") != "easy" or row.get("type") not in EASY_SPORTS:
            continue
        day = mf.d(row["date"])
        if not (start <= day <= end):
            continue
        acts = mf.activity_rows(data, day)
        rpe = None
        for s in data["feel_sessions"]:
            if s.get("activity_id") in {str(a["activity_id"]) for a in acts if a["discipline"] == row["type"]}:
                rpe = mf.num(s.get("rpe"))
        cls, act = mf.classify(row, acts, rpe)
        if cls in ("none", "unknown", "rest") or not act or act["discipline"] != row["type"]:
            continue  # not done, or done as a fallback in another sport: not an easy day of this sport
        done += 1
        same = [a for a in acts if a["discipline"] == row["type"]]
        mins = sum(a["minutes"] or 0 for a in same)
        nominal = mf.num(row.get("minutes"))
        pct = (mins / nominal - 1) * 100 if nominal else None
        g = mf.num(guard.get(row["type"])) if isinstance(guard, dict) else None
        hrs = [a["avg_hr"] for a in same if a.get("avg_hr")]
        why = []
        if cls == "over":
            why.append("over the upper bound" if not (rpe is not None and rpe >= 5) else f"rated RPE {rpe:g}")
        elif pct is not None and pct > EASY_OVERRUN_PCT and not mf.num(row.get("upper_minutes")):
            # with an upper bound the plan already allows the extra minutes; past it, the scorer says "over"
            why.append(f"{pct:.0f}% past the nominal")
        if g and hrs and max(hrs) > g:
            why.append(f"avg HR {max(hrs):.0f} over {g:.0f}")
        if why:
            broke.append({"date": row["date"], "type": row["type"], "why": ", ".join(why)})
        else:
            kept += 1
    return {"kept": kept, "done": done, "broke": broke}


def lifted_on(dt, data):
    """A lift on record that day from any source: the watch, the Lifts tab, the session form or the morning tap."""
    return any(a["discipline"] == "strength" for a in mf.activity_rows(data, mf.d(dt))) or rc.lifts_logged(dt, data)


def lifts(start, end, data, minimum=LIFT_MINIMUM):
    # a lift is planned by a strength row, or inside another row's title ("45 min easy ride + 15 min upper lift", Oct 30)
    planned = sorted({row["date"] for row in data["week"] if row.get("kind") == "day" and start <= mf.d(row["date"]) <= end
                      and (row.get("type") == "strength" or LIFT_IN_TITLE.search(row.get("title") or ""))})
    # every lift counts, planned or not (6.36.0): Nov 13, 2026's lift lived only in a bike row's notes and never showed
    days = [mf.iso(start + timedelta(days=i)) for i in range((end - start).days + 1)]
    done = [dt for dt in days if lifted_on(dt, data)]
    missing = [dt for dt in planned if dt not in done]
    skipped = [dt for dt in missing if rc.lifted_answer(dt, data) == "no"]
    # a missing lift is "skipped" when the morning tap said so, else "unlogged" (done or not, nothing says)
    return {"done": len(done), "days": done, "planned": len(planned), "target": max(len(planned), int(minimum or 0)),
            "missing": missing, "skipped": skipped, "unlogged": [dt for dt in missing if dt not in skipped]}


def week(start, today, data=None, prof=None):
    """The outcome row for the Monday-to-Sunday week starting `start`, counted through yesterday."""
    data = data or rc.load_data()
    prof = prof if prof is not None else data.get("profile", {})
    sunday = start + timedelta(days=6)
    end = min(sunday, today - timedelta(days=1))
    dop = days_on_plan(start, end, data, _frozen(data))
    ez = easy_kept(start, end, data, prof)
    lf = lifts(start, end, data, prof.get("strength_minimum_per_week", LIFT_MINIMUM))
    return {"kind": "outcome_week", "start": mf.iso(start), "end": mf.iso(end), "partial": end < sunday,
            "on_plan": dop["on_plan"], "scored": dop["scored"], "frozen": dop["frozen"], "missed_days": ";".join(dop["missed"]),
            "easy_kept": ez["kept"], "easy_done": ez["done"], "easy_broke": ";".join(f"{b['date']}|{b['type']}|{b['why']}" for b in ez["broke"]),
            "lifts_done": lf["done"], "lifts_planned": lf["planned"], "lifts_target": lf["target"],
            "lifts_days": ";".join(lf["days"]), "lifts_missing": ";".join(lf["missing"]),
            "lifts_skipped": ";".join(lf["skipped"]), "lifts_unlogged": ";".join(lf["unlogged"]),
            "provenance": PROVENANCE}


def history(today, data=None):
    """One row per Monday-to-Sunday week, oldest first, from the first scored day's week to the current one (partial)."""
    data = data or rc.load_data()
    dates = sorted(o["date"] for o in data["outcomes"] if o.get("date"))
    if not dates:
        return []
    start, last = monday(mf.d(dates[0])), monday(today - timedelta(days=1))
    out = []
    while start <= last:
        out.append(week(start, today, data))
        start += timedelta(days=7)
    return out


def line(row):
    """The check-in line, plain words. A partial week reads "so far"."""
    def frac(a, b, empty):
        return f"{a} of {b}" if b else empty
    st, en = mf.d(row["start"]), mf.d(row["end"])
    head = f"This week so far ({st.strftime('%a')} to {en.strftime('%a')})" if row.get("partial") else f"Week of {st.strftime('%b')} {st.day}"
    return (f"{head}: days on plan {frac(row['on_plan'], row['scored'], 'none scored')}, "
            f"easy days kept easy {frac(row['easy_kept'], row['easy_done'], 'none done')}, lifts done {frac(row['lifts_done'], row.get('lifts_target', row['lifts_planned']), 'none planned')}.")


def section(today, data):
    """facts.json `outcomes`: this week so far, the last finished week, and on Sundays the check-in line."""
    if "strength_log" not in data:
        data["strength_log"] = mf.read_csv("coach/strength_log.csv")
    rows = history(today, data)
    done = [r for r in rows if not r["partial"]]
    cur = rows[-1] if rows and rows[-1]["partial"] else None
    return {"this_week": cur, "last_week": done[-1] if done else None, "previous_week": done[-2] if len(done) > 1 else None,
            "sunday_line": line(cur) if (cur and today.weekday() == 6) else None, "provenance": PROVENANCE}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    args = ap.parse_args()
    prof = mf.read_json("coach/athlete/profile.json", {})
    today = mf.d(args.date) if args.date else datetime.now(ZoneInfo(prof.get("timezone", "America/New_York"))).date()
    for r in history(today):
        print(line(r))
        if r["easy_broke"]:
            print("   easy broke: " + r["easy_broke"].replace(";", "; "))
        if r["missed_days"]:
            print("   off plan: " + r["missed_days"].replace(";", ", "))


if __name__ == "__main__":
    main()
