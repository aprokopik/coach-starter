#!/usr/bin/env python3
"""Which population a Fitness tile's levels are read against (the athlete, Nov 12, 2026: "baseline metrics ... based off of general
population. But if an athlete requests or wants to compare, or you propose to compare against times or population of a specific
event type or type of athlete, that should be easy to execute").

The baseline is the default and needs no setting. A comparison is one word on the tile's row in coach/fitness_layout.json
(field "compare"), the only home of that choice; coach/tools/markers.py reads it on the next build. Comparison populations
are the rows in coach/norms.json that carry "compare": "<id>" and a "compare_label".

  python3 coach/tools/compare.py list                 every tile with a choice of comparison, and what is set
  python3 coach/tools/compare.py set t40k tri703      read the Bike time tile against IRONMAN 70.3 finishers
  python3 coach/tools/compare.py set t40k general     back to the baseline
  python3 coach/tools/compare.py suggest              scales that fit this athlete's goals and races: on file, or to look for

The athlete can also switch in the dashboard: a tile's Scale panel lists every scale on file ("Compare with"), and the tap
arrives as metric_compare/<tile>, which `catalog.py ingest` writes to the same field. The default is always the general
population (the athlete, Nov 12, 2026); the coach's part is to look for further scales that fit the athlete's goals and races
(`suggest`), file them in coach/norms.json after the athlete agrees, and mention that they are there.
Then rebuild the dashboard as usual. To add a population, file its rows in coach/norms.json with a new compare id.
"""
from __future__ import annotations

import json
import sys

LAYOUT, NORMS = "coach/fitness_layout.json", "coach/norms.json"
# norm keys behind each tile (the tile and the distances on its switch)
TILE_KEYS = {"t40k": ("t20k", "t40k", "t90k", "t100k", "t100mi"), "swim": ("swim100", "swim400", "swim750", "swim1500", "hm703_swim_pace"),
             "5k": ("mile", "5k", "10k", "half", "marathon"), "run": ("hm703_run",), "bike": ("hm703_bike",), "ftp": ("wkg",)}
BUILT_IN = {"run": {"tri703": "IRONMAN 70.3 finishers"}, "bike": {"tri703": "IRONMAN 70.3 finishers"}}  # scales markers.py derives itself
# Which comparison fits which kind of goal race: (pattern on "sport distance name", id, label, the tiles it would serve).
RACE_SCALES = (
    (r"triathlon.*(56 mi|70\.3)|70\.3", "tri703", "IRONMAN 70.3 finishers", ("t40k", "bike", "run", "swim")),
    (r"triathlon.*(112 mi|full|140\.6)|full ironman", "tri140", "Full IRONMAN finishers", ("t40k", "bike", "run", "swim")),
    (r"ride.*(100 mi|century)|century", "century", "Century ride finishers", ("t40k",)),
    (r"trail run.*(100k|100 km|110 km|100m)|ultra", "ultra100k", "100K trail ultra finishers", ("trailspeed", "trail", "5k")),
    (r"trail run.*50k", "trail50k", "50K trail finishers", ("trailspeed", "trail", "5k")),
    (r"marathon", "marathon", "Marathon finishers", ("5k", "run")),
)


def options(norm_rows, tile):
    """{id: label} of comparisons on file for a tile."""
    keys = TILE_KEYS.get(tile, (tile,))
    found = {r["compare"]: r.get("compare_label") or r["compare"] for r in norm_rows if r.get("key") in keys and r.get("compare")}
    return {**BUILT_IN.get(tile, {}), **found}


def suggest(races, layout, norm_rows, today):
    """[{race, id, label, on_file: [tiles], look_for: [tiles]}] for each goal race still ahead (registered, planned or
    exploring) that has a fitting comparison; tiles are limited to those on the athlete's Scorecard."""
    import re
    tiles = {r["key"] for r in layout.get("rows", []) if r.get("kind") == "fit_kpi"}
    out, seen = [], set()
    for r in sorted((x for x in races if x.get("kind") == "race" and str(x.get("date") or "") >= today and x.get("status") in ("registered", "planned", "exploring")),
                    key=lambda x: (x.get("status") != "registered", str(x.get("date")))):
        text = f"{r.get('sport', '')} {r.get('distance', '')} {r.get('name', '')}".lower()
        for pat, cid, label, serves in RACE_SCALES:
            if cid in seen or not re.search(pat, text):
                continue
            seen.add(cid)
            mine = [t for t in serves if t in tiles]
            have = [t for t in mine if cid in options(norm_rows, t)]
            out.append({"race": r.get("name"), "date": r.get("date"), "id": cid, "label": label, "on_file": have, "look_for": [t for t in mine if t not in have]})
            break
    return out


def set_compare(layout, norm_rows, tile, choice):
    """A new layout with the tile's comparison set ('general' clears it). Raises ValueError on an unknown tile or comparison."""
    rows = layout.get("rows", [])
    row = next((r for r in rows if r.get("kind") == "fit_kpi" and r.get("key") == tile), None)
    if row is None:
        raise ValueError(f"no tile '{tile}' in the layout")
    if choice != "general" and choice not in options(norm_rows, tile):
        raise ValueError(f"no comparison '{choice}' on file for '{tile}'; on file: {', '.join(options(norm_rows, tile)) or 'none'}")
    new = [dict(r) for r in rows]
    for r in new:
        if r.get("kind") == "fit_kpi" and r.get("key") == tile:
            r.pop("compare", None)
            if choice != "general":
                r["compare"] = choice
    return dict(layout, rows=new)


def main(argv):
    layout, norms = json.load(open(LAYOUT)), json.load(open(NORMS))["rows"]
    if len(argv) >= 1 and argv[0] == "list":
        for r in layout.get("rows", []):
            if r.get("kind") == "fit_kpi" and options(norms, r["key"]):
                print(f"{r['key']}: set to {r.get('compare', 'general')}; on file: general, " + ", ".join(f"{i} ({l})" for i, l in options(norms, r["key"]).items()))
        return 0
    if len(argv) >= 1 and argv[0] == "suggest":
        from datetime import date
        races = json.load(open("coach/races.json"))
        for x in suggest(races if isinstance(races, list) else races.get("rows", []), layout, norms, date.today().isoformat()):
            print(f"{x['label']} ({x['id']}), for {x['race']} on {x['date']}: on file for {', '.join(x['on_file']) or 'no tile'}; look for {', '.join(x['look_for']) or 'nothing more'}")
        return 0
    if len(argv) == 3 and argv[0] == "set":
        try:
            new = set_compare(layout, norms, argv[1], argv[2])
        except ValueError as e:
            print(e)
            return 1
        raw = open(LAYOUT).read()
        row = next(r for r in new["rows"] if r.get("kind") == "fit_kpi" and r.get("key") == argv[1])
        out = []
        for line in raw.split("\n"):  # the layout keeps one row per line: rewrite only the tile's line
            if f'"key": "{argv[1]}"' in line and '"fit_kpi"' in line:
                line = "  " + json.dumps(row, ensure_ascii=False) + ("," if line.rstrip().endswith(",") else "")
            out.append(line)
        open(LAYOUT, "w").write("\n".join(out))
        print(f"{argv[1]} now reads against {argv[2]}; rebuild the dashboard")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
