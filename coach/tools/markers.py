"""Fitness performance and health/longevity markers for the dashboard's Trends tab.

Called by build_dashboard.py. Returns rows:
  kind "marker": one tile (section fitness or health), with value, sub line, status, why and how.
  kind "mpt": chart points for a marker (key, date, value, extra).
Every number comes from data/ or coach/ files. Labels: Measured, Calculated, Estimated, Reported.
"""
import csv
import glob
import json
import statistics
import os
import re
from datetime import date, datetime, timedelta

import fit_ladder
import ride_dist
import trail_effort
import hr_anchor
import vo2_norms
import checkins

def mss(sec):
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


HEIGHT_IN = 68.5  # Reported in CURRENT-STATE (about 5 ft 8.5 in)

# Direction (-1 = lower is better) and the number of equal sub-tiers the page cuts inside each finite band (the athlete, Oct 23: more, nearer milestones).
# Sub-tiers are equal steps inside an evidence band, not evidence themselves; integer counts (consistency, strength, sauna) are not split.
BETTER = {"t40k": -1, "t20k": -1, "t90k": -1, "t100k": -1, "t100mi": -1, "swim100": -1, "swim400": -1, "swim750": -1, "swim1500": -1, "swim": -1, "5k": -1, "mile": -1, "10k": -1, "half": -1, "marathon": -1, "durability": -1, "rhr": -1, "sleepreg": -1, "run": -1, "trailgap": -1, "trailspeed": -1, "traildur": -1}
SPLIT = {"p1": 1, "p5": 1, "p60": 1, "t40k": 3, "t20k": 3, "t90k": 3, "t100k": 3, "t100mi": 3, "swim100": 3, "swim400": 3, "swim750": 3, "swim1500": 3, "p20": 3, "5k": 3, "mile": 3, "10k": 3, "half": 3, "marathon": 3, "swim": 3, "wkg": 3, "ftp": 3, "run": 3, "bike": 3, "vo2": 3, "rhr": 3, "sleepreg": 3, "le8": 3, "durability": 3, "aerobic": 3, "vo2bike": 3, "vo2run": 3,
         "consistency": 1, "strength": 1, "sauna": 1, "selftests": 1, "physical": 1, "trail": 3, "lifts": 1, "trailgap": 3, "trailspeed": 3, "climb": 3, "climb150": 3, "climbsteep": 3, "traildur": 3}

# Basis of each band (the athlete, Oct 23): "research" = papers or population statistics, "race" = a race target or forecast, "coach" = a coaching
# convention or guide with no study behind it. The page colours bands by basis. Default per marker, with per-band overrides by label.
BASIS = {"vo2": "research", "rhr": "research", "le8": "research", "strength": "research", "sauna": "research", "consistency": "research",
         "5k": "research", "half": "research", "marathon": "research", "swim": "research", "wkg": "research", "ftp": "research", "durability": "research", "traildur": "research", "sleepreg": "coach", "run": "research", "bike": "research",
         "trail": "coach", "trailgap": "coach", "trailspeed": "coach", "climb": "coach", "climb150": "coach", "climbsteep": "coach", "lifts": "coach", "aerobic": "research", "vo2bike": "research", "vo2run": "research"}
BASIS_OVERRIDE = {("consistency", "Better"): "coach", ("consistency", "Best"): "coach", ("consistency", "Watch"): "coach",
                  ("swim", "Cutoff risk"): "race",
                  ("durability", "Low decoupling"): "research", ("durability", "Moderate decoupling"): "research", ("durability", "High decoupling"): "research"}
# What fixes each scale and what moves it (shown as the Anchor line). Scales never move by themselves; every change is logged.
ANCHOR = {
    # Short on purpose (the athlete, Nov 15, 2026): who the levels compare you with and what is special about this tile. What levels, steps,
    # estimated edges and block lines are is said once for every tile on the page (app.js LEVELS_HELP), never repeated here.
    # Ranked tiles start "Levels come from <group> for your sex...": ANCHOR_SRC swaps the group for the scale in use.
    "run": "Levels come from all 70.3 run splits (Knechtle 2023) as pace per mile if held for the 13.1 mi run leg, for your sex. No coaching scale exists for pace at a set heart rate. The target line is your own, from your profile, or a plain coach guide.",
    "bike": "Levels come from all 70.3 bike splits (Knechtle 2023), turned into flat course watts by a power model (Estimated), for your sex. No coaching scale exists for power at a set heart rate. The target line is your own, from your profile, or a plain coach guide.",
    "swim": "Levels come from all IRONMAN 70.3 finishers 2004–2020 (Knechtle 2023, normal fit to the published mean and SD) for your sex. The Cutoff risk band uses the race's 1.2 mi and 1:10 cutoff (estimated until the 2027 guide). Pool pace is not open water race pace, and a 70.3 is usually non-wetsuit.",
    "ftp": "Levels come from the one W/kg spread in the library (one Zwift event, both sexes; weak) for your sex where published (not yet). Shown in watts at your test-day weight; they move only when a new FTP result lands.",
    "wkg": "Levels come from the one W/kg spread in the library (one Zwift event, both sexes; weak) for your sex where published (not yet).",
    "5k": "Levels come from 2.2 million US 5K results, 2024 for your sex and age band. WMA age grade is given as a second reference.",
    "durability": "Levels come from 82,303 recreational marathoners (Smyth 2022), two published points, for your sex where published (not yet). Theirs was measured over about 4 h, so the ranking flatters a 90 min session. Under 5% stays the coaching target (Friel).",
    "traildur": "Levels come from 82,303 recreational marathoners (Smyth 2022), two published points, for your sex where published (not yet). Theirs was measured over about 4 h, so the ranking flatters a 90 min session. Under 5% stays the coaching target (Friel).",
    "sleepreg": "Coach guide, fixed; replaced if a Sleep Regularity Index becomes computable from the watch.",
    "vo2": "FRIEND 2022 norms for your age band and sex, fixed; the band moves on with your birth year.",
    "aerobic": "FRIEND 2022 norms for your age band and sex: treadmill for run, cycle ergometer for bike. The band moves on with your birth year. Levels run past the Health target to the top 10%.",
    "vo2bike": "FRIEND 2022 cycle ergometer norms for your age band and sex, fixed; the band moves on with your birth year.",
    "vo2run": "FRIEND 2022 treadmill norms for your age band and sex, fixed; the band moves on with your birth year.",
    "rhr": "Zhang 2016 cut-offs, fixed.",
    "le8": "AHA Life's Essential 8 cut-offs, fixed.",
    "strength": "WHO 2020 and Momma 2022 cut-offs, fixed.",
    "sauna": "Laukkanen 2015 cut-offs, fixed.",
    "consistency": "Research cut-off (3 days) fixed; the Better and Best tiers are coach guides, fixed.",
    "trail": "Coach guide in hours of the longest run, fixed. The plan line is the block's planned long run and changes only at a block start.",
    "lifts": "Coach guide in percent against your own baseline, fixed; each lift's baseline is its first 2 logged sessions.",
    "trailspeed": "Coach guide anchored on a 100K with 3,350 m of climbing inside an 18 h cutoff (about 8:05 per effort km for the whole day, aid stops and fade included), fixed. No population norm exists for trail speed at a set heart rate.",
    "trailgap": "Coach guide anchored on a 100K with an 18 h cutoff (the same anchor as trail speed), fixed. No population norm exists for trail pace at a set heart rate.",
    "climb150": "Coach guide by grade band, fixed, built on mountain running references: 1,000 m/h is the strong-amateur vertical kilometre mark at hard effort, and climb rate peaks around 18 to 25% grade. No population norm exists for climbing at a set heart rate.",
    "climb": "Coach guide by grade band, fixed. The 10 to 20% steps stand in for all of 10%+; the tile's two bars carry their own bands.",
    "climbsteep": "Coach guide by grade band, fixed. The top step sits just under 1,000 m/h, the strong-amateur vertical kilometre mark at hard effort, here held at easy effort.",
}
# The scale text when a coach scale stands in (no population norm for this athlete)
ANCHOR_COACH = {
    "5k": "WMA age-grade classes stand in until your sex and birth year are in your profile; then the levels for your age group and sex take over.",
    "swim": "Age-group triathlon coaching convention for pool pace, with the 70.3 cutoff band; stands in until your sex is in your profile.",
    "run": "Coach guide anchored on the 70.3 run forecast, standing in until your sex is in your profile.",
    "bike": "Coach guide anchored on the 70.3 bike forecast, standing in until your sex is in your profile.",
    "ftp": "Coggan bands in watts at your weight on the test day; they move only when a new FTP result lands.",
    "wkg": "Coggan power-profile bands, fixed.",
    "durability": "Under 5% is Friel's coaching convention for 75–120 min sessions (coach guide). The 10% and 20% cuts come from 82,303 recreational marathoners (Smyth 2022), measured over about 4 h, so they flatter a 90 min session. No elite vs novice table exists yet.",
    "traildur": "Under 5% is Friel's coaching convention for 75–120 min sessions (coach guide). The 10% and 20% cuts come from 82,303 recreational marathoners (Smyth 2022), measured over about 4 h, so they flatter a 90 min session. No elite vs novice table exists yet.",
}
# Where you stand against a population, only where the library holds the figure
POPULATION = {
    "vo2": lambda m: f"{m['rank']}" if m.get("rank") else "",
    "aerobic": lambda m: m.get("rank", ""),
    "vo2bike": lambda m: m.get("rank", ""),
    "vo2run": lambda m: m.get("rank", ""),
    "rhr": lambda m: "General-population typical range is 60–80 bpm (Zhang 2016); you sit below it. No age-group percentile in the library.",
    "le8": lambda m: "US adults average about 65 of 100 (Lloyd-Jones 2022); scored on all 8 parts.",
    "5k": lambda m: m.get("_pop", ""),
    "wkg": lambda m: m.get("_pop", ""),
    "swim": lambda m: m.get("_pop", ""),
    "durability": lambda m: m.get("_pop", ""),
    "traildur": lambda m: m.get("_pop", ""),
}

def ordinal(n):
    n = int(round(n))
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def norm_rows():
    return json.load(open("coach/norms.json")).get("rows", []) if os.path.exists("coach/norms.json") else []


def pct_from_front(norm, v):
    """Share of the population better than v, by linear interpolation on the norm's breakpoints (value, percent better)."""
    bp = sorted(norm["breakpoints"], key=lambda x: x[0])
    better = norm.get("better", 1)
    if better == -1:  # lower is better: smaller value -> fewer ahead
        if v <= bp[0][0]:
            return bp[0][1] * v / bp[0][0] if bp[0][0] else bp[0][1]
        for (v1, p1), (v2, p2) in zip(bp, bp[1:]):
            if v1 <= v <= v2:
                return p1 + (v - v1) / (v2 - v1) * (p2 - p1)
        return min(100.0, bp[-1][1] + (v - bp[-1][0]) / max(1e-9, bp[-1][0]) * (100 - bp[-1][1]))
    else:  # higher is better: larger value -> fewer ahead
        if v >= bp[-1][0]:
            return bp[-1][1]
        for (v1, p1), (v2, p2) in zip(bp, bp[1:]):
            if v1 <= v <= v2:
                return p1 + (v - v1) / (v2 - v1) * (p2 - p1)
        return min(100.0, bp[0][1] + (bp[0][0] - v) / max(1e-9, bp[0][0]) * (100 - bp[0][1]))


def tiers_from_norm(norm, labels):
    """Percentile bands from a norm's breakpoints: labels in order from the front, one more label than breakpoints."""
    bp = sorted(norm["breakpoints"], key=lambda x: x[0])
    out = []
    if norm.get("better", 1) == -1:
        edges = [None] + [b[0] for b in bp] + [None]
        for i, l in enumerate(labels):
            lo, hi = edges[i], edges[i + 1]
            out.append((l, lo, hi, ""))
    else:
        edges = [None] + [b[0] for b in bp] + [None]
        for i, l in enumerate(reversed(labels)):
            lo, hi = edges[i], edges[i + 1]
            out.append((l, lo, hi, ""))
    return out


# Tiers shown in the marker detail panel (Oct 23, 2026, the athlete's request): (label, lo, hi, note); lo inclusive, hi exclusive, None = open.
# Each note says where the cut comes from. "Coach guide" marks a threshold with no research behind it.
DUR_TIERS = [("Strong base", None, 5, "under 5%: aerobic base holds for that duration (Friel coaching convention for 75–120 min sessions)"),
             ("Low decoupling", 5, 10, "5–10%: under 10% is 'low' in the marathon study (about a third of 82,303 recreational marathoners, Smyth 2022), measured over 4 h"),
             ("Moderate decoupling", 10, 20, "10–20%: the middle third of marathoners (Smyth 2022); over a 90 min session this is more drift than the marathon figure implies"),
             ("High decoupling", 20, None, "over 20%: the top third of marathoners (Smyth 2022); over a short session it says the base does not yet hold")]
# Swim pace per 100 yd (seconds, lower is better). Age-group triathlon coaching convention for sustained pool pace, converted from the usual per-100 m bands;
# each note gives the 70.3 1.2 mi (2,112 yd) swim time that pace implies, against the 1:10 cutoff (3:19 /100 yd).
def _swim_note(lo, hi, m_lo, m_hi):
    t = lambda sec: mss(sec * 21.12)
    rng = f"under {mss(hi)}" if lo is None else f"{mss(lo)}+" if hi is None else f"{mss(lo)}–{mss(hi)}"
    m = f"under about {m_hi}" if m_lo is None else f"about {m_lo}+" if m_hi is None else f"about {m_lo}–{m_hi}"
    race = f"a 70.3 swim under {t(hi)}" if lo is None else f"a 70.3 swim over {t(lo)}" if hi is None else f"a 70.3 swim {t(lo)}–{t(hi)}"
    return f"{rng} /100 yd ({m} /100 m): {race}"
# Coach-guide swim scale, used only when no population norm matches the athlete (no sex in the profile, or no norms.json)
SWIM_COACH_TIERS = [("Elite", None, 69, _swim_note(None, 69, None, "1:15")),
                    ("Advanced", 69, 82, _swim_note(69, 82, "1:15", "1:30")),
                    ("Strong age-grouper", 82, 96, _swim_note(82, 96, "1:30", "1:45")),
                    ("Intermediate", 96, 110, _swim_note(96, 110, "1:45", "2:00")),
                    ("Developing", 110, 128, _swim_note(110, 128, "2:00", "2:20")),
                    ("Beginner", 128, 151, _swim_note(128, 151, "2:20", "2:45")),
                    ("Novice", 151, 180, _swim_note(151, 180, "2:45", "3:17")),
                    ("Cutoff risk", 180, None, _swim_note(180, None, "3:17", None) + ", inside 7 min of the 1:10 cutoff")]
SWIM_CUTOFF = ("Cutoff risk", 180, None, _swim_note(180, None, "3:17", None) + ", inside 7 min of the 70.3 1:10 cutoff")
WKG_TIERS = [("Untrained", None, 2.0, "under 2.0 W/kg (Coggan's bottom rows start at about 1.9)"), ("Novice", 2.0, 2.4, "2.0–2.4 W/kg (Coggan: untrained to fair)"),
             ("Fair (Cat 5)", 2.4, 2.9, "2.4–2.9 W/kg"), ("Moderate (Cat 4)", 2.9, 3.5, "2.9–3.5 W/kg"),
             ("Good (Cat 3)", 3.5, 4.0, "3.5–4.0 W/kg"), ("Very good (Cat 2)", 4.0, 4.5, "4.0–4.5 W/kg"), ("Excellent (Cat 1)", 4.5, 5.1, "4.5–5.1 W/kg"), ("Exceptional", 5.1, None, "5.1+ W/kg")]
# Population layer for pace at 150 bpm and power at 130 bpm (the athlete, Oct 23): what the easy-HR output would mean held for a 70.3 leg, against all 70.3 men.
# Run: pace per mile = 70.3 run split / 13.1. Bike: watts needed for the 70.3 bike split on a flat course, from a power-speed model (Estimated).
RIDER_KG, BIKE_KG, CDA, CRR, RHO, DRIVETRAIN = 69.0, 9.0, 0.32, 0.004, 1.2, 0.97  # road bike, hoods, flat, no wind (model assumptions, Estimated)


def watts_for_speed(mps):
    return (0.5 * RHO * CDA * mps ** 3 + CRR * (RIDER_KG + BIKE_KG) * 9.81 * mps) / DRIVETRAIN


def speed_for_watts(w):
    lo, hi = 0.5, 25.0
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if watts_for_speed(mid) < w else (lo, mid)
    return (lo + hi) / 2


# General-population baseline for bike times (the athlete, Nov 12, 2026: "baseline metrics for each of these for the levels based off of
# general population"). Nobody publishes bike times for the general public, so the baseline is modelled from the one general
# fitness table on file: VO2max on cycle tests by age band and sex (vo2_norms, FRIEND registry). VO2max -> the watts at VO2max
# (ACSM cycling equation, (VO2 - 7) / 10.8 W per kg) -> the share of it a person can hold for the ride -> speed on a flat road
# (the power model above) -> time. HOLD is the coach's estimate of that share by distance (the athlete approved it as built on Nov 12, 2026, after seeing how far each share moves the level).
HOLD = {"t20k": 0.75, "t40k": 0.70, "t90k": 0.62, "t100k": 0.60, "t100mi": 0.55}


def bike_time_general(key, metres, g, kg=RIDER_KG):
    """A norm row (minutes, share faster) for one bike distance against adults of the athlete's age band and sex. None with no group."""
    pts = vo2_norms.points("cycle", g)
    if not pts or key not in HOLD:
        return None
    bp = []
    for p, vo2 in pts:
        w = max(40.0, (vo2 - 7) / 10.8 * kg * HOLD[key])
        bp.append([round(metres / speed_for_watts(w) / 60, 2), 100 - p])
    return {"kind": "norm", "key": key, "unit": "min", "better": -1, "population": f"{g['label']}, general population (modelled from fitness tests)",
            "source": f"Estimated by the coach from {vo2_norms.SOURCE}: VO2max on cycle tests for {g['label']}, turned into the time a rider of your weight would need on a flat, windless road holding {HOLD[key] * 100:.0f}% of the power at VO2max",
            "url": "https://doi.org/10.1016/j.mayocp.2021.08.020", "date": "2026-11", "n": 0, "breakpoints": sorted(bp), "sex": g["sex"], "age_band": g["band"], "tail": "log",
            "short": f"{g['label']}, general population (modelled)", "estimated": True,
            "note": "A model, not race results: most adults never ride this far, so read it as 'if a typical adult of your age and sex rode it'. Flat road, no wind, no stops; real rides with hills and stops read slower."}


# General-population baseline for output at a fixed easy heart rate (Run pace at 150 bpm, Bike power at 130 bpm). Modelled from
# the same VO2max tables: a typical adult's heart rate reserve used at that heart rate (rest REST_HR, maximum 220 minus the middle
# age of the band) is taken as the same share of their VO2 reserve, then turned into running speed or watts with the ACSM
# equations. REST_HR and the 220-minus-age maximum are the coach's assumptions (the athlete approved them as built on Nov 12, 2026). Estimated.
REST_HR = 65


def easy_general(kind, g, kg=RIDER_KG, hr=None):
    """A norm row for 'run' (min/mi at the run anchor, 150 bpm for the athlete) or 'bike' (W at the bike anchor, 130 bpm) against adults
    of the athlete's age band and sex. hr: the athlete's own anchor (hr_anchor.py); the typical adult's share of heart rate
    reserve at that heart rate is what moves with it."""
    hr = hr or (150 if kind == "run" else 130)
    pts = vo2_norms.points("treadmill" if kind == "run" else "cycle", g)
    if not pts:
        return None
    age = int(g["band"].split("-")[0]) + 5
    share = (hr - REST_HR) / max(1, (220 - age) - REST_HR)
    bp = []
    for p, vmax in pts:
        v = share * (vmax - 3.5) + 3.5
        bp.append([round(1609.344 / max(60.0, (v - 3.5) / 0.2), 3) if kind == "run" else round(max(20.0, (v - 7) / 10.8 * kg)), 100 - p])
    what = f"pace at {hr} bpm" if kind == "run" else f"power at {hr} bpm"
    return {"kind": "norm", "key": "gen_run_pace" if kind == "run" else "gen_bike_w", "unit": "min/mi" if kind == "run" else "W", "better": -1 if kind == "run" else 1,
            "population": f"{g['label']}, general population (modelled from fitness tests)",
            "source": f"Estimated by the coach from {vo2_norms.SOURCE}: VO2max for {g['label']}, turned into the {what} of a typical adult (resting heart rate {REST_HR}, maximum {220 - age})",
            "url": "https://doi.org/10.1016/j.mayocp.2021.08.020", "date": "2026-11", "n": 0, "breakpoints": sorted(bp), "sex": g["sex"], "age_band": g["band"],
            "tail": "log", "short": f"{g['label']}, general population (modelled)", "estimated": True,
            "note": "A model, not measured paces or watts: it assumes a typical adult's heart rate and the standard energy equations. Read it as where your easy effort sits among adults of your age and sex."}


# Trail tiles on the general population (the athlete picked option 3 on the Sprint Review page, Nov 15, 2026: "Population model, trail
# footing" for Climbing and "Road model plus 20% for trail" for Runnable pace and Sustainable trail speed). The same model as Run pace
# at the run anchor (FRIEND VO2max, a typical adult's share of heart rate reserve), with TRAIL_TERRAIN extra energy cost for dirt and
# rocks (Pandolf 1977 and Soule 1978 terrain factors: about 1.2 for dirt road and light trail). Climbing uses the ACSM walking
# equation on CLIMB_GRADE; trail speed per effort km is flat-equivalent pace, as an effort km on the flat is one km. Estimated.
TRAIL_TERRAIN = 1.2
CLIMB_GRADE = {"climb": 0.15, "climb150": 0.15, "climbsteep": 0.25}


def trail_general(key, g, hr=None):
    """A norm row for one trail tile (trailgap min/mi, trailspeed min per effort km, climb, climb150, climbsteep ft/h) against
    adults of the athlete's age band and sex, at hr (the run anchor). None with no group. Pure."""
    hr = hr or 150
    pts = vo2_norms.points("treadmill", g) if g else None
    if not pts:
        return None
    age = int(g["band"].split("-")[0]) + 5
    share = (hr - REST_HR) / max(1, (220 - age) - REST_HR)
    grade = CLIMB_GRADE.get(key)
    bp = []
    for p, vmax in pts:
        v = share * (vmax - 3.5) + 3.5
        if grade:
            s = (v - 3.5) / (TRAIL_TERRAIN * (0.1 + 1.8 * grade))  # m/min along the slope (ACSM walking)
            val = round(s * grade / (1 + grade * grade) ** 0.5 * 3.28084 * 60)
        else:
            pace = 1609.344 / max(60.0, (v - 3.5) / 0.2) * TRAIL_TERRAIN  # min/mi (ACSM running)
            val = round(pace if key == "trailgap" else pace / 1.609344, 3)
        bp.append([val, 100 - p])
    if grade:
        what, unit, better = f"climbing rate on a {grade * 100:.0f}% trail grade at {hr} bpm", "ft/h", 1
        how = f"the ACSM walking equation on a {grade * 100:.0f}% grade"
    else:
        what, unit, better = (f"trail pace at {hr} bpm", "min/mi", -1) if key == "trailgap" else (f"trail speed per effort km at {hr} bpm", "min/km", -1)
        how = "the ACSM running equation"
    return {"kind": "norm", "key": f"gen_{key}", "unit": unit, "better": better, "population": f"{g['label']}, general population (modelled from fitness tests)",
            "source": (f"Estimated by the coach from {vo2_norms.SOURCE}: VO2max for {g['label']}, turned into the {what} of a typical adult (resting heart rate {REST_HR}, "
                       f"maximum {220 - age}) with {how} and {round((TRAIL_TERRAIN - 1) * 100)}% extra cost for trail footing (Pandolf 1977, Soule 1978)"),
            "url": "https://doi.org/10.1016/j.mayocp.2021.08.020", "date": "2026-11", "n": 0, "breakpoints": sorted(bp), "sex": g["sex"], "age_band": g["band"],
            "tail": "log", "short": f"{g['label']}, general population (modelled)", "estimated": True,
            "note": "A model, not measured trail runners: it assumes a typical adult's heart rate, the standard energy equations and a 20% trail footing allowance. Read it as where your easy trail effort sits among adults of your age and sex."}


FTP_SHARE = 0.75  # FTP as a share of the power at VO2max: the coach's estimate (bike population analysis, Nov 8, 2026; the athlete approved it as built on Nov 12, 2026)


def wkg_general(g):
    """A W/kg norm row for FTP against adults of the athlete's age band and sex: VO2max on cycle tests (FRIEND) turned into the
    power at VO2max (ACSM) and FTP_SHARE of it. None with no group. Estimated."""
    pts = vo2_norms.points("cycle", g)
    if not pts:
        return None
    bp = sorted([round(max(0.3, (v - 7) / 10.8 * FTP_SHARE), 2), 100 - p] for p, v in pts)
    return {"kind": "norm", "key": "wkg_general", "unit": "W/kg", "better": 1, "population": f"{g['label']}, general population (modelled from fitness tests)",
            "source": f"Estimated by the coach from {vo2_norms.SOURCE}", "url": "https://doi.org/10.1016/j.mayocp.2021.08.020", "date": "2026-11", "n": 0, "breakpoints": bp,
            "sex": g["sex"], "age_band": g["band"], "short": f"{g['label']}, general population (modelled)", "estimated": True,
            "note": f"A model: VO2max on cycle tests for {g['label']} turned into the power at VO2max, with FTP taken as {FTP_SHARE * 100:.0f}% of it. Most of these adults do not ride, so read it as where your engine sits among adults of your age and sex."}


# Each person's own targets (A coach for any person, 6.89.0): a target that names a race or a forecast lives in
# profile.json `fitness_targets` (run, bike, swim, wkg), never in this file; without one the tile gets a plain coach guide.
# The 70.3 comparison is offered only to someone with a triathlon on their race list.
GENERIC_TARGET = {
    "run": "Faster at the same heart rate, block over block; each block brief sets the next step (coach guide)",
    "bike": "More power at the same heart rate, block over block; each block brief sets the next step (coach guide)",
    "swim": "Faster per 100 at an easy effort, block over block (coach guide)",
    "wkg": "Set from the next bike test (coach guide)",
}


def own_target(key, root="."):
    try:
        t = (json.load(open(os.path.join(root, "coach/athlete/profile.json"))).get("fitness_targets") or {}).get(key)
    except (OSError, ValueError):
        t = None
    return t or GENERIC_TARGET[key]


def next_triathlon(today=None, root="."):
    """The next triathlon on the person's race list (name), or None: the 70.3 comparisons are offered only then."""
    try:
        rows = json.load(open(os.path.join(root, "coach/races.json"))).get("rows", [])
    except (OSError, ValueError, AttributeError):
        return None
    t = str(today or date.today())
    tri = sorted((r for r in rows if r.get("kind") == "race" and "triathlon" in str(r.get("sport", "")).lower()
                  and r.get("status") != "done" and str(r.get("date", "")) >= t), key=lambda r: r.get("date", ""))
    return tri[0].get("name") if tri else None


def tile_compare(root="."):
    """{tile key: comparison id} chosen by the athlete or the coach, from coach/fitness_layout.json (fit_kpi rows, field compare)."""
    p = os.path.join(root, "coach", "fitness_layout.json")
    if not os.path.exists(p):
        return {}
    return {r["key"]: r["compare"] for r in json.load(open(p)).get("rows", []) if r.get("kind") == "fit_kpi" and r.get("compare")}


def run_pace_norm(nrun):
    """A 70.3 run-split norm as pace per mile over 13.1 mi (min/mi): what the easy-HR pace would mean held for the whole leg."""
    if not nrun:
        return None
    word = "women's" if nrun.get("sex") == "female" else "men's" if nrun.get("sex") == "male" else ""
    return {"kind": "norm", "key": "hm703_run_pace", "unit": "min/mi", "better": -1, "population": nrun["population"], "source": nrun["source"],
            "url": nrun["url"], "date": nrun["date"], "n": nrun["n"], "breakpoints": [[round(v / 13.1, 3), pct] for v, pct in nrun["breakpoints"]],
            "sex": nrun.get("sex"), "tail": "log", "short": f"70.3 {word} run legs, if held".replace("  ", " "),
            "note": "70.3 run split as pace per mile over 13.1 mi; the dashboard reads your 150 bpm pace against it as 'if held for the whole run leg'. Derived."}


def bike_w_norm(nbike):
    """A 70.3 bike-split norm as the watts that hold it on a flat course (power model, Estimated)."""
    if not nbike:
        return None
    word = "women's" if nbike.get("sex") == "female" else "men's" if nbike.get("sex") == "male" else ""

    def _w(minutes):
        return round(watts_for_speed(56 * 1609.344 / (minutes * 60)))
    return {"kind": "norm", "key": "hm703_bike_w", "unit": "W", "better": 1, "population": nbike["population"], "source": nbike["source"],
            "url": nbike["url"], "date": nbike["date"], "n": nbike["n"], "breakpoints": sorted([[_w(v), pct] for v, pct in nbike["breakpoints"]]),
            "sex": nbike.get("sex"), "short": f"70.3 {word} bike legs, if held".replace("  ", " "),
            "note": f"70.3 bike split turned into the watts that hold it on a flat, windless course for a {RIDER_KG:.0f} kg rider on a road bike (CdA {CDA}, Crr {CRR}, {int((1 - DRIVETRAIN) * 100)}% drivetrain loss). A model, Estimated: position, wind, drafting rules and heat move it by 10–20%. Derived."}


# Pace at 150 bpm (min/mi, lower is better) and power at 130 bpm (W, higher is better): no population norms exist for output at a fixed heart rate,
# so these are coach guides anchored on the 70.3 forecasts in CURRENT-STATE (run leg about 9:55–11:50/mi; bike split 16–18 mph, roughly 110–150 W for the athlete's size, Estimated).
RUN150_TIERS = [("Fast", None, 9.0, "under 9:00/mi at 150 bpm: easy pace well under the 70.3 run forecast; coach guide"),
                ("Strong", 9.0, 10.0, "9:00–10:00: the forecast run leg sits inside easy effort with margin; coach guide"),
                ("Forecast pace", 10.0, 11.5, "10:00–11:30: easy pace matches the 70.3 run forecast (9:55–11:50/mi); coach guide"),
                ("Base", 11.5, 13.5, "11:30–13:30: the run leg fits its 3 h window at easy effort; coach guide"),
                ("Building", 13.5, None, "over 13:30: at easy effort the run leg would need its whole cutoff window; coach guide")]
BIKE130_TIERS = [("Building", None, 80, "under 80 W at 130 bpm; coach guide"),
                 ("Base", 80, 100, "80–100 W: easy rides sit below the 70.3 split's power; coach guide"),
                 ("Forecast pace", 100, 130, "100–130 W: the forecast split (16–18 mph, about 110–150 W for your size, Estimated) becomes a mostly easy ride; coach guide"),
                 ("Strong", 130, 160, "130–160 W: margin above the forecast split; coach guide"),
                 ("Fast", 160, None, "160+ W at 130 bpm; coach guide")]
AG_5K_OPEN_SEC, AG_FACTOR_35 = 12 * 60 + 49, 0.9916
AG_5K_STD_SEC = AG_5K_OPEN_SEC / AG_FACTOR_35
def _ag_min(pct):  # 5K minutes at an age-graded percentage (men, 35)
    return round(AG_5K_STD_SEC / (pct / 100) / 60, 2)
# WMA age-grade scale, used only when no 5K norm matches the athlete
AG_WMA_TIERS = [("World class", None, _ag_min(90), f"under {mss(_ag_min(90) * 60)}: 90%+ age-graded (WMA)"),
                ("National class", _ag_min(90), _ag_min(80), f"{mss(_ag_min(90) * 60)}–{mss(_ag_min(80) * 60)}: 80–90% (WMA)"),
                ("Regional class", _ag_min(80), _ag_min(70), f"{mss(_ag_min(80) * 60)}–{mss(_ag_min(70) * 60)}: 70–80% (WMA)"),
                ("Local class", _ag_min(70), _ag_min(60), f"{mss(_ag_min(70) * 60)}–{mss(_ag_min(60) * 60)}: 60–70% (WMA); sub-20 lands here"),
                ("Recreational", _ag_min(60), None, f"over {mss(_ag_min(60) * 60)}: under 60% age-graded, no WMA class")]
CONS_TIERS = [("Inactive", None, 1, "no training days"),
              ("Maintains", 1, 3, "1–2 days: holds endurance for weeks if intensity stays (TR-16); 'weekend warrior' mortality benefit similar but not significant (dos Santos 2022, JAMA Intern Med)"),
              ("Good", 3, 4, "Regularly active: 3+ sessions a week at 150+ min: 15% lower all-cause mortality vs inactive (dos Santos 2022); the research cutoff"),
              ("Better", 4, 5, "4 days: load spread thinner per session, the thing behind the single-run spike rule (IR-01, IR-03); coach guide"),
              ("Best", 5, 7, "5–6 days with at least one low-load day; coach guide"),
              ("Watch", 7, None, "7 days: no low-load day (RULES 4)")]
RHR_TIERS = [("At the reference", None, 45, "under 45: the 45 bpm reference where risk was lowest (Zhang 2016); below here a lower value is a fitness marker, not a health target"),
             ("Athlete range", 45, 50, "45–50: within 5 bpm of the reference (Zhang 2016)"),
             ("Low", 50, 60, "50–59: about +9% all-cause risk per +10 bpm above 45 (Zhang 2016)"),
             ("Typical", 60, 80, "60–80: +12% all-cause mortality vs the lowest category (Zhang 2016)"),
             ("High", 80, 90, "80–90: +45% all-cause, +33% cardiovascular vs the lowest category (Zhang 2016); a clinician's question"),
             ("Very high", 90, None, "over 90: where cardiovascular risk rose sharply in the dose-response analysis and the usual tachycardia threshold (Zhang 2016); a clinician's question")]
LE8_TIERS = [("Low", None, 50, "under 50 (AHA)"), ("Moderate", 50, 80, "50–79 (AHA); US adult average about 65"), ("High", 80, None, "80–100 (AHA)")]
STR_TIERS = [("None", None, 0.25, "no strength training in the last 4 weeks"), ("Some", 0.25, 2, "under 2 a week: any strength work lowers risk (Momma 2022)"),
             ("Guideline", 2, 4, "2+ a week (WHO 2020); 30–60 min/week gave the largest gain (Momma 2022)"), ("Beyond", 4, None, "4+ a week: no added longevity benefit; a performance choice")]
SLP_TIERS = [("Regular", None, 45, "within ±45 min (coach guide)"), ("Variable", 45, 75, "±45–75 min (coach guide)"), ("Irregular", 75, None, "over ±75 min (coach guide)")]
# Trail time on feet, hours of the longest run in 28 days (coach guide, Nov 1, 2026; no published norm exists)
TRAIL_TIERS = [("Short", None, 1, "under 1 h: road-race range"), ("Building", 1, 2, "1–2 h: half marathon and 25K range"),
               ("Long", 2, 3, "2–3 h: a 50K is in reach with hiking"), ("Ultra-ready", 3, 5, "3–5 h: the long-run range for a 50K to 100K build"),
               ("Ultra", 5, None, "5 h and over: race-day or a named exception (RULES 3)")]
HILLY_FT_MI = 60  # a run or hike is hilly at 60 ft of climb per mile (scripts/streams.py)
# Trail pace at 150 bpm, grade adjusted, min/mi, and climbing at 150 bpm, ft/h up (coach guides, the athlete Nov 8, 2026; no published norm exists)
# Trail pace bands recalibrated on the first real detail (Nov 8, 2026): 100K in 18 h is about 15:30/mi flat-equivalent over the whole day
# (climbs counted, aid stations, night and late slowing included), so an easy 150 bpm pace under 13:00 holds the cutoff with margin
# Since Nov 15, 2026 (the athlete: "Strip them, fix trail scale") the bands are not typed: trail_tiers() builds them from the person's own
# next trail race with a course and a time limit in coach/races.json, and from TRAIL_STANDIN (the 100K above) until one is on file.
# Climbing at 150 bpm by grade band (the athlete chose grade-specific levels on mountain running references, Nov 8, 2026): ft/h up.
# Top rungs sit under 1,000 m/h (3,280 ft/h), the strong-amateur vertical-kilometre mark at hard effort (Uphill Athlete);
# climb rate peaks around 18 to 25% grade, so gentler bands run lower. Coach guide, not a percentile.
CLIMB_TIERS = {
    "climb150": [("Building", None, 1000, "under 1,000 ft/h at 150 bpm on 10 to 20% grades"), ("Steady", 1000, 1500, "1,000 to 1,500 ft/h"),
                 ("Strong", 1500, 2000, "1,500 to 2,000 ft/h"), ("Mountain", 2000, 2600, "2,000 to 2,600 ft/h"),
                 ("Fast climber", 2600, None, "2,600 ft/h and up")],
    "climbsteep": [("Building", None, 1200, "under 1,200 ft/h at 150 bpm on 20%+ grades"), ("Steady", 1200, 1800, "1,200 to 1,800 ft/h"),
                   ("Strong", 1800, 2400, "1,800 to 2,400 ft/h"), ("Mountain", 2400, 3000, "2,400 to 3,000 ft/h"),
                   ("Fast climber", 3000, None, "3,000 ft/h and up: near 1,000 m/h, held at easy effort")],
}
CLIMB150_TIERS = CLIMB_TIERS["climb150"]
# Sustainable trail speed, min per effort km at 150 bpm (the athlete, Nov 11, 2026): the runnable pace steps carried over to effort km by the
# same anchor (a 100K with 3,350 m up in 18 h is about 8:05 per effort km over the whole day, as 15:30/mi flat-equivalent is for pace)
TRAIL_STANDIN = {"name": "", "effort_km": 133.5, "limit_h": 18.0}
TRAIL_STEPS = (0.645, 0.742, 0.84, 0.965)  # Fast, Strong, Comfortable and Finisher edges as shares of the pace the time limit needs
GAP_PER_SPEED = 15.5 / (18 * 60 / 133.5)   # runnable min/mi (flat-equivalent) per min per effort km, from the same anchor


def trail_tiers(race):
    """Sustainable trail speed and runnable pace bands for one event (next_trail_course's row), or the stand-in:
    (speed tiers in min per effort km, runnable tiers in min/mi, the two anchor sentences). The anchor is the pace
    the event's own time limit needs over its effort km, aid stops and late fade included."""
    r = race or TRAIL_STANDIN
    need = r["limit_h"] * 60 / r["effort_km"]
    what = f"{r['name']} inside its {r['limit_h']:g} h limit" if race else "a 100K inside 18 h"
    s = [round(need * k, 1) for k in TRAIL_STEPS]
    g = [round(need * GAP_PER_SPEED * k * 2) / 2 for k in TRAIL_STEPS]
    t = lambda v: mss(v * 60)

    def band(e, lead, tail):
        return [("Fast", None, e[0], f"under {t(e[0])}{lead}"), ("Strong", e[0], e[1], f"{t(e[0])} to {t(e[1])}"),
                ("Comfortable", e[1], e[2], f"{t(e[1])} to {t(e[2])}: {what} at easy effort with margin"),
                ("Finisher", e[2], e[3], f"{t(e[2])} to {t(e[3])}: {what} at easy effort, little margin"), ("Cutoff risk", e[3], None, f"over {t(e[3])}{tail}")]
    src = (f"your own race, {r['name']}: {r['effort_km']:g} effort km inside {r['limit_h']:g} h" if race else
           "a 100K with 3,350 m of climbing inside 18 h, standing in until a trail race of yours has its distance, climbing and time limit on file")
    fixed = "It moves only when that race or its limit changes." if race else "Fixed until then."
    basis = (f"Coach guide anchored on {src}. That is about {t(need)} per effort km for the whole day, aid stops and fade included. {fixed} "
             f"No population norm exists for trail speed at a set heart rate.",
             f"Coach guide anchored on {src}, the same anchor as trail speed. {fixed} No population norm exists for trail pace at a set heart rate.")
    return band(s, " per effort km at 150 bpm", ""), band(g, "/mi grade adjusted at 150 bpm", ""), basis


SPEED_TIERS, TRAILGAP_TIERS, _ = trail_tiers(None)
# Durability (the athlete, Nov 12, 2026): only steady long sessions are scored.
DUR_CV = 6      # % spread of lap speed (or power) allowed in a steady session
DUR_LAST = 3    # the tile reads the middle of this many steady sessions
DUR_DAYS = 365  # ... no older than this
DUR_SKIP_S = 600  # warm up: laps starting in the first 10 min are left out
DUR_HR = {"run": 163, "bike": 156}  # filled from coach/zones.json (top of zone 3) by durability_sessions


def _zone3_top(path="coach/zones.json"):
    try:
        rows = json.load(open(path)).get("rows") or []
    except Exception:
        return
    for r in rows:
        if r.get("zone") == 3 and r.get("set") in DUR_HR and r.get("hi"):
            DUR_HR[r["set"]] = int(r["hi"])


def durability_lap_drift(laps, usepow):
    """First half against second half of the kept laps: efficiency = speed (or power) per heartbeat. None with too few laps."""
    if len(laps) < 4:
        return None
    val = lambda l: l["averagePower"] if usepow else (l.get("distance") or 0) / max(1, l.get("movingDuration") or l["duration"])
    total = sum(l["duration"] for l in laps)
    acc, h1, h2 = 0, [], []
    for l in laps:
        (h1 if acc + l["duration"] / 2 < total / 2 else h2).append(l)
        acc += l["duration"]
    if not h1 or not h2:
        return None

    def ef(ls):
        dur = sum(l["duration"] for l in ls)
        return (sum(val(l) * l["duration"] for l in ls) / dur) / (sum(l["averageHR"] * l["duration"] for l in ls) / dur)
    e1 = ef(h1)
    return (e1 - ef(h2)) / e1 * 100 if e1 else None


def durability_classify(sport, usepow, hr, cv):
    """(scored, reason). Steady = at or under the top of the Steady zone with an even lap to lap effort; rides need power."""
    if sport == "bike" and not usepow:
        return False, "outdoor ride, speed only"
    if hr > DUR_HR[sport]:
        return False, f"hard day, avg HR {round(hr)}"
    if cv > DUR_CV:
        return False, "uneven effort"
    return True, ""


def durability_sessions(acts, root="."):
    """Every long flat run and long ride with laps: date, sport, drift %, minutes, scored, label. Sorted by date."""
    _zone3_top(os.path.join(root, "coach/zones.json"))
    res = []
    for a in acts:
        t = (a.get("type") or "").lower()
        mins = _f(a.get("duration_min")) or 0
        sport = "bike" if any(k in t for k in ("cycl", "ride")) else "run" if "run" in t else None
        if not sport or mins < (90 if sport == "bike" else 75):
            continue
        mi = _f(a.get("distance_mi")) or 0
        ftmi = (_f(a.get("ascent_ft")) or 0) / mi if mi else 999
        if "virtual" not in t and ftmi > (40 if sport == "bike" else 60):
            continue  # hilly outdoor sessions: speed per heartbeat mostly measures the terrain
        p = os.path.join(root, f"data/activities/{a['activity_id']}.json")
        if not os.path.exists(p):
            continue
        laps = ((json.load(open(p)).get("splits") or {}).get("lapDTOs")) or []
        laps = [l for l in laps if (l.get("duration") or 0) > 60 and l.get("averageHR")]
        if len(laps) < 4:
            continue
        usepow = "virtual" in t and all(l.get("averagePower") for l in laps)
        acc, keep = 0, []
        for l in laps:
            start = acc
            acc += l["duration"]
            if start < DUR_SKIP_S or (l.get("movingDuration") or l["duration"]) / l["duration"] < 0.9:
                continue  # warm up, or a lap with a stop in it
            keep.append(l)
        dec = durability_lap_drift(keep, usepow)
        if dec is None or abs(dec) > 25:
            continue
        vals = [l["averagePower"] if usepow else (l.get("distance") or 0) / max(1, l.get("movingDuration") or l["duration"]) for l in keep]
        mean = sum(vals) / len(vals)
        cv = statistics.pstdev(vals) / mean * 100 if mean else 99
        hr = sum(l["averageHR"] * l["duration"] for l in laps) / sum(l["duration"] for l in laps)
        ok, why = durability_classify(sport, usepow, hr, cv)
        name = ("Ride" if sport == "bike" else "Run") + f" {round(mins)} min"
        label = (f"Steady {name.lower()}{' (power)' if usepow else ''}, avg HR {round(hr)}" if ok else f"{name} · not scored: {why}")
        res.append({"date": a["local_start"][:10], "sport": sport, "drift": round(dec, 1), "mins": round(mins), "scored": ok, "label": label})
    res.sort(key=lambda x: x["date"])
    return res



# Why the tiles compare at 150 and 130 bpm (the athlete, Nov 11, 2026: say it in the opened tile), worded from the athlete's own zones (coach/zones.json)
def why_hr(hr, zset, sport_word, measure, path="coach/zones.json"):
    try:
        zs = [r for r in json.load(open(path)).get("rows", []) if r.get("kind") == "zone" and r.get("set") == zset]
    except (OSError, ValueError):
        zs = []
    z = next((r for r in zs if r["lo"] <= hr <= r["hi"]), None)
    where = (f"{hr} bpm is the top of your {z['name'].lower()} {sport_word} zone (zone {z['zone']}: {z['lo']} to {z['hi']} bpm)" if z and hr == z["hi"]
             else f"{hr} bpm sits in your {z['name'].lower()} {sport_word} zone (zone {z['zone']}: {z['lo']} to {z['hi']} bpm)" if z
             else f"{hr} bpm is the reference easy {sport_word} heart rate")
    return f"{where}, easy for hours. At one heart rate, {measure} at {hr} means fitter; each session is scaled to {hr}."


WHY_150 = why_hr(150, "run", "run", "faster")
WHY_130 = why_hr(130, "bike", "bike", "more watts")


def next_trail_course(today, path="coach/races.json"):
    """The next trail race with a course on file (course_km, course_gain_m and a limit in hours): name, effort km, limit."""
    try:
        rows = json.load(open(path)).get("rows", [])
    except (OSError, ValueError):
        return None
    for r in sorted((r for r in rows if r.get("kind") == "race" and "trail" in str(r.get("sport", "")).lower() and r.get("course_km")),
                    key=lambda r: r.get("date", "")):
        if r.get("date", "") >= str(today):
            try:
                lim = float(str(r.get("limit", "")).split(" h")[0])
            except ValueError:
                continue
            return {"name": r.get("name", ""), "effort_km": float(r["course_km"]) + float(r.get("course_gain_m") or 0) / 100.0, "limit_h": lim}
    return None


def sublevel(v, tiers, n=3):
    """The band and its third (I lowest) for a higher-is-better value, as the page names sub-levels."""
    for l, lo, hi, _ in tiers:
        if (lo is None or v >= lo) and (hi is None or v < hi):
            if lo is None or hi is None:
                return l
            return f"{l} {('I', 'II', 'III')[min(n - 1, int((v - lo) / (hi - lo) * n))]}"
    return ""


# footing levels (the athlete, Nov 12, 2026: 1 Easy to 5 Expert); the Nov 8 values still read
FOOTING = {"easy": "1 smooth", "moderate": "2 mild", "tough": "3 technical", "hard": "4 rugged", "expert": "5 scramble",
           "smooth": "smooth", "roots": "roots and rocks", "technical": "technical", "mud": "mud or snow"}
GROUND = {"wet": "wet", "mud": "mud", "snow": "snow or ice"}
# Strength progression, percent vs your own baseline (coach guide, Nov 1, 2026)
LIFT_TIERS = [("Below baseline", None, -3, "more than 3% under your baseline: check sleep, food and the deficit"), ("Holding", -3, 3, "within 3%: the goal while in a deficit"),
              ("Progressing", 3, 10, "3–10% over baseline"), ("Strong progress", 10, None, "10%+ over baseline")]
SAUNA_TIERS = [("Occasional", None, 2, "under 2 a week (Laukkanen 2015 reference: once a week)"), ("Regular", 2, 4, "2–3 a week: lower cardiovascular mortality than once (Laukkanen 2015)"), ("Frequent", 4, None, "4–7 a week: lowest in that cohort (Laukkanen 2015)")]


def hm(minutes):
    m = int(round(minutes or 0))
    return f"{m // 60}:{m % 60:02d}"


def _f(v):
    try:
        return None if v in (None, "") else float(v)
    except ValueError:
        return None


def _d(s):
    return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()


def _mon(d):
    return d - timedelta(days=d.weekday())


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _sd(xs):
    xs = [x for x in xs if x is not None]
    if len(xs) < 2:
        return None
    m = sum(xs) / len(xs)
    return (sum((x - m) ** 2 for x in xs) / (len(xs) - 1)) ** 0.5


FIVEK_WINDOW = 90  # days: the 5K tile and level use the fastest 5 km run in this window


# The 5K tile's distance switch (the athlete, Nov 12, 2026: "for the 5K time, you should be able to switch between different
# distance"): key, switch label, Garmin best-effort field, sane minutes (outside is a GPS glitch or a walk), order.
RUN_DIST = (("mile", "Mile", "fastestSplit_1609", 4, 25, 1), ("5k", "5K", "fastestSplit_5000", 12, 60, 2), ("10k", "10K", "fastestSplit_10000", 25, 130, 3),
            ("half", "Half", "fastestSplit_21098", 60, 300, 4), ("marathon", "Full", "fastestSplit_42195", 120, 600, 5))
GLITCH_1K_SEC = 150  # a fastest kilometre under 2:30 is a GPS jump: none of that run's best efforts count


def htime(minutes):
    """A run time from minutes: 25:46, or 2:07:16 from an hour up."""
    sec = int(round(minutes * 60))
    return mss(sec) if sec < 3600 else f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def best_efforts(acts, split="fastestSplit_5000", lo=12, hi=60):
    """Garmin's fastest stretch of one distance inside each run (activity summary fastestSplit_<metres>, seconds), oldest
    first: (date, minutes, run km, avg HR, activity name). Treadmill runs are left out (no GPS distance)."""
    out = []
    for a in acts:
        t = (a.get("type") or "").lower()
        if "run" not in t or "treadmill" in t or "virtual" in t:
            continue
        p = f"data/activities/{a['activity_id']}.json"
        if not os.path.exists(p):
            continue
        s = json.load(open(p)).get("summary") or {}
        v = s.get(split)
        k1 = s.get("fastestSplit_1000")
        if not v or v < lo * 60 or v > hi * 60 or (split != "fastestSplit_5000" and k1 and k1 < GLITCH_1K_SEC):
            continue
        out.append((a["local_start"][:10], round(v / 60, 2), round((s.get("distance") or 0) / 1000, 1), s.get("averageHR"), a.get("name") or ""))
    return sorted(out)


# The Bike FTP tile's Effort switch (the athlete, Nov 12, 2026: "for biking, there should likely be additionally different bike distance
# races and times similar to the 5K, 10K, half marathon"; he chose "Power bests plus 40K time"): Garmin's best average power for
# 1, 5, 20 and 60 minutes inside each ride, and its fastest 40 km on outdoor rides (the one bike distance it records).
BIKE_BEST = (("p1", "1 min", "maxAvgPower_60", 1), ("p5", "5 min", "maxAvgPower_300", 2), ("p20", "20 min", "maxAvgPower_1200", 3),
             ("p60", "60 min", "maxAvgPower_3600", 4))
# Race times by distance for the bike and the swim, as the 5K tile does for running (the athlete, Nov 12, 2026: "an equivalent of the 5K
# time to biking and swimming. This is just race times at different distances"). Bike: coach/tools/ride_dist.py. Swim: Garmin's
# best split inside each pool swim, in the pool's own unit (a 25 yd pool gives 100, 400, 750 and 1,500 yd).
SWIM_DIST = (("swim100", "100", 100, 0.7, 5, 1), ("swim400", "400", 400, 3, 20, 2), ("swim750", "750", 750, 6, 40, 3), ("swim1500", "1500", 1500, 12, 80, 4))
YD_PER_M = 1.0936


# General-population baseline for swimming (the athlete, Nov 12, 2026: "you can't just use the half iron man for swim times"). The one
# general fitness standard for swimming by age and sex: Cooper's 12-minute swim test (Cooper, The Aerobics Program for Total
# Well-Being, 1982, as tabled at topendsports.com/testing/tests/swim-12-minutes.htm, read Nov 12, 2026 through a page reader:
# spot-check a row against the book). Yards swum in 12 minutes, lower edge of Poor, Fair, Good and Excellent. Fitness
# categories for adults who can swim continuously, not percentiles.
COOPER_SWIM = {"male": {13: (500, 600, 700, 800), 20: (400, 500, 600, 700), 30: (350, 450, 550, 650), 40: (300, 400, 500, 600), 50: (250, 350, 450, 550), 60: (250, 300, 400, 500)},
               "female": {13: (400, 500, 600, 700), 20: (300, 400, 500, 600), 30: (250, 350, 450, 550), 40: (200, 300, 400, 500), 50: (150, 250, 350, 450), 60: (150, 200, 300, 400)}}
COOPER_LABELS = ("Very poor", "Poor", "Fair", "Good", "Excellent")
COOPER_URL = "https://www.topendsports.com/testing/tests/swim-12-minutes.htm"
SWIM_EXP = 1.03  # time grows a little faster than distance (the same exponent as the 70.3 conversion above)


def cooper_swim_tiers(g, dist=None, unit="yd", fmt=None):
    """Cooper's 12-minute swim categories for the athlete's age band and sex as (label, lo, hi, note), fastest band first by
    value (lowest value first). dist None: pace in seconds per 100 of `unit`; else minutes for `dist` of `unit`, the 12-minute
    pace carried to that distance with SWIM_EXP. None with no group."""
    if not g or g.get("sex") not in COOPER_SWIM:
        return None
    lo_age = int(g["band"].split("-")[0])
    edges = COOPER_SWIM[g["sex"]][max(a for a in COOPER_SWIM[g["sex"]] if a <= max(13, lo_age))]
    k = 1.0 if unit == "yd" else 0.9144  # a metre pool: the same test distance in metres
    val = (lambda yd: 72000 / (yd * k)) if dist is None else (lambda yd: 12 * (dist / (yd * k)) ** SWIM_EXP)
    fmt = fmt or ((lambda v: f"{mss(v)} /100 {unit}") if dist is None else htime)
    cuts = [round(val(e), 1 if dist is None else 3) for e in edges]  # slowest edge first
    out = []
    for i, lab in enumerate(COOPER_LABELS):
        hi = None if i == 0 else cuts[i - 1]   # slower (larger) bound
        lo = None if i == len(cuts) else cuts[i]  # faster (smaller) bound
        yd = f"under {edges[0]} yd" if i == 0 else f"{edges[i - 1]} yd or more" if i == len(cuts) else f"{edges[i - 1]} to {edges[i] - 1} yd"
        out.append((lab, lo, hi, f"{yd} in a 12-minute swim: {'slower than ' + fmt(lo) if hi is None else 'faster than ' + fmt(hi) if lo is None else fmt(lo) + ' to ' + fmt(hi)}"))
    return out[::-1]


def swim_bests(acts, metres, lo, hi, root="."):
    """[(date, minutes)] oldest first and the pool unit ('yd' or 'm'): Garmin's fastest split of this length inside each swim."""
    out, unit = [], "m"
    for a in acts:
        if "swim" not in (a.get("type") or "").lower():
            continue
        p = os.path.join(root, "data", "activities", f"{a['activity_id']}.json")
        if not os.path.exists(p):
            continue
        sm = json.load(open(p)).get("summary") or {}
        v = sm.get(f"fastestSplit_{metres}")
        if not v or not lo * 60 <= v <= hi * 60:
            continue
        if ((sm.get("unitOfPoolLength") or {}).get("unitKey") or "").lower().startswith("yard"):
            unit = "yd"
        out.append((a["local_start"][:10], round(v / 60, 3)))
    return sorted(out), unit
# Power by duration ranks against a population of riders, not the athlete's own baseline (the athlete, Nov 12, 2026: "based off of some
# population, not me baseline"): the Allen and Coggan power profile categories, W/kg, lower edge of each category from Fair up
# (Training and Racing with a Power Meter, as tabled at cyclistshub.com/average-cycling-power, read Nov 12, 2026 through a page
# reader: spot-check an edge against the book before relying on it). Categories of racing cyclists, not percentiles by age.
COGGAN_LABELS = ("Untrained", "Fair", "Moderate", "Good", "Very good", "Excellent", "Exceptional", "World class")
COGGAN = {"male": {"p1": (6.3, 7.0, 7.7, 8.5, 9.2, 9.9, 10.6), "p5": (3.0, 3.6, 4.2, 4.9, 5.5, 6.2, 6.8), "p60": (2.4, 3.0, 3.5, 4.1, 4.6, 5.2, 5.6)},
          "female": {"p1": (5.2, 5.8, 6.3, 7.0, 7.5, 8.0, 8.6), "p5": (2.5, 3.0, 3.6, 4.3, 4.8, 5.4, 6.0), "p60": (2.0, 2.5, 3.0, 3.6, 4.1, 4.5, 5.0)}}
COGGAN_URL = "https://www.cyclistshub.com/average-cycling-power/"


def coggan_tiers(sex, key, kg):
    """Power profile categories in watts at the athlete's weight: (label, lo, hi, note), lowest first. None with no table."""
    edges = (COGGAN.get(sex) or {}).get(key)
    if not edges or not kg:
        return None
    w = [round(e * kg) for e in edges]
    out = []
    for i, lab in enumerate(COGGAN_LABELS):
        lo, hi = (None if i == 0 else w[i - 1]), (None if i == len(w) else w[i])
        rng = f"under {edges[0]} W/kg" if lo is None else f"{edges[i - 1]} W/kg and up" if hi is None else f"{edges[i - 1]} to {edges[i]} W/kg"
        out.append((lab, lo, hi, f"{rng} ({'under ' + str(hi) if lo is None else str(lo) + '+' if hi is None else str(lo) + ' to ' + str(hi)} W at {kg:.1f} kg)"))
    return out


def bike_bests(acts, field):
    """[(date, value)] oldest first: watts for a power best, minutes for the 40 km split (outdoor rides only, 40 to 200 min)."""
    out = []
    for a in acts:
        t = (a.get("type") or "").lower()
        if not ("cycl" in t or "rid" in t or "bik" in t):
            continue
        p = f"data/activities/{a['activity_id']}.json"
        if not os.path.exists(p):
            continue
        v = (json.load(open(p)).get("summary") or {}).get(field)
        if not v:
            continue
        if field.startswith("fastestSplit"):
            if "virtual" in t or "indoor" in t or not 40 * 60 <= v <= 200 * 60:
                continue
            v = round(v / 60, 2)
        elif not 30 <= v <= 2000:
            continue
        out.append((a["local_start"][:10], float(v)))
    return sorted(out)


def best_series(eff, today, better=1, window=FIVEK_WINDOW):
    """Best of the `window` days up to each effort: {points: [(date, best, this one)], current: (date, value) or None, baseline}.
    baseline: the best of the window that ended 28 days ago (None until there is one), for the coach guide ladder."""
    pick = max if better == 1 else min
    pts = []
    for i, (d, v) in enumerate(eff):
        win = [e for e in eff[: i + 1] if _d(e[0]) > _d(d) - timedelta(days=window)]
        pts.append((d, pick(win, key=lambda e: e[1])[1], v))
    rec = [e for e in eff if _d(e[0]) > today - timedelta(days=window)]
    old = [e for e in eff if today - timedelta(days=window + 28) < _d(e[0]) <= today - timedelta(days=28)]
    return {"points": pts, "current": pick(rec, key=lambda e: e[1]) if rec else None, "baseline": pick(old, key=lambda e: e[1])[1] if old else None,
            "all_time": pick(eff, key=lambda e: e[1])}


def guide_tiers(base, better, fmt):
    """Coach guide bands around the athlete's own baseline, lowest value first: (label, lo, hi, note)."""
    edge = lambda pct: base * (1 + pct / 100 * better)
    cuts = [("Below baseline", None, -3), ("Holding", -3, 3), ("Rising", 3, 10), ("Well up", 10, None)]
    rows = []
    for lab, lo, hi in cuts:
        a, b = (None if lo is None else edge(lo)), (None if hi is None else edge(hi))
        if better == -1:
            a, b = b, a
        note = f"{'more than 3% under' if lo is None else 'within 3% of' if lab == 'Holding' else '3 to 10% better than' if lab == 'Rising' else '10% or more better than'} your baseline of {fmt(base)}"
        rows.append((lab, a, b, note))
    return sorted(rows, key=lambda r: -1e18 if r[1] is None else r[1])


def best_5k_efforts(acts):
    return best_efforts(acts)


def five_k_series(efforts, results, today):
    """The 5K chart: at each run (and each reported test) the best 5K of the FIVEK_WINDOW days up to it; raw = that run's own.
    Returns points (date, best, raw, extra), current (date, best) within the window ending today or None, and the all-time best."""
    ev = [(d, v, f"{km:g} km run{f', avg HR {hr:.0f}' if hr else ''}") for d, v, km, hr, _ in efforts]
    for r in results:  # tests and reported results (benchmarks.json, minutes); a result on a run's date replaces that run
        v = _f(r.get("value"))
        if v:
            ev = [e for e in ev if e[0] != r["date"]] + [(r["date"], v, f"{r.get('short') or 'test'}, {r.get('source', 'Reported')}")]
    ev.sort()
    pts = []
    for i, (d, v, txt) in enumerate(ev):
        win = [e for e in ev[: i + 1] if _d(e[0]) > _d(d) - timedelta(days=FIVEK_WINDOW)]
        b = min(win, key=lambda e: e[1])
        pts.append((d, b[1], v, f"This run: {mss(v * 60)} ({txt})" + ("" if b[0] == d else f" · best of {FIVEK_WINDOW} days {mss(b[1] * 60)} on {_d(b[0]).strftime('%b %-d')}")))
    recent = [e for e in ev if _d(e[0]) > today - timedelta(days=FIVEK_WINDOW)]
    cur = min(recent, key=lambda e: e[1])[:2] if recent else None
    if cur and pts and pts[-1][0] != str(today) and cur[1] != pts[-1][1]:
        pts.append((str(today), cur[1], None, f"Best of the last {FIVEK_WINDOW} days ({_d(cur[0]).strftime('%b %-d')})"))
    return {"points": pts, "current": cur, "all_time": min(ev, key=lambda e: e[1])[:2]}



_SPORT_RE = {"bike": re.compile(r"^(bike|ftp|wkg|p1|p5|p20|p60|t20k|t40k|t90k|t100k|vo2bike)$"), "swim": re.compile(r"^swim"),
             "run": re.compile(r"^(run|5k|mile|10k|half|marathon|aerobic|durability)$|^(trail|climb)")}  # app.js SKILL_ICON


def earned_activity(acts, key, day):
    """The activity that earned a level up on `day` (app.js earnedOf): {"activity": "Zwift ride", "activity_id": "..."} or {}.
    Run and bike markers use the page calculation's own sessions (flat outdoor runs; Zwift rides); other skills take the
    longest activity of their sport that day."""
    sport = next((sp for sp, rx in _SPORT_RE.items() if rx.search(key)), None)
    if not sport:
        return {}

    def ok(a):
        t, nm = (a.get("type") or "").lower(), (a.get("name") or "")
        if key == "bike":
            return "virtual_ride" in t or "zwift" in nm.lower()
        if key == "run":
            return "run" in t and "treadmill" not in t and "virtual" not in t
        return {"bike": ("ride" in t or "cycl" in t or "bik" in t), "run": "run" in t, "swim": "swim" in t}[sport]
    same = [a for a in acts if (a.get("local_start") or "")[:10] == day and ok(a)]
    if not same:
        return {}
    a = max(same, key=lambda x: float(x.get("duration_min") or 0))
    t, nm = (a.get("type") or "").lower(), (a.get("name") or "")
    word = ("Zwift ride" if "zwift" in nm.lower() or "virtual" in t else "ride") if sport == "bike" else sport
    return {"activity": word, "activity_id": str(a.get("activity_id") or "")}

def build(today, rows_so_far):
    out = []
    acts = list(csv.DictReader(open("data/activities.csv"))) if os.path.exists("data/activities.csv") else []
    summ = list(csv.DictReader(open("data/summary.csv"))) if os.path.exists("data/summary.csv") else []
    feel = [r for r in rows_so_far if r.get("kind") == "feel_session"]
    bench = [r for r in rows_so_far if r.get("kind") in ("benchmark", "result")]
    vo2 = [r for r in rows_so_far if r.get("kind") == "vo2max"]
    health = json.load(open("coach/health.json")).get("rows", []) if os.path.exists("coach/health.json") else []
    T = today
    _anc_before = hr_anchor._CUR  # put back after the build, so a caller's anchors (or none, in tests) are not left changed
    ANC = hr_anchor.use(".", today)  # the athlete's own easy heart rates (the athlete, Nov 14, 2026); 150 and 130 for the athlete
    WHY_150, WHY_130 = why_hr(ANC["run"], "run", "run", "faster"), why_hr(ANC["bike"], "bike", "bike", "more watts")
    first_day = min((_d(r["date"]) for r in summ if r.get("date")), default=T)
    HIST_WEEKS = max(12, (_mon(T) - _mon(first_day)).days // 7)  # weekly chart series reach back to the first Garmin day
    # Population norms for this athlete's sex and age band (the athlete, Nov 8, 2026: levels follow each person, never hard-coded);
    # each ranked Fitness tile reads them on the shared percentile ladder (fit_ladder, vo2_norms.FIT_BANDS)
    NG = vo2_norms.group(T)
    NR = norm_rows()
    N5K, NSW, NWKG, NDUR = (fit_ladder.pick(NR, k, NG) for k in ("5k", "hm703_swim_pace", "wkg", "marathon_decoupling"))
    NRUN, NBIKE = run_pace_norm(fit_ladder.pick(NR, "hm703_run", NG)), bike_w_norm(fit_ladder.pick(NR, "hm703_bike", NG))
    CMP = tile_compare()
    TRI = next_triathlon(T)  # the 70.3 comparisons only for someone with a triathlon ahead (A coach for any person)
    GEN_ROWS = []
    # W/kg scales for the FTP tile, its W/kg row and the 20-minute best: the general population model first (the default),
    # then every W/kg population on file as a comparison
    WKG_SCALES = []
    _gen = wkg_general(NG)
    if _gen:
        WKG_SCALES.append(("general", "General population", dict(_gen, _note="Compared with the general population. ")))
    for _r in NR:
        if _r.get("key") == "wkg" and (not _r.get("sex") or not NG or _r.get("sex") == NG["sex"]) and (not _r.get("age_band") or not NG or _r.get("age_band") == NG["band"]):
            WKG_SCALES.append((_r.get("compare") or "zwift", _r.get("compare_label") or "Riders in one Zwift event", dict(_r, _note=f"Compared with {(_r.get('compare_label') or 'riders in one Zwift event').lower()}. ")))
    if CMP.get("ftp"):
        WKG_SCALES.sort(key=lambda x: x[0] != CMP["ftp"])

    def dist_scales(tile, key, metres=None, general_tiers=None):
        """Every scale on file for one distance marker as [(id, label, norm)], the tile's chosen one first: the baseline (a
        general population model for bike times; with none on file the tagged rows stand in and say so) and each comparison."""
        opts = fit_ladder.comparisons(NR, key)
        base = (bike_time_general(key, metres, NG) if metres else None) or fit_ladder.pick(NR, key, NG)
        sc = []
        if general_tiers:
            sc.append(("general", "General population", {"_tiers": general_tiers, "_note": "Compared with the general population: "}))
            base = None
        if base is not None:
            if base.get("stand_in") or base.get("compare"):
                sc.append(("stand_in", base.get("compare_label") or "Stand-in", dict(base, _note=f"No general population baseline exists for this yet, so {base.get('compare_label')} stand in. ")))
                return sc
            sc.append(("general", "General population", dict(base, _note="Compared with the general population. ")))
        for cid, lab in opts.items():
            nd = fit_ladder.pick(NR, key, NG, cid)
            if nd is not None:
                sc.append((cid, lab, dict(nd, _note=f"Compared with {lab}. ")))
        want = CMP.get(tile)
        return sorted(sc, key=lambda x: x[0] != want) if want else sc

    # Stages (the athlete, Nov 12, 2026: "the foundational baseline is the general population. You could evolve past that to a race
    # specific, or evolve past that to what are the elite athletes in this realm at"; the next stage is offered, never switched
    # to): 1 the general population, 2 the people who do the athlete's race or sport, 3 the elite of the sport.
    try:
        import compare
        _races = json.load(open("coach/races.json"))
        MY_RACE_SCALES = {x["id"]: x["race"] for x in compare.suggest(_races if isinstance(_races, list) else _races.get("rows", []), json.load(open("coach/fitness_layout.json")), NR, str(T))}
        RACE_IDS = {r[1] for r in compare.RACE_SCALES}
    except (OSError, ValueError, ImportError):
        MY_RACE_SCALES, RACE_IDS = {}, set()

    def stage_of(sid):
        if sid == "general":
            return 1, "Foundation"
        if str(sid).startswith("elite"):
            return 3, "Elite"
        if sid in MY_RACE_SCALES:
            return 2, "Your race"
        return 2, "Race" if sid in RACE_IDS or sid == "stand_in" else "Your sport"

    def with_scales(key, scales, apply):
        """Annotate marker `key` once per scale and keep every result on the row (field scales, JSON) so the page's Scale
        panel can switch between them; the first scale is the one shown. apply(norm) does the annotating."""
        m = next((x for x in out if x.get("kind") == "marker" and x["key"] == key), None)
        if m is None or not scales:
            return
        snaps = []
        for sid, lab, norm in reversed(scales):  # the chosen scale is applied last, so its fields stay on the row
            apply(norm)
            if sid == "general" and key in ANCHOR_GENERAL:
                m["anchor"] = ANCHOR_GENERAL[key]
            elif isinstance(norm, dict) and norm.get("population") and m.get("anchor"):  # the Anchor line names the scale in use, never another one
                m["anchor"] = ANCHOR_SRC.sub(lambda _x: f"Levels come from {norm.get('short') or norm['population']}. ", m["anchor"], count=1)
            snaps.append({"id": sid, "label": lab, "stage": stage_of(sid)[0], "stage_label": stage_of(sid)[1], **{f: m.get(f, "") for f in ("tiers", "splits", "rank", "rank_src", "gap", "basis", "anchor", "population", "pop_norm")}})
        m["compare"] = scales[0][0]
        if len(scales) > 1:
            m["scales"] = json.dumps(list(reversed(snaps)), ensure_ascii=False)

    _fix = "fixed until the norm is refreshed or your group changes"
    ANCHOR_GENERAL = {  # what fixes the general population scale on tiles whose baseline is a table or a model (short: see ANCHOR)
        "swim": "Cooper's 12-minute swim test categories for your age and sex (Cooper 1982), as pace per 100 yd. Five fitness categories, not percentiles.",
        "run": f"Levels come from a general population model (Estimated): FRIEND VO2max norms for your age and sex, turned into pace at 150 bpm (ACSM running equation). It assumes resting HR {REST_HR} and max HR 220 minus age.",
        **{k: f"Levels come from a general population model (Estimated): FRIEND VO2max norms for your age and sex, turned into {w} at 150 bpm (ACSM {eq}). It adds {round((TRAIL_TERRAIN - 1) * 100)}% for trail footing (Pandolf 1977, Soule 1978) and assumes resting HR {REST_HR} and max HR 220 minus age."
           for k, w, eq in (("trailgap", "trail pace", "running equation"), ("trailspeed", "trail speed per effort km", "running equation"),
                            ("climb", "climbing rate on a 15% grade", "walking equation"), ("climb150", "climbing rate on a 15% grade", "walking equation"),
                            ("climbsteep", "climbing rate on a 25% grade", "walking equation"))},
        "bike": f"Levels come from a general population model (Estimated): FRIEND cycling VO2max norms for your age and sex, turned into watts at 130 bpm (ACSM cycling equation). It assumes resting HR {REST_HR} and max HR 220 minus age.",
    }
    ANCHOR_SRC = re.compile(r"Levels come from .*? for your sex(?: and age band| where published \(not yet\))?\. ")
    NO_NORM = " No population levels yet: add \"sex\" and \"birth_year\" to coach/athlete/profile.json so the norms match your age and sex; a coach scale stands in."

    def ladder(key, norm, value, tiers_, resolution, extra=()):
        """Annotate-ready rank for a ladder marker and set its per-band sub-levels after annot()."""
        r, _p = fit_ladder.rank(norm, value, tiers_)
        def after():
            m = next((x for x in out if x.get("kind") == "marker" and x["key"] == key), None)
            if m is not None:
                m["splits"] = ",".join(str(x) for x in fit_ladder.splits(norm, tiers_, resolution) + [1] * len(extra))
        return r, after

    def marker(section, order, key, label, value, unit="", sub="", status="", why="", how="", label_ev="", chart=""):
        out.append({"kind": "marker", "section": section, "order": order, "key": key, "label": label, "value": value,
                    "unit": unit, "sub": sub, "status": status, "why": why, "how": how, "ev": label_ev, "chart": chart})

    def pt(key, d, v, extra=""):
        out.append({"kind": "mpt", "key": key, "date": str(d), "value": v, "extra": extra})

    def annot(key, target="", gap="", tiers=(), rank="", rank_src="", scale=None):
        """Target, gap, evidence tiers and a comparative rank for a marker (shown in the detail panel, Oct 23, 2026).
        tiers: (label, lo, hi, note) with lo/hi numbers or None; serialized 'label|lo|hi|note;...' like other dashboard rows.
        scale: the basis when a coach scale stands in for the population ladder (no norm for this athlete)."""
        m = next((r for r in out if r.get("kind") == "marker" and r["key"] == key), None)
        if m is None:
            return
        m["target"], m["gap"], m["rank"], m["rank_src"] = target, gap, rank, rank_src
        m["better"], m["split"] = BETTER.get(key, 1), SPLIT.get(key, 3)  # direction and sub-tier count per band (the page derives the sub-tiers)
        clean = lambda t: str(t).replace(";", ",").replace("|", "/")  # the row format uses ; and | as separators
        basis = lambda l: BASIS_OVERRIDE.get((key, l), scale or BASIS.get(key, "coach"))
        m["tiers"] = ";".join(f"{clean(l)}|{'' if lo is None else lo}|{'' if hi is None else hi}|{clean(n)}|{basis(l)}" for l, lo, hi, n in tiers)
        m["basis"] = scale or BASIS.get(key, "coach")
        m["anchor"] = ANCHOR.get(key, "") if scale is None else ANCHOR_COACH.get(key, ANCHOR.get(key, ""))
        m["population"] = POPULATION[key](m) if key in POPULATION else ""

    def tier_of(v, tiers):
        for l, lo, hi, _ in tiers:
            if (lo is None or v >= lo) and (hi is None or v < hi):
                return l
        return ""

    def dist_marker(section, order, key, label, sport_label, seg, eff, scales, each, how, conv=None):
        """One race-time-by-distance marker (best of the window up to each session, dots each session's own) with its ladder.
        eff: [(date, minutes)]. norm: a norms.json row in minutes or None. Returns the current value."""
        ser = best_series(eff, T, -1)
        for d, v, raw in ser["points"]:
            out.append({"kind": "mpt", "key": key, "date": d, "value": v, "raw": raw, "extra": f"This {each}: {htime(raw)}" + ("" if raw == v else f" · best of {FIVEK_WINDOW} days {htime(v)}")})
        c2, a2 = ser["current"], ser["all_time"]
        v2 = (c2 or (None, ser["points"][-1][1]))[1]
        marker(section, order, key, label, htime(v2), "",
               (f"Best in a {each}, last {FIVEK_WINDOW} days ({_d(c2[0]).strftime('%b %-d')})" if c2 else f"None in {FIVEK_WINDOW} days; last best {_d(ser['points'][-1][0]).strftime('%b %-d, %Y')}")
               + f" · all-time {htime(a2[1])} ({_d(a2[0]).strftime('%b %Y')})", "", "",
               how + f" Shown as the best of the {FIVEK_WINDOW} days up to each {each}; dots are each {each}'s own. A best inside training is a floor, not a race. Estimated.", "Estimated", "line")
        out[-1].update(sport_label=sport_label, seg=seg, better=-1)
        def apply(norm):
            if norm.get("_tiers"):  # a category scale (Cooper's 12-minute swim), not a percentile norm
                ct = norm["_tiers"]
                nb = next(((l, hi_) for l, lo_, hi_, _n in reversed(ct) if hi_ is not None and hi_ <= v2), None)
                annot(key, "", (f"{htime(v2 - nb[1])} to {nb[0]} ({htime(nb[1])})" if nb else "in the top category"), ct, tier_of(v2, ct),
                      norm["_note"] + f"Cooper's 12-minute swim test categories for {NG['label']} ({COOPER_URL}), carried to this distance at the same pace with a small allowance for distance. "
                      "Fitness categories for adults who can swim continuously, not percentiles. Estimated.", scale="research")
                m_ = next(x for x in out if x.get("kind") == "marker" and x["key"] == key)
                m_.pop("splits", None)
                return
            ft2 = fit_ladder.tiers(norm, 2, htime)
            rk2, after2 = ladder(key, norm, v2, ft2, 1 / 60)
            nb2 = next(((l, hi_) for l, lo_, hi_, _n in reversed(ft2) if hi_ is not None and hi_ <= v2), None)
            annot(key, "", (f"{htime(v2 - nb2[1])} to {nb2[0]} ({htime(nb2[1])})" if nb2 else "in the top band"), ft2, rk2,
                  norm.get("_note", "") + ("Coach estimate, not published results for this distance: " if norm.get("estimated") else "Bands are finisher percentiles for your sex: ")
                  + f"{norm['source']} ({norm['url']}). {norm.get('note', '')}", scale="coach" if norm.get("estimated") else "research")
            after2()
        with_scales(key, [(i_, l_, conv(n_) if conv and not n_.get("_tiers") else n_) for i_, l_, n_ in (scales or [])], apply)
        return v2

    # ---------------- Fitness performance ----------------
    # Durability: aerobic decoupling on long sessions from Garmin laps (speed or power per heartbeat, first vs second half).
    # Only steady sessions are scored (the athlete, Nov 12, 2026: the history read "all over the place" because hard days, easy days and
    # windy outdoor rides shared one line): durability.sessions sorts each long session, the tile reads the middle of the last
    # DUR_LAST steady ones of the same sport inside DUR_DAYS, and the others stay on the chart as unscored dots.
    dses = durability_sessions(acts)
    for x in dses:
        x["mid"] = None
        if x["scored"]:
            own = [y["drift"] for y in dses if y["scored"] and y["sport"] == x["sport"] and y["date"] <= x["date"]
                   and _d(y["date"]) > _d(x["date"]) - timedelta(days=DUR_DAYS)][-DUR_LAST:]
            x["mid"], x["n"] = round(statistics.median(own), 1), len(own)
    scored = [x for x in dses if x["scored"]]
    carry = scored[0]["mid"] if scored else None
    for x in dses:
        if x["scored"]:
            carry = x["mid"]
            out.append({"kind": "mpt", "key": "durability", "date": x["date"], "value": x["mid"], "raw": x["drift"], "extra": x["label"]})
        elif carry is not None:  # unscored: the line holds its last scored level, the session shows as a grey dot
            out.append({"kind": "mpt", "key": "durability", "date": x["date"], "value": carry, "off": x["drift"], "extra": x["label"]})
    live = [x for x in scored if _d(x["date"]) > T - timedelta(days=DUR_DAYS)]
    if live:
        last = live[-1]
        sp = "ride" if last["sport"] == "bike" else "run"
        other = next((x for x in reversed(live) if x["sport"] != last["sport"]), None)
        oname = "run" if last["sport"] == "bike" else "ride"
        osub = (f"{oname}s {other['mid']:.1f}% ({_d(other['date']).strftime('%b %-d')})" if other else
                ("run: needs a steady flat run of 75+ min" if oname == "run" else "ride: needs a steady Zwift ride of 90+ min"))
        marker("fitness", 3, "durability", "Durability (HR drift)", f"{last['mid']:.1f}", "% " + sp,
               f"Middle of the last {last['n']} steady long {sp}{'s' if last['n'] > 1 else ''} · latest {last['drift']:.1f}% on {_d(last['date']).strftime('%b %-d')} ({last['mins']} min) · {osub}"
               if last["n"] > 1 else f"One steady long {sp}, {_d(last['date']).strftime('%b %-d')} ({last['mins']} min) · {osub}",
               "good" if last["mid"] < 5 else "ok" if last["mid"] < 8 else "watch",
               "How much efficiency (speed or power per heartbeat) falls from the first half to the second half of a long steady session. Under about 5% suggests the aerobic base holds up for the session's length: the thing that decides the back half of a 70.3, an ultra or a full IRONMAN.",
               f"Steady long sessions only: runs of 75+ min and Zwift rides of 90+ min. Average heart rate at or under the top of your Steady zone (run {DUR_HR['run']}, bike {DUR_HR['bike']} bpm). Even effort: lap to lap spread of {DUR_CV}% or less. The first 10 minutes and laps with stops are left out. Hard or uneven days and outdoor rides (speed only: wind, stops and the route move it more than fatigue) stay on the chart as grey dots and do not move the level. The figure is the middle of the last {DUR_LAST} steady sessions of that sport in 12 months. From Garmin laps; hilly sessions are left out (trail runs have their own tile). Coaching heuristic, Estimated.",
               "Estimated", "line")
        md = next((r for r in out if r.get("kind") == "marker" and r["key"] == "durability"), None)
        gap_d = f"{last['mid'] - 5:+.1f} points vs 5%"
        if NDUR:  # the athlete's percentile ladder on the marathon study (the athlete chose all six tiles, Nov 8, 2026): two published points, the rest a normal fit
            if md is not None:
                pf = pct_from_front(NDUR, last["mid"])
                md["_pop"] = f"About {ordinal(100 - pf)} percentile of recreational marathon runners ({pf:.0f}% decoupled less; n {NDUR['n']:,}, Smyth 2022), but theirs is measured over a marathon and yours over {last['mins']} min, so the true standing is lower."
            dt = fit_ladder.tiers(NDUR, 1, lambda v: f"{v:.1f}%")
            rk, after = ladder("durability", NDUR, last["mid"], dt, 0.1)
            annot("durability", "Under 5% on long steady sessions (Friel's coaching convention); the ladder ranks you against recreational marathoners", gap_d, dt, rk,
                  "Estimated: the study publishes two points (10% and 20% decoupling, Smyth 2022, 82,303 recreational marathoners, measured over about 4 h), and every other edge comes from a normal curve through them. A 75 to 120 min session drifts less than a marathon, so this ranking flatters. No elite-vs-novice table exists; durability as a trait is a young research area (Maunder 2021).")
            after()
        else:
            annot("durability", "Under 5% on long steady sessions (Friel); under 10% is the marathon study's low band", gap_d,
                  DUR_TIERS, tier_of(last["mid"], DUR_TIERS), "Friel's 5% is a coaching convention (TrainingPeaks aerobic decoupling), not peer-reviewed. The 10% and 20% cuts are the tertiles of recreational marathoners in Smyth 2022 (research), over 4 h rather than 90 min. No elite-vs-novice table exists; durability as a trait is a young research area (Maunder 2021).", scale="coach")
        if md is not None:
            md.pop("_pop", None)
    else:
        marker("fitness", 3, "durability", "Durability (HR drift)", "—", "", "Needs a steady long session: a flat run of 75+ min or a Zwift ride of 90+ min at an even, easy to steady effort", "", "", "", "Estimated", "line")

    # Swim pace per 100 yd (moving time) for each pool swim
    swims = []
    for a in acts:
        if "swim" not in (a.get("type") or "").lower():
            continue
        yd = (_f(a.get("distance_mi")) or 0) * 1760
        mv = _f(a.get("moving_min")) or _f(a.get("duration_min"))
        if yd < 300 or not mv:
            continue
        sec = mv * 60 / (yd / 100)
        d = a["local_start"][:10]
        swims.append((d, sec, yd))
        pt("swim", d, round(sec, 1), f"{round(yd):,} yd · avg HR {a.get('avg_hr') or '—'}")
    swims.sort()
    css = next((r for r in bench if r.get("kind") == "benchmark" and r.get("key") == "css"), None)
    css_note = f"{css.get('name')} test: {'scheduled ' + css['next'] if css.get('next') else 'proposed' + (', ' + css['when'] if css.get('when') else '')}. " if css else ""
    if swims:
        d, sec, yd = swims[-1]
        marker("fitness", 4, "swim", "Swim pace", mss(sec), "/100 yd",
               f"{round(yd):,} yd on {_d(d).strftime('%b %-d')} · {len(swims)} swim{'s' if len(swims) > 1 else ''} on record",  # plain reading (6.49.0): "Nov 12, 2,026 yd" read as a year
               "", "Average moving pace per 100 yd for a whole pool swim. Your swim has the least data of the three sports; this shows whether easy swims get faster at the same effort.",
               "Moving time over distance, 25 yd pool. Compare similar swims (easy, continuous). " + (css_note or "") + "Measured, Calculated.", "Measured", "dots")
        msw = next((r for r in out if r.get("kind") == "marker" and r["key"] == "swim"), None)
        if NSW:
            if msw is not None:
                pf = pct_from_front(NSW, sec)
                msw["_pop"] = f"About {ordinal(100 - pf)} percentile of {NSW['population'].split(' (')[0]} ({pf:.0f}% faster; n about {NSW['n']:,}; a 70.3 swim of about {mss(sec * 21.12)} at this pace). Rough: pool moving pace against open-water race times."
            def swim_tri(_n=None):
                half = fit_ladder.value_at(NSW, 50)[0]
                st = fit_ladder.tiers(NSW, 1, lambda v: f"{mss(v)} /100 yd", floor=SWIM_CUTOFF[1])
                rk, after = ladder("swim", NSW, sec, st, 1.0, extra=(SWIM_CUTOFF,))
                word = "women" if NSW.get("sex") == "female" else "men"
                annot("swim", f"Top half of 70.3 {word} ({mss(half)} /100 yd) by {TRI or 'your triathlon'}; {own_target('swim')}",
                      f"{sec - half:+.0f} s vs the top-half line · {mss(199 - sec)} per 100 yd inside the cutoff pace", st + [SWIM_CUTOFF], rk,
                      "Compared with IRONMAN 70.3 finishers. Bands are 70.3 swim percentiles (" + NSW['source'].split(':')[0] + ", normal approximation from the published mean and SD; the top 1% and 0.5% from a log-normal tail, Estimated), converted to pace per 100 yd over 2,112 yd; the bottom band is the 70.3 cutoff. Pool moving pace against open-water race times, so rough. One swim on record, 25 yd pool, moving time")
                after()

            def swim_general(_n=None):
                ct = cooper_swim_tiers(NG)
                nb = next(((l, hi_) for l, lo_, hi_, _x in reversed(ct) if hi_ is not None and hi_ <= sec), None)
                annot("swim", own_target("swim"), (f"{sec - nb[1]:.0f} s per 100 yd to {nb[0]} ({mss(nb[1])})" if nb else "in the top category"), ct, tier_of(sec, ct),
                      f"Compared with the general population: Cooper's 12-minute swim test categories for {NG['label']} ({COOPER_URL}), as pace per 100 yd. Fitness categories for adults who can swim continuously, not percentiles. Your pace is a whole swim's moving pace, 25 yd pool.", scale="research")
                msw.pop("splits", None)
            NMS = fit_ladder.pick(NR, "swim1500", NG, "masters")  # masters 1,500 yd times, read as pace per 100 yd

            def swim_masters(_n=None):
                nm = dict(NMS, unit="s/100 yd", breakpoints=[[round(v * 60 / 15, 1), pc] for v, pc in NMS["breakpoints"]])
                st = fit_ladder.tiers(nm, 1, lambda v: f"{mss(v)} /100 yd")
                rk, after = ladder("swim", nm, sec, st, 1.0)
                nb = next(((l, hi_) for l, lo_, hi_, _x in reversed(st) if hi_ is not None and hi_ <= sec), None)
                annot("swim", own_target("swim"), (f"{sec - nb[1]:.0f} s per 100 yd to {nb[0]} ({mss(nb[1])})" if nb else "in the top band"), st, rk,
                      f"Compared with masters meet swimmers: {NMS['population']}, their 1,500 yd season bests read as pace per 100 yd. {NMS.get('note') or ''} Your pace is a whole swim's moving pace in training against race times, so rough.")
                after()
                msw["anchor"] = f"Percentile ladder, edges read from {NMS.get('short') or NMS['population']} (1,500 yd season bests as pace per 100 yd), {_fix}. Slower than the top 55% is an Estimated tail."
            sw_sc = ([("general", "General population", swim_general)] if cooper_swim_tiers(NG) else []) + ([("tri703", "IRONMAN 70.3 finishers", swim_tri)] if TRI or not cooper_swim_tiers(NG) else []) + ([("masters", "Masters meet swimmers", swim_masters)] if NMS and NMS.get("compare") == "masters" else [])
            if CMP.get("swim"):
                sw_sc.sort(key=lambda x: x[0] != CMP["swim"])
            with_scales("swim", sw_sc, lambda fn: fn())
        else:
            annot("swim", own_target("swim"), f"{mss(199 - sec)} per 100 yd inside the cutoff pace", SWIM_COACH_TIERS, tier_of(sec, SWIM_COACH_TIERS),
                  "Coaching convention, not research." + NO_NORM, scale="coach")
        if msw is not None:
            msw.pop("_pop", None)
            sp = []
            for sk, sl, metres, lo_, hi_, seg in SWIM_DIST:
                eff, pu = swim_bests(acts, metres, lo_, hi_)
                if not eff:
                    continue
                # the norms are filed in metres: for a yard pool, the same pace over the yard distance
                dist_marker("pair", 4, sk, f"Best {sl} {pu}", f"{sl} {pu}", seg, eff, dist_scales("swim", sk, general_tiers=cooper_swim_tiers(NG, metres, pu)), "swim",
                            f"Fastest {sl} {pu} inside any pool swim, from Garmin (lengths counted by the watch).",
                            conv=lambda nd, pu=pu: nd if (nd.get("pool_unit") or "m") == pu else dict(nd, breakpoints=[[round(v / YD_PER_M if pu == "yd" else v * YD_PER_M, 3), pc] for v, pc in nd["breakpoints"]]))
                sp.append(sk)
            if sp:
                msw.update(pair=",".join(sp), seg_legend="Distance", sport_label="Pace", seg=0)
    # FTP, W/kg, 5K from benchmark results
    res = {}
    for r in bench:
        if r.get("kind") == "result":
            res.setdefault(r.get("key"), []).append(r)
    defs = {r.get("key"): r for r in bench if r.get("kind") == "benchmark"}
    wt = [(r["date"], _f(r.get("weight_kg"))) for r in summ if _f(r.get("weight_kg"))]
    efforts5 = best_5k_efforts(acts)
    for order, key, label, unit in ((5, "ftp", "Bike FTP", "W"), (7, "5k", "5K time", "")):
        rs = sorted(res.get(key, []), key=lambda r: r.get("date"))
        nxt = (defs.get(key) or {}).get("next")
        if key == "5k" and efforts5:
            best5 = five_k_series(efforts5, rs, T)
            for d, v, raw, extra in best5["points"]:
                out.append({"kind": "mpt", "key": "5k", "date": d, "value": v, "raw": raw, "extra": extra})
            cur, ab = best5["current"], best5["all_time"]
            dfn = defs.get(key) or {}
            sub = (f"5K · Best in a run, last {FIVEK_WINDOW} days ({_d(cur[0]).strftime('%b %-d')})" if cur else f"No 5K run in {FIVEK_WINDOW} days; last best {_d(best5['points'][-1][0]).strftime('%b %-d, %Y')}") + \
                f" · all-time {mss(ab[1] * 60)} ({_d(ab[0]).strftime('%b %Y')})" + (f" · next test {_d(nxt).strftime('%b %-d')}" if nxt else "")
            marker("fitness", order, key, label, mss((cur or (None, best5["points"][-1][1]))[1] * 60), "", sub, "", dfn.get("why", ""),
                   f"Fastest 5 km inside any run, from Garmin's best-effort split (GPS), as the best of the {FIVEK_WINDOW} days up to each run. Dots are each run's own fastest 5 km; most are easy runs, so they sit slower than a race. Reported test results count too. Estimated. Test protocol: " + dfn.get("protocol", ""),
                   "Estimated", "line")
            out[-1].update(tile_label="Run time")  # the tile is named for what it is; its distance is the first word of the line under the figure (the athlete, Nov 12, 2026)
            # the same figure at other distances, behind the tile's Distance switch; no level ladder until norms exist for them
            others = []
            for dk, dl, split, lo, hi, seg in RUN_DIST:
                if dk == "5k":
                    continue
                eff = best_efforts(acts, split, lo, hi)
                if not eff:
                    continue
                ser = five_k_series(eff, [], T)
                for d, v, raw, extra in ser["points"]:
                    out.append({"kind": "mpt", "key": dk, "date": d, "value": v, "raw": raw, "extra": f"This run: {htime(raw)}" + ("" if raw == v else f" · best of {FIVEK_WINDOW} days {htime(v)}") if raw is not None else f"Best of the last {FIVEK_WINDOW} days"})
                c2, a2 = ser["current"], ser["all_time"]
                marker("pair", order, dk, {"half": "Half marathon time", "marathon": "Marathon time"}.get(dk, f"{dl} time"), htime((c2 or (None, ser["points"][-1][1]))[1]), "",
                       (f"Best in a run, last {FIVEK_WINDOW} days ({_d(c2[0]).strftime('%b %-d')})" if c2 else f"None in {FIVEK_WINDOW} days; last best {_d(ser['points'][-1][0]).strftime('%b %-d, %Y')}")
                       + f" · all-time {htime(a2[1])} ({_d(a2[0]).strftime('%b %Y')})", "", "",
                       f"Fastest stretch of this distance inside any run, from Garmin (its best-effort split, GPS), as the best of the {FIVEK_WINDOW} days up to each run; "
                       "dots are each run's own. A best effort inside a training run is a floor on race fitness, not a race. Estimated.", "Estimated", "line")
                out[-1].update(sport_label=dl, seg=seg, better=-1)
                # every distance has a ladder (the athlete, Nov 12, 2026: "always a ladder"; "search for a norm, otherwise coach's guidance"):
                # published finisher results for the half and the marathon, a coach estimate between the 5K and the half for the others
                nd = fit_ladder.pick(NR, dk, NG)
                v2 = (c2 or (None, ser["points"][-1][1]))[1]
                if nd:
                    ft2 = fit_ladder.tiers(nd, 2, htime)
                    rk2, after2 = ladder(dk, nd, v2, ft2, 1 / 60)
                    nb2 = next(((l, hi_) for l, lo_, hi_, _n in reversed(ft2) if hi_ is not None and hi_ <= v2), None)
                    annot(dk, "", (f"{mss((v2 - nb2[1]) * 60)} to {nb2[0]} ({htime(nb2[1])})" if nb2 else "in the top band"), ft2, rk2,
                          ("Coach estimate, not published results: " if nd.get("estimated") else "Bands are finisher percentiles for your age group and sex: ")
                          + f"{nd['source']} ({nd['url']}). " + ("The top 1% and 0.5% and the bottom 10% and 20% come from a log-normal tail (Estimated)." if not nd.get("estimated") else nd.get("note", "")),
                          scale="coach" if nd.get("estimated") else None)
                    after2()
                others.append(dk)
            if others:
                m5row = next(r for r in out if r.get("kind") == "marker" and r["key"] == "5k")
                m5row.update(pair=",".join(others), seg_legend="Distance", sport_label="5K", seg=2)
        elif rs:
            r = rs[-1]
            marker("fitness", order, key, label, r.get("text") or str(r.get("value")), unit if not r.get("text") else "",
                   f"{_d(r['date']).strftime('%b %-d, %Y')}" + (f" · {r['short']}" if r.get("short") else "") + (f" · next test {_d(nxt).strftime('%b %-d')}" if nxt else "") + (f" · {(defs.get(key) or {}).get('goal')}" if (defs.get(key) or {}).get("goal") else ""),
                   "", (defs.get(key) or {}).get("why", ""), (defs.get(key) or {}).get("protocol", ""), r.get("source", "Measured"), "dots")
            for x in rs:
                pt(key, x["date"], _f(x.get("value")), x.get("text", ""))
        else:
            marker("fitness", order, key, label, "—", "", f"First test {_d(nxt).strftime('%b %-d')}" if nxt else "No test scheduled",
                   "", (defs.get(key) or {}).get("why", ""), (defs.get(key) or {}).get("protocol", ""), "", "")
        if key == "ftp":
            if rs and wt:
                r = rs[-1]
                w = [v for dd, v in wt if abs((_d(dd) - _d(r["date"])).days) <= 3]
                wsub = "FTP over that week's average weight"
                if not w and wt:  # no weigh-in that week: nearest within 35 days, said plainly
                    dd, v = min(wt, key=lambda x: abs((_d(x[0]) - _d(r["date"])).days))
                    if abs((_d(dd) - _d(r["date"])).days) <= 35:
                        w = [v]; wsub = f"FTP over the nearest weigh-in ({_d(dd).strftime('%b %-d')}, {v * 2.20462:.0f} lb)"
                wkg = _f(r.get("value")) / _mean(w) if w else None
                fm = next((x for x in out if x.get("kind") == "marker" and x["key"] == "ftp"), None)
                if fm is not None and wkg:  # W/kg rides on the FTP tile (the athlete, Nov 1); its own row keeps the chart and bands
                    fm["sub"] = f"{wkg:.2f} W/kg · " + fm["sub"]
                marker("fitness", 6, "wkg", "Power to weight", f"{wkg:.2f}" if wkg else "—", "W/kg",
                       wsub + (" · rests on the July ramp FTP" if r.get("date", "") < "2026-11-01" else ""), "", "Watts per kilogram decides climbing and is the fairest way to compare bike fitness over time while weight changes.",
                       "FTP ÷ 7-day average weight around the test. Calculated.", "Calculated", "line")
                for x in rs:
                    if wt and _f(x.get("value")):
                        dd, v = min(wt, key=lambda q: abs((_d(q[0]) - _d(x["date"])).days))
                        if abs((_d(dd) - _d(x["date"])).days) <= 35:
                            pt("wkg", x["date"], round(_f(x.get("value")) / v, 2), f"{x.get('text') or x.get('value')} W over {v * 2.20462:.0f} lb")
            else:
                marker("fitness", 6, "wkg", "Power to weight", "—", "W/kg", f"After the FTP test{' ' + _d(nxt).strftime('%b %-d') if nxt else ''}", "",
                       "Watts per kilogram decides climbing and is the fairest way to compare bike fitness over time while weight changes.", "FTP ÷ 7-day average weight around the test. Calculated.", "", "")

    # Rank the benchmarks against published scales
    rs5 = sorted(res.get("5k", []), key=lambda r: r.get("date"))
    m5_ = next((r for r in out if r.get("kind") == "mpt" and r["key"] == "5k" and r.get("raw") is not None), None)
    if rs5 or m5_:
        p5 = sorted((r for r in out if r.get("kind") == "mpt" and r["key"] == "5k"), key=lambda r: r["date"])
        secs = (_f(p5[-1]["value"]) if p5 else _f(rs5[-1].get("value")) or 0) * 60  # 5K values are minutes
        if secs:
            ag = AG_5K_STD_SEC / secs * 100
            m5 = next((r for r in out if r.get("kind") == "marker" and r["key"] == "5k"), None)
            ev5 = f"Garmin best efforts from {len(efforts5)} runs since {_d(efforts5[0][0]).strftime('%b %Y')}; a best effort inside a training run is a floor on race fitness, not a race." if efforts5 else "One result on record (Oct 2024, Reported)."
            wma5 = f"WMA age-grade as a second reference: open 5K standard {mss(AG_5K_OPEN_SEC)} × age factor {AG_FACTOR_35} at 35 = {mss(AG_5K_STD_SEC)}. "
            if N5K:
                if m5 is not None:
                    pf = pct_from_front(N5K, secs / 60)
                    m5["_pop"] = f"About {ordinal(100 - pf)} percentile of {N5K['population']} ({pf:.0f}% faster than you; n about {N5K['n']:,}). Age-graded about {ag:.0f}% (WMA): half the speed of the age-adjusted world standard."
                ft = fit_ladder.tiers(N5K, 2, lambda v: mss(v * 60))
                rk, after = ladder("5k", N5K, secs / 60, ft, 1 / 60)
                nb = next(((l, hi) for l, lo, hi, _n in reversed(ft) if hi is not None and hi <= secs / 60), None)  # the next band up (faster)
                sub20 = fit_ladder.percentile(N5K, 20.0)
                annot("5k", f"Nov 28 baseline sets the Dec 19 goal; sub-20 (about the {ordinal(sub20)} percentile of {N5K.get('short', N5K['population'])}) is the long-term goal",
                      f"{secs - 1200:+.0f} s vs 20:00" + (f" · {secs - nb[1] * 60:+.0f} s to {nb[0]} ({mss(nb[1] * 60)})" if nb else ""), ft, rk,
                      f"Bands are finisher percentiles for your age group and sex: {N5K['source']} ({N5K['url']}); the top 1% and 0.5% and the bottom 10% and 20% come from a log-normal tail (Estimated). " + wma5 + ev5)
                after()
            else:
                annot("5k", "Nov 28 baseline sets the Dec 19 goal; sub-20 is the long-term goal", f"{secs - 1200:+.0f} s vs 20:00", AG_WMA_TIERS, tier_of(secs / 60, AG_WMA_TIERS), wma5 + ev5 + NO_NORM, scale="research")
            if m5 is not None:
                m5.pop("_pop", None)
    # Bike FTP tile, Effort switch: power bests and the 40K time, each with a ladder (20 min on the W/kg distribution at the
    # latest weigh-in, the others a coach guide against the athlete's own baseline until norms are filed)
    mftp = next((x for x in out if x.get("kind") == "marker" and x["key"] == "ftp"), None)
    if mftp is not None:
        pairs = []
        for bk, bl, field, seg in BIKE_BEST:
            eff = bike_bests(acts, field)
            if not eff:
                continue
            bt = 1
            fmt = lambda v: f"{v:.0f} W"
            ser = best_series(eff, T, bt)
            for d, v, raw in ser["points"]:
                out.append({"kind": "mpt", "key": bk, "date": d, "value": v, "raw": raw, "extra": f"This ride: {fmt(raw)}" + ("" if raw == v else f" · best of {FIVEK_WINDOW} days {fmt(v)}")})
            c2, a2 = ser["current"], ser["all_time"]
            v2 = (c2 or (None, ser["points"][-1][1]))[1]
            marker("pair", 5, bk, "40K time" if bk == "t40k" else f"Best {bl} power", fmt(v2).replace(" W", ""), "" if bk == "t40k" else "W",
                   (f"Best in a ride, last {FIVEK_WINDOW} days ({_d(c2[0]).strftime('%b %-d')})" if c2 else f"None in {FIVEK_WINDOW} days; last best {_d(ser['points'][-1][0]).strftime('%b %-d, %Y')}")
                   + f" · all-time {fmt(a2[1])} ({_d(a2[0]).strftime('%b %Y')})", "", "",
                   ("Fastest 40 km inside any outdoor ride, from Garmin (GPS); hills, wind and riding in a group move it, so compare like with like. "
                    if bk == "t40k" else f"Highest average power held for {bl} inside any ride with a power source, from Garmin; ") +
                   f"shown as the best of the {FIVEK_WINDOW} days up to each ride, dots are each ride's own. A best inside a training ride is a floor, not a test. Estimated.", "Estimated", "line")
            out[-1].update(sport_label=bl, seg=seg, better=bt)
            kg_now = wt[-1][1] if wt else None
            if bk == "p20" and WKG_SCALES and kg_now:
                def apply(NWKG, bk=bk, v2=v2, kg_now=kg_now):
                    wk_ = fit_ladder.tiers(NWKG, 2, lambda v: f"{v:.2f} W/kg")
                    t20 = [(l, None if lo is None else round(lo * kg_now), None if hi is None else round(hi * kg_now), n) for l, lo, hi, n in wk_]
                    annot(bk, "", "", t20, f"{tier_of(v2, t20)} ({ordinal(fit_ladder.percentile(NWKG, v2 / kg_now))} percentile, {NWKG.get('short') or NWKG['population']})",
                          NWKG.get("_note", "") + f"Bands are power per kilogram from {NWKG['population']} ({NWKG['url']}), in watts at your latest weigh-in ({kg_now:.1f} kg). " + (NWKG.get("note") or ""))
                    next(x for x in out if x.get("kind") == "marker" and x["key"] == bk)["splits"] = ",".join(str(x) for x in fit_ladder.splits(NWKG, t20, 1.0))
                with_scales(bk, WKG_SCALES, apply)
            elif NG and coggan_tiers(NG.get("sex"), bk, kg_now):
                ct = coggan_tiers(NG["sex"], bk, kg_now)
                nb_ = next(((l, lo) for l, lo, _hi, _n in ct if lo is not None and lo > v2), None)
                annot(bk, "", (f"{nb_[1] - v2:+.0f} W to {nb_[0]} ({nb_[1]} W at your weight)" if nb_ else "in the top category"), ct, tier_of(v2, ct),
                      f"Bands are the Allen and Coggan power profile categories for {'men' if NG['sex'] == 'male' else 'women'}, watts per kilogram for this duration, in watts at your latest weigh-in ({kg_now:.1f} kg) ({COGGAN_URL}). "
                      "They sort racing cyclists into categories; they are not percentiles for your age group. A percentile source by age and sex replaces them when one is filed.", scale="research")
            elif ser["baseline"]:
                gt = guide_tiers(ser["baseline"], bt, fmt)
                annot(bk, "", "", gt, tier_of(v2, gt), "Coach guide: no trusted published norm for this effort is filed yet, so the bands are your own figure against your baseline, "
                      f"the best of the {FIVEK_WINDOW} days that ended four weeks ago ({fmt(ser['baseline'])}). It moves to a percentile ladder when a norm is found.", scale="coach")
            else:
                out[-1]["sub"] += " · setting your baseline: a level appears after four weeks of rides"
            pairs.append(bk)
        if pairs:
            mftp.update(pair=",".join(pairs), seg_legend="Effort", sport_label="FTP", seg=0)
    # Bike time tile: best 40K inside an outdoor ride, with 20K, 90K, the metric century and the century behind a Distance switch (the bike's 5K tile)
    beff = {k: [(d, v) for d, v, _s in ride_dist.efforts(acts, k)] for k, _l, _m, _lo, _hi in ride_dist.DISTANCES}
    bsrc = {k: {s for _d2, _v, s in ride_dist.efforts(acts, k)} for k in beff}
    bhow = lambda k, l: (f"Fastest {l} inside any outdoor ride" + (", Garmin's own split (GPS)." if bsrc[k] == {"garmin"} else ", worked out from the ride's track." if bsrc[k] == {"track"}
                         else ", estimated from the ride's laps until its track is pulled (reads up to about 2% slow).") + " Hills, wind, stops and group riding move it, so compare like with like.")
    if beff["t40k"]:
        dist_marker("fitness", 6, "t40k", "Bike time, 40K", "40K", 2, beff["t40k"], dist_scales("t40k", "t40k", 40000), "ride", bhow("t40k", "40K"))
        _bt = next(x for x in out if x.get("kind") == "marker" and x["key"] == "t40k")
        _bt.update(tile_label="Bike time", sub="40K · " + str(_bt.get("sub") or ""))  # named for what it is; the distance leads the line under the figure
        bp = []
        for bk, bl, seg in (("t20k", "20K", 1), ("t90k", "90K", 3), ("t100k", "100K", 4), ("t100mi", "100 mi", 5)):
            if beff[bk]:
                dist_marker("pair", 6, bk, f"Bike time, {bl}", bl, seg, beff[bk], dist_scales("t40k", bk, next(m for k, _l, m, _a, _b in ride_dist.DISTANCES if k == bk)), "ride", bhow(bk, bl))
                bp.append(bk)
        if bp:
            next(x for x in out if x.get("kind") == "marker" and x["key"] == "t40k").update(pair=",".join(bp), seg_legend="Distance")
    else:
        marker("fitness", 6, "t40k", "Bike time, 40K", "—", "", "Needs an outdoor ride of 40 km or more", "", "", "", "Estimated", "line")
        out[-1].update(tile_label="Bike time")
    rsf = sorted(res.get("ftp", []), key=lambda r: r.get("date"))
    kg_test, kg_date = None, None
    if rsf and wt:  # the weigh-in nearest the last test (within 35 days), so the watt bands move only when a new test lands
        dd, v = min(wt, key=lambda q: abs((_d(q[0]) - _d(rsf[-1]["date"])).days))
        if abs((_d(dd) - _d(rsf[-1]["date"])).days) <= 35:
            kg_test, kg_date = v, dd
    if rsf and kg_test and WKG_SCALES:  # every W/kg scale on file, in watts at the test weight; the general population first
        def apply(NWKG):
            def _w(x):
                return round(x * kg_test)
            wt_ = fit_ladder.tiers(NWKG, 2, lambda v: f"{v:.2f} W/kg")
            ftp_tiers = [(l, None if lo is None else _w(lo), None if hi is None else _w(hi), f"{n} ({'under ' + str(_w(hi)) if lo is None else str(_w(lo)) + '+' if hi is None else str(_w(lo)) + '–' + str(_w(hi))} W at {kg_test:.1f} kg)")
                         for l, lo, hi, n in wt_]
            fv = _f(rsf[-1].get("value"))
            rk = f"{tier_of(fv, ftp_tiers)} ({ordinal(fit_ladder.percentile(NWKG, fv / kg_test))} percentile, {NWKG.get('short') or NWKG['population']})"
            nb = next(((l, lo) for l, lo, _hi, _n in ftp_tiers if lo is not None and lo > fv), None)
            annot("ftp", "The next 20-min test sets the baseline; no watt target until then", (f"{nb[1] - fv:+.0f} W to {nb[0]} ({nb[1]} W at your test weight)" if nb else "in the top band"), ftp_tiers, rk,
                  NWKG.get("_note", "") + f"Estimated: {NWKG['population']}. {NWKG.get('note') or ''} Earlier wording for the one-event sample: the only W/kg distribution in the library was {NWKG['population']}, both sexes and 20-min power, so it reads harder than a fair age-group comparison; a men's and women's sample by age is queued. Converted to watts at your weight on the test day ({kg_test:.1f} kg, weigh-in {_d(kg_date).strftime('%b %-d')}); fixed until the next test. Rests on a ramp FTP the athlete believes is high.")
            m_ = next((x for x in out if x.get("kind") == "marker" and x["key"] == "ftp"), None)
            if m_ is not None:  # sub-levels never finer than 1 W
                m_["splits"] = ",".join(str(x) for x in fit_ladder.splits(NWKG, ftp_tiers, 1.0))
        with_scales("ftp", WKG_SCALES, apply)
    elif rsf and kg_test:
        def _w(x):
            return round(x * kg_test)
        ftp_tiers = []
        for l, lo, hi, n in WKG_TIERS:
            watts = f"under {_w(hi)} W" if lo is None else f"{_w(lo)}+ W" if hi is None else f"{_w(lo)}–{_w(hi)} W"
            wkg = f"under {hi} W/kg" if lo is None else f"{lo}+ W/kg" if hi is None else f"{lo}–{hi} W/kg"
            ftp_tiers.append((l, None if lo is None else _w(lo), None if hi is None else _w(hi), f"{watts} at {kg_test:.1f} kg, your weight at the {_d(rsf[-1]['date']).strftime('%b %-d, %Y')} test ({wkg})"))
        fv = _f(rsf[-1].get("value"))
        annot("ftp", "The next 20-min test sets the baseline; no watt target until then", f"{fv - _w(2.4):+.0f} W vs {_w(2.4)} W (the Fair band at your test weight)", ftp_tiers, tier_of(fv, ftp_tiers),
              f"Coggan power profile bands converted to watts at your weight on the test day ({kg_test:.1f} kg, weigh-in {_d(kg_date).strftime('%b %-d')}); fixed until the next test. Competitive-cyclist reference, not age-group. Rests on a ramp FTP the athlete believes is high." + NO_NORM, scale="coach")
    # Pace at 150 bpm and power at 130 bpm are computed on the page (calc 'fitness'); these rows carry their tiers and targets only
    for key, label, unit, tiers, target, src in (
            ("run", "Run pace at 150 bpm", "/mi", RUN150_TIERS, own_target("run"),
             "Flat runs, 28-day average of pace scaled to 150 bpm; heat and wind move it. The population bands assume the easy-HR pace held for the whole run leg, which is a floor, not a race prediction. Estimated."),
            ("bike", "Bike power at 130 bpm", "W", BIKE130_TIERS, own_target("bike"),
             "Zwift rides only, trainer power (calibration unknown), 28-day average of power scaled to 130 bpm. The population bands assume this easy-HR power held for 56 flat miles through a power model: a floor, not a race prediction. Estimated.")):
        marker("calc", 0, key, label, "", unit, "", "", "", "", "Estimated", "line")
        out[-1]["why_hr"] = WHY_150 if key == "run" else WHY_130
        nr = NRUN if key == "run" else NBIKE
        if nr:  # the athlete's percentile ladder (Nov 8, 2026); block goal lines come from coach/levels.json, built on the page, and the page reads the level
            # Baseline: the general population model; the 70.3 legs are a comparison the Scale panel can switch to (the athlete, Nov 12, 2026)
            gen = easy_general(key, NG, hr=ANC[key])
            sc = ([("general", "General population", gen)] if gen else []) + ([("tri703", "IRONMAN 70.3 finishers", nr)] if TRI or not gen else [])
            if CMP.get(key):
                sc.sort(key=lambda x: x[0] != CMP[key])
            GEN_ROWS.extend([gen] if gen else [])

            def apply(n_, key=key, target=target, src=src):
                pt_ = fit_ladder.tiers(n_, 3 if key == "run" else 0, (lambda v: f"{mss(v * 60)}/mi") if key == "run" else (lambda v: f"{v:.0f} W"))
                who = ("Compared with the general population: " + n_["source"] + ". " + n_["note"] + " ") if n_.get("estimated") else "Compared with IRONMAN 70.3 finishers. "
                annot(key, target, "", pt_, "", who + src, scale="coach" if n_.get("estimated") else None)
                m_ = next(x for x in out if x.get("kind") == "marker" and x["key"] == key)
                m_["splits"] = ",".join(str(x) for x in fit_ladder.splits(n_, pt_, 1 / 60 if key == "run" else 1.0))
                m_["pop_norm"] = n_["key"]
            with_scales(key, sc, apply)
        else:
            annot(key, target, "", RUN150_TIERS if key == "run" else BIKE130_TIERS, "", src + NO_NORM, scale="coach")
    for nr in [NRUN, NBIKE] + GEN_ROWS:
        if nr:
            out.append(dict(nr))
    wk = next((r for r in out if r.get("kind") == "marker" and r["key"] == "wkg"), None)
    if wk and wk.get("value") not in ("—", "", None):
        v = float(wk["value"])
        tgt_w = own_target("wkg")
        if WKG_SCALES:
            def apply(NWKG):
                pf = pct_from_front(NWKG, v)
                wk["_pop"] = f"About {ordinal(100 - pf)} percentile of {NWKG['population']}: weak reference (mixed sexes, one event, 20-min power); a men's and women's sample by age is queued."
                wt2 = fit_ladder.tiers(NWKG, 2, lambda x: f"{x:.2f} W/kg")
                rk, after = ladder("wkg", NWKG, v, wt2, 0.01)
                nb = next(((l, lo) for l, lo, _hi, _n in wt2 if lo is not None and lo > v), None)
                annot("wkg", tgt_w, (f"{nb[1] - v:+.2f} to {nb[0]} ({nb[1]:.2f})" if nb else "in the top band"), wt2, rk,
                      NWKG.get("_note", "") + f"Estimated: {NWKG['population']}. {NWKG.get('note') or ''} For the one-event sample: both sexes, 20-min power not FTP, riders may have been cruising; the edges past the published 0.8% to 95% come from a normal fit. Reads harder than a fair age-group comparison. Rests on a ramp FTP the athlete believes is high.")
                after()
            with_scales("wkg", WKG_SCALES, apply)
        else:
            annot("wkg", tgt_w, f"{v - 2.4:+.2f} vs 2.4 (next band)", WKG_TIERS, tier_of(v, WKG_TIERS),
                  "Coggan power profile (FTP W/kg, men): the reference group is competitive road cyclists from novice to world class, not age-group triathletes, so the labels run hard. Coaching convention. Rests on a ramp FTP the athlete believes is high." + NO_NORM, scale="coach")
        wk.pop("_pop", None)

    # Consistency: training days per Mon-Sun week (any run, ride, swim, hike, strength; walks and sauna left out),
    # except for someone whose own sport is walking (a walking group on their Fitness tab): their walks are their training
    try:
        walker = any(r.get("kind") == "fit_group" and r.get("key") == "walking" for r in json.load(open("coach/fitness_layout.json")).get("rows", []))
    except (OSError, ValueError, AttributeError):
        walker = False
    days = {}
    for a in acts:
        t = (a.get("type") or "").lower(); n = (a.get("name") or "").lower()
        if ("walk" in t and not walker) or "sauna" in n or t in ("", "type"):
            continue
        d = _d(a["local_start"])
        days.setdefault(_mon(d), set()).add(d)
    for r in feel:
        # a hand-logged walk is a walk: left out like a recorded one (it used to count, which read Oct 19, 2026's week as 3 days)
        if str(r.get("activity_id", "")).startswith("manual-") and (walker or not str(r.get("activity") or "").strip().lower().startswith("walk")):
            d = _d(r["date"]); days.setdefault(_mon(d), set()).add(d)
    cur = _mon(T)
    weeks = [cur - timedelta(weeks=i) for i in range(12, 0, -1)]  # 12 full weeks before this one
    first = min(days) if days else cur
    weeks = [w for w in weeks if w >= first]
    counts = [len(days.get(w, ())) for w in weeks]
    for i in range(HIST_WEEKS, 0, -1):  # chart: every full week since the Garmin record starts (the tile reads the last 12)
        w = cur - timedelta(weeks=i)
        if w >= first:
            pt("consistency", w, len(days.get(w, ())), f"week of {w.strftime('%b %-d')}")
    pt("consistency", cur, len(days.get(cur, ())), "this week so far")
    if counts:
        good = sum(1 for c in counts if c >= 3)
        better = sum(1 for c in counts if c >= 4)
        marker("fitness", 8, "consistency", "Consistency", f"{good} of {len(counts)}", "weeks",
               f"weeks with 3+ training days · 4+ in {better} · avg {_mean(counts):.1f} days/week", "good" if good >= 0.75 * len(counts) else "ok" if good >= 0.5 * len(counts) else "watch",
               "Showing up most days, week after week, is what builds an endurance base and keeps injury risk down; it predicts progress better than any single big session.",
               "A training day has a run, ride, swim, hike or logged strength, in Mon–Sun weeks (" + ("walks count, since walking is your sport; sauna does not" if walker else "walks and sauna not counted") + "). Two sessions on one day count once. 3+ days is the research cutoff for 'regularly active'; 4 and 5 are coach tiers. Measured.",
               "Measured", "bars")
        avgc = _mean(counts)
        annot("consistency", "Good: 3+ days in 9 of 12 weeks (research cutoff). Better: 4. Best: 5 to 6 with at least one low-load day",
              f"{good - 9:+d} weeks vs 9 of 12 at 3+ · {better - 9:+d} at 4+ · average {avgc:.1f} days/week", CONS_TIERS, tier_of(avgc, CONS_TIERS),
              "Days with a session, not sessions: a double day counts once. Research compares session frequency at equal weekly volume; it does not show 4 days beating 3. The 4 and 5 tiers are a load-spreading guide for an ultra and 70.3 runner (IR-01, IR-03), not a mortality finding.")

    # Trail (the athlete, Nov 1, 2026): time on feet leads (longest run in 28 days against the block's planned long run),
    # climbing speed is the second line (feet per hour on uphill laps of runs in the last 56 days).
    plan_blocks = [r for r in (json.load(open("coach/plan.json")).get("rows", []) if os.path.exists("coach/plan.json") else []) if r.get("kind") == "block"]
    blk = next((b for b in plan_blocks if _d(b["start"]) <= T <= _d(b["end"])), None)
    nblk = next((b for b in sorted(plan_blocks, key=lambda b: b["start"]) if _d(b["start"]) > T and b.get("long_run_min")), None)
    lr_plan, lr_src = (blk.get("long_run_min"), blk.get("label")) if blk and blk.get("long_run_min") else ((nblk.get("long_run_min"), f"{nblk.get('label')}, from {_d(nblk['start']).strftime('%b %-d')}") if nblk else (None, None))
    # The furthest long run the plan builds to, read from the blocks (never typed here).
    _later = [b for b in plan_blocks if b.get("long_run_min") and _d(b["end"]) >= T]
    _pk = max(_later, key=lambda b: b["long_run_min"]) if _later else None
    lr_peak = f"; {hm(_pk['long_run_min'])} by {_d(_pk['end']).strftime('%b %-d')} ({_pk.get('label')})" if _pk and _pk["long_run_min"] != lr_plan else ""
    runs = [a for a in acts if "run" in (a.get("type") or "").lower() and _f(a.get("duration_min"))]
    for a in runs:
        if (_f(a.get("duration_min")) or 0) >= 45:
            pt("trail", a["local_start"][:10], round(_f(a["duration_min"]) / 60, 2), f"{'Trail run' if 'trail' in a['type'] else 'Run'} {hm(_f(a['duration_min']))} · {round(_f(a.get('ascent_ft')) or 0):,} ft")
    win = [a for a in runs if T - timedelta(days=28) < _d(a["local_start"]) <= T]
    hilly = lambda a: (_f(a.get("ascent_ft")) or 0) >= HILLY_FT_MI * (_f(a.get("distance_mi")) or 99)
    n_hilly = sum(1 for a in runs if T - timedelta(days=56) < _d(a["local_start"]) <= T and hilly(a))
    climb = f"{n_hilly} hilly run{'' if n_hilly == 1 else 's'}, 8 wk"
    if win:
        lng = max(win, key=lambda a: _f(a["duration_min"]))
        mins = _f(lng["duration_min"])
        marker("fitness", 9, "trail", "Time on feet", hm(mins), "longest, 4 wk",
               (f"plan {hm(lr_plan)} in {lr_src} · " if lr_plan else "") + climb,
               "good" if lr_plan and mins >= lr_plan else "ok",
               "Time on feet decides whether a trail ultra is finishable; climbing speed decides how long it takes. The plan line is the long run each block builds to (coach/plan.json).",
               f"Longest run (road or trail, elapsed time) in the last 28 days, against the current block's planned long run (coach/plan.json long_run_min). The second line counts hilly runs ({HILLY_FT_MI} ft of climb per mile or more) in 8 weeks; climbing speed has its own tile, Climbing at 150 bpm. Measured, Calculated.",
               "Measured", "dots")
        annot("trail", (f"{hm(lr_plan)} by the end of {lr_src}" if lr_plan else "Set at the next block brief") + lr_peak,
              f"{mins - lr_plan:+.0f} min vs the {hm(lr_plan)} plan" if lr_plan else "", TRAIL_TIERS, tier_of(mins / 60, TRAIL_TIERS),
              "Coach guide for ultra readiness by longest training run, not research: there is no published norm for time on feet. The long run steps (within about 10% of the prior 30 days' longest) are in CURRENT-STATE.")
    else:
        marker("fitness", 9, "trail", "Time on feet", "—", "", ("plan " + hm(lr_plan) + " · " if lr_plan else "") + "no run in 4 weeks", "", "", "", "Measured", "dots")

    # Trail running (the athlete, Nov 11, 2026): two tiles from hilly runs (trail_effort.py), 28-day averages, each run's own value in the
    # point's note. Sustainable trail speed (min per effort km, the whole run) carries two bars: Overall and Runnable (grade adjusted
    # pace under 10%). Climbing at 150 bpm (ft/h on 10%+, minute by minute) carries two bars: 10 to 20% and 20%+. The paired rows
    # (section 'pair') are never tiles: they give the bars and the switch in the opened tile. Footing from the after-session form.
    foot = {str(r.get("activity_id")): ", ".join(x for x in [FOOTING.get(r.get("footing") or "", "")] + [GROUND.get(g, g) for g in str(r.get("ground") or "").split(";") if g] if x) for r in feel}
    tr = trail_effort.per_run(acts, summ)
    race = next_trail_course(T)
    speed_tiers, gap_tiers, (ANCHOR_COACH["trailspeed"], ANCHOR_COACH["trailgap"]) = trail_tiers(race)
    HOW_HR = " Heart rate must average 20+ bpm over resting; the scaling is value × (HR − RHR) ÷ (150 − RHR), RHR the 15-day mean around the run."
    climb_how = lambda lo, hi: (f"Every minute on {lo:g}%{f' to {hi:g}%' if hi else ' or steeper'} ground in hilly runs and hikes, graded minute by minute from the 5 s detail. "
                                "Each minute counts at its own grade, so a steep pitch inside a long climb is not averaged away. A run needs 3 such minutes. Heart rate is read 30 s later "
                                "because it lags the hill, then vertical feet per hour is scaled to 150 bpm minute by minute, only for minutes at 125 to 180 bpm. Running and power hiking "
                                "both count; the share hiked comes from cadence (under 130 steps/min). 28-day average; one run moves it a lot, so read it over several. Estimated.")
    COACH_TRAIL = "Coach guide; no population norm exists for this at a set heart rate. Draft for review."

    def trail_scales(key, field, tiers, v, target, gap, rk):
        """General population first (the default, the athlete picked it Nov 15, 2026), the coach guide as a switchable comparison."""
        gen = trail_general(key, NG, hr=ANC["run"])
        if gen is None:
            annot(key, target, gap, tiers, rk, COACH_TRAIL + NO_NORM, scale="coach")
            return
        climb_ = field not in ("pace", "speed")
        fmt = (lambda x: f"{x:,.0f} ft/h") if climb_ else (lambda x: f"{mss(x * 60)}{'/mi' if field == 'pace' else ' per effort km'}")

        def general():
            gt = fit_ladder.tiers(gen, 0 if climb_ else 3, fmt)
            if v is None:
                annot(key, target, "", gt, "", "Compared with the general population: " + gen["source"] + ". " + gen["note"], scale="coach")
                return
            grk, after = ladder(key, gen, v, gt, 1.0 if climb_ else 1 / 60)
            if climb_:
                nb = next(((l, lo) for l, lo, _hi, _n in gt if lo is not None and lo > v), None)
                ggap = f"{nb[1] - v:,.0f} ft/h to {nb[0]}" if nb else "in the top band"
            else:
                nb = next(((l, hi) for l, _lo, hi, _n in reversed(gt) if hi is not None and hi <= v), None)
                ggap = f"{mss((v - nb[1]) * 60)} to {nb[0]}" if nb else "in the top band"
            annot(key, target, ggap, gt, grk, "Compared with the general population: " + gen["source"] + ". " + gen["note"], scale="coach")
            after()

        def guide():
            annot(key, target, gap, tiers, rk, COACH_TRAIL, scale="coach")
            m_ = next(x for x in out if x.get("kind") == "marker" and x["key"] == key)
            m_.pop("splits", None)
        guide_label = "Vertical kilometre guide" if climb_ else (f"{race['name']} pacing" if race else "100K cutoff pacing")
        sc = [("general", "General population", general), ("coach", guide_label, guide)]
        if CMP.get(key):
            sc.sort(key=lambda x: x[0] != CMP[key])
        with_scales(key, sc, lambda fn: fn())

    specs = (
        ("trailspeed", "Sustainable trail speed", "speed", "/effort km", speed_tiers, "Overall",
         "How fast you cover trail at easy effort, all of it: running, hiking, climbs and descents. One number for any trail, and it turns into a time for any course.",
         "Moving time per effort km (ITRA effort distance: each km counts 1, each 100 m of climbing counts 1 more), scaled to 150 bpm by the run's average heart rate (135 to 175 bpm). Trail and hilly runs only. A course's moving time = this pace × its effort km, before aid stops and late fade. 28-day average. Estimated." + HOW_HR),
        ("trailgap", "Runnable pace at 150 bpm", "pace", "/mi", gap_tiers, "Runnable",
         "How well you run the runnable ground (under 10%): about two thirds of your time on most trails.",
         "Hilly runs only, from the 5 s detail. Each minute's distance becomes flat-equivalent distance by the energy cost of running on its grade (Minetti 2002); the first 10 minutes, steep descents (over 10% down), climbs of 10% or more (they count in Climbing), hiking (cadence under 130 steps/min) and stops are left out, then pace is scaled to 150 bpm. 28-day average. Estimated." + HOW_HR),
        ("climb", "Climbing at 150 bpm", "climb", "ft/h", CLIMB_TIERS["climb150"], "10%+",
         "How fast you gain height at easy effort on 10% and steeper, where almost everyone hikes and height per hour is the fair measure (Minetti 2002).", climb_how(10, None)),
        ("climb150", "Climbing at 150 bpm, 10 to 20%", "c1020", "ft/h", CLIMB_TIERS["climb150"], "10–20%",
         "Height per hour on 10 to 20% ground, where you mix running and power hiking.", climb_how(10, 20)),
        ("climbsteep", "Climbing at 150 bpm, 20%+", "c20", "ft/h", CLIMB_TIERS["climbsteep"], "20%+",
         "Height per hour on 20% and steeper, where nearly every step is a hike.", climb_how(20, None)),
    )
    for key, label, field, unit, tiers, bar_name, why, how in specs:
        runs_ = [r for r in tr if r.get(field)]
        avg = trail_effort.rolling([(r["date"], r[field]["value"]) for r in runs_])
        for r, (d, v, n) in zip(runs_, avg):
            x = r[field]
            if field == "pace":
                own = f"this run {mss(x['value'] * 60)}/mi (raw {mss(x['raw'] * 60)}, HR {x['hr']}, {x['min']} min kept)"
            elif field == "speed":
                own = f"this run {mss(x['value'] * 60)}/effort km (raw {mss(x['raw'] * 60)}, HR {x['hr']}, {x['km']} km, {x['gain_m']:,} m up = {x['effort_km']} effort km)"
            else:
                own = f"this run {x['value']:,} ft/h ({x['min']} min, {x['vert_ft']:,} ft, HR {x['hr']}, {x['hiked_pct']}% hiked)"
            ft_ = f" · footing {foot[r['id']]}" if foot.get(r["id"]) else ""
            pt(key, d, round(v, 3) if field in ("pace", "speed") else round(v), f"{r['name']} · {own}{ft_} · 28-day avg of {n}")
            if key == "climb":  # that run's own speed on each grade split, for the run by run chart (the athlete, Nov 12, 2026)
                out[-1].update({f"g{i}": (r.get("splits") or {}).get(nm, {}).get("value") if (r.get("splits") or {}).get(nm) else None
                                for i, (nm, _lo, _hi) in enumerate(trail_effort.SPLITS, 1)})
        recent = [(r, a_) for r, a_ in zip(runs_, avg) if _d(r["date"]) > T - timedelta(days=28)]
        section = "fitness" if key in ("trailspeed", "climb") else "pair"
        if runs_:  # the tile reads the latest point, as its level does on the page; an old one says how old
            r, (d, v, n) = runs_[-1], avg[-1]
            stale = "" if recent else f"last hilly run {_d(d).strftime('%b %-d')}, none in 28 days"
            recent = recent or [(r, avg[-1])]
            if field == "speed":
                val = mss(v * 60)
                sub = stale or (f"{race['name']} finish about {hm(v * race['effort_km'])}, limit {race['limit_h']:g} h" if race else f"{n} trail run{'' if n == 1 else 's'}, 28 days")
            elif field == "pace":
                val, sub = mss(v * 60), stale or f"{n} trail run{'' if n == 1 else 's'}, 28 days"
            else:
                hk = round(sum(x[field]["hiked_pct"] for x, _ in recent) / len(recent))
                val, sub = f"{round(v):,}", stale or f"{hk}% hiked"
            marker(section, 9, key, label, val, unit, sub, "", why, how, "Estimated", "dots")
            rk = tier_of(v, tiers)
            if field in ("pace", "speed"):
                nb = next(((l, hi) for l, lo, hi, _n in reversed(tiers) if hi is not None and hi <= v), None)
                gap = f"{mss((v - nb[1]) * 60)} to {nb[0]}" if nb else "in the top band"
                target = ("Comfortable (under 13:00) by the spring 50K; Strong (under 11:30) by the autumn 100K (coach guide, draft)" if field == "pace"
                          else "Comfortable (under 6:48) by the spring 50K; Strong (under 6:00) by the autumn 100K (coach guide, draft)")
            else:
                nb = next(((l, lo) for l, lo, hi, _n in tiers if lo is not None and lo > v), None)
                gap = f"{nb[1] - v:,.0f} ft/h to {nb[0]}" if nb else "in the top band"
                target = "Strong by the spring 50K; Mountain on 10 to 20% by the autumn 100K (coach guide, draft)"
            trail_scales(key, field, tiers, v, target, gap, rk)
        else:
            marker(section, 9, key, label, "—", "", "no trail detail yet: it comes with the next hilly run" if field in ("speed", "pace") else "no climbing yet", "", why, how, "Estimated", "dots")
            trail_scales(key, field, tiers, None, "", "", "")
        m_ = next(x for x in out if x.get("kind") == "marker" and x["key"] == key)
        m_.update(sport_label=bar_name, why_hr=WHY_150)
    # the two tiles: their bars (own row first, then the paired row) and the switch in the opened tile
    cm = {x["key"]: x for x in out if x.get("kind") == "marker"}
    if "trailspeed" in cm:
        cm["trailspeed"].update(pair="trailgap", bars="trailspeed,trailgap", seg_legend="Part")
    if "climb" in cm:
        cm["climb"].update(pair="climb150,climbsteep", bars="climb150,climbsteep", seg_legend="Grade")
        cm["climb150"]["seg"], cm["climbsteep"]["seg"], cm["climb"]["seg"] = 1, 2, 0
        # 10 to 15% and 15 to 20%: shown in the opened tile only (the athlete, Nov 11, 2026)
        lines = []
        for nm, _lo, _hi in trail_effort.SPLITS[:2]:
            vs = [r["splits"][nm]["value"] for r in tr if (r.get("splits") or {}).get(nm) and _d(r["date"]) > T - timedelta(days=28)]
            lines.append(f"{nm}: {round(sum(vs) / len(vs)):,} ft/h" if vs else f"{nm}: none in 28 days")
        cm["climb"]["more"] = " · ".join(lines) + " (28-day averages)"

    # Trail durability (the athlete, Nov 11, 2026): the Trail group's own durability tile, from trail runs only. The Durability tile above
    # skips hilly runs, so it reads rides and flat runs and now sits in the Triathlon group. Latest trail run of 75+ moving minutes.
    tdr = [r for r in tr if r.get("drift")]
    for r in tdr:
        x = r["drift"]
        pt("traildur", r["date"], x["value"], f"{r['name']} · {x['min']} min moving, HR {x['hr1']} then {x['hr2']}")
    td_why = ("How much your easy trail efficiency (grade adjusted speed per heartbeat) falls from the first half of a long trail run to the "
              "second half. A small number means the back half of an ultra will feel like the front half.")
    td_how = ("Trail runs of 75+ moving minutes, from the 5 s detail. Every moving minute after the first 10 counts at its own grade by the "
              "energy cost of running there (Minetti 2002), hiking included; first half against second half of the moving time. A course "
              "that is harder in one half still moves it (two of your runs read below 0 because their second halves were easier), so read "
              "it over several runs. Latest run on the tile. Estimated.")
    if tdr:
        lt = tdr[-1]
        marker("fitness", 9, "traildur", "Trail durability", f"{lt['drift']['value']:.1f}", "% drift",
               f"{_d(lt['date']).strftime('%b %-d')} trail run ({lt['drift']['min']} min)", "", td_why, td_how, "Estimated", "dots")
        v = lt["drift"]["value"]
        gap_t = f"{v - 5:+.1f} points vs 5%"
        if NDUR:
            md = next(x for x in out if x.get("kind") == "marker" and x["key"] == "traildur")
            pf = pct_from_front(NDUR, v)
            md["_pop"] = f"About {ordinal(100 - pf)} percentile of recreational marathon runners ({pf:.0f}% decoupled less; n {NDUR['n']:,}, Smyth 2022); theirs is road and flat, yours trail and graded, so read it as a guide."
            dt = fit_ladder.tiers(NDUR, 1, lambda v_: f"{v_:.1f}%")
            rk, after = ladder("traildur", NDUR, v, dt, 0.1)
            annot("traildur", "Under 5% on long trail runs (Friel's coaching convention); the ladder ranks you against recreational marathoners", gap_t, dt, rk,
                  "Estimated: the marathon study's two published points (10% and 20%, Smyth 2022) with a normal curve through them; road marathons, not graded trail.")
            after()
            md.pop("_pop", None)
        else:
            annot("traildur", "Under 5% on long trail runs (Friel)", gap_t, DUR_TIERS, tier_of(v, DUR_TIERS),
                  "Friel's 5% is a coaching convention; the 10% and 20% cuts are Smyth 2022 marathon tertiles.", scale="coach")
    else:
        marker("fitness", 9, "traildur", "Trail durability", "—", "", "Needs a 75+ min trail run with detail", "", td_why, td_how, "Estimated", "dots")

    # Strength progression (the athlete, Nov 1, 2026): main lifts' estimated 1-rep max against their own baseline (best of the first
    # 2 logged sessions), averaged over the lifts; per-lift detail stays on the Lifts tab.
    try:
        import lifts as _lifts
        lib = {e["id"]: e for e in _lifts.library()}
        log = _lifts.read_log()
        bwp = _lifts.bodyweights()
    except Exception:
        lib, log, bwp = {}, [], []
    per = {}
    for r in log:
        ex = lib.get(r.get("exercise_id"))
        if not ex or ex.get("load") not in ("lb", "lb_added") or "warmup" in (ex.get("pattern") or ""):
            continue
        sc, basis = _lifts.set_score(ex, _f(r.get("load_lb")), _f(r.get("reps")), _lifts.bw_on(bwp, r["date"]))
        if sc is None:
            continue
        s = per.setdefault(r["exercise_id"], {})
        s[r["date"]] = max(sc, s.get(r["date"], 0))
    log_days = sorted({r["date"] for r in log if r.get("date")})
    idx = {}
    for exid, s in per.items():
        ds = sorted(s)
        if len(ds) < 3:
            continue
        base = max(s[d] for d in ds[:2])
        for d in ds[2:]:
            idx.setdefault(d, []).append((s[d] / base - 1) * 100)
    for d in sorted(idx):
        pt("lifts", d, round(_mean(idx[d]), 1), f"{len(idx[d])} lift{'s' if len(idx[d]) > 1 else ''} vs baseline")
    n28 = sum(1 for d in log_days if T - timedelta(days=28) < _d(d) <= T)
    if idx:
        d = max(idx); v = _mean(idx[d])
        movers = sorted(((s[max(s)] / max(s[x] for x in sorted(s)[:2]) - 1) * 100, lib[e]["name"]) for e, s in per.items() if len(s) >= 3)
        marker("fitness", 10, "lifts", "Strength", f"{v:+.0f}", "% vs baseline",
               f"{n28} session{'s' if n28 != 1 else ''} in 4 wk · " + (f"best mover {movers[-1][1]} {movers[-1][0]:+.0f}%" if movers else ""),
               "good" if v >= 3 else "ok" if v >= -3 else "watch",
               "Main lifts getting stronger protects ankles and calves on trail, holds muscle through a calorie deficit and supports long-term health. This tile reads progression; the Health tab counts strength days.",
               "Each main lift's best estimated 1-rep max per session (Epley; body-weight work and warm-ups left out) against its own baseline, the best of its first 2 logged sessions; the tile averages the lifts with 3+ sessions. A swapped-in lift starts its own baseline. Calculated.",
               "Calculated", "line")
        annot("lifts", "Hold or rise through a calorie deficit; rise when fully fueled", f"{v:+.0f}% vs baseline", LIFT_TIERS, tier_of(v, LIFT_TIERS),
              "Coach guide: progression against your own baseline, not a population standard. Home dumbbell and kettlebell lifts have no fair norms.")
    else:
        # one count of strength sessions on the page (the athlete, Nov 15, 2026: the block goal said 1 of 12 while this tile said 0): the
        # tile names every strength session in 4 weeks, the same days the block goal and Health count, then how many carry weights
        sd28 = {r["date"] for r in feel if r.get("discipline") == "strength" and _d(r["date"]) > T - timedelta(days=28)} | \
               {a["local_start"][:10] for a in acts if "strength" in (a.get("type") or "").lower() and _d(a["local_start"]) > T - timedelta(days=28)}
        nw = len(log_days)
        marker("fitness", 10, "lifts", "Strength", "—", "",
               f"{len(sd28)} strength session{'s' if len(sd28) != 1 else ''} in 4 wk · " + (f"{nw} with weights logged on Lifts · " if nw else "none with weights logged on Lifts yet · ") + ("2 logged set your baseline, the 3rd shows progress" if nw < 3 else "log a main lift 3 times to show progress"),
               "", "Main lifts getting stronger protects ankles and calves on trail, holds muscle through a calorie deficit and supports long-term health.",
               "Logged on the Lifts tab. Calculated.", "", "line")

    # ---------------- Health and longevity ----------------
    # VO2max vs age and sex norms (vo2_norms.py: FRIEND 2022 by sex, age band and test mode; the group comes from the profile)
    G = vo2_norms.group(T)
    gl = G["label"] if G else ""
    run_pts, bike_pts = vo2_norms.points("treadmill", G), vo2_norms.points("cycle", G)
    NO_GROUP = "No levels yet: add \"sex\" and \"birth_year\" to coach/athlete/profile.json so the norms match your age and sex."
    vr = sorted([r for r in vo2 if r.get("vo2max_run") not in (None, "")], key=lambda r: r["date"])
    vb = sorted([r for r in vo2 if r.get("vo2max_bike") not in (None, "")], key=lambda r: r["date"])
    for r in vr:
        pt("vo2", r["date"], r["vo2max_run"], "running")
    if vr:
        v = float(vr[-1]["vo2max_run"]); pc = vo2_norms.percentile(v, run_pts)
        nxt_band = next(((p, b) for p, b in run_pts if b > v), None); p60 = vo2_norms.at(run_pts, 60)
        marker("health", 1, "vo2", "Cardio fitness (VO2max)", f"{v:.1f}", "",
               ((f"About the {ordinal(pc)} percentile" if isinstance(pc, int) else f"{pc} percentile") + f" for {gl}" + (f" · {ordinal(nxt_band[0])} is {nxt_band[1]}" if nxt_band else "")) if G else "Norms need your age and sex",
               ("good" if isinstance(pc, int) and pc >= 50 or pc == "over 90th" else "ok") if G else "",
               "The single strongest fitness predictor of a long life: in large cohorts each step up in cardiorespiratory fitness cut all-cause mortality, with no upper limit (Mandsager 2018, Kokkinos 2022).",
               f"Garmin's running VO2max estimate (it can differ from a lab test by several points, so the trend matters more than the exact percentile) against the FRIEND registry 2022 norms for {gl or 'your age and sex'} (lab treadmill tests). Estimated.",
               "Estimated", "line")
        if G:
            annot("vo2", f"Hold the 60th percentile or better ({p60}); the lowest-risk plateau in Kokkinos 2022 is about 49 (14 METs)",
                  f"{v - p60:+.1f} vs {p60} (60th)" + (f" · {nxt_band[1] - v:.1f} to the {ordinal(nxt_band[0])} ({nxt_band[1]})" if nxt_band else "") + (f" · {49 - v:.1f} to 49" if v < 49 else ""),
                  vo2_norms.health_tiers(run_pts, gl), tier_of(v, vo2_norms.health_tiers(run_pts, gl)) + (f" ({ordinal(pc)} percentile, {gl})" if isinstance(pc, int) else ""),
                  f"FRIEND registry 2022 norms, {gl}, {G['how']} (lab treadmill tests of US adults; LO-03 for the mortality dose). Garmin's estimate can sit several points off a lab value. Estimated.")
        else:
            annot("vo2", "", NO_GROUP)
        # the same running number climbs the Fitness ladder (aerobic, below); progress and kudos come from there only, so Today does not say it twice
        next(r for r in out if r.get("kind") == "marker" and r["key"] == "vo2")["quiet"] = True

    # Aerobic engine on the Fitness tab (the athlete, Nov 8, 2026, option B): VO2max per sport, each on its own ladder (run on treadmill norms,
    # bike on cycle norms) that keeps going past the Health target. The tile leads with the sport that has more readings in the last
    # 90 days (run on a tie); a Run / Bike switch in the detail shows the other (row field pair). One sport only: no switch.
    def sport_marker(key, section, rows, col, mode, pts, sport, word):
        v = float(rows[-1][col]); d0 = _d(rows[-1]["date"]); pc = vo2_norms.percentile(v, pts)
        for r in rows:
            pt(key, r["date"], r[col], word)
        tiers = vo2_norms.fitness_tiers(pts, mode, gl)
        lvl = tier_of(v, tiers) if tiers else ""
        marker(section, 11, key, "Aerobic engine (VO2max)" if section == "fitness" else f"{sport} VO2max", f"{v:.1f}" if v != int(v) or mode == "treadmill" else f"{v:.0f}", "",
               f"{sport}, {d0.strftime('%b %-d')}", "",
               "How big the aerobic engine is, per sport. Health reads the running number only up to the longevity target; here the ladder keeps going, because a bigger engine still makes every race easier.",
               f"Garmin's {word} VO2max estimate against the FRIEND registry 2022 {vo2_norms.MODE_WORD[mode].replace(' tests', '')} norms for {gl or 'your age and sex'}"
               + (" (this watch may report whole numbers only, so the line moves in steps; trainer power calibration can push it high)" if mode == "cycle" else "")
               + ". Read a sport only against its own norms: the same person scores lower on a bike than on a treadmill. Estimated.",
               "Estimated", "line")
        if tiers:
            nb = next(((l, lo) for l, lo, _hi, _n in tiers if lo is not None and lo > v), None)  # the next band up
            annot(key, "", (f"{nb[1] - v:.1f} to {nb[0]} ({nb[1]})" if nb else "in the top band"), tiers,
                  lvl + (f" ({ordinal(pc)} percentile, {gl}, {vo2_norms.MODE_WORD[mode]})" if isinstance(pc, int) else ""),
                  f"FRIEND registry 2022 {vo2_norms.MODE_WORD[mode].replace(' tests', '')} norms, {gl}, {G['how']} (lab tests, RER 1.0 or more). Garmin's estimate can sit several points off a lab value. Estimated.")
        else:
            annot(key, "", NO_GROUP)
        m = next(r for r in out if r.get("kind") == "marker" and r["key"] == key)
        if tiers:  # more, smaller steps in the upper bands; never finer than the watch reports (whole numbers on some cycling estimates)
            whole = all(float(r[col]) == int(float(r[col])) for r in rows)
            m["splits"] = ",".join(str(x) for x in vo2_norms.fitness_splits(tiers, 1.0 if whole else 0.1))
        m["sport_label"], m["chart_title"] = sport, f"{sport} VO2max, {vo2_norms.MODE_WORD[mode].replace(' tests', '')} norms"
        return m, v, lvl

    recent = lambda rows: sum(1 for r in rows if _d(r["date"]) > T - timedelta(days=90))
    sports = [s for s in (("run", vr, "vo2max_run", "treadmill", run_pts, "Run", "running"), ("bike", vb, "vo2max_bike", "cycle", bike_pts, "Bike", "cycling")) if s[1]]
    sports.sort(key=lambda s: -recent(s[1]))  # stable: run first on a tie
    if sports:
        lead, other = sports[0], (sports[1] if len(sports) > 1 else None)
        am, _, _ = sport_marker("aerobic", "fitness", lead[1], lead[2], lead[3], lead[4], lead[5], lead[6])
        if other:
            okey = "vo2" + other[0]
            om, ov, olvl = sport_marker(okey, "pair", other[1], other[2], other[3], other[4], other[5], other[6])
            am["pair"] = okey
            am["sub"] += f" · {other[5]} {om['value']}" + (f", {olvl.lower()} on {vo2_norms.MODE_WORD[other[3]].replace(' tests', '')} norms" if olvl else "")

    # Resting HR
    rhr = sorted((_d(r["date"]), _f(r.get("resting_hr"))) for r in summ if _f(r.get("resting_hr")))
    for i, (d, v) in enumerate(rhr):
        win = [vv for dd, vv in rhr if d - timedelta(days=28) < dd <= d]
        if len(win) >= 14:
            pt("rhr", d, round(_mean(win), 1), f"28-night average · that night {v:.0f}")
    now = [v for d, v in rhr if d > T - timedelta(days=28)]
    then = [v for d, v in rhr if T - timedelta(days=118) < d <= T - timedelta(days=90)]
    if now:
        m = _mean(now); m0 = _mean(then)
        marker("health", 2, "rhr", "Resting heart rate", f"{m:.0f}", "bpm",
               f"28-day average" + (f" · {m - m0:+.1f} vs 3 months ago" if m0 else ""), "good" if m < 60 else "ok",
               "Lower resting HR goes with lower cardiovascular and all-cause risk in cohort studies; in athletes it mostly tracks aerobic fitness, and a sudden rise flags fatigue or illness.",
               "Overnight resting HR from the watch, 28-day average (the chart plots that rolling average; single nights are under Recovery trends below). Measured.", "Measured", "line")
        annot("rhr", "Under 55 as a 28-day average, and no rise of 5+ bpm over your own baseline for several nights (fatigue or illness flag)",
              f"{m - 55:+.0f} vs 55 · {m - 45:+.0f} vs the study's 45 bpm reference", RHR_TIERS, tier_of(m, RHR_TIERS),
              "Zhang 2016 (CMAJ): 46 cohorts, 1.2 million adults; about +9% all-cause mortality per +10 bpm, roughly linear from a 45 bpm reference; 60–80 bpm +12%, over 80 +45%. General population: in a trained athlete a low value mostly reflects fitness, and only a rise against your own baseline is a warning. Measured.")
    # Life's Essential 8 (AHA, Lloyd-Jones 2022): score what the watch can, list what needs input
    l4 = [r for r in summ if _d(r["date"]) > T - timedelta(days=28)]
    pa_min = sum((_f(r.get("intensity_min_moderate")) or 0) + 2 * (_f(r.get("intensity_min_vigorous")) or 0) for r in l4) / 4 if l4 else None
    pa_pts = None if pa_min is None else 100 if pa_min >= 150 else 90 if pa_min >= 120 else 80 if pa_min >= 90 else 60 if pa_min >= 60 else 40 if pa_min >= 30 else 20 if pa_min > 0 else 0
    sl = _mean([_f(r.get("sleep_h")) for r in l4])
    sl_adj = sl - 0.5 if sl else None  # Garmin overstates total sleep by about 30-45 min (library IR-12)
    sl_pts = None if sl_adj is None else 100 if 7 <= sl_adj < 9 else 90 if 9 <= sl_adj < 10 else 70 if 6 <= sl_adj < 7 else 40 if (5 <= sl_adj < 6 or sl_adj >= 10) else 20 if sl_adj >= 4 else 0
    w7 = [_f(r.get("weight_lb")) for r in summ if _f(r.get("weight_lb")) and _d(r["date"]) > T - timedelta(days=7)]
    bmi = _mean(w7) * 703 / HEIGHT_IN ** 2 if w7 else None
    bmi_pts = None if bmi is None else 100 if bmi < 25 else 70 if bmi < 30 else 30 if bmi < 35 else 15 if bmi < 40 else 0
    hl = {}
    for r in health:
        if r.get("kind") in ("lab", "habit"):
            if r["key"] not in hl or r.get("date", "") >= hl[r["key"]].get("date", ""):
                hl[r["key"]] = r
    comps = [("Activity", pa_pts, f"{pa_min:.0f} min/week (moderate + 2× vigorous)" if pa_min is not None else "no data"),
             ("Sleep", sl_pts, f"{sl_adj:.1f} h/night (Garmin {sl:.1f} h, less ~0.5 h)" if sl else "no data"),
             ("BMI", bmi_pts, f"{bmi:.1f}" if bmi else "no weigh-ins this week")]
    for k, nm in (("nicotine", "Nicotine"), ("diet", "Diet")):
        r = hl.get(k)
        if r is None:
            comps.append((nm, None, "tell the coach"))
        elif k == "nicotine":
            comps.append((nm, 100 if r.get("value") == "never" else 75 if r.get("value") == "former" else 0, r.get("text") or r.get("value")))
        else:
            comps.append((nm, _f(r.get("value")), r.get("text") or ""))
    # A newer plain lab value (coach/health.json, e.g. a lab panel) scores the cholesterol and blood sugar parts with the same AHA cut-offs
    for part, raw, score, fmt in (("lipids", "non_hdl", checkins.le8_nonhdl, "non-HDL {:.0f} mg/dL"), ("glucose", "a1c", checkins.le8_a1c, "A1c {:.1f}%")):
        r = hl.get(raw)
        if r is not None and _f(r.get("value")) is not None and (part not in hl or r.get("date", "") > hl[part].get("date", "")):
            hl[part] = {"value": score(_f(r["value"])), "text": fmt.format(_f(r["value"])), "date": r.get("date", "")}
    for k, nm in (("bp", "Blood pressure"), ("lipids", "Cholesterol"), ("glucose", "Blood sugar")):
        r = hl.get(k)
        comps.append((nm, _f(r.get("value")) if r else None, (r.get("text") if r else "from your physical")))
    scored = [c for c in comps if c[1] is not None]
    marker("health", 3, "le8", "Heart-health score", f"{_mean([c[1] for c in scored]):.0f}" if scored else "—", "/100",
           f"{len(scored)} of 8 parts scored · the other {8 - len(scored)} need your physical or a quick answer",
           "good" if scored and _mean([c[1] for c in scored]) >= 80 else "ok",
           "The American Heart Association's Life's Essential 8: activity, sleep, weight, nicotine, diet, blood pressure, cholesterol and blood sugar. Higher scores go with longer life and more years free of heart disease, cancer and diabetes in large US cohorts.",
           "Each part scores 0–100 by the AHA cut-offs; the score is the average of the parts scored so far, so it is partial until the physical. Activity and sleep use the last 28 days; sleep is Garmin less 30 min.",
           "Calculated", "line")
    out[-1]["parts"] = " · ".join(f"{n}: {('%d' % p) if p is not None else '—'} ({t})" for n, p, t in comps)
    if scored:
        le8 = _mean([c[1] for c in scored])
        annot("le8", "80 or more = AHA 'high' cardiovascular health, scored on all 8 parts",
              f"{le8 - 80:+.0f} vs 80, but only {len(scored)} of 8 parts scored: the real score waits for the physical", LE8_TIERS,
              tier_of(le8, LE8_TIERS) + f" (partial: {len(scored)} of 8)", "AHA Life's Essential 8 categories (Lloyd-Jones 2022; LO-13): high 80–100, moderate 50–79, low under 50. US adults average about 65. Calculated.")
    # Heart-health score over time: the same partial score at each week end for the last 16 weeks (watch parts move; labs are constant)
    def le8_at(TT):
        l4_ = [r for r in summ if TT - timedelta(days=28) < _d(r["date"]) <= TT]
        if not l4_:
            return None
        pa = sum((_f(r.get("intensity_min_moderate")) or 0) + 2 * (_f(r.get("intensity_min_vigorous")) or 0) for r in l4_) / 4
        pa_p = 100 if pa >= 150 else 90 if pa >= 120 else 80 if pa >= 90 else 60 if pa >= 60 else 40 if pa >= 30 else 20 if pa > 0 else 0
        sl_ = _mean([_f(r.get("sleep_h")) for r in l4_])
        parts_ = [pa_p]
        if sl_:
            a_ = sl_ - 0.5
            parts_.append(100 if 7 <= a_ < 9 else 90 if 9 <= a_ < 10 else 70 if 6 <= a_ < 7 else 40 if (5 <= a_ < 6 or a_ >= 10) else 20 if a_ >= 4 else 0)
        w_ = [_f(r.get("weight_lb")) for r in summ if _f(r.get("weight_lb")) and TT - timedelta(days=7) < _d(r["date"]) <= TT]
        if w_:
            b_ = _mean(w_) * 703 / HEIGHT_IN ** 2
            parts_.append(100 if b_ < 25 else 70 if b_ < 30 else 30 if b_ < 35 else 15 if b_ < 40 else 0)
        parts_ += [c[1] for c in comps[3:] if c[1] is not None]
        return _mean(parts_), len(parts_)
    for i in range(HIST_WEEKS, -1, -1):
        we = _mon(T) + timedelta(days=6) - timedelta(weeks=i)
        if we > T:
            we = T
        v_ = le8_at(we)
        if v_:
            pt("le8", we, round(v_[0]), f"{v_[1]} of 8 parts")
    # Strength days per week (last 4 weeks), plus a weekly series for the chart
    sdays_all = set()
    for r in feel:
        if r.get("discipline") == "strength":
            sdays_all.add(r["date"])
    for a in acts:
        if "strength" in (a.get("type") or "").lower():
            sdays_all.add(a["local_start"][:10])
    for i in range(HIST_WEEKS, -1, -1):
        wk_ = _mon(T) - timedelta(weeks=i)
        n_ = sum(1 for d_ in sdays_all if wk_ <= _d(d_) < wk_ + timedelta(days=7))
        pt("strength", wk_, n_, "this week so far" if i == 0 else f"week of {wk_.strftime('%b %-d')}")
    sdays = set()
    for r in feel:
        if r.get("discipline") == "strength" and _d(r["date"]) > T - timedelta(days=28):
            sdays.add(r["date"])
    for a in acts:
        if "strength" in (a.get("type") or "").lower() and _d(a["local_start"]) > T - timedelta(days=28):
            sdays.add(a["local_start"][:10])
    spw = len(sdays) / 4
    marker("health", 4, "strength", "Strength days", f"{spw:.1f}", "per week",
           f"last 4 weeks · target 2+", "good" if spw >= 2 else "watch",
           "Muscle-strengthening work 2+ days a week is linked to 10–17% lower mortality on its own, and more on top of aerobic exercise (Momma 2022). It also protects tendons and bone for running.",
           "Strength sessions logged on the dashboard (Rate a session → Strength) or recorded on the watch. Reported.", "Reported", "line")
    annot("strength", "2 sessions a week (WHO guideline; your strength routine), 40 to 60 min a week in total",
          f"{spw - 2:+.1f} sessions/week vs 2", STR_TIERS, tier_of(spw, STR_TIERS),
          "WHO 2020 guideline (LO-01) and Momma 2022 meta-analysis (LO-05): 10–17% lower mortality with any strength training, largest gain around 30–60 min/week, no added longevity benefit at higher doses (performance is another matter). Reported.")
    # Sleep regularity: SD of the sleep midpoint over 28 nights
    allmids = []
    for f in sorted(glob.glob("data/daily/*.json")):
        dd = os.path.basename(f)[:10]
        try:
            if _d(dd) > T:
                continue
        except ValueError:
            continue
        s = ((json.load(open(f)).get("responses") or {}).get("sleep") or {}).get("dailySleepDTO") or {}
        a, b = s.get("sleepStartTimestampLocal"), s.get("sleepEndTimestampLocal")
        if a and b and b > a:
            mid = (a + b) / 2 / 60000  # minutes since epoch, local clock
            m = (mid + 12 * 60) % 1440  # minutes after noon, so midnight-crossing nights stay continuous
            allmids.append((dd, m))
    mids = [(dd, m) for dd, m in allmids if _d(dd) > T - timedelta(days=28)]
    for i in range(HIST_WEEKS, -1, -1):  # rolling 28-night spread at each week end
        we = min(T, _mon(T) + timedelta(days=6) - timedelta(weeks=i))
        win = [m for dd, m in allmids if we - timedelta(days=28) < _d(dd) <= we]
        sd_ = _sd(win)
        if sd_ is not None and len(win) >= 14:
            pt("sleepreg", we, round(sd_), f"{len(win)} nights")
    sd = _sd([m for _, m in mids])
    if sd is not None and len(mids) >= 14:
        marker("health", 5, "sleepreg", "Sleep regularity", f"±{sd:.0f}", "min",
               f"night-to-night spread of your sleep midpoint · {len(mids)} nights" + (f" · avg {sl:.1f} h (Garmin)" if sl else ""),
               "good" if sd <= 45 else "ok" if sd <= 75 else "watch",
               "Keeping sleep and wake times regular predicted lower mortality in UK Biobank more strongly than sleep length did (Windred 2024). Regularity is the sleep habit most within your control on study and work days.",
               "Standard deviation of the midpoint between falling asleep and waking, last 28 nights, from the watch. A simple stand-in for the study's Sleep Regularity Index; the 45 and 75 min marks are coach guides. Estimated.",
               "Estimated", "line")
        annot("sleepreg", "Within ±45 min (coach guide)", f"{sd - 45:+.0f} min vs ±45", SLP_TIERS, tier_of(sd, SLP_TIERS),
              "Windred 2024 (UK Biobank, 61,000 adults, 7-day actigraphy): the most regular fifth had about 30% lower all-cause mortality than the least regular, a stronger predictor than sleep length. That study scores a Sleep Regularity Index, which the watch data cannot reproduce; the ±45 and ±75 min marks are coach guides on a stand-in measure. Estimated.")
    # Sauna sessions per week (KIHD cohort)
    sauna = [a for a in acts if "sauna" in (a.get("name") or "").lower()]
    s90 = [a for a in sauna if _d(a["local_start"]) > T - timedelta(days=90)]
    if sauna:
        last = max(_d(a["local_start"]) for a in sauna)
        for i in range(HIST_WEEKS, -1, -1):
            wk_ = _mon(T) - timedelta(weeks=i)
            pt("sauna", wk_, sum(1 for a in sauna if wk_ <= _d(a["local_start"]) < wk_ + timedelta(days=7)), "this week so far" if i == 0 else f"week of {wk_.strftime('%b %-d')}")
        marker("health", 7, "sauna", "Sauna", f"{len(s90) / (90 / 7):.1f}", "per week",
               f"last 90 days · last session {last.strftime('%b %-d')}", "",
               "In a Finnish cohort of 2,300 men, 2–3 and 4–7 sauna sessions a week went with lower cardiovascular and all-cause mortality than once a week (Laukkanen 2015). Observational, so a bonus, not a pillar; it can also help heat acclimation before a hot race.",
               "Sessions recorded on the watch as Sauna. Measured.", "Measured", "line")
        annot("sauna", "None set: a bonus, not a pillar", "—", SAUNA_TIERS, tier_of(len(s90) / (90 / 7), SAUNA_TIERS),
              "Laukkanen 2015 (KIHD, 2,315 Finnish men, 20 years): vs once a week, 2–3 sessions/week and 4–7/week went with lower cardiovascular and all-cause mortality. One observational cohort in one culture; not in the coach library yet. Measured.")
    # Quarterly self-tests and the physical
    sdefs = sorted([r for r in health if r.get("kind") == "selftest_def"], key=lambda r: r.get("order", 9))
    sres = {}
    for r in health:
        if r.get("kind") == "selftest":
            sres.setdefault(r["key"], []).append(r)
            pt("st_" + r["key"], r["date"], _f(r.get("value")), r.get("text", ""))
    done = [k for k in sres if _d(max(x["date"] for x in sres[k])) > T - timedelta(days=100)]
    parts = []
    for dfn in sdefs:
        rs = sorted(sres.get(dfn["key"], []), key=lambda r: r["date"])
        parts.append(f"{dfn['name']}: {rs[-1].get('text') or rs[-1].get('value')} ({_d(rs[-1]['date']).strftime('%b %-d')})" if rs else f"{dfn['name']}: not done")
    marker("health", 6, "selftests", "Self-tests", f"{len(done)} of {len(sdefs)}", "done",
           " · ".join(parts) if parts else "", "good" if len(done) >= 2 else "watch",
           "Three 2-minute checks of strength, mobility and balance that track mortality risk in cohort studies and catch losses long before they show in training: sit-to-rise (Araujo 2012), one-leg stand (Araujo 2022), grip strength (Leong 2015). Every 3 months.",
           " ".join(f"{d['name']}: {d['protocol']} {d['why']}" for d in sdefs) + " Tell the coach your results (Reported).",
           "Reported", "")
    annot("selftests", f"All {len(sdefs)} done every quarter", f"{len(done) - len(sdefs):+d} vs {len(sdefs)}", (), "", "Each test has its own age norm, shown once a result is in")
    visits = [r for r in health if r.get("kind") == "visit"]
    lastv = max(visits, key=lambda r: r["date"]) if visits else None
    marker("health", 8, "physical", "Physical and labs", lastv["date"] if lastv else "Not booked", "",
           (lastv.get("text") or "") if lastv else "Last one over 3 years ago (Reported) · book before January",
           "good" if lastv else "watch",
           "Blood pressure, cholesterol (plus a one-time Lp(a)), A1c and a few one-time screens fill the other half of the heart-health score; they are the risks that fitness does not show and that wearables cannot measure.",
           "Bring the list from the coach (health-baseline.md). The clinician decides what to order; the coach records only what you report.",
           "Reported", "")
    annot("physical", "Once a year, with bloodwork", "Not booked" if not lastv else "Done", (), "", "")

    # The session that earned a level up (6.48.0, the athlete, Nov 14, 2026: "attach the achievement to the activity that pushed"),
    # the twin of app.js earnedOf: the run or Zwift ride behind the run and bike markers that day, else the longest activity of
    # the skill's sport that day; Health and habit skills have none.
    def _earned(key, day):
        return earned_activity(acts, key, day)
    # Kudos (the athlete, Oct 23): a milestone first crossed in the last 7 days, per marker with a series; the page and the check-in announce them.
    # Weekly counts use the 4-week average of full weeks, as on the page.
    _fs = []

    def _fit_series():  # the run and bike page calculations, from the brief's Python twin (read once)
        if not _fs:
            import brief
            _fs.append(brief.fitness_series(acts, summ))
        return _fs[0]
    for m in [r for r in out if r.get("kind") == "marker" and r.get("tiers") and not r.get("quiet")]:
        tiers = [t.split("|") for t in m["tiers"].split(";")]
        better = m.get("better", 1)
        series = sorted([(r["date"], float(r["value"]), r.get("extra", "")) for r in out if r.get("kind") == "mpt" and r["key"] == m["key"] and r.get("value") not in (None, "")])
        if m.get("section") == "calc" and m["key"] in ("run", "bike"):  # page calculations: the brief's Python twin of dash.calc('fitness'), 28-day average
            series = [(x["date"].isoformat(), x["avg28"], "") for x in _fit_series() if x["marker"] == m["key"] and x["avg28"] is not None]
        if m["key"] in ("consistency", "strength", "sauna"):
            full = [x for x in series if "so far" not in str(x[2])]
            series = [(d, _mean([v for _, v, _ in full[max(0, i - 3):i + 1]]), "") for i, (d, v, _) in enumerate(full)]
        if not series:
            continue
        # Progress rows (the post-day read-out, the athlete Oct 23): the last two points, their band and how far through it, when the last is recent
        if len(series) >= 2 and _d(series[-1][0]) > T - timedelta(days=7) and series[-1][1] != series[-2][1]:
            def _stand(v):
                for l, lo, hi, _n, _b in tiers:
                    lo_ = None if lo == "" else float(lo); hi_ = None if hi == "" else float(hi)
                    if (lo_ is None or v >= lo_) and (hi_ is None or v < hi_):
                        pct = None if lo_ is None or hi_ is None else max(0.0, min(1.0, (v - lo_) / (hi_ - lo_) if better == 1 else (hi_ - v) / (hi_ - lo_)))
                        return l, pct
                return "", None
            (pd, pv, _), (ld, lv, _) = series[-2], series[-1]
            b0, p0 = _stand(pv); b1, p1 = _stand(lv)
            improved = lv > pv if better == 1 else lv < pv
            out.append({"kind": "progress", "key": m["key"], "label": m["label"], "date": ld, "prev_date": pd, "prev_value": round(pv, 2), "value": round(lv, 2), "unit": m.get("unit", ""),
                        "band_prev": b0, "band": b1, "pct_prev": None if p0 is None else round(p0 * 100), "pct": None if p1 is None else round(p1 * 100), "improved": improved,
                        "level_up": bool(b0 and b1 and b0 != b1 and improved), "section": m["section"]})
        # Level ups (6.47.0): the same rule as the page's ribbon (app.js levelUps), so the morning message and Today name one
        # event: a level is a band of the ladder counted up from its worst end; it is reached the first time a reading crosses
        # into it, in the last 7 days, still held by the latest reading, with an earlier reading before it (a first reading is
        # a start, not a level up). One row per marker, its highest new level. Sub-tier crossings no longer make a row.
        beyond = (lambda v, e: v >= e) if better == 1 else (lambda v, e: v <= e)
        lad = sorted([(l, None if lo == "" else float(lo), None if hi == "" else float(hi)) for l, lo, hi, _n, _b in tiers],
                     key=(lambda t: -1e18 if t[1] is None else t[1]) if better == 1 else (lambda t: -(1e18 if t[2] is None else t[2])))
        best = None
        for i, (l, lo, hi) in enumerate(lad):
            e = lo if better == 1 else hi
            if i == 0 or e is None:
                continue
            first = next((x for x in series if beyond(x[1], e)), None)
            if not first or _d(first[0]) <= T - timedelta(days=7) or not beyond(series[-1][1], e) or not any(x[0] < first[0] for x in series):
                continue
            best = {"kind": "kudos", "key": m["key"], "label": m["label"], "level": l, "lv": i + 1, "of": len(lad), "date": first[0], "value": round(first[1], 2), "section": m["section"]}
        if best:
            best.update(_earned(m["key"], best["date"]))
            out.append(best)
    hr_anchor._CUR = _anc_before
    return relabel(out, ANC)


def relabel(rows, anc):
    """Say the athlete's own anchors wherever the heart rate markers' words carry the original 150 and 130 (labels, notes, tiers,
    ladders). A no-op for the original athlete. Keys (run, bike, climb150 ...) are ids and never change."""
    if (anc["run"], anc["bike"]) == (150, 130):
        return rows
    w = anc["window"]
    subs = [("(150 − RHR)", f"({anc['run']} − RHR)"), ("135 to 175 bpm", f"{w['run'][0]} to {w['run'][1]} bpm"),
            ("125 to 180 bpm", f"{w['climb'][0]} to {w['climb'][1]} bpm"), ("150 bpm", f"{anc['run']} bpm"), ("130 bpm", f"{anc['bike']} bpm"),
            ("at 150 and 130", f"at {anc['run']} and {anc['bike']}"), ("at 150", f"at {anc['run']}"), ("at 130", f"at {anc['bike']}")]

    def fix(v):
        if isinstance(v, str):
            for a, b in subs:
                v = v.replace(a, b)
        return v
    hr_keys = {"run", "bike", "trail", "trailgap", "trailspeed", "traildur", "climb", "climb150", "climbsteep", "gen_run_pace", "gen_bike_w", "hm703_run_pace", "hm703_bike_w"}
    return [{k: fix(v) for k, v in r.items()} if (r.get("key") in hr_keys or r.get("marker") in hr_keys) else r for r in rows]
