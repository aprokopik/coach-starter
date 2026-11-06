#!/usr/bin/env python3
"""One-time (resumable) backfill of older Garmin history. Runs inside GitHub Actions.

Uses the same login, methods and file layout as pull_garmin.py, so the coach and
dashboard read backfilled days exactly like daily pulls. Differences:
  - activities first (cheap, and what season and all-time records need), then daily
    health files from the newest missing day back to BACKFILL_DAILY_FROM;
  - a date that already has a daily or activity file is never re-pulled or rewritten;
  - backfilled daily files are written compact (no indent) and marked "capture": "backfill";
  - a date where Garmin has no core data (watch not worn yet) is not written; it is listed
    in state/backfill_progress.json so a re-run skips it;
  - the run stops itself at BACKFILL_MINUTES, or when Garmin starts refusing calls, and a
    re-run carries on where it stopped.

Env: BACKFILL_ACTIVITIES_FROM, BACKFILL_DAILY_FROM, BACKFILL_TO (YYYY-MM-DD; TO defaults to
yesterday), BACKFILL_MINUTES (default 45), plus the Garmin secrets used by pull_garmin.py.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pull_garmin as pg  # noqa: E402

PROGRESS = pg.ROOT / "state" / "backfill_progress.json"
CORE = ["sleep_h", "sleep_score", "hrv_overnight_ms", "resting_hr", "body_battery_high"]
EMPTY_STREAK_STOP = 45  # this many no-data days in a row, older than the first activity = start of Garmin history
ERROR_STREAK_STOP = 3   # this many days in a row where every call failed = Garmin is refusing; stop


def parse_day(text: str, default: date) -> date:
    text = (text or "").strip()
    return date.fromisoformat(text) if text else default


def load_progress() -> dict:
    if PROGRESS.exists():
        try:
            return json.loads(PROGRESS.read_text())
        except json.JSONDecodeError:
            pass
    return {"no_data_dates": [], "runs": []}


def backfill_activities(g, start: date, end: date, status: dict, out_of_time) -> list[dict]:
    acts, list_status = [], {}
    lo = start
    while lo <= end:  # a year per request, so one failed page costs one year, not everything
        hi = min(date(lo.year, 12, 31), end)
        state, chunk, err = pg.call(g, "get_activities_by_date", lo.isoformat(), hi.isoformat())
        if state != "empty":
            list_status[str(lo.year)] = state if err is None else f"{state}: {err}"
        acts.extend(chunk or [])
        lo = hi + timedelta(days=1)
    status["activities_list"] = list_status or "empty"
    rows, new = [], 0
    for a in acts:
        aid = a.get("activityId")
        if aid is None:
            continue
        rows.append(pg.activity_row(a))
        path = pg.ACTS / f"{aid}.json"
        if path.exists() or out_of_time():  # captured already, or no time left for extras
            continue
        extras, ex_status = {}, {}
        for key, method in pg.ACTIVITY_EXTRAS:
            s, v, e = pg.call(g, method, str(aid))
            ex_status[key] = s if e is None else f"{s}: {e}"
            if s in ("ok", "empty"):
                extras[key] = v
        payload = {"schema": pg.SCHEMA, "activity_id": aid, "pulled_at_utc": status["run_at_utc"],
                   "capture": "backfill", "summary": a, **extras, "method_status": ex_status}
        pg.write_if_changed(path, payload, ["summary"] + [k for k, _ in pg.ACTIVITY_EXTRAS])
        new += 1
    status["activities_found"] = len(rows)
    status["activities_new_files"] = new
    if rows:
        earliest = min(r["local_start"] for r in rows if r.get("local_start"))
        status["earliest_activity"] = earliest[:10]
    return rows


def write_compact_if_new(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str) + "\n")


def main() -> int:
    run_at = pg.utc_now()
    started = time.monotonic()
    budget_s = 60 * int(os.environ.get("BACKFILL_MINUTES", "").strip() or 45)
    out_of_time = lambda: time.monotonic() - started > budget_s

    yesterday = datetime.now(pg.LOCAL_TZ).date() - timedelta(days=1)
    end = parse_day(os.environ.get("BACKFILL_TO", ""), yesterday)
    daily_from = parse_day(os.environ.get("BACKFILL_DAILY_FROM", ""), end - timedelta(days=730))
    acts_from = parse_day(os.environ.get("BACKFILL_ACTIVITIES_FROM", ""), date(2000, 1, 1))

    progress = load_progress()
    no_data = set(progress.get("no_data_dates", []))
    status = {"run_at_utc": run_at, "activities_from": acts_from.isoformat(),
              "daily_from": daily_from.isoformat(), "to": end.isoformat(),
              "daily_written": 0, "daily_no_data": 0, "stopped_because": None}

    try:
        g, old_token = pg.connect()
    except BaseException as exc:
        status["stopped_because"] = f"login failed: {type(exc).__name__}: {str(exc)[:300]}"
        progress.setdefault("runs", []).append(status)
        PROGRESS.parent.mkdir(parents=True, exist_ok=True)
        PROGRESS.write_text(json.dumps(progress, indent=1, sort_keys=True) + "\n")
        print(status["stopped_because"], file=sys.stderr)
        return 2

    act_rows = backfill_activities(g, acts_from, end, status, out_of_time)
    if act_rows:
        pg.upsert_csv(pg.DATA / "activities.csv", pg.ACTIVITY_FIELDS, "activity_id", act_rows)

    summary_rows, empty_streak, error_streak = [], 0, 0
    day = end
    while day >= daily_from:
        iso = day.isoformat()
        day -= timedelta(days=1)
        if (pg.DAILY / f"{iso}.json").exists() or iso in no_data:
            continue
        if out_of_time():
            status["stopped_because"] = f"time budget reached; next missing day is {iso}"
            break
        rec = pg.pull_day(g, iso)
        if not rec["responses"]:  # every method errored: Garmin is refusing or down
            error_streak += 1
            if error_streak >= ERROR_STREAK_STOP:
                status["stopped_because"] = f"Garmin refused every call for {error_streak} days in a row at {iso}; re-run later"
                break
            continue
        error_streak = 0
        row = pg.summarize(iso, rec)
        if all(row[k] is None for k in CORE) and not row.get("steps"):
            no_data.add(iso)
            status["daily_no_data"] += 1
            empty_streak += 1
            if empty_streak >= EMPTY_STREAK_STOP and iso < status.get("earliest_activity", "9999"):
                status["stopped_because"] = f"{EMPTY_STREAK_STOP} days without Garmin data before {iso}: start of history"
                break
            continue
        empty_streak = 0
        payload = {"schema": pg.SCHEMA, "date": iso, "pulled_at_utc": run_at, "capture": "backfill", **rec}
        write_compact_if_new(pg.DAILY / f"{iso}.json", payload)
        row["last_changed_utc"] = run_at
        summary_rows.append(row)
        status["daily_written"] += 1
        time.sleep(0.5)  # be gentle with Garmin over a long run
    else:
        status["stopped_because"] = "done"

    if summary_rows:
        pg.upsert_csv(pg.DATA / "summary.csv", pg.SUMMARY_FIELDS, "date", summary_rows)

    try:
        pg.save_token_if_rotated(old_token, g.client.dumps())
    except Exception:
        pass

    status["minutes"] = round((time.monotonic() - started) / 60, 1)
    progress["no_data_dates"] = sorted(no_data)
    progress.setdefault("runs", []).append(status)
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    PROGRESS.write_text(json.dumps(progress, indent=1, sort_keys=True) + "\n")
    print(json.dumps(status, indent=1))
    if summary_rows:
        print(f"daily history now starts {min(r['date'] for r in summary_rows)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
