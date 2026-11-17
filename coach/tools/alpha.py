#!/usr/bin/env python3
"""Feature stages: alpha, beta and public, and the Release Board's link to them.

the athlete, Nov 17, 2026 (option A "One switch per feature"): "keep alpha as a group for just me, beta as the friends ... and
then public for everyone else. Noting that currently there is no public ... gray that out until we've established a
branched public line." coach/ops/alpha.json is the one home for each gated feature's stage; the Release Board
((link not included in the kit)) shows it and sends the athlete's taps back as requests.

    python3 coach/tools/alpha.py on <id>              exit 0 when the feature is on for this install (a Python gate)
    python3 coach/tools/alpha.py list                  one line per feature: stage, days in it, name
    python3 coach/tools/alpha.py board-export          JSON for the board's features rows (code_ring = stage, version)
    python3 coach/tools/alpha.py ingest <features.json> [<feedback.json>]
                                                       the athlete's board taps into alpha.json: a `request` {stage, at} newer
                                                       than the row's `stage_at` moves the stage here (checked: no public
                                                       while closed, never past what it depends on, the alpha epic cap);
                                                       notes go to `feedback`, Works for me to `validated`; prints one
                                                       `move` line per stage change and `refused` lines with the reason
    python3 coach/tools/alpha.py unreleased            one CHANGELOG line per stage move into or out of beta not yet in a kit release
    python3 coach/tools/alpha.py mark-released <version>
                                                       the Stage release PR stamps those moves with its version
    python3 coach/tools/alpha.py kit-file              the stage list the kit ships (ids and stages only, channel beta)
    python3 coach/tools/alpha.py backlog-export        JSON for the board's backlog rows, from coach/BACKLOG.md
    python3 coach/tools/alpha.py backlog-ingest <backlog.json>
                                                       the athlete's backlog taps into coach/BACKLOG.md (a Board: line)

Stages, inner to outer: `alpha` (the athlete only), `beta` (kit friends), `public` (everyone; refused while `public_open` is
false: there is no public line yet). Every install has a `channel` (this repo alpha; the kit build writes beta). A switch
is on when rank(stage) >= rank(channel), so the athlete sees all three stages, friends see beta and public. A feature with no
row is off everywhere (default off). Old words read as: `released`, `live` -> beta.
Gates: page code `alpha('<id>')` (build_dashboard writes a kind alpha row for each feature on here), Python
`alpha.on('<id>')`, guide text inside owner-only markers tagged `<!-- alpha <id>` (the kit build keeps the text once the
feature is beta). coach/tests/test_alpha_gates.py keeps rows and gates in step. Standard library only.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
FILE = ROOT / "coach" / "ops" / "alpha.json"
BACKLOG = ROOT / "coach" / "BACKLOG.md"
STAGES = ("alpha", "beta", "public")
RINGS = STAGES  # older name
RANK = {s: i for i, s in enumerate(STAGES)}
ALPHA_EPIC_CAP = 3  # default; alpha.json `alpha_epic_cap` overrides (the athlete, Nov 17, 2026: 4 for now)


def load(path=None):
    try:
        return json.loads(Path(path or FILE).read_text())
    except (OSError, ValueError):
        return {"rows": []}


def ring(row):
    s = row.get("status", "alpha")
    return "beta" if s in ("released", "live") else s


stage = ring


def channel(data):
    """This install's channel; a stage file with no channel (or no file) is treated as the outermost, public."""
    c = (data or {}).get("channel")
    return c if c in RANK else "public"


def cap(data):
    try:
        return int((data or {}).get("alpha_epic_cap") or ALPHA_EPIC_CAP)
    except (TypeError, ValueError):
        return ALPHA_EPIC_CAP


def is_on(row, ch):
    st = ring(row)
    return st in RANK and RANK[st] >= RANK[ch]


def on_ids(data):
    """Ids of every feature switched on for this install."""
    ch = channel(data)
    return [r["id"] for r in (data or {}).get("rows", []) if r.get("id") and is_on(r, ch)]


def alpha_epics(rows):
    """Distinct epics among rows in alpha; a row with no `epic` is an epic of its own."""
    return {r.get("epic") or "solo:" + r.get("id", "") for r in rows if ring(r) == "alpha"}


def on(fid, path=None):
    """The Python gate: True when `fid` has a row whose stage reaches this install's channel. No row, no file or an
    unknown stage: False (default off)."""
    return fid in on_ids(load(path))


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
    return [{"id": r["id"], "code_ring": ring(r), "ring": ring(r), "version": r.get("version", ""),
             "since": r.get("since", ""), "stage_at": r.get("stage_at", ""), "name": r.get("name", r["id"]),
             "epic": r.get("epic", ""), "depends_on": r.get("depends_on", [])}
            for r in load().get("rows", []) if r.get("id")]


def board_meta(data=None):
    """The board's `meta/stages` doc: whether Public is open, and the alpha epic cap."""
    data = load() if data is None else data
    return {"public_open": bool(data.get("public_open")), "alpha_epic_cap": cap(data),
            "cap_note": data.get("alpha_epic_cap_note", "")}


def unreleased(data=None):
    """Stage moves into or out of beta that no kit release carried yet: (id, name, from, to, at)."""
    data = load() if data is None else data
    out = []
    for r in data.get("rows", []):
        for h in r.get("stages", []):
            if "beta" in (h.get("from"), h.get("to")) and not h.get("released_in"):
                out.append((r["id"], r.get("name", r["id"]), h.get("from"), h.get("to"), h.get("at", "")))
    return out


def mark_released(version, path=None):
    """The Stage release PR stamps each unreleased move with the version that carries it to friends."""
    p = Path(path or FILE)
    data = load(p)
    n = 0
    for r in data.get("rows", []):
        for h in r.get("stages", []):
            if "beta" in (h.get("from"), h.get("to")) and not h.get("released_in"):
                h["released_in"], n = version, n + 1
    if n:
        p.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    return n


def kit_file(data=None):
    """What the kit ships as coach/ops/alpha.json: ids and stages only, channel beta, no names or notes."""
    data = load() if data is None else data
    return {"about": "Feature stages for this coach (channel beta). Kept up to date by each kit update; do not edit.",
            "channel": "beta", "public_open": bool(data.get("public_open")),
            "rows": [{"id": r["id"], "status": ring(r)} for r in data.get("rows", []) if r.get("id")]}


def _obj(v):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return {}
    return v if isinstance(v, dict) else {}


def check_move(rows, data, fid, to):
    """Why a stage move is refused, or None when it may go ahead."""
    r = rows[fid]
    if to not in RANK:
        return f"no stage called {to}"
    if to == "public" and not data.get("public_open"):
        return "Public is closed until there is a public line"
    if RANK[to] > RANK[ring(r)]:
        behind = [d for d in r.get("depends_on", []) if d in rows and RANK.get(ring(rows[d]), 0) < RANK[to]]
        if behind:
            return "it needs " + ", ".join(behind) + " to go first (or in the same move)"
    else:
        ahead = [x["id"] for x in rows.values() if fid in x.get("depends_on", []) and RANK.get(ring(x), 0) > RANK[to]]
        if ahead:
            return "pull back " + ", ".join(ahead) + " first, it builds on this"
    if to == "alpha" and ring(r) != "alpha":
        eps = alpha_epics(list(rows.values()))
        mine = r.get("epic") or "solo:" + fid
        if mine not in eps and len(eps) >= cap(data):
            return f"Alpha already holds {len(eps)} epics (cap {cap(data)})"
    return None


def ingest(features, feedback=(), path=None, today=None):
    """Board rows -> alpha.json. A row's `request` {stage, at} newer than its `stage_at` is the athlete's stage tap: checked
    (check_move) and recorded as `status`, `stage_at` and a `stages` history line. Requests are applied inner moves
    first, so moving an epic out together passes the depends_on check. Notes go to `feedback` once each, Works for me
    to `validated`. Returns (changed, lines): `move <id>: <from> -> <to>` and `refused <id> -> <to>: <why>`."""
    p = Path(path or FILE)
    data = load(p)
    rows = {r["id"]: r for r in data.get("rows", []) if r.get("id")}
    changed, lines, reqs = False, [], []
    for f in features:
        r = rows.get(f.get("id"))
        if r is None:
            continue
        if r.pop("wanted", None) is not None:
            changed = True
        q = _obj(f.get("request"))
        to, at = q.get("stage"), str(q.get("at") or "")
        if to and at and at > str(r.get("stage_at") or "") and to != ring(r):
            reqs.append((r["id"], to, at))
        ep = f.get("epic") or None
        if ep and r.get("epic") != ep:  # epic membership is set on the board
            r["epic"], changed = ep, True
        v = _obj(f.get("validate"))
        day = str(v.get("at") or "")[:10] if v.get("ok") is True else None
        if r.get("validated") != day:  # the athlete's Works for me tap on the board (Nov 16: validation and verification)
            if day:
                r["validated"] = day
            else:
                r.pop("validated", None)
            changed = True
    # outward moves of what others need first, inward moves of dependents first
    reqs.sort(key=lambda x: (RANK.get(x[1], 9) <= RANK.get(ring(rows[x[0]]), 0), len(rows[x[0]].get("depends_on", []))))
    for fid, to, at in reqs:
        r = rows[fid]
        why = check_move(rows, data, fid, to)
        if why:
            lines.append(f"refused {fid} -> {to}: {why}")
            continue
        frm = ring(r)
        r["status"], r["stage_at"] = to, at
        r.setdefault("stages", []).append({"from": frm, "to": to, "at": at, "by": "the athlete, Release Board"})
        r.pop("was", None)
        lines.append(f"move {fid}: {frm} -> {to}")
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
    return changed, lines


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
        changed, out = ingest(feats, fb)
        print("changed" if changed else "same")
        for a in out:
            print(a)
    elif c == "unreleased":
        for fid, name, a, b, at in unreleased():
            print(f"Stage: {name} from {a} to {b} (the athlete, Release Board, {at[:10]})")
    elif c == "mark-released":
        print(mark_released(argv[1]))
    elif c == "kit-file":
        print(json.dumps(kit_file(), indent=1))
    elif c == "board-meta":
        print(json.dumps(board_meta(), indent=1))
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
