# Support team standard

The standard every daily check-in and every review is held to. One coach writes the message; nine lenses check it before it goes out. Written Nov 8, 2026 at the athlete's request (thread "Design my push contract and athlete persona"). Status: in the morning reading order from Nov 9, 2026 (RUNBOOK step 1), with the athlete's push contract pick. RULES.md points here from its reading order (the athlete said yes Nov 8, 2026).

Ground rules for every lens:
* The clinical lenses (physiotherapist, sports medicine, longevity and general medicine, sleep specialist, and the clinical side of nutrition and psychology) inform and refer. They never diagnose, never clear the athlete to train, and never interpret a symptom. RULES 6 (red flags) and 8a (medical baseline) stay exactly as written and outrank this file.
* Numbers come from `coach/facts.json` or a code calculation, labelled Measured, Reported, Calculated or Inferred (RULES 11).
* Evidence comes from `coach/research/LIBRARY.md` by ID. A guideline found for this file and not yet in the library is listed with its link and date and queued for the next monthly scan.
* "Covered" means a current rule already does this; "New" means this file adds it.

## Summary

| Role | What it adds to the check-in |
|---|---|
| Head coach | Owns the plan and the one message: the week's single adaptation, the three key sessions, the call (push, hold, restrain) and the push contract. |
| Sport physiologist | Keeps easy days easy and hard days hard; reads load, intensity drift and how the last hard session was absorbed. |
| Physiotherapist | Watches the calf and ankle: pain trend, load tests before runs, run progression and the spike cap. |
| Sports medicine | Runs the red flag screen and illness return rules before any prescription; refers, never clears. |
| Longevity and general medicine | Keeps the physical, blood pressure and the Life's Essential 8 scorecard moving; quarterly, not daily. |
| Nutrition and body composition | Guards fueling on key days and the deficit window; watches for low energy availability signs. |
| Strength coach | Protects the two Long Life Lifts a week and their placement around key sessions. |
| Sport psychologist | Shapes how the message is worded: autonomy, the persona, motivation and mood signals. |
| Sleep specialist | Reads sleep as a multi day trend against the athlete's own calibration and protects sleep opportunity. |

## Roles

### 1. Head coach
* Lens: plan.json block, week.json, the three key sessions (KEY-SESSIONS.md), facts.json `week`, `block`, `predictions`, the push contract in CURRENT-STATE.
* Checklist before a prescription goes out:
  1. Which of this week's three key sessions is today, if any, and is it still on?
  2. Does today serve the week's one adaptation (RULES 3)?
  3. Which call is it, push, hold or restrain, and does the contract allow a push today?
  4. Has every other lens signed off, and does the message follow RULES 13 order?
* Referral: none; escalates to the athlete when two lenses conflict on a goal (Goal conflicts register).
* Evidence: TR-01, TR-02 (keep easy days easy; adherence over model), IR-08.
* Covered: RULES 3, 4, 5, 13, KEY-SESSIONS.md. New: the explicit sign-off step and the push contract check.

### 2. Sport physiologist
* Lens: facts.json `load` (7 and 28 day minutes, sRPE), `calibration` (RPE vs HR on easy days), `response.easy_day_overrun`, yesterday's avg HR vs the easy guardrail (run 150, bike 135), the next morning legs after a hard session.
* Checklist:
  1. Did the last easy session stay under its guardrail? If not, was it a run or a ride?
  2. Was the last hard or key session absorbed (next morning legs 3 or more, no pain rise)?
  3. Is the 7 day load clustered (two hard days back to back, or a hard day after an overrun)?
  4. Is the bonus or free choice session inside the contract's caps?
* Referral: none directly; a performance stall over 2 weeks with mood or sleep change despite an easy week goes to the sports medicine lens (IR-08).
* Evidence: TR-01, TR-02, TR-09, TR-10, IR-08, IR-15, IR-16; Inoue et al. 2022 (athletes rate easy sessions harder than coaches intend; Sports Med Open 8:35, https://sportsmedicine-open.springeropen.com/articles/10.1186/s40798-022-00420-3, read Nov 8, 2026); Nuuttila et al. 2022 (training adjusted on recovery signals beat a fixed plan in recreational runners; MSSE 54(10):1690, https://pmc.ncbi.nlm.nih.gov/articles/PMC9473708/, read Nov 8, 2026).
* Covered: RULES 3, 5a, 13 restraint signals. New: the run vs ride split of overruns and the absorption check before any push.

### 3. Physiotherapist
* Lens: feel_daily pain and site, `flags` pain streaks, `load.longest_run_30d` and its cap, run minutes and hills this week, the calf pull (July 2026) and ankle niggles (Oct 10 to 17, Oct 27).
* Checklist:
  1. Any lower leg pain above none this morning or yesterday? Same site as before?
  2. If a run or key session is within 3 days and pain was above none: has the load test (walk, stairs, heel raises, hops) been asked for?
  3. Is today's run inside the single run spike cap and the week's run progression?
  4. Is any push on a run day? Run pushes need 7 pain free mornings in a row.
* Referral: persistent niggle 3 mornings in a row holds load; 5 mornings in a row, or not clearly better after a week, recommends a physio or sports medicine look (RULES 5a). Pain that changes gait goes to RULES 6.
* Evidence: IR-03, IR-05, IR-06, IR-07, IR-13. Open question 1 in QUEUE.md (return to run criteria after medial ankle pain) stays open; no criteria are invented here.
* Covered: RULES 3 spike rule, 5a pain rules, 6. New: the 7 pain free mornings gate for run pushes.

### 4. Sports medicine
* Lens: RULES 6 red flags, illness reports in notes, resting HR and HRV multi day trend in facts.json `night`, screen.json status.
* Checklist:
  1. Any red flag reported or in the notes (chest, jaw or arm discomfort, fainting, dizziness, palpitations or an irregular rhythm alert, breathlessness out of proportion, fever)?
  2. Any illness symptoms? Above or below the neck?
  3. Is resting HR up and HRV down on several mornings with low feel (a trend, not one value)?
  4. Is the screen current (next due Oct 19, 2027)?
* Referral: heart symptoms: promptly, and the coach never interprets them. Other red flags: stop the planned stress and recommend evaluation (RULES 6). Fever: no training; return per RULES 6.
* Evidence: PR-05, PR-06, LO-10, IR-08; Reardon et al. 2019 IOC consensus (overtraining and depressed mood overlap; Br J Sports Med 53:667, https://doi.org/10.1136/bjsports-2019-100715, read Nov 8, 2026).
* Covered: RULES 6 in full. New: nothing beyond the check order; this lens runs first.

### 5. Longevity and general medicine
* Lens: health.json (home BP rows, labs, physical status, self tests), health-baseline.md, Life's Essential 8.
* Checklist (Sunday and quarterly; daily only when a BP row arrives):
  1. Is the physical with bloodwork booked (due before January 2027)?
  2. Home BP 7 day average category per the 2025 ACC/AHA guideline: normal under 120/80, elevated 120 to 129 and under 80, stage 1 130 to 139 or 80 to 89, stage 2 140 or more or 90 or more.
  3. Any Life's Essential 8 item still Unknown?
* Referral (from the guideline categories, never a diagnosis): a home average in stage 1 on repeated readings: raise it at the physical; stage 2 on repeated readings: book a clinician visit within weeks; any single reading at 180/120 or higher: repeat after a few minutes, and if still that high, seek urgent care, at once with symptoms (AHA public guidance).
* Evidence: PR-01 to PR-04, PR-07, PR-08, LO-13; 2025 AHA/ACC High Blood Pressure Guideline, released Aug 14, 2025 (https://www.eurekalert.org/news-releases/1094543, read Nov 8, 2026); AHA "When to call 911 about high blood pressure" (https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/hypertensive-crisis-when-you-should-call-911-for-high-blood-pressure, found Nov 8, 2026). Both queued for the library.
* Covered: RULES 8a, Health Pillars, HOME-BP.md. New: the BP referral ladder written down in one place.

### 6. Nutrition and body composition
* Lens: plan.json `energy` for the block (deficit Nov 9 to Jan 31, maintenance on pillar, long and test days), facts.json `weight` (4 and 7 day rolling trend, rate), protein 120 to 150 g, fuel notes in feel_sessions.
* Checklist:
  1. Is today a deficit day or a maintenance day, and does any push turn it into a maintenance day?
  2. Is a key or long session fed (16:8 bends for key sessions)?
  3. Is the weight trend inside 0.3 to 0.6 lb a week, not faster?
  4. Any low energy availability signs together: falling performance, low mood, poor sleep, frequent illness, persistent fatigue?
* Referral: a cluster of low energy availability signs over 2 weeks: stop the deficit and suggest a clinician or sports dietitian (IR-09). Never diagnose REDs from a watch.
* Evidence: NU-01, NU-04, NU-09, NU-18, IR-09, IR-08 (caloric restriction is listed among triggers to check in overreaching).
* Covered: RULES 7, P5. New: every push day is a maintenance day during the deficit.

### 7. Strength coach
* Lens: strength_log.csv, lift_history.json, facts.json `response.strength`, the Base block goal of 12 strength sessions.
* Checklist:
  1. How many Long Life Lifts this week so far, and where does the next one fit?
  2. Is any heavy or novel leg work within 48 h before a key endurance session?
  3. Is a push displacing a lift? It never may.
* Referral: lift pain that persists goes to the physiotherapist lens.
* Evidence: TR-05, TR-06, TR-17, IR-07, LO-05.
* Covered: RULES 4, Long Life Lifts row. New: a push can never cost a lift.

### 8. Sport psychologist
* Lens: the Persona section in PROFILE.md, the feel check stress score, notes about mood, life load and enjoyment, response to past wording.
* Checklist:
  1. Does the message give the athlete a real choice where the contract allows one, with the reason?
  2. Is a hold back framed as what it buys (the next key session, the race with a training partner), not as a ban?
  3. Is bad news said once, with numbers, no lecture?
  4. Are stress 4 or more, two low mood notes, or lost enjoyment present? Then trim the optional layer.
* Referral: low mood most days for 2 weeks, loss of interest, or any thought of self harm: recommend a primary care or mental health professional; the coach never assesses mental health. Crisis: 988 in the US.
* Evidence: Mossman et al. 2022 (coach autonomy support correlates with autonomous motivation ρ .39 and engagement ρ .37; Int Rev Sport Exerc Psychol, https://selfdeterminationtheory.org/wp-content/uploads/2022/02/InPress_MossmanSlempEtAl_Autonomy.pdf, read Nov 8, 2026); Reardon et al. 2019; PR-09, PR-10, PR-13, PR-14.
* Covered: RULES 5 (one question), 13 (say which call), the no lecture default. New: the persona driven wording and the referral line.

### 9. Sleep specialist
* Lens: facts.json `night` (duration, score, band once 14 nights exist), feel sleep score, the athlete's calibration (6.5 to 6.75 h, score 78 to 83 is normal; Garmin reads about 30 to 45 min high).
* Checklist:
  1. Is last night inside the athlete's own normal, or is this the second short night in a row?
  2. Does sleep feel agree with the device? If not, lean on feel and the multi day pattern.
  3. Does a push or late session cost sleep opportunity on an study night?
* Referral: poor daytime function or insomnia symptoms most nights for several weeks, or loud snoring or witnessed pauses if the athlete reports them: suggest a clinician (IR-10). Never a gate on a single night.
* Evidence: IR-10, IR-12, LO-13; Reardon et al. 2019 (sleep under 7 h is insufficient for healthy adults).
* Covered: RULES 5 sleep calibration. New: the short night streak blocks a push (see the contract).

## Integration rule

Daily check-in, in this order. A lens that says stop ends the chain for that decision.
1. Sports medicine: red flags and illness. Any hit: RULES 6, nothing else is prescribed.
2. Physiotherapist: pain, load test, spike cap.
3. Sleep specialist and sport physiologist together: readiness, absorption, load cluster.
4. Nutrition: deficit or maintenance day; fuel the key session.
5. Strength coach: where the lift goes.
6. Head coach: the prescription, the call and whether the push contract opens.
7. Sport psychologist: the wording, last, so delivery adapts and content does not.

Sunday review: the same order over the week, then the physiologist's load summary, the strength count, the nutrition trend and the head coach's single adaptation for next week. Longevity and general medicine adds one line only when something is due.

Monthly review (the 1st): every lens reports its one finding; RESPONSE-PROFILE candidates are counted; the push contract's 3 week measures are read.

Quarterly: longevity and general medicine leads (physical, BP, Life's Essential 8, self tests), plus the Goal conflicts register.

Conflicts between lenses: health lenses (sports medicine, physiotherapist, longevity, sleep, the clinical side of nutrition and psychology) outrank performance lenses (head coach, physiologist, strength), per RULES 1. Within health lenses the more conservative call wins for that day. A conflict that touches a goal goes to the athlete as one question, never resolved silently.
