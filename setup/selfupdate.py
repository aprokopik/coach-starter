#!/usr/bin/env python3
"""Update this coach to the newest kit on its own, and undo the update if anything fails.

    python3 setup/selfupdate.py              # look at the kit's home repository and update if it is newer
    python3 setup/selfupdate.py --kit <dir>  # use this copy of the newer kit instead of cloning

The morning check-in runs it first, so the athlete never has to ask for, approve or wait on an update.
The first printed line says what happened, and the morning run acts on that line alone:

    SAME <version>            nothing newer; say nothing
    OFF                       the athlete turned this off (setup/answers.json, setup.auto_update false)
    SKIP <reason>             could not look or was not safe to try (no network, unsaved changes); say nothing
    ASK <new>                 the newer kit is a MAJOR version (a contract changed): offer it, do not install
    UPDATED <old> -> <new>    installed, tested and committed; WHAT'S NEW follows; push and say one line
    UNDONE <old> -> <new>     tried, a check failed, every file is back as it was; the reason follows

It never touches the athlete's own files or data (setup/update.py decides which files are the kit's).
It only starts from a clean git state, so the undo is exact: `git reset --hard` to the commit it started from.
Standard library only.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")


def run(*cmd, timeout=600):
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout, env=ENV)
        return r.returncode, (r.stdout + r.stderr).strip()
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout} s: {' '.join(cmd[:3])}"


def vtuple(v):
    return tuple(int(x) for x in v.strip().split("."))


def turned_off():
    try:
        a = json.loads((ROOT / "setup" / "answers.json").read_text())
        return a.get("setup", {}).get("auto_update") is False
    except (OSError, ValueError):
        return False


def fetch_kit(tmp):
    try:
        home = json.loads((ROOT / "setup" / "kit.json").read_text())["feedback_repo"]
    except (OSError, ValueError, KeyError):
        return None, "setup/kit.json does not name the kit's home"
    dest = Path(tmp) / "coach-kit"
    code, out = run("git", "clone", "-q", "--depth", "1", f"https://github.com/{home}", str(dest), timeout=60)
    if code:
        return None, "the kit's home could not be reached"
    return dest, ""


def undo(start):
    run("git", "reset", "-q", "--hard", start)
    run("git", "clean", "-fdq")


def main(argv):
    if turned_off():
        print("OFF")
        return 0
    old = (ROOT / "VERSION").read_text().strip()
    with tempfile.TemporaryDirectory() as tmp:
        if "--kit" in argv:
            kit, why = Path(argv[argv.index("--kit") + 1]).resolve(), ""
        else:
            kit, why = fetch_kit(tmp)
        if kit is None:
            print(f"SKIP {why}")
            return 0
        try:
            new = (kit / "VERSION").read_text().strip()
            newer = vtuple(new) > vtuple(old)
        except (OSError, ValueError):
            print("SKIP the kit's VERSION could not be read")
            return 0
        if not newer:
            print(f"SAME {old}")
            return 0
        if vtuple(new)[0] > vtuple(old)[0]:
            print(f"ASK {new}")
            return 0
        code, start = run("git", "rev-parse", "HEAD")
        if code:
            print("SKIP this folder is not a git repository")
            return 0
        code, dirty = run("git", "status", "--porcelain")
        if code or dirty:
            print("SKIP there are unsaved changes here; commit them first")
            return 0

        code, out = run(sys.executable, "setup/update.py", str(kit), "--apply")
        if code:
            undo(start)
            print(f"UNDONE {old} -> {new}\nThe update itself stopped:\n{out[-1500:]}")
            return 0
        notes = out.split("WHAT'S NEW", 1)[1].split("\n\nUPDATED to", 1)[0].strip() if "WHAT'S NEW" in out else ""
        for check in (("-m", "unittest", "discover", "-s", "coach/tests", "-q"), ("coach/tools/reconcile.py",)):
            code, cout = run(sys.executable, *check)
            if code:
                undo(start)
                print(f"UNDONE {old} -> {new}\nA check failed after the update ({' '.join(check[:3])}):\n{cout[-1500:]}")
                return 0
        for p in ROOT.rglob("__pycache__"):
            if ".git" not in p.parts:
                shutil.rmtree(p, ignore_errors=True)
        ident = [] if run("git", "config", "user.email")[1] else ["-c", "user.name=Coach", "-c", "user.email=coach@users.noreply.github.com"]
        run("git", "add", "-A")
        code, cout = run("git", *ident, "commit", "-q", "-m", f"Update Coach to {new}")
        if code:
            undo(start)
            print(f"UNDONE {old} -> {new}\nThe update could not be saved:\n{cout[-800:]}")
            return 0
        print(f"UPDATED {old} -> {new}")
        if (ROOT / "setup" / "update-incoming").is_dir():
            print("MERGE: files edited here were kept; the newer copies are in setup/update-incoming/.")
        if notes:
            print("\nWHAT'S NEW\n" + notes)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
