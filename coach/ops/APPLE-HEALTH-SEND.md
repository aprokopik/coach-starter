# Scale to coach: manual send from a Claude chat on iPhone

The fallback when the "Send scale to coach" Shortcut (`SCALE-SHORTCUT.md`) is not running: a missed day, an expired token, or a backfill. Either route writes the same file, `data/body_comp.csv`, and resending a day already there changes nothing.

## What you need (once)
1. **Hume writes to Apple Health:** Health app → your picture → Apps → Hume → Weight and Body Fat Percentage on.
2. **Claude iPhone app** with Apple Health turned on: Settings → Connectors (or Integrations) → Apple Health → allow Weight and Body Fat Percentage.
3. **GitHub connected** in the same Claude app, with access to `{{GITHUB_OWNER}}/{{REPO}}`.
4. Optional: add this file to your coach Project's knowledge, so a chat in that Project already has the format.

## The prompt (paste into a new chat; it works on any day)

> Read my Apple Health Weight and Body Fat Percentage samples from the last 10 days. In the GitHub repo {{GITHUB_OWNER}}/{{REPO}} (branch main), open `data/body_comp.csv` and append one row per weigh-in that is not already in the file (match on `measured_at`). Columns, in order: `measured_at,date,weight_lb,body_fat_pct,lean_lb,lean_basis,source,received_utc`.
> - `measured_at`: the sample time, ISO 8601 with the Eastern offset (e.g. 2026-11-03T06:40:00-05:00); `date`: its local date.
> - `weight_lb` to one decimal (convert from kg if needed); `body_fat_pct` to two decimals, from the Body Fat sample taken at the same weigh-in (blank if none).
> - `lean_lb` = weight × (1 − body fat / 100), one decimal, and `lean_basis` = `calculated`; both blank if there is no body fat.
> - `source` = `Apple Health`; `received_utc` = now in UTC (e.g. 2026-11-03T14:05:00Z).
> Keep existing rows and the header unchanged. Commit to main as "Scale weigh-ins <first date> to <last date> from Apple Health (sent via Claude)". Then tell me how many rows you added and the dates. Do not change any other file.

## After it lands
The next 7:45 AM check-in reads the new weigh-ins and updates `summary.csv` weights and the dashboard. For a refresh sooner, ask the coach chat to rebuild the dashboard.
