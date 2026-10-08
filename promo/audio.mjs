/* =====================================================
   NEON BREACH — promo-film: 8-BIT LYD
   Offline chiptune-synth (ingen dependencies):
     - pulsbølger med duty-cycle (12,5 / 25 / 50 %), polyBLEP
     - NES-agtig 4-bit "trappe"-trekant til bassen
     - LFSR-støj (lang/kort tilstand) til trommer og effekter
     - ekko + lille rum, blød limiter
   Originalt soundtrack komponeret til tidslinjen i score.js
   + spillets EGNE lydeffekter (samme opskrifter som Sfx i
   game.js), lagt præcis hvor de skete i optagelsen.

   Standalone:  node promo/audio.mjs events.json out.wav
   ===================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const TAU = Math.PI * 2;

export function loadScore() {
  const box = {};
  box.globalThis = box;
  vm.runInNewContext(fs.readFileSync(path.join(here, 'score.js'), 'utf8'), box);
  return box.PROMO_SCORE;
}

/* ---------------- Grundbyggesten ---------------- */
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const nm = (s) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(s); return NOTE[m[1]] + (Number(m[2]) + 1) * 12; };

// deterministisk støj (samme lyd hver gang filmen renderes)
let seed = 0x2545f491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296); };

const blep = (t, dt) => {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
};
const NES_TRI = Array.from({ length: 32 }, (_, i) => ((i < 16 ? 15 - i : i - 16) / 7.5) - 1);

class Bus {
  constructor(n) { this.L = new Float32Array(n); this.R = new Float32Array(n); this.n = n; }
}

/* Én stemme: oscillator × envelope → bus (+ send til ekko/rum).
   o.freq: Hz eller fn(tt)  · o.wave: pulse|saw|tri|nes|sine|noise
   o.a/o.d/o.s/o.r: ADSR · o.vib: {depth, rate, delay} · o.q: 4-bit volumentrin */
function voice(bus, t0, dur, o, sends) {
  const i0 = Math.round(t0 * SR);
  const rel = o.r ?? 0.03;
  const len = Math.round((dur + rel) * SR);
  const vol = o.vol ?? 0.2;
  const pan = o.pan ?? 0;
  const gl = Math.min(1, 1 - pan), gr = Math.min(1, 1 + pan);
  const a = o.a ?? 0.004, d = o.d ?? 0.08, s = o.s ?? 0.7;
  const duty = o.duty ?? 0.5;
  let ph = o.phase ?? 0;
  let lfsr = 1, acc = 0, lp = 0;
  const lpa = o.lp ? 1 - Math.exp(-TAU * o.lp / SR) : 0;
  const hpa = o.hp ? 1 - Math.exp(-TAU * o.hp / SR) : 0;
  let hpz = 0;
  for (let k = 0; k < len; k++) {
    const i = i0 + k;
    if (i < 0) continue;
    if (i >= bus.n) break;
    const tt = k / SR;
    let f = typeof o.freq === 'function' ? o.freq(tt) : o.freq;
    if (o.vib && tt > o.vib.delay) f *= Math.pow(2, (o.vib.depth / 12) * Math.sin(TAU * o.vib.rate * (tt - o.vib.delay)));
    // envelope
    let env;
    if (tt < a) env = tt / a;
    else if (tt < a + d) env = 1 - (1 - s) * ((tt - a) / d);
    else env = s;
    if (o.decay) env *= Math.exp(-tt / o.decay);
    if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / rel);
    if (o.q) { const qt = Math.floor(tt * 240) / 240; void qt; env = Math.round(env * 15) / 15; }
    let v;
    const dt = f / SR;
    switch (o.wave) {
      case 'pulse': {
        v = ph < duty ? 1 : -1;
        v += blep(ph, dt);
        v -= blep((ph - duty + 1) % 1, dt);
        break;
      }
      case 'saw': v = 2 * ph - 1 - blep(ph, dt); break;
      case 'tri': v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 'nes': v = NES_TRI[Math.floor(ph * 32) & 31]; break;
      case 'sine': v = Math.sin(TAU * ph); break;
      case 'noise': {
        acc += f / SR;
        while (acc >= 1) {
          acc -= 1;
          const bit = (lfsr ^ (lfsr >> (o.short ? 6 : 1))) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
        }
        v = lfsr & 1 ? 1 : -1;
        break;
      }
      default: v = 0;
    }
    ph += dt;
    if (ph >= 1) ph -= Math.floor(ph);
    if (lpa) { lp += lpa * (v - lp); v = lp; }
    if (hpa) { hpz += hpa * (v - hpz); v -= hpz; }
    const out = v * env * vol;
    bus.L[i] += out * gl;
    bus.R[i] += out * gr;
    if (sends) {
      if (o.rev) sends.rev[i] += out * o.rev;
      if (o.dly) sends.dly[i] += out * o.dly;
    }
  }
}

/* ---------------- Trommer (chip-stil) ---------------- */
const DRUM = {
  k: (b, t, s) => {
    voice(b, t, 0.22, { wave: 'sine', freq: (tt) => 45 + 120 * Math.exp(-tt / 0.03), vol: 0.95, a: 0.001, d: 0.001, s: 1, decay: 0.12, r: 0.02 }, s);
    voice(b, t, 0.012, { wave: 'noise', freq: 30000, vol: 0.25, a: 0.0005, s: 1, decay: 0.004, r: 0.005 }, s);
  },
  s: (b, t, s) => {
    voice(b, t, 0.18, { wave: 'noise', freq: 12000, vol: 0.42, a: 0.001, s: 1, decay: 0.07, r: 0.03, hp: 600, rev: 0.25 }, s);
    voice(b, t, 0.08, { wave: 'pulse', duty: 0.5, freq: (tt) => 200 * Math.exp(-tt / 0.08), vol: 0.22, a: 0.001, s: 1, decay: 0.04, r: 0.01 }, s);
  },
  h: (b, t, s) => voice(b, t, 0.03, { wave: 'noise', short: true, freq: 42000, vol: 0.09, a: 0.0005, s: 1, decay: 0.012, r: 0.01, hp: 5000, pan: 0.25 }, s),
  o: (b, t, s) => voice(b, t, 0.16, { wave: 'noise', short: true, freq: 38000, vol: 0.08, a: 0.001, s: 1, decay: 0.07, r: 0.04, hp: 4000, pan: 0.25 }, s),
  c: (b, t, s) => {
    voice(b, t, 1.3, { wave: 'noise', freq: 30000, vol: 0.2, a: 0.001, s: 1, decay: 0.45, r: 0.2, hp: 2500, pan: -0.15, rev: 0.4 }, s);
    voice(b, t, 1.0, { wave: 'noise', short: true, freq: 26000, vol: 0.06, a: 0.001, s: 1, decay: 0.3, r: 0.2, hp: 3000, pan: 0.2 }, s);
  },
  t: (b, t, s) => voice(b, t, 0.3, { wave: 'nes', freq: (tt) => 70 + 90 * Math.exp(-tt / 0.06), vol: 0.5, a: 0.001, s: 1, decay: 0.16, r: 0.05, rev: 0.2 }, s),
};

/* ---------------- Akkorder ---------------- */
const CH = {
  Am: { root: 45, tones: [57, 60, 64] }, F: { root: 41, tones: [57, 60, 65] }, C: { root: 48, tones: [55, 60, 64] },
  G: { root: 43, tones: [55, 59, 62] }, E: { root: 40, tones: [56, 59, 64] }, A5: { root: 45, tones: [57, 64, 69] },
  Bb: { root: 46, tones: [58, 62, 65] }, Dm: { root: 50, tones: [57, 62, 65] }, Bm: { root: 47, tones: [59, 62, 66] },
  A: { root: 45, tones: [57, 61, 64] }, D: { root: 50, tones: [57, 62, 66] }, B: { root: 47, tones: [59, 63, 66] },
};

/* ---------------- Melodier (trin, længde i 16.-dele, tone) ---------------- */
const L = (arr) => arr.map(([st, ln, n]) => [st, ln, nm(n)]);
const LEAD = {
  2: L([[0, 3, 'E5'], [3, 1, 'E5'], [4, 2, 'D5'], [6, 2, 'C5'], [8, 2, 'B4'], [10, 4, 'C5'], [14, 2, 'A4']]),
  3: L([[0, 2, 'A4'], [2, 2, 'C5'], [4, 4, 'F5'], [8, 2, 'E5'], [10, 2, 'C5'], [12, 4, 'A4']]),
  4: L([[0, 2, 'G4'], [2, 2, 'C5'], [4, 4, 'E5'], [8, 3, 'G5'], [11, 1, 'F5'], [12, 2, 'E5'], [14, 2, 'D5']]),
  5: L([[0, 6, 'D5'], [6, 2, 'B4'], [8, 4, 'G4'], [12, 2, 'B4'], [14, 2, 'D5']]),
  6: L([[0, 3, 'E5'], [3, 1, 'E5'], [4, 2, 'D5'], [6, 2, 'C5'], [8, 2, 'B4'], [10, 2, 'C5'], [12, 2, 'E5'], [14, 2, 'A5']]),
  7: L([[0, 4, 'A5'], [4, 2, 'G5'], [6, 2, 'F5'], [8, 2, 'E5'], [10, 2, 'F5'], [12, 4, 'C5']]),
  8: L([[0, 2, 'D5'], [2, 2, 'G5'], [4, 4, 'B5'], [8, 2, 'A5'], [10, 2, 'G5'], [12, 4, 'D5']]),
  9: L([[0, 4, 'G#5'], [4, 2, 'F#5'], [6, 2, 'E5'], [8, 4, 'B4'], [12, 4, 'G#4']]),
  10: L([[0, 8, 'C6'], [8, 8, 'A5']]),
  11: L(['G4', 'B4', 'D5', 'G5', 'B4', 'D5', 'G5', 'B5', 'D5', 'G5', 'B5', 'D6', 'G5', 'B5', 'D6', 'G6'].map((n, i) => [i, 1, n])),
  12: L([[0, 2, 'E6'], [2, 2, 'D6'], [4, 2, 'C6'], [6, 2, 'B5']]),
  14: L([[0, 3, 'E5'], [3, 1, 'E5'], [4, 2, 'D5'], [6, 2, 'C5'], [8, 2, 'B4'], [10, 4, 'C5'], [14, 2, 'A4']]),
  15: L([[0, 2, 'A4'], [2, 2, 'C5'], [4, 4, 'F5'], [8, 2, 'E5'], [10, 2, 'C5'], [12, 4, 'A4']]),
  17: L([[0, 2, 'A4'], [2, 2, 'C5'], [4, 2, 'A4'], [6, 2, 'E5'], [8, 2, 'D5'], [10, 2, 'C5'], [12, 2, 'B4'], [14, 2, 'C5']]),
  18: L([[0, 2, 'Bb4'], [2, 2, 'D5'], [4, 2, 'Bb4'], [6, 2, 'F5'], [8, 2, 'E5'], [10, 2, 'D5'], [12, 2, 'C5'], [14, 2, 'D5']]),
  19: L([[0, 4, 'D5'], [4, 4, 'F5'], [8, 4, 'A5'], [12, 4, 'D6']]),
  20: L([[0, 4, 'G#5'], [4, 4, 'B5'], [8, 8, 'E6']]),
  21: L([[0, 6, 'F5'], [8, 6, 'G5'], [14, 2, 'B5']]),
  22: L([[0, 3, 'F#5'], [3, 1, 'F#5'], [4, 2, 'E5'], [6, 2, 'D5'], [8, 2, 'C#5'], [10, 4, 'D5'], [14, 2, 'B4']]),
  23: L([[0, 2, 'B4'], [2, 2, 'D5'], [4, 4, 'G5'], [8, 2, 'F#5'], [10, 2, 'D5'], [12, 4, 'B4']]),
  24: L([[0, 2, 'A4'], [2, 2, 'C#5'], [4, 4, 'E5'], [8, 3, 'A5'], [11, 1, 'G5'], [12, 2, 'F#5'], [14, 2, 'E5']]),
  25: L([[0, 1, 'A5'], [1, 1, 'D6'], [2, 4, 'F#6'], [6, 2, 'E6'], [8, 4, 'D6'], [12, 2, 'A5'], [14, 2, 'B5']]),
  26: L([[0, 4, 'B5'], [4, 2, 'A5'], [6, 2, 'G5'], [8, 2, 'F#5'], [10, 2, 'G5'], [12, 4, 'D5']]),
  27: L([[0, 2, 'E5'], [2, 2, 'A5'], [4, 4, 'C#6'], [8, 2, 'B5'], [10, 2, 'A5'], [12, 4, 'E5']]),
  28: L([[0, 4, 'D6'], [4, 2, 'C#6'], [6, 2, 'B5'], [8, 2, 'A5'], [10, 2, 'B5'], [12, 4, 'F#5']]),
  29: L([[0, 16, 'B5']]),
};

// Sektion → instrumentering
const STYLE = {
  hook:    { bass: 'hook', arp: 'hook', pad: true },
  themeA:  { bass: 'oct8', arp: 'up16', lead: 1 },
  graze:   { bass: 'pedal', arp: 'sparkle', pad: true, lead: 1 },
  combo:   { bass: 'drive16', arp: 'up16', lead: 0.9 },
  death:   { bass: 'drive16', arp: 'up16', lead: 1 },
  rewind:  { riser: [3, 4] },
  od:      { bass: 'oct8', arp: 'up16', lead: 1, double: true },
  warn:    { bass: 'pedal16', alarm: true },
  rush:    { bass: 'gallop', arp: 'power', lead: 1 },
  mother:  { bass: 'gallop', arp: 'power', lead: 1, double: true },
  loop2:   { bass: 'drive16', arp: 'rise', lead: 1, riser: [0, 4] },
  board:   { bass: 'oct8', arp: 'up16', lead: 1, pad: true },
  fanfare: { bass: 'oct8', arp: 'up16', lead: 1, double: true, pad: true },
  outro:   { bass: 'oct8', arp: 'up16', lead: 1, pad: true },
  end:     { bass: 'hold', pad: true, lead: 1 },
};

/* ---------------- Musikken ---------------- */
function composeMusic(SC, stems, sends) {
  const { drums, bass, lead: leadBus, arp, pad, fx } = stems;
  const { BAR, STEP, BARMAP, DRUMS } = SC;
  BARMAP.forEach((bm, bar) => {
    const tb = bar * BAR;
    const st = STYLE[bm.sec] || {};
    const ch = CH[bm.chord];
    const at = (step) => tb + step * STEP;

    // trommer
    const pat = DRUMS[bm.drums] || {};
    for (const kind of Object.keys(pat)) {
      [...pat[kind]].forEach((c, i) => { if (c === 'x') DRUM[kind](drums, at(i), sends); });
    }

    // bas: trekant (sub) + smal puls (så den kan høres i en telefon)
    const bassNote = (t, len, m, v = 1) => {
      voice(bass, t, len, { wave: 'nes', freq: mtof(m), vol: 0.34 * v, a: 0.003, d: 0.05, s: 0.85, r: 0.025 }, sends);
      voice(bass, t, len, { wave: 'pulse', duty: 0.125, freq: mtof(m + 12), vol: 0.07 * v, a: 0.003, d: 0.06, s: 0.6, r: 0.02, lp: 2400 }, sends);
    };
    const r = ch.root;
    switch (st.bass) {
      case 'hook':
        if (bar === 1) for (let i = 0; i < 16; i++) bassNote(at(i), STEP * 0.8, r - 12, 0.35 + 0.65 * (i / 15));
        break;
      case 'oct8':
        for (let i = 0; i < 16; i += 2) bassNote(at(i), STEP * 1.7, i % 4 === 0 ? r - 12 : r);
        break;
      case 'drive16':
        for (let i = 0; i < 16; i++) bassNote(at(i), STEP * 0.8, i % 4 === 2 ? r : r - 12, i % 4 === 0 ? 1 : 0.8);
        break;
      case 'gallop':
        for (let i = 0; i < 16; i++) bassNote(at(i), STEP * 0.75, i % 4 === 3 ? r : r - 12, i % 4 === 0 ? 1 : 0.75);
        break;
      case 'pedal':
        bassNote(at(0), STEP * 7.5, r - 12); bassNote(at(8), STEP * 7.5, r - 12, 0.9);
        break;
      case 'pedal16':
        for (let i = 0; i < 16; i++) bassNote(at(i), STEP * 0.6, r - 12, 0.55 + (i % 4 === 0 ? 0.45 : 0));
        break;
      case 'hold':
        bassNote(at(0), BAR * 0.95, r - 12);
        break;
    }

    // arpeggio (puls 25 %, skiftevis venstre/højre)
    const tones = ch.tones;
    const six = [...tones, ...tones.map((x) => x + 12)];
    const arpNote = (i, m, v = 1, len = STEP * 0.85) =>
      voice(arp, at(i), len, { wave: 'pulse', duty: 0.25, freq: mtof(m), vol: 0.065 * v, a: 0.002, d: 0.05, s: 0.45, r: 0.03, pan: i % 2 ? 0.35 : -0.35, q: true, dly: 0.25 }, sends);
    switch (st.arp) {
      case 'hook': {
        const seq = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
        for (let i = 0; i < 16; i++) arpNote(i, six[seq[i]] + 12, (bar === 0 ? 0.35 + 0.35 * i / 15 : 0.7 + 0.3 * i / 15));
        break;
      }
      case 'up16': {
        const seq = [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 4, 3];
        for (let i = 0; i < 16; i++) arpNote(i, six[seq[i]] + 12, 0.9);
        break;
      }
      case 'sparkle':
        for (let i = 0; i < 32; i++) {
          voice(arp, tb + i * STEP / 2, STEP * 0.4, { wave: 'pulse', duty: 0.125, freq: mtof(six[(i * 2) % 6] + 24), vol: 0.035, a: 0.001, s: 0.3, d: 0.03, r: 0.05, pan: Math.sin(i) * 0.6, dly: 0.5, rev: 0.4 }, sends);
        }
        break;
      case 'power':
        for (let i = 0; i < 16; i++) arpNote(i, (i % 2 ? tones[0] + 7 : tones[0]) + (i % 8 >= 4 ? 12 : 0), 1.1, STEP * 0.6);
        break;
      case 'rise':
        for (let i = 0; i < 16; i++) arpNote(i, six[i % 6] + 12 + Math.floor(i / 6) * 12, 0.6 + 0.6 * i / 15, STEP * 0.7);
        break;
    }

    // chip-akkord ("hurtig-arp" på ~50 Hz) som pad
    if (st.pad) {
      const dur = bar === 29 ? BAR * 0.98 : BAR;
      const cyc = 1 / 50;
      voice(pad, tb, dur, {
        wave: 'pulse', duty: 0.5, vol: bar === 29 ? 0.055 : 0.04, a: 0.04, d: 0.2, s: 0.8, r: 0.12, rev: 0.35,
        freq: (tt) => mtof(tones[Math.floor(tt / cyc) % 3] + 12), lp: 3200,
      }, sends);
    }

    // lead: puls 25 % med forsinket vibrato + ekko
    const lead = LEAD[bar];
    if (lead && st.lead) {
      for (const [s0, ln, m] of lead) {
        const len = ln * STEP;
        const o = { wave: 'pulse', duty: 0.25, freq: mtof(m), vol: 0.15 * st.lead, a: 0.004, d: 0.12, s: 0.75, r: 0.05,
          vib: len > 0.25 ? { depth: 0.28, rate: 6, delay: 0.16 } : null, q: true, dly: 0.35, rev: 0.18 };
        if (bar === 29) Object.assign(o, { d: 0.6, s: 0.6, r: 0.4 });
        voice(leadBus, at(s0), len * 0.95, o, sends);
        if (st.double) voice(leadBus, at(s0), len * 0.95, Object.assign({}, o, { duty: 0.125, freq: mtof(m - 12), vol: 0.07, vib: null, pan: 0.2 }), sends);
      }
    }

    // ALARM (WARNING): klassisk to-tonet skydespils-sirene
    if (st.alarm) {
      for (let i = 0; i < 8; i++) {
        voice(fx, at(i * 2), STEP * 1.9, { wave: 'pulse', duty: 0.5, freq: i % 2 ? 622 : 830, vol: 0.075, a: 0.005, s: 1, r: 0.01, rev: 0.25, lp: 3500 }, sends);
      }
    }

    // riser: støj-sweep + stigende puls
    if (st.riser) {
      const [b0, b1] = st.riser;
      const t0 = tb + b0 * SC.BEAT, len = (b1 - b0) * SC.BEAT;
      voice(fx, t0, len, { wave: 'noise', freq: (tt) => 3000 + 30000 * Math.pow(tt / len, 2), vol: 0.13, a: len * 0.9, d: 0.01, s: 1, r: 0.01, hp: 800, rev: 0.3 }, sends);
      voice(fx, t0, len, { wave: 'pulse', duty: 0.25, freq: (tt) => 220 * Math.pow(4, tt / len), vol: 0.06, a: len * 0.8, s: 1, r: 0.01, q: true }, sends);
    }
  });

  // hook-riser ind i faldet (takt 1, slag 3-4)
  voice(fx, 2.4, 0.8, { wave: 'noise', freq: (tt) => 2500 + 32000 * Math.pow(tt / 0.8, 2), vol: 0.14, a: 0.7, s: 1, r: 0.01, hp: 900, rev: 0.3 }, sends);
  voice(fx, 2.4, 0.8, { wave: 'pulse', duty: 0.25, freq: (tt) => 110 * Math.pow(8, tt / 0.8), vol: 0.06, a: 0.6, s: 1, r: 0.01 }, sends);
}

/* ---------------- Effekt-busser ---------------- */
function applyDelay(bus, send, time, fb, wet) {
  const D = Math.round(time * SR);
  const y = new Float32Array(send.length);
  for (let i = 0; i < send.length; i++) y[i] = send[i] + (i >= D ? fb * y[i - D] : 0);
  for (let i = 0; i < send.length; i++) {
    if (i >= D) bus.L[i] += wet * y[i - D];
    if (i >= 2 * D) bus.R[i] += wet * 0.8 * y[i - 2 * D];
  }
}

function applyReverb(bus, send, wet) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => Math.round(n * SR / 44100));
  const aps = [556, 441].map((n) => Math.round(n * SR / 44100));
  for (const [side, off] of [['L', 0], ['R', 23]]) {
    const out = new Float32Array(send.length);
    for (const c0 of combs) {
      const c = c0 + off;
      const buf = new Float32Array(c); let idx = 0, filt = 0;
      for (let i = 0; i < send.length; i++) {
        const o = buf[idx];
        filt = o * 0.6 + filt * 0.4;
        buf[idx] = send[i] + filt * 0.8;
        idx = (idx + 1) % c;
        out[i] += o;
      }
    }
    for (const a0 of aps) {
      const a = a0 + off;
      const buf = new Float32Array(a); let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const bo = buf[idx];
        const x = out[i];
        buf[idx] = x + bo * 0.5;
        out[i] = bo - x * 0.5;
        idx = (idx + 1) % a;
      }
    }
    const ch = bus[side];
    for (let i = 0; i < out.length; i++) ch[i] += wet * out[i] / combs.length;
  }
}

// "tape stop": musikken bremser ned til stilstand (pitch falder), derefter stilhed
function tapeStop(bus, tStop, dur, tResume) {
  const i0 = Math.round(tStop * SR), n = Math.round(dur * SR), i2 = Math.round(tResume * SR);
  for (const side of ['L', 'R']) {
    const src = bus[side].slice(i0, i0 + n);
    const ch = bus[side];
    let pos = 0;
    for (let k = 0; k < n && i0 + k < ch.length; k++) {
      const rate = Math.pow(1 - k / n, 1.6);
      const p = Math.floor(pos), fr = pos - p;
      const v = p + 1 < src.length ? src[p] * (1 - fr) + src[p + 1] * fr : 0;
      ch[i0 + k] = v * (1 - Math.pow(k / n, 3));
      pos += rate;
    }
    for (let i = i0 + n; i < Math.min(i2, ch.length); i++) ch[i] = 0;
  }
}

/* ---------------- Spillets egne lydeffekter (samme opskrifter som Sfx i game.js) ---------------- */
function biquadLP(x, fc, q) {
  const w0 = TAU * fc / SR, al = Math.sin(w0) / (2 * q), cw = Math.cos(w0);
  const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = (1 - cw) / 2, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}

function gameTone(bus, t0, freq, dur, type, vol, slideTo, f = 1, pan = 0) {
  const wave = type === 'sawtooth' ? 'saw' : type === 'triangle' ? 'tri' : type === 'sine' ? 'sine' : 'pulse';
  const d = dur / f;
  const f0 = freq * f, f1 = slideTo ? Math.max(20, slideTo) * f : null;
  voice(bus, t0, d + 0.02, {
    wave, duty: 0.5, vol: vol * 0.5, a: 0.0005, d: 0.0001, s: 1, r: 0.004, pan,
    freq: f1 ? (tt) => f0 * Math.pow(f1 / f0, Math.min(1, tt / d)) : f0,
    decay: d / Math.log(vol / 0.0001),
  });
}

function gameNoise(bus, t0, dur, vol, lp, f = 1, pan = 0) {
  const d = dur / f;
  const n = Math.max(1, Math.floor(SR * d));
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * (1 - i / n);
  biquadLP(x, Math.min(lp * f, SR * 0.45), 1.122);
  const i0 = Math.round(t0 * SR);
  const k = Math.log(vol / 0.0001) / d;
  const gl = Math.min(1, 1 - pan), gr = Math.min(1, 1 + pan);
  for (let i = 0; i < n && i0 + i < bus.n; i++) {
    if (i0 + i < 0) continue;
    const v = x[i] * vol * 0.5 * Math.exp(-k * (i / SR));
    bus.L[i0 + i] += v * gl; bus.R[i0 + i] += v * gr;
  }
}

const GAME = {
  shoot: (b, t, f) => gameTone(b, t, 880, 0.08, 'square', 0.07, 220, f),
  laserHum: (b, t, f) => gameTone(b, t, 160, 0.1, 'sawtooth', 0.05, 150, f),
  explode: (b, t, f) => { gameNoise(b, t, 0.3, 0.3, 1400, f); gameTone(b, t, 110, 0.25, 'sawtooth', 0.12, 40, f); },
  bigBoom: (b, t, f) => { gameNoise(b, t, 0.7, 0.45, 900, f); gameTone(b, t, 70, 0.6, 'sawtooth', 0.2, 30, f); },
  hit: (b, t, f) => { gameNoise(b, t, 0.18, 0.3, 3000, f); gameTone(b, t, 200, 0.3, 'square', 0.15, 60, f); },
  power: (b, t, f) => [523, 659, 784, 1047].forEach((fr, i) => gameTone(b, t + i * 0.07, fr, 0.12, 'square', 0.12, null, f)),
  graze: (b, t, f) => gameTone(b, t, 1500, 0.04, 'square', 0.05, 1900, f),
  odGo: (b, t, f) => { gameTone(b, t, 180, 0.5, 'sawtooth', 0.18, 900, f); [659, 784, 988, 1319].forEach((fr, i) => gameTone(b, t + 0.1 + i * 0.08, fr, 0.14, 'square', 0.12, null, f)); },
  waveIn: (b, t, f) => { gameTone(b, t, 330, 0.12, 'square', 0.1, null, f); gameTone(b, t + 0.13, 440, 0.18, 'square', 0.1, null, f); },
  bossIn: (b, t, f) => [98, 98, 130].forEach((fr, i) => gameTone(b, t + i * 0.32, fr, 0.3, 'sawtooth', 0.2, null, f)),
  over: (b, t, f) => [392, 311, 262, 196].forEach((fr, i) => gameTone(b, t + i * 0.26, fr, 0.35, 'triangle', 0.16, null, f)),
};

/* ---------------- Trailer-effekter (overgange, tekst, mønt …) ---------------- */
const blip = (b, t, fr, len, vol, duty = 0.5, pan = 0) => voice(b, t, len, { wave: 'pulse', duty, freq: fr, vol, a: 0.001, d: 0.02, s: 0.7, r: 0.02, pan, q: true });
const FX = {
  crtOn: (b, t) => {
    voice(b, t, 0.2, { wave: 'sine', freq: (tt) => 40 + 50 * Math.exp(-tt / 0.05), vol: 0.6, a: 0.001, s: 1, decay: 0.1 });
    voice(b, t, 0.35, { wave: 'noise', freq: 24000, vol: 0.14, a: 0.002, s: 1, decay: 0.12, hp: 1500 });
    voice(b, t + 0.02, 0.6, { wave: 'sine', freq: (tt) => 6000 + 9000 * Math.min(1, tt / 0.3), vol: 0.012, a: 0.05, s: 1, decay: 0.3 });
  },
  crtOff: (b, t) => {
    voice(b, t, 0.5, { wave: 'pulse', duty: 0.5, freq: (tt) => 1400 * Math.exp(-tt / 0.1) + 40, vol: 0.12, a: 0.001, s: 1, decay: 0.2 });
    voice(b, t, 0.3, { wave: 'noise', freq: 20000, vol: 0.12, a: 0.001, s: 1, decay: 0.08, hp: 800 });
    voice(b, t + 0.55, 0.02, { wave: 'noise', freq: 30000, vol: 0.3, a: 0.0005, s: 1, decay: 0.006 });
  },
  type: (b, t) => { blip(b, t, 1760, 0.012, 0.05, 0.5, 0.1); voice(b, t, 0.01, { wave: 'noise', short: true, freq: 30000, vol: 0.05, s: 1, decay: 0.004 }); },
  slam: (b, t) => {
    voice(b, t, 0.3, { wave: 'sine', freq: (tt) => 42 + 110 * Math.exp(-tt / 0.04), vol: 0.75, a: 0.001, s: 1, decay: 0.14 });
    voice(b, t, 0.25, { wave: 'noise', freq: 9000, vol: 0.22, a: 0.001, s: 1, decay: 0.07, lp: 4000 });
    voice(b, t, 0.18, { wave: 'pulse', duty: 0.25, freq: (tt) => 330 * Math.exp(-tt / 0.08), vol: 0.08, a: 0.001, s: 1, decay: 0.06 });
  },
  logo: (b, t) => {
    FX.slam(b, t);
    [0, 1, 2, 3, 4, 5].forEach((k) => blip(b, t + 0.04 + k * 0.035, mtof([81, 84, 88, 93, 96, 100][k]), 0.05, 0.05, 0.125, k % 2 ? 0.4 : -0.4));
    voice(b, t, 1.2, { wave: 'noise', freq: 28000, vol: 0.07, a: 0.01, s: 1, decay: 0.4, hp: 5000, rev: 0 });
  },
  boss: (b, t) => {
    FX.slam(b, t);
    voice(b, t, 0.35, { wave: 'saw', freq: 98, vol: 0.1, a: 0.002, s: 1, decay: 0.2, lp: 1500 });
  },
  whoosh: (b, t, d = 0.35) => voice(b, t, d, { wave: 'noise', freq: (tt) => 4000 + 26000 * Math.sin(Math.PI * Math.min(1, tt / d)), vol: 0.14, a: d * 0.45, d: d * 0.5, s: 0, r: 0.02, hp: 700, lp: 9000 }),
  card: (b, t) => { FX.whoosh(b, t, 0.22); blip(b, t, 660, 0.04, 0.05); blip(b, t + 0.045, 990, 0.06, 0.05); },
  select: (b, t) => { blip(b, t, 880, 0.05, 0.07); blip(b, t + 0.06, 1320, 0.09, 0.07); },
  tick: (b, t) => blip(b, t, 1046, 0.08, 0.07),
  coin: (b, t) => { blip(b, t, 988, 0.07, 0.11); voice(b, t + 0.075, 0.35, { wave: 'pulse', duty: 0.5, freq: 1319, vol: 0.11, a: 0.001, s: 1, decay: 0.16, q: true }); },
  click: (b, t) => { voice(b, t, 0.01, { wave: 'noise', freq: 30000, vol: 0.25, s: 1, decay: 0.004 }); voice(b, t, 0.06, { wave: 'sine', freq: 90, vol: 0.4, s: 1, decay: 0.03 }); },
  rewind: (b, t, d = 0.9) => {
    // båndspoling: hurtig kvidren op/ned + hvæs
    voice(b, t, d, { wave: 'noise', freq: 16000, vol: 0.06, a: 0.05, s: 1, r: 0.05, hp: 2000, lp: 8000 });
    for (let k = 0; t + k * 0.045 < t + d; k++) {
      const fr = 700 + 900 * (0.5 + 0.5 * Math.sin(k * 1.9)) + (k % 3) * 220;
      voice(b, t + k * 0.045, 0.04, { wave: 'pulse', duty: 0.25, freq: (tt) => fr * (1 + tt * 12), vol: 0.045, a: 0.001, s: 1, r: 0.005 });
    }
  },
  glitch: (b, t, d = 0.18) => {
    for (let k = 0; k < 8; k++) {
      const tk = t + (k / 8) * d;
      if (rnd() < 0.7) voice(b, tk, 0.016, { wave: 'pulse', duty: rnd() < 0.5 ? 0.125 : 0.5, freq: 150 + rnd() * 2200, vol: 0.07, a: 0.0005, s: 1, r: 0.003 });
      else voice(b, tk, 0.018, { wave: 'noise', short: rnd() < 0.5, freq: 8000 + rnd() * 25000, vol: 0.09, s: 1, r: 0.003 });
    }
  },
  bitcrush: (b, t, d = 0.3) => {
    for (let k = 0; k < 8; k++) blip(b, t + k * d / 8, 1600 / Math.pow(1.35, k < 4 ? k : 8 - k), d / 9, 0.055, 0.125, k % 2 ? 0.3 : -0.3);
  },
  sweep: (b, t, d = 0.36) => { for (let k = 0; k < 10; k++) blip(b, t + k * d / 10, mtof(64 + k * 3), d / 11, 0.045, 0.25, (k % 3 - 1) * 0.4); },
  zoom: (b, t, d = 0.44) => {
    voice(b, t, d * 0.5, { wave: 'pulse', duty: 0.25, freq: (tt) => 200 * Math.pow(12, tt / (d * 0.5)), vol: 0.07, a: d * 0.3, s: 1, r: 0.005 });
    FX.whoosh(b, t, d * 0.5);
    FX.slam(b, t + d * 0.45);
  },
  static: (b, t, d = 0.2) => voice(b, t, d, { wave: 'noise', freq: 30000, vol: 0.13, a: 0.005, d: d * 0.7, s: 0.2, r: 0.04, hp: 1000 }),
  vroll: (b, t, d = 0.36) => { voice(b, t, d, { wave: 'noise', freq: (tt) => 18000 - 14000 * tt / d, vol: 0.1, a: 0.02, s: 1, r: 0.05, hp: 300 }); voice(b, t, d, { wave: 'pulse', duty: 0.5, freq: (tt) => 400 * Math.pow(0.25, tt / d), vol: 0.05, a: 0.02, s: 1, r: 0.03 }); },
  laser: (b, t) => { voice(b, t, 0.35, { wave: 'pulse', duty: 0.25, freq: (tt) => 2400 * Math.exp(-tt / 0.07) + 90, vol: 0.12, a: 0.001, s: 1, decay: 0.18 }); voice(b, t, 0.2, { wave: 'noise', freq: 20000, vol: 0.1, s: 1, decay: 0.06, hp: 1500 }); },
  impact: (b, t) => { FX.slam(b, t + 0.06); voice(b, t, 0.5, { wave: 'noise', freq: 26000, vol: 0.12, a: 0.06, s: 1, decay: 0.2, hp: 1200 }); },
  overtake: (b, t) => { [0, 4, 7, 12].forEach((s, k) => blip(b, t + k * 0.03, mtof(83 + s), 0.035, 0.06, 0.25, 0.2)); },
  highscore: (b, t) => {
    [74, 78, 81, 86, 90, 93, 98].forEach((m, k) => blip(b, t + k * 0.04, mtof(m), 0.05, 0.06, 0.125, k % 2 ? 0.45 : -0.45));
    for (let k = 0; k < 10; k++) blip(b, t + 0.3 + k * 0.05, mtof(k % 2 ? 98 : 102), 0.04, 0.035, 0.125, k % 2 ? 0.5 : -0.5);
  },
  glass: (b, t) => {
    voice(b, t, 0.09, { wave: 'noise', short: true, freq: 34000, vol: 0.09, s: 1, decay: 0.03, hp: 3000, pan: rnd() - 0.5 });
    for (let k = 0; k < 2; k++) blip(b, t + rnd() * 0.04, 2400 + rnd() * 3200, 0.03, 0.025, 0.125, rnd() - 0.5);
  },
  shatter: (b, t) => {
    voice(b, t, 0.7, { wave: 'noise', freq: 30000, vol: 0.2, a: 0.001, s: 1, decay: 0.22, hp: 1500, rev: 0.3 });
    voice(b, t, 0.5, { wave: 'noise', short: true, freq: 36000, vol: 0.1, s: 1, decay: 0.15, hp: 3500 });
    for (let k = 0; k < 14; k++) blip(b, t + rnd() * 0.45, 2000 + rnd() * 4500, 0.03, 0.03, 0.125, rnd() * 1.6 - 0.8);
    voice(b, t, 0.4, { wave: 'sine', freq: (tt) => 40 + 90 * Math.exp(-tt / 0.06), vol: 0.6, s: 1, decay: 0.2 });
  },
};

/* ---------------- Måling ---------------- */
// RMS i dB over de aktive dele (høj-pas 100 Hz ≈ hvad en telefon-højttaler kan gengive)
function loud(bus) {
  const a = 1 - Math.exp(-TAU * 100 / SR);
  let lp = 0, sum = 0, cnt = 0;
  for (let i = 0; i < bus.n; i++) {
    const x = (bus.L[i] + bus.R[i]) * 0.5;
    lp += a * (x - lp);
    const h = x - lp;
    if (Math.abs(x) > 1e-4) { sum += h * h; cnt++; }
  }
  return cnt ? 10 * Math.log10(sum / cnt + 1e-12) : -120;
}

/* ---------------- Render + mix ---------------- */
export async function renderAudio({ events = [], cues = [], out, log = console.log }) {
  const SC = loadScore();
  const N = Math.ceil(SC.LENGTH * SR);
  const music = new Bus(N), sfx = new Bus(N);
  const sends = { rev: new Float32Array(N), dly: new Float32Array(N) };
  const stems = { drums: new Bus(N), bass: new Bus(N), lead: new Bus(N), arp: new Bus(N), pad: new Bus(N), fx: new Bus(N), wet: new Bus(N) };

  composeMusic(SC, stems, sends);
  applyDelay(stems.wet, sends.dly, 3 * SC.STEP, 0.32, 0.32);
  applyReverb(stems.wet, sends.rev, 0.35);
  // stem-balance (dB relativt) — målt med høj-pas ved 100 Hz som grov "hørbarheds"-vægtning
  const GAIN = { drums: 0, bass: -3, lead: 1, arp: -7, pad: -12, fx: -4, wet: -15 };
  const ref = loud(stems.drums);
  for (const [k, b] of Object.entries(stems)) {
    const lv = loud(b);
    const g = lv > -90 ? Math.pow(10, (GAIN[k] - (lv - ref)) / 20) : 1;
    log(`[audio] stem ${k.padEnd(5)} ${lv.toFixed(1)} dB → gain ${(20 * Math.log10(g)).toFixed(1)} dB`);
    for (let i = 0; i < N; i++) { music.L[i] += b.L[i] * g; music.R[i] += b.R[i] * g; }
  }
  const C = SC.CUES;
  tapeStop(music, C.DEATH, 0.32, C.RESUME - SC.BEAT);     // skibet dør: musikken bremser — stilhed — riser
  tapeStop(music, C.KILL, 0.42, C.LOOP2);                  // moderskibet sprænges
  // fade-out under CRT-sluk
  for (const ch of [music.L, music.R]) {
    const a = Math.round((SC.LENGTH - 0.75) * SR);
    for (let i = a; i < N; i++) ch[i] *= Math.max(0, 1 - (i - a) / (0.7 * SR));
  }

  // spillets lyde: begræns tætheden lidt (skud og eksplosioner kommer i byger)
  const last = {};
  const minGap = { shoot: 0.075, explode: 0.06, graze: 0.03, laserHum: 0.09 };
  let used = 0;
  events.sort((a, b) => a.t - b.t);
  for (const ev of events) {
    const f = ev.rate && ev.rate < 0.98 ? 0.45 + 0.55 * ev.rate : 1;   // slow-mo → dybere lyd
    if (ev.kind === 'game') {
      const g = minGap[ev.name] || 0;
      if (g && last[ev.name] != null && ev.t - last[ev.name] < g) continue;
      last[ev.name] = ev.t;
      if (GAME[ev.name]) { GAME[ev.name](sfx, ev.t, f); used++; }
    } else if (ev.kind === 'tone') {
      gameTone(sfx, ev.t, ev.freq, ev.dur, ev.type, ev.vol, ev.slideTo, f); used++;
    } else if (ev.kind === 'noise') {
      gameNoise(sfx, ev.t, ev.dur, ev.vol, ev.lp, f); used++;
    } else if (ev.kind === 'fx' && FX[ev.name]) {
      FX[ev.name](sfx, ev.t, ev.dur); used++;
    }
  }
  for (const c of cues) if (FX[c.name]) { FX[c.name](sfx, c.t, c.dur); used++; }
  log(`[audio] ${used} lyde lagt ind`);

  // mix: musik + effekter → høj-pas → blød limiter → -1 dBFS
  const mixL = new Float32Array(N), mixR = new Float32Array(N);
  const lm = loud(music), ls = loud(sfx);
  const SG = ls > -90 ? Math.pow(10, ((lm - 5) - ls) / 20) : 1;   // effekterne ~5 dB under musikken
  const MG = 1;
  log(`[audio] musik ${lm.toFixed(1)} dB · effekter ${ls.toFixed(1)} dB → effekt-gain ${(20 * Math.log10(SG)).toFixed(1)} dB`);
  let hl = 0, hr = 0;
  const hpa = 1 - Math.exp(-TAU * 28 / SR);
  for (let i = 0; i < N; i++) {
    let l = music.L[i] * MG + sfx.L[i] * SG;
    let r = music.R[i] * MG + sfx.R[i] * SG;
    hl += hpa * (l - hl); hr += hpa * (r - hr);
    mixL[i] = l - hl; mixR[i] = r - hr;
  }
  // niveau: 99,9-percentil → 0,75, så limiteren kun tager de sjældne toppe
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
  {
    const hist = new Uint32Array(2001);
    for (let i = 0; i < N; i += 3) hist[Math.min(2000, Math.round(Math.max(Math.abs(mixL[i]), Math.abs(mixR[i])) / peak * 2000))]++;
    let acc = 0, total = Math.ceil(N / 3), p999 = peak;
    for (let k = 2000; k >= 0; k--) { acc += hist[k]; if (acc > total * 0.001) { p999 = (k / 2000) * peak; break; } }
    const pre = 0.75 / (p999 || 1);
    for (let i = 0; i < N; i++) { mixL[i] *= pre; mixR[i] *= pre; }
    peak *= pre;
  }
  let env = 0;
  const att = Math.exp(-1 / (0.002 * SR)), relc = Math.exp(-1 / (0.12 * SR));
  const thr = 0.6;
  for (let i = 0; i < N; i++) {
    const a = Math.max(Math.abs(mixL[i]), Math.abs(mixR[i]));
    env = a > env ? att * env + (1 - att) * a : relc * env + (1 - relc) * a;
    const g = env > thr ? thr / env : 1;
    mixL[i] = Math.tanh(mixL[i] * g * 1.15);
    mixR[i] = Math.tanh(mixR[i] * g * 1.15);
  }
  let p2 = 0;
  for (let i = 0; i < N; i++) p2 = Math.max(p2, Math.abs(mixL[i]), Math.abs(mixR[i]));
  const norm = 0.89 / (p2 || 1);
  log(`[audio] råt peak ${peak.toFixed(2)} → normaliseret ×${norm.toFixed(2)}`);

  // WAV (16-bit stereo)
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mixL[i] * norm * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mixR[i] * norm * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(out, buf);
  log('[audio] skrevet', out);
}

// standalone: node promo/audio.mjs events.json out.wav
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [evFile, outFile] = process.argv.slice(2);
  const ev = evFile && fs.existsSync(evFile) ? JSON.parse(fs.readFileSync(evFile, 'utf8')) : { events: [], cues: [] };
  await renderAudio({ events: ev.events, cues: ev.cues, out: outFile || 'soundtrack.wav' });
}
