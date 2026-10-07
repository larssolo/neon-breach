#!/usr/bin/env bash
# Robotic arcade announcer lines (espeak-ng); sfx.voice() adds bitcrush, ring-mod and doubling.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p voice
for v in "warning:Warning!" "overdrive:Overdrive!" "neonbreach:Neon Breach!" "insertcoin:Insert coin."; do
  espeak-ng -v en-us+m3 -s 125 -p 22 -a 180 -w "voice/${v%%:*}.wav" "${v#*:}"
done
