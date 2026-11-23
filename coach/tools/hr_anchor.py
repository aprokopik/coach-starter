"""The heart rates the easy-effort markers are read at, for this athlete (the athlete, Nov 14, 2026: "same rule is for all heart rate
based metrics").

Run pace, bike power, trail pace and climbing are each scaled to one easy heart rate so sessions compare. That heart rate is
the athlete's own, never a fixed number: 150 bpm can be a recovery jog for one person and threshold for another.

One home: `coach/athlete/profile.json` field `hr_anchor` {run, bike, swim}, which is also the easy day target (RULES 5a, Nov 21,
2026). Its numbers come from `calculated()` (85% of threshold HR from a test, swim = run minus 7, drift check), offered at a
block review through facts.json `easy_hr`. When it is not set, the anchor follows from what the
profile already holds, in this order:
    1. easy_hr_guardrail {run, bike}: run at the run limit, bike 5 bpm under the bike limit (the gap the original athlete uses);
    2. hr_max (number, or {default}), else 220 minus age from birth_year or age_band: run 78% and bike 74% of it, less 5 for the
       bike (the same shares the kit's setup uses for the guardrail);
    3. run 150, bike 130 (the original athlete's numbers), said as a default.
The heart rate windows a session must sit in follow the anchor (run anchor -15 to +25, bike -20 to +35, climbs -25 to +30), the
windows the original 150 and 130 used. Swimming (6.55.0, the athlete: "I want one for swimming") reads at `hr_anchor.swim` when the profile
sets it, else the bike anchor, with the bike's window. Changing an anchor restarts the marker's history, so it is pinned once set.

Every tool and the page read it from here: build_dashboard.py writes it to coach.json as one `hr_anchor` row, calc.js
('fitness', 'week_view') reads that row, brief.py and trail_effort.py read current() after use() (build_dashboard.py, markers.build, brief.py main).

Usage:
    python3 coach/tools/hr_anchor.py        # print this athlete's anchors
"""
import csv
import json
import os
import statistics
import sys
from datetime import date

PROFILE = os.path.join("coach", "athlete", "profile.json")
DEFAULT = {"run": 150, "bike": 130}
WINDOW = {"run": (-15, 25), "bike": (-20, 35), "climb": (-25, 30), "swim": (-20, 35)}
# Run pace at the run anchor reads only runs whose average sits within RUN_PACE_BAND of the anchor (6.170.0; the athlete, Nov 23, 2026:
# scaling a 166 to 169 bpm run down to 150 flattered the early November runs and made true easy runs look like a decline).
# Trail pace and climbing keep the wider "run" window.
RUN_PACE_BAND = 10


def _num(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def _age(prof, today):
    if _num(prof.get("birth_year")):
        return today.year - _num(prof["birth_year"])
    band = str(prof.get("age_band") or "")
    if "-" in band and _num(band.split("-")[0]):
        return _num(band.split("-")[0]) + 5
    return None


def _hr_max(prof, today):
    m = prof.get("hr_max")
    if isinstance(m, dict):
        m = m.get("default") or m.get("run")
    if _num(m):
        return _num(m), "your maximum heart rate"
    age = _age(prof, today)
    if age:
        return 220 - age, "220 minus your age"
    return None, ""


def from_profile(prof, today=None):
    """{run, bike, windows, basis, label} for one profile dict. Pure: no files read."""
    today = today or date.today()
    a = prof.get("hr_anchor") or {}
    g = prof.get("easy_hr_guardrail") or {}
    if _num(a.get("run")) and _num(a.get("bike")):
        run, bike, basis = _num(a["run"]), _num(a["bike"]), "set in your profile"
    elif _num(g.get("run")) and _num(g.get("bike")):
        run, bike, basis = _num(g["run"]), _num(g["bike"]) - 5, "your easy heart rate limits (run at the limit, bike 5 under it)"
    else:
        mx, how = _hr_max(prof, today)
        if mx:
            run, bike, basis = round(mx * 0.78), round(mx * 0.74) - 5, f"78% and 74% of {how} ({mx}), bike 5 under"
        else:
            run, bike, basis = DEFAULT["run"], DEFAULT["bike"], "a starting default until your profile has an easy heart rate or a maximum"
    swim = _num(a.get("swim")) or bike  # set from the run since Nov 21, 2026 (run minus SWIM_LESS); the bike's when unset
    base = {"run": run, "climb": run, "bike": bike, "swim": swim}
    win = {k: [base[k] + lo, base[k] + hi] for k, (lo, hi) in WINDOW.items()}
    win["runpace"] = [run - RUN_PACE_BAND, run + RUN_PACE_BAND]
    # a target, not a ceiling: a session average within `band` bpm either side is on target (the athlete, Nov 15, 2026, RULES.md 5a)
    band = _num(g.get("band"))
    if _num(a.get("run")) and _num(a.get("bike")):  # one home (Nov 21, 2026): the easy day target is the anchor itself
        guard = {"run": run, "bike": bike, "band": band if band is not None else BAND}
    else:
        guard = {"run": _num(g.get("run")) or run, "bike": _num(g.get("bike")) or bike + 5, "band": band if band is not None else BAND}
    return {"run": run, "bike": bike, "climb": run, "swim": swim, "window": win, "guard": guard, "basis": basis,
            "label": {"run": f"Run pace at {run} bpm", "bike": f"Bike power at {bike} bpm",
                      "trail": f"Trail pace at {run} bpm", "climb": f"Climbing at {run} bpm",
                      "bikespeed": f"Bike speed at {bike} bpm", "swimspeed": f"Swim pace at {swim} bpm"}}


# Own resting and maximum heart rate for the general population model (alpha own_hr_model, the athlete picked it Nov 16, 2026 on the
# Truer numbers page, (link not included in the kit)). markers.easy_general and trail_general read a heart
# rate as a share of heart rate reserve; with the person's own ends that share is their real effort, so the modelled adults are
# compared at the same effort, not the same bpm. 220 minus age misses by 7 to 8 bpm on average (Lach 2021, n 3,374).
REST_DAYS = 28   # resting heart rate: mean of the last 28 days that have one (data/summary.csv resting_hr)
REST_MIN_DAYS = 7  # fewer readings than this and the typical adult's 65 stands in
TYPICAL_REST = 65


def resting(root="."):
    """(mean resting HR of the last REST_DAYS readings, n) from data/summary.csv, or (None, 0)."""
    p = os.path.join(root, "data", "summary.csv")
    if not os.path.exists(p):
        return None, 0
    with open(p, encoding="utf-8") as fh:
        vals = [_num(r.get("resting_hr")) for r in csv.DictReader(fh)]
    vals = [v for v in vals if v and 30 <= v <= 110][-REST_DAYS:]
    if len(vals) < REST_MIN_DAYS:
        return None, len(vals)
    return round(statistics.mean(vals)), len(vals)


def reserve_from(prof, rest, today=None):
    """{rest, max: {run, bike}, how} for the population model. Pure. Maximum: profile hr_max (per sport, else default),
    else 220 minus age; rest: the measured mean, else TYPICAL_REST."""
    today = today or date.today()
    m = prof.get("hr_max")
    mx = {}
    for k in ("run", "bike"):
        v = (m.get(k) or m.get("default")) if isinstance(m, dict) else m
        mx[k] = _num(v)
    max_how = "your maximum heart rate"
    if not (mx["run"] and mx["bike"]):
        age = _age(prof, today)
        if not age:
            return None
        mx = {k: mx[k] or 220 - age for k in mx}
        max_how = "220 minus your age"
    rest_how = "your resting heart rate, 28 day average" if rest else f"a typical adult's resting heart rate ({TYPICAL_REST})"
    return {"rest": rest or TYPICAL_REST, "max": mx, "how": f"{rest_how}; {max_how}"}


def reserve(root=".", today=None):
    p = os.path.join(root, PROFILE)
    prof = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            prof = json.load(fh)
    return reserve_from(prof, resting(root)[0], today)


BAND = 5  # the easy heart rate target's band when the profile names none (RULES.md 5a, Easy-day heart rate target)

_CUR = None


def use(root=".", today=None):
    """Read this athlete's anchors once for the run (build_dashboard, markers.build, brief.py); later current() calls return them."""
    global _CUR
    _CUR = anchors(root, today)
    _CUR["reserve"] = reserve(root, today)
    return _CUR


def current():
    """The anchors use() read, else the original 150 and 130 (a tool or test that never called use())."""
    return _CUR or from_profile({})


def anchors(root=".", today=None):
    p = os.path.join(root, PROFILE)
    prof = {}
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            prof = json.load(fh)
    return from_profile(prof, today)


def row(root=".", today=None):
    """The coach.json row the page reads (kind hr_anchor); nested fields as they are, the page parses them."""
    a = anchors(root, today)
    return {"kind": "hr_anchor", "run": a["run"], "bike": a["bike"], "run_lo": a["window"]["run"][0], "run_hi": a["window"]["run"][1],
            "pace_lo": a["window"]["runpace"][0], "pace_hi": a["window"]["runpace"][1],
            "bike_lo": a["window"]["bike"][0], "bike_hi": a["window"]["bike"][1], "guard_run": a["guard"]["run"], "guard_bike": a["guard"]["bike"], "guard_band": a["guard"]["band"],
            "basis": a["basis"], "source": "coach/athlete/profile.json (hr_anchor), coach/tools/hr_anchor.py"}


# Calculated easy heart rate (the athlete, Nov 21, 2026, rules audit: "I'd prefer a calculation here not user input"; card
# "Approve calculated easy HR: run 150, bike 137, swim 143"). The easy number for each sport is EASY_SHARE of that sport's
# threshold heart rate, from the newest test that carries an average heart rate (coach/benchmarks.json result rows: a 20 min
# bike test x 0.95, a 5K x RUN_5K_SHARE), else the best 20 to 40 min run in the last 183 days, else EASY_HRR of heart rate
# reserve for a new person with no hard efforts yet. Swimming runs SWIM_LESS under the run (Olstad 2019, library IR-47).
# An easy hour that decouples more than DRIFT_PCT from its first half to its second (IR-28) takes DRIFT_LOWER off.
# The result is a proposal: the anchor in profile.json moves only at a block review, so the tiles stay comparable.
EASY_SHARE = 0.85       # the first threshold sits near 85 to 89% of threshold heart rate; the bottom is taken (convention)
BIKE_20MIN_SHARE = 0.95  # threshold heart rate from a 20 min all out test (convention)
RUN_5K_SHARE = 0.97      # a 5K is run a few beats above threshold (convention)
EASY_HRR = 0.65          # new person, no hard efforts: rest + 65% of heart rate reserve (Karvonen; convention)
SWIM_LESS = 7            # library IR-47
DRIFT_PCT = 5.0
DRIFT_LOWER = 3
RUN_LOOKBACK_DAYS = 183
HILLY_FT_PER_MI = 60  # runs this hilly or more skip the drift check, as trail markers do


def _read_csv(root, rel):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _test_hr(root, key):
    p = os.path.join(root, "coach", "benchmarks.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as fh:
        rows = json.load(fh).get("rows", [])
    res = sorted((r for r in rows if r.get("kind") == "result" and r.get("key") == key and _num(r.get("avg_hr"))), key=lambda r: r.get("date", ""))
    return (res[-1]["date"], _num(res[-1]["avg_hr"])) if res else None


def drift_sessions(root, anchor, sport, today, days=28):
    """Easy sessions of 60 min or more, average within the band of `anchor`, that decouple more than DRIFT_PCT after the
    first 10 minutes: power (bike) or speed (run) per heartbeat falls from the first half to the second, or heart rate rises
    that much when the laps carry no output. Laps from data/activities/<id>.json (Garmin lapDTOs)."""
    out = []
    for a in _read_csv(root, os.path.join("data", "activities.csv")):
        try:
            day = date.fromisoformat((a.get("local_start") or "")[:10])
        except ValueError:
            continue
        typ = (a.get("type") or "").lower()
        if (today - day).days > days or (today - day).days < 0 or (sport == "run") != ("run" in typ) or (sport == "bike" and not any(w in typ for w in ("cycl", "bik", "ride"))):
            continue
        m, hr = _num(a.get("duration_min")), _num(a.get("avg_hr"))
        if not m or m < 60 or not hr or abs(hr - anchor) > BAND:
            continue
        # steady easy hours only: no races or tests, no hilly runs (terrain moves speed, not drift)
        name = (a.get("name") or "").lower()
        if any(w in name for w in ("race", "test", "50k", "marathon", "ftp")):
            continue
        mi, ft = _num(a.get("distance_mi")), _num(a.get("ascent_ft"))
        if sport == "run" and ("trail" in typ or (mi and ft and ft / mi >= HILLY_FT_PER_MI)):
            continue
        p = os.path.join(root, "data", "activities", f"{a.get('activity_id')}.json")
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            laps = ((json.load(fh).get("splits") or {}).get("lapDTOs")) or []
        key = "averagePower" if sport == "bike" else "averageSpeed"
        rows, acc = [], 0.0
        for x in laps:  # the first 10 minutes are the warm up
            t = float(x.get("duration") or 0)
            if acc >= 600 and x.get("averageHR"):
                rows.append((t, float(x["averageHR"]), float(x.get(key) or 0)))
            acc += t
        tot = sum(t for t, _, _ in rows)
        if len(rows) < 4 or not tot:
            continue
        first, second, acc = [], [], 0.0
        for row in rows:
            (first if acc + row[0] / 2 <= tot / 2 else second).append(row)
            acc += row[0]
        wm = lambda xs, i: sum(x[0] * x[i] for x in xs) / sum(x[0] for x in xs) if xs else None
        h1, h2, o1, o2 = wm(first, 1), wm(second, 1), wm(first, 2), wm(second, 2)
        if not (h1 and h2):
            continue
        # decoupling (library IR-28): output per heartbeat falling from the first half to the second; heart rate alone
        # when the laps carry no power or speed
        pct = (o1 / h1 - o2 / h2) / (o1 / h1) * 100 if o1 and o2 else (h2 - h1) / h1 * 100
        if pct > DRIFT_PCT:
            out.append({"date": day.isoformat(), "first_half": round(h1), "second_half": round(h2), "decoupling_pct": round(pct, 1)})
    return out


def calculated(prof, root=".", today=None):
    """{run, bike, swim, basis: {run, bike, swim}, drift: {run, bike}} for one person. Reads benchmarks.json, activities and
    the resting heart rate; writes nothing."""
    today = today or date.today()
    out, basis = {}, {}
    t = _test_hr(root, "ftp")
    if t:
        thr = t[1] * BIKE_20MIN_SHARE
        out["bike"], basis["bike"] = round(thr * EASY_SHARE), f"{int(EASY_SHARE * 100)}% of threshold HR {thr:.0f} (20 min test {t[0]}, average HR {t[1]} x {BIKE_20MIN_SHARE})"
    t = _test_hr(root, "5k")
    if t:
        thr = t[1] * RUN_5K_SHARE
        out["run"], basis["run"] = round(thr * EASY_SHARE), f"{int(EASY_SHARE * 100)}% of threshold HR {thr:.0f} (5K test {t[0]}, average HR {t[1]} x {RUN_5K_SHARE})"
    else:
        best = None
        for a in _read_csv(root, os.path.join("data", "activities.csv")):
            try:
                day = date.fromisoformat((a.get("local_start") or "")[:10])
            except ValueError:
                continue
            m, hr = _num(a.get("duration_min")), _num(a.get("avg_hr"))
            if "run" in (a.get("type") or "").lower() and m and 20 <= m <= 40 and hr and 0 <= (today - day).days <= RUN_LOOKBACK_DAYS:
                if not best or hr > best[1]:
                    best = (day.isoformat(), hr)
        if best:
            thr = best[1] * RUN_5K_SHARE
            out["run"], basis["run"] = round(thr * EASY_SHARE), f"{int(EASY_SHARE * 100)}% of threshold HR {thr:.0f} (best 20 to 40 min run {best[0]}, average HR {best[1]} x {RUN_5K_SHARE})"
    res = reserve_from(prof, resting(root)[0], today)
    for k in ("run", "bike"):
        if k not in out and res:
            r0, mx = res["rest"], res["max"][k]
            out[k], basis[k] = round(r0 + EASY_HRR * (mx - r0)), f"rest {r0} + {int(EASY_HRR * 100)}% of heart rate reserve to {mx} (no hard effort on file)"
    drift = {}
    for k in ("run", "bike"):
        if k in out:
            ds = drift_sessions(root, out[k], k, today)
            drift[k] = ds
            if ds:
                out[k] -= DRIFT_LOWER
                basis[k] += f"; {DRIFT_LOWER} bpm off for heart rate drift on {len(ds)} easy hour(s)"
    if "run" in out:
        out["swim"], basis["swim"] = out["run"] - SWIM_LESS, f"run minus {SWIM_LESS} (swimming maximum runs about 7 bpm under running, IR-47)"
    return {**out, "basis": basis, "drift": drift}


if __name__ == "__main__":
    print(json.dumps(anchors(), indent=1))
    sys.exit(0)
