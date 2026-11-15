## What and why

## Root cause (for a fix)

## Covers which future cases

## Checks
- [ ] `python3 -m unittest discover -s coach/tests` passes (CI runs it too)
- [ ] Data path changed (a feed, a task, a schedule or a fallback): `coach/ops/data_paths.json` updated in this PR, and RUNBOOK / CURRENT-STATE point to it instead of restating it
- [ ] coach.json rows changed: the consumers listed in `data_paths.json` `consumers_outside_repo` still get what they read
- [ ] VERSION bumped and CHANGELOG.md entry added (or: data only, no bump)
- [ ] the athlete signed off before merge (Proposal and Review Gate)
