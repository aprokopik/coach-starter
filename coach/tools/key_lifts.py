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
