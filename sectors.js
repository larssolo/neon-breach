/* =====================================================
   NEON BREACH 2.0 — sektor- og upgrade-data
   Ren config, ingen logik. Indlæses FØR game.js
   (samme mønster som config.js).

   En run = 5 sektorer à 4 waves + 1 unik boss.
   Wave-scripts bygges af formations-byggeklodser
   som game.js oversætter til spawn-køer:
     {f:'vee'|'wall'|'stream'|'single'|'pair'|'trio'|'rocks', t:<type>, n:<antal>, x:<0-1>}
     {h:'flare'}            → lodret solstorms-stråle (hazard)
     {walls: <0-0.2>}       → tunnelvægge (andel af banebredden pr. side)
   Paletter er RGB-arrays, så game.js kan lerpe dem ved sektorskift.
   ===================================================== */
window.SECTORS = [
  {
    id: 'city', name: 'NEON CITY',
    pal: { sky: [26, 5, 51], grid: [255, 43, 214], star: [143, 138, 184], glow: [255, 43, 214] },
    layer: 'city',
    boss: 'gatekeeper', bossName: 'GATEKEEPER',
    waves: [
      [{ f: 'vee', t: 'drone', n: 5 }, { f: 'wall', t: 'drone', n: 4 }],
      [{ f: 'vee', t: 'drone', n: 7 }, { f: 'stream', t: 'diver', n: 3 }],
      [{ f: 'wall', t: 'splitter', n: 4 }, { f: 'single', t: 'tank' }, { f: 'vee', t: 'drone', n: 5 }],
      [{ f: 'single', t: 'sniper' }, { f: 'vee', t: 'drone', n: 7 }, { f: 'stream', t: 'diver', n: 4 }, { f: 'wall', t: 'drone', n: 5 }],
    ],
  },
  {
    id: 'belt', name: 'ASTEROID BELT',
    pal: { sky: [48, 18, 8], grid: [255, 123, 0], star: [201, 154, 106], glow: [255, 123, 0] },
    layer: 'rocks',
    boss: 'crusher', bossName: 'THE CRUSHER',
    waves: [
      [{ f: 'rocks', n: 3 }, { f: 'vee', t: 'drone', n: 5 }],
      [{ f: 'single', t: 'miner' }, { f: 'rocks', n: 2 }, { f: 'stream', t: 'diver', n: 3 }],
      [{ f: 'single', t: 'miner' }, { f: 'wall', t: 'splitter', n: 4 }, { f: 'rocks', n: 3 }],
      [{ f: 'single', t: 'miner', x: 0.25 }, { f: 'single', t: 'miner', x: 0.75 }, { f: 'single', t: 'tank' }, { f: 'rocks', n: 4 }, { f: 'vee', t: 'drone', n: 6 }],
    ],
  },
  {
    id: 'storm', name: 'SOLAR STORM',
    pal: { sky: [64, 22, 4], grid: [255, 176, 0], star: [255, 214, 140], glow: [255, 77, 40] },
    layer: 'sun',
    boss: 'solarcore', bossName: 'SOLAR CORE',
    waves: [
      [{ h: 'flare' }, { f: 'vee', t: 'drone', n: 6 }, { f: 'pair', t: 'phoenix' }],
      [{ h: 'flare' }, { f: 'single', t: 'sniper' }, { f: 'pair', t: 'phoenix' }, { f: 'stream', t: 'diver', n: 3 }],
      [{ h: 'flare' }, { f: 'wall', t: 'drone', n: 5 }, { h: 'flare' }, { f: 'pair', t: 'phoenix' }, { f: 'single', t: 'tank' }],
      [{ h: 'flare' }, { f: 'pair', t: 'phoenix' }, { h: 'flare' }, { f: 'pair', t: 'phoenix' }, { f: 'single', t: 'sniper' }, { f: 'vee', t: 'drone', n: 7 }],
    ],
  },
  {
    id: 'tunnel', name: 'CYBER TUNNEL',
    pal: { sky: [3, 34, 16], grid: [57, 255, 106], star: [120, 220, 150], glow: [57, 255, 106] },
    layer: 'tunnel',
    boss: 'firewall', bossName: 'FIREWALL',
    waves: [
      [{ walls: 0.09 }, { f: 'trio', t: 'phantom' }, { f: 'vee', t: 'drone', n: 5 }],
      [{ walls: 0.13 }, { f: 'trio', t: 'phantom' }, { f: 'stream', t: 'diver', n: 4 }, { f: 'single', t: 'sniper' }],
      [{ walls: 0.16 }, { f: 'wall', t: 'splitter', n: 4 }, { f: 'trio', t: 'phantom' }, { f: 'single', t: 'tank' }],
      [{ walls: 0.11 }, { f: 'trio', t: 'phantom' }, { f: 'trio', t: 'phantom' }, { f: 'stream', t: 'diver', n: 4 }, { f: 'vee', t: 'drone', n: 6 }],
    ],
  },
  {
    id: 'mother', name: 'MOTHERSHIP',
    pal: { sky: [40, 4, 46], grid: [255, 43, 214], star: [190, 140, 220], glow: [160, 60, 255] },
    layer: 'hull',
    boss: 'mothership', bossName: 'THE MOTHERSHIP',
    waves: [
      [{ f: 'single', t: 'turret', x: 0.12 }, { f: 'single', t: 'turret', x: 0.88 }, { f: 'vee', t: 'drone', n: 6 }],
      [{ f: 'single', t: 'turret', x: 0.12 }, { f: 'single', t: 'turret', x: 0.88 }, { f: 'single', t: 'miner' }, { f: 'pair', t: 'phoenix' }],
      [{ f: 'single', t: 'turret', x: 0.5 }, { f: 'trio', t: 'phantom' }, { f: 'wall', t: 'splitter', n: 5 }],
      [{ f: 'single', t: 'turret', x: 0.12 }, { f: 'single', t: 'turret', x: 0.88 }, { f: 'single', t: 'tank' }, { f: 'stream', t: 'diver', n: 5 }, { f: 'vee', t: 'drone', n: 7 }],
    ],
  },
];

/* Upgrade-pulje — vælg 1 af 3 efter hvert boss-kill.
   max = antal gange den kan vælges ('life' styres af liv < 5). */
window.UPGRADE_DEFS = [
  { id: 'rapid',   name: 'RAPID FIRE',   desc: '+18% FIRE RATE',           color: '#00f6ff', max: 3 },
  { id: 'wingman', name: 'WINGMAN',      desc: 'DRONE BUDDY JOINS YOU',    color: '#39ff6a', max: 2 },
  { id: 'graze',   name: 'GRAZE MASTER', desc: 'GRAZE GIVES 2X OVERDRIVE', color: '#ffffff', max: 1 },
  { id: 'magnet',  name: 'MAGNET',       desc: 'POWERUPS FLY TO YOU',      color: '#ffe14d', max: 1 },
  { id: 'life',    name: 'EXTRA LIFE',   desc: '+1 SHIP (MAX 5)',          color: '#ff2bd6', max: 99 },
  { id: 'odplus',  name: 'OVERDRIVE+',   desc: 'OVERDRIVE LASTS 8s',       color: '#ff2bd6', max: 1 },
  { id: 'pierce',  name: 'PIERCING',     desc: 'SHOTS PIERCE FIRST KILL',  color: '#ffb000', max: 1 },
  { id: 'spread',  name: 'SPREAD',       desc: '+1 ANGLED SHOT PER SIDE',  color: '#00f6ff', max: 2 },
];
