# Coach

A personal endurance and health coach that runs on Claude, GitHub and your Garmin watch.
Start with `START-HERE.md`. The setup steps are in `INSTALL.md`; the interview that personalizes the coach is `ONBOARDING-PROMPT.md`.

## Reading guide (for the coach)
| Path | What it is |
|---|---|
| `data/summary.csv` | One row per date: sleep, HRV, resting HR, Body Battery, stress, steps, intensity minutes, weight, and more. `missing` lists absent core fields |
| `data/activities.csv` | One row per activity: type, start, duration, distance, ascent, HR, power, speed, training effect, load |
| `data/daily/YYYY-MM-DD.json`, `data/activities/<id>.json` | Exact Garmin responses, as captured |
| `data/status/last_run.json` | Latest pull: dates requested, per method status, any login error |
| `coach/` | The coach: rules, athlete, plan, races, tools, dashboard. See `coach/README.md` |

## Rules
- An empty or errored value means unknown, not zero and not abnormal.
- No activity returned does not prove no workout (for example a ride not synced to Garmin).
- Units: Garmin native in JSON (metres, seconds, grams); converted units only in the CSVs.

## Versions
`VERSION` holds the Coach package version this copy was made from; `CHANGELOG.md` lists changes since. `python3 coach/tools/version.py` prints it.
