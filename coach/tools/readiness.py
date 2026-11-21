#!/usr/bin/env python3
"""One weighted readiness score from raw watch values and the morning survey (RULES 5, Readiness score).

the athlete, Nov 21, 2026 (rules audit): "remove the Garmin black box scores and just use the raw metrics that you pull from the
watch, so that would work for any watch ... a weighted value that combines the pooled metrics and surveys"; "it should
be clear for a user to identify what the weights of each area are"; "I still like the idea of using standard deviation
and the bell curve"; then, after the history check, "use all the research-backed evidence here".

Each input is a z score (standard deviations) against the person's own history, clipped to +-`readiness_clip_sd`:
  survey   this morning's mean of sleep, energy, legs and 6 minus stress against the last `feel_reference_days`
           mornings, spread never under `feel_departure_points` (morning_facts.section_feel today_feel_sd)   IR-15
  hrv      7 day mean of ln(overnight HRV) against the last 60 days (AIS guide)                                IR-44
  rhr      7 day mean of resting HR against the last 60 days, sign flipped (lower is better)                   IR-44
  sleep    3 night mean of sleep hours against the 28 nights before                                            IR-10
  load     yesterday's Banister TRIMP (time and average HR) against the 60 days before, sign flipped           IR-46
The score is the weighted mean of the inputs that are in (a missing input's weight is shared out). Levels: Primed above
`readiness_primed_above`, Ease off below `readiness_ease_off_below`, Stressed below `readiness_stressed_below`, else
Ready. Survey caps: pain at stop is Stressed; pain at hurts or energy or legs at `feel_fallback_at_or_below` is at most
Ease off; any pain is never Primed. Standard library only; the same arithmetic as coach/dashboard/ready.js scoreOf."""
import math
import statistics
from datetime import date, timedelta

INPUTS = ("survey", "hrv", "rhr", "sleep", "load")
NAMES = {"survey": "Survey", "hrv": "HRV", "rhr": "Resting HR", "sleep": "Total sleep", "load": "Yesterday's load"}


def _num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) else x


def weights(th):
    return {k: float(th[f"readiness_weight_{k}"]) for k in INPUTS}


def trimp_by_day(acts, rest_by_day, hr_max, sex=None):
    """Banister TRIMP per local day: minutes x HRr x a x e^(b x HRr), HRr = (avg - rest) / (max - rest);
    a, b = 0.64, 1.92 for men and 0.86, 1.67 for women (Morton, Fitz-Clarke and Banister 1990, IR-46)."""
    a, b = (0.86, 1.67) if str(sex or "").lower().startswith("f") else (0.64, 1.92)
    rests = [v for v in rest_by_day.values() if v]
    rest0 = statistics.median(rests) if rests else 60.0
    out = {}
    for act in acts:
        day = (act.get("local_start") or "")[:10]
        m, hr = _num(act.get("duration_min")), _num(act.get("avg_hr"))
        if not day or not m or not hr:
            continue
        rest = rest_by_day.get(day) or rest0
        if hr_max <= rest:
            continue
        x = max(0.0, (hr - rest) / (hr_max - rest))
        out[day] = out.get(day, 0.0) + m * x * a * math.exp(b * x)
    return out


def _z(cur, base, floor=None):
    if cur is None or len(base) < 2:
        return None
    sd = statistics.pstdev(base)
    if floor:
        sd = max(sd, floor)
    if not sd:
        return None
    return (cur - statistics.fmean(base)) / sd


def watch_inputs(summary, acts, prof, th, night):
    """The watch side of the score for the night dated `night` (ISO date): hrv, rhr, sleep and load z scores, each None
    when there is not enough history. `summary` is data/summary.csv as dict rows."""
    nd = date.fromisoformat(night)
    by = {r["date"]: r for r in summary}

    def series(col, days, tf=lambda v: v):
        out = []
        for k in range(days, -1, -1):
            day = (nd - timedelta(days=k)).isoformat()
            v = _num((by.get(day) or {}).get(col))
            if v:
                out.append((day, tf(v)))
        return out

    out = {}
    hb, avg = int(th["readiness_hrv_baseline_days"]), int(th["readiness_hrv_avg_days"])
    first7 = (nd - timedelta(days=avg - 1)).isoformat()
    for key, col, tf, sign, floor in (("hrv", "hrv_overnight_ms", math.log, 1, None), ("rhr", "resting_hr", float, -1, 1.0)):
        s = series(col, hb, tf)
        base = [v for _, v in s]
        w = [v for d_, v in s if d_ >= first7]
        if len(base) >= 20 and len(w) >= 3:
            z = _z(statistics.fmean(w), base, floor)
            out[key] = None if z is None else sign * z
    sb, sa = int(th["readiness_sleep_baseline_nights"]), int(th["readiness_sleep_avg_nights"])
    recent = [v for v in (_num((by.get((nd - timedelta(days=k)).isoformat()) or {}).get("sleep_h")) for k in range(sa)) if v]
    base = [v for v in (_num((by.get((nd - timedelta(days=k)).isoformat()) or {}).get("sleep_h")) for k in range(sa, sb + 1)) if v]
    if recent and len(base) >= 14:
        out["sleep"] = _z(statistics.fmean(recent), base)
    hrm = prof.get("hr_max") or {}
    hr_max = _num(hrm.get("run")) or _num(hrm.get("default")) or 190.0
    rest = {r["date"]: _num(r.get("resting_hr")) for r in summary}
    tr = trimp_by_day(acts, rest, hr_max, prof.get("sex"))
    if tr:
        y = nd - timedelta(days=1)
        lb = int(th["readiness_load_baseline_days"])
        hist = [tr.get((y - timedelta(days=k)).isoformat(), 0.0) for k in range(1, lb + 1)]
        z = _z(tr.get(y.isoformat(), 0.0), hist)
        out["load"] = None if z is None else -z
    return {k: (None if v is None else round(v, 2)) for k, v in out.items()}


def score(inputs, th):
    """The weighted mean of the clipped inputs that are in; shares are weight x z over the weights in (what each input
    added to the score). Returns None when nothing is in."""
    w, clip = weights(th), float(th["readiness_clip_sd"])
    have = {k: max(-clip, min(clip, v)) for k, v in inputs.items() if k in w and v is not None}
    tw = sum(w[k] for k in have)
    if not tw:
        return None
    rows = [{"input": k, "name": NAMES[k], "weight": w[k], "used_weight": round(w[k] / tw, 3), "z": round(have.get(k), 2) if k in have else None,
             "share": round(w[k] / tw * have[k], 2) if k in have else None} for k in INPUTS]
    s = sum(w[k] * v for k, v in have.items()) / tw
    return {"score": round(s, 2), "inputs": rows, "in": sorted(have), "weight_in": round(tw, 2)}


def level(s, th, feel_today=None, pain=None):
    """Level from the score with the survey caps (RULES 5). Returns (level, why)."""
    pain = pain or {}
    t = feel_today or {}
    p = t.get("pain") or 0
    fb = th["feel_fallback_at_or_below"]
    low = [k for k in ("energy", "legs") if t.get(k) is not None and t[k] <= fb]
    if t and p >= pain.get("stop", 6):
        return "stressed", "pain at stop"
    if s is None:
        return None, "no survey and no watch night yet"
    sig = f"score {s:+.2f} σ"
    lv = ("primed" if s > th["readiness_primed_above"] else "stressed" if s < th["readiness_stressed_below"]
          else "ease_off" if s < th["readiness_ease_off_below"] else "ready")
    why = sig
    if t and (p >= pain.get("hurts", 3) or low) and lv in ("primed", "ready"):
        lv, why = "ease_off", f"{sig}; capped at Ease off: " + ("pain at hurts" if p >= pain.get("hurts", 3) else " and ".join(low) + " at 2 or below")
    elif t and p > 0 and lv == "primed":
        lv, why = "ready", f"{sig}; any pain holds Primed back"
    return lv, why
