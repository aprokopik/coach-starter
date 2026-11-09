"""Fitness performance and health/longevity markers for the dashboard's Trends tab.

Called by build_dashboard.py. Returns rows:
  kind "marker": one tile (section fitness or health), with value, sub line, status, why and how.
  kind "mpt": chart points for a marker (key, date, value, extra).
Every number comes from data/ or coach/ files. Labels: Measured, Calculated, Estimated, Reported.
"""
import csv
import glob
import json
import os
from datetime import date, datetime, timedelta

import fit_ladder
import trail_effort
import vo2_norms

def mss(sec):
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


HEIGHT_IN = 68.5  # Reported in CURRENT-STATE (about 5 ft 8.5 in)

# Direction (-1 = lower is better) and the number of equal sub-tiers the page cuts inside each finite band (the athlete, Oct 23: more, nearer milestones).
# Sub-tiers are equal steps inside an evidence band, not evidence themselves; integer counts (consistency, strength, sauna) are not split.
BETTER = {"swim": -1, "5k": -1, "durability": -1, "rhr": -1, "sleepreg": -1, "run": -1, "trailgap": -1}
SPLIT = {"5k": 3, "swim": 3, "wkg": 3, "ftp": 3, "run": 3, "bike": 2, "vo2": 3, "rhr": 2, "sleepreg": 2, "le8": 3, "durability": 3, "aerobic": 3, "vo2bike": 3, "vo2run": 3,
         "consistency": 1, "strength": 1, "sauna": 1, "selftests": 1, "physical": 1, "trail": 2, "lifts": 1, "trailgap": 3, "climb150": 3, "climbrun": 3, "climbsteep": 3}

# Basis of each band (the athlete, Oct 23): "research" = papers or population statistics, "race" = a race target or forecast, "coach" = a coaching
# convention or guide with no study behind it. The page colours bands by basis. Default per marker, with per-band overrides by label.
BASIS = {"vo2": "research", "rhr": "research", "le8": "research", "strength": "research", "sauna": "research", "consistency": "research",
         "5k": "research", "swim": "research", "wkg": "research", "ftp": "research", "durability": "research", "sleepreg": "coach", "run": "research", "bike": "research",
         "trail": "coach", "trailgap": "coach", "climb150": "coach", "climbrun": "coach", "climbsteep": "coach", "lifts": "coach", "aerobic": "research", "vo2bike": "research", "vo2run": "research"}
BASIS_OVERRIDE = {("consistency", "Better"): "coach", ("consistency", "Best"): "coach", ("consistency", "Watch"): "coach",
                  ("swim", "Cutoff risk"): "race",
                  ("durability", "Low decoupling"): "research", ("durability", "Moderate decoupling"): "research", ("durability", "High decoupling"): "research"}
# What fixes each scale and what moves it (shown as the Anchor line). Scales never move by themselves; every change is logged.
ANCHOR = {
    "run": "Three layers (the athlete, Oct 23): blue bands = the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from all 70.3 run splits (Knechtle 2023) as pace per mile, read as 'if you held this pace for the 13.1 mi run leg' for your sex, fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a log-normal tail). Orange lines = the block goal. No coaching-guideline scale exists for pace at a fixed heart rate. Block levels: each training block gets three lines, fixed for the whole block. Baseline = your 28-day average on the block's first day (measured). Target and Strong = where the coach expects you to come out of the block, set at block start from the race forecast and the baseline, and never moved until the block ends; a new block starts from a new measured baseline. Earlier blocks stay on the chart as history; later blocks are provisional until they start. Levels and milestones are read against the current block. Race-day reference: easy pace matching the Eagleman run forecast is 10:00–11:30/mi.",
    "bike": "Three layers (the athlete, Oct 23): blue bands = the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from all 70.3 bike splits (Knechtle 2023) turned into watts for a flat course through a power model (Estimated) for your sex, fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a normal tail). Orange lines = the block goal. No coaching-guideline scale exists for power at a fixed heart rate. Block levels: each training block gets three lines, fixed for the whole block. Baseline = your 28-day average on the block's first day (measured). Target and Strong = where the coach expects you to come out of the block, set at block start from the race forecast, the FTP test and the baseline, and never moved until the block ends; a new block starts from a new measured baseline. Earlier blocks stay on the chart as history; later blocks are provisional until they start. Race-day reference: the Eagleman bike forecast becomes a mostly easy ride at about 100–130 W at 130 bpm.",
    "swim": "the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from all IRONMAN 70.3 finishers 2004–2020 (Knechtle 2023, normal approximation from the published mean and SD) for your sex, fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a log-normal tail). The Cutoff risk band uses Eagleman's 1.2 mi and 1:10 cutoff (estimated until the 2027 athlete guide). Judgment: pool pace vs an open-water race pace, and Eagleman is usually non-wetsuit.",
    "ftp": "the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from the one W/kg distribution in the library (one Zwift event, both sexes; weak) for your sex where published (not yet), fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a normal tail). Shown in watts at your weight on the test day; they move only when a new FTP result lands (next test Nov 16).",
    "wkg": "the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from the one W/kg distribution in the library (one Zwift event, both sexes; weak) for your sex where published (not yet), fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a normal tail).",
    "5k": "the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from 2.2 million US 5K results, 2024 (coach/norms.json) for your sex and age band, fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a log-normal tail). WMA age-grade is given alongside as a second reference.",
    "durability": "the athlete's percentile ladder (Nov 8, 2026, the same on every ranked Fitness tile): Bottom 10% up to Top 0.5%, more sub-levels where gains slow, edges read from 82,303 recreational marathoners (Smyth 2022), two published points for your sex where published (not yet), fixed until the norm is refreshed or your group changes. Edges past the published points are Estimated (a normal tail). Measured over about 4 h, so the ranking flatters a 90 min session. Under 5% stays the coaching target (Friel).",
    "sleepreg": "Coach guide, fixed; replaced if a Sleep Regularity Index becomes computable from the watch.",
    "vo2": "FRIEND 2022 norms for your age band and sex (coach/tools/vo2_norms.py), fixed; the band moves on with your birth year.",
    "aerobic": "FRIEND 2022 norms for your age band and sex, treadmill for run and cycle ergometer for bike, fixed; the band moves on with your birth year. The fitness ladder runs past the Health target to the top 10% (the athlete, Nov 8, 2026).",
    "vo2bike": "FRIEND 2022 cycle ergometer norms for your age band and sex, fixed; the band moves on with your birth year.",
    "vo2run": "FRIEND 2022 treadmill norms for your age band and sex, fixed; the band moves on with your birth year.",
    "rhr": "Zhang 2016 cut-offs, fixed.",
    "le8": "AHA Life's Essential 8 cut-offs, fixed.",
    "strength": "WHO 2020 and Momma 2022 cut-offs, fixed.",
    "sauna": "Laukkanen 2015 cut-offs, fixed.",
    "consistency": "Research cut-off (3 days) fixed; the Better and Best tiers are coach guides, fixed.",
    "trail": "Coach guide in hours of the longest run, fixed; the plan line comes from the block (coach/plan.json long_run_min) and changes only at a block start.",
    "lifts": "Coach guide in percent against your own baseline, fixed; each lift's baseline is its first 2 logged sessions.",
    "trailgap": "Coach guide anchored on the Grindstone 100K 18 h cutoff (the athlete, Nov 8, 2026), fixed: no population norm exists for trail pace at a set heart rate.",
    "climb150": "Coach guide by grade band (the athlete, Nov 8, 2026), fixed: built on mountain running references (1,000 m/h is the strong-amateur vertical-kilometre mark at hard effort; climb rate peaks around 18 to 25% grade); no population norm exists for climbing speed at a set heart rate. Moves only if the athlete agrees a change.",
    "climbrun": "Coach guide by grade band (the athlete, Nov 8, 2026), fixed: built on mountain running references; runnable grades cap the climb rate, so this band runs lowest.",
    "climbsteep": "Coach guide by grade band (the athlete, Nov 8, 2026), fixed: the top rung sits just under 1,000 m/h, the strong-amateur vertical-kilometre mark at hard effort, here held at easy effort.",
}
# The scale text when a coach scale stands in (no population norm for this athlete)
ANCHOR_COACH = {
    "5k": "WMA age-grade classes stand in until your sex and birth year are in coach/athlete/profile.json; then the percentile ladder for your age group and sex takes over.",
    "swim": "Age-group triathlon coaching convention for pool pace, with the Eagleman cutoff band; stands in until your sex is in coach/athlete/profile.json.",
    "run": "Coach guide anchored on the Eagleman run forecast, standing in until your sex is in coach/athlete/profile.json; orange lines = the block goal, fixed for the whole block.",
    "bike": "Coach guide anchored on the Eagleman bike forecast, standing in until your sex is in coach/athlete/profile.json; orange lines = the block goal, fixed for the whole block.",
    "ftp": "Coggan bands in watts at your weight on the test day; they move only when a new FTP result lands (next test Nov 16).",
    "wkg": "Coggan power-profile bands, fixed.",
    "durability": "Under 5% is Friel's coaching convention for 75–120 min sessions (coach guide); the 10% and 20% cuts come from 82,303 recreational marathoners (Smyth 2022, research), measured over about 4 h, so the research bands flatter a 90 min session. No elite-vs-novice table exists in the literature yet: faster marathoners decoupled less and later in that study. Fixed until the norm is refreshed.",
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
# each note gives the Eagleman 1.2 mi (2,112 yd) swim time that pace implies, against the 1:10 cutoff (3:19 /100 yd).
def _swim_note(lo, hi, m_lo, m_hi):
    t = lambda sec: mss(sec * 21.12)
    rng = f"under {mss(hi)}" if lo is None else f"{mss(lo)}+" if hi is None else f"{mss(lo)}–{mss(hi)}"
    m = f"under about {m_hi}" if m_lo is None else f"about {m_lo}+" if m_hi is None else f"about {m_lo}–{m_hi}"
    race = f"Eagleman swim under {t(hi)}" if lo is None else f"Eagleman swim over {t(lo)}" if hi is None else f"Eagleman swim {t(lo)}–{t(hi)}"
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
SWIM_CUTOFF = ("Cutoff risk", 180, None, _swim_note(180, None, "3:17", None) + ", inside 7 min of the Eagleman 1:10 cutoff")
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
# so these are coach guides anchored on the Eagleman forecasts in CURRENT-STATE (run leg about 9:55–11:50/mi; bike split 16–18 mph, roughly 110–150 W for the athlete's size, Estimated).
RUN150_TIERS = [("Fast", None, 9.0, "under 9:00/mi at 150 bpm: easy pace well under the 70.3 run forecast; coach guide"),
                ("Strong", 9.0, 10.0, "9:00–10:00: the forecast run leg sits inside easy effort with margin; coach guide"),
                ("Forecast pace", 10.0, 11.5, "10:00–11:30: easy pace matches the Eagleman run forecast (9:55–11:50/mi); coach guide"),
                ("Base", 11.5, 13.5, "11:30–13:30: the run leg fits its 3 h window at easy effort; coach guide"),
                ("Building", 13.5, None, "over 13:30: at easy effort the run leg would need its whole cutoff window; coach guide")]
BIKE130_TIERS = [("Building", None, 80, "under 80 W at 130 bpm; coach guide"),
                 ("Base", 80, 100, "80–100 W: easy rides sit below the Eagleman split's power; coach guide"),
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
              ("Good: regularly active", 3, 4, "3+ sessions a week at 150+ min: 15% lower all-cause mortality vs inactive (dos Santos 2022); the research cutoff"),
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
TRAILGAP_TIERS = [("Fast", None, 10.0, "under 10:00/mi grade adjusted at 150 bpm"), ("Strong", 10.0, 11.5, "10:00 to 11:30"),
                  ("Comfortable", 11.5, 13.0, "11:30 to 13:00: Grindstone at easy effort with margin"),
                  ("Finisher", 13.0, 15.0, "13:00 to 15:00: inside the 18 h cutoff at easy effort, little margin"), ("Cutoff risk", 15.0, None, "over 15:00")]
# Climbing at 150 bpm by grade band (the athlete chose grade-specific levels on mountain running references, Nov 8, 2026): ft/h up.
# Top rungs sit under 1,000 m/h (3,280 ft/h), the strong-amateur vertical-kilometre mark at hard effort (Uphill Athlete);
# climb rate peaks around 18 to 25% grade, so gentler bands run lower. Coach guide, not a percentile.
CLIMB_TIERS = {
    "climbrun": [("Building", None, 900, "under 900 ft/h at 150 bpm on 5 to 10% grades"), ("Steady", 900, 1300, "900 to 1,300 ft/h"),
                 ("Strong", 1300, 1700, "1,300 to 1,700 ft/h"), ("Mountain", 1700, 2200, "1,700 to 2,200 ft/h"), ("Fast climber", 2200, None, "2,200 ft/h and up")],
    "climb150": [("Building", None, 1000, "under 1,000 ft/h at 150 bpm on 10 to 20% grades"), ("Steady", 1000, 1500, "1,000 to 1,500 ft/h"),
                 ("Strong", 1500, 2000, "1,500 to 2,000 ft/h"), ("Mountain", 2000, 2600, "2,000 to 2,600 ft/h"),
                 ("Fast climber", 2600, None, "2,600 ft/h and up")],
    "climbsteep": [("Building", None, 1200, "under 1,200 ft/h at 150 bpm on 20%+ grades"), ("Steady", 1200, 1800, "1,200 to 1,800 ft/h"),
                   ("Strong", 1800, 2400, "1,800 to 2,400 ft/h"), ("Mountain", 2400, 3000, "2,400 to 3,000 ft/h"),
                   ("Fast climber", 3000, None, "3,000 ft/h and up: near 1,000 m/h, held at easy effort")],
}
CLIMB150_TIERS = CLIMB_TIERS["climb150"]
BAND_WORDS = {"climbrun": "5–10%", "climb150": "10–20%", "climbsteep": "20%+"}


def sublevel(v, tiers, n=3):
    """The band and its third (I lowest) for a higher-is-better value, as the page names sub-levels."""
    for l, lo, hi, _ in tiers:
        if (lo is None or v >= lo) and (hi is None or v < hi):
            if lo is None or hi is None:
                return l
            return f"{l} {('I', 'II', 'III')[min(n - 1, int((v - lo) / (hi - lo) * n))]}"
    return ""


FOOTING = {"smooth": "smooth", "roots": "roots and rocks", "technical": "technical", "mud": "mud or snow"}
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


def best_5k_efforts(acts):
    """Garmin's fastest 5 km inside each run (activity summary fastestSplit_5000, seconds), oldest first:
    (date, minutes, run km, avg HR, activity name). Treadmill runs are left out (no GPS distance)."""
    out = []
    for a in acts:
        t = (a.get("type") or "").lower()
        if "run" not in t or "treadmill" in t or "virtual" in t:
            continue
        p = f"data/activities/{a['activity_id']}.json"
        if not os.path.exists(p):
            continue
        s = json.load(open(p)).get("summary") or {}
        v = s.get("fastestSplit_5000")
        if not v or v < 12 * 60 or v > 60 * 60:  # outside 12-60 min is a GPS glitch or a walk
            continue
        out.append((a["local_start"][:10], round(v / 60, 2), round((s.get("distance") or 0) / 1000, 1), s.get("averageHR"), a.get("name") or ""))
    return sorted(out)


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


def build(today, rows_so_far):
    out = []
    acts = list(csv.DictReader(open("data/activities.csv"))) if os.path.exists("data/activities.csv") else []
    summ = list(csv.DictReader(open("data/summary.csv"))) if os.path.exists("data/summary.csv") else []
    feel = [r for r in rows_so_far if r.get("kind") == "feel_session"]
    bench = [r for r in rows_so_far if r.get("kind") in ("benchmark", "result")]
    vo2 = [r for r in rows_so_far if r.get("kind") == "vo2max"]
    health = json.load(open("coach/health.json")).get("rows", []) if os.path.exists("coach/health.json") else []
    T = today
    first_day = min((_d(r["date"]) for r in summ if r.get("date")), default=T)
    HIST_WEEKS = max(12, (_mon(T) - _mon(first_day)).days // 7)  # weekly chart series reach back to the first Garmin day
    # Population norms for this athlete's sex and age band (the athlete, Nov 8, 2026: levels follow each person, never hard-coded);
    # each ranked Fitness tile reads them on the shared percentile ladder (fit_ladder, vo2_norms.FIT_BANDS)
    NG = vo2_norms.group(T)
    NR = norm_rows()
    N5K, NSW, NWKG, NDUR = (fit_ladder.pick(NR, k, NG) for k in ("5k", "hm703_swim_pace", "wkg", "marathon_decoupling"))
    NRUN, NBIKE = run_pace_norm(fit_ladder.pick(NR, "hm703_run", NG)), bike_w_norm(fit_ladder.pick(NR, "hm703_bike", NG))
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
        m["better"], m["split"] = BETTER.get(key, 1), SPLIT.get(key, 2)  # direction and sub-tier count per band (the page derives the sub-tiers)
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

    # ---------------- Fitness performance ----------------
    # Durability: aerobic decoupling on long sessions from Garmin laps (speed or power per heartbeat, first vs second half)
    drifts = []
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
        p = f"data/activities/{a['activity_id']}.json"
        if not os.path.exists(p):
            continue
        laps = ((json.load(open(p)).get("splits") or {}).get("lapDTOs")) or []
        laps = [l for l in laps if (l.get("duration") or 0) > 60 and l.get("averageHR")]
        if len(laps) < 4:
            continue
        total = sum(l["duration"] for l in laps)
        acc, h1, h2 = 0, [], []
        for l in laps:
            mid = acc + l["duration"] / 2
            (h1 if mid < total / 2 else h2).append(l)
            acc += l["duration"]
        usepow = "virtual" in t and all(l.get("averagePower") for l in laps)

        def ef(ls):
            dur = sum(l["duration"] for l in ls)
            hr = sum(l["averageHR"] * l["duration"] for l in ls) / dur
            out_ = sum((l["averagePower"] if usepow else (l.get("distance") or 0) / max(1, l.get("movingDuration") or l["duration"])) * l["duration"] for l in ls) / dur
            return out_ / hr
        if not h1 or not h2:
            continue
        e1, e2 = ef(h1), ef(h2)
        if not e1:
            continue
        dec = (e1 - e2) / e1 * 100
        if abs(dec) > 25:
            continue
        d = a["local_start"][:10]
        drifts.append((d, sport, round(dec, 1), round(mins)))
        pt("durability", d, round(dec, 1), f"{'Ride' if sport == 'bike' else 'Run'} {round(mins)} min{' (power)' if usepow else ''}")
    drifts.sort()
    recent = [x for x in drifts if _d(x[0]) > T - timedelta(days=56)]
    if drifts:
        last = drifts[-1]
        avg = _mean([x[2] for x in recent]) if recent else None
        # name the sport on the tile and show the other sport's last long session too (the athlete, Nov 1: it read as a bike number)
        other = next((x for x in reversed(drifts) if x[1] != last[1]), None)
        oname = "run" if last[1] == "bike" else "ride"
        osub = (f"last long {oname} {other[2]:.1f}% ({_d(other[0]).strftime('%b %-d')})" if other else
                ("run: needs a 75+ min flat run" if oname == "run" else "ride: needs a 90+ min flat or Zwift ride"))
        marker("fitness", 3, "durability", "Durability (HR drift)", f"{last[2]:.1f}", "% " + ("ride" if last[1] == "bike" else "run"),
               f"Last long {'ride' if last[1] == 'bike' else 'run'}, {_d(last[0]).strftime('%b %-d')} ({last[3]} min) · {osub}" + (f" · 8-wk avg {avg:.1f}%" if avg is not None and len(recent) > 1 else ""),
               "good" if last[2] < 5 else "ok" if last[2] < 8 else "watch",
               "How much efficiency (speed or power per heartbeat) falls from the first half to the second half of a long session. Under about 5% suggests the aerobic base holds up for the session's length: the thing that decides the back half of a 70.3, an ultra or a full IRONMAN.",
               "Long sessions only (rides 90+ min, runs 75+ min), from Garmin laps; Zwift rides use power, outdoor sessions use speed, and hilly ones (rides over 40 ft/mi, runs over 60 ft/mi, so trail runs) are left out. Wind, stops, heat and fueling move it, so read the trend over similar sessions, not one value. Coaching heuristic, Estimated.",
               "Estimated", "dots")
        md = next((r for r in out if r.get("kind") == "marker" and r["key"] == "durability"), None)
        gap_d = f"{last[2] - 5:+.1f} points vs 5%" + (f" · 8-wk avg {avg - 5:+.1f}" if avg is not None and len(recent) > 1 else "")
        if NDUR:  # the athlete's percentile ladder on the marathon study (the athlete chose all six tiles, Nov 8, 2026): two published points, the rest a normal fit
            if md is not None:
                pf = pct_from_front(NDUR, last[2])
                md["_pop"] = f"About {ordinal(100 - pf)} percentile of recreational marathon runners ({pf:.0f}% decoupled less; n {NDUR['n']:,}, Smyth 2022), but theirs is measured over a marathon and yours over {last[3]} min, so the true standing is lower."
            dt = fit_ladder.tiers(NDUR, 1, lambda v: f"{v:.1f}%")
            rk, after = ladder("durability", NDUR, last[2], dt, 0.1)
            annot("durability", "Under 5% on long sessions (Friel's coaching convention); the ladder ranks you against recreational marathoners", gap_d, dt, rk,
                  "Estimated: the study publishes two points (10% and 20% decoupling, Smyth 2022, 82,303 recreational marathoners, measured over about 4 h), and every other edge comes from a normal curve through them. A 75 to 120 min session drifts less than a marathon, so this ranking flatters. No elite-vs-novice table exists; durability as a trait is a young research area (Maunder 2021).")
            after()
        else:
            annot("durability", "Under 5% on long sessions (Friel); under 10% is the marathon study's low band", gap_d,
                  DUR_TIERS, tier_of(last[2], DUR_TIERS), "Friel's 5% is a coaching convention (TrainingPeaks aerobic decoupling), not peer-reviewed. The 10% and 20% cuts are the tertiles of recreational marathoners in Smyth 2022 (research), over 4 h rather than 90 min. No elite-vs-novice table exists; durability as a trait is a young research area (Maunder 2021).", scale="coach")
        if md is not None:
            md.pop("_pop", None)
    else:
        marker("fitness", 3, "durability", "Durability (HR drift)", "—", "", "Needs a 90+ min ride or 75+ min run with laps", "", "", "", "Estimated", "dots")

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
               f"{_d(d).strftime('%b %-d')}, {round(yd):,} yd · {len(swims)} swim{'s' if len(swims) > 1 else ''} on record",
               "", "Average moving pace per 100 yd for a whole pool swim. Your swim has the least data of the three sports; this shows whether easy swims get faster at the same effort.",
               "Moving time over distance, 25 yd pool. Compare similar swims (easy, continuous). " + (css_note or "") + "Measured, Calculated.", "Measured", "dots")
        msw = next((r for r in out if r.get("kind") == "marker" and r["key"] == "swim"), None)
        if NSW:
            if msw is not None:
                pf = pct_from_front(NSW, sec)
                msw["_pop"] = f"About {ordinal(100 - pf)} percentile of {NSW['population'].split(' (')[0]} ({pf:.0f}% faster; n about {NSW['n']:,}; a 70.3 swim of about {mss(sec * 21.12)} at this pace). Rough: pool moving pace against open-water race times."
            half = fit_ladder.value_at(NSW, 50)[0]
            st = fit_ladder.tiers(NSW, 1, lambda v: f"{mss(v)} /100 yd", floor=SWIM_CUTOFF[1])
            rk, after = ladder("swim", NSW, sec, st, 1.0, extra=(SWIM_CUTOFF,))
            word = "women" if NSW.get("sex") == "female" else "men"
            annot("swim", f"Top half of 70.3 {word} ({mss(half)} /100 yd) by Eagleman; the swim cutoff pace is about 3:19 /100 yd (1:10 for 2,112 yd)",
                  f"{sec - half:+.0f} s vs the top-half line · {mss(199 - sec)} per 100 yd inside the cutoff pace", st + [SWIM_CUTOFF], rk,
                  "Bands are 70.3 swim percentiles (" + NSW['source'].split(':')[0] + ", normal approximation from the published mean and SD; the top 1% and 0.5% from a log-normal tail, Estimated), converted to pace per 100 yd over 2,112 yd; the bottom band is the Eagleman cutoff. Pool moving pace against open-water race times, so rough. One swim on record, 25 yd pool, moving time")
            after()
        else:
            annot("swim", "Eagleman swim cutoff pace is about 3:19 /100 yd (1:10 for 2,112 yd)", f"{mss(199 - sec)} per 100 yd inside the cutoff pace", SWIM_COACH_TIERS, tier_of(sec, SWIM_COACH_TIERS),
                  "Coaching convention, not research." + NO_NORM, scale="coach")
        if msw is not None:
            msw.pop("_pop", None)
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
            sub = (f"Best in a run, last {FIVEK_WINDOW} days ({_d(cur[0]).strftime('%b %-d')})" if cur else f"No 5K run in {FIVEK_WINDOW} days; last best {_d(best5['points'][-1][0]).strftime('%b %-d, %Y')}") + \
                f" · all-time {mss(ab[1] * 60)} ({_d(ab[0]).strftime('%b %Y')})" + (f" · next test {_d(nxt).strftime('%b %-d')}" if nxt else "")
            marker("fitness", order, key, label, mss((cur or (None, best5["points"][-1][1]))[1] * 60), "", sub, "", dfn.get("why", ""),
                   f"Fastest 5 km inside any run, from Garmin (its best-effort split, GPS), as the best of the {FIVEK_WINDOW} days up to each run; dots are each run's own fastest 5 km, mostly easy runs, so they sit slower than a race. Reported test results count too. Estimated. Test protocol: " + dfn.get("protocol", ""),
                   "Estimated", "line")
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
    rsf = sorted(res.get("ftp", []), key=lambda r: r.get("date"))
    kg_test, kg_date = None, None
    if rsf and wt:  # the weigh-in nearest the last test (within 35 days), so the watt bands move only when a new test lands
        dd, v = min(wt, key=lambda q: abs((_d(q[0]) - _d(rsf[-1]["date"])).days))
        if abs((_d(dd) - _d(rsf[-1]["date"])).days) <= 35:
            kg_test, kg_date = v, dd
    if rsf and kg_test and NWKG:  # the athlete's percentile ladder on the W/kg distribution, in watts at the test weight (the athlete chose all six tiles, Nov 8, 2026)
        def _w(x):
            return round(x * kg_test)
        wt_ = fit_ladder.tiers(NWKG, 2, lambda v: f"{v:.2f} W/kg")
        ftp_tiers = [(l, None if lo is None else _w(lo), None if hi is None else _w(hi), f"{n} ({'under ' + str(_w(hi)) if lo is None else str(_w(lo)) + '+' if hi is None else str(_w(lo)) + '–' + str(_w(hi))} W at {kg_test:.1f} kg)")
                     for l, lo, hi, n in wt_]
        fv = _f(rsf[-1].get("value"))
        rk = f"{tier_of(fv, ftp_tiers)} ({ordinal(fit_ladder.percentile(NWKG, fv / kg_test))} percentile, {NWKG.get('short') or NWKG['population']})"
        nb = next(((l, lo) for l, lo, _hi, _n in ftp_tiers if lo is not None and lo > fv), None)
        annot("ftp", "Nov 16 20-min test sets the baseline; no watt target until then", (f"{nb[1] - fv:+.0f} W to {nb[0]} ({nb[1]} W at your test weight)" if nb else "in the top band"), ftp_tiers, rk,
              f"Estimated and weak: the only W/kg distribution in the library is {NWKG['population']}, both sexes and 20-min power, so it reads harder than a fair age-group comparison; a men's and women's sample by age is queued. Converted to watts at your weight on the test day ({kg_test:.1f} kg, weigh-in {_d(kg_date).strftime('%b %-d')}); fixed until the next test. Rests on a ramp FTP the athlete believes is high.")
        m_ = next((x for x in out if x.get("kind") == "marker" and x["key"] == "ftp"), None)
        if m_ is not None:  # sub-levels never finer than 1 W
            m_["splits"] = ",".join(str(x) for x in fit_ladder.splits(NWKG, ftp_tiers, 1.0))
    elif rsf and kg_test:
        def _w(x):
            return round(x * kg_test)
        ftp_tiers = []
        for l, lo, hi, n in WKG_TIERS:
            watts = f"under {_w(hi)} W" if lo is None else f"{_w(lo)}+ W" if hi is None else f"{_w(lo)}–{_w(hi)} W"
            wkg = f"under {hi} W/kg" if lo is None else f"{lo}+ W/kg" if hi is None else f"{lo}–{hi} W/kg"
            ftp_tiers.append((l, None if lo is None else _w(lo), None if hi is None else _w(hi), f"{watts} at {kg_test:.1f} kg, your weight at the {_d(rsf[-1]['date']).strftime('%b %-d, %Y')} test ({wkg})"))
        fv = _f(rsf[-1].get("value"))
        annot("ftp", "Nov 16 20-min test sets the baseline; no watt target until then", f"{fv - _w(2.4):+.0f} W vs {_w(2.4)} W (the Fair band at your test weight)", ftp_tiers, tier_of(fv, ftp_tiers),
              f"Coggan power profile bands converted to watts at your weight on the test day ({kg_test:.1f} kg, weigh-in {_d(kg_date).strftime('%b %-d')}); fixed until the next test. Competitive-cyclist reference, not age-group. Rests on a ramp FTP the athlete believes is high." + NO_NORM, scale="coach")
    # Pace at 150 bpm and power at 130 bpm are computed on the page (calc 'fitness'); these rows carry their tiers and targets only
    for key, label, unit, tiers, target, src in (
            ("run", "Run pace at 150 bpm", "/mi", RUN150_TIERS, "Stay inside Forecast pace (10:00–11:30/mi) through the base; under 10:00 by Eagleman (coach guide)",
             "Flat runs, 28-day average of pace scaled to 150 bpm; heat and wind move it. The population bands assume the easy-HR pace held for the whole run leg, which is a floor, not a race prediction. Estimated."),
            ("bike", "Bike power at 130 bpm", "W", BIKE130_TIERS, "Inside 100–130 W at 130 bpm by Eagleman (coach guide); the Nov 16 test refines these bands",
             "Zwift rides only, trainer power (calibration unknown), 28-day average of power scaled to 130 bpm. The population bands assume this easy-HR power held for 56 flat miles through a power model: a floor, not a race prediction. Estimated.")):
        marker("calc", 0, key, label, "", unit, "", "", "", "", "Estimated", "line")
        nr = NRUN if key == "run" else NBIKE
        if nr:  # the athlete's percentile ladder (Nov 8, 2026); block goal lines come from coach/levels.json, built on the page, and the page reads the level
            pt_ = fit_ladder.tiers(nr, 3 if key == "run" else 0, (lambda v: f"{mss(v * 60)}/mi") if key == "run" else (lambda v: f"{v:.0f} W"))
            annot(key, target, "", pt_, "", src)
            m_ = next(x for x in out if x.get("kind") == "marker" and x["key"] == key)
            m_["splits"] = ",".join(str(x) for x in fit_ladder.splits(nr, pt_, 1 / 60 if key == "run" else 1.0))
            m_["pop_norm"] = nr["key"]
        else:
            annot(key, target, "", RUN150_TIERS if key == "run" else BIKE130_TIERS, "", src + NO_NORM, scale="coach")
    for nr in (NRUN, NBIKE):
        if nr:
            out.append(dict(nr))
    wk = next((r for r in out if r.get("kind") == "marker" and r["key"] == "wkg"), None)
    if wk and wk.get("value") not in ("—", "", None):
        v = float(wk["value"])
        tgt_w = "Set from the Nov 16 test; Eagleman needs about 2.0 W/kg held for 56 mi flat, so the floor is already there (Estimated)"
        if NWKG:  # the athlete's percentile ladder (chose all six tiles, Nov 8, 2026) on the one W/kg distribution in the library, Estimated and weak
            pf = pct_from_front(NWKG, v)
            wk["_pop"] = f"About {ordinal(100 - pf)} percentile of {NWKG['population']}: weak reference (mixed sexes, one event, 20-min power); a men's and women's sample by age is queued."
            wt2 = fit_ladder.tiers(NWKG, 2, lambda x: f"{x:.2f} W/kg")
            rk, after = ladder("wkg", NWKG, v, wt2, 0.01)
            nb = next(((l, lo) for l, lo, _hi, _n in wt2 if lo is not None and lo > v), None)
            annot("wkg", tgt_w, (f"{nb[1] - v:+.2f} to {nb[0]} ({nb[1]:.2f})" if nb else "in the top band"), wt2, rk,
                  f"Estimated and weak: {NWKG['population']}, both sexes, 20-min power not FTP, riders may have been cruising; the edges past the published 0.8% to 95% come from a normal fit. Reads harder than a fair age-group comparison. Rests on a ramp FTP the athlete believes is high.")
            after()
        else:
            annot("wkg", tgt_w, f"{v - 2.4:+.2f} vs 2.4 (next band)", WKG_TIERS, tier_of(v, WKG_TIERS),
                  "Coggan power profile (FTP W/kg, men): the reference group is competitive road cyclists from novice to world class, not age-group triathletes, so the labels run hard. Coaching convention. Rests on a ramp FTP the athlete believes is high." + NO_NORM, scale="coach")
        wk.pop("_pop", None)

    # Consistency: training days per Mon-Sun week (any run, ride, swim, hike, strength; walks and sauna left out)
    days = {}
    for a in acts:
        t = (a.get("type") or "").lower(); n = (a.get("name") or "").lower()
        if "walk" in t or "sauna" in n or t in ("", "type"):
            continue
        d = _d(a["local_start"])
        days.setdefault(_mon(d), set()).add(d)
    for r in feel:
        if str(r.get("activity_id", "")).startswith("manual-"):
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
               "Mon–Sun weeks; a training day has a run, ride, swim, hike or logged strength (walks and sauna not counted); two sessions on one day count once. 3+ days is the research cutoff for 'regularly active'; 4 and 5 are coach tiers. Measured.",
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
        marker("fitness", 9, "trail", "Trail", hm(mins), "longest, 4 wk",
               (f"plan {hm(lr_plan)} in {lr_src} · " if lr_plan else "") + climb,
               "good" if lr_plan and mins >= lr_plan else "ok",
               "Time on feet decides whether a trail ultra is finishable; climbing speed decides how long it takes. Built toward the ultra-thread plan: about 1:45 in Base, 2:45 in Build, 3:30 by Mar 6 for the spring 50K, then the Grindstone build.",
               f"Longest run (road or trail, elapsed time) in the last 28 days, against the current block's planned long run (coach/plan.json long_run_min). The second line counts hilly runs ({HILLY_FT_MI} ft of climb per mile or more) in 8 weeks; climbing speed has its own tile, Climbing at 150 bpm. Measured, Calculated.",
               "Measured", "dots")
        annot("trail", (f"{hm(lr_plan)} by the end of {lr_src}" if lr_plan else "Set at the next block brief") + "; about 3:30 by Mar 6 (spring 50K)",
              f"{mins - lr_plan:+.0f} min vs the {hm(lr_plan)} plan" if lr_plan else "", TRAIL_TIERS, tier_of(mins / 60, TRAIL_TIERS),
              "Coach guide for ultra readiness by longest training run, not research: there is no published norm for time on feet. The ultra thread's steps (within about 10% of the prior 30 days' longest) are in CURRENT-STATE.")
    else:
        marker("fitness", 9, "trail", "Trail", "—", "", ("plan " + hm(lr_plan) + " · " if lr_plan else "") + "no run in 4 weeks", "", "", "", "Measured", "dots")

    # Trail pace and climbing at 150 bpm (the athlete, Nov 8, 2026): from the 5 s streams of hilly runs (trail_effort.py), 28-day averages
    # on the chart and the tile, each run's own value in the point's note; footing from the after-session form (Reported)
    foot = {str(r.get("activity_id")): FOOTING.get(r.get("footing") or "", "") for r in feel}
    tr = trail_effort.per_run(acts, summ)
    for key, label, field, unit, tiers, why, how in (
            ("trailgap", "Trail pace at 150 bpm", "pace", "/mi", TRAILGAP_TIERS,
             "Your easy trail pace with every climb turned into flat distance: the trail twin of run pace at 150 bpm, and the pace Grindstone asks for hour after hour.",
             "Hilly runs only, from the 5 s detail. Each minute's distance becomes flat-equivalent distance by the energy cost of running on its grade (Minetti 2002); the first 10 minutes, steep descents (over 10% down), hiking (cadence under 130 steps/min) and stops are left out, then pace is scaled to 150 bpm: pace × (HR − RHR) ÷ (150 − RHR). 28-day average; one run moves it a lot, so read it over several. Estimated."),
            *((k, "Climbing at 150 bpm", k, "ft/h", CLIMB_TIERS[k],
               "How fast you gain height at easy effort, by grade: the climbing twin of trail pace at 150 bpm, and what sets your time on long climbs.",
               f"Climbs of {lo:g}%{f' to {hi:g}%' if hi else ' or more'}, 3 minutes or longer, from the 5 s detail of hilly runs and hikes. The first minute of each climb is left out of heart rate because it lags, then vertical feet per hour is scaled to 150 bpm climb by climb: rate × (150 − RHR) ÷ (HR − RHR), only for climbs averaging 125 to 180 bpm. Running and power hiking both count; the share hiked comes from cadence (under 130 steps/min). 28-day average; one run moves it a lot, so read it over several. Estimated.")
              for k, lo, hi, _nm in trail_effort.BANDS)):
        runs_ = [r for r in tr if r[field]]
        avg = trail_effort.rolling([(r["date"], r[field]["value"]) for r in runs_])
        for r, (d, v, n) in zip(runs_, avg):
            x = r[field]
            own = (f"this run {mss(x['value'] * 60)}/mi (raw {mss(x['raw'] * 60)}, HR {x['hr']}, {x['min']} min kept)" if field == "pace"
                   else f"this run {x['value']:,} ft/h ({x['climbs']} climb{'' if x['climbs'] == 1 else 's'}, {x['vert_ft']:,} ft, HR {x['hr']}, {x['hiked_pct']}% hiked)")
            ft_ = f" · footing {foot[r['id']]}" if foot.get(r["id"]) else ""
            pt(key, d, round(v, 3) if field == "pace" else round(v), f"{r['name']} · {own}{ft_} · 28-day avg of {n}")
        recent = [(r, a_) for r, a_ in zip(runs_, avg) if _d(r["date"]) > T - timedelta(days=28)]
        if runs_:  # the tile reads the latest point, as its level does on the page; an old one says how old
            r, (d, v, n) = runs_[-1], avg[-1]
            stale = "" if recent else f"last hilly run {_d(d).strftime('%b %-d')} · none in 28 days · "
            recent = recent or [(r, avg[-1])]
            if field == "pace":
                fs = [foot[x["id"]] for x, _ in recent if foot.get(x["id"])]
                fl = " · footing: " + ", ".join(f"{fs.count(f)} {f}" for f in FOOTING.values() if f in fs) if fs else ""
                val, sub = mss(v * 60), stale + f"grade adjusted · {n} trail run{'' if n == 1 else 's'}{'' if stale else ', 28 days'}{fl}"
            else:
                hk = round(sum(x[field]["hiked_pct"] for x, _ in recent) / len(recent))
                val, sub = f"{round(v):,}", stale + f"on {BAND_WORDS[key]} grades · {n} hilly run{'' if n == 1 else 's'}{'' if stale else ', 28 days'} · {hk}% hiked"
            marker("fitness" if key in ("trailgap", "climb150") else "pair", 9, key, label, val, unit, sub, "", why, how, "Estimated", "dots")
            rk = tier_of(v, tiers)
            if field == "pace":
                nb = next(((l, hi) for l, lo, hi, _n in reversed(tiers) if hi is not None and hi <= v), None)
                gap = f"{mss((v - nb[1]) * 60)} to {nb[0]}" if nb else "in the top band"
                target = "Comfortable (under 13:00) by the spring 50K; Strong (under 11:30) by Grindstone (coach guide, draft)"
            else:
                nb = next(((l, lo) for l, lo, hi, _n in tiers if lo is not None and lo > v), None)
                gap = f"{nb[1] - v:,.0f} ft/h to {nb[0]}" if nb else "in the top band"
                target = "Strong by the spring 50K; Mountain on 10 to 20% by Grindstone (coach guide, draft)"
            annot(key, target, gap, tiers, rk, "Coach guide; no population norm exists for this at a set heart rate. Draft for review.", scale="coach")
        else:
            marker("fitness" if key in ("trailgap", "climb150") else "pair", 9, key, label, "—", "",
                   ("no trail detail yet: it comes with the next hilly run or hike" if key == "trailgap" else f"on {BAND_WORDS[key]} grades · no climb yet"), "", why, how, "Estimated", "dots")
            annot(key, "", "", tiers, "", "Coach guide; no population norm exists for this at a set heart rate. Draft for review.", scale="coach")

    # Climbing tile (option A, the athlete Nov 8, 2026): 10 to 20% leads; Run and Steep are paired rows behind a three-way switch,
    # and the tile's second line names them with their levels
    cm = {x["key"]: x for x in out if x.get("kind") == "marker" and x["key"] in ("climbrun", "climb150", "climbsteep")}
    if "climb150" in cm:
        lead = cm["climb150"]
        lead.update(pair="climbrun,climbsteep", seg_legend="Grade")
        for k, _lo, _hi, nm in trail_effort.BANDS:
            if k in cm:
                cm[k].update(sport_label=nm, seg={"climbrun": 1, "climb150": 2, "climbsteep": 3}[k])
        def lvl(k):
            m_ = cm.get(k)
            if not m_ or m_["value"] in ("—", ""):
                return f"{BAND_WORDS[k]}: none yet"
            if m_["sub"].startswith("last hilly run"):
                return f"{BAND_WORDS[k]}: none in 28 days"
            v = float(m_["value"].replace(",", ""))
            return f"{BAND_WORDS[k]}: {m_['value']}, {sublevel(v, CLIMB_TIERS[k])}"
        lead["sub"] = lead["sub"] + " · " + lvl("climbrun") + " · " + lvl("climbsteep")

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
        annot("lifts", "Hold or rise in a deficit (Nov 9 to Jan 31); rise from Feb 1", f"{v:+.0f}% vs baseline", LIFT_TIERS, tier_of(v, LIFT_TIERS),
              "Coach guide: progression against your own baseline, not a population standard. Home dumbbell and kettlebell lifts have no fair norms.")
    else:
        marker("fitness", 10, "lifts", "Strength", "—", "",
               f"{len(log_days)} session{'s' if len(log_days) != 1 else ''} logged · " + ("2 sessions set your baseline, the 3rd shows progress" if len(log_days) < 3 else "log a main lift 3 times to show progress"),
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
    annot("strength", "2 sessions a week (WHO guideline; your Long Life Lifts plan), 40 to 60 min a week in total",
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
               "In a Finnish cohort of 2,300 men, 2–3 and 4–7 sauna sessions a week went with lower cardiovascular and all-cause mortality than once a week (Laukkanen 2015). Observational, so a bonus, not a pillar; it can also help heat acclimation before Eagleman.",
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
    annot("physical", "Booked and done before January 2027", "Not booked" if not lastv else "Done", (), "", "")

    # Kudos (the athlete, Oct 23): a milestone first crossed in the last 7 days, per marker with a series; the page and the check-in announce them.
    # Same sub-tier logic as the page: each finite band cut into `split` equal steps, numbered toward the better edge; weekly counts use the 4-week average of full weeks.
    ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
    for m in [r for r in out if r.get("kind") == "marker" and r.get("tiers") and not r.get("quiet")]:
        tiers = [t.split("|") for t in m["tiers"].split(";")]
        better, n0 = m.get("better", 1), max(1, m.get("split", 2))
        per = [int(x) for x in str(m.get("splits") or "").split(",") if x.strip()]  # per-band sub-levels (finer near the top)
        subs = []
        for ti, (l, lo, hi, _n, _b) in enumerate(tiers):
            n = max(1, per[ti]) if ti < len(per) else n0
            lo = None if lo == "" else float(lo); hi = None if hi == "" else float(hi)
            if lo is None or hi is None or n == 1:
                subs.append((l, lo, hi)); continue
            step = (hi - lo) / n
            for i in range(n):
                a, b = lo + step * i, (hi if i == n - 1 else lo + step * (i + 1))
                subs.append((f"{l} {ROMAN[(i if better == 1 else n - 1 - i)]}", a, b))
        series = sorted([(r["date"], float(r["value"]), r.get("extra", "")) for r in out if r.get("kind") == "mpt" and r["key"] == m["key"] and r.get("value") not in (None, "")])
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
        beyond = (lambda v, e: v >= e) if better == 1 else (lambda v, e: v <= e)
        for l, lo, hi in subs:
            e = lo if better == 1 else hi
            if e is None:
                continue
            first = next((x for x in series if beyond(x[1], e)), None)
            if first and _d(first[0]) > T - timedelta(days=7) and beyond(series[-1][1], e):
                out.append({"kind": "kudos", "key": m["key"], "label": m["label"], "level": l, "date": first[0], "value": first[1], "section": m["section"]})
    return out
