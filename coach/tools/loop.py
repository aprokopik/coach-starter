"""Self improvement loop: the findings ledger, its ranking, the scorecard and the guard (6.89.0).

Why (Nov 16, 2026): of the 32 fix releases from Nov 9 to Nov 16, the owner spotted 22 from his phone, the system's own
checks 8 and testers 2, and 9 releases were second or later tries at a problem already called fixed. Signals had no
owner, findings had no test, and nothing checked that a fix stayed fixed. The design and its rules are in
coach/ops/LOOP.md (one home); this tool is its mechanics.

The ledger is coach/findings.json (live, written by the loop's runs and by threads). It holds only things that are
BROKEN (a defect: the coach does something its spec, a test or a past decision says it must not). A new idea is not a
finding: it goes to the shared Improvements log, so each item has one home.

Finding fields: id (YYYYMMDD-slug), found (date), source (owner, tester, check, ci, store, run), signal (one line, words
only, never a health reading), cls (a short class: save, state, scroll, text, plan-rule, kit-save, data, speed, ...),
reach (owner, kit, both), severity (safety, data-loss, broken, annoying), test (the test that failed first, or ""),
status (new, red, pr, watching, closed, came-back, declined), pr, fixed (date the fix merged), came_back (count),
evidence (list of {date, source, signal}).

Status rules: a finding moves to pr only with a test named; watching starts when the fix merges; closed only after
QUIET_DAYS with no new signal of its class; a new signal on a watching or closed finding of the same class and test
reopens it as came-back, which ranks first after safety.

CLI (from the repo root):
  python3 coach/tools/loop.py add --source S --signal "..." --cls C --reach R --severity V [--id ID] [--date D]
  python3 coach/tools/loop.py rank                      open findings, most urgent first (JSON lines)
  python3 coach/tools/loop.py next [--max 2]            what a fix run works on; exit 3 when there is nothing (quiet)
                                                        or the week's MAX_PER_WEEK fix PRs are already open
  python3 coach/tools/loop.py advance ID STATUS [--test T] [--pr N] [--date D]
  python3 coach/tools/loop.py sweep [--date D]          close findings quiet for QUIET_DAYS; prints what changed
  python3 coach/tools/loop.py decide REF OUTCOME --reason "..." [--date D]   the owner's Merge, reject, rework or pick
  python3 coach/tools/loop.py line                      the check-in clause; prints nothing when nothing waits
  python3 coach/tools/loop.py scorecard [--since D]     the loop's own measures (JSON)
  python3 coach/tools/loop.py guard [--base REF]        a loop branch's diff against its guardrails; exit 1 on a breach
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LEDGER = os.path.join(ROOT, "coach", "findings.json")
QUIET_DAYS = 14
MAX_PER_NIGHT = 2
MAX_PER_WEEK = 6  # fix PRs opened in any 7 days (usage cap, LOOP.md Shape and cost)

SOURCES = ("owner", "tester", "check", "ci", "store", "run")
FOUND_BY_SYSTEM = ("check", "ci", "store", "run")
REACH = ("owner", "kit", "both")
SEVERITY = ("safety", "data-loss", "broken", "annoying")
STATUS = ("new", "red", "pr", "watching", "closed", "came-back", "declined")
OPEN = ("new", "red", "came-back")
OUTCOMES = ("merged", "rejected", "reworked", "picked")
NEXT = {  # allowed moves
    "new": {"red", "declined"},
    "came-back": {"red", "declined"},
    "red": {"pr", "declined"},
    "pr": {"watching", "red", "declined"},
    "watching": {"closed", "came-back"},
    "closed": {"came-back"},
    "declined": set(),
}

# Guardrails a loop branch may never touch (LOOP.md "Never"). Changes here come only from a thread the owner starts.
PROTECTED = ("coach/engine/RULES.md", "coach/engine/schemas.json", "coach/research/PROTOCOL.md", ".github/", "scripts/",
             "kit/build_kit.py", "coach/tests/frozen.py", "coach/tests/test_dashboard_speed.py",
             "coach/tests/test_no_live_data.py", "coach/tools/loop.py", "coach/tests/test_loop.py", "coach/ops/LOOP.md")
# Prescription and the athlete's own decisions: training, nutrition and health content reach the owner as proposals only.
PRESCRIPTION = ("coach/CURRENT-STATE.md", "coach/plan.json", "coach/week.json", "coach/today.json",
                "coach/nutrition_extras.json", "coach/athlete/", "coach/engine/", "coach/block_briefs.json",
                "coach/strength_rotation.json", "coach/research/LIBRARY.md")
SKIP_ADDED = re.compile(r"^\+(?!\+).*(@unittest\.skip|unittest\.skip\(|\.skipTest\(|@skip\b|pytest\.mark\.skip)")


def today():
    return date.today()


def d(s):
    return date.fromisoformat(str(s)[:10])


# ---------- ledger ----------

def load(path=LEDGER):
    if not os.path.exists(path):
        return {"about": "Self improvement loop ledger: broken things only, one row each (coach/ops/LOOP.md).",
                "findings": [], "decisions": []}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save(led, path=LEDGER):
    led["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(led, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40]


def find(led, fid):
    for f in led["findings"]:
        if f["id"] == fid:
            return f
    raise KeyError(f"no finding {fid}")


def add(led, source, signal, cls, reach, severity, on=None, fid=None):
    """Log a signal. A signal of the same class as an open finding joins its evidence; one that matches a watching or
    closed finding of that class reopens it as came-back. Returns (finding, what happened)."""
    on = on or today()
    if source not in SOURCES or reach not in REACH or severity not in SEVERITY:
        raise ValueError("source, reach or severity not one of the allowed words")
    ev = {"date": on.isoformat(), "source": source, "signal": signal}
    same = [f for f in led["findings"] if f["cls"] == cls and f["status"] != "declined"]
    for f in same:
        if f["status"] in OPEN or f["status"] == "pr":
            if not any(e["signal"] == signal for e in f["evidence"]):
                f["evidence"].append(ev)  # the same signal from a daily run is one piece of evidence
            return f, "joined"
    for f in sorted(same, key=lambda f: f.get("fixed") or "", reverse=True):
        if f["status"] in ("watching", "closed"):
            f["evidence"].append(ev)
            f["status"] = "came-back"
            f["came_back"] = f.get("came_back", 0) + 1
            return f, "came-back"
    fid = fid or f"{on.strftime('%Y%m%d')}-{slug(cls + ' ' + signal)}"
    f = {"id": fid, "found": on.isoformat(), "source": source, "signal": signal, "cls": cls, "reach": reach,
         "severity": severity, "test": "", "status": "new", "pr": None, "fixed": None, "came_back": 0, "evidence": [ev]}
    led["findings"].append(f)
    return f, "new"


def room_this_week(led, on=None):
    """Fix PRs the loop may still open in the 7 days ending `on`."""
    on = on or today()
    used = sum(1 for f in led["findings"] if f.get("pr_date") and (on - d(f["pr_date"])).days < 7)
    return max(0, MAX_PER_WEEK - used)


def rank_key(f):
    return (SEVERITY.index(f["severity"]),
            0 if f["status"] == "came-back" else 1,
            0 if f["reach"] in ("kit", "both") else 1,
            -len(f["evidence"]),
            f["found"])


def ranked(led):
    return sorted([f for f in led["findings"] if f["status"] in OPEN], key=rank_key)


def advance(led, fid, status, test=None, pr=None, on=None):
    on = on or today()
    f = find(led, fid)
    if status not in NEXT.get(f["status"], set()):
        raise ValueError(f"{fid}: {f['status']} cannot move to {status}")
    if test:
        f["test"] = test
    if pr is not None:
        f["pr"] = pr
    if status in ("red", "pr") and not f["test"]:
        raise ValueError(f"{fid}: name the test that fails before the fix (--test)")
    if status == "pr":
        f["pr_date"] = on.isoformat()
    if status == "watching":
        f["fixed"] = on.isoformat()
    if status == "closed":
        quiet = quiet_days(f, on)
        if quiet < QUIET_DAYS:
            raise ValueError(f"{fid}: quiet {quiet} days, closes after {QUIET_DAYS}")
    f["status"] = status
    return f


def quiet_days(f, on):
    """Days since the fix merged. A new signal after it reopens the finding (add), so the fix date is the last event."""
    return (on - d(f["fixed"])).days if f.get("fixed") else 0


def sweep(led, on=None):
    on = on or today()
    closed = []
    for f in led["findings"]:
        if f["status"] == "watching" and quiet_days(f, on) >= QUIET_DAYS:
            f["status"] = "closed"
            closed.append(f["id"])
    return closed


def decide(led, ref, outcome, reason, on=None):
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome is one of {', '.join(OUTCOMES)}")
    row = {"date": (on or today()).isoformat(), "ref": ref, "outcome": outcome, "reason": reason}
    led["decisions"].append(row)
    return row


def line(led):
    """One clause for the check-in's last line: fix PRs waiting for Merge and anything that came back."""
    waiting = [f for f in led["findings"] if f["status"] == "pr"]
    back = [f for f in led["findings"] if f["status"] == "came-back"]
    parts = []
    if waiting:
        n = len(waiting)
        prs = ", ".join(f"#{f['pr']}" for f in waiting if f.get("pr"))
        parts.append(f"{n} fix{'es' if n > 1 else ''} ready for Merge" + (f" ({prs})" if prs else ""))
    if back:
        parts.append(f"{len(back)} came back: " + "; ".join(f["signal"] for f in back[:2]))
    return "Self check: " + ". ".join(parts) + "." if parts else ""


def scorecard(led, since=None):
    rows = [f for f in led["findings"] if not since or f["found"] >= since.isoformat()]
    n = len(rows)
    by = {s: sum(1 for f in rows if f["source"] == s) for s in SOURCES}
    sys_first = sum(by[s] for s in FOUND_BY_SYSTEM)
    to_pr = []
    for f in rows:
        if f.get("fixed"):
            to_pr.append((d(f["fixed"]) - d(f["found"])).days)
    dec = [x for x in led["decisions"] if not since or x["date"] >= since.isoformat()]
    merged = sum(1 for x in dec if x["outcome"] == "merged")
    judged = sum(1 for x in dec if x["outcome"] in ("merged", "rejected", "reworked"))
    return {
        "findings": n,
        "found_by": by,
        "found_by_system_share": round(sys_first / n, 2) if n else None,
        "came_back": sum(f.get("came_back", 0) for f in rows),
        "open": sum(1 for f in rows if f["status"] in OPEN),
        "waiting_for_merge": sum(1 for f in rows if f["status"] == "pr"),
        "median_days_to_fix": sorted(to_pr)[len(to_pr) // 2] if to_pr else None,
        "merge_rate": round(merged / judged, 2) if judged else None,
        "rejected_reasons": [x["reason"] for x in dec if x["outcome"] == "rejected"][-5:],
    }


# ---------- guard ----------

def guard_check(changes, diff_text, budget_lines=None):
    """changes: [(status letter, path)]; diff_text: the unified diff. Returns breaches (empty when clean)."""
    out = []
    for st, path in changes:
        if any(path == p or (p.endswith("/") and path.startswith(p)) for p in PROTECTED):
            out.append(f"{path}: a guardrail file; only a thread the owner starts may change it")
        if any(path == p or (p.endswith("/") and path.startswith(p)) for p in PRESCRIPTION):
            out.append(f"{path}: training, nutrition or health content; send it as a proposal instead")
        if st.startswith("D") and path.startswith("coach/tests/"):
            out.append(f"{path}: a test was deleted")
    current = None
    for ln in diff_text.splitlines():
        if ln.startswith("+++ "):
            current = ln[6:] if ln.startswith("+++ b/") else ln[4:]
        elif current and current.startswith("coach/tests/") and SKIP_ADDED.match(ln):
            out.append(f"{current}: a skip was added ({ln[1:].strip()[:60]})")
        elif current and current.startswith("coach/tests/") and re.match(r"^-(?!-)\s*(def test_\w+)", ln):
            out.append(f"{current}: a test was removed ({ln[1:].strip()[:60]})")
    return sorted(set(out))


def git_changes(base):
    names = subprocess.run(["git", "diff", "--name-status", "--no-renames", base, "HEAD"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout
    changes = [tuple(l.split("\t", 1)) for l in names.splitlines() if "\t" in l]
    diff = subprocess.run(["git", "diff", "--no-renames", base, "HEAD", "--", "coach/tests/"], cwd=ROOT,
                          capture_output=True, text=True, check=True).stdout
    return changes, diff


# ---------- CLI ----------

def main(argv=None):
    ap = argparse.ArgumentParser(prog="loop.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    for k in ("source", "signal", "cls", "reach", "severity"):
        a.add_argument("--" + k, required=True)
    a.add_argument("--id")
    a.add_argument("--date")
    sub.add_parser("rank")
    n = sub.add_parser("next")
    n.add_argument("--max", type=int, default=MAX_PER_NIGHT)
    v = sub.add_parser("advance")
    v.add_argument("id")
    v.add_argument("status")
    v.add_argument("--test")
    v.add_argument("--pr", type=int)
    v.add_argument("--date")
    s = sub.add_parser("sweep")
    s.add_argument("--date")
    c = sub.add_parser("decide")
    c.add_argument("ref")
    c.add_argument("outcome")
    c.add_argument("--reason", required=True)
    c.add_argument("--date")
    sub.add_parser("line")
    sc = sub.add_parser("scorecard")
    sc.add_argument("--since")
    g = sub.add_parser("guard")
    g.add_argument("--base", default="origin/main")
    args = ap.parse_args(argv)
    on = d(args.date) if getattr(args, "date", None) else None

    if args.cmd == "guard":
        breaches = guard_check(*git_changes(args.base))
        print("\n".join(breaches) or "ok")
        return 1 if breaches else 0
    led = load()
    if args.cmd == "add":
        f, what = add(led, args.source, args.signal, args.cls, args.reach, args.severity, on, args.id)
        save(led)
        print(what, f["id"])
    elif args.cmd == "rank":
        for f in ranked(led):
            print(json.dumps({k: f[k] for k in ("id", "severity", "status", "reach", "cls", "signal")}))
    elif args.cmd == "next":
        picks = ranked(led)[:min(args.max, room_this_week(led))]
        for f in picks:
            print(json.dumps({k: f[k] for k in ("id", "severity", "status", "reach", "cls", "signal", "test")}))
        return 0 if picks else 3
    elif args.cmd == "advance":
        f = advance(led, args.id, args.status, args.test, args.pr, on)
        save(led)
        print(f["id"], f["status"])
    elif args.cmd == "sweep":
        closed = sweep(led, on)
        if closed:
            save(led)
        print("\n".join(closed))
    elif args.cmd == "decide":
        decide(led, args.ref, args.outcome, args.reason, on)
        save(led)
    elif args.cmd == "line":
        out = line(led)
        if out:
            print(out)
    elif args.cmd == "scorecard":
        print(json.dumps(scorecard(led, d(args.since) if args.since else None), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
