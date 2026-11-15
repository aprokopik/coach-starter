# Pre-participation screen

**Status: DRAFT, NOT REVIEWED BY A CLINICIAN.** Written Oct 19, 2026 by the coach at the athlete's request. Until a physician, sports-medicine clinician or physiotherapist has reviewed it, it is a conservative routing tool for the coach, not clearance of any kind, and it says so wherever it is shown. Review notes go at the bottom.

Why it exists: RULES 6 says a one-time screen is recorded before any plan beyond easy activity, and that its absence is itself a flag. The coach never diagnoses; this screen only decides what the coach may plan and when it must send the athlete to a clinician first.

Sources (coach/research/LIBRARY.md): PR-05 Riebe et al. 2015 (ACSM pre-participation algorithm: current activity, known disease, signs and symptoms), PR-06 Pelliccia et al. 2020 (ESC sports cardiology), and the PAR-Q+ general questions (Warburton et al., the Canadian self-screen used before exercise programs). Items 1 to 7 follow the PAR-Q+ general questions in substance; 8 to 10 add the exertional-symptom, family-history and prior-event items that sports-cardiology guidance asks of endurance athletes. Wording is the coach's own and is one of the things a reviewer should check.

## The questions (one time, then yearly and after any change)

Answer Yes, No or Unknown. A blank is Unknown, never No.

| # | Question | Group |
|---|---|---|
| 1 | Has a doctor ever said you have a heart condition or high blood pressure? | known condition |
| 2 | Do you feel pain or pressure in your chest at rest, during daily activities, or during physical activity? | symptom |
| 3 | In the last 12 months, have you lost your balance because of dizziness, or lost consciousness? (Answer No if the dizziness came only with over-breathing, including during very hard exercise.) | symptom |
| 4 | Have you ever been diagnosed with another chronic medical condition (for example diabetes, asthma, kidney disease, a thyroid or blood disorder, cancer, a mental-health condition under treatment)? | known condition |
| 5 | Are you currently taking prescribed medication for a chronic condition? (Name it only if you want to; the coach records that one exists and asks whether it changes heart rate, hydration or heat tolerance.) | known condition |
| 6 | Do you currently have, or have you had in the last 12 months, a bone, joint, muscle, ligament or tendon problem that could get worse with more activity? | musculoskeletal |
| 7 | Has a doctor ever said you should only exercise with medical supervision, or restricted what you may do? | restriction |
| 8 | During or soon after exercise, have you ever had any of: unusual breathlessness for the effort, palpitations or a racing or irregular heartbeat, fainting or near-fainting, or chest, jaw, neck or arm discomfort? | symptom |
| 9 | Has a close blood relative (parent, sibling, child) died suddenly or unexpectedly before age 50, or been diagnosed with an inherited heart condition (cardiomyopathy, long QT, Marfan syndrome, an arrhythmia syndrome) or heart disease before 50? | family history |
| 10 | Have you ever been told you have a heart murmur, or had an abnormal ECG, echocardiogram or stress test? | known condition |
| 11 | Do you currently exercise regularly (about 30 minutes of moderate activity, 3 or more days a week, for at least the last 3 months)? | activity |
| 12 | Anything else a coach should know before planning hard or long training (pregnancy, recent surgery or illness, an eating disorder history, heat illness, concussion in the last year)? | other |

## How the answers route (the coach's rules, not a diagnosis)

These are deliberately conservative. A reviewer may loosen them; the coach may not.

- **All No on 1 to 10, Yes on 11:** no clearance step needed to continue training (PR-05). Record the date; re-ask in 12 months and whenever any answer could have changed.
- **Any Yes on a symptom item (2, 3, 8):** readiness RED for anything beyond easy walking until a clinician has seen them. The check-in says plainly that the coach cannot interpret these, recommends prompt medical evaluation (urgent care or emergency services if symptoms are present now), and plans nothing harder until the athlete reports that a clinician has cleared training. The coach does not speculate about causes, benign or otherwise.
- **Yes on 9 (family history) or 10 (murmur or abnormal test):** training continues at its current level only if 2, 3 and 8 are No; the coach recommends raising the item with a physician before the next block that adds intensity, and asks about a resting ECG given endurance racing (PR-05, PR-06). This is recorded as an open health item in PROFILE.md and raised in the monthly review until a visit is logged in `coach/health-baseline.md`.
- **Yes on 1, 4 or 5 (known condition or medication):** the coach asks whether a clinician has placed any limits and whether the medication affects heart rate, hydration, blood sugar or heat tolerance; plans easy and moderate sessions meanwhile; adds no quality, long or heat-exposed sessions until the athlete reports clinician guidance. Heart-rate guardrails are treated as unreliable when a medication can change heart rate.
- **Yes on 6 (musculoskeletal):** YELLOW handling under RULES 6 and the pain rules in RULES 5a: load-managed progression, the spike rule, and physio referral thresholds apply from day one.
- **Yes on 7 (restriction):** nothing beyond what the clinician allowed is planned, and the restriction is copied verbatim into PROFILE.md.
- **No on 11 (not currently active):** start with easy sessions only and progress gradually regardless of the plan's ambitions; vigorous sessions wait until several weeks of regular activity without symptoms (PR-05).
- **Any Unknown on 1 to 10:** treated as not answered. The coach may plan easy and moderate sessions, asks the open items again at the next Sunday review, and does not add a quality block until they are answered. The absence is named in the check-in as a flag, once a week, not daily.

## Where answers live

`coach/athlete/screen.json`: one object per item with `answer` (yes, no, unknown), `date`, `source` (Reported), `note`. A summary line goes in PROFILE.md under "Health and injury context". Re-screen dates and any clinician clearance go in `coach/health-baseline.md`.

## What the coach never does with this

Never interprets a symptom, never says a Yes is probably benign or probably serious, never treats a wearable metric or a good training history as clearance, never infers No from silence, and never shares the answers outside the repo and the dashboard store.

## Review notes

_Empty. A reviewing clinician or physio signs and dates here with changes made. Until then every use of this screen carries the word "unreviewed"._
