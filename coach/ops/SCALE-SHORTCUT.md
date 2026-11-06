# Scale to coach: iPhone Shortcut setup

The Hume scale writes to Apple Health. Apple Health has no web access, so a Shortcut on the athlete's iPhone sends the last 7 days of weight, body fat % and lean mass to this repo. The workflow `.github/workflows/ingest-body-comp.yml` merges them into `data/body_comp.csv` and `data/summary.csv`. Resending the same days changes nothing. About 10 minutes, once. It works only after the PR that added it is merged.

## 1. Let Hume write to Apple Health

Health app → your picture → Apps → Hume → turn on **Weight**, **Body Fat Percentage** and **Lean Body Mass**.

## 2. Make a GitHub token that can only touch this repo

github.com → your picture → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
- Name: `scale-shortcut`. Expiration: 1 year (put a reminder in your calendar).
- Repository access: **Only select repositories** → `{{REPO}}`.
- Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
- Generate it and copy the token (it starts with `github_pat_`). It is shown once.

Keep the token only in the Shortcut. Don't paste it into a chat.

## 3. Build the Shortcut

Shortcuts app → + → name it **Send scale to coach**. Add these actions in order.

**Weight**
1. *Find Health Samples*: Type **Weight**, add filter **Start Date is in the last 7 days**, Sort by Start Date, Oldest First.
2. *Repeat with Each* (Health Samples). Inside it, one *Text* action that reads exactly:
   `Start Date;Value;Unit;Source`
   where each word is a **Repeat Item** variable: tap it and choose that property (Start Date, Value, Unit, Source). Tap the Start Date variable → Date Format **ISO 8601** → Include Time **on**. Keep the semicolons between them.
3. *End Repeat*. Then *Combine Text*: Repeat Results, with **New Lines**.
4. *Set Variable*: name it `Weight`.

**Body fat** and **Lean mass**: duplicate steps 1 to 4 twice (long-press the first action → Duplicate, or build them again). Change the Type to **Body Fat Percentage** and **Lean Body Mass**, and name the variables `Fat` and `Lean`.

**Send**
5. *Get Contents of URL*:
   - URL: `https://api.github.com/repos/{{GITHUB_OWNER}}/{{REPO}}/dispatches`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <your token>`; `Accept` = `application/vnd.github+json`
   - Request Body: **JSON**, with two fields:
     - `event_type` (Text): `body_comp`
     - `client_payload` (Dictionary) holding three Text fields: `weight` = variable Weight, `fat` = variable Fat, `lean` = variable Lean

Run it once by hand. A success returns nothing (GitHub answers 204). If it shows an error message, the token or URL is wrong.

## 4. Make it automatic

Shortcuts → Automation → + → Create Personal Automation:
- **App** → Hume → **Is Closed** → Run Immediately → Send scale to coach. It runs after each weigh-in, once the reading has synced.
- A second one, as a catch-up: **Time of Day** 8:00 PM, Daily → Run Immediately → Send scale to coach.

## 5. Check it

GitHub → {{REPO}} → Actions → "Scale weigh-ins from Apple Health" shows a green run, and `data/body_comp.csv` has your weigh-ins. The coach's next morning check-in reads them. You can stop typing your weight into Garmin: the scale wins whenever both exist.

If the scale goes quiet for 3 days, the check-in says so. The usual causes are an expired token, or Hume no longer writing to Apple Health.
