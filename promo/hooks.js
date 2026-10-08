/* =====================================================
   NEON BREACH — promo-film hooks
   Indsættes (Playwright addInitScript) FØR spillets egne
   scripts, så det rigtige spil kan optages frame-for-frame:
     - virtuelt ur (performance.now + requestAnimationFrame)
     - seedet Math.random (deterministiske optagelser)
     - /api/* stubbes (ingen database under optagelse)
   Selve spillet (index.html/game.js) røres ikke.
   ===================================================== */
(() => {
  'use strict';
  let vnow = 1000;            // virtuel tid i ms
  const rafQueue = [];

  const now = () => vnow;
  Object.defineProperty(performance, 'now', { value: now, configurable: true, writable: true });
  window.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  window.cancelAnimationFrame = () => {};

  // mulberry32 — lille, hurtig og med en enkelt 32-bit tilstand (let at snapshotte)
  let seed = 0x1234abcd;
  Math.random = function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url && url.url ? url.url : url);
    if (u.includes('/api/')) {
      const body = u.includes('/api/plays') ? '{"count":0}' : '[]';
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(url, opts);
  };

  window.__promo = {
    get now() { return vnow; },
    advance(ms) { vnow += ms; },
    drainRaf() { return rafQueue.splice(0); },
    get seed() { return seed; },
    set seed(s) { seed = s | 0; },
  };
})();
