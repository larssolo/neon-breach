"""NEON BREACH teaser score — 128 BPM, A minor, 16 bars = 30.0 s.
80s synthwave (saw pads, octave bass, gated-reverb snare) x 8-bit chiptune
(pulse arps, square lead, NES noise). Renders stems to stems/*.npy."""
import os
import numpy as np
from synth import *  # noqa

OUT = os.path.join(os.path.dirname(__file__), 'stems')
os.makedirs(OUT, exist_ok=True)
DUR = 30.0
N = ns(DUR)

# ------------------------------------------------------------------ harmony
CHORDS = [  # (start beat, chord)
    (0, 'Am'), (12, 'F'), (14, 'E'), (16, 'Am'), (20, 'F'), (24, 'C'), (28, 'G'),
    (32, 'F'), (36, 'G'), (40, 'Em'), (44, 'E'), (48, 'Am'), (52, 'F'), (56, 'G'), (58, 'E'), (60, 'Am'),
]
PAD_VOICING = {
    'Am': ['A2', 'A3', 'C4', 'E4'], 'F': ['F2', 'A3', 'C4', 'F4'], 'C': ['C3', 'G3', 'C4', 'E4'],
    'G': ['G2', 'G3', 'B3', 'D4'], 'Em': ['E2', 'G3', 'B3', 'E4'], 'E': ['E2', 'G#3', 'B3', 'E4'],
}
BASS_ROOT = {'Am': 'A1', 'F': 'F1', 'C': 'C2', 'G': 'G1', 'Em': 'E1', 'E': 'E1'}
ARP_TONES = {
    'Am': ['A3', 'C4', 'E4', 'A4', 'C5', 'E5'], 'F': ['F3', 'A3', 'C4', 'F4', 'A4', 'C5'],
    'C': ['C4', 'E4', 'G4', 'C5', 'E5', 'G5'], 'G': ['G3', 'B3', 'D4', 'G4', 'B4', 'D5'],
    'Em': ['E3', 'G3', 'B3', 'E4', 'G4', 'B4'], 'E': ['E3', 'G#3', 'B3', 'E4', 'G#4', 'B4'],
}


def chord_at(B):
    c = CHORDS[0][1]
    for s, name in CHORDS:
        if B >= s - 1e-9:
            c = name
    return c


def segments(b0, b1):
    """chord segments [(start, end, chord)] clipped to [b0, b1)"""
    edges = [s for s, _ in CHORDS] + [64]
    out = []
    for i, (s, name) in enumerate(CHORDS):
        e = edges[i + 1]
        a, b = max(s, b0), min(e, b1)
        if b > a:
            out.append((a, b, name))
    return out


# ------------------------------------------------------------------ drums
def kick(level=1.0, f0=150, f1=44, amp_tau=0.2):
    n = ns(0.55)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.032)
    body = sine(f, n) * np.exp(-t / amp_tau)
    click = filt(noise(n, 3) * np.exp(-t / 0.002), 'hp', 1800) * 0.35
    x = softclip(body * 1.25 + click, 1.4)
    return x * level


def snare_dry():
    n = ns(0.45)
    t = tvec(n)
    tone = (np.sin(2 * np.pi * 186 * t) + 0.55 * np.sin(2 * np.pi * 334 * t)) * np.exp(-t / 0.055)
    nz = noise(n, 5) * np.exp(-t / 0.13)
    nz = filt(nz, 'bp', 2600, 0.55) * 1.2 + filt(nz, 'hp', 6500) * 0.5
    nes = nes_noise(n, 22000, short=False, seed=77) * np.exp(-t / 0.05) * 0.25
    return softclip(tone * 0.8 + nz + nes, 1.2) * 0.9


def clap():
    n = ns(0.35)
    t = tvec(n)
    env = np.zeros(n)
    for d in (0.0, 0.010, 0.021, 0.031):
        i = ns(d)
        env[i:] += np.exp(-(t[i:] - d) / (0.006 if d < 0.03 else 0.11))
    x = filt(noise(n, 9) * env, 'bp', 1150, 1.1) * 1.6
    return x


def hat(open_=False, level=1.0):
    n = ns(0.45 if open_ else 0.09)
    t = tvec(n)
    x = np.zeros(n)
    for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0):
        x += np.sign(np.sin(2 * np.pi * f * 1.62 * t + f))
    x = filt(filt(x, 'bp', 10000, 0.9), 'hp', 7000)
    x += filt(noise(n, 13), 'hp', 9000) * 0.5
    x *= np.exp(-t / (0.16 if open_ else 0.028))
    return x * 0.35 * level


def tom(f_start, f_end, level=1.0):
    n = ns(0.6)
    t = tvec(n)
    f = f_end + (f_start - f_end) * np.exp(-t / 0.09)
    x = sine(f, n) * np.exp(-t / 0.28)
    x += filt(noise(n, 17) * np.exp(-t / 0.012), 'lp', 3000) * 0.4
    return softclip(x * 1.3, 1.3) * level


def crash(length=2.4, seed=21):
    n = ns(length)
    t = tvec(n)
    out = []
    for ch in range(2):
        x = noise(n, seed + ch)
        mt = np.zeros(n)
        r = np.random.default_rng(seed + 10 + ch)
        for f in r.uniform(3000, 9000, 14):
            mt += np.sign(np.sin(2 * np.pi * f * t + r.uniform(0, 6)))
        x = filt(x * 0.8 + mt * 0.08, 'hp', 3200)
        x = filt(x, 'peak', 7000, 1.0, 4)
        x *= np.exp(-t / 0.75) * (1 - np.exp(-t / 0.002))
        out.append(x)
    return np.stack(out) * 0.42


# ------------------------------------------------------------------ tonal voices
def bass_note(midi_n, length, cutoff=2200, decay=0.07, level=1.0):
    n = ns(length + 0.02)
    t = tvec(n)
    f = hz(midi_n)
    x = saw(f, n) * 0.7 + pulse(f * 1.003, n, 0.5) * 0.35
    fc = 220 + cutoff * np.exp(-t / decay)
    x = filt_sweep(x, 'lp', fc, q=1.4, block=48)
    sub = sine(f, n) * 0.4
    e = env_adsr(n, 0.002, 0.08, 0.75, 0.012, gate=length)
    return (x + sub) * e * level


def pad_chord(notes, length, cutoff=1900.0, seed=0, attack=0.25, release=0.6):
    n = ns(length + release)
    t = tvec(n)
    r = np.random.default_rng(seed)
    L = np.zeros(n)
    R = np.zeros(n)
    for k, nm in enumerate(notes):
        f0 = hz(m(nm))
        for j, cents in enumerate((-11, -4, 0, 5, 12)):
            f = f0 * 2 ** (cents / 1200) * (1 + 0.0015 * np.sin(2 * np.pi * (0.3 + 0.07 * j) * t + r.uniform(0, 6)))
            v = saw(f, n, r.uniform(0, 1))
            p = (j - 2) / 2.2 * 0.8
            a = (p + 1) * np.pi / 4
            L += v * np.cos(a)
            R += v * np.sin(a)
    e = env_adsr(n, attack, 0.4, 0.85, release, gate=length)
    fc = cutoff if np.isscalar(cutoff) else cutoff
    L = filt(L, 'lp', fc, 0.8) * e
    R = filt(R, 'lp', fc, 0.8) * e
    return np.stack([L, R]) / (len(notes) * 4.0)


def pulse_note(midi_n, length, duty=0.25, level=1.0, decay=0.09, sustain=0.45):
    n = ns(length + 0.03)
    x = pulse(hz(midi_n), n, duty)
    e = env_adsr(n, 0.002, decay, sustain, 0.02, gate=length)
    return x * e * level


def lead_note(midi_from, midi_to, length, glide=0.035, vib_depth=0.22, vib_rate=5.6, level=1.0):
    n = ns(length + 0.12)
    t = tvec(n)
    mm = midi_to + (midi_from - midi_to) * np.exp(-t / max(glide, 1e-4)) if midi_from is not None else np.full(n, float(midi_to))
    vib = vib_depth * np.clip((t - 0.14) / 0.2, 0, 1) * np.sin(2 * np.pi * vib_rate * t)
    f = hz(mm + vib)
    x = pulse(f, n, 0.5) * 0.55 + pulse(f * 1.004, n, 0.5) * 0.35 + saw(f * 0.5, n) * 0.32
    x = filt(x, 'lp', 5200, 0.9)
    e = env_adsr(n, 0.006, 0.22, 0.78, 0.09, gate=length)
    return x * e * level


# ------------------------------------------------------------------ arrangement
def render():
    S = {k: np.zeros((2, N)) for k in ('kick', 'snare', 'hats', 'toms', 'crash', 'bass', 'arp', 'pad', 'lead', 'stab')}
    kick_times = []
    sx = S['snare']

    def K(B, lvl=1.0, f0=150):
        place(S['kick'], kick(lvl, f0=f0), tb(B))
        kick_times.append(tb(B))

    SNARE = snare_dry()
    GIR = make_gated_ir()

    def SN(B, lvl=1.0, gated=0.9, with_clap=True):
        x = SNARE * lvl
        place(sx, pan(x, 0.0), tb(B))
        if gated:
            place(sx, convolve(x, GIR) * gated * 0.55, tb(B))
        if with_clap:
            place(sx, pan(clap() * lvl * 0.6, 0.1), tb(B) + 0.004)

    def HH(B, lvl=1.0, op=False):
        place(S['hats'], pan(hat(op, lvl), 0.25 if not op else -0.2), tb(B))

    def TOM(B, f1, f2, lvl=1.0, p=0.0):
        x = tom(f1, f2, lvl)
        place(S['toms'], pan(x, p), tb(B))
        place(S['toms'], convolve(x, GIR) * 0.45, tb(B))

    def CR(B, lvl=1.0, length=2.4):
        place(S['crash'], crash(length) * lvl, tb(B))

    # --- bar 2: heartbeat kicks under the boot text (muffled)
    for B in (4, 5, 6, 7):
        x = filt(kick(0.7, f0=110, amp_tau=0.16), 'lp', 380)
        place(S['kick'], pan(x, 0), tb(B))
    # --- bar 3: NEON letters drop on every beat
    for B in (8, 9, 10, 11):
        K(B, 1.05, f0=170)
        TOM(B, 120, 58, 0.75)
    # --- bar 4: B-R-E-A-C-H slams on 8ths, then tom fill, gap before the drop
    for i, B in enumerate((12, 12.5, 13, 13.5, 14, 14.5)):
        if B in (12, 13, 14):
            K(B, 0.95)
        SN(B, 0.55 + 0.07 * i, gated=0.7)
    for B, (f1, f2), p in zip((15, 15.25, 15.5), ((260, 140), (200, 104), (150, 74)), (0.35, 0.0, -0.35)):
        TOM(B, f1, f2, 1.0, p)

    # --- grooves
    def groove(b0, b1, fill_last=False, crash_at=None, open_hat=True):
        for B in np.arange(b0, b1, 1.0):
            K(B)
            if int(B) % 2 == 1:
                SN(B)
            HH(B + 0.5, 0.9)
            HH(B + 0.25, 0.32)
            HH(B + 0.75, 0.32)
            if open_hat and int(B) % 4 == 3:
                HH(B + 0.5, 0.7, op=True)
        if crash_at is not None:
            for c in crash_at:
                CR(c)
        if fill_last:
            for k in range(4):
                SN(b1 - 1 + k * 0.25, 0.45 + 0.12 * k, gated=0.5, with_clap=False)

    groove(16, 32, fill_last=True, crash_at=[16, 24])
    groove(32, 44, crash_at=[32, 40])
    for B in (34, 36, 38, 40, 42):          # boss-cut accents
        TOM(B, 110, 52, 0.85, -0.2)
    # --- bar 12 build: kick each beat + accelerating snare roll
    for B in (44, 45, 46, 47):
        K(B, 0.95)
    roll = [44, 44.5, 45, 45.5, 46, 46.25, 46.5, 46.75, 47, 47.125, 47.25, 47.375]
    for i, B in enumerate(roll):
        SN(B, 0.35 + 0.05 * i, gated=0.35, with_clap=False)
    # --- bar 13 climax
    CR(48, 1.1)
    K(48, 1.1); K(49); SN(49)
    for B in (48, 49):
        HH(B + 0.5, 1.0); HH(B + 0.25, 0.35); HH(B + 0.75, 0.35)
    K(50, 1.2, f0=120)
    CR(50, 1.0, 3.0)
    # reverse crash into the logo
    rc = crash(1.4, seed=31)[:, ::-1] * np.linspace(0, 1, ns(1.4)) ** 2
    place(S['crash'], rc * 0.9, tb(52) - 1.4)
    # --- bar 14 logo: half-time
    CR(52, 1.2, 3.0)
    K(52, 1.15); K(53.5, 0.8); SN(54, 1.05, gated=1.2)
    for B in (52, 53, 54, 55):
        HH(B + 0.5, 0.8)
    # --- bar 15 groove + fill
    groove(56, 60, fill_last=True, open_hat=False)
    # --- bar 16 final hit
    K(60, 1.2)
    CR(60, 1.2, 3.0)
    SN(60, 0.9, gated=1.0)

    # ---------------- bass
    def bass_gallop(b0, b1, lvl=1.0):
        for a, b, c in segments(b0, b1):
            root = m(BASS_ROOT[c])
            for k, B in enumerate(np.arange(a, b, 0.25)):
                mn = root + (12 if k % 2 else 0)
                x = bass_note(mn, BEAT / 4 * 0.82, cutoff=1900 if k % 2 else 2500, level=lvl * (0.85 if k % 2 else 1.0))
                place(S['bass'], pan(x, 0), tb(B))

    for B in (8, 9, 10, 11):                 # NEON hits: long bass notes
        x = bass_note(m('A1'), BEAT * 0.9, cutoff=1400, decay=0.12)
        place(S['bass'], pan(x, 0), tb(B))
    for B in np.arange(12, 15.5, 0.5):       # BREACH 8ths following F / E
        c = chord_at(B)
        x = bass_note(m(BASS_ROOT[c]) + (12 if (B * 2) % 2 else 0), BEAT / 2 * 0.8, cutoff=1800)
        place(S['bass'], pan(x, 0), tb(B))
    bass_gallop(16, 44)
    bass_gallop(44, 47.5, 0.95)
    bass_gallop(48, 50)
    x = bass_note(m('F1'), BEAT * 3.6, cutoff=900, decay=0.4)   # logo: sustained root
    place(S['bass'], pan(x, 0), tb(52))
    for B in (54, 54.5, 55, 55.5):
        place(S['bass'], pan(bass_note(m('F2'), BEAT / 2 * 0.7, cutoff=1500), 0), tb(B))
    bass_gallop(56, 60)
    place(S['bass'], pan(bass_note(m('A1'), BEAT * 2.5, cutoff=1600, decay=0.3), 0), tb(60))
    # intro sub drone
    n0 = ns(tb(8))
    t0 = tvec(n0)
    drone = sine(hz(m('A1')), n0) * np.clip((t0 - 0.45) / 2.5, 0, 1) * 0.35
    place(S['bass'], pan(drone, 0), 0.0)

    # ---------------- arp (pulse 25%, 16ths)
    PATTERN = [0, 1, 2, 3, 4, 5, 4, 3, 1, 2, 3, 4, 5, 4, 3, 2]
    arp_dry = np.zeros((2, N))

    def arp(b0, b1, lvl=1.0):
        for a, b, c in segments(b0, b1):
            tones = ARP_TONES[c]
            for B in np.arange(a, b, 0.25):
                k = int(round(B * 4)) % 16
                x = pulse_note(m(tones[PATTERN[k]]), BEAT / 4 * 0.7, 0.25, lvl * (1.0 if k % 4 == 0 else 0.8))
                place(arp_dry, pan(x, 0.0), tb(B))

    arp(1.0, 50, 1.0)
    arp(52, 60, 0.9)
    # intro filter opening (bars 1-2 dark -> bright), then steady
    t = tvec(N)
    fc = np.where(t < tb(8), 350 * (14000 / 350) ** np.clip(t / tb(8), 0, 1) ** 2, 9000)
    lvl = np.where(t < tb(1), 0, np.clip((t - tb(1)) / tb(3), 0, 1) * 0.6 + 0.4)
    for c in range(2):
        arp_dry[c] = filt_sweep(arp_dry[c], 'lp', fc, q=1.1, block=128) * lvl
    S['arp'] = arp_dry * 0.8 + pingpong(arp_dry, BEAT * 0.75, fb=0.42, reps=6, lp=3500) * 0.45

    # ---------------- pad
    for a, b, c in segments(0, 64):
        if a >= 50 and b <= 52:
            continue
        cut = 1500 if a < 16 else 2300
        x = pad_chord(PAD_VOICING[c], tb(b) - tb(a), cutoff=cut, seed=int(a), attack=0.6 if a == 0 else 0.12)
        if a == 0:
            x[:, :ns(0.5)] = 0
        place(S['pad'], x, tb(a))
    # sustain under the boom (bar 13 beat 3-4): darker, swelling
    x = pad_chord(PAD_VOICING['Am'], tb(2), cutoff=900, seed=5, attack=0.05, release=0.4)
    place(S['pad'], x * 0.8, tb(50))

    # ---------------- lead
    H = [  # (beat, note, length in 16ths)
        # hook A — bars 5-8
        (16, 'A4', 3), (16.75, 'C5', 3), (17.5, 'E5', 4), (18.5, 'D5', 2), (19, 'E5', 4),
        (20, 'F5', 3), (20.75, 'E5', 3), (21.5, 'C5', 4), (22.5, 'A4', 2), (23, 'C5', 4),
        (24, 'G5', 3), (24.75, 'E5', 3), (25.5, 'C5', 4), (26.5, 'D5', 2), (27, 'E5', 4),
        (28, 'D5', 3), (28.75, 'B4', 3), (29.5, 'G4', 4), (30.5, 'A4', 2), (31, 'B4', 2), (31.5, 'D5', 2),
        # hook B — bars 9-11 (beats 1-2 of bar 9 left to the siren)
        (34, 'A5', 3), (34.75, 'G5', 3), (35.5, 'F5', 2),
        (36, 'G5', 3), (36.75, 'D5', 3), (37.5, 'B4', 4), (38.5, 'D5', 2), (39, 'G5', 4),
        (40, 'B5', 3), (40.75, 'G5', 3), (41.5, 'E5', 4), (42.5, 'G5', 2), (43, 'B5', 4),
        # bar 12 rising build
        (44, 'E5', 2), (44.5, 'G#5', 2), (45, 'B5', 2), (45.5, 'E6', 2),
        (46, 'E5', 1), (46.25, 'G#5', 1), (46.5, 'B5', 1), (46.75, 'E6', 1),
        (47, 'G#5', 1), (47.25, 'B5', 1), (47.5, 'E6', 2),
        # bar 13 climax hook (octave up) until the boom
        (48, 'A5', 3), (48.75, 'C6', 3), (49.5, 'E6', 2),
        # anthem over the logo
        (52, 'C6', 8), (54, 'A5', 8), (56, 'B5', 8), (58, 'G#5', 8), (60, 'A5', 12),
    ]
    prev = None
    for i, (B, nm, l16) in enumerate(H):
        mn = m(nm)
        legato = prev is not None and abs(prev[0] - B) < 1e-6
        x = lead_note(prev[1] if legato else None, mn, BEAT / 4 * l16 * 0.92,
                      glide=0.03, vib_depth=0.28 if l16 >= 4 else 0.12, level=1.0)
        place(S['lead'], pan(x, 0.0), tb(B))
        prev = (B + l16 / 4, mn)

    # ---------------- stabs: 80s "orchestra hit" on the logo + final hit
    def stab(notes, length=0.9):
        n = ns(length)
        t = tvec(n)
        x = np.zeros(n)
        for nm in notes:
            f = hz(m(nm)) * (1 - 0.06 * np.clip((t - length * 0.55) / (length * 0.45), 0, 1) ** 2)
            x += saw(f, n) + saw(f * 1.006, n) * 0.7
        x = filt(x, 'lp', 3800, 0.9) / len(notes)
        x += filt(noise(n, 41) * np.exp(-t / 0.03), 'bp', 2500, 0.7) * 0.8
        x *= np.exp(-t / 0.22) * (1 - np.exp(-t / 0.002))
        return softclip(x * 1.5, 1.2)

    for B, notes in ((16, ['A2', 'E3', 'A3', 'C4', 'E4', 'A4']), (52, ['F2', 'C3', 'F3', 'A3', 'C4', 'F4']),
                     (60, ['A2', 'E3', 'A3', 'C4', 'E4', 'A4'])):
        place(S['stab'], pan(stab(notes), 0), tb(B))

    np.save(os.path.join(OUT, 'kick_times.npy'), np.array(sorted(kick_times)))
    for k, v in S.items():
        np.save(os.path.join(OUT, f'{k}.npy'), v.astype(np.float32))
    print('stems:', {k: round(float(np.max(np.abs(v))), 3) for k, v in S.items()})


if __name__ == '__main__':
    render()
