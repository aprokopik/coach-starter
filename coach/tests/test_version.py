"""Package version (coach/tools/version.py): VERSION, the CHANGELOG.md head, check and bump.

The repo files are read as they are; bump runs on a temp copy, never the checkout."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TOOL = os.path.join(ROOT, "coach", "tools", "version.py")
sys.path.insert(0, os.path.join(ROOT, "coach", "tools"))

import version  # noqa: E402


def run(*args):
    return subprocess.run([sys.executable, TOOL, *args], capture_output=True, text=True)


class RepoVersion(unittest.TestCase):
    def test_version_format(self):
        with open(os.path.join(ROOT, "VERSION")) as fh:
            raw = fh.read()
        self.assertRegex(raw, r"^\d+\.\d+\.\d+\n$")

    def test_changelog_head_matches(self):
        v, d = version.changelog_head(ROOT)
        self.assertEqual(v, version.read_version(ROOT))
        self.assertTrue(re.fullmatch(r"\d{4}-\d{2}-\d{2}", d))
        date.fromisoformat(d)

    def test_check_passes_on_repo(self):
        r = run("check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(run().stdout.strip(), version.read_version(ROOT))

    def test_tag_prints_without_running(self):
        v = version.read_version(ROOT)
        self.assertEqual(run("tag").stdout.splitlines(), [f'git tag -a v{v} -m "Coach {v}" <sha>', f"git push origin v{v}"])


class Bump(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        for name in ("VERSION", "CHANGELOG.md"):
            shutil.copy(os.path.join(ROOT, name), self.dir)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def test_bump_each_part(self):
        major, minor, patch = version.parse(version.read_version(self.dir))
        for part, want in (("patch", f"{major}.{minor}.{patch + 1}"), ("minor", f"{major}.{minor + 1}.0"), ("major", f"{major + 1}.0.0")):
            r = run("--root", self.dir, "bump", part)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(r.stdout.strip(), want)
            self.assertEqual(version.read_version(self.dir), want)
            self.assertEqual(version.changelog_head(self.dir), (want, date.today().isoformat()))
            self.assertEqual(run("--root", self.dir, "check").returncode, 0)

    def test_bump_keeps_rule_and_old_entries(self):
        with open(os.path.join(self.dir, "CHANGELOG.md")) as fh:
            before = fh.read()
        version.bump(self.dir, "minor", today=date(2026, 12, 1))
        with open(os.path.join(self.dir, "CHANGELOG.md")) as fh:
            after = fh.read()
        head = before[:before.index("\n## ") + 1]
        self.assertTrue(after.startswith(head + "## "))
        self.assertTrue(after.endswith(before[len(head):]))
        self.assertIn("(2026-12-01)", after.splitlines()[head.count("\n")])

    def test_check_catches_mismatch_and_bad_format(self):
        with open(os.path.join(self.dir, "VERSION"), "w") as fh:
            fh.write("9.9.9\n")
        r = run("--root", self.dir, "check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("VERSION is 9.9.9", r.stdout)
        with open(os.path.join(self.dir, "VERSION"), "w") as fh:
            fh.write("1.0\n")
        self.assertIn("not MAJOR.MINOR.PATCH", run("--root", self.dir, "check").stdout)


if __name__ == "__main__":
    unittest.main()


class MissingTags(unittest.TestCase):
    """missing_tags on a scratch repo: untagged changelog versions, first commit carrying each VERSION."""

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.d, ignore_errors=True)
        g = lambda *a: subprocess.run(["git", "-C", self.d, *a], check=True, capture_output=True, text=True)
        g("init", "-q", "-b", "main")
        g("config", "user.email", "t@t"); g("config", "user.name", "t")
        self.g = g
        self.commit("4.0.0", "## 4.0.0 (2026-11-05)\n- a\n\n## 3.3.0 (2026-11-04)\n- b\n\n## 1.0.0 to 1.9.0 (2026-10-09)\n- spec\n")
        self.sha400 = g("rev-parse", "HEAD").stdout.strip()
        self.commit("4.0.0", None, note="data only")
        self.commit("4.0.1", "## 4.0.1 (2026-11-05)\n- c\n\n## 4.0.0 (2026-11-05)\n- a\n\n## 3.3.0 (2026-11-04)\n- b\n")
        self.sha401 = g("rev-parse", "HEAD").stdout.strip()

    def commit(self, v, changelog, note=""):
        with open(os.path.join(self.d, "VERSION"), "w") as fh:
            fh.write(v + "\n")
        if changelog is not None:
            with open(os.path.join(self.d, "CHANGELOG.md"), "w") as fh:
                fh.write("# Changelog\n\n" + changelog)
        with open(os.path.join(self.d, "LOG.md"), "a") as fh:
            fh.write(note + "\n")
        self.g("add", "-A"); self.g("commit", "-q", "-m", f"v{v} {note}")

    def test_first_commit_per_version_and_untagged_only(self):
        self.assertEqual(version.missing_tags(self.d),
                         [("v4.0.1", self.sha401), ("v4.0.0", self.sha400), ("v3.3.0", None)])
        self.g("tag", "-a", "v4.0.0", "-m", "x", self.sha400)
        self.assertEqual(version.missing_tags(self.d), [("v4.0.1", self.sha401), ("v3.3.0", None)])
        out = run("missing", "--root", self.d).stdout.splitlines()
        self.assertEqual(out, [f"v4.0.1 {self.sha401}", "v3.3.0 (no commit carries it)"])
        self.assertEqual(version.changelog_versions(self.d), ["4.0.1", "4.0.0", "3.3.0"])

    def test_workflow_line_filter_matches_tool_output(self):
        pat = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+ [0-9a-f]{40}$")
        lines = run("missing", "--root", self.d).stdout.splitlines()
        self.assertEqual([l for l in lines if pat.match(l)], [f"v4.0.1 {self.sha401}", f"v4.0.0 {self.sha400}"])
