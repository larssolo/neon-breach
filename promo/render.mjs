#!/usr/bin/env node
/* =====================================================
   NEON BREACH — render promo-filmen (9:16 1080×1920 eller 1:1 1080×1080)

   node promo/render.mjs                 → promo/neon-breach-promo.mp4 (9:16, 60 fps)
   node promo/render.mjs --format 1x1    → promo/neon-breach-promo-1x1.mp4 (1080×1080)
   node promo/render.mjs --fps 30        → hurtigere preview
   node promo/render.mjs --stills 3.2,16.5,40  → kun stillbilleder (PNG)
   node promo/render.mjs --from 16 --to 25     → delvist klip (uden lyd)
   node promo/render.mjs --url MIT.DOMÆNE.DK   → anden adresse på slutskiltet ('' = ingen)

   Kræver: Node 18+, Playwright (Chromium) og ffmpeg.
   ===================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openStage } from './lib/stage.mjs';
import { renderAudio } from './audio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const FPS = Number(arg('fps', 60));
const FORMAT = String(arg('format', '9x16')) === '1x1' ? '1x1' : '9x16';
const OUT = path.resolve(arg('out', path.join(here, FORMAT === '1x1' ? 'neon-breach-promo-1x1.mp4' : 'neon-breach-promo.mp4')));
const WORK = path.resolve(arg('work', path.join(root, '.promo-work')));
const STILLS = arg('stills', '') ? String(arg('stills')).split(',').map(Number) : null;
const FROM = Number(arg('from', 0));
const TO = arg('to', null);
const URL_TEXT = arg('url', 'NEON-BREACH.LARSSOHL.DK');
const KEEP_EVERY = Number(arg('keep', 0));   // gem hver N'te frame som PNG til gennemsyn
const CRF = String(arg('crf', 23));          // endelig kvalitet (lavere = bedre/større) — 23 ≈ 39 MB

fs.mkdirSync(WORK, { recursive: true });
const log = (...a) => console.log('[promo]', ...a);

const scripts = ['score.js', 'director/core.js', 'director/fx.js', 'director/clips.js', 'director/timeline.js', 'director/main.js']
  .map((f) => path.join(here, f));
const { page, close } = await openStage({ root, scripts: [], log });
await page.addScriptTag({ content: `window.PROMO_URL = ${JSON.stringify(URL_TEXT === true ? '' : URL_TEXT)};` });
for (const s of scripts) await page.addScriptTag({ path: s });

const { frames, length, width, height } = await page.evaluate(([fps, fmt]) => window.__director.init(fps, fmt), [FPS, FORMAT]);
const i0 = Math.max(0, Math.round(FROM * FPS));
const i1 = TO == null ? frames : Math.min(frames, Math.round(Number(TO) * FPS));
log(`${FORMAT} ${width}×${height} · ${FPS} fps · ${frames} frames (${length}s) · render ${i0}..${i1 - 1}`);

const t0 = Date.now();
const eta = (i) => {
  const done = i - i0 + 1, el = (Date.now() - t0) / 1000;
  return `${(el / done * 1000).toFixed(0)} ms/frame, ~${Math.round(el / done * (i1 - i - 1))}s tilbage`;
};

if (STILLS) {
  const want = new Map(STILLS.map((s) => [Math.round(s * FPS), s]));
  const last = Math.max(...want.keys());
  for (let i = 0; i <= last; i++) {
    if (want.has(i)) {
      const url = await page.evaluate((k) => window.__director.render(k), i);
      const f = path.join(WORK, `still_${want.get(i).toFixed(2)}.png`);
      fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      log('still', f);
    } else {
      await page.evaluate((k) => window.__director.simulate(k), i);
    }
  }
  await close();
  process.exit(0);
}

if (i0 > 0) await page.evaluate((k) => window.__director.seek(k), i0);

// PNG-frames pibes direkte ind i ffmpeg → næsten tabsfri mellemfil (ingen PNG-bunker på disken)
const silent = path.join(WORK, 'video.mp4');
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-r', String(FPS), silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));

for (let i = i0; i < i1; i++) {
  const url = await page.evaluate((k) => window.__director.render(k), i);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (KEEP_EVERY && i % KEEP_EVERY === 0) fs.writeFileSync(path.join(WORK, `f_${String(i).padStart(5, '0')}.png`), buf);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0) log(`frame ${i}/${i1 - 1} (${(i / FPS).toFixed(1)}s) — ${eta(i)}`);
}
ff.stdin.end();
await ffDone;

const ev = await page.evaluate(() => window.__director.events());
fs.writeFileSync(path.join(WORK, 'events.json'), JSON.stringify(ev));
await close();
log(`video færdig på ${((Date.now() - t0) / 1000).toFixed(0)}s · ${ev.events.length} spil-lyde · ${ev.cues.length} cues`);

if (i0 > 0 || i1 < frames) {
  log('delvist render — ingen lyd, video:', silent);
  process.exit(0);
}

const wav = path.join(WORK, 'soundtrack.wav');
await renderAudio({ events: ev.events, cues: ev.cues, out: wav, log });

await new Promise((res, rej) => {
  // endelig encode: H.264 High (afspilles overalt — TikTok, Reels, Shorts, iPhone) + AAC
  const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', silent, '-i', wav,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-maxrate', '9M', '-bufsize', '18M', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('mux exit ' + c))));
});
log('FÆRDIG →', OUT);
