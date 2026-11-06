# Onboarding prompt

Start a new session at claude.ai/code with your coach repository selected (INSTALL.md, step 7). Copy everything below the line and send it as your first message. If Claude guided you through Part 1 (`SETUP-PROMPT.md`), paste its setup notes at the very end of the same message.

---

You are setting up Coach, a personal endurance and health coach, for me. My repository is the one attached to this session; it was made from the Coach starter kit. Work in two stages: first interview me, then set everything up. Read `START-HERE.md`, `coach/engine/RULES.md` (sections 1 and 2), `coach/engine/SCREEN.md` and `setup/answers.example.json` before the first question, so you know what the coach needs and why.

## Setup log (from the first message to the last)

Help the kit's makers improve the next version. If my message ends with PART 1 SETUP NOTES, start `setup/SETUP-LOG.md` now: fill its header and paste the notes under "Part 1". If there are none, start it anyway and note "Part 1 not guided". From then on, add a row under "Part 2" for each Stage 2 step (minutes, done or failed, what happened, what fixed it), and a line under "Unclear or wrong instructions" whenever a guide or prompt in this repository was wrong, out of date or confused me. About the setup only: never my health data, answers, passwords, tokens, email addresses or account names. Save it with my answers.

## Stage 1: the interview

Rules for every question:
- **One question at a time.** Wait for my answer before the next one.
- Use tap-able multiple-choice questions (the AskUserQuestion tool, loaded with ToolSearch if needed) whenever an answer has a few likely options, with an "Other" option for my own words. Ask in plain prose only when the answer is open (names, dates, my reasons).
- Every question can be skipped. A skipped answer is unknown, never assumed; the coach can ask again later.
- Keep a short running tally in your head, and save my answers to `setup/answers.json` (same shape as `setup/answers.example.json`) after every few questions, so nothing is lost if the session stops.
- Do not give coaching advice during the interview. If I mention pain, illness or a symptom, note it and keep going; the screen at the end handles it.

Ask about these, in this order (skip any the earlier answers already settle):
1. **Me.** My first name; how I would like to be referred to (she/her, he/him, they/them, or my name only); my city, from which you set the IANA time zone (confirm it); birth year (used only to estimate max heart rate; optional); sex for reference ranges (optional).
2. **Why.** In my own words, why I train and what a good year looks like. Then my priority order as a choice: health and safety first, enjoyment second, getting faster third (the default), or my own order.
3. **Events.** Any events I am training for: name, date (approximate is fine), sport (Run, Trail run, Ride, Triathlon, Swim, other), distance, location, and how committed I am (registered, planned, considering). For each: priority (A = the main one, B, C) and my goal (finish, finish healthy, a time). Training partners for an event, if any (first names only). No events is a fine answer.
4. **Focus.** From my events, propose which of running, trail ultra, cycling and triathlon the fitness page should follow, and confirm it with me.
5. **My week.** Hours a week I can realistically train (offer ranges such as 3 to 5, 5 to 7, 7 to 9, 9 or more); days that never work; strength sessions a week (0, 1, 2, 3); swims a month if relevant; the time I would like my morning check-in (offer 6:00, 6:30, 7:00, 7:30, 8:00 AM).
6. **Heart rate.** Do I know my max heart rate from a hard race or test? If yes, the number. If not, say the coach starts from an age estimate and corrects it later.
7. **Body.** Do I have a weight or body composition goal? If yes: the target range and by when. Say plainly that the coach keeps any weight change gradual and training first, and never sets an aggressive deficit. Skipping is fine.
8. **Injuries and health context.** Any current or recent injuries or niggles, and any condition or medication that affects exercise. Plain words.
9. **Health screen.** The 12 items of `coach/engine/SCREEN.md`, one per question, each answered yes, no or unsure. Tell me once, before the first item, that a yes or unsure on items 1 to 10 does not stop me from using the coach; it means hard training waits until a clinician has cleared me, and easy activity continues.
10. **Devices and data.** First, as a choice: what records my sleep and recovery: a Garmin watch, an Oura ring, an Ultrahuman ring, or an Apple Watch. Garmin sets `data_source` to "garmin"; the others set it to "apple_health" (an iPhone is required: ask). For apple_health, ask whether I use Strava or am willing to (free) for workouts, and set `strava`. Then equipment: which watch or ring; bike and indoor trainer, power meter, pool access, home weights, smart scale. Then what my devices do not measure (offer the usual list: blood pressure, body fat, SpO2, power).
11. **What to watch for me.** Yes or no for each: the weekly race watch (registration dates and race details, so I hear about openings at least 14 days ahead); the monthly research scan (new evidence on the coach's rules); a smart scale feed (only if I have one that writes to Apple Health; it needs an iPhone Shortcut, see `coach/ops/SCALE-SHORTCUT.md`); home blood pressure logging.
12. **Coaching style.** How I like to be coached, as a choice: encouraging, direct and brief, data-heavy, or my own words.

Then show me a one-screen summary of everything you recorded and ask me to confirm or correct it.

## Stage 2: set it up

Do each step, then tell me its result in one line. If a step fails, say so plainly, keep going with the rest, and list what is still to do at the end.

1. **Answers.** If the repository has no `.github/workflows` folder (the web upload skips hidden folders), `setup/personalize.py` restores it from `setup/workflows`; after it runs, remind me to open the Actions tab and enable workflows. Fill `github.owner` and `github.repo` from this session's repository. Run `python3 setup/personalize.py setup/answers.json --check`; ask me only for what it lists as still needed. Then run `python3 setup/personalize.py setup/answers.json`. If it prints a SCREEN line, tell me plainly which item needs a clinician and that hard training waits until I say I have been cleared.
1b. **Ring or Apple Watch data** (only when `data_source` is "apple_health"):
   - Strava (if `strava` is true): ask me to make a Strava API application at https://www.strava.com/settings/api (any name; Website and Authorization Callback Domain both `localhost`) and tell you its Client ID and Client Secret. Run `python3 scripts/setup_strava.py <id> <secret>`, give me the link it prints, and ask me to press Authorize and paste back the address of the page I land on (it will not load; that is expected). Run the script again with that address as the third argument. Tell me to save the three secrets it prints as repository secrets (Settings, Secrets and variables, Actions), then never repeat them. When I confirm, dispatch the `pull-strava.yml` workflow with `extra_days_back` 90 and check `data/activities.csv` fills.
   - Daily health: send me to `coach/ops/APPLE-HEALTH-SHORTCUT.md` (with my repository name filled in) to build the "Send health to coach" Shortcut on my iPhone, and wait for me to say I ran it once. Then check that the **Daily health from Apple Health** workflow ran green and `data/summary.csv` has the last 3 days. If I would rather finish it later, continue: the coach works on what has arrived and says what is missing.
2. **Check.** Run `python3 -m unittest discover -s coach/tests`. Then the first morning calculation on my real data: `python3 coach/tools/reconcile.py`, `python3 coach/tools/morning_facts.py`, `python3 coach/tools/vo2max.py`, `python3 coach/tools/build_dashboard.py`. If `data/summary.csv` is still empty, tell me which step sends it (INSTALL.md step 5 for Garmin, the Shortcut for a ring or Apple Watch) and continue; the coach works once data lands.
3. **First week.** Write `coach/week.json` for the next 7 days per `coach/engine/RULES.md` and `coach/engine/KEY-SESSIONS.md`, inside my hours, everything easy (baseline weeks, see `coach/CURRENT-STATE.md` "Phase"). Write `coach/today.json` only if you are giving me today's session now.
4. **Dashboard.** Create my private dashboard: look up the Dashboard Artifact type (Artifact tool, quickstart, intent "other") and create it with the title "Coach dashboard". Then load the page and its data exactly as `coach/dashboard/MAINTAIN.md` ("Publishing", steps 3 to 6) and `coach/ops/RUNBOOK.md` ("Publish", steps 1 to 3) describe: `python3 coach/tools/pack_dashboard.py <dir>` packs each page file as a `files/<name>` document (a new file is a `set`), then upload `data/summary.csv`, `data/activities.csv` and `coach/dashboard/coach.json` as assets and point the datasets `recovery`, `activities` and `coach` at them. Open it at phone width and check it shows my name and events, with no console errors. Put its link in `setup/answers.json` under `links.dashboard_url`.
5. **Race Season page** (only if I have events): `python3 coach/tools/build_season.py`, then publish `coach/dashboard/season.html` as its own private Artifact. Put its link under `links.season_url`.
6. **Links.** Run `python3 setup/personalize.py setup/answers.json` again so every link placeholder is filled. It should report nothing still to fill.
7. **Save.** Commit everything with the message "Onboarding: personalize the coach" and push to the default branch.
8. **Scheduled tasks.** Create these as recurring scheduled tasks on this repository, in my time zone, each running a fresh session with this repository attached:
   - **Morning check-in**, daily at my check-in time: its prompt is the text below the line in `coach/ops/TASK-PROMPT-morning.md`.
   - **Race calendar watch** (if I said yes), Sundays at about 5:30 AM: prompt "Attach the repository {{owner}}/{{repo}}, read coach/ops/TASK-PROMPT-weekly.md and follow the text below its line."
   - **Monthly research scan** (if I said yes), the 1st of each month at about 5:00 AM: prompt "Attach the repository {{owner}}/{{repo}}, read coach/ops/TASK-PROMPT-research.md and follow the text below its line."
   If you cannot create scheduled tasks from this session, give me each prompt and its time in a copy-ready block and tell me where to create it.
9. **Feedback.** Ask me four quick questions, one at a time, each skippable: how easy the setup was overall (1 = painful to 5 = easy), the hardest step, whether I would recommend Coach to a training partner (yes, maybe, no), and one thing I would change (my own words). Fill the Summary, Feedback and Still not done sections of `setup/SETUP-LOG.md`, show me the whole log, and cut anything I ask. Run `python3 setup/feedback.py`; if it says NOT READY, fix those lines with me and run it again. Give me its LINK (it opens a prefilled issue on the kit's repository: I press **Submit new issue**) and tell me that if the link does not open for me, I can copy the TEXT block and send it to whoever invited me. Commit `setup/SETUP-LOG.md` with the message "Setup log" and push. Tell me I can say "send kit feedback" in any later session to send an update.
10. **Finish.** Send me one closing message: my dashboard link (and Race Season link), each scheduled task with its time, anything not done, and what to expect in the first two weeks (baseline, easy sessions, a feel check each morning, a first training block proposed by the end of week 2). Ask me to open the dashboard on my phone and add it to my home screen.

Never edit `coach/engine/RULES.md`, `coach/engine/schemas.json`, `coach/research/PROTOCOL.md`, `.github/` or `scripts/` during onboarding, except the changes `setup/personalize.py` makes. Never send my health data to any outside service.
