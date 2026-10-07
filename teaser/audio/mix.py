"""Final mix: music stems + trailer SFX + in-game SFX (from the captured clips' event logs) + announcer.
Everything is placed on the same beat grid as the picture (render/teaser.py)."""
import json
import os

import numpy as np

from synth import *  # noqa
import sfx

HERE = os.path.dirname(os.path.abspath(__file__))
STEMS = os.path.join(HERE, 'stems')
CLIPS = os.path.join(os.path.dirname(HERE), 'clips')
DUR = 30.0
N = ns(DUR)
FPS = 30


def fr(B):
    return B * BEAT * FPS


# ------------------------------------------------------------------ music bus
def load(name):
    return np.load(os.path.join(STEMS, name + '.npy')).astype(np.float64)


def active_rms(x):
    m = np.abs(x).max(axis=0) > 1e-4
    if not m.any():
        return 1e-9
    return np.sqrt(np.mean(x[:, m] ** 2))


TARGET_DB = {'kick': -11.5, 'snare': -15.0, 'hats': -26.0, 'toms': -15.0, 'crash': -24.0, 'bass': -14.5,
             'arp': -23.0, 'pad': -21.0, 'lead': -15.5, 'stab': -16.0}


def music_bus():
    kt = np.load(os.path.join(STEMS, 'kick_times.npy'))
    sc = sidechain(N, kt, depth=0.45, release=0.15)
    bus = np.zeros((2, N))
    report = {}
    for k, tgt in TARGET_DB.items():
        x = load(k)
        g = db(tgt) / active_rms(x)
        x = x * g
        if k in ('bass', 'pad', 'arp'):
            x = x * sc
        if k == 'pad':
            x = np.stack([filt(x[c], 'hp', 160) for c in range(2)])
        if k == 'arp':
            x = np.stack([filt(x[c], 'hp', 240) for c in range(2)])
        if k in ('pad', 'lead', 'arp'):
            ir = make_ir(2.8, 2.2 if k != 'lead' else 1.6, predelay=0.025, damp=4500, seed=31)
            x = x + convolve(x.mean(axis=0), ir) * (0.32 if k == 'pad' else 0.22)
        report[k] = round(20 * np.log10(active_rms(x) + 1e-12), 1)
        bus += x
    print('music stem active RMS dB:', report)
    # tame the sub so the limiter is not driven by inaudible energy
    bus = np.stack([filt(bus[c], 'lowshelf', 75, 0.7, -3.5) for c in range(2)])
    return bus


def slowmo_filter(x, b0=24.0, b1=26.0):
    """muffle the music during the slow-motion graze shot"""
    a, b = ns(tb(b0 - 0.1)), ns(tb(b1 + 0.05))
    t = tvec(b - a) + tb(b0 - 0.1)

    def fc(tt):
        Bt = tt / BEAT
        k_in = np.clip((Bt - (b0 - 0.05)) / 0.25, 0, 1)
        k_out = np.clip((Bt - (b1 - 0.35)) / 0.35, 0, 1)
        lo = 650.0
        v = 18000 * (lo / 18000) ** (k_in * (1 - k_out))
        return v
    fcs = fc(t)
    out = x.copy()
    for c in range(2):
        out[c, a:b] = filt_sweep(x[c, a:b], 'lp', fcs, q=0.9, block=64)
    return out


# ------------------------------------------------------------------ in-game SFX from clip event logs
GAME_SHOTS = [  # (b0, b1, clip, clip frame shown at beat 'anchor_b', anchor_b, gain)
    (16, 18, 'city_reveal', 38, 16, 1.0),
    (21.75, 24, 'storm', 30, 18, 1.0),
    (24, 26, 'graze2', 72, 24, 1.0),
    (26, 28, 'combo', 100, 26, 1.0),
    (30, 32, 'upgrade_pick', 4, 30, 1.0),
    (34, 36, 'boss_gate', 150, 34, 1.0),
    (36, 38, 'boss_crusher', 116, 36, 1.0),
    (38, 40, 'boss_solar', 96, 38, 1.0),
    (40, 42, 'boss_fire', 60, 40, 1.0),
    (42, 44, 'boss_mother', 100, 42, 1.0),
    (44, 48, 'od_climax2', 72, 48, 0.7),
    (48, 52, 'od_climax2', 72, 48, 1.0),
]
GAME_GAIN = {'shoot': db(-6), 'laserHum': db(-10), 'explode': db(2), 'bigBoom': db(6), 'hit': db(-3), 'power': db(-1),
             'graze': db(7), 'odGo': db(4), 'waveIn': db(-6), 'bossIn': db(-4), 'noise': db(0)}


def game_events():
    cues = []
    for b0, b1, name, c0, anchor, gain in GAME_SHOTS:
        meta = json.load(open(os.path.join(CLIPS, name, 'meta.json')))
        ts = np.array([f['t'] for f in meta['frames']])
        last_shot = -1
        for e in meta['events']:
            i = int(np.argmin(np.abs(ts - e['t'])))
            if abs(ts[i] - e['t']) > 0.02:
                continue
            vf = fr(anchor) + (i - c0)
            t = vf / FPS
            B = t / BEAT
            if not (b0 <= B < b1) or t < 0:
                continue
            nm = e['name']
            if nm in ('kill', 'overdrive', 'hitPlayer', 'tone'):
                continue
            if nm == 'shoot':
                if t - last_shot < 0.07:
                    continue
                last_shot = t
            if nm == 'noise':
                x = sfx.wa_noise(e['dur'], e['vol'], e['lp'])
            elif nm in sfx.GAME:
                x = sfx.GAME[nm]()
            else:
                continue
            cues.append((t, x, GAME_GAIN.get(nm, 1.0) * gain, 0.0))
    return cues


# ------------------------------------------------------------------ trailer sound design cues
def design_cues():
    C = []

    def add(B, x, g_db, p=0.0, offset=0.0):
        C.append((tb(B) + offset, x, db(g_db), p))

    C.append((0.20, sfx.crt_on(), db(-6), 0.0))
    add(2.0, sfx.fall_whistle(BEAT * 0.98, 2400, 520, 0.3), -16)
    add(3.0, sfx.coin(), -9)
    add(3.36, sfx.glitch(0.2, seed=3), -16)
    # boot typing: a pitched blip run per line + loading ticks
    PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88]
    for li, B in enumerate((3.6, 4.0, 4.5, 5.0, 5.5, 6.0)):
        for k in range(6):
            add(B + k * 0.06, sfx.blip(hz(PENTA[(li + k) % 9] + 12), 0.03, 0.4), -24, p=0.3 * ((k % 2) * 2 - 1))
    for k in range(16):
        add(6.5 + k * 0.05, sfx.blip(hz(69 + k), 0.025, 0.4, 0.5), -25)
    for k in range(4):     # BREACH DETECTED alarm
        add(7.5 + k * 0.125, sfx.blip(880 if k % 2 == 0 else 1320, 0.1, 0.5, 0.5), -15)
    add(7.5, sfx.glitch(0.45, seed=5), -15)
    # NEON letter drops: falling whistle + 8-bit crunch on landing
    for k in range(4):
        add(8 + k - 0.32, sfx.fall_whistle(tb(0.32), 2600, 300, 0.3), -17, p=(-0.4 + 0.27 * k))
        add(8 + k, sfx.glitch(0.08, seed=20 + k, vol=0.6), -16)
    # BREACH slams: zaps
    for k in range(6):
        add(12 + 0.5 * k, sfx.wa_tone(1800, 0.12, 'square', 0.4, 200), -17, p=(-0.5 + 0.2 * k))
    add(12.0, sfx.riser(tb(3.75), vol=0.6), -11)
    add(15.0, sfx.glitch(tb(0.75), seed=40, vol=0.7), -17)
    # THE BREACH
    add(16, sfx.impact(1.3), -1)
    add(16, sfx.shatter(), -8)
    add(16, sfx.sub_drop(1.6), -4)
    # strips + 5 SECTORS
    for k in range(5):
        add(18 + 0.25 * k, sfx.whoosh(0.22, 400, 5000, 0.6, seed=50 + k), -14, p=-0.8 + 0.4 * k)
        add(18 + 0.25 * k, sfx.wa_tone(140, 0.12, 'square', 0.4, 60), -18, p=-0.8 + 0.4 * k)
    add(19, sfx.impact(0.6, seed=12), -10)
    add(21.75, sfx.whoosh(tb(0.3), 300, 6000, 0.7, seed=60), -10)
    add(22, sfx.impact(0.5, seed=13), -12)
    # slow-mo graze
    add(24, sfx.whoosh(0.7, 4000, 200, 0.7, seed=61, down=True), -9)
    add(24, sfx.sub_drop(1.0, 0.8), -10)
    add(25.6, sfx.whoosh(tb(0.4), 300, 6000, 0.7, seed=62), -12)
    add(26, sfx.impact(0.5, seed=14), -12)
    for k in range(4):     # combo multiplier ticks
        add(26.25 + 0.25 * k, sfx.blip(hz(81 + k * 3), 0.07, 0.5, 0.5), -16)
    # upgrade cards
    for k in range(3):
        add(28 + 0.5 * k, sfx.card_flip(), -12, p=-0.5 + 0.5 * k)
    add(29.5, sfx.GAME['power'](), -2)
    # red alert pre-lap + WARNING siren
    add(31.5, sfx.siren(tb(0.5), tb(0.25), 0.3), -18)
    add(32, sfx.siren(tb(2.0), tb(0.5), 0.35), -13)
    add(32, sfx.impact(0.8, seed=15), -8)
    for k in range(5):
        add(32.5 + 0.25 * k, sfx.blip(hz(57 + [0, 3, 7, 10, 12][k]), 0.08, 0.5, 0.5), -18)
    # boss cuts: heavy hit + the game's boss-intro brass
    for k, B in enumerate((34, 36, 38, 40, 42)):
        add(B, sfx.impact(0.75, seed=30 + k), -7)
        add(B, sfx.wa_tone([98, 110, 123, 130, 98][k], 0.5, 'sawtooth', 0.4), -14)
        add(B, sfx.whoosh(0.18, 6000, 800, 0.6, seed=70 + k, down=True), -16)
    # overdrive charge
    add(44, sfx.charge(tb(2.0)), -12)
    for k in range(8):
        add(44 + 0.25 * k, sfx.blip(hz(64 + k * 2), 0.04, 0.4), -20)
    add(46, sfx.GAME['power'](), -4)
    add(46, sfx.charge(tb(1.5)) * 0.6, -16)
    add(47, sfx.keyclick(), -6)
    add(47.5, sfx.riser(tb(0.5), 2000, 12000, 0.7, seed=81, pitch=False), -10)
    # OVERDRIVE!
    add(48, sfx.impact(1.2, seed=40), -2)
    add(48, sfx.GAME['odGo'](), 0)
    add(49.55, sfx.whoosh(tb(0.45), 300, 7000, 0.8, seed=82), -9)
    # boss kill
    add(50, sfx.impact(1.5, seed=41), 0)
    add(50, sfx.GAME['bigBoom'](), 2)
    add(50, sfx.shatter(seed=43, vol=0.6), -9)
    add(50, sfx.sub_drop(1.8, 1.0), -3)
    add(50, sfx.rumble(2.0), -6)
    # logo
    add(52, sfx.impact(1.3, seed=44), -2)
    add(53.0, sfx.shimmer(1760), -16, p=-0.4)
    add(57.0, sfx.shimmer(2093), -16, p=0.4)
    for k in range(20):      # kicker typing
        add(54 + k * 0.035, sfx.blip(hz(PENTA[k % 9] + 12), 0.025, 0.4), -27)
    add(56, sfx.coin(0.7), -14)
    # power off + final coin
    add(60, sfx.crt_off(), -6, offset=0.12)
    add(61.5, sfx.coin(0.8), -12)
    return C


VOICE = [  # (beat, file, gain dB, rate %)
    (32.05, 'warning', 6.0, 112),
    (48.1, 'overdrive', 7.0, 108),
    (52.15, 'neonbreach', 6.5, 105),
    (61.7, 'insertcoin', 2.0, 118),
]


def render_mix():
    music = music_bus()
    music = slowmo_filter(music)
    # duck the music under the announcer
    duck = np.ones(N)
    voices = []
    for B, name, g, rate in VOICE:
        v = sfx.voice(name, rate)
        t0 = tb(B)
        voices.append((t0, v, db(g)))
        a, b = ns(t0), ns(t0) + len(v)
        ramp = ns(0.04)
        env = np.ones(N)
        env[max(0, a - ramp):a] = np.linspace(1, db(-7), min(ramp, a))
        env[a:b] = db(-7)
        if b < N:
            env[b:min(N, b + ramp * 3)] = np.linspace(db(-7), 1, min(ramp * 3, N - b))
        duck = np.minimum(duck, env)
    music = music * duck
    # tape stop on the final hit
    music = tape_stop(music, tb(60) + 0.12, dur=0.75, curve=1.5)

    fx = np.zeros((2, N))
    cues = design_cues() + game_events()
    for t, x, g, p in cues:
        place(fx, pan(x, p) if x.ndim == 1 else x, t, g)
    # space for the design FX
    ir = make_ir(2.2, 1.6, predelay=0.02, damp=5000, seed=51)
    fx = fx + convolve(fx.mean(axis=0), ir) * 0.16

    vo = np.zeros((2, N))
    vir = make_ir(2.4, 1.9, predelay=0.03, damp=4000, seed=52)
    for t0, v, g in voices:
        dry = np.stack([v, v]) * g
        wet = convolve(v, vir) * g * 0.35
        slap = np.zeros_like(dry)
        d = ns(0.11)
        slap[:, d:] = dry[:, :-d] * 0.25
        place(vo, dry + wet + slap, t0)

    fx = fx * db(4.0)
    mix = music + fx + vo
    mix = np.stack([filt(mix[c], 'hp', 28) for c in range(2)])
    # 'the suck': a hard 16th-note silence right before the drop, and a clean fade at the very end
    env = np.ones(N)
    a, b = ns(tb(15.75)), ns(tb(16.0)) - ns(0.004)
    env[a:b] = db(-32)
    env[a - ns(0.012):a] = np.linspace(1, db(-32), ns(0.012))
    env[b:b + ns(0.003)] = np.linspace(db(-32), 1, ns(0.003))
    env[N - ns(0.15):] = np.linspace(1, 0, ns(0.15))
    mix = mix * env
    np.save(os.path.join(HERE, 'stem_music.npy'), music.astype(np.float32))
    np.save(os.path.join(HERE, 'stem_fx.npy'), fx.astype(np.float32))
    np.save(os.path.join(HERE, 'stem_vo.npy'), vo.astype(np.float32))
    pre = float(os.environ.get('PREGAIN_DB', '0'))
    mix = mix * db(pre)
    print('pre-limiter peak dBFS', round(20 * np.log10(np.max(np.abs(mix))), 1))
    lim = limiter(mix, ceiling=db(-1.9), lookahead=0.004, release=0.12)
    gr = 20 * np.log10(np.maximum(np.abs(lim).max(axis=0), 1e-9) / np.maximum(np.abs(mix).max(axis=0), 1e-9))
    act = np.abs(mix).max(axis=0) > 0.05
    print('limiter GR dB: median', round(float(np.median(gr[act])), 2), 'p99', round(float(np.percentile(gr[act], 1)), 2))
    mix = lim
    np.save(os.path.join(HERE, 'mix_pre.npy'), mix.astype(np.float32))
    write_wav(os.path.join(HERE, 'teaser_mix.wav'), mix)
    print('peak', round(float(np.max(np.abs(mix))), 3))


if __name__ == '__main__':
    render_mix()
