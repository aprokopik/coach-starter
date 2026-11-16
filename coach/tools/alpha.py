#!/usr/bin/env python3
"""Alpha, beta and live features, and the Release Board's link to them (the athlete, Nov 16, 2026).

the athlete tests a new feature first (alpha, his own coach on main), close friends on the kit get it next (beta),
everyone later (live). coach/ops/alpha.json is the one home for which ring each feature is in; the Release
Board ((link not included in the kit)) is how the athlete sees and manages it ("the release board
to be where everything's served up to me for managing. The raw data can still live in the trackers").

    python3 coach/tools/alpha.py on <id>              exit 0 when the feature is on here (a Python gate)
    python3 coach/tools/alpha.py list                  one line per feature: ring, days in it, name
    python3 coach/tools/alpha.py board-export          JSON for the board's features rows (code_ring, version)
    python3 coach/tools/alpha.py ingest <features.json> [<feedback.json>]
                                                       the athlete's board taps into alpha.json: a ring he picked that the
                                                       code has not reached yet is kept as `wanted`, his notes as
                                                       `feedback`, his Works for me tap as `validated`; prints the
                                                       release work the taps ask for
    python3 coach/tools/alpha.py backlog-export        JSON for the board's backlog rows, from coach/BACKLOG.md
    python3 coach/tools/alpha.py backlog-ingest <backlog.json>
                                                       the athlete's backlog taps into coach/BACKLOG.md (a Board: line)

Rings: status `alpha` (only the original athlete; this file never ships in the kit, so a kit coach has no row and
the gate stays shut), `beta` (in the kit), `live` (everyone). `released` from the first rows reads as beta.
Gates: page code `alpha('<id>')` (build_dashboard writes kind alpha rows), Python `alpha.on('<id>')` below, guide
text inside owner-only markers tagged `<!-- alpha <id>`. coach/tests/test_alpha_gates.py keeps rows and gates in step.
Standard library only.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FILE = ROOT / "coach" / "ops" / "alpha.json"
BACKLOG = ROOT / "coach" / "BACKLOG.md"
RINGS = ("alpha", "beta", "live")
ALPHA_EPIC_CAP = 3  # the athlete, Nov 16, 2026: "Alpha I'll cap at 3 epics" (was 5 features); a row with no epic counts as its own


def load(path=None):
    try:
        return json.loads(Path(path or FILE).read_text())
    except (OSError, ValueError):
        return {"rows": []}


def ring(row):
    s = row.get("status", "alpha")
    return "beta" if s == "released" else s


def alpha_epics(rows):
    """Distinct epics among rows in alpha; a row with no `epic` is an epic of its own."""
    return {r.get("epic") or "solo:" + r.get("id", "") for r in rows if ring(r) == "alpha"}


def on(fid, path=None):
    """The Python gate for an alpha feature: True only where alpha.json has a row for `fid`, which is the original
    athlete's repo (the kit ships no alpha.json, so a kit coach gets False). Like the page's alpha(id), it is only
    called for features in alpha; the release PR removes the call, so released code never asks."""
    return any(r.get("id") == fid and ring(r) == "alpha" for r in load(path).get("rows", []))


def days(since, today=None):
    try:
        return ((today or date.today()) - date.fromisoformat(since)).days
    except (TypeError, ValueError):
        return None


def cmd_list(today=None):
    out = []
    for r in load().get("rows", []):
        d = days(r.get("since"), today)
        w = f" (you asked for {r['wanted']})" if r.get("wanted") and r.get("wanted") != ring(r) else ""
        out.append(f"{ring(r)}\t{'' if d is None else str(d) + ' d'}\t{r.get('name', r.get('id'))}{w}")
    return "\n".join(out)


def board_export():
    return [{"id": r["id"], "code_ring": ring(r), "version": r.get("version", ""), "since": r.get("since", ""),
             "name": r.get("name", r["id"]),
             "depends_on": r.get("depends_on", [])} for r in load().get("rows", []) if r.get("id")]


def ingest(features, feedback=(), path=None, today=None):
    """Board rows -> alpha.json. Never changes `status` (only a release PR does, with the code); records what the athlete
    picked as `wanted`, appends new notes to `feedback` once each. Returns (changed, asks)."""
    p = Path(path or FILE)
    data = load(p)
    rows = {r["id"]: r for r in data.get("rows", []) if r.get("id")}
    changed, asks = False, []
    for f in features:
        r = rows.get(f.get("id"))
        want = f.get("ring")
        if r is None or want not in RINGS:
            continue
        if want != ring(r):
            if r.get("wanted") != want:
                r["wanted"], changed = want, True
            asks.append(f"{r['id']}: {ring(r)} -> {want} (release PR)")
        elif r.pop("wanted", None) is not None:
            changed = True
        ep = f.get("epic") or None
        if ep and r.get("epic") != ep:  # epic membership lives on the board; alpha.json keeps a copy for the cap test
            r["epic"], changed = ep, True
        v = f.get("validate") or {}
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError:
                v = {}
        day = str(v.get("at") or "")[:10] if v.get("ok") is True else None
        if r.get("validated") != day:  # the athlete's Works for me tap on the board (Nov 16: validation and verification)
            if day:
                r["validated"] = day
            else:
                r.pop("validated", None)
            changed = True
    for n in feedback:
        r = rows.get(n.get("feature"))
        if r is None or not n.get("text"):
            continue
        seen = {(x.get("at"), x.get("text")) for x in r.setdefault("feedback", [])}
        key = (n.get("at", ""), n["text"])
        if key not in seen:
            r["feedback"].append({"at": n.get("at", ""), "text": n["text"], "from": n.get("from", "the athlete")})
            changed = True
    stamp = (today or date.today()).isoformat()
    if data.get("synced") != stamp:
        data["synced"] = stamp  # data_paths.json release_board: when the board was last read
        changed = True
    if changed:
        p.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    return changed, asks


ITEM = re.compile(r"^- \*\*(.+?)\*\*")


def slug(title):
    return "bk-" + re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48]


def backlog_export(text=None):
    text = BACKLOG.read_text() if text is None else text
    out, section = [], ""
    for line in text.splitlines():
        if line.startswith("## "):
            section = line[3:].strip()
        m = ITEM.match(line)
        if not m:
            continue
        st = re.search(r"Status:\s*([^.;]+)", line)
        board = re.search(r"Board: (next|idea|later)", line)
        status = (st.group(1).strip().lower() if st else "")
        state = board.group(1) if board else ("building" if status.startswith(("built", "building")) else
                                              "deferred" if "deferred" in status else "idea")
        note = re.sub(r"\s+", " ", line[m.end():]).strip(" :.-")
        out.append({"id": slug(m.group(1)), "title": m.group(1), "section": section, "state": state,
                    "note": note[:240] + ("..." if len(note) > 240 else ""), "from": "coach/BACKLOG.md"})
    return out


def backlog_ingest(rows, path=None, today=None):
    """the athlete's next / idea / later taps -> a ' Board: <state> (<date>).' mark on that item's line."""
    p = Path(path or BACKLOG)
    lines, changed = p.read_text().splitlines(), False
    want = {r["id"]: r.get("state") for r in rows if r.get("state") in ("next", "idea", "later")}
    stamp = (today or date.today()).isoformat()
    for i, line in enumerate(lines):
        m = ITEM.match(line)
        if not m or slug(m.group(1)) not in want:
            continue
        st = want[slug(m.group(1))]
        cur = re.search(r" Board: (next|idea|later) \(\d{4}-\d{2}-\d{2}\)\.", line)
        if cur and cur.group(1) == st:
            continue
        base = line.replace(cur.group(0), "") if cur else line
        lines[i], changed = f"{base} Board: {st} ({stamp}).", True
    if changed:
        p.write_text("\n".join(lines) + "\n")
    return changed


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    c = argv[0]
    if c == "on":
        return 0 if on(argv[1]) else 1
    if c == "list":
        print(cmd_list())
    elif c == "board-export":
        print(json.dumps(board_export(), indent=1))
    elif c == "ingest":
        feats = json.loads(Path(argv[1]).read_text())
        fb = json.loads(Path(argv[2]).read_text()) if len(argv) > 2 else []
        changed, asks = ingest(feats, fb)
        print("changed" if changed else "same")
        for a in asks:
            print("ask " + a)
    elif c == "backlog-export":
        print(json.dumps(backlog_export(), indent=1))
    elif c == "backlog-ingest":
        print("changed" if backlog_ingest(json.loads(Path(argv[1]).read_text())) else "same")
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
