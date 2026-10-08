/* =====================================================
   NEON BREACH — promo director · KLIP
   GameClip  = et stykke RIGTIGT gameplay fra spilmotoren
               (egen motor-tilstand, så to klip kan overlappe
               i en overgang — tilstanden byttes via snapshot)
   Øvrige    = film-grafik (leaderboard, boss-roster, slutskilt)
   ===================================================== */
(() => {
  'use strict';
  const PD = window.PD;
  const { W, H, KX, KY, U, COL } = PD;
  const SC = window.PROMO_SCORE;
  const T = (bar, beat = 0) => bar * SC.BAR + beat * SC.BEAT;
  PD.T = T;
  PD.events = [];

  /* ---------- Hjælpere til iscenesættelse ---------- */
  const add = (type, x, y) => { spawnEnemy(type, clamp(x, 50, VW - 50), y); return enemies[enemies.length - 1]; };
  const H$ = (PD.stage = {
    add,
    vee(type, n, cx, y0 = -40) {
      add(type, cx, y0);
      for (let i = 1; i <= Math.floor(n / 2); i++) { add(type, cx - i * 62, y0 - i * 34); add(type, cx + i * 62, y0 - i * 34); }
    },
    wall(type, n, y0 = -40) { for (let i = 0; i < n; i++) add(type, 70 + (VW - 140) * (i / (n - 1)), y0); },
    stream(type, n, cx, y0 = -40) { for (let i = 0; i < n; i++) add(type, cx + (U.hash(n, i, 3) - 0.5) * 90, y0 - i * 70); },
    field(type, n, y0, y1, seed = 1) {
      for (let i = 0; i < n; i++) add(type, 70 + U.hash(seed, i, 1) * (VW - 140), U.lerp(y0, y1, U.hash(seed, i, 2)));
    },
  });

  /* ---------- Grund-klasse ---------- */
  class Clip {
    constructor(o) {
      Object.assign(this, { hud: 0, cam: null }, o);
      this.layer = U.canvas();
      this.g = this.layer.getContext('2d');
      this.lastI = -1;
      this.begun = false;
    }
    get simStart() { return this.sim ?? this.start; }
    audible(t) { return t >= this.start - 0.08 && t < this.end + 0.08; }
    advanceTo(t, i, dt) {
      if (this.lastI === i) return;
      this.lastI = i;
      if (!this.begun) { this.begun = true; this.begin?.(t); }
      this.draw(t, dt, i);
    }
    // én-gangs-hændelse inden for klippet
    once(key, cond, fn) {
      this._once = this._once || {};
      if (!this._once[key] && cond) { this._once[key] = true; fn(); }
    }
    cue(t, name, extra = {}) { if (this.audible(t)) PD.events.push(Object.assign({ t, kind: 'fx', name, clip: this.id }, extra)); }
  }
  PD.Clip = Clip;

  /* ---------- Gameplay-klip (den rigtige motor) ---------- */
  class GameClip extends Clip {
    constructor(o) {
      super(Object.assign({ hud: 1, preroll: 1.5, seed: 1 }, o));
      this.saved = null;
      this.ship = { x: W / 2, y: H * 0.8 };
    }
    own() {
      if (PD.owner === this) return;
      if (PD.owner && PD.owner.saved !== undefined) PD.owner.saved = PD.snapshot();
      if (this.saved) PD.restore(this.saved);
      PD.owner = this;
    }
    begin(t) {
      this.own();
      PD.sink = null;
      PD.bannerAllow = this.banners || (() => false);
      this.ct = -(this.preroll + (this.start - this.simStart));
      this.setup(this);
      const target = this.simStart - this.start;
      while (this.ct < target - 1e-9) this.tick(Math.min(1 / 60, target - this.ct), t);
      this.ct = target;
    }
    tick(sdt, t) {
      if (this.script) this.script(this, this.ct, sdt, t);
      PD.preDraw = this.preDraw ? () => this.preDraw(this, t) : null;
      PD.step(sdt);
      PD.preDraw = null;
      this.ct += sdt;
    }
    rate(t) { return this.speed ? this.speed(t) : 1; }
    sinkFor(t, rate) {
      return this.audible(t) ? (ev) => PD.events.push(Object.assign(ev, { t, clip: this.id, rate })) : null;
    }
    draw(t, dt) {
      this.own();
      PD.bannerAllow = this.banners || (() => false);
      const rate = this.rate(t);
      PD.sink = this.sinkFor(t, rate);
      let rem = dt * rate;
      do { const s = Math.min(rem, 1 / 60); this.tick(s, t); rem -= s; } while (rem > 1e-9);
      PD.sink = null;
      this.render(t);
    }
    render(t) {
      const g = this.g;
      g.save();
      g.globalCompositeOperation = 'copy';
      g.drawImage(cvs, 0, 0);
      g.restore();
      if (player) { this.ship.x = player.x * KX; this.ship.y = player.y * KY; }
      this.hudState = PD.hudState();
      if (this.post) this.post(this, g, t);
    }
  }
  PD.GameClip = GameClip;

  /* ---------- Rampage → GAME OVER → VHS-rewind → OVERDRIVE ---------- */
  // Ét sammenhængende klip. Under rewind afspilles motor-snapshots baglæns;
  // derefter genoptages simuleringen fra et tidligere snapshot (inkl. RNG),
  // så præcis samme situation opstår igen — men nu med OVERDRIVE.
  class RewindClip extends GameClip {
    constructor(o) {
      super(o);
      this.history = [];
      this.phase = 'live';
    }
    draw(t, dt, i) {
      const C = SC.CUES, R = this.rew;
      this.own();
      PD.bannerAllow = this.banners || (() => false);
      if (t >= R.from && t < R.to) {
        // ◀◀ REWIND: snapshots baglæns
        if (this.phase !== 'rewind') { this.phase = 'rewind'; this.histEnd = this.history.length - 1; }
        const k = U.inv(R.from, R.to, t);
        const idx = Math.round((1 - U.easeInOut(k)) * this.histEnd);
        PD.restore(this.history[idx].s);
        drawScene(0);
        this.render(t);
        return;
      }
      if (t >= R.to && this.phase === 'rewind') {
        // ▶ PLAY: fortsæt fra det tidligste snapshot
        this.phase = 'replay';
        PD.restore(this.history[0].s);
        if (this.loadDir) this.loadDir(this.history[0].d);
        this.ct = this.history[0].ct;
        this.history = [];
        PD.mortal = false;
      }
      super.draw(t, dt, i);
      if (this.phase === 'live' && this.ct >= this.recordFrom && t < C.COIN + 0.12) {
        this.history.push({ ct: this.ct, s: PD.snapshot(), d: this.saveDir ? this.saveDir() : null });
      }
    }
  }
  PD.RewindClip = RewindClip;

  /* ---------- Boss-roster ("WARNING") med spillets egne boss-tegninger ---------- */
  class LineupClip extends GameClip {
    constructor(o) { super(Object.assign({ hud: 0, preroll: 0.5 }, o)); }
    setup() {
      PD.freshRun({ seed: this.seed });
      wave = 24;
      setPalette(SECTORS[4].pal, true);
      player.y = VH + 300;
      touchActive = false;
    }
    draw(t, dt) {
      this.own();
      // kun spillets baggrund (skrog, stjerner, grid) — ingen fjender/skib
      ctx.save();
      drawBackground(dt);
      ctx.restore();
      ctx.save();
      for (const b of this.bosses) {
        const k = U.inv(b.t0, b.t0 + 0.14, t);
        if (k <= 0) continue;
        const e = b.e;
        e.t = t * 1.3 + b.phase;
        e.flash = t - b.t0 < 0.1 ? 0.05 : 0;
        ctx.save();
        ctx.translate(b.x, b.y);
        const sc = b.s * U.back(k);
        ctx.scale(sc, sc);
        const c = e.flash > 0 ? '#ffffff' : e.color;
        ctx.shadowColor = c; ctx.shadowBlur = 14;
        ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 2.5;
        drawBossBody(e, c);
        ctx.restore();
      }
      ctx.restore();
      this.render(t);
    }
  }
  PD.LineupClip = LineupClip;

  // falske boss-entiteter (kun til tegning)
  PD.fakeBoss = (kind) => {
    const r = 56 * S * G;
    const e = { type: 'boss', bossKind: kind, r, t: 0, flash: 0, color: E_DEFS.boss.color };
    if (kind === 'solarcore') { e.r = 48 * S * G; e.beams = [0.4, 2.5, 4.6]; e.beamMode = 'warn'; }
    if (kind === 'firewall') {
      e.segW = (VW - 120) / 7; e.segH = 46 * S;
      e.segs = Array.from({ length: 7 }, (_, i) => ({ weak: i === 2 || i === 5 }));
    }
    if (kind === 'mothership') {
      e.r = 60 * S * G;
      e.pods = [{ dx: -130 * S, dy: 26 * S, hp: 9, maxHp: 10, alive: true }, { dx: 130 * S, dy: 26 * S, hp: 9, maxHp: 10, alive: true }];
    }
    return e;
  };

  /* ---------- Hall of Fame (film-grafik i spillets stil) ---------- */
  PD.BOARD = [
    ['ACE', 487350], ['NOVA', 412900], ['VIPER', 365075], ['GHOST', 298400], ['RAZOR', 251630],
    ['PIXEL', 204215], ['TURBO', 176880], ['BLAZE', 143520], ['ORBIT', 118045], ['KAI', 96770],
  ];
  PD.fmt = (n) => Math.floor(n).toLocaleString('en-US');

  // Én række: rank · navn · score — som .board-list i style.css
  PD.drawRow = (g, rank, name, sc, x0, x1, y, o = {}) => {
    const size = o.size ?? 64;
    const col = o.color ?? '#d8d4ff';
    const glow = o.glow ?? 0;
    g.save();
    g.globalAlpha = o.alpha ?? 1;
    if (o.bg) {
      g.fillStyle = o.bg;
      g.fillRect(x0 - 22, y - size * 0.62, x1 - x0 + 44, size * 1.18);
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = 3; g.strokeRect(x0 - 22, y - size * 0.62, x1 - x0 + 44, size * 1.18); }
    }
    g.font = PD.VT(size);
    g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = glow;
    g.fillStyle = o.rankColor ?? COL.dimmer;
    g.textAlign = 'left';
    g.fillText(String(rank).padStart(2, '0'), x0, y);
    g.fillStyle = col;
    g.letterSpacing = (o.spacing ?? 10) + 'px';
    g.fillText(name, x0 + size * 1.25, y);
    g.letterSpacing = '0px';
    g.textAlign = 'right';
    g.fillText(PD.fmt(sc), x1, y);
    g.restore();
  };
})();
