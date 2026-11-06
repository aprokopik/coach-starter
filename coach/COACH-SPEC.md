# COACH-SPEC has moved (Oct 19, 2026)

The operating spec was split into three files with different change rates, so that one source holds each rule, scale and threshold:

- `coach/engine/RULES.md`: the generic coaching rules (same section numbers as v1.9, so "spec 5a" still means RULES 5a). Changed only with the athlete's agreement.
- `coach/athlete/PROFILE.md` and `coach/athlete/profile.json`: the athlete's stable facts, preferences and parameters.
- `coach/ops/RUNBOOK.md`: how the runs work (git, the Garmin pull, facts, the dashboard, the task prompts).

`coach/CURRENT-STATE.md` is unchanged in role: live decisions, events, forecasts and the goal-conflicts register; it outranks the rules where they differ. Scales, thresholds and record schemas are in `coach/engine/schemas.json`. The last full spec, v1.9 of October 18, 2026, is kept at `history/COACH-SPEC-v1.9.md`.
