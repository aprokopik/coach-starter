# Coach

A personal endurance and health coach that runs on Claude. It reads your sleep, recovery and training from your watch or ring, and works toward one thing: a long, healthy, active life, with your events as milestones along the way.

## What you get

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/coach-chat-dark.png">
  <img src="assets/coach-chat-light.png" width="358" alt="A chat with the coach. Coach, 7:00 AM: GREEN. You slept 7 h 20 and your resting heart rate is at your usual. Today: easy run, 40 minutes, able to talk the whole way. Short on time: 25 minutes. Why: tomorrow is your long run, and easy today keeps it strong. You: I'm travelling Thursday to Sunday. Hotel gym only. Coach: Easy to work around. Your long run moves to Wednesday, before you leave. Thursday to Sunday become three short hotel sessions, 25 minutes each, and one full rest day for the flight. Nothing is lost: the week still has its three key sessions. Plan updated, 4 days changed.">
</picture>

**One short message each morning.** How ready you are, today's single workout with an easier fallback, and why.

**A dashboard on your phone.** Today's plan and a one-tap feel check, your week against the plan, your lifts, your fitness measured against people your age, your health habits, and the road to your next event.

**A coach that listens.** Reply in plain words ("my knee hurts going downstairs", "I'm travelling Thursday to Sunday") and the plan changes, with a note of why.

**Built around you.** Four tap cards about your goals, your health, your week and how you like to lift shape everything. A beginner building a habit and an athlete chasing a race get different coaches from the same kit.

## Start in two steps

1. **Make your own private copy:** open **github.com/new?template_owner=aprokopik&template_name=coach-starter&name=my-coach&visibility=private** and click **Create repository**.
2. **Open claude.ai/code**, pick your `my-coach` repository, type **start**.

About 6 minutes of your own time (an estimate, not yet timed with a real person). `START-HERE.md` says what you need and how long each part takes; `INSTALL.md` has the steps with a check after each.

## What you need

A paid Claude plan with Claude Code, a free GitHub account, and a Garmin watch, an Oura or Ultrahuman ring, or an Apple Watch (rings and Apple Watch also need an iPhone). You can start before connecting the device.

## Your data stays yours

Your health data lives in your own private GitHub repository and your Claude account, and the coach never sends it anywhere else. Coach is not a doctor and never diagnoses. This is an alpha: it shows miles, pounds and °F, and Garmin is the most tested device.

---

## For the coach: reading guide

| Path | What it is |
|---|---|
| `data/summary.csv` | One row per date: sleep, HRV, resting HR, Body Battery, stress, steps, intensity minutes, weight, and more. `missing` lists absent core fields |
| `data/activities.csv` | One row per activity: type, start, duration, distance, ascent, HR, power, speed, training effect, load |
| `data/daily/YYYY-MM-DD.json`, `data/activities/<id>.json` | Exact device responses, as captured |
| `data/status/last_run.json` | Latest pull: dates requested, per method status, any login error |
| `coach/` | The coach: rules, athlete, plan, races, tools, dashboard. See `coach/README.md` |

Rules: an empty or errored value means unknown, not zero and not abnormal. No activity returned does not prove no workout (for example a ride not synced). Units: device native in JSON (metres, seconds, grams); converted units only in the CSVs.

`VERSION` holds the Coach package version this copy was made from; `CHANGELOG.md` lists changes since. `python3 coach/tools/version.py` prints it. The interview that personalizes the coach is `ONBOARDING-PROMPT.md`. Setup problems and ideas go in `setup/SETUP-LOG.md` and back to the kit's makers with `setup/feedback.py`.
