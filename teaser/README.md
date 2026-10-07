# NEON BREACH — 30 s teaser

The trailer is generated entirely from code: real gameplay is captured from the game's own engine and combined with pixel motion graphics and a synthesized 80s soundtrack.

```bash
./build.sh          # -> out/NEON_BREACH_teaser.mp4  (1920x1080, 30 fps, H.264/AAC, -14 LUFS)
```

Requires python3 (`numpy scipy opencv-python-headless pillow`), node + `playwright` (Chromium), `ffmpeg` and `espeak-ng`.

| Step | Files | What happens |
|---|---|---|
| 1. Capture | `tools/build_harness.py`, `harness/`, `tools/capture.mjs`, `tools/specs.json` | `game.js` runs in headless Chromium with a virtual clock, seeded RNG and 2x supersampling. An autopilot flies, the pilot is invulnerable on camera, and every `Sfx` call is logged. Each clip in `specs.json` sets up a sector, boss or staged moment (slow-mo graze, OVERDRIVE vs. MOTHERSHIP). |
| 2. Sound | `audio/music.py`, `audio/sfx.py`, `audio/mix.py` | 128 BPM, A minor, 16 bars = 30.0 s: gated-reverb snare, octave bass, pulse arps, square lead. The game's own WebAudio SFX are rebuilt 1:1 and placed from the clip event logs, plus the arcade announcer (espeak-ng). |
| 3. Picture | `render/teaser.py`, `render/gfx.py` | 20 shots on the beat grid: CRT power-on, INSERT COIN, boot terminal, title drop, the "breach" shatter, 5 sector strips, DODGE/GRAZE/COMBO/UPGRADE, WARNING, 5-boss rush, OVERDRIVE, chrome logo + CTA, CRT power-off. A CRT post pass adds bloom, scanlines, chroma, curvature and grain. |

`render/test_frames.py out.png 16.1 24.6 …` renders single beats (B = beat index) to a contact sheet, which is quick for iterating. `teaser/` is excluded from Vercel deployments via `/.vercelignore`.
