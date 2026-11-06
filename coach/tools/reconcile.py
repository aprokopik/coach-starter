"""Prediction log and reconciliation.

Two jobs, both idempotent, so the morning run can call it before and after the check-in:
  1. Score every logged prediction older than today that has no outcome yet, from the Garmin
     activities, the session RPE and the next morning's legs score. Appends to coach/outcomes.csv.
  2. If coach/today.json carries today's prescription with an `expected` block and it is not yet in
     coach/predictions.csv, append it.

    python3 coach/tools/reconcile.py                 # today
    python3 coach/tools/reconcile.py --date 2026-10-19

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


def log_today(today, schemas):
    tj = mf.read_json("coach/today.json", {"rows": []}).get("rows", [])
    if not tj:
        return None
    t = tj[0]
    if t.get("date") != mf.iso(today) or not isinstance(t.get("expected"), dict):
        return None
    existing = {x.get("date") for x in mf.read_csv(PRED)}
    if mf.iso(today) in existing:
        return "already logged"
    e = t["expected"]
    row = {"date": t["date"], "discipline": e.get("discipline", ""), "completion": e.get("completion", ""),
           "minutes": e.get("minutes", ""), "upper_minutes": e.get("upper_minutes", ""), "fallback_minutes": e.get("fallback_minutes", ""),
           "rpe": e.get("rpe", ""), "next_morning_legs_min": e.get("next_morning_legs_min", ""),
           "readiness": t.get("readiness", ""), "confidence": t.get("confidence", ""), "call": t.get("call", ""),
           "logged_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    write_rows(PRED, schemas["predictions_csv"], [row])
    return "logged"


def actual_for(pred_date, pred, data):
    """Classify what happened on pred_date against the prediction's own bounds (not week.json, which may have been replanned)."""
    day = mf.d(pred_date)
    acts = mf.activity_rows(data, day)
    disc = pred.get("discipline") or ""
    row = {"type": disc if disc else None, "minutes": mf.num(pred.get("minutes")), "upper_minutes": mf.num(pred.get("upper_minutes")),
           "fallback_minutes": mf.num(pred.get("fallback_minutes")), "intensity": "easy" if (mf.num(pred.get("rpe")) or 9) <= 3 else "steady"}
    # fallback discipline is unknown to the prediction row; accept any other endurance discipline as the fallback
    same = [a for a in acts if a["discipline"] == disc]
    other = [a for a in acts if a["discipline"] not in (disc, "walk", "other")]
    rpe = None
    for s in data["feel_sessions"]:
        if (s.get("activity_id") or "") in {str(a["activity_id"]) for a in same}:
            rpe = mf.num(s.get("rpe"))
    if disc == "rest":
        return ("rest" if not (same or other) else "over"), None, None
    if disc in ("strength", "test") and not same:
        logged = any(s.get("date") == pred_date and disc in (s.get("activity_id") or "").lower() for s in data["feel_sessions"])
        return ("nominal" if logged else "none"), None, rpe
    if not same and other:
        return "fallback", other[0]["minutes"], None
    cls, act = mf.classify(row, acts, rpe)
    return cls, (act["minutes"] if act else None), rpe


def score_pending(today, schemas):
    data = mf.load_all()
    preds = mf.read_csv(PRED)
    done = {x.get("date") for x in mf.read_csv(OUT)}
    feel_by = {x.get("date"): x for x in data["feel_daily"]}
    new = []
    for p in preds:
        pd = p.get("date")
        if not pd or pd in done or mf.d(pd) >= today:
            continue
        # need the next morning's data to exist before scoring, unless it is already 2+ days old
        nxt = mf.iso(mf.d(pd) + timedelta(days=1))
        if mf.d(pd) + timedelta(days=1) >= today and nxt not in feel_by:
            pass  # score anyway; legs will be blank
        actual, mins, rpe = actual_for(pd, p, data)
        legs = None
        fe = feel_by.get(nxt)
        if fe:
            legs = mf.to5(mf.num(fe.get("legs")), (fe.get("scale") or "10"))
        pred_cls = p.get("completion") or ""
        legs_min = mf.num(p.get("next_morning_legs_min"))
        legs_ok = "" if legs is None or legs_min is None else ("yes" if legs >= legs_min else "no")
        match = "yes" if actual == pred_cls or (pred_cls == "nominal" and actual == "upper") else ("unknown" if actual == "unknown" else "no")
        prpe = mf.num(p.get("rpe"))
        new.append({"date": pd, "discipline": p.get("discipline", ""), "predicted_completion": pred_cls, "actual_completion": actual,
                    "actual_minutes": mins if mins is not None else "", "predicted_rpe": p.get("rpe", ""), "actual_rpe": rpe if rpe is not None else "",
                    "rpe_delta": round(rpe - prpe, 1) if (rpe is not None and prpe is not None) else "",
                    "next_morning_legs": legs if legs is not None else "", "legs_ok": legs_ok, "match": match,
                    "note": "", "scored_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    if new:
        write_rows(OUT, schemas["outcomes_csv"], new)
    return new


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    args = ap.parse_args()
    schemas = mf.read_json("coach/engine/schemas.json", {})
    prof = mf.read_json("coach/athlete/profile.json", {})
    tz = ZoneInfo(prof.get("timezone", "America/New_York"))
    today = mf.d(args.date) if args.date else datetime.now(tz).date()
    scored = score_pending(today, schemas)
    for s in scored:
        print(f"scored {s['date']}: predicted {s['predicted_completion']}, actual {s['actual_completion']} ({s['actual_minutes']} min), rpe {s['predicted_rpe']}->{s['actual_rpe']}, legs {s['next_morning_legs']} ok={s['legs_ok']}, match={s['match']}")
    res = log_today(today, schemas)
    print(f"today's prediction: {res or 'nothing to log (no expected block for today in today.json)'}")


if __name__ == "__main__":
    main()
