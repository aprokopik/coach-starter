"""Strength tiles (the athlete, Nov 15, 2026). Two parts, both his:

1. Key lifts, one tile each (the athlete: "pick the key strength lifts that a person does. And since we're doing increases in reps per
   set to show progress, those would be the bars. And as you work up in weight, you're going up the new bars or steps."). The
   routine already runs double progression (coach/strength.json: every set to the top of its rep range, then add the load
   step), so the level is the load and the three step bars are the reps: from the bottom of the range to the top on every set.
   One key lift per movement pattern (squat, hinge, push, pull), the loaded exercise the routine has in that slot; a swap keeps
   the tile because the tile is the pattern, not the exercise.
2. The Strength tile ranks a monthly push-up test against adults of the same age band and sex (ACSM push-up test categories;
   the athlete chose "Push-up test plus own lifts" on the card, Nov 15, 2026). Five categories, not percentiles.

Pure functions; catalog.py reads the files.
"""
from datetime import date, timedelta

PATTERNS = (("squat", "lift_squat"), ("hinge", "lift_hinge"), ("push", "lift_push"), ("pull", "lift_pull"))
LOADED = ("lb", "lb_added")

# ACSM push-up test (ACSM's Guidelines for Exercise Testing and Prescription, from the Canadian Standardized Test of Fitness):
# the lowest count of Fair, Good, Very good and Excellent by age band. Men full push-ups, women from the knees. Under 20 reads
# the 20s, 70 and over the 60s.
PUSHUP = {"male": {20: (17, 22, 29, 36), 30: (12, 17, 22, 30), 40: (10, 13, 17, 25), 50: (7, 10, 13, 21), 60: (5, 8, 11, 18)},
          "female": {20: (10, 15, 21, 30), 30: (8, 13, 20, 27), 40: (5, 11, 15, 24), 50: (2, 7, 11, 21), 60: (2, 5, 12, 17)}}
PUSHUP_LABELS = ("Needs improvement", "Fair", "Good", "Very good", "Excellent")
PUSHUP_SRC = "ACSM push-up test categories (ACSM's Guidelines for Exercise Testing and Prescription)"
PUSHUP_DAYS = 62  # a test counts on the tile for two months; the check-in asks for one every month


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _lb(x):
    return f"{x:g}"


def key_lifts(strength_rows, exercises):
    """[(tile key, pattern, lift_ex row)] for the routine's loaded exercise in each key pattern, in PATTERNS order."""
    pat = {r["id"]: r.get("pattern") for r in exercises or [] if r.get("id")}
    ex = sorted((r for r in strength_rows or [] if r.get("kind") == "lift_ex" and r.get("load") in LOADED), key=lambda r: r.get("order", 99))
    out = []
    for p, key in PATTERNS:
        r = next((x for x in ex if pat.get(x.get("id")) == p), None)
        if r:
            out.append((key, p, r))
    return out


def sessions(log_rows, ex_id):
    """{date: [(load, reps)]} for one exercise, from coach/strength_log.csv rows, sets in order."""
    out = {}
    for r in sorted(log_rows or [], key=lambda r: (str(r.get("date")), _f(r.get("set")) or 0)):
        if r.get("exercise_id") != ex_id:
            continue
        reps = _f(r.get("reps"))
        if reps is None:
            continue
        try:
            d = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        out.setdefault(d, []).append((_f(r.get("load_lb")) or 0.0, reps))
    return out


def load_word(ex, load):
    if ex.get("load") == "lb_added":
        return "Body weight" if not load else f"+{_lb(load)} lb"
    return f"{_lb(load)} lb"


def figure(ex, sess, today):
    """The tile for one key lift from its logged sessions, or None with none logged. Level = the load of the latest session;
    pct = how far its sets have climbed from the bottom of the rep range to the top on every set. Pure."""
    if not sess:
        return None
    d = max(sess)
    sets = sess[d]
    load = max(l for l, _ in sets)
    work = [r for l, r in sets if l == load]
    n, lo, hi = int(ex.get("sets") or len(work) or 1), float(ex.get("lo") or 1), float(ex.get("hi") or ex.get("lo") or 1)
    floor = lo - 1 if hi > lo else max(0.0, lo - 1)
    reps = (work + [floor] * n)[:n]  # a set not done counts as the floor of the range
    pct = max(0.0, min(1.0, sum(min(r, hi) - floor for r in reps) / max(1e-9, n * (hi - floor))))
    step = _f(ex.get("step")) or 5.0
    nxt_load = load_word(ex, load + step)
    short = [(i, int(hi - r)) for i, r in enumerate(reps, 1) if r < hi]
    if not short:
        nxt = f"Every set at {hi:g}: move up to {nxt_load} next time"
    else:
        ks = {k for _i, k in short}
        if len(short) == n and len(ks) == 1:
            k = short[0][1]
            parts = [f"{k} more rep{'s' if k != 1 else ''} on each set"]
        else:
            parts = [f"{k} more on set {i}" for i, k in short]
        nxt = f"{', '.join(parts)} to reach {hi:g} on every set, then {nxt_load}"
    loads = sorted({l for s in sess.values() for l, _ in s})
    first = loads[0]
    top = load + 2 * step
    ladder = []
    x = first
    while x <= top + 1e-9:
        ladder.append(load_word(ex, x))
        x += step
    when = f"{d.strftime('%b')} {d.day}"
    unit = "reps" if ex.get("unit", "reps") == "reps" else ex.get("unit")
    return {"name": ex.get("name") or ex.get("id"), "value": "BW" if ex.get("load") == "lb_added" and not load else (f"+{_lb(load)}" if ex.get("load") == "lb_added" else _lb(load)),
            "unit": "" if ex.get("load") == "lb_added" and not load else "lb", "level": load_word(ex, load), "pct": round(pct, 3), "next": nxt,
            "sub": f"{when}: {' · '.join(f'{r:g}' for r in work)} {unit}, range {lo:g} to {hi:g}",
            "rungs": "|".join(reversed(ladder)), "ladder_label": "Load levels, top first",
            "rule": (f"Your routine's double progression: each level is a load, and its three steps are your reps climbing from {lo:g} to {hi:g} "
                     f"on {'both' if n == 2 else f'all {n}'} sets. Top of the range on every set moves you up {_lb(step)} lb to the next level. Your own progress, not a ranking; "
                     "the Push-up test tile ranks you against adults your age."),
            "note": f"Latest session {when}. {len(sess)} session{'s' if len(sess) != 1 else ''} logged on the Lifts tab.",
            "chip": "", "num": load,
            # the opened tile's rep boxes (the athlete picked "Only the reps that count", Nov 15, 2026): one numbered box per rep of the range
            # on each set, filled when done last session, under the goal sentence
            "goal": f"{hi:g} {unit} on {'both sets' if n == 2 else f'all {n} sets' if n > 2 else 'your set'} moves you to {nxt_load}",
            "box_lo": int(lo), "box_hi": int(hi), "box_reps": ",".join(f"{r:g}" for r in reps[:n]), "box_when": when}


# Powerlifting comparison (the athlete, Sprint Review note, Nov 15, 2026: "if I was doing back squat and dead lift ... you would want
# to compare me to powerlifters, but since I'm not we will need some other method. Some users might though"). Only an exercise
# whose library row says norm: powerlifting (barbell back squat, bench press, deadlift: the three competition lifts) is ranked
# against van den Hoek 2024 (coach/norms.json keys pl_squat, pl_bench, pl_deadlift), as estimated best single over body weight
# for the person's sex and age. Everyone else keeps the double progression ladder above (their own progress) and the push-up test.
PL_BANDS = ((12, 17, "12-17"), (18, 35, "18-35"), (36, 59, "36-59"), (60, 79, "60-79"), (80, 200, "80+"))


def pl_band(age):
    for lo, hi, b in PL_BANDS:
        if lo <= age <= hi:
            return b
    return None


def pl_norm(norm_rows, key, sex, age):
    """The norms.json row for this competition lift, sex and age, or None."""
    b = pl_band(age) if age is not None else None
    return next((r for r in norm_rows or [] if r.get("key") == key and r.get("sex") == sex and r.get("age_band") == b), None)


def pl_rank(norm, ratio):
    """(level name, share of the way through it 0..1, next level name or None, ratio needed for it or None, percentile). Pure."""
    import fit_ladder
    import vo2_norms
    p = fit_ladder.percentile(norm, ratio)
    for i, (name, lo, hi) in enumerate(vo2_norms.FIT_BANDS):
        if (lo is None or p >= lo) and (hi is None or p < hi):
            through = 1.0 if hi is None else (0.0 if lo is None and p <= 0 else (p - (lo or 0)) / (hi - (lo or 0)))
            nxt = vo2_norms.FIT_BANDS[i + 1] if i + 1 < len(vo2_norms.FIT_BANDS) else None
            need = fit_ladder.value_at(norm, nxt[1])[0] if nxt else None
            return name, max(0.0, min(1.0, through)), (nxt[0] if nxt else None), need, p
    return None


def pl_figure(fig, ex, sess, norm, bw):
    """Turn a key lift's own progress figure into a powerlifting ranking. fig from figure(); sess its sessions; norm from
    pl_norm; bw the latest body weight in lb. Returns fig unchanged when anything is missing. Pure."""
    if not fig or not norm or not bw:
        return fig
    best = max(l * (1 + r / 30) for s in sess.values() for l, r in s if l)  # Epley, as lift_history.json
    ratio = best / bw
    rk = pl_rank(norm, ratio)
    if not rk:
        return fig
    name, through, nxt, need, p = rk
    import vo2_norms
    more = (need * bw - best) if need else None
    out = dict(fig)
    out.update({"level": name, "pct": round(through, 3),
                "next": f"{more:.0f} lb more on your estimated best single to {nxt}" if nxt else "Top of the scale",
                "rungs": "|".join(n for n, _lo, _hi in reversed(vo2_norms.FIT_BANDS)),
                "ladder_label": f"{norm['population'].split(',')[0].capitalize()}, powerlifters",
                "rule": (f"Where your estimated best single ({best:.0f} lb from your sets, Epley) over your body weight ({bw:.0f} lb), "
                         f"{ratio:.2f} times, sits among {norm['population']}: {norm['source']}. Lifters who compete, not the "
                         "general population, so the middle of this scale is already strong. The 25th and 75th are Estimated. "
                         "Your reps toward the next load still show on the Lifts tab."),
                "chip": f"{ratio:.2f}× body weight", "pl_ratio": round(ratio, 2), "pl_pct": round(p, 1)})
    return out


def pushup_tiers(g):
    """[(label, lowest count)] lowest first for the person's age band and sex, or None with no group."""
    if not g or g.get("sex") not in PUSHUP:
        return None
    lo = int(str(g.get("band", "30-39")).split("-")[0].rstrip("+") or 30)
    tab = PUSHUP[g["sex"]]
    edges = tab[max([a for a in tab if a <= max(20, lo)] or [20])]
    return [(PUSHUP_LABELS[0], 0)] + list(zip(PUSHUP_LABELS[1:], edges))


def pushup_scale(g):
    """The Strength tile's scale for ladders.py (guide ladder with a figure scale), or None with no group. Pure."""
    t = pushup_tiers(g)
    if not t:
        return None
    how = "full push-ups" if g["sex"] == "male" else "push-ups from the knees"
    return {"rungs": [[t[0][0], -10000.0]] + [[lab, float(v)] for lab, v in t[1:]], "unit": "push-ups", "sign": 1,
            "label": f"{g['label'].capitalize()}, ACSM push-up test",
            "rule": (f"Where your push-up count sits among {g['label']}: {PUSHUP_SRC}, {how} to failure without resting. "
                     "Five categories, not percentiles. Your lifts show their own progress on the key lift tiles.")}


def pushup_latest(health_rows, today):
    """(date, count) of the latest push-up test within PUSHUP_DAYS, or None."""
    best = None
    for r in health_rows or []:
        if r.get("kind") != "selftest" or r.get("key") != "pushup":
            continue
        v = _f(r.get("value"))
        try:
            d = date.fromisoformat(str(r.get("date"))[:10])
        except ValueError:
            continue
        if v is None or d > today or d < today - timedelta(days=PUSHUP_DAYS):
            continue
        if best is None or d >= best[0]:
            best = (d, v)
    return best


def pushup_figure(health_rows, today, g):
    """The Strength tile: the latest push-up test with its scale, or a waiting tile that says how to start. Pure."""
    p = pushup_latest(health_rows, today)
    if not p:
        return {"sub": "Take the push-up test in this month's check-in: as many as you can without resting."}
    d, v = p
    return {"value": f"{v:g}", "num": v, "unit": "push-ups", "sub": f"Push-up test, {d.strftime('%b')} {d.day}", "scale": pushup_scale(g),
            "note": f"Push-up test on {d.strftime('%b')} {d.day}. The monthly check-in asks for a new one."}
