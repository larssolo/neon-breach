/* =====================================================
   NEON BREACH — promo-film: fælles tidslinje
   Musikken er master-uret. Både director (billedet) og
   audio.mjs (lyden) læser denne fil, så klip, effekter og
   trommeslag rammer præcis samme frame.

   150 BPM · 1 takt = 1,6 s · 30 takter = 48 s
   ===================================================== */
(function (root) {
  'use strict';
  const BPM = 150;
  const BEAT = 60 / BPM;          // 0,4 s
  const BAR = BEAT * 4;           // 1,6 s
  const STEP = BEAT / 4;          // 16.-del = 0,1 s
  const BARS = 30;

  // Trommemønstre: 16 trin pr. takt pr. instrument.
  // k=kick  s=snare  h=lukket hihat  o=åben hihat  c=crash  t=tom
  const DRUMS = {
    none:     {},
    heart:    { k: 'x.......x.......' },
    roll:     { k: 'x...x...x...x...', s: '........x.x.xxxx' },
    main:     { k: 'x.....x.x.....x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
    mainc:    { k: 'x.....x.x.....x.', s: '....x.......x...', h: '..x.x.x.x.x.x.x.', o: '..............x.', c: 'x...............' },
    fill:     { k: 'x.....x.x.......', s: '....x.......xxxx', h: 'x.x.x.x.x.x.....' },
    half:     { k: 'x...............', s: '........x.......', h: 'x...x...x...x...' },
    drive:    { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
    riser:    { s: '............xxxx' },
    warn:     { k: 'x...x...x...x...', t: 'x.......x.....x.' },
    rush:     { k: 'x...x...x...x...', s: '....x.......x...', h: '.xxx.xxx.xxx.xxx', c: 'x.......x.......' },
    rush2:    { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', h: '.xxx.xxx.xxx.xxx', c: 'x...............' },
    build:    { k: 'x...x...x...x...', s: 'x.x.x.x.xxxxxxxx' },
    end:      { k: 'x...............', c: 'x...............' },
  };

  // Takt-for-takt arrangement. sec = sektion (styrer melodi/bas i audio.mjs)
  const BARMAP = [
    /* 0 */ { sec: 'hook',    chord: 'Am', drums: 'heart' },
    /* 1 */ { sec: 'hook',    chord: 'Am', drums: 'roll' },
    /* 2 */ { sec: 'themeA',  chord: 'Am', drums: 'mainc' },
    /* 3 */ { sec: 'themeA',  chord: 'F',  drums: 'main' },
    /* 4 */ { sec: 'themeA',  chord: 'C',  drums: 'main' },
    /* 5 */ { sec: 'themeA',  chord: 'G',  drums: 'main' },
    /* 6 */ { sec: 'themeA',  chord: 'Am', drums: 'mainc' },
    /* 7 */ { sec: 'themeA',  chord: 'F',  drums: 'main' },
    /* 8 */ { sec: 'themeA',  chord: 'G',  drums: 'main' },
    /* 9 */ { sec: 'themeA',  chord: 'E',  drums: 'fill' },
    /* 10 */ { sec: 'graze',  chord: 'F',  drums: 'half' },
    /* 11 */ { sec: 'combo',  chord: 'G',  drums: 'drive' },
    /* 12 */ { sec: 'death',  chord: 'Am', drums: 'drive' },
    /* 13 */ { sec: 'rewind', chord: 'Am', drums: 'riser' },
    /* 14 */ { sec: 'od',     chord: 'Am', drums: 'mainc' },
    /* 15 */ { sec: 'od',     chord: 'F',  drums: 'fill' },
    /* 16 */ { sec: 'warn',   chord: 'A5', drums: 'warn' },
    /* 17 */ { sec: 'rush',   chord: 'Am', drums: 'rush' },
    /* 18 */ { sec: 'rush',   chord: 'Bb', drums: 'rush' },
    /* 19 */ { sec: 'mother', chord: 'Dm', drums: 'rush2' },
    /* 20 */ { sec: 'mother', chord: 'E',  drums: 'rush2' },
    /* 21 */ { sec: 'loop2',  chord: 'F',  drums: 'build' },
    /* 22 */ { sec: 'board',  chord: 'Bm', drums: 'mainc' },
    /* 23 */ { sec: 'board',  chord: 'G',  drums: 'main' },
    /* 24 */ { sec: 'board',  chord: 'A',  drums: 'fill' },
    /* 25 */ { sec: 'fanfare', chord: 'D', drums: 'mainc' },
    /* 26 */ { sec: 'outro',  chord: 'G',  drums: 'mainc' },
    /* 27 */ { sec: 'outro',  chord: 'A',  drums: 'main' },
    /* 28 */ { sec: 'outro',  chord: 'Bm', drums: 'fill' },
    /* 29 */ { sec: 'end',    chord: 'B',  drums: 'end' },
  ];

  // Dramatiske nøgletider (sekunder)
  const CUES = {
    DEATH: 12 * BAR + 1.5 * BEAT,   // 19,8 — skibet rammes: musikken klipper
    COIN: 13 * BAR,                 // 20,8 — INSERT COIN
    RESUME: 14 * BAR,               // 22,4 — OVERDRIVE: musikken slår ind igen
    KILL: 20 * BAR + 2 * BEAT,      // 32,8 — moderskibet sprænges (tape-stop)
    LOOP2: 21 * BAR,                // 33,6
    END: BARS * BAR,                // 48,0
  };

  // Alle trommeslag som {t, kind} — bruges til beat-synkrone billedeffekter
  function hits() {
    const out = [];
    BARMAP.forEach((b, bar) => {
      const pat = DRUMS[b.drums] || {};
      for (const kind of Object.keys(pat)) {
        [...pat[kind]].forEach((ch, i) => {
          if (ch === 'x') out.push({ t: bar * BAR + i * STEP, kind });
        });
      }
    });
    return out
      .filter((h) => !(h.t > CUES.DEATH && h.t < CUES.RESUME - BEAT))   // stilhed efter "døden"
      .filter((h) => !(h.t > CUES.KILL && h.t < CUES.LOOP2))            // tape-stop
      .sort((a, b) => a.t - b.t);
  }

  root.PROMO_SCORE = { BPM, BEAT, BAR, STEP, BARS, DRUMS, BARMAP, CUES, hits, LENGTH: BARS * BAR };
})(typeof window !== 'undefined' ? window : globalThis);
