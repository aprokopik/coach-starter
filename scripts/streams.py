#!/usr/bin/env python3
"""Second-by-second detail for hilly runs and hikes (the athlete, Nov 8, 2026: track technical descents and trail pace on grades).

Garmin's activity "details" endpoint (garminconnect get_activity_details) returns the recording as samples. For each
hilly run or hike this keeps a compact stream, one row about every 5 s:

  data/streams/<activityId>.csv.gz   t_s, dist_m, elev_m, hr, cad, lat, lon   (gzip, deterministic bytes)

Rules:
  - only runs and hikes with 60 ft of climb per mile or more (trail); road runs and rides are skipped;
  - written once: an existing stream is never re-pulled or rewritten;
  - privacy: latitude and longitude are blanked for the first and last 200 m, so the start and finish (often home)
    are never stored; elevation, heart rate and distance stay;
  - a failed call is recorded in the run status and never stops the pull.
"""
from __future__ import annotations

import csv
import gzip
import io
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STREAMS = ROOT / "data" / "streams"
FIELDS = ["t_s", "dist_m", "elev_m", "hr", "cad", "lat", "lon"]
HILLY_M_PER_M = 60 * 0.3048 / 1609.344  # 60 ft per mile
STEP_S = 5
PRIVACY_M = 200
TYPES = ("run", "hik")  # running, trail_running, treadmill excluded below; hiking


def is_hilly(summary: dict) -> bool:
    t = str(((summary or {}).get("activityType") or {}).get("typeKey") or "").lower()
    if not any(k in t for k in TYPES) or "treadmill" in t or "virtual" in t or "indoor" in t:
        return False
    dist, gain = summary.get("distance"), summary.get("elevationGain")
    if not isinstance(dist, (int, float)) or not isinstance(gain, (int, float)) or dist < 1000:
        return False
    return gain / dist >= HILLY_M_PER_M


def path_for(aid) -> Path:
    return STREAMS / f"{aid}.csv.gz"


# Garmin metric keys, first match wins
KEYS = {
    "t": ("sumElapsedDuration", "sumDuration", "directTimestamp"),
    "dist": ("sumDistance",),
    "elev": ("directElevation", "directCorrectedElevation"),
    "hr": ("directHeartRate",),
    "cad": ("directRunCadence", "directDoubleCadence", "directFractionalCadence"),
    "lat": ("directLatitude",),
    "lon": ("directLongitude",),
}


def compact(details: dict) -> list[dict]:
    """Garmin details -> rows of FIELDS, privacy-trimmed. Empty list when the response has no usable samples."""
    desc = {d.get("key"): d.get("metricsIndex") for d in (details or {}).get("metricDescriptors") or []}
    idx = {k: next((desc[c] for c in cands if c in desc), None) for k, cands in KEYS.items()}
    tkey = next((c for c in KEYS["t"] if c in desc), None)
    per_s = 1000 if tkey == "directTimestamp" else 1  # epoch milliseconds vs seconds
    if idx["t"] is None or idx["dist"] is None or idx["elev"] is None:
        return []
    rows, t0 = [], None
    for s in (details.get("activityDetailMetrics") or []):
        m = s.get("metrics") or []
        get = lambda k: m[idx[k]] if idx[k] is not None and idx[k] < len(m) else None
        t, dist, elev = get("t"), get("dist"), get("elev")
        if t is None or dist is None or elev is None:
            continue
        if t0 is None:
            t0 = t
        ts = (t - t0) / per_s
        rows.append({"t_s": ts, "dist_m": dist, "elev_m": elev, "hr": get("hr"), "cad": get("cad"), "lat": get("lat"), "lon": get("lon")})
    if not rows:
        return []
    rows.sort(key=lambda r: r["t_s"])
    out, last_t = [], None  # thin to about one row per STEP_S
    for r in rows:
        if last_t is None or r["t_s"] - last_t >= STEP_S - 0.5:
            out.append(r)
            last_t = r["t_s"]
    if out[-1] is not rows[-1]:
        out.append(rows[-1])
    total = out[-1]["dist_m"]
    for r in out:
        if r["dist_m"] < PRIVACY_M or r["dist_m"] > total - PRIVACY_M:
            r["lat"] = r["lon"] = None
    return out


def _fmt(v, nd):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    return f"{v:.{nd}f}" if nd else str(int(round(v)))


def to_bytes(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(FIELDS)
    for r in rows:
        w.writerow([_fmt(r["t_s"], 0), _fmt(r["dist_m"], 1), _fmt(r["elev_m"], 1), _fmt(r["hr"], 0), _fmt(r["cad"], 0), _fmt(r["lat"], 5), _fmt(r["lon"], 5)])
    raw = io.BytesIO()
    with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, filename="") as gz:  # same input, same bytes
        gz.write(buf.getvalue().encode())
    return raw.getvalue()


def read(path: Path) -> list[dict]:
    with gzip.open(path, "rt") as fh:
        return [{k: (float(v) if v != "" else None) for k, v in r.items()} for r in csv.DictReader(fh)]


def pull(g, call, summary: dict) -> str:
    """Fetch and store the stream for one activity when it is hilly and not stored yet. Returns a status word."""
    aid = summary.get("activityId")
    if aid is None or not is_hilly(summary):
        return "skipped"
    p = path_for(aid)
    if p.exists():
        return "kept"
    dur = summary.get("elapsedDuration") or summary.get("duration") or 3600
    points = int(min(20000, max(500, dur / STEP_S + 50)))  # about one sample per 5 s
    state, value, err = call(g, "get_activity_details", str(aid), points, 0)  # 0: no map polyline
    if state != "ok":
        return state if err is None else f"{state}: {err}"
    rows = compact(value)
    if len(rows) < 10:
        return "empty"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(to_bytes(rows))
    return "ok"
