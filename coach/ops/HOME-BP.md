# Home blood pressure: how readings are logged

Standing rule (the athlete, Nov 4, 2026): the athlete sends cuff photos (A&D Medical) with no text. The coach decides how they are recorded and does not ask about it. the athlete only sees the photo acknowledged and the resulting number. Ask only when a reading cannot be read from the photo.

1. **Read the photo:** SYS, DIA and pulse. If glare hides a digit, ask once on a card.
2. **Keep settled readings, drop the rest.** Drop a reading taken right after sitting down or while busy, and a failed one (the cuff pumped twice, or an error shows). Name each dropped reading in the note of the next kept reading.
3. **Store one pair of rows per kept reading** in `coach/health.json`: `kind: lab`, `key: bp_sys` and `bp_dia`, the same `date` and `time` (HH:MM local; when the photo arrived, or approximate and said so), `part` (`morning` or `evening`; after work counts as evening), `unit: mmHg`, `note` (cuff, pulse, anything dropped), `source: Reported`.
4. **Never average into one row and never overwrite.** `pillars.py` averages the readings within 7 days of the newest one and shows a morning vs evening split.
5. **Do a small PR**, run the tests, and merge on green CI. Standing approval (the athlete, Nov 6, 2026, decision card): data-only PRs (BP rows, Garmin pulls, other data commits that never bump VERSION) merge as soon as CI is green, with no merge card. Any PR that touches code, docs or rules still needs the athlete's sign-off. Reply in one line with the reading as logged and the pillar value and status (Good under 120/80, Watch 120 to 129 with diastolic under 80, Act otherwise). Give no health advice. The page shows its own follow-up line at 130/80 or higher.
6. **Morning vs evening:** the difference shows on the Health tab's blood pressure line ("morning x/y, evening x/y"). The coach reports it as a fact and never interprets it.

Code: `coach/tools/pillars.py` (`bp_readings`, `bp_window`). Feed row: `coach/ops/data_paths.json` id `home_bp`.
