# Key sessions

the athlete's definition (Nov 3, 2026): **the key sessions are the three things that must happen that week to ensure progress or the right discipline (80/20).** A rest day can be one of them, but there are always three, every week.

History:
- **Nov 2, 2026:** the first fix (PR #23) defined key sessions per block, as weekly or once sessions. That let a week show zero, one or two.
- **Nov 3, 2026:** replaced with this rule after the athlete's sign-off.

## The rule

1. **Every week has exactly three key sessions**, numbered 1, 2 and 3. Each is a day row in `coach/week.json` with:
   - `key: true`;
   - `pillar` set to 1, 2 or 3;
   - a one-line `why` saying what that session protects this week. This is shown on the card.

   `key` and `pillar` always go together, and nothing else is key. One of the three may be a rest day (`type: rest`).
2. **Block pillars are the defaults.** Each block in `coach/plan.json` names three: `pillar_n` (the full prescription) and `pillar_n_short` (2 to 5 words).
   - **Base, Build and Specific weeks:** the week's three are normally the block's three.
   - **Recover, taper, race, holiday and test weeks:** the coach chooses the three that matter that week and writes the why. Examples: the race, the exit check and the rest day before; or one longer easy session, the exit check and a full rest day.

   Week-by-week guidance goes in the block's `guide` or `volume`, never in a pillar.
3. **A key rest day is kept** when nothing but walking is recorded that day. It is broken by any training: the dashboard shows "Trained", and the facts show "missed (trained on a key rest day)".

   A key rest day is not a fuel day: no maintenance-calorie switch, and no "key day" fuel line. It is also not listed with the hard sessions in the next 3 days.
4. **When the athlete registers for a race inside a week,** the coach decides whether it becomes one of that week's three and says so in the check-in.
5. **Weeks before Nov 2, 2026** keep whatever was tagged at the time. They are neither checked nor re-tagged.

## Checks

`python3 coach/tools/key_check.py` checks the following:
- Every block names three defaults.
- Every week from Nov 2, 2026 has exactly one key row for each of 1, 2 and 3.
- Every key row has a pillar from 1 to 3 and a why.
- No pillar appears without key.

The morning facts carry the result as `week.key_session_problems`, plus each key session's status in `week.key_sessions`. The RUNBOOK (step 3, Record) requires the check to print `ok` before publishing. The Sunday plan writes the coming week's three. `coach/tests/test_key_check.py` covers the rule and the repo's own plan.

## On the dashboard

The Week tab's Key sessions card always shows three numbered slots for weeks from Nov 2, 2026. Each slot shows the week's key row with its day, why and status. A slot the coach hasn't written yet shows the block default as "To schedule" in a future week, or "Not scheduled" in the current or a past week. The count is "n of 3". A key rest day counts as done once the day has passed with no training.

The Today eyebrow shows "Key n of 3". The session detail shows the why.
