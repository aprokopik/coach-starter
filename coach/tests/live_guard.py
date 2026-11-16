"""Run the whole suite once with the live data guard watching (6.96.2, Nov 16, 2026).

The guard (test_no_live_data.py, 6.2.2) fails if any test opens a LIVE athlete file. It used to run the
whole suite a second time in a child process, which doubled every CI run and, with the sprint's volume,
used up the month's GitHub Actions minutes. CI now runs this file instead: one pass, the same audit hook,
and test_no_live_data skips its own child run (COACH_LIVE_GUARD=outer). A plain
`python -m unittest discover -s coach/tests` still runs the guard the old way, so nothing is lost locally.

    python coach/tests/live_guard.py        # from the repo root; exits 1 on a failing test or a live read
"""
import json
import os
import sys
import traceback
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import frozen  # noqa: E402


def run(stream=None, verbosity=1):
    """Discover and run the suite under the audit hook. Returns (result, hits) with hits {path: [test, ...]}."""
    root = frozen.ROOT
    hits = {}

    def hook(event, args):
        if event != "open" or not args or not isinstance(args[0], (str, bytes, os.PathLike)):
            return
        p = os.path.abspath(os.fsdecode(args[0]))
        if not p.startswith(root + os.sep) or os.path.isdir(p):
            return
        rel = os.path.relpath(p, root)
        if not frozen.is_live(rel):
            return
        stack = traceback.extract_stack()
        if any(os.sep + "kit" + os.sep in f.filename for f in stack):
            return  # the kit builder reads the repo to make a scrubbed copy; its output keeps no values
        who = [f"{os.path.basename(f.filename)}:{f.name}" for f in stack if os.path.basename(f.filename).startswith("test_")]
        hits.setdefault(rel.replace(os.sep, "/"), set()).add(who[-1] if who else "?")

    os.chdir(root)
    sys.addaudithook(hook)  # before discovery, so reads at import time count too
    suite = unittest.defaultTestLoader.discover(HERE, top_level_dir=HERE)
    result = unittest.TextTestRunner(stream=stream or sys.stderr, verbosity=verbosity).run(suite)
    return result, {k: sorted(v) for k, v in hits.items()}


def main():
    os.environ["COACH_LIVE_GUARD"] = "outer"
    result, hits = run(verbosity=2)
    if hits:
        print("tests opened live athlete data; use frozen.repo_copy() or a fixture:")
        for path, who in sorted(hits.items()):
            print(f"  {path} <- {', '.join(who)}")
    return 0 if result.wasSuccessful() and not hits and result.testsRun > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
