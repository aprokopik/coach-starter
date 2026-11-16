"""Weekly usage line for the Sunday Alpha check (coach/ops/USAGE.md, the athlete Nov 16, 2026: "Fewer, bigger changes").

GitHub Actions minutes for the last 7 days are summed from the workflow runs' own start and end times (rounded up to
the minute per run, as GitHub bills), and compared with the weekly share of the monthly allowance.

    python3 coach/tools/usage_week.py                       fetch runs with gh and print the line
    python3 coach/tools/usage_week.py --runs runs.json      the same from a saved actions/runs answer
"""
import argparse
import json
import math
import subprocess
from datetime import datetime, timedelta, timezone

MONTHLY_MINUTES = 2000  # the account's included Actions minutes (GitHub Free), reset on the 1st
REPO = "{{GITHUB_OWNER}}/{{REPO}}"
CAP = 15  # minutes, the longest a test job may run


def _t(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def summarize(runs, now, days=7):
    """(minutes, runs counted, branches tested as pull requests) for runs that started in the last `days` days."""
    since = now - timedelta(days=days)
    mins, n, prs = 0, 0, set()
    for r in runs:
        start, end = r.get("run_started_at"), r.get("updated_at")
        if not start or not end or r.get("status") != "completed" or _t(start) < since:
            continue
        # capped at the job timeout: a run edited or re-run later keeps its old start time
        mins += min(CAP, max(1, math.ceil((_t(end) - _t(start)).total_seconds() / 60)))
        n += 1
        if r.get("event") == "pull_request":
            prs.add(r.get("head_branch"))
    return mins, n, len(prs)


def line(mins, n, prs, days=7):
    share = round(MONTHLY_MINUTES * days / 30)
    state = "inside" if mins <= share else "over"
    return (f"Usage, last {days} days: {mins} GitHub Actions minutes over {n} runs and {prs} pull request branches, "
            f"{state} the weekly share of {share} (USAGE.md).")


def fetch(now, days=7):
    """Page by page with &page= (some proxies refuse the Link header's numeric repository paths)."""
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    runs = []
    for page in range(1, 30):
        out = subprocess.run(["gh", "api", f"repos/{REPO}/actions/runs?per_page=100&page={page}&created=>={since}"],
                             capture_output=True, text=True, check=True).stdout
        got = json.loads(out).get("workflow_runs", [])
        runs += got
        if len(got) < 100:
            break
    return runs


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", help="a saved actions/runs answer (JSON)")
    a = ap.parse_args()
    now = datetime.now(timezone.utc)
    if a.runs:
        data = json.load(open(a.runs))
        runs = data.get("workflow_runs", data) if isinstance(data, dict) else data
    else:
        runs = fetch(now)
    print(line(*summarize(runs, now)))
