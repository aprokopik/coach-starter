#!/bin/sh
# Build the Cockpit system page files from the readable sources in src/cockpit/ (coach/DASHBOARD.md, "Cockpit system").
#   cockpit.css = tokens.css + motion.css + components.css, comments stripped, plus a copy of the dark token block under
#                 "[data-mode=dark] .ck" (the live host's own dark toggle), so the block is written once in tokens.css.
#   cockpit.js  = components.js, unchanged.
# Run from coach/dashboard:  sh src/build-cockpit.sh
# Rule: cockpit.css and cockpit.js are never edited by hand. Change the sources here, rebuild, and commit the sources and
# the built files together, so that a fresh build reproduces the committed files byte for byte (as coach/dashboard/CHARTS.md
# section 9 requires for charts.js). Check before every commit that touches either file:
#   sh src/build-cockpit.sh && git diff --exit-code cockpit.css cockpit.js
set -eu
cd "$(dirname "$0")/.."
SRC=src/cockpit
{
  printf '/* cockpit.css: Cockpit design system (Phase 3 tokens, motion, components). BUILT FILE: edit src/cockpit/*.css, then run sh src/build-cockpit.sh (coach/DASHBOARD.md). */\n'
  cat "$SRC/tokens.css" "$SRC/motion.css" "$SRC/components.css" \
    | perl -0777 -pe 's{/\*.*?\*/}{}gs; s{[ \t]+$}{}mg; s{\n\s*\n+}{\n}g'
  # the dark block, a second time, for an ancestor [data-mode=dark] (the host toggle wins over the phone setting)
  perl -0777 -ne 'if (/\@media \(prefers-color-scheme: dark\) \{\s*\.ck:not\(\[data-mode=light\] \*\):not\(\[data-mode=dark\] \*\) \{(.*?)\n  \}\n\}/s) { my $b = $1; $b =~ s{/\*.*?\*/}{}gs; $b =~ s{[ \t]+$}{}mg; $b =~ s{\n\s*\n+}{\n}g; print "[data-mode=dark] .ck {$b\n}\n"; } else { die "dark block not found\n"; }' "$SRC/tokens.css"
} > cockpit.css
{
  printf '/* cockpit.js: Cockpit design system behaviours (window.CK). BUILT FILE: a copy of src/cockpit/components.js (sh src/build-cockpit.sh). */\n'
  cat "$SRC/components.js"
} > cockpit.js
wc -c cockpit.css cockpit.js
