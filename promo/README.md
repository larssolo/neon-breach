# NEON BREACH — promo-film (9:16)

**`neon-breach-promo.mp4`** — 48 sek., 1080×1920, 60 fps, H.264 High + AAC 48 kHz (~39 MB). Klar til TikTok, Instagram Reels og YouTube Shorts.

Filmen er optaget fra **det rigtige spil** (`index.html` + `game.js`, uændret), drevet frame-for-frame af en scriptet autopilot, med 80'er-grafik, overgange og et originalt 8-bit soundtrack lagt ovenpå.

## Storyboard (150 BPM — klip og effekter rammer trommeslagene)

| Tid | Scene |
|---|---|
| 0:00 | CRT tænder · Hall of Fame: *"THINK YOU CAN — BEAT THIS?"* · skibet skyder glasset i stykker |
| 0:03 | **NEON BREACH**-logo på faldet · montage af alle 5 sektorer (glitch, pixel, diamant- og neon-wipe-overgange) |
| 0:16 | **GRAZE** i slow-motion mellem kuglerne |
| 0:17 | **CHAIN KILLS → x8 COMBO** → sniper → **GAME OVER** (musikken dør) → INSERT COIN → **◀◀ VHS-REWIND** → *"NOT TODAY."* → **OVERDRIVE!** |
| 0:24 | **SYSTEM UPGRADE** — vælg 1 af 3 |
| 0:25 | **WARNING** · 5 unikke bosser · boss-rush · moderskibet sprænges i slow-motion (tape-stop) |
| 0:33 | **LOOP 2 — MAX HEAT** |
| 0:35 | Hall of Fame: **YOU** klatrer fra #11 til #1 · *NEW HIGH SCORE!* · *"NOW DEFEND IT."* |
| 0:41 | Outrun-logo · **PLAY FREE · IN YOUR BROWSER** · INSERT COIN → PLAY NOW · CRT slukker |

Navne og scores på Hall of Fame-tavlen i filmen er fiktive demo-data.

## Lyd

- **Musik:** original chiptune komponeret til tidslinjen (`score.js` + `audio.mjs`): pulsbølger med duty-cycle, NES-agtig trappe-trekant-bas, LFSR-støj-trommer, alarm-sirene, risers og tape-stop.
- **Effekter:** spillets egne lyde (skud, eksplosioner, graze, overdrive, power-up, game over …) genskabt med præcis samme opskrifter som `Sfx` i `game.js` og lagt ind dér, hvor de skete i optagelsen — plus trailer-lyde (mønt, VHS-spoling, glitch, glas, CRT).
- Mixet til ca. −14 LUFS med peak omkring −1 dBFS (standard-niveau for sociale medier).

## Gen-render

Kræver Node 18+, [Playwright](https://playwright.dev) (Chromium) og `ffmpeg`. Ingen nye dependencies i `package.json`.

```bash
node promo/render.mjs                         # → promo/neon-breach-promo.mp4 (60 fps, ~10 min)
node promo/render.mjs --fps 30                # hurtigere preview
node promo/render.mjs --url NEONBREACH.DK     # vis spillets adresse på slutskiltet
node promo/render.mjs --stills 3.2,16.5,40    # kun stillbilleder (PNG) til gennemsyn
node promo/render.mjs --crf 18                # højere kvalitet / større fil
```

Mellemfiler havner i `.promo-work/` (git-ignoreret).

## Filer

| Fil | Indhold |
|---|---|
| `render.mjs` | Starter spillet i headless Chromium, renderer alle frames, lyd og MP4 |
| `hooks.js` | Virtuelt ur + seedet `Math.random` — indsættes før spillets scripts |
| `score.js` | Fælles tidslinje: BPM, takter, trommemønstre, nøgletider |
| `director/core.js` | Bro til spilmotoren: snapshots, autopilot, lyd-logning |
| `director/fx.js` | 80'er-effekter: bloom, scanlines, RGB-split, VHS, CRT, overgange, HUD, neon-tekst |
| `director/clips.js` | Klip-motoren (gameplay-klip, VHS-rewind, boss-roster, Hall of Fame) |
| `director/timeline.js` | Selve storyboardet: scener, tekster, overgange, lyd-cues |
| `director/main.js` | Compositor + API til `render.mjs` |
| `audio.mjs` | 8-bit synth, soundtrack, spillets lydeffekter, mix og master |
| `fonts/` | Press Start 2P + VT323 (SIL Open Font License) til offline-render |
