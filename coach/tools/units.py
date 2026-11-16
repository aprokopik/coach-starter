"""Units: the one home for which units a person sees (roadmap, "A coach for any person", Nov 16, 2026).

The setting lives in coach/athlete/profile.json `units` ("imperial" or "metric"; missing means imperial,
the original athlete's). Every tool keeps computing in its own units as it always has; this module turns
what a person READS into their units, at two edges only:

- rows(): every coach.json row, numbers and words, just before build_dashboard.py writes the file;
- text(): any sentence a tool prints for the coach (morning_facts.py flags).

The page converts only what it computes itself from the raw Garmin files (calc.js `U`), so nothing is
converted twice. Imperial changes nothing: rows() and text() return their input as is.

    python3 coach/tools/units.py            print the setting
"""
import json
import re
from pathlib import Path

MI_KM = 1.609344
YD_M = 0.9144
FT_M = 0.3048
LB_KG = 0.45359237


def setting(root="."):
    try:
        u = json.loads((Path(root) / "coach/athlete/profile.json").read_text()).get("units")
    except (OSError, ValueError):
        u = None
    return "metric" if str(u or "").lower().startswith("metric") else "imperial"


# unit label -> (metric label, factor applied to a number in that unit). Paces divide by the distance factor.
UNIT = {
    "/mi": ("/km", 1 / MI_KM), "min/mi": ("min/km", 1 / MI_KM), "min:s per mile": ("min:s per km", 1 / MI_KM),
    "mi": ("km", MI_KM), "miles": ("km", MI_KM), "mi/week": ("km/week", MI_KM),
    "/100 yd": ("/100 m", 1 / YD_M), "s/100 yd": ("s/100 m", 1 / YD_M), "yd": ("m", YD_M),
    "ft": ("m", FT_M), "ft/h": ("m/h", FT_M), "ft/mi": ("m/km", FT_M / MI_KM),
    "lb": ("kg", LB_KG), "mph": ("km/h", MI_KM),
}
NUM_FIELDS = ("value", "raw", "now", "then", "best", "lo", "mid", "hi", "avg7", "target_lo", "target_hi", "miles", "y", "v")


def _num(x, f):
    """A number, or a figure written as text ("1,959", "9:45", "+10"), in the new unit; anything else as is."""
    if isinstance(x, bool):
        return x
    if isinstance(x, (int, float)):
        return round(x * f, 3)
    if isinstance(x, str):
        t = x.strip()
        if re.fullmatch(r"\d{1,2}:\d{2}", t):
            return _mss(_clock(t) * f)
        m = re.fullmatch(r"([+−-]?)(\d[\d,]*)(\.\d+)?", t)
        if m:
            v = float((m.group(2) + (m.group(3) or "")).replace(",", "")) * f
            nd = len(m.group(3) or ".")-1
            return m.group(1) + (f"{v:,.{nd}f}" if "," in t or v >= 1000 else f"{v:.{nd}f}")
    return x


def _mss(m):
    s = int(round(m * 60))
    return f"{s // 60}:{s % 60:02d}"


def _clock(t):
    p = t.split(":")
    return int(p[0]) + int(p[1]) / 60


# Words: paces first (they hold a colon), then distances and other amounts. Each pattern keeps what it does not convert.
PACE = re.compile(r"(\d{1,2}:\d{2})(\s?(?:–|-|to)\s?)?(\d{1,2}:\d{2})?(\s?)(/mi|/ mi| per mile|/100 yd| per 100 yd|min/mi)\b")
AMOUNT = re.compile(r"(?<![\w:/])(\d[\d,]*(?:\.\d+)?)(\s?(?:–|-|to)\s?|\sof\s)?(\d[\d,]*(?:\.\d+)?)?\s?(mi|miles|mile|yd|ft|lb|mph|ft/h)\b(?!/)")
WORD = {"mi": ("km", MI_KM), "miles": ("km", MI_KM), "mile": ("km", MI_KM), "yd": ("m", YD_M), "ft": ("m", FT_M), "ft/h": ("m/h", FT_M),
        "lb": ("kg", LB_KG), "mph": ("km/h", MI_KM)}


def text(s, units=None):
    if not isinstance(s, str) or (units or "imperial") != "metric":
        return s

    def pace(m):
        a, sep, b, sp, u = m.groups()
        swim = "yd" in u
        f = (1 / YD_M) if swim else (1 / MI_KM)
        lab = {"/mi": "/km", "/ mi": "/km", " per mile": " per km", "/100 yd": "/100 m", " per 100 yd": " per 100 m", "min/mi": "min/km"}[u]
        out = _mss(_clock(a) * f)
        if sep and b:
            out += sep + _mss(_clock(b) * f)
        return out + sp + lab

    def amount(m):
        a, sep, b, u = m.groups()
        lab, f = WORD[u]
        def c(x):
            v = float(x.replace(",", "")) * f
            nd = 0 if v >= 100 or "." not in x and v >= 10 else 1
            return f"{v:,.{nd}f}"
        return c(a) + ((sep + c(b)) if sep and b else "") + " " + lab

    return AMOUNT.sub(amount, PACE.sub(pace, s))


def tiers(t, f, units):
    """A marker's tiers string, "label|lo|hi|words|basis;..." in the marker's unit: numbers and words converted."""
    out = []
    for part in t.split(";"):
        bits = part.split("|")
        if len(bits) >= 3:
            for i in (1, 2):
                try:
                    bits[i] = f"{round(float(bits[i]) * f, 3):g}" if bits[i] != "" else ""
                except ValueError:
                    pass
        out.append("|".join(text(b, units) for b in bits))
    return ";".join(out)


def row(r, units, unit=None):
    """One row (or a nested dict such as a marker's scale) in the person's units. `unit` is the parent's, for
    rows that carry none of their own (a marker's points and scales)."""
    if units != "metric" or not isinstance(r, dict):
        return r
    u = r.get("unit", unit)
    conv = UNIT.get(u)
    if str(r.get("key") or "").startswith("lift"):
        conv = None  # lift loads stay in pounds in the data (one home); the Lifts tab shows and takes kilograms itself (lifts.js toU/fromU)
    out = {}
    for k, v in r.items():
        if isinstance(v, str) and v[:1] in "[{" and v[-1:] in "]}":
            try:  # nested fields travel as JSON text (the runtime's rule); convert inside, write back as text
                j = json.loads(v)
            except ValueError:
                j = None
            if isinstance(j, (list, dict)):
                c = row({"unit": u, "_": j}, units)["_"] if k != "breakpoints" else j
                if k == "breakpoints" and conv and isinstance(j, list):
                    c = [[_num(q[0], conv[1]), *q[1:]] if isinstance(q, list) and q else q for q in j]
                out[k] = json.dumps(c, ensure_ascii=False, separators=(", ", ": "))
                continue
        if k == "tiers" and isinstance(v, str) and conv:
            out[k] = tiers(v, conv[1], units)
        elif isinstance(v, str):
            out[k] = text(v, units)
        elif isinstance(v, list):
            out[k] = [row(x, units, u) if isinstance(x, dict) else x for x in v]
        elif isinstance(v, dict):
            out[k] = row(v, units, u)
        else:
            out[k] = v
    if conv:
        lab, f = conv
        if "unit" in r:
            out["unit"] = lab
        for k in NUM_FIELDS:
            if k in out:
                out[k] = _num(out[k], f)
        if isinstance(r.get("breakpoints"), list):
            out["breakpoints"] = [[_num(p[0], f), *p[1:]] if isinstance(p, list) and p else p for p in r["breakpoints"]]
    if r.get("endUnit") in UNIT:
        out["endUnit"] = UNIT[r["endUnit"]][0]
    return out


def rows(rs, root="."):
    u = setting(root)
    if u != "metric":
        return rs
    unit_of = {r.get("key"): r.get("unit") for r in rs if r.get("kind") == "marker" and r.get("unit")}
    def unit(r):
        if r.get("kind") == "mpt":  # a marker's points carry no unit: they are in their marker's
            return unit_of.get(r.get("key"))
        if r.get("kind") == "weight" or (r.get("kind") == "target" and r.get("key") == "weight"):
            return "lb"  # weight plan rows: lo, mid, hi in pounds
        return None
    out = [row(r, u, unit(r)) for r in rs]
    return out + [{"kind": "units", "system": "metric"}]


if __name__ == "__main__":
    print(setting())
