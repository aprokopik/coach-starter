#!/usr/bin/env python3
"""Bring this coach up to a newer Coach starter kit, keeping everything that is the athlete's own.

    python3 setup/update.py <new-kit-folder>            # show what would change; changes nothing
    python3 setup/update.py <new-kit-folder> --apply    # do it, then re-apply the athlete's settings

<new-kit-folder> is a copy of the newer kit: a clone of the kit's home repository (setup/kit.json,
"feedback_repo") or an unzipped coach-starter-kit-<version>.zip. UPDATE-PROMPT.md walks Claude through it.

The newer kit's setup/kit-manifest.json says which files are the kit's own (engine, tools, dashboard code,
workflows, scripts, guides) and which are the athlete's (profile, current state, log, plans, races, data).
- Athlete files are never changed. A new athlete file the kit now ships is added only if it is missing.
- A kit file is replaced by the newer copy, unless it was edited here since it was installed
  (setup/installed.json fingerprints): then the local copy is kept, the newer copy is put in
  setup/update-incoming/ and the file is listed, so Claude can merge the two by hand.
- A kit file the newer kit no longer ships is removed, unless it was edited here.
- A coach set up before fingerprints existed (kits before 5.1.0) has no setup/installed.json: every kit
  file is replaced, and any local edit stays in git history.
After --apply it runs `setup/personalize.py setup/answers.json --refresh`, which puts the athlete's name,
links, time zone, schedules and feeds back into the kit's files, adds any new section the engine reads
(never rewriting existing text), and records fresh fingerprints. Standard library only.
"""
import fnmatch
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCOMING = ROOT / "setup" / "update-incoming"


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def vtuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def athlete(rel, never):
    return any(fnmatch.fnmatch(rel, pat) for pat in never)


def plan(new):
    nm = json.loads((new / "setup" / "kit-manifest.json").read_text(encoding="utf-8"))
    inst_p = ROOT / "setup" / "installed.json"
    inst = json.loads(inst_p.read_text(encoding="utf-8"))["files"] if inst_p.is_file() else None
    never = set(nm["athlete_files"]) | set(nm.get("athlete_never", []))
    gen = set(nm.get("generated", []))
    acts = {"add": [], "replace": [], "keep_edited": [], "remove": [], "keep_removed_edited": [], "add_athlete": [], "same": []}
    for rel in nm["kit_files"]:
        src, dst = new / rel, ROOT / rel
        if athlete(rel, never):
            continue
        if not dst.exists():
            acts["add"].append(rel)
        elif dst.read_bytes() == src.read_bytes():
            acts["same"].append(rel)
        elif rel not in gen and inst is not None and rel in inst and sha(dst) != inst[rel]:
            acts["keep_edited"].append(rel)
        else:
            acts["replace"].append(rel)
    if inst is not None:
        for rel in sorted(set(inst) - set(nm["kit_files"])):
            dst = ROOT / rel
            if dst.is_file() and not athlete(rel, never):
                (acts["remove"] if sha(dst) == inst[rel] else acts["keep_removed_edited"]).append(rel)
    for rel in nm["athlete_files"]:
        if not (ROOT / rel).exists() and (new / rel).is_file():
            acts["add_athlete"].append(rel)
    return nm, inst, acts


def whats_new(new, old_v):
    text = (new / "CHANGELOG.md").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r"^## (\d+\.\d+\.\d+) \(([\d-]+)\)\n(.*?)(?=^## |\Z)", text, flags=re.M | re.S):
        if vtuple(m.group(1)) > vtuple(old_v):
            out.append(f"{m.group(1)} ({m.group(2)})\n" + m.group(3).strip())
    return out


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    new = Path(argv[0]).resolve()
    if not (new / "setup" / "kit-manifest.json").is_file():
        print(f"NOT A KIT: {new} has no setup/kit-manifest.json (kits from 5.1.0 on have one).")
        return 1
    if new == ROOT:
        print("NOT A KIT: that is this coach itself; point at a separate copy of the newer kit.")
        return 1
    old_v = (ROOT / "VERSION").read_text().strip() if (ROOT / "VERSION").is_file() else "0.0.0"
    nm, inst, acts = plan(new)
    new_v = nm["version"]
    print(f"Coach {old_v} -> {new_v}" + ("  (MAJOR: a contract changed; read what's new first)" if vtuple(new_v)[0] > vtuple(old_v)[0] else ""))
    if vtuple(new_v) < vtuple(old_v):
        print("STOP: the kit is older than this coach.")
        return 1
    if inst is None:
        print("No setup/installed.json (set up before 5.1.0): every kit file is replaced; local edits stay in git history.")
    labels = [("add", "New kit files"), ("replace", "Kit files replaced"), ("keep_edited", "Kept, edited here (newer copy in setup/update-incoming/; merge by hand)"),
              ("remove", "Removed (no longer in the kit)"), ("keep_removed_edited", "No longer in the kit but edited here: kept"),
              ("add_athlete", "New athlete files added (blank)")]
    for key, label in labels:
        if acts[key]:
            print(f"\n{label}: {len(acts[key])}")
            for rel in acts[key][:60]:
                print(f"  {rel}")
    print(f"\nUnchanged kit files: {len(acts['same'])}. Athlete files and data: untouched.")
    notes = whats_new(new, old_v)
    if notes:
        print("\nWHAT'S NEW\n" + "\n\n".join(notes))
    if "--apply" not in argv:
        print("\nDry run: nothing changed. Run again with --apply.")
        return 0
    if not (ROOT / "setup" / "answers.json").is_file():
        print("\nSTOP: setup/answers.json is missing, so the athlete's settings cannot be re-applied. Rebuild it from "
              "coach/athlete/profile.json and PROFILE.md (shape: setup/answers.example.json), then run again.")
        return 1
    for rel in acts["add"] + acts["replace"] + acts["add_athlete"]:
        dst = ROOT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(new / rel, dst)
    for rel in acts["keep_edited"]:
        dst = INCOMING / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(new / rel, dst)
    for rel in acts["remove"]:
        (ROOT / rel).unlink()
    r = subprocess.run([sys.executable, str(ROOT / "setup" / "personalize.py"), str(ROOT / "setup" / "answers.json"), "--refresh"],
                       cwd=ROOT, capture_output=True, text=True)
    print("\n" + (r.stdout + r.stderr).strip())
    if r.returncode:
        print("STOP: the refresh failed; fix the line above and run setup/personalize.py setup/answers.json --refresh.")
        return 1
    print(f"\nUPDATED to {new_v}." + (f" Merge {len(acts['keep_edited'])} file(s) from setup/update-incoming/, then delete that folder." if acts["keep_edited"] else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
