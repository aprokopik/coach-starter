"""Push to main only what passes the tests (6.165.0; the athlete picked "Only when I must act", Nov 21, 2026).

Why: scheduled runs pushed straight to main and the tests ran only afterwards. On Nov 17 a Stage tap commit turned main
red for 13 hours; on Nov 18 a check-in commit added a file with no writer and did the same; threads pushed branches
before testing (6 failed runs in a week). Each failure emailed the athlete. This is the one door for a push:

  1. fetch and rebase onto the target branch;
  2. when the commits change any system file or add a new file, run the suite once (coach/tests/live_guard.py,
     about 40 s); data-only changes to existing files skip it, as CI does;
  3. green: push (3 tries, rebasing between them). Red: push to a hold/<UTC time> branch instead, print HELD and exit 2.
     A held push never reaches main and is never a message to the athlete: the nightly fixer (TASK-PROMPT-loop.md step 2)
     finds hold/ branches, fixes the cause and merges it, the same as any red test.

    python3 coach/tools/safe_push.py                 # push HEAD to main (scheduled runs)
    python3 coach/tools/safe_push.py --to my-branch  # a thread's branch: tests first, then push; red stops (exit 1)
    python3 coach/tools/safe_push.py --check         # tests only, as a pre-push check; exit 1 when red

Exit codes: 0 pushed (or check passed), 1 failed (push or tests on a branch), 2 held (main target, tests red).
"""
import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "coach", "tests"))
import frozen  # noqa: E402


def git(*args, check=True):
    return subprocess.run(["git", *args], cwd=ROOT, check=check, capture_output=True, text=True)


def changed(base):
    """[(status, path)] of what HEAD changes against base (A added, M modified, D deleted, R renamed)."""
    out = git("diff", "--name-status", "--no-renames", f"{base}...HEAD", check=False).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            rows.append((parts[0][:1], parts[-1]))
    return rows


def needs_tests(rows):
    """True when a change can turn the unit tests red: a system file, or a new file (a writer must be listed for it)."""
    return any(st == "A" or not frozen.is_live(p) for st, p in rows)


def run_tests():
    r = subprocess.run([sys.executable, os.path.join("coach", "tests", "live_guard.py")], cwd=ROOT,
                       capture_output=True, text=True)
    tail = (r.stdout + r.stderr).strip().splitlines()[-15:]
    return r.returncode == 0, "\n".join(tail)


def push(ref_to, tries=3, base_branch=None):
    for i in range(tries):
        if base_branch:
            git("fetch", "-q", "origin", base_branch, check=False)
            if git("rebase", "-q", f"origin/{base_branch}", check=False).returncode != 0:
                git("rebase", "--abort", check=False)
                return False, "rebase conflict"
        r = git("push", "origin", f"HEAD:{ref_to}", check=False)
        if r.returncode == 0:
            return True, ""
        time.sleep(2 * (i + 1))
    return False, r.stderr.strip()[-400:]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="safe_push.py")
    ap.add_argument("--to", default="main", help="target branch (default main)")
    ap.add_argument("--check", action="store_true", help="run the tests only, push nothing")
    a = ap.parse_args(argv)
    to_main = a.to == "main"
    base = "main"
    git("fetch", "-q", "origin", base, check=False)
    if to_main and not a.check:
        if git("rebase", "-q", "origin/main", check=False).returncode != 0:
            git("rebase", "--abort", check=False)
            print("FAILED: rebase onto main conflicts; nothing pushed")
            return 1
    rows = changed(f"origin/{base}")
    if not rows and to_main and not a.check:
        print("nothing to push")
        return 0
    if needs_tests(rows):
        ok, tail = run_tests()
        if not ok:
            print(tail)
            if a.check or not to_main:
                print("FAILED: tests red; fix before pushing")
                return 1
            hold = "hold/" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%MZ")
            pushed, err = push(hold)
            print(f"HELD: tests red, pushed to {hold} for the nightly fixer, main untouched" if pushed
                  else f"FAILED: tests red and the hold push failed too ({err})")
            return 2 if pushed else 1
    if a.check:
        print("tests ok" if needs_tests(rows) else "data only: no tests needed")
        return 0
    pushed, err = push(a.to, base_branch="main" if to_main else None)
    print(f"pushed to {a.to}" if pushed else f"FAILED: push to {a.to} ({err})")
    return 0 if pushed else 1


if __name__ == "__main__":
    sys.exit(main())
