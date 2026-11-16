"""Frozen test inputs (6.2.2, Nov 10, 2026).

Tests never read the athlete's live data. The live files change every day (Garmin pulls, the morning
check-in, BP readings, a brief going live), so a test that reads them passes one day and fails the next
with no code change: test_brief went red on main on Nov 9 12:48 UTC when the morning run set the Base
brief live. Every test that needs real-shaped data works in a temporary copy built here instead.

Two kinds of repo file:
  * SYSTEM files are code, rules and reference tables. They change only in a system PR, which runs the
    tests, so a test may read them from the checkout.
  * Everything else under coach/ and data/ is LIVE: written by a data route (coach/ops/data_paths.json)
    or by the coach. Deny by default: a new data file is live without anyone listing it.

coach/tests/fixtures/repo/ is a frozen copy of the live files the tests use (commit 3811b1f, Nov 9, 2026).
It is never refreshed by a data route; a test that needs a new shape edits its own copy in setUp.
test_no_live_data.py runs the whole suite with an audit hook and fails if any test opens a LIVE file.
"""
import os
import shutil
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
FROZEN = os.path.join(HERE, "fixtures", "repo")

# Code, rules and reference tables: changed only by a system PR.
SYSTEM_PREFIXES = (
    "coach/tools/", "coach/tests/", "coach/engine/", "coach/ops/", "coach/dashboard/",
    "kit/", "scripts/", ".github/", "setup/", "history/",
)
SYSTEM_FILES = {
    "VERSION", "CHANGELOG.md", "README.md",
    "coach/COACH-SPEC.md", "coach/README.md", "coach/DASHBOARD.md", "coach/research/PROTOCOL.md",
    # reference tables (the kit ships these as they are)
    "coach/norms.json", "coach/age_grade.json", "coach/exercises.json", "coach/routines.json", "coach/checkins.json", "coach/pillars.json", "coach/metric_catalog.json",
    "coach/race_template.json", "coach/race_tree.json", "coach/fitness_layout.json", "coach/zones.json", "coach/benchmarks.json",
    # the meal guide's extras list: changed only by a PR after the athlete agrees (6.13.0)
    "coach/nutrition_extras.json",
}
# Inside a system folder but written by the coach or a data route.
LIVE_INSIDE_SYSTEM = {
    "coach/dashboard/coach.json", "coach/dashboard/season.html", "coach/ops/HOME-BP.md",
}
LIVE_INSIDE_SYSTEM_PREFIXES = ("coach/dashboard/datasets/",)

# System files a repo copy needs beside the frozen data (read by the tools from the working directory).
COPY_SYSTEM = ["coach/engine", "coach/ops/data_paths.json", "coach/norms.json", "coach/age_grade.json", "coach/exercises.json", "coach/routines.json",
               "coach/checkins.json", "coach/pillars.json", "coach/race_template.json", "coach/metric_catalog.json",
               "coach/fitness_layout.json", "coach/zones.json", "coach/race_tree.json"]


def is_live(rel):
    """True when a repo-relative path is athlete data that a test must not read."""
    rel = rel.replace(os.sep, "/")
    if rel in LIVE_INSIDE_SYSTEM or rel.startswith(LIVE_INSIDE_SYSTEM_PREFIXES):
        return True
    if rel in SYSTEM_FILES or rel.startswith(SYSTEM_PREFIXES):
        return False
    return rel.startswith(("coach/", "data/", "state/"))


def repo_copy():
    """A temporary directory laid out like the repo: the frozen data plus the system files the tools read.
    The caller chdirs into it and removes it (shutil.rmtree) in tearDown."""
    tmp = tempfile.mkdtemp(prefix="coach-fixture-")
    shutil.copytree(FROZEN, tmp, dirs_exist_ok=True)
    for rel in COPY_SYSTEM:
        src, dst = os.path.join(ROOT, rel), os.path.join(tmp, rel)
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        elif os.path.exists(src):  # a kit may drop a reference table it does not use
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy(src, dst)
    return tmp


# Tools that hold the repo root in a module constant (read once at import), not the working directory.
ROOT_MODULES = ("morning_facts", "race_check", "key_check", "build_season")


class InRepoCopy:
    """Mixin for a unittest.TestCase class: every test runs inside one repo_copy(). The working directory moves
    there, and the tools that keep the repo root in a constant (ROOT_MODULES; build_season.PAGE too) point
    at the copy for the class, then back."""
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import importlib
        import sys
        tools = os.path.join(ROOT, "coach", "tools")
        if tools not in sys.path:
            sys.path.insert(0, tools)
        cls._old_cwd = os.getcwd()
        cls.repo = repo_copy()
        os.chdir(cls.repo)
        cls._saved = []
        for name in ROOT_MODULES:
            mod = importlib.import_module(name)
            for attr, val in (("ROOT", cls.repo), ("PAGE", os.path.join(cls.repo, "coach", "dashboard", "season.html"))):
                if hasattr(mod, attr):
                    cls._saved.append((mod, attr, getattr(mod, attr)))
                    setattr(mod, attr, val)

    @classmethod
    def tearDownClass(cls):
        for mod, attr, val in cls._saved:
            setattr(mod, attr, val)
        os.chdir(cls._old_cwd)
        shutil.rmtree(cls.repo, ignore_errors=True)
        super().tearDownClass()
