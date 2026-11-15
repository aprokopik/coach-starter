"""Where an athlete starts (the athlete, Nov 12, 2026: "when data is imported and you're baselining people. If people are already at
some level of athlete, some level of kudos, congratulations, or respect for them is in order"; the goal is "engaging and fun and
rewarding for any level of person as an athlete").

Reads the built dashboard rows (coach/dashboard/coach.json; run coach/tools/build_dashboard.py first) and sorts every metric
that has a level into three groups, for the onboarding welcome and any later "where do I stand" question:
  strong   Top 20% or better on a percentile ladder, or the best level of a scale without percentiles. Where a harder scale
           is on file (the next stage, see markers.stage_of) it is named: the dashboard offers it as a step up.
  solid    Top half or Top third.
  climb    everything else with a level: the ladders with the most room.
Levels on run pace at 150 bpm and bike power at 130 bpm are worked out on the page, so they are not listed here.
Writes nothing. Usage: python3 coach/tools/standing.py [path to coach.json]
"""
from __future__ import annotations

import json
import re
import sys

STRONG = re.compile(r"^Top (20|10|5|1|0\.5)%")
SOLID = re.compile(r"^Top (half|third)")
RANKED = re.compile(r"^(Top|Bottom) ")


def _tiers(m):
    out = []
    for t in str(m.get("tiers") or "").split(";"):
        p = t.split("|")
        if len(p) >= 3 and p[0]:
            out.append((p[0], p[1], p[2]))
    return out


def level_of(m):
    """The level name on the scale in use: the rank up to its bracket."""
    return str(m.get("rank") or "").split(" (")[0].strip()


def group_of(m):
    """'strong', 'solid', 'climb', or None for a marker with no level."""
    lv, ts = level_of(m), _tiers(m)
    if not lv or not ts:
        return None
    if any(RANKED.match(l) for l, _lo, _hi in ts):
        return "strong" if STRONG.match(lv) else "solid" if SOLID.match(lv) else "climb"
    better = 1 if str(m.get("better") or "1") not in ("-1", "-1.0") else -1
    best = next((l for l, lo, hi in ts if (hi == "" if better == 1 else lo == "")), None)
    return "strong" if best and lv == best else "climb" if lv == ts[0][0] or lv == ts[-1][0] else "solid"


def next_stage(m):
    """The label of the first scale a stage above the one in use, or None."""
    try:
        sc = json.loads(m.get("scales") or "[]")
    except ValueError:
        return None
    cur = next((s for s in sc if s.get("id") == m.get("compare")), None)
    if not cur:
        return None
    up = sorted((s for s in sc if int(s.get("stage") or 2) > int(cur.get("stage") or 2)),
                key=lambda s: (int(s.get("stage") or 2), s.get("stage_label") != "Your race"))
    return up[0]["label"] if up else None


def standing(rows):
    """{'strong': [...], 'solid': [...], 'climb': [...]} of {key, label, value, level, step_up}, in dashboard order."""
    out = {"strong": [], "solid": [], "climb": []}
    for m in rows:
        if m.get("kind") != "marker" or m.get("section") not in ("fitness", "pair", "health"):
            continue
        g = group_of(m)
        if g:
            out[g].append({"key": m["key"], "label": m.get("label") or m["key"], "value": f"{m.get('value', '')} {m.get('unit', '')}".strip(),
                           "level": level_of(m), "step_up": next_stage(m) if g == "strong" else None})
    return out


def main(argv):
    path = argv[0] if argv else "coach/dashboard/coach.json"
    try:
        rows = json.load(open(path)).get("rows", [])
    except (OSError, ValueError):
        print("No built dashboard rows yet: run python3 coach/tools/build_dashboard.py first.")
        return 1
    st = standing(rows)
    if not any(st.values()):
        print("No levels yet: nothing has been measured. Every ladder starts from the first session.")
        return 0
    for name, title in (("strong", "Already strong (say so, with respect)"), ("solid", "Solid"), ("climb", "Most room to climb (the ladders to enjoy, never a failing)")):
        if st[name]:
            print(title + ":")
            for x in st[name]:
                print(f"  {x['label']}: {x['value']}, {x['level']}" + (f"; has earned the next stage: {x['step_up']}" if x["step_up"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
