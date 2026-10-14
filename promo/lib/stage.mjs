// Starter headless Chromium med det RIGTIGE spil (index.html) klar til optagelse:
// virtuelt ur (hooks.js), lokale fonte, ingen netværk, ingen sidepanel-backdrop.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { serve } from './server.mjs';

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* fald tilbage til global installation */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

// URL'erne skal være absolutte: stylesheetet "bor" på fonts.googleapis.com
const fontCss = (origin) => `
@font-face { font-family: 'Press Start 2P'; font-style: normal; font-weight: 400; font-display: block;
  src: url(${origin}/promo/fonts/press-start-2p-latin.woff2) format('woff2'); }
@font-face { font-family: 'VT323'; font-style: normal; font-weight: 400; font-display: block;
  src: url(${origin}/promo/fonts/vt323-latin.woff2) format('woff2'); }
`;

export async function openStage({ root, width = 1080, height = 1920, scripts = [], log = console.log }) {
  const { server, port } = await serve(root);
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript({ path: path.join(root, 'promo/hooks.js') });
  const origin = `http://127.0.0.1:${port}`;
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({
    contentType: 'text/css', body: fontCss(origin), headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.route('**/backdrop.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/*.mp3', (r) => r.abort());
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log('[page]', m.type(), m.text()); });
  page.on('pageerror', (e) => log('[pageerror]', e.message));
  await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.load('32px "Press Start 2P"');
    await document.fonts.load('32px "VT323"');
  });
  for (const s of scripts) await page.addScriptTag({ path: s });
  const close = async () => { await browser.close(); server.close(); };
  return { page, browser, close };
}
