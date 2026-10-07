"""Sound effects: faithful re-creations of NEON BREACH's own WebAudio SFX (game.js Sfx object)
plus trailer sound design (CRT, coin, whooshes, impacts, risers, siren) and the arcade announcer."""
import os
import subprocess

import numpy as np
from scipy.io import wavfile
from scipy import signal

from synth import *  # noqa

HERE = os.path.dirname(os.path.abspath(__file__))


# ------------------------------------------------------------------ game.js Sfx, 1:1
def wa_tone(freq, dur, wave='square', vol=0.18, slide=None):
    """WebAudio tone(): exp freq ramp, gain exp-ramp vol -> 0.0001 over dur."""
    n = ns(dur + 0.02)
    t = tvec(n)
    k = np.clip(t / dur, 0, 1)
    f = freq * (max(20, slide) / freq) ** k if slide else np.full(n, float(freq))
    if wave == 'square':
        x = pulse(f, n, 0.5)
    elif wave == 'sawtooth':
        x = saw(f, n)
    else:
        x = tri(f, n)
    g = vol * (0.0001 / vol) ** k
    g[t > dur] = 0
    return x * g


def wa_noise(dur, vol=0.25, lp=1800, seed=None):
    n = max(1, ns(dur))
    x = noise(n, seed) * (1 - np.arange(n) / n)
    x = filt(x, 'lp', lp, 1.0)
    k = np.arange(n) / n
    return x * vol * (0.0001 / vol) ** k


def seq(parts):
    """parts: [(offset_s, array)] -> summed mono"""
    L = max(ns(o) + len(a) for o, a in parts)
    out = np.zeros(L)
    for o, a in parts:
        out[ns(o):ns(o) + len(a)] += a
    return out


GAME = {
    'shoot': lambda: wa_tone(880, 0.08, 'square', 0.07, 220),
    'laserHum': lambda: wa_tone(160, 0.1, 'sawtooth', 0.05, 150),
    'explode': lambda: seq([(0, wa_noise(0.3, 0.3, 1400)), (0, wa_tone(110, 0.25, 'sawtooth', 0.12, 40))]),
    'bigBoom': lambda: seq([(0, wa_noise(0.7, 0.45, 900)), (0, wa_tone(70, 0.6, 'sawtooth', 0.2, 30))]),
    'hit': lambda: seq([(0, wa_noise(0.18, 0.3, 3000)), (0, wa_tone(200, 0.3, 'square', 0.15, 60))]),
    'power': lambda: seq([(i * 0.07, wa_tone(f, 0.12, 'square', 0.12)) for i, f in enumerate((523, 659, 784, 1047))]),
    'graze': lambda: wa_tone(1500, 0.04, 'square', 0.05, 1900),
    'odGo': lambda: seq([(0, wa_tone(180, 0.5, 'sawtooth', 0.18, 900))] +
                        [(0.1 + i * 0.08, wa_tone(f, 0.14, 'square', 0.12)) for i, f in enumerate((659, 784, 988, 1319))]),
    'waveIn': lambda: seq([(0, wa_tone(330, 0.12, 'square', 0.1)), (0.13, wa_tone(440, 0.18, 'square', 0.1))]),
    'bossIn': lambda: seq([(i * 0.32, wa_tone(f, 0.3, 'sawtooth', 0.2)) for i, f in enumerate((98, 98, 130))]),
}


# ------------------------------------------------------------------ trailer sound design
def crt_on():
    n = ns(1.2)
    t = tvec(n)
    thunk = sine(55 * (1 + 0.6 * np.exp(-t / 0.03)), n) * np.exp(-t / 0.12) * 0.9
    click = filt(noise(n, 1) * np.exp(-t / 0.004), 'hp', 1500) * 0.5
    whine_f = 2600 + 9000 * (1 - np.exp(-t / 0.18))
    whine = sine(whine_f, n) * np.exp(-t / 0.35) * 0.05
    static = filt(noise(n, 2), 'bp', 3500, 0.6) * np.exp(-t / 0.15) * 0.45
    boing = sine(180 * np.exp(-t / 0.5) + 40, n) * np.exp(-t / 0.4) * 0.25 * np.sin(2 * np.pi * 9 * t) ** 2
    return thunk + click + whine + static + boing


def crt_off():
    n = ns(1.0)
    t = tvec(n)
    f = 60 + 2400 * np.exp(-t / 0.09)
    zap = saw(f, n) * np.exp(-t / 0.22) * 0.45
    zap = filt(zap, 'lp', 5000)
    crack = filt(noise(n, 3), 'hp', 2500) * np.exp(-t / 0.08) * 0.35
    thump = sine(48, n) * np.exp(-t / 0.2) * 0.7
    whine = sine(9500 - 6000 * t, n) * np.exp(-t / 0.5) * 0.03
    return zap + crack + thump + whine


def coin(vol=1.0):
    a = pulse(hz(83), ns(0.075), 0.5) * 0.5                    # B5
    n = ns(0.55)
    t = tvec(n)
    b = pulse(hz(88), n, 0.5) * 0.5 * np.exp(-t / 0.16)        # E6
    out = np.concatenate([a, b])
    return filt(out, 'lp', 9000) * vol


def fall_whistle(dur=0.3, f0=2200, f1=380, vol=0.25):
    n = ns(dur)
    t = tvec(n)
    f = f0 * (f1 / f0) ** (t / dur)
    return pulse(f, n, 0.25) * vol * (0.4 + 0.6 * t / dur) * np.clip((dur - t) / 0.01, 0, 1)


def blip(f, dur=0.045, vol=0.3, duty=0.25):
    n = ns(dur)
    t = tvec(n)
    return pulse(f, n, duty) * vol * np.exp(-t / (dur * 0.5))


def glitch(dur=0.35, seed=4, vol=0.5):
    r = np.random.default_rng(seed)
    out = np.zeros(ns(dur))
    p = 0
    while p < len(out):
        L = int(r.uniform(0.012, 0.05) * SR)
        kind = r.integers(0, 3)
        if kind == 0:
            x = pulse(r.uniform(150, 2500), L, r.choice([0.125, 0.25, 0.5]))
        elif kind == 1:
            x = bitcrush(noise(L, int(r.integers(0, 999))), 3, 4000)
        else:
            x = np.zeros(L)
        out[p:p + L] = x[:len(out) - p] * r.uniform(0.3, 1.0)
        p += L
    return out * vol


def whoosh(dur=0.4, f0=300, f1=4500, vol=0.6, seed=6, down=False):
    n = ns(dur)
    t = tvec(n)
    k = t / dur
    fc = f0 * (f1 / f0) ** (1 - k if down else k)
    x = filt_sweep(noise(n, seed), 'bp', fc, q=0.9, block=64)
    env = np.sin(np.pi * np.clip(k, 0, 1)) ** 1.5
    return x * env * vol * 2.0


def impact(size=1.0, seed=8):
    n = ns(1.6)
    t = tvec(n)
    sub = sine(30 + 70 * np.exp(-t / 0.12), n) * np.exp(-t / (0.35 + 0.3 * size)) * 1.0
    body = filt(noise(n, seed), 'lp', 2500) * np.exp(-t / 0.09) * 0.8
    click = filt(noise(n, seed + 1), 'hp', 3000) * np.exp(-t / 0.006) * 0.5
    return softclip((sub + body + click) * size, 1.4)


def riser(dur, f0=200, f1=9000, vol=0.5, seed=12, pitch=True):
    n = ns(dur)
    t = tvec(n)
    k = t / dur
    x = filt_sweep(noise(n, seed), 'bp', f0 * (f1 / f0) ** (k ** 1.6), q=1.4, block=64) * 1.6
    if pitch:
        x += saw(110 * 8 ** (k ** 1.3), n) * 0.18 * k
    return x * vol * k ** 2


def shatter(seed=9, vol=0.5):
    r = np.random.default_rng(seed)
    out = np.zeros(ns(0.9))
    for _ in range(46):
        o = r.uniform(0, 0.55) ** 1.6
        f = r.uniform(900, 4200)
        x = blip(f, r.uniform(0.02, 0.06), r.uniform(0.15, 0.4), r.choice([0.125, 0.25, 0.5])) * (1 - o / 0.6)
        i = ns(o)
        out[i:i + len(x)] += x[:len(out) - i]
    n = len(out)
    t = tvec(n)
    out += filt(noise(n, seed), 'hp', 4000) * np.exp(-t / 0.18) * 0.4
    return out * vol


def siren(dur, period, vol=0.35):
    n = ns(dur)
    t = tvec(n)
    ph = (t / period) % 1.0
    f = 520 + 640 * np.sin(np.pi * ph) ** 0.7
    x = pulse(f, n, 0.5) * 0.6 + saw(f * 0.5, n) * 0.4
    x = filt(x, 'lp', 3500)
    return x * vol * np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)


def keyclick():
    n = ns(0.25)
    t = tvec(n)
    c1 = filt(noise(n, 14), 'hp', 2500) * np.exp(-t / 0.003) * 0.8
    thock = sine(260 * (1 + 0.4 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.03) * 0.6
    return c1 + thock


def charge(dur, vol=0.35):
    n = ns(dur)
    t = tvec(n)
    k = t / dur
    f = 110 * 8 ** (k ** 1.2)
    trem = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * t / (BEAT / 4)))
    x = saw(f, n) * 0.6 + pulse(f * 2.005, n, 0.25) * 0.4
    x = filt_sweep(x, 'lp', 400 + 7000 * k ** 1.5, q=2.0, block=64)
    return x * trem * vol * (0.3 + 0.7 * k)


def shimmer(f=1760, vol=0.25):
    n = ns(1.8)
    t = tvec(n)
    x = np.zeros(n)
    for mul, a, tau in ((1, 1, 0.9), (2.76, 0.5, 0.5), (5.4, 0.3, 0.3), (8.93, 0.2, 0.2)):
        x += sine(f * mul, n) * a * np.exp(-t / tau)
    return x * vol * (1 - np.exp(-t / 0.002))


def card_flip(vol=0.3):
    n = ns(0.07)
    t = tvec(n)
    f = 500 * (3.2 ** (t / 0.07))
    return pulse(f, n, 0.25) * vol * np.exp(-t / 0.05) + filt(noise(n, 5), 'hp', 5000) * np.exp(-t / 0.005) * 0.3


def sub_drop(dur=1.4, vol=1.0):
    n = ns(dur)
    t = tvec(n)
    f = 25 + 70 * np.exp(-t / 0.35)
    return sine(f, n) * vol * np.exp(-t / (dur * 0.5)) * np.clip(t / 0.005, 0, 1)


def rumble(dur=1.6, vol=0.6):
    n = ns(dur)
    t = tvec(n)
    x = filt(noise(n, 22), 'lp', 180) * 3.0
    return x * vol * np.exp(-t / (dur * 0.45))


# ------------------------------------------------------------------ announcer
def voice(name, rate_pct=100):
    path = os.path.join(HERE, 'voice', name + '.wav')
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / 32768.0
    if x.ndim > 1:
        x = x.mean(axis=1)
    nz = np.nonzero(np.abs(x) > 0.02)[0]
    x = x[max(0, nz[0] - 200):nz[-1] + 400]
    n_out = int(len(x) * SR / sr * 100 / rate_pct)
    x = signal.resample(x, n_out)
    x = filt(x, 'hp', 140)
    x = filt(x, 'peak', 2600, 1.0, 5)
    crushed = bitcrush(x, 6, 11025)
    t = tvec(len(x))
    ring = x * np.sin(2 * np.pi * 52 * t)
    y = x * 0.55 + crushed * 0.55 + ring * 0.25
    y = softclip(y * 2.2, 1.6)
    # robotic doubling (slightly detuned copy) for the big announcer feel
    d = signal.resample(y, int(len(y) * 1.012))[:len(y)]
    y = y * 0.75 + d * 0.45
    return norm(y, 0.9)
