# NEON BREACH 2.0 — Design

**Dato:** 2026-07-16 · **Status:** Godkendt (del 1 eksplicit; del 2-3 med frie hænder)

## Mål

Giv gameplayet en over nakken: erstat det endeløse ens-loop med tematiske sektorer, giv spilleren build-valg, opgradér grafikken markant, og gør banerne spændende. Behold det, der virker: graze, overdrive, combo, juice, vanilla JS uden dependencies, mobil-support.

## 1. Gameplay-struktur

### Sektorer

En run består af **sektorer**: hver sektor = 4 waves + 1 unik boss (wave 5, 10, 15 … er boss-waves, som i dag). Efter sektor 5's boss starter **LOOP 2**: samme sektorer, hurtigere/tættere, højere score. Internt fortsætter `wave`-tælleren (1, 2, 3 …); sektor og loop afledes:

- `sectorIndex = floor((wave-1)/5) % 5`
- `loop = floor((wave-1)/25) + 1`
- HUD viser `SECTOR 2-3` (sektor 2, wave 3) og `LOOP 2` når loop > 1. Boss-waves viser `SECTOR 2 · BOSS`.

Loop-skalering: fjende-HP ×(1 + 0,5·(loop−1)), fart ×(1 + 0,1·(loop−1)), score-base ×loop. Eksisterende `speedUp = 1 + wave·0.035` beholdes.

### Upgrade-valg (roguelite-let)

Efter hvert boss-kill fryser spillet (state `UPGRADE`): DOM-overlay med **3 tilfældige, forskellige upgrade-kort — vælg 1** (tast 1/2/3, klik eller tap). Derefter sektor-intro og videre. Puljen (respekterer max stacks; EXTRA LIFE tilbydes kun ved lives < 5; er puljen udtømt tilbydes SALVAGE +5000 point):

| Upgrade | Effekt | Max |
|---|---|---|
| RAPID FIRE | Skudinterval ×0,85 pr. stack | 3 |
| WINGMAN | Drone der flyver med og skyder | 2 |
| GRAZE MASTER | Graze giver dobbelt OD-energi + 50 point | 1 |
| MAGNET | Powerups trækkes mod skibet (260 px radius) | 1 |
| EXTRA LIFE | +1 liv | liv ≤ 5 |
| OVERDRIVE+ | OD varer 8 s i stedet for 6 s | 1 |
| PIERCING | Skud går gennem den første fjende de dræber | 1 |
| SPREAD | +1 skråt sideskud pr. side pr. stack | 2 |

Upgrades gælder kun for den aktuelle run. Midlertidige powerups i banen beholdes: TRIPLE, LASER, SHIELD, BOMB.

## 2. Sektorer & baner

Al sektor-data ligger i ny fil **`sectors.js`** (ren data/config, classic script indlæst før game.js — samme mønster som config.js). Hver sektor: navn, palette (RGB-arrays så de kan lerpes), baggrundstema, fjendemix, håndkoreograferede wave-scripts (bygget af formationsbyggeklodser: V-formation, mur, stream, sniper-post, tank + nye), hazard og boss.

| # | Sektor | Palette/baggrund | Hazard | Signatur-fjende | Boss |
|---|---|---|---|---|---|
| 1 | NEON CITY | Pink/cyan; by-silhuet parallax med tændte vinduer | — (læringssektor) | — | GATEKEEPER |
| 2 | ASTEROID BELT | Orange/rust; drivende klippe-silhuetter | Asteroider driver ned; kan skydes i stykker → 2 småsten | MINER | CRUSHER |
| 3 | SOLAR STORM | Gul/rød; stor sol ved horisonten med pulserende korona | Telegraferede lodrette flare-zoner (1,2 s varsel → 0,8 s stråle) | PHOENIX | SOLAR CORE |
| 4 | CYBER TUNNEL | Matrix-grøn; data-regn + tunnelvægge | Neon-vægge indsnævrer spilleområdet i partier (klemmer ikke — begrænser) | PHANTOM | FIREWALL |
| 5 | MOTHERSHIP | Dyb lilla/rød; skibsskrog-silhuet der vokser wave for wave | Turret-pods | TURRET | MOTHERSHIP |

Sektor-intro: banner »ENTERING: ASTEROID BELT« + palette-crossfade (~1,5 s lerp).

## 3. Fjender & bosser

### Eksisterende (beholdes)

drone, diver, tank, splitter, mini, sniper — uændret adfærd, fordeles pr. sektor via wave-scripts.

### Nye fjender

- **MINER** — flyver til øvre bane, bevæger sig vandret, lægger stationære miner (max 3 aktive). Mine: armeres efter 0,8 s (blink); skydes den (1 hp) fjernes den sikkert (+50); efter 4 s brister den i 6 radiale skud; berøring = hit.
- **PHOENIX** — hurtig kurvet dykker, 2 hp. Første død: eksploderer og genopstår efter 1,2 s nær døds-x med 1 hp, hurtigere og mere glødende. Giver score begge gange.
- **PHANTOM** — dronebane men faser: synlig 1,6 s → fade 0,4 s → usynlig/urambar 1,2 s → fade ind + affyrer ét sigtet skud.
- **TURRET** — langsom nedstigning langs siderne, 4 hp, sigtede 2-skuds-bursts.
- **ASTEROID** (hazard-entity) — stor sten 4 hp, driver roterende nedad; død → 2 små sten (1 hp, skrå, hurtigere). Skyder ikke; kollision skader. Straffer ikke combo ved bund-exit.
- **FLARE** (hazard, ikke entity) — lodret strålezone: varsel 1,2 s (blinkende kolonne) → aktiv 0,8 s (skade hvis spilleren står i den). Egen `hazards`-liste.

### Bosser (5 unikke, telegraferede, med rage-faser)

1. **GATEKEEPER** (S1) — nuværende boss poleret: radial burst, sigtet byge, summon + ny fase-2 roterende spiral-emitter.
2. **CRUSHER** (S2) — kaster 3 asteroider i buer; vandret charge med mine-spor; radial sten-burst. Rage: hurtigere.
3. **SOLAR CORE** (S3) — center-top; 2 roterende laserstråler (urvisere, telegraferet opstart) + radiale puls-ringe; fase 2: 3 stråler.
4. **FIREWALL** (S4) — bred segmenteret mur (7 segmenter) der synker/retirerer; 2-3 lysende svage punkter tager skade (pansrede segmenter absorberer); nyt svagt punkt aktiveres når ét dør; skyder nedadgående mønstre.
5. **MOTHERSHIP** (S5) — 3 faser: (1) to turret-pods (egen HP) + skjoldet kerne, (2) kerne eksponeret: radial/spiral + drone-summons, (3) desperation < 25 %: tætte spiraler + sigtede streams.

## 4. Grafik 2.0

- **Glow-sprite-cache:** spillerskud (aflang tracer), fjendeskud (ring + kerne pr. farve) og partikel-prikker pre-renderes til offscreen-canvas og tegnes med `drawImage` — fjerner `shadowBlur` fra de varme stier (hundredvis af entities/frame). Fjender/bosser beholder vektor + blur (få entities).
- **Sektor-paletter** styrer baggrundsgradient, stjernefarvetone, grid-farve og horisont-glow; lerpes ved sektorskift.
- **Baggrundslag pr. sektor** (proceduralt, billigt): by-silhuetter (S1), klippesten (S2), soldisk + korona (S3), data-regn + vægge (S4), voksende skrog (S5).
- **Skibet:** banking-hældning efter sidebevægelse + animeret flakkende exhaust-flamme.
- **Boss-død:** hvid flash-overlay + forlænget hit-stop + chokbølge-partikler.
- **Beholdes:** CRT-overlay, Press Start 2P, synthwave-æstetik, REDUCED_MOTION-hensyn.

## 5. Fjernes/forenkles

- **SLOW-MO-powerup fjernes** (svag + komplicerer time-scale). `ts`-parameteren og `slowT` udgår; hit-stop dækker slag-fornemmelsen.
- **Kill-streak-popups forenkles:** kun RAMPAGE!! ved 5+ kills (triple/quad udgår — combo-systemet dækker).
- Wave-RNG (`pickGroup`-sandsynligheder) erstattes af sektor-scripts; formationsbyggerne genbruges som funktioner.

## 6. Teknik & data

- **Filer:** `sectors.js` (ny, ren data: SECTOR_DEFS + UPGRADE_DEFS + wave-scripts), `game.js` (motor, udvides), `index.html` (upgrade-overlay, HUD-sektor-label, v2.0.0), `style.css` (upgrade-kort), `api/scores.js` + `neon_schema.sql` (leaderboard v2), README (migrationstrin).
- **Leaderboard v2:** `scores` får `version smallint NOT NULL DEFAULT 1`. GET (top-10 og rank) filtrerer `version = 2`; POST indsætter `version = 2`. Nyt indeks `(version, score DESC)`. Gamle rækker bevares som historik. **Manuel handling:** migrations-SQL skal køres i Neon Console før deploy.
- **State-maskine:** `MENU → PLAYING ⇄ PAUSE`, `PLAYING → UPGRADE → PLAYING`, `PLAYING → GAMEOVER`. UPGRADE fryser al simulation; rAF kører (baggrund animerer).
- Ingen build-step, ingen dependencies, classic scripts (config.js → sectors.js → game.js → backdrop.js).
- Backdrop.js røres ikke (fremtidig nice-to-have: sektor-synk af sidepaneler).

## 7. Fejlhåndtering & test

- try/finally-rammen om frame-loopet beholdes (rAF må aldrig dø).
- Upgrade-overlayet skal kunne betjenes med tastatur, mus og touch; Escape/P må ikke kunne bryde UPGRADE-state.
- Verifikation: `node --check` på alle JS-filer; lokal server + browser-gennemspilning (sektor-skift, boss 1-2, upgrade-valg, game over, score-submit-fallback); mobil-viewport-tjek; `prefers-reduced-motion` respekteres.
- Score-API testes med version-filter (lokal fallback når API mangler fungerer som i dag).
