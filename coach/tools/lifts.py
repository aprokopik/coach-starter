"""Per-exercise strength history and exercise rotation between training blocks (the athlete, Oct 24, 2026).

History follows the exercise, not the slot: every set is stored in coach/strength_log.csv under the exercise id from
coach/exercises.json, so an exercise that leaves the routine for a block and comes back later is compared with its own
earlier best. Rotation rows live in coach/strength_rotation.json; the routine itself in coach/strength.json.

Usage (from the repo root):
  python3 coach/tools/lifts.py ingest <lift_log.json>     copy dashboard lift_log documents into coach/strength_log.csv
  python3 coach/tools/lifts.py mine <lift_mine.json>     copy routines made on the dashboard into coach/my_routines.json
  python3 coach/tools/lifts.py asks <lift_ask.json>      Tell the coach requests still waiting for a routine (exit 1: none)
        (one row per set; a date's rows are replaced when its saved_at is newer; the JSON is a list of documents or of
        {id, data} pairs, as ArtifactData list returns them)
  python3 coach/tools/lifts.py history [date]             write coach/lift_history.json: per exercise its sessions,
        best, trend, a stall flag and, after a break of 28+ days, how the return compares with the earlier best
  python3 coach/tools/lifts.py library [--have a,b,...]   the exercise library by movement; with --have, what fits that equipment
  python3 coach/tools/lifts.py start <id,id,...> [--per-week N] [--minutes M] [--name NAME]
                                                          a first routine for a coach that has none (after the athlete's yes)
  python3 coach/tools/lifts.py start --kit bodyweight,bands,dumbbells,gym [--per-week N] [--minutes M] [--style upper_lower|ppl]
                                                          the starter routine for that kit (onboarding card 4); --routine ID names one
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
from datetime import date, timedelta

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


# ---------- plan: a library or own routine that can run for one day ("Use today", 6.130.0) ----------

DOSE = ("name", "sets", "lo", "hi", "unit", "load", "per_side", "step", "next_hard", "extra", "legs")


def plan_rows(row, lib=None):
    """A lift_lib row's plan (a list of {block, id, and any dose field to override}) as the page's session rows: the slot is
    the exercise id, so history follows the exercise across routines. blocks come from the row or one Main block.
    Returns (ex_rows, blocks); ([], []) when the row has no plan or names an exercise the library does not have."""
    plan = row.get("plan") or []
    lib = lib if lib is not None else library()
    if not plan or any(p.get("id") not in lib for p in plan):
        return [], []
    blocks = row.get("blocks") or [{"block": "1", "label": "Main", "note": "in order, about a minute between sets"}]
    out = []
    for n, p in enumerate(plan):
        e = lib[p["id"]]
        r = {"ex": p["id"], "id": p["id"], "block": p.get("block") or blocks[0]["block"], "order": n, "busy": n < 4}
        r.update({k: e[k] for k in DOSE if k in e})
        r.update({k: p[k] for k in DOSE if k in p})
        out.append(r)
    return out, [{"block": b["block"], "order": i, "label": b.get("label", ""), "note": b.get("note", "")} for i, b in enumerate(blocks)]


def resolve_plans(rows, mine_ids=()):
    """build_dashboard: each lift_lib row with a plan gets plan_ex (exercise id, block and only the dose fields it
    changes) and plan_blocks; the page fills the rest from the lift_xlib rows (one per library exercise, also the list
    Make your own picks from). A plan naming an exercise the library lacks is dropped. Rows from my_routines.json get
    mine: true (the Made by you shelf)."""
    lib = library()
    for r in rows:
        if r.get("kind") != "lift_lib":
            continue
        if r.get("id") in mine_ids:
            r["mine"] = True
        if r.get("plan"):
            ex, bl = plan_rows(r, lib)
            plan = r.pop("plan"); r.pop("blocks", None)
            if ex:
                r["plan_ex"] = [{"id": p["id"], "block": e["block"], **{k: p[k] for k in DOSE if k in p}} for p, e in zip(plan, ex)]
                r["plan_blocks"] = bl
    keep = ("id", "name", "pattern", "sets", "lo", "hi", "unit", "load", "per_side", "step", "next_hard", "extra", "legs", "how")
    for e in lib.values():
        rows.append({"kind": "lift_xlib", **{k: e[k] for k in keep if k in e}, "needs": ", ".join(e.get("needs") or [])})
    return rows


MINE = "coach/my_routines.json"


def _docs(path):
    raw = json.load(open(path))
    if isinstance(raw, dict):
        raw = raw.get("docs") or raw.get("documents") or raw.get("rows") or [dict(v, id=k) for k, v in raw.items()]
    out = []
    for x in raw:
        d = dict(x.get("data") or {}) if isinstance(x.get("data"), dict) else dict(x)
        d["id"] = x.get("id") or x.get("doc_id") or d.get("id")
        for k, v in list(d.items()):
            if isinstance(v, str) and v.strip()[:1] in "[{":
                try:
                    d[k] = json.loads(v)
                except ValueError:
                    pass
        out.append(d)
    return out


def cmd_mine(args):
    """Copy routines made on the dashboard (store lift_mine: picked lift by lift, or saved from another) into
    coach/my_routines.json under the same id, so the data keeps them; a lift the library lacks is left out and named."""
    if not args:
        print("usage: lifts.py mine <lift_mine.json>"); return 2
    lib, doc = library(), read_json(MINE, {"rows": []})
    have = {r.get("id") for r in doc.get("rows", [])}
    added = []
    for d in _docs(args[0]):
        if not d.get("id") or d["id"] in have or d.get("hidden"):
            continue
        plan = [p for p in (d.get("plan") or []) if isinstance(p, dict) and p.get("id") in lib]
        if not plan:
            continue
        row = {"kind": "lift_lib", "id": d["id"], "order": 50 + len(have), "name": d.get("name") or "My routine", "needs": d.get("needs") or "",
               "minutes": d.get("minutes") or 20, "per_week": 2, "best_for": "Made on the dashboard" + (f" from {d['from']}" if d.get("from") else ""),
               "lifts": "; ".join(p.get("name") or lib[p["id"]]["name"] for p in plan), "plan": plan}
        doc.setdefault("rows", []).append(row); have.add(d["id"]); added.append(row["name"])
    if added:
        write_json(MINE, doc)
    print(f"Added {len(added)}: {', '.join(added)}" if added else "Nothing new.")
    return 0


def cmd_asks(args):
    """Tell the coach requests (store lift_ask) not yet answered: a my_routines.json row with ask = the request id
    answers it. Exit 1 when none is waiting."""
    if not args:
        print("usage: lifts.py asks <lift_ask.json>"); return 2
    done = {r.get("ask") for r in read_json(MINE, {"rows": []}).get("rows", [])}
    wait = [d for d in _docs(args[0]) if d.get("id") and d["id"] not in done and d.get("date", "") >= today()]
    for d in wait:
        print(f"{d['id']}  for {d.get('date')}: {d.get('text', '')}")
    return 0 if wait else 1


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
            "recent": [{"date": s["date"], "score": round(s["score"], 1), "set": s["set"]} for s in ss[-6:]],
            # every session of the last year, "date score|...", for the per lift chart on the Lifts tab (Strength progress, 6.88.0)
            "series": "|".join(f"{s['date']} {s['score']:.1f}" for s in ss if s["date"] > (date.fromisoformat(on) - timedelta(days=365)).isoformat()),
            "status": status_word(trend, stalled, gap, len(ss))}


def status_word(trend, stalled, gap, n):
    """One plain word per lift for the Strength progress card: new, back (returning after a break, still below its earlier
    best), stalled (no new best in 3 sessions), down, holding or progressing. Same thresholds as trend and stalled."""
    if n < 2:
        return "new"
    if gap and gap["sessions_back"] <= 6 and gap["status"] == "below":
        return "back"
    if stalled:
        return "stalled"
    return {"improving": "progressing", "flat": "holding", "down": "down"}.get(trend, "new")


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
                         f"gap = the latest break of {GAP_DAYS}+ days and how the return compares with the best before it (level = within {LEVEL_PCT:g}%). "
                         "series = every session of the last year (date score), status = one word for the Strength progress card. "
                         "Sessions per week live in the outcome_week rows (coach/tools/outcomes.py), not here.",
                         "as_of": on, "rows": out})
    logged = [r for r in out if r.get("sessions")]
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
            pending = [s for s in r.get("chosen", r.get("swaps", [])) if cur.get(s["ex"]) != s["to"]] + r.get("sets", [])
            if pending:
                out.append(f"{label} started {b['start']}: apply the accepted swaps (lifts.py apply {r['block_key']}) and name them in the check-in")
    out += [f"{x}: lifts.py raise {ex}" for ex, x in raises_due(slots)]
    print("\n".join(out) if out else "nothing due")
    return 0


def raises_due(slots):
    """Slots whose waiting set raise (sets_up) has its logged sessions since it was set: [(ex, line)]."""
    hist = {r["id"]: r for r in read_json(HISTORY, {"rows": []}).get("rows", [])}
    out = []
    for s in slots:
        up = s.get("sets_up")
        if isinstance(up, str):
            up = json.loads(up)
        if not up:
            continue
        days = [x.split(" ")[0] for x in str((hist.get(s.get("id")) or {}).get("series") or "").split("|") if x]
        n = sum(1 for d in days if d >= up.get("from", ""))
        if n >= up["after"]:
            out.append((s["ex"], f"{s.get('name', s['ex'])} has {n} logged sessions since {up.get('from')}: raise it to {up['to']} sets and name it in the check-in"))
    return out


def cmd_raise(args):
    """Apply a waiting set raise once its logged sessions are in (lifts.py due names it)."""
    sdoc = read_json(STRENGTH)
    row = next((x for x in sdoc["rows"] if x.get("kind") == "lift_ex" and x["ex"] == args[0]), None)
    if row is None or not row.get("sets_up"):
        print("no waiting set raise for that slot"); return 1
    up = row.pop("sets_up")
    up = json.loads(up) if isinstance(up, str) else up
    row["sets"] = up["to"]
    write_json(STRENGTH, sdoc)
    print(f"{args[0]} {row.get('name', args[0])}: now {up['to']} sets")
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
    if not chosen and not r.get("sets"):
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
    # set changes (6.109.0, the athlete's Dec 21 plan): "sets" items raise a slot's sets now, or once it has `after` logged sessions
    for c in r.get("sets", []):
        row = next((x for x in sdoc["rows"] if x.get("kind") == "lift_ex" and x["ex"] == c["ex"]), None)
        if row is None:
            print(f"slot {c['ex']} is gone: set change skipped"); continue
        if c.get("after"):
            row["sets_up"] = {"to": c["to"], "after": c["after"], "from": today()}
            applied.append(f"{c['ex']} {row.get('name', c['ex'])} to {c['to']} sets after {c['after']} logged sessions")
        else:
            row["sets"] = c["to"]
            applied.append(f"{c['ex']} {row.get('name', c['ex'])} to {c['to']} sets")
    # row edits (6.142.0, the athlete's calf card Nov 17, 2026): in order, {match, set, drop} changes the one row whose fields equal
    # match; {add} inserts a row unless that slot is already there
    for c in r.get("edits", []):
        if "add" in c:
            a = c["add"]
            if any(x.get("kind") == a.get("kind") and x.get("ex") == a.get("ex") and x.get("routine") == a.get("routine") for x in sdoc["rows"]):
                print(f"slot {a.get('ex')} is taken: add skipped"); continue
            last = max((i for i, x in enumerate(sdoc["rows"]) if x.get("kind") == a.get("kind")), default=len(sdoc["rows"]) - 1)
            sdoc["rows"].insert(last + 1, dict(a))
            applied.append(f"added {a.get('ex', '')} {a.get('name', a.get('id', ''))}".strip())
            continue
        hits = [x for x in sdoc["rows"] if all(x.get(k) == v for k, v in c["match"].items())]
        if len(hits) != 1:
            print(f"edit {c['match']}: {len(hits)} rows match, skipped"); continue
        for k in c.get("drop", []):
            hits[0].pop(k, None)
        hits[0].update(c.get("set", {}))
        applied.append(f"{c['match'].get('ex') or c['match'].get('block') or c['match'].get('label')} edited")
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
        names = {x.get("ex"): x.get("name", x.get("ex")) for x in read_json(STRENGTH, {"rows": []}).get("rows", []) if x.get("kind") == "lift_ex"}
        for c in r.get("sets", []):
            swaps.append({"ex": c["ex"], "from": "", "to": "", "why": c.get("why", ""), "from_name": names.get(c["ex"], c["ex"]),
                          "to_name": f"{c['to']} sets" + (f" after {c['after']} logged sessions" if c.get("after") else ""), "to_note": "", "from_note": ""})
        for c in r.get("edits", []):
            if "add" in c:
                a = c["add"]
                swaps.append({"ex": a.get("ex", ""), "from": "", "to": a.get("id", ""), "why": c.get("why", ""), "from_name": "New",
                              "to_name": a.get("name", a.get("id", "")), "to_note": "", "from_note": ""})
            elif c.get("why") and c["match"].get("kind") == "lift_ex":
                ex = c["match"].get("ex", "")
                swaps.append({"ex": ex, "from": "", "to": "", "why": c["why"], "from_name": names.get(ex, ex),
                              "to_name": c.get("set", {}).get("name") or (f"moves to {c['set']['ex']}" if "ex" in c.get("set", {}) else "changed"), "to_note": "", "from_note": ""})
        out.append({"kind": "lift_proposal", "block_key": r["block_key"], "block": b.get("label", r["block_key"]), "block_name": b.get("name", ""),
                    "start": b.get("start"), "focus": r.get("focus", ""), "status": r["status"], "decided_on": r.get("decided_on"), "swaps": swaps})
    return out


# ---------- a first routine for a coach that has none (kit, 6.55.0) ----------

def _have(args):
    return {x.strip().lower() for x in args[args.index("--have") + 1].split(",") if x.strip()} if "--have" in args else None


def cmd_library(args):
    """The exercise library by movement pattern; with --have, which ones fit that equipment and which patterns have none."""
    have, by = _have(args), {}
    for r in library().values():
        by.setdefault(r["pattern"], []).append(r)
    for pat, rows in by.items():
        fits = [r for r in rows if have is None or set(r.get("needs", [])) <= have]
        print(f"{pat}:" + ("" if fits else "  NOTHING FITS; pick the closest and say so, or add a library row with its own id first"))
        for r in rows:
            ok = "   " if have is None else ("fit" if r in fits else " - ")
            print(f"  {ok} {r['id']:<20} {r['name']}  ({r['sets']} x {r['lo']}-{r['hi']} {r['unit']}; needs {', '.join(r.get('needs', [])) or 'nothing'})")
    return 0


KIT_STARTER = (("gym", "gym_bb"), ("dumbbells", "kettlebell"), ("bands", "bands"), ("bodyweight", "home_bw"))  # best kit first


def starter_for(kit):
    """The starter routine (coach/routines.json id) for the kit ticked at onboarding (answers.json lifting.kit: bodyweight,
    bands, dumbbells, gym): the one that uses the most kit they have. None when nothing was ticked."""
    kit = {str(k).strip().lower() for k in kit or []}
    return next((rid for k, rid in KIT_STARTER if k in kit), None)


# Splits at setup (onboarding card 4, "How do you like to lift?"; the athlete approved the setup card Nov 17, 2026, and splits as
# rotation A in 6.142.0): the starter's own lifts go to Upper body and Lower body days by movement pattern, core on both,
# and each split lift gets twice its sets (at most 4) so the week's work matches the full body routine at the same days a
# week (volume, not how often a muscle is trained, drives the gain when the work is equal). Push, pull, legs starts as upper
# and lower: a starter routine has one push and one pull, too few for a day each.
SPLIT_UPPER, SPLIT_LOWER, SPLIT_BOTH = {"push", "pull", "shoulder"}, {"squat", "hinge", "calf", "single_leg_warmup"}, {"core"}
SPLIT_STYLES = ("upper_lower", "ppl")


def split_days(rows, lib):
    """The lift_routine `days` for an upper and lower split of these lift_ex rows; None when either day would be empty."""
    pat = lambda r: (lib.get(r["id"]) or {}).get("pattern", "")
    up = [r["ex"] for r in rows if pat(r) in SPLIT_UPPER | SPLIT_BOTH]
    lo = [r["ex"] for r in rows if pat(r) in SPLIT_LOWER | SPLIT_BOTH or pat(r) not in SPLIT_UPPER | SPLIT_BOTH]
    if not any(pat(r) in SPLIT_UPPER for r in rows) or not any(pat(r) in SPLIT_LOWER for r in rows):
        return None
    return [{"key": "upper", "label": "Upper body", "ex": up}, {"key": "lower", "label": "Lower body", "ex": lo}]


def start_from_routine(rid, per_week, minutes, replace=False, style=None):
    """Write a starter routine from coach/routines.json into coach/strength.json as the routine the person is on: its own
    plan, blocks and name, under its own id so the Routine picker marks it. Slots are numbered by block (1a, 1b, 2a).
    style upper_lower or ppl splits it into Upper body and Lower body days (split_days)."""
    doc, lib = read_json(STRENGTH), library()
    if any(r.get("kind") == "lift_routine" for r in doc.get("rows", [])) and not replace:
        print("There is a routine already. Exercises change through the rotation (lifts.py propose); --replace starts over."); return 1
    row = next((r for r in read_json("coach/routines.json", {"rows": []}).get("rows", []) if r.get("kind") == "lift_lib" and r.get("id") == rid), None)
    ex, bl = plan_rows(row, lib) if row else ([], [])
    if not ex:
        print(f"Not written: no starter routine '{rid}' with a plan in coach/routines.json"); return 1
    per_week, minutes = int(per_week or row.get("per_week") or 2), int(minutes or row.get("minutes") or 25)
    rows = [{"kind": "lift_routine", "routine": rid, "name": row["name"], "subtitle": row.get("best_for") or "Built around what you have",
             "per_week": per_week, "minutes": minutes, "busy_minutes": row.get("busy_minutes") or 15, "days": None,
             "rir": "stop with 1\u20132 reps left", "from": today(), "when": f"Any {per_week} days that fit", "legacy_ids": {}}]
    rows += [{"kind": "lift_block", "routine": rid, **b} for b in bl]
    seen = {}
    for e in ex:
        n = seen.get(e["block"], 0); seen[e["block"]] = n + 1
        slot = e["block"] if e["block"] == "W" and n == 0 else e["block"] + "abcdefghi"[n]
        rows.append({"kind": "lift_ex", "routine": rid, **e, "ex": slot})
    days = split_days([r for r in rows if r["kind"] == "lift_ex"], lib) if style in SPLIT_STYLES else None
    if days:
        both = set(days[0]["ex"]) & set(days[1]["ex"])
        for r in rows:
            if r["kind"] == "lift_ex" and r["ex"] not in both and (lib.get(r["id"]) or {}).get("pattern") != "single_leg_warmup":
                r["sets"] = min(4, 2 * int(r.get("sets") or 2))
        rows[0].update({"days": days, "when": f"Upper and lower take turns, any {per_week} days that fit"})
    elif style in SPLIT_STYLES:
        print("This starter has no upper and lower lifts to split: it runs full body.")
    rules = [("Progress", "Top of the range on every set: add load, or move to the next harder version, next time.", False),
             ("Timing", (f"Upper body and Lower body take turns on any {per_week} days that fit; " if days else f"Any {per_week} days that fit your week; ")
              + "hard leg work at least 48 h before a long or key session.", False),
             (f"Busy week ({rows[0]['busy_minutes']} min)", "The first four lifts.", False),
             ("Stop signals", "Pain that is sharp, one-sided or changes how you move: stop that lift and tell your coach.", True)]
    for n, (label, text, warn) in enumerate(rules, 1):
        rows.append({"kind": "lift_rule", "routine": rid, "order": n, "label": label, "text": text, **({"warn": True} if warn else {})})
    doc["rows"] = rows
    write_json(STRENGTH, doc)
    print(f"Wrote {row['name']} ({len(ex)} lifts, {per_week} a week, {minutes} min{', as Upper body and Lower body days' if days else ''}) to {STRENGTH}. It shows on the Lifts tab after the next dashboard rebuild.")
    return 0


def cmd_start(args):
    """Write a first routine into coach/strength.json: from library ids in the order given, or a starter routine by id
    (--routine) or by the kit ticked at onboarding (--kit). Only after the athlete says yes."""
    opt = lambda k, dflt: args[args.index(k) + 1] if k in args else dflt
    if "--routine" in args or "--kit" in args:
        rid = opt("--routine", None) or starter_for(opt("--kit", "").split(","))
        if not rid:
            print("Not written: --kit names none of bodyweight, bands, dumbbells, gym"); return 1
        st = opt("--style", None)
        if st not in (None, "full_body", *SPLIT_STYLES):
            print("Not written: --style is full_body, upper_lower or ppl"); return 1
        return start_from_routine(rid, opt("--per-week", None), opt("--minutes", None), "--replace" in args, st)
    if not args or args[0].startswith("--"):
        print("usage: lifts.py start <id,id,...> | --kit bodyweight,bands,dumbbells,gym | --routine ID  [--per-week N] [--minutes M] [--style full_body|upper_lower|ppl] [--name NAME] [--replace]"); return 2
    doc, lib = read_json(STRENGTH), library()
    if any(r.get("kind") == "lift_routine" for r in doc.get("rows", [])) and "--replace" not in args:
        print("There is a routine already. Exercises change through the rotation (lifts.py propose); --replace starts over."); return 1
    ids = [x.strip() for x in args[0].split(",") if x.strip()]
    bad = [i for i in ids if i not in lib]
    if bad or len(set(ids)) != len(ids) or not 3 <= len(ids) <= 9:
        print(f"Not written: unknown ids {bad}" if bad else "Not written: give 3 to 9 different exercise ids"); return 1
    per_week, minutes = int(opt("--per-week", 2)), int(opt("--minutes", 25))
    warm = [i for i in ids if lib[i]["pattern"] == "single_leg_warmup"][:1]
    main = [i for i in ids if i not in warm]
    rows = [{"kind": "lift_routine", "routine": "start", "name": opt("--name", "Strength routine"), "subtitle": "Built around what you have",
             "per_week": per_week, "minutes": minutes, "busy_minutes": 15, "days": None, "rir": "stop with 1\u20132 reps left",
             "from": today(), "when": f"Any {per_week} days that fit", "legacy_ids": {}}]
    if warm:
        rows.append({"kind": "lift_block", "routine": "start", "block": "W", "order": 0, "label": "Warm-up", "note": "easy, to get moving"})
    rows.append({"kind": "lift_block", "routine": "start", "block": "1", "order": 1, "label": "Main", "note": "in order, about a minute between sets"})
    slots = [("W", "W", i) for i in warm] + [("1", "1" + "abcdefghi"[n], i) for n, i in enumerate(main)]
    for order, (blk, ex, i) in enumerate(slots):
        e = lib[i]
        row = {"kind": "lift_ex", "routine": "start", "ex": ex, "id": i, "block": blk, "order": order, "busy": order < 4}
        row.update({k: e[k] for k in ("name", "sets", "lo", "hi", "unit", "load", "per_side", "step", "next_hard", "extra", "legs") if k in e})
        rows.append(row)
    rules = [("Progress", "Top of the range on every set: add load, or move to the next harder version, next time.", False),
             ("Timing", f"Any {per_week} days that fit your week; hard leg work at least 48 h before a long or key session.", False),
             ("Busy week (15 min)", "The first four lifts.", False),
             ("Stop signals", "Pain that is sharp, one-sided or changes how you move: stop that lift and tell your coach.", True)]
    for n, (label, text, warn) in enumerate(rules, 1):
        rows.append({"kind": "lift_rule", "routine": "start", "order": n, "label": label, "text": text, **({"warn": True} if warn else {})})
    doc["rows"] = rows
    write_json(STRENGTH, doc)
    print(f"Wrote a {len(ids)} lift routine, {per_week} a week, to {STRENGTH}. It shows on the Lifts tab after the next dashboard rebuild.")
    return 0


if __name__ == "__main__":
    cmds = {"mine": cmd_mine, "asks": cmd_asks, "library": cmd_library, "start": cmd_start, "ingest": cmd_ingest, "history": cmd_history, "list": cmd_list, "due": cmd_due, "propose": cmd_propose,
            "accept": cmd_accept, "keep": cmd_keep, "apply": cmd_apply, "raise": cmd_raise}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(2)
    sys.exit(cmds[sys.argv[1]](sys.argv[2:]))
