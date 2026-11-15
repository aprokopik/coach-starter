#!/usr/bin/env python3
"""Daily health from Apple Health (Oura, Ultrahuman, Apple Watch, any app that writes to it) into the repo.

For athletes without Garmin. Apple Health has no web API, so an iPhone Shortcut ("Send health to
coach", setup in coach/ops/APPLE-HEALTH-SHORTCUT.md) reads the last few days of samples and sends
them as a `repository_dispatch` event of type `apple_health`. The workflow
.github/workflows/ingest-apple-health.yml hands the payload to this script in APPLE_HEALTH_PAYLOAD.

Payload (client_payload): each value a block of text, one sample per line, fields split by ';'.
  sleep   <start>;<end>;<stage>;<source>        Sleep Analysis (stage: In Bed, Asleep, Core, Deep, REM, Awake)
  hrv     <start>;<value ms>;<source>           Heart Rate Variability
  rhr     <start>;<value bpm>;<source>          Resting Heart Rate
  steps   <start>;<value>;<source>              Steps
  weight  <start>;<value>;<unit>;<source>       Weight (optional)
Dates are ISO 8601 from the Shortcut (Shortcuts' medium format is also read).

Written (relative to repo root), the same columns the Garmin pull writes, so every coach tool
works unchanged:
  data/summary.csv           sleep_h, sleep_deep_h, sleep_rem_h, sleep_awake_h, hrv_overnight_ms,
                             resting_hr, steps, weight_lb / weight_kg / weight_source, missing
  data/status/last_run.json  run_at_utc, source "apple_health", dates and sources seen

Rules (Calculated from Measured samples):
- A night belongs to the date it ends on (wake day), local time from coach/athlete/profile.json.
- When two sources record the same night (a ring and the phone), the one with the most asleep
  minutes is used for that night; its name is kept in `missing` notes, never mixed.
- hrv_overnight_ms = mean of that night's HRV samples taken between sleep start and wake; else the
  day's mean before noon. Apple Health HRV from Apple Watch is SDNN while rings report their own
  overnight value: compare only with the athlete's own baseline (the coach already does).
- Steps: the source with the highest total for the day (phones and watches double count).
Resending the same samples changes nothing. Health values only; never prints the payload.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from body_comp import parse_value, parse_when  # noqa: E402  (same date and number reading as the scale)
from pull_garmin import SUMMARY_FIELDS  # noqa: E402

KG_PER_LB = 0.45359237
ASLEEP = {"asleep", "core", "deep", "rem", "asleepcore", "asleepdeep", "asleeprem", "asleepunspecified", "light"}
RANGES = {"hrv": (5, 300), "rhr": (25, 120), "steps": (0, 100000), "weight": (70, 400)}
CORE = ("sleep_h", "hrv_overnight_ms", "resting_hr")


def local_tz() -> ZoneInfo:
    try:
        prof = json.loads((ROOT / "coach/athlete/profile.json").read_text())
        return ZoneInfo(prof.get("timezone") or "America/New_York")
    except Exception:
        return ZoneInfo("America/New_York")


def lines(block) -> list[list[str]]:
    if not isinstance(block, str):
        return []
    return [[p.strip() for p in ln.split(";")] for ln in block.splitlines() if ln.strip()]


def when(s: str, tz: ZoneInfo) -> datetime | None:
    t = parse_when(s)
    if t is None:
        return None
    return (t if t.tzinfo else t.replace(tzinfo=tz)).astimezone(tz)


def stage_key(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def nights(block, tz) -> tuple[dict, list[str]]:
    """{wake date: {sleep_h, sleep_deep_h, sleep_rem_h, sleep_awake_h, start, end, source}}"""
    warn = []
    by = defaultdict(lambda: defaultdict(lambda: {"asleep": 0.0, "deep": 0.0, "rem": 0.0, "awake": 0.0, "start": None, "end": None}))
    for f in lines(block):
        if len(f) < 3:
            warn.append("sleep line with fewer than 3 fields skipped")
            continue
        a, b = when(f[0], tz), when(f[1], tz)
        if not a or not b or b <= a or (b - a) > timedelta(hours=16):
            warn.append("sleep line with unreadable or implausible times skipped")
            continue
        st, src = stage_key(f[2]), (f[3] if len(f) > 3 else "") or "Apple Health"
        n = by[b.date().isoformat()][src]
        h = (b - a).total_seconds() / 3600
        if st in ASLEEP:
            n["asleep"] += h
            if st in ("deep", "asleepdeep"):
                n["deep"] += h
            if st in ("rem", "asleeprem"):
                n["rem"] += h
        elif st == "awake":
            n["awake"] += h
        else:  # in bed only frames the night
            pass
        n["start"] = min(filter(None, [n["start"], a]))
        n["end"] = max(filter(None, [n["end"], b]))
    out = {}
    for day, srcs in by.items():
        src, n = max(srcs.items(), key=lambda kv: kv[1]["asleep"])
        if n["asleep"] <= 0:
            continue
        out[day] = {"sleep_h": round(n["asleep"], 2), "sleep_deep_h": round(n["deep"], 2) if n["deep"] else None,
                    "sleep_rem_h": round(n["rem"], 2) if n["rem"] else None, "sleep_awake_h": round(n["awake"], 2) if n["awake"] else None,
                    "start": n["start"], "end": n["end"], "source": src}
    return out, warn


def samples(block, kind, tz) -> list[tuple[datetime, float, str]]:
    out = []
    lo, hi = RANGES[kind]
    for f in lines(block):
        if len(f) < 2:
            continue
        t, v = when(f[0], tz), parse_value(f[1])
        if t is None or v is None:
            continue
        unit = f[2].lower() if kind == "weight" and len(f) > 2 else ""
        if kind == "weight":
            v = v / KG_PER_LB if unit in ("kg", "kilograms", "kilogram") else v
        if not lo <= v <= hi:
            continue
        src = f[-1] if len(f) >= (4 if kind == "weight" else 3) else "Apple Health"
        out.append((t, v, src))
    return out


def build(payload: dict, tz: ZoneInfo) -> tuple[dict, list[str], list[str]]:
    """Return ({date: summary fields}, warnings, sources seen)."""
    night, warn = nights(payload.get("sleep"), tz)
    days: dict[str, dict] = defaultdict(dict)
    for d, n in night.items():
        days[d].update({k: n[k] for k in ("sleep_h", "sleep_deep_h", "sleep_rem_h", "sleep_awake_h")})
    hrv = samples(payload.get("hrv"), "hrv", tz)
    by_day = defaultdict(list)
    for t, v, _ in hrv:
        by_day[t.date().isoformat()].append((t, v))
    for d, vals in by_day.items():
        n = night.get(d)
        inside = [v for t, v in vals if n and n["start"] <= t <= n["end"]]
        morning = [v for t, v in vals if t.hour < 12]
        pick = inside or morning
        if pick:
            days[d]["hrv_overnight_ms"] = round(sum(pick) / len(pick))
    for t, v, _ in sorted(samples(payload.get("rhr"), "rhr", tz)):
        days[t.date().isoformat()]["resting_hr"] = round(v)  # the day's latest value wins
    steps = defaultdict(lambda: defaultdict(float))
    for t, v, src in samples(payload.get("steps"), "steps", tz):
        steps[t.date().isoformat()][src] += v
    for d, by_src in steps.items():
        days[d]["steps"] = int(max(by_src.values()))
    first_w = {}
    for t, v, src in sorted(samples(payload.get("weight"), "weight", tz)):
        first_w.setdefault(t.date().isoformat(), (v, src))
    for d, (v, src) in first_w.items():
        days[d].update({"weight_lb": round(v, 1), "weight_kg": round(v * KG_PER_LB, 2), "weight_source": "scale"})
    seen = sorted({n["source"] for n in night.values()} | {s for *_, s in hrv})
    return dict(days), warn, seen


def merge_summary(days: dict) -> list[str]:
    path = ROOT / "data" / "summary.csv"
    existing = {}
    if path.exists():
        with path.open(newline="") as f:
            existing = {r["date"]: r for r in csv.DictReader(f)}
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = []
    for d, vals in days.items():
        row = dict(existing.get(d) or {"date": d})
        before = dict(row)
        for k, v in vals.items():
            if v is not None:
                row[k] = v
        row["missing"] = ";".join(k for k in CORE if row.get(k) in (None, ""))
        if any(str(before.get(k, "")) != str(row.get(k, "")) for k in row if k != "last_changed_utc"):
            row["last_changed_utc"] = stamp
            changed.append(d)
        existing[d] = row
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS, extrasaction="ignore")
        w.writeheader()
        for k in sorted(existing):
            w.writerow({x: existing[k].get(x, "") for x in SUMMARY_FIELDS})
    return sorted(changed)


def main() -> int:
    raw = os.environ.get("APPLE_HEALTH_PAYLOAD", "")
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        print("payload is not JSON", file=sys.stderr)
        return 1
    if not isinstance(payload, dict):
        print("payload is not an object", file=sys.stderr)
        return 1
    tz = local_tz()
    days, warn, seen = build(payload, tz)
    for w in sorted(set(warn)):
        print("warning:", w)
    changed = merge_summary(days) if days else []
    status = {"run_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "apple_health",
              "dates": sorted(days), "dates_changed": changed, "sources": seen}
    (ROOT / "data/status").mkdir(parents=True, exist_ok=True)
    (ROOT / "data/status/last_run.json").write_text(json.dumps(status, indent=1) + "\n")
    print(f"{len(days)} day(s) read, changed: {', '.join(changed) or 'none'}; sources: {', '.join(seen) or 'none'}")
    return 0 if days or not any(payload.get(k) for k in ("sleep", "hrv", "rhr", "steps", "weight")) else 1


if __name__ == "__main__":
    sys.exit(main())
