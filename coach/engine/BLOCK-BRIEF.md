# Block briefs and feedback points

Version 1.0, November 1, 2026 (the athlete asked for it: at the start of every block the coach sets the KPI goals, the focus KPIs, how success is measured and what it takes, as structural, personalized coaching with clear what, how and why and set feedback points). Generic rules for any athlete; names, races and numbers live in `coach/block_briefs.json`, `coach/levels.json`, `coach/plan.json` and `coach/CURRENT-STATE.md`. Tool: `coach/tools/brief.py` (progress, Sunday lines, what is due). Builds on `coach/engine/LEVELS.md` section 3 (block goals) and the exercise rotation (both also happen at block starts).

## 1. What a brief holds

One brief per training block (Taper and Recover blocks need none; their focus is recovery and the race):

- **Why this block**: its primary adaptation in one or two sentences, tied to the target race and the athlete's priorities (health and safety, enjoyment, then speed), plus the week's hours and any energy period (deficit, maintenance).
- **Focus KPIs, at most 3**, ranked. Pick from the Fitness KPIs (`coach/fitness_layout.json`) the ones the block's training actually moves. Each carries five lines, in plain words:
  - **Goal**: the number. Race-anchored markers use the block's Baseline, Target and Strong from `coach/levels.json` (LEVELS.md section 3); count goals (sessions, long runs) say the count.
  - **How**: the sessions that move it (the block's key sessions as defined in `coach/engine/KEY-SESSIONS.md`, the long session, the habit).
  - **Why**: what it means for the target race and for this athlete, in one sentence.
  - **Success**: how the end-of-block review will judge it (Target reached on the 28-day average, a count, a test result), with any safety condition (pain, sleep, energy).
  - **It takes**: the weekly commitment, stated so the athlete can check it (3 rides a week, 2 lifting slots kept).
- **Measured, not focus**: the tests and markers that keep showing but carry no block goal (a test that sets a baseline, a KPI held steady).
- **Feedback points**: dated rows (section 3).

A KPI the athlete has struggled to do (adherence) can be a focus KPI on purpose; say so in **It takes** and be plain in the Sunday line when it slips.

## 2. When and how it is agreed

1. When `brief.py due` reports a block starting within 14 days with no brief, draft it in `coach/block_briefs.json` (status `proposed`, `decide_by` = the block start) together with the LEVELS.md block-goal proposal and the exercise rotation, so the three arrive as one package.
2. Show it the day before the block starts (the brief feedback point), in the check-in: the why line, then one short paragraph per focus KPI (Goal, How, Why, Success, It takes), then the measured-not-focus line. The dashboard's This block card shows the same brief. When the athlete is present in chat, ask which KPIs are focus as one multiple-choice question (up to 4 options); otherwise the check-in's one question may ask it.
3. The athlete's choice is final: set `status: live`, record in LOG.md. The athlete answers in chat or the check-in, or with the dashboard tap on the Fitness tab (This block card, Next option: Accept as proposed, or I want changes with a one-line note, saved to `brief_choice/<block_key>`); the morning run records either with `brief.py accept <block_key>` or `brief.py change <block_key> --note ...` (RUNBOOK step 4). A change request keeps the brief proposed and `brief.py due` names it until the coach answers: revise the brief, set `set_on` to the revision day and remove `change_note` and `change_asked_on`, which brings the dashboard buttons back. Unanswered by `decide_by`: set `live` as proposed and say so once in the check-in.
4. Goals do not move mid-block on their own (LEVELS.md). A change is the athlete's call at a feedback point, logged as a new note on the brief.

## 3. Feedback points

| Point | When | What the check-in says |
|---|---|---|
| Brief | the day before the block | section 2 |
| Sunday line | every Sunday inside the block | one line per focus KPI from `facts.json block_brief.current.focus[].line`: where it is, against what, and on track / behind / target reached (behind = progress more than 15 points under the share of the block gone). No line for a KPI with no reading; say "no reading" once. |
| Mid-block review | the Sunday nearest the midpoint, before a recovery week when there is one | per focus KPI: on track, adjust the plan (named change), or reset the goal (only with the athlete's yes); one sentence each, plus what changes next week |
| Test | a dated test inside the block | the result in the test's own check-in, against the KPI's goal when it is one |
| End-of-block review | the block's last day (after its test) | per focus KPI: hit (Target or Strong), close, or missed, with one sentence on why and what it says about the athlete; then the next block's draft brief. Write `outcome` on each `brief_kpi` row and set the brief `closed` |

Reviews are information, not grades; tone follows RULES 13 (direct, no guilt). Celebrations stay at most one per check-in (RUNBOOK, Health Pillars).

## 4. Data

`coach/block_briefs.json`, flat rows (the dashboard runtime returns nested lists as text): `brief` (block_key, block, name, start, end, status, set_on, decide_by, why, measured, note), `brief_kpi` (block_key, rank, key, label, sport, goal, how, why, success, needs, count_target, count_success, outcome), `brief_point` (block_key, date, type: brief, sunday, mid, test, end; label). `brief.py` adds progress fields (`p_now_text`, `p_pct`, `p_expected`, `p_state`, `p_line`) for the dashboard and `facts.json block_brief` for the check-in. Run pace and bike power progress come from `brief.fitness_series`, the Python twin of the page's fitness calculation; keep the two in step.

## 5. Group order and weights

The Fitness tab groups KPIs by race type (named for the type with the current target race beside it) plus Foundation, ordered inside each group by weight (1 to 10, `coach/fitness_layout.json`). Review the weights when a target race changes and at each brief; say any change in the check-in in one line. Weights are coaching judgment (race time share by leg, cutoff margins, the athlete's limiters), labelled as such.
