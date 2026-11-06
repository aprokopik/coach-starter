"""Block goal rows for coach/levels.json (coach/engine/LEVELS.md section 3). Deterministic; the coach decides the numbers.

Usage (from the repo root):
  python3 coach/tools/levels.py list [key]                       rows by block, with status
  python3 coach/tools/levels.py init <key> [--unit U] [--better 1|-1]
        one row per plan.json block that has none yet: hold for Taper and Recover blocks, provisional for the rest
  python3 coach/tools/levels.py propose <key> <block_key> --target T --strong S [--baseline B] [--note ...]
        a proposal for the athlete (status proposed, set_on today); replaces a provisional row for that block
  python3 coach/tools/levels.py set <key> <block_key> [--target T --strong S --baseline B] [--note ...]
        the athlete confirmed (status set, confirmed_on today); numbers given here override the proposal
  python3 coach/tools/levels.py close <key> <block_key> --outcome "..." [--note ...]
        the block ended: record the level reached; the row stays as history
  python3 coach/tools/levels.py due [date]                       what needs doing on that date (blocks starting within 14 days,
        proposals older than 3 days, blocks that ended without an outcome)
Rows are never deleted; a corrected line is a new row and the old one is closed with outcome "superseded".
"""
import json
import os
import sys
from datetime import date, timedelta

LEVELS = "coach/levels.json"
PLAN = "coach/plan.json"
UNITS = {"run": ("/mi", -1), "bike": ("W", 1), "ftp": ("W", 1), "5k": ("min", -1), "swim": ("s/100 yd", -1), "durability": ("%", -1),
         "strength": ("per week", 1), "sleepreg": ("min", -1), "consistency": ("days/week", 1), "vo2": ("", 1), "wkg": ("W/kg", 1)}


def load():
    if os.path.exists(LEVELS):
        return json.load(open(LEVELS))
    return {"about": "Block goals; see coach/engine/LEVELS.md.", "rows": []}


def save(doc):
    with open(LEVELS, "w") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)


def blocks():
    return [r for r in json.load(open(PLAN)).get("rows", []) if r.get("kind") == "block"]


def today():
    return os.environ.get("COACH_TODAY") or date.today().isoformat()


def cmd_list(args):
    doc = load()
    key = args[0] if args else None
    for r in sorted(doc["rows"], key=lambda r: (r["key"], r["start"])):
        if key and r["key"] != key:
            continue
        print(f"{r['key']:<8} {r['block_key']:<22} {r['start']} to {r['end']}  status={r['status']:<11} baseline={r.get('baseline')} target={r.get('target')} strong={r.get('strong')}"
              + (f"  outcome={r['outcome']}" if r.get("outcome") else ""))
    return 0


def cmd_init(args):
    key = args[0]
    unit, better = UNITS.get(key, ("", 1))
    if "--unit" in args:
        unit = args[args.index("--unit") + 1]
    doc = load()
    have = {r["block_key"] for r in doc["rows"] if r["key"] == key}
    n = 0
    for b in blocks():
        if b["key"] in have:
            continue
        hold = b.get("short", "").lower() in ("taper", "recover") or str(b.get("label", "")).split(" ·")[0].lower() in ("taper", "recover")
        doc["rows"].append({"kind": "level_block", "key": key, "block_key": b["key"], "block": b.get("label", b["key"]), "start": b["start"], "end": b["end"],
                            "baseline": None, "target": None, "strong": None, "unit": unit, "status": "hold" if hold else "provisional", "set_on": today(),
                            "note": "Hold block." if hold else "Provisional: proposed to the athlete at block start (LEVELS.md section 3)."})
        n += 1
    save(doc)
    print(f"{key}: {n} rows added")
    return 0


def _find(doc, key, block_key, statuses=None):
    rows = [r for r in doc["rows"] if r["key"] == key and r["block_key"] == block_key and (statuses is None or r["status"] in statuses)]
    return rows[-1] if rows else None


def _num(args, flag):
    if flag in args:
        v = args[args.index(flag) + 1]
        return None if v.lower() in ("null", "none", "-") else float(v)
    return "absent"


def _note(args):
    if "--note" in args:
        i = args.index("--note")
        return " ".join(a for a in args[i + 1:] if not a.startswith("--"))
    return None


def cmd_propose(args):
    key, block_key = args[0], args[1]
    doc = load()
    b = next((x for x in blocks() if x["key"] == block_key), None)
    if b is None:
        print("no such block in plan.json"); return 1
    old = _find(doc, key, block_key)
    if old and old["status"] in ("set", "closed"):
        print(f"block already {old['status']}: close it with outcome 'superseded' first (never move a set block's lines)"); return 1
    row = old if old and old["status"] in ("provisional", "proposed", "hold") else None
    if row is None:
        row = {"kind": "level_block", "key": key, "block_key": block_key, "block": b.get("label", block_key), "start": b["start"], "end": b["end"], "unit": UNITS.get(key, ("", 1))[0]}
        doc["rows"].append(row)
    for flag, field in (("--target", "target"), ("--strong", "strong"), ("--baseline", "baseline")):
        v = _num(args, flag)
        if v != "absent":
            row[field] = v
    if row.get("target") is None or row.get("strong") is None:
        print("a proposal needs --target and --strong"); return 1
    row["status"], row["set_on"] = "proposed", today()
    note = _note(args)
    if note:
        row["note"] = note
    save(doc)
    print(f"{key} {block_key}: proposed target={row['target']} strong={row['strong']} baseline={row.get('baseline')}")
    return 0


def cmd_set(args):
    key, block_key = args[0], args[1]
    doc = load()
    row = _find(doc, key, block_key)
    if row is None:
        print("no row: propose first"); return 1
    if row["status"] in ("set", "closed"):
        print(f"block already {row['status']}: a correction is a new row (close the old one as superseded)"); return 1
    for flag, field in (("--target", "target"), ("--strong", "strong"), ("--baseline", "baseline")):
        v = _num(args, flag)
        if v != "absent":
            row[field] = v
    if row.get("target") is None or row.get("strong") is None:
        print("a set block needs target and strong"); return 1
    row["status"], row["confirmed_on"] = "set", today()
    note = _note(args)
    if note:
        row["note"] = (row.get("note", "") + " " + note).strip()
    save(doc)
    print(f"{key} {block_key}: set target={row['target']} strong={row['strong']} baseline={row.get('baseline')}")
    return 0


def cmd_close(args):
    key, block_key = args[0], args[1]
    doc = load()
    row = _find(doc, key, block_key)
    if row is None:
        print("no row"); return 1
    if "--outcome" not in args:
        print("--outcome is required (the level reached, with the end value)"); return 1
    i = args.index("--outcome")
    row["outcome"] = args[i + 1]
    row["status"], row["closed_on"] = "closed", today()
    note = _note(args)
    if note:
        row["note"] = (row.get("note", "") + " " + note).strip()
    save(doc)
    print(f"{key} {block_key}: closed, outcome: {row['outcome']}")
    return 0


def cmd_due(args):
    t = date.fromisoformat(args[0]) if args else date.fromisoformat(today())
    doc = load()
    out = []
    for b in blocks():
        s, e = date.fromisoformat(b["start"]), date.fromisoformat(b["end"])
        if 0 <= (s - t).days <= 14:
            rows = [r for r in doc["rows"] if r["block_key"] == b["key"]]
            hold = str(b.get("label", "")).split(" ·")[0].lower() in ("taper", "recover") or (rows and all(r["status"] == "hold" for r in rows))
            missing = [r["key"] for r in rows if r["status"] == "provisional"]
            if hold:
                out.append(f"block {b.get('label', b['key'])} starts {b['start']} ({(s - t).days} days): hold block, baseline only, no proposal")
            else:
                out.append(f"block {b.get('label', b['key'])} starts {b['start']} ({(s - t).days} days): propose which markers get goals and their lines (LEVELS.md 3.2-3.3)" + (f"; provisional rows for {', '.join(missing)}" if missing else ""))
        if 0 <= (t - e).days <= 14:
            for r in doc["rows"]:
                if r["block_key"] == b["key"] and r["status"] in ("set", "proposed") and not r.get("outcome"):
                    out.append(f"block {b.get('label', b['key'])} ended {b['end']}: record the outcome for {r['key']} (levels.py close)")
    for r in doc["rows"]:
        if r["status"] == "proposed" and (t - date.fromisoformat(r.get("set_on", t.isoformat()))).days >= 3:
            out.append(f"{r['key']} {r['block_key']}: proposal unanswered for {(t - date.fromisoformat(r['set_on'])).days} days: goes live as proposed (levels.py set) and say so once")
    print("\n".join(out) if out else "nothing due")
    return 0


if __name__ == "__main__":
    cmds = {"list": cmd_list, "init": cmd_init, "propose": cmd_propose, "set": cmd_set, "close": cmd_close, "due": cmd_due}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(2)
    sys.exit(cmds[sys.argv[1]](sys.argv[2:]))
