# Notes for Claude in this repository

This repository is one athlete's Coach, made from the Coach starter kit (alpha). Start with `README.md`; the coach's own rules are in `coach/engine/RULES.md`.

## First session

If `setup/answers.json` does not exist, this coach has not been set up yet. Whatever the athlete's first message is ("start", "hi", "set me up", or anything else that is not a clear other request), read `ONBOARDING-PROMPT.md` and follow the text below its line as if they had pasted it, starting with the welcome. They never need to copy the prompt.

## Kit feedback

The kit's makers improve it from testers' setup logs. Help close that loop:

- When the athlete hits a problem with the **setup or the coach itself** (a workflow fails, a tool errors, a guide is wrong or unclear, the dashboard or a scheduled task misbehaves), add one dated line to `setup/SETUP-LOG.md` under "After setup": what happened, what fixed it, minutes lost. Training, health and nutrition questions are not kit feedback.
- When this coach **develops something new** for its athlete that others could use (a metric or tile, a survey question, a tool, a clearer rule or guide), or the athlete wishes for one, add one dated line to `setup/SETUP-LOG.md` under "Ideas for the kit" (add that heading above "Feedback" if the log has none): the idea in plain words and why it helped. Words only: never a reading, the athlete's data or a copy of their files. What the athlete types under "Want to track something else?" on the dashboard is kept in `coach/metric_requests.csv` and goes back the same way. The morning check-in offers to send what is new (its "Ideas for the kit" paragraph); the kit's makers review each one as a proposal for every coach.
- When the athlete says "send kit feedback" (or anything like it), update the Summary and Feedback sections with them, show them the log, let them cut anything, then run `python3 setup/feedback.py` and give them its link and its text block (step 9 of `ONBOARDING-PROMPT.md`, Stage 2). When they say they pressed Submit (or sent the text), run `python3 setup/feedback.py --sent`. Commit `setup/SETUP-LOG.md` and `coach/metric_requests.csv`.
- The log never holds health data, passwords, tokens, email addresses or account names. `setup/feedback.py` refuses to send a log that seems to.
- Never edit `setup/kit.json`; it says where feedback goes.

## Customizing this coach

The athlete can change anything about how their coach works. Keep every change where updates cannot break it:

- How the coach sounds (tone, words to avoid, how much data) goes in `coach/athlete/PROFILE.md` under "Persona". Any other change to how it works (a rule of their own, a schedule, something to always or never do, an extra thing to track) goes under "My changes" in the same file: one dated line, what and why. Both are the athlete's own; the coach reads them every morning and no update touches them.
- Do not edit the kit's own files to make a change (the list is `kit_files` in `setup/kit-manifest.json`: the engine, tools, dashboard code, task prompts, guides). An edited kit file has to be merged by hand at every update. Never put the athlete's wishes in a scheduled task's prompt either; the prompt stays the one line.
- If a change truly cannot be made in words (new code, a new tile), make it, tell the athlete in one line that updates will need a merge for that file, and log it as below.
- Every time, add one dated line under "Ideas for the kit" in `setup/SETUP-LOG.md`: "Customized: <what>, because <why>." Words only, never a reading or their data. Many athletes asking for the same change is how it becomes a setting for everyone. The morning check-in offers to send what is new.
- Health and safety rules (`coach/engine/RULES.md`, the screen) are not customizable here; say so plainly if asked.

## Scheduled tasks

Every coach task (morning check-in, an evening check-in, race watch, research scan, or any new one the athlete asks for) must be a Claude Code scheduled task with this repository selected. A task with no repository is a chat task: it cannot save anything, and the athlete's answers stay stuck in that chat. When you create or change a task, select the repository; if you cannot create it yourself, walk the athlete through claude.ai/code/routines screen by screen (New task, the prompt, Schedule, Advanced settings, Repository, Create, Run now). If you see a coach task tagged Chat on that page, help the athlete move it. When the athlete asks for an evening check-in, make it from `coach/ops/TASK-PROMPT-evening.md` (one-line prompt that points to the file) as a Code task, never a hand-written prompt in a chat.

## Updates

`VERSION` says which kit this coach is on. When the athlete asks to update, follow `UPDATE-PROMPT.md` (from the kit's home repository if this copy is older): `setup/update.py` swaps in the kit's own files and never touches the athlete's. After any setup change, use `python3 setup/personalize.py setup/answers.json --refresh`; a run without `--refresh` rewrites CURRENT-STATE, LOG and the profile from the onboarding answers.
