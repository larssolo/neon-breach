/* =====================================================
   NEON BREACH — 80s synthwave arcade shooter
   Vanilla JS + Canvas. Ingen dependencies.
   ===================================================== */
'use strict';

/* ---------------- Setup ---------------- */
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const VW = cvs.width;   // 800
const VH = cvs.height;  // 1000
const S  = Math.sqrt(VH / 1000); // visual scale relative to original 800×1000
const G  = 1.45;                  // extra graphics boost for ship/enemies/powerups

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), score: $('hud-score'), hiscore: $('hud-hiscore'),
  wave: $('hud-wave'), lives: $('hud-lives'),
  combo: $('hud-combo'), comboMult: $('combo-mult'), comboFill: $('combo-fill'),
  odWrap: $('od-wrap'), odFill: $('od-fill'), odHint: $('od-hint'), pwStatus: $('pw-status'),
  finalStats: $('final-stats'),
  pressStart: $('press-start'), coinScreen: $('coin-screen'), btnPlay: $('btn-play'),
  ctrlPick: $('ctrl-pick'), btnTilt: $('btn-tilt'),
  btnDrag: $('btn-drag'), ctrlStatus: $('ctrl-status'),
  btnOdMob: $('btn-od-mob'), btnPauseMob: $('btn-pause-mob'),
  menu: $('menu'), menuBoard: $('menu-board'), pause: $('pause'),
  upgrade: $('upgrade'), upgCards: $('upg-cards'), loop: $('hud-loop'),
  gameover: $('gameover'), finalScore: $('final-score'), finalWave: $('final-wave'),
  entry: $('entry'), initials: $('initials'), btnSubmit: $('btn-submit'),
  entryStatus: $('entry-status'), overBoard: $('over-board'), btnRestart: $('btn-restart'),
  playCount: $('play-count'),
};

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

/* ---------------- Lokal storage (guarded) ---------------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

/* ---------------- Lyd (WebAudio, syntetiseret) ---------------- */
const Sfx = {
  ctx: null, muted: false, musicOn: false, step: 0, musicTimer: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(freq, dur, type = 'square', vol = 0.18, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.25, lpFreq = 1800) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lpFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  shoot()   { this.tone(880, 0.08, 'square', 0.07, 220); },
  laserHum(){ this.tone(160, 0.1, 'sawtooth', 0.05, 150); },
  explode() { this.noise(0.3, 0.3, 1400); this.tone(110, 0.25, 'sawtooth', 0.12, 40); },
  bigBoom() { this.noise(0.7, 0.45, 900); this.tone(70, 0.6, 'sawtooth', 0.2, 30); },
  hit()     { this.noise(0.18, 0.3, 3000); this.tone(200, 0.3, 'square', 0.15, 60); },
  power()   { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.12), i * 70)); },
  graze()   { this.tone(1500, 0.04, 'square', 0.05, 1900); },
  odGo()    { this.tone(180, 0.5, 'sawtooth', 0.18, 900); [659, 784, 988, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.14, 'square', 0.12), 100 + i * 80)); },
  waveIn()  { this.tone(330, 0.12, 'square', 0.1); setTimeout(() => this.tone(440, 0.18, 'square', 0.1), 130); },
  bossIn()  { [98, 98, 130].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.2), i * 320)); },
  over()    { [392, 311, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.16), i * 260)); },
  startMusic() { Music.playGame(); },
  stopMusic()  { Music.stopGame(); },
  toggleMute() {
    this.muted = !this.muted;
    Music.applyMute();
    popup(VW / 2, VH / 2, this.muted ? 'SOUND OFF' : 'SOUND ON', '#8f8ab8');
  },
};

/* ---------------- Music tracks (HTMLAudio) ---------------- */
const Music = {
  start: document.getElementById('audio-start'),
  game:  document.getElementById('audio-game'),
  startVol: 0.6,
  gameVol:  0.5,
  init() {
    [this.start, this.game].forEach(a => {
      if (!a) return;
      a.volume = 0;
      a.addEventListener('error', () => { a._broken = true; });
    });
    this.applyMute();
  },
  applyMute() {
    if (this.start) this.start.muted = Sfx.muted;
    if (this.game)  this.game.muted  = Sfx.muted;
  },
  fade(el, target, ms = 400) {
    if (!el || el._broken) return;
    const start = el.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = start + (target - start) * k;
      if (k < 1) requestAnimationFrame(step);
      else if (target === 0) el.pause();
    };
    if (target > 0 && el.paused) {
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    }
    requestAnimationFrame(step);
  },
  playStart() {
    if (!this.start) return;
    this.fade(this.game, 0, 300);
    this.fade(this.start, this.startVol, 600);
  },
  stopStart() { this.fade(this.start, 0, 300); },
  playGame() {
    if (!this.game) return;
    this.fade(this.start, 0, 300);
    this.fade(this.game, this.gameVol, 600);
  },
  stopGame() { this.fade(this.game, 0, 300); },
};

/* ---------------- Input ---------------- */
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const keys = Object.create(null);
let touchActive = false;
const touch = { x: VW / 2, y: VH - 140 };

/* Tilt-styring (gyroskop)
   - mapper gamma/beta efter skærmens rotation, så det virker i alle orienteringer
   - kalibreres til spillerens naturlige holdevinkel ved hvert spilstart
   - iOS 13+ kræver requestPermission() fra en user-gesture */
let ctrlMode = store.get('nb_ctrl') || 'drag';   // 'tilt' | 'drag'
const tilt = { enabled: false, rawX: 0, rawY: 0, x0: 0, y0: 0, gx: 0, gy: 0 };

function onOrient(e) {
  if (e.gamma == null || e.beta == null) return;
  const ang = (screen.orientation && screen.orientation.angle) || 0;
  let mx, my;
  if (ang === 90)       { mx = e.beta;  my = -e.gamma; }
  else if (ang === -90 || ang === 270) { mx = -e.beta; my = e.gamma; }
  else if (ang === 180) { mx = -e.gamma; my = -e.beta; }
  else                  { mx = e.gamma;  my = e.beta; }
  tilt.rawX = mx; tilt.rawY = my;
  tilt.gx = mx - tilt.x0;
  tilt.gy = my - tilt.y0;
}

async function enableTilt() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission(); // iOS-prompt
      if (r !== 'granted') throw new Error('Permission denied');
    }
    if (!tilt.enabled) addEventListener('deviceorientation', onOrient);
    tilt.enabled = true;
    ctrlMode = 'tilt';
    store.set('nb_ctrl', 'tilt');
    return true;
  } catch (err) {
    console.warn('Tilt:', err.message);
    ctrlMode = 'drag';
    return false;
  }
}

function calibrateTilt() { tilt.x0 = tilt.rawX; tilt.y0 = tilt.rawY; tilt.gx = 0; tilt.gy = 0; }

let wakeLock = null;
async function reqWakeLock() {
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ikke understøttet */ }
}

addEventListener('keydown', (e) => {
  if (document.activeElement === ui.initials) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ' && state === 'GAMEOVER' && (scoreSubmitted || ui.entry.classList.contains('hidden'))) startGame();
  if (e.key === 'Shift' && state === 'PLAYING' && !paused) tryOverdrive();
  if (state === 'UPGRADE' && ['1', '2', '3'].includes(e.key)) pickUpgrade(Number(e.key) - 1);
  if (e.key.toLowerCase() === 'p' && state === 'PLAYING') togglePause();
  if (e.key.toLowerCase() === 'm') { Sfx.init(); Sfx.toggleMute(); }
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  touchActive = false;
  if (state === 'PLAYING' && !paused) togglePause();
});

function canvasPos(t) {
  const r = cvs.getBoundingClientRect();
  return { x: (t.clientX - r.left) / r.width * VW, y: (t.clientY - r.top) / r.height * VH };
}
cvs.addEventListener('touchstart', (e) => {
  e.preventDefault(); touchActive = true;
  const p = canvasPos(e.touches[0]); touch.x = p.x; touch.y = p.y;
  if (e.touches.length >= 2 && state === 'PLAYING' && !paused) tryOverdrive();
}, { passive: false });
cvs.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const p = canvasPos(e.touches[0]); touch.x = p.x; touch.y = p.y;
}, { passive: false });
cvs.addEventListener('touchend', (e) => { if (e.touches.length === 0) touchActive = false; });
// INSERT COIN fullscreen — plays music, flies up, reveals menu with START button
function dismissCoinScreen() {
  if (!ui.coinScreen || ui.coinScreen.classList.contains('leaving')) return;
  fetch('/api/plays', { method: 'POST' }).catch(() => {});
  Sfx.init(); Sfx.resume();
  Music.playStart();
  if (navigator.vibrate) navigator.vibrate(40);
  ui.coinScreen.classList.add('leaving');
  setTimeout(() => {
    ui.coinScreen.classList.add('hidden');
    ui.menu.classList.remove('hidden');
  }, 600);
}
ui.coinScreen.addEventListener('click', dismissCoinScreen);
// Keyboard: any key dismisses the coin screen
addEventListener('keydown', (e) => {
  if (!ui.coinScreen.classList.contains('hidden')) { dismissCoinScreen(); }
}, { capture: true });

// START button in menu
ui.btnPlay.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state !== 'MENU') return;
  if (IS_TOUCH) {
    ui.btnPlay.classList.add('hidden');
    ui.ctrlPick.classList.remove('hidden');
  } else {
    startGame();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'PLAYING' && !paused) togglePause();
});

/* ---------------- Game state ---------------- */
let state = 'MENU';        // MENU | PLAYING | UPGRADE | GAMEOVER
let paused = false;
let score = 0;
let hiscore = parseInt(store.get('nb_hiscore') || '0', 10) || 0;
let wave = 0;
let shake = 0;
let hitStop = 0;           // kort frys ved kills ("juice")
let bannerText = '', bannerT = 0;
let scoreSubmitted = false;
let gameTime = 0;

// Overdrive: lades op via grazing og kills, udløses med Shift / 2 fingre
let overdrive = 0;         // 0-100
let odActive = 0;          // sekunder tilbage af aktiv overdrive
// Statistik
let maxCombo = 0, grazes = 0;
let killTimes = [], lastStreakT = -9;

let player = null;
let bullets = [], ebullets = [], enemies = [], powerups = [], particles = [], popups = [];
let combo = 0, comboT = 0;
const COMBO_WINDOW = 2.5;

const spawner = { queue: [], timer: 0, betweenT: 0, bossAlive: false };

/* ---------------- Sektorer (2.0) ---------------- */
const SECTORS = window.SECTORS || [];
const UPGRADE_DEFS = window.UPGRADE_DEFS || [];

function sectorIndex(n = wave) { return Math.floor((Math.max(1, n) - 1) / 5) % SECTORS.length; }
function loopNum(n = wave)     { return Math.floor((Math.max(1, n) - 1) / (5 * SECTORS.length)) + 1; }
function sectorDef(n = wave)   { return SECTORS[sectorIndex(n)]; }
function waveInSector(n = wave){ return ((Math.max(1, n) - 1) % 5) + 1; }

let hazards = [];          // solstorms-flares m.m. (ikke entities)
let respawnQueue = [];     // phoenix-genopstandelser {t, x}
let wallW = 0, wallTarget = 0;   // tunnelvaegge (px pr. side)
let flashT = 0;            // hvid flash ved boss-doed
let upgradeDelay = 0;      // pause mellem boss-doed og upgrade-valg

/* Palette: lerpes mod sektorens farver ved sektorskift */
const PAL = { sky: [26, 5, 51], grid: [255, 43, 214], star: [143, 138, 184], glow: [255, 43, 214] };
let palTarget = SECTORS.length ? SECTORS[0].pal : PAL;
const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
function setPalette(p, instant = false) {
  palTarget = p;
  if (instant) for (const k in PAL) PAL[k] = p[k].slice();
}
function lerpPal(dt) {
  const k = Math.min(1, dt / 1.2);
  for (const key in PAL) {
    const t = palTarget[key], c = PAL[key];
    for (let i = 0; i < 3; i++) c[i] += (t[i] - c[i]) * k;
  }
}

/* ---------------- Baggrund ---------------- */
const stars = Array.from({ length: 110 }, () => ({
  x: rand(0, VW), y: rand(0, VH), z: rand(0.25, 1),
}));
let gridScroll = 0;

/* ---------------- Hjælpere ---------------- */
function popup(x, y, text, color = '#fff', big = false) {
  popups.push({ x, y, text, color, t: big ? 1.3 : 1, big });
}
const MAX_PARTICLES = 480;
function boom(x, y, color, n = 16, force = 220) {
  const count = REDUCED_MOTION ? Math.ceil(n / 2) : n;
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = rand(0, TAU), s = rand(force * 0.25, force);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: rand(0.35, 0.8), color, r: rand(1.5, 3.5) * S });
  }
}
function addShake(m) { if (!REDUCED_MOTION) shake = Math.min(26 * S, shake + m); }
function checkHiscore() {
  if (score > hiscore) { hiscore = score; store.set('nb_hiscore', String(hiscore)); }
}
function quietScore(n) { score += n; checkHiscore(); }
function addScore(base, x, y) {
  const mult = comboMult() * (odActive > 0 ? 2 : 1);
  const pts = base * mult;
  score += pts;
  checkHiscore();
  popup(x, y, '+' + pts + (mult > 1 ? ' x' + mult : ''), mult > 1 ? '#ffb000' : '#e8e6ff');
}
function comboMult() { return Math.min(1 + Math.floor(combo / 5), 8); }
function bumpCombo() { combo++; comboT = COMBO_WINDOW; maxCombo = Math.max(maxCombo, combo); }
function resetCombo() { combo = 0; comboT = 0; }

function gainOD(v) { if (odActive > 0) return; overdrive = Math.min(100, overdrive + v); }
function tryOverdrive() {
  if (odActive > 0 || overdrive < 100 || !player) return;
  odActive = odDuration();
  overdrive = 0;
  Sfx.odGo();
  banner('OVERDRIVE!');
  addShake(10);
  boom(player.x, player.y, '#00f6ff', 34, 380);
}

/* ---------------- Player ---------------- */
function makePlayer() {
  return {
    x: VW / 2, y: VH - 130, r: 14 * S * G, speed: 360 * S,
    lives: 3, inv: 0, fireCd: 0, bank: 0,
    weapon: 'single', weaponT: 0, shieldT: 0,
    // 2.0: run-upgrades (vaelges efter hvert boss-kill)
    mods: { rapid: 0, wingman: 0, graze: 0, magnet: 0, odplus: 0, pierce: 0, spread: 0 },
    drones: [], droneCd: 0,
  };
}

function odDuration() { return player && player.mods.odplus ? 8 : 6; }

/* Skudhjaelper: affyrer spillerens moenster inkl. SPREAD-stacks */
function firePattern(p, angles, speed, cd) {
  p.fireCd = cd * Math.pow(0.82, p.mods.rapid);
  Sfx.shoot();
  for (const a of angles) {
    bullets.push({ x: p.x, y: p.y - 16 * S, vx: Math.sin(a) * speed * S, vy: -Math.cos(a) * speed * S, r: 4 * S, dmg: 1, pierce: p.mods.pierce });
  }
  for (let s = 1; s <= p.mods.spread; s++) {
    for (const sgn of [-1, 1]) {
      const a = sgn * (0.42 + s * 0.14);
      bullets.push({ x: p.x, y: p.y - 10 * S, vx: Math.sin(a) * 700 * S, vy: -Math.cos(a) * 700 * S, r: 3.5 * S, dmg: 1, pierce: p.mods.pierce });
    }
  }
}

function updatePlayer(dt) {
  const p = player;
  let dx = 0, dy = 0;
  if (keys['arrowleft'] || keys['a']) dx -= 1;
  if (keys['arrowright'] || keys['d']) dx += 1;
  if (keys['arrowup'] || keys['w']) dy -= 1;
  if (keys['arrowdown'] || keys['s']) dy += 1;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  p.x += dx * p.speed * dt;
  p.y += dy * p.speed * dt;

  if (ctrlMode === 'tilt' && tilt.enabled) {
    // dødzone 1,5° · fuld fart ved 13° hældning fra kalibreret nulpunkt
    const DZ = 1.5, MAXA = 13;
    const ax = Math.abs(tilt.gx) < DZ ? 0 : clamp(tilt.gx / MAXA, -1, 1);
    const ay = Math.abs(tilt.gy) < DZ ? 0 : clamp(tilt.gy / MAXA, -1, 1);
    p.x += ax * p.speed * 1.25 * dt;
    p.y += ay * p.speed * 1.25 * dt;
  } else if (touchActive) {
    p.x += (touch.x - p.x) * Math.min(1, dt * 14);
    p.y += (touch.y - 60 - p.y) * Math.min(1, dt * 14);
  }
  p.x = clamp(p.x, p.r + 6 + wallW, VW - p.r - 6 - wallW);
  p.y = clamp(p.y, VH * 0.42, VH - p.r - 10);

  // banking-haeldning efter reel sidebevaegelse
  const targetBank = clamp((p.x - (p.prevX ?? p.x)) / (p.speed * dt || 1), -1, 1);
  p.bank += (targetBank - p.bank) * Math.min(1, dt * 10);
  p.prevX = p.x;

  // motor-trail
  if (Math.random() < (REDUCED_MOTION ? 0.3 : 0.85)) {
    particles.push({ x: p.x + rand(-4, 4), y: p.y + 16 * S, vx: rand(-20, 20), vy: rand(120, 200), t: rand(0.15, 0.3), color: '#00f6ff', r: rand(1, 2.5) * S });
  }

  p.inv = Math.max(0, p.inv - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.weaponT > 0) { p.weaponT -= dt; if (p.weaponT <= 0) p.weapon = 'single'; }
  p.shieldT = Math.max(0, p.shieldT - dt);

  // WINGMAN-droner foelger skibet med lidt traeghed
  while (p.drones.length < p.mods.wingman) p.drones.push({ x: p.x, y: p.y });
  p.droneCd = Math.max(0, p.droneCd - dt);
  p.drones.forEach((d, i) => {
    const side = i === 0 ? -1 : 1;
    d.x += (p.x + side * 44 * S - d.x) * Math.min(1, dt * 8);
    d.y += (p.y + 20 * S - d.y) * Math.min(1, dt * 8);
  });

  const firing = keys[' '] || touchActive;
  if (firing) {
    if (odActive > 0) {
      if (p.fireCd === 0) firePattern(p, [-0.34, -0.17, 0, 0.17, 0.34], 820, 0.1);
    } else if (p.weapon === 'laser') {
      Sfx.laserHum();
      laserDamage(dt);
    } else if (p.fireCd === 0) {
      if (p.weapon === 'triple') firePattern(p, [-0.22, 0, 0.22], 760, 0.18);
      else firePattern(p, [-0.012, 0.012], 780, 0.15);
    }
    // wingman-droner skyder lige op i egen kadence
    if (p.drones.length && p.droneCd === 0) {
      p.droneCd = 0.32 * Math.pow(0.82, p.mods.rapid);
      for (const d of p.drones) {
        bullets.push({ x: d.x, y: d.y - 10 * S, vx: 0, vy: -720 * S, r: 3 * S, dmg: 1, pierce: 0 });
      }
    }
  }
}

/* Bosser hvis gimmick (panser/pods) skal omgaas med praecisionsskud,
   ikke fladeskade fra laser/bombe */
function bossGimmickShielded(e) {
  if (e.type !== 'boss') return false;
  if (e.bossKind === 'firewall') return true;
  return e.bossKind === 'mothership' && e.pods.some((pd) => pd.alive);
}

const LASER_W = 26 * S;
function laserDamage(dt) {
  const p = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.intangible) continue;
    if (bossGimmickShielded(e)) continue;   // panser/skjold: laseren bider ikke
    if (e.y < p.y && Math.abs(e.x - p.x) < LASER_W / 2 + e.r) {
      e.hp -= 16 * dt;
      e.flash = 0.06;
      if (Math.random() < 0.4) particles.push({ x: e.x + rand(-e.r, e.r), y: e.y, vx: rand(-60, 60), vy: rand(-60, 60), t: 0.2, color: '#ff2bd6', r: 2 * S });
      if (e.hp <= 0) killEnemy(e);
    }
  }
}

function hitPlayer() {
  const p = player;
  if (p.inv > 0) return;
  if (odActive > 0) { boom(p.x, p.y, '#00f6ff', 6, 160); return; }
  if (p.shieldT > 0) {
    p.shieldT = 0;
    p.inv = 1.2;
    Sfx.hit(); addShake(8);
    boom(p.x, p.y, '#00f6ff', 14);
    popup(p.x, p.y - 30, 'SHIELD!', '#00f6ff');
    return;
  }
  p.lives--;
  p.inv = 2.2;
  resetCombo();
  Sfx.hit(); addShake(16);
  boom(p.x, p.y, '#ff2bd6', 30, 300);
  ebullets.length = 0; // klassisk arcade-nåde: ryd skærmen for fjendeskud
  if (p.lives <= 0) gameOver();
  updateHud();
}

/* ---------------- Bullets ---------------- */
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20 || b.x < -20 || b.x > VW + 20) { bullets.splice(i, 1); continue; }
    for (const e of enemies) {
      if (e.intangible) continue;

      // FIREWALL: bred mur — kun svage segmenter tager skade
      if (e.type === 'boss' && e.bossKind === 'firewall') {
        const hw = 3.5 * e.segW, hh = e.segH / 2;
        if (b.x > e.x - hw && b.x < e.x + hw && b.y > e.y - hh && b.y < e.y + hh) {
          const idx = clamp(Math.floor((b.x - (e.x - hw)) / e.segW), 0, 6);
          bullets.splice(i, 1);
          if (e.segs[idx].weak) {
            e.hp -= b.dmg; e.flash = 0.08;
            particles.push({ x: b.x, y: b.y, vx: rand(-60, 60), vy: rand(-90, 0), t: 0.2, color: '#fff', r: 2.5 * S });
            if (e.hp <= 0) killEnemy(e);
          } else {
            particles.push({ x: b.x, y: b.y, vx: rand(-40, 40), vy: rand(-40, 20), t: 0.15, color: '#39ff6a', r: 2 * S });
          }
          break;
        }
        continue;
      }

      // MOTHERSHIP: pods skal ned foer kernen kan rammes
      if (e.type === 'boss' && e.bossKind === 'mothership') {
        let handled = false;
        for (const pod of e.pods) {
          if (!pod.alive) continue;
          const px = e.x + pod.dx, py = e.y + pod.dy;
          const pdx = b.x - px, pdy = b.y - py;
          const pr = 24 * S * G;
          if (pdx * pdx + pdy * pdy < (b.r + pr) * (b.r + pr)) {
            pod.hp -= b.dmg;
            bullets.splice(i, 1);
            handled = true;
            particles.push({ x: b.x, y: b.y, vx: rand(-50, 50), vy: rand(-80, 0), t: 0.18, color: '#fff', r: 2 * S });
            if (pod.hp <= 0) {
              pod.alive = false;
              boom(px, py, '#c86bff', 30, 300);
              Sfx.explode(); addShake(10);
              quietScore(1000);
              popup(px, py, 'POD DOWN +1000', '#ffb000');
            }
            break;
          }
        }
        if (handled) break;
        if (e.pods.some((pd) => pd.alive)) {
          const cdx = b.x - e.x, cdy = b.y - e.y;
          if (cdx * cdx + cdy * cdy < (b.r + e.r) * (b.r + e.r)) {
            bullets.splice(i, 1);            // skjoldet kerne absorberer
            particles.push({ x: b.x, y: b.y, vx: rand(-40, 40), vy: rand(-40, 20), t: 0.15, color: '#c86bff', r: 2 * S });
            break;
          }
          continue;
        }
      }

      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy < (b.r + e.r) * (b.r + e.r)) {
        e.hp -= b.dmg;
        e.flash = 0.08;
        particles.push({ x: b.x, y: b.y, vx: rand(-50, 50), vy: rand(-80, 0), t: 0.18, color: '#fff', r: 2 * S });
        const killed = e.hp <= 0;
        if (killed) killEnemy(e);
        if (killed && b.pierce > 0) b.pierce--;   // PIERCING: skuddet fortsaetter gennem foerste kill
        else bullets.splice(i, 1);
        break;
      }
    }
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > VH + 20 || b.y < -20 || b.x < -20 || b.x > VW + 20) { ebullets.splice(i, 1); continue; }
    const dx = b.x - player.x, dy = b.y - player.y;
    const d2 = dx * dx + dy * dy;
    const hitR = b.r + player.r - 3;
    if (d2 < hitR * hitR) {
      ebullets.splice(i, 1);
      hitPlayer();
      break; // hitPlayer() may clear ebullets; further iterations would access undefined
    } else if (!b.grazed && d2 < (34 * S) * (34 * S) && player.inv <= 0 && odActive <= 0) {
      // GRAZE: tæt forbiflyvning belønnes
      b.grazed = true;
      grazes++;
      const gm = player.mods.graze > 0;
      quietScore(gm ? 50 : 25);
      gainOD(gm ? 10 : 5);
      Sfx.graze();
      for (let k = 0; k < 3; k++) {
        if (particles.length < MAX_PARTICLES) {
          particles.push({ x: player.x + dx * 0.5, y: player.y + dy * 0.5, vx: rand(-90, 90), vy: rand(-90, 90), t: 0.22, color: '#ffffff', r: 1.8 * S });
        }
      }
    }
  }
}

/* ---------------- Enemies ---------------- */
const E_DEFS = {
  drone:    { hp: 1,  r: 16 * S * G, score: 100, color: '#ff2bd6' },
  diver:    { hp: 1,  r: 14 * S * G, score: 150, color: '#ffb000' },
  tank:     { hp: 7,  r: 24 * S * G, score: 300, color: '#39ff6a' },
  splitter: { hp: 2,  r: 18 * S * G, score: 200, color: '#ffe14d' },
  mini:     { hp: 1,  r: 9 * S * G,  score: 80,  color: '#ffe14d' },
  sniper:   { hp: 2,  r: 15 * S * G, score: 250, color: '#ff4d4d' },
  miner:    { hp: 3,  r: 17 * S * G, score: 250, color: '#ff7b00' },
  mine:     { hp: 1,  r: 10 * S * G, score: 50,  color: '#ff7b00' },
  phoenix:  { hp: 2,  r: 14 * S * G, score: 200, color: '#ff4d1a' },
  phantom:  { hp: 2,  r: 15 * S * G, score: 220, color: '#7dffb0' },
  turret:   { hp: 4,  r: 18 * S * G, score: 280, color: '#c86bff' },
  asteroid: { hp: 4,  r: 26 * S * G, score: 60,  color: '#c9996a' },
  rock:     { hp: 1,  r: 12 * S * G, score: 30,  color: '#c9996a' },
  boss:     { hp: 60, r: 56 * S * G, score: 5000, color: '#ff2bd6' },
};

// hazard-typer straffer ikke combo, naar de slipper forbi i bunden
const NO_COMBO_EXIT = new Set(['asteroid', 'rock', 'mine']);

function spawnEnemy(type, x = rand(60, VW - 60), y = -40) {
  const d = E_DEFS[type];
  const e = {
    type, x, y, r: d.r, color: d.color, score: d.score,
    hp: d.hp, maxHp: d.hp, t: rand(0, TAU), flash: 0,
    state: 0, fireT: rand(1, 2.5), baseX: x,
  };
  if (type === 'tank') { e.hp = e.maxHp = d.hp + Math.floor(wave * 0.8); }
  if (type === 'sniper') { e.ty = rand(95 * S, 175 * S); e.phase = 'aim'; e.aimT = rand(1.0, 1.8); e.ang = Math.PI / 2; }
  if (type === 'miner')  { e.ty = rand(95 * S, 160 * S); e.dir = Math.random() < 0.5 ? -1 : 1; e.dropT = 1.2; }
  if (type === 'mine')   { e.armT = 0.8; e.lifeT = 4; }
  if (type === 'phantom'){ e.phase = 'vis'; e.phaseT = 1.6; }
  if (type === 'turret') { e.ty = rand(150 * S, 280 * S); e.ang = Math.PI / 2; e.burstN = 0; e.burstT = 0; }
  if (type === 'asteroid' || type === 'rock') {
    e.rot = rand(0, TAU); e.vr = rand(-1.2, 1.2);
    e.vx = rand(-30, 30) * S;
    e.vy = (type === 'asteroid' ? rand(70, 110) : rand(130, 180)) * S;
    e.verts = mkRockVerts(8);
  }
  // LOOP-skalering: haardere fjender for hver gennemspilning af alle sektorer
  const lp = loopNum();
  if (lp > 1 && type !== 'boss') {
    e.hp = e.maxHp = Math.round(e.hp * (1 + 0.5 * (lp - 1)));
  }
  if (type === 'boss') {
    const sec = sectorDef();
    e.bossKind = sec ? sec.boss : 'gatekeeper';
    e.hp = e.maxHp = d.hp + wave * 18;
    e.score = d.score + wave * 400;
    e.x = VW / 2; e.attackT = 2; e.attack = 0;
    e.burstN = 0; e.burstT = 0;
    e.spiralN = 0; e.spiralT = 0; e.spiralA = 0;
    if (e.bossKind === 'crusher')   { e.charging = 0; e.chargeDir = 1; e.mineT = 0; }
    if (e.bossKind === 'solarcore') {
      e.r = 48 * S * G;
      e.beams = [0, Math.PI]; e.beamMode = 'off'; e.beamT = 2.5; e.pulseT = 2;
    }
    if (e.bossKind === 'firewall') {
      e.segW = (VW - 120) / 7; e.segH = 46 * S;
      e.segs = Array.from({ length: 7 }, () => ({ weak: false }));
      rerollWeakSegs(e);
    }
    if (e.bossKind === 'mothership') {
      e.r = 60 * S * G;
      e.hp = e.maxHp = Math.round(e.maxHp * 1.25);
      const podHp = 24 + wave * 4;
      e.pods = [
        { dx: -130 * S, dy: 26 * S, hp: podHp, maxHp: podHp, alive: true, fireT: 1.5 },
        { dx:  130 * S, dy: 26 * S, hp: podHp, maxHp: podHp, alive: true, fireT: 2.2 },
      ];
    }
    spawner.bossAlive = true;
    Sfx.bossIn();
    banner('!! ' + (sec ? sec.bossName : 'BOSS') + ' !!');
  }
  enemies.push(e);
}

function updateEnemies(dt) {
  const p = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    const speedUp = 1 + wave * 0.035;

    switch (e.type) {
      case 'drone':
        e.y += 75 * S * speedUp * dt;
        e.x = e.baseX + Math.sin(e.t * 2.2) * 60;
        break;

      case 'diver':
        if (e.state === 0) {
          e.y += 110 * S * dt;
          if (e.y > rand(120 * S, 200 * S)) { e.state = 1; e.pauseT = 0.5; }
        } else if (e.state === 1) {
          e.pauseT -= dt;
          e.x += Math.sin(e.t * 8) * 40 * dt;
          if (e.pauseT <= 0) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            e.vx = Math.cos(a) * 460 * S * speedUp; e.vy = Math.sin(a) * 460 * S * speedUp;
            e.state = 2;
          }
        } else {
          e.x += e.vx * dt; e.y += e.vy * dt;
        }
        break;

      case 'tank':
        if (e.y < 170 * S) e.y += 45 * S * dt;
        e.x = e.baseX + Math.sin(e.t * 0.8) * 30;
        e.fireT -= dt;
        if (e.fireT <= 0 && e.y > 60) {
          e.fireT = Math.max(1.2, 2.4 - wave * 0.06);
          for (const a of [-0.3, 0, 0.3]) {
            const ang = Math.atan2(p.y - e.y, p.x - e.x) + a;
            ebullets.push({ x: e.x, y: e.y + 10 * S, vx: Math.cos(ang) * 230 * S, vy: Math.sin(ang) * 230 * S, r: 5 * S, color: '#39ff6a' });
          }
        }
        break;

      case 'splitter':
        e.y += 85 * S * speedUp * dt;
        e.x += Math.cos(e.t * 3) * 130 * dt;
        break;

      case 'mini':
        e.y += 150 * S * speedUp * dt;
        e.x += Math.sin(e.t * 9) * 220 * dt;
        break;

      case 'sniper':
        if (e.y < e.ty) {
          e.y += 130 * S * dt;
        } else if (e.phase === 'aim') {
          e.x = e.baseX + Math.sin(e.t * 1.4) * 45;
          e.aimT -= dt;
          if (e.aimT <= 0) {
            e.phase = 'tele';
            e.teleT = 0.7;
            e.ang = Math.atan2(p.y - e.y, p.x - e.x); // låser sigtet -> spilleren kan dodge
          }
        } else if (e.phase === 'tele') {
          e.teleT -= dt;
          if (e.teleT <= 0) { e.phase = 'fire'; e.burstN = 3; e.burstT = 0; }
        } else if (e.phase === 'fire') {
          e.burstT -= dt;
          if (e.burstT <= 0 && e.burstN > 0) {
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 640 * S, vy: Math.sin(e.ang) * 640 * S, r: 4 * S, color: '#ff4d4d' });
            e.burstN--;
            e.burstT = 0.09;
            if (e.burstN === 0) { e.phase = 'aim'; e.aimT = rand(1.6, 2.6); }
          }
        }
        break;

      case 'miner':
        if (e.y < e.ty) { e.y += 90 * S * dt; }
        else {
          e.x += e.dir * 70 * S * dt;
          if (e.x < 70 || e.x > VW - 70) e.dir *= -1;
          e.dropT -= dt;
          if (e.dropT <= 0 && enemies.filter((m) => m.type === 'mine').length < 6) {
            e.dropT = 2.2;
            spawnEnemy('mine', e.x, e.y + 16 * S);
          }
        }
        break;

      case 'mine':
        e.armT = Math.max(0, e.armT - dt);
        e.lifeT -= dt;
        if (e.lifeT <= 0) { mineBurst(e); continue; }
        break;

      case 'phoenix': {
        const sp = e.reborn ? 1.35 : 1;
        e.y += 230 * S * sp * speedUp * dt;
        e.x = e.baseX + Math.sin(e.t * 3.2) * 150;
        if (Math.random() < (REDUCED_MOTION ? 0.15 : 0.5) && particles.length < MAX_PARTICLES) {
          particles.push({ x: e.x + rand(-6, 6), y: e.y - e.r, vx: rand(-25, 25), vy: rand(-140, -60), t: rand(0.2, 0.4), color: e.reborn ? '#ffdd55' : '#ff4d1a', r: rand(1.5, 3) * S });
        }
        break;
      }

      case 'phantom':
        e.y += 55 * S * speedUp * dt;
        e.x = e.baseX + Math.sin(e.t * 1.8) * 80;
        e.phaseT -= dt;
        if (e.phase === 'vis' && e.phaseT <= 0)          { e.phase = 'fade'; e.phaseT = 0.4; }
        else if (e.phase === 'fade' && e.phaseT <= 0)    { e.phase = 'out';  e.phaseT = 1.2; }
        else if (e.phase === 'out' && e.phaseT <= 0) {
          e.phase = 'vis'; e.phaseT = 1.6;
          const pa = Math.atan2(p.y - e.y, p.x - e.x);   // sigtet skud ved re-entry
          ebullets.push({ x: e.x, y: e.y, vx: Math.cos(pa) * 300 * S, vy: Math.sin(pa) * 300 * S, r: 4.5 * S, color: e.color });
        }
        e.intangible = e.phase === 'out';
        break;

      case 'turret':
        if (e.y < e.ty) e.y += 60 * S * dt;
        else {
          e.fireT -= dt;
          if (e.fireT <= 0) { e.fireT = Math.max(1.4, 2.4 - wave * 0.02); e.burstN = 2; e.burstT = 0; }
        }
        e.ang += (Math.atan2(p.y - e.y, p.x - e.x) - e.ang) * Math.min(1, dt * 3);
        if (e.burstN > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 320 * S, vy: Math.sin(e.ang) * 320 * S, r: 5 * S, color: e.color });
            e.burstN--; e.burstT = 0.16;
          }
        }
        break;

      case 'asteroid':
      case 'rock':
        e.y += e.vy * dt; e.x += e.vx * dt; e.rot += e.vr * dt;
        break;

      case 'boss':
        updateBoss(e, dt);
        break;
    }

    // kollision med spilleren (kamikaze) — fantomer i 'out'-fase er urambare
    if (e.intangible) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < (e.r + p.r - 4) * (e.r + p.r - 4)) {
      if (e.type !== 'boss') { e.hp = 0; killEnemy(e, true); }
      hitPlayer();
      continue;
    }
    if (e.y > VH + 60) {
      enemies.splice(i, 1);
      if (e.type === 'boss') spawner.bossAlive = false;   // sikkerhedsnet: en boss maa aldrig laase spawneren
      else if (!NO_COMBO_EXIT.has(e.type)) resetCombo();  // sluppet forbi -> combo ryger (hazards undtaget)
    } else if (e.x < -80 || e.x > VW + 80) {
      enemies.splice(i, 1);                // side-exit straffer ikke
      if (e.type === 'boss') spawner.bossAlive = false;
    }
  }
}

function updateBoss(e, dt) {
  switch (e.bossKind) {
    case 'crusher':    return updateCrusher(e, dt);
    case 'solarcore':  return updateSolarCore(e, dt);
    case 'firewall':   return updateFirewall(e, dt);
    case 'mothership': return updateMothership(e, dt);
    default:           return updateGatekeeper(e, dt);
  }
}

/* Faelles spiral-koe (pause-sikker, ingen setTimeout) */
function runSpiral(e, dt, speed, color) {
  if (e.spiralN <= 0) return;
  e.spiralT -= dt;
  if (e.spiralT <= 0) {
    ebullets.push({ x: e.x, y: e.y + 14 * S, vx: Math.cos(e.spiralA) * speed * S, vy: Math.sin(e.spiralA) * speed * S, r: 5 * S, color });
    e.spiralA += 0.44;
    e.spiralN--;
    e.spiralT = 0.07;
  }
}

/* --- SEKTOR 1: GATEKEEPER — radial, sigtet byge, summon, spiral --- */
function updateGatekeeper(e, dt) {
  const phase = e.hp / e.maxHp;            // 1 -> 0
  const rage = phase < 0.33 ? 1.7 : phase < 0.66 ? 1.3 : 1;
  if (e.y < 130 * S) e.y += 60 * S * dt;
  e.x = VW / 2 + Math.sin(e.t * 0.7 * rage) * (VW / 2 - 110);

  // burst-koe (pause-sikker, ingen setTimeout)
  if (e.burstN > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      const a = Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.08, 0.08);
      ebullets.push({ x: e.x, y: e.y + 20 * S, vx: Math.cos(a) * 330 * S, vy: Math.sin(a) * 330 * S, r: 5 * S, color: '#ffb000' });
      e.burstN--;
      e.burstT = 0.11;
    }
  }
  runSpiral(e, dt, 240, '#ff2bd6');

  e.attackT -= dt * rage;
  if (e.attackT <= 0 && e.y > 100) {
    e.attack = (e.attack + 1) % 4;
    e.attackT = 2.4;
    if (e.attack === 0) {                   // radial burst
      const n = 14 + Math.floor(wave / 5) * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + e.t;
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200 * S, vy: Math.sin(a) * 200 * S, r: 5 * S, color: '#ff2bd6' });
      }
    } else if (e.attack === 1) {            // sigtet byge
      e.burstN = 5; e.burstT = 0;
    } else if (e.attack === 2) {            // tilkald droner fra bossens position
      spawnEnemy('drone', clamp(e.x - 110, 60, VW - 60), e.y + 30);
      spawnEnemy('drone', clamp(e.x + 110, 60, VW - 60), e.y + 30);
      if (phase < 0.5) spawnEnemy('diver', e.x, e.y + 30);
    } else if (phase < 0.66) {              // fase 2+: roterende spiral
      e.spiralN = 22; e.spiralT = 0; e.spiralA = rand(0, TAU);
    } else {
      e.burstN = 4; e.burstT = 0;
    }
  }
}

/* --- SEKTOR 2: THE CRUSHER — asteroide-kast, charge med minespor, sten-burst --- */
function updateCrusher(e, dt) {
  const phase = e.hp / e.maxHp;
  const rage = phase < 0.33 ? 1.6 : phase < 0.66 ? 1.25 : 1;
  if (e.y < 140 * S) e.y += 60 * S * dt;

  if (e.charging) {
    e.x += e.chargeDir * 520 * S * dt * rage;
    e.mineT -= dt;
    if (e.mineT <= 0) { e.mineT = 0.3; spawnEnemy('mine', e.x, e.y + e.r * 0.7); }
    if ((e.chargeDir > 0 && e.x > VW - 130) || (e.chargeDir < 0 && e.x < 130)) e.charging = 0;
    return;
  }
  e.x += Math.sin(e.t * 0.6) * 50 * dt;

  e.attackT -= dt * rage;
  if (e.attackT <= 0 && e.y > 100) {
    e.attack = (e.attack + 1) % 3;
    e.attackT = 2.7;
    if (e.attack === 0) {                   // kaster asteroider i buer
      for (const off of [-170, 0, 170]) {
        spawnEnemy('asteroid', clamp(e.x + off, 70, VW - 70), e.y + 30);
        const a = enemies[enemies.length - 1];
        a.vx = (off === 0 ? rand(-20, 20) : -Math.sign(off) * rand(20, 60)) * S;
        a.vy = rand(150, 210) * S;
      }
      Sfx.explode();
    } else if (e.attack === 1) {            // charge paa tvaers med minespor
      e.charging = 1; e.mineT = 0.15;
      e.chargeDir = player.x > e.x ? 1 : -1;
      Sfx.noise(0.35, 0.3, 900);
      addShake(6);
    } else {                                // radial sten-burst
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + e.t;
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 210 * S, vy: Math.sin(a) * 210 * S, r: 5.5 * S, color: '#ff7b00' });
      }
    }
  }
}

/* --- SEKTOR 3: SOLAR CORE — roterende laserstraaler + radiale pulser --- */
function updateSolarCore(e, dt) {
  const phase = e.hp / e.maxHp;
  if (e.y < 150 * S) e.y += 55 * S * dt;
  e.x = VW / 2 + Math.sin(e.t * 0.5) * 120;

  // straale-cyklus: off -> warn (telegraferet) -> on
  e.beamT -= dt;
  if (e.beamMode === 'off' && e.beamT <= 0) {
    e.beamMode = 'warn'; e.beamT = 1.2;
    const n = phase < 0.5 ? 3 : 2;
    const off = rand(0, TAU);
    e.beams = Array.from({ length: n }, (_, i) => (i / n) * TAU + off);
  } else if (e.beamMode === 'warn' && e.beamT <= 0) {
    e.beamMode = 'on'; e.beamT = 4;
    Sfx.noise(0.5, 0.35, 700);
  } else if (e.beamMode === 'on') {
    const rot = (phase < 0.33 ? 0.8 : 0.55) * dt;
    for (let i = 0; i < e.beams.length; i++) e.beams[i] += rot;
    if (player.inv <= 0 && odActive <= 0) {
      for (const a of e.beams) {
        const pdx = player.x - e.x, pdy = player.y - e.y;
        const dist = Math.hypot(pdx, pdy);
        const diff = Math.atan2(pdy, pdx) - a;
        const perp = Math.abs(Math.sin(diff)) * dist;
        if (Math.cos(diff) > 0 && perp < 14 * S + player.r * 0.6 && dist < 1300) { hitPlayer(); break; }
      }
    }
    if (e.beamT <= 0) { e.beamMode = 'off'; e.beamT = 2.5; }
  }

  e.pulseT -= dt;
  if (e.pulseT <= 0 && e.y > 100) {
    e.pulseT = phase < 0.5 ? 1.7 : 2.3;
    const n = 12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + e.t * 0.7;
      ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 180 * S, vy: Math.sin(a) * 180 * S, r: 5 * S, color: '#ffb000' });
    }
  }
}

/* --- SEKTOR 4: FIREWALL — segmenteret mur med svage punkter --- */
function rerollWeakSegs(e) {
  e.segs.forEach((sg) => { sg.weak = false; });
  const idx = new Set();
  while (idx.size < 2) idx.add(Math.floor(Math.random() * e.segs.length));
  idx.forEach((i) => { e.segs[i].weak = true; });
  e.rerollT = 6;
}

function updateFirewall(e, dt) {
  const phase = e.hp / e.maxHp;
  const rage = phase < 0.4 ? 1.5 : 1;
  const targetY = (170 + Math.sin(e.t * 0.35) * 80) * S;
  e.y += (targetY - e.y) * Math.min(1, dt * 0.8);
  e.x = VW / 2 + Math.sin(e.t * 0.5) * 30;

  e.rerollT -= dt;
  if (e.rerollT <= 0) rerollWeakSegs(e);

  e.attackT -= dt * rage;
  if (e.attackT <= 0 && e.y > 80) {
    e.attackT = 1.4;
    for (let k = 0; k < 2; k++) {           // skud ned fra tilfaeldige segmenter
      const i = Math.floor(Math.random() * 7);
      const sx = e.x + (i - 3) * e.segW;
      ebullets.push({ x: sx, y: e.y + e.segH / 2, vx: rand(-30, 30) * S, vy: 300 * S * rage, r: 5 * S, color: '#39ff6a' });
    }
  }
}

/* --- SEKTOR 5: MOTHERSHIP — pods -> kerne -> desperation --- */
function updateMothership(e, dt) {
  const phase = e.hp / e.maxHp;
  const podsAlive = e.pods.some((pd) => pd.alive);
  if (e.y < 150 * S) e.y += 45 * S * dt;
  e.x = VW / 2 + Math.sin(e.t * (podsAlive ? 0.4 : 0.6)) * (podsAlive ? 90 : 170);

  for (const pod of e.pods) {               // fase 1: pods skyder sigtede vifter
    if (!pod.alive) continue;
    pod.fireT -= dt;
    if (pod.fireT <= 0 && e.y > 100) {
      pod.fireT = rand(1.6, 2.4);
      const px = e.x + pod.dx, py = e.y + pod.dy;
      const a = Math.atan2(player.y - py, player.x - px);
      for (const off of [-0.12, 0, 0.12]) {
        ebullets.push({ x: px, y: py, vx: Math.cos(a + off) * 300 * S, vy: Math.sin(a + off) * 300 * S, r: 5 * S, color: '#c86bff' });
      }
    }
  }
  if (podsAlive) return;

  const desperate = phase < 0.25;           // fase 3
  if (desperate) {
    e.spiralT -= dt;
    if (e.spiralT <= 0) {
      e.spiralT = 0.09;
      e.spiralA += 0.5;
      ebullets.push({ x: e.x, y: e.y + 20 * S, vx: Math.cos(e.spiralA) * 240 * S, vy: Math.sin(e.spiralA) * 240 * S, r: 5 * S, color: '#ff2bd6' });
    }
  }
  runSpiral(e, dt, 260, '#ffb000');

  e.attackT -= dt * (desperate ? 1.6 : 1);
  if (e.attackT <= 0 && e.y > 100) {
    e.attack = (e.attack + 1) % 3;
    e.attackT = desperate ? 1.8 : 2.4;
    if (e.attack === 0) {                   // radial
      const n = 16;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + e.t;
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 210 * S, vy: Math.sin(a) * 210 * S, r: 5 * S, color: '#ff2bd6' });
      }
    } else if (e.attack === 1) {            // spiral-byge
      e.spiralN = 18; e.spiralT = 0;
    } else {                                // summon
      spawnEnemy('drone', clamp(e.x - 140, 60, VW - 60), e.y + 40);
      spawnEnemy('drone', clamp(e.x + 140, 60, VW - 60), e.y + 40);
      if (phase < 0.6) spawnEnemy('phantom', e.x, e.y + 40);
    }
  }
}

function killEnemy(e, silentScore = false) {
  const idx = enemies.indexOf(e);
  if (idx === -1) return;
  enemies.splice(idx, 1);

  boom(e.x, e.y, e.color, e.type === 'boss' ? 70 : 18, e.type === 'boss' ? 420 : 220);
  if (e.type === 'boss') {
    Sfx.bigBoom(); addShake(26);
    spawner.bossAlive = false;
    hitStop = 0.35;
    flashT = 0.4;
    // sektoren er brudt: fej resterende fjender, skud og hazards vaek
    for (let i2 = enemies.length - 1; i2 >= 0; i2--) {
      const o = enemies[i2];
      boom(o.x, o.y, o.color, 10, 200);
      enemies.splice(i2, 1);
    }
    ebullets.length = 0;
    hazards.length = 0;
    respawnQueue.length = 0;
    wallTarget = 0;
    upgradeDelay = 1.4;   // kort ro, derefter upgrade-valg
  } else { Sfx.explode(); addShake(3); hitStop = Math.max(hitStop, 0.03); }

  if (!silentScore) {
    bumpCombo();
    addScore(e.score, e.x, e.y);
    gainOD(e.type === 'boss' ? 30 : 2);

    // kill-streak: kun RAMPAGE ved 5+ kills paa 0,8 sek. (comboen daekker resten)
    killTimes.push(gameTime);
    killTimes = killTimes.filter((t) => gameTime - t < 0.8);
    if (killTimes.length >= 5 && gameTime - lastStreakT > 1) {
      lastStreakT = gameTime;
      popup(clamp(e.x, 120, VW - 120), e.y - 44, 'RAMPAGE!!', '#ffb000', true);
      gainOD(8);
    }
  }

  if (e.type === 'splitter') {
    spawnEnemy('mini', e.x - 16, e.y);
    spawnEnemy('mini', e.x + 16, e.y);
  }
  if (e.type === 'asteroid') {                 // stor sten -> to smaasten
    for (const sgn of [-1, 1]) {
      spawnEnemy('rock', e.x + sgn * 12, e.y);
      const r2 = enemies[enemies.length - 1];
      r2.vx = sgn * rand(50, 100) * S;
    }
  }
  if (e.type === 'phoenix' && !e.reborn) {     // foerste doed -> genopstaar
    respawnQueue.push({ t: 1.2, x: clamp(e.x, 60, VW - 60) });
    popup(e.x, e.y - 26, 'PHOENIX RISES...', '#ffdd55');
  }
  // powerup-drop (hazard-typer dropper sjaeldent/aldrig)
  const chance = e.type === 'boss' ? 1 : e.type === 'tank' ? 0.35
    : e.type === 'mine' ? 0 : e.type === 'rock' ? 0.04 : e.type === 'asteroid' ? 0.15 : 0.11;
  if (Math.random() < chance) dropPowerup(e.x, e.y);
  if (e.type === 'boss') dropPowerup(e.x + 40, e.y);

  updateHud();
}

/* Mine, der naar sin timer: brister i radiale skud */
function mineBurst(e) {
  const idx = enemies.indexOf(e);
  if (idx !== -1) enemies.splice(idx, 1);
  Sfx.explode();
  boom(e.x, e.y, e.color, 14, 240);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + rand(-0.1, 0.1);
    ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240 * S, vy: Math.sin(a) * 240 * S, r: 4.5 * S, color: e.color });
  }
}

/* ---------------- Powerups ---------------- */
const P_TYPES = [
  { id: 'T', name: 'TRIPLE',  color: '#00f6ff' },
  { id: 'L', name: 'LASER',   color: '#ff2bd6' },
  { id: 'S', name: 'SHIELD',  color: '#39ff6a' },
  { id: 'B', name: 'BOMB',    color: '#ffb000' },
];

function dropPowerup(x, y) {
  const t = P_TYPES[Math.floor(Math.random() * P_TYPES.length)];
  powerups.push({ x, y, vy: 110 * S, r: 15 * S * G, t: 0, def: t });
}

function updatePowerups(dt) {
  if (!player) return;
  const p = player;
  for (let i = powerups.length - 1; i >= 0; i--) {
    const u = powerups[i];
    if (p.mods.magnet) {
      const mdx = p.x - u.x, mdy = p.y - u.y;
      const md = Math.hypot(mdx, mdy);
      if (md < 260 * S && md > 1) {
        u.x += mdx / md * 340 * S * dt;
        u.y += mdy / md * 340 * S * dt;
      }
    }
    u.y += u.vy * dt; u.t += dt;
    if (u.y > VH + 30) { powerups.splice(i, 1); continue; }
    const dx = u.x - p.x, dy = u.y - p.y;
    if (dx * dx + dy * dy < (u.r + p.r + 6) * (u.r + p.r + 6)) {
      powerups.splice(i, 1);
      applyPowerup(u.def);
    }
  }
}

function applyPowerup(def) {
  const p = player;
  Sfx.power();
  gainOD(8);
  popup(p.x, p.y - 36, def.name + '!', def.color);
  switch (def.id) {
    case 'T': p.weapon = 'triple'; p.weaponT = 12; break;
    case 'L': p.weapon = 'laser';  p.weaponT = 7;  break;
    case 'S': p.shieldT = 9; break;
    case 'B':
      addShake(18); Sfx.bigBoom();
      boom(p.x, p.y, '#ffb000', 50, 500);
      ebullets.length = 0;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (bossGimmickShielded(e)) continue;   // panser/skjold staar imod bomben
        e.hp -= 10; e.flash = 0.15;
        if (e.hp <= 0) killEnemy(e);
      }
      break;
  }
}

/* ---------------- Waves & formationer ---------------- */
// Formations-byggeklodser. Hver returnerer en koe af {type, x?, delay}
// (delay = pausen FOER dette spawn). Sektor-scripts i sectors.js
// refererer til dem ved navn.
const FORMS = {
  vee(t, n, x) {
    const cx = x != null ? x : rand(170, VW - 170);
    const out = [{ type: t, delay: 0.9, x: cx }];
    for (let i = 1; i <= Math.floor(n / 2); i++) {
      out.push({ type: t, delay: 0.13, x: clamp(cx - i * 62, 55, VW - 55) });
      out.push({ type: t, delay: 0,    x: clamp(cx + i * 62, 55, VW - 55) });
    }
    return out;
  },
  wall(t, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ type: t, delay: i === 0 ? 1.0 : 0.06, x: 70 + (VW - 140) * (i / (n - 1)) });
    }
    return out;
  },
  stream(t, n, x) {
    const cx = x != null ? x : rand(170, VW - 170);
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ type: t, delay: i === 0 ? 0.8 : 0.22, x: clamp(cx + rand(-45, 45), 60, VW - 60) });
    }
    return out;
  },
  single(t, n, x) {
    return [{ type: t, delay: 1.0, x: x != null ? x : rand(110, VW - 110) }];
  },
  pair(t) {
    const cx = rand(200, VW - 200);
    return [
      { type: t, delay: 0.9,  x: clamp(cx - 90, 60, VW - 60) },
      { type: t, delay: 0.25, x: clamp(cx + 90, 60, VW - 60) },
    ];
  },
  trio(t) {
    const cx = rand(200, VW - 200);
    return [
      { type: t, delay: 0.9, x: cx },
      { type: t, delay: 0.3, x: clamp(cx - 120, 60, VW - 60) },
      { type: t, delay: 0.3, x: clamp(cx + 120, 60, VW - 60) },
    ];
  },
  rocks(t, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ type: 'asteroid', delay: i === 0 ? 0.8 : 0.5, x: rand(70, VW - 70) });
    }
    return out;
  },
};

// En wave er sektor-scriptet oversat til en spawn-koe.
// Boss-waves (5, 10, 15 ...) spawner sektorens unikke boss.
function buildWave(n) {
  const sec = sectorDef(n);
  if (waveInSector(n) === 5 || !sec) return [{ type: 'boss', delay: 0.6 }];
  const script = sec.waves[waveInSector(n) - 1];
  const q = [];
  for (const g of script) {
    if (g.walls != null)   { q.push({ walls: g.walls, delay: 0.2 }); continue; }
    if (g.h === 'flare')   { q.push({ hazard: 'flare', delay: 1.4 }); continue; }
    q.push(...FORMS[g.f](g.t, g.n, g.x != null ? g.x * VW : undefined));
  }
  // LOOP 2+: ekstra grupper for densitet
  for (let k = 1; k < loopNum(n); k++) {
    const g = script[Math.floor(Math.random() * script.length)];
    if (g.f) q.push(...FORMS[g.f](g.t, g.n));
  }
  return q;
}

/* ---------------- Hazards (flares, vaegge) ---------------- */
function spawnFlare() {
  const w = rand(90, 130) * S;
  hazards.push({ kind: 'flare', x: rand(w, VW - w), w, t: 1.2, phase: 'warn' });
}

function updateHazards(dt) {
  wallW += (wallTarget - wallW) * Math.min(1, dt * 1.5);
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i];
    h.t -= dt;
    if (h.phase === 'warn' && h.t <= 0) {
      h.phase = 'on'; h.t = 0.8;
      Sfx.noise(0.4, 0.3, 1200);
      addShake(5);
    } else if (h.phase === 'on') {
      if (player && Math.abs(player.x - h.x) < h.w / 2 + player.r * 0.5) hitPlayer();
      if (h.t <= 0) hazards.splice(i, 1);
    }
  }
}

function updateSpawner(dt) {
  if (spawner.betweenT > 0) {
    spawner.betweenT -= dt;
    if (spawner.betweenT <= 0) {
      wave++;
      spawner.queue = buildWave(wave);
      spawner.timer = spawner.queue.length ? spawner.queue[0].delay : 0;
      const sec = sectorDef();
      if (waveInSector() === 1 && sec) {
        // ny sektor: palette-crossfade, rene hazards, intro-banner
        setPalette(sec.pal);
        hazards.length = 0;
        wallTarget = 0;
        banner('ENTERING: ' + sec.name);
        Sfx.bossIn();
        if (loopNum() > 1 && sectorIndex() === 0) {
          popup(VW / 2, VH * 0.55, 'LOOP ' + loopNum() + ' — MAX HEAT!', '#ff2bd6', true);
        }
      } else if (waveInSector() !== 5) {
        Sfx.waveIn();
      } else {
        wallTarget = 0;   // boss-arena: traek tunnelvaeggene tilbage
      }
      updateHud();
    }
    return;
  }
  if (spawner.queue.length > 0) {
    spawner.timer -= dt;
    while (spawner.queue.length > 0 && spawner.timer <= 0) {
      const it = spawner.queue.shift();
      if (it.walls != null)        wallTarget = it.walls * VW;
      else if (it.hazard === 'flare') spawnFlare();
      else spawnEnemy(it.type, it.x != null ? clamp(it.x, 50, VW - 50) : undefined);
      if (spawner.queue.length > 0) spawner.timer += spawner.queue[0].delay;
    }
  } else if (enemies.length === 0 && !spawner.bossAlive && respawnQueue.length === 0 && upgradeDelay <= 0) {
    spawner.betweenT = 2.2;
    if (wave > 0) addScore(wave * 50, player.x, player.y - 50); // wave-bonus
  }
}

function banner(text) { bannerText = text; bannerT = 2; }

/* ---------------- Upgrades (2.0) ---------------- */
let upgradeChoices = [];

function upgradePool() {
  return UPGRADE_DEFS.filter((u) => {
    if (u.id === 'life') return player.lives < 5;
    return (player.mods[u.id] || 0) < u.max;
  });
}

function openUpgrade() {
  if (state !== 'PLAYING' || !player) return;
  state = 'UPGRADE';
  const bag = upgradePool();
  upgradeChoices = [];
  while (upgradeChoices.length < 3 && bag.length) {
    upgradeChoices.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  while (upgradeChoices.length < 3) {
    upgradeChoices.push({ id: 'salvage', name: 'SALVAGE', desc: '+5000 POINTS', color: '#ffb000' });
  }
  ui.upgCards.innerHTML = '';
  upgradeChoices.forEach((u, i) => {
    const btn = document.createElement('button');
    btn.className = 'upg-card';
    btn.style.setProperty('--uc', u.color);
    const lvl = u.id !== 'life' && u.id !== 'salvage' && player.mods[u.id] ? ' LV' + (player.mods[u.id] + 1) : '';
    const key = document.createElement('span'); key.className = 'upg-key'; key.textContent = String(i + 1);
    const nm = document.createElement('span'); nm.className = 'upg-name'; nm.textContent = u.name + lvl;
    const ds = document.createElement('span'); ds.className = 'upg-desc'; ds.textContent = u.desc;
    btn.append(key, nm, ds);
    btn.addEventListener('click', () => pickUpgrade(i));
    ui.upgCards.appendChild(btn);
  });
  ui.upgrade.classList.remove('hidden');
  Sfx.power();
}

function pickUpgrade(i) {
  if (state !== 'UPGRADE') return;
  const u = upgradeChoices[i];
  if (!u) return;
  switch (u.id) {
    case 'life':    player.lives = Math.min(5, player.lives + 1); break;
    case 'salvage': quietScore(5000); break;
    default:        player.mods[u.id] = (player.mods[u.id] || 0) + 1;
  }
  ui.upgrade.classList.add('hidden');
  state = 'PLAYING';
  spawner.betweenT = 1.6;                  // naeste wave = ny sektor -> intro
  popup(player.x, player.y - 40, u.name + '!', u.color, true);
  Sfx.odGo();
  updateHud();
}

/* ---------------- Game flow ---------------- */
function startGame() {
  Sfx.init(); Sfx.resume(); Sfx.startMusic();
  state = 'PLAYING';
  // Restart animation loop if it was killed by an uncaught exception
  if (!rafId) rafId = requestAnimationFrame(frame);
  paused = false;
  score = 0; wave = 0; shake = 0; hitStop = 0; gameTime = 0;
  overdrive = 0; odActive = 0;
  maxCombo = 0; grazes = 0; killTimes = []; lastStreakT = -9;
  scoreSubmitted = false;
  resetCombo();
  player = makePlayer();
  bullets = []; ebullets = []; enemies = []; powerups = []; particles = []; popups = [];
  hazards = []; respawnQueue = [];
  wallW = 0; wallTarget = 0; flashT = 0; upgradeDelay = 0;
  if (SECTORS.length) setPalette(SECTORS[0].pal, true);
  spawner.queue = []; spawner.betweenT = 0.8; spawner.bossAlive = false;
  ui.menu.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.pause.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  if (IS_TOUCH) {
    ui.btnPauseMob.classList.remove('hidden');
    reqWakeLock();
    // fullscreen + portrait-lock: virker på Android, ignoreres stille på iOS
    try {
      const fs = document.documentElement.requestFullscreen?.();
      if (fs && fs.then) fs.then(() => screen.orientation?.lock?.('portrait').catch(() => {})).catch(() => {});
    } catch { /* ignore */ }
  }
  if (ctrlMode === 'tilt' && tilt.enabled) {
    calibrateTilt();
    banner('TILT TO FLY');
  }
  updateHud();
}

function togglePause() {
  paused = !paused;
  ui.pause.classList.toggle('hidden', !paused);
}

function gameOver() {
  if (state === 'GAMEOVER') return;
  state = 'GAMEOVER';
  Sfx.stopMusic(); Sfx.over();
  Music.playStart();
  ui.hud.classList.add('hidden');
  ui.upgrade.classList.add('hidden');
  ui.btnOdMob.classList.add('hidden');
  ui.btnPauseMob.classList.add('hidden');
  ui.finalScore.textContent = score.toLocaleString('en-US');
  ui.finalWave.textContent = sectorLabel() + (loopNum() > 1 ? ' (LOOP ' + loopNum() + ')' : '');
  const bestMult = Math.min(1 + Math.floor(maxCombo / 5), 8);
  ui.finalStats.textContent = `BEST COMBO x${bestMult} · ${grazes} GRAZES`;
  ui.entry.classList.toggle('hidden', score === 0);
  ui.initials.classList.remove('hidden');
  ui.btnSubmit.classList.remove('hidden');
  ui.entryStatus.textContent = '';
  ui.btnSubmit.disabled = false;
  ui.initials.value = store.get('nb_initials') || '';
  ui.gameover.classList.remove('hidden');
  renderBoard(ui.overBoard);
  setTimeout(() => {
    ui.initials.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!IS_TOUCH) ui.initials.focus();
  }, 120);
}

/* ---------------- HUD ---------------- */
function sectorLabel(n = wave) {
  if (n <= 0) return '1-1';
  const s = sectorIndex(n) + 1;
  const w = waveInSector(n);
  return w === 5 ? s + '-BOSS' : s + '-' + w;
}

function updateHud() {
  ui.score.textContent = score.toLocaleString('en-US');
  ui.hiscore.textContent = hiscore.toLocaleString('en-US');
  ui.wave.textContent = sectorLabel();
  if (ui.loop) ui.loop.textContent = loopNum() > 1 ? 'LOOP ' + loopNum() : '';
  ui.lives.textContent = '▲'.repeat(Math.max(0, player ? player.lives : 0));
}

function updateComboUi() {
  const m = comboMult();
  if (m > 1 && comboT > 0) {
    ui.combo.classList.remove('hidden');
    ui.comboMult.textContent = 'x' + m + (odActive > 0 ? ' x2 OD' : '');
    ui.comboFill.style.width = (comboT / COMBO_WINDOW * 100) + '%';
  } else {
    ui.combo.classList.add('hidden');
  }
}

function updateOdUi() {
  const active = odActive > 0;
  ui.odFill.style.width = (active ? (odActive / odDuration()) * 100 : overdrive) + '%';
  ui.odWrap.classList.toggle('ready', !active && overdrive >= 100);
  ui.odWrap.classList.toggle('active', active);
  ui.odHint.classList.toggle('hidden', active || overdrive < 100);
  if (IS_TOUCH) {
    const show = state === 'PLAYING' && (overdrive >= 100 || active);
    ui.btnOdMob.classList.toggle('hidden', !show);
    ui.btnOdMob.classList.toggle('spent', active);
    ui.btnOdMob.textContent = active ? Math.ceil(odActive) + 's' : 'OD!';
  }
}

function updatePwUi() {
  if (!player) return;
  const p = player;
  const lines = [];
  if (p.weaponT > 0) lines.push((p.weapon === 'laser' ? 'LASER ' : 'TRIPLE ') + Math.ceil(p.weaponT) + 's');
  if (p.shieldT > 0) lines.push('SHIELD ' + Math.ceil(p.shieldT) + 's');
  const html = lines.map((l) => '<span>' + l + '</span>').join('');
  if (ui.pwStatus.innerHTML !== html) ui.pwStatus.innerHTML = html;
}

/* ---------------- Leaderboard (/api/scores → Neon via Vercel function) ---------------- */
const cfg = window.GAME_CONFIG || {};
const API_URL = cfg.API_URL || '/api/scores';

async function fetchPlayCount() {
  try {
    const res = await fetch('/api/plays');
    if (!res.ok) return;
    const { count } = await res.json();
    if (ui.playCount) {
      ui.playCount.textContent = '◉ ' + Number(count).toLocaleString() + ' BRAVE PILOTS HAVE PLAYED';
      ui.playCount.classList.remove('hidden');
    }
  } catch { /* fail silently */ }
}

async function fetchScores() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  } catch {
    // Lokal fallback hvis API ikke er tilgængeligt (fx lokal udvikling uden Vercel)
    try { return JSON.parse(store.get('nb_board') || '[]'); } catch { return []; }
  }
}

async function submitScore(name, sc, wv) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, score: sc, wave: wv }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  // Opdater lokal cache til offline-fallback
  try {
    const board = JSON.parse(store.get('nb_board') || '[]');
    board.push({ name, score: sc, wave: wv });
    board.sort((a, b) => b.score - a.score);
    store.set('nb_board', JSON.stringify(board.slice(0, 10)));
  } catch { /* ignore */ }
}

async function renderBoard(ol) {
  ol.innerHTML = '<li class="dim">Loading scores…</li>';
  try {
    const rows = await fetchScores();
    if (!rows.length) {
      ol.innerHTML = '<li class="dim">No scores yet — be the first!</li>';
      return;
    }
    ol.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = String(r.name || '???').toUpperCase().slice(0, 10);
      const sc = document.createElement('span');
      sc.textContent = Number(r.score).toLocaleString('en-US');
      li.append(nm, sc);
      ol.appendChild(li);
    }
  } catch (err) {
    console.error('Leaderboard:', err);
    ol.innerHTML = '<li class="dim">Could not load leaderboard</li>';
  }
}

async function fetchRank(sc) {
  try {
    const res = await fetch(API_URL + '?rank=' + sc);
    if (!res.ok) return null;
    const { rank } = await res.json();
    return Number.isFinite(rank) ? rank : null;
  } catch {
    const board = await fetchScores().catch(() => []);
    return board.filter((r) => Number(r.score) > sc).length + 1;
  }
}

ui.btnSubmit.addEventListener('click', async () => {
  const name = ui.initials.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 10);
  if (!name) { ui.entryStatus.textContent = 'Enter your name'; return; }
  ui.btnSubmit.disabled = true;
  ui.entryStatus.textContent = 'Saving…';
  store.set('nb_initials', name);
  const submittedScore = score;
  const submittedWave = wave;
  try {
    await submitScore(name, submittedScore, submittedWave);
    scoreSubmitted = true;
    ui.initials.blur();
    ui.initials.classList.add('hidden');
    ui.btnSubmit.classList.add('hidden');
    const rank = await fetchRank(submittedScore).catch(() => null);
    ui.entryStatus.textContent = rank ? `SAVED — YOU ARE #${rank} ON THE LIST!` : 'Saved!';
    renderBoard(ui.overBoard);
  } catch (err) {
    console.error('submitScore:', err);
    ui.entryStatus.textContent = err.message?.includes('500') ? 'Server error — check DB' : 'Network error — try again';
    ui.btnSubmit.disabled = false;
  }
});

ui.initials.addEventListener('input', () => {
  ui.initials.value = ui.initials.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 10);
});
ui.initials.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') ui.btnSubmit.click();
  e.stopPropagation();
});

ui.btnRestart.addEventListener('click', startGame);

/* ---------------- Sprite-cache ----------------
   Gloed pre-renderes til smaa offscreen-canvases, saa de varme stier
   (skud + partikler, hundredvis pr. frame) slipper for shadowBlur. */
const spriteCache = new Map();

function glowDot(color, coreR) {
  const key = 'dot|' + color + '|' + Math.round(coreR * 2);
  let c = spriteCache.get(key);
  if (c) return c;
  const glowR = coreR * 3;
  const size = Math.ceil(glowR * 2) + 4;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2;
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, glowR);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  spriteCache.set(key, c);
  return c;
}

function tracerSprite() {
  let c = spriteCache.get('tracer');
  if (c) return c;
  const w = Math.ceil(14 * S), h = Math.ceil(32 * S);
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);   // aflang lysende tracer
  grad.addColorStop(0, 'rgba(0,246,255,0)');
  grad.addColorStop(0.45, 'rgba(0,246,255,0.85)');
  grad.addColorStop(0.8, '#ffffff');
  grad.addColorStop(1, 'rgba(189,253,255,0.9)');
  g.fillStyle = grad;
  const bw = Math.max(3, 5 * S);
  g.fillRect(w / 2 - bw / 2, 0, bw, h);
  const side = g.createRadialGradient(w / 2, h * 0.75, 0, w / 2, h * 0.75, w / 2);
  side.addColorStop(0, 'rgba(0,246,255,0.55)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, w, h);
  spriteCache.set('tracer', c);
  return c;
}

/* ---------------- Render ---------------- */
/* Sektor-baggrundslag: proceduralt og billigt, genereres een gang */
function mkRockVerts(n = 9) {
  const v = [];
  for (let i = 0; i < n; i++) v.push(0.62 + Math.random() * 0.38);
  return v;
}
const bgFx = {
  city: Array.from({ length: 26 }, (_, i) => ({
    x: i / 26 + rand(-0.01, 0.01), w: rand(0.03, 0.065), h: rand(0.07, 0.26),
    z: i % 2 ? 1 : 0.55, win: rand(0.2, 0.9),
  })),
  rocks: Array.from({ length: 9 }, () => ({
    x: Math.random(), y: Math.random(), r: rand(16, 54) * S, rot: rand(0, TAU),
    vr: rand(-0.25, 0.25), vy: rand(6, 18), z: rand(0.3, 0.9), verts: mkRockVerts(),
  })),
  rain: Array.from({ length: 24 }, () => ({
    x: Math.random(), y: Math.random(), s: rand(90, 240), l: rand(40, 130) * S,
  })),
};

function drawSectorLayer(dt, anim) {
  const si = state === 'MENU' ? 0 : sectorIndex();
  const layer = SECTORS.length ? SECTORS[si].layer : 'city';
  const horizon = VH - 170;
  ctx.save();

  if (layer === 'city') {
    // by-silhuetter med taendte vinduer, 2 parallax-lag
    for (const b of bgFx.city) {
      const bh = b.h * VH * (b.z === 1 ? 1 : 0.7);
      const bx = b.x * VW, bw = b.w * VW;
      ctx.fillStyle = b.z === 1 ? 'rgba(4,0,12,0.95)' : 'rgba(10,3,26,0.9)';
      ctx.fillRect(bx, horizon - bh, bw, bh);
      if (b.z === 1) {
        ctx.fillStyle = rgba(PAL.glow, 0.30 + 0.12 * Math.sin(gameTime * 2 + b.x * 40));
        for (let wy = horizon - bh + 10; wy < horizon - 12; wy += 26) {
          ctx.fillRect(bx + bw * 0.25, wy, 3 * S, 5 * S);
          if (b.win > 0.5) ctx.fillRect(bx + bw * 0.62, wy + 9, 3 * S, 5 * S);
        }
      }
    }
  } else if (layer === 'rocks') {
    // drivende klippe-silhuetter
    for (const r of bgFx.rocks) {
      if (anim) {
        r.y += r.vy * r.z * dt / VH;
        r.rot += r.vr * dt;
        if (r.y > 1.1) { r.y = -0.15; r.x = Math.random(); }
      }
      ctx.save();
      ctx.translate(r.x * VW, r.y * VH);
      ctx.rotate(r.rot);
      ctx.globalAlpha = 0.25 + r.z * 0.35;
      ctx.fillStyle = '#1c0d05';
      ctx.strokeStyle = rgba(PAL.glow, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const rr = r.r * r.z;
      r.verts.forEach((v, i) => {
        const a = i / r.verts.length * TAU;
        const px = Math.cos(a) * rr * v, py = Math.sin(a) * rr * v;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else if (layer === 'sun') {
    // stor sol ved horisonten med pulserende korona og scanline-udskaeringer
    const sx = VW / 2, sy = horizon + 20, srad = 190 * S * (1 + 0.02 * Math.sin(gameTime * 1.4));
    const cor = ctx.createRadialGradient(sx, sy, srad * 0.3, sx, sy, srad * 2.2);
    cor.addColorStop(0, rgba(PAL.glow, 0.30));
    cor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, VW, VH);
    const sun = ctx.createLinearGradient(0, sy - srad, 0, sy + srad);
    sun.addColorStop(0, rgba(PAL.star, 0.95));
    sun.addColorStop(1, rgba(PAL.glow, 0.85));
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(sx, sy, srad, 0, TAU); ctx.fill();
    ctx.fillStyle = '#06010f';
    for (let i = 0; i < 7; i++) {
      const gy = sy - srad * 0.55 + i * srad * 0.24;
      ctx.fillRect(sx - srad, gy, srad * 2, (2 + i * 1.5) * S);
    }
  } else if (layer === 'tunnel') {
    // digital regn
    ctx.strokeStyle = rgba(PAL.grid, 0.30);
    ctx.lineWidth = 2 * S;
    for (const d of bgFx.rain) {
      if (anim) {
        d.y += d.s * dt / VH;
        if (d.y > 1.1) { d.y = -0.12; d.x = Math.random(); }
      }
      const dx = d.x * VW, dy = d.y * VH;
      const gr = ctx.createLinearGradient(0, dy - d.l, 0, dy);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, rgba(PAL.grid, 0.5));
      ctx.strokeStyle = gr;
      ctx.beginPath(); ctx.moveTo(dx, dy - d.l); ctx.lineTo(dx, dy); ctx.stroke();
    }
  } else if (layer === 'hull') {
    // mothership-skrog der vokser wave for wave
    const grow = state === 'MENU' ? 0.3 : Math.min(1, waveInSector() / 5 + 0.2);
    const hh = VH * 0.16 * grow;
    ctx.fillStyle = 'rgba(8,2,14,0.92)';
    ctx.fillRect(0, 0, VW, hh);
    ctx.strokeStyle = rgba(PAL.glow, 0.35);
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(0, hh * i / 5); ctx.lineTo(VW, hh * i / 5); ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const lx = (i + 0.5) / 9 * VW;
      ctx.fillStyle = rgba(PAL.glow, Math.sin(gameTime * 3 + i * 1.7) > 0.4 ? 0.8 : 0.15);
      ctx.fillRect(lx - 2 * S, hh - 8 * S, 4 * S, 4 * S);
    }
  }
  ctx.restore();
}

function drawBackground(dt) {
  lerpPal(dt);
  const anim = state === 'PLAYING' && !paused;
  ctx.fillStyle = '#06010f';
  ctx.fillRect(0, 0, VW, VH);
  // sektor-himmel
  const sky = ctx.createLinearGradient(0, 0, 0, VH * 0.7);
  sky.addColorStop(0, rgba(PAL.sky, 0.55));
  sky.addColorStop(1, 'rgba(6,1,15,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH * 0.7);
  drawSectorLayer(dt, anim);

  // stjerner (parallax)
  for (const s of stars) {
    if (state === 'PLAYING' && !paused) {
      s.y += (30 + s.z * 110) * dt;
      if (s.y > VH) { s.y = -2; s.x = rand(0, VW); }
    }
    ctx.globalAlpha = 0.35 + s.z * 0.6;
    ctx.fillStyle = s.z > 0.75 ? '#ffffff' : rgba(PAL.star, 1);
    ctx.fillRect(s.x, s.y, s.z * 2.2 * S, s.z * 2.2 * S);
  }
  ctx.globalAlpha = 1;

  // perspektiv-grid i bunden
  const horizon = VH - 170;
  if (state === 'PLAYING' && !paused) gridScroll = (gridScroll + dt * 60) % 40;
  ctx.strokeStyle = rgba(PAL.grid, 0.20);
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const t = (i * 40 + gridScroll) / 360;
    const y = horizon + t * t * 170;
    if (y > VH) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke();
  }
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(VW / 2 + i * 70, horizon);
    ctx.lineTo(VW / 2 + i * 260, VH);
    ctx.stroke();
  }
  // horisont-glow
  const g = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 30);
  g.addColorStop(0, rgba(PAL.glow, 0));
  g.addColorStop(0.55, rgba(PAL.glow, 0.16));
  g.addColorStop(1, rgba(PAL.glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon - 40, VW, 70);
}

function drawShip(p) {
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return; // blink ved invulnerability
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((p.bank || 0) * 0.3);           // banking ved sidebevaegelse
  // exhaust-flamme (bag kroppen)
  const fl = (7 + Math.sin(gameTime * 42) * 2.5 + rand(0, 2)) * S * G;
  ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 12;
  ctx.fillStyle = odActive > 0 ? '#ff2bd6' : '#ffb000';
  ctx.beginPath();
  ctx.moveTo(-4 * S * G, 11 * S * G);
  ctx.lineTo(0, 12 * S * G + fl);
  ctx.lineTo(4 * S * G, 11 * S * G);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#00f6ff';
  ctx.beginPath();
  ctx.moveTo(0, -18*S*G); ctx.lineTo(13*S*G, 12*S*G); ctx.lineTo(5*S*G, 7*S*G);
  ctx.lineTo(0, 13*S*G); ctx.lineTo(-5*S*G, 7*S*G); ctx.lineTo(-13*S*G, 12*S*G);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-2*S*G, -8*S*G, 4*S*G, 8*S*G);
  if (p.shieldT > 0) {
    ctx.shadowBlur = 12; ctx.shadowColor = '#39ff6a';
    ctx.strokeStyle = 'rgba(57,255,106,' + (p.shieldT < 2 ? 0.3 + 0.4 * Math.abs(Math.sin(p.shieldT * 8)) : 0.7) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 26 * S * G, 0, TAU); ctx.stroke();
  }
  if (odActive > 0) {
    ctx.shadowBlur = 18; ctx.shadowColor = '#ff2bd6';
    ctx.strokeStyle = 'rgba(255,43,214,0.8)';
    ctx.lineWidth = 2.5;
    const rr = (30 + Math.sin(gameTime * 14) * 4) * S * G;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
  }
  ctx.restore();

  // laser-stråle
  if (p.weapon === 'laser' && (keys[' '] || touchActive)) {
    ctx.save();
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 20;
    const grad = ctx.createLinearGradient(p.x - LASER_W / 2, 0, p.x + LASER_W / 2, 0);
    grad.addColorStop(0, 'rgba(255,43,214,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,43,214,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(p.x - LASER_W / 2, 0, LASER_W, p.y - 16 * S);
    ctx.restore();
  }
}

/* Boss-kroppe — kaldes fra drawEnemy i translated context (0,0 = boss-center) */
function drawBossBody(e, c) {
  switch (e.bossKind) {
    case 'crusher': {
      ctx.rotate(Math.sin(e.t * 0.8) * 0.04);
      ctx.beginPath();                       // bred knuser-krop
      ctx.moveTo(-e.r, -e.r * 0.5);
      ctx.lineTo(-e.r * 0.5, -e.r * 0.9);
      ctx.lineTo(e.r * 0.5, -e.r * 0.9);
      ctx.lineTo(e.r, -e.r * 0.5);
      ctx.lineTo(e.r * 0.85, e.r * 0.35);
      ctx.lineTo(-e.r * 0.85, e.r * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#ff7b00';   // knuser-taender
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * e.r * 0.34 - e.r * 0.14, e.r * 0.35);
        ctx.lineTo(i * e.r * 0.34, e.r * 0.8 + Math.sin(e.t * 6 + i) * e.r * 0.1);
        ctx.lineTo(i * e.r * 0.34 + e.r * 0.14, e.r * 0.35);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#06010f';
      ctx.fillRect(-e.r * 0.45, -e.r * 0.6, e.r * 0.9, e.r * 0.22);
      break;
    }
    case 'solarcore': {
      // straaler (bag kernen)
      for (const a of e.beams) {
        ctx.save();
        ctx.rotate(a);
        if (e.beamMode === 'warn') {
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(e.t * 16));
          ctx.strokeStyle = '#ffb000';
          ctx.lineWidth = 2;
          ctx.setLineDash([16, 12]);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1300, 0); ctx.stroke();
          ctx.setLineDash([]);
        } else if (e.beamMode === 'on') {
          const bw = 28 * S;
          const grad = ctx.createLinearGradient(0, -bw / 2, 0, bw / 2);
          grad.addColorStop(0, 'rgba(255,176,0,0)');
          grad.addColorStop(0.5, 'rgba(255,255,220,0.9)');
          grad.addColorStop(1, 'rgba(255,176,0,0)');
          ctx.fillStyle = grad;
          ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 18;
          ctx.fillRect(0, -bw / 2, 1300, bw);
        }
        ctx.restore();
      }
      // kerne: pulserende sol
      ctx.shadowColor = c; ctx.shadowBlur = 24;
      const rr = e.r * (1 + 0.04 * Math.sin(e.t * 5));
      const cg = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
      cg.addColorStop(0, '#fffbe0');
      cg.addColorStop(0.55, e.flash > 0 ? '#ffffff' : '#ffb000');
      cg.addColorStop(1, e.flash > 0 ? '#ffffff' : '#ff4d1a');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#06010f';               // indre roterende trekant
      ctx.lineWidth = 3;
      ctx.save();
      ctx.rotate(e.t * 1.4);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU;
        const px = Math.cos(a) * rr * 0.5, py = Math.sin(a) * rr * 0.5;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'firewall': {
      ctx.shadowBlur = 10;
      for (let i = 0; i < 7; i++) {
        const sg = e.segs[i];
        const sx = (i - 3) * e.segW;
        const hw = e.segW / 2 - 3, hh = e.segH / 2;
        if (sg.weak) {                         // svagt punkt: lysende og pulserende
          const pulse = 0.55 + 0.35 * Math.abs(Math.sin(e.t * 6 + i));
          ctx.fillStyle = e.flash > 0 ? '#fff' : 'rgba(57,255,106,' + pulse + ')';
          ctx.fillRect(sx - hw, -hh, hw * 2, hh * 2);
          ctx.fillStyle = '#06010f';
          ctx.beginPath(); ctx.arc(sx, 0, hh * 0.35, 0, TAU); ctx.fill();
        } else {                               // pansret segment
          ctx.fillStyle = '#0a2415';
          ctx.fillRect(sx - hw, -hh, hw * 2, hh * 2);
          ctx.strokeStyle = c; ctx.lineWidth = 2;
          ctx.strokeRect(sx - hw, -hh, hw * 2, hh * 2);
          ctx.strokeStyle = 'rgba(57,255,106,0.25)';
          ctx.beginPath();
          ctx.moveTo(sx - hw, hh); ctx.lineTo(sx + hw, -hh);
          ctx.stroke();
        }
      }
      break;
    }
    case 'mothership': {
      ctx.rotate(Math.sin(e.t * 0.6) * 0.02);
      ctx.beginPath();                         // bredt skrog
      ctx.moveTo(-e.r * 2.6, -e.r * 0.15);
      ctx.lineTo(-e.r * 1.4, -e.r * 0.85);
      ctx.lineTo(e.r * 1.4, -e.r * 0.85);
      ctx.lineTo(e.r * 2.6, -e.r * 0.15);
      ctx.lineTo(e.r * 1.7, e.r * 0.55);
      ctx.lineTo(-e.r * 1.7, e.r * 0.55);
      ctx.closePath();
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#1a0530';
      ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
      for (const pod of e.pods) {              // side-pods (fase 1)
        if (!pod.alive) continue;
        ctx.save();
        ctx.translate(pod.dx, pod.dy);
        ctx.shadowColor = '#c86bff'; ctx.shadowBlur = 14;
        ctx.fillStyle = pod.hp < pod.maxHp * 0.35 && Math.sin(e.t * 10) > 0 ? '#fff' : '#c86bff';
        ctx.beginPath(); ctx.arc(0, 0, 24 * S * G, 0, TAU); ctx.fill();
        ctx.fillStyle = '#06010f';
        ctx.beginPath(); ctx.arc(0, 6 * S, 9 * S * G, 0, TAU); ctx.fill();
        ctx.restore();
      }
      const shielded = e.pods.some((pd) => pd.alive);
      ctx.shadowColor = c; ctx.shadowBlur = 18;  // kerne
      ctx.fillStyle = e.flash > 0 ? '#fff' : c;
      ctx.beginPath(); ctx.arc(0, e.r * 0.05, e.r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#06010f';
      const blink3 = Math.sin(e.t * 3) > 0.85 ? 0.3 : 1;
      ctx.fillRect(-e.r * 0.28, -e.r * 0.1, e.r * 0.2, e.r * 0.2 * blink3);
      ctx.fillRect(e.r * 0.08, -e.r * 0.1, e.r * 0.2, e.r * 0.2 * blink3);
      if (shielded) {                          // skjold-ring om kernen
        ctx.strokeStyle = 'rgba(200,107,255,' + (0.4 + 0.3 * Math.sin(e.t * 8)) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, e.r * 0.05, e.r * 0.75, 0, TAU); ctx.stroke();
      }
      break;
    }
    default: {                                 // GATEKEEPER
      ctx.rotate(Math.sin(e.t) * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r * 0.9, -e.r * 0.25);
      ctx.lineTo(e.r * 0.65, e.r * 0.8);
      ctx.lineTo(0, e.r * 0.5);
      ctx.lineTo(-e.r * 0.65, e.r * 0.8);
      ctx.lineTo(-e.r * 0.9, -e.r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#06010f';
      const blink2 = Math.sin(e.t * 3) > 0.85 ? 0.3 : 1;
      ctx.fillRect(-e.r * 0.5, -e.r * 0.35, e.r * 0.32, e.r * 0.3 * blink2);
      ctx.fillRect(e.r * 0.18, -e.r * 0.35, e.r * 0.32, e.r * 0.3 * blink2);
    }
  }
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const c = e.flash > 0 ? '#ffffff' : e.color;
  ctx.shadowColor = c; ctx.shadowBlur = 14;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.5;

  switch (e.type) {
    case 'drone':
      ctx.rotate(Math.sin(e.t * 2) * 0.15);
      ctx.beginPath();
      ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#06010f';
      ctx.fillRect(-4, -4, 8, 8);
      break;
    case 'diver':
      ctx.rotate(e.state === 2 ? Math.atan2(e.vy, e.vx) + Math.PI / 2 : Math.PI);
      ctx.beginPath();
      ctx.moveTo(0, -e.r); ctx.lineTo(e.r * 0.8, e.r); ctx.lineTo(0, e.r * 0.45); ctx.lineTo(-e.r * 0.8, e.r);
      ctx.closePath(); ctx.fill();
      break;
    case 'tank': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + Math.PI / 6;
        const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r * 0.8;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, TAU); ctx.fill();
      // hp-bar
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(-e.r, -e.r - 10, e.r * 2, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(-e.r, -e.r - 10, e.r * 2 * (e.hp / e.maxHp), 4);
      break;
    }
    case 'splitter':
      ctx.rotate(e.t * 2.5);
      ctx.strokeRect(-e.r * 0.75, -e.r * 0.75, e.r * 1.5, e.r * 1.5);
      ctx.fillRect(-e.r * 0.32, -e.r * 0.32, e.r * 0.64, e.r * 0.64);
      break;
    case 'mini':
      ctx.rotate(e.t * 5);
      ctx.fillRect(-e.r * 0.8, -e.r * 0.8, e.r * 1.6, e.r * 1.6);
      break;
    case 'sniper': {
      // telegraferet sigtelinje
      if (e.phase === 'tele' || e.phase === 'fire') {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = e.phase === 'fire' ? 0.85 : 0.25 + 0.4 * Math.abs(Math.sin(e.t * 18));
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = e.phase === 'fire' ? 2.5 : 1.5;
        ctx.setLineDash(e.phase === 'fire' ? [] : [12, 9]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(e.ang) * 1400, Math.sin(e.ang) * 1400);
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(-e.r, -e.r * 0.7); ctx.lineTo(e.r, -e.r * 0.7); ctx.lineTo(0, e.r);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#06010f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.35, 0, TAU); ctx.stroke();
      break;
    }
    case 'miner': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r * 0.75;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      // lastluge, blinker naar en mine er paa vej
      ctx.fillStyle = '#06010f';
      ctx.fillRect(-e.r * 0.3, e.r * 0.15, e.r * 0.6, e.r * 0.4);
      if (e.dropT < 0.5) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-e.r * 0.15, e.r * 0.2, e.r * 0.3, e.r * 0.3);
      }
      break;
    }
    case 'mine': {
      const armed = e.armT <= 0;
      ctx.rotate(e.t * 0.8);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {           // pigge
        const a = i / 6 * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5);
        ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = armed && Math.sin(e.t * 16) > 0 ? '#ff2222' : '#06010f';
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, TAU); ctx.fill();
      break;
    }
    case 'phoenix': {
      ctx.rotate(Math.PI);                     // naeb nedad
      const hot = e.reborn ? '#ffdd55' : c;
      ctx.shadowColor = hot; ctx.fillStyle = hot;
      ctx.beginPath();                         // fugleagtig delta med vinger
      ctx.moveTo(0, -e.r * 1.1);
      ctx.quadraticCurveTo(e.r * 1.3, -e.r * 0.2, e.r * 0.55, e.r);
      ctx.lineTo(0, e.r * 0.4);
      ctx.lineTo(-e.r * 0.55, e.r);
      ctx.quadraticCurveTo(-e.r * 1.3, -e.r * 0.2, 0, -e.r * 1.1);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, -e.r * 0.2, e.r * 0.2, 0, TAU); ctx.fill();
      break;
    }
    case 'phantom': {
      const alpha = e.phase === 'vis' ? 1 : e.phase === 'fade' ? clamp(e.phaseT / 0.4, 0, 1) : 0.12;
      ctx.globalAlpha = alpha;
      ctx.rotate(Math.sin(e.t * 2) * 0.15);
      if (e.phase === 'out') {                 // kun spoegelses-omrids
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
        ctx.closePath(); ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -e.r); ctx.lineTo(e.r, 0); ctx.lineTo(0, e.r); ctx.lineTo(-e.r, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#06010f';
        ctx.fillRect(-4, -4, 8, 8);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'turret': {
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#1a0530';
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7);
      ctx.fillRect(-e.r * 0.85, -e.r * 0.85, e.r * 1.7, e.r * 1.7);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, TAU); ctx.fill();
      ctx.lineWidth = 4;                       // kanonroer mod spilleren
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(e.ang) * e.r * 1.1, Math.sin(e.ang) * e.r * 1.1);
      ctx.stroke();
      break;
    }
    case 'asteroid':
    case 'rock': {
      ctx.shadowBlur = 0;                      // sten gloeder ikke
      ctx.rotate(e.rot);
      ctx.fillStyle = e.flash > 0 ? '#fff' : '#241207';
      ctx.strokeStyle = e.flash > 0 ? '#fff' : c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      e.verts.forEach((v, i) => {
        const a = i / e.verts.length * TAU;
        const px = Math.cos(a) * e.r * v, py = Math.sin(a) * e.r * v;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    }
    case 'boss':
      drawBossBody(e, c);
      break;
  }
  ctx.restore();

  if (e.type === 'boss') {
    // boss hp-bar i toppen
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(VW * 0.15, 64 * S, VW * 0.7, 10 * S);
    ctx.fillStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 10;
    ctx.fillRect(VW * 0.15, 64 * S, VW * 0.7 * Math.max(0, e.hp / e.maxHp), 10 * S);
    ctx.restore();
  }
}

function drawScene(dt) {
  ctx.save();
  if (shake > 0) {
    ctx.translate(rand(-shake, shake), rand(-shake, shake));
    shake = Math.max(0, shake - dt * 38);
  }

  drawBackground(dt);

  if (player && state !== 'MENU') {
    // powerups
    for (const u of powerups) {
      ctx.save();
      ctx.translate(u.x, u.y);
      const pulse = 1 + Math.sin(u.t * 6) * 0.12;
      ctx.scale(pulse, pulse);
      ctx.shadowColor = u.def.color; ctx.shadowBlur = 14;
      ctx.strokeStyle = u.def.color; ctx.lineWidth = 2.5;
      ctx.strokeRect(-u.r, -u.r, u.r * 2, u.r * 2);
      ctx.fillStyle = u.def.color;
      ctx.font = `${Math.round(14 * S)}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(u.def.id, 0, 1);
      ctx.restore();
    }

    // skud (pre-renderede gloed-sprites — ingen shadowBlur her)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tr = tracerSprite();
    for (const b of bullets) {
      ctx.drawImage(tr, b.x - tr.width / 2, b.y - tr.height * 0.7);
    }
    for (const b of ebullets) {
      const spr = glowDot(b.color, b.r);
      ctx.drawImage(spr, b.x - spr.width / 2, b.y - spr.height / 2);
    }
    ctx.restore();

    for (const e of enemies) drawEnemy(e);
    drawShip(player);

    // WINGMAN-droner
    for (const d of player.drones) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.shadowColor = '#39ff6a'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#39ff6a';
      ctx.beginPath();
      ctx.moveTo(0, -8 * S * G); ctx.lineTo(6 * S * G, 6 * S * G); ctx.lineTo(-6 * S * G, 6 * S * G);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#06010f';
      ctx.fillRect(-1.5 * S * G, -3 * S * G, 3 * S * G, 4 * S * G);
      ctx.restore();
    }

    // hazards: solstorms-flares
    for (const h of hazards) {
      if (h.kind !== 'flare') continue;
      if (h.phase === 'warn') {
        ctx.fillStyle = 'rgba(255,200,80,' + (0.10 + 0.10 * Math.abs(Math.sin(gameTime * 14))) + ')';
        ctx.fillRect(h.x - h.w / 2, 0, h.w, VH);
        ctx.strokeStyle = 'rgba(255,120,30,0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(h.x - h.w / 2, 0); ctx.lineTo(h.x - h.w / 2, VH);
        ctx.moveTo(h.x + h.w / 2, 0); ctx.lineTo(h.x + h.w / 2, VH);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const grad = ctx.createLinearGradient(h.x - h.w / 2, 0, h.x + h.w / 2, 0);
        grad.addColorStop(0, 'rgba(255,120,30,0)');
        grad.addColorStop(0.5, 'rgba(255,235,170,0.85)');
        grad.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(h.x - h.w / 2, 0, h.w, VH);
      }
    }

    // tunnelvaegge
    if (wallW > 2) {
      for (const side of [0, 1]) {
        const x0 = side ? VW - wallW : 0;
        const edge = side ? x0 : wallW;
        ctx.fillStyle = 'rgba(3,20,10,0.85)';
        ctx.fillRect(x0, 0, wallW, VH);
        ctx.save();
        ctx.strokeStyle = rgba(PAL.grid, 0.9);
        ctx.shadowColor = rgba(PAL.grid, 1); ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(edge, 0); ctx.lineTo(edge, VH); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = rgba(PAL.grid, 0.25);
        ctx.lineWidth = 2;
        for (let y = (gridScroll * 2) % 46 - 46; y < VH; y += 46) {
          ctx.beginPath();
          if (side) { ctx.moveTo(VW - wallW + 6, y); ctx.lineTo(VW - 6, y + 18); }
          else { ctx.moveTo(wallW - 6, y); ctx.lineTo(6, y + 18); }
          ctx.stroke();
        }
      }
    }

    // partikler (gloed-sprites, kvantiseret radius for lille cache)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pa of particles) {
      ctx.globalAlpha = clamp(pa.t * 2, 0, 1);
      const spr = glowDot(pa.color, Math.max(1, Math.round(pa.r)));
      ctx.drawImage(spr, pa.x - spr.width / 2, pa.y - spr.height / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // score-popups
    ctx.save();
    ctx.textAlign = 'center';
    for (const po of popups) {
      ctx.font = `${po.big ? Math.round(24 * S) : Math.round(13 * S)}px "Press Start 2P", monospace`;
      ctx.globalAlpha = clamp(po.t, 0, 1);
      ctx.shadowColor = po.color; ctx.shadowBlur = po.big ? 18 : 8;
      ctx.fillStyle = po.color;
      ctx.fillText(po.text, po.x, po.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // overdrive-overlay: cyan/pink kant-glød
    if (odActive > 0) {
      const a = odActive < 1 ? odActive : 1;   // fade ud til sidst
      const g2 = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.32, VW / 2, VH / 2, VH * 0.72);
      g2.addColorStop(0, 'rgba(0,246,255,0)');
      g2.addColorStop(1, `rgba(255,43,214,${0.16 * a})`);
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, VW, VH);
    }

    // hvid flash ved boss-doed
    if (flashT > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flashT / 0.4 * 0.75).toFixed(3) + ')';
      ctx.fillRect(0, 0, VW, VH);
    }

    // wave-banner
    if (bannerT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(bannerT, 0, 1);
      ctx.font = `${Math.round(38 * S)}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      const col = bannerText.includes('BOSS') ? '#ff2bd6' : '#ffb000';
      ctx.shadowColor = col; ctx.shadowBlur = 24;
      ctx.fillStyle = col;
      ctx.fillText(bannerText, VW / 2, VH * 0.4);
      ctx.restore();
    }
  }

  ctx.restore();
}

/* ---------------- Main loop ---------------- */
let lastT = performance.now();
let rafId = 0;
function frame(now) {
  rafId = 0; // ryddet mens denne frame kører; sættes igen i finally
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // ALT spil-arbejde wrappes i try/finally: en enkelt uventet exception
  // må ALDRIG dræbe rAF-kæden (det var årsagen til "spillet fryser, kan
  // kun reloade"). Vi logger fejlen og planlægger altid næste frame.
  try {
    // hit-stop: kort frys ved kills giver slag-fornemmelse
    if (hitStop > 0 && state === 'PLAYING' && !paused) {
      hitStop -= dt;
      drawScene(0);
      return;
    }

    if (state === 'PLAYING' && !paused) {
      gameTime += dt;
      odActive = Math.max(0, odActive - dt);
      updatePlayer(dt);
      updateSpawner(dt);
      updateEnemies(dt);
      updateBullets(dt);
      updatePowerups(dt);
      updateHazards(dt);

      // phoenix-genopstandelser
      for (let i = respawnQueue.length - 1; i >= 0; i--) {
        const rq = respawnQueue[i];
        rq.t -= dt;
        if (rq.t <= 0) {
          respawnQueue.splice(i, 1);
          spawnEnemy('phoenix', rq.x, -30);
          const ph = enemies[enemies.length - 1];
          ph.reborn = true; ph.hp = ph.maxHp = 1;
          boom(rq.x, 20, '#ffdd55', 12, 200);
        }
      }

      // boss doed -> kort ro -> upgrade-valg
      if (upgradeDelay > 0) {
        upgradeDelay -= dt;
        if (upgradeDelay <= 0) openUpgrade();
      }

      comboT = Math.max(0, comboT - dt);
      if (comboT === 0 && combo > 0) combo = 0;
      updateComboUi();
      updateOdUi();
      updatePwUi();
      ui.score.textContent = score.toLocaleString('en-US');
      ui.hiscore.textContent = hiscore.toLocaleString('en-US');

      bannerT = Math.max(0, bannerT - dt);
    }

    if (!paused) {
      flashT = Math.max(0, flashT - dt);
      for (let i = particles.length - 1; i >= 0; i--) {
        const pa = particles[i];
        pa.t -= dt;
        if (pa.t <= 0) { particles.splice(i, 1); continue; }
        pa.x += pa.vx * dt; pa.y += pa.vy * dt;
        pa.vy += 60 * dt;
      }
      for (let i = popups.length - 1; i >= 0; i--) {
        const po = popups[i];
        po.t -= dt; po.y -= 45 * dt;
        if (po.t <= 0) popups.splice(i, 1);
      }
    }

    drawScene(dt);
  } catch (err) {
    // Spring den dårlige frame over, men hold loopet i live.
    console.error('NEON BREACH: frame error (skipping, continuing):', err);
  } finally {
    rafId = requestAnimationFrame(frame);
  }
}

/* ---------------- Init ---------------- */
// Touch and desktop both start with the INSERT COIN button.
// On touch, tapping it opens the control picker; on desktop it starts immediately.
ui.btnTilt.addEventListener('click', async (e) => {
  e.stopPropagation();
  ui.ctrlStatus.textContent = '';
  const ok = await enableTilt();   // skal ske i user-gesture pga. iOS-permission
  if (ok) startGame();
  else ui.ctrlStatus.textContent = 'Tilt not available — using drag controls';
});
ui.btnDrag.addEventListener('click', (e) => {
  e.stopPropagation();
  ctrlMode = 'drag';
  store.set('nb_ctrl', 'drag');
  startGame();
});
ui.btnOdMob.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); tryOverdrive(); }, { passive: false });
ui.btnPauseMob.addEventListener('touchstart', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (state === 'PLAYING') togglePause();
}, { passive: false });
ui.pause.addEventListener('click', () => { if (paused) togglePause(); });   // tap for at fortsætte
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state === 'PLAYING' && IS_TOUCH) reqWakeLock();   // wake lock slippes ved tab-skift
});

ui.hiscore.textContent = hiscore.toLocaleString('en-US');
renderBoard(ui.menuBoard);
fetchPlayCount();
Music.init();
// Music only starts when the user clicks INSERT COIN (dismissCoinScreen handles it)
rafId = requestAnimationFrame(frame);
