/* =====================================================
   NEON BREACH — promo director · KERNE
   Bro til den rigtige spilmotor (game.js) + fælles værktøjer.
   Indsættes som classic script EFTER game.js, så motorens
   top-level let/const (player, enemies, score …) kan læses
   og skrives direkte. Alt eget ligger under window.PD.
   ===================================================== */
(() => {
  'use strict';
  const PD = (window.PD = window.PD || {});
  const W = 1080, H = 1920;
  const KX = W / VW, KY = H / VH;
  Object.assign(PD, { W, H, KX, KY });

  /* ---------- Spillet i fuld film-opløsning (skarpe vektorer) ---------- */
  cvs.width = W;
  cvs.height = H;
  ctx.setTransform(KX, 0, 0, KY, 0, 0);
  // shadowBlur følger ikke transformationen — skalér den, så glow matcher spillet
  const sbDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
  Object.defineProperty(ctx, 'shadowBlur', {
    configurable: true,
    get() { return sbDesc.get.call(this) / KX; },
    set(v) { sbDesc.set.call(this, v * KX); },
  });

  /* ---------- Lyd: spillets effekter logges i stedet for at spilles ---------- */
  PD.sink = null; // (ev) => void — sat af det klip, der "høres" lige nu
  const emit = (ev) => { if (PD.sink) PD.sink(ev); };
  for (const n of ['shoot', 'laserHum', 'explode', 'bigBoom', 'hit', 'power', 'graze', 'odGo', 'waveIn', 'bossIn', 'over']) {
    Sfx[n] = () => emit({ kind: 'game', name: n });
  }
  Sfx.tone = (freq, dur, type = 'square', vol = 0.18, slideTo = null) => emit({ kind: 'tone', freq, dur, type, vol, slideTo });
  Sfx.noise = (dur, vol = 0.25, lp = 1800) => emit({ kind: 'noise', dur, vol, lp });
  Sfx.init = Sfx.resume = Sfx.startMusic = Sfx.stopMusic = () => {};
  for (const n of ['playGame', 'playStart', 'stopGame', 'stopStart', 'fade']) Music[n] = () => {};

  /* ---------- Gudetilstand: kun iscenesatte træffere tæller ---------- */
  const origHitPlayer = window.hitPlayer;
  PD.mortal = false;
  window.hitPlayer = function () {
    if (PD.mortal || odActive > 0 || (player && player.inv > 0)) return origHitPlayer();
  };
  PD.realHit = () => origHitPlayer();

  /* ---------- Bannere: kun dem, instruktøren tillader (lange bannere klippes i spillet) ---------- */
  const origBanner = window.banner;
  PD.bannerAllow = () => false;
  window.banner = (text) => { if (PD.bannerAllow(text)) origBanner(text); };

  /* ---------- Kosmetisk krog lige før spillet tegner (fx boss-blink) ---------- */
  PD.preDraw = null;
  const origDrawScene = window.drawScene;
  window.drawScene = (dt) => { if (PD.preDraw) PD.preDraw(); origDrawScene(dt); };

  /* ---------- Motor-styring ---------- */
  PD.step = (dt) => {
    lastT = __promo.now;
    __promo.advance(dt * 1000);
    __promo.drainRaf();
    frame(__promo.now);
    __promo.drainRaf();
  };

  PD.snapshot = () => structuredClone({
    state, paused, score, hiscore, wave, shake, hitStop, bannerText, bannerT, gameTime,
    overdrive, odActive, maxCombo, grazes, killTimes, lastStreakT,
    player, bullets, ebullets, enemies, powerups, particles, popups, combo, comboT,
    hazards, respawnQueue, wallW, wallTarget, flashT, upgradeDelay, palTarget, gridScroll,
    upgradeChoices, touchActive,
    touch: { x: touch.x, y: touch.y },
    keys: Object.assign({}, keys),
    spawner: { queue: spawner.queue, timer: spawner.timer, betweenT: spawner.betweenT, bossAlive: spawner.bossAlive },
    PAL, stars, bgFx: { city: bgFx.city, rocks: bgFx.rocks, rain: bgFx.rain },
    seed: __promo.seed,
  });

  PD.restore = (snap) => {
    const s = structuredClone(snap);
    state = s.state; paused = s.paused; score = s.score; hiscore = s.hiscore; wave = s.wave;
    shake = s.shake; hitStop = s.hitStop; bannerText = s.bannerText; bannerT = s.bannerT; gameTime = s.gameTime;
    overdrive = s.overdrive; odActive = s.odActive; maxCombo = s.maxCombo; grazes = s.grazes;
    killTimes = s.killTimes; lastStreakT = s.lastStreakT;
    player = s.player; bullets = s.bullets; ebullets = s.ebullets; enemies = s.enemies;
    powerups = s.powerups; particles = s.particles; popups = s.popups; combo = s.combo; comboT = s.comboT;
    hazards = s.hazards; respawnQueue = s.respawnQueue; wallW = s.wallW; wallTarget = s.wallTarget;
    flashT = s.flashT; upgradeDelay = s.upgradeDelay; palTarget = s.palTarget; gridScroll = s.gridScroll;
    upgradeChoices = s.upgradeChoices; touchActive = s.touchActive;
    touch.x = s.touch.x; touch.y = s.touch.y;
    for (const k of Object.keys(keys)) delete keys[k];
    Object.assign(keys, s.keys);
    Object.assign(spawner, s.spawner);
    for (const k of Object.keys(PAL)) PAL[k] = s.PAL[k];
    stars.splice(0, stars.length, ...s.stars);
    bgFx.city = s.bgFx.city; bgFx.rocks = s.bgFx.rocks; bgFx.rain = s.bgFx.rain;
    __promo.seed = s.seed;
  };

  // Ny run fra bunden (deterministisk via seed)
  PD.freshRun = (o = {}) => {
    __promo.seed = o.seed ?? 1;
    startGame();
    hiscore = o.hiscore ?? 487350;
    score = o.score ?? 0;
    for (const k of Object.keys(keys)) keys[k] = false;
    touchActive = true;
    touch.x = player.x; touch.y = player.y + 60;
    PD.mortal = false;
    if (o.mods) Object.assign(player.mods, o.mods);
    if (o.lives) player.lives = o.lives;
    if (o.weapon) { player.weapon = o.weapon; player.weaponT = 60; }
    if (o.wave) PD.gotoWave(o.wave);
    if (o.shipY != null) { player.y = o.shipY; touch.y = o.shipY + 60; }
    if (o.shipX != null) { player.x = o.shipX; touch.x = o.shipX; }
  };

  // Hop direkte til en wave (sektor-palette med det samme)
  PD.gotoWave = (n) => {
    wave = n - 1;
    spawner.queue = []; spawner.betweenT = 0.001; spawner.bossAlive = false;
    setPalette(SECTORS[sectorIndex(n)].pal, true);
  };

  // Spawn en boss for den aktuelle wave og placér den i arenaen med det samme
  PD.spawnBoss = (n, o = {}) => {
    wave = n;
    setPalette(SECTORS[sectorIndex(n)].pal, true);
    spawner.queue = []; spawner.betweenT = 0;
    spawnEnemy('boss', VW / 2, -40);
    const e = enemies[enemies.length - 1];
    e.y = o.y ?? 140 * S;
    if (o.t != null) e.t = o.t;
    return e;
  };

  /* ---------- Autopilot: jager fjender, undviger skud og hazards ---------- */
  PD.pilot = (o = {}) => {
    const p = player;
    if (!p) return;
    let tx = o.x ?? p.x;
    if (o.hunt !== false) {
      let best = null, bs = -1e9;
      for (const e of enemies) {
        if (e.intangible || e.y < 30 || e.y > p.y - 70) continue;
        if (o.ignore && o.ignore(e)) continue;
        if (e.type === 'mine') continue;
        let sc = e.y * 0.55 - Math.abs(e.x - p.x) * 0.8;
        if (e.type === 'boss') sc += 120;
        if (sc > bs) { bs = sc; best = e; }
      }
      if (best) tx = best.type === 'boss' && o.bossX ? o.bossX(best) : best.x;
    }
    // undvig: forudsig nærmeste passage for hvert fjendeskud
    const R = o.dodgeR ?? 66;
    let push = 0;
    const consider = (bx, by, vx, vy, rr) => {
      const rx = bx - p.x, ry = by - p.y;
      const v2 = vx * vx + vy * vy;
      if (v2 < 1) return;
      const tca = -(rx * vx + ry * vy) / v2;
      if (tca < 0 || tca > 0.75) return;
      const cx = rx + vx * tca, cy = ry + vy * tca;
      const d = Math.hypot(cx, cy);
      const lim = R + rr;
      if (d > lim) return;
      const side = Math.abs(cx) < 4 ? (p.x < VW / 2 ? -1 : 1) : Math.sign(cx);
      push -= side * (lim - d) * 2.2 * (1 - tca / 0.75);
    };
    for (const b of ebullets) consider(b.x, b.y, b.vx, b.vy, b.r);
    for (const e of enemies) {
      if (e.intangible || e.type === 'boss') continue;
      if (e.type === 'diver' && e.state === 2) consider(e.x, e.y, e.vx, e.vy, e.r);
      else if (e.y > p.y - 260 && e.y < p.y + 40) consider(e.x, e.y, 0, 260, e.r);
    }
    tx += clamp(push, -260, 260);
    for (const hz of hazards) {
      if (hz.kind !== 'flare') continue;
      const half = hz.w / 2 + p.r + 18;
      if (Math.abs(tx - hz.x) < half) tx = hz.x + (p.x < hz.x ? -half : half);
    }
    const lo = p.r + 10 + wallW, hi = VW - p.r - 10 - wallW;
    touch.x = clamp(tx, lo, hi);
    touch.y = (o.y ?? VH * 0.8) + 60;
    touchActive = true;   // touch styrer bevægelsen — skud holdes tilbage via cooldown nedenfor
    // Skyd kun når en fjende står (næsten) lige over skibet, som en rigtig spiller —
    // ellers drukner billedet i skud. Under OVERDRIVE skydes der for fuld kraft.
    let fire = o.fire !== false;
    if (fire && o.aim !== false && odActive <= 0) {
      fire = enemies.some((e) => {
        if (e.intangible || e.type === 'mine' || e.y < 0 || e.y > p.y - 40) return false;
        const tol = e.type === 'boss' ? (e.segW ? 3.5 * e.segW : e.r * 1.8) : e.r + 26;
        return Math.abs(e.x - p.x) < tol;
      });
    }
    if (!fire) { p.fireCd = Math.max(p.fireCd, 0.02); p.droneCd = Math.max(p.droneCd, 0.02); }
  };

  /* ---------- Værktøjer ---------- */
  const U = (PD.U = {});
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.clamp01 = (v) => Math.max(0, Math.min(1, v));
  U.inv = (a, b, v) => U.clamp01((v - a) / (b - a));
  U.easeOut = (t) => 1 - Math.pow(1 - t, 3);
  U.easeIn = (t) => t * t * t;
  U.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.back = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  // stateless hash-random (seek-sikker): samme input → samme tal
  U.hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  U.canvas = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  PD.COL = {
    cyan: '#00f6ff', pink: '#ff2bd6', orange: '#ffb000', green: '#39ff6a', yellow: '#ffe14d',
    red: '#ff4d4d', purple: '#c86bff', white: '#e8e6ff', dim: '#8f8ab8', dimmer: '#6f68a8', bg: '#06010f',
  };
  PD.FONT = (px) => `${Math.round(px)}px "Press Start 2P", monospace`;
  PD.VT = (px) => `${Math.round(px)}px "VT323", monospace`;
})();
