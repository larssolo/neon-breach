// Deterministic capture harness — loaded BEFORE game.js.
// Virtual clock, seeded RNG, manual rAF stepping, silent audio.
(function () {
  'use strict';
  const qs = new URLSearchParams(location.search);
  window.__SS = Number(qs.get('ss') || 2);           // supersampling factor

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(Number(qs.get('seed') || 1) >>> 0);
  window.__reseed = (s) => { Math.random = mulberry32(s >>> 0); };

  let vt = 0;                                          // virtual ms
  performance.now = () => vt;
  const queue = [];
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__advance = (ms) => {
    vt += ms;
    const cbs = queue.splice(0);
    for (const cb of cbs) cb(vt);
  };
  window.__now = () => vt / 1000;

  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  window.__events = [];
})();
