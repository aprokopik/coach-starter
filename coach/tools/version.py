"""The Coach package version: VERSION at the repo root, with CHANGELOG.md beside it.

    python3 coach/tools/version.py                  print the current version
    python3 coach/tools/version.py check            VERSION format, changelog head, not below the highest v* tag
    python3 coach/tools/version.py missing          changelog versions with no v* tag yet, with the first
                                                    main commit whose VERSION carried them (release-tag.yml)
    python3 coach/tools/version.py tag              print the commands that tag main (runs nothing)
    python3 coach/tools/version.py bump major|minor|patch
                                                    rewrite VERSION, add an empty dated entry atop CHANGELOG.md

The rule (MAJOR, MINOR, PATCH; data commits never bump) heads CHANGELOG.md. --root <dir> reads another checkout.
"""
import os
import re
import subprocess
import sys
from datetime import date

VER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
HEAD_RE = re.compile(r"^## (\S+) \((\d{4}-\d{2}-\d{2})\)\s*$")


def read_version(root):
    return read(root, "VERSION").strip()


def read(root, name):
    with open(os.path.join(root, name)) as fh:
        return fh.read()


def parse(v):
    m = VER_RE.match(v)
    return tuple(int(x) for x in m.groups()) if m else None


def real_date(s):
    try:
        return bool(date.fromisoformat(s))
    except ValueError:
        return False


def changelog_head(root):
    """(version, date) of the first '## X.Y.Z (YYYY-MM-DD)' heading, or None."""
    for line in read(root, "CHANGELOG.md").splitlines():
        if line.startswith("## "):
            m = HEAD_RE.match(line)
            return (m.group(1), m.group(2)) if m else (line.strip(), None)
    return None


def highest_tag(root):
    try:
        out = subprocess.run(["git", "-C", root, "tag", "--list", "v*"], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    tags = [p for p in (parse(t.strip()[1:]) for t in out.splitlines()) if p]
    return max(tags) if tags else None


def check(root):
    """List of problems; empty means the version is consistent."""
    probs = []
    v = read_version(root)
    pv = parse(v)
    if not pv:
        probs.append(f"VERSION {v!r} is not MAJOR.MINOR.PATCH")
    hv, hd = changelog_head(root) or ("(none)", None)
    if hd is None:
        probs.append(f"CHANGELOG.md top heading {hv!r} is not '## X.Y.Z (YYYY-MM-DD)'")
    else:
        probs += [f"CHANGELOG.md top entry is {hv}, VERSION is {v}"] * (hv != v)
        probs += [f"CHANGELOG.md top entry date {hd} is not a real date"] * (not real_date(hd))
    top = highest_tag(root)
    if pv and top and pv < top:
        probs.append(f"VERSION {v} is lower than the highest tag v{'.'.join(map(str, top))}")
    return probs


def changelog_versions(root):
    """Every '## X.Y.Z (date)' version in CHANGELOG.md, newest first; range headings ('1.0.0 to 1.9.0') skipped."""
    out = []
    for line in read(root, "CHANGELOG.md").splitlines():
        m = HEAD_RE.match(line) if line.startswith("## ") else None
        if m and parse(m.group(1)):
            out.append(m.group(1))
    return out


def git(root, *args):
    return subprocess.run(["git", "-C", root, *args], capture_output=True, text=True, check=True).stdout


def first_commit_with_version(root, v, ref="HEAD"):
    """The oldest commit on ref whose VERSION file reads exactly v, or None."""
    try:
        out = git(root, "log", "--reverse", "--format=%H", "-S", v, ref, "--", "VERSION")
    except (OSError, subprocess.CalledProcessError):
        return None
    for sha in out.split():
        try:
            if git(root, "show", f"{sha}:VERSION").strip() == v:
                return sha
        except subprocess.CalledProcessError:
            continue
    return None


def missing_tags(root, ref="HEAD"):
    """[(tag, sha or None)] for each changelog version without a v* tag; sha None = no commit carries it."""
    try:
        have = set(git(root, "tag", "--list", "v*").split())
    except (OSError, subprocess.CalledProcessError):
        have = set()
    return [(f"v{v}", first_commit_with_version(root, v, ref)) for v in changelog_versions(root) if f"v{v}" not in have]


def bump(root, part, today=None):
    major, minor, patch = parse(read_version(root)) or (0, 0, 0)
    new = {"major": f"{major + 1}.0.0", "minor": f"{major}.{minor + 1}.0", "patch": f"{major}.{minor}.{patch + 1}"}[part]
    with open(os.path.join(root, "VERSION"), "w") as fh:
        fh.write(new + "\n")
    lines = read(root, "CHANGELOG.md").splitlines(keepends=True)
    at = next((i for i, l in enumerate(lines) if l.startswith("## ")), len(lines))
    entry = [f"## {new} ({(today or date.today()).isoformat()})\n", "- \n", "\n"]
    with open(os.path.join(root, "CHANGELOG.md"), "w") as fh:
        fh.writelines(lines[:at] + entry + lines[at:])
    return new


def main(argv):
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if "--root" in argv:
        i = argv.index("--root")
        root, argv = argv[i + 1], argv[:i] + argv[i + 2:]
    cmd = argv[0] if argv else ""
    if cmd == "":
        print(read_version(root))
    elif cmd == "check":
        probs = check(root)
        for p in probs:
            print("FAIL " + p)
        if probs:
            return 1
        print("OK " + read_version(root))
    elif cmd == "missing":  # one line per untagged version: "vX.Y.Z <sha>" or "vX.Y.Z (no commit carries it)"
        for tag, sha in missing_tags(root):
            print(f"{tag} {sha or '(no commit carries it)'}")
    elif cmd == "tag":  # <sha>: the merge commit on main that carries this VERSION (release-tag.yml does this on main)
        v = read_version(root)
        print(f'git tag -a v{v} -m "Coach {v}" <sha>\ngit push origin v{v}')
    elif cmd == "bump" and len(argv) == 2 and argv[1] in ("major", "minor", "patch"):
        print(bump(root, argv[1]))
    else:
        print(__doc__.strip())
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
