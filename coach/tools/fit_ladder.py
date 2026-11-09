"""the athlete's percentile ladder (vo2_norms.FIT_BANDS) on any population norm in coach/norms.json.

Rule (the athlete, Nov 8, 2026): every ranked Fitness tile uses the same population bands, Bottom 10% up to Top 0.5%, with more sub-levels
where gains slow, and the norms follow each athlete's sex and age band where the source publishes them.

A norm row holds breakpoints as [value, percent of the population better than that value] and `better` (1 higher is better,
-1 lower is better). Optional fields: `sex` ("male", "female"; missing = both sexes mixed), `age_band` ("30-39"; missing = all
ages), `short` (the population in a few words for the tile), `tail` ("log" for times and paces, else normal).

Inside the published breakpoints the ladder interpolates linearly. Outside them (for example the top 1% and 0.5%, which few
sources publish) it fits a normal curve, or a log-normal for times, through the median and the nearest published point, and the
band is marked Estimated.
"""
import math
from statistics import NormalDist

import vo2_norms

_N = NormalDist()


def points(norm):
    """[(percentile from the bottom, value)] sorted by percentile."""
    return sorted(((100 - float(p), float(v)) for v, p in norm["breakpoints"]), key=lambda x: x[0])


def value_at(norm, p):
    """(value at percentile p from the bottom, estimated?)."""
    pts = points(norm)
    q = dict(pts)
    ps = [x for x, _ in pts]
    if p in q:
        return q[p], False
    if ps[0] < p < ps[-1]:
        lo = max(x for x in ps if x <= p)
        hi = min(x for x in ps if x >= p)
        return q[lo] + (q[hi] - q[lo]) * (p - lo) / (hi - lo), False
    log = norm.get("tail") == "log" and all(v > 0 for _, v in pts)
    f = math.log if log else (lambda v: v)
    g = math.exp if log else (lambda v: v)
    ext = pts[-1] if p >= ps[-1] else pts[0]
    mid = min((x for x in pts if x != ext), key=lambda x: abs(x[0] - 50))
    z1, z2 = _N.inv_cdf(mid[0] / 100), _N.inv_cdf(ext[0] / 100)
    sd = (f(ext[1]) - f(mid[1])) / (z2 - z1)
    mu = f(mid[1]) - z1 * sd
    return g(mu + _N.inv_cdf(p / 100) * sd), True


def percentile(norm, v):
    """Percentile from the bottom (0 to 100) of value v, the inverse of value_at."""
    better = norm.get("better", 1)
    lo, hi = 0.01, 99.99
    for _ in range(50):
        m = (lo + hi) / 2
        x, _e = value_at(norm, m)
        ahead = x < v if better == 1 else x > v  # v beats the value at m
        lo, hi = (m, hi) if ahead else (lo, m)
    return (lo + hi) / 2


def _pct(p):
    return {100 / 3: "33rd", 200 / 3: "67th", 99.5: "99.5th"}.get(p) or f"{round(p)}th"


def tiers(norm, nd=2, fmt=str, conv=lambda v: v, floor=None):
    """the athlete's bands as (label, lo, hi, note), ascending by value as the page reads them.
    conv turns a norm value into the tile's unit, nd rounds it, fmt prints it; floor closes the worst band (a cutoff, say)."""
    better = norm.get("better", 1)
    short = norm.get("short") or norm.get("population", "")
    out = []
    for name, a, b in vo2_norms.FIT_BANDS:
        va = None if a is None else value_at(norm, a)
        vb = None if b is None else value_at(norm, b)
        est = any(x is not None and x[1] for x in (va, vb))
        A = None if va is None else round(conv(va[0]), nd)
        B = None if vb is None else round(conv(vb[0]), nd)
        lo, hi = (A, B) if better == 1 else (B, A)
        if a is None and floor is not None:  # the worst band ends at the floor, so it is a closed band
            lo, hi = (floor, hi) if better == 1 else (lo, floor)
        span = (f"under the {_pct(b)} percentile" if a is None else f"past the {_pct(a)} percentile" if b is None else f"{_pct(a)} to {_pct(b)} percentile")
        rng = (f"under {fmt(hi)}" if lo is None else f"{fmt(lo)} and up" if hi is None else f"{fmt(lo)} to {fmt(hi)}")
        out.append((name, lo, hi, f"{rng}: {span} of {short}" + (", Estimated tail" if est else "")))
    out.sort(key=lambda t: -math.inf if t[1] is None else t[1])
    return out


def splits(norm, tier_rows, resolution=None):
    """Sub-levels per band in the tiers' order (ascending by value): FIT_SPLITS run from the bottom band up, so a lower-is-better
    metric reads them reversed. Never finer than the data's resolution."""
    per = list(vo2_norms.FIT_SPLITS)
    if norm.get("better", 1) == -1:
        per = per[::-1]
    out = []
    for (l, lo, hi, _n), n in zip(tier_rows, per):
        if lo is None or hi is None:
            out.append(1)
        elif resolution:
            out.append(max(1, min(n, int(round(abs(hi - lo) / resolution, 6)))))
        else:
            out.append(n)
    return out


def pick(rows, key, group):
    """The norm row for this athlete: same sex and age band, then same sex all ages, then the nearest published age band for
    that sex, then a row with both sexes mixed. None if the source has nothing for this athlete."""
    rs = [r for r in rows if r.get("key") == key]
    if not rs:
        return None
    if group:
        sx, band = group["sex"], group["band"]
        same = [r for r in rs if r.get("sex") == sx]
        hit = next((r for r in same if r.get("age_band") == band), None) or next((r for r in same if not r.get("age_band")), None)
        if hit is None and same:
            lo = int(band.split("-")[0])
            hit = min((r for r in same if r.get("age_band")), key=lambda r: abs(int(r["age_band"].split("-")[0]) - lo), default=None)
            if hit is not None:
                hit = dict(hit, short=(hit.get("short") or hit.get("population", "")) + " (nearest published age band)")
        if hit is not None:
            return hit
    return next((r for r in rs if not r.get("sex")), None)


def rank(norm, v, tier_rows):
    """'Top third (75th percentile, men 30–39, US 5K races)'."""
    p = percentile(norm, v)
    band = next((l for l, lo, hi, _ in tier_rows if (lo is None or v >= lo) and (hi is None or v < hi)), "")
    n = int(round(p))
    suf = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{band} ({n}{suf} percentile, {norm.get('short') or norm.get('population', '')})", p
