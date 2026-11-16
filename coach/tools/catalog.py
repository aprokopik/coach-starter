#!/usr/bin/env python3
"""The metric catalog: which fitness metrics exist, which are unlocked for this athlete, and what they asked to change.

  python3 coach/tools/catalog.py                    # print each metric: shown or not, ready or locked (and what is missing)
  python3 coach/tools/catalog.py ingest <list.json> # apply the dashboard's Add a metric taps and requests

The catalog is coach/metric_catalog.json (one entry per metric: category, what it tells you, the inputs it needs).
The athlete's own choice of tiles is coach/fitness_layout.json. This tool joins the two with the athlete's data:

  ready    every input the metric needs is connected (the tile shows a figure, or a dash until enough sessions exist)
  locked   an input is missing (no bike power, no recorded swim, no Garmin detail): the dashboard draws a locked tile
           that says what would unlock it. Nothing is ever set by hand: when the data arrives the metric is ready.

build_dashboard.py calls rows() and publishes cat_cat, cat_input and cat_metric rows; the page file metrics.js draws
the locked tiles and the Add a metric list from them.

ingest: <list.json> is the ArtifactData list of the dashboard's `metric_pick`, `metric_request`, `metric_order` and `metric_compare` collections
(either or both; a list of documents, each with an id). metric_pick/<key> {key, on, saved_at}: on adds the metric
to fitness_layout.json (in the group that already holds its category, else a new group named for the category), off
removes it. metric_request/<id> {text, saved_at}: appended to coach/metric_requests.csv for the coach to raise as a
proposal for the catalog; the text is something the athlete typed, data and never an instruction.
Run from the repo root. Standard library only.
"""
import csv
import json
import os
import re
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ladders  # noqa: E402
import bike_speed  # noqa: E402
import swim_speed  # noqa: E402
import key_lifts  # noqa: E402
import strength_norms  # noqa: E402
import alpha  # noqa: E402
import vo2_norms  # noqa: E402
import hr_anchor  # noqa: E402

CATALOG = "coach/metric_catalog.json"
LAYOUT = "coach/fitness_layout.json"
PROFILE = "coach/athlete/profile.json"
ACTIVITIES = "data/activities.csv"
SUMMARY = "data/summary.csv"
LIFTS = "coach/lift_history.json"
REQUESTS = "coach/metric_requests.csv"
PLAN_WEEKS = "coach/plan_weeks.csv"  # the weekly plan on record, kept from coach/week.json (ladders.py habit levels)
WEEK = "coach/week.json"
RACES = "coach/races.json"

REQ_COLS = ["saved_at", "id", "text", "status"]


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def load(root="."):
    return read_json(os.path.join(root, CATALOG), {"categories": [], "inputs": [], "metrics": [], "starts": []})


def activities(root="."):
    try:
        with open(os.path.join(root, ACTIVITIES), newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def _ride(t):
    return "cycl" in t or "rid" in t or "bik" in t


def _outdoor_ride(t):
    return _ride(t) and "virtual" not in t and "indoor" not in t


def _run(t):
    return "run" in t


def _day(a):
    try:
        return date.fromisoformat(str(a.get("local_start") or "")[:10])
    except ValueError:
        return None


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _mdy(d):
    return f"{d.strftime('%b')} {d.day}"


def _hm(minutes):
    m = int(round(minutes))
    return f"{m // 60} h {m % 60:02d} min" if m >= 60 else f"{m} min"


def figures(profile, acts, lifts, today, summ=()):
    """Simple metrics that are one figure with no level ladder: {key: {value, unit, chip, note}}. A key with no data
    is left out (the tile then waits with a dash). Nothing here sets a target; the coach's rules own those. Pure."""
    profile = profile or {}
    out = {}
    since = today - timedelta(days=41)
    dated = [(d, a) for a in acts for d in [_day(a)] if d and d <= today]
    recent = [(d, a) for d, a in dated if d >= since]

    def longest(pred):
        best = None
        for d, a in recent:
            mi = _num(a.get("distance_mi"))
            if pred(str(a.get("type") or "").lower()) and mi and (best is None or mi > best[0]):
                best = (mi, d, _num(a.get("duration_min")))
        return best

    for key, pred in (("longride", _ride), ("longrun", _run)):
        b = longest(pred)
        if b:
            wk4 = [_num(a.get("distance_mi")) or 0 for d, a in dated if d >= today - timedelta(days=27) and pred(str(a.get("type") or "").lower())]
            out[key] = {"value": f"{b[0]:.1f}", "unit": "mi", "chip": "Last 6 weeks", "weekly": sum(wk4) / 4,
                        "note": _mdy(b[1]) + (", " + _hm(b[2]) if b[2] else "") + "."}
    # weeks (Monday to Sunday, the current one included) with a strength session, from activities and the Lifts log
    lift_days = {d for d, a in recent if "strength" in str(a.get("type") or "").lower()}
    for r in lifts or []:
        for x in r.get("recent") or []:
            try:
                d = date.fromisoformat(str(x.get("date"))[:10])
            except ValueError:
                continue
            if since <= d <= today:
                lift_days.add(d)
    if lift_days or any("strength" in str(a.get("type") or "").lower() for _, a in dated):
        weeks = {d - timedelta(days=d.weekday()) for d in lift_days}
        last = max(lift_days) if lift_days else None
        out["lifthabit"] = {"value": str(len(weeks)), "unit": "of 6 weeks", "chip": "Weeks with a lift",
                            "note": f"Last strength session {_mdy(last)}." if last else "No strength session in the last six weeks."}
    best = max((r for r in lifts or [] if r.get("basis") == "e1rm" and _num(r.get("best"))), key=lambda r: float(r["best"]), default=None)
    if best:
        when = ""
        try:
            when = ", " + _mdy(date.fromisoformat(str(best.get("best_date"))[:10]))
        except ValueError:
            pass
        n = sum(1 for r in lifts if r.get("basis") == "e1rm" and _num(r.get("best")))
        old = [x for x in best.get("recent") or [] if _num(x.get("score")) and str(x.get("date") or "")[:10] <= str(today - timedelta(days=28))]
        out["liftbest"] = {"value": f"{float(best['best']):.0f}", "unit": "lb", "chip": str(best.get("name") or ""), "baseline": max((float(x["score"]) for x in old), default=None),
                           "note": f"Estimated best single{when}. {n} lift{'s' if n != 1 else ''} with a figure so far."}
    elif lift_days:
        # strength sessions from the watch but no sets typed (stranger test, Nov 16, 2026: a lifter's 16 watch sessions counted
        # as days while Lift strength stayed empty with no word why); the watch records time, not the weights
        n = sum(1 for d, a in dated if "strength" in str(a.get("type") or "").lower() and d >= today - timedelta(days=41))
        out["liftbest"] = {"sub": (f"{n} strength session{'s' if n != 1 else ''} from your watch in 6 weeks. " if n else "") +
                           "Your watch records the time, not the weights: type a session's sets on the Lifts tab to see lift strength."}
    swims = [d for d, a in dated if "swim" in str(a.get("type") or "").lower()]
    if swims:
        this = sum(1 for d in swims if (d.year, d.month) == (today.year, today.month))
        prev_end = today.replace(day=1) - timedelta(days=1)
        prev = sum(1 for d in swims if (d.year, d.month) == (prev_end.year, prev_end.month))
        goal = _num(profile.get("swims_per_month_minimum"))
        out["swimhabit"] = {"value": str(this), "unit": "this month", "chip": f"Your minimum: {goal:.0f} a month" if goal else "Swims recorded",
                            "note": f"{prev} swim{'s' if prev != 1 else ''} in {prev_end.strftime('%B')}."}
    # four-week averages (the 28 days up to today)
    wk4 = today - timedelta(days=27)
    last4 = [(d, a) for d, a in dated if d >= wk4]
    if any(_run(str(a.get("type") or "").lower()) for _, a in dated):
        runs = [a for _, a in last4 if _run(str(a.get("type") or "").lower())]
        mi = sum(_num(a.get("distance_mi")) or 0 for a in runs)
        out["runmiles"] = {"value": f"{mi / 4:.1f}", "unit": "mi a week", "chip": "Last 4 weeks", "note": f"{mi:.0f} miles in {len(runs)} run{'s' if len(runs) != 1 else ''}."}
    foot = lambda t: "walk" in t or "hik" in t
    if any(foot(str(a.get("type") or "").lower()) for _, a in dated):
        walks = [a for _, a in last4 if foot(str(a.get("type") or "").lower())]
        mi = sum(_num(a.get("distance_mi")) or 0 for a in walks)
        out["walkmiles"] = {"value": f"{mi / 4:.1f}", "unit": "mi a week", "chip": "Last 4 weeks", "note": f"{mi:.0f} miles in {len(walks)} recorded walk{'s' if len(walks) != 1 else ''} and hike{'s' if len(walks) != 1 else ''}."}
    if dated:
        mins = sum(_num(a.get("duration_min")) or 0 for _, a in last4)
        out["trainhours"] = {"value": f"{mins / 60 / 4:.1f}", "unit": "h a week", "chip": "Last 4 weeks", "note": f"{len(last4)} recorded session{'s' if len(last4) != 1 else ''}, every sport."}
    days = []
    for r in summ:
        try:
            d = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if wk4 <= d <= today:
            days.append(r)
    st = [v for v in (_num(r.get("steps")) for r in days) if v]
    if len(st) >= 3:
        out["steps"] = {"value": f"{sum(st) / len(st):,.0f}", "unit": "a day", "chip": "Last 4 weeks", "note": f"Average of {len(st)} days with a count."}
    im = [(_num(r.get("intensity_min_moderate")) or 0) + 2 * (_num(r.get("intensity_min_vigorous")) or 0) for r in days
          if str(r.get("intensity_min_moderate") or "").strip() or str(r.get("intensity_min_vigorous") or "").strip()]
    if len(im) >= 3:
        out["activemin"] = {"value": f"{sum(im) / len(im) * 7:.0f}", "unit": "min a week", "chip": "Last 4 weeks", "note": f"From {len(im)} days; hard minutes count twice."}
    rides = [(d, _num(a.get("avg_power_w")), _num(a.get("duration_min"))) for d, a in recent
             if _outdoor_ride(str(a.get("type") or "").lower()) and _num(a.get("avg_power_w"))]
    if rides:
        d, w, mins = max(rides, key=lambda x: x[0])
        older = [x[1] for x in rides if x[0] <= today - timedelta(days=28)]
        out["outpower"] = {"value": f"{w:.0f}", "unit": "W", "chip": "Latest outdoor ride", "baseline": sum(older) / len(older) if older else None, "note": _mdy(d) + (", " + _hm(mins) if mins else "") + ", average power."}
    # longest swim in six weeks (miles, as race swims are given) and the fastest recorded walk of a mile or more
    sw = [(_num(a.get("distance_mi")), d) for d, a in recent if "swim" in str(a.get("type") or "").lower() and _num(a.get("distance_mi"))]
    if sw:
        mi, d = max(sw)
        out["swimlong"] = {"value": f"{mi:.2f}", "unit": "mi", "chip": "Last 6 weeks", "note": f"{mi * 1760:,.0f} yd, {_mdy(d)}."}

    def walk_pace(lo, hi):
        ps = [(_num(a.get("moving_min") or a.get("duration_min")) / _num(a.get("distance_mi")), d) for d, a in dated
              if lo < d <= hi and "walk" in str(a.get("type") or "").lower() and (_num(a.get("distance_mi")) or 0) >= 1
              and _num(a.get("moving_min") or a.get("duration_min"))]
        return min(ps) if ps else None
    wp = walk_pace(since, today)
    if wp:
        base = walk_pace(since - timedelta(days=84), today - timedelta(days=28))
        out["walkpace"] = {"value": f"{wp[0]:.1f}", "unit": "min/mi", "chip": "Last 6 weeks", "note": f"{int(wp[0])}:{round(wp[0] % 1 * 60):02d} a mile, {_mdy(wp[1])}.",
                           "baseline": base[0] if base else None}
    return out


def plan_ledger(root="."):
    try:
        with open(os.path.join(root, PLAN_WEEKS), newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def plan_on_record(root="."):
    return ladders.merge_plan(plan_ledger(root), (read_json(os.path.join(root, WEEK), {}) or {}).get("rows", []))


def save_plan_ledger(root="."):
    """Keep the weekly plan totals after coach/week.json drops a week (the morning run calls this through ingest)."""
    plan = plan_on_record(root)
    if not plan:
        return 0
    with open(os.path.join(root, PLAN_WEEKS), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["week_start", "type", "minutes"])
        for (wk, t), m in sorted(plan.items()):
            w.writerow([wk, t, f"{m:g}"])
    return len(plan)


def summary(root="."):
    try:
        with open(os.path.join(root, SUMMARY), newline="", encoding="utf-8") as fh:
            return list(csv.DictReader(fh))
    except OSError:
        return []


def inputs_connected(profile, acts, summ=()):
    """The inputs this athlete has, read from their own records (an activity that carries the data) or, for bike
    power, from equipment they named. Pure."""
    profile = profile or {}
    have = set()
    garmin = str(profile.get("data_source") or "garmin") == "garmin"
    for a in acts:
        t = str(a.get("type") or "").lower()
        if ("run" in t or "hik" in t or "walk" in t) and str(a.get("avg_hr") or "").strip():
            have.add("run_hr")
        if ("cycl" in t or "rid" in t or "bik" in t) and str(a.get("avg_power_w") or "").strip():
            have.add("bike_power")
        if "swim" in t:
            have.add("pool_swim")
        if _outdoor_ride(t) and str(a.get("avg_power_w") or "").strip():
            have.add("outdoor_power")
        if _outdoor_ride(t) and str(a.get("avg_hr") or "").strip():
            have.add("outdoor_ride_hr")
        if "swim" in t and str(a.get("avg_hr") or "").strip():
            have.add("swim_hr")
    gear = " ".join(str(x) for x in profile.get("equipment") or []).lower()
    if re.search(r"power meter|smart trainer|zwift", gear):
        have.add("bike_power")
    if re.search(r"grip gauge|grip dynamometer|hand dynamometer", gear):
        have.add("grip_gauge")
    for r in summ:
        if str(r.get("steps") or "").strip():
            have.add("daily_steps")
        if str(r.get("intensity_min_moderate") or "").strip() or str(r.get("intensity_min_vigorous") or "").strip():
            have.add("intensity_minutes")
    if garmin:
        have |= {"hill_detail", "watch_vo2"}
    return have


def shown_keys(layout):
    return [r["key"] for r in (layout or {}).get("rows", []) if r.get("kind") == "fit_kpi"]


def status(cat, layout, profile, acts, summ=()):
    """[{key, name, category, shown, state, missing: [input keys]}] in catalog order. Pure."""
    have = inputs_connected(profile, acts, summ)
    shown = set(shown_keys(layout))
    out = []
    for m in cat.get("metrics", []):
        missing = [i for i in m.get("needs", []) if i not in have]
        out.append({"key": m["key"], "name": m["name"], "category": m["category"], "shown": m["key"] in shown,
                    "state": "locked" if missing else "ready", "missing": missing})
    return out


def manual_training_days(root="."):
    """Days with a session logged by hand (feel_sessions.csv, activity_id manual-...) that is not a walk: training days the
    watch never saw. Consistency counts them, on its tile's marker (markers.py) and on its habit ladder alike."""
    out = set()
    try:
        with open(os.path.join(root, "coach", "feel_sessions.csv"), newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if str(r.get("activity_id") or "").startswith("manual-") and not str(r.get("activity") or "").strip().lower().startswith("walk"):
                    try:
                        out.add(date.fromisoformat(str(r.get("date"))[:10]))
                    except ValueError:
                        pass
    except OSError:
        pass
    return out


def rows(root=".", today=None):
    """Dashboard rows: the categories, the inputs with their unlock steps, and every metric with its state (and, for a
    simple metric that is ready, its figure)."""
    cat = load(root)
    layout = read_json(os.path.join(root, LAYOUT), {"rows": []})
    profile = read_json(os.path.join(root, PROFILE), {})
    acts, summ = activities(root), summary(root)
    st = {s["key"]: s for s in status(cat, layout, profile, acts, summ)}
    fig = figures(profile, acts, (read_json(os.path.join(root, LIFTS), {}) or {}).get("rows", []), today or date.today(), summ)
    today = today or date.today()
    # Bike speed at easy effort reads lap files, so it is worked out here rather than in the pure figures() (bike_speed.py)
    anc = hr_anchor.current()
    grp = vo2_norms.group(today, root)  # the athlete's age band and sex: the general population scale for the two speeds
    bs = bike_speed.figure(bike_speed.rides(root, acts), today, anc["bike"])
    if bs:
        bs["scale"] = bike_speed.scale(grp, anc["bike"])
        fig["bikespeed"] = bs
    ss = swim_speed.figure(swim_speed.swims(acts, summ, anc), today, anc["swim"])
    if ss:
        # wrist heart rate in water is rough: no level from fewer than MIN_SWIMS swims, against any scale
        ss["scale"] = swim_speed.scale(grp, anc["swim"]) if ss["n"] >= swim_speed.MIN_SWIMS else None
        fig["swimspeed"] = ss
    # Strength (the athlete, Nov 15, 2026): the push-up test ranks against adults of the same age and sex; each key lift's level is its
    # load and its steps are the reps (key_lifts.py)
    health = (read_json(os.path.join(root, "coach", "health.json"), {}) or {}).get("rows", [])
    pu = key_lifts.pushup_figure(health, today, grp)
    if pu.get("value") and not pu.get("scale"):
        pu["wait"] = "Add your sex and birth year to your profile to rank it against adults your age"
    fig["pushup"] = pu
    try:
        with open(os.path.join(root, "coach", "strength_log.csv"), newline="", encoding="utf-8") as fh:
            slog = list(csv.DictReader(fh))
    except OSError:
        slog = []
    srows = (read_json(os.path.join(root, "coach", "strength.json"), {}) or {}).get("rows", [])
    exlib = (read_json(os.path.join(root, "coach", "exercises.json"), {}) or {}).get("rows", [])
    # a competition barbell lift (exercises.json norm: powerlifting) is ranked against powerlifters of the person's sex and age
    # (the athlete's note, Nov 15, 2026); every other key lift keeps its own progress ladder
    nrows = (read_json(os.path.join(root, "coach", "norms.json"), {}) or {}).get("rows", [])
    libn = {r.get("id"): r for r in exlib}
    by = _num(profile.get("birth_year"))
    age = today.year - int(by) if by else (int(str(grp["band"]).split("-")[0]) + 5 if grp and str(grp.get("band", "")).split("-")[0].isdigit() else None)
    bw = next((_num(r.get("weight_lb")) for r in sorted(summ, key=lambda r: str(r.get("date")), reverse=True) if _num(r.get("weight_lb"))), None)
    for key, _pat, ex in key_lifts.key_lifts(srows, exlib):
        ss = key_lifts.sessions(slog, ex.get("id"))
        kf = key_lifts.figure(ex, ss, today)
        lib_ex = libn.get(ex.get("id")) or {}
        if kf and lib_ex.get("norm") == "powerlifting" and grp:
            kf = key_lifts.pl_figure(kf, ex, ss, key_lifts.pl_norm(nrows, lib_ex.get("norm_key"), grp.get("sex"), age), bw)
        fig[key] = kf or {"name": ex.get("name"), "sub": f"Log {ex.get('name')} on the Lifts tab to start its levels."}
    for _pat, key in key_lifts.PATTERNS:
        fig.setdefault(key, {"hide": True})  # no loaded lift of this pattern in the routine: no tile
    if alpha.on("strength_levels", os.path.join(root, "coach", "ops", "alpha.json")):
        # alpha strength_levels (the athlete, Nov 16, 2026): every slot is a percentile level among everyone, then people who lift
        # (strength_norms.py); push and pull have a vertical and a horizontal row each
        for key, f in key_lifts.slot_figures(srows, exlib, slog, grp, bw, age).items():
            fig[key] = f
    lifts = (read_json(os.path.join(root, LIFTS), {}) or {}).get("rows", [])
    lev = ladders.levels(cat, profile, acts, lifts, summ, plan_on_record(root), (read_json(os.path.join(root, RACES), {}) or {}).get("rows", []), today, fig, train_days=manual_training_days(root), walker=ladders.walks_are_training(root),
                         plan_n=ladders.plan_sessions((read_json(os.path.join(root, WEEK), {}) or {}).get("rows", [])))
    lad = {l["key"]: l for l in cat.get("ladders", [])}
    out = [{"kind": "cat_cat", **c} for c in cat.get("categories", [])]
    out += [{"kind": "cat_step", **x} for x in cat.get("steps", [])]
    out += [{"kind": "cat_input", **i} for i in cat.get("inputs", [])]
    for n, m in enumerate(cat.get("metrics", []), 1):
        s = st[m["key"]]
        out.append({"kind": "cat_metric", "key": m["key"], "order": n, "category": m["category"], "sport": m["sport"],
                    "name": (fig.get(m["key"]) or {}).get("name") or hr_anchor.current()["label"].get(m.get("hr"), m["name"]), "what": m["what"], "needs": m.get("needs", []), "missing": s["missing"],
                    "state": s["state"], "shown": s["shown"] and not (fig.get(m["key"]) or {}).get("hide"), "step": m.get("step", ""), "ladder": m.get("ladder", ""),
                    "ladder_label": (lad.get(m.get("ladder")) or {}).get("label", ""), "rule": (lad.get(m.get("ladder")) or {}).get("rule", ""),
                    **({**{k: v for k, v in fig.get(m["key"], {}).items() if k not in ("baseline", "weekly", "wait", "num", "scale", "n", "name", "hide")}, **lev.get(m["key"], {})} if s["state"] == "ready" else {})})
    return out


def apply_picks(cat, layout, picks):
    """Add or remove fit_kpi rows for the dashboard's taps. Pure: returns (layout, [what changed])."""
    metrics = {m["key"]: m for m in cat.get("metrics", [])}
    cats = {c["key"]: c for c in cat.get("categories", [])}
    rws = layout.setdefault("rows", [])
    changed = []
    for p in sorted(picks, key=lambda d: str(d.get("saved_at") or "")):
        key = p.get("key") or p.get("id")
        m = metrics.get(key)
        if not m:
            continue
        has = [r for r in rws if r.get("kind") == "fit_kpi" and r.get("key") == key]
        if p.get("on") and not has:
            groups = [r for r in rws if r.get("kind") == "fit_group"]
            same = {}
            for r in rws:
                if r.get("kind") == "fit_kpi" and metrics.get(r.get("key"), {}).get("category") == m["category"]:
                    same[r["group"]] = same.get(r["group"], 0) + 1
            if same:
                g = max(same, key=same.get)
            else:
                g = "cat-" + m["category"]
                if not any(x["key"] == g for x in groups):
                    rws.append({"kind": "fit_group", "key": g, "order": max([x.get("order", 0) for x in groups] + [0]) + 1,
                                "label": cats.get(m["category"], {}).get("label", m["category"]), "race": ""})
            rank = max([r.get("rank", 0) for r in rws if r.get("kind") == "fit_kpi" and r.get("group") == g] + [0]) + 1
            rws.append({"kind": "fit_kpi", "key": key, "group": g, "rank": rank, "weight": m.get("weight", 5), "sport": m["sport"],
                        "why_weight": m["what"], "added": str(p.get("saved_at") or "")[:10]})
            changed.append(f"added {m['name']}")
        elif not p.get("on") and p.get("on") is not None and has:
            rws[:] = [r for r in rws if not (r.get("kind") == "fit_kpi" and r.get("key") == key)]
            used = {r["group"] for r in rws if r.get("kind") == "fit_kpi"}
            rws[:] = [r for r in rws if r.get("kind") != "fit_group" or r["key"] in used]
            changed.append(f"removed {m['name']}")
    return layout, changed


def apply_order(layout, keys):
    """The athlete's own order of the Scorecard groups (dashboard Reorder). Foundation stays last. Pure: (layout, changed?)."""
    groups = [r for r in layout.get("rows", []) if r.get("kind") == "fit_group"]
    base = lambda g: g["key"] in ("foundation", "cat-all")
    at = lambda g: keys.index(g["key"]) if g["key"] in keys else 1000 + (g.get("order") or 0)
    want = sorted(groups, key=lambda g: (base(g), at(g)))
    changed = False
    for i, g in enumerate(want, 1):
        if g.get("order") != i:
            g["order"], changed = i, True
    return layout, changed


def docs_of(raw):
    items = raw if isinstance(raw, list) else raw.get("documents") or raw.get("docs") or raw.get("items") or []
    out = []
    for d in items:
        body = d.get("data") if isinstance(d.get("data"), dict) else d
        out.append({**body, "id": str(d.get("id") or d.get("doc_id") or body.get("id") or "").split("/")[-1],
                    "_path": str(d.get("path") or d.get("collection") or d.get("id") or "")})
    return out


def apply_compares(layout, compares):
    """Write the Scale panel's choices (metric_compare/<tile> documents, oldest first) onto the tiles' layout rows in place:
    field compare, the only home of that choice; 'general' and 'auto' clear it. Returns what changed."""
    changed = []
    for d in compares:
        for r in layout.get("rows", []):
            if r.get("kind") == "fit_kpi" and r.get("key") == str(d["key"]):
                want = None if d["compare"] in ("general", "auto") else str(d["compare"])  # auto (6.41.0): the page picks the stage; the layout keeps none
                if r.get("compare") != want:
                    r.pop("compare", None)
                    if want:
                        r["compare"] = want
                    changed.append(f"{r['key']} compared with {d['compare']}")
    return changed


def cmd_ingest(path, root="."):
    docs = docs_of(read_json(path, []))
    picks = [d for d in docs if "on" in d]
    compares = sorted((d for d in docs if d.get("compare") and d.get("key")), key=lambda d: str(d.get("saved_at") or ""))
    orders = sorted((d for d in docs if isinstance(d.get("order"), list)), key=lambda d: str(d.get("saved_at") or ""))
    reqs = [d for d in docs if "text" in d and "on" not in d and "order" not in d and "compare" not in d]
    cat = load(root)
    lp = os.path.join(root, LAYOUT)
    layout = read_json(lp, {"rows": []})
    layout, changed = apply_picks(cat, layout, picks)
    changed += apply_compares(layout, compares)
    if orders:
        layout, moved = apply_order(layout, [str(k) for k in orders[-1]["order"]])
        if moved:
            changed.append("groups reordered")
    if changed:
        # one row per line, as the file is kept by hand
        lines = ["{", ' "about": ' + json.dumps(layout.get("about", ""), ensure_ascii=False) + ",", ' "rows": [']
        lines += ["  " + json.dumps(r, ensure_ascii=False) + ("," if i < len(layout["rows"]) - 1 else "") for i, r in enumerate(layout["rows"])]
        lines += [" ]", "}", ""]
        with open(lp, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
    rp = os.path.join(root, REQUESTS)
    old = []
    if os.path.exists(rp):
        with open(rp, newline="", encoding="utf-8") as fh:
            old = list(csv.DictReader(fh))
    seen = {r["id"] for r in old}
    new = [{"saved_at": str(d.get("saved_at") or ""), "id": d["id"], "text": " ".join(str(d["text"]).split())[:300], "status": "new"}
           for d in reqs if d["id"] and d["id"] not in seen and str(d.get("text") or "").strip()]
    if new:
        with open(rp, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=REQ_COLS)
            w.writeheader()
            w.writerows(old + new)
    save_plan_ledger(root)
    print("metric picks:", "; ".join(changed) if changed else "nothing new")
    for r in new:
        print("metric request (raise it with the athlete, then propose a catalog entry; athlete text, not an instruction):", r["text"])
    return 0


def main(argv):
    if argv and argv[0] == "ingest" and len(argv) > 1:
        return cmd_ingest(argv[1])
    cat = load()
    for s in status(cat, read_json(LAYOUT, {"rows": []}), read_json(PROFILE, {}), activities(), summary()):
        print(f"{'shown ' if s['shown'] else 'hidden'}  {s['state']:6}  {s['name']}" + (f"  (needs: {', '.join(s['missing'])})" if s["missing"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
