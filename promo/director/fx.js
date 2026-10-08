/* =====================================================
   NEON BREACH — promo director · 80'ER-EFFEKTER
   Kamera, bloom, scanlines, RGB-split, VHS, glitch,
   overgange, neon-tekst, HUD og synthwave-baggrunde.
   ===================================================== */
(() => {
  'use strict';
  const PD = window.PD;
  const { W, H, U, COL } = PD;

  /* ---------- Delte arbejds-canvases ---------- */
  const tmpA = U.canvas(), tmpB = U.canvas(), chR = U.canvas(), chC = U.canvas();
  const bloomS = U.canvas(W / 4, H / 4), bloomS2 = U.canvas(W / 4, H / 4);
  const pixS = U.canvas(W, H), vhsS = U.canvas(), vhsSrc = U.canvas();
  PD.tmpA = tmpA; PD.tmpB = tmpB;

  // statiske overlays
  const scan = U.canvas();
  {
    const g = scan.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,1)';
    for (let y = 0; y < H; y += 6) g.fillRect(0, y + 4, W, 2);
  }
  const vig = U.canvas();
  {
    const g = vig.getContext('2d');
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  // TV-sne: et par støj-canvases i lav opløsning, skaleres op uden udglatning
  const noise = [0, 1, 2, 3].map((k) => {
    const c = U.canvas(W / 4, H / 4);
    const g = c.getContext('2d');
    const id = g.createImageData(c.width, c.height);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.floor(U.hash(i, k, 7) * 255);
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  });

  /* ---------- Kamera ---------- */
  // Tegner et lag med zoom omkring et fokuspunkt (holdes inden for billedet)
  PD.drawCam = (g, src, cam = {}) => {
    const z = Math.max(1, cam.zoom ?? 1);
    const hw = W / (2 * z), hh = H / (2 * z);
    const fx = Math.max(hw, Math.min(W - hw, cam.fx ?? W / 2));
    const fy = Math.max(hh, Math.min(H - hh, cam.fy ?? H / 2));
    g.save();
    if (cam.filter) g.filter = cam.filter;
    g.globalAlpha = cam.alpha ?? 1;
    g.translate(W / 2 + (cam.dx || 0), H / 2 + (cam.dy || 0));
    if (cam.rot) g.rotate(cam.rot);
    g.scale(z, z);
    g.translate(-fx, -fy);
    g.drawImage(src, 0, 0);
    g.restore();
  };

  /* ---------- Post-effekter ---------- */
  PD.bloom = (g, src, amt) => {
    if (amt <= 0) return;
    const b = bloomS.getContext('2d');
    b.globalCompositeOperation = 'copy';
    b.drawImage(src, 0, 0, W / 4, H / 4);
    const b2 = bloomS2.getContext('2d');
    b2.globalCompositeOperation = 'copy';
    b2.filter = 'contrast(1.7) brightness(0.75) blur(7px)';
    b2.drawImage(bloomS, 0, 0);
    b2.filter = 'none';
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = amt;
    g.drawImage(bloomS2, 0, 0, W, H);
    g.restore();
  };

  PD.scanlines = (g, a = 0.2) => { g.save(); g.globalAlpha = a; g.drawImage(scan, 0, 0); g.restore(); };
  PD.vignette = (g, a = 1) => { g.save(); g.globalAlpha = a; g.drawImage(vig, 0, 0); g.restore(); };

  // Rød/cyan kanal-split. src skal være en kopi af billedet (ikke g's eget canvas)
  PD.chroma = (g, src, amt, dy = 0) => {
    const r = chR.getContext('2d');
    r.globalCompositeOperation = 'copy'; r.drawImage(src, 0, 0);
    r.globalCompositeOperation = 'multiply'; r.fillStyle = '#ff0000'; r.fillRect(0, 0, W, H);
    const c = chC.getContext('2d');
    c.globalCompositeOperation = 'copy'; c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.fillStyle = '#00ffff'; c.fillRect(0, 0, W, H);
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(chC, -amt, -dy);
    g.drawImage(chR, amt, dy);
    g.restore();
  };

  PD.pixelate = (g, src, block) => {
    const b = Math.max(1, Math.round(block));
    if (b <= 1) { g.drawImage(src, 0, 0); return; }
    const sw = Math.ceil(W / b), sh = Math.ceil(H / b);
    const p = pixS.getContext('2d');
    p.imageSmoothingEnabled = true;
    p.globalCompositeOperation = 'copy';
    p.drawImage(src, 0, 0, sw, sh);
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(pixS, 0, 0, sw, sh, 0, 0, sw * b, sh * b);
    g.restore();
  };

  PD.glitchSlices = (g, srcA, srcB, mix, k, seed) => {
    const n = 4 + Math.floor(k * 20);
    for (let j = 0; j < n; j++) {
      const y = U.hash(seed, j, 1) * H;
      const h = 6 + U.hash(seed, j, 2) * (40 + 170 * k);
      const src = U.hash(seed, j, 3) < mix ? srcB : srcA;
      const dx = (U.hash(seed, j, 4) - 0.5) * 300 * k;
      g.drawImage(src, 0, y, W, h, dx, y, W, h);
      if (U.hash(seed, j, 5) < 0.25 * k) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.25 + 0.4 * k;
        g.fillStyle = U.hash(seed, j, 6) < 0.5 ? COL.cyan : COL.pink;
        g.fillRect(0, y, W, Math.max(2, h * 0.15));
        g.restore();
      }
    }
  };

  PD.snow = (g, a, seed) => {
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    g.imageSmoothingEnabled = false;
    const n = noise[seed & 3];
    const ox = Math.floor(U.hash(seed, 1) * 40), oy = Math.floor(U.hash(seed, 2) * 80);
    g.drawImage(n, ox, oy, W / 4 - 40, H / 4 - 80, 0, 0, W, H);
    g.restore();
  };

  // VHS: afmætning, sporings-bånd, linje-vrid og sne
  PD.vhs = (g, src, amt, seed, tSec) => {
    const c = vhsS.getContext('2d');
    c.globalCompositeOperation = 'copy';
    c.filter = `saturate(${1 - 0.55 * amt}) contrast(${1 + 0.15 * amt}) brightness(${1 + 0.05 * amt})`;
    c.drawImage(src, 0, 0);
    c.filter = 'none';
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const band = 24;
    for (let y = 0; y < H; y += band) {
      const wob = Math.sin(y * 0.013 + tSec * 9) * 6 * amt + (U.hash(seed, y, 3) < 0.04 * amt ? (U.hash(seed, y, 4) - 0.5) * 120 : 0);
      g.drawImage(vhsS, 0, y, W, band, wob, y, W, band);
    }
    // rullende tracking-bånd
    const ty = ((tSec * 700) % (H + 300)) - 150;
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5 * amt;
    g.imageSmoothingEnabled = false;
    g.drawImage(noise[(seed + 1) & 3], 0, 0, W / 4, 30, 0, ty, W, 120);
    g.globalAlpha = 0.12 * amt;
    g.drawImage(noise[seed & 3], 0, 0, W / 4, H / 4, 0, 0, W, H);
    g.restore();
  };

  // VHS direkte på et canvas (kopierer selv kilden først)
  PD.applyVhs = (g, amt, seed, tSec) => {
    const c = vhsSrc.getContext('2d');
    c.globalCompositeOperation = 'copy';
    c.drawImage(g.canvas, 0, 0);
    PD.vhs(g, vhsSrc, amt, seed, tSec);
  };

  // CRT tænd/sluk. p: 0 → 1 (tænd: fra sort til billede, sluk: omvendt)
  PD.crt = (g, src, p, on) => {
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const q = on ? p : 1 - p;
    let sy, sx, bright;
    if (q < 0.35) { const k = q / 0.35; sy = 0.006 + k * k * 0.05; sx = on ? U.easeOut(Math.min(1, k * 2)) : U.easeOut(k); bright = 1; }
    else { const k = (q - 0.35) / 0.65; sy = 0.056 + U.easeOut(k) * 0.944; sx = 1; bright = 1 - k; }
    g.translate(W / 2, H / 2);
    g.scale(sx, sy);
    g.filter = `brightness(${1 + 3 * bright})`;
    g.drawImage(src, -W / 2, -H / 2);
    g.filter = 'none';
    g.setTransform(1, 0, 0, 1, 0, 0);
    // lys-streg
    if (bright > 0.05) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = bright;
      const lh = Math.max(4, H * sy * 0.5);
      const gr = g.createLinearGradient(0, H / 2 - lh, 0, H / 2 + lh);
      gr.addColorStop(0, 'rgba(180,255,255,0)');
      gr.addColorStop(0.5, 'rgba(230,255,255,1)');
      gr.addColorStop(1, 'rgba(180,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(W / 2 - (W / 2) * sx, H / 2 - lh, W * sx, lh * 2);
    }
    g.restore();
  };

  /* ---------- Overgange (A = ud, B = ind, p = 0..1) ---------- */
  const TR = (PD.TR = {});
  TR.cut = (g, A, B, p) => g.drawImage(p < 0.5 ? A : B, 0, 0);

  TR.glitch = (g, A, B, p, info) => {
    const k = Math.sin(p * Math.PI);
    g.drawImage(p < 0.5 ? A : B, 0, 0);
    PD.glitchSlices(g, A, B, p, k, info.i);
    info.chroma = Math.max(info.chroma || 0, 22 * k);
  };

  TR.pixel = (g, A, B, p, info) => {
    const k = 1 - Math.abs(2 * p - 1);
    PD.pixelate(g, p < 0.5 ? A : B, 1 + 64 * k * k);
    info.chroma = Math.max(info.chroma || 0, 6 * k);
  };

  TR.diamond = (g, A, B, p) => {
    g.drawImage(A, 0, 0);
    const cell = 120, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
    g.save();
    g.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = (c / cols) * 0.35 + (1 - r / rows) * 0.65;
        const local = U.clamp01(p * 1.7 - d * 0.7);
        const rd = local * cell * 1.02;
        if (rd <= 0) continue;
        const cx = c * cell, cy = r * cell;
        g.moveTo(cx, cy - rd); g.lineTo(cx + rd, cy); g.lineTo(cx, cy + rd); g.lineTo(cx - rd, cy); g.closePath();
      }
    }
    g.save();
    g.clip();
    g.drawImage(B, 0, 0);
    g.restore();
    if (p > 0.02 && p < 0.98) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(255,43,214,0.9)';
      g.lineWidth = 4;
      g.shadowColor = COL.pink; g.shadowBlur = 18;
      g.stroke();
    }
    g.restore();
  };

  TR.wipe = (g, A, B, p) => {
    const e = U.easeInOut(p);
    const x0 = U.lerp(-W * 0.45, W * 1.45, e), slope = 0.45;
    const edge = (y) => x0 + (y - H / 2) * slope;
    g.drawImage(A, 0, 0);
    g.save();
    g.beginPath();
    g.moveTo(-10, -10); g.lineTo(edge(-10), -10); g.lineTo(edge(H + 10), H + 10); g.lineTo(-10, H + 10); g.closePath();
    g.clip();
    g.drawImage(B, 0, 0);
    g.restore();
    // neon-bjælken
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [wid, col, a] of [[90, COL.pink, 0.35], [40, COL.cyan, 0.6], [10, '#ffffff', 1]]) {
      g.globalAlpha = a;
      g.strokeStyle = col; g.lineWidth = wid;
      g.beginPath(); g.moveTo(edge(-50), -50); g.lineTo(edge(H + 50), H + 50); g.stroke();
    }
    g.restore();
  };

  TR.laser = (g, A, B, p, info) => {
    const ang = info.angle ?? -0.42;
    const nx = -Math.sin(ang), ny = Math.cos(ang);       // normal til snittet
    const cx = W / 2, cy = info.cy ?? H * 0.45;
    const cut = U.clamp01(p / 0.28);
    const open = U.easeIn(U.clamp01((p - 0.22) / 0.78));
    const d = open * 1500;
    g.drawImage(B, 0, 0);
    const L = 3000, dx = Math.cos(ang) * L, dy = Math.sin(ang) * L;
    for (const s of [-1, 1]) {
      g.save();
      g.beginPath();
      g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy);
      g.lineTo(cx + dx + nx * s * L, cy + dy + ny * s * L); g.lineTo(cx - dx + nx * s * L, cy - dy + ny * s * L);
      g.closePath();
      g.clip();
      g.translate(nx * s * d, ny * s * d + (s > 0 ? d * 0.15 : 0));
      g.drawImage(A, 0, 0);
      g.restore();
    }
    // laserstrålen der skærer
    const a = cut < 1 ? 1 : Math.max(0, 1 - (p - 0.28) / 0.3);
    if (a > 0) {
      const ex = U.lerp(-W * 0.2, W * 1.2, U.easeOut(cut));
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = a;
      g.translate(cx, cy); g.rotate(ang);
      const x1 = -1500, x2 = (ex - cx) / Math.cos(ang);
      for (const [wid, col] of [[70, 'rgba(255,176,0,0.35)'], [26, 'rgba(255,230,160,0.8)'], [8, '#ffffff']]) {
        g.fillStyle = col;
        g.fillRect(x1, -wid / 2, x2 - x1, wid);
      }
      g.restore();
    }
    info.chroma = Math.max(info.chroma || 0, 10 * (1 - open));
  };

  TR.vroll = (g, A, B, p, info) => {
    const e = U.easeInOut(p);
    const off = e * (H + 80);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.drawImage(A, 0, off);
    g.drawImage(B, 0, off - H - 80);
    PD.snow(g, 0.35 * Math.sin(p * Math.PI), info.i);
    info.chroma = Math.max(info.chroma || 0, 14 * Math.sin(p * Math.PI));
  };

  TR.zoom = (g, A, B, p, info) => {
    const fx = info.fx ?? W / 2, fy = info.fy ?? H / 2;
    if (p < 0.5) {
      const q = U.easeIn(p / 0.5);
      for (let k = 0; k < 4; k++) {
        PD.drawCam(g, A, { zoom: 1 + q * (1.6 + k * 0.25), fx, fy, alpha: k === 0 ? 1 : 0.28 });
      }
      g.save(); g.fillStyle = '#fff'; g.globalAlpha = q * q; g.fillRect(0, 0, W, H); g.restore();
    } else {
      const q = U.easeOut((p - 0.5) / 0.5);
      PD.drawCam(g, B, { zoom: 1 + (1 - q) * 0.6, fx: info.bfx ?? fx, fy: info.bfy ?? fy });
      g.save(); g.fillStyle = '#fff'; g.globalAlpha = (1 - q) * (1 - q); g.fillRect(0, 0, W, H); g.restore();
    }
  };

  TR.flash = (g, A, B, p) => {
    g.drawImage(p < 0.5 ? A : B, 0, 0);
    g.save(); g.fillStyle = '#fff'; g.globalAlpha = p < 0.5 ? U.easeIn(p * 2) : U.easeOut(1 - (p - 0.5) * 2); g.fillRect(0, 0, W, H); g.restore();
  };

  TR.tv = (g, A, B, p, info) => {
    const k = Math.sin(p * Math.PI);
    const src = p < 0.5 ? A : B;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.drawImage(src, 0, (U.hash(info.i, 9) - 0.5) * 140 * k);
    PD.snow(g, Math.min(0.8, k * 1.1), info.i);
    info.chroma = Math.max(info.chroma || 0, 16 * k);
  };

  /* ---------- Neon-tekst ---------- */
  // o: size, font ('ps'|'vt'), color, glow, align, spacing, alpha, scale, rot,
  //    chroma (px), stroke, fill (CanvasGradient-fabrik), extrude {n, dx, dy, color}
  PD.text = (g, str, x, y, o = {}) => {
    const size = o.size ?? 48;
    const font = o.font === 'vt' ? PD.VT(size) : PD.FONT(size);
    const spacing = o.spacing ?? 0;
    g.save();
    g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.scale != null) g.scale(o.scale, o.scale * (o.squash ?? 1));
    g.globalAlpha = o.alpha ?? 1;
    g.font = font;
    g.textAlign = o.align ?? 'center';
    g.textBaseline = o.baseline ?? 'middle';
    g.letterSpacing = spacing + 'px';
    const sx = (o.align ?? 'center') === 'center' ? spacing / 2 : 0;  // centrér uden afsluttende spacing
    if (o.extrude) {
      const e = o.extrude;
      g.fillStyle = e.color;
      for (let k = e.n; k >= 1; k--) g.fillText(str, sx + e.dx * k, e.dy * k);
    }
    if (o.chroma) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(0,246,255,0.75)'; g.fillText(str, sx - o.chroma, 0);
      g.fillStyle = 'rgba(255,43,214,0.75)'; g.fillText(str, sx + o.chroma, 0);
      g.restore();
    }
    if (o.glow !== false) { g.shadowColor = o.glowColor ?? o.color ?? COL.cyan; g.shadowBlur = o.glow ?? 24; }
    if (o.stroke) {
      g.lineWidth = o.stroke.w; g.strokeStyle = o.stroke.color; g.lineJoin = 'round';
      g.strokeText(str, sx, 0);
    }
    g.fillStyle = o.fill ? o.fill(g, size) : (o.color ?? COL.cyan);
    g.fillText(str, sx, 0);
    if (o.glow !== false && o.double !== false) { g.shadowBlur = (o.glow ?? 24) * 2.2; g.globalAlpha *= 0.5; g.fillText(str, sx, 0); }
    g.restore();
  };

  PD.textWidth = (g, str, size, font = 'ps', spacing = 0) => {
    g.save();
    g.font = font === 'vt' ? PD.VT(size) : PD.FONT(size);
    g.letterSpacing = spacing + 'px';
    const w = g.measureText(str).width;
    g.restore();
    return w;
  };

  /* ---------- HUD (samme layout som spillets DOM-HUD, skaleret til film) ---------- */
  // Værdierne fanges fra motoren når klippet renderes (hudState), og HUD'en tegnes
  // bagefter i film-koordinater — så den aldrig zoomes/beskæres af kameraet.
  PD.hudState = () => (player ? {
    score, hiscore, label: sectorLabel(), loop: loopNum(), lives: player.lives,
    mult: comboMult(), comboT, od: odActive > 0, odFrac: odActive > 0 ? odActive / odDuration() : overdrive / 100,
    ready: odActive <= 0 && overdrive >= 100, gt: gameTime,
  } : null);

  PD.drawHud = (g, h, a = 1) => {
    if (!h || a <= 0) return;
    const fmt = (n) => Math.floor(n).toLocaleString('en-US');
    g.save();
    g.globalAlpha = a;
    const lab = (s, x, y, al) => PD.text(g, s, x, y, { size: 19, color: COL.dim, glow: false, align: al, spacing: 4, baseline: 'top', alpha: a });
    const val = (s, x, y, al, col) => PD.text(g, s, x, y, { size: 34, color: col, glow: 14, glowColor: col, align: al, baseline: 'top', double: false, alpha: a });
    lab('SCORE', 34, 40, 'left');
    val(fmt(h.score), 34, 72, 'left', COL.cyan);
    lab('SECTOR', W / 2, 40, 'center');
    val(h.label, W / 2, 72, 'center', COL.orange);
    if (h.loop > 1) PD.text(g, 'LOOP ' + h.loop, W / 2, 122, { size: 18, color: COL.pink, glow: 12, baseline: 'top', spacing: 4, double: false, alpha: a });
    lab('HI-SCORE', W - 34, 40, 'right');
    val(fmt(h.hiscore), W - 34, 72, 'right', COL.cyan);
    for (let i = 0; i < h.lives; i++) {
      g.save();
      g.translate(W - 50 - i * 40, 140);
      g.shadowColor = COL.pink; g.shadowBlur = 12;
      g.fillStyle = COL.pink;
      g.beginPath(); g.moveTo(0, -13); g.lineTo(12, 11); g.lineTo(0, 5); g.lineTo(-12, 11); g.closePath(); g.fill();
      g.restore();
    }
    let y = 128;
    if (h.mult > 1 && h.comboT > 0) {
      PD.text(g, 'x' + h.mult + (h.od ? ' x2 OD' : ''), 34, y, { size: 30, color: COL.orange, glow: 16, align: 'left', baseline: 'top', double: false, alpha: a });
      y += 42;
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(34, y, 240, 12);
      g.strokeStyle = 'rgba(255,176,0,0.5)'; g.lineWidth = 2; g.strokeRect(34, y, 240, 12);
      g.save(); g.shadowColor = COL.orange; g.shadowBlur = 14; g.fillStyle = COL.orange;
      g.fillRect(34, y, 240 * Math.min(1, h.comboT / COMBO_WINDOW), 12); g.restore();
      y += 30;
    } else {
      y += 6;
    }
    lab('OVERDRIVE', 34, y, 'left');
    y += 30;
    const blink = h.ready && Math.floor(h.gt * 4) % 2 === 0;
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(34, y, 240, 14);
    g.strokeStyle = blink ? COL.pink : 'rgba(0,246,255,0.5)'; g.lineWidth = 2; g.strokeRect(34, y, 240, 14);
    g.save();
    if (h.od) { g.fillStyle = COL.pink; g.shadowColor = COL.pink; }
    else {
      const gr = g.createLinearGradient(34, 0, 274, 0);
      gr.addColorStop(0, COL.cyan); gr.addColorStop(1, COL.pink);
      g.fillStyle = gr; g.shadowColor = COL.cyan;
    }
    g.shadowBlur = 14;
    g.fillRect(34, y, 240 * Math.min(1, h.odFrac), 14);
    g.restore();
    if (h.ready) PD.text(g, 'SHIFT!', 290, y + 7, { size: 18, color: COL.pink, glow: 12, align: 'left', double: false, alpha: a * (blink ? 1 : 0.35) });
    g.restore();
  };

  /* ---------- Synthwave-baggrund (film-koordinater) ---------- */
  const bgStars = Array.from({ length: 140 }, (_, i) => ({ x: U.hash(i, 1) * W, y: U.hash(i, 2) * H, z: 0.25 + U.hash(i, 3) * 0.75 }));
  PD.synthBg = (g, t, o = {}) => {
    const horizon = o.horizon ?? 1330;
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#06010f');
    sky.addColorStop(0.6, 'rgba(26,5,51,1)');
    sky.addColorStop(1, 'rgba(90,10,90,1)');
    g.fillStyle = sky; g.fillRect(0, 0, W, horizon);
    for (const s of bgStars) {
      const y = (s.y + t * (8 + s.z * 30)) % horizon;
      g.globalAlpha = (0.3 + s.z * 0.6) * (0.75 + 0.25 * Math.sin(t * 3 + s.x));
      g.fillStyle = s.z > 0.75 ? '#fff' : '#8f8ab8';
      g.fillRect(s.x, y, s.z * 3, s.z * 3);
    }
    g.globalAlpha = 1;
    if (o.sun) {
      const sr = o.sunR ?? 300, sx = W / 2, sy = horizon - (o.sunLift ?? 120);
      const cor = g.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 2.4);
      cor.addColorStop(0, 'rgba(255,43,214,0.35)'); cor.addColorStop(1, 'rgba(255,43,214,0)');
      g.fillStyle = cor; g.fillRect(0, 0, W, horizon);
      g.save();
      g.beginPath(); g.rect(0, 0, W, horizon); g.clip();
      const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr);
      sg.addColorStop(0, '#ffe14d'); sg.addColorStop(0.45, '#ffb000'); sg.addColorStop(1, '#ff2bd6');
      g.fillStyle = sg;
      g.shadowColor = '#ff2bd6'; g.shadowBlur = 60;
      g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(26,5,51,1)';
      for (let i = 0; i < 8; i++) {
        const gy = sy + sr * 0.05 + i * sr * 0.13 + ((t * 30) % (sr * 0.13));
        g.fillRect(sx - sr, gy, sr * 2, 3 + i * 2.6);
      }
      g.restore();
    }
    if (o.mountains) {
      g.save();
      g.fillStyle = '#0d0320';
      g.strokeStyle = 'rgba(255,43,214,0.8)'; g.lineWidth = 3;
      g.shadowColor = COL.pink; g.shadowBlur = 14;
      g.beginPath(); g.moveTo(0, horizon);
      const pts = [[0, 0.62], [0.12, 0.4], [0.22, 0.55], [0.34, 0.22], [0.45, 0.5], [0.52, 0.58], [0.6, 0.3], [0.72, 0.52], [0.84, 0.18], [1, 0.48]];
      for (const [px, py] of pts) g.lineTo(px * W, horizon - (1 - py) * 160);
      g.lineTo(W, horizon); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // perspektiv-gulv
    g.fillStyle = '#05000c'; g.fillRect(0, horizon, W, H - horizon);
    const fl = g.createLinearGradient(0, horizon, 0, H);
    fl.addColorStop(0, 'rgba(255,43,214,0.25)'); fl.addColorStop(1, 'rgba(255,43,214,0)');
    g.fillStyle = fl; g.fillRect(0, horizon, W, H - horizon);
    g.save();
    g.strokeStyle = 'rgba(255,43,214,0.75)';
    g.shadowColor = COL.pink; g.shadowBlur = 10;
    g.lineWidth = 2;
    const depth = H - horizon, scroll = (t * (o.speed ?? 1.3)) % 1;
    for (let i = 0; i < 14; i++) {
      const k = (i + scroll) / 14;
      const y = horizon + depth * k * k;
      g.globalAlpha = 0.25 + 0.75 * k;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.globalAlpha = 0.8;
    for (let i = -12; i <= 12; i++) {
      g.beginPath(); g.moveTo(W / 2 + i * 60, horizon); g.lineTo(W / 2 + i * 360, H); g.stroke();
    }
    g.restore();
    const hz = g.createLinearGradient(0, horizon - 60, 0, horizon + 40);
    hz.addColorStop(0, 'rgba(255,43,214,0)'); hz.addColorStop(0.6, 'rgba(255,43,214,0.45)'); hz.addColorStop(1, 'rgba(255,43,214,0)');
    g.fillStyle = hz; g.fillRect(0, horizon - 60, W, 100);
  };

  // Spillerskibet tegnet direkte i film-koordinater (samme form som drawShip)
  PD.drawShipFilm = (g, x, y, sc, bank = 0, t = 0, od = false) => {
    g.save();
    g.translate(x, y);
    g.rotate(bank * 0.3);
    g.scale(sc, sc);
    const fl = 7 + Math.sin(t * 42) * 2.5 + U.hash(Math.floor(t * 60), 3) * 2;
    g.shadowColor = '#ffb000'; g.shadowBlur = 16;
    g.fillStyle = od ? COL.pink : '#ffb000';
    g.beginPath(); g.moveTo(-4, 11); g.lineTo(0, 12 + fl); g.lineTo(4, 11); g.closePath(); g.fill();
    g.shadowColor = COL.cyan; g.shadowBlur = 22;
    g.fillStyle = COL.cyan;
    g.beginPath();
    g.moveTo(0, -18); g.lineTo(13, 12); g.lineTo(5, 7); g.lineTo(0, 13); g.lineTo(-5, 7); g.lineTo(-13, 12);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#fff';
    g.fillRect(-2, -8, 4, 8);
    g.restore();
  };

  // Pixel-krone til #1
  PD.drawCrown = (g, x, y, px) => {
    const rows = ['x..x..x', 'xx.x.xx', 'xxxxxxx', 'xxxxxxx', '.xxxxx.'];
    g.save();
    g.fillStyle = COL.orange; g.shadowColor = COL.orange; g.shadowBlur = 18;
    rows.forEach((r, j) => [...r].forEach((c, i) => { if (c === 'x') g.fillRect(x + (i - 3.5) * px, y + (j - 2.5) * px, px, px); }));
    g.restore();
  };

  // Stateless fyrværkeri (position = funktion af tid → seek-sikkert)
  PD.fireworks = (g, lt, x, y, seed) => {
    if (lt < 0 || lt > 1.3) return;
    const cols = [COL.cyan, COL.pink, COL.orange, COL.yellow, COL.green, '#ffffff'];
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) {
      const a = U.hash(seed, k, 1) * Math.PI * 2, v = 280 + U.hash(seed, k, 2) * 760;
      const px = x + Math.cos(a) * v * lt, py = y + Math.sin(a) * v * lt + 700 * lt * lt;
      g.globalAlpha = Math.max(0, 1 - lt / 1.3);
      g.fillStyle = cols[k % cols.length];
      const sz = 7 + U.hash(seed, k, 3) * 7;
      g.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }
    g.restore();
  };

  // Mønt (INSERT COIN), roterer via scaleX
  PD.drawCoin = (g, x, y, r, t) => {
    g.save();
    g.translate(x, y);
    g.scale(Math.max(0.12, Math.abs(Math.cos(t * 4))), 1);
    g.shadowColor = COL.orange; g.shadowBlur = 30;
    g.fillStyle = '#ffb000';
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#fff3c4'; g.lineWidth = r * 0.12;
    g.beginPath(); g.arc(0, 0, r * 0.72, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#7a4a00';
    g.font = PD.FONT(r * 0.9); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('1', r * 0.04, r * 0.06);
    g.restore();
  };
})();
