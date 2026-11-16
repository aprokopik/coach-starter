"""Levels for the catalog's simple metrics (the athlete, Nov 12, 2026: metrics are "levels and skill trees"; "always a ladder").

Every metric in coach/metric_catalog.json names a `step` (habit, capacity, performance) and a `ladder`. The ladders
themselves (rungs, thresholds, rule text) are in the catalog's `ladders` list, their one home; this file only reads them.

  habit       the 3-3-3 rule of habit building (the athlete, Nov 12, 2026: "3 days, 3 weeks, 3 months ... after which you've passed
              that and you're holding a habit, the numbers should keep going up as some kind of extra credit"): three
              sessions, then a run of three weeks on target, then three months (13 weeks), then the months held keep
              counting. A week is on target where the week's plan is on record (coach/plan_weeks.csv, kept from
              coach/week.json) and the done minutes reach `plan_share` of the planned minutes (the athlete: "Volume is based off
              of the plan that you have"); with no plan on record, the metric's own minimum. Strict (the athlete, Nov 12, 2026:
              "we should stay brutal. A missed week is a missed week"): any missed week ends the run (`forgive` 0).
  ready       the longest recent session AND the usual week (four-week average) against what the athlete's biggest event
              in the next year calls for; the lower of the two sets the level. No event, no level.
  guide       coach guide where no trusted norm exists (the athlete: "search for a norm; otherwise it's coaches' guidance based
              off of the person"): the figure against the athlete's own baseline.
  percentile, own   levels come with the metric's marker (coach/tools/markers.py); nothing is computed here.

Pure functions; catalog.py gathers the files.
"""
import json
import os
import re
from datetime import date, timedelta

MI_PER_KM = 0.621371


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _day(v):
    try:
        return date.fromisoformat(str(v or "")[:10])
    except ValueError:
        return None


def _mon(d):
    return d - timedelta(days=d.weekday())


def kind_of(t):
    """The habit types an activity type counts for."""
    t = str(t or "").lower()
    out = {"any"}
    if "walk" not in t and t not in ("", "type"):
        out.add("train")  # a training day as Consistency counts it: walks left out (sauna is left out by name, see _counts)
    if "run" in t:
        out.add("run")
    if "cycl" in t or "rid" in t or "bik" in t:
        out.add("bike")
    if "swim" in t:
        out.add("swim")
    if "strength" in t:
        out.add("strength")
    if "walk" in t or "hik" in t:
        out.add("foot")
    if "trail" in t or "hik" in t:
        out.add("trail")
    return out


PLAN_TYPE = {"run": "run", "bike": "bike", "swim": "swim", "strength": "strength", "walk": "foot"}


def plan_from_week(week_rows):
    """{(week_start iso, habit type): planned minutes} from coach/week.json day rows; `any` is every planned session."""
    out = {}
    for r in week_rows or []:
        d = _day(r.get("date"))
        if r.get("kind") != "day" or not d or str(r.get("type")) == "rest":
            continue
        mins = _num(r.get("minutes")) or 0
        w = str(_mon(d))
        for t in {"any", PLAN_TYPE.get(str(r.get("type")))} - {None}:
            out[(w, t)] = out.get((w, t), 0) + mins
    return out


def merge_plan(ledger_rows, week_rows):
    """The plan on record: the ledger, with every week still in week.json replaced by its current rows."""
    out = {}
    for r in ledger_rows or []:
        m = _num(r.get("minutes"))
        if r.get("week_start") and r.get("type") and m is not None:
            out[(str(r["week_start"]), str(r["type"]))] = m
    live = plan_from_week(week_rows)
    for w in {k[0] for k in live}:
        for k in [k for k in out if k[0] == w]:
            del out[k]
    out.update(live)
    return out


def rung(ladder, v):
    """The rung a value sits on and the next one up: (label, next label or None, next threshold or None).
    ladder.rungs is [[label, lowest value], ...] from the bottom."""
    rs = ladder.get("rungs") or []
    cur, nxt = None, None
    for i, (lab, lo) in enumerate(rs):
        if v >= lo:
            cur, nxt = lab, (rs[i + 1] if i + 1 < len(rs) else None)
    if cur is None and rs:
        cur, nxt = rs[0][0], (rs[1] if len(rs) > 1 else None)
    return cur, (nxt[0] if nxt else None), (nxt[1] if nxt else None)


def through(ladder, v):
    """How far through its rung a value is, 0 to 1 (None on the top rung): the 'closest to a new level' figure."""
    rs = ladder.get("rungs") or []
    lo = max((x[1] for x in rs if v >= x[1]), default=rs[0][1] if rs else 0)
    hi = min((x[1] for x in rs if x[1] > v), default=None)
    if hi is None:
        return None
    lo = max(lo, hi - (rs[1][1] - rs[0][1]) if len(rs) > 1 and lo < -100 else lo)  # an open bottom rung is as wide as the next
    return round(max(0.0, min(1.0, (v - lo) / (hi - lo))), 2) if hi > lo else None


WALKS_TRAIN = False  # set by levels(): for someone whose own sport is walking, a walk is a training day


def walks_are_training(root="."):
    """True when the person's Fitness tab has a walking group (setup puts one there for someone who walks for fitness)."""
    try:
        rows = json.load(open(os.path.join(root, "coach/fitness_layout.json"))).get("rows", [])
    except (OSError, ValueError, AttributeError):
        return False
    return any(r.get("kind") == "fit_group" and r.get("key") == "walking" for r in rows)


def _counts(a, typ):
    """Does activity `a` count for habit type `typ`? "train" also leaves out a sauna session, which has no type of its own."""
    if typ == "train" and WALKS_TRAIN and "walk" in str(a.get("type") or "").lower():
        return "sauna" not in str(a.get("name") or "").lower()
    if typ not in kind_of(a.get("type")):
        return False
    return not (typ == "train" and "sauna" in str(a.get("name") or "").lower())


def habit_run(wk, forgive=0):
    """(weeks held, weeks missed inside the run): on-target weeks counted back from the last finished week. Up to
    `forgive` missed weeks in a row are skipped, not counted; one more ends the run. wk: [(week, ok, why)] oldest first."""
    held = gap = skipped = 0
    for _w, ok, _why in reversed(wk):
        if ok:
            held, skipped, gap = held + 1, skipped + gap, 0
        else:
            gap += 1
            if gap > forgive:
                break
    return held, skipped


def months_held(weeks):
    return int(weeks * 12 // 52)


def habit_weeks(h, acts, lift_days, summ, plan, today, profile, weeks=12, share=0.8, train_days=()):
    """[(week_start, on target?, why)] for the `weeks` finished weeks before this one, oldest first.
    h: the metric's habit definition {type, min, window, measure, profile_min}."""
    typ, measure = h.get("type", "any"), h.get("measure", "sessions")
    win = int(h.get("window", 1))
    mn = _num((profile or {}).get(h.get("profile_min"))) if h.get("profile_min") else None
    mn = mn if mn is not None else (_num(h.get("min")) or 1)
    this = _mon(today)
    sess, mins, days = {}, {}, {}
    for a in acts:
        d = _day(a.get("local_start"))
        if not d or not _counts(a, typ):
            continue
        w = _mon(d)
        sess[w] = sess.get(w, 0) + 1
        mins[w] = mins.get(w, 0) + (_num(a.get("duration_min")) or 0)
        days.setdefault(w, set()).add(d)
    if typ in ("strength", "train"):  # a logged lift is a strength session and a training day
        for d in list(lift_days or ()) + (list(train_days or ()) if typ == "train" else []):
            w = _mon(d)
            if d not in days.get(w, set()):
                sess[w] = sess.get(w, 0) + 1
                days.setdefault(w, set()).add(d)
    daily = {}
    if measure in ("steps", "active"):
        for r in summ or ():
            d = _day(r.get("date"))
            if not d:
                continue
            if measure == "steps":
                v = _num(r.get("steps"))
            else:
                mo, vi = _num(r.get("intensity_min_moderate")), _num(r.get("intensity_min_vigorous"))
                v = None if mo is None and vi is None else (mo or 0) + 2 * (vi or 0)
            if v is not None:
                daily.setdefault(_mon(d), []).append(v)
    out = []
    for i in range(weeks, 0, -1):
        w = this - timedelta(weeks=i)
        planned = plan.get((str(w), typ)) if h.get("plan", True) and measure == "sessions" else None
        if measure == "steps":
            vs = daily.get(w, [])
            ok, why = (len(vs) >= 4 and sum(vs) / len(vs) >= mn), "average steps"
        elif measure == "active":
            vs = daily.get(w, [])
            ok, why = (sum(vs) >= mn), "active minutes"
        elif planned:
            ok, why = mins.get(w, 0) >= share * planned, "plan"
        elif measure == "days":
            ok, why = len(days.get(w, ())) >= mn, "days"
        else:
            n = sum(sess.get(w - timedelta(weeks=j), 0) for j in range(win))
            ok, why = n >= mn, "minimum"
        out.append((w, bool(ok), why))
    return out


# Standard triathlon legs in miles (swim, bike, run), for a race written as one total ("226 km") or by its name
TRI_STD = {"full": (2.4, 112.0, 26.2), "half": (1.2, 56.0, 13.1), "olympic": (0.93, 24.8, 6.2), "sprint": (0.47, 12.4, 3.1)}


def _tri_legs(text, hits):
    t = text.lower()
    kind = ("half" if re.search(r"70\.3|half", t) else "full" if re.search(r"140\.6|full|ironman\b(?! 70)", t) else
            "olympic" if "olympic" in t or "standard" in t else "sprint" if "sprint" in t else None)
    if not kind and len(hits) == 1:
        v, unit = float(hits[0][0]), hits[0][1].lower()
        km = v / MI_PER_KM if unit in ("mi",) else v
        kind = min(TRI_STD, key=lambda k: abs(sum(TRI_STD[k]) / MI_PER_KM - km)) if km > 15 else None
    if not kind:
        return {}
    sw, bk, rn = TRI_STD[kind]
    return {"swim": sw, "bike": bk, "run": rn}


def _legs(text, sport):
    """Miles per discipline in a race's distance text, only where it reads one way: '1.2 mi swim, 56 mi bike, 13.1 mi run',
    '50K', '100 mi'. A text offering several distances reads as nothing."""
    text, sport = str(text or ""), str(sport or "").lower()
    out = {}
    for v, unit, leg in re.findall(r"(\d+(?:\.\d+)?)\s*(mi|km|k)\b\s*(swim|bike|ride|run)", text, flags=re.I):
        out[{"ride": "bike"}.get(leg.lower(), leg.lower())] = float(v) * (1 if unit.lower() == "mi" else MI_PER_KM)
    if out:
        return out
    hits = re.findall(r"(\d+(?:\.\d+)?)\s*(mi|km|k|m)\b", text, flags=re.I)
    if "triathlon" in sport:
        tri = _tri_legs(text, hits)
        if tri:
            return tri
    if len(hits) != 1 or re.search(r"\bto\b|\bor\b|offered", text, flags=re.I):
        return {}
    v, unit = float(hits[0][0]), hits[0][1].lower()
    mi = v * (1 if unit in ("mi", "m") else MI_PER_KM)
    leg = "bike" if "ride" in sport or "cycl" in sport else "run" if "run" in sport else "foot" if "walk" in sport or "hik" in sport else None
    return {leg: mi} if leg else {}


def event_needs(races, today, rule, days=365):
    """{discipline: {need (mi), race, leg (mi)}}: for each discipline, the registered or planned race inside `days` with the
    longest leg, and the long session it calls for (the catalog's `ready` rule: a share of the leg, capped)."""
    best = {}
    for r in races or []:
        d = _day(r.get("date"))
        if r.get("kind") != "race" or not d or not (today <= d <= today + timedelta(days=days)):
            continue
        if str(r.get("status")) not in ("registered", "planned"):
            continue
        for leg, mi in _legs(r.get("distance"), r.get("sport")).items():
            if leg not in best or mi > best[leg]["leg"]:
                best[leg] = {"leg": mi, "race": str(r.get("name") or ""), "date": str(d)}
    for leg, b in best.items():
        rr = (rule or {}).get(leg) or {}
        share, cap = rr.get("share", 1.0), rr.get("cap")
        if leg == "run" and b["leg"] > 26.3:
            share, cap = rr.get("ultra_share", 0.5), rr.get("ultra_cap", 31)
        need = b["leg"] * share
        b["need"] = round(min(need, cap) if cap else need, 1)
        ws, wc = rr.get("week_share"), rr.get("week_cap")
        if leg == "run" and b["leg"] > 26.3:
            ws, wc = rr.get("ultra_week_share", ws), rr.get("ultra_week_cap", wc)
        if ws:
            b["week"] = round(min(b["leg"] * ws, wc) if wc else b["leg"] * ws, 1)
    return best


def levels(cat, profile, acts, lifts, summ, plan, races, today, fig, train_days=(), walker=False):
    """{metric key: {level, next, rungs, ladder_label, rule, + figure overrides}} for habit, ready and guide metrics."""
    global WALKS_TRAIN
    WALKS_TRAIN = bool(walker)
    lad = {l["key"]: l for l in cat.get("ladders", [])}
    since = today - timedelta(weeks=110)
    lift_days = set()
    for r in lifts or []:
        for x in r.get("recent") or []:
            d = _day(x.get("date"))
            if d and since <= d <= today:
                lift_days.add(d)
    needs = event_needs(races, today, (lad.get("ready") or {}).get("need"))
    out = {}
    for m in cat.get("metrics", []):
        L = lad.get(m.get("ladder"))
        if not L:
            continue
        base = {"ladder_label": L.get("label", ""), "rule": L.get("rule", ""), "rungs": "|".join(x[0] for x in reversed(L.get("rungs") or []))}
        k = m["key"]
        if m["ladder"] == "habit" and m.get("habit"):
            wk = habit_weeks(m["habit"], acts, lift_days, summ, plan, today, profile, weeks=int(L.get("weeks", 104)), share=L.get("plan_share", 0.8), train_days=train_days)
            held, skipped = habit_run(wk, int(L.get("forgive", 0)))
            # three sessions come before three weeks: sessions (or on-target days) of the last three weeks, this week included
            typ, meas = m["habit"].get("type", "any"), m["habit"].get("measure", "sessions")
            d0 = today - timedelta(days=20)
            if meas in ("sessions", "days"):
                days3 = len({_day(a.get("local_start")) for a in acts if _counts(a, typ) and _day(a.get("local_start")) and d0 <= _day(a.get("local_start")) <= today}
                            | ({d for d in lift_days if d0 <= d <= today} if typ in ("strength", "train") else set())
                            | ({d for d in train_days or () if d0 <= d <= today} if typ == "train" else set()))
            else:
                mn = _num((profile or {}).get(m["habit"].get("profile_min"))) if m["habit"].get("profile_min") else None
                mn = mn if mn is not None else (_num(m["habit"].get("min")) or 1)
                per = mn if meas == "steps" else mn / 7
                days3 = 0
                for r in summ or ():
                    d = _day(r.get("date"))
                    v = _num(r.get("steps")) if meas == "steps" else None if (_num(r.get("intensity_min_moderate")) is None and _num(r.get("intensity_min_vigorous")) is None) else (_num(r.get("intensity_min_moderate")) or 0) + 2 * (_num(r.get("intensity_min_vigorous")) or 0)
                    if d and d0 <= d <= today and v is not None and v >= per:
                        days3 += 1
            mo = months_held(held)
            if held >= 13:
                cur, nxt_w = ("3 months" if mo <= 3 else f"{mo} months"), -(-(max(mo, 3) + 1) * 52 // 12)
                nx = f"{nxt_w - held} more week{'s' if nxt_w - held != 1 else ''} to {max(mo, 3) + 1} months"
                lo_w = 13 if mo <= 3 else -(-mo * 52 // 12)
                pct = round(max(0.0, min(1.0, (held - lo_w) / max(1, nxt_w - lo_w))), 2)
            elif held >= 3:
                cur, nx, pct = "3 weeks", f"{13 - held} more week{'s' if 13 - held != 1 else ''} on target to 3 months", round((held - 3) / 10, 2)
            elif days3 >= 3:
                cur, nx, pct = "3 days", f"{3 - held} more week{'s' if 3 - held != 1 else ''} on target to 3 weeks", round(held / 3, 2)
            else:
                cur, nx, pct = "Starting", ("3 days on target to reach the first step" if not days3 else f"{3 - days3} more day{'s' if 3 - days3 != 1 else ''} on target to reach 3 days"), round(days3 / 3, 2)
            planned = sum(1 for _, _ok, why in wk[-12:] if why == "plan")
            old = fig.get(k) or {}
            note = (f"{old['value']} {old.get('unit', '')}".strip() + ". " if old.get("value") else "") + \
                (f"{skipped} missed week{'s' if skipped != 1 else ''} forgiven inside this run. " if skipped else "") + \
                (f"{planned} of the last 12 weeks had a plan on record; the others use your minimum." if planned and planned < 12 else "Against your plan." if planned else "") + \
                (f" A week counts with {int(_num(m['habit'].get('min')) or 1)} or more training days; two sessions on one day count once, " + ("walks count, sauna does not." if WALKS_TRAIN else "walks and sauna do not.") if meas == "days" else "")
            rungs = "|".join(([f"{mo} months and counting"] if mo > 3 else ["Beyond: the months keep counting"]) + ["3 months", "3 weeks", "3 days", "Starting"])
            out[k] = {**base, "rungs": rungs, "value": str(held), "unit": "weeks held" if held != 1 else "week held", "chip": "3-3-3", "note": note.strip(),
                      "level": f"{mo} months and counting" if mo > 3 else cur, "pct": pct, "next": nx, "weeks": "".join("1" if ok else "0" for _, ok, _w in wk[-12:])}
        elif m["ladder"] == "ready":
            f = fig.get(k)
            v = _num((f or {}).get("value"))
            nd = needs.get(m.get("ready_leg"))
            if v is None:
                continue
            wkv = _num((f or {}).get("weekly"))
            if not nd:
                out[k] = {**base, "level": "", "next": "No event with a set distance on your calendar: add one, or tell your coach a goal"}
                continue
            long_share = v / nd["need"] if nd["need"] else 0
            week_share = wkv / nd["week"] if wkv is not None and nd.get("week") else None
            sh = long_share if week_share is None else min(long_share, week_share)
            cur, nxt, at = rung(L, sh)
            short = "week" if week_share is not None and week_share < long_share else "long"
            ev = nd["race"]
            if not nxt:
                nx = f"Covers what {ev} calls for: a long session of {nd['need']:g} mi" + (f" and {nd['week']:g} mi a week" if nd.get("week") else "")
            elif short == "week":
                nx = f"{at * nd['week'] - wkv:.1f} mi a week more to {nxt.replace('your event', ev)} (your weeks are the limit: {wkv:.1f} of {nd['week']:g} mi)"
            else:
                nx = f"{at * nd['need'] - v:.1f} mi longer to {nxt.replace('your event', ev)} (your long session is the limit: {v:g} of {nd['need']:g} mi)"
            out[k] = {**base, "level": cur.replace("your event", ev) if cur else "", "event": ev, "need": nd["need"], "pct": through(L, sh), "next": nx,
                      "note": (f.get("note", "") + f" Usual week {wkv:.1f} mi; {ev} calls for {nd['week']:g}.").strip() if week_share is not None else f.get("note", "")}
        elif m["ladder"] == "reps":
            # key lifts (key_lifts.py): the figure brings its own load level, rep steps and load ladder
            f = fig.get(k) or {}
            if f.get("level"):
                out[k] = {**base, **{x: f[x] for x in ("level", "pct", "next", "rungs", "ladder_label", "rule") if x in f}}
        elif m["ladder"] == "guide" and (fig.get(k) or {}).get("scale"):
            # a general population scale the figure brings (bike_speed.scale, swim_speed.scale; the athlete, Nov 14, 2026: "search and
            # research for a basis of scale"): the level comes from it; the own-baseline guide stays for anyone with no age band and sex
            f, sc = fig[k], fig[k]["scale"]
            v = _num(f.get("num", f.get("value")))
            if v is None:
                continue
            S = {"rungs": sc["rungs"]}
            sv = v * sc.get("sign", 1)
            cur, nxt, at = rung(S, sv)
            gap = (at - sv) if nxt else None
            u = sc.get("unit", "")
            nx = ("Top of the scale" if not nxt else f"{gap:.1f} mph faster to {nxt}" if u == "mph" else
                  f"{gap:.0f} s per 100 yd faster to {nxt}" if u.startswith("s/100") else f"{gap:g} {u} to {nxt}")
            out[k] = {**base, "ladder_label": sc["label"], "rule": sc["rule"], "rungs": "|".join(x[0] for x in reversed(sc["rungs"])),
                      "level": cur, "pct": through(S, sv), "next": nx}
        elif m["ladder"] == "guide":
            f = fig.get(k)
            v, b = _num((f or {}).get("num", (f or {}).get("value"))), _num((f or {}).get("baseline"))
            if v is None:
                continue
            if b is None or not b:
                out[k] = {**base, "level": "Setting your baseline", "next": (f or {}).get("wait") or "A level appears once there are four weeks of readings"}
                continue
            pct = (v - b) / b * 100 * (m.get("better", 1))
            cur, nxt, at = rung(L, pct)
            out[k] = {**base, "level": cur, "pct": through(L, pct), "next": f"{at - pct:.0f}% more to {nxt}" if nxt else "Top of the ladder"}
    return out
