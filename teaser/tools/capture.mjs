// Gameplay capture driver: runs the real NEON BREACH engine frame-by-frame in
// headless Chromium and writes supersampled PNG frames + an event log per clip.
// usage: node capture.mjs <specs.json> [clipName ...]
// (expects `python3 -m http.server 8765` running in teaser/; set PLAYWRIGHT_MODULE to a global install if needed)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
import path from 'node:path';

const SCR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const specs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = process.argv.slice(3);
const BASE = 'http://127.0.0.1:8765/harness/index.html';

const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
for (const spec of specs) {
  if (only.length && !only.includes(spec.name)) continue;
  const t0 = Date.now();
  const out = path.join(SCR, 'clips', spec.name);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 740 } });
  page.on('pageerror', (e) => console.error('[pageerror]', spec.name, e.message));
  await page.goto(`${BASE}?seed=${spec.seed || 1}&ss=${spec.ss || 2}`);
  await page.evaluate(async () => {
    await document.fonts.load('16px "Press Start 2P"');
    await document.fonts.load('16px "VT323"');
  });
  const info = await page.evaluate((o) => window.__setup(o), spec.setup || {});
  const fps = spec.fps || 30;
  const step = async (dt, js) => page.evaluate(([dt, js]) => {
    if (js) (0, eval)(js);
    window.__botStep(dt);
    window.__advance(dt * 1000);
  }, [dt, js || null]);

  // pre-roll (not captured), optional scripted actions at given times
  const actions = (spec.actions || []).map((a) => ({ ...a, done: false }));
  const runActions = (tCap) => {
    let js = '';
    for (const a of actions) if (!a.done && tCap >= a.at - 1e-6) { a.done = true; js += a.js + ';'; }
    return js;
  };
  const pre = spec.preroll || 0;
  for (let t = 0; t < pre - 1e-9; t += 1 / fps) {
    await step(1 / fps, runActions(t - pre));
  }
  const frames = [];
  const speedAt = (i) => {
    if (!spec.speed) return 1;
    if (typeof spec.speed === 'number') return spec.speed;
    let s = 1;                          // piecewise: [{from: frameIdx, speed}]
    for (const k of spec.speed) if (i >= k.from) s = k.speed;
    return s;
  };
  let tCap = 0;
  for (let i = 0; i < spec.frames; i++) {
    const dt = speedAt(i) / fps;
    await step(dt, runActions(tCap));
    tCap += dt;
    const url = await page.evaluate(() => document.getElementById('game').toDataURL('image/png'));
    fs.writeFileSync(path.join(out, `f_${String(i).padStart(5, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    frames.push(await page.evaluate(() => window.__state()));
  }
  const events = await page.evaluate(() => window.__events);
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ spec, info, frames, events }, null, 1));
  await page.close();
  console.log(`${spec.name}: ${spec.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s  (${info.sector})`);
}
await browser.close();
