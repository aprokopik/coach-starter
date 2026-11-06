# Levels, norms and block goals

Version 1.0, October 23, 2026. Generic rules for how any athlete's markers get levels, how those levels are anchored, and when they change. Written for any athlete: no names, races or numbers of a person live here; those are in `coach/levels.json` (block goals), `coach/norms.json` (population distributions), `coach/athlete/PROFILE.md` and `coach/CURRENT-STATE.md`. Tools: `coach/tools/markers.py` (tiers, ranks, kudos), `coach/tools/levels.py` (block rows), the dashboard (`coach/DASHBOARD.md`). Engine rules: `coach/engine/RULES.md` section 14 points here.

Why: milestones that are near, visible and honest keep an athlete engaged (gamified activity programmes raise activity modestly, Mazeas 2022; the number of game mechanics did not matter, a reachable next step does), and the athlete must always be able to tell what a level rests on.

## 1. Three layers on every marker

Every marker shows up to three layers, each coloured by its basis, and the detail panel names the basis of every band:

| Layer | Basis tag | What it is | Moves when |
|---|---|---|---|
| Research / population | `research` (blue) | A published study, a guideline, or a real distribution of finishers or riders (`coach/norms.json`) | Only when the source is refreshed, or the athlete's age or sex group changes; logged |
| Coaching guideline | `coach` (grey) | A coaching convention with no study or dataset behind the cut (say so in the band note) | Only by a logged decision |
| Race target / block goal | `race` (orange) | A race forecast or cutoff, or a training block's Baseline, Target and Strong lines (`coach/levels.json`) | Only at a block boundary or a logged re-anchor (section 4) |

A band never moves on its own. Every change is logged in `coach/LOG.md` with the reason and said in that morning's check-in in one line.

Inside each band the page cuts equal sub-tiers (I, II, III), numbered toward the better edge, so a next milestone is always close; sub-tiers are steps for pacing progress, not evidence, and the page says so. A milestone first crossed in the last 7 days and still held is a kudos (dashboard Today card, check-in line).

## 2. Norms: choosing a population

`coach/norms.json` rows: `key, unit, better (1 higher is better, -1 lower), population, source, url, date, n, breakpoints [[value, percent of the population better than it], ...], note`. The page and `markers.py` interpolate between breakpoints; `markers.py` can also cut percentile bands from them (`tiers_from_norm`).

Order of preference for a marker's population:
1. **Distance-level** finisher or rider distributions for the athlete's sex and age group (all races of that distance; e.g. all 70.3 races, all 5K road races in a year).
2. The same without the age split, with a note.
3. A **race-specific** distribution as a note where the course or field clearly differs from the distance norm (heat, a slow field, a flat course). **Trail ultras are the exception**: the race's own prior years, or two or three similar courses, come first, because course decides the time.
4. A **derived** norm: a distribution converted into the marker's unit (a split into pace per mile; a split into watts through a power model). Label `Derived` and `Estimated`, state the model's assumptions in the note, and say what it means ("if held for the whole leg": a floor, not a race prediction).
5. A **selected** sample (one event, one platform, people who bought a test) only as a secondary note, labelled weak; never as the scale.

A norm published as mean and SD becomes breakpoints by a normal approximation, labelled Estimated, with the skew named (finish times have a slow tail). Keep the raw data behind a transcribed distribution in `coach/research/norms/` with its provenance. Refresh a norm only by a logged edit; record the date and n. Public sources, generic search terms; nothing of the athlete's is sent anywhere.

Every scale carries bands **below** the athlete as well as above, wherever the distribution supports them (Bottom 10%, 5%, 1% from a mean-and-spread norm; the lowest published percentiles of a normative table): a level to stand on and move up from matters as much as the next one up (the athlete, Oct 23). Where the data stop (a dataset published only to its bottom quarter), the lowest band stays open rather than invented.

Markers with no credible population (output at a fixed heart rate, HR drift, sleep-midpoint spread) carry the research layer through a derived norm where one is defensible, otherwise a coaching guideline marked as such, plus the block goals. Say plainly when no guideline exists rather than inventing one.

## 3. Block goals: Baseline, Target, Strong

The block goals are one part of the block brief (`coach/engine/BLOCK-BRIEF.md`, Nov 1, 2026), which also names the focus KPIs, how and why, what success is and the feedback points.

`coach/levels.json` rows (`kind: level_block`): `key` (marker), `block_key` and `block` (from `coach/plan.json`), `start`, `end`, `baseline` (null = measured on the page as the marker's 28-day average on the block's first day; a number overrides it, e.g. a test result), `target`, `strong`, `status` (`hold` | `provisional` | `proposed` | `set` | `closed`), `set_on`, `confirmed_on`, `outcome`, `note`.

A block goal is a **status beside the level, never the level itself**: the level is always read on the research/population or coach-guide bands, so it stays comparable across blocks and athletes; the goal shows progress from baseline toward Target and then Strong for the block, on whichever markers carry a goal that period, and moves to other markers as the short-term focus changes. Meaning: Baseline is where the athlete enters the block (measured). Target is where the coach expects them to come out of it with the planned training done; Strong is the good-day outcome. The page draws each block's three lines across that block's dates only, keeps earlier blocks as history (grey) and shows the next block's lines dotted as provisional. Default view: the current and next block; every past block on the "All levels" zoom. Hold blocks (taper, recover) carry a baseline only.

**At every block start** (the Sunday review before it and the block's first morning):
1. **Measure** the baseline for each candidate marker (28-day average, or the latest test).
2. **Propose which markers get block goals.** Offer a short menu as chat multiple choice when the athlete is present (up to 4 per question), otherwise as a numbered list in the check-in: the heart-rate-normalised markers (pace at an easy HR, power at an easy HR), the test markers whose test ends the block (FTP, 5K, swim pace), durability, and habit markers (strength days, sleep regularity, consistency). Say in one line why each fits this block's primary adaptation. The athlete's choices are the block's goal set; record them in LOG.md.
3. **Propose Target and Strong** for each chosen marker with the reasoning (race forecast and cutoffs, the block's adaptation, the last tests, the baseline, what similar blocks produced before), as a row with `status: proposed`. Ask the athlete to confirm or edit (one question per check-in at most; the dashboard chart shows the proposal dotted meanwhile).
4. **Go live** on confirmation (`status: set`, `confirmed_on`). If the athlete has not answered after 3 days the lines go live as proposed and the check-in says so once.
5. **Never move** a set block's lines before its end. A correction is a new row with a note, and the old row stays with `status: closed` and `outcome: superseded`.

**At every block end** (the Sunday review that closes it): record the outcome on the row (`outcome`: the level reached, e.g. "Target to Strong II", with the end value) and note it in the review; the next block starts from a fresh baseline. Levels never go down because a scale moved: a harder next block is a new scale, and the old one stays in history.

**New tiers above**: when an athlete passes Strong, the band "Above and beyond" holds; add no new line until the next block, which starts from the new baseline.

## 4. When targets change: re-anchoring

A race added, upgraded, moved or dropped while a block is running:
- **A race** (the season's target): ask the athlete, with both consequences stated, whether to keep the current block's lines to its end (default) or to close the block now with a note and open a new one anchored on the new race. Ask once, as chat multiple choice when present, else in the check-in.
- **B race**: keep the current block's lines; the new race shapes the next block's proposal; say so in one line.
- **C race**: no change to block goals; it enters the week plan only.
Either way the forecasts and cutoffs in `coach/races.json` and `CURRENT-STATE.md` update at once, and the research and coaching layers never move for a race change.

A test result mid-block (an FTP or 5K test) updates forecasts and the next block's proposal, not the current block's lines.

## 5. New athlete, new season

Initialising an athlete (or a new season) in this order, asking at most four questions per step and recording every answer as Reported:
1. **Who**: sex, age group, disciplines, the target races with priority A/B/C and their cutoffs (so `norms.json` can pick populations and `races.json` can carry limits).
2. **Which markers** the dashboard shows (the defaults in `markers.py` plus any the athlete asks for) and which get block goals in the first block (section 3, step 2).
3. **Which populations** compare them: confirm the sex and age group used for every norm; where a norm is missing for their distance, say what stands in (section 2) and queue the search in `coach/research/QUEUE.md`.
4. **Blocks**: `plan.json` blocks named by phase and target race; `levels.py init` writes hold rows for tapers and recoveries and provisional rows for the rest; the first block's lines follow section 3.
5. **Preferences**: how many sub-tiers (default 2 to 3), which zoom opens by default (default Nearby levels), whether kudos go in the check-in (default yes).

## 6. Checks the coach runs

- Morning run: kudos rows since the previous check-in; a block starting today or tomorrow triggers section 3; a `proposed` row older than 3 days goes live with a line.
- Sunday review: the coming week's block boundaries; outcomes for a block that ended; a `provisional` row for a block starting within 14 days becomes a proposal.
- Monthly: norms older than 18 months or with n under 200 are flagged for refresh; QUEUE.md carries the searches.
- Quarterly: the whole level set is reviewed with the goal-conflict register (RULES 1a).

## 7. Motivation mechanics (adopted Oct 23, 2026; the athlete's health-first rule governs)
Mechanisms are chosen because they reward doing the right thing, not because they bring the athlete back: the app is a tool to put down.
- **Plan-adherence streak** (`coach/streak.json`, `coach/tools/streak.py`, the Today card): a day counts when the plan was followed, and a rest day or a fallback is full credit, so the streak rewards restraint as much as effort. Travel, illness, a replanned rest and a RED morning freeze it (the coach records the freeze with its reason the same day, never later to hide a miss); a missed planned session breaks it. Never shown with guilt wording; a broken streak restarts without comment.
- **Endowed progress**: the Season so far card (hours, longest sessions, levels climbed and held, streak, block goals closed) and the "Reached" trail show credit already earned; the Sunday check-in carries the same recap in three lines.
- **Implementation intentions**: a key session's choice rule is written as "When <cue>, then <action>" with the time and place when the athlete has given them.
- **Fresh starts**: goals and proposals land at block starts and Mondays.
- **Not used**: variable-reward schedules, FOMO or guilt notifications, more than one message a day, leaderboards or comparison with named people. Social features only when the athlete asks (BACKLOG.md).
- **App review**: the first Sunday of each month the check-in lists the top items of `coach/BACKLOG.md` and asks which to take up; the monthly review checks that engagement features raised adherence, rest-day compliance and sleep regularity rather than volume, and drops any that did not.

