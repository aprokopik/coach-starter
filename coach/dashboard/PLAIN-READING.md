# Plain reading test for Today

Every Today card must read clearly to someone opening the dashboard for the first time (the athlete, Nov 14, 2026: "This is not clear and simple"; a training partner was confused by the plan card). Function first: what the card is for and what to do with it. Then words. Then looks.

## The test, before any Today change ships

1. Build the page and run the word check (it fails on any hit):
   `python3 coach/dashboard/harness/build.py --out /tmp/p.html && node coach/dashboard/harness/plainwords.js /tmp/p.html`
   It reads Today with every disclosure closed and flags shorthand (SD, LV, XP), coach jargon (bound, ladder, fallback, A race, Hold:), game words (quest) and UTC clock times. `--open` also checks the opened panels, where a little detail vocabulary (SD in the vitals table) is allowed.
2. Read each card at 360 px as a newcomer and answer three questions. Any "no" is a fix before shipping.
   - What is this card for? (the job below, in one glance)
   - What do I do with it? (a tap, a choice, or nothing)
   - Is every word one I would say to a friend who trains?
3. Colour never carries meaning alone: every colour has a glyph, a stripe or a word beside it.
4. The look and feel is a 2060 game (progress, levels, earned moments), the words are a fitness app's.

## What each card is for (the function)

| Card | Its job | What the reader does |
|---|---|---|
| Header | When the data last arrived and when the next update comes | Nothing; the icon says how to get data now |
| Level up moment | One gold screen per skill that reached a level, stage or block goal in the last 7 days: which skill, what it measures, the stages, the session that earned it | Read it, open the session if curious, tap Thanks, coach (seen on every device) |
| Check-ins due | How many surveys wait | Tap Open |
| Morning check | Today's five feel questions | Tap an answer per question |
| Today's call | Train as planned, ease off, or stop, and why | Read the meaning line; open Last night or Why this call for detail |
| This week | Where today sits in the week, and today's session with its three sizes | Pick a size; open More info or Help me pick; after training, rate the effort |
| Watch | A reading well outside your normal | Note it; the call already weighed it |
| Next race | Days to the next race and the main race | Nothing |
| Doing the plan | The last three weeks against the plan, four habits | Tap a cell for why |
| Skills | What moved in the last 7 days, toward the next level | Nothing; the bar shows progress to the next level |

## First reading, Nov 14, 2026, and what changed (6.47.0)

| Card | What a first reader met | Now |
|---|---|---|
| Header | "next 9:41 PM": next what? | "next update 9:41 PM" |
| Ribbon | "a new ladder starts here, so the level reads lower at first" | Says why the stage moved (top 20% of everyone) and that the level restarts lower on the tougher group |
| Today's call | "Green" with no meaning | A meaning line: "Ready: train as planned" (Yellow: ease off; Red: stop the planned stress) |
| Today's call | "−1.1 SD" | "−1.1 vs your normal" |
| Today's call | "Why: call, reason, block, race, fuel"; "Call Hold:" | "Why this call"; "Keep to the plan" (Go for more, Back off) |
| Today's call | Data line in UTC ("12:46Z") | Local times |
| This week | "longer than the 165 min strong-day bound"; "202 min" beside sizes in h:mm | "longer than Max (2:45)" |
| This week | "Rate it below so the coach sees the effort", with nothing below | A "Rate how hard it felt" button that opens Rate a session |
| Watch | "on the worse side of your 28-day average by 1.5 SD or more" | "well outside your 28-day normal, on the worse side. Worth noting, not a reason to change the plan alone" |
| Next race | "A race: a 70.3" | "Main race: a 70.3" |
| Doing the plan | Colour only; the key behind What counts | A key under the grid (Done, Missed, To come, Tap a cell for why); missed segments are striped |
| Skills | "+70% to next" read as what is left; "4 W to 2-2" | "+70% of a level"; "4 W to level 2-2" |

Still open: the size names Min, Plan, Max are clear; "Key 2 of 3" is explained in Help me pick. The expanded vitals table keeps SD, labelled.

## Week and Fitness reading, Nov 15, 2026, and what changed (6.49.0)

| Card | What a first reader met | Now |
|---|---|---|
| Week rows | "up to 165 · fallback 105", minutes as plain numbers | "Min 1:45 bike · Plan 2:30 · Max 2:45", h:mm everywhere |
| Week rows | "Did:", "RPE 4", "Rated RPE 6 on an easy day" | "Done:", "effort 4 of 10", "Rated effort 6 on an easy day" |
| Week rows and Today | Coach text "RPE 2-3, HR guardrail 135" | "effort 2 to 3 of 10, heart rate cap 135" (display only; the engine still writes RPE) |
| Week note | A long paragraph | First sentence, then "Read the full week note" |
| Load by week | "RPE x min" | "effort × min", rated sessions, effort 1 to 10 × minutes |
| Block card | "Live", "block goals" | "Under way", "This block's goals" / "Next block's goals" |
| Fitness tiles | "Ladder", "Habit ladder (3-3-3)" | "Levels", "Habit levels (3-3-3)" (tile titles from coach.json change with the next morning build) |
| Fitness chart | Pop-up ran off the right edge; "best 90-day effort" and "each ride" floated among the bands; the latest dot half hidden; "Bands: Coach guide" | Pop-up wraps; one key line above the chart; latest dot whole; "Bands: Coach estimate" |
| Season | "A race", "B race" | "Main race", "Build-up race" |

Still open: tile sub-levels in Roman numerals ("Top half III") need a UI choice (nine options); "7:06/effort km" on trail speed; Today's expanded vitals keep SD, labelled.


## Lifts, Check-ins and Health reading, Nov 15, 2026, and what changed (6.50.0)
Read top to bottom on a 390 px phone as a first-time user. Changed: "1–2 reps in reserve" now "stop with 1–2 reps left" (strength.json `rir`; lifts.js light phase the same); the Busy week and Drop first rules name the blocks and lifts instead of codes ("W, 1a/1b, 3a/3b"); the Rate a session talk-test line says what it measures ("How much you could have said"); the Health gate eyebrow is "Checks before hard training"; the wins button ends "and your heart score" so a bare "heart score" no longer reads as a missing number. Left as is: the S1, S2 set labels (their inputs are named "set 1", "set 2" for screen readers) and the 96 marker list. Open, for the athlete: the Check-ins tab lists the same five surveys twice (Due today at the top, Surveys at the bottom).
