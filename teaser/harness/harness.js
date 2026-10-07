// Capture harness — loaded AFTER game.js.
// Supersampled glow, SFX/event logging, god mode, autopilot and scenario setup.
(function () {
  'use strict';
  const SS = window.__SS;
  const c2 = document.getElementById('game').getContext('2d');
  // shadowBlur is in device pixels (ignores the transform) → scale it with the supersampling
  const sb = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
  Object.defineProperty(c2, 'shadowBlur', {
    get() { return sb.get.call(this) / SS; },
    set(v) { sb.set.call(this, v * SS); },
  });

  const log = (name, extra) => window.__events.push(Object.assign({ t: window.__now(), name }, extra || {}));
  for (const n of ['shoot', 'laserHum', 'explode', 'bigBoom', 'hit', 'power', 'graze', 'odGo', 'waveIn', 'bossIn', 'over']) {
    Sfx[n] = function () { log(n); };
  }
  Sfx.noise = function (dur, vol, lp) { log('noise', { dur, vol, lp }); };
  Sfx.tone = function (f, dur, type, vol, slide) { log('tone', { f, dur, type, vol, slide }); };

  const _kill = window.killEnemy;
  window.killEnemy = function (e, silent) {
    if (enemies.indexOf(e) !== -1) log('kill', { type: e.type, boss: e.bossKind || null, x: Math.round(e.x), y: Math.round(e.y) });
    return _kill(e, silent);
  };
  const _tryOD = window.tryOverdrive;
  window.tryOverdrive = function () { const before = odActive; _tryOD(); if (odActive > 0 && before <= 0) log('overdrive'); };
  window.hitPlayer = function () { log('hitPlayer'); };   // god mode: the pilot never dies on camera
  // tougher regular enemies on camera, so the action happens mid-screen instead of at the top edge
  const _spawn = window.spawnEnemy;
  window.spawnEnemy = function (type, x, y) {
    _spawn(type, x, y);
    const e = enemies[enemies.length - 1];
    const k = window.__bot.hpMul || 1;
    if (e && e.type !== 'boss' && k !== 1) { e.hp = e.maxHp = Math.max(1, Math.round(e.hp * k)); }
  };
  window.__frameNo = 0;
  const _drawEnemy = window.drawEnemy;
  window.drawEnemy = function (e) {
    if (e.type === 'boss' && window.__bot.bossFlicker && window.__frameNo % 3 !== 0 && e.flash > 0) {
      const f = e.flash; e.flash = 0; _drawEnemy(e); e.flash = f; return;
    }
    _drawEnemy(e);
  };

  /* ---------------- Autopilot ---------------- */
  const bot = window.__bot = {
    enabled: true, tx: null, ty: null,
    prefY: 0.80, xMin: 0, xMax: 1, aimWeight: 0.9, yWeight: 0.35,
    grazeLove: 0, margin: 12, maxSpeed: 760, autoOD: false, aimX: null, bossFlicker: true, hpMul: 1,
  };
  const prev = new WeakMap();

  function aimTargetX(p) {
    if (bot.aimX != null) return bot.aimX;
    let best = null, bs = Infinity;
    for (const e of enemies) {
      if (e.intangible || e.y > p.y - 80 || e.y < -10) continue;
      let ex = e.x;
      if (e.type === 'boss') {
        if (e.bossKind === 'firewall') {
          const i = e.segs.findIndex((s) => s.weak);
          if (i >= 0) ex = e.x + (i - 3) * e.segW;
        } else if (e.bossKind === 'mothership') {
          const pod = e.pods.find((pd) => pd.alive);
          if (pod) ex = e.x + pod.dx;
        }
      }
      if (e.type === 'mine' || e.type === 'rock') continue;
      const sc = Math.abs(ex - p.x) + (p.y - e.y) * 0.22 - (e.type === 'boss' ? 120 : 0);
      if (sc < bs) { bs = sc; best = ex; }
    }
    return best == null ? VW / 2 : best;
  }

  window.__botStep = function (dt) {
    window.__frameNo++;
    if (!bot.enabled || !player || state !== 'PLAYING') return;
    const p = player;
    touchActive = true;
    if (bot.tx == null) { bot.tx = p.x; bot.ty = p.y; }
    if (bot.autoOD && overdrive >= 100 && odActive <= 0) tryOverdrive();

    // velocity estimates for enemies
    const ev = [];
    for (const e of enemies) {
      const pr = prev.get(e);
      const vx = pr && dt > 0 ? (e.x - pr.x) / dt : 0;
      const vy = pr && dt > 0 ? (e.y - pr.y) / dt : 0;
      prev.set(e, { x: e.x, y: e.y });
      if (!e.intangible) ev.push({ e, vx, vy });
    }
    const boss = enemies.find((e) => e.type === 'boss');

    const minX = Math.max(p.r + 6 + wallW, VW * bot.xMin);
    const maxX = Math.min(VW - p.r - 6 - wallW, VW * bot.xMax);
    const minY = VH * 0.42, maxY = VH - p.r - 10;
    const aimX = aimTargetX(p);
    const prefY = VH * bot.prefY;
    const TT = [0, 0.07, 0.14, 0.22, 0.32, 0.45, 0.6];

    let bx = p.x, by = p.y, bestCost = Infinity;
    for (let dx = -220; dx <= 220; dx += 22) {
      for (let dy = -150; dy <= 150; dy += 30) {
        const cx = Math.min(maxX, Math.max(minX, bot.tx + dx));
        const cy = Math.min(maxY, Math.max(minY, bot.ty + dy));
        const dist = Math.hypot(cx - p.x, cy - p.y);
        const reach = Math.max(0.1, dist / bot.maxSpeed);
        let cost = 0;
        for (const tt of TT) {
          const k = Math.min(1, tt / reach);
          const sx = p.x + (cx - p.x) * k, sy = p.y + (cy - p.y) * k;
          const wT = 1 - tt / 0.85;
          for (const b of ebullets) {
            const qx = b.x + b.vx * tt - sx, qy = b.y + b.vy * tt - sy;
            if (Math.abs(qx) > 90 || Math.abs(qy) > 90) continue;
            const d = Math.hypot(qx, qy);
            const R = b.r + p.r + bot.margin;
            if (d < R) cost += 900 * wT * (1.3 - d / R);
            else if (bot.grazeLove && d < R + 26 && tt <= 0.22) cost -= bot.grazeLove;
          }
          for (const o of ev) {
            const e = o.e;
            if (e.type === 'boss' && (e.bossKind === 'firewall' || e.bossKind === 'mothership')) continue;
            const qx = e.x + o.vx * tt - sx, qy = e.y + o.vy * tt - sy;
            const R = e.r + p.r + 26;
            if (Math.abs(qx) > R + 20 || Math.abs(qy) > R + 20) continue;
            const d = Math.hypot(qx, qy);
            if (d < R) cost += 1100 * wT * (1.3 - d / R);
          }
        }
        for (const h of hazards) {
          if (h.kind === 'flare' && Math.abs(cx - h.x) < h.w / 2 + p.r + 16) cost += h.phase === 'on' ? 6000 : 3500;
        }
        if (boss && boss.bossKind === 'solarcore' && boss.beamMode !== 'off') {
          const rot = boss.beamMode === 'on' ? (boss.hp / boss.maxHp < 0.33 ? 0.8 : 0.55) : 0;
          for (const a0 of boss.beams) {
            for (const tt of [0, 0.15, 0.3, 0.5, 0.75, 1.0, 1.3]) {
              const a = a0 + rot * tt;
              const pdx = cx - boss.x, pdy = cy - boss.y;
              const along = pdx * Math.cos(a) + pdy * Math.sin(a);
              const perp = Math.abs(-pdx * Math.sin(a) + pdy * Math.cos(a));
              if (along > 0 && perp < 14 * S + p.r + 48) cost += (boss.beamMode === 'on' ? 5000 : 2500) * (1.4 - tt / 1.3);
            }
          }
        }
        // collect powerups when it is safe-ish
        for (const u of powerups) {
          const d = Math.hypot(u.x - cx, u.y - cy);
          if (d < 140) cost -= (140 - d) * 1.2;
        }
        cost += Math.abs(cx - aimX) * bot.aimWeight + Math.abs(cy - prefY) * bot.yWeight;
        cost += Math.hypot(cx - bot.tx, cy - bot.ty) * 0.25;     // hysteresis
        if (cost < bestCost) { bestCost = cost; bx = cx; by = cy; }
      }
    }
    // rate-limited, smoothed target → natural looking flight
    const mdx = bx - bot.tx, mdy = by - bot.ty;
    const md = Math.hypot(mdx, mdy);
    const step = bot.maxSpeed * dt;
    if (md > step) { bot.tx += mdx / md * step; bot.ty += mdy / md * step; }
    else { bot.tx = bx; bot.ty = by; }
    touch.x = bot.tx;
    touch.y = bot.ty + 60;
  };

  /* ---------------- Scenario setup ---------------- */
  window.__setup = function (o) {
    o = o || {};
    if (o.seed != null) window.__reseed(o.seed);
    startGame();
    Object.assign(player.mods, o.mods || {});
    if (o.weapon) { player.weapon = o.weapon; player.weaponT = o.weaponT || 999; }
    if (o.lives) player.lives = o.lives;
    wave = (o.wave || 1) - 1;
    spawner.betweenT = o.delay != null ? o.delay : 0.05;
    setPalette(SECTORS[sectorIndex(o.wave || 1)].pal, true);
    if (o.x != null) player.x = o.x;
    if (o.y != null) player.y = o.y;
    Object.assign(bot, { tx: player.x, ty: player.y }, o.bot || {});
    if (o.score) score = o.score;
    window.__events.length = 0;
    return { wave, sector: SECTORS[sectorIndex(o.wave || 1)].name };
  };

  window.__state = function () {
    const boss = enemies.find((e) => e.type === 'boss');
    return {
      t: window.__now(), wave, state, score, combo, overdrive, odActive,
      nEnemies: enemies.length, nEB: ebullets.length, nB: bullets.length, nP: particles.length,
      boss: boss ? { kind: boss.bossKind, hp: boss.hp, maxHp: boss.maxHp, x: boss.x, y: boss.y, beamMode: boss.beamMode,
        pods: boss.pods ? boss.pods.map((pd) => pd.alive) : null } : null,
      px: player && player.x, py: player && player.y,
    };
  };
})();
