"""Build coach/vo2max.csv from data/daily/*.json (Garmin max_metrics). Run from the repo root."""
import csv, glob, json, os
rows = []
for f in sorted(glob.glob('data/daily/*.json')):
    d = json.load(open(f))
    mm = (d.get('responses') or {}).get('max_metrics') or []
    run = bike = None
    for m in mm if isinstance(mm, list) else [mm]:
        g = (m or {}).get('generic') or {}
        c = (m or {}).get('cycling') or {}
        run = g.get('vo2MaxPreciseValue') or g.get('vo2MaxValue') or run
        bike = c.get('vo2MaxPreciseValue') or c.get('vo2MaxValue') or bike
    if run is None and bike is None:
        continue
    rows.append({'date': d['date'], 'vo2max_run': run if run is not None else '', 'vo2max_bike': bike if bike is not None else ''})
with open('coach/vo2max.csv', 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=['date', 'vo2max_run', 'vo2max_bike'])
    w.writeheader(); w.writerows(rows)
print(len(rows), 'rows')
