#!/usr/bin/env python3
"""70.3 split scales by age group and sex (epic Compare with anyone; the athlete kept "Real men 35 to 39 70.3 table" on the Truer
numbers page, "For stage 2 yes", and picked "Loose ends, then 70.3 table", Nov 16, 2026).

IRONMAN publishes no split table by age group. Knechtle et al. 2023 (Sports Medicine - Open 9:88, CC BY 4.0) Table 1 gives the
finish time mean and SD for every age group and sex (823,459 finishes, 2004 to 2020). markers.norm_rows() takes each all-ages
70.3 split row in coach/norms.json (compare tri703) and adds one row per age group in memory: the split centre moves by that
group's finish mean over the all-ages mean, and its spread by the group's SD over the all-ages SD (the all-ages figures pooled from
Table 1 itself, which gives back the paper's 625,393 men and 198,066 women). Assumption, said on every row: a group's splits move
in step with its finish time. Nothing is stored: the 26 lines of T1 below and the all-ages rows are the only homes (the athlete, Nov 16,
2026: "make it lighter, but still keep functionality"; the 198 stored rows were about 240 KB).

    python3 coach/tools/ag703_rows.py   # print how many rows it works out

Standard library only.
"""
import json
import os
import sys

FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "norms.json")
URL = "https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-023-00636-x/tables/1"
# Table 1: age group, sex, n, finish mean, finish SD (h:mm:ss)
T1 = """18-24 F 8129 6:10:20 0:49:42|18-24 M 22484 5:38:38 0:51:04|25-29 F 26130 6:09:29 0:49:16|25-29 M 63093 5:40:45 0:50:00
30-34 F 35555 6:10:04 0:49:17|30-34 M 102127 5:41:16 0:48:39|35-39 F 37189 6:13:18 0:49:06|35-39 M 123729 5:43:27 0:47:38
40-44 F 35910 6:16:18 0:48:30|40-44 M 123659 5:46:34 0:46:44|45-49 F 26993 6:20:14 0:47:10|45-49 M 92523 5:49:47 0:46:15
50-54 F 16879 6:26:25 0:47:17|50-54 M 55880 5:54:25 0:45:53|55-59 F 7664 6:35:04 0:46:55|55-59 M 26448 6:01:54 0:45:31
60-64 F 2766 6:49:32 0:47:40|60-64 M 10332 6:13:00 0:46:09|65-69 F 665 7:05:10 0:42:24|65-69 M 3730 6:28:14 0:45:47
70-74 F 165 7:28:41 0:44:56|70-74 M 1142 6:52:49 0:44:10|75+ F 21 7:43:26 0:46:32|75+ M 246 7:18:36 0:46:55"""
MIN_N = 200  # smaller groups are not filed (women 75+ is 21 finishes)


def _min(t):
    h, m, s = map(int, t.split(":"))
    return h * 60 + m + s / 60


def table():
    out = []
    for cell in T1.replace("\n", "|").split("|"):
        band, sx, n, mu, sd = cell.split()
        out.append({"band": band, "sex": "male" if sx == "M" else "female", "n": int(n), "mean": _min(mu), "sd": _min(sd)})
    return out


def pooled(rows, sex):
    rs = [r for r in rows if r["sex"] == sex]
    n = sum(r["n"] for r in rs)
    mu = sum(r["n"] * r["mean"] for r in rs) / n
    var = sum(r["n"] * (r["sd"] ** 2 + (r["mean"] - mu) ** 2) for r in rs) / n
    return n, mu, var ** 0.5


def derive(base, g, pool):
    """One age group row from an all-ages split row: centre by the finish mean ratio, spread by the finish SD ratio."""
    bp = [list(x) for x in (json.loads(base["breakpoints"]) if isinstance(base["breakpoints"], str) else base["breakpoints"])]
    mid = next(v for v, p in bp if p == 50)
    rm, rs = g["mean"] / pool[1], g["sd"] / pool[2]
    dp = 3 if max(v for v, _ in bp) < 60 else 2
    new = [[round(mid * rm + (v - mid) * rs, dp), p] for v, p in bp]
    who = f"{'men' if g['sex'] == 'male' else 'women'} {g['band'].replace('-', ' to ')}"
    r = dict(base)
    r.update(age_band=g["band"], derived="ag703", n=g["n"], estimated=True, breakpoints=new,
             population=base["population"].replace("men,", f"{who},", 1) if base["population"].startswith("men,") else base["population"].replace("women,", f"{who},", 1),
             short=f"{who}, " + (base.get("short") or "").split(", ", 1)[-1],
             source=f"Estimated by the coach from Knechtle et al. 2023, Sports Medicine - Open 9:88: the all-ages row moved to {who} with its Table 1 "
                    f"({g['n']:,} finishes; finish time centre {rm:.3f} and spread {rs:.3f} times all ages)",
             url=URL,
             note=f"For {who}: the group's splits are assumed to move in step with its finish time, since no split table by age group is published. " + base.get("note", "").replace("All ages together (no age bands published in a readable table yet). ", "").replace("All ages together. ", ""))
    return r


def build(rows):
    t = table()
    pool = {sx: pooled(t, sx) for sx in ("male", "female")}
    keep = [r for r in rows if r.get("derived") != "ag703"]
    bases = [r for r in keep if r.get("compare") == "tri703" and not r.get("age_band") and r.get("sex") in pool]
    new = [derive(b, g, pool[g["sex"]]) for b in bases for g in t if g["sex"] == b["sex"] and g["n"] >= MIN_N]
    return keep + new


if __name__ == "__main__":
    with open(FILE, encoding="utf-8") as fh:
        rows = json.load(fh)["rows"]
    print(f"{sum(1 for r in build(rows) if r.get('derived') == 'ag703')} age group 70.3 rows, worked out in memory")
