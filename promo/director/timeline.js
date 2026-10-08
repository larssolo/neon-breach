/* =====================================================
   NEON BREACH — promo director · STORYBOARD
   ~48 s, 9:16, 150 BPM. Alle tider i sekunder (T(takt, slag)).

   0:00  HOOK      Hall of Fame "#1 — BEAT THIS?" → skibet skyder skærmen i stykker
   0:03  LOGO      NEON BREACH + sektor-montage (5 sektorer)
   0:16  GRAZE     slow-mo mellem kuglerne
   0:17  COMBO     x8 → sniper → GAME OVER → INSERT COIN → ◀◀ REWIND → OVERDRIVE
   0:24  UPGRADE   vælg 1 af 3
   0:25  WARNING   5 bosser → boss-rush → moderskibet sprænges
   0:33  LOOP 2    MAX HEAT
   0:35  HALL OF FAME — "YOU" klatrer fra #11 til #1
   0:41  LOGO + PLAY FREE + INSERT COIN → CRT sluk
   ===================================================== */
(() => {
  'use strict';
  const PD = window.PD;
  const { W, H, KX, KY, U, COL, T, stage: $s } = PD;
  const SC = window.PROMO_SCORE;
  const C = SC.CUES;
  const PLAY_URL = window.PROMO_URL || '';   // fx 'NEONBREACH.DK' — vises på slutskiltet hvis sat

  // Hold motoren på den valgte wave (ingen automatisk boss midt i en sektor-montage)
  PD.holdWave = (n) => { if (wave >= n && spawner.betweenT > 0) spawner.betweenT = 99; };
  const boss = () => enemies.find((e) => e.type === 'boss');
  const hold = (b, lo, hi) => { if (b) b.hp = clamp(b.hp, b.maxHp * lo, b.maxHp * hi); };
  const STRONG = { spread: 2, rapid: 2, wingman: 2, pierce: 1 };

  /* =========================================================
     KLIP
     ========================================================= */

  /* ---------- Sektor 1: NEON CITY (starter under hook'en) ---------- */
  const city = new PD.GameClip({
    id: 'city', start: T(2, 2), end: T(4), sim: 2.1, preroll: 2.2, seed: 11,
    setup() {
      PD.freshRun({ seed: 11, score: 18450, mods: { spread: 1, rapid: 2 } });
      PD.gotoWave(4);
      $s.field('drone', 9, 60, 470, 11);
      $s.wall('splitter', 4, 260);
    },
    script(c, ct, dt, t) {
      PD.holdWave(4);
      if (t < 3.12) PD.pilot({ hunt: false, x: 400 + Math.sin(ct * 2.7) * 250, y: 1060, fire: t > 2.22 });
      else PD.pilot({ y: 1020 });
      c.once('v1', ct > -1.0, () => $s.vee('drone', 7, 480, -40));
      c.once('w1', ct > 0.1, () => $s.wall('drone', 6));
      c.once('d1', ct > 0.7, () => $s.stream('diver', 4, 280));
      c.once('v2', ct > 1.3, () => $s.vee('drone', 7, 520));
      c.once('w2', ct > 1.9, () => $s.wall('splitter', 4));
    },
    hud: (t) => U.inv(3.15, 3.45, t),
  });

  /* ---------- HOOK: Hall of Fame bag glas — skibet skyder sig igennem ---------- */
  class HookClip extends PD.Clip {
    begin() {
      const P = (this.P = { x: 70, y: 430, w: 940, h: 860 });
      this.tile = 30;
      this.cols = Math.ceil(P.w / this.tile);
      this.rows = Math.ceil(P.h / this.tile);
      this.broken = new Uint8Array(this.cols * this.rows);
      this.holes = U.canvas(); this.hctx = this.holes.getContext('2d');
      this.hctx.fillStyle = '#fff';
      this.live = U.canvas(); this.lctx = this.live.getContext('2d');
      this.shards = []; this.sparks = [];
      this.blasted = false; this.lastGlass = -9;
    }
    zoom(t) { return t < 2.0 ? 1 + 0.09 * U.easeInOut(U.inv(0.2, 2.0, t)) + 0.05 * Math.exp(-Math.max(0, t - 1.2) / 0.12) * (t >= 1.2 ? 1 : 0) : 1.09 * (1 - U.easeInOut(U.inv(2.0, 2.3, t))) + U.easeInOut(U.inv(2.0, 2.3, t)); }
    panel(g, t) {
      const P = this.P;
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(10,2,30,0.95)';
      g.fillRect(P.x, P.y, P.w, P.h);
      g.save();
      g.strokeStyle = COL.pink; g.lineWidth = 4; g.shadowColor = COL.pink; g.shadowBlur = 20;
      g.strokeRect(P.x + 10, P.y + 10, P.w - 20, P.h - 20);
      g.restore();
      PD.text(g, '— HALL OF FAME —', W / 2, P.y + 92, { size: 34, color: COL.pink, glow: 18 });
      const glitch = t > 2.0 && t < 2.2;
      PD.BOARD.slice(0, 6).forEach(([name, sc], r) => {
        const y = P.y + 230 + r * 106;
        const first = r === 0;
        const pulse = first ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
        let x0 = P.x + 70, x1 = P.x + P.w - 70;
        if (first && glitch) { const j = (U.hash(Math.floor(t * 60), 4) - 0.5) * 90; x0 += j; x1 += j; }
        PD.drawRow(g, r + 1, name, sc, x0, x1, y, {
          size: first ? 92 : 76,
          color: first ? COL.orange : '#d8d4ff',
          glow: first ? 14 + 22 * pulse : 0,
          bg: first ? `rgba(255,176,0,${0.07 + 0.06 * pulse})` : null,
          border: first ? `rgba(255,176,0,${0.4 + 0.4 * pulse})` : null,
        });
      });
    }
    breakTile(c, r, t, vx, vy) {
      const k = r * this.cols + c;
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || this.broken[k]) return false;
      this.broken[k] = 1;
      const P = this.P, ts = this.tile;
      const x = P.x + c * ts, y = P.y + r * ts;
      const img = U.canvas(ts, ts);
      img.getContext('2d').drawImage(this.live, x, y, ts, ts, 0, 0, ts, ts);
      this.hctx.fillRect(x, y, ts, ts);
      const h1 = U.hash(c, r, 11), h2 = U.hash(c, r, 12), h3 = U.hash(c, r, 13);
      this.shards.push({ img, x: x + ts / 2, y: y + ts / 2, vx: vx + (h1 - 0.5) * 520, vy: vy - h2 * 600, rot: 0, vr: (h3 - 0.5) * 16, t0: t });
      return true;
    }
    collide(t) {
      const P = this.P, ts = this.tile;
      let hit = false;
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const fx = b.x * KX, fy = b.y * KY;
        const c = Math.floor((fx - P.x) / ts), r = Math.floor((fy - P.y) / ts);
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        if (this.broken[r * this.cols + c]) continue;
        this.bhits = this.bhits || new WeakMap();
        const nHit = (this.bhits.get(b) || 0) + 1;
        this.bhits.set(b, nHit);
        if (nHit >= 4) bullets.splice(j, 1);
        hit = true;
        this.breakTile(c, r, t, b.vx * 0.3, -200);
        for (let n = 0; n < 4; n++) {
          const h = U.hash(c * 7 + n, r, Math.floor(t * 60));
          if (h < 0.55) this.breakTile(c + Math.round((U.hash(c, r, n + 20) - 0.5) * 3), r + Math.round((U.hash(c, r, n + 30) - 0.5) * 3), t, b.vx * 0.3, -150);
        }
        for (let n = 0; n < 5; n++) this.sparks.push({ x: fx, y: fy, vx: (U.hash(j, n, 1) - 0.5) * 700, vy: -U.hash(j, n, 2) * 700, t0: t, col: U.hash(j, n, 3) < 0.5 ? COL.cyan : '#fff' });
      }
      if (hit && t - this.lastGlass > 0.045) { this.lastGlass = t; this.cue(t, 'glass'); }
    }
    blast(t, sx, sy) {
      this.blasted = true;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const x = this.P.x + (c + 0.5) * this.tile, y = this.P.y + (r + 0.5) * this.tile;
          const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy) || 1;
          const f = 1500 + U.hash(c, r, 40) * 1400;
          this.breakTile(c, r, t, (dx / d) * f, (dy / d) * f * 0.8 - 300);
        }
      }
      this.cue(t, 'shatter');
    }
    draw(t, dt, i) {
      const g = this.g, cityC = this.under;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      let bgA = 1;
      if (t >= cityC.simStart) {
        cityC.advanceTo(t, i, dt);
        g.drawImage(cityC.layer, 0, 0);
        bgA = 1 - U.inv(2.1, 2.45, t);
        if (t >= 2.26 && t < 3.08) this.collide(t);
        if (t >= 3.08 && !this.blasted) this.blast(t, cityC.ship.x, cityC.ship.y);
      }
      if (bgA > 0) { g.save(); g.globalAlpha = bgA; PD.synthBg(g, t, { horizon: 1560 }); g.restore(); }
      // glasset (Hall of Fame) med huller
      this.panel(this.lctx, t);
      this.lctx.save();
      this.lctx.globalCompositeOperation = 'destination-out';
      this.lctx.drawImage(this.holes, 0, 0);
      this.lctx.restore();
      if (!this.blasted) PD.drawCam(g, this.live, { zoom: this.zoom(t), fy: this.P.y + 230 });
      // glasskår
      g.save();
      for (const s of this.shards) {
        const a = t - s.t0;
        if (a > 1.2) continue;
        const x = s.x + s.vx * a, y = s.y + s.vy * a + 1700 * a * a;
        if (y > H + 60) continue;
        g.save();
        g.globalAlpha = Math.max(0, 1 - Math.max(0, a - 0.55) / 0.6);
        g.translate(x, y);
        g.rotate(s.vr * a);
        g.drawImage(s.img, -this.tile / 2, -this.tile / 2);
        g.restore();
      }
      g.globalCompositeOperation = 'lighter';
      for (const s of this.sparks) {
        const a = t - s.t0;
        if (a > 0.3) continue;
        g.globalAlpha = 1 - a / 0.3;
        g.fillStyle = s.col;
        g.fillRect(s.x + s.vx * a - 3, s.y + s.vy * a + 900 * a * a - 3, 6, 6);
      }
      g.restore();
    }
  }
  const hook = new HookClip({ id: 'hook', start: 0, end: T(2, 2) });
  hook.under = city;
  hook.hudClip = city;

  /* ---------- Sektor 2-5 (montage) ---------- */
  const belt = new PD.GameClip({
    id: 'belt', start: T(4), end: T(6), preroll: 2.4, seed: 22,
    setup() {
      PD.freshRun({ seed: 22, score: 61300, mods: { spread: 1, rapid: 1 } });
      PD.gotoWave(9);
      $s.field('asteroid', 5, -80, 300, 22);
      $s.field('drone', 6, 0, 380, 23);
    },
    script(c, ct) {
      PD.holdWave(9);
      PD.pilot({ y: 1020, fire: ct > -0.12 });
      c.once('m1', ct > -1.6, () => $s.add('miner', 620, -40));
      c.once('r2', ct > 0.3, () => { $s.add('asteroid', 400, -60); $s.add('asteroid', 140, -190); $s.add('asteroid', 690, -120); });
      c.once('v1', ct > 1.1, () => $s.vee('drone', 7, 380));
      c.once('r3', ct > 1.9, () => { $s.add('asteroid', 300, -60); $s.add('asteroid', 560, -120); });
    },
  });

  const storm = new PD.GameClip({
    id: 'storm', start: T(6), end: T(8), preroll: 2.2, seed: 33,
    setup() {
      PD.freshRun({ seed: 33, score: 104880, mods: { spread: 1, rapid: 1 } });
      PD.gotoWave(14);
      $s.field('drone', 7, 20, 400, 33);
    },
    script(c, ct) {
      PD.holdWave(14);
      PD.pilot({ y: 1020, fire: ct > -0.12 });
      c.once('f1', ct > -0.95, spawnFlare);
      c.once('p1', ct > -0.6, () => { $s.add('phoenix', 240, -40); $s.add('phoenix', 560, -70); });
      c.once('v1', ct > 0.1, () => $s.vee('drone', 5, 420));
      c.once('f2', ct > 0.85, spawnFlare);
      c.once('p2', ct > 1.0, () => $s.add('phoenix', 400, -40));
      c.once('f3', ct > 1.9, spawnFlare);
    },
  });

  const tunnel = new PD.GameClip({
    id: 'tunnel', start: T(8), end: T(9), preroll: 2.0, seed: 44,
    setup() {
      PD.freshRun({ seed: 44, score: 147210, mods: { spread: 1, rapid: 1 } });
      PD.gotoWave(18);
      $s.field('drone', 6, 40, 420, 44);
      $s.wall('splitter', 4, 200);
    },
    script(c, ct) {
      PD.holdWave(18);
      PD.pilot({ y: 1020, fire: ct > -0.12 });
      c.once('ph', ct > -0.9, () => { $s.add('phantom', 300, -40); $s.add('phantom', 500, -100); $s.add('phantom', 400, -170); });
      c.once('v', ct > 0.05, () => $s.vee('drone', 5, 400));
      c.once('d', ct > 0.7, () => $s.stream('diver', 3, 420));
    },
  });

  const motherS = new PD.GameClip({
    id: 'motherS', start: T(9), end: T(10), preroll: 2.4, seed: 55,
    setup() {
      PD.freshRun({ seed: 55, score: 182640, mods: { spread: 1, rapid: 1 } });
      PD.gotoWave(24);
      $s.field('drone', 7, 80, 460, 55);
      $s.add('tank', 400, 120);
    },
    script(c, ct) {
      PD.holdWave(24);
      PD.pilot({ y: 1020, fire: ct > -0.12 });
      c.once('t', ct > -1.7, () => { $s.add('turret', 96, -40); $s.add('turret', 704, -40); });
      c.once('v', ct > -0.2, () => $s.vee('drone', 7, 400));
      c.once('s', ct > 0.6, () => $s.wall('splitter', 4));
    },
  });

  /* ---------- GRAZE: slow-mo mellem kuglerne ---------- */
  const GZ0 = T(10), GZ1 = T(11);
  const graze = new PD.GameClip({
    id: 'graze', start: GZ0, end: GZ1, preroll: 1.8, seed: 66,
    speed: (t) => (t < GZ0 + 0.25 ? U.lerp(1, 0.26, U.easeOut(U.inv(GZ0 - 0.2, GZ0 + 0.25, t)))
      : t < GZ1 - 0.32 ? 0.26 : U.lerp(0.26, 1, U.easeIn(U.inv(GZ1 - 0.32, GZ1, t)))),
    setup(c) {
      PD.freshRun({ seed: 66, score: 205115, mods: { graze: 1, spread: 1 }, shipX: 400, shipY: 1060 });
      PD.gotoWave(2);
      overdrive = 34;
      // kugler der passerer skibet i 34 px afstand (graze-zonen er 27-40 px)
      c.plan = [];
      for (let k = 0; k < 12; k++) {
        const tau = 0.06 + k * 0.042;
        const side = k % 2 ? 1 : -1;
        const ang = Math.PI / 2 + (U.hash(k, 1, 66) - 0.5) * 1.1;
        const v = 330 * S;
        const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
        const d = k % 4 === 3 ? 92 : 34;
        const L = 700;
        c.plan.push({ at: tau - L / v, x: 400 + nx * side * d - ux * L, y: 1060 + ny * side * d - uy * L, vx: ux * v, vy: uy * v, col: k % 3 ? COL.pink : COL.orange });
      }
    },
    script(c, ct) {
      PD.holdWave(2);
      PD.pilot({ hunt: false, x: 400, y: 1060, fire: true });
      c.plan.forEach((b, k) => c.once('g' + k, ct >= b.at, () => ebullets.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: 5 * S, color: b.col })));
      if (c.lastGr === undefined) c.lastGr = grazes;
    },
    post(c, g, t) {
      // "+50 GRAZE"-popups ved skibet (spillet viser kun gnister)
      c.pops = c.pops || [];
      if (grazes > c.lastGr) { c.pops.push({ t0: t, x: c.ship.x + (grazes % 2 ? 70 : -70), y: c.ship.y - 40 }); c.lastGr = grazes; }
      for (const p of c.pops) {
        const a = (t - p.t0) / 0.7;
        if (a > 1) continue;
        PD.text(g, '+50', p.x, p.y - a * 60, { size: 22, color: '#fff', glow: 12, glowColor: COL.cyan, alpha: 1 - a * a, double: false });
      }
    },
  });

  /* ---------- COMBO → GAME OVER → REWIND → OVERDRIVE ---------- */
  const RZ = T(11);
  const sniperOf = () => enemies.find((e) => e.type === 'sniper');
  const rampage = new PD.RewindClip({
    id: 'rampage', start: RZ, end: T(15), preroll: 1.8, seed: 77,
    rew: { from: C.COIN + 0.2, to: C.COIN + 1.1 },
    recordFrom: 0.5,
    banners: (txt) => txt === 'OVERDRIVE!',
    setup(c) {
      PD.freshRun({ seed: 77, score: 214980, lives: 1, weapon: 'triple', mods: { rapid: 1 } });
      PD.gotoWave(3);
      combo = 33; comboT = 2.5; overdrive = 100;
      $s.field('drone', 12, 140, 640, 77);
      $s.wall('splitter', 5, 330);
      c.holdX = null;
    },
    script(c, ct, dt, t) {
      PD.holdWave(3);
      if (state === 'PLAYING') combo = Math.max(combo, 33);   // hold kæden i live under optagelsen
      comboT = Math.max(comboT, 1.2);
      const k = Math.floor((ct + 1.8) / 0.5);
      c.once('wave' + k, true, () => {
        const m = k % 3;
        if (m === 0) $s.vee('drone', 7, 260 + U.hash(k, 3) * 280, -30);
        else if (m === 1) $s.wall('drone', 6, -30);
        else $s.wall('splitter', 4, -30);
      });
      c.once('sn', ct > -0.9, () => {
        const sn = $s.add('sniper', 600, -40);
        sn.ty = 450; sn.hp = sn.maxHp = 999; sn.aimT = 99;
      });
      const sn = sniperOf();
      if (sn && sn.phase === 'aim' && !c._once?.tele) sn.aimT = 99;
      c.once('tele', sn && ct >= 0.62, () => {
        sn.phase = 'tele'; sn.teleT = 0.6;
        sn.ang = Math.atan2(player.y - sn.y, player.x - sn.x);
      });
      if (c.phase !== 'replay' || !c.od) {
        if (ct < 0.55) PD.pilot({ y: 1040, ignore: (e) => e.type === 'sniper' });
        else PD.pilot({ hunt: false, x: c.holdX ?? (c.holdX = player.x), y: 1040, ignore: (e) => e.type === 'sniper', dodgeR: 0 });
      }
      // første gang: skibet rammes præcis på musikkens cut
      if (c.phase === 'live' && !c.dead && t >= C.DEATH) {
        PD.mortal = true;
        PD.realHit();
        c.dead = true;
        // de sidste sniper-skud forsvinder i eksplosionen
        ebullets = ebullets.filter((b) => b.color !== '#ff4d4d');
      }
      // anden gang: OVERDRIVE på faldet
      if (c.phase === 'replay' && !c.od && t >= C.RESUME) {
        c.od = true;
        overdrive = 100;
        tryOverdrive();
        if (sn) sn.hp = 2;
        $s.vee('drone', 9, 400, -40);
        $s.wall('drone', 7, -150);
      }
      if (c.phase === 'replay' && c.od) {
        PD.pilot({ y: 960 });
        c.once('od2', t > C.RESUME + 0.6, () => { $s.vee('drone', 9, 300, -40); $s.wall('splitter', 5, -120); });
        c.once('od3', t > C.RESUME + 1.0, () => { $s.vee('drone', 9, 520, -40); });
      }
    },
    hud: 1,
  });
  // director-flag (én-gangs-hændelser, holdeposition) følger med i rewind-historikken,
  // så genafspilningen bliver identisk med første gennemløb indtil OVERDRIVE
  rampage.saveDir = () => ({ once: Object.assign({}, rampage._once), holdX: rampage.holdX });
  rampage.loadDir = (d) => { rampage._once = Object.assign({}, d.once); rampage.holdX = d.holdX; };

  /* ---------- UPGRADE: vælg 1 af 3 ---------- */
  const UP0 = T(15), PICK = T(15, 2.5);
  const upgrade = new PD.GameClip({
    id: 'upgrade', start: UP0, end: T(16), preroll: 1.4, seed: 88,
    setup() {
      PD.freshRun({ seed: 88, score: 268330, mods: { spread: 1, rapid: 1, wingman: 1 } });
      PD.gotoWave(3);
      $s.field('drone', 9, 150, 620, 8);
      $s.wall('splitter', 5, 60);
    },
    script(c, ct, dt, t) {
      PD.holdWave(3);
      c.once('open', ct >= 0, () => {
        openUpgrade();
        upgradeChoices = ['rapid', 'wingman', 'spread'].map((id) => UPGRADE_DEFS.find((u) => u.id === id));
      });
      c.once('pick', t >= PICK, () => {
        player.mods.wingman = 1;
        pickUpgrade(1);
        player.mods.wingman = 2;
        spawner.betweenT = 99;
        $s.vee('drone', 9, 400, -30);
        $s.wall('drone', 7, -110);
      });
      PD.pilot({ y: 1060, fire: state === 'PLAYING' });
    },
    post(c, g, t) {
      const out = U.inv(PICK + 0.02, PICK + 0.16, t);
      if (t < UP0 - 0.02 || out >= 1) return;
      g.save();
      g.globalAlpha = 1 - out;
      g.fillStyle = 'rgba(10,2,30,0.86)'; g.fillRect(0, 0, W, H);
      PD.text(g, 'SYSTEM UPGRADE', W / 2, 470, { size: 60, color: COL.cyan, glow: 22, spacing: 8 });
      if (Math.floor(t * 2.5) % 2 === 0) PD.text(g, 'CHOOSE ONE — PRESS 1 / 2 / 3', W / 2, 570, { size: 22, color: COL.dim, glow: false, spacing: 4 });
      const cards = [
        { key: '1', name: 'RAPID FIRE', desc: '+18% FIRE RATE', col: '#00f6ff' },
        { key: '2', name: 'WINGMAN', desc: 'DRONE BUDDY JOINS YOU', col: '#39ff6a' },
        { key: '3', name: 'SPREAD', desc: '+1 ANGLED SHOT PER SIDE', col: '#00f6ff' },
      ];
      cards.forEach((cd, k) => {
        const tin = UP0 + k * 0.2;
        const a = U.easeOut(U.inv(tin - 0.05, tin + 0.16, t));
        if (a <= 0) return;
        const sel = k === 1 && t >= PICK - 0.4;
        const press = k === 1 && t >= PICK;
        const cw = 900, chh = 250, x = W / 2 - cw / 2 + (1 - a) * (k % 2 ? -W : W), y = 680 + k * 300 - (sel ? 10 : 0);
        g.save();
        g.globalAlpha *= a;
        g.fillStyle = sel ? cd.col : 'rgba(10,2,30,0.92)';
        g.fillRect(x, y, cw, chh);
        g.shadowColor = cd.col; g.shadowBlur = sel ? 40 : 18;
        g.strokeStyle = cd.col; g.lineWidth = 5;
        g.strokeRect(x, y, cw, chh);
        g.restore();
        const tc = sel ? '#06010f' : cd.col;
        PD.text(g, cd.key, W / 2 + (x - (W / 2 - cw / 2)), y + 52, { size: 26, color: tc, glow: false, alpha: 0.75 * a });
        PD.text(g, cd.name, W / 2 + (x - (W / 2 - cw / 2)), y + 118, { size: 42, color: tc, glow: sel ? false : 16, spacing: 6, alpha: a });
        PD.text(g, cd.desc, W / 2 + (x - (W / 2 - cw / 2)), y + 192, { font: 'vt', size: 54, color: sel ? '#06010f' : '#b9b3e6', glow: false, spacing: 3, alpha: a });
        if (press) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - U.inv(PICK, PICK + 0.15, t); g.fillStyle = '#fff'; g.fillRect(x, y, cw, chh); g.restore(); }
      });
      g.restore();
    },
  });

  /* ---------- WARNING: boss-roster ---------- */
  const WN = T(16);
  const lineup = new PD.LineupClip({ id: 'lineup', start: WN, end: T(17), seed: 5 });
  lineup.bosses = [
    { kind: 'mothership', x: 400, y: 345, s: 0.62, t0: WN + 0.04, name: 'THE MOTHERSHIP' },
    { kind: 'gatekeeper', x: 205, y: 655, s: 0.78, t0: T(16, 0.5), name: 'GATEKEEPER' },
    { kind: 'crusher', x: 595, y: 655, s: 0.78, t0: T(16, 1), name: 'THE CRUSHER' },
    { kind: 'solarcore', x: 205, y: 930, s: 0.82, t0: T(16, 1.5), name: 'SOLAR CORE' },
    { kind: 'firewall', x: 595, y: 930, s: 0.4, t0: T(16, 2), name: 'FIREWALL' },
  ].map((b, k) => Object.assign(b, { e: PD.fakeBoss(b.kind), phase: U.hash(k, 9) * 6 }));
  lineup.post = (c, g, t) => {
    // rødt alarm-blink + navne
    const pulse = Math.max(0, Math.sin((t - WN) * Math.PI * 2 * 2.5));
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,30,60,${0.10 * pulse})`;
    g.fillRect(0, 0, W, H);
    g.restore();
    for (const b of c.bosses) {
      const a = U.inv(b.t0 + 0.05, b.t0 + 0.2, t);
      if (a <= 0) continue;
      const dy = b.kind === 'mothership' ? 120 : b.kind === 'firewall' ? 70 : 118;
      PD.text(g, b.name, b.x * KX, (b.y + dy) * KY, { font: 'vt', size: 46, color: '#e8e6ff', glow: 10, glowColor: COL.pink, spacing: 6, alpha: a, double: false });
    }
  };

  /* ---------- BOSS-RUSH ---------- */
  // boss-hit blinker hver 3. frame (ellers står bossen konstant hvid under kugleregnen)
  const flicker = (c) => { const b = boss(); if (b && b.flash > 0 && (c.flk = (c.flk || 0) + 1) % 3) b.flash = 0; };
  const mkBoss = (o) => new PD.GameClip(Object.assign({
    preroll: 1.3,
    preDraw: flicker,
    setup(c) {
      PD.freshRun({ seed: o.seed, score: o.score, mods: { spread: 1, rapid: 1, wingman: 2 }, shipY: o.shipY ?? 1040 });
      PD.spawnBoss(o.wave, { y: o.y ?? 250 * S });
      o.init && o.init(c, boss());
    },
    script(c, ct, dt, t) {
      const b = boss();
      hold(b, o.lo ?? 0.55, o.hi ?? 0.62);
      o.act && o.act(c, b, ct, t);
      PD.pilot({ y: o.shipY ?? 1040, bossX: o.aim || ((e) => e.x + Math.sin(ct * 2.3) * 150), dodgeR: o.dodgeR });
    },
  }, o));

  const gate = mkBoss({
    id: 'gate', start: T(17), end: T(17, 2), seed: 101, wave: 5, score: 288450,
    act(c, b, ct) {
      if (!b) return;
      c.once('rad', ct > -0.55, () => { b.attack = 3; b.attackT = 0; });
      c.once('spi', ct > -0.25, () => { b.spiralN = 26; b.spiralT = 0; b.spiralA = 0.3; });
      c.once('rad2', ct > 0.3, () => { b.attack = 3; b.attackT = 0; });
    },
  });
  const crusher = mkBoss({
    id: 'crusher', start: T(17, 2), end: T(18), seed: 102, wave: 10, score: 301220,
    act(c, b, ct) {
      if (!b) return;
      c.once('rocks', ct > -0.9, () => { b.attack = 2; b.attackT = 0; });
      c.once('charge', ct > -0.12, () => { b.x = 160; b.charging = 1; b.chargeDir = 1; b.mineT = 0.1; });
    },
  });
  const solar = mkBoss({
    id: 'solar', start: T(18), end: T(18, 2), seed: 103, wave: 15, score: 316905, lo: 0.42, hi: 0.46,
    init(c, b) { b.beamMode = 'on'; b.beamT = 6; b.beams = [0.42, 0.42 + 2.094, 0.42 + 4.189]; b.pulseT = 1.0; },
    act(c, b) { if (b) { b.beamMode = 'on'; b.beamT = 6; } },
    aim: (e) => e.x,
  });
  const firewall = mkBoss({
    id: 'firewall', start: T(18, 2), end: T(19), seed: 104, wave: 20, score: 329870,
    y: 190 * S,
    init(c, b) { b.rerollT = 99; },
    act(c, b, ct) { if (b) c.once('fire', ct > -0.3, () => { b.attackT = 0; }); },
    aim: (e) => e.x + (e.segs.findIndex((sg) => sg.weak) - 3) * e.segW,
  });

  // Moderskibet: pods ned → kernen blottet → desperation → død i slow-mo
  const MB0 = T(19), KILL = C.KILL;
  const motherB = new PD.GameClip({
    id: 'motherB', start: MB0, end: T(21), preroll: 1.4, seed: 105,
    speed: (t) => (t < KILL - 0.25 ? 1 : U.lerp(1, 0.22, U.easeOut(U.inv(KILL - 0.25, KILL, t)))),
    preDraw: flicker,
    setup(c) {
      PD.freshRun({ seed: 105, score: 342600, mods: STRONG, shipY: 1040 });
      const b = PD.spawnBoss(25, { y: 270 * S });
      b.pods.forEach((pd) => { pd.hp = pd.maxHp = 400; });
    },
    post(c, g, t) {
      // chokbølge fra eksplosionen (tegnes på laget → følger kameraet)
      if (t < KILL || !c.boom) return;
      const k = U.inv(KILL, KILL + 0.9, t);
      if (k >= 1) return;
      const { x, y } = c.boom;
      g.save();
      g.globalCompositeOperation = 'lighter';
      const core = g.createRadialGradient(x, y, 0, x, y, 420 * (1 - k * 0.6));
      core.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
      core.addColorStop(0.35, `rgba(255,120,230,${0.55 * (1 - k)})`);
      core.addColorStop(1, 'rgba(255,43,214,0)');
      g.fillStyle = core;
      g.fillRect(0, 0, W, H);
      for (const [rr, col, wd] of [[1, '#ffffff', 34], [0.82, COL.pink, 22], [0.64, COL.cyan, 14]]) {
        g.strokeStyle = col; g.globalAlpha = 1 - k; g.lineWidth = wd * (1 - k) + 2;
        g.beginPath(); g.arc(x, y, 30 + 1250 * U.easeOut(k) * rr, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    },
    script(c, ct, dt, t) {
      const b = boss();
      c.once('od', ct >= -0.05, () => { overdrive = 100; tryOverdrive(); odActive = 9; });
      const podKill = (k) => {
        if (!b || !b.pods[k].alive) return;
        const pd = b.pods[k];
        pd.alive = false;
        const px = b.x + pd.dx, py = b.y + pd.dy;
        boom(px, py, '#c86bff', 30, 300); Sfx.explode(); addShake(10);
        quietScore(1000);
        popup(px, py, 'POD DOWN +1000', '#ffb000');
      };
      c.once('pod0', t >= T(19, 1.5), () => podKill(0));
      c.once('pod1', t >= T(19, 3), () => podKill(1));
      if (b) {
        if (t < T(19, 3)) hold(b, 0.95, 1);
        else if (t < T(20)) hold(b, 0.34, 0.4);
        else hold(b, 0.14, 0.2);
        c.focus = { x: b.x * KX, y: b.y * KY };
      }
      if (b && t >= KILL - 0.35 && t < KILL) {
        const n = Math.floor((t - (KILL - 0.35)) / 0.05);
        c.once('chain' + n, true, () => {
          const ox = (U.hash(n, 1, 9) - 0.5) * 2.6 * b.r, oy = (U.hash(n, 2, 9) - 0.5) * 0.9 * b.r;
          boom(b.x + ox, b.y + oy, n % 2 ? '#ff2bd6' : '#ffb000', 22, 260);
          Sfx.explode(); addShake(6); b.flash = 0.06;
        });
      }
      c.once('kill', t >= KILL && !!b, () => {
        const bx = b.x, by = b.y;
        c.boom = { x: bx * KX, y: by * KY };
        particles.length = 0;   // fuld partikel-pulje til den store eksplosion
        killEnemy(b); hitStop = 0.05; upgradeDelay = 99; flashT = 0.08;
        for (const [dx, dy, col] of [[-90, 0, '#c86bff'], [90, 10, '#ffb000'], [0, -40, '#ffffff'], [0, 50, '#00f6ff']]) boom(bx + dx, by + dy, col, 40, 520);
      });
      const target = b ? (b.pods.find((pd) => pd.alive) ? b.x + b.pods.find((pd) => pd.alive).dx : b.x) : 400;
      PD.pilot({ y: 1000, bossX: () => target + Math.sin(ct * 2.4) * 40 });
    },
    hud: (t) => 1 - U.inv(KILL - 0.15, KILL + 0.05, t),
  });

  /* ---------- LOOP 2 — MAX HEAT ---------- */
  const loop2 = new PD.GameClip({
    id: 'loop2', start: T(21), end: T(22), preroll: 1.2, seed: 120,
    setup() {
      PD.freshRun({ seed: 120, score: 401250, mods: STRONG });
      wave = 25; spawner.queue = []; spawner.bossAlive = false; spawner.betweenT = 1.32;
      setPalette(SECTORS[4].pal, true);
    },
    script(c, ct) {
      PD.holdWave(26);
      PD.pilot({ y: 1080 });
      c.once('v', ct > 0.05, () => { $s.vee('drone', 9, 400); $s.wall('drone', 7, -130); });
      c.once('v2', ct > 0.7, () => { $s.stream('diver', 5, 300); $s.vee('drone', 7, 560, -60); });
    },
  });

  /* ---------- HALL OF FAME: "YOU" klatrer til #1 ---------- */
  const BD0 = T(22), NEWHS = T(25);
  const ROWS = PD.BOARD;
  const passT = [T(22, 3), T(23, 0), T(23, 1), T(23, 2), T(23, 3), T(24, 0), T(24, 1), T(24, 2), T(24, 3)]; // KAI … NOVA
  const passOf = (r) => (r === 0 ? NEWHS : passT[9 - r]);                   // r = 0 (ACE) … 9 (KAI)
  const youKeys = [[BD0 + 0.45, 0]];
  for (let r = 9; r >= 1; r--) youKeys.push([passOf(r), ROWS[r][1] + 37 + r * 11]);
  youKeys.push([T(24, 3.6), 471200], [T(24, 3.85), 485930], [NEWHS - 0.03, 487310], [NEWHS, 487620], [NEWHS + 2, 487620]);
  const youScore = (t) => {
    if (t <= youKeys[0][0]) return 0;
    for (let k = 1; k < youKeys.length; k++) {
      const [t1, v1] = youKeys[k], [t0, v0] = youKeys[k - 1];
      if (t <= t1) return U.lerp(v0, v1, U.inv(t0, t1, t));
    }
    return youKeys[youKeys.length - 1][1];
  };
  PD.youScore = youScore;

  class BoardClip extends PD.Clip {
    draw(t) {
      const g = this.g;
      PD.synthBg(g, t, { horizon: 1640, mountains: true, speed: 1.6 });
      const P = { x: 64, y: 420, w: 952, h: 1150 };
      const shake = passT.concat([NEWHS]).reduce((m, pt) => Math.max(m, t >= pt ? Math.exp(-(t - pt) / 0.08) : 0), 0);
      g.save();
      g.translate((U.hash(Math.floor(t * 60), 1) - 0.5) * 14 * shake, (U.hash(Math.floor(t * 60), 2) - 0.5) * 10 * shake);
      g.fillStyle = 'rgba(10,2,30,0.9)';
      g.fillRect(P.x, P.y, P.w, P.h);
      g.save();
      g.strokeStyle = COL.pink; g.lineWidth = 4; g.shadowColor = COL.pink; g.shadowBlur = 22;
      g.strokeRect(P.x + 10, P.y + 10, P.w - 20, P.h - 20);
      g.restore();
      const inA = U.easeOut(U.inv(BD0 - 0.05, BD0 + 0.25, t));
      PD.text(g, '— HALL OF FAME —', W / 2 + (1 - inA) * 400, P.y + 90, { size: 36, color: COL.pink, glow: 20, alpha: inA });
      const you = youScore(t);
      const slotY = (s) => P.y + 205 + s * 88;
      const moveK = (pt) => U.easeInOut(U.inv(pt, pt + 0.16, t));
      const champ = t >= NEWHS;
      // rækkerne (de overhalede glider én plads ned)
      ROWS.forEach(([name, sc], r) => {
        const pt = passOf(r);
        const y = U.lerp(slotY(r), slotY(r + 1), moveK(pt));
        const a = U.easeOut(U.inv(BD0 + 0.05 + r * 0.04, BD0 + 0.25 + r * 0.04, t));
        const flash = t >= pt ? Math.exp(-(t - pt) / 0.12) : 0;
        const first = r === 0 && !champ;
        PD.drawRow(g, Math.round(U.lerp(r + 1, r + 2, moveK(pt))), name, sc, P.x + 70 + (1 - a) * 700, P.x + P.w - 70 + (1 - a) * 700, y, {
          size: 64, alpha: a,
          color: flash > 0.05 ? '#ff4d4d' : first ? COL.orange : '#d8d4ff',
          glow: first ? 16 : flash * 20,
        });
      });
      // YOU-rækken
      const passed = ROWS.filter((_, r) => t >= passOf(r)).length;
      let ys = slotY(10);
      for (let r = 9; r >= 0; r--) { const pt = passOf(r); if (t >= pt) ys = U.lerp(slotY(r + 1), slotY(r), moveK(pt)); }
      const ya = U.easeOut(U.inv(BD0 + 0.35, BD0 + 0.5, t));
      if (ya > 0) {
        const col = champ ? COL.orange : COL.cyan;
        const pulse = 0.5 + 0.5 * Math.sin(t * 14);
        PD.drawRow(g, 11 - passed, 'YOU', you, P.x + 70, P.x + P.w - 70, ys, {
          size: champ ? 72 : 66, alpha: ya, color: col, glow: 18 + 10 * pulse, rankColor: col,
          bg: champ ? `rgba(255,176,0,${0.16 + 0.1 * pulse})` : `rgba(0,246,255,${0.10 + 0.06 * pulse})`,
          border: champ ? COL.orange : COL.cyan,
        });
        // pil
        g.save();
        g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16;
        const ax = P.x + 22 + Math.sin(t * 12) * 6;
        g.beginPath(); g.moveTo(ax + 26, ys); g.lineTo(ax, ys - 18); g.lineTo(ax, ys + 18); g.closePath(); g.fill();
        g.restore();
        if (champ) PD.drawCrown(g, P.x + P.w - 70 - PD.textWidth(g, PD.fmt(you), 72, 'vt') - 60, ys - 6, 5);
      }
      g.restore();
      // stor rang-tæller over tavlen
      if (!champ && ya > 0) {
        const rk = 11 - passed;
        const bump = passT.reduce((m, pt) => Math.max(m, t >= pt ? Math.exp(-(t - pt) / 0.1) : 0), 0);
        PD.text(g, 'YOUR RANK', W / 2, 250, { font: 'vt', size: 50, color: COL.dim, glow: false, spacing: 10 });
        PD.text(g, '#' + rk, W / 2, 340, { size: 84 * (1 + 0.25 * bump), color: COL.cyan, glow: 26, chroma: 10 * bump });
      }
      if (champ) {
        // NEW HIGH SCORE! (regnbue som i arkadehallen) + fyrværkeri
        const lt = t - NEWHS;
        if (lt < 0.8) {
          const s = 'NEW HIGH SCORE!';
          const cols = [COL.cyan, COL.pink, COL.orange, COL.yellow, COL.green];
          const size = 56, adv = size + 4, x0 = W / 2 - (s.length * adv) / 2 + adv / 2;
          const sc = U.back(U.inv(0, 0.18, lt));
          for (let k = 0; k < s.length; k++) {
            PD.text(g, s[k], W / 2 + (x0 + k * adv - W / 2) * sc, 300 + Math.sin(lt * 14 + k * 0.7) * 10, { size: size * sc, color: cols[(k + Math.floor(lt * 20)) % cols.length], glow: 18, double: false });
          }
        }
        PD.fireworks(g, lt, W / 2, ys, 0);
        PD.fireworks(g, lt - 0.25, 260, 640, 1);
        PD.fireworks(g, lt - 0.45, 820, 560, 2);
      }
    }
  }
  const board = new BoardClip({ id: 'board', start: BD0, end: T(26) });

  /* ---------- SLUTSKILT: logo + PLAY FREE + INSERT COIN ---------- */
  const OUT0 = T(26), COIN_IN = T(29, 0);
  class OutroClip extends PD.Clip {
    begin() { this.logo = U.canvas(); this.lg = this.logo.getContext('2d'); }
    draw(t) {
      const g = this.g, lt = t - OUT0;
      PD.synthBg(g, t, { horizon: 900, sun: true, sunR: 330, sunLift: 96, mountains: true, speed: 1.1 });
      // logo
      const lg = this.lg;
      lg.clearRect(0, 0, W, H);
      const word = (str, y, t0, col, deep, light) => {
        const size = 140, adv = size + 14, x0 = W / 2 - ((str.length - 1) * adv) / 2;
        for (let k = 0; k < str.length; k++) {
          const a = U.inv(t0 + k * 0.045, t0 + k * 0.045 + 0.22, t);
          if (a <= 0) continue;
          const yy = y - (1 - U.back(a)) * 260;
          PD.text(lg, str[k], x0 + k * adv, yy, {
            size, alpha: Math.min(1, a * 3), glow: 26, glowColor: col,
            extrude: { n: 9, dx: 2, dy: 3, color: deep },
            stroke: { w: 10, color: '#0b0218' },
            fill: (gg, sz) => { const gr = gg.createLinearGradient(0, -sz / 2, 0, sz / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, light); gr.addColorStop(0.55, col); gr.addColorStop(1, deep); return gr; },
          });
        }
      };
      word('NEON', 560, OUT0 + 0.06, COL.cyan, '#063a6e', '#b5fdff');
      word('BREACH', 735, OUT0 + 0.3, COL.pink, '#5a0a55', '#ffc2f3');
      // krom-glimt hen over logoet
      const sh = U.inv(OUT0 + 0.75, OUT0 + 1.15, t);
      if (sh > 0 && sh < 1) {
        lg.save();
        lg.globalCompositeOperation = 'source-atop';
        const x = U.lerp(-300, W + 300, sh);
        const gr = lg.createLinearGradient(x - 140, 0, x + 140, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        lg.fillStyle = gr;
        lg.setTransform(1, 0, -0.5, 1, 0, 0);
        lg.fillRect(x - 160 + 300, 380, 320, 520);
        lg.restore();
      }
      g.drawImage(this.logo, 0, 0);
      const sa = U.inv(OUT0 + 0.65, OUT0 + 0.9, t);
      if (sa > 0) PD.text(g, 'A SYNTHWAVE INVASION', W / 2, 860, { font: 'vt', size: 54, color: COL.orange, glow: 14, spacing: 14, alpha: sa, stroke: { w: 8, color: '#0b0218' } });
      // skibet svæver ind nedefra
      const sy = U.lerp(2150, 1720, U.easeOut(U.inv(OUT0 + 0.2, OUT0 + 1.0, t))) + Math.sin(t * 2.6) * 10;
      const sx = W / 2 + Math.sin(t * 1.3) * 60;
      PD.drawShipFilm(g, sx, sy, 3.4, Math.cos(t * 1.3) * 0.6, t, false);
      // INSERT COIN-knappen
      const ba = U.easeOut(U.inv(T(28) - 0.05, T(28) + 0.2, t));
      if (ba > 0) {
        const pressed = t >= COIN_IN;
        const bw = 760, bh = 136, bx = W / 2 - bw / 2, by = 1360 - bh / 2;
        const pulse = Math.floor(t * 2 / SC.BEAT) % 2 === 0;
        g.save();
        g.globalAlpha = ba;
        g.translate(W / 2, 1360); g.scale(0.6 + 0.4 * U.back(ba), 0.6 + 0.4 * U.back(ba)); g.translate(-W / 2, -1360);
        const col = pressed ? COL.cyan : COL.orange;
        const bg = g.createLinearGradient(0, by, 0, by + bh);
        bg.addColorStop(0, '#1a0533'); bg.addColorStop(1, '#06010f');
        g.fillStyle = bg; g.fillRect(bx, by, bw, bh);
        g.shadowColor = col; g.shadowBlur = pulse ? 60 : 30;
        g.strokeStyle = col; g.lineWidth = 8;
        g.strokeRect(bx, by, bw, bh);
        g.shadowBlur = 0;
        if (!pressed) {
          PD.drawCoin(g, bx + 105, 1360, 40, t);
          PD.text(g, 'INSERT COIN', W / 2 + 60, 1362, { size: 50, color: COL.orange, glow: 22, spacing: 8 });
        } else {
          const fl = 1 - U.inv(COIN_IN, COIN_IN + 0.25, t);
          if (fl > 0) { g.fillStyle = `rgba(255,255,255,${fl})`; g.fillRect(bx, by, bw, bh); }
          if (Math.floor((t - COIN_IN) * 5) % 2 === 0 || t - COIN_IN < 0.5) {
            PD.text(g, 'PLAY NOW', W / 2 + 40, 1362, { size: 54, color: COL.cyan, glow: 26, spacing: 8 });
            g.save(); g.fillStyle = COL.cyan; g.shadowColor = COL.cyan; g.shadowBlur = 20;
            g.beginPath(); g.moveTo(W / 2 - 250, 1334); g.lineTo(W / 2 - 200, 1362); g.lineTo(W / 2 - 250, 1390); g.closePath(); g.fill();
            g.restore();
          }
        }
        g.restore();
      }
      // mønten der falder i slottet
      const ca = U.inv(COIN_IN - 0.28, COIN_IN, t);
      if (ca > 0 && ca < 1) PD.drawCoin(g, W / 2 + 280 - ca * 180, U.lerp(-80, 1360, U.easeIn(ca)), 46, t * 2);
    }
  }
  const outro = new OutroClip({ id: 'outro', start: OUT0, end: SC.LENGTH + 0.5 });
  PD.COIN_IN = COIN_IN;

  /* =========================================================
     SEGMENTER + OVERGANGE
     ========================================================= */
  const slow = (z0, z1, t0, t1) => (t) => ({ zoom: U.lerp(z0, z1, U.easeInOut(U.inv(t0, t1, t))) });
  // action-kamera: let zoom, følger skibet lidt sidelæns, holder toppen (fjenderne) i billedet
  const act = (clip, z0, z1, t0, t1, fy = H * 0.45) => (t) => ({
    zoom: U.lerp(z0, z1, U.easeInOut(U.inv(t0, t1, t))),
    fx: U.lerp(W / 2, clip.ship.x, 0.3), fy,
  });
  const seg = (clip, trans, cam, post) => ({ clip, start: clip.start, end: clip.end, trans, cam, post });
  PD.segments = [
    seg(hook, null),
    seg(city, null, act(city, 1.08, 1.16, T(2, 2), T(4))),
    seg(belt, { type: 'glitch', pre: 0.08, post: 0.12, sfx: 'glitch' }, act(belt, 1.1, 1.17, T(4), T(6))),
    seg(storm, { type: 'pixel', pre: 0.16, post: 0.16, sfx: 'bitcrush' }, act(storm, 1.1, 1.16, T(6), T(8))),
    seg(tunnel, { type: 'diamond', pre: 0.34, post: 0.02, sfx: 'sweep' }, act(tunnel, 1.12, 1.18, T(8), T(9))),
    seg(motherS, { type: 'wipe', pre: 0.22, post: 0.1, sfx: 'whoosh' }, act(motherS, 1.1, 1.16, T(9), T(10))),
    seg(graze, { type: 'zoom', pre: 0.2, post: 0.24, sfx: 'zoom' },
      (t) => ({ zoom: U.lerp(1, 1.95, U.easeOut(U.inv(GZ0, GZ0 + 0.35, t))) * U.lerp(1, 1 / 1.95, U.easeIn(U.inv(GZ1 - 0.3, GZ1, t))), fx: graze.ship.x, fy: graze.ship.y - 40 })),
    seg(rampage, { type: 'tv', pre: 0.08, post: 0.1, sfx: 'static' },
      (t) => {
        const fr = U.inv(C.DEATH, C.DEATH + 0.5, t) * (1 - U.inv(C.COIN + 0.15, C.COIN + 0.25, t));
        const od = t >= C.RESUME ? Math.exp(-(t - C.RESUME) / 0.25) : 0;
        return {
          zoom: 1 + 0.16 * U.easeOut(fr) + 0.08 * od,
          fx: rampage.ship.x, fy: rampage.ship.y - 200 * fr,
          filter: fr > 0.01 ? `grayscale(${0.85 * fr}) brightness(${1 - 0.3 * fr})` : null,
        };
      },
      (g, t, i) => {
        const R = rampage.rew;
        if (t >= R.from - 0.05 && t < R.to + 0.08) PD.applyVhs(g, 1, i, t);
        else if (t >= R.to + 0.08 && t < C.RESUME) PD.applyVhs(g, 0.35, i, t);
      }),
    seg(upgrade, { type: 'flash', pre: 0.08, post: 0.16, sfx: 'impact' }),
    seg(lineup, { type: 'vroll', pre: 0.18, post: 0.18, sfx: 'vroll' }),
    seg(gate, { type: 'glitch', pre: 0.06, post: 0.1, sfx: 'glitch' }, act(gate, 1.2, 1.12, T(17), T(17, 2))),
    seg(crusher, { type: 'glitch', pre: 0.06, post: 0.1, sfx: 'glitch' }, act(crusher, 1.2, 1.12, T(17, 2), T(18))),
    seg(solar, { type: 'pixel', pre: 0.08, post: 0.08, sfx: 'bitcrush' }, act(solar, 1.18, 1.1, T(18), T(18, 2))),
    seg(firewall, { type: 'laser', pre: 0.02, post: 0.34, sfx: 'laser', angle: -0.5 }, act(firewall, 1.2, 1.12, T(18, 2), T(19))),
    seg(motherB, { type: 'glitch', pre: 0.06, post: 0.12, sfx: 'glitch' },
      (t) => {
        const k = U.easeInOut(U.inv(KILL - 0.3, KILL + 0.4, t));
        return { zoom: 1.0 + 0.32 * k, fx: motherB.focus ? motherB.focus.x : W / 2, fy: motherB.focus ? motherB.focus.y + 260 : H / 2 };
      }),
    seg(loop2, { type: 'flash', pre: 0.02, post: 0.3, sfx: 'none' }, act(loop2, 1.16, 1.1, T(21), T(22))),
    seg(board, { type: 'pixel', pre: 0.14, post: 0.2, sfx: 'bitcrush' }),
    seg(outro, { type: 'tv', pre: 0.1, post: 0.16, sfx: 'static' }),
  ];
  // overgangs-vinduer: indgående klip simulerer fra start - pre, udgående til start + post
  PD.segments.forEach((s, k) => {
    const nx = PD.segments[k + 1];
    if (s.trans && s.clip.sim == null) s.clip.sim = s.start - s.trans.pre;
    s.until = nx && nx.trans ? nx.start + nx.trans.post : s.end;
  });
  hook.until = city.start;

  /* =========================================================
     TEKST-OVERLAYS (film-koordinater, ligger over klip og overgange)
     ========================================================= */
  const OV = (PD.overlays = []);
  const cue = (t, name, extra) => PD.cues.push(Object.assign({ t, kind: 'fx', name }, extra));
  PD.cues = [];
  const ov = (t0, t1, fn) => OV.push({ t0, t1, fn });

  // SLAM: popper ind på slaget med RGB-split, holder, glitcher ud
  const fitSize = (g, text, o) => {
    const size = o.size ?? 72;
    const w = PD.textWidth(g, text, size, o.font, o.spacing ?? 0);
    return w > W - 110 ? size * (W - 110) / w : size;
  };
  const slam = (text, t0, t1, o = {}) => {
    let fitted = null;
    ov(t0, t1, (g, t) => {
      if (fitted == null) fitted = fitSize(g, text, o);
      const lt = t - t0, rt = t1 - t;
      const inK = U.clamp01(lt / (o.inDur ?? 0.16));
      const outK = U.clamp01(1 - rt / 0.12);
      const sc = U.lerp(o.from ?? 2.3, 1, U.back(inK)) * (1 + 0.02 * Math.sin(lt * 18) * (o.wobble ?? 0));
      const a = Math.min(1, lt / 0.05) * (1 - outK);
      let x = o.x ?? W / 2;
      if (outK > 0) x += (U.hash(Math.floor(t * 60), 5) - 0.5) * 120 * outK;
      if (o.plate) {
        g.save();
        g.globalAlpha = a * 0.75;
        const ph = (o.size ?? 72) * 2.1;
        const gr = g.createLinearGradient(0, (o.y ?? H / 2) - ph / 2, 0, (o.y ?? H / 2) + ph / 2);
        gr.addColorStop(0, 'rgba(6,1,15,0)'); gr.addColorStop(0.3, 'rgba(6,1,15,0.85)'); gr.addColorStop(0.7, 'rgba(6,1,15,0.85)'); gr.addColorStop(1, 'rgba(6,1,15,0)');
        g.fillStyle = gr;
        g.fillRect(0, (o.y ?? H / 2) - ph / 2, W, ph);
        g.restore();
      }
      PD.text(g, text, x, o.y ?? H / 2, Object.assign({}, o, { size: fitted, scale: sc, alpha: a, chroma: (1 - inK) * 28 + outK * 30 + (o.chroma ?? 0) }));
    });
    if (o.sfx !== 'none') cue(t0, o.sfx ?? 'slam');
  };

  // Skrivemaskine (venstrestillet ud fra den færdige tekst, så den ikke "vandrer")
  const typer = (text, t0, t1, o = {}) => {
    const cps = o.cps ?? 16;
    ov(t0, t1, (g, t) => {
      const n = Math.min(text.length, Math.floor((t - t0) * cps) + 1);
      const size = o.size ?? 48, sp = o.spacing ?? 4;
      const full = PD.textWidth(g, text, size, o.font, sp);
      const x = W / 2 - full / 2;
      const a = 1 - U.clamp01(1 - (t1 - t) / 0.1);
      PD.text(g, text.slice(0, n), x, o.y, Object.assign({}, o, { align: 'left', alpha: a }));
      if (n < text.length || Math.floor(t * 3.3) % 2 === 0) {
        const cw = PD.textWidth(g, text.slice(0, n), size, o.font, sp);
        g.save(); g.globalAlpha = a; g.fillStyle = o.color ?? '#fff'; g.shadowColor = o.color ?? '#fff'; g.shadowBlur = 12;
        g.fillRect(x + cw + 6, o.y - size / 2, size * 0.7, size);
        g.restore();
      }
    });
    for (let k = 0; k < text.length; k++) if (text[k] !== ' ') cue(t0 + k / cps, 'type');
  };

  // Sektor-kort: "SECTOR 2/5" + navn, glider ind fra hver sin side
  const card = (num, name, t0, t1, col) => {
    ov(t0, t1, (g, t) => {
      const lt = t - t0, rt = t1 - t;
      const inK = U.easeOut(U.clamp01(lt / 0.2)), outK = U.easeIn(U.clamp01(1 - rt / 0.18));
      const y = 640;
      const size = Math.min(72, Math.floor(980 / (name.length * 1.08)));
      g.save();
      g.globalAlpha = 0.78 * (1 - outK) * inK;
      const gr = g.createLinearGradient(0, y - 150, 0, y + 110);
      gr.addColorStop(0, 'rgba(6,1,15,0)'); gr.addColorStop(0.25, 'rgba(6,1,15,0.82)'); gr.addColorStop(0.8, 'rgba(6,1,15,0.82)'); gr.addColorStop(1, 'rgba(6,1,15,0)');
      g.fillStyle = gr; g.fillRect(0, y - 150, W, 260);
      g.restore();
      const a = 1 - outK;
      PD.text(g, `SECTOR ${num}/5`, W / 2 - (1 - inK) * W + outK * W * 0.6, y - 78, { font: 'vt', size: 58, color: COL.orange, glow: 12, spacing: 16, alpha: a });
      PD.text(g, name, W / 2 + (1 - inK) * W - outK * W * 0.6, y + 10, { size, color: col, glow: 26, spacing: 4, alpha: a, chroma: (1 - inK) * 20 });
      g.save();
      g.globalAlpha = a; g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 14; g.lineWidth = 4;
      const lw = 380 * inK;
      g.beginPath(); g.moveTo(W / 2 - lw, y + 66); g.lineTo(W / 2 + lw, y + 66); g.stroke();
      g.restore();
    });
    cue(t0, 'whoosh');
  };

  // VHS on-screen-display
  const osd = (text, t0, t1, o = {}) => {
    ov(t0, t1, (g, t) => {
      if (o.blink && Math.floor((t - t0) * 4) % 2 === 1) return;
      g.save();
      g.font = PD.VT(o.size ?? 84);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.letterSpacing = '6px';
      const x = o.x ?? 80, y = o.y ?? 270;
      let ix = x;
      if (o.icon === 'rew' || o.icon === 'play') {
        g.fillStyle = '#000'; g.globalAlpha = 0.6;
        const icon = (ox, oy) => {
          if (o.icon === 'rew') {
            for (const k of [0, 1]) { g.beginPath(); g.moveTo(ox + k * 34, oy); g.lineTo(ox + k * 34 + 34, oy - 26); g.lineTo(ox + k * 34 + 34, oy + 26); g.closePath(); g.fill(); }
          } else { g.beginPath(); g.moveTo(ox, oy - 28); g.lineTo(ox + 44, oy); g.lineTo(ox, oy + 28); g.closePath(); g.fill(); }
        };
        icon(x + 5, y + 5);
        g.globalAlpha = 1; g.fillStyle = '#fff';
        icon(x, y);
        ix = x + (o.icon === 'rew' ? 92 : 64);
      }
      g.fillStyle = '#000'; g.globalAlpha = 0.6; g.fillText(text, ix + 5, y + 5);
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.fillText(text, ix, y);
      g.restore();
    });
  };

  /* ---- HOOK ---- */
  typer('THINK YOU CAN', 0.45, 3.05, { y: 300, size: 50, color: '#ffffff', glow: 14, glowColor: COL.cyan, cps: 20, spacing: 4 });
  slam('BEAT THIS?', T(0, 3), 3.05, { y: 392, size: 86, color: COL.pink, glow: 30, spacing: 4 });
  cue(2.0, 'glitch');
  // LOGO-drop på faldet
  slam('NEON', T(2), T(2, 3.2), { y: 760, size: 150, color: COL.cyan, glow: 34, spacing: 14, from: 3.2, plate: false, sfx: 'logo', extrude: { n: 7, dx: 2, dy: 3, color: '#063a6e' }, stroke: { w: 10, color: '#0b0218' } });
  slam('BREACH', T(2, 0.25), T(2, 3.2), { y: 930, size: 150, color: COL.pink, glow: 34, spacing: 14, from: 3.2, sfx: 'none', extrude: { n: 7, dx: 2, dy: 3, color: '#5a0a55' }, stroke: { w: 10, color: '#0b0218' } });
  slam('A SYNTHWAVE INVASION', T(2, 1), T(2, 3.2), { y: 1050, font: 'vt', size: 56, color: COL.orange, glow: 14, spacing: 14, from: 1.4, sfx: 'none', stroke: { w: 8, color: '#0b0218' } });

  /* ---- SEKTORER ---- */
  card(1, 'NEON CITY', T(3), T(3, 2.6), COL.pink);
  card(2, 'ASTEROID BELT', T(4, 0.15), T(4, 3.0), COL.orange);
  card(3, 'SOLAR STORM', T(6, 0.15), T(6, 3.0), COL.yellow);
  card(4, 'CYBER TUNNEL', T(8, 0.1), T(8, 2.9), COL.green);
  card(5, 'MOTHERSHIP', T(9, 0.1), T(9, 2.9), COL.purple);

  /* ---- GRAZE ---- */
  slam('GRAZE', GZ0 + 0.1, GZ1 - 0.08, { y: 470, size: 120, color: '#ffffff', glow: 30, glowColor: COL.cyan, spacing: 10 });
  slam('SKIM BULLETS = BONUS + OVERDRIVE', T(10, 1), GZ1 - 0.08, { y: 590, font: 'vt', size: 54, color: COL.cyan, glow: 12, spacing: 4, from: 1.3, sfx: 'none', stroke: { w: 8, color: '#0b0218' } });

  /* ---- COMBO → GAME OVER → REWIND → OVERDRIVE ---- */
  slam('CHAIN KILLS', RZ + 0.08, T(11, 2.6), { y: 520, size: 84, color: COL.orange, glow: 28, spacing: 6, plate: true });
  slam('x8 COMBO', T(11, 2.75), T(12, 1.4), { y: 640, size: 120, color: COL.orange, glow: 34, spacing: 6, wobble: 1, plate: true });
  // skibet rammes: rødt flash + glitch præcis på musikkens cut
  ov(C.DEATH, C.DEATH + 0.32, (g, t, i) => {
    const k = 1 - U.inv(C.DEATH, C.DEATH + 0.32, t);
    PD.glitchSlices(g, g.canvas, g.canvas, 0, k, i * 3 + 1);
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,30,80,${0.55 * k * k})`; g.fillRect(0, 0, W, H); g.restore();
  });
  slam('GAME OVER', T(12, 2.5), C.COIN + 0.18, { y: 760, size: 92, color: COL.pink, glow: 40, spacing: 8, from: 1.6, sfx: 'none' });
  slam('CONTINUE?', T(12, 3.1), C.COIN + 0.18, { y: 900, size: 46, color: '#ffffff', glow: 14, spacing: 6, from: 1.2, sfx: 'none' });
  for (const [d, t0] of [['9', T(12, 3.3)], ['8', T(12, 3.65)]]) {
    slam(d, t0, Math.min(t0 + 0.34, C.COIN + 0.18), { y: 1060, size: 150, color: COL.orange, glow: 30, from: 1.6, sfx: 'tick' });
  }
  // INSERT COIN: mønten falder ind
  ov(C.COIN, C.COIN + 0.22, (g, t) => {
    const k = U.inv(C.COIN, C.COIN + 0.18, t);
    PD.drawCoin(g, W / 2, U.lerp(-100, 1000, U.easeIn(k)), 70, t * 2);
    PD.text(g, 'CREDIT 01', W - 60, 230, { font: 'vt', size: 60, color: '#fff', glow: 10, align: 'right', spacing: 6 });
  });
  cue(C.COIN, 'coin');
  ov(C.COIN + 0.15, C.COIN + 0.3, (g, t) => { g.save(); g.fillStyle = '#fff'; g.globalAlpha = 1 - U.inv(C.COIN + 0.15, C.COIN + 0.3, t); g.fillRect(0, 0, W, H); g.restore(); });
  osd('REWIND', rampage.rew.from, rampage.rew.to, { icon: 'rew', blink: true, y: 360 });
  ov(rampage.rew.from, rampage.rew.to, (g, t) => {
    const k = U.inv(rampage.rew.from, rampage.rew.to, t);
    const secs = Math.floor(U.lerp(19 * 60 + 48, 18 * 60 + 6, U.easeInOut(k)) * 1);
    const s = 'SP  0:' + String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    g.save(); g.font = PD.VT(64); g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#000'; g.globalAlpha = 0.6; g.fillText(s, W - 75, 1745); g.globalAlpha = 1; g.fillStyle = '#fff'; g.fillText(s, W - 80, 1740); g.restore();
  });
  cue(rampage.rew.from, 'rewind', { dur: rampage.rew.to - rampage.rew.from });
  osd('PLAY', rampage.rew.to, C.RESUME + 0.25, { icon: 'play', y: 360 });
  cue(rampage.rew.to, 'click');
  slam('NOT TODAY.', T(13, 3) - 0.08, C.RESUME - 0.02, { y: 560, size: 88, color: COL.cyan, glow: 30, spacing: 6, plate: true });
  slam('INVINCIBLE · x2 SCORE', C.RESUME + 0.2, T(14, 3.6), { y: 880, font: 'vt', size: 64, color: COL.pink, glow: 16, spacing: 6, from: 1.4, sfx: 'none', stroke: { w: 8, color: '#0b0218' } });

  /* ---- UPGRADE ---- */
  cue(UP0, 'card'); cue(UP0 + 0.2, 'card'); cue(UP0 + 0.4, 'card');
  cue(PICK - 0.4, 'select');
  slam('BUILD YOUR SHIP', PICK + 0.06, T(16) - 0.02, { y: 560, size: 70, color: COL.green, glow: 28, spacing: 6, plate: true });

  /* ---- WARNING ---- */
  ov(WN - 0.05, T(17) + 0.05, (g, t) => {
    // gul/sort hazard-tape top og bund
    const off = (t * 260) % 80;
    for (const y0 of [150, H - 210]) {
      g.save();
      g.beginPath(); g.rect(0, y0, W, 56); g.clip();
      g.fillStyle = '#ffb000'; g.fillRect(0, y0, W, 56);
      g.fillStyle = '#0b0218';
      for (let x = -120 + (y0 > 500 ? -off : off); x < W + 120; x += 80) {
        g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 40, y0); g.lineTo(x + 10, y0 + 56); g.lineTo(x - 30, y0 + 56); g.closePath(); g.fill();
      }
      g.restore();
    }
    if (Math.floor((t - WN) / (SC.BEAT / 2)) % 2 === 0) {
      PD.text(g, 'WARNING', W / 2, 300, { size: 104, color: '#ff3355', glow: 40, spacing: 12, stroke: { w: 10, color: '#0b0218' } });
    }
  });
  slam('5 UNIQUE BOSSES', T(16, 2.5), T(17) - 0.02, { y: 1590, size: 64, color: COL.orange, glow: 28, spacing: 4, plate: true });

  /* ---- BOSS-RUSH ---- */
  const bossName = (txt, t0, t1, col) => slam(txt, t0 + 0.02, t1 - 0.03, { y: 1210, size: Math.min(84, Math.floor(960 / (txt.length * 1.08))), color: col, glow: 32, spacing: 4, plate: true, sfx: 'boss' });
  bossName('GATEKEEPER', T(17), T(17, 2), COL.pink);
  bossName('THE CRUSHER', T(17, 2), T(18), COL.orange);
  bossName('SOLAR CORE', T(18), T(18, 2), COL.yellow);
  bossName('FIREWALL', T(18, 2), T(19), COL.green);
  bossName('THE MOTHERSHIP', T(19), T(20), COL.purple);

  /* ---- LOOP 2 ---- */
  slam('BEAT ALL 5?', T(21) + 0.1, T(21, 2) - 0.02, { y: 540, size: 84, color: COL.cyan, glow: 28, spacing: 6, plate: true });
  slam('IT LOOPS. HARDER.', T(21, 2), T(22) - 0.04, { y: 540, size: 64, color: COL.pink, glow: 28, spacing: 4, plate: true });

  /* ---- HALL OF FAME ---- */
  for (const pt of passT) cue(pt, 'overtake');
  cue(NEWHS, 'highscore');
  slam('NOW DEFEND IT.', T(25, 2), T(26) - 0.04, { y: 300, size: 76, color: COL.pink, glow: 32, spacing: 6, plate: true });

  /* ---- SLUTSKILT ---- */
  cue(OUT0 + 0.06, 'logo');
  slam('PLAY FREE', T(27), SC.LENGTH, { y: 1060, size: 92, color: COL.cyan, glow: 32, spacing: 8, stroke: { w: 10, color: '#0b0218' } });
  slam('IN YOUR BROWSER', T(27, 1), SC.LENGTH, { y: 1158, font: 'vt', size: 70, color: '#ffffff', glow: 12, glowColor: COL.cyan, spacing: 8, from: 1.4, sfx: 'none', stroke: { w: 8, color: '#0b0218' } });
  slam('MOBILE · DESKTOP · NO DOWNLOAD', T(27, 2), SC.LENGTH, { y: 1230, font: 'vt', size: 48, color: COL.dim, glow: false, spacing: 6, from: 1.2, sfx: 'none', stroke: { w: 6, color: '#0b0218' } });
  cue(T(28), 'card');
  cue(COIN_IN, 'coin');
  slam('CAN YOU REACH #1?', T(28, 2), SC.LENGTH, { y: 1520, size: 50, color: COL.pink, glow: 26, spacing: 4, stroke: { w: 8, color: '#0b0218' } });
  if (PLAY_URL) slam(PLAY_URL, T(29) + 0.3, SC.LENGTH, { y: 1610, font: 'vt', size: 58, color: '#ffffff', glow: 12, spacing: 6, from: 1.2, sfx: 'none' });
  cue(0, 'crtOn');
  cue(SC.LENGTH - 0.7, 'crtOff');

  // overgangs-lyde
  PD.segments.forEach((s) => { if (s.trans && s.trans.sfx && s.trans.sfx !== 'none') cue(s.start - s.trans.pre, s.trans.sfx, { dur: s.trans.pre + s.trans.post }); });
})();
