/* =====================================================
   NEON BREACH — promo director · COMPOSITOR + API
   Pr. frame: klip → kamera → overgang → tekst → bloom,
   RGB-split på trommeslag, scanlines, vignet, CRT tænd/sluk.
   render.mjs styrer det hele via window.__director.
   ===================================================== */
(() => {
  'use strict';
  const PD = window.PD;
  const { W, H, U } = PD;
  const SC = window.PROMO_SCORE;

  const film = U.canvas(), fg = film.getContext('2d');
  PD.film = film;
  // 1:1-formatet: 9:16-billedet bliver "spilskærmen" i midten af et 1080×1080-billede
  let SQUARE = false;
  const sq = U.canvas(1080, 1080), sqg = sq.getContext('2d');
  const KQ = 1080 / H, PW = W * KQ, PX = (1080 - PW) / 2;
  const copies = new Map();
  const copyOf = (c) => {
    let k = copies.get(c);
    if (!k) { k = U.canvas(c.width, c.height); copies.set(c, k); }
    const g = k.getContext('2d');
    g.globalCompositeOperation = 'copy';
    g.drawImage(c, 0, 0);
    return k;
  };

  const hits = SC.hits();
  const list = (k) => hits.filter((h) => h.kind === k).map((h) => h.t);
  const KICK = list('k'), SNARE = list('s'), CRASH = list('c');
  // seneste slag ≤ t → eksponentielt henfald
  const env = (arr, t, tau) => {
    let lo = 0, hi = arr.length - 1, idx = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t + 1e-6) { idx = m; lo = m + 1; } else hi = m - 1; }
    return idx < 0 ? 0 : Math.exp(-(t - arr[idx]) / tau);
  };


  function drawSeg(g, s, t, i) {
    const cam = (s.cam && s.cam(t)) || {};
    const bump = 1 + 0.014 * env(KICK, t, 0.09);
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.restore();
    PD.drawCam(g, s.clip.layer, Object.assign({}, cam, { zoom: (cam.zoom ?? 1) * bump }));
    // HUD i film-koordinater (følger ikke kameraets zoom)
    const hc = s.clip.hudClip || s.clip;
    if (hc.hudState) {
      const ha = typeof hc.hud === 'function' ? hc.hud(t) : hc.hud;
      if (ha > 0) PD.drawHud(g, hc.hudState, ha);
    }
    if (s.post) s.post(g, t, i);
  }

  function pick(t) {
    const segs = PD.segments;
    let k = segs.findIndex((s) => t < s.end);
    if (k < 0) k = segs.length - 1;
    const s = segs[k], nx = segs[k + 1];
    if (nx && nx.trans && t >= nx.start - nx.trans.pre) return { A: s, B: nx, tr: nx.trans };
    if (k > 0 && s.trans && t < s.start + s.trans.post) return { A: segs[k - 1], B: s, tr: s.trans };
    return { A: s };
  }

  // Kun simulering (ingen komposition) — bruges ved seek
  PD.simulate = (i, fps) => {
    const t = i / fps + 1e-6, dt = 1 / fps;
    for (const s of PD.segments) {
      if (t >= s.clip.simStart && t < s.until) s.clip.advanceTo(t, i, dt);
    }
  };

  PD.renderFrame = (i, fps) => {
    const t = i / fps + 1e-6, dt = 1 / fps;
    const { A, B, tr } = pick(t);
    const info = { i, t, chroma: 0 };
    if (tr) {
      const p = U.inv(B.start - tr.pre, B.start + tr.post, t);
      Object.assign(info, tr, { fx: A.clip.ship?.x, fy: A.clip.ship?.y, bfx: B.clip.ship?.x, bfy: B.clip.ship?.y });
      A.clip.advanceTo(t, i, dt);
      B.clip.advanceTo(t, i, dt);
      drawSeg(PD.tmpA.getContext('2d'), A, t, i);
      drawSeg(PD.tmpB.getContext('2d'), B, t, i);
      fg.save();
      PD.TR[tr.type](fg, PD.tmpA, PD.tmpB, p, info);
      fg.restore();
    } else {
      A.clip.advanceTo(t, i, dt);
      drawSeg(fg, A, t, i);
    }
    // klip der skal holdes i live (fx under en overgang der snart starter) simuleres også
    for (const s of PD.segments) {
      if (t >= s.clip.simStart && t < s.until && s.clip.lastI !== i) s.clip.advanceTo(t, i, dt);
    }

    let out = film, og = fg;
    if (SQUARE) {
      out = sq; og = sqg;
      const kick = env(KICK, t, 0.12), snare = env(SNARE, t, 0.1);
      PD.sidePanels(sqg, t, PX, PW, kick, snare);
      sqg.drawImage(film, PX, 0, PW, 1080);
      PD.bezel(sqg, PX, PW, kick);
      // tekst-overlays: 9:16-koordinater lægges ind over skærmen, men titlerne
      // tegnes større og må bryde ud over rammen
      og.save();
      og.setTransform(KQ, 0, 0, KQ, PX, 0);
      PD.textBoost = 1.45;
    }
    for (const o of PD.overlays) {
      if (t >= o.t0 && t < o.t1) { og.save(); o.fn(og, t, i); og.restore(); }
    }
    if (SQUARE) { PD.textBoost = 1; og.restore(); }

    // ---- post ----
    const ow = out.width, oh = out.height;
    PD.bloom(og, out, 0.42);
    const chroma = info.chroma + 4 * env(SNARE, t, 0.06) + 9 * env(CRASH, t, 0.11);
    if (chroma >= 0.8) PD.chroma(og, copyOf(out), chroma * (SQUARE ? 0.75 : 1));
    PD.scanlines(og, 0.16);
    PD.vignette(og, 0.9);
    const on1 = 0.42, off0 = SC.LENGTH - 0.7, off1 = SC.LENGTH - 0.12;
    if (t < on1) PD.crt(og, copyOf(out), U.inv(0, on1, t), true);
    if (t >= off0) {
      if (t < off1) PD.crt(og, copyOf(out), U.inv(off0, off1, t), false);
      else { og.fillStyle = '#000'; og.fillRect(0, 0, ow, oh); }
    }
    return out;
  };

  let FPS = 60, lastSim = -1;
  window.__director = {
    init(fps, format = '9x16') {
      FPS = fps;
      SQUARE = format === '1x1';
      // maks. tekstbredde i 9:16-enheder (i 1:1 må titlerne bruge hele den kvadratiske bredde)
      PD.overlayMaxW = SQUARE ? (1080 - 90) / KQ : W - 110;
      return { frames: Math.round(SC.LENGTH * fps), length: SC.LENGTH, width: SQUARE ? 1080 : W, height: SQUARE ? 1080 : H };
    },
    // simulér alle frames før i (uden komposition), så et delvist render starter korrekt
    seek(i) {
      for (let j = lastSim + 1; j < i; j++) PD.simulate(j, FPS);
      lastSim = Math.max(lastSim, i - 1);
      PD.events.length = 0;
    },
    render(i, type = 'png') {
      const out = PD.renderFrame(i, FPS);
      lastSim = i;
      return out.toDataURL(type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92);
    },
    simulate(i) { PD.simulate(i, FPS); lastSim = i; },
    events() { return { events: PD.events, cues: PD.cues, fps: FPS }; },
  };
})();
