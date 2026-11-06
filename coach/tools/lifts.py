"""Per-exercise strength history and exercise rotation between training blocks (the athlete, Oct 24, 2026).

History follows the exercise, not the slot: every set is stored in coach/strength_log.csv under the exercise id from
coach/exercises.json, so an exercise that leaves the routine for a block and comes back later is compared with its own
earlier best. Rotation rows live in coach/strength_rotation.json; the routine itself in coach/strength.json.

Usage (from the repo root):
  python3 coach/tools/lifts.py ingest <lift_log.json>     copy dashboard lift_log documents into coach/strength_log.csv
        (one row per set; a date's rows are replaced when its saved_at is newer; the JSON is a list of documents or of
        {id, data} pairs, as ArtifactData list returns them)
  python3 coach/tools/lifts.py history [date]             write coach/lift_history.json: per exercise its sessions,
        best, trend, a stall flag and, after a break of 28+ days, how the return compares with the earlier best
  python3 coach/tools/lifts.py list                       rotation rows with status
  python3 coach/tools/lifts.py due [date]                 what the run has to do about rotation today
  python3 coach/tools/lifts.py propose <block_key> [--drop EX,...]
        put the block's draft swaps to the athlete (status proposed; shown on the Lifts tab); swaps whose slot no longer holds
        the 'from' exercise are dropped and reported
  python3 coach/tools/lifts.py accept <block_key> [--only EX,...] [--by dashboard|chat]
  python3 coach/tools/lifts.py keep <block_key> [--by dashboard|chat|default]
  python3 coach/tools/lifts.py apply <block_key>          write accepted swaps into coach/strength.json (on or after the
        block start; due says when)
Deterministic. The coach decides what to propose; the athlete decides whether the routine changes.
"""
import csv
import json
import os
import sys
from datetime import date

STRENGTH = "coach/strength.json"
LIBRARY = "coach/exercises.json"
ROTATION = "coach/strength_rotation.json"
PLAN = "coach/plan.json"
LOG = "coach/strength_log.csv"
HISTORY = "coach/lift_history.json"
SUMMARY = "data/summary.csv"
BODY_COMP = "data/body_comp.csv"
LOG_FIELDS = ["date", "ex", "exercise_id", "set", "load_lb", "reps", "unit", "saved_at", "note"]
DOSE = ("name", "sets", "lo", "hi", "unit", "load", "per_side", "step", "next_hard", "extra", "legs")
GAP_DAYS = 28      # a break this long between two sessions of one exercise makes the next session a return
LEVEL_PCT = 3.0    # within this many percent of the earlier best counts as level
DUE_DAYS = 14      # proposals go to the athlete within this many days of a block start


def today():
    return os.environ.get("COACH_TODAY") or date.today().isoformat()


def read_json(path, default=None):
    if os.path.exists(path):
        return json.load(open(path))
    return default if default is not None else {"rows": []}


def write_json(path, doc):
    with open(path, "w") as fh:
        fh.write(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")


def num(v):
    try:
        return None if v in (None, "") else float(v)
    except (TypeError, ValueError):
        return None


def library():
    return {r["id"]: r for r in read_json(LIBRARY)["rows"] if r.get("kind") == "exercise"}


def routine_rows(doc=None):
    doc = doc or read_json(STRENGTH)
    routine = next((r for r in doc["rows"] if r.get("kind") == "lift_routine"), {})
    slots = [r for r in doc["rows"] if r.get("kind") == "lift_ex"]
    return routine, slots


def blocks():
    return [r for r in read_json(PLAN)["rows"] if r.get("kind") == "block"]


# ---------- ingest: dashboard lift_log documents -> strength_log.csv ----------

def read_log():
    if not os.path.exists(LOG):
        return []
    return list(csv.DictReader(open(LOG)))


def write_log(rows):
    rows = sorted(rows, key=lambda r: (r["date"], r.get("exercise_id") or "", int(r.get("set") or 0)))
    with open(LOG, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=LOG_FIELDS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def doc_rows(doc, routine, slots, lib):
    """One CSV row per set. The exercise is the document's own ids map (saved since Oct 24, 2026), else the routine's
    legacy_ids (documents saved before ids were recorded)."""
    ids = doc.get("ids") or {}
    legacy = routine.get("legacy_ids") or {}
    by_slot = {s["ex"]: s for s in slots}
    out = []
    for slot, sets in (doc.get("sets") or {}).items():
        ex_id = ids.get(slot) or legacy.get(slot) or (by_slot.get(slot) or {}).get("id") or ""
        unit = (lib.get(ex_id) or by_slot.get(slot) or {}).get("unit", "reps")
        for i, st in enumerate(sets or []):
            out.append({"date": doc["date"], "ex": slot, "exercise_id": ex_id, "set": str(i + 1),
                        "load_lb": "" if num(st.get("lb")) is None else f"{num(st['lb']):g}",
                        "reps": "" if num(st.get("reps")) is None else f"{num(st['reps']):g}",
                        "unit": unit, "saved_at": doc.get("saved_at") or "", "note": doc.get("note") or ""})
    return out


def cmd_ingest(args):
    raw = json.load(open(args[0]))
    if isinstance(raw, dict):
        raw = raw.get("docs") or raw.get("documents") or raw.get("rows") or list(raw.values())
    docs = []
    for x in raw:
        d = dict(x.get("data") or {}) if isinstance(x.get("data"), dict) else dict(x)
        d.setdefault("date", x.get("id") or x.get("doc_id"))
        if d.get("date"):
            docs.append(d)
    routine, slots = routine_rows()
    lib = library()
    rows = read_log()
    saved = {}
    for r in rows:
        saved[r["date"]] = max(saved.get(r["date"], ""), r.get("saved_at") or "")
    changed = []
    for d in docs:
        if (d.get("saved_at") or "") > saved.get(d["date"], "") or d["date"] not in saved:
            new = doc_rows(d, routine, slots, lib)
            if not new:
                continue
            rows = [r for r in rows if r["date"] != d["date"]] + new
            changed.append(d["date"])
    write_log(rows)
    print(f"strength_log.csv: {len(changed)} session(s) written" + (f" ({', '.join(sorted(changed))})" if changed else ""))
    return 0


# ---------- history: per exercise, across every block it has been in ----------

def bodyweights():
    pts = []
    for path in (SUMMARY, BODY_COMP):
        if os.path.exists(path):
            for r in csv.DictReader(open(path)):
                w = num(r.get("weight_lb"))
                if w and r.get("date"):
                    pts.append((r["date"][:10], w))
    return sorted(pts)


def bw_on(pts, d):
    best = None
    for day, w in pts:
        if day <= d:
            best = w
        else:
            break
    return best


def set_score(ex, load_lb, reps, bw):
    """A comparable number for one set. Loaded lifts: estimated 1-rep max (Epley, load x (1 + reps/30)); weighted pull-ups
    include body weight on the day; bodyweight, band and timed work: reps or seconds."""
    if reps is None:
        return None, None
    load = ex.get("load")
    if load == "lb":
        if load_lb is None:
            return None, None
        return load_lb * (1 + reps / 30), "e1rm"
    if load == "lb_added":
        if bw:
            return (bw + (load_lb or 0)) * (1 + reps / 30), "e1rm"
        return reps + (load_lb or 0) / 5, "reps"
    return reps, ("seconds" if ex.get("unit") == "s" else "reps")


def set_text(ex, load_lb, reps):
    unit = " s" if ex.get("unit") == "s" else ""
    if ex.get("load") == "lb" and load_lb is not None:
        return f"{load_lb:g}×{reps:g}{unit}"
    if ex.get("load") == "lb_added":
        return (f"+{load_lb:g}" if load_lb else "BW") + f"×{reps:g}{unit}"
    return f"{reps:g}{unit}"


def pct(a, b):
    return round(100 * a / b) if a is not None and b else None


def exercise_history(ex, rows, bw_pts, on):
    sessions = {}
    for r in rows:
        if r["date"] > on:
            continue
        lb, reps = num(r.get("load_lb")), num(r.get("reps"))
        sc, basis = set_score(ex, lb, reps, bw_on(bw_pts, r["date"]))
        if sc is None:
            continue
        cur = sessions.get(r["date"])
        if cur is None or sc > cur["score"]:
            sessions[r["date"]] = {"date": r["date"], "score": sc, "basis": basis, "set": set_text(ex, lb, reps)}
    ss = [sessions[k] for k in sorted(sessions)]
    if not ss:
        return None
    # one basis per exercise: e1rm if any session has it (body weight known), else reps
    basis = "e1rm" if any(s["basis"] == "e1rm" for s in ss) else ss[0]["basis"]
    ss = [s for s in ss if s["basis"] == basis]
    best = max(ss, key=lambda s: s["score"])
    last = ss[-1]
    trend = "new"
    if len(ss) >= 2:
        prev = max(s["score"] for s in ss[-4:-1])
        trend = "improving" if last["score"] > prev * 1.01 else ("down" if last["score"] < prev * (1 - LEVEL_PCT / 100) else "flat")
    stalled = len(ss) >= 4 and max(s["score"] for s in ss[-3:]) <= max(s["score"] for s in ss[:-3])
    gap = None
    for i in range(len(ss) - 1, 0, -1):
        days = (date.fromisoformat(ss[i]["date"]) - date.fromisoformat(ss[i - 1]["date"])).days
        if days >= GAP_DAYS:
            before, back = ss[:i], ss[i:]
            pre = max(before, key=lambda s: s["score"])
            now = max(back, key=lambda s: s["score"])
            p = pct(now["score"], pre["score"])
            status = "ahead" if p > 100 + LEVEL_PCT else ("level" if p >= 100 - LEVEL_PCT else "below")
            gap = {"days": days, "left": ss[i - 1]["date"], "back": ss[i]["date"], "sessions_back": len(back),
                   "before_best": round(pre["score"], 1), "before_best_date": pre["date"], "before_best_set": pre["set"],
                   "first_back_pct": pct(ss[i]["score"], pre["score"]), "back_pct": p, "status": status}
            break
    return {"sessions": len(ss), "first": ss[0]["date"], "last": last["date"], "basis": basis,
            "best": round(best["score"], 1), "best_date": best["date"], "best_set": best["set"],
            "last_score": round(last["score"], 1), "last_set": last["set"], "trend": trend, "stalled": stalled, "gap": gap,
            "recent": [{"date": s["date"], "score": round(s["score"], 1), "set": s["set"]} for s in ss[-6:]]}


def fdate(d):
    x = date.fromisoformat(d)
    return x.strftime("%b ") + str(x.day)


def note_for(h):
    if not h:
        return "Not logged yet."
    g = h.get("gap")
    if g and g["sessions_back"] <= 6:
        weeks = round(g["days"] / 7)
        word = {"ahead": "already past", "level": "level with", "below": "below"}[g["status"]]
        return (f"Back after {weeks} weeks: {g['back_pct']}% of the earlier best ({g['before_best_set']}, {fdate(g['before_best_date'])}), "
                f"{word} it after {g['sessions_back']} session{'s' if g['sessions_back'] != 1 else ''}.")
    if h["stalled"]:
        return f"Stalled: no new best in 3 sessions (best {h['best_set']}, {fdate(h['best_date'])})."
    t = {"new": "first session", "improving": "improving", "flat": "holding", "down": "down on the last few"}[h["trend"]]
    return f"{h['sessions']} session{'s' if h['sessions'] != 1 else ''}, {t}; best {h['best_set']} ({fdate(h['best_date'])})."


def cmd_history(args):
    on = args[0] if args else today()
    lib = library()
    routine, slots = routine_rows()
    in_slot = {s["id"]: s["ex"] for s in slots if s.get("id")}
    rows = read_log()
    bw_pts = bodyweights()
    out = []
    ids = list(lib) + sorted({r.get("exercise_id") for r in rows if r.get("exercise_id") and r["exercise_id"] not in lib})
    for ex_id in ids:
        ex = lib.get(ex_id) or next((s for s in slots if s.get("id") == ex_id), {"name": ex_id, "load": "lb"})
        mine = [r for r in rows if r.get("exercise_id") == ex_id]
        h = exercise_history(ex, mine, bw_pts, on)
        if h is None and ex_id not in in_slot:
            continue
        row = {"kind": "lift_hist", "id": ex_id, "name": ex.get("name", ex_id), "pattern": ex.get("pattern"), "slot": in_slot.get(ex_id)}
        row.update(h or {"sessions": 0})
        row["note"] = note_for(h)
        out.append(row)
    write_json(HISTORY, {"about": "Per-exercise strength history, built by coach/tools/lifts.py history from coach/strength_log.csv; never edit by hand. "
                         "score basis: e1rm = estimated 1-rep max in lb (Epley; weighted pull-ups include the day's body weight), reps or seconds for bodyweight, band and timed work. "
                         "trend compares the last session with the best of the 3 before it (improving above +1%, down below -3%). stalled = no new best in the last 3 sessions. "
                         f"gap = the latest break of {GAP_DAYS}+ days and how the return compares with the best before it (level = within {LEVEL_PCT:g}%).",
                         "as_of": on, "rows": out})
    logged = [r for r in out if r["sessions"]]
    print(f"lift_history.json: {len(out)} exercises, {len(logged)} with sessions")
    for r in logged:
        print(f"  {r['slot'] or '--':<3} {r['name']}: {r['note']}")
    return 0


# ---------- rotation ----------

def rot_doc():
    return read_json(ROTATION)


def find_rot(doc, block_key):
    return next((r for r in doc["rows"] if r.get("kind") == "lift_rotation" and r["block_key"] == block_key), None)


def block(block_key):
    return next((b for b in blocks() if b["key"] == block_key), None)


def opt(args, flag, default=None):
    return args[args.index(flag) + 1] if flag in args else default


def cmd_list(args):
    doc = rot_doc()
    starts = {b["key"]: b["start"] for b in blocks()}
    for r in sorted(doc["rows"], key=lambda r: starts.get(r["block_key"], "")):
        sw = "; ".join(f"{s['ex']} {s['from']} → {s['to']}" for s in r.get("swaps", []))
        print(f"{r['block_key']:<22} starts {starts.get(r['block_key'], '?')}  status={r['status']:<9} {sw}")
    return 0


def cmd_due(args):
    t = date.fromisoformat(args[0]) if args else date.fromisoformat(today())
    doc = rot_doc()
    _, slots = routine_rows()
    cur = {s["ex"]: s.get("id") for s in slots}
    out = []
    for r in doc["rows"]:
        b = block(r["block_key"])
        if not b:
            continue
        days = (date.fromisoformat(b["start"]) - t).days
        label = b.get("label", b["key"])
        if r["status"] == "draft" and 0 <= days <= DUE_DAYS:
            out.append(f"{label} starts {b['start']} ({days} days): check the draft swaps against lift_history.json "
                       f"(a lift still improving and on goal can stay; one stalled 3 sessions or painful can be added), then lifts.py propose {r['block_key']}")
        elif r["status"] == "draft" and days < 0:
            out.append(f"{label} started {b['start']} and its draft was never proposed: leave the routine as it is (lifts.py keep {r['block_key']} --by default)")
        if r["status"] == "proposed" and days <= 0:
            out.append(f"{label} started {b['start']} with no answer: the routine stays as it is (lifts.py keep {r['block_key']} --by default) and the check-in says so once")
        elif r["status"] == "proposed":
            out.append(f"{label} starts {b['start']} ({days} days): proposal waiting on the athlete (Lifts tab card, or one chat question when he is present)")
        if r["status"] == "accepted" and days <= 0:
            pending = [s for s in r.get("chosen", r.get("swaps", [])) if cur.get(s["ex"]) != s["to"]]
            if pending:
                out.append(f"{label} started {b['start']}: apply the accepted swaps (lifts.py apply {r['block_key']}) and name them in the check-in")
    print("\n".join(out) if out else "nothing due")
    return 0


def cmd_propose(args):
    key = args[0]
    doc = rot_doc()
    r = find_rot(doc, key)
    if r is None:
        print("no rotation row for that block"); return 1
    if r["status"] not in ("draft", "proposed"):
        print(f"block already {r['status']}"); return 1
    drop = set((opt(args, "--drop", "") or "").split(",")) - {""}
    _, slots = routine_rows()
    cur = {s["ex"]: s.get("id") for s in slots}
    lib = library()
    keep, dropped = [], []
    for s in r.get("swaps", []):
        if s["ex"] in drop:
            dropped.append(f"{s['ex']} (coach dropped it)")
        elif cur.get(s["ex"]) != s["from"]:
            dropped.append(f"{s['ex']} (slot now holds {cur.get(s['ex'])}, not {s['from']})")
        elif s["to"] not in lib:
            dropped.append(f"{s['ex']} ({s['to']} is not in exercises.json)")
        else:
            keep.append(s)
    if dropped:
        r.setdefault("dropped", []).extend(dropped)
    r["swaps"] = keep
    if not keep:
        r["status"], r["decided_on"], r["by"] = "kept", today(), "no swaps left"
        write_json(ROTATION, doc)
        print(f"{key}: no swaps left after checks ({'; '.join(dropped)}); routine stays as it is")
        return 0
    r["status"], r["proposed_on"] = "proposed", today()
    write_json(ROTATION, doc)
    print(f"{key}: proposed " + "; ".join(f"{s['ex']} {lib[s['from']]['name'] if s['from'] in lib else s['from']} → {lib[s['to']]['name']}" for s in keep)
          + (f" (dropped: {'; '.join(dropped)})" if dropped else ""))
    return 0


def cmd_accept(args):
    key = args[0]
    doc = rot_doc()
    r = find_rot(doc, key)
    if r is None or r["status"] not in ("proposed", "draft"):
        print("nothing to accept: propose first" if r else "no rotation row for that block"); return 1
    only = set((opt(args, "--only", "") or "").split(",")) - {""}
    chosen = [s for s in r["swaps"] if not only or s["ex"] in only]
    if not chosen:
        print("--only matched no swap"); return 1
    r["status"], r["decided_on"], r["by"], r["chosen"] = "accepted", today(), opt(args, "--by", "chat"), chosen
    write_json(ROTATION, doc)
    print(f"{key}: accepted {', '.join(s['ex'] for s in chosen)}; applied on the first run on or after the block start")
    return 0


def cmd_keep(args):
    key = args[0]
    doc = rot_doc()
    r = find_rot(doc, key)
    if r is None:
        print("no rotation row for that block"); return 1
    if r["status"] == "applied":
        print("already applied: a change back is a new rotation row"); return 1
    r["status"], r["decided_on"], r["by"] = "kept", today(), opt(args, "--by", "chat")
    r.pop("chosen", None)
    write_json(ROTATION, doc)
    print(f"{key}: kept; the routine stays as it is")
    return 0


def cmd_apply(args):
    key = args[0]
    doc = rot_doc()
    r = find_rot(doc, key)
    if r is None or r["status"] != "accepted":
        print("only an accepted rotation can be applied"); return 1
    b = block(key)
    if b and today() < b["start"] and "--now" not in args:
        print(f"block starts {b['start']}: apply on or after that date (or --now if the athlete asked to start early)"); return 1
    lib = library()
    sdoc = read_json(STRENGTH)
    applied = []
    for s in r["chosen"]:
        row = next((x for x in sdoc["rows"] if x.get("kind") == "lift_ex" and x["ex"] == s["ex"]), None)
        if row is None or row.get("id") != s["from"]:
            print(f"slot {s['ex']} no longer holds {s['from']}: skipped"); continue
        ex = lib[s["to"]]
        for k in DOSE:
            row.pop(k, None)
        new = {}
        for k, v in row.items():
            new[k] = v
            if k == "id":
                new["id"] = s["to"]
                for d in DOSE:
                    if d in ex:
                        new[d] = ex[d]
        row.clear(); row.update(new)
        applied.append(f"{s['ex']} {lib.get(s['from'], {}).get('name', s['from'])} → {ex['name']}")
    write_json(STRENGTH, sdoc)
    r["status"], r["applied_on"] = "applied", today()
    write_json(ROTATION, doc)
    print(f"{key}: applied " + "; ".join(applied))
    return 0


def proposal_rows():
    """Rows for coach.json (the Lifts tab card): proposed rotations with names, reasons and each incoming exercise's history."""
    lib = library()
    hist = {r["id"]: r for r in read_json(HISTORY)["rows"]}
    out = []
    for r in rot_doc()["rows"]:
        if r.get("kind") != "lift_rotation" or r["status"] not in ("proposed", "accepted", "kept", "applied"):
            continue
        b = block(r["block_key"]) or {}
        swaps = []
        for s in r.get("chosen") or r.get("swaps", []):
            swaps.append({"ex": s["ex"], "from": s["from"], "to": s["to"], "why": s.get("why", ""),
                          "from_name": lib.get(s["from"], {}).get("name", s["from"]), "to_name": lib.get(s["to"], {}).get("name", s["to"]),
                          "to_note": (hist.get(s["to"]) or {}).get("note", "Not logged yet."), "from_note": (hist.get(s["from"]) or {}).get("note", "")})
        out.append({"kind": "lift_proposal", "block_key": r["block_key"], "block": b.get("label", r["block_key"]), "block_name": b.get("name", ""),
                    "start": b.get("start"), "focus": r.get("focus", ""), "status": r["status"], "decided_on": r.get("decided_on"), "swaps": swaps})
    return out


if __name__ == "__main__":
    cmds = {"ingest": cmd_ingest, "history": cmd_history, "list": cmd_list, "due": cmd_due, "propose": cmd_propose,
            "accept": cmd_accept, "keep": cmd_keep, "apply": cmd_apply}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(2)
    sys.exit(cmds[sys.argv[1]](sys.argv[2:]))
