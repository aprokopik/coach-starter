"""Plan-adherence streak for the dashboard and the check-in (coach/engine/LEVELS.md section 7; the athlete, Oct 23, 2026).

Reads coach/outcomes.csv (one row per scored day), coach/predictions.csv (readiness per day) and coach/streak.json (freezes).
A day is followed when actual_completion is rest, fallback, nominal or upper; frozen when it carries a freeze or readiness was RED;
missed when a planned session was scored none. Current streak = followed days back from the latest scored day, through frozen
days (which neither add nor break). Prints one JSON row (kind streak) for build_dashboard.py.
"""
import csv
import json
import os
from datetime import date, timedelta

FOLLOWED = {"rest", "fallback", "nominal", "upper"}


def build(today=None):
    outcomes = list(csv.DictReader(open("coach/outcomes.csv"))) if os.path.exists("coach/outcomes.csv") else []
    preds = {r["date"]: r for r in csv.DictReader(open("coach/predictions.csv"))} if os.path.exists("coach/predictions.csv") else {}
    sj = json.load(open("coach/streak.json")) if os.path.exists("coach/streak.json") else {"freezes": []}
    freezes = {f["date"]: f.get("reason", "") for f in sj.get("freezes", [])}
    days = []
    for r in sorted(outcomes, key=lambda r: r["date"]):
        d = r["date"]
        if r.get("actual_completion") in FOLLOWED:
            st = "followed"
        elif d in freezes or (preds.get(d, {}).get("readiness") == "RED"):
            st = "frozen"
        else:
            st = "missed"
        days.append({"date": d, "status": st, "plan": r.get("predicted_completion"), "actual": r.get("actual_completion"), "reason": freezes.get(d, "RED readiness" if st == "frozen" and d not in freezes else "")})
    cur = 0
    for x in reversed(days):
        if x["status"] == "followed":
            cur += 1
        elif x["status"] == "missed":
            break
    best, run = 0, 0
    for x in days:
        if x["status"] == "followed":
            run += 1; best = max(best, run)
        elif x["status"] == "missed":
            run = 0
    followed = sum(1 for x in days if x["status"] == "followed")
    scored = sum(1 for x in days if x["status"] != "frozen")
    since = next((x["date"] for x in reversed(days[:len(days)]) if x["status"] == "missed"), None)
    start = days[0]["date"] if days else None
    row = {"kind": "streak", "current": cur, "best": best, "followed": followed, "scored": scored, "frozen": len(days) - scored, "start": start,
           "latest": days[-1]["date"] if days else None, "rate": round(followed / scored, 2) if scored else None,
           "rule": "A day counts when you did what the plan said: a rest day, a fallback, the nominal or the upper bound all count. Travel, illness, a replanned rest or a RED morning freeze the streak; a missed planned session breaks it.",
           "days": ";".join(f"{x['date']}|{x['status']}|{x['plan']}|{x['actual']}|{x['reason'].replace(';', ',').replace('|', '/')}" for x in days)}
    return row


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False))
