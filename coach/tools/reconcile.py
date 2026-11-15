"""Prediction log and reconciliation.

Three jobs, all idempotent, so the morning run can call it before and after the check-in:
  0. If coach/today.json still holds an earlier day whose final plan is not on record (a chat replan that never
     re-ran this tool), log it first.
  1. Score every logged day older than today that has no outcome yet, from the Garmin activities, lifts saved on
     the dashboard, the session RPE and the next morning's legs score. Appends to coach/outcomes.csv.
  2. If coach/today.json carries today's prescription with an `expected` block, log it. A date already logged with a
     different plan (a same-day replan) gets a newer row; the last row of a date is the prediction that is scored.

Fair scoring (6.6.0, Nov 2026): a day is classed against its plan of record, the week.json row that every replan
updates (the dashboard's Week view reads the same row), with its fallback discipline (`alt_type`: rest, walk, another
sport); a race or test counts in whatever sport it was run; a lift saved on the Lifts tab counts as done.

    python3 coach/tools/reconcile.py                 # today
    python3 coach/tools/reconcile.py --date 2026-10-19
    python3 coach/tools/reconcile.py --rescore 2026-10-19 [--write]   # what the current rules change in the record

Completion classes (engine/schemas.json): rest, fallback, nominal, upper, over, none, unknown.
"""
import argparse
import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import morning_facts as mf  # noqa: E402

PRED = "coach/predictions.csv"
OUT = "coach/outcomes.csv"


def write_rows(path, fields, rows):
    exists = os.path.exists(path)
    with open(path, "a", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        if not exists:
            w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})


PLAN_KEYS = ("discipline", "completion", "minutes", "upper_minutes", "fallback_minutes", "rpe", "next_morning_legs_min")


def _same_plan(a, b):
    """True when two prediction rows (or a row and an expected block) carry the same plan."""
    def norm(v):
        n = mf.num(v)
        return n if n is not None else str(v or "").strip()
    return all(norm(a.get(k)) == norm(b.get(k)) for k in PLAN_KEYS)


def _row_from_today(t):
    e = t["expected"]
    return {"date": t["date"], "discipline": e.get("discipline", ""), "completion": e.get("completion", ""),
            "minutes": e.get("minutes", ""), "upper_minutes": e.get("upper_minutes", ""), "fallback_minutes": e.get("fallback_minutes", ""),
            "rpe": e.get("rpe", ""), "next_morning_legs_min": e.get("next_morning_legs_min", ""),
            "readiness": t.get("readiness", ""), "confidence": t.get("confidence", ""), "call": t.get("call", ""),
            "logged_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def latest_predictions(preds):
    """The last logged row per date (a same-day replan appends a newer row; 6.6.0), with how many rows the date has."""
    out = {}
    for p in preds:
        dt = p.get("date")
        if not dt:
            continue
        prev = out.get(dt)
        out[dt] = dict(p, _revisions=(prev["_revisions"] + 1 if prev else 1), _first=(prev["_first"] if prev else p))
    return out


def log_prediction(t, schemas):
    """Log today.json's prediction for its own date. A date with no row gets one; a date whose last row differs
    (a same-day replan) gets a newer row, so the scorer reads the plan that stood at the end of the day."""
    if not t or not isinstance(t.get("expected"), dict) or not t.get("date"):
        return None
    last = latest_predictions(mf.read_csv(PRED)).get(t["date"])
    row = _row_from_today(t)
    if last and _same_plan(last, row):
        return "already logged"
    write_rows(PRED, schemas["predictions_csv"], [row])
    return "logged" if not last else f"replan logged (revision {last['_revisions'] + 1})"


def log_today(today, schemas):
    tj = mf.read_json("coach/today.json", {"rows": []}).get("rows", [])
    if not tj or tj[0].get("date") != mf.iso(today):
        return None
    return log_prediction(tj[0], schemas)


def log_carryover(today, schemas):
    """Before scoring: when today.json still holds an earlier day (the morning run calls this before it writes the
    new prescription), make sure that day's final plan is the one on record. Catches a replan whose chat session
    edited today.json but never re-ran this tool (Nov 10, 2026)."""
    tj = mf.read_json("coach/today.json", {"rows": []}).get("rows", [])
    if not tj or not tj[0].get("date") or mf.d(tj[0]["date"]) >= today:
        return None
    return log_prediction(tj[0], schemas)


ENDURANCE_OFF = ("walk", "other")


def plan_row_for(pred_date, pred, data):
    """The plan of record for the day: the week.json row (kept current by every replan, the same row the dashboard's
    Week view scores), matched to the prediction's discipline, else the day's first row. None when the week file has
    no row for the date (days before Oct 12, 2026): the prediction's own bounds are used then."""
    rows = mf.plan_rows(data, mf.d(pred_date))
    if not rows:
        return None
    disc = pred.get("discipline") or ""
    for r in rows:
        if r.get("type") == disc:
            return r
    return rows[0]


def lifted_answer(pred_date, data):
    """The next morning's one tap, "Lifted yesterday?" on the Today card (6.10.0): "yes", "no" or None when not asked or
    not answered. Read from coach/lift_taps.csv (store `lift_tap`, one document per morning, `for_date` the lift's day);
    a feel_daily `lifted_yesterday` value is read too, the first place the answer was planned to go."""
    nxt = mf.iso(mf.d(pred_date) + timedelta(days=1))
    for r in reversed(data.get("lift_taps", [])):
        if (r.get("for_date") or "") == pred_date or (not r.get("for_date") and r.get("date") == nxt):
            v = (r.get("answer") or "").strip().lower()
            if v in ("yes", "no"):
                return v
    for r in data.get("feel_daily", []):
        if r.get("date") == nxt:
            v = (r.get("lifted_yesterday") or "").strip().lower()
            return v if v in ("yes", "no") else None
    return None


def lifts_logged(pred_date, data):
    """A lift session the watch did not see: a set saved on the Lifts tab, a strength session rated in the feel form, or a
    "yes" on the next morning's "Lifted yesterday?" tap."""
    if any(r.get("date") == pred_date for r in data.get("strength_log", [])):
        return True
    if lifted_answer(pred_date, data) == "yes":
        return True
    return any(s.get("date") == pred_date and "strength" in (s.get("activity") or "").lower() for s in data["feel_sessions"])


def actual_for(pred_date, pred, data):
    """Classify what happened on pred_date against the day's final plan (week.json row; 6.6.0) or, failing that,
    the prediction's own bounds. Returns (class, minutes, rpe, plan_used)."""
    day = mf.d(pred_date)
    acts = mf.activity_rows(data, day)
    plan = plan_row_for(pred_date, pred, data)
    if plan is not None:
        row = {k: plan.get(k) for k in ("type", "minutes", "upper_minutes", "fallback_minutes", "alt_type", "intensity")}
        used = "week"
    else:
        row = {"type": pred.get("discipline") or None, "minutes": mf.num(pred.get("minutes")), "upper_minutes": mf.num(pred.get("upper_minutes")),
               "fallback_minutes": mf.num(pred.get("fallback_minutes")), "alt_type": "",
               "intensity": "easy" if (mf.num(pred.get("rpe")) or 9) <= 3 else "steady"}
        used = "prediction"
    disc = row.get("type") or ""
    training = [a for a in acts if a["discipline"] not in ENDURANCE_OFF]
    if disc == "rest":
        return ("rest" if not training else "over"), None, None, used
    # a race or a test is whatever sport it was run in (a past 50K and a past trail race were trail_running, Oct 24 and Nov 7)
    if disc in ("race", "test") and training:
        acts = [dict(a, discipline=disc) if a["discipline"] not in ENDURANCE_OFF else a for a in acts]
        if disc == "race":
            row["upper_minutes"] = None  # a slower finish is not an overrun
    same = [a for a in acts if a["discipline"] == disc]
    rpe = None
    ids = {str(a["activity_id"]) for a in same}
    for s in data["feel_sessions"]:
        if (s.get("activity_id") or "") in ids:
            rpe = mf.num(s.get("rpe"))
    if disc == "strength" and not same and lifts_logged(pred_date, data):
        return "nominal", None, rpe, used
    if not same:
        alt = row.get("alt_type") or ""
        fb_min = mf.num(row.get("fallback_minutes"))
        if alt == "rest" or (not alt and fb_min == 0 and used == "week"):
            # the plan's fallback was rest ("or rest. Counts as success"): nothing trained is the fallback
            if not training:
                return "fallback", None, None, used
        if alt == "strength" and lifts_logged(pred_date, data):
            return "fallback", None, None, used
        if alt == "walk":
            walks = [a for a in acts if a["discipline"] == "walk"]
            if walks:
                return "fallback", round(sum(a["minutes"] or 0 for a in walks), 1), None, used
        alts = [a for a in training if a["discipline"] == alt] if alt else []
        # no fallback discipline named: any other endurance session is the fallback (unchanged from 2.x)
        other = alts or ([a for a in training if a["discipline"] != disc] if not alt or alt in ("rest", "walk") else [])
        if other:
            return "fallback", other[0]["minutes"], None, used
        if disc in ("strength", "test"):
            return "none", None, rpe, used
        return "none", None, None, used
    cls, act = mf.classify(dict(row, alt_type=""), same, rpe)
    mins = round(sum(a["minutes"] or 0 for a in same), 1) if disc == "race" else (act["minutes"] if act else None)
    return cls, mins, rpe, used


def score_row(pd, p, data, feel_by):
    actual, mins, rpe, used = actual_for(pd, p, data)
    nxt = mf.iso(mf.d(pd) + timedelta(days=1))
    legs = None
    fe = feel_by.get(nxt)
    if fe:
        legs = mf.to5(mf.num(fe.get("legs")), (fe.get("scale") or "10"))
    pred_cls = p.get("completion") or ""
    legs_min = mf.num(p.get("next_morning_legs_min"))
    legs_ok = "" if legs is None or legs_min is None else ("yes" if legs >= legs_min else "no")
    match = "yes" if actual == pred_cls or (pred_cls == "nominal" and actual == "upper") else ("unknown" if actual == "unknown" else "no")
    prpe = mf.num(p.get("rpe"))
    notes = []
    if p.get("_revisions", 1) > 1:
        f = p["_first"]
        notes.append(f"replanned: scored against the plan logged {p.get('logged_at_utc', '')[11:16]}Z (morning plan {f.get('discipline')} {f.get('completion')} {f.get('minutes')} min)")
    if used == "prediction":
        notes.append("no week row: scored against the prediction's bounds")
    return {"date": pd, "discipline": p.get("discipline", ""), "predicted_completion": pred_cls, "actual_completion": actual,
            "actual_minutes": mins if mins is not None else "", "predicted_rpe": p.get("rpe", ""), "actual_rpe": rpe if rpe is not None else "",
            "rpe_delta": round(rpe - prpe, 1) if (rpe is not None and prpe is not None) else "",
            "next_morning_legs": legs if legs is not None else "", "legs_ok": legs_ok, "match": match,
            "note": "; ".join(notes), "scored_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def _version():
    return open("VERSION").read().strip() if os.path.exists("VERSION") else ""


def load_data():
    data = mf.load_all()
    data["strength_log"] = mf.read_csv("coach/strength_log.csv")
    return data


def score_pending(today, schemas):
    data = load_data()
    preds = latest_predictions(mf.read_csv(PRED))
    done = {x.get("date") for x in mf.read_csv(OUT)}
    feel_by = {x.get("date"): x for x in data["feel_daily"]}
    new = []
    for pd in sorted(preds):
        if pd in done or mf.d(pd) >= today:
            continue
        new.append(score_row(pd, preds[pd], data, feel_by))  # legs stay blank when the next morning has no feel yet
    if new:
        write_rows(OUT, schemas["outcomes_csv"], new)
    return new


def rescore(since, schemas, write=False):
    """Score every logged day from `since` again with the current rules and print what changes. With write=True the
    changed rows in coach/outcomes.csv are replaced in place (the note says so); git keeps the old rows. Retroactive
    rewrites need the athlete's yes (streak.json rule: no quiet edits to the record)."""
    data = load_data()
    preds = latest_predictions(mf.read_csv(PRED))
    feel_by = {x.get("date"): x for x in data["feel_daily"]}
    rows = mf.read_csv(OUT)
    changes = []
    for i, o in enumerate(rows):
        pd = o.get("date")
        if not pd or pd < since or pd not in preds:
            continue
        n = score_row(pd, preds[pd], data, feel_by)
        if n["actual_completion"] != o.get("actual_completion") or n["match"] != o.get("match"):
            changes.append((o, n))
            if write:
                n["note"] = "; ".join(x for x in (n["note"], f"rescored {_version()} (was {o.get('actual_completion')})") if x)
                rows[i] = n
    if write and changes:
        with open(OUT, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=schemas["outcomes_csv"])
            w.writeheader()
            for r in rows:
                w.writerow({k: r.get(k, "") for k in schemas["outcomes_csv"]})
    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--rescore", metavar="YYYY-MM-DD", help="score logged days from this date again with the current rules (dry run)")
    ap.add_argument("--write", action="store_true", help="with --rescore: replace the changed rows in coach/outcomes.csv")
    args = ap.parse_args()
    schemas = mf.read_json("coach/engine/schemas.json", {})
    prof = mf.read_json("coach/athlete/profile.json", {})
    tz = ZoneInfo(prof.get("timezone", "America/New_York"))
    today = mf.d(args.date) if args.date else datetime.now(tz).date()
    if args.rescore:
        ch = rescore(args.rescore, schemas, write=args.write)
        for o, n in ch:
            print(f"{o['date']}: {o['actual_completion']} (match {o['match']}) -> {n['actual_completion']} (match {n['match']}){'; ' + n['note'] if n['note'] else ''}")
        print(f"{len(ch)} day(s) {'rewritten' if args.write else 'would change (dry run; --write to apply)'}")
        return
    carry = log_carryover(today, schemas)
    if carry and carry != "already logged":
        print(f"carried over from today.json: {carry}")
    scored = score_pending(today, schemas)
    for s in scored:
        print(f"scored {s['date']}: predicted {s['predicted_completion']}, actual {s['actual_completion']} ({s['actual_minutes']} min), rpe {s['predicted_rpe']}->{s['actual_rpe']}, legs {s['next_morning_legs']} ok={s['legs_ok']}, match={s['match']}")
    res = log_today(today, schemas)
    print(f"today's prediction: {res or 'nothing to log (no expected block for today in today.json)'}")


if __name__ == "__main__":
    main()
