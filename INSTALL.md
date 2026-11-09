# Install Coach

Read `START-HERE.md` first. **Easiest:** paste `SETUP-PROMPT.md` into a new chat at claude.ai and let Claude walk you through these same steps, troubleshoot with you, and keep the setup log. This page is the written version. Do these steps on a computer, in order. Each step ends with a **Check** so you know it worked before you move on.

Something not working or not clear? Note it: Claude adds it to `setup/SETUP-LOG.md` in Part 2, and step 9 of the onboarding sends it back to the kit's makers.

---

## Part 1. Your data (GitHub, about 15 minutes)

### 1. Open the kit
Sign in at github.com (create a free account if you do not have one), then open the `coach-starter` link you were sent. It is public, so no invitation is needed. (If you got a GitHub email inviting you to it instead, click **View invitation** and **Accept invitation** first.)

**Check:** you can open the `coach-starter` repository page.

### 2. Make your own private copy
1. On the `coach-starter` page, click the green **Use this template** button, then **Create a new repository**.
2. Owner: you. Name it `my-coach` (any name works; write it down). Choose **Private**. Click **Create repository**.

**Check:** after a few seconds you are on your own repository, and it shows a `.github` folder, a `coach` folder and `START-HERE.md`. Everything else happens in this copy; `coach-starter` is never changed.

### 3. (Only if you were sent a zip instead of an invitation)
GitHub's web upload takes at most 100 files at a time, so upload the kit in three drops:
1. Make an empty private repository (**+** → **New repository**, Private, no boxes ticked) and click **uploading an existing file**.
2. Show hidden files (Mac: Cmd+Shift+. ; Windows: View, Hidden items) so `.github` is included. Drag in everything in the kit folder **except** the `coach` folder. Commit.
3. Move `coach/dashboard` out to your Desktop for a minute. **Add file → Upload files**, drag the `coach` folder in, commit.
4. Open the `coach` folder on GitHub, **Add file → Upload files**, drag in `dashboard` from your Desktop, commit.

> **Oura, Ultrahuman or Apple Watch instead of Garmin?** Skip steps 4 and 5 and go straight to Part 2. Claude connects your data there: Strava for workouts (about 5 minutes) and an iPhone Shortcut for sleep and recovery (`coach/ops/APPLE-HEALTH-SHORTCUT.md`, about 15 minutes on your phone).

### 4. Add your Garmin login as two secrets
In your repository: **Settings**, then **Secrets and variables** in the left menu, then **Actions**, then **New repository secret**. Add two secrets:

- Name `GARMIN_EMAIL`, value: the email you use for Garmin Connect.
- Name `GARMIN_PASSWORD`, value: your Garmin Connect password.

GitHub encrypts secrets; nobody can read them after you save them, not even you.

### 5. Pull your first data
1. Open the **Actions** tab. If GitHub asks, click the green button to enable workflows.
2. Click **Pull Garmin data** in the list on the left, then **Run workflow**. In the box, type `7` (the number of past days to fetch) and click the green **Run workflow**.
3. Wait about 2 minutes and refresh the page.

**Check:** the run has a green tick, and `data/summary.csv` in your repository now has one row per day for the last week. Yellow notices about Node.js 20 or Ubuntu are GitHub housekeeping and do not matter.

4. Now fetch your history, so the coach knows your past training: click **Backfill Garmin history**, then **Run workflow**, leave every box empty, and click the green **Run workflow**. It fetches up to two years and can take a while; if it stops before the end, run it again and it picks up where it left off.

Once Part 2 sets your time zone, the pull runs by itself four times a day (until then, only when you run it). GitHub emails you if a run fails.

### If the pull fails
- **"two-step verification code"**: your Garmin account uses two-step login. Finish Part 2 first, then ask your coach: "help me set up the Garmin token for two-step login". It walks you through `scripts/setup_token.py`.
- **401 or "login failed"**: check both secrets for typos. If you ever change your Garmin password, update `GARMIN_PASSWORD`.
- **429**: Garmin is limiting logins. Wait an hour and run it again.
- **Anything else**: open the failed run, click the red step, copy the last lines, and paste them to Claude in Part 2.

---

## Part 2. Your coach (Claude, about 25 minutes)

### 6. Connect GitHub to Claude
1. Go to claude.ai/code and sign in.
2. Connect your GitHub account when Claude asks, and give the Claude GitHub app access to your coach repository (choose **Only select repositories**, then pick `my-coach`).

3. Your coach also talks to you in the Claude app, in your **Coach project**, and its scheduled tasks run there too. That project needs the repository as well: open the project at claude.ai, then **Project settings**, then **Repositories**, and add `my-coach`. (If you have no Coach project yet, onboarding makes one with you in step 8; do this then.)

**Check:** when you start a new session at claude.ai/code, your coach repository is in the list of repositories you can pick, and your Coach project's Repositories list shows it. If the coach ever says it "can't reach your coach repo", this step is the fix; if it still can't, open claude.ai/connect-github and make sure your coach repository is ticked.

### 7. Start your onboarding session
1. At claude.ai/code, start a new session with your coach repository selected.
2. Open `ONBOARDING-PROMPT.md` from the kit folder, copy everything below its line, paste it as your first message, and send it.

### 8. Answer the interview
Claude asks one question at a time, mostly as buttons you tap. It covers:
- you (name, time zone, how you would like to be referred to),
- why you train and what matters most,
- your events (name, date, how committed you are),
- your week (hours, days that never work, strength and swimming),
- which device you use (Garmin, Oura, Ultrahuman or Apple Watch) and whether you use Strava,
- your heart rate (if you know your max) and any injuries,
- a 12-question health screen,
- what you would like the coach to watch (race registration dates, new research, an optional smart scale).

Skip anything you do not know; the coach marks it unknown and asks again later only if it matters. Plan on 10 to 15 minutes.

### 9. Let Claude finish the setup
When the interview ends, Claude does the rest and tells you each result:
1. Writes your answers into the repository and checks that everything is filled.
   - Ring or Apple Watch users: Claude walks you through connecting Strava, then points you to the Shortcut guide for your iPhone.
2. Runs the tests and the first morning calculation on your real Garmin data.
3. Creates your private **dashboard** and gives you its link. Open it on your phone and add it to your home screen.
4. Creates your **daily check-in** at the time you chose, plus the weekly race watch and the monthly research scan if you asked for them.
5. Saves everything to your repository.

6. Asks you four quick questions about the setup, shows you the setup log, and gives you a link to send it back (or text to send to whoever invited you).

**Check:** Claude's last message lists your dashboard link and each scheduled task with its time. If any line says "not done", ask Claude to retry that step.

---

## Part 3. Your first two weeks

- Each morning you get one message. Read the call (GREEN, YELLOW or RED), do the workout or the fallback, and answer the feel check (four taps on the dashboard, or reply in words).
- Week 1 and 2 are a baseline: sessions stay easy while the coach learns your normal sleep, resting heart rate and HRV. By the end of week 2 it proposes your first training block, and you accept it or ask for changes.
- On Sundays the message is a short weekly review with up to three commitments for the week.
- Talk to the coach any time by replying to a check-in. Plain words are fine: "my knee hurts going downstairs", "I'm travelling Thursday to Sunday", "I registered for the race".

## Stopping or pausing

- Pause the coach: ask Claude to pause your scheduled tasks.
- Stop the Garmin pulls: in your repository, **Actions**, **Pull Garmin data**, the **…** menu, **Disable workflow**.
- Remove access completely: delete the two secrets, change your Garmin password, and delete the repository.
