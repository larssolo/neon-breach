"""Tiny offline synth/DSP toolkit (numpy + scipy) for the NEON BREACH teaser.
Everything is mono float64 unless noted; stereo arrays are shape (2, n)."""
import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 48000
BPM = 128
BEAT = 60.0 / BPM            # 0.46875 s
RNG = np.random.default_rng(1986)

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def m(s):
    """'A4' -> midi 69"""
    return 12 * (int(s[-1]) + 1) + NOTE[s[:-1]]


def hz(midi):
    return 440.0 * 2 ** ((np.asarray(midi, dtype=float) - 69) / 12)


def tb(B):
    """beat index (0-based, float) -> seconds"""
    return B * BEAT


def ns(sec):
    return int(round(sec * SR))


def tvec(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------- oscillators
def _phase(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,)).copy()
    dt = f / SR
    ph = (ph0 + np.concatenate([[0.0], np.cumsum(dt)[:-1]])) % 1.0
    return ph, dt


def _blep(t, dt):
    y = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a]
    y[a] = x + x - x * x - 1.0
    b = t > 1.0 - dt
    x = (t[b] - 1.0) / dt[b]
    y[b] = x * x + x + x + 1.0
    return y


def saw(freq, n, ph0=0.0):
    t, dt = _phase(freq, n, ph0)
    return 2.0 * t - 1.0 - _blep(t, dt)


def pulse(freq, n, duty=0.5, ph0=0.0):
    t, dt = _phase(freq, n, ph0)
    s1 = 2.0 * t - 1.0 - _blep(t, dt)
    t2 = (t - duty) % 1.0
    s2 = 2.0 * t2 - 1.0 - _blep(t2, dt)
    return (s1 - s2) * 0.5 / max(duty, 1 - duty) * 1.0


def sine(freq, n, ph0=0.0):
    t, _ = _phase(freq, n, ph0)
    return np.sin(2 * np.pi * t)


def tri(freq, n, ph0=0.0, steps=None):
    t, _ = _phase(freq, n, ph0)
    y = 4.0 * np.abs(t - 0.5) - 1.0
    if steps:                                   # NES-style stepped triangle
        y = np.round((y + 1) * (steps - 1) / 2) / ((steps - 1) / 2) - 1
    return y


def noise(n, seed=None):
    r = RNG if seed is None else np.random.default_rng(seed)
    return r.uniform(-1, 1, n)


def nes_noise(n, rate=8000.0, short=False, seed=1):
    """NES-style LFSR noise clocked at `rate` Hz (short=True -> metallic 93-step loop)."""
    steps = int(n * rate / SR) + 2
    reg = 1 if seed is None else (seed & 0x7FFF) or 1
    out = np.empty(steps)
    tap = 6 if short else 1
    for i in range(steps):
        fb = (reg & 1) ^ ((reg >> tap) & 1)
        reg = (reg >> 1) | (fb << 14)
        out[i] = 1.0 if reg & 1 else -1.0
    idx = (np.arange(n) * rate / SR).astype(int)
    return out[idx]


# ---------------------------------------------------------------- envelopes
def env_adsr(n, a=0.005, d=0.1, s=0.7, r=0.05, gate=None):
    """gate (seconds) = note-on length; release follows after the gate."""
    gate_n = n if gate is None else min(n, ns(gate))
    t = tvec(n)
    e = np.empty(n)
    an, dn = max(1, ns(a)), max(1, ns(d))
    e[:] = s
    k = np.arange(n)
    e = np.where(k < an, k / an, e)
    dd = (k >= an) & (k < an + dn)
    e[dd] = 1 - (1 - s) * ((k[dd] - an) / dn)
    if gate_n < n:
        lvl = e[gate_n - 1] if gate_n > 0 else 0
        rn = max(1, ns(r))
        rel = np.clip(1 - (k - gate_n) / rn, 0, 1) * lvl
        e = np.where(k >= gate_n, rel, e)
    return e


def env_exp(n, tau, attack=0.001):
    t = tvec(n)
    e = np.exp(-t / tau)
    an = max(1, ns(attack))
    e[:an] *= np.linspace(0, 1, an)
    return e


# ---------------------------------------------------------------- filters
def biquad(kind, fc, q=0.707, gain_db=0.0):
    fc = float(np.clip(fc, 10, SR * 0.49))
    w0 = 2 * np.pi * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b, a = np.array(b), np.array(a)
    return b / a[0], a / a[0]


def filt(x, kind, fc, q=0.707, gain_db=0.0):
    b, a = biquad(kind, fc, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def filt_sweep(x, kind, fc, q=0.707, block=64):
    """time-varying biquad; fc = array (len(x)) or callable(t_seconds)."""
    n = len(x)
    if callable(fc):
        fc = fc(tvec(n))
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    y = np.empty(n)
    zi = np.zeros(2)
    for i in range(0, n, block):
        j = min(n, i + block)
        b, a = biquad(kind, fc[(i + j) // 2], q)
        y[i:j], zi = signal.lfilter(b, a, x[i:j], zi=zi)
    return y


# ---------------------------------------------------------------- effects
def make_ir(seconds=2.5, rt60=2.0, predelay=0.02, damp=5000.0, seed=7, early=True):
    n = ns(seconds)
    t = tvec(n)
    r = np.random.default_rng(seed)
    env = np.exp(-6.91 * t / rt60)
    out = []
    for ch in range(2):
        x = r.standard_normal(n) * env
        lpx = filt(x, 'lp', damp)
        k = np.clip(t / (rt60 * 0.45), 0, 1)
        x = x * (1 - k) + lpx * k
        x = filt(x, 'hp', 180)
        if early:
            for d, g in [(0.011, 0.5), (0.019, 0.35), (0.027, 0.3), (0.041, 0.25), (0.053, 0.2)]:
                i = ns(d + 0.003 * ch)
                x[i] += g * (1 if r.random() > 0.5 else -1) * 3
        x = np.concatenate([np.zeros(ns(predelay)), x])
        out.append(x)
    ir = np.stack(out)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def make_gated_ir(hold=0.19, fade=0.035, seed=11):
    n = ns(hold + fade)
    t = tvec(n)
    r = np.random.default_rng(seed)
    env = np.exp(-t / 0.5) * np.clip((hold + fade - t) / fade, 0, 1)
    out = []
    for ch in range(2):
        x = r.standard_normal(n) * env
        x = filt(filt(x, 'lp', 7000), 'hp', 250)
        out.append(np.concatenate([np.zeros(ns(0.006)), x]))
    ir = np.stack(out)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir):
    """mono or stereo x with stereo ir -> stereo, same length as x"""
    if x.ndim == 1:
        x = np.stack([x, x])
    y = np.stack([signal.fftconvolve(x[c], ir[c])[:x.shape[1]] for c in range(2)])
    return y


def pingpong(x, delay, fb=0.4, reps=6, lp=4000.0):
    if x.ndim == 2:
        x = x.mean(axis=0)
    d = ns(delay)
    n = len(x)
    wet = filt(x, 'lp', lp)
    out = np.zeros((2, n))
    for k in range(1, reps + 1):
        s = k * d
        if s >= n:
            break
        out[(k - 1) % 2, s:] += wet[:n - s] * fb ** (k - 1)
    return out


def chorus(x, base_ms=14.0, depth_ms=3.5, rate=0.6, ph=0.0):
    n = len(x)
    t = tvec(n)
    d = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + ph)) * SR / 1000.0
    idx = np.arange(n) - d
    return np.interp(idx, np.arange(n), x, left=0.0, right=0.0)


def pan(x, p):
    """p in [-1, 1]; constant-power"""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


def bitcrush(x, bits=6, rate=11025):
    hold = max(1, int(round(SR / rate)))
    y = np.repeat(x[::hold], hold)[:len(x)]
    q = 2 ** (bits - 1)
    return np.round(y * q) / q


def place(buf, x, t, gain=1.0):
    """add mono/stereo x into stereo buf at time t (s)"""
    i = ns(t)
    if x.ndim == 1:
        x = np.stack([x, x])
    if i < 0:
        x = x[:, -i:]; i = 0
    j = min(buf.shape[1], i + x.shape[1])
    if j > i:
        buf[:, i:j] += x[:, :j - i] * gain


def sidechain(n, kick_times, depth=0.6, release=0.16, attack=0.004):
    g = np.ones(n)
    t = tvec(n)
    for tk in kick_times:
        i0 = ns(tk)
        i1 = min(n, i0 + ns(release * 6))
        if i0 >= n:
            continue
        tt = t[i0:i1] - tk
        att = np.clip(tt / attack, 0, 1)
        duck = 1 - depth * att * np.exp(-np.maximum(tt - attack, 0) / release)
        pre = max(0, i0 - ns(attack))
        g[i0:i1] = np.minimum(g[i0:i1], duck)
        # tiny pre-dip so the duck is not clicky
        if pre < i0:
            g[pre:i0] = np.minimum(g[pre:i0], np.linspace(1, 1 - depth * 0.3, i0 - pre))
    return g


def limiter(x, ceiling=0.94, lookahead=0.004, release=0.09):
    peak = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    la = ns(lookahead)
    need = minimum_filter1d(need, size=2 * la + 1)
    need = np.concatenate([need[la:], np.ones(la)])          # anticipate
    g = np.empty_like(need)
    c = np.exp(-1.0 / (release * SR))
    cur = 1.0
    for i in range(len(need)):
        v = need[i]
        cur = v if v < cur else v + (cur - v) * c
        g[i] = cur
    # second smoothing pass to remove any edge
    g = signal.lfilter([1 - 0.995], [1, -0.995], g)
    g = np.minimum(g, need + 0.0)
    return x * g


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def tape_stop(x, t0, dur=0.7, curve=1.6):
    """x stereo; slows playback to zero from t0 over dur seconds (classic tape stop)."""
    i0 = ns(t0)
    n = ns(dur)
    seg = x[:, i0:]
    tt = np.arange(n) / n
    rate = (1 - tt) ** curve
    pos = np.cumsum(rate)
    out = x.copy()
    out[:, i0:] = 0
    for c in range(2):
        out[c, i0:i0 + n] = np.interp(pos, np.arange(seg.shape[1]), seg[c]) * np.clip((1 - tt) * 4, 0, 1)
    return out


def norm(x, peak=1.0):
    p = np.max(np.abs(x))
    return x * (peak / p) if p > 0 else x


def db(v):
    return 10 ** (v / 20)


def write_wav(path, x):
    from scipy.io import wavfile
    y = np.clip(x, -1, 1)
    wavfile.write(path, SR, (y.T * 32767).astype(np.int16))
