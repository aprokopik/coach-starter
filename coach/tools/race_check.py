"""What each race in coach/races.json is missing against coach/race_template.json (the athlete, Nov 2, 2026).

Every race fills the same structure by stage: race info and typical weather from the day it is added, link/limit/cutoffs/location
once committed (start_time and start_basis too, Nov 7, 2026), finish estimate, plan sections and kit from 21 days out, the NWS forecast in race week, result and stats when done.
The morning facts carry the gaps per upcoming race (races.upcoming[].missing) so the coach fills them in the same run.

Registration watch (Nov 5, 2026): every race not yet registered or done carries reg_dates ('YYYY-MM-DD|what|basis;...',
basis posted or expected from the previous edition; a registered race may carry its deadlines, such as deferral).
registration_due() lists the dates within 14 days, plus a planned race whose registration is open and not done;
says_today() decides which the check-in carries: 14 and 7 days out, the day before and the day itself, and for a planned
race also every Sunday in the window and every morning of the last 3 days. The morning facts turn them into flags.

CLI: python3 coach/tools/race_check.py [YYYY-MM-DD]   prints the gaps for every race and the registration dates due.
"""
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load(path, default):
    try:
        with open(os.path.join(ROOT, path)) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def template():
    return _load("coach/race_template.json", {"stages": [], "plan_sections": [], "kit_templates": {}})


def _filled(v):
    return v is not None and str(v).strip() != ""


def missing(race, rows, today, tpl=None):
    """List of short gap strings for one race row, given all races.json rows and today's date."""
    tpl = tpl or template()
    st = {s["key"]: s for s in tpl.get("stages", [])}
    status = race.get("status")
    out = []

    def need(stage):
        for f in st.get(stage, {}).get("fields", []):
            if not _filled(race.get(f)):
                out.append(f)

    if status == "done":
        need("done")
        return out
    try:
        days = (date.fromisoformat(str(race.get("date"))[:10]) - today).days
    except ValueError:
        return ["date"]
    if days < 0:
        return ["status (race date passed, set done with result and stats)"]
    need("any")
    if status in ("registered", "planned"):
        need("committed")
    if status in WATCH_STATUSES:
        need("watch")
    prep = st.get("prep", {})
    if status == "registered" and days <= 21:
        need("prep")
        if prep.get("start_posted") and _filled(race.get("start_time")) and str(race.get("start_basis") or "").lower() != "posted":
            out.append("start_time posted (still expected from the previous edition; check the athlete guide)")
        have = {r.get("section") for r in rows if r.get("kind") == "race_note" and r.get("race_id") == race.get("race_id") and _filled(r.get("text"))}
        for s in prep.get("notes", []):
            if s not in have:
                out.append(f"plan: {s}")
        kit = [r for r in rows if r.get("kind") == "race_kit" and r.get("race_id") == race.get("race_id")]
        if len(kit) < prep.get("kit_min", 0):
            out.append(f"kit ({len(kit)} of {prep.get('kit_min')} items; start from kit_templates['{race.get('sport')}'])")
    rw = st.get("race_week", {})
    if days <= 7:
        need("race_week")
        if race.get("wx_kind") != rw.get("wx_kind", "forecast"):
            out.append("wx_kind forecast (NWS, RUNBOOK step 6)")
        elif _filled(race.get("wx_at")):
            try:
                age = (today - date.fromisoformat(str(race["wx_at"])[:10])).days
                if age > rw.get("wx_max_age_days", 1):
                    out.append(f"forecast refresh (wx_at {race['wx_at']} is {age} days old)")
            except ValueError:
                out.append("wx_at")
    return out


# ---------- registration watch (Nov 5, 2026) ----------

WATCH_STATUSES = ("planned", "considering", "exploring")  # every race not yet registered or done: reg_dates required
LEAD_DAYS = 14   # project goal: every registration date reaches the athlete at least 14 days out
MID_DAYS = 7     # a second mention halfway
DAILY_DAYS = 3   # a planned race: every morning in the last days before a date
STALE_DAYS = 8   # a weekly watch older than this has missed a run
OPEN_RE = re.compile(r"\bopen", re.I)                          # an entry naming an opening ("General opens")
CLOSE_RE = re.compile(r"\bclos|\bsold out|\bsells out", re.I)  # a closing or sellout (never an entry that names an opening)


def parse_reg_dates(text):
    """'YYYY-MM-DD|what|basis;...' -> [{date, what, basis}] ('none' or blank -> []); an unreadable part -> {error}."""
    out = []
    if str(text or "").strip().lower() in ("", "none"):
        return out
    for part in str(text).split(";"):
        part = part.strip()
        if not part:
            continue
        bits = [b.strip() for b in part.split("|")]
        try:
            d = date.fromisoformat(bits[0])
        except ValueError:
            out.append({"error": f"unreadable reg_dates entry {part!r}"})
            continue
        basis = (bits[2] if len(bits) > 2 else "").lower()
        out.append({"date": d, "what": (bits[1] if len(bits) > 1 and bits[1] else "registration date"),
                    "basis": "expected" if basis == "expected" else "posted"})
    return out


def registration_due(rows, today, lead=LEAD_DAYS):
    """The registration dates the coach should know about today, soonest first:
    every reg_dates entry within `lead` days (today included) of a race that is not done (a registered race only through
    the deadlines it carries, such as deferral or transfer), and, for a planned race with nothing in that window,
    the latest opening that has passed with no closing after it (open and not done yet)."""
    out = []
    for r in rows:
        status = r.get("status")
        if r.get("kind") != "race" or status == "done" or not (status in WATCH_STATUSES or _filled(r.get("reg_dates"))):
            continue
        try:
            if date.fromisoformat(str(r.get("date"))[:10]) < today:
                continue  # race day has passed: missing() asks for status done instead
        except ValueError:
            pass
        checked = r.get("reg_checked")
        try:
            age = (today - date.fromisoformat(str(checked)[:10])).days if checked else None
        except ValueError:
            age = None
        base = {"race_id": r.get("race_id"), "name": r.get("name"), "status": status, "checked": checked,
                "stale": age is None or age > STALE_DAYS}
        entries = parse_reg_dates(r.get("reg_dates"))
        mine = []
        for e in entries:
            if "error" in e:
                out.append(dict(base, error=e["error"], days=-1))
                continue
            days = (e["date"] - today).days
            if 0 <= days <= lead:
                mine.append(dict(base, what=e["what"], date=e["date"].isoformat(), days=days, basis=e["basis"], open=False))
        if not mine and status == "planned":
            past = sorted((e for e in entries if "error" not in e and e["date"] < today), key=lambda e: e["date"])
            opens = [e for e in past if OPEN_RE.search(e["what"])]
            closes = [e for e in past if CLOSE_RE.search(e["what"]) and not OPEN_RE.search(e["what"])]
            if opens and not (closes and closes[-1]["date"] >= opens[-1]["date"]):
                o = opens[-1]
                mine.append(dict(base, what=o["what"], date=o["date"].isoformat(), days=(o["date"] - today).days,
                                 basis=o["basis"], open=True))
        out += mine
    out.sort(key=lambda x: (x["days"], x.get("race_id") or ""))
    return out


def says_today(item, today):
    """Whether the check-in carries this item today.
    Every date: the morning it comes within 14 days, at 7 days, the day before and the day itself.
    A planned race (committed, registration pending) also: every Sunday inside the window, every morning of the last
    3 days, and every Sunday while its registration is open and not done. An unreadable entry: every morning until fixed."""
    if item.get("error"):
        return True
    if item.get("open"):
        return today.weekday() == 6
    d = item["days"]
    if d in (LEAD_DAYS, MID_DAYS, 1, 0):
        return True
    return item.get("status") == "planned" and (d <= DAILY_DAYS or today.weekday() == 6)


def _day(iso_text):
    d = date.fromisoformat(str(iso_text)[:10])
    return f"{d.strftime('%a %b')} {d.day}"


def registration_line(item):
    """One plain line for the check-in (the coach may reword it, never drop the date)."""
    if item.get("error"):
        return (f"{item.get('name')}: {item['error']}; fix it in coach/races.json this run "
                "('YYYY-MM-DD|what|posted or expected'), no line to the athlete.")
    day = _day(item["date"])
    if item.get("open"):
        if item["basis"] == "expected":
            text = f"{item['name']}: registration still not done. Expected to open {day} from last year's pattern, not confirmed yet: {item['what']}."
        else:
            text = f"{item['name']}: registration still not done. Open since {day}: {item['what']}."
    else:
        when = "today" if item["days"] == 0 else "tomorrow" if item["days"] == 1 else f"in {item['days']} days"
        text = f"{item['name']}: {item['what']}, {when} ({day})."
        if item["basis"] == "expected":
            text += " Expected from last year's pattern, not posted yet."
        if item["status"] in ("considering", "exploring"):
            text += f" {item['status'].capitalize()}, so it only matters if you pick it."
    if item["stale"]:
        try:
            last = _day(item["checked"]).split(" ", 1)[1] if item.get("checked") else None
        except ValueError:
            last = str(item["checked"])
        text += f" Last checked {last}, so confirm on the official page." if last else " Never checked, so confirm on the official page."
    return text


def check_all(today, rows=None, tpl=None):
    rows = rows if rows is not None else _load("coach/races.json", {"rows": []}).get("rows", [])
    tpl = tpl or template()
    return {r["race_id"]: missing(r, rows, today, tpl) for r in rows if r.get("kind") == "race"}


def shared_page_status(rows=None):
    """'in sync' when coach/dashboard/season.html lists exactly what build_season.py would write from races.json."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import build_season
        rows = rows if rows is not None else _load("coach/races.json", {"rows": []}).get("rows", [])
        _, changed = build_season.render(open(build_season.PAGE).read(), rows)
        return "stale: run python3 coach/tools/build_season.py, commit, and republish the shared Race Season page" if changed else "in sync"
    except Exception as e:  # never block the check-in
        return f"check failed: {e}"


def main():
    today = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    for rid, gaps in check_all(today).items():
        print(f"{rid}: {'complete' if not gaps else '; '.join(gaps)}")
    rows = _load("coach/races.json", {"rows": []}).get("rows", [])
    for item in registration_due(rows, today):
        print(f"registration{' (said today)' if says_today(item, today) else ''}: {registration_line(item)}")
    print(f"shared Race Season page: {shared_page_status()}")


if __name__ == "__main__":
    main()
