# Coach: start here

Coach is a personal endurance and health coach that runs on Claude. Every morning it reads last night's sleep, heart rate and training from your watch or ring, then sends you one short message: how ready you are, today's single workout with an easier fallback, and why. A phone-first dashboard shows your week, your fitness trends, your health habits and your race season. The point is a long, healthy, active life, with races as milestones along the way.

## Start in two steps

1. **Make your own private copy.** Open **github.com/new?template_owner=aprokopik&template_name=coach-starter&name=my-coach&visibility=private** and click **Create repository**. (Free GitHub account; about 20 seconds.)
2. **Type "start" in Claude Code.** Open **claude.ai/code**, connect GitHub when asked, pick your `my-coach` repository, type **start** and send it. Your coach takes it from there: four tap cards about you, then it builds your plan, your dashboard and your morning check-in.

That is the whole path. Your coach lives in **Claude Code** (claude.ai/code), never in a regular Claude chat: a regular chat cannot save anything to your repository. `INSTALL.md` has the same two steps with a check after each, and what to do if something goes wrong.

## What you need

- A paid **Claude** plan with Claude Code on the web (claude.ai/code). It runs the coach and its scheduled tasks.
- A free **GitHub** account. Your data is kept in a private repository there, which only you can see.
- A **Garmin watch**, or an **iPhone** with an **Oura** or **Ultrahuman** ring or an **Apple Watch**. You can also start with none connected: your plan, dashboard and check-in work from your answers and a short feel check each morning, and you connect the device when you are ready.
- A computer for the setup. After that you only need your phone.

## How long it takes

**About 6 minutes of your own time**, once (an estimate, not yet timed with a real person). Claude keeps working for about 20 more minutes while you do other things.

| Your part | Time |
|---|---|
| Make your copy and connect it to Claude | about 1 min |
| Four tap cards: your goals, a short health screen, your week, your lifting | about 3 min |
| Dashboard button on your phone, four feedback taps | about 2 min |

Connecting your device comes on top, now or any day later:

| Device | Extra time | What it takes |
|---|---|---|
| Garmin watch | about 3 minutes | Your Garmin login, typed into GitHub's secret boxes; you delete the password again after the first data pull, so it is stored nowhere. Data then arrives four times a day by itself. |
| Oura, Ultrahuman or Apple Watch | about 20 minutes | A free Strava account for workouts, and an iPhone Shortcut you build once for sleep and recovery. This path is newer and has not been timed on a real phone yet. |

## Your first two weeks

About 2 minutes a day on your phone. The coach learns what is normal for you, and sessions stay easy until it does. Answer the short feel check each morning, and the few extra taps your goals call for under "Your first two weeks" on the dashboard's Check-in tab.

## Updates

The coach keeps itself current: each morning it checks for a newer version, installs and tests it, and tells you in one line what changed. An update never touches your own profile, plans, log or data, and one that fails its checks is undone. Say "stop automatic updates" to be asked first instead.

## Help us make it better

This is an alpha. Claude keeps a short setup log of what was slow, broken or confusing (`setup/SETUP-LOG.md`, never your health data). At the end it shows you the log and gives you a one-click link to send it back to the kit's makers. Later, say "send kit feedback" to your coach any time.

## Good to know

- **Health first.** The setup asks a short pre-exercise health screen. If anything in it needs a doctor, the coach keeps training easy until you say you have been cleared. Coach is not a doctor and never diagnoses.
- **Privacy.** Your health data stays in your private GitHub repository and your Claude account. The coach never sends it anywhere else.
- **Units.** The dashboard shows miles, pounds and °F in this version.
- **Garmin login.** Coach uses an unofficial Garmin client, which is a gray area of Garmin's terms. Your login goes only into GitHub's encrypted secret boxes, never into a chat. If your Garmin password is one you also use elsewhere, changing it first is the safer choice.
- **Rings and Apple Watch are newer.** The numbers differ from Garmin's (no Body Battery, a different HRV method), and the coach says so plainly.
- **Changing your mind.** Tell the coach in plain words ("I signed up for the Richmond half", "I can only train 4 hours this month"). It updates your plan and keeps a log of why.
