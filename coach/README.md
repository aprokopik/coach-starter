# coach/

| File | Purpose | Who writes |
|---|---|---|
| engine/RULES.md | The generic coaching rules (section numbers as COACH-SPEC v1.9) | changed only with the athlete's agreement |
| engine/schemas.json | Scales, thresholds and record schemas; the one source for every number the rules use | changed only with the athlete's agreement |
| athlete/PROFILE.md, athlete/profile.json | the athlete: stable facts, preferences, parameters | coach, when the athlete states a lasting fact |
| athlete/RESPONSE-PROFILE.md | Observed individual response facts with counts | coach, monthly review |
| ops/RUNBOOK.md, ops/TASK-PROMPT-*.md | How the runs work; the scheduled-task prompts | coach, with the athlete's agreement for the prompts |
| COACH-SPEC.md | Pointer to the files above (v1.9 kept in history/) | frozen |
| facts.json | The morning's computed numbers (tools/morning_facts.py); never edited by hand | tool, every run |
| predictions.csv, outcomes.csv | The prediction log and its reconciliation (tools/reconcile.py) | tool, every run |
| CURRENT-STATE.md | Live decisions, events, latest evidence, forecasts, open questions | coach, when something changes |
| LOG.md | One short dated entry per check-in, plus Reported facts | coach, every run |
| today.json | Structured copy of the latest check-in, used by the dashboard | coach, every morning |
| DASHBOARD.md | Dashboard link and how each run refreshes it | coach |
| wellness.csv | Sunday 1 to 5 ratings: energy, mood, stress, motivation | coach, from the athlete's answer |
| feel_daily.csv | Daily feel check: sleep, energy, legs, stress 1 to 5 from Oct 18, 2026 (scale column; 1 to 10 before), pain none/niggle/hurts/stop stored 0/1/3/6 plus site, Reported | coach, from the athlete's replies |
| feel_sessions.csv | Session RPE (CR-10), vs plan, pain, fuel; srpe_load = RPE x minutes, Reported; last column activity_id (Garmin id or manual-<date>-<type>) | coach, from the athlete's replies and the dashboard |
| week.json | Week plan by day for the dashboard's Week view (schema in DASHBOARD.md) | coach: Sundays for the next week, and on any replan |
| zones.json | Heart rate zones used for the dashboard's time-in-zone (provisional) | coach: after threshold tests |
| benchmarks.json | Fitness benchmark tests and their results for the Trends page | coach: when a test is scheduled or done |
| races.json | Races, race plans and kit lists for the dashboard's Race hub | coach, when a race plan or status changes |
| exercises.json | Exercise library for the strength routine: stable ids, movement pattern, what each carries over to, dose | coach |
| strength_rotation.json | Exercise swaps planned per training block, with status (draft, proposed, accepted, kept, applied) | coach via tools/lifts.py; the athlete accepts or keeps |
| strength_log.csv, lift_history.json | Every logged set under its exercise id; per-exercise best, trend, stalls and returns (tools/lifts.py) | tool, every run |
| plan.json | Training blocks, milestones, fuel periods and the weight path (mirrors the plan doc) | coach, when the plan changes |
| dashboard/coach.json | The dashboard's coach dataset, built by tools/build_dashboard.py; never edit by hand | coach, each morning run |
| dashboard/index.html | The dashboard page (published to the dashboard's store) | coach, only when the athlete asks for a change |
| health.json | Health inputs the watch can't measure for the Health and longevity card: self-tests, reported labs and BP, nicotine, diet, visits (Reported) | coach, from the athlete's reports |
| health-baseline.md | Physicals and labs the athlete reports | coach, from the athlete's report |
| research/PROTOCOL.md | Evidence method, hierarchy and the monthly scan steps (coaching instructions) | changed only with the athlete's agreement |
| research/LIBRARY.md | Vetted sources with findings, limits, fit to the athlete and status, plus the rule-to-evidence map | coach and the monthly scan |
| research/QUEUE.md | Open questions, watch list, proposed changes, items pending for Sunday, scan log | coach and the monthly scan |

## today.json schema
The schema is in `coach/engine/schemas.json` (`today_json`); the example below is kept for orientation and now also carries `call` and the `expected` block the prediction log needs.

```json
{"rows": [{
  "date": "YYYY-MM-DD",
  "generated_at_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "readiness": "GREEN | YELLOW | RED",
  "confidence": "high | moderate | low",
  "call": "push | hold | restrain",
  "reason": "one sentence",
  "data_quality": "one sentence: complete, partial or stale, missing",
  "workout_title": "short name",
  "purpose": "one sentence",
  "nominal": "minutes, structure, RPE",
  "upper": "precise optional upper bound",
  "fallback": "precise fallback",
  "choice_rule": "one sentence",
  "phase": "Foundation",
  "week_adaptation": "the week's single primary adaptation",
  "question": "one question, or empty string",
  "expected": {"discipline": "bike", "completion": "nominal", "minutes": 60, "upper_minutes": 75, "fallback_minutes": 40, "rpe": 3, "next_morning_legs_min": 3, "note": ""}
}]}
```
