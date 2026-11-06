#!/usr/bin/env python3
"""Smart-scale weigh-ins (Hume, via Apple Health and an iPhone Shortcut) into the repo.

Apple Health has no web API, so an iPhone Shortcut reads the last few days of
Weight, Body Fat Percentage and Lean Body Mass samples and sends them to the
repo as a `repository_dispatch` event (type `body_comp`). The workflow
.github/workflows/ingest-body-comp.yml hands the event payload to this script
in the BODY_COMP_PAYLOAD environment variable.

Payload (client_payload), each value a block of text with one sample per line,
fields separated by ';':  <start date>;<value>;<unit>;<source>
  {"weight": "...", "fat": "...", "lean": "..."}

Layout written (relative to repo root):
  data/body_comp.csv   one row per weigh-in (samples from the same minute merged), Measured
  data/summary.csv     weight_lb / weight_kg / body_fat_pct / lean_lb / weight_source for
                       the touched dates (lean_lb is weight x (1 - body fat), Calculated,
                       when the scale sends no lean mass): the day's first scale weigh-in wins over a
                       Garmin manual entry (pull_garmin.summarize applies the same rule)

Resending the same samples changes nothing, so the Shortcut can send a week at a time.
Health values only; never prints the payload.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "body_comp.csv"
LOCAL_TZ = ZoneInfo("America/New_York")
FIELDS = ["measured_at", "date", "weight_lb", "body_fat_pct", "lean_lb", "lean_basis", "source", "received_utc"]
KG_PER_LB = 0.45359237
# plausible ranges; anything outside is a unit or typing error and is dropped
RANGES = {"weight_lb": (70, 400), "body_fat_pct": (2, 60), "lean_lb": (50, 300)}
KINDS = {"weight": "weight_lb", "fat": "body_fat_pct", "lean": "lean_lb"}


def parse_when(s: str) -> datetime | None:
    s = s.strip()
    if not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        t = None
        # Shortcuts' default medium format, in case the ISO format was not picked
        for fmt in ("%b %d, %Y at %I:%M %p", "%b %d, %Y at %I:%M:%S %p", "%Y-%m-%d %H:%M", "%m/%d/%Y %I:%M %p", "%m/%d/%y, %I:%M %p"):
            try:
                t = datetime.strptime(s.replace(" ", " "), fmt)
                break
            except ValueError:
                continue
        if t is None:
            return None
    return t if t.tzinfo else t.replace(tzinfo=LOCAL_TZ)


def parse_value(s: str) -> float | None:
    s = s.strip().replace(" ", "")
    if "," in s and "." not in s:
        s = s.replace(",", ".")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else None


def to_field(kind: str, value: float, unit: str) -> float | None:
    u = unit.strip().lower()
    if kind == "body_fat_pct":
        v = value * 100 if value <= 1 else value  # HealthKit stores a fraction
    elif u in ("kg", "kilograms", "kilogram"):
        v = value / KG_PER_LB
    elif u in ("g", "grams"):
        v = value / 1000 / KG_PER_LB
    elif u in ("st", "stone"):
        v = value * 14
    else:  # lb, lbs, pounds, or blank (the Health app's US default)
        v = value
    lo, hi = RANGES[kind]
    return round(v, 2 if kind == "body_fat_pct" else 1) if lo <= v <= hi else None


def parse_payload(payload: dict) -> tuple[dict, list[str]]:
    """Return ({measured_at: row}, warnings) from the Shortcut's payload."""
    rows: dict[str, dict] = {}
    warnings = []
    for key, field in KINDS.items():
        block = payload.get(key) or ""
        if not isinstance(block, str):
            warnings.append(f"{key}: not text, skipped")
            continue
        for n, line in enumerate(block.splitlines(), 1):
            if not line.strip():
                continue
            parts = line.split(";")
            when = parse_when(parts[0])
            value = parse_value(parts[1]) if len(parts) > 1 else None
            unit = parts[2] if len(parts) > 2 else ""
            source = parts[3].strip()[:60] if len(parts) > 3 else ""
            if when is None or value is None:
                warnings.append(f"{key} line {n}: unreadable, skipped")
                continue
            v = to_field(field, value, unit)
            if v is None:
                warnings.append(f"{key} line {n}: {value} {unit.strip()} out of range, skipped")
                continue
            local = when.astimezone(LOCAL_TZ).replace(second=0, microsecond=0)
            k = local.isoformat()
            row = rows.setdefault(k, {"measured_at": k, "date": local.date().isoformat()})
            row[field] = v
            if source and not row.get("source"):
                row["source"] = source
    return rows, warnings


def read_rows() -> dict[str, dict]:
    if not CSV_PATH.exists():
        return {}
    with CSV_PATH.open(newline="") as f:
        return {r["measured_at"]: r for r in csv.DictReader(f)}


def write_rows(rows: dict[str, dict]) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        for k in sorted(rows):
            w.writerow({x: rows[k].get(x, "") for x in FIELDS})


def merge(existing: dict, new: dict, received: str) -> list[str]:
    """Merge new weigh-ins into existing; return the dates whose data changed."""
    touched = set()
    for k, row in new.items():
        old = existing.get(k, {})
        merged = {**old, **{f: row[f] for f in row if row[f] not in (None, "")}}
        if row.get("lean_lb") not in (None, ""):
            merged["lean_basis"] = "measured"
        if any(str(merged.get(f, "")) != str(old.get(f, "")) for f in ("weight_lb", "body_fat_pct", "lean_lb")):
            merged["received_utc"] = received
            existing[k] = merged
            touched.add(merged["date"])
    return sorted(touched)


def derive_lean(rows: dict[str, dict]) -> list[str]:
    """Lean mass = weight x (1 - body fat) where a weigh-in has both but no measured lean
    (Hume writes weight and body fat to Apple Health, not lean mass). A measured value
    always wins; a weigh-in without body fat stays blank. Returns the dates changed."""
    touched = set()
    for r in rows.values():
        if r.get("lean_lb") not in (None, "") and r.get("lean_basis") != "calculated":
            r["lean_basis"] = "measured"
            continue
        try:
            w, f = float(r.get("weight_lb")), float(r.get("body_fat_pct"))
        except (TypeError, ValueError):
            continue
        lean = round(w * (1 - f / 100), 1)
        if str(r.get("lean_lb", "")) != str(lean) or r.get("lean_basis") != "calculated":
            r["lean_lb"], r["lean_basis"] = lean, "calculated"
            touched.add(r["date"])
    return sorted(touched)


_cache: dict | None = None


def first_of_day(rows: dict[str, dict] | None = None) -> dict[str, dict]:
    """The day's first weigh-in with a weight (morning, before food), by date."""
    global _cache
    if rows is None:
        if _cache is None:
            _cache = first_of_day(read_rows())
        return _cache
    out: dict[str, dict] = {}
    for k in sorted(rows):
        r = rows[k]
        if r.get("weight_lb") not in (None, "") and r["date"] not in out:
            out[r["date"]] = r
    return out


def apply(row: dict, scale: dict | None = None) -> dict:
    """Fill a summary.csv row from the day's scale weigh-in; the scale wins over Garmin."""
    if scale is None:
        scale = first_of_day().get(row["date"])
    if scale:
        lb = float(scale["weight_lb"])
        row["weight_lb"] = round(lb, 1)
        row["weight_kg"] = round(lb * KG_PER_LB, 2)
        row["body_fat_pct"] = scale.get("body_fat_pct") or None
        row["lean_lb"] = scale.get("lean_lb") or None
        row["weight_source"] = "scale"
    elif row.get("weight_lb") not in (None, ""):
        row["weight_source"] = "garmin"
    return row


def refresh_summary(dates: list[str], fields: list[str]) -> None:
    """Re-apply the scale to summary.csv rows for these dates (adds a bare row if none yet)."""
    path = ROOT / "data" / "summary.csv"
    existing = {}
    if path.exists():
        with path.open(newline="") as f:
            existing = {r["date"]: r for r in csv.DictReader(f)}
    scale = first_of_day(read_rows())
    for day in dates:
        row = existing.get(day) or {"date": day, "missing": "sleep_h;sleep_score;hrv_overnight_ms;resting_hr;body_battery_high"}
        existing[day] = apply(dict(row), scale.get(day))
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for k in sorted(existing):
            w.writerow({x: ("" if existing[k].get(x) is None else existing[k].get(x, "")) for x in fields})


def main() -> int:
    raw = os.environ.get("BODY_COMP_PAYLOAD", "")
    try:
        payload = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        print("payload is not JSON", file=sys.stderr)
        return 1
    if not isinstance(payload, dict):
        print("payload is not an object", file=sys.stderr)
        return 1
    new, warnings = parse_payload(payload)
    for w in warnings:
        print("warning:", w)
    received = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = read_rows()
    touched = sorted(set(merge(rows, new, received)) | set(derive_lean(rows)))
    if touched:
        write_rows(rows)
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import pull_garmin  # noqa: E402  (imported late: only its field list is needed)
        refresh_summary(touched, pull_garmin.SUMMARY_FIELDS)
    print(f"samples parsed into {len(new)} weigh-ins; dates changed: {', '.join(touched) or 'none'}")
    return 0 if new or not any(payload.get(k) for k in KINDS) else 1


if __name__ == "__main__":
    sys.exit(main())
