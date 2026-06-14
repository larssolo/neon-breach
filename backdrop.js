/* =====================================================
   NEON BREACH — animated side backdrop
   Fills the empty areas left/right of the 9:16 play area
   with the game's own visual language: a drifting starfield,
   a synthwave perspective floor, and floating neon glyphs
   (enemy triangles, player ships, power-up diamonds).

   Fully self-contained: its own rAF loop, wrapped so it can
   never interfere with the gameplay loop. Idles for free when
   the play area already fills the screen (mobile portrait).
   ===================================================== */
(function () {
  'use strict';
  const cvs = document.getElementById('backdrop');
  const stage = document.getElementById('stage');
  if (!cvs || !stage) return;
  const ctx = cvs.getContext('2d');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  let W = 0, H = 0, dpr = 1, visible = true;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = stage.clientWidth;
    H = stage.clientHeight;
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Width of the centred 9:16 play area; show only if real side bars remain.
    const gameW = Math.min(W, H * 9 / 16);
    visible = (W - gameW) > 90;
  }
  window.addEventListener('resize', resize);

  /* --- Starfield (parallax) --- */
  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({ x: Math.random(), y: Math.random(), z: rand(0.2, 1) });
  }

  /* --- Floating neon glyphs, biased toward the side areas --- */
  const COLORS = ['#ff2bd6', '#00f6ff', '#ffb000', '#39ff6a', '#ffe14d'];
  const glyphs = [];
  function spawnGlyph(g) {
    const left = Math.random() < 0.5;
    g.x = left ? rand(0.02, 0.30) : rand(0.70, 0.98);
    g.y = rand(0.05, 0.95);
    g.vx = rand(-0.012, 0.012);
    g.vy = rand(-0.018, 0.018);
    g.rot = rand(0, TAU);
    g.vr = rand(-0.7, 0.7);
    g.size = rand(13, 40);
    g.kind = Math.floor(rand(0, 3));
    g.color = COLORS[Math.floor(rand(0, COLORS.length))];
    g.pulse = rand(0, TAU);
    return g;
  }
  for (let i = 0; i < 9; i++) glyphs.push(spawnGlyph({}));

  function pathTri(s)  { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.85, s * 0.72); ctx.lineTo(-s * 0.85, s * 0.72); ctx.closePath(); }
  function pathShip(s) { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.6); ctx.lineTo(0, s * 0.28); ctx.lineTo(-s * 0.7, s * 0.6); ctx.closePath(); }
  function pathDiam(s) { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); }

  let grid = 0;

  function drawGrid(move) {
    const horizon = H * 0.6;
    grid = (grid + move * 38) % 46;
    ctx.save();
    ctx.lineWidth = 1;
    // Receding horizontal lines.
    ctx.strokeStyle = 'rgba(255,43,214,0.45)';
    for (let i = 0; i < 20; i++) {
      const t = (i + grid / 46) / 20;
      const y = horizon + (H - horizon) * t * t;
      if (y > H) continue;
      ctx.globalAlpha = 0.5 * (1 - t) + 0.04;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Vertical lines fanning out from a centre vanishing point.
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = 'rgba(0,246,255,0.35)';
    const cx = W / 2;
    for (let i = -16; i <= 16; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 26, horizon);
      ctx.lineTo(cx + i * 230, H);
      ctx.stroke();
    }
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    requestAnimationFrame(frame);
    if (!visible) { ctx.clearRect(0, 0, W, H); return; }
    const move = REDUCED ? 0 : dt;
    try {
      ctx.clearRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        s.y += (0.008 + s.z * 0.03) * move;
        if (s.y > 1) { s.y -= 1; s.x = Math.random(); }
        ctx.globalAlpha = 0.18 + s.z * 0.5;
        ctx.fillStyle = s.z > 0.72 ? '#ffffff' : '#8f8ab8';
        const r = Math.max(1, s.z * 2);
        ctx.fillRect(s.x * W, s.y * H, r, r);
      }
      ctx.globalAlpha = 1;

      // Floor grid
      drawGrid(move);

      // Floating glyphs
      for (const g of glyphs) {
        g.x += g.vx * move; g.y += g.vy * move;
        g.rot += g.vr * move; g.pulse += move * 1.8;
        if (g.x < -0.12 || g.x > 1.12 || g.y < -0.12 || g.y > 1.12) spawnGlyph(g);
        ctx.save();
        ctx.translate(g.x * W, g.y * H);
        ctx.rotate(g.rot);
        ctx.globalAlpha = 0.16 + Math.abs(Math.sin(g.pulse)) * 0.24;
        ctx.shadowColor = g.color; ctx.shadowBlur = 16;
        ctx.strokeStyle = g.color; ctx.lineWidth = 2;
        if (g.kind === 0) pathTri(g.size);
        else if (g.kind === 1) pathShip(g.size);
        else pathDiam(g.size);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } catch (err) {
      // Never let a decorative frame break anything.
      console.error('NEON BREACH backdrop:', err);
    }
  }

  resize();
  requestAnimationFrame(frame);
})();
