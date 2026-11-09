# Charts on the Cockpit dashboard

This is the chart grammar from Phase 4 (Nov 4, 2026). Every chart on the dashboard is drawn by one library, `charts.js`, which puts `window.CKC` on the page. This file covers which chart to use, what every chart carries, how to add one, and which numbers still live in script rather than in data.

The library source is `src/charts.src.js`. The page ships the minified build, `charts.js` (47,227 bytes since the weekly date axis, 6.1.2; 45,895 after the round 3 Close up sub-levels; 45,875 after the round 2 block-line key; 48,209 while the three label options were built in; 45,256 after the Phase 6 review fixes; 42,643 after the part key and the phone level-chart layout, 39,980 before them). The styles are in `charts.css`: the chart frame, range bar and chart motion, scoped to `.ck`. The tokens they read come from `cockpit.css` (the Cockpit system, Phase 5), which the page loads first; charts.css uses `--ck-*` tokens only.

## 1. Which chart to use

| You want to show | Use | Example on the dashboard |
|---|---|---|
| A headline trend, read against your own usual range | **Line with personal band** (`CKC.line`, with `bands` marked `personal`) | HRV, resting HR, sleep (Health pillars) |
| A trend with no personal band (tiers, a plan or a target instead) | **Line** (`CKC.line`, with `tbands`, `blocks`, `boxes` or `thresholds`) | Run pace at 150 bpm, weight against plan |
| The same trend, small, beside a title | **Sparkline** (`CKC.spark`, the line at a small size: no axes, no tooltip) | Pillar header sparks |
| An amount per week or per day | **Bar** (`CKC.bar`), with the **so far** marker on the open period | Training hours by week, volume, consistency, pain |
| Parts of a week's amount (the parts are not a share of anything) | **Stacked bar** (`CKC.bar` with `stack`), parts labelled directly | Hours by sport |
| How a whole splits into parts | **Share bar on a fixed 0 to 100 axis** (`CKC.share`), ordered ramp | No chart uses it since Nov 8, 2026 (5.2.0) |
| Shares of a few ordered parts, with the period before | **Zone columns** (app.js `renderZones`, HTML, not charts.js): one column per part scaled to the biggest share, ramp colour, share on top, dashed mark for the period before, a tap shows the amount | Heart-rate zone time |
| A range per period (typical value plus spread) | **Dot and whisker** (`CKC.whisker`) | Self-test: sleep by week |
| One reading today against your usual range | **Range bar** (`CKC.rangeBar`, the Phase 3 component) | Last night vs your normal tiles (behind All N vitals since Phase 6) |
| Last night in one number against your normal | **Gauge**, the one held exception (app.js `renderGauge`, drawn in the page, not in charts.js; see section 10) | Last night gauge on Today |
| A progress fill or a grid of days | **Meter** (`CKC.meter` or `CKC.describe` on the existing CSS) | Streak grid, progress, week tiles, level bars |
| A one-off drawing (timeline, year strip) | **Custom** (`CKC.custom`: you draw, the frame does the rest) | Season timeline, year at a glance |

Rules of thumb:

- Small multiples share one y scale only when their units match. Sleep in hours and HRV in ms each get their own scale.
- A stacked bar is only a share chart when its parts sum to a whole. Hours by sport is a stacked amount, so it keeps an hours axis.
- Use the share bar only on the fixed 0 to 100 axis. Never scale it to the largest part.

**Banned:** pies and donuts, gauges (one held exception: the Today last night gauge, the athlete's choice of Nov 5, 2026, which reads one signed figure on a fixed -2 to +2 SD scale, labelled low, normal and high, with 1 px dashed marks at -1 and +1 SD for the usual range (round 2), with the number and its word printed beside it), dual y axes, legends (use direct labels; the one exception is the part key of a stacked bar, section 2), 3D, and gridlines heavier than the hairline token (`--ck-chart-grid`).

## 2. Anatomy

<svg viewBox="0 0 640 300" width="100%" role="img" aria-label="Labelled drawing of a line chart: axis unit, tick labels in a measured gutter, the personal band with its label, a threshold line with a direct label, the series line, the end label with the latest value, the so-far marker on a bar, the caption sentence below, and the tooltip." xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12">
  <rect x="0" y="0" width="640" height="300" fill="#ffffff"/>
  <rect x="10" y="10" width="420" height="230" fill="none" stroke="#c9c9c4" rx="8"/>
  <text x="22" y="30" fill="#55554f" font-size="11">ms</text>
  <g fill="#55554f" font-size="11" text-anchor="end"><text x="44" y="64">50</text><text x="44" y="114">40</text><text x="44" y="164">30</text></g>
  <g stroke="#ecece8"><line x1="50" y1="60" x2="370" y2="60"/><line x1="50" y1="110" x2="370" y2="110"/><line x1="50" y1="160" x2="370" y2="160"/></g>
  <path d="M50 80 C120 70 200 76 370 72 L370 126 C200 128 120 132 50 130 Z" fill="#e6e8ef" stroke="#8a8a85" stroke-dasharray="3 3"/>
  <text x="56" y="76" fill="#6b6b66" font-size="11">your usual range</text>
  <line x1="50" y1="94" x2="370" y2="94" stroke="#55554f" stroke-dasharray="5 4"/>
  <text x="300" y="90" fill="#55554f" font-size="11">Target 46</text>
  <path d="M50 118 C100 112 140 104 190 108 S280 96 370 100" fill="none" stroke="#1f3a8a" stroke-width="2"/>
  <circle cx="370" cy="100" r="3.5" fill="#1f3a8a"/>
  <text x="378" y="104" fill="#1f1f1c" font-weight="700" font-size="12">42 ms</text>
  <g fill="#55554f" font-size="11" text-anchor="middle"><text x="110" y="182">Sep</text><text x="230" y="182">Oct</text><text x="350" y="182">Nov</text></g>
  <text x="22" y="206" fill="#1f1f1c" font-size="12">HRV, the last 3 months: 42 ms on Nov 3, up 13 since</text>
  <text x="22" y="222" fill="#1f1f1c" font-size="12">Aug 6, inside your usual 38 to 49 ms.</text>
  <rect x="250" y="120" width="112" height="40" fill="#ffffff" stroke="#c9c9c4" rx="4"/>
  <text x="258" y="136" fill="#1f1f1c" font-size="11">Tue Nov 3</text><text x="258" y="151" fill="#1f1f1c" font-size="11">Night: 42 ms</text>
  <g fill="#1f1f1c" font-size="11">
    <text x="450" y="34">1 Axis unit, in the axis label</text>
    <text x="450" y="60">2 Tick labels, measured gutter</text>
    <text x="450" y="80">3 Personal band, labelled once</text>
    <text x="450" y="98">4 Threshold, from a data row,</text><text x="462" y="112">with a direct label</text>
    <text x="450" y="130">5 Tooltip (tap or keyboard)</text>
    <text x="450" y="150">6 End label: latest value</text>
    <text x="450" y="182">7 Hairline grid, time axis</text>
    <text x="450" y="214">8 Caption sentence (the same</text><text x="462" y="228">string is the aria-label)</text>
  </g>
  <g stroke="#9a9a95"><line x1="40" y1="30" x2="446" y2="30"/><line x1="46" y1="62" x2="446" y2="56"/><line x1="160" y1="78" x2="446" y2="76"/><line x1="360" y1="94" x2="446" y2="94"/><line x1="362" y1="130" x2="446" y2="126"/><line x1="420" y1="104" x2="446" y2="146"/><line x1="370" y1="176" x2="446" y2="178"/><line x1="330" y1="214" x2="446" y2="210"/></g>
  <g transform="translate(20,250)">
    <rect x="0" y="0" width="22" height="36" fill="#1f3a8a"/><rect x="28" y="6" width="22" height="30" fill="#1f3a8a"/>
    <defs><pattern id="sofar" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#1f3a8a" stroke-width="2"/></pattern></defs>
    <rect x="56" y="26" width="22" height="10" fill="url(#sofar)" stroke="#1f3a8a"/>
    <text x="86" y="22" fill="#55554f" font-size="11">so far, 3 of 7 days</text>
    <text x="210" y="22" fill="#1f1f1c" font-size="11">9 The open week: hatched and labelled with the day count</text>
  </g>
</svg>

What every chart carries, and where it comes from:

1. **Axis unit** in the axis label (top left, 11 px), never only in the tooltip.
2. **Tick labels** in a left gutter that is sized from the measured width of the longest label, so no text clips. Duplicate labels are dropped.
3. **Personal band** ("your usual range"): your own mean plus or minus 1 SD, as `lo` and `hi` in the spec or the rows (the library never computes a band itself). It is labelled once, on the band.
4. **Thresholds and baselines** arrive as `{value, label, marks}`: from a data row, or from a script-held value that is listed in section 10. Each one gets a direct label.
   - **Labels never sit on data.** On a line chart a label tries its own place, then the other side of its line, then the other end, then the top margin (band labels); the first place that touches no dot, no line, no end label and no other label wins. On a bar chart, band, threshold, average and part labels all sit in the right margin, level with their line, so none prints over a bar.
   - **Every part of a stacked bar is named** (Phase 6, the athlete, Nov 5, 2026). A part gets a direct label in the right margin when its segment at the labelled bar (the newest full period, or the selected one) is at least 12 px tall, the height of a label. Every other part that has any value on the chart (a sliver at that bar, or a sport only in older weeks) goes into a one-line key under the chart: a swatch in the part's own token (hike keeps its outline) and the part's name, in `.ck-chart-key`, between the drawing and the caption. So every colour on the chart has a name; the yellow on Volume is Strength. The library decides (`CKC.bar` with `stack`, unless `directLabels: false`), so Fitness Volume and the Week load chart follow the same rule, and any new stacked bar does too.
   - **Every week on a weekly bar chart is dated** (the athlete, Nov 9, 2026, after the Load by week card showed 3 dates for 12 weeks on their phone). `CKC.bar` reads rows 7 days apart as a weekly date axis: the full date ("Sep 7") under every bar when it fits; otherwise the day of the month under every bar and the month name under the first week of each month on a second row (the chart grows 14 px); on the narrowest phones the day under every other bar, the newest always; when even that would touch, the month name at each month's first bar, thinned to every 2nd, 3rd, 6th or 12th month, with the year past 40 weeks. This replaces the old "every nth label" rule for these charts (Load by week in both views, Fitness Volume, Health pillar bars). `xTiers: false` keeps the old rule; rows with their own `label` or other spacing keep it too.
   - **One key for the Load by week card** (the athlete picked B on the renders, Nov 9, 2026): `partKey: 'all'` sends every part to the key under the chart and none to the right margin, so all five sports are named in one place; the budget band and Planned keep their margin labels. Fitness Volume keeps the direct-label rule above.
   - **Labels carry the meaning a legend used to.** Series get a direct tag where they need one (`tag`: "best 90-day effort" on the 5K line, "each run" on its dots), tier bands name their basis ("Top half (research)", "Good 3 (research)", "Better 4 (coach)"), the weight strips say "deficit" and "recovery deficit", and every season block names its phase (written upward when the bar is narrow), with "now" under the current one.
5. **Tooltip**: tap or keyboard, one open at a time.
6. **End label**: the latest value of the headline series, in bold, in the right gutter. Other end labels are pushed apart so they never overlap.
7. **Grid** on the hairline token only, with a time axis that shows days up to about 2.5 months and months after that (with the year when the span is long).
8. **Caption sentence**, generated from the data. The same string goes to the svg `aria-label`.
9. **So far marker** on the open period: hatched, with the label "so far, N of 7 days".

Colours are Phase 3 token names (for example `series-1`, `run`, `chart-band`, `chart-threshold`), resolved with `getComputedStyle` at draw time and set inline, so page CSS cannot change them. `charts.js` holds no literal colour and no threshold.

## 3. The sentence pattern

Every sentence opens with the title and the window, then gives the latest value, the change over the window, and how it compares with your range. Detail for each point is in the tooltip.

**The change, one rule for every line chart** (Architect, Phase 4 review):

1. If the chart has a **smoothed series** (marked `smooth: true`, or with "average" in its label), the change is measured on that series and says so: "52 bpm on Nov 3, 28-night average down 2 since Aug 6". The latest single value stays first. When the headline itself is the smoothed series and the title already says so ("Weight, 7-day average"), the words are just "down 3 since Sep 1".
2. With **no smoothed series**, the mean of the first 7 points is compared with the mean of the last 7, and the sentence says "7-night average" (or "7-week", "7-reading": the spec's `per`). This needs 14 points.
3. With fewer points, the first point is compared with the last.

Two single nights are never compared with each other, so the sentence cannot contradict the line.

| Type | Pattern | Real example (harness data, Nov 4, 2026) |
|---|---|---|
| Line with personal band | *Title, window: latest unit on date, smoothed-series name up/down change since date, inside/above/below your usual lo to hi unit.* | Resting heart rate, the last 3 months: 52 bpm on Nov 3, 28-night average down 2 since Aug 6, above your usual 47.5 to 51.7 bpm. |
| Line with no smoothed series | *... latest on date, 7-reading average up/down change since date.* | Cardio fitness (VO2max), the last 3 months: 44.9 on Nov 1, 7-reading average up 1.3 since Aug 11. |
| Line (own words for direction) | as above, with `words` replacing "up" and "down" | Run pace at 150 bpm, 28-day average, the last 3 months: 10:14 min/mi on Nov 1, faster 1:40 since Aug 15. |
| Line, one reading | *Title, window: value on date, the only reading.* | Swim pace, the last 3 months: 1:51/100 yd on Oct 6, the only reading. |
| Sparkline | same as the line; the window comes from the first and last dates | Cardio fitness (VO2max), the last 19 weeks: 44.9 on Nov 1, 7-week average up 1.5 since Jun 27. |
| Bar with so far | *Title, window: this week X so far (N of 7 days); last full week Y[; average Z].* | Training hours by week, the 12 weeks to Nov 2: this week 0.5 h so far (3 of 7 days); last full week 4.2 h. |
| Bar with so far (pillar bars) | as above | Activity minutes by week, the last 3 months: this week 52 min/week so far (3 of 7 days); last full week 323 min/week. |
| Bar, every week full | *Title, window: latest week X.* | Training hours, one week: latest week 5.7 h. |
| Share bar | *Title, window: most time in the biggest part at P%; the other parts. The period before: its parts.* | Heart-rate zone time, the last 3 months: most time in Zone 3 (Steady) at 30%; Z1 14%, Z2 24%, Z4 27%, Z5 5%. The 3 months before: Z1 10%, Z2 17%, Z3 33%, Z4 33%, Z5 8%. |
| Dot and whisker | *Title, window: typical X in the week of date (range lo to hi), change since the week of date, against your range.* | Sleep by week, the last 8 weeks: typical 8.1 h in the week of Oct 26 (range 7.2 to 9.3), up 0.4 since the week of Sep 7, inside your usual 6.5 to 9.1 h. |
| Gauge (Today, last night) | the visible lines: *figure SD, word, sentence; Average of last night's distances ...: used of 4 metrics.* The svg's aria-label: *Gauge from lo SD, low, to +hi SD, high, with normal at 0; usual range is -1 to +1 SD: last night sits at figure SD, word.* The meter line in the call (round 2) is a button named *Last night figure SD, word, on a scale from lo to +hi SD; usual range is -1 to +1 SD. Show the gauge and all vitals*. | +0.4 SD, Typical, a little above your normal; 4 of 4 metrics. |
| Range bar | *Label when: value, above/below/inside your usual lo to hi (average m, n nights).* The word is the tile's own (`position`); the band edges get one more decimal when rounding would contradict it. | Resting HR last night: 52 bpm, above your usual 47.5 to 51.7 bpm (average 50, 28 nights). The tile says "above usual · +1.1 SD". |
| Meter | the caller's sentence | Hours done: 72% of the plan. |
| Custom | the caller's sentence | 2026 at a glance: 4 events: Civil War Century (75 mi route), Sep 19, done; ... |
| Empty | the caller's `empty` text | No readings in this range yet. |
| Withheld (too few points) | *Title is withheld: it needs N readings and has M.* | HRV band is withheld: it needs 14 readings and has 5. |

Band comparisons use the exact values (or the caller's `position`, for range bars), and when rounding would make the printed numbers contradict the word, the band edges get one more decimal ("52 bpm, above your usual 47.5 to 51.7 bpm"), so a line chart and a range bar for the same night always agree. Units become singular at 1 ("1 day").

## 4. Data marks

Marks let the reviewer tie every number on screen to a row (Phase 0, marks.js).

- The **svg root** gets `data-source` and `data-where` from `marks: {source, where, key}`. When the chart's headline value is shown and matches the row, it also gets `data-field`.
- The **end label** and every **threshold label** carry their own marks. `data-field` is set only when the shown text actually contains the row value at the shown precision. Otherwise the label gets `data-derived="formatted"` (for example mm:ss pace).
- A **script-held** value gets `data-derived="held"` and `data-held="<file function what>"`, so a reviewer can find it in section 10.
- The **last night gauge** (Phase 6): its figure carries `data-source="night_gauge" data-field="value" data-where="key=last_night"`, plus `data-derived="night-gauge"` and a `data-rule` naming the formula (calc.js `night_gauge`: the mean of last night's SD distances for sleep_h, sleep_score, hrv_overnight_ms and resting_hr, resting HR sign flipped). The count carries `data-field="used"` and `data-field="of"`; the word and sentence carry `data-derived` (`gauge-word`, `sentence`) on the same row. The figure is computed once, in calc.js; app.js only reads it. The meter line in the call tile (Phase 6 round 2) repeats the figure and the word with the same marks (`#t-nm-v`, `#t-nm-word`).
- The **caption** gets `data-derived="sentence"`. Meters get `data-derived="meter"`, and range bars `data-derived="rb"`.
- Numbers in svg text end with a trailing space so the text of neighbouring labels never runs together for marks.js.

## 5. Responsive rules

- Charts are drawn at the **measured content width** of their box (the border box minus padding and border). One drawing unit is one rendered pixel, so the 11 px text floor holds at every width.
- **One** debounced resize listener (150 ms) serves every chart. It redraws only the charts whose width changed by more than 1 px. A change of colour scheme redraws them all.
- A box that has left the page, or that no longer holds its chart's own svg (its caller put a note or another view there), is dropped from the redraw list and never redrawn. Callers that empty a box call `CKC.clear(box)` first.
- Y tick labels are thinned by their measured height (every k-th tick, k the smallest stride that leaves 13 px between labels), so no two overlap.
- The system uses **four breakpoints** only: base (360 px), 480, 640 and 900. Charts are fluid between them. Tick counts follow the width (one time tick per 46 to 80 px).
- `.ck-chart` is the standalone frame (border, padding, radius). `.ck-chart--in` is for a chart inside a card that already has a frame (no border, no padding).
- Text floor: 11 px for ticks, units and sublines, 13 px for end labels and the caption. Figures are always tabular.
- Sparklines keep their aspect: they are drawn at the measured width, not stretched with `preserveAspectRatio="none"`.
- **Level charts on a phone** (Phase 6, the athlete, Nov 5, 2026). A line with level bands (`tbands`) passes `narrow: {h: 280}`. Under the 480 px breakpoint (`min-width: 480px` does not match) the chart is 280 px tall instead of its `h` (190 on Fitness) and the plot takes the full width of the card:
  - the y tick labels sit inside the plot, on their gridline, at least 40 px apart (so three or four). Each sits at the left end of its gridline, or at the right end when the left end would touch a dot, the line, the end label, its stack or another label, then 8 px further in from either end, up to 64 px; the first free place wins, else the one touching least (Phase 6 review, Nov 5, 2026). They are drawn over the data with a surface halo (`paint-order: stroke`), so a dot never prints through a figure;
  - the band names leave the plot for a narrow right column: a bar in the band's tone level with each band and one name beside it, wrapped by word, as wide as the longest word plus 12 px (at least 64, at most 30% of the width). Every band with a bar is named (Phase 6 review: "Bottom 10%" had a bar and no name). The names keep their order and sit as near their band's middle as the column allows, at least 2 px apart; a name pushed off its own band's height gets a 1 px elbow leader from its bar. When the full names do not fit the column's height, every name drops its basis in brackets ("Top 5%" for "Top 5% (research)"); only when that still does not fit are the names of the smallest bands left out (never the band the value sits in; the bar stays, and Scale and the tooltip still name it). Inline labels never enter the column;
  - the end label sits beside its dot inside the plot (right of it when there is room, otherwise left of it, above), so no end gutter is kept. The end label and its stack never cross a block boundary or the today line: when they would, they move as one group into the nearest gap between those lines that is wide enough (left-aligned when the gap is right of the dot, right-aligned when it is left of it), above or below the dot, stepping away from the dot 6 px at a time to the first place that touches the fewest dots and line segments. With no gap wide enough they stay beside the dot. The stack is drawn over the data with a surface halo, as the end label is;
  - **collision rule**: a value label (a threshold; block lines carry no in-plot labels since round 2, their figures are in the key) whose line is within 14 px of the end label's value is not placed on its own; it is stacked as its own line beside the end label, away from the dot, with its full name ("Target 10:15") and its own marks. The end label and the stack are hard obstacles: any other label that would touch one tries its other places and is left out if none is free. The inside tick labels are placed after every other label and keep clear of all of them (since the Phase 6 review);
  - block markers: one dashed line per block boundary that falls inside the plot (none at the left edge), the today line is left out when it is within 6 px of a boundary, and only the current and coming blocks print their name ("Base*");
  - the level grid is lighter: sub-level dotted lines at 25% and band edges at 50% opacity.
  From 480 up, and on every chart without level bands, nothing changes: other charts keep their height and layout. Crossing 480 changes the box width, so the one resize listener redraws it.
- **Close up names the sub-levels** (Phase 6 round 3, the athlete asked on Nov 5, 2026 for more granularity on Close up; app.js `subBands`, all widths). Close up spans the sub-level edges around the latest value (`closeRange`), and its bands are those sub-levels (`subtiersOf`: each band cut into the marker's `split`, 2 or 3, equal steps, numbered I, II, III toward the better edge in the marker's `better` direction), not the parent bands: each sub-level gets its own tint (alternating 16% and 7%, in its parent band's basis tone), its own bar in the phone band column and its own name ("Lower half II", wrapped by word, so "Lower / half II" in the narrow column; from 480 up, inside the plot as before), and the one the value is in is bold. An edge inside a parent band (`sub: true` on the band) is a solid 1 px hairline at 40% opacity; a parent band edge stays dashed, so the parent band still reads. A band with no sub-levels (an open end, or `split` 1) keeps its own name. The dotted `sublines` are not drawn in Close up (the hairlines replace them). The sub-level names carry no basis word (the tone and Scale carry it). Nearby levels and All levels keep the parent bands only, with the dotted sub-level lines. Where the value sits inside its sub-level is read from the dot against the band; the tile's bar to the next level is not repeated in the chart (it would be a second scale beside the axis).
- **Nearby levels shows at most three bands** (app.js `nearRange`, all widths): the band the latest value sits in, one above and one below (at the end of the scale, the two nearest). The y range is exactly that window; points outside it are clipped, as in Close up, and All levels still shows everything. A scale with three bands or fewer keeps the old padded range.

## 6. Accessibility

What a screen reader hears, from the keyboard walk on the self-test page (`charts-test/report.json`):

| Step | Key | Heard |
|---|---|---|
| Focus the chart | Tab | "HRV, the last 3 months: 42 ms on Nov 3, 28-night average level since Aug 5, inside your usual 38 to 49 ms." (the aria-label, role img) |
| Jump to the latest point | End | "Tue Nov 3: Night 42 ms" (polite live region) |
| Step back | Left arrow | "Mon Nov 2: Night 40 ms" |
| Open the tooltip | Enter | "Mon Nov 2. 28-night average: 44 ms. Night: 40 ms" |
| Close | Escape | "Closed" |

Keyboard map, for a focused chart:

| Key | Does |
|---|---|
| Left and right arrows | move the focus point one step |
| Home, End | first point, latest point |
| Enter or Space | open the tooltip for the point; press again to pick it (for example, select that week on the load chart) |
| Escape | close the tooltip (anywhere on the page) |

Touch: on a line a tap opens the nearest point's tooltip. On bars and whiskers a tap anywhere in a period's column (the bar plus half the gap each side) opens that period; on the share bar, the segment under the finger in the row under the finger. A tap outside any chart closes it. Only one tooltip is open on the page at a time. A tap on the load chart also selects that week, as it did before.

Other rules:

- The sentence is visible text, so the chart never relies on colour alone (WCAG 1.4.1). Bands and thresholds are labelled, and the so-far week has a pattern as well as a label.
- Shapes meet 3:1 and text 4.5:1 against the surface, from the Phase 3 tokens.
- Reduced motion: nothing animates. Otherwise the main line draws in once, for 200 ms, on first paint only (never on a redraw).
- Meters and grids drawn in CSS get `role="img"` and a sentence through `CKC.describe`. Decorative ones (the kit meter, whose text sits beside it) get `aria-hidden`.
- Range bars and CSS meters carry their sentence as the aria-label only, with no visible caption: the tile around them already shows the value and the comparison in text. This is the one exception to "a visible sentence"; the tile text and the sentence come from the same comparison.

## 7. The CKC API

Every function takes `(host, spec)`. `host` is the element that holds the chart. It returns `{sentence, ...}`, or `{withheld: true}` when a note was drawn instead. Common spec keys:

| Key | Meaning |
|---|---|
| `key` | stable id, used for redraw timing in `CKC.stats[key]` |
| `rows` | the data rows |
| `title`, `window` | the start of the sentence ("HRV", "the last 3 months") |
| `unit`, `axisLabel` | the axis unit (`axisLabel` replaces it, for example "pain, 0 to 10") |
| `fmt`, `digits` | number formatting for ticks, end labels and the sentence |
| `marks` | `{source, field, where, key}` for the svg root (section 4) |
| `h` | height in px; the width is always measured |
| `narrow` | `{h}`: under the 480 px breakpoint, this height instead of `h`; on a line with `tbands` the phone level layout of section 5 (ticks inside, band column, end label stack) |
| `standalone` | true: the full `.ck-chart` frame; false (the default): `.ck-chart--in` |
| `empty`, `minPoints`, `withheld` | the empty and too-few-points notes |
| `sentence` | your own sentence (a string or a function); otherwise the type builds one |

**Line with personal band.**

```js
CKC.line(box, { key: 'p-hrv', rows, x: 'date', h: 130, unit: 'ms', title: 'HRV (overnight)', window: spanName(),
  series: [{ key: 'hrv', label: 'Night', tone: 'fg-3', dots: true, line: false },
           { key: 'hrv_mean', label: '28-night average', tone: 'series-1' }],
  main: 0, bands: [{ lo: 'hrv_lo', hi: 'hrv_hi', label: 'your usual range' }],
  marks: { source: 'recovery_roll', field: 'hrv', key: 'date' } });
```

Other line options: `tbands` (tier bands with `now`), `blocks` (baseline, target and strong lines), `sublines`, `hbands`, `thresholds`, `boxes` (target box), `strips` (each with an optional `label`), `today`, `xDomain`, `yDomain`, `yTicks`, `axisLabel`, `clip`, `tipLines(row)`, `words: ['slower', 'faster']`, `per` ('night', 'week': the word in "7-night average") and `trendN` (7). Block lines carry no text in the plot (Phase 6 round 2, the athlete's pick L-A, Nov 5, 2026): the block marked `goal` (a string naming it, the current block when it has a Target, else the next one: "this block" or "Base from Nov 9") names its figures in a one-line key under the plot (`p.ck-chart-key.ck-refkey`), Target, Baseline, Strong, each figure after a 14 px sample of its line style, the block named for screen readers ("For Base from Nov 9:"), every figure with its line's marks. Blocks with no `goal` keep their lines and shading without figures. Series options: `smooth` (this series carries the change), `tag` (a direct name beside the series), `dots`, `line`, `dashed`, `end`, `short`.

**Sparkline.**

```js
CKC.spark(el, { key: 'spark-vo2', rows, unit: '', title: 'Cardio fitness (VO2max)', window: 'the last 16 weeks',
  series: [{ key: 'value', tone: 'series-1' }] });
```

**Bar with so far marker** (stacked when `stack` is given).

```js
CKC.bar(box, { key: 'week-load', h: 190, rows: weeks.map((w) => ({ x: w.week, parts: { bike: w.bike, run: w.run }, ref: w.plan })),
  stack: [{ key: 'bike', label: 'Bike', tone: 'bike' }, { key: 'run', label: 'Run', tone: 'run' }],
  unit: 'h', floor: 7.5, partial: { x: thisWeek, days: 3, of: 7 }, refLabel: 'Planned',
  bands: [{ lo: 5, hi: 7, label: '5 to 7 h budget', marks: { held: 'app.js drawLoad weekly budget' } }],
  title: 'Training hours by week', window: 'the 12 weeks to Nov 2', period: 'week',
  marks: { source: 'weekly', key: 'week' }, onPick: (r) => selectWeek(r.x) });
```

Other bar options: `tone` or `toneOf(row)`, `yMax`, `yTicks`, `avg` (a labelled average line), `thresholds` (`at: 'start'` puts the label on the left), `selected`, `valueLabel`, `directLabels`, `tip(row)`, `barMax`, `padding`, `xfmt`.

**Share bar (fixed 0 to 100).**

```js
CKC.share(host, { key: 'zones', title: 'Heart-rate zone time', window: 'the last 3 months',
  rows: [{ label: 'Last 3 months', parts: [{ key: 'z1', label: 'Z1', name: 'Zone 1 (Easy)', value: 812 }, ...] },
         { label: 'The 3 months before', parts: [...] }],
  marks: { source: 'coach', where: 'kind=hrz' } });
```

The parts take an ordered sequential ramp, in the order given. Labels sit under each bar and the axis reads 0, 50 and 100 %.

**Dot and whisker.**

```js
CKC.whisker(box, { key: 'sleep-weeks', rows: [{ x: '2026-10-26', lo: 7.2, mid: 8.1, hi: 9.3 }, ...], unit: 'h',
  title: 'Sleep by week', window: 'the last 8 weeks', band: { lo: 6.5, hi: 9.1, label: 'your usual range' } });
```

**Range bar** (the Phase 3 `ck-rb` component).

```js
CKC.rangeBar(el, { key: 'night-resting_hr', label: 'Resting HR', when: 'last night', value: r.value, mean: r.mean, sd: r.sd,
  lo: r.mean - r.sd, hi: r.mean + r.sd, position: zText(r).pos, n: r.n, minN: 14, span: 2.5, unit: 'bpm',
  marks: { source: 'night', where: 'metric=resting_hr' } });
```

The band is `lo` to `hi` from the spec. `position` ('above', 'below', 'inside') is the caller's own comparison, so the sentence says what the tile says. When `n < minN`, or there is no band, it shows "no usual range yet, it needs 14 nights and has n" instead.

**Custom.**

```js
CKC.custom(box, { key: 'season-timeline', h: 176, interactive: false, marks: { source: 'coach', where: 'kind=block' },
  draw: ({ svg, W, H, T, m, mk }) => { /* draw with mk(parent, tag, attrs, text); T('fg') gives a token colour;
    m(text, cls) measures text */ return { H, sentence: 'Season timeline, ...' }; } });
```

Season timeline labels (Phase 5, review fix): no rotated text. Each phase label is horizontal: the phase name when it fits its bar by measured width (`m(text, 'bl')`), otherwise two letters (`PHASE_INIT`: Ba, Bu, Sp, Ta, Re). Placement is the inside-label rule that `placeInside` in charts.js uses: the label tries its places in order (centred over the bar, then just clear of each line that crosses the bar, sliding at most half its width past the bar's edge, then one or two rows higher), and the first that touches no line (the now line, a race stem), race icon, bar or placed label wins, else the one touching least, drawn with the same 3 px surface halo charts.js gives its labels. A label with no place clear of the labels already placed is left out, and the svg carries `data-unlabelled` with the count; the note under the chart says what the letters stand for. The chart's click targets have a keyboard twin: "Blocks and races as a list" (`#r-tl-list`) gives one 44 px `ck-row` button per block and per race with the same open action, and the year strips point to the race rows under them in their sentence.

**Meter and describe.**

```js
CKC.meter(el, { frac: 0.3, tone: 'series-1', sentence: 'Level Bottom 5% II: 30% of the way to the next level' });
CKC.describe(bar, 'Long run: 40% of the block goal; even pace would be 55%.', { source: 'coach', where: 'kind=brief_kpi&block_key=b1&key=long_run', derived: 'block-progress' });
```

**Helpers.** `CKC.clear(host)` unregisters a chart before its caller empties the box or puts a note there (a box that lost its svg is also dropped on the next resize). `CKC.tone(host, name)` gives a token colour, for swatches outside a chart. `CKC.inkOn(host, fill)` gives the text colour that reads on a fill. `CKC.mark(node, marks, value, text)` and `CKC.announce(text)` are the marks and live-region helpers. `CKC.redrawAll(force)` redraws every chart. `CKC.still()` is true under reduced motion. `CKC.say.trend` and `CKC.say.band` are the sentence parts. `CKC.stats[key]` holds `{n, last, max}` redraw times in ms.

## 8. How to add a chart in five steps

1. **Pick the type** from section 1. If none fits, it is probably a banned type. Ask before you add one.
2. **Find the rows.** Every value, band, threshold and baseline should come from a dataset or coach row. If a threshold has no row yet, add it to section 10 with the row it should move to, and pass it with `marks: { held: '<file function what>' }`.
3. **Add a host** in `index.html` inside `#dash-root` (a `div` with an id; add `class="ck-chart"` only if it stands alone), and call the right `CKC` function from the tab's render function with `key`, `rows`, `title`, `window`, `unit` and `marks`. Where the same box can show a note instead ("No data in this range yet"), call `CKC.clear(box)` before you replace its content.
4. **Read the sentence** in the caption. If it does not say the latest value, the change and the comparison in words the athlete would use, fix the title, window, `words` or `fmt`, or pass your own `sentence`.
5. **Check it** with the harness: render the tab at 360 and 900, light and dark, and run marks.js. You want 0 console errors, 0 overflow, 0 chart text under 11 px, 0 contrast failures, and no mismatched marks. Then check that `pack_dashboard.py` still reports every file under 256 KB.

## 9. Build

`charts.js` is a build of `src/charts.src.js`. Edit the source, then rebuild with terser:

```sh
npx terser@5.29.2 src/charts.src.js --compress passes=2 --mangle --ecma 2017 -o charts.js
```

terser 5.29.2 reproduces the shipped build byte for byte (checked Nov 4, 2026; 5.33 and later drop an unused argument and differ by a few bytes). The shipped build carries no preamble comment.

`index.html` loads `charts.css` after `style.css` and `cockpit.css`, and `charts.js` after `calc.js` and `cockpit.js` and before `app.js`. d3 v7 must already be on the page. `pack_dashboard.py` picks both files up from `index.html` with no change. `src/` is not packed. The minified build is 45,895 bytes (47,340 bytes packed, against the 256 KB per-file cap); the readable source is 79,982 bytes. Default number formats (a series with `digits` and no `fmt`, the whisker default, the extra band-edge decimal) go through `dfmt`, which uses the page's shared half-up formatter `window.CX.fmt` (calc.js) when it is there (Phase 5, Nov 4, 2026). Keep the build lean (it was held under 40 KB until Phase 6 added the part key and the phone level-chart layout, about 2.7 KB, and the review fixes to that layout, about 2.6 KB): the most used label strings already have short names at the top of the source.

## 10. Still script-held

These numbers still live in script. Each one is passed to the chart with a `held` mark (or sits in the caller's code), so it reads from the same place as before Phase 4. The proposed home is a coach row of a new kind `chart_rule` (key, value, unit, why), unless a row for it already exists.

| Literal | Where now | Move to |
|---|---|---|
| Night tiles: band needs 14 nights; the scale spans mean plus or minus 2.5 SD; the usual range is mean plus or minus 1 SD (now passed as `lo`, `hi` by the caller, no longer fixed inside charts.js) | app.js renderNight (`minN: 14, span: 2.5`, `lo`, `hi`) | `night` rows: `min_n`, `span_sd`, `lo`, `hi` (calc.js already computes the 14-night gate in recovery_roll) |
| Pain line at 3/10, the 0 to 10 scale, the 14-day window, and the card shows only with pain in the last 7 days | app.js renderWatch | `chart_rule` key `pain_flag` (3), `pain_scale` (10), `pain_days` (14), `pain_show_days` (7) |
| Weekly budget band 5 to 7 h | app.js drawLoad | `week_view` plan rows: `budget_lo`, `budget_hi` (or `chart_rule` `week_budget`) |
| Y floors: 7.5 h and 100 load (load chart); 1 h, 5 mi, 1000 yd, 500 ft (volume) | app.js drawLoad, drawVolume | `chart_rule` `floor_<measure>` |
| Consistency tiers 3, 4 and 5 days (Good, Better, Best), their basis (research, coach), the "3 or more is ok" fill and the 0 to 7 day scale | app.js drawMarker (bars branch) | the `marker` row for consistency: `tiers`, `ok`, `y_max` (as other markers already do) |
| Durability band 0 to 5 when it has no tiers | app.js drawMarker (`hbands`) | `marker` row durability: `tiers` |
| The `yMin` 0 list (strength, sauna, le8, sleepreg, wkg) | app.js drawMarker | `marker` rows: `y_min` |
| closeRange FLOOR and CAP (le8 capped at 100) | app.js closeRange | `marker` rows: `y_min`, `y_max` |
| Open-ended tier width, 25% of the edge | app.js closedSpan (`* 0.25`) | `marker` rows: `open_width` |
| Strength sessions denominator of at least 2 | app.js renderWeek, Strength tile (`max(2, strPlan)`; marked `data-rule` since Phase 5) | `week_view` plan rows (planned strength count) |
| Pillar targets: VO2max at the 60th percentile of the athlete's FRIEND group (`target_num`, 43.4 for men 30–39), sleep regularity 45 (the chart's threshold carries a `held` mark; since Phase 5 the "Dashed: target" note under the chart names the value with `data-rule`) | pillars.js chartFor (`sub`) | `pbar` or `level_block` target rows for vo2 and reg |
| Pillar spark: drawn only from 4 points, and keeps the last 16 (weekly) points (the spark box carries `data-rule` since Phase 5) | pillars.js spark | the pillar `marker` row: `spark_min`, `spark_n` |
| Weight note "146–148 by Jan 31", shown above the weight chart | calc.js 295 (the weight scorecard note) | built from the `target` row for weight (`lo`, `hi`, `end`), as the chart's own target label already is |
| Weight plan end cap 2027-02-14 | app.js drawWeight | the `target` row for weight (`end`) |
| Timeline fallback hours 3.5 (taper, recover) and 5 (Phase 5: `TL_FALLBACK`; the list row that uses it carries `data-rule`) | season.js blockHours | `block` rows: a numeric `hours` field next to `volume` |
| Season so far: "first block closes Dec 20" and the race name typed for the century done on that date (Civil War Century) (Phase 5, `data-rule`) | season.js renderSoFar | the first `level_block` row's `end`; the done `race` row on that date |
| Hall of fame: fastest pace counts road runs of 3 mi or more; ride power counts rides of an hour or more (Phase 5, `data-rule`) | records.js | `chart_rule` `rec_pace_min_mi` (3), `rec_power_min_min` (60) |
| Season stale banner: the 26 h Garmin lateness (Phase 5, `data-rule`, as on Week and Health) | season.js renderSeasonStale (`GARMIN_MAX_H`) | `coach/ops/data_paths.json` garmin `max_age_hours`, copied into the `build` row |
| Pace at 150 bpm and power at 130 bpm (in titles and tooltips) | app.js renderFitness and drawFitChart | `marker` rows run and bike: `hr_ref` (calc.js uses the same numbers) |
| The 28-day and 14-day average windows (in titles; in the Health chart notes and the weight read-out as `data-rule` since Phase 5, with the 30 min sleep correction and the 1 SD band) | app.js, pillars.js | the dataset rows' `window_days` (calc.js) |
| Health metric tags: the weight scale "of 10", and the "1 SD" in the Spread line (Phase 5, `data-rule`) | pillars.js metricRow | the `pmetric` rows: `w_max`; the spread row's `sd` (pillars.py already computes both) |
| Health stale banner: the 26 h Garmin lateness (Phase 5, `data-rule`, as on Week) | app.js renderHealthStale (`GARMIN_MAX_H`) | `coach/ops/data_paths.json` garmin `max_age_hours`, copied into the `build` row |
| SPANS: 30, 91 and 365 days (the 1M, 3M, 1Y labels and "the 3 months before" carry `data-rule` since Phase 5) | app.js | `chart_rule` `span_<id>` (it is a control, so this one can stay) |
| Fitness tiles: the 8-week comparison window and the 28-day window in the run and bike sublines | app.js markerSummary, renderFitness (`data-rule`) | `marker` rows run and bike: `window_days`, `compare_days` |
| Fitness notes: the run and bike calculation note, the zone note copy | app.js drawFitChart, renderZones (`data-rule`) | the `marker` rows' `how` (calc rows run and bike), a `zone` note row |
| Check-in: the manual session minutes 15 to 120, the fuel carb bands 30 and 60 g/h, the RPE hint "about 30 min after" (index.html, `data-rule` since Phase 5) | index.html `#fs-manual`, `#fs-form` | `ci_q`-style rows for the two forms (`kind=form_q`, opts and labels), as the surveys already have |
| Check-in: the fuel question from 90 min; the morning form folds from 12:00 (the Overdue badge names it) | forms.js fuelVis, morningView (`data-rule`) | `chart_rule` `fuel_min_minutes`, `morning_fold_hour` |
| Check-in follow-ups: WHO-5 of 25 and under 13, the 988 line, blood pressure 130/80 and the 3-month repeat; last week's survey open Monday to Thursday (`data-rule`) | checkins.js followUp, periodOf | the `ci_q` rows who5 and bp_home (`flag_below`, `flag_at`, `repeat_months`), the `ci_survey` row weekly (`open_until_dow`) |
| Check-in: the weekly survey opens Friday ("Opens Friday for the week of", the not-open-yet text) | checkins.js periodOf (`data-derived` period) | the `ci_survey` row weekly (`opens_dow`) |
| Check-in: the quarter and half-year boundaries (Q1 to Q4 by three months, Jan–Jun and Jul–Dec) | checkins.js periodOf (`data-derived` period) | the `ci_survey` rows quarterly and half (`period_months`) |
| Check-in stale banner: the 26 h Garmin lateness (Phase 5, `data-rule`) | app.js renderCiStale (`GARMIN_MAX_H`) | `coach/ops/data_paths.json` garmin `max_age_hours`, copied into the `build` row |
| Lifts next step: "Light phase: same or lighter, 3+ reps in reserve", the 5 lb step when an exercise has none, "make it harder" (inside the marked last-time line and the Progress next step) | lifts.js hint | the `lift_phase` row for light mode (`text`), `lift_ex` rows: `step` on every loaded lift |
| Lifts: a decided New block card shows for 14 days | lifts.js renderRotation | the `lift_proposal` row: `show_days` |
| Today, last night gauge (Phase 6): the -2 to +2 SD span (the `night_gauge` row's `lo` and `hi`, typed in calc.js), the four metrics it averages (the row's `metrics`), the word cut-offs 1 SD (Low, High) and 2 SD (Well) and the Watch colour from 1.5 SD on the low side (the tiles' `zText` rule), and the 280 by 164 px drawing; the usual-range marks at -1 and +1 SD on the gauge and the call's meter (app.js `USUAL`, the calc.js night rule average ± 1 SD) | calc.js night_gauge, app.js renderGauge | `chart_rule` `gauge_span_sd` (2), `watch_sd` (1.5, shared with the Watch notice); the metric list in the `night` calc definition |
| Today: the size note under the call (the day's plan size words), the Kudos 7-day window and the Progress 7-day window, the Watch flag at 1.5 SD (`data-rule` since Phase 5) | app.js renderToday, renderKudos, renderProgress, renderWatch | `chart_rule` `kudos_days` (7), `progress_days` (7), `watch_sd` (1.5); the size note from the `today` row's `size` words |
| Week: three key sessions every week, the rule start date Nov 2, 2026 (`KEY_RULE_FROM`), the easy-day heart-rate limits run 150 and bike 135 (`data-rule`) | app.js renderWeek, key sessions block | `coach/engine/KEY-SESSIONS.md` already holds the three; `chart_rule` `key_from` (2026-11-02), `easy_hr_run` (150), `easy_hr_bike` (135), or the `marker` rows' `hr_ref` |
| Fitness stale banner: the 26 h Garmin lateness (`data-rule`, as on Week, Health, Season, Check-in) | app.js renderFitStale (`GARMIN_MAX_H`) | `coach/ops/data_paths.json` garmin `max_age_hours`, copied into the `build` row |
| Level charts: 280 px tall under 480 px, and three bands in Nearby levels (Phase 6); the 14 px collision distance and 40 px tick spacing live in charts.js as grammar | app.js drawFitChart, drawMarker (`narrow: {h: 280}`), nearRange | `chart_rule` `level_h_narrow` (280), `near_bands` (3); the 480 is the system breakpoint and stays |
| Fitness zones: the 2-minute zone bucket (`ZONE_RULE`) | app.js renderZones | a `zone` row: `bucket_min` (2) |
| Health: the weight 7-day average window (`data-rule`) | pillars.js weight read-out | the weight dataset row's `window_days` (calc.js) |
| Season: the race forecast shows from 7 days out (`data-rule`) | season.js renderRaceWeek | the `race` rows or `chart_rule` `forecast_days` (7) |
| Check-in: the kit note's 7:45 AM ET morning run (`data-rule`, was a wrong typed 7:00 before Phase 5) and the monthly survey wording "the month just ended" | index.html kit note, checkins.js periodOf | `coach/ops/data_paths.json` morning task `time`, copied into the `build` row; the `ci_survey` row monthly (`period_text`) |

Moved from script to data in Phase 4: the weight chart's own target label ("146 to 148 lb target") is now built from the `target` row, not typed in. The note above the chart is not: calc.js still types "146–148 by Jan 31" (in the table above). The range bar's usual range also left the library: the caller passes `lo` and `hi`.

## 11. Proposed for Phase 5

Removals (dead code, left in place in Phase 4 on purpose). Done in Phase 5 (Health), each proved unreachable first (no host on the page, no caller while `CX.renderPillars` is set):

- `drawRecovery`, `drawFeel` (app.js) and `renderBody` (body.js): inventory chart-03 to chart-05. Their hosts are not in `index.html` and they run only if `CX.renderPillars` is missing.
- `renderHealth` (app.js) and its marker tiles, replaced by the Health pillars.
- The unused `spark` function in app.js.
- With them went `state.hm`, the health branch of the drawMarker zoom callback, and every `dash.colors` reader. The zone hex lists had already gone with PAL (Fitness).

Behaviour changes:

- Done in Phase 5 (Fitness fixes): VO2max and resting HR follow `state.span`. They draw through `drawMarker` (inSpan, spanStart) whenever a tile opens them; the `drawFitChart` branches for them were never reachable and are removed. With today's data the vo2 and rhr markers sit in the health section, so no Fitness tile shows them; the harness `vo2fit` variant (both as Foundation tiles) shows 1M, 3M, 1Y and All differ (VO2max 8, 26, 52, 178 points; resting HR 32, 92, 366, 924).
- Band sources (Nov 8, 2026): `drawMarker` labels bands by name only; one `.ft-basis` line above the chart names the main source and lists any bands from another (removed and redrawn on each draw; the run and bike calc tiles remove it).
- Aerobic engine (Nov 8, 2026): the open `aerobic` tile gets a Run / Bike switch (`#f-sport`, a `ck-seg` above `#c-fit`, built by `sportPick`); the picked sport's marker draws through `drawMarker` (title from `chart_title`) with its own tier bands, zoom bar and detail, and follows `state.span`. The Health pillar VO2max chart's dashed target reads `target_num` (the 60th percentile of the athlete's group) instead of a held 43.4.
- Done in Phase 5 (Season): the timeline and year strip click targets are keyboard reachable, through "Blocks and races as a list" and the race rows under each strip (see section 7, Custom).
- Done in Phase 5 (Fitness): one colour system. `PAL` is gone from app.js; `COL()`, `sportCol()` and `BASIS` return token names (`var(--ck-run)` and so on), so the tiles, the sport key, the block meters, the Season race icons and the charts read the same tokens. The run and bike tooltip lines carry the sport tone. `dash.colors` is no longer read on Fitness.
- The `zones` hex lists in PAL went with PAL (Phase 5).

## 12. Known gaps and residual risk

- The pain chart (Today, Watch card) was refactored but not seen in the renders. It shows only with pain in the last 7 days, and the harness data has none.
- Resolved in Phase 5 (Season): the timeline and year strips have keyboard twins (list rows with the same open action). The svg groups themselves are still not focusable; the list is the keyboard path.
- Zone share: a segment label that does not fit is left out (the tooltip and the sentence still give it). Two pairs of the sequential ramp are close in tone (`--ck-seq-1` and `-2` in light, `-4` and `-5` in dark); that is a Phase 3 token fix.
- Charts redraw on a window resize, not when only their box changes width (for example a desktop scrollbar appearing). Until the next resize the drawing scales with the box, and text can fall just under 11 px.
- On a line, when every place for a label touches data, the place that touches least is used (with a halo); on dense nightly dots "your usual range" may still touch a dot.
- Screen readers in browse mode may take the arrow keys before the chart sees them. The sentence is still read, and the tooltip opens with Enter in focus mode.
- A tap opens the nearest point. There are no per-point 44 px targets: the whole svg is the tap area.
- Resolved in Phase 5 (Health): the pillar spark sits outside the pillar row button, which points at its sentence with `aria-describedby` (a hidden copy, because the chart's own caption is rebuilt on each redraw); the spark box itself is `aria-hidden`.
- The Fitness charts show fewer x ticks than before at 360 px, because the gutter is now sized for the labels.
- mm:ss values (pace, 5K, swim) carry `data-derived="formatted"`, not `data-field`, because the shown text is not the raw row number.
- Dark mode follows the host: `prefers-color-scheme`, and since Phase 5 also the host's own toggle (`[data-mode]` on an ancestor), which app.js answers with `CKC.redrawAll(true)` through `CK.onModeChange` (cockpit.js).
- The host tokens in the harness are stand-ins. Contrast is re-measured against the live host in Phase 5.
- Night tiles are about 15 px taller (the range bar has its own labels).
