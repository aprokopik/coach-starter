#!/bin/sh
# Run the sweep for every variant, four at a time: sh run-all.sh <pages dir> <data out dir> <renders dir>
# <pages dir> holds index-<variant>.html for each variant below (README.md, Sweep). Then: node aggregate.js <data out dir> <sweep.json>
P=$1; O=$2; R=$3; T=$(dirname "$0")
mkdir -p "$O" "$R"
printf '%s\n' default pain allstatus error empty nocheckins liftphase fresh planmissing keydone | xargs -P 4 -I{} sh -c "node $T/sweep.js --page $P/index-{}.html --variant {} --out $O --renders $R > $O/log-{}.txt 2>&1"
