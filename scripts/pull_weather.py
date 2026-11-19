"""Day forecast for the dashboard's day strip (the athlete, Nov 18, 2026: "give the weather for the day on the far right").

Optional and off by default: it runs only when coach/athlete/profile.json carries a `weather` block
{"town": "<name>", "lat": <number>, "lon": <number>} (a town, never an address; rounded to two decimals here).
One request to Open-Meteo (free, no key, no account): the town's coordinates go out and nothing else, never a
name or any health data. Writes data/weather.json with today and the next two days. Run by pull-garmin.yml after
the Garmin pull, so the file rides the same commit. It never fails the pull: any error leaves the last file in
place and exits 0. The page shows a day only when the file has that day (coach/dashboard/ready.js, alpha day_weather).
"""
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "weather.json")
URL = "https://api.open-meteo.com/v1/forecast"
DAILY = ("weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max", "wind_speed_10m_max")
# WMO weather codes in plain words (Open-Meteo docs, "WMO Weather interpretation codes")
WORDS = ((0, 0, "Clear"), (1, 1, "Mostly clear"), (2, 2, "Partly cloudy"), (3, 3, "Cloudy"), (45, 48, "Fog"),
         (51, 57, "Drizzle"), (61, 67, "Rain"), (71, 77, "Snow"), (80, 82, "Showers"), (85, 86, "Snow showers"),
         (95, 99, "Thunderstorms"))


def word(code):
    for lo, hi, w in WORDS:
        if code is not None and lo <= code <= hi:
            return w
    return ""


def place(root=ROOT):
    try:
        with open(os.path.join(root, "coach", "athlete", "profile.json"), encoding="utf-8") as fh:
            w = json.load(fh).get("weather") or {}
        return {"town": str(w["town"]), "lat": round(float(w["lat"]), 2), "lon": round(float(w["lon"]), 2), "tz": json_tz(root)}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def json_tz(root):
    with open(os.path.join(root, "coach", "athlete", "profile.json"), encoding="utf-8") as fh:
        return json.load(fh).get("timezone") or "auto"


def request_url(p):
    q = {"latitude": p["lat"], "longitude": p["lon"], "daily": ",".join(DAILY), "temperature_unit": "fahrenheit",
         "wind_speed_unit": "mph", "timezone": p["tz"], "forecast_days": 3}
    return URL + "?" + urllib.parse.urlencode(q)


def shape(p, body, now=None):
    """The file's content from the service's answer; days with no date or no temperatures are left out."""
    d = (body or {}).get("daily") or {}
    days = []
    for i, day in enumerate(d.get("time") or []):
        def at(k):
            v = d.get(k) or []
            return v[i] if i < len(v) else None
        hi, lo, code = at("temperature_2m_max"), at("temperature_2m_min"), at("weather_code")
        if hi is None or lo is None:
            continue
        rain, wind = at("precipitation_probability_max"), at("wind_speed_10m_max")
        days.append({"date": day, "text": word(code), "code": code, "high_f": round(hi), "low_f": round(lo),
                     "rain_pct": None if rain is None else round(rain), "wind_mph": None if wind is None else round(wind)})
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return {"town": p["town"], "source": "Open-Meteo", "fetched_at_utc": now.strftime("%Y-%m-%dT%H:%MZ"), "days": days}


def main():
    p = place()
    if not p:
        print("weather: no town in the profile, skipped")
        return 0
    try:
        with urllib.request.urlopen(urllib.request.Request(request_url(p), headers={"User-Agent": "coach-day-strip"}), timeout=20) as r:
            out = shape(p, json.load(r))
    except Exception as e:  # never fail the pull for a forecast
        print("weather: not fetched (%s), the last file stays" % type(e).__name__)
        return 0
    if not out["days"]:
        print("weather: the answer had no days, the last file stays")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print("weather: %d days for %s" % (len(out["days"]), p["town"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
