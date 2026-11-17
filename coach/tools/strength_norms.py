"""General population strength levels (the athlete, Nov 16, 2026; alpha strength_levels, epic strength_levels).

Strength reads like the other Fitness tiles: a percentile level among adults of the person's sex, age and body weight
(Top third, Top 20%, ...), three steps that fill with reps toward the next level, and stage coins:
  Stage 1 Everyone: all adults, lifters or not.
  Stage 2 Trained: people who lift. Unlocks the first time a session reaches Top 20% of everyone (the same rule as the
          other Fitness stages); reached stays reached.
  Stage 3 Elite: no scale on file yet (dashed).

The model (Estimated):
- Lifters: Strength Level standards (strengthlevel.com, lb, by sex and body weight). Beginner, Novice, Intermediate,
  Advanced and Elite are stronger than 5, 20, 50, 80 and 95% of lifters; between them the curve is log-normal.
- Share who lift: 32% of adults (Healthy People 2030 muscle strengthening objective, 32.9% in 2024).
- Everyone else: loads log-normal with the Beginner standard as the median (spread 0.30); push-ups median 15 for men (5 for
  women), Top 20% at 25 (checked against the ACSM push-up table, median 19 for men 30 to 39); pull-ups: 25% of men and 5% of
  women can do one, median 4 among them.
- Age: every standard times a factor from the decline in grip strength by decade (Dodds et al. 2014, PLoS One; 1.00
  under 40, 0.95 in the 40s, 0.88 50s, 0.80 60s, 0.70 from 70).
- An exercise with no table of its own borrows a close one with a factor (exercises.json `gp`), marked Estimated.

Sets become an estimated best single by Epley, load x (1 + reps / 30). Body weight moves are counted in reps: a
weighted pull-up is turned into the bodyweight reps of the same estimated best single. Pure functions; catalog.py reads files.
"""
import math
from statistics import NormalDist

N = NormalDist()
LIFT_SHARE = 0.32
LIFTER_P = (5, 20, 50, 80, 95)
SOURCE = ("Estimated from Strength Level lifter standards (strengthlevel.com) mixed with the 68% of adults who do not lift "
          "(Healthy People 2030), adjusted for age (grip strength decline, Dodds 2014)")
# Strength Level standards, one-rep max (reps for bodyweight moves), Beginner..Elite, by body weight in lb; dumbbell moves per dumbbell
SL = {
    "male": {
        "bw": (110, 120, 150, 180, 210, 240),
        "pull_ups": ((0.3, 6, 14, 24, 34), (0.3, 7, 14, 24, 34), (0.5, 7, 14, 22, 31), (1, 7, 13, 21, 28), (1, 7, 12, 19, 26), (0.5, 6, 11, 17, 24)),
        "push_ups": ((0.5, 18, 42, 70, 102), (2, 19, 42, 69, 99), (5, 20, 40, 64, 91), (6, 20, 38, 60, 83), (6, 19, 36, 55, 76), (6, 18, 34, 52, 71)),
        "squat": ((79, 120, 172, 234, 301), (92, 136, 192, 257, 327), (132, 184, 247, 320, 399), (169, 228, 298, 377, 462), (205, 269, 344, 430, 520), (238, 307, 387, 477, 572)),
        "rdl": ((69, 112, 167, 234, 307), (81, 126, 185, 255, 331), (115, 168, 235, 313, 397), (147, 207, 280, 364, 455), (178, 243, 321, 411, 508), (206, 276, 360, 454, 555)),
        "goblet": ((20, 39, 66, 100, 140), (22, 42, 70, 106, 146), (29, 51, 82, 120, 163), (35, 59, 92, 132, 177), (40, 67, 101, 143, 189), (46, 73, 109, 153, 201)),
        "incline_db": ((23, 36, 52, 71, 92), (27, 40, 57, 78, 100), (38, 54, 74, 96, 121), (49, 66, 88, 113, 139), (59, 78, 101, 128, 156), (68, 89, 114, 142, 171)),
        "db_row": ((18, 34, 56, 84, 115), (22, 39, 63, 92, 124), (33, 54, 81, 113, 149), (44, 67, 97, 132, 171), (54, 79, 112, 149, 190), (64, 91, 125, 165, 208)),
        "db_press": ((15, 26, 41, 59, 80), (18, 30, 46, 65, 87), (26, 40, 59, 80, 104), (34, 50, 71, 94, 120), (42, 60, 82, 107, 134), (49, 68, 92, 118, 147)),
    },
    "female": {
        "bw": (100, 120, 150, 180, 210, 240),
        "pull_ups": ((0.1, 0.5, 6, 13, 22), (0.1, 0.5, 6, 13, 21), (0.1, 0.5, 6, 11, 18), (0.1, 0.5, 5, 10, 16), (0.1, 0.5, 3, 8, 13), (0.1, 0.5, 2, 7, 11)),
        "push_ups": ((0.3, 6, 19, 35, 53), (0.3, 7, 19, 33, 49), (0.3, 7, 17, 30, 44), (0.3, 7, 16, 27, 40), (0.3, 6, 14, 25, 36), (0.3, 5, 12, 22, 32)),
        "squat": ((50, 84, 129, 183, 243), (63, 100, 148, 206, 269), (80, 121, 174, 235, 303), (95, 140, 196, 261, 332), (109, 157, 216, 284, 358), (122, 172, 234, 305, 381)),
        "rdl": ((56, 88, 129, 178, 232), (64, 98, 141, 192, 247), (74, 110, 155, 209, 267), (82, 120, 168, 223, 283), (90, 130, 179, 236, 297), (97, 138, 188, 247, 310)),
        "goblet": ((20, 34, 53, 77, 103), (22, 36, 56, 80, 107), (24, 39, 59, 84, 111), (25, 41, 62, 87, 115), (27, 43, 64, 90, 118), (28, 45, 66, 92, 121)),
        "incline_db": ((11, 20, 32, 48, 65), (14, 24, 38, 54, 72), (19, 30, 45, 63, 82), (23, 36, 51, 70, 91), (27, 40, 57, 77, 98), (31, 45, 62, 83, 105)),
        "db_row": ((15, 26, 40, 57, 76), (18, 29, 44, 62, 82), (21, 33, 49, 68, 89), (24, 37, 54, 73, 95), (27, 41, 58, 78, 100), (29, 44, 61, 82, 105)),
        "db_press": ((10, 17, 27, 38, 52), (12, 20, 30, 43, 57), (15, 24, 35, 48, 63), (18, 27, 39, 53, 68), (20, 30, 43, 57, 73), (22, 33, 46, 61, 78)),
    },
}
REPS = ("pull_ups", "push_ups")
# non-lifters: (median, spread) of a log-normal; pull-ups add the share who can do one
NONLIFT_PUSH = {"male": (15.0, math.log(25 / 15) / 0.8416), "female": (5.0, math.log(25 / 15) / 0.8416)}
NONLIFT_PULL = {"male": (0.25, 4.0, 0.6), "female": (0.05, 2.0, 0.6)}
AGE = ((40, 1.0), (50, 0.95), (60, 0.88), (70, 0.80), (200, 0.70))
STAGES = ((1, "Everyone"), (2, "Trained"), (3, "Elite"))
UNLOCK = 80.0  # Top 20% of a stage unlocks the next one
# The Compare with coins show on a lift once its best set reaches the longevity goal: Top third of everyone, the strongest
# third of men in Ruiz et al. 2008 (BMJ 337:a439) had the lowest death rates (the athlete, Nov 16, 2026: "not until you have at
# least reached the longevity goal"; the line is this one number).
LONGEVITY = 100 * 2 / 3


def age_factor(age):
    if age is None:
        return 1.0
    return next(f for top, f in AGE if age < top)


def standards(sex, bw, std, age=None):
    """The five lifter standards (Beginner..Elite) for this sex, body weight and age, or None. Pure."""
    t = SL.get(sex)
    if not t or std not in t or not bw:
        return None
    xs, rows = t["bw"], t[std]
    if bw <= xs[0]:
        v = rows[0]
    elif bw >= xs[-1]:
        v = rows[-1]
    else:
        i = next(i for i in range(len(xs) - 1) if xs[i] <= bw <= xs[i + 1])
        w = (bw - xs[i]) / (xs[i + 1] - xs[i])
        v = tuple(a + (b - a) * w for a, b in zip(rows[i], rows[i + 1]))
    f = age_factor(age)
    return tuple(x * f for x in v)


def lifter_cdf(x, pts):
    """Share of lifters below x, from the five standards, log-normal between and beyond them."""
    xs = [math.log(max(v, 0.01)) for v in pts]
    zs = [N.inv_cdf(p / 100) for p in LIFTER_P]
    lx = math.log(max(x, 0.01))
    if lx <= xs[0]:
        return N.cdf(zs[0] + (lx - xs[0]) * (zs[1] - zs[0]) / (xs[1] - xs[0]))
    if lx >= xs[-1]:
        return N.cdf(zs[-1] + (lx - xs[-1]) * (zs[-1] - zs[-2]) / (xs[-1] - xs[-2]))
    for i in range(4):
        if xs[i] <= lx <= xs[i + 1]:
            return N.cdf(zs[i] + (lx - xs[i]) * (zs[i + 1] - zs[i]) / (xs[i + 1] - xs[i]))
    return 0.0


def nonlift_cdf(x, std, pts, sex, age):
    f = age_factor(age)
    if std == "push_ups":
        med, s = NONLIFT_PUSH.get(sex, NONLIFT_PUSH["male"])
        return N.cdf((math.log(max(x, 0.01)) - math.log(med * f)) / s)
    if std == "pull_ups":
        can, med, s = NONLIFT_PULL.get(sex, NONLIFT_PULL["male"])
        if x < 1:
            return (1 - can) * max(0.0, x)
        return (1 - can) + can * N.cdf((math.log(x) - math.log(med * f)) / s)
    return N.cdf((math.log(max(x, 0.01)) - math.log(pts[0])) / 0.30)


def percentile(x, std, sex, bw, age=None, stage=1):
    """Percent of the stage's population below x (stage 1 everyone, stage 2 lifters), or None. Pure."""
    pts = standards(sex, bw, std, age)
    if not pts:
        return None
    lc = lifter_cdf(x, pts)
    if stage >= 2:
        return 100 * lc
    return 100 * (LIFT_SHARE * lc + (1 - LIFT_SHARE) * nonlift_cdf(x, std, pts, sex, age))


def value_at(p, std, sex, bw, age=None, stage=1):
    """The reading at percentile p (inverse of percentile), by bisection in log space. Pure."""
    lo, hi = 0.01, 5000.0
    for _ in range(60):
        m = math.sqrt(lo * hi)
        if (percentile(m, std, sex, bw, age, stage) or 0) < p:
            lo = m
        else:
            hi = m
    return hi


def band(p):
    """(level name, share of the way through it, next level name or None, its lower edge or None), on the Fitness bands."""
    import vo2_norms
    B = vo2_norms.FIT_BANDS
    for i, (name, lo, hi) in enumerate(B):
        if (lo is None or p >= lo) and (hi is None or p < hi):
            through = 1.0 if hi is None else (p - (lo or 0)) / (hi - (lo or 0))
            nxt = B[i + 1] if i + 1 < len(B) else None
            return name, max(0.0, min(1.0, through)), (nxt[0] if nxt else None), (nxt[1] if nxt else None)
    return B[0][0], 0.0, B[1][0], B[1][1]


def epley(load, reps):
    return load * (1 + reps / 30.0)


def reading(ex, load, reps, bw):
    """A set as the scale's unit: estimated best single in lb, or bodyweight reps for a bodyweight move. Pure."""
    gp = ex.get("gp") or {}
    std, k = gp.get("std"), float(gp.get("k", 1.0))
    if std in REPS:
        if ex.get("load") == "lb_added" and bw:
            return 30.0 * (epley(bw + (load or 0), reps) / bw - 1)
        return reps * k
    return epley(load or 0, reps) / k if k else None


def reps_for(ex, load, target, bw):
    """Reps at this load that reach the target reading. Pure."""
    gp = ex.get("gp") or {}
    std, k = gp.get("std"), float(gp.get("k", 1.0))
    if std in REPS:
        if ex.get("load") == "lb_added" and bw:
            one = bw * (1 + target / 30.0)
            return 30.0 * (one / (bw + (load or 0)) - 1)
        return target / k
    if not load:
        return None
    return 30.0 * (target * k / load - 1)


def _w(x):
    return f"{x:g}"


def load_word(ex, load):
    if ex.get("load") == "lb_added":
        return "BW" if not load else f"+{_w(load)} lb"
    if ex.get("load") == "bw" or not ex.get("load"):
        return ""
    return f"{_w(load)} lb"


def top_set(sets):
    """(load, reps) of the best set of a session by estimated best single."""
    return max(sets, key=lambda s: (epley(s[0] or 0, s[1]), s[1]))


def row(ex, sess, g, bw, age, name=None):
    """One strength row: its exercise, latest top set, level among everyone (or lifters once unlocked), steps and next.
    ex is the routine's lift_ex row merged with its exercises.json row; sess from key_lifts.sessions; g the age band and
    sex (vo2_norms.group). Returns a dict, or one that says why it cannot be placed. Pure."""
    exn = ex.get("name") or ex.get("id")
    gp = ex.get("gp") or {}
    base = {"ex": exn, "plane": name or ""}
    if not gp.get("std"):
        return {**base, "level": "", "why": "Own progress only: no population table for this exercise yet"}
    if not g or not g.get("sex") or not bw:
        return {**base, "level": "", "why": "Add your sex, birth year and a weigh-in to place it"}
    if not sess:
        return {**base, "level": "", "why": f"Log {exn} on the Lifts tab to place it"}
    sex, std = g["sex"], gp["std"]
    d = max(sess)
    load, reps = top_set(sess[d])
    x = reading(ex, load, reps, bw)
    best = max(reading(ex, l, r, bw) for s in sess.values() for l, r in s)
    best1 = percentile(best, std, sex, bw, age, 1) or 0
    unlocked = best1 >= UNLOCK
    stage = 2 if unlocked else 1
    p = percentile(x, std, sex, bw, age, stage)
    # Compare with: coins from the longevity goal on; once Trained is the stage in use, the Everyone coin reads this level
    cmp = {"cmp": 1} if best1 >= LONGEVITY - 1e-9 else {}
    if unlocked:
        p1 = percentile(x, std, sex, bw, age, 1)
        if p1 is not None:
            cmp.update({"level1": band(p1)[0], "pctl1": round(p1, 1)})
    lvl, thru, nxt, edge = band(p)
    if nxt:
        target = value_at(edge, std, sex, bw, age, stage)
        r = reps_for(ex, load, target, bw)
        step = float(ex.get("step") or 5)
        if r is not None and r <= max(15, float(ex.get("hi") or 12) + 3):
            lw = load_word(ex, load)
            nx = f"{(lw + ' × ') if lw else ''}{max(math.ceil(r - 1e-9), int(reps) + 1)} reaches {nxt}"
        else:
            l2 = (load or 0) + step
            r2 = reps_for(ex, l2, target, bw)
            nx = f"{load_word(ex, l2)} × {max(1, math.ceil(r2 - 1e-9))} reaches {nxt}" if r2 is not None and r2 <= 15 else f"More reps or load to {nxt}"
    else:
        nx = "Top of the scale"
    lw = load_word(ex, load)
    est = " · Estimated" if gp.get("k") not in (None, 1, 1.0) else ""
    return {**base, "value": f"{lw} × {reps:g}" if lw else f"{reps:g}", "unit": "" if lw else (" a side" if ex.get("per_side") else " reps"),
            "level": lvl, "pct": round(thru, 3), "next": nx + est, "stage": stage, "have": "1,2", "pctl": round(p, 1),
            "when": f"{d.strftime('%b')} {d.day}", **cmp}
