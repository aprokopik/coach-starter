# Coach: start here

Coach is a personal endurance and health coach that runs on Claude. Every morning it reads last night's sleep, heart rate and training from your watch or ring, then sends you one short message: how ready you are, today's single workout with an easier fallback, and why. A phone-first dashboard shows your week, your fitness trends, your health habits and your race season. The point is a long, healthy, active life, with races as milestones along the way.

## What you need

- A **Garmin watch**, or an **iPhone** with an **Oura** or **Ultrahuman** ring or an **Apple Watch**. Garmin works fully automatically. With a ring or Apple Watch, your sleep and recovery come through Apple Health and an iPhone Shortcut, and your workouts through **Strava** (free account).
- A free **GitHub** account. Your data is kept in a private repository there, which only you can see.
- A **Claude** paid plan with Claude Code on the web (claude.ai/code), which runs the coach and its scheduled tasks.
- About **45 minutes** once, on a computer. After that everything runs by itself and you only use your phone.

## The three parts

| Part | Where | Time | What happens |
|---|---|---|---|
| 1. Your data | GitHub | 15 min | You copy the coach-starter template into your own private repository (one click). Garmin users add their Garmin login, and their watch data starts landing there four times a day. Ring and Apple Watch users connect their data in Part 2. |
| 2. Your coach | Claude | 25 min | You paste one prompt into Claude. It interviews you, one question at a time, about your goals, events, schedule and health, then sets up your coach, your dashboard and your daily check-in. |
| 3. Your first two weeks | Phone | 2 min a day | The coach learns what is normal for you. Sessions stay easy until it does. Answer the short feel check each morning. |

**The easy way: let Claude walk you through it.** Open a new chat at claude.ai, paste the prompt in **`SETUP-PROMPT.md`**, and Claude guides you through Part 1 one step at a time, helps with anything that goes wrong (send it screenshots), then hands you over to Part 2, which uses **`ONBOARDING-PROMPT.md`**. If you would rather read the steps yourself, they are all in **`INSTALL.md`**.

## Updates

The coach gets better over time. When a new version is out, paste `UPDATE-PROMPT.md` into Claude Code: it updates the coach's engine, tools and dashboard and never touches your own profile, plans, log or data.

## Help us make it better

This is an alpha. As you go, Claude keeps a short setup log of what was slow, broken or confusing (`setup/SETUP-LOG.md`, never your health data). At the end it shows you the log and gives you a one-click link to send it back to the kit's makers, or text you can send to whoever invited you. Later, say "send kit feedback" to your coach any time something about the setup or the coach itself could be better.

## Good to know

- **Health first.** The setup asks a short pre-exercise health screen. If anything in it needs a doctor, the coach keeps training easy until you say you have been cleared. Coach is not a doctor and never diagnoses.
- **Privacy.** Your health data stays in your private GitHub repository and your Claude account. The coach never sends it anywhere else.
- **Units.** The dashboard shows miles, pounds and °F in this version.
- **Garmin login.** Coach uses an unofficial Garmin client, which is a gray area of Garmin's terms. Use a Garmin password you do not use anywhere else.
- **Rings and Apple Watch are newer.** This path is in alpha: the numbers differ from Garmin's (no Body Battery, a different HRV method), and the coach says so plainly. Your feedback shapes it.
- **Changing your mind.** Tell the coach in plain words ("I signed up for the Richmond half", "I can only train 4 hours this month"). It updates your plan and keeps a log of why.
