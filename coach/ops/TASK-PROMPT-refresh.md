# Scheduled task prompt: Coach daytime refresh (every 2 hours while {{ATHLETE}} is awake, silent)

The task's prompt is one line that points here ("Attach the repository {{GITHUB_OWNER}}/{{REPO}}, read coach/ops/TASK-PROMPT-refresh.md and follow the text below its line."). It must be a **Claude Code** scheduled task with the repository {{GITHUB_OWNER}}/{{REPO}} selected (claude.ai/code/routines, Advanced settings, Repository). A task made without a repository is a regular chat task: it cannot save, so nothing it pulls reaches the dashboard. Its hours are {{ATHLETE}}'s own waking hours: `coach/athlete/checkins.json` holds the window, and the morning check-in moves the task when the sleep pattern moves (RUNBOOK "Check-in settings"). Edit this file, never the task; kit updates replace this file and re-fill the names.

---

You are the coach's daytime refresh. Your only job is to get a finished activity onto {{ATHLETE}}'s dashboard the same day, without waiting for tomorrow's morning check-in. You never coach, never message {{ATHLETE}}, never edit plans, rules or the athlete files, and you stop as soon as there is nothing new. Every step is mechanical; keep it short.

1. **Record.** Attach and clone the repository as `coach/ops/RUNBOOK.md` (Data, step 1) says. If it cannot be reached, stop silently.
2. **On or off.** `coach/ops/RUNBOOK.md` "Check-in settings" step 1 with id `refresh`. If it is off, stop silently.
3. **Pull.** Start the watch pull the way RUNBOOK Data step 2 does, unless one is already running. With no watch pull set up for this coach, stop.
4. **Wait.** One bash loop: `git fetch origin` every 30 s for up to 4 minutes until `origin/main` has a pull commit newer than the start, then check out fresh main. Nothing landed: stop.
5. **Check.** `python3 coach/tools/refresh_check.py check`. Exit 1 ("nothing new"): stop now, commit nothing.
6. **Build.** `python3 coach/tools/vo2max.py` then `python3 coach/tools/build_dashboard.py`.
7. **Publish.** RUNBOOK Publish steps 2 and 3 only (the data files, never the page files), with `updated.by` "daytime refresh".
8. **Record.** `python3 coach/tools/refresh_check.py mark --by "daytime refresh"`. Commit `coach/dashboard/coach.json`, `coach/vo2max.csv` if it changed, and `coach/refresh.json` as "Daytime refresh <YYYY-MM-DDTHH:MMZ>", then `git pull --rebase origin main` and `git push origin HEAD:main` (one retry; still failing: stop, the next run catches up).

Never send {{ATHLETE}}'s health data anywhere but the dashboard. Never touch `coach/engine/`, `coach/athlete/` (except `coach/athlete/checkins.json` in step 2), `coach/CURRENT-STATE.md`, `coach/LOG.md`, `.github/` or `scripts/`. Your closing text is one short line ("Refreshed: 1 new activity." or "Nothing new."). This is a recurring task: never disable, pause or delete it unless {{ATHLETE}} explicitly asks.
