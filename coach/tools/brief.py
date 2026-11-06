"""Block briefs: progress on each block's focus KPIs, the Sunday lines and what is due (coach/engine/BLOCK-BRIEF.md).

Deterministic; the coach writes the brief itself into coach/block_briefs.json. Run from the repo root.
  python3 coach/tools/brief.py due      what the coach owes today (a brief to draft, a review, Sunday lines)
  python3 coach/tools/brief.py lines    one line per focus KPI of the current block
  python3 coach/tools/brief.py accept <block_key> [--by dashboard|chat]             the athlete's yes: status live, decided_on, by
  python3 coach/tools/brief.py change <block_key> --note "<text>" [--by dashboard|chat]
                                         the athlete wants changes: status stays proposed; change_note and change_asked_on recorded
                                         (due then asks the coach to answer it). Same shape as lifts.py accept / keep.
Also imported by build_dashboard.py (rows for the Fitness tab's This block card) and morning_facts.py (facts.json block_brief).
"""
import csv
import json
import os
import sys
from datetime import date, datetime, timedelta

BRIEFS = "coach/block_briefs.json"
LEVELS = "coach/levels.json"
PLAN = "coach/plan.json"
ACTS = "data/activities.csv"
SUMMARY = "data/summary.csv"
LIFT_LOG = "coach/strength_log.csv"
DRAFT_DAYS = 14   # a block starting within this many days needs a drafted brief
SLACK = 0.15      # on track = progress within this fraction of the share of the block already gone


def _d(s):
    return date.fromisoformat(str(s)[:10])


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as fh:
        return json.load(fh)


def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path) as fh:
        return list(csv.DictReader(fh))


def mss(minutes):
    s = int(round(minutes * 60))
    return f"{s // 60}:{s % 60:02d}"


def fitness_series(acts, summ):
    """Python twin of the page's dash.calc('fitness') (calc.js): run pace scaled to 150 bpm on flat runs and Zwift power
    scaled to 130 bpm, each with a 28-day average. Keep the two in step."""
    rhr = [(_d(r["date"]), _f(r.get("resting_hr"))) for r in summ if r.get("date") and _f(r.get("resting_hr")) is not None]

    def rhr_at(d):
        xs = [v for dd, v in rhr if abs((dd - d).days) <= 7]
        return sum(xs) / len(xs) if len(xs) >= 3 else None
    out = []
    for a in acts:
        t = (a.get("type") or "").lower(); ds = (a.get("local_start") or "")[:10]
        hr = _f(a.get("avg_hr"))
        if not ds or hr is None:
            continue
        d = _d(ds); R = rhr_at(d)
        if R is None:
            continue
        if "run" in t and "treadmill" not in t and "virtual" not in t:
            mi, ft = _f(a.get("distance_mi")), _f(a.get("ascent_ft")) or 0
            mins = _f(a.get("moving_min")) or _f(a.get("duration_min"))
            if not mi or not mins or mins < 20:
                continue
            pace = mins / mi
            if pace < 7 or pace > 16 or ft / mi >= 60 or hr < 135 or hr > 175:
                continue
            out.append({"date": d, "marker": "run", "value": pace * (hr - R) / (150 - R)})
        elif "virtual_ride" in t or "zwift" in (a.get("name") or "").lower():
            p, mins = _f(a.get("avg_power_w")), _f(a.get("duration_min"))
            if not p or not mins or mins < 30 or hr < 110 or hr > 165:
                continue
            out.append({"date": d, "marker": "bike", "value": p * (130 - R) / (hr - R)})
    out.sort(key=lambda r: r["date"])
    for r in out:
        xs = [q["value"] for q in out if q["marker"] == r["marker"] and r["date"] - timedelta(days=28) < q["date"] <= r["date"]]
        r["avg28"] = sum(xs) / len(xs) if len(xs) >= 2 else None
    return out


def avg28_on(series, key, d):
    """Mean of the marker over the 28 days up to d; with nothing in that window, the 28 days up to its last point
    (the same as the page's markerSummary, so the brief and the tile show one number)."""
    pts = [r for r in series if r["marker"] == key and r["date"] <= d]
    if not pts:
        return None
    end = d if any((d - r["date"]).days < 28 for r in pts) else pts[-1]["date"]
    xs = [r["value"] for r in pts if 0 <= (end - r["date"]).days < 28]
    return sum(xs) / len(xs) if xs else None


def today_iso():
    return os.environ.get("COACH_TODAY") or date.today().isoformat()


def opt(args, flag, default=None):
    return args[args.index(flag) + 1] if flag in args and args.index(flag) + 1 < len(args) else default


def write_briefs(doc):
    """Write coach/block_briefs.json in its hand layout: indent 1, brief_point rows one per line."""
    rows = ",\n".join("  " + json.dumps(r, ensure_ascii=False) if r.get("kind") == "brief_point"
                      else "\n".join("  " + x for x in json.dumps(r, indent=1, ensure_ascii=False).split("\n")) for r in doc["rows"])
    head = {k: v for k, v in doc.items() if k != "rows"}
    lines = [f" {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()]
    with open(BRIEFS, "w") as fh:
        fh.write("{\n" + "\n".join(lines) + ("\n" if lines else "") + ' "rows": [\n' + rows + "\n ]\n}\n")


def find_brief(doc, block_key):
    return next((r for r in doc.get("rows", []) if r.get("kind") == "brief" and r.get("block_key") == block_key), None)


def cmd_accept(args):
    """the athlete accepts a proposed brief (dashboard tap in brief_choice/<block_key>, or chat)."""
    doc = read_json(BRIEFS, {"rows": []}); key = args[0] if args else None
    r = find_brief(doc, key)
    if r is None or r.get("status") != "proposed":
        print(f"{key}: already {r['status']}" if r else "no brief for that block"); return 1
    r["status"], r["decided_on"], r["by"] = "live", today_iso(), opt(args, "--by", "chat")
    r.pop("change_note", None); r.pop("change_asked_on", None)
    write_briefs(doc)
    print(f"{key}: live as proposed (by {r['by']}); say so once in the check-in")
    return 0


def cmd_change(args):
    """the athlete wants changes to a proposed brief: it stays proposed and due names his note until the coach answers."""
    doc = read_json(BRIEFS, {"rows": []}); key = args[0] if args else None
    note = (opt(args, "--note") or "").strip()
    r = find_brief(doc, key)
    if r is None or r.get("status") != "proposed":
        print(f"{key}: already {r['status']}" if r else "no brief for that block"); return 1
    if not note:
        print("--note is required: what the athlete wants changed"); return 1
    r["change_note"], r["change_asked_on"], r["by"] = note, today_iso(), opt(args, "--by", "chat")
    write_briefs(doc)
    print(f"{key}: change asked; answer it in the next check-in and revise the brief (new set_on, change_note cleared)")
    return 0


def load(today=None):
    doc = read_json(BRIEFS, {"rows": []})
    rows = doc.get("rows", [])
    briefs = sorted((r for r in rows if r.get("kind") == "brief"), key=lambda r: r["start"])
    return briefs, rows


def current_and_next(briefs, today):
    cur = next((b for b in briefs if _d(b["start"]) <= today <= _d(b["end"])), None)
    nxt = next((b for b in briefs if _d(b["start"]) > today), None)
    return cur, nxt


def progress(k, b, today, ctx):
    """Where one focus KPI stands in its block: now, baseline, target, pct of the way, expected pct by today, state, line."""
    start, end = _d(b["start"]), _d(b["end"])
    span = max(1, (end - start).days + 1)
    gone = 0.0 if today < start else min(1.0, ((today - start).days + 1) / span)
    p = {"now": None, "now_text": "", "baseline": None, "target": None, "strong": None, "pct": None, "expected": round(gone, 2), "state": "not started" if today < start else ""}
    key = k["key"]
    if key in ("run", "bike"):
        lv = next((r for r in ctx["levels"] if r.get("key") == key and r.get("block_key") == b["block_key"]), {})
        better = -1 if key == "run" else 1
        now = avg28_on(ctx["series"], key, min(today, end))
        base = _f(lv.get("baseline"))
        if base is None:
            base = avg28_on(ctx["series"], key, start - timedelta(days=1)) if today >= start else now
        tgt, strong = _f(lv.get("target")), _f(lv.get("strong"))
        fmt = (lambda v: mss(v) + "/mi") if key == "run" else (lambda v: f"{v:.0f} W")
        p.update(now=now, baseline=base, target=tgt, strong=strong, now_text=fmt(now) if now is not None else "no data in 28 days")
        if now is not None and base is not None and tgt is not None and (tgt - base) * better > 0:
            p["pct"] = round((now - base) / (tgt - base), 2)
        elif now is not None and tgt is not None and (now - tgt) * better >= 0:
            p["pct"] = 1.0
        unit = " at 150 bpm" if key == "run" else " at 130 bpm"
        tail = f"target {fmt(tgt)}" + (f", strong {fmt(strong)}" if strong else "") if tgt is not None else "no target set"
        p["line"] = f"{k['label']}: {p['now_text']}{unit if now is not None else ''} (baseline {fmt(base) if base is not None else 'set ' + start.strftime('%b %-d')}, {tail})"
    elif key == "lifts":
        n = len({r["date"] for r in ctx["lift_log"] if r.get("date") and start <= _d(r["date"]) <= min(today, end)})
        tgt = int(k.get("count_target") or 12)
        p.update(now=n, target=tgt, now_text=f"{n} of {tgt} sessions", pct=round(n / tgt, 2))
        exp = round(tgt * gone)
        p["line"] = f"{k['label']}: {n} of {tgt} sessions" + (f" (about {exp} by now)" if today >= start else "")
    else:
        m = next((r for r in ctx["markers"] if r.get("key") == key), {})
        p.update(now_text=f"{m.get('value', '—')} {m.get('unit', '')}".strip())
        p["line"] = f"{k['label']}: {p['now_text']}"
    if today < start:
        p["pct"] = None  # no progress bar before the block starts (the reading may already sit past a target)
    if today >= start and p["pct"] is not None:
        if p["pct"] >= 1:
            p["state"] = "target reached"
        elif p["pct"] >= gone - SLACK:
            p["state"] = "on track"
        else:
            p["state"] = "behind"
    elif today >= start:
        p["state"] = "no reading"
    if p["state"]:
        p["line"] += f": {p['state']}" + (f", {round(p['pct'] * 100)}% of the way with {round(gone * 100)}% of the block gone" if p["pct"] is not None and today >= start and p['state'] != 'target reached' else "")
    return p


def context(markers=None):
    return {"levels": read_json(LEVELS, {"rows": []}).get("rows", []), "series": fitness_series(read_csv(ACTS), read_csv(SUMMARY)),
            "lift_log": read_csv(LIFT_LOG), "markers": markers or []}


def rows_for_dashboard(today, markers=None):
    """The current and next block's brief rows, focus KPIs enriched with progress (flat fields only)."""
    briefs, rows = load()
    cur, nxt = current_and_next(briefs, today)
    keep = {b["block_key"] for b in (cur, nxt) if b}
    ctx = context(markers)
    out = []
    for r in rows:
        if r.get("block_key") not in keep:
            continue
        r = dict(r)
        if r["kind"] == "brief":
            r["is_current"] = bool(cur and r["block_key"] == cur["block_key"])
            s, e = _d(r["start"]), _d(r["end"])
            r["week"] = max(0, (today - s).days // 7 + 1) if today >= s else 0
            r["weeks"] = ((e - s).days + 1 + 6) // 7
        if r["kind"] == "brief_kpi":
            b = next(x for x in briefs if x["block_key"] == r["block_key"])
            for k, v in progress(r, b, today, ctx).items():
                r["p_" + k] = v
        out.append(r)
    return out


def facts(today, markers=None):
    briefs, rows = load()
    cur, nxt = current_and_next(briefs, today)
    ctx = context(markers)
    plan = [r for r in read_json(PLAN, {"rows": []}).get("rows", []) if r.get("kind") == "block"]

    def kpis(b):
        return sorted((r for r in rows if r.get("kind") == "brief_kpi" and r["block_key"] == b["block_key"]), key=lambda r: r["rank"])

    def points(b):
        return sorted((r for r in rows if r.get("kind") == "brief_point" and r["block_key"] == b["block_key"]), key=lambda r: r["date"])
    f = {"current": None, "next": None, "today_points": [], "due": [], "provenance": "coach/block_briefs.json, coach/levels.json; tools/brief.py"}
    for name, b in (("current", cur), ("next", nxt)):
        if not b:
            continue
        ks = kpis(b)
        f[name] = {"block_key": b["block_key"], "block": b["block"], "name": b.get("name"), "start": b["start"], "end": b["end"], "status": b.get("status"),
                   "focus": [{"rank": k["rank"], "key": k["key"], "label": k["label"], **{x: progress(k, b, today, ctx)[x] for x in ("line", "state", "pct", "expected")}} for k in ks],
                   "next_point": next(({"date": p["date"], "type": p["type"], "label": p["label"]} for p in points(b) if _d(p["date"]) >= today), None)}
        f["today_points"] += [{"block": b["block"], "type": p["type"], "label": p["label"]} for p in points(b) if _d(p["date"]) == today]
    # what is owed: a brief for any block starting within DRAFT_DAYS that has none; a proposed brief at its decide_by date
    have = {b["block_key"] for b in briefs}
    for pb in sorted(plan, key=lambda r: r["start"]):
        s = _d(pb["start"])
        if today <= s <= today + timedelta(days=DRAFT_DAYS) and pb["key"] not in have and pb.get("phase") not in ("Taper", "Recover"):
            f["due"].append(f"Draft the block brief for {pb['label']} (starts {pb['start']}): coach/engine/BLOCK-BRIEF.md")
    for b in briefs:
        if b.get("status") == "proposed" and b.get("change_note"):
            f["due"].append(f"Answer the athlete's change request for {b['block']}: {b['change_note']}")
        elif b.get("status") == "proposed" and b.get("decide_by") and _d(b["decide_by"]) <= today:
            f["due"].append(f"Brief for {b['block']} unanswered by {b['decide_by']}: set status live, say so once")
        if b.get("status") == "live" and _d(b["end"]) < today and any(not k.get("outcome") for k in kpis(b)):
            f["due"].append(f"Write the end-of-block outcomes for {b['block']} (brief_kpi outcome) and close the brief")
    for tp in f["today_points"]:
        f["due"].append(f"{tp['label']} for {tp['block']} in today's check-in (BLOCK-BRIEF.md section 3)")
    return f


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "due"
    if cmd in ("accept", "change"):
        return (cmd_accept if cmd == "accept" else cmd_change)(argv[2:])
    today = _d(argv[2]) if len(argv) > 2 else datetime.now().date()
    f = facts(today)
    if cmd == "due":
        print("\n".join(f["due"]) or "nothing due")
    elif cmd == "lines":
        b = f["current"] or f["next"]
        if not b:
            print("no brief for the current or next block")
            return
        print(f"{b['block']} ({b['status']}), {b['start']} to {b['end']}")
        for k in b["focus"]:
            print(f"  {k['rank']}. {k['line']}")
    else:
        print(__doc__)


if __name__ == "__main__":
    sys.exit(main(sys.argv) or 0)
