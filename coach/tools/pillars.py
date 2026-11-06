"""Health Pillars (Health tab, the athlete Nov 1, 2026): values, status, focus, wins and streaks for the 7 pillars.

Called by build_dashboard.py after markers.build(). Definitions (names, what/why, targets, basis, evidence) live in
coach/pillars.json; this file only computes. Returns rows:
  kind "pillar":  id, order, name, what, lead (metric id shown as the headline), status, improving, unknown_n
  kind "pmetric": the definition plus value, sub, status, num, improving, hist (dated history text), pop_text
  kind "pbar":    weekly bars for count metrics: key, week (Monday), value, target
  kind "pfocus":  up to 3 items: order, status, text, metric
  kind "pwin":    up to 3 wins: order, metric, text, icon (up, star)
  kind "pstreak": weekly habit streaks: key, label, current, best, target
  kind "psum":    tally and map line: good, watch, act, unknown, le8 text, badge
Status: good, watch, act, unknown. Labels on each metric: Measured, Calculated, Estimated, Reported.
"""
import csv
import json
import os
import statistics
from datetime import date, timedelta

from markers import HEIGHT_IN, FRIEND_M30, percentile_vo2

DEFS = "coach/pillars.json"
RANK = {"act": 3, "watch": 2, "unknown": 1, "good": 0}
ALC_LABEL = {0: "0", 2: "1–3", 5.5: "4–7", 11: "8–14", 18: "15+"}


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _d(s):
    return date.fromisoformat(str(s)[:10])


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    xs = [x for x in xs if x is not None]
    return statistics.stdev(xs) if len(xs) > 1 else None


def _mon(d):
    return d - timedelta(days=d.weekday())


def _read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline="") as fh:
        return list(csv.DictReader(fh))


def _json(path, default):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return default



def _r(v):
    """Round half up for display (Python's round() and format() round half to even)."""
    return int(v + 0.5) if v >= 0 else -int(-v + 0.5)


def bp_readings(health):
    """Blood pressure readings from health.json lab rows, oldest first.

    bp_sys and bp_dia rows pair on (date, time); time ("HH:MM" local) and part ("morning" or
    "evening") are optional, so older single-reading rows and survey rows still pair by date.
    """
    dia = {}
    for r in health:
        if r.get("kind") == "lab" and r.get("key") == "bp_dia" and _f(r.get("value")) is not None:
            dia[(r["date"], r.get("time") or "")] = _f(r["value"])
    out = []
    for r in health:
        if r.get("kind") == "lab" and r.get("key") == "bp_sys" and _f(r.get("value")) is not None:
            k = (r["date"], r.get("time") or "")
            if k in dia:
                out.append({"date": _d(r["date"]), "time": r.get("time") or "", "part": r.get("part") or "",
                            "sys": _f(r["value"]), "dia": dia[k], "note": r.get("note") or ""})
    return sorted(out, key=lambda x: (x["date"], x["time"]))


def bp_window(readings, days=7):
    """The readings within `days` of the newest one: the home BP average (AHA practice)."""
    last = readings[-1]["date"]
    return [r for r in readings if (last - r["date"]).days < days]

def band(v, cuts, lower_better=False):
    """cuts = (good_edge, act_edge): higher is better unless lower_better."""
    if v is None:
        return "unknown"
    g, a = cuts
    if lower_better:
        return "good" if v < g else "act" if v >= a else "watch"
    return "good" if v >= g else "act" if v < a else "watch"


def pillar_status(metrics, lead_id):
    big = [m for m in metrics if m["w"] >= 5]
    if any(m["status"] == "act" for m in big):
        return "act"
    if any(m["status"] == "watch" for m in big):
        return "watch"
    lead = next(m for m in metrics if m["id"] == lead_id)
    tot = sum(m["w"] for m in metrics)
    known = sum(m["w"] for m in metrics if m["status"] != "unknown")
    if lead["status"] == "unknown" and known < tot / 2:
        return "unknown"
    return "good"


def lead_of(metrics, lead_id):
    lead = next(m for m in metrics if m["id"] == lead_id)
    over = sorted([m for m in metrics if m["status"] == "act" and m["w"] > lead["w"]], key=lambda m: -m["w"])
    if over:
        return over[0]
    if lead["status"] == "unknown":
        tot = sum(m["w"] for m in metrics)
        known = sum(m["w"] for m in metrics if m["status"] != "unknown")
        alt = sorted([m for m in metrics if m["status"] != "unknown" and m["w"] >= 5], key=lambda m: -m["w"])
        if alt and known >= tot / 2:
            return alt[0]
    return lead


def improving(series, lower_better, min_step, today):
    """series: [(date, value)], weekly or denser. Good-direction change over ~12 weeks beyond half the SD and min_step."""
    pts = sorted((d, v) for d, v in series if v is not None)
    if len(pts) < 6:
        return None
    now_d, now_v = pts[-1]
    if (today - now_d).days > 14:
        return None
    old = [p for p in pts if p[0] <= now_d - timedelta(days=77)]
    if not old:
        return None
    then_d, then_v = old[-1]
    if (now_d - then_d).days > 120:
        return None
    win = [v for d, v in pts if d >= then_d]
    sd = _sd(win) or 0
    delta = (then_v - now_v) if lower_better else (now_v - then_v)
    if delta > max(0.5 * sd, min_step or 0):
        return {"from": then_v, "to": now_v, "weeks": round((now_d - then_d).days / 7)}
    return None


def latest_checkin(ci, qid, survey=None):
    """Most recent answer for qid: (period, value, survey)."""
    xs = [r for r in ci if r["qid"] == qid and (survey is None or r["survey"] == survey) and r.get("value") not in (None, "")]
    if not xs:
        return None
    r = max(xs, key=lambda r: (r["period"], r.get("saved_at") or ""))
    return r["period"], r["value"], r["survey"]


def period_end(survey, period):
    """Last day of a check-in period (for staleness)."""
    try:
        if survey == "weekly":
            return _d(period) + timedelta(days=6)
        if survey == "monthly":
            y, m = map(int, period.split("-"))
            return date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
        if survey == "quarterly":
            y, q = period.split("-Q")
            m = int(q) * 3
            y = int(y)
            return date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)
        if survey == "half":
            y, h = period.split("-H")
            return date(int(y), 6, 30) if h == "1" else date(int(y), 12, 31)
        if survey == "yearly":
            return date(int(period), 12, 31)
    except ValueError:
        pass
    return None


def answer_date(r_period, survey, saved_at=None):
    if saved_at:
        try:
            return _d(saved_at)
        except ValueError:
            pass
    pe = period_end(survey, r_period)
    return pe


def build(today, rows, root="."):
    defs = _json(os.path.join(root, DEFS), None)
    if not defs:
        return []
    T = today
    mk = {r["key"]: r for r in rows if r.get("kind") == "marker"}
    mpt = {}
    for r in rows:
        if r.get("kind") == "mpt":
            v = _f(r.get("value"))
            if v is not None:
                mpt.setdefault(r["key"], []).append((_d(r["date"]), v))
    summ = _read_csv(os.path.join(root, "data/summary.csv"))
    health = _json(os.path.join(root, "coach/health.json"), {"rows": []}).get("rows", [])
    ci = _read_csv(os.path.join(root, "coach/checkins.csv"))
    feel = _read_csv(os.path.join(root, "coach/feel_daily.csv"))
    facts = _json(os.path.join(root, "coach/facts.json"), {})
    out = []
    M = {}

    def put(mid, value, sub, status, num=None, hist=None, extra=None):
        M[mid] = {"value": value, "sub": sub, "status": status, "num": num, "hist": hist or []}
        if extra:
            M[mid].update(extra)

    def srow(k, days, off=0):
        return [_f(r.get(k)) for r in summ if r.get(k) not in (None, "") and T - timedelta(days=days + off) < _d(r["date"]) <= T - timedelta(days=off)]

    def lab(key):
        xs = [r for r in health if r.get("kind") == "lab" and r.get("key") == key and _f(r.get("value")) is not None]
        return max(xs, key=lambda r: r["date"]) if xs else None

    def fresh(d, days):
        return d is not None and (days is None or (T - d).days <= days)

    # ---------------- Heart & fitness ----------------
    vo2 = sorted(mpt.get("vo2", []))
    if vo2:
        v = vo2[-1][1]
        pc = percentile_vo2(v)
        pc = pc if isinstance(pc, int) else None
        nb = next(((p, b) for p, b in FRIEND_M30 if b > v), None)
        put("vo2", f"{v:.1f}", f"{pc}th percentile" if pc else "under the 10th percentile", band(v, (43.4, 37.0)), v,
            extra={"pop_text": (f"Better than about {pc}% of men 30–39 (FRIEND 2022 lab norms)." if pc else "Under the 10th percentile for men 30–39 (FRIEND 2022).")
                   + (f" The {nb[0]}th percentile is {nb[1]}." if nb else "")})
    else:
        put("vo2", "—", "no estimate yet", "unknown")
    wk_act = []
    for i in range(15, -1, -1):
        ws = _mon(T) - timedelta(weeks=i)
        xs = [r for r in summ if ws <= _d(r["date"]) < ws + timedelta(days=7)]
        if xs:
            wk_act.append((ws, sum((_f(r.get("intensity_min_moderate")) or 0) + 2 * (_f(r.get("intensity_min_vigorous")) or 0) for r in xs)))
    for ws, v in wk_act:
        out.append({"kind": "pbar", "key": "act", "week": ws.isoformat(), "value": round(v), "target": 150})
    l28 = [r for r in summ if T - timedelta(days=28) < _d(r["date"]) <= T]
    if l28:
        pa = sum((_f(r.get("intensity_min_moderate")) or 0) + 2 * (_f(r.get("intensity_min_vigorous")) or 0) for r in l28) / 4
        put("act", f"{pa:.0f}", "min/week", band(pa, (150, 75)), pa)
    else:
        put("act", "—", "no watch data", "unknown")
    rr = srow("resting_hr", 28)
    if len(rr) >= 14:
        m, sd = _mean(rr), _sd(rr)
        then = srow("resting_hr", 28, 90)
        put("rhr", f"{m:.0f}", "bpm", band(m, (55, 80), True), m,
            extra={"spread": f"±{sd:.1f} bpm", "delta": (f"{m - _mean(then):+.1f} bpm vs 3 months ago" if len(then) >= 14 else "")})
    else:
        put("rhr", "—", "needs 14 nights", "unknown")

    # ---------------- Checkups & labs ----------------
    bpr = bp_readings(health)
    if bpr and fresh(bpr[-1]["date"], 365):
        win = bp_window(bpr)
        sv, dv = _mean([r["sys"] for r in win]), _mean([r["dia"] for r in win])
        st = "good" if sv < 120 and dv < 80 else "watch" if sv < 130 and dv < 80 else "act"
        if len(win) > 1:
            sub = f"home average, {len(win)} readings"
            parts = []
            for part in ("morning", "evening"):
                pw = [r for r in win if r["part"] == part]
                if pw:
                    parts.append(f"{part} {_r(_mean([r['sys'] for r in pw]))}/{_r(_mean([r['dia'] for r in pw]))}")
            if len(parts) == 2:
                sub += " · " + ", ".join(parts)
        else:
            note = win[0]["note"]
            n1 = "single" in note or "reading" in note and "average" not in note
            sub = "1 reading" if n1 else ("home average" if "home" in note else "reported")
        put("bp", f"{_r(sv)}/{_r(dv)}", sub, st, sv,
            hist=[f"{r['date'].strftime('%b %-d, %Y')}{' ' + r['time'] if r['time'] else ''}{' ' + r['part'] if r['part'] else ''}  {_r(r['sys'])}/{_r(r['dia'])}  {r['note']}".rstrip()
                  for r in reversed(bpr[-8:])])
    else:
        put("bp", "—", "not measured" if not bpr else "over a year old", "unknown")

    def ci_num(qid, days):
        x = latest_checkin(ci, qid)
        if not x:
            return None, None
        per, val, sv_ = x
        when = period_end(sv_, per)
        saved = next((r.get("saved_at") for r in ci if r["qid"] == qid and r["period"] == per and r["survey"] == sv_), None)
        when = answer_date(per, sv_, saved) or when
        if days is not None and when and (T - when).days > days:
            return None, when
        return _f(val), when

    apob, a_when = ci_num("apob", 365)
    ldl, l_when = ci_num("ldl", 365)
    if apob is not None:
        put("apob", f"{apob:.0f}", f"mg/dL ApoB · {a_when.strftime('%b %Y')}", band(apob, (90, 130), True), apob)
    elif ldl is not None:
        put("apob", f"{ldl:.0f}", f"mg/dL LDL · {l_when.strftime('%b %Y')}", band(ldl, (100, 160), True), ldl)
    else:
        put("apob", "—", "not tested", "unknown")
    lmg, _ = ci_num("lpa_mg", None)
    lnm, _ = ci_num("lpa_nmol", None)
    if lmg is not None:
        put("lpa", f"{lmg:.0f}", "mg/dL", band(lmg, (30, 50), True), lmg)
    elif lnm is not None:
        put("lpa", f"{lnm:.0f}", "nmol/L", band(lnm, (75, 125), True), lnm)
    else:
        put("lpa", "—", "not tested", "unknown")
    a1c, c_when = ci_num("a1c", 365)
    put("a1c", *((f"{a1c:.1f}", f"% · {c_when.strftime('%b %Y')}", band(a1c, (5.7, 6.5), True), a1c) if a1c is not None else ("—", "not tested", "unknown")))
    visits = [r for r in health if r.get("kind") == "visit"]
    lv = max(visits, key=lambda r: r["date"]) if visits else None
    phys = latest_checkin(ci, "physical", "yearly")
    if lv and fresh(_d(lv["date"]), 365 * 3):
        age = (T - _d(lv["date"])).days
        put("checkup", _d(lv["date"]).strftime("%b %Y"), "last physical", "good" if age <= 365 else "watch" if age <= 730 else "act", age)
    elif phys and phys[1] == "within12":
        put("checkup", "Done", "within 12 months", "good")
    elif phys and phys[1] == "1to2":
        put("checkup", "1–2 yrs", "since the last one", "watch")
    else:
        ps = max([r for r in health if r.get("kind") == "physical_status"], key=lambda r: r["date"], default=None)
        pv = (phys[1] if phys else None) or (ps.get("value") if ps else None)
        if pv in ("over2", "over3", "never"):
            put("checkup", "Overdue", "never" if pv == "never" else "last one over 2 years ago", "act")
        else:
            put("checkup", "—", "not answered", "unknown")
    egfr, e_when = ci_num("egfr", 365)
    alt, _ = ci_num("alt", 365)
    if egfr is not None or alt is not None:
        st_k = max([band(egfr, (90, 60)) if egfr is not None else "good", ("good" if alt <= 40 else "watch") if alt is not None else "good"], key=lambda s_: RANK[s_])
        put("kidney", " · ".join(x for x in [f"eGFR {egfr:.0f}" if egfr is not None else "", f"ALT {alt:.0f}" if alt is not None else ""] if x), e_when.strftime("%b %Y") if e_when else "", st_k)
    else:
        put("kidney", "—", "not tested", "unknown")

    # ---------------- Habits ----------------
    nic = latest_checkin(ci, "nicotine")
    hn = max([r for r in health if r.get("kind") == "habit" and r.get("key") == "nicotine"], key=lambda r: r["date"], default=None)
    nv = (nic[1] if nic else None) or (hn.get("value") if hn else None)
    put("nic", *({"never": ("Never", "", "good"), "former": ("Quit", "", "good"), "current": ("Current", "", "act")}.get(nv, ("—", "not answered", "unknown"))))
    alc = sorted([(r["period"], _f(r["value"])) for r in ci if r["qid"] == "alcohol" and r["survey"] == "weekly" and _f(r["value"]) is not None])
    for p, v in alc[-16:]:
        out.append({"kind": "pbar", "key": "alcohol", "week": p, "value": v, "target": 7, "label": ALC_LABEL.get(v, f"{v:g}")})
    recent = [v for p, v in alc if (T - _d(p)).days <= 35][-4:]
    if recent:
        a = _mean(recent)
        put("alcohol", f"{a:.1f}" if a % 1 else f"{a:.0f}", f"drinks/week · last {len(recent)} wk", band(a, (7, 14.0001), True), a)
    else:
        mo = latest_checkin(ci, "alcohol", "monthly")
        if mo and (T - period_end("monthly", mo[0])).days <= 45:
            a = _f(mo[1])
            put("alcohol", f"{a:g}", "drinks/week · monthly", band(a, (7, 14.0001), True), a)
        else:
            put("alcohol", "—", "not answered", "unknown")
    md, m_when = ci_num("medas_score", 120)
    put("diet", *((f"{md:.0f}", "of 13", band(md, (8, 6)), md) if md is not None else ("—", "not answered", "unknown")))
    sauna = sorted(mpt.get("sauna", []))
    sx = {r["period"]: _f(r["value"]) or 0 for r in ci if r["qid"] == "sauna_extra" and r["survey"] == "weekly"}
    sweeks = [(d0, v + sx.get(d0.isoformat(), 0)) for d0, v in sauna][-16:]
    for d0, v in sweeks:
        out.append({"kind": "pbar", "key": "sauna", "week": d0.isoformat(), "value": v, "target": ""})
    s13 = [v for d0, v in sweeks if T - timedelta(days=91) < d0 + timedelta(days=6) and d0 <= T]
    put("sauna", f"{sum(s13) / 13:.1f}" if s13 else "0.0", "per week · 90 days", "good")

    # ---------------- Strength & mobility ----------------
    strw = sorted(mpt.get("strength", []))
    xx = {r["period"]: _f(r["value"]) or 0 for r in ci if r["qid"] == "str_extra" and r["survey"] == "weekly"}
    strw = [(d0, v + xx.get(d0.isoformat(), 0)) for d0, v in strw]
    for d0, v in strw[-16:]:
        out.append({"kind": "pbar", "key": "strength", "week": d0.isoformat(), "value": v, "target": 2})
    last4 = [v for d0, v in strw if _mon(T) - timedelta(weeks=4) <= d0 < _mon(T)]
    cur = next((v for d0, v in strw if d0 == _mon(T)), 0)
    spw = (sum(last4[-3:]) + cur) / 4 if last4 else None
    put("str", *((f"{spw:.1f}", "days/week", band(spw, (2, 1)), spw) if spw is not None else ("—", "no data", "unknown")))
    st_rows = [r for r in health if r.get("kind") == "selftest"]
    done = {}
    for r in st_rows:
        if fresh(_d(r["date"]), 100):
            done[r["key"]] = r
    if done:
        need = 3 if "grip" in done else 2
        put("self", f"{len(done)} of 3", "this quarter", "good" if len(done) >= need else "watch", len(done),
            hist=[f"{_d(r['date']).strftime('%b %-d, %Y')}  {r['key']}  {r.get('text') or r.get('value')}" for r in sorted(st_rows, key=lambda r: r["date"], reverse=True)[:6]])
    else:
        put("self", "0 of 3", "this quarter", "unknown", 0)

    # ---------------- Body composition ----------------
    waist, w_when = ci_num("waist_in", 45)
    if waist:
        r_ = waist / HEIGHT_IN
        put("whtr", f"{r_:.2f}", f"waist {waist:g} in", band(r_, (0.5, 0.6), True), r_,
            hist=[f"{p}  {float(v):g} in  ({float(v) / HEIGHT_IN:.2f})" for p, v in sorted([(r["period"], r["value"]) for r in ci if r["qid"] == "waist_in"], reverse=True)[:6]])
    else:
        put("whtr", "—", "not measured" if not w_when else "measure again", "unknown")
    bfx = [r for r in summ if _f(r.get("body_fat_pct")) is not None and T - timedelta(days=14) < _d(r["date"]) <= T]
    if len(bfx) >= 4:
        b = _mean([_f(r["body_fat_pct"]) for r in bfx])
        put("bf", f"{b:.1f}%", "14-day average", "good" if 8 <= b <= 20 else "watch" if b <= 25 else "act", b,
            extra={"spread": f"±{_sd([_f(r['body_fat_pct']) for r in bfx]):.1f} points"})
    else:
        put("bf", "—", f"needs 4 weigh-ins in 14 days ({len(bfx)} so far)", "unknown")
    w7 = srow("weight_lb", 7)
    if w7:
        wm = _mean(w7)
        bmi = wm * 703 / HEIGHT_IN ** 2
        put("bmi", f"{bmi:.1f}", "", "good" if 18.5 <= bmi < 25 else "watch" if bmi < 30 else "act", bmi)
        wt = facts.get("weight") or {}
        pp = wt.get("plan_path_today") or {}
        tg = wt.get("target") or {}
        if pp.get("lo") is not None:
            st_w = "good" if pp["lo"] - 0.5 <= wm <= pp["hi"] + 0.5 else "watch"
            put("weight", f"{wm:.1f}", "lb, 7-day", st_w, wm,
                extra={"target_text": f"Plan path today {pp['lo']} to {pp['hi']} lb" + (f"; goal {tg.get('lo')} to {tg.get('hi')} lb by {_d(tg['by']).strftime('%b %-d')}" if tg.get("by") else "")})
        else:
            put("weight", f"{wm:.1f}", "lb, 7-day", "good", wm)
    else:
        put("bmi", "—", "no weigh-ins this week", "unknown")
        put("weight", "—", "no weigh-ins this week", "unknown")
    bc = (facts.get("weight") or {}).get("body_comp") or {}
    base = bc.get("deficit_baseline") or {}
    lean14 = (bc.get("lean_lb_14d") or {}).get("mean")
    ch = base.get("lean_change_now")
    if ch is not None:
        put("lean", f"{lean14:.1f}" if lean14 else "—", f"lb, calculated · {ch:+.1f} vs baseline", "good" if ch > -2 else "watch", lean14)
    elif lean14:
        put("lean", f"{lean14:.1f}", "lb, calculated · baseline building", "good", lean14)
    else:
        put("lean", "—", "baseline building", "unknown")

    # ---------------- Sleep & recovery ----------------
    regs = sorted(mpt.get("sleepreg", []))
    rg = mk.get("sleepreg")
    if rg and _f(str(rg.get("value", "")).replace("±", "")) is not None:
        v = _f(str(rg["value"]).replace("±", ""))
        put("reg", f"±{v:.0f}", "min", band(v, (45.0001, 75.0001), True), v)
    else:
        put("reg", "—", "needs 14 nights", "unknown")
    sl = srow("sleep_h", 28)
    if len(sl) >= 14:
        a = _mean(sl) - 0.5
        put("dur", f"{a:.1f}", "h/night", "good" if 7 <= a < 9.5 else "act" if a < 6 else "watch", a,
            extra={"spread": f"±{_sd(sl):.1f} h"})
    else:
        put("dur", "—", "needs 14 nights", "unknown")
    hv = srow("hrv_overnight_ms", 28)
    if len(hv) >= 14:
        m, sd = _mean(hv), _sd(hv)
        w7_ = srow("hrv_overnight_ms", 7)
        st_h = "good" if not w7_ or _mean(w7_) >= m - sd else "watch"
        put("hrv", f"{m:.0f}", "ms", st_h, m, extra={"spread": f"±{sd:.1f} ms"})
    else:
        put("hrv", "—", "needs 14 nights", "unknown")
    fr = sorted([r for r in feel if r.get("date")], key=lambda r: r["date"])

    def f5(r, k):
        v = _f(r.get(k))
        if v is None:
            return None
        return v if str(r.get("scale")) == "5" else min(5, max(1, round(1 + (v - 1) * 4 / 9)))
    if fr and (T - _d(fr[-1]["date"])).days <= 3:
        e, l_ = f5(fr[-1], "energy"), f5(fr[-1], "legs")
        put("feel", f"{e:.0f} · {l_:.0f}" if e is not None and l_ is not None else "—", f"of 5, {_d(fr[-1]['date']).strftime('%b %-d')}",
            "watch" if (e is not None and e <= 2) or (l_ is not None and l_ <= 2) else "good")
    else:
        put("feel", "—", "no recent check-in", "unknown")

    # ---------------- Mind & connection ----------------
    who = latest_checkin(ci, "who5_1")
    if who and (T - period_end(who[2], who[0])).days <= 45:
        items = [_f(next((r["value"] for r in ci if r["qid"] == f"who5_{i}" and r["period"] == who[0]), None)) for i in range(1, 6)]
        if all(x is not None for x in items):
            tot = sum(items)
            put("who5", f"{tot:.0f}", "of 25", "good" if tot >= 13 else "act" if tot <= 7 else "watch", tot)
        else:
            put("who5", "—", "incomplete", "unknown")
    else:
        put("who5", "—", "not answered", "unknown")
    uc = latest_checkin(ci, "ucla_1")
    if uc and (T - period_end(uc[2], uc[0])).days <= 120:
        items = [_f(next((r["value"] for r in ci if r["qid"] == f"ucla_{i}" and r["period"] == uc[0]), None)) for i in range(1, 4)]
        if all(x is not None for x in items):
            tot = sum(items)
            put("social", f"{tot:.0f}", "of 9", "good" if tot <= 5 else "watch", tot)
        else:
            put("social", "—", "incomplete", "unknown")
    else:
        put("social", "—", "not answered", "unknown")
    st14 = [f5(r, "stress") for r in fr if T - timedelta(days=14) < _d(r["date"]) <= T]
    st14 = [x for x in st14 if x is not None]
    if len(st14) >= 3:
        a = _mean(st14)
        put("stress", f"{a:.1f}", f"of 5 · {len(st14)} days", "good" if a <= 3 else "watch", a)
    else:
        put("stress", "—", "too few answers", "unknown")

    # ---------------- improving, rows ----------------
    series = {"vo2": vo2, "rhr": sorted(mpt.get("rhr", [])), "reg": regs, "str": strw, "act": wk_act}
    metrics = []
    for dfn in defs["metrics"]:
        m = dict(dfn)
        m.update(M.get(dfn["id"], {"value": "—", "sub": "", "status": "unknown", "num": None, "hist": []}))
        if "target_text" in m:
            m["target"] = m.pop("target_text")
        imp = None
        if dfn["id"] in series and m.get("celebrate", True) and m["status"] != "unknown":
            sr = series[dfn["id"]]
            if dfn["id"] in ("str", "act"):  # counts: compare 4-week means
                if len(sr) >= 12:
                    a_ = _mean([v for _, v in sr[-4:]])
                    b_ = _mean([v for _, v in sr[-12:-8]])
                    if a_ is not None and b_ is not None and a_ - b_ >= (0.5 if dfn["id"] == "str" else 30):
                        imp = {"from": round(b_, 1), "to": round(a_, 1), "weeks": 8}
            else:
                imp = improving(sr, dfn.get("lower_better", False), dfn.get("min_step", 0), T)
        m["improving"] = imp
        if not m.get("pop_text"):
            m["pop_text"] = "There's no fair comparison here: differences between devices and people are too large, so this one is judged only against your own trend." if m.get("own_trend") else (m.get("pop") or "")
        m["kind"] = "pmetric"
        metrics.append(m)
    counts = {"good": 0, "watch": 0, "act": 0, "unknown": 0}
    for p in defs["pillars"]:
        ms = [m for m in metrics if m["pillar"] == p["id"]]
        st = pillar_status(ms, p["lead"])
        L = lead_of(ms, p["lead"])
        counts[st] += 1
        out.append({"kind": "pillar", "id": p["id"], "order": p["order"], "name": p["name"], "what": p["what"], "lead": L["id"],
                    "default_lead": p["lead"], "status": st, "improving": any(m["improving"] for m in ms if m["w"] >= 5),
                    "unknown_n": sum(1 for m in ms if m["status"] == "unknown" and m["w"] > 0)})
    out.extend(metrics)

    # Focus: Act items by weight, then the unknowns a check-in can fill
    acts = sorted([m for m in metrics if m["status"] == "act" and m["w"] >= 5], key=lambda m: -m["w"])
    focus = [("act", m.get("next") or f"{m['name']}: {m['value']} {m['sub']}".strip(), m["id"]) for m in acts]
    booked = any(m["id"] == "checkup" and m["status"] == "act" for m in metrics)  # labs wait for the physical
    unk = sorted([m for m in metrics if m["status"] == "unknown" and m["w"] >= 5 and "check-in" in m.get("cad", "").lower()
                  and not (booked and m["pillar"] == "labs")], key=lambda m: -m["w"])
    if len(focus) < 3 and unk:
        names = [m["name"].split(" (")[0].lower() for m in unk[:4]]
        focus.append(("unknown", f"Fill in {len(unk)} unknown{'s' if len(unk) > 1 else ''} on the Check-ins tab: {', '.join(names)}{' and more' if len(unk) > 4 else ''}.", "checkins"))
    for i, (s_, t_, mid) in enumerate(focus[:3]):
        out.append({"kind": "pfocus", "order": i + 1, "status": s_, "text": t_, "metric": mid})

    # Wins: improving metrics and percentile crossings, never body composition
    wins = []
    for m in sorted(metrics, key=lambda m: -m["w"]):
        if m["improving"] and m.get("celebrate", True):
            im = m["improving"]
            u = m.get("unit") or ""
            whole = abs(im["to"]) >= 100 or (float(im["to"]).is_integer() and float(im["from"]).is_integer())
            fmt = (lambda x: f"{x:.0f}") if whole else (lambda x: f"{x:.1f}")
            wins.append({"metric": m["id"], "icon": "up", "text": f"{m['name']}: {fmt(im['from'])} → {fmt(im['to'])}{(' ' + u) if u and len(u) < 9 else ''} over {im['weeks']} weeks."})
    if vo2:
        cur_p = next((p for p, b in reversed(FRIEND_M30) if vo2[-1][1] >= b), None)
        old = [v for d0, v in vo2 if d0 <= T - timedelta(days=28)]
        old_p = next((p for p, b in reversed(FRIEND_M30) if old and old[-1] >= b), None) if old else None
        if cur_p and old_p is not None and cur_p > old_p:
            nb = next(((p, b) for p, b in FRIEND_M30 if b > vo2[-1][1]), None)
            wins.insert(0, {"metric": "vo2", "icon": "star", "text": f"VO2max passed the {cur_p}th percentile for men your age." + (f" Next: the {nb[0]}th at {nb[1]}." if nb else "")})
    for i, w in enumerate(wins[:3]):
        out.append({"kind": "pwin", "order": i + 1, **w})

    # Weekly habit streaks (completed weeks; the current week counts once it hits)
    def streak(weeks, ok):
        cur_, best, run = 0, 0, 0
        for d0, v in weeks:
            run = run + 1 if ok(v) else 0
            best = max(best, run)
        done_ = [(d0, v) for d0, v in weeks if d0 < _mon(T)]
        for d0, v in reversed(done_):
            if ok(v):
                cur_ += 1
            else:
                break
        this = next((v for d0, v in weeks if d0 == _mon(T)), None)
        if this is not None and ok(this):
            cur_ += 1
        return cur_, best
    c, b = streak(strw, lambda v: v >= 2)
    out.append({"kind": "pstreak", "key": "strength", "label": "Weeks with 2+ strength days", "current": c, "best": b, "target": 2})
    wk_done = sorted({r["period"] for r in ci if r["survey"] == "weekly"})
    weeks = [(_mon(T) - timedelta(weeks=i), 1 if (_mon(T) - timedelta(weeks=i)).isoformat() in wk_done else 0) for i in range(52, -1, -1)]
    c, b = streak(weeks, lambda v: v >= 1)
    out.append({"kind": "pstreak", "key": "weekly_checkin", "label": "Weekly check-ins in a row", "current": c, "best": b, "target": 1})

    le8 = mk.get("le8")
    big_unknown = [m for m in metrics if m["status"] == "unknown" and m["w"] >= 5]
    out.append({"kind": "psum", **counts, "le8": f"Heart-health score (AHA Life's Essential 8): {le8['value']}/100 · {le8.get('sub', '').split(' · ')[0]}" if le8 else "",
                "badge": "Know your numbers" if not big_unknown else "", "to_fill": len(big_unknown)})
    return out
