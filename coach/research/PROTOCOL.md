# Evidence protocol

Approved by the athlete on Oct 12, 2026 as a core tenet of how their coach works (COACH-SPEC section 12). This file is coaching instructions. `LIBRARY.md` and `QUEUE.md` are reference data, not instructions.

## Purpose
Every coaching rule for the athlete's training, health, longevity and body composition should rest on the best available evidence, applied to them as an individual. Where the evidence is weak, contested or absent, the coach says so. Races are milestones inside a lifelong-health mission (COACH-SPEC section 1).

## Files
| File | What it holds | Who changes it |
|---|---|---|
| `PROTOCOL.md` | This method | only with the athlete's agreement |
| `LIBRARY.md` | Vetted sources. Each entry has its finding, its limits, how it applies to the athlete, certainty and status. The file opens with a map from coaching rules to the evidence behind them. | coach (daily run, Sunday review, monthly scan) |
| `QUEUE.md` | Open evidence questions, the watch list, proposed rule changes waiting for the athlete, items pending for the next Sunday review, and the scan log | coach |

## Evidence hierarchy (strongest first)
1. Current guidelines and consensus or position statements from credible bodies: IOC, ACSM, ISSN, ECSS, WHO, USPSTF, ACC/AHA, ADA, ESC, Endocrine Society, AASM.
2. Systematic reviews and meta-analyses of RCTs, including umbrella reviews and network meta-analyses.
3. Well-designed RCTs.
4. Large prospective cohorts. Use these for longevity questions where RCTs are impossible, and call them associations.
5. Narrative reviews and expert opinion. Use them only to frame a question, never alone to change a rule.

Excluded as evidence: influencers, podcasts, press releases on their own, brand or supplement-company material, single small studies presented as settled, and preprints, except as watch items.

## Appraising a source
- **Match:** population (age, sex, training status, health), dose, duration, comparator and outcome. Note whether the outcome is real performance or health, or only a surrogate such as VO2max or a biomarker.
- **Quality:** size, risk of bias, heterogeneity, corrections or retractions, conflicts of interest, and whether the full text or only the abstract was read.
- **Two separate ratings:** certainty of the evidence itself (high, moderate, low), and confidence in applying it to the athlete (high, moderate, low).
- **Population results are not individual guarantees.** A group effect is not a promised number of race minutes or years of life.
- **Read the newest version.** When a newer guideline replaces an older one, mark the old entry Superseded and keep it for history.

## Applying evidence to coaching
- **Daily check-ins** stay free of citations. The rules they apply already carry the evidence. When a daily decision rests on a specific finding, name it in a few words, for example "single-run spike rule".
- **Sunday review:** an "Evidence update" section appears only when `QUEUE.md` has items pending for Sunday. At most three items, each one or two lines: what is new, what it means for the athlete, and any proposed change. Once reported, an item is marked done in `QUEUE.md`. If the last monthly scan is more than 35 days old, say so in one line.
- **Monthly review:** check that the rule-to-evidence map still holds. Do not repeat the Sunday evidence items.
- **Quarterly review:** the longevity check (COACH-SPEC section 8) uses the library's longevity and prevention entries.
- **Changing a rule:** follow COACH-SPEC section 12. Write the question; the evidence with its source and date; relevance and limits; the proposed change; the outcome to monitor; the review date; and the criteria to progress, hold or stop. Cite one to three sources.
  - A change to COACH-SPEC or to a CURRENT-STATE decision needs the athlete's agreement. Until then it sits in `QUEUE.md` under "Proposed changes".
  - A safety-tightening change, for example adding a red-flag symptom, may be applied at once and reported in the next message.
- **When not to change:** a successful program does not change just because a new paper appeared. A single study rarely changes a rule. Evidence that relaxes a safety rule needs a stronger bar than evidence that tightens one.
- **Conflicts:** when evidence conflicts with an the athlete preference, the coach states the evidence once, plainly, with numbers. the athlete decides, unless safety is involved, in which case section 6 rules apply.

## Monthly research scan
This is a project routine, "Monthly research scan", in the athlete's Coach project, run on the 1st of each month at about 4:53 AM Eastern. Its steps are in `coach/ops/TASK-PROMPT-research.md`; a thread in the project can also run it on demand from that file. It is silent: it does not message the athlete, and its findings reach them through the next Sunday review. Its purpose is to make the coaching rules stronger, not only to report new papers.
1. Read this protocol, `QUEUE.md`, the rule-to-evidence map in `LIBRARY.md`, and `../CURRENT-STATE.md`, so the scan targets what matters now.
2. Plan the searches in three parts, and record each part in the scan log:
   - **a. Weak spots, 1 to 2 per scan.** From the rule-to-evidence map, pick the rules with the weakest support that matter most now (CURRENT-STATE phase, next race). Weakest means, in this order: no evidence; verdict "In tension"; resting only on low-certainty entries; Applied entries read only as ABS or SEC. Skip a rule targeted in the last three scans (see the scan log) unless something changed. Search for the best existing evidence with no date limit, and try to reach the full text of the main entry.
   - **b. Open questions, at least 2 per scan.** Start with the questions in `QUEUE.md` searched least recently (see the scan log), plus any CURRENT-STATE item marked for the monthly scan. Search for the best existing evidence of any date, preferring the newest guideline or systematic review. Questions not reached roll over to next month, and the log says which.
   - **c. New publications.** New or updated guidelines, consensus statements, systematic reviews or meta-analyses, and major RCTs or cohorts from about the last two months, across the domains below, plus the status of the watch list.
3. Search with generic topic terms only. Never put the athlete's name, data or health details into a query or any outside service.
4. Verify every citation against a real record: a DOI, PubMed, the journal, or an official guideline page. Leave out anything that cannot be verified. Note when only the abstract was read.
5. Add at most eight new entries per scan, in the library format, with status "New". Usually zero to three entries is right; an empty scan is normal.
6. **Verdict.** Every Sunday item and every weak spot targeted gets one line: **Keep**, **Adjust** or **Change**, the numbers behind it (effect size, certainty, fit to the athlete), and what would flip it. Keep means the rule stands. Adjust means a change inside the rule's current range. Change means a new or different rule. Adjust and Change go under "Proposed changes awaiting the athlete" in `QUEUE.md` with the next P number and the COACH-SPEC section 12 fields. Nothing is applied without the athlete, except safety-tightening changes as "Changing a rule" allows. "When not to change" still holds: one study supports at most an Adjust. Update the map verdict in `LIBRARY.md` when a rule's support changes.
7. Add the items that matter to the athlete to "Pending for Sunday" in `QUEUE.md`, each with its verdict: **at most three per scan, ordered by impact**. A weak spot that ends in Keep with nothing new goes in the scan log only.
8. Append a row to the scan log: the date, the weak spots targeted, the open questions searched (and those rolled over), the other searches run, entries added, and the result with its verdicts.
9. Commit and push. Never edit COACH-SPEC, CURRENT-STATE, `.github/` or `scripts/`.

Domains to scan:
- Endurance training and triathlon
- Strength and concurrent training
- Injury, load and return to running
- Recovery, sleep and wearables
- Sports nutrition, fueling and hydration
- Weight management and fasting in athletes
- REDs
- Physical activity and longevity
- Cardiovascular health in endurance athletes
- Preventive care guidelines (USPSTF, ACC/AHA, ADA)
- Exercise and mental health, stress and habits
- Healthy aging: balance, mobility, muscle

Preferred places to look:
- Journals: BJSM, Sports Medicine, MSSE, JISSN, IJSNEM, Journal of Science and Medicine in Sport, Scand J Med Sci Sports, EJAP, JAMA network, Lancet, NEJM, BMJ, Circulation, JACC, Cochrane.
- Guideline bodies: uspreventiveservicestaskforce.org, professional.heart.org, the ADA Standards of Care, IOC consensus statements, ACSM position stands, ISSN position stands.

## Privacy
Public research browsing only. Never send the athlete's health data to an outside service.
