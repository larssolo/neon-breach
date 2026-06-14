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
  pressStart: $('press-start'), ctrlPick: $('ctrl-pick'), btnTilt: $('btn-tilt'),
  btnDrag: $('btn-drag'), ctrlStatus: $('ctrl-status'),
  btnOdMob: $('btn-od-mob'), btnPauseMob: $('btn-pause-mob'),
  menu: $('menu'), menuBoard: $('menu-board'), pause: $('pause'),
  gameover: $('gameover'), finalScore: $('final-score'), finalWave: $('final-wave'),
  entry: $('entry'), initials: $('initials'), btnSubmit: $('btn-submit'),
  entryStatus: $('entry-status'), overBoard: $('over-board'), btnRestart: $('btn-restart'),
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
  if (e.key === ' ' && state === 'MENU') startGame();
  if (e.key === ' ' && state === 'GAMEOVER' && (scoreSubmitted || ui.entry.classList.contains('hidden'))) startGame();
  if (e.key === 'Shift' && state === 'PLAYING' && !paused) tryOverdrive();
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
// Desktop: klik/space starter. Touch-enheder starter via styringsvælgeren.
ui.menu.addEventListener('click', () => { if (state === 'MENU' && !IS_TOUCH) startGame(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'PLAYING' && !paused) togglePause();
});

/* ---------------- Game state ---------------- */
let state = 'MENU';        // MENU | PLAYING | GAMEOVER
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
  odActive = 6;
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
    lives: 3, inv: 0, fireCd: 0,
    weapon: 'single', weaponT: 0, shieldT: 0, slowT: 0,
  };
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
  p.x = clamp(p.x, p.r + 6, VW - p.r - 6);
  p.y = clamp(p.y, VH * 0.42, VH - p.r - 10);

  // motor-trail
  if (Math.random() < (REDUCED_MOTION ? 0.3 : 0.85)) {
    particles.push({ x: p.x + rand(-4, 4), y: p.y + 16 * S, vx: rand(-20, 20), vy: rand(120, 200), t: rand(0.15, 0.3), color: '#00f6ff', r: rand(1, 2.5) * S });
  }

  p.inv = Math.max(0, p.inv - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  if (p.weaponT > 0) { p.weaponT -= dt; if (p.weaponT <= 0) p.weapon = 'single'; }
  p.shieldT = Math.max(0, p.shieldT - dt);
  p.slowT = Math.max(0, p.slowT - dt);

  const firing = keys[' '] || touchActive;
  if (firing) {
    if (odActive > 0) {
      if (p.fireCd === 0) {
        p.fireCd = 0.1;
        Sfx.shoot();
        for (const a of [-0.34, -0.17, 0, 0.17, 0.34]) {
          bullets.push({ x: p.x, y: p.y - 16 * S, vx: Math.sin(a) * 820 * S, vy: -Math.cos(a) * 820 * S, r: 4 * S, dmg: 1 });
        }
      }
    } else if (p.weapon === 'laser') {
      Sfx.laserHum();
      laserDamage(dt);
    } else if (p.fireCd === 0) {
      Sfx.shoot();
      if (p.weapon === 'triple') {
        p.fireCd = 0.18;
        for (const a of [-0.22, 0, 0.22]) {
          bullets.push({ x: p.x, y: p.y - 16 * S, vx: Math.sin(a) * 760 * S, vy: -Math.cos(a) * 760 * S, r: 4 * S, dmg: 1 });
        }
      } else {
        p.fireCd = 0.15;
        bullets.push({ x: p.x - 7 * S, y: p.y - 12 * S, vx: 0, vy: -780 * S, r: 4 * S, dmg: 1 });
        bullets.push({ x: p.x + 7 * S, y: p.y - 12 * S, vx: 0, vy: -780 * S, r: 4 * S, dmg: 1 });
      }
    }
  }
}

const LASER_W = 26 * S;
function laserDamage(dt) {
  const p = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
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
function updateBullets(dt, ts) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -20 || b.x < -20 || b.x > VW + 20) { bullets.splice(i, 1); continue; }
    for (const e of enemies) {
      const dx = b.x - e.x, dy = b.y - e.y;
      if (dx * dx + dy * dy < (b.r + e.r) * (b.r + e.r)) {
        e.hp -= b.dmg;
        e.flash = 0.08;
        bullets.splice(i, 1);
        particles.push({ x: b.x, y: b.y, vx: rand(-50, 50), vy: rand(-80, 0), t: 0.18, color: '#fff', r: 2 * S });
        if (e.hp <= 0) killEnemy(e);
        break;
      }
    }
  }
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt * ts; b.y += b.vy * dt * ts;
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
      quietScore(25);
      gainOD(5);
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
  boss:     { hp: 60, r: 56 * S * G, score: 5000, color: '#ff2bd6' },
};

function spawnEnemy(type, x = rand(60, VW - 60), y = -40) {
  const d = E_DEFS[type];
  const e = {
    type, x, y, r: d.r, color: d.color, score: d.score,
    hp: d.hp, maxHp: d.hp, t: rand(0, TAU), flash: 0,
    state: 0, fireT: rand(1, 2.5), baseX: x,
  };
  if (type === 'tank') { e.hp = e.maxHp = d.hp + Math.floor(wave * 0.8); }
  if (type === 'sniper') { e.ty = rand(95 * S, 175 * S); e.phase = 'aim'; e.aimT = rand(1.0, 1.8); e.ang = Math.PI / 2; }
  if (type === 'boss') {
    e.hp = e.maxHp = d.hp + wave * 18;
    e.score = d.score + wave * 400;
    e.x = VW / 2; e.attackT = 2; e.attack = 0;
    e.burstN = 0; e.burstT = 0;
    spawner.bossAlive = true;
    Sfx.bossIn();
    banner('!! BOSS !!');
  }
  enemies.push(e);
}

function updateEnemies(dt, ts) {
  const p = player;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt * ts;
    e.flash = Math.max(0, e.flash - dt);
    const speedUp = 1 + wave * 0.035;

    switch (e.type) {
      case 'drone':
        e.y += 75 * S * speedUp * dt * ts;
        e.x = e.baseX + Math.sin(e.t * 2.2) * 60;
        break;

      case 'diver':
        if (e.state === 0) {
          e.y += 110 * S * dt * ts;
          if (e.y > rand(120 * S, 200 * S)) { e.state = 1; e.pauseT = 0.5; }
        } else if (e.state === 1) {
          e.pauseT -= dt * ts;
          e.x += Math.sin(e.t * 8) * 40 * dt;
          if (e.pauseT <= 0) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            e.vx = Math.cos(a) * 460 * S * speedUp; e.vy = Math.sin(a) * 460 * S * speedUp;
            e.state = 2;
          }
        } else {
          e.x += e.vx * dt * ts; e.y += e.vy * dt * ts;
        }
        break;

      case 'tank':
        if (e.y < 170 * S) e.y += 45 * S * dt * ts;
        e.x = e.baseX + Math.sin(e.t * 0.8) * 30;
        e.fireT -= dt * ts;
        if (e.fireT <= 0 && e.y > 60) {
          e.fireT = Math.max(1.2, 2.4 - wave * 0.06);
          for (const a of [-0.3, 0, 0.3]) {
            const ang = Math.atan2(p.y - e.y, p.x - e.x) + a;
            ebullets.push({ x: e.x, y: e.y + 10 * S, vx: Math.cos(ang) * 230 * S, vy: Math.sin(ang) * 230 * S, r: 5 * S, color: '#39ff6a' });
          }
        }
        break;

      case 'splitter':
        e.y += 85 * S * speedUp * dt * ts;
        e.x += Math.cos(e.t * 3) * 130 * dt * ts;
        break;

      case 'mini':
        e.y += 150 * S * speedUp * dt * ts;
        e.x += Math.sin(e.t * 9) * 220 * dt * ts;
        break;

      case 'sniper':
        if (e.y < e.ty) {
          e.y += 130 * S * dt * ts;
        } else if (e.phase === 'aim') {
          e.x = e.baseX + Math.sin(e.t * 1.4) * 45;
          e.aimT -= dt * ts;
          if (e.aimT <= 0) {
            e.phase = 'tele';
            e.teleT = 0.7;
            e.ang = Math.atan2(p.y - e.y, p.x - e.x); // låser sigtet -> spilleren kan dodge
          }
        } else if (e.phase === 'tele') {
          e.teleT -= dt * ts;
          if (e.teleT <= 0) { e.phase = 'fire'; e.burstN = 3; e.burstT = 0; }
        } else if (e.phase === 'fire') {
          e.burstT -= dt * ts;
          if (e.burstT <= 0 && e.burstN > 0) {
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(e.ang) * 640 * S, vy: Math.sin(e.ang) * 640 * S, r: 4 * S, color: '#ff4d4d' });
            e.burstN--;
            e.burstT = 0.09;
            if (e.burstN === 0) { e.phase = 'aim'; e.aimT = rand(1.6, 2.6); }
          }
        }
        break;

      case 'boss':
        updateBoss(e, dt, ts);
        break;
    }

    // kollision med spilleren (kamikaze)
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy < (e.r + p.r - 4) * (e.r + p.r - 4)) {
      if (e.type !== 'boss') { e.hp = 0; killEnemy(e, true); }
      hitPlayer();
      continue;
    }
    if (e.y > VH + 60) {
      enemies.splice(i, 1);
      if (e.type !== 'boss') resetCombo(); // sluppet forbi i bunden -> combo ryger
    } else if (e.x < -80 || e.x > VW + 80) {
      enemies.splice(i, 1);                // side-exit straffer ikke
    }
  }
}

function updateBoss(e, dt, ts) {
  const phase = e.hp / e.maxHp;            // 1 -> 0
  const rage = phase < 0.33 ? 1.7 : phase < 0.66 ? 1.3 : 1;
  if (e.y < 130 * S) e.y += 60 * S * dt;
  e.x = VW / 2 + Math.sin(e.t * 0.7 * rage) * (VW / 2 - 110);

  // burst-kø (pause-sikker, ingen setTimeout)
  if (e.burstN > 0) {
    e.burstT -= dt * ts;
    if (e.burstT <= 0) {
      const a = Math.atan2(player.y - e.y, player.x - e.x) + rand(-0.08, 0.08);
      ebullets.push({ x: e.x, y: e.y + 20 * S, vx: Math.cos(a) * 330 * S, vy: Math.sin(a) * 330 * S, r: 5 * S, color: '#ffb000' });
      e.burstN--;
      e.burstT = 0.11;
    }
  }

  e.attackT -= dt * ts * rage;
  if (e.attackT <= 0 && e.y > 100) {
    e.attack = (e.attack + 1) % 3;
    e.attackT = 2.4;
    if (e.attack === 0) {                   // radial burst
      const n = 14 + Math.floor(wave / 5) * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + e.t;
        ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 200 * S, vy: Math.sin(a) * 200 * S, r: 5 * S, color: '#ff2bd6' });
      }
    } else if (e.attack === 1) {            // sigtet byge
      e.burstN = 5; e.burstT = 0;
    } else {                                // tilkald droner fra bossens position
      spawnEnemy('drone', clamp(e.x - 110, 60, VW - 60), e.y + 30);
      spawnEnemy('drone', clamp(e.x + 110, 60, VW - 60), e.y + 30);
      if (phase < 0.5) spawnEnemy('diver', e.x, e.y + 30);
    }
  }
}

function killEnemy(e, silentScore = false) {
  const idx = enemies.indexOf(e);
  if (idx === -1) return;
  enemies.splice(idx, 1);

  boom(e.x, e.y, e.color, e.type === 'boss' ? 70 : 18, e.type === 'boss' ? 420 : 220);
  if (e.type === 'boss') { Sfx.bigBoom(); addShake(22); spawner.bossAlive = false; hitStop = 0.22; }
  else { Sfx.explode(); addShake(3); hitStop = Math.max(hitStop, 0.03); }

  if (!silentScore) {
    bumpCombo();
    addScore(e.score, e.x, e.y);
    gainOD(e.type === 'boss' ? 30 : 2);

    // kill-streak: 3+ kills inden for 0,8 sek.
    killTimes.push(gameTime);
    killTimes = killTimes.filter((t) => gameTime - t < 0.8);
    const k = killTimes.length;
    if (k >= 3 && gameTime - lastStreakT > 1) {
      lastStreakT = gameTime;
      const txt = k >= 5 ? 'RAMPAGE!!' : k === 4 ? 'QUAD KILL!' : 'TRIPLE KILL!';
      popup(clamp(e.x, 120, VW - 120), e.y - 44, txt, '#ffb000', true);
      gainOD(6);
    }
  }

  if (e.type === 'splitter') {
    spawnEnemy('mini', e.x - 16, e.y);
    spawnEnemy('mini', e.x + 16, e.y);
  }
  // powerup-drop
  const chance = e.type === 'boss' ? 1 : e.type === 'tank' ? 0.35 : 0.11;
  if (Math.random() < chance) dropPowerup(e.x, e.y);
  if (e.type === 'boss') dropPowerup(e.x + 40, e.y);

  updateHud();
}

/* ---------------- Powerups ---------------- */
const P_TYPES = [
  { id: 'T', name: 'TRIPLE',  color: '#00f6ff' },
  { id: 'L', name: 'LASER',   color: '#ff2bd6' },
  { id: 'S', name: 'SHIELD',  color: '#39ff6a' },
  { id: 'B', name: 'BOMB',    color: '#ffb000' },
  { id: 'Z', name: 'SLOW-MO', color: '#ffe14d' },
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
    case 'Z': p.slowT = 5; break;
    case 'B':
      addShake(18); Sfx.bigBoom();
      boom(p.x, p.y, '#ffb000', 50, 500);
      ebullets.length = 0;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.hp -= 10; e.flash = 0.15;
        if (e.hp <= 0) killEnemy(e);
      }
      break;
  }
}

/* ---------------- Waves & formationer ---------------- */
// En wave er en kø af {type, x?, delay} — delay er pausen FØR dette spawn.
// Formationer giver waves der føles designede frem for tilfældige.
function buildWave(n) {
  if (n % 5 === 0) return [{ type: 'boss', delay: 0.6 }];
  const q = [];
  const groups = 2 + Math.min(4, Math.floor(n / 2));
  for (let g = 0; g < groups; g++) q.push(...pickGroup(n));
  return q;
}

function pickGroup(n) {
  const r = Math.random();
  const cx = rand(170, VW - 170);

  if (n >= 4 && r < 0.13) {                       // sniper-post
    return [{ type: 'sniper', delay: 0.9, x: rand(90, VW - 90) }];
  }
  if (n >= 3 && r < 0.30) {                       // tank
    return [{ type: 'tank', delay: 1.0, x: rand(130, VW - 130) }];
  }
  if (r < 0.56) {                                 // V-formation af droner
    const c = 5 + Math.min(4, n);
    const out = [{ type: 'drone', delay: 0.9, x: cx }];
    for (let i = 1; i <= Math.floor(c / 2); i++) {
      out.push({ type: 'drone', delay: 0.13, x: clamp(cx - i * 62, 55, VW - 55) });
      out.push({ type: 'drone', delay: 0,    x: clamp(cx + i * 62, 55, VW - 55) });
    }
    return out;
  }
  if (r < 0.78) {                                 // vandret mur
    const t = n >= 2 && Math.random() < 0.5 ? 'splitter' : 'drone';
    const c = 4 + Math.min(3, Math.floor(n / 2));
    const out = [];
    for (let i = 0; i < c; i++) {
      out.push({ type: t, delay: i === 0 ? 1.0 : 0.06, x: 70 + (VW - 140) * (i / (c - 1)) });
    }
    return out;
  }
  // diver-stream fra samme korridor
  const t2 = n >= 2 ? 'diver' : 'drone';
  const c = 3 + Math.min(3, Math.floor(n / 2));
  const out = [];
  for (let i = 0; i < c; i++) {
    out.push({ type: t2, delay: i === 0 ? 0.8 : 0.22, x: clamp(cx + rand(-45, 45), 60, VW - 60) });
  }
  return out;
}

function updateSpawner(dt) {
  if (spawner.betweenT > 0) {
    spawner.betweenT -= dt;
    if (spawner.betweenT <= 0) {
      wave++;
      spawner.queue = buildWave(wave);
      spawner.timer = spawner.queue.length ? spawner.queue[0].delay : 0;
      if (wave % 5 !== 0) { banner('WAVE ' + wave); Sfx.waveIn(); }
      updateHud();
    }
    return;
  }
  if (spawner.queue.length > 0) {
    spawner.timer -= dt;
    while (spawner.queue.length > 0 && spawner.timer <= 0) {
      const it = spawner.queue.shift();
      spawnEnemy(it.type, it.x != null ? clamp(it.x, 50, VW - 50) : undefined);
      if (spawner.queue.length > 0) spawner.timer += spawner.queue[0].delay;
    }
  } else if (enemies.length === 0 && !spawner.bossAlive) {
    spawner.betweenT = 2.2;
    if (wave > 0) addScore(wave * 50, player.x, player.y - 50); // wave-bonus
  }
}

function banner(text) { bannerText = text; bannerT = 2; }

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
  ui.btnOdMob.classList.add('hidden');
  ui.btnPauseMob.classList.add('hidden');
  ui.finalScore.textContent = score.toLocaleString('en-US');
  ui.finalWave.textContent = wave;
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
function updateHud() {
  ui.score.textContent = score.toLocaleString('en-US');
  ui.hiscore.textContent = hiscore.toLocaleString('en-US');
  ui.wave.textContent = Math.max(1, wave);
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
  ui.odFill.style.width = (active ? (odActive / 6) * 100 : overdrive) + '%';
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
  if (p.slowT > 0) lines.push('SLOW-MO ' + Math.ceil(p.slowT) + 's');
  const html = lines.map((l) => '<span>' + l + '</span>').join('');
  if (ui.pwStatus.innerHTML !== html) ui.pwStatus.innerHTML = html;
}

/* ---------------- Leaderboard (/api/scores → Neon via Vercel function) ---------------- */
const cfg = window.GAME_CONFIG || {};
const API_URL = cfg.API_URL || '/api/scores';

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

/* ---------------- Render ---------------- */
function drawBackground(dt) {
  ctx.fillStyle = '#06010f';
  ctx.fillRect(0, 0, VW, VH);

  // stjerner (parallax)
  for (const s of stars) {
    if (state === 'PLAYING' && !paused) {
      s.y += (30 + s.z * 110) * dt;
      if (s.y > VH) { s.y = -2; s.x = rand(0, VW); }
    }
    ctx.globalAlpha = 0.35 + s.z * 0.6;
    ctx.fillStyle = s.z > 0.75 ? '#ffffff' : '#8f8ab8';
    ctx.fillRect(s.x, s.y, s.z * 2.2 * S, s.z * 2.2 * S);
  }
  ctx.globalAlpha = 1;

  // perspektiv-grid i bunden
  const horizon = VH - 170;
  if (state === 'PLAYING' && !paused) gridScroll = (gridScroll + dt * 60) % 40;
  ctx.strokeStyle = 'rgba(255,43,214,0.20)';
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
  g.addColorStop(0, 'rgba(255,43,214,0)');
  g.addColorStop(0.55, 'rgba(255,43,214,0.16)');
  g.addColorStop(1, 'rgba(255,43,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon - 40, VW, 70);
}

function drawShip(p) {
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0) return; // blink ved invulnerability
  ctx.save();
  ctx.translate(p.x, p.y);
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
    case 'boss': {
      ctx.rotate(Math.sin(e.t) * 0.06);
      // krop
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r * 0.9, -e.r * 0.25);
      ctx.lineTo(e.r * 0.65, e.r * 0.8);
      ctx.lineTo(0, e.r * 0.5);
      ctx.lineTo(-e.r * 0.65, e.r * 0.8);
      ctx.lineTo(-e.r * 0.9, -e.r * 0.25);
      ctx.closePath();
      ctx.fill();
      // "øjne"
      ctx.fillStyle = '#06010f';
      const blink2 = Math.sin(e.t * 3) > 0.85 ? 0.3 : 1;
      ctx.fillRect(-e.r * 0.5, -e.r * 0.35, e.r * 0.32, e.r * 0.3 * blink2);
      ctx.fillRect(e.r * 0.18, -e.r * 0.35, e.r * 0.32, e.r * 0.3 * blink2);
      break;
    }
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

    // skud
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bullets) {
      ctx.shadowColor = '#00f6ff'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#bdfdff';
      ctx.fillRect(b.x - 2, b.y - 9, 4, 14);
    }
    for (const b of ebullets) {
      ctx.shadowColor = b.color; ctx.shadowBlur = 10;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
    ctx.restore();

    for (const e of enemies) drawEnemy(e);
    drawShip(player);

    // partikler
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pa of particles) {
      ctx.globalAlpha = clamp(pa.t * 2, 0, 1);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x - pa.r / 2, pa.y - pa.r / 2, pa.r, pa.r);
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

    // slow-mo overlay
    if (player.slowT > 0) {
      ctx.fillStyle = 'rgba(255,225,77,0.05)';
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
      const ts = player.slowT > 0 ? 0.35 : 1;   // time-scale for fjender/skud
      updatePlayer(dt);
      updateSpawner(dt);
      updateEnemies(dt, ts);
      updateBullets(dt, ts);
      updatePowerups(dt);

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
// Touch-enheder: vis styringsvælger i stedet for "tryk space"
if (IS_TOUCH) {
  ui.pressStart.classList.add('hidden');
  ui.ctrlPick.classList.remove('hidden');
}
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
Music.init();
// Try autoplay (will silently fail on mobile until first user interaction)
Music.playStart();
// On first interaction, ensure start.mp4 begins playing if autoplay was blocked
const kickStartMusic = () => {
  if (state === 'MENU' || state === 'GAMEOVER') Music.playStart();
  window.removeEventListener('pointerdown', kickStartMusic);
  window.removeEventListener('keydown', kickStartMusic);
};
window.addEventListener('pointerdown', kickStartMusic, { once: true });
window.addEventListener('keydown', kickStartMusic, { once: true });
rafId = requestAnimationFrame(frame);
