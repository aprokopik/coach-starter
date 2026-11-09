"""VO2max reference norms by sex, age band and test mode, and the ladders the dashboard builds from them.

Source: FRIEND registry 2022 update, Kaminsky et al., Mayo Clin Proc 2022;97(2):285-293, Table 3 (tests with RER 1.0 or more),
VO2peak in ml/kg/min, percentiles 10 to 90. Treadmill norms read Garmin's running estimate; cycle ergometer norms read its cycling
estimate. Cycle values sit below treadmill values for the same people, so a sport is only ever compared with its own mode.

The athlete's group comes from coach/athlete/profile.json: "sex" ("male" or "female") and either "birth_year" (the band follows the
calendar) or "age_band" ("30-39"). A coach set up before those keys existed falls back to setup/answers.json (athlete.sex,
athlete.birth_year). With no group the markers show the number without levels and say what to add.
"""
import json
import os

PCTS = (10, 20, 30, 40, 50, 60, 70, 80, 90)
BANDS = ("20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89")
SOURCE = "FRIEND registry 2022 (Kaminsky, Mayo Clin Proc 2022, Table 3, RER 1.0 or more)"

# mode -> sex -> band -> values at PCTS
TABLE = {
    "treadmill": {
        "male": {"20-29": (28.6, 35.2, 40.0, 43.6, 46.5, 49.0, 51.9, 54.5, 58.6), "30-39": (24.9, 29.8, 33.5, 37.0, 39.7, 43.4, 46.4, 50.0, 55.5),
                 "40-49": (22.1, 26.7, 29.7, 32.4, 35.3, 37.9, 40.9, 45.2, 50.8), "50-59": (18.6, 22.2, 24.5, 26.9, 29.2, 31.8, 34.3, 38.3, 43.4),
                 "60-69": (15.8, 18.5, 20.7, 22.8, 24.6, 26.5, 28.7, 32.0, 37.1), "70-79": (13.6, 15.9, 17.3, 19.1, 20.6, 22.2, 23.8, 25.9, 29.4),
                 "80-89": (12.9, 14.8, 16.1, 16.6, 17.6, 18.4, 20.0, 21.4, 22.8)},
        "female": {"20-29": (22.5, 27.2, 30.8, 34.0, 36.6, 39.0, 41.8, 44.8, 49.0), "30-39": (18.6, 21.9, 24.2, 26.4, 28.3, 31.0, 33.6, 37.0, 42.1),
                   "40-49": (17.2, 19.7, 21.8, 23.9, 25.7, 27.7, 30.0, 33.0, 37.8), "50-59": (16.5, 18.5, 20.1, 21.5, 22.9, 24.6, 26.3, 28.4, 32.4),
                   "60-69": (13.4, 15.4, 17.0, 18.3, 19.6, 20.9, 22.4, 24.3, 27.3), "70-79": (12.3, 14.0, 15.2, 16.2, 17.2, 18.3, 19.6, 20.8, 22.8),
                   "80-89": (11.4, 12.6, 13.7, 14.7, 15.4, 16.0, 17.3, 18.4, 20.8)},
    },
    "cycle": {
        "male": {"20-29": (28.8, 34.5, 37.4, 40.8, 44.0, 48.3, 52.8, 57.0, 62.2), "30-39": (19.1, 22.6, 25.7, 27.9, 30.2, 31.6, 35.5, 39.0, 50.5),
                 "40-49": (19.8, 21.9, 23.8, 25.4, 27.4, 29.0, 31.4, 35.1, 41.9), "50-59": (17.2, 20.2, 22.0, 23.1, 24.5, 26.3, 28.4, 31.6, 37.1),
                 "60-69": (14.7, 17.5, 19.1, 20.7, 21.7, 23.3, 24.5, 27.0, 31.4), "70-79": (11.0, 14.7, 16.0, 17.1, 18.3, 19.4, 20.6, 22.6, 26.2),
                 "80-89": (8.4, 9.7, 11.1, 12.2, 13.2, 14.6, 16.2, 17.3, 18.7)},
        "female": {"20-29": (18.8, 21.9, 25.6, 28.9, 31.6, 34.3, 37.5, 40.9, 46.0), "30-39": (15.0, 17.0, 18.6, 19.9, 21.6, 22.9, 24.5, 27.0, 32.0),
                   "40-49": (13.7, 15.4, 16.6, 17.9, 18.8, 20.3, 21.8, 23.5, 27.3), "50-59": (13.0, 14.3, 15.2, 16.1, 16.9, 17.8, 18.9, 20.4, 22.4),
                   "60-69": (12.2, 13.4, 14.2, 15.0, 15.7, 16.4, 17.4, 18.5, 20.3), "70-79": (10.7, 12.0, 12.9, 13.6, 14.5, 15.0, 15.9, 16.8, 18.0),
                   "80-89": (7.8, 8.7, 9.4, 10.1, 10.9, 11.3, 12.9, 14.3, 18.1)},
    },
}
MODE_WORD = {"treadmill": "treadmill tests", "cycle": "cycle tests"}
PLATEAU = 49.0  # Kokkinos 2022: the lowest-risk plateau, about 14 METs; an absolute figure, not an age norm


def _sex(s):
    s = str(s or "").strip().lower()
    return "male" if s in ("male", "m", "man", "men") else "female" if s in ("female", "f", "woman", "women") else None


def _band(age):
    if age is None:
        return None
    lo = max(20, min(80, int(age) // 10 * 10))
    return f"{lo}-{lo + 9}"


def group(today, root="."):
    """The athlete's norm group {sex, band, label, how} or None."""
    prof = {}
    p = os.path.join(root, "coach/athlete/profile.json")
    if os.path.exists(p):
        with open(p) as fh:
            prof = json.load(fh)
    sex, by, band = _sex(prof.get("sex")), prof.get("birth_year"), prof.get("age_band")
    a = os.path.join(root, "setup/answers.json")
    if (sex is None or (by is None and band is None)) and os.path.exists(a):
        with open(a) as fh:
            ath = json.load(fh).get("athlete") or {}
        sex = sex or _sex(ath.get("sex"))
        by = by or ath.get("birth_year")
    if by:
        band = _band(today.year - int(by))
    if sex is None or band not in BANDS:
        return None
    word = "men" if sex == "male" else "women"
    return {"sex": sex, "band": band, "label": f"{word} {band.replace('-', '–')}",
            "how": "from your birth year" if by else "set in your profile"}


def points(mode, g):
    """[(percentile, value)] for the group, or [] with no group."""
    if not g:
        return []
    return list(zip(PCTS, TABLE[mode][g["sex"]][g["band"]]))


def percentile(v, pts):
    """Interpolated percentile (int), 'under 10th', 'over 90th' or None."""
    if v is None or not pts:
        return None
    if v <= pts[0][1]:
        return "under 10th"
    if v >= pts[-1][1]:
        return "over 90th"
    for (p1, v1), (p2, v2) in zip(pts, pts[1:]):
        if v1 <= v <= v2:
            return round(p1 + (v - v1) / (v2 - v1) * (p2 - p1))
    return None


def at(pts, p):
    return dict(pts).get(p)


def health_tiers(pts, label):
    """The Health ladder: five bands, the 60th percentile is the target."""
    if not pts:
        return []
    q = dict(pts)
    return [("Well below average", None, q[20], f"under the 20th percentile, {label} (FRIEND 2022); the 10th is {q[10]}"),
            ("Below average", q[20], q[40], f"20th–40th percentile, {label} (FRIEND 2022)"),
            ("Average", q[40], q[60], "40th–60th percentile"),
            ("Above average", q[60], q[80], "60th–80th percentile" + (", about 49 is the lowest-risk plateau (Kokkinos 2022)" if q[60] <= PLATEAU < q[80] else "")),
            ("High", q[80], None, "80th percentile and up, no upper limit of benefit found (Mandsager 2018)")]


# Fitness bands (the athlete, Nov 8, 2026, "as a rule"): named by where you stand in the population, finer near the top where gains slow.
# Edges are percentiles from the bottom. FRIEND gives the 10th to 90th: the thirds are read between its 30th and 40th, 60th and 70th;
# above the 90th the edges come from a normal tail fitted to its 50th and 90th (Estimated, the registry publishes nothing finer).
FIT_BANDS = (("Bottom 10%", None, 10), ("Bottom 20%", 10, 20), ("Bottom third", 20, 100 / 3), ("Bottom half", 100 / 3, 50), ("Top half", 50, 200 / 3), ("Top third", 200 / 3, 80),
             ("Top 20%", 80, 90), ("Top 10%", 90, 95), ("Top 5%", 95, 99), ("Top 1%", 99, 99.5), ("Top 0.5%", 99.5, None))
# Sub-levels per band (the athlete, Nov 8: "as returns diminish or slow, more levels and break downs"): more, smaller steps up top so a
# milestone still arrives every few weeks; the bottom half gets more bands too (the athlete, Nov 8: "a few more levels to the bottom half"),
# so someone starting out also climbs often. Coach guide, not evidence; never finer than the watch reports.
FIT_SPLITS = (1, 3, 3, 4, 3, 4, 6, 8, 10, 4, 1)
Z = {95: 1.6449, 99: 2.3263, 99.5: 2.5758}


def value_at(pts, p):
    """The VO2max at percentile p (from the bottom): linear inside the table, a normal tail above the 90th."""
    q = dict(pts)
    if p in q:
        return q[p]
    if p > 90:
        sd = (q[90] - q[50]) / 1.2816
        return round(q[50] + Z[p] * sd, 1)
    lo = max(k for k in q if k <= p); hi = min(k for k in q if k >= p)
    return round(q[lo] + (q[hi] - q[lo]) * (p - lo) / (hi - lo), 1)


def fitness_splits(tiers, resolution=0.1):
    out = []
    for (l, lo, hi, _n), n in zip(tiers, FIT_SPLITS):
        if lo is None or hi is None:
            out.append(1)
        else:
            out.append(max(1, min(n, int(round((hi - lo) / resolution, 6)))))
    return out


def _pct(p):
    return {100 / 3: "33rd", 200 / 3: "67th", 99.5: "99.5th"}.get(p) or f"{round(p)}th"


def fitness_tiers(pts, mode, label):
    """The Fitness ladder in the athlete's population bands, run on treadmill norms and bike on cycle norms."""
    if not pts:
        return []
    w = MODE_WORD[mode]
    out = []
    for name, a, b in FIT_BANDS:
        lo = None if a is None else value_at(pts, a)
        hi = None if b is None else value_at(pts, b)
        span = f"under the {_pct(b)} percentile" if a is None else f"past the {_pct(a)} percentile" if b is None else f"{_pct(a)} to {_pct(b)} percentile"
        est = ", Estimated: a normal tail fitted to the registry's 50th and 90th" if (a or 0) >= 90 and (b is None or b > 90) else ""
        extra = ", the Health target (60th) sits here" if mode == "treadmill" and (a or 0) <= 60 < (b or 101) else ""
        extra += ", about 49 is the lowest-risk plateau (Kokkinos 2022)" if mode == "treadmill" and (lo or 0) <= PLATEAU < (hi or 999) else ""
        out.append((name, lo, hi, f"{span}, {w}, FRIEND 2022 {label}{extra}{est}"))
    return out
