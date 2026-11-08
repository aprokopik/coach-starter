# Notes for Claude in this repository

This repository is one athlete's Coach, made from the Coach starter kit (alpha). Start with `README.md`; the coach's own rules are in `coach/engine/RULES.md`.

## Kit feedback

The kit's makers improve it from testers' setup logs. Help close that loop:

- When the athlete hits a problem with the **setup or the coach itself** (a workflow fails, a tool errors, a guide is wrong or unclear, the dashboard or a scheduled task misbehaves), add one dated line to `setup/SETUP-LOG.md` under "After setup": what happened, what fixed it, minutes lost. Training, health and nutrition questions are not kit feedback.
- When the athlete says "send kit feedback" (or anything like it), update the Summary and Feedback sections with them, show them the log, let them cut anything, then run `python3 setup/feedback.py` and give them its link and its text block (step 9 of `ONBOARDING-PROMPT.md`, Stage 2). Commit `setup/SETUP-LOG.md`.
- The log never holds health data, passwords, tokens, email addresses or account names. `setup/feedback.py` refuses to send a log that seems to.
- Never edit `setup/kit.json`; it says where feedback goes.

## Updates

`VERSION` says which kit this coach is on. When the athlete asks to update, follow `UPDATE-PROMPT.md` (from the kit's home repository if this copy is older): `setup/update.py` swaps in the kit's own files and never touches the athlete's. After any setup change, use `python3 setup/personalize.py setup/answers.json --refresh`; a run without `--refresh` rewrites CURRENT-STATE, LOG and the profile from the onboarding answers.
