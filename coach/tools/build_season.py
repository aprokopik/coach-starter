"""Shared Race Season page from coach/races.json ({{ATHLETE}}, Nov 3, 2026).

The shared page ({{SEASON_URL}}, source coach/dashboard/season.html) used to keep its own
hand-typed race list, which fell behind (Bobcat was missing). This script writes the list between the RACES markers in
season.html from races.json, using public fields only, and sets the footer date when the list changes.

Public fields: public_name or name, date, approx, sport, status, public_distance or distance, public_location or location,
with, stats (done races), url, and the weather box (wx_kind, wx_hi, wx_lo, wx_text, wx_at, water). Never goal, plans,
kit, cutoffs, limits, finish estimates, wx_plan, lat/lon or registration notes: the page is shared by link.

CLI: python3 coach/tools/build_season.py [--check]
  writes season.html and prints "changed" or "unchanged"; with --check writes nothing and exits 1 when the page is stale.
"""
import json
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = os.path.join(ROOT, "coach", "dashboard", "season.html")
BEGIN, END = "  const RACES = [", "\n  ];"
FOOT_BEGIN, FOOT_END = '<p class="foot">Updated ', ". Ask {{ATHLETE}} for the latest; plans can shift.</p>"
SPORT = {"Ride": "bike", "Run": "run", "Trail run": "trail", "Triathlon": "tri", "Adventure race": "adventure"}
PUBLIC = ("d", "a", "n", "t", "s", "dist", "loc", "who", "res", "url", "wx")
PRIVATE_FIELDS = ("goal", "forecast", "limit", "cutoffs", "cutoffs_src", "wx_plan", "registration", "lat", "lon", "result", "priority")


def js(v):
    return json.dumps(v, ensure_ascii=False)


def entry(r):
    e = {"d": r["date"]}
    if r.get("approx") in (True, "true"):
        e["a"] = 1
    e.update({"n": r.get("public_name") or r["name"], "t": SPORT.get(r.get("sport"), "run"), "s": r.get("status"),
              "dist": r.get("public_distance") or r.get("distance") or "", "loc": r.get("public_location") or r.get("location") or "",
              "who": [w.strip() for w in str(r.get("with") or "").split(";") if w.strip()]})
    if r.get("status") == "done" and r.get("stats"):
        e["res"] = [p.split("|", 1) if "|" in p else [p, ""] for p in str(r["stats"]).split(";") if p]
    if r.get("url"):
        e["url"] = r["url"]
    if r.get("status") != "done" and r.get("wx_hi") not in (None, ""):
        wx = {"k": r.get("wx_kind") or "typical", "hi": r["wx_hi"], "lo": r.get("wx_lo"), "txt": r.get("wx_text") or ""}
        if wx["k"] == "forecast" and r.get("wx_at"):
            wx["at"] = r["wx_at"]
        if r.get("water"):
            wx["water"] = r["water"]
        e["wx"] = wx
    assert set(e) <= set(PUBLIC)
    return e


def races_block(rows):
    races = sorted([r for r in rows if r.get("kind") == "race"], key=lambda r: (r["date"], r.get("race_id", "")))
    lines = ["    { " + ", ".join(f"{k}: {js(v)}" for k, v in entry(r).items()) + " }," for r in races]
    return BEGIN + "\n" + "\n".join(lines)


def render(html, rows, today=None):
    """Return (new_html, changed)."""
    a = html.index(BEGIN)
    b = html.index(END, a)
    new_block = races_block(rows)
    changed = html[a:b] != new_block
    out = html[:a] + new_block + html[b:]
    if changed:
        fa = out.index(FOOT_BEGIN) + len(FOOT_BEGIN)
        fb = out.index(FOOT_END, fa)
        t = today or date.today()
        out = out[:fa] + f"{t.strftime('%b')} {t.day}, {t.year}" + out[fb:]
    return out, changed


def main():
    rows = json.load(open(os.path.join(ROOT, "coach", "races.json")))["rows"]
    html = open(PAGE).read()
    out, changed = render(html, rows)
    if "--check" in sys.argv:
        print("stale: run python3 coach/tools/build_season.py and republish the shared page" if changed else "in sync")
        sys.exit(1 if changed else 0)
    if changed:
        open(PAGE, "w").write(out)
    print("changed" if changed else "unchanged")


if __name__ == "__main__":
    main()
