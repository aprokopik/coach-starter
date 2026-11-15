"""Lab results and the health gate for the Health tab (roadmap week 5, Medicine in the loop, Nov 14, 2026).

Plumbing and display only: this tool reads what the athlete reported and what the lab itself flagged. It never judges a value;
the lab's own range flag is shown in the lab's words, and every retest date says where it came from.

Reads:
  coach/health.json      kind lab rows (the one home for lab values), kind visit rows (physical, lab_review),
                         kind lab_retest rows (a clinician's own retest date: {key or "*", date, source})
  coach/lab_catalog.json groups and retest defaults (definitions only)
  coach/board.json       items this coach posted to the Project Board (a lab review booking asked of Admin)
Writes rows into coach/dashboard/coach.json through build_dashboard.py:
  lab_marker  one per lab key: latest value, lab flag, previous draw and change, every draw (hist), retest date and basis
  lab_gate    physical and clinician lab review, each open or cleared
  lab_sum     the newest panel: date, markers, lab flags, next retest

    python3 coach/tools/labs.py            print the gate, the panel summary and retests due in the next 60 days
    python3 coach/tools/labs.py morning    the check-in's Labs lines (the athlete, Nov 14, 2026, card option B "A plus the coach asks"):
        the day after a booked draw (health.json kind lab_draw {date, panel, source}) with no lab rows since, ask him to
        paste the results in any Coach chat (repeated each morning for up to 21 days); 14 days before a retest date,
        say how many retests are due and by when to book. Prints nothing when nothing is due.
"""
import json
import os
import re
import sys
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# home blood pressure and the Life's Essential 8 part scores are lab rows too, but they are not blood or urine tests
NOT_LABS = {"bp_sys", "bp_dia", "bp", "lipids", "glucose"}
FLAGGED = ("above range", "below range")
SOON_DAYS = 30


def _json(root, rel, default):
    p = os.path.join(root, rel)
    if not os.path.exists(p):
        return default
    with open(p) as fh:
        return json.load(fh)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def add_months(d, n):
    m = d.month - 1 + n
    y, m = d.year + m // 12, m % 12 + 1
    last = [31, 29 if y % 4 == 0 and (y % 100 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return date(y, m, min(d.day, last))


def flag_of(r):
    """The lab's own range flag, from a flag field or the 'lab flag: ...' part of the note; '' when the report gave none."""
    if r.get("flag"):
        return str(r["flag"]).strip().lower()
    m = re.search(r"lab flag:\s*([^;]+)", r.get("note") or "")
    return m.group(1).strip().lower() if m else ""


def name_of(r):
    n = (r.get("note") or "").split(";")[0].strip()
    return n if n and not n.lower().startswith("from the check-in") else r["key"]


def shown(r):
    if r.get("text"):
        return str(r["text"])
    v = _num(r.get("value"))
    if v is None:
        return ""
    return f"{v:g}"


def lab_rows(health):
    return [r for r in health.get("rows", []) if r.get("kind") == "lab" and r.get("key") not in NOT_LABS and r.get("date")]


def retest_for(key, last, flag, cat, overrides):
    """(date or None, basis). A clinician's date wins, then once, then the lab flag, then the panel default."""
    rt = cat.get("retest", {})
    ov = overrides.get(key) or overrides.get("*")
    if ov and ov.get("date", "") >= last.isoformat():
        return date.fromisoformat(ov["date"]), "set by " + (ov.get("source") or "a clinician")
    if key in rt.get("once", []):
        return None, rt.get("once_label", "measured once")
    if flag in FLAGGED:
        return add_months(last, int(rt.get("flagged_months", 6))), rt.get("flagged_label", "lab flag")
    return add_months(last, int(rt.get("default_months", 12))), rt.get("default_label", "yearly panel")


def build(today, root=ROOT):
    health = _json(root, "coach/health.json", {"rows": []})
    cat = _json(root, "coach/lab_catalog.json", {"groups": [], "markers": {}, "retest": {}})
    board = _json(root, "coach/board.json", {})
    gorder = {g["key"]: i for i, g in enumerate(cat.get("groups", []))}
    gname = {g["key"]: g["name"] for g in cat.get("groups", [])}
    overrides = {}
    for r in health.get("rows", []):
        if r.get("kind") == "lab_retest" and r.get("date"):
            k = r.get("key", "*")
            if k not in overrides or r["date"] > overrides[k]["date"]:
                overrides[k] = r
    by = {}
    for r in lab_rows(health):
        by.setdefault(r["key"], []).append(r)
    out = []
    for key, rs in by.items():
        rs = sorted(rs, key=lambda r: (r["date"], r.get("time", "")))
        # one point per draw date: a later row the same day replaces an earlier one
        per = {}
        for r in rs:
            per[r["date"]] = r
        draws = [per[d] for d in sorted(per)]
        cur, prev = draws[-1], (draws[-2] if len(draws) > 1 else None)
        last = date.fromisoformat(cur["date"])
        fl = flag_of(cur)
        due, basis = retest_for(key, last, fl, cat, overrides)
        v, pv = _num(cur.get("value")), (_num(prev.get("value")) if prev else None)
        if prev is None:
            change = "first"
        elif v is None or pv is None:
            change = "same" if shown(cur) == shown(prev) else "changed"
        else:
            change = "same" if abs(v - pv) < 1e-9 else ("up" if v > pv else "down")
        g = cat.get("markers", {}).get(key, "other")
        state = ""
        if due is not None:
            state = "overdue" if due < today else ("soon" if (due - today).days <= SOON_DAYS else "")
        out.append({"kind": "lab_marker", "key": key, "name": name_of(cur), "group": g, "group_name": gname.get(g, "Other"),
                    "group_order": gorder.get(g, 99), "value": v, "text": shown(cur), "unit": cur.get("unit", ""), "date": cur["date"],
                    "flag": fl, "flagged": fl in FLAGGED, "panel": cur.get("panel", ""), "source": cur.get("source", ""),
                    "prev_text": shown(prev) if prev else "", "prev_date": prev["date"] if prev else "", "change": change,
                    "draws": len(draws), "hist": [{"date": r["date"], "value": _num(r.get("value")), "text": shown(r), "flag": flag_of(r)} for r in draws],
                    "retest": due.isoformat() if due else "", "retest_basis": basis, "retest_state": state})
    out.sort(key=lambda r: (r["group_order"], not r["flagged"], r["name"].lower()))
    # the newest panel: every lab row within 7 days of the newest draw (a two-day draw is one panel)
    if out:
        newest = max(r["date"] for r in out)
        nd = date.fromisoformat(newest)
        panel = [r for r in out if (nd - date.fromisoformat(r["date"])).days <= 7]
        first = min(r["date"] for r in panel)
        dues = sorted(r["retest"] for r in out if r["retest"])
        out.append({"kind": "lab_sum", "date": newest, "first_date": first, "panel": panel[0].get("panel", ""), "markers": len(panel),
                    "flagged": sum(1 for r in panel if r["flagged"]), "flagged_names": ", ".join(r["name"] for r in panel if r["flagged"]),
                    "next_retest": dues[0] if dues else "", "next_retest_n": sum(1 for d in dues if dues and d == dues[0])})
    out.extend(gate(health, board, out))
    return out


def gate(health, board, labs):
    """Physical and clinician lab review, each cleared (a visit row on or after what it covers) or open."""
    visits = sorted([r for r in health.get("rows", []) if r.get("kind") == "visit"], key=lambda r: r.get("date", ""))
    phys = [r for r in visits if r.get("item") == "physical"]
    rows = []
    if phys:
        p = phys[-1]
        rows.append({"kind": "lab_gate", "key": "physical", "order": 1, "label": "Physical", "state": "cleared", "date": p["date"],
                     "text": p.get("text", ""), "source": p.get("source", ""), "booking": ""})
    else:
        rows.append({"kind": "lab_gate", "key": "physical", "order": 1, "label": "Physical", "state": "open", "date": "",
                     "text": "No physical on record", "source": "", "booking": booking(board, "physical")})
    s = next((r for r in labs if r.get("kind") == "lab_sum"), None)
    if s:
        rev = [r for r in visits if r.get("item") == "lab_review" and r.get("date", "") >= s["date"]]
        if rev:
            rows.append({"kind": "lab_gate", "key": "lab_review", "order": 2, "label": "Lab review with a clinician", "state": "cleared",
                         "date": rev[-1]["date"], "text": rev[-1].get("text", ""), "source": rev[-1].get("source", ""), "booking": ""})
        else:
            fl = s["flagged"]
            rows.append({"kind": "lab_gate", "key": "lab_review", "order": 2, "label": "Lab review with a clinician", "state": "open",
                         "date": s["date"], "text": (f"{fl} marker{'s' if fl != 1 else ''} outside the lab's range on the "
                                                       if fl else "No markers outside the lab's range on the ") + panel_dates(s) + " panel",
                         "source": "", "booking": booking(board, "lab-review")})
    return rows


def booking(board, ref_prefix):
    """When this coach asked Admin to book it on the Project Board (board.json posted refs), else ''."""
    hits = [p for p in (board or {}).get("posted", []) if str(p.get("ref", "")).startswith(ref_prefix)]
    return ("asked Admin " + _fd(hits[-1]["at"][:10])) if hits else ""


def panel_dates(s):
    a, b = s["first_date"], s["date"]
    if a == b:
        return _fd(b)
    return _fd(a) + " to " + (str(date.fromisoformat(b).day) if a[:7] == b[:7] else _fd(b))


def _fd(iso):
    d = date.fromisoformat(iso[:10])
    return d.strftime("%b ") + str(d.day)


ASK_DAYS = 21  # how long the "paste your results" line repeats after a draw
BOOK_DAYS = 14  # how far ahead a retest is named (the registration-watch lead time)


def morning(today, root=ROOT):
    """The check-in's Labs lines: plain words, no values (the coach does not read results)."""
    health = _json(root, "coach/health.json", {"rows": []})
    labd = sorted({r["date"] for r in lab_rows(health)})
    lines = []
    draws = sorted((r for r in health.get("rows", []) if r.get("kind") == "lab_draw" and r.get("date")), key=lambda r: r["date"])
    seen = set()
    for r in draws:
        dd = date.fromisoformat(r["date"])
        if not 1 <= (today - dd).days <= ASK_DAYS or r.get("panel", "") in seen:
            continue
        if any(x >= r["date"] for x in labd):
            continue  # results already logged on or after the draw
        seen.add(r.get("panel", ""))
        lines.append(f"Labs: your {r.get('panel') or 'lab'} draw was {_fd(r['date'])}. When the results post, paste them or drop the report in any Coach chat.")
    due = {}
    for m in [x for x in build(today, root) if x["kind"] == "lab_marker" and x["retest"]]:
        rd = date.fromisoformat(m["retest"])
        if (rd - today).days <= BOOK_DAYS:
            due.setdefault(m["retest"], []).append(m["name"])
    # retests within 7 days of each other are one draw, so one line
    groups = []
    for d in sorted(due):
        if groups and (date.fromisoformat(d) - date.fromisoformat(groups[-1][0])).days <= 7:
            groups[-1][1].extend(due[d])
        else:
            groups.append([d, list(due[d])])
    for d, names in groups:
        n = len(names)
        when = "overdue since" if date.fromisoformat(d) < today else "due from"
        lines.append(f"Labs: {n} retest{'s' if n != 1 else ''} {when} {_fd(d)}. Book a draw, then tell the coach the date.")
    return lines


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "morning":
        t = date.fromisoformat(os.environ.get("COACH_TODAY") or date.today().isoformat())
        print("\n".join(morning(t)))
        return 0
    t = date.fromisoformat(os.environ.get("COACH_TODAY") or date.today().isoformat())
    rows = build(t)
    for g in [r for r in rows if r["kind"] == "lab_gate"]:
        print(f"gate {g['label']}: {g['state']}" + (f" ({g['date']})" if g["date"] else "") + (f", {g['booking']}" if g["booking"] else "") + f". {g['text']}")
    for s in [r for r in rows if r["kind"] == "lab_sum"]:
        print(f"panel {s['panel']} {s['first_date']} to {s['date']}: {s['markers']} markers, {s['flagged']} lab flags ({s['flagged_names']}); next retest {s['next_retest']}")
    soon = [r for r in rows if r["kind"] == "lab_marker" and r["retest"] and date.fromisoformat(r["retest"]) <= t + timedelta(days=60)]
    for r in soon:
        print(f"retest {r['retest']} {r['name']} ({r['retest_basis']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
