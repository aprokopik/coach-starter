"""The coach's two life board jobs on the Project Board (the athlete chose "Both, as one PR" on the card, Nov 11, 2026).

1. Race dates for Admin. Admin asked (board item 20261111-coach-contract-admin) for race registrations and race dates
   (name, date, start time, location, packet pickup) and race travel dates, names and dates only, so it can book
   logistics, the calendar and pet cover. `race-notices` lists one board notice per registered or planned race still
   ahead whose details changed since the last notice (a fingerprint of the public fields is the ref, so an unchanged
   race is never sent twice). races.json rows may carry `packet_pickup` and `travel` as plain text.

2. The monthly seat report. The life board (charter (link not included in the kit), config/board on
   the Project Board) gives this coach the Chief performance officer seat and a report `reports/YYYY-MM-Coach`, due by
   the 6th. `report-due` says whether it is due today (the 1st to the 6th, not yet filed); `report-draft` writes the
   computed part (KPI colors from the three outcomes and the markers, period, link); the morning run adds the headline,
   wins, risks, needs and recommendations; `report-check` refuses any health or money figure and any field over its
   limit; `report-filed` records it.

Colors and words only: never a weight, heart rate, sleep, HRV, blood pressure, lab value, pain detail or money amount.

    python3 coach/tools/board_jobs.py race-notices [--date YYYY-MM-DD]
    python3 coach/tools/board_jobs.py report-due [--date YYYY-MM-DD]          exit 0 due, 1 not due, 3 no board
    python3 coach/tools/board_jobs.py report-draft [--date YYYY-MM-DD] > /tmp/report.json
    python3 coach/tools/board_jobs.py report-check /tmp/report.json           exit 0 clean, 1 with the problems
    python3 coach/tools/board_jobs.py report-filed YYYY-MM
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import board  # noqa: E402

SEASON = "{{SEASON_URL}}"
DASHBOARD = "{{DASHBOARD_URL}}"
SEAT = "Chief performance officer"
DUE_DAY = 6
LIMITS = {"kpis": 4, "wins": 3, "risks": 3, "recommendations": 3}
RAGS = ("green", "amber", "red")
TRENDS = ("up", "flat", "down", "new")
# A figure is a number next to a health or money unit, a blood pressure pair, or any money sign
FIGURE = re.compile(r"\d\s*(lb|lbs|kg|bpm|mmhg|kcal|cal\b|mg|g/kg|%|ms\b|hrv|vo2)|\b\d{2,3}\s*/\s*\d{2,3}\b|[$€£]\s*\d", re.I)


def _json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as fh:
        return json.load(fh)


def _d(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


# ---------- 1. race dates for Admin ----------

PUBLIC = ("name", "date", "start_time", "start_basis", "location", "packet_pickup", "travel", "status")


def fingerprint(r):
    return hashlib.sha1("|".join(str(r.get(k) or "") for k in PUBLIC).encode()).hexdigest()[:8]


def race_item(r):
    parts = [f"Race: {r.get('name')}", str(r.get("date"))]
    if r.get("start_time"):
        parts.append(f"start {r['start_time']}" + ("" if r.get("start_basis") == "posted" else " (expected, from past editions)"))
    else:
        parts.append("start time not posted yet")
    if r.get("location"):
        parts.append(str(r["location"]))
    parts.append(f"packet pickup {r['packet_pickup']}" if r.get("packet_pickup") else "packet pickup not posted yet")
    if r.get("travel"):
        parts.append(f"travel {r['travel']}")
    parts.append(r.get("status") or "")
    return "; ".join(p for p in parts if p)


def race_notices(today, root=".", name="Coach", now=None):
    b = board.load(root)
    if b is None:
        return []
    stamp = board.now_iso(now)
    out = []
    for r in _json(os.path.join(root, "coach/races.json"), {"rows": []}).get("rows", []):
        d = _d(r.get("date"))
        if r.get("kind") != "race" or r.get("status") not in ("registered", "planned") or not d or d < today:
            continue
        rid = r.get("race_id") or re.sub(r"[^a-z0-9]+", "-", (r.get("name") or "race").lower()).strip("-")
        ref = f"race-{rid}-{fingerprint(r)}"
        if board.was_posted(b, ref):
            continue
        out.append({"ref": ref, "doc": {
            "id": f"{today.strftime('%Y%m%d')}-race-{rid}"[:120],
            "from": name, "to": "Admin", "type": "notice",
            "item": race_item(r), "link": SEASON, "due": r["date"], "status": "new",
            "created": stamp, "updated": stamp}})
    return out


# ---------- 2. monthly seat report ----------

def period_of(today):
    """The report filed in month M covers month M-1."""
    first = today.replace(day=1)
    last = first - timedelta(days=1)
    return last.replace(day=1), last


def report_due(today, root="."):
    b = board.load(root)
    if b is None:
        return None
    return 1 <= today.day <= DUE_DAY and today.strftime("%Y-%m") not in b.get("reports_filed", [])


def _rag(share, green, amber):
    if share is None:
        return "amber"
    return "green" if share >= green else "amber" if share >= amber else "red"


def _trend(now, before):
    if now is None or before is None:
        return "new"
    return "up" if now > before + 0.05 else "down" if now < before - 0.05 else "flat"


def _shares(weeks):
    sc = sum(w.get("scored", 0) for w in weeks)
    ez = sum(w.get("easy_done", 0) for w in weeks)
    lifts_target = sum(w.get("lifts_target") or max(w.get("lifts_planned", 0), 2) for w in weeks)
    return {"plan": sum(w.get("on_plan", 0) for w in weeks) / sc if sc else None,
            "easy": sum(w.get("easy_kept", 0) for w in weeks) / ez if ez else None,
            "lifts": sum(w.get("lifts_done", 0) for w in weeks) / lifts_target if weeks else None}


def overall(kpis):
    reds = sum(k["rag"] == "red" for k in kpis)
    ambers = sum(k["rag"] == "amber" for k in kpis)
    return "red" if reds >= 2 else "amber" if reds or ambers >= 2 else "green"


def report_draft(today, root=".", weeks=None, markers=None, now=None):
    start, end = period_of(today)
    pstart, pend = period_of(start)
    if weeks is None:
        import outcomes
        weeks = [w for w in outcomes.history(today) if not w.get("partial")]
    inside = lambda w, a, b: a <= _d(w["start"]) <= b  # noqa: E731
    cur = _shares([w for w in weeks if inside(w, start, end)])
    prev = _shares([w for w in weeks if inside(w, pstart, pend)])
    if markers is None:
        markers = [r for r in _json(os.path.join(root, "coach/dashboard/coach.json"), {"rows": []}).get("rows", [])
                   if r.get("kind") == "marker"]
    act = [m.get("label") or m.get("key") for m in markers if m.get("status") == "act"]
    watch = [m.get("label") or m.get("key") for m in markers if m.get("status") == "watch"]
    kpis = [
        {"name": "Consistency (days on plan)", "rag": _rag(cur["plan"], 0.8, 0.6), "trend": _trend(cur["plan"], prev["plan"]),
         "note": ""},
        {"name": "Easy days kept easy", "rag": _rag(cur["easy"], 0.8, 0.6), "trend": _trend(cur["easy"], prev["easy"]),
         "note": ""},
        {"name": "Strength (two lifts a week)", "rag": _rag(cur["lifts"], 0.8, 0.5), "trend": _trend(cur["lifts"], prev["lifts"]),
         "note": ""},
        {"name": "Health markers", "rag": "red" if act else "amber" if watch else "green", "trend": "new",
         # the board never names a health marker: color only, details stay on the dashboard
         "note": "Details on the coach dashboard" if act or watch else ""},
    ]
    return {
        "seat": SEAT, "project": "Coach", "period": start.strftime("%B %Y"),
        "updated": board.now_iso(now), "rag": overall(kpis),
        "headline": "", "kpis": kpis, "wins": [], "risks": [], "needsFromSeats": [], "recommendations": [],
        "link": DASHBOARD,
    }


def _strings(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, dict):
        for v in x.values():
            yield from _strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from _strings(v)


def report_check(rep):
    problems = []
    for k in ("seat", "project", "period", "updated", "rag", "headline", "kpis", "wins", "risks", "needsFromSeats",
              "recommendations", "link"):
        if k not in rep:
            problems.append(f"missing {k}")
    if not (rep.get("headline") or "").strip():
        problems.append("headline is empty")
    for k, n in LIMITS.items():
        if len(rep.get(k) or []) > n:
            problems.append(f"{k} has more than {n}")
    if rep.get("rag") not in RAGS:
        problems.append("rag must be green, amber or red")
    for kp in rep.get("kpis") or []:
        if kp.get("rag") not in RAGS or kp.get("trend") not in TRENDS:
            problems.append(f"kpi {kp.get('name')}: rag or trend not allowed")
    for r in rep.get("risks") or []:
        for f in ("risk", "likelihood", "impact", "mitigation"):
            if f not in r:
                problems.append(f"risk lacks {f}")
    for s in _strings({k: v for k, v in rep.items() if k not in ("updated", "link")}):
        if FIGURE.search(s):
            problems.append(f"health or money figure: {s[:60]}")
    return problems


def report_filed(root, month):
    b = board.load(root)
    b["reports_filed"] = sorted(set(b.get("reports_filed", []) + [month]))[-24:]
    board.save(root, b)


def main(argv, root=board.ROOT):
    ap = argparse.ArgumentParser(prog="board_jobs.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("race-notices", "report-due", "report-draft"):
        p = sub.add_parser(c)
        p.add_argument("--date")
    sub.add_parser("report-check").add_argument("file")
    sub.add_parser("report-filed").add_argument("month")
    a = ap.parse_args(argv)
    if board.load(root) is None:
        print("no board: skip")
        return board.NO_BOARD
    from zoneinfo import ZoneInfo
    today = _d(getattr(a, "date", None)) if getattr(a, "date", None) else datetime.now(ZoneInfo("America/New_York")).date()
    if a.cmd == "race-notices":
        print(json.dumps(race_notices(today, root, board.load(root).get("name", "Coach")), indent=1))
        return 0
    if a.cmd == "report-due":
        due = report_due(today, root)
        print(f"due: file reports/{today.strftime('%Y-%m')}-Coach by the {DUE_DAY}th" if due else "not due")
        return 0 if due else 1
    if a.cmd == "report-draft":
        print(json.dumps(report_draft(today, root), indent=1, ensure_ascii=False))
        return 0
    if a.cmd == "report-check":
        with open(a.file) as fh:
            problems = report_check(json.load(fh))
        print("\n".join(problems) if problems else "clean")
        return 1 if problems else 0
    report_filed(root, a.month)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
