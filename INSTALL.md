# Install Coach

Two steps on a computer, about 6 minutes of your own time (an estimate, not yet timed with a real person). Each step ends with a **Check**. `START-HERE.md` says what Coach is and what you need.

Something not working or not clear? Tell your coach. It notes it in `setup/SETUP-LOG.md` and the last setup step sends it back to the kit's makers.

---

## 1. Make your own private copy (about 20 seconds)

1. Sign in at github.com (the free plan is enough).
2. Open **github.com/new?template_owner=aprokopik&template_name=coach-starter&name=my-coach&visibility=private**. The coach template, the name `my-coach` and **Private** are already filled in.
3. Check the owner is you, then click **Create repository**.

**Check:** after a few seconds you are on your own repository, and it shows a `coach` folder and `START-HERE.md`.

## 2. Type "start" in Claude Code (about 5 minutes of yours)

1. Open **claude.ai/code** and sign in.
2. Connect your GitHub account when Claude asks, and give the Claude GitHub app access to your coach repository (choose **Only select repositories**, then pick `my-coach`).
3. Start a new session with `my-coach` selected, type **start** and send it.

**Check:** your coach answers with "Four cards and you are looking at your own coach".

From here your coach leads, and you only tap:

- **Four tap cards**, about three minutes. Your goals and what records your sleep; a short health screen; your hours, the days that never work and when your morning check-in should arrive; how you like to lift and what kit you can use. Every question has a "Something else" option for your own words, and every question can be skipped.
- **Your device**, now or later. Your coach asks whether to connect it now or start without it. Garmin takes about 3 minutes (see below). A ring or Apple Watch takes about 20 minutes on your iPhone: a free Strava account for workouts and one Shortcut for sleep and recovery.
- **Claude finishes the setup** while you do other things, about 20 minutes: your first week, your private dashboard, your daily check-in, and a button for your phone's home screen.
- **Four feedback taps** at the end, and a link to send the setup log back.

**Check:** Claude's last message lists your dashboard link and each scheduled task with its time. If any line says "not done", ask Claude to retry that step.

Your coach always lives in **Claude Code** (claude.ai/code, the **</>** icon at the top of Claude's sidebar), never in a regular Claude chat or chat project. A regular chat can read files but cannot save anything to your repository.

---

## Your Garmin login (when your coach asks, about 3 minutes)

Your coach gives you a link that opens GitHub's new-secret form for your repository (`github.com/<your GitHub name>/my-coach/settings/secrets/actions/new`). Add three secrets, one after the other:

- Name `GARMIN_EMAIL`, value: the email you use for Garmin Connect.
- Name `GARMIN_PASSWORD`, value: your Garmin Connect password.
- Name `GARMIN_TOKEN_KEY`, value: a secret phrase you make up on the spot, four or more words. Not your Garmin password. You never have to type it again.

GitHub encrypts secrets; nobody can read them after you save them, not even you. Never type the password or the phrase into a chat. Your coach then starts your first week of data and your history itself.

**Then delete the password.** The first pull trades your password for a pass from Garmin, locked with your phrase. When your coach says it is ready (about two minutes), open the link it gives you (`github.com/<your GitHub name>/my-coach/settings/secrets/actions`), tap the bin next to `GARMIN_PASSWORD` and confirm. From then on your Garmin password is stored nowhere, and the watch data arrives four times a day.

**If the data ever stops with "no password is stored".** Garmin ended the pass (it happens after a password change, and now and then by itself). Add `GARMIN_PASSWORD` again with the same link, tell your coach, and delete it again after the next pull. Your coach tells you the day it happens.

## If something goes wrong

- **The link in step 1 opens with empty boxes.** Open the `coach-starter` page, click the green **Use this template** button, then **Create a new repository**; name it `my-coach` and choose **Private**.
- **Typing "start" does nothing.** Open `ONBOARDING-PROMPT.md` in your repository, copy everything below its line and send it as your message.
- **The coach says it "can't reach your coach repo".** Check that you are talking to it in Claude Code. If you are, open claude.ai/connect-github and make sure your coach repository is ticked.
- **Claude cannot start your first Garmin pull.** Open `github.com/<your GitHub name>/my-coach/actions`, click the green button if GitHub asks to enable workflows, then **Pull Garmin data**, **Run workflow**, type `7`, green **Run workflow**; do the same for **Backfill Garmin history** with every box empty. A good run has a green tick. Yellow notices about Node.js or Ubuntu do not matter.
- **The Garmin pull fails with "two-step verification code".** Your Garmin account uses two-step login. Ask your coach: "help me set up the Garmin token for two-step login".
- **401 or "login failed".** Check the secrets for typos (save `GARMIN_PASSWORD` again). If you change your Garmin password, add `GARMIN_PASSWORD` again with the new one, and delete it after the next pull.
- **429.** Garmin is limiting logins. Wait an hour and run it again.
- **Anything else.** Open the failed run, click the red step, copy the last lines and paste them to your coach.

## Your first two weeks

- Each morning you get one message. Read the call (GREEN, YELLOW or RED), do the workout or the fallback, and answer the feel check (four taps on the dashboard, or reply in words).
- Week 1 and 2 are a baseline: sessions stay easy while the coach learns your normal sleep, resting heart rate and HRV. By the end of week 2 it proposes your first training block, and you accept it or ask for changes.
- On Sundays the message is a short weekly review with up to three commitments for the week.
- Talk to the coach any time by replying to a check-in. Plain words are fine: "my knee hurts going downstairs", "I'm travelling Thursday to Sunday", "I registered for the race".

## Stopping or pausing

- Pause the coach: ask Claude to pause your scheduled tasks.
- Stop the Garmin pulls: in your repository, **Actions**, **Pull Garmin data**, the **…** menu, **Disable workflow**.
- Remove access completely: delete the Garmin secrets, change your Garmin password, and delete the repository.
