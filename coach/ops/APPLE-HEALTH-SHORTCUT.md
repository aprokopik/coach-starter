# Apple Health to coach: iPhone Shortcut setup

For athletes without a Garmin: Oura, Ultrahuman, Apple Watch, or any app that writes to Apple Health. Apple Health has no web access, so a Shortcut on your iPhone sends the last 3 days of sleep, HRV, resting heart rate, steps and weight to your coach repository. The workflow `.github/workflows/ingest-apple-health.yml` runs `scripts/apple_health.py`, which writes them into `data/summary.csv`, the same file the Garmin pull writes, so the coach works the same way. Resending the same days changes nothing.

Workouts cannot be read by a Shortcut. They come from Strava (`scripts/setup_strava.py`, done with Claude at onboarding). Without Strava, tell the coach about each workout in words.

About 15 minutes, once, on your iPhone.

## 1. Let your ring or watch write to Apple Health

- **Oura:** Oura app → Settings (or your profile) → Apple Health → turn on everything it offers, especially Sleep, Heart Rate Variability and Resting Heart Rate.
- **Ultrahuman:** Ultrahuman app → Profile → Apple Health → connect and allow all categories.
- **Apple Watch:** nothing to do. Wear it to sleep with Sleep Focus set up, so it records sleep stages.
- **Strava:** not needed in Apple Health; the coach reads Strava directly.

Check: Health app → Browse → Sleep shows last night, and Heart → Heart Rate Variability has values.

## 2. Make a GitHub token that can only touch your coach repository

github.com → your picture → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
- Name: `health-shortcut`. Expiration: 1 year (put a reminder in your calendar).
- Repository access: **Only select repositories** → your coach repository.
- Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
- Generate it and copy the token (it starts with `github_pat_`). It is shown only once.

Keep the token only in the Shortcut. Never paste it into a chat.

## 3. Build the Shortcut

Shortcuts app → **+** → name it **Send health to coach**. You build one block per kind of data, then one send step. Every block follows the same pattern.

**Sleep**
1. *Find Health Samples*: Type **Sleep Analysis**. Add filter **Start Date is in the last 3 days**. Sort by Start Date, Oldest First.
2. *Repeat with Each* (Health Samples). Inside it, one *Text* action that reads exactly
   `Start Date;End Date;Value;Source`
   where each word is the **Repeat Item** variable: tap it and pick that property. Tap Start Date and End Date → Date Format **ISO 8601**, Include Time **on**. Keep the semicolons.
3. *End Repeat*. Then *Combine Text*: Repeat Results, with **New Lines**.
4. *Set Variable*: name it `Sleep`.

**HRV, resting heart rate and steps**: duplicate steps 1 to 4 three times. Change:
- Type **Heart Rate Variability**, the Text to `Start Date;Value;Source`, variable `HRV`.
- Type **Resting Heart Rate**, Text `Start Date;Value;Source`, variable `RHR`.
- Type **Steps**, Text `Start Date;Value;Source`, variable `Steps`.

**Weight** (only if you weigh yourself and your scale writes to Apple Health): one more block, Type **Weight**, Text `Start Date;Value;Unit;Source`, variable `Weight`.

**Send**
5. *Get Contents of URL*:
   - URL: `https://api.github.com/repos/{{GITHUB_OWNER}}/{{REPO}}/dispatches`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <your token>`, and `Accept` = `application/vnd.github+json`
   - Request Body: **JSON**, with two fields:
     - `event_type` (Text): `apple_health`
     - `client_payload` (Dictionary) with Text fields: `sleep` = variable Sleep, `hrv` = HRV, `rhr` = RHR, `steps` = Steps, and `weight` = Weight if you made that block.

Run it once by hand (the ▶ button). GitHub answers with an empty page when it worked.

Check: in your repository, **Actions** → **Daily health from Apple Health** shows a green tick, and `data/summary.csv` has rows for the last 3 days.

## 4. Make it run by itself

Health data is locked while the iPhone is locked, so the Shortcut runs right after you wake.

Shortcuts → Automation → **+** → **Alarm** → **Is Stopped** → your wake-up alarm → **Run Immediately** → choose **Send health to coach**.
Add a second one: **Time of Day** 9:00 PM, Daily, **Run Immediately**. It catches anything late (a nap, the ring syncing later).
If you use the Oura or Ultrahuman app every morning, a third: **App** → that app → **Is Closed** → Run Immediately. The ring syncs to Apple Health when its app opens.

## If something goes wrong

- **The run shows a red cross:** open it, click the red step, and send the last lines to the coach.
- **"Bad credentials" or 401:** the token expired or has a typo; make a new one (step 2) and paste it into the Shortcut.
- **Sleep is missing in the morning:** open the ring's app once so it syncs, then run the Shortcut by hand.
- **Odd HRV numbers:** the Apple Watch measures HRV differently from rings (SDNN). The coach compares you only with your own baseline, so the method matters only if you switch devices; tell the coach when you do.
