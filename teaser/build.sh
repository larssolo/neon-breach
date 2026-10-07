#!/usr/bin/env bash
# Rebuilds the NEON BREACH teaser end-to-end -> out/NEON_BREACH_teaser.mp4 (30 s, 1080p30).
# Needs: python3 (numpy scipy opencv-python-headless pillow), node + playwright (chromium), ffmpeg, espeak-ng.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p fonts out
[ -f fonts/PressStart2P.ttf ] || curl -sSfo fonts/PressStart2P.ttf https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK0nS.ttf
[ -f fonts/VT323.ttf ] || curl -sSfo fonts/VT323.ttf https://fonts.gstatic.com/s/vt323/v18/pxiKyp0ihIEF2hsY.ttf

# 1) capture real gameplay from the engine (deterministic, 2x supersampled)
python3 tools/build_harness.py
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV' EXIT
sleep 1
node tools/capture.mjs tools/specs.json

# 2) soundtrack, sound design, announcer, mix (-14 LUFS)
(cd audio && bash make_voice.sh && python3 music.py && PREGAIN_DB=-7.5 python3 mix.py)

# 3) motion graphics + CRT post, 900 frames
(cd render && python3 render.py)

# 4) encode (2-pass, ~27 MB)
cd out
ffmpeg -y -loglevel error -framerate 30 -i frames/f_%04d.png -c:v libx264 -preset slower -b:v 7000k -pass 1 \
  -passlogfile x264pass -pix_fmt yuv420p -profile:v high -x264-params aq-mode=3 -an -f mp4 /dev/null
ffmpeg -y -loglevel error -framerate 30 -i frames/f_%04d.png -i ../audio/teaser_mix.wav -c:v libx264 -preset slower \
  -b:v 7000k -maxrate 12000k -bufsize 16000k -pass 2 -passlogfile x264pass -pix_fmt yuv420p -profile:v high \
  -x264-params aq-mode=3 -c:a aac -b:a 224k -ar 48000 -movflags +faststart -shortest NEON_BREACH_teaser.mp4
echo "done: out/NEON_BREACH_teaser.mp4"
