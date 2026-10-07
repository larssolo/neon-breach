"""NEON BREACH — 30 s teaser. Shot list on a 128 BPM beat grid (B = beat index, 0-based).
Each shot returns (frame, fx) where fx tweaks the global post-processing."""
import math
from functools import lru_cache

import cv2
import numpy as np

from gfx import *  # noqa

TOTAL_FRAMES = 900
URL = 'NEON-BREACH.LARSSOHL.DK'


def fr(b):
    return b * BEAT * FPS


def cf(b, b0, c0, rate=1.0):
    """clip frame for beat b when clip frame c0 is shown at beat b0"""
    return int(round(c0 + (fr(b) - fr(b0)) * rate))


def u(b, a, d):
    """normalized progress of b within [a, a+d] (beats)"""
    return min(1.0, max(0.0, (b - a) / d))


def rng_for(*k):
    return np.random.default_rng(abs(hash(k)) % (2 ** 32))


# ====================================================================== shared backgrounds
LW, LH = 480, 270           # chunky pixel layer (x4)
_STARS = np.random.default_rng(5).uniform(0, 1, (140, 3)).astype(np.float32)


def bayer_quant(x, levels):
    h, w = x.shape[:2]
    by = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w]
    if x.ndim == 3:
        by = by[..., None]
    return np.floor(x * (levels - 1) + 0.5 + by * 0.9) / (levels - 1)


def lowres_to_full(img):
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_NEAREST)


def sky_layer(b, top=BG, bottom=hexc('3b0a5c'), horizon=190, glow=PINK, glow_k=0.35):
    yy = np.arange(LH, dtype=np.float32)[:, None, None] / horizon
    t = np.clip(yy, 0, 1)
    sky = top * (1 - t) + bottom * t
    g = np.exp(-np.abs(np.arange(LH, dtype=np.float32) - horizon)[:, None, None] / 14.0) * glow_k
    sky = sky + glow * g
    sky = np.broadcast_to(sky, (LH, LW, 3)).copy()
    q = bayer_quant(np.clip(sky * 4.0, 0, 1), 7) / 4.0
    return q


def draw_stars(img, b, speed=0.0, count=140, region_h=None, color=WHITE, tw=True):
    rh = region_h or LH
    for i in range(count):
        x, y, z = _STARS[i % len(_STARS)]
        yy = (y * rh + speed * b * (6 + 18 * z)) % rh
        xx = x * LW
        tw_k = 1.0 if not tw else (0.35 + 0.65 * (math.sin(b * 3.1 + i * 1.7) > -0.2))
        c = color * (0.35 + 0.65 * z) * tw_k
        ix, iy = int(xx), int(yy)
        if 0 <= ix < LW and 0 <= iy < LH:
            img[iy, ix] = np.maximum(img[iy, ix], c)
            if z > 0.85 and tw_k > 0.9:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    jx, jy = ix + dx, iy + dy
                    if 0 <= jx < LW and 0 <= jy < LH:
                        img[jy, jx] = np.maximum(img[jy, jx], c * 0.45)


def draw_grid(img, b, horizon=190, speed=1.0, color=PINK, bright=1.0, spacing=40):
    h = LH - horizon
    phase = (b * speed) % 1.0
    for k in range(1, 26):
        z = k - phase
        if z <= 0.05:
            continue
        y = horizon + h / z
        if y >= LH:
            continue
        a = min(1.0, 0.18 + 0.95 / z) * bright
        cv2.line(img, (0, int(y)), (LW - 1, int(y)), tuple(float(c) for c in color * a), 1, cv2.LINE_8)
    cx = LW // 2
    for i in range(-16, 17):
        x_bot = cx + i * spacing
        cv2.line(img, (cx + i * 3, horizon), (x_bot, LH - 1), tuple(float(c) for c in color * 0.55 * bright), 1, cv2.LINE_8)
    cv2.line(img, (0, horizon), (LW - 1, horizon), tuple(float(c) for c in color * 1.0 * bright), 1, cv2.LINE_8)


_MTN = None


def draw_mountains(img, horizon=190, color_fill=hexc('12031f'), line=hexc('a03cff')):
    global _MTN
    if _MTN is None:
        r = np.random.default_rng(3)
        pts = []
        x = 0
        while x <= LW + 20:
            far = abs(x - LW / 2) / (LW / 2)
            pts.append((x, horizon - int(r.uniform(4, 10) + 30 * far * r.uniform(0.35, 1.0))))
            x += int(r.uniform(10, 22))
        _MTN = pts
    poly = np.array(_MTN + [(LW + 20, horizon), (0, horizon)], np.int32)
    cv2.fillPoly(img, [poly], tuple(float(c) for c in color_fill))
    cv2.polylines(img, [np.array(_MTN, np.int32)], False, tuple(float(c) for c in line), 1, cv2.LINE_8)


def draw_sun(img, cx, cy, r, b, top=YELLOW, mid=ORANGE, bot=PINK, stripes=True):
    yy, xx = np.mgrid[0:LH, 0:LW].astype(np.float32)
    inside = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    t = np.clip((yy - (cy - r)) / (2 * r), 0, 1)[..., None]
    col = np.where(t < 0.5, top * (1 - t * 2) + mid * (t * 2), mid * (1 - (t - 0.5) * 2) + bot * ((t - 0.5) * 2))
    col = bayer_quant(np.clip(col, 0, 1), 6)
    mask = inside.copy()
    if stripes:
        for k in range(9):
            y0 = cy - r * 0.42 + k * r * 0.12 + ((b * 0.5) % 1.0) * r * 0.12
            th = 1 + k * 0.5
            mask &= ~((yy >= y0) & (yy < y0 + th))
    img[mask] = col[mask]
    return inside


@lru_cache(maxsize=2)
def radial_bg(cx=960, cy=640, r=1150, inner=tuple(DEEP), outer=tuple(BG)):
    yy, xx = np.mgrid[0:LH, 0:LW].astype(np.float32)
    d = np.sqrt((xx * 4 - cx) ** 2 + (yy * 4 - cy) ** 2) / r
    t = np.clip(d, 0, 1)[..., None]
    g = np.array(inner, np.float32) * (1 - t) + np.array(outer, np.float32) * t
    return bayer_quant(np.clip(g * 3, 0, 1), 9) / 3


# ====================================================================== sprites
COIN = np.array([
    "..XXXXX..",
    ".XXwwwXX.",
    "XXw...XXX",
    "Xw..X..XX",
    "Xw.XX..XX",
    "X...X..XX",
    "XX..X.XXX",
    ".XXXXXXX.",
    "..XXXXX..",
])


def draw_pixart(dst, art, x, y, scale, colors, scale_x=1.0, alpha=1.0):
    """art: list of strings; colors: dict char->rgb; anchor = centre"""
    h, w = len(art), len(art[0])
    sw = max(1, int(round(w * scale * scale_x)))
    for ch, c in colors.items():
        m = np.array([[1.0 if row[i] == ch else 0.0 for i in range(w)] for row in art], np.float32)
        if m.sum() == 0:
            continue
        mm = cv2.resize(m, (sw, int(h * scale)), interpolation=cv2.INTER_NEAREST)
        blit(dst, c, mm * alpha, x - sw / 2, y - h * scale / 2)


def coin_sprite(dst, x, y, scale, spin_phase, alpha=1.0):
    sx = abs(math.cos(spin_phase))
    sx = max(0.12, round(sx * 4) / 4)
    draw_pixart(dst, COIN, x, y, scale, {'X': CYAN, 'w': WHITE}, scale_x=sx, alpha=alpha)


KEYCAP = [
    "..XXXXXXXXXXXXXXXXXXXXXX..",
    ".XooooooooooooooooooooooX.",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XooooooooooooooooooooooooX",
    "XssssssssssssssssssssssssX",
    "XssssssssssssssssssssssssX",
    ".XssssssssssssssssssssssX.",
    "..XXXXXXXXXXXXXXXXXXXXXX..",
]


# ====================================================================== text styles
def word_slam(img, word, b_local, x, y, scale, color, stagger=0.07, dur=0.16, shadow=True, anchor='l'):
    """letters pop in one after another (scale 1.9 -> 1), x/y = top-left (anchor l) or centre (c)."""
    masks = [text_mask(ch, scale) for ch in word]
    cell = 8 * scale
    total = cell * len(word) - scale
    x0 = x if anchor == 'l' else x - total / 2
    for i, (ch, m) in enumerate(zip(word, masks)):
        if ch == ' ':
            continue
        p = u(b_local, i * stagger, dur)
        if p <= 0:
            continue
        k = 1 + 0.9 * (1 - ease_out(p, 2))
        mh, mw = m.shape
        if k != 1:
            m2 = cv2.resize(m, (max(1, int(mw * k)), max(1, int(mh * k))), interpolation=cv2.INTER_NEAREST)
        else:
            m2 = m
        cx = x0 + i * cell + mw / 2
        cy = y + mh / 2
        a = min(1.0, p * 2.5)
        c = WHITE if p < 0.45 else color
        if shadow:
            blit(img, BLACK, m2 * a * 0.85, cx - m2.shape[1] / 2 + scale, cy - m2.shape[0] / 2 + scale)
        blit(img, c, m2 * a, cx - m2.shape[1] / 2, cy - m2.shape[0] / 2)
    return x0, total


def type_text(img, s, b_local, x, y, scale, color, cps_beats=0.035, font='ps', cursor=False, anchor='lt', **kw):
    n = int(max(0, b_local) / cps_beats) if cps_beats > 0 else len(s)
    vis = s[:min(len(s), n)]
    if vis:
        draw_text(img, vis, x, y, scale, color, font=font, anchor=anchor, **kw)
    if cursor and n <= len(s) + 6:
        cw = 8 * scale if font == 'ps' else 8 * scale
        if int(b_local * 8) % 2 == 0:
            rect(img, x + len(vis) * cw, y, cw - scale, 7 * scale, color)
    return n >= len(s)


# ====================================================================== global layers
IMPACTS = [(3, 0.5), (7.5, 0.9), (8, 0.7), (9, 0.7), (10, 0.7), (11, 0.8), (12, 0.45), (12.5, 0.45), (13, 0.5),
           (13.5, 0.5), (14, 0.55), (14.5, 0.6), (16, 1.5), (18, 0.2), (18.25, 0.2), (18.5, 0.2), (18.75, 0.2),
           (19, 0.6), (22, 0.6), (24, 0.55), (26, 0.6), (28, 0.35), (28.5, 0.25), (29, 0.25), (29.5, 0.5), (30, 0.5),
           (32, 0.9), (34, 0.7), (36, 0.7), (38, 0.7), (40, 0.7), (42, 0.7), (47, 0.45), (48, 1.4), (50, 1.7),
           (52, 1.5), (60, 0.9)]


def impact_env(b):
    ca = zoom = shake = 0.0
    for bi, s in IMPACTS:
        d = b - bi
        if 0 <= d < 1.5:
            ca += s * 7 * math.exp(-d / 0.16)
            zoom += s * 0.022 * math.exp(-d / 0.10)
            shake += s * 9 * math.exp(-d / 0.13)
    return ca, zoom, shake


SCORE_KEYS = [(16, 0), (18, 8350), (22, 41200), (24, 66800), (26, 98150), (28, 187400), (32, 236900), (34, 251300),
              (44, 794650), (48, 861200), (50, 902450), (50.6, 1286450), (64, 1286450)]


def score_at(b):
    for (b0, s0), (b1, s1) in zip(SCORE_KEYS, SCORE_KEYS[1:]):
        if b0 <= b < b1:
            k = (b - b0) / (b1 - b0)
            v = s0 + (s1 - s0) * k
            return int(v // 50 * 50)
    return SCORE_KEYS[-1][1]


def draw_hud(img, b):
    sc = score_at(b)
    hi = max(1000000, sc)
    rect(img, 0, 0, W, 64, BLACK, 0.45)
    draw_text(img, '1UP', 48, 22, 3, PINK)
    draw_text(img, f'{sc:07d}', 140, 22, 3, WHITE)
    newhi = sc > 1000000
    if not newhi or int(b * 4) % 2 == 0:
        draw_text(img, 'HI', 790, 22, 3, AMBER if not newhi else PINK)
        draw_text(img, f'{hi:07d}', 850, 22, 3, AMBER if not newhi else PINK)
    draw_text(img, 'CREDIT 01', W - 48, 22, 3, LAV, anchor='rt')


# ====================================================================== S01 power-on + insert coin
@lru_cache(maxsize=1)
def coin_bg():
    return radial_bg()


def insert_coin_scene(b, credited, flash_btn=0.0):
    t = b * BEAT
    low = coin_bg().copy()
    draw_stars(low, b, speed=0.6, count=110)
    draw_grid(low, b * 0.5, horizon=200, speed=1.0, color=PINK, bright=0.45)
    img = lowres_to_full(low)
    # button
    bx, by, bw, bh = 960 - 370, 500, 740, 136
    pulse = 1.0 if int(t / 0.525) % 2 == 0 else 0.55
    rect(img, bx - 18, by - 18, bw + 36, bh + 36, AMBER, 0.06 * pulse, mode='add')
    rect(img, bx, by, bw, bh, hexc('140428'))
    if flash_btn > 0:
        rect(img, bx, by, bw, bh, AMBER, flash_btn)
    frame_rect(img, bx, by, bw, bh, 8, AMBER * (0.75 + 0.25 * pulse))
    tc = AMBER if flash_btn < 0.5 else BG
    draw_text(img, 'INSERT COIN', bx + 176, by + bh / 2, 6, tc, anchor='lm')
    coin_sprite(img, bx + 100, by + bh / 2, 7, t * math.pi / 0.8)
    # captions
    if int(t / 0.7) % 2 == 0:
        draw_text(img, 'BRAVE PILOTS WANTED', 960, 712, 3, LAV, anchor='ct')
    cr = 'CREDIT 01' if credited else 'CREDIT 00'
    if not credited or int(b * 6) % 2 == 0 or b > 3.4:
        draw_text(img, cr, W - 48, 22, 3, LAV if not credited else WHITE, anchor='rt')
    return img


def s01_power_on(b):
    t = b * BEAT
    fx = dict(noise=0.02, hud=False)
    if t < 0.20:
        return blank(BLACK), fx
    credited = b >= 3.0
    flash_btn = max(0.0, 1 - (b - 3.0) / 0.25) if b >= 3.0 else 0.0
    img = insert_coin_scene(b, credited, flash_btn)
    # falling coin B2 -> B3
    if 2.0 <= b < 3.0:
        p = (b - 2.0) / 1.0
        y = -80 + (568 - -80) * p * p
        coin_sprite(img, 960 - 370 + 100, y, 10 - 3 * p, t * math.pi / 0.18)
    if 3.0 <= b < 3.5:      # sparkle burst
        d = (b - 3.0) * BEAT
        for k in range(10):
            a = k / 10 * math.tau
            r = 40 + 420 * d
            sx, sy = 960 - 370 + 100 + math.cos(a) * r, 568 + math.sin(a) * r * 0.6
            s = 12 if k % 2 else 8
            rect(img, sx - s / 2, sy - s / 2, s, s, WHITE if k % 3 else CYAN, max(0, 1 - d / 0.25))
    # CRT power-on: dot -> line -> open
    if t < 0.47:
        out = blank(BLACK)
        p1 = ease_out(u(t, 0.20, 0.07), 2)
        p2 = ease_out(u(t, 0.27, 0.20), 3)
        lw = int(W * p1)
        hh = max(4, int(H * p2))
        y0 = H // 2 - hh // 2
        if p2 > 0:
            out[y0:y0 + hh] = img[y0:y0 + hh] * (1 - (1 - p2) * 0.2) + (1 - p2) * 1.4
        else:
            rect(out, W / 2 - lw / 2, H / 2 - 3, lw, 6, WHITE * 1.6)
        fx['flash'] = 0.0
        return np.clip(out, 0, 2), fx
    if 0.52 < t < 0.56 or 0.62 < t < 0.64:
        img = img * 0.7
    if b >= 3.36:   # glitch-out into the boot screen
        img = glitch_slices(img, b, strength=(b - 3.36) * 6)
    return img, fx


def glitch_slices(img, b, strength=1.0, seed=0):
    r = rng_for('gl', int(b * 64), seed)
    out = img.copy()
    n = int(4 + 10 * min(1.0, strength))
    for _ in range(n):
        y0 = int(r.uniform(0, H - 10))
        hh = int(r.uniform(6, 60 * min(1.5, strength + 0.2)))
        dx = int(r.normal(0, 60 * strength))
        sl = img[y0:y0 + hh]
        out[y0:y0 + hh] = np.roll(sl, dx, axis=1)
        if r.random() < 0.35:
            ch = r.integers(0, 3)
            out[y0:y0 + hh, :, ch] = np.roll(sl[:, :, ch], dx // 2 + 8, axis=1)
    return out


# ====================================================================== S02 boot terminal
BOOT = [
    (3.6, 'NEON BREACH OS V2.0', None, CYAN),
    (4.0, '> SECTORS .............', '5 FOUND', LAV),
    (4.5, '> BOSSES ..............', '5 ONLINE', LAV),
    (5.0, '> UPGRADES ............', '8 READY', LAV),
    (5.5, '> OVERDRIVE ...........', 'CHARGED', LAV),
    (6.0, '> PILOT ...............', 'YOU', LAV),
]


def s02_boot(b):
    fx = dict(noise=0.02, hud=False)
    img = blank(BG)
    low = np.zeros((LH, LW, 3), np.float32)
    draw_grid(low, b * 0.5, horizon=200, speed=1.0, color=CYAN, bright=0.18)
    img = np.maximum(img, lowres_to_full(low))
    X, Y, LS = 452, 214, 72
    for i, (b0, label, val, col) in enumerate(BOOT):
        if b < b0:
            continue
        done = type_text(img, label, b - b0, X, Y + i * LS, 4, col, cps_beats=0.012, cursor=(i == len(BOOT) - 1 and b < 6.5))
        if val and done:
            vb = b - b0 - len(label) * 0.012
            vc = PINK if val == 'YOU' else AMBER
            if val != 'YOU' or int(b * 4) % 2 == 0 or b < 6.3:
                type_text(img, val, vb, X + (len(label) + 1) * 32, Y + i * LS, 4, vc, cps_beats=0.02)
    # loading bar
    if b >= 6.5:
        y = Y + len(BOOT) * LS + 14
        draw_text(img, '> LOADING', X, y, 4, LAV)
        p = step(u(b, 6.5, 0.8), 16)
        frame_rect(img, X + 330, y - 10, 520, 52, 5, CYAN)
        rect(img, X + 340, y, 500 * p, 32, CYAN)
        draw_text(img, f'{int(p * 100):3d}%', X + 880, y, 4, AMBER)
    fx['ca'] = 0.8
    if b >= 7.5:
        on = int((b - 7.5) * 8) % 2 == 0
        rect(img, 0, 0, W, H, RED, 0.18 if on else 0.05)
        rect(img, 0, 790, W, 150, BLACK, 0.85)
        draw_text(img, '!! BREACH DETECTED !!', 960, 865, 6, PINK if on else WHITE, anchor='cm', shadow=(BLACK, 1))
        img = glitch_slices(img, b, strength=0.5 + (b - 7.5) * 1.6, seed=2)
        fx['ca'] = 3 + (b - 7.5) * 10
    elif b < 3.75:
        img = glitch_slices(img, b, strength=(3.75 - b) * 4, seed=1)
    return img, fx


# ====================================================================== S03 title build + S04 shatter
TITLE_S = 22
NEON_Y, BREACH_Y = 238, 238 + 7 * TITLE_S + 46
NEON_X = 960 - (4 * 8 * TITLE_S - TITLE_S) / 2
BREACH_X = 960 - (6 * 8 * TITLE_S - TITLE_S) / 2
FLASH_CLIPS_A = [('city', 60), ('belt', 150), ('storm', 50), ('tunnel', 125)]
FLASH_CLIPS_B = [('mother', 150), ('boss_gate', 170), ('boss_crusher', 120), ('boss_solar', 75), ('boss_fire', 100),
                 ('boss_mother', 105), ('od_climax2', 60), ('combo', 120)]


def letter_positions():
    out = []
    for i, ch in enumerate('NEON'):
        out.append((ch, NEON_X + i * 8 * TITLE_S, NEON_Y, CYAN, 8 + i, 'drop'))
    for i, ch in enumerate('BREACH'):
        out.append((ch, BREACH_X + i * 8 * TITLE_S, BREACH_Y, PINK, 12 + 0.5 * i, 'slam'))
    return out


LETTERS = letter_positions()


def demake_flash(name, frame_i, block=14, cy_frac=0.42):
    cw = 800
    cy = 1422 * cy_frac
    v = fullframe(name, frame_i, 400, cy, cw)
    return demake(v, block)


def title_bg(b):
    low = sky_layer(b, top=BG, bottom=hexc('2a0845'), horizon=200, glow=PINK, glow_k=0.25)
    draw_stars(low, b, speed=1.5, count=120)
    draw_grid(low, b, horizon=200, speed=2.0, color=PINK, bright=0.75)
    return lowres_to_full(low)


def s03_title(b):
    fx = dict(noise=0.02, hud=False)
    img = title_bg(b)
    # 8-bit gameplay flashes behind the title
    if b < 12:
        k = int(b - 8)
        d = b - (8 + k)
        name, f0 = FLASH_CLIPS_A[k]
        a = 0.85 * math.exp(-d / 0.4)
    elif b < 15.5:
        k = int((b - 12) * 2)
        d = (b - 12) * 2 - k
        name, f0 = FLASH_CLIPS_B[k % len(FLASH_CLIPS_B)]
        a = 0.75 * math.exp(-d / 0.45)
    else:
        k = int((b - 15.5) * 4)
        d = 0
        name, f0 = FLASH_CLIPS_B[(k * 3 + 1) % len(FLASH_CLIPS_B)]
        a = 0.35 if b < 15.75 else 0.0
    if a > 0.02:
        fl = demake_flash(name, f0 + int(d * 8), block=16 if b < 15 else 24)
        img = img * (1 - a) + fl * a
    charge = u(b, 15.0, 1.0)
    jit = rng_for('jit', int(b * 32))
    for ch, x, y, col, bi, kind in LETTERS:
        m = text_mask(ch, TITLE_S)
        mh, mw = m.shape
        if kind == 'drop':
            if b < bi - 0.32:
                continue
            if b < bi:
                p = (b - (bi - 0.32)) / 0.32
                yy = y - 900 * (1 - p * p)
                sy, sx = 1.18, 0.88
            else:
                d = (b - bi) * BEAT
                s = 0.32 * math.exp(-d / 0.07) * math.cos(d / 0.11 * math.pi)
                yy, sy, sx = y, 1 - s, 1 + s * 0.7
            c = WHITE if 0 <= b - bi < 0.12 else col
        else:
            if b < bi:
                continue
            p = ease_out(u(b, bi, 0.16), 2)
            k2 = 1 + 1.6 * (1 - p)
            sx = sy = k2
            yy = y
            c = WHITE if b - bi < 0.12 else col
        if charge > 0:
            c = c * (1 - charge * 0.7) + WHITE * charge * 0.7
            jx, jy = jit.normal(0, 1 + 9 * charge, 2)
        else:
            jx = jy = 0
        nw, nh = max(1, int(mw * sx)), max(1, int(mh * sy))
        m2 = cv2.resize(m, (nw, nh), interpolation=cv2.INTER_NEAREST)
        if kind == 'drop':
            px, py = x + mw / 2 - nw / 2, yy + mh - nh            # squash anchored to the floor
        else:
            px, py = x + mw / 2 - nw / 2, yy + mh / 2 - nh / 2
        blit(img, BLACK, m2 * 0.8, px + jx + TITLE_S * 0.6, py + jy + TITLE_S * 0.6)
        blit(img, c, m2, px + jx, py + jy)
        # landing dust
        if kind == 'drop' and 0 <= b - bi < 0.9:
            d = (b - bi) * BEAT
            r = rng_for('dust', ch, bi)
            for _ in range(10):
                vx = r.uniform(-520, 520)
                vy = r.uniform(-380, -120)
                dx, dy = vx * d, vy * d + 900 * d * d
                s = int(r.choice([8, 12, 16]))
                rect(img, x + mw / 2 + dx - s / 2, y + mh + dy - s / 2, s, s, col, max(0, 1 - d / 0.4))
    if b >= 15.75:          # music gap: everything but the white-hot title drops out
        img = img * 0.25
    if charge > 0:
        img = glitch_slices(img, b, strength=charge * 0.8, seed=3)
        fx['ca'] = 2 + charge * 14
    return img, fx


@lru_cache(maxsize=1)
def title_tiles():
    """every 'big pixel' of the title as a tile: (x, y, colour)"""
    tiles = []
    for ch, x, y, col, bi, kind in LETTERS:
        m = text_mask(ch, 1)
        for yy in range(m.shape[0]):
            for xx in range(m.shape[1]):
                if m[yy, xx] > 0.5:
                    tiles.append((x + xx * TITLE_S + TITLE_S / 2, y + yy * TITLE_S + TITLE_S / 2, col))
    return tiles


def draw_shatter(img, d):
    """d = seconds since the breach"""
    r = np.random.default_rng(16)
    layer = np.zeros_like(img)
    for (x, y, col) in title_tiles():
        vx0, vy0 = x - 960, y - 430
        n = math.hypot(vx0, vy0) + 1e-3
        sp = r.uniform(900, 2600)
        vx, vy = vx0 / n * sp + r.normal(0, 260), vy0 / n * sp + r.normal(0, 260) - 200
        rot = r.uniform(-9, 9) * d
        grow = 1 + d * r.uniform(1.5, 5.0)
        px, py = x + vx * d, y + vy * d + 700 * d * d
        a = max(0.0, 1 - d / r.uniform(0.35, 0.7))
        if a <= 0:
            continue
        s = TITLE_S * grow / 2
        c, sn = math.cos(rot), math.sin(rot)
        pts = np.array([[px + (-s * c + s * sn), py + (-s * sn - s * c)], [px + (s * c + s * sn), py + (s * sn - s * c)],
                        [px + (s * c - s * sn), py + (s * sn + s * c)], [px + (-s * c - s * sn), py + (-s * sn + s * c)]], np.int32)
        hot = max(0.0, 1 - d / 0.18)
        cc = (col * (1 - hot) + WHITE * hot) * a
        cv2.fillConvexPoly(layer, pts, tuple(float(v) for v in cc))
    img[:] = 1 - (1 - np.clip(img, 0, 1)) * (1 - np.clip(layer, 0, 1))


def s04_reveal(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 16
    i = cf(b, 16, 38)
    cy = lerp(640, 300, ease_inout(u(lb, 0.1, 1.8)))
    zoom = 1.0 + 0.06 * u(lb, 0, 2)
    img = fullframe('city_reveal', i, 400, cy, 800, zoom=zoom)
    d = lb * BEAT
    draw_shatter(img, d)
    fx['flash'] = max(0.0, 1 - lb / 0.22) ** 2
    return img, fx


# ====================================================================== S05 strips + S06 zoom
STRIPS = [('city', 22, 'NEON CITY', PINK), ('belt', 118, 'ASTEROID BELT', ORANGE), ('storm', 30, 'SOLAR STORM', AMBER),
          ('tunnel', 96, 'CYBER TUNNEL', GREEN), ('mother', 88, 'MOTHERSHIP', VIOLET)]
SW_ = W // 5
PS = H / 1422.0          # portrait scale (game -> screen) for strips


def draw_game_mapped(img, name, i, s, ox, oy, wx, wy, ww, wh):
    """game->screen: X = gx*s + ox. Paint window (wx,wy,ww,wh) of the screen."""
    wx0, wy0 = max(0, int(wx)), max(0, int(wy))
    wx1, wy1 = min(W, int(wx + ww)), min(H, int(wy + wh))
    if wx1 <= wx0 or wy1 <= wy0:
        return
    gx0, gy0 = (wx0 - ox) / s, (wy0 - oy) / s
    gw, gh = (wx1 - wx0) / s, (wy1 - wy0) / s
    v = game_view(name, i, gx0, gy0, gw, gh, wx1 - wx0, wy1 - wy0)
    img[wy0:wy1, wx0:wx1] = v


def s05_strips(b):
    fx = dict(noise=0.016, hud=True)
    img = title_bg(b) * 0.55
    for k, (name, f0, label, col) in enumerate(STRIPS):
        bi = 18 + k * 0.25
        if b < bi:
            continue
        p = ease_out(u(b, bi, 0.3), 3)
        slide = (1 - p) * H * (1 if k % 2 == 0 else -1)
        i = cf(b, 18, f0)
        ox = k * SW_ + SW_ / 2 - 400 * PS
        draw_game_mapped(img, name, i, PS, ox, slide, k * SW_, slide, SW_, H)
        if b - bi < 0.12:
            rect(img, k * SW_, 0, SW_, H, WHITE, 0.6)
        # label
        lp = u(b, bi + 0.5, 0.2)
        if lp > 0:
            rect(img, k * SW_, H - 150, SW_, 150, BLACK, 0.55 * lp)
            draw_text(img, f'0{k + 1}', k * SW_ + 28, H - 128, 4, col, alpha=lp)
            type_text(img, label, b - bi - 0.5, k * SW_ + 28, H - 74, 2, WHITE, cps_beats=0.03)
        rect(img, k * SW_, 0, 3, H, col, 0.9)
        rect(img, (k + 1) * SW_ - 3, 0, 3, H, col, 0.9)
    if 19 <= b < 21.5:
        p = ease_out(u(b, 19, 0.18), 3)
        q = 1 - ease_in(u(b, 21.1, 0.35), 2)
        hh = 190 * p * q
        rect(img, 0, 450 - hh / 2, W, hh, BLACK, 0.88)
        rect(img, 0, 450 - hh / 2, W, 4, CYAN, 0.9 * q)
        rect(img, 0, 450 + hh / 2 - 4, W, 4, CYAN, 0.9 * q)
        if hh > 120:
            word_slam(img, '5 SECTORS', b - 19, 960, 450 - 7 * 14 / 2, 14, WHITE, stagger=0.045, anchor='c')
    if b >= 21.75:      # zoom into the storm strip (handled by S06 renderer)
        return s06_storm(b)
    return img, fx


STORM_CROP = (420, 905, 800)      # cx, cy, cw (logical)


def s06_storm(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 21.75
    p = ease_inout(u(lb, 0, 0.25))
    i = cf(b, 18, STRIPS[2][1])
    # mapping interpolation (scale + offset), window grows from the strip to full screen
    s0, ox0, oy0 = PS, 2 * SW_ + SW_ / 2 - 400 * PS, 0.0
    cx, cy, cw = STORM_CROP
    s1 = W / cw
    ox1, oy1 = W / 2 - cx * s1, H / 2 - cy * s1
    s = s0 * (s1 / s0) ** p
    fxp = (W / 2 - ox0) / s0 * (1 - p) + cx * p
    fyp = (H / 2 - oy0) / s0 * (1 - p) + cy * p
    ox, oy = W / 2 - fxp * s, H / 2 - fyp * s
    wx0, wx1 = lerp(2 * SW_, 0, p), lerp(3 * SW_, W, p)
    if p < 1:
        img, _ = s05_strips_static(b)
        img = img * (1 - p)
    else:
        img = blank(BLACK)
    draw_game_mapped(img, 'storm', i, s, ox, oy, wx0, 0, wx1 - wx0, H)
    if b >= 22:
        word_caption(img, 'DODGE.', 'SOLAR FLARES WAIT FOR NO ONE', b - 22, AMBER)
    return img, fx


def s05_strips_static(b):
    img = blank(BLACK)
    for k, (name, f0, label, col) in enumerate(STRIPS):
        i = cf(b, 18, f0)
        ox = k * SW_ + SW_ / 2 - 400 * PS
        draw_game_mapped(img, name, i, PS, ox, 0, k * SW_, 0, SW_, H)
    return img, {}


def word_caption(img, word, sub, lb, color, y=760):
    rect(img, 0, y - 40, W, 300, BLACK, 0.0)
    x0, tw = word_slam(img, word, lb, 110, y, 13, color, stagger=0.05)
    bp = ease_out(u(lb, 0.05, 0.25), 3)
    rect(img, 110, y + 7 * 13 + 18, (tw + 40) * bp, 10, color)
    if sub:
        sp = u(lb, 0.3, 0.2)
        if sp > 0:
            draw_text(img, sub, 112, y + 7 * 13 + 52, 3, WHITE, font='ps', alpha=sp, shadow=(BLACK, 1))


# ====================================================================== S07 graze, S08 combo
GRAZE_FRAMES = [76, 86, 87, 96, 97, 107]


def s07_graze(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 24
    i = cf(b, 24, 72)
    zoom = 1 + 0.08 * u(lb, 0, 2)
    img = fullframe('graze2', i, 418, 850, 560, zoom=zoom)
    # graze sparks accent
    meta = clip('graze2').meta['frames'][min(i, clip('graze2').n - 1)]
    sx = (meta['px'] - (418 - 560 / zoom / 2)) * (W / (560 / zoom))
    sy = (meta['py'] - (850 - 560 / zoom * 9 / 32)) * (W / (560 / zoom))
    for gf in GRAZE_FRAMES:
        d = i - gf
        if 0 <= d < 8:
            a = 1 - d / 8
            for k in range(8):
                ang = k / 8 * math.tau + gf
                r = 30 + d * 22
                rect(img, sx - 70 + math.cos(ang) * r - 5, sy - 10 + math.sin(ang) * r - 5, 10, 10, WHITE, a)
            draw_text(img, '+25', sx - 150, sy - 120 - d * 6, 3, WHITE, alpha=a, shadow=(BLACK, 1))
    # slow-mo letterbox
    lbh = 70 * ease_out(u(lb, 0, 0.3))
    rect(img, 0, 0, W, lbh, BLACK)
    rect(img, 0, H - lbh, W, lbh, BLACK)
    draw_text(img, 'x0.3', W - 60, H - lbh / 2, 3, LAV, anchor='rm', alpha=min(1, lbh / 70))
    word_caption(img, 'GRAZE.', 'FLY CLOSE. SCORE BIG.', lb, WHITE, y=700)
    fx['desat'] = 0.25
    return img, fx


def s08_combo(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 26
    i = cf(b, 26, 100)
    img = fullframe('combo', i, 400, 380, 800, zoom=1.0 + 0.05 * u(lb, 0, 2))
    word_caption(img, 'COMBO', None, lb, AMBER, y=760)
    # multiplier ticks up on 16ths
    steps_ = ['x2', 'x4', 'x6', 'x8']
    k = min(3, int(max(0, lb - 0.25) * 4))
    if lb >= 0.25:
        pop = 1 + 0.5 * math.exp(-((lb - 0.25) * 4 - k) / 0.3)
        sc = int(13 * pop)
        draw_text(img, steps_[k], 110 + 6 * 8 * 13 + 30, 760 + 7 * 13, sc, PINK, anchor='lb', shadow=(BLACK, 1))
    return img, fx


# ====================================================================== S09 upgrade cards, S10 result
CARDS = [('RAPID FIRE', '+18% FIRE RATE', CYAN, 'rapid'), ('WINGMAN', 'DRONE BUDDY JOINS YOU', GREEN, 'wing'),
         ('OVERDRIVE+', 'OVERDRIVE LASTS 8S', PINK, 'od')]
ICONS = {
    'rapid': ["..X...X...X..", ".XXX.XXX.XXX.", ".XXX.XXX.XXX.", ".XXX.XXX.XXX.", "..X...X...X..", "..X...X...X..",
              ".............", "..X...X...X..", ".XXX.XXX.XXX.", "..X...X...X.."],
    'wing': [".....XXX.....", ".....XXX.....", "....XXXXX....", ".X..XXXXX..X.", "XXX.XXXXX.XXX", "XXX.XXXXX.XXX",
             ".X..XX.XX..X.", "....X...X...."],
    'od': ["......XXXX...", ".....XXXX....", "....XXXX.....", "...XXXXXXXX..", "......XXXX...", ".....XXXX....",
           "....XXX......", "...XX........", "..X.........."],
}


@lru_cache(maxsize=2)
def blurred_bg(name, i):
    v = fullframe(name, i, 400, 420, 800)
    small = cv2.resize(v, (W // 8, H // 8), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 3)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR) * 0.45


def s09_cards(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 28
    img = blurred_bg('combo', 128).copy()
    draw_text(img, 'SYSTEM UPGRADE', 960, 170, 7, CYAN, anchor='ct', shadow=(BLACK, 1))
    if int(b * 2.5) % 2 == 0:
        draw_text(img, 'CHOOSE ONE', 960, 250, 3, LAV, anchor='ct')
    cw_, ch_ = 470, 500
    for k, (name, desc, col, ic) in enumerate(CARDS):
        bi = k * 0.5
        if lb < bi:
            continue
        p = step(u(lb, bi, 0.18), 4)
        cx = 960 + (k - 1) * 540
        w_ = cw_ * max(0.05, p)
        x0, y0 = cx - w_ / 2, 330
        sel = lb >= 1.5 and k == 1
        dim = lb >= 1.5 and k != 1
        grow = 1.0 + (0.06 * ease_out(u(lb, 1.5, 0.15)) if sel else 0)
        w2, h2 = w_ * grow, ch_ * grow
        x0, y0 = cx - w2 / 2, 330 - (h2 - ch_) / 2
        rect(img, x0, y0, w2, h2, col if sel else hexc('0a021e'), 0.95)
        frame_rect(img, x0, y0, w2, h2, 6, col if not dim else col * 0.35)
        if p >= 1:
            tc = BG if sel else (col if not dim else col * 0.35)
            dc = BG if sel else (LAV if not dim else LAV * 0.35)
            draw_text(img, str(k + 1), x0 + 26, y0 + 24, 3, tc)
            draw_pixart(img, ICONS[ic], cx, y0 + 150, 11, {'X': tc})
            draw_text(img, name, cx, y0 + 290, 4, tc, anchor='ct')
            draw_text(img, desc, cx, y0 + 380, 2, dc, font='vt', size=20, anchor='ct')
        if lb - bi < 0.1 or (sel and lb - 1.5 < 0.1):
            rect(img, x0, y0, w2, h2, WHITE, 0.7)
    return img, fx


def s10_result(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 30
    i = cf(b, 30, 4)
    img = fullframe('upgrade_pick', i, 400, 880, 700, zoom=1.0 + 0.04 * u(lb, 0, 2))
    if lb >= 1.5:   # red alert pre-lap
        on = int((lb - 1.5) * 8) % 2 == 0
        rect(img, 0, 0, W, H, RED, 0.22 if on else 0.08)
    return img, fx


# ====================================================================== S11 warning
BOSS_ICONS = [('boss_gate', 150, 'GATEKEEPER'), ('boss_crusher', 118, 'THE CRUSHER'), ('boss_solar', 64, 'SOLAR CORE'),
              ('boss_fire', 60, 'FIREWALL'), ('boss_mother', 100, 'THE MOTHERSHIP')]


@lru_cache(maxsize=8)
def boss_icon(name, i, box_w=300, box_h=150):
    st = clip(name).meta['frames'][i]['boss']
    bx, by = st['x'], st['y']
    kind = st['kind']
    span = {'firewall': (720, 110), 'mothership': (600, 230)}.get(kind, (260, 230))
    v = game_view(name, i, bx - span[0] / 2, by - span[1] / 2 + (8 if kind != 'firewall' else 0), span[0], span[1],
                  int(span[0] * 2), int(span[1] * 2))
    s = min(box_w / v.shape[1], box_h / v.shape[0])
    v = cv2.resize(v, (max(1, int(v.shape[1] * s)), max(1, int(v.shape[0] * s))), interpolation=cv2.INTER_AREA)
    return v


def s11_warning(b):
    fx = dict(noise=0.02, hud=True)
    lb = b - 32
    img = blank(hexc('12020a'))
    low = np.zeros((LH, LW, 3), np.float32)
    draw_grid(low, b, horizon=150, speed=2.5, color=RED, bright=0.35)
    img = np.maximum(img, lowres_to_full(low))
    off = int(lb * BEAT * 420)
    hazard_band(img, 120, 70, off, PINK, BLACK, period=72)
    hazard_band(img, 900, 70, -off, PINK, BLACK, period=72)
    on = int(lb * 4) % 2 == 0
    if on:
        draw_text(img, 'WARNING', 960, 400, 20, RED, anchor='cm', shadow=(BLACK, 1))
    else:
        draw_text(img, 'WARNING', 960, 400, 20, PINK * 0.55, anchor='cm')
    draw_text(img, '5 BOSSES APPROACHING', 960, 565, 4, AMBER, anchor='ct', shadow=(BLACK, 1))
    for k, (name, i, label) in enumerate(BOSS_ICONS):
        bi = 0.5 + k * 0.25
        if lb < bi:
            continue
        ic = boss_icon(name, i)
        cx = 960 + (k - 2) * 340
        a = 1.0 if lb - bi > 0.12 else 0.4
        x0, y0 = int(cx - ic.shape[1] / 2), int(720 - ic.shape[0] / 2)
        reg = img[y0:y0 + ic.shape[0], x0:x0 + ic.shape[1]]
        img[y0:y0 + ic.shape[0], x0:x0 + ic.shape[1]] = np.maximum(reg, ic * a * 1.15)
        draw_text(img, f'0{k + 1}', cx, 820, 2, LAV, anchor='ct')
    fx['ca'] = 2.0
    return img, fx


# ====================================================================== S12-16 boss rush
BOSSES = [
    (34, 'boss_gate', 150, 'GATEKEEPER', 'SECTOR 1 - NEON CITY', PINK, (400, 268, 800)),
    (36, 'boss_crusher', 116, 'THE CRUSHER', 'SECTOR 2 - ASTEROID BELT', ORANGE, (400, 268, 800)),
    (38, 'boss_solar', 96, 'SOLAR CORE', 'SECTOR 3 - SOLAR STORM', AMBER, (400, 300, 800)),
    (40, 'boss_fire', 60, 'FIREWALL', 'SECTOR 4 - CYBER TUNNEL', GREEN, (400, 268, 800)),
    (42, 'boss_mother', 100, 'THE MOTHERSHIP', 'SECTOR 5 - MOTHERSHIP', VIOLET, (400, 268, 800)),
]


def boss_card(img, lb, k, name, sector, col):
    p = ease_out(u(lb, 0, 0.22), 3)
    x_end = 1180
    xr = -x_end + (x_end + 0) * p
    y0, hh = 780, 190
    poly = np.array([[xr, y0], [xr + x_end, y0], [xr + x_end - 70, y0 + hh], [xr, y0 + hh]], np.int32)
    sub = img.copy()
    cv2.fillConvexPoly(sub, poly, (0.0, 0.0, 0.0))
    img[:] = img * 0.12 + sub * 0.88
    rect(img, xr, y0, x_end, 6, col)
    tx = xr + 110
    draw_text(img, f'BOSS 0{k + 1}/05', tx, y0 + 26, 3, col)
    draw_text(img, name, tx, y0 + 66, 8, WHITE, shadow=(col * 0.6, 1))
    draw_text(img, sector, tx, y0 + 140, 2, LAV)


def s_boss(b, k):
    fx = dict(noise=0.016, hud=True)
    b0, name, c0, label, sector, col, (cx, cy, cw) = BOSSES[k]
    lb = b - b0
    i = cf(b, b0, c0)
    zoom = 1.0 + 0.07 * ease_out(u(lb, 0, 2), 2)
    img = fullframe(name, i, cx, cy, cw, zoom=zoom)
    boss_card(img, lb, k, label, sector, col)
    return img, fx


# ====================================================================== S17 overdrive charge (portrait)
PW_H = 1000
PW_S = PW_H / 1422.0
PW_W = 800 * PW_S
PW_X = 960 - PW_W / 2


@lru_cache(maxsize=6)
def _side_fill(name, i):
    v = game_view(name, i, 0, 260, 800, 450, W // 8, H // 8)
    v = cv2.GaussianBlur(v, (0, 0), 2.2)
    return cv2.resize(v, (W, H), interpolation=cv2.INTER_LINEAR) * 0.32


def s17_od_charge(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 44
    i = cf(b, 48, 72)
    img = _side_fill('od_climax2', i - i % 2).copy()
    draw_game_mapped(img, 'od_climax2', i, PW_S, PW_X, 40, PW_X, 40, PW_W, PW_H)
    frame_rect(img, PW_X - 8, 32, PW_W + 16, PW_H + 16, 6, CYAN)
    # left: overdrive meter
    fill = step(u(lb, 0.0, 2.0), 20)
    lx, ly = 120, 430
    draw_text(img, 'OVERDRIVE', lx, ly - 70, 5, PINK, shadow=(BLACK, 1))
    frame_rect(img, lx, ly, 440, 64, 6, CYAN if fill < 1 else (PINK if int(lb * 8) % 2 == 0 else CYAN))
    segw = (440 - 24) / 20
    for s in range(int(fill * 20)):
        c = CYAN * (1 - s / 19) + PINK * (s / 19)
        rect(img, lx + 12 + s * segw, ly + 12, segw - 4, 40, c)
    draw_text(img, f'{int(fill * 100):3d}%', lx + 440, ly + 92, 4, WHITE, anchor='rt')
    if fill >= 1 and int(lb * 8) % 2 == 0:
        draw_text(img, 'READY!', lx, ly + 92, 4, PINK)
    # right: keycap
    rx = 1590
    pressed = lb >= 3.0
    draw_text(img, 'PRESS', rx, 330, 4, LAV, anchor='ct')
    keys_y = 470 + (14 if pressed else 0)
    art = KEYCAP if not pressed else KEYCAP[:2] + KEYCAP[2:10] + KEYCAP[12:]
    col_face = hexc('d8d4ff') if not pressed else PINK
    draw_pixart(img, art, rx, keys_y, 11, {'X': hexc('2a2440'), 'o': col_face, 's': hexc('8f8ab8')})
    draw_text(img, 'SHIFT', rx, keys_y - (8 if not pressed else 4) * 1, 5, BG, anchor='cm')
    draw_text(img, 'OR 2 FINGERS ON MOBILE', rx, 640, 2, DIM, anchor='ct')
    if pressed and lb - 3.0 < 0.2:
        rect(img, rx - 160, keys_y - 90, 320, 180, WHITE, 0.5 * (1 - (lb - 3.0) / 0.2))
    if lb >= 3.5:
        fx['flash'] = ease_in(u(lb, 3.5, 0.5), 2)
    return img, fx


# ====================================================================== S18 overdrive climax
def s18_climax(b):
    fx = dict(noise=0.016, hud=True)
    lb = b - 48
    i = cf(b, 48, 72)
    kill_i = 100
    if i <= kill_i:
        pan = ease_inout(u(lb, 1.55, 0.45))
        cy = lerp(700, 236, pan)
        cx = lerp(300, 330, pan)
        zoom = 1.0 + 0.05 * u(lb, 0, 1.5)
        img = fullframe('od_climax2', i, cx, cy, 800, zoom=zoom)
        if 1.55 < lb < 2.0:     # whip-pan smear
            k = int(40 * math.sin(math.pi * u(lb, 1.55, 0.45)))
            if k > 2:
                img = cv2.blur(img, (1, k))
        # speed lines
        speed_lines(img, b, 0.5 if lb < 1.55 else 0.0)
    else:
        zz = 1.08 + 0.05 * u(lb, 2, 2)
        img = fullframe('od_climax2', min(i, 149), 330, 236, 800, zoom=zz)
        d = (lb - 2.0) * BEAT
        explosion_fx(img, d, 317, 180, (330, 236, 800, zz))
    if lb < 0.12:
        fx['flash'] = 0.8 * (1 - lb / 0.12)
    if lb >= 2.0:
        fx['flash'] = max(fx.get('flash', 0), 0.65 * math.exp(-(lb - 2.0) / 0.09))
    if lb >= 3.4:
        fx['flash'] = max(fx.get('flash', 0), ease_in(u(lb, 3.4, 0.6), 2))
    return img, fx


def speed_lines(img, b, a):
    if a <= 0:
        return
    r = rng_for('sl', int(b * 16))
    for _ in range(26):
        x = r.uniform(0, W)
        L = r.uniform(80, 340)
        y = r.uniform(-L, H)
        rect(img, x, y, 3, L, WHITE if r.random() < 0.5 else PINK, a * r.uniform(0.15, 0.5), mode='add')


def explosion_fx(img, d, gx, gy, cam):
    cx, cy, cw, zoom = cam
    s = W / (cw / zoom)
    X = (gx - (cx - cw / zoom / 2)) * s
    Y = (gy - (cy - cw / zoom * 9 / 32)) * s
    for k, (col, sp, th) in enumerate(((WHITE, 2300, 26), (PINK, 1700, 18), (CYAN, 1200, 12), (AMBER, 800, 10))):
        r = sp * d * (1 - 0.35 * d)
        a = max(0.0, 1 - d / (0.55 + 0.12 * k))
        if r > 2 and a > 0:
            cv2.circle(img, (int(X), int(Y)), int(r), tuple(float(v) * a for v in col), int(th * a + 2), cv2.LINE_8)
    rr = np.random.default_rng(50)
    for _ in range(70):
        ang = rr.uniform(0, math.tau)
        sp = rr.uniform(300, 1700)
        px, py = X + math.cos(ang) * sp * d, Y + math.sin(ang) * sp * d + 500 * d * d
        sz = rr.choice([10, 14, 20, 28])
        a = max(0.0, 1 - d / rr.uniform(0.4, 0.9))
        col = [WHITE, PINK, CYAN, AMBER][rr.integers(0, 4)]
        rect(img, px - sz / 2, py - sz / 2, sz, sz, col, a)


# ====================================================================== S19 logo + S20 power-off
LOGO_Y = 176


@lru_cache(maxsize=1)
def logo_layers():
    """chrome 80s logo: returns (rgb, alpha) for the static logo."""
    S_ = 22
    lay = np.zeros((H, W, 3), np.float32)
    al = np.zeros((H, W), np.float32)
    rows = [('NEON', LOGO_Y, (hexc('0a3a8c'), hexc('7ff9ff'), WHITE, CYAN, hexc('064a6e'))),
            ('BREACH', LOGO_Y + 7 * S_ + 40, (hexc('5c0a5e'), hexc('ff8ae8'), WHITE, PINK, hexc('6e0650')))]
    for word, y, (ext, top, mid, low, bottom) in rows:
        m = text_mask(word, S_)
        mh, mw = m.shape
        x = int(960 - mw / 2)
        k = 9                                               # dark outline around face + extrusion
        ext_m = np.zeros((mh + 40, mw + 30), np.float32)
        for kx in range(0, 11):
            ext_m[kx * 3:kx * 3 + mh, kx * 2:kx * 2 + mw] = np.maximum(ext_m[kx * 3:kx * 3 + mh, kx * 2:kx * 2 + mw], m)
        ol = cv2.dilate(np.pad(ext_m, k), np.ones((2 * k + 1, 2 * k + 1), np.uint8))
        blit(lay, hexc('06010f'), ol, x - k, y - k)
        al[y - k:y - k + ol.shape[0], x - k:x - k + ol.shape[1]] = np.maximum(al[y - k:y - k + ol.shape[0], x - k:x - k + ol.shape[1]], ol)
        for kx in range(10, 0, -1):                        # 3D extrusion
            c = ext * (0.35 + 0.65 * (1 - kx / 10))
            blit(lay, c, m, x + kx * 2, y + kx * 3)
            al[y + kx * 3:y + kx * 3 + mh, x + kx * 2:x + kx * 2 + mw] = np.maximum(
                al[y + kx * 3:y + kx * 3 + mh, x + kx * 2:x + kx * 2 + mw], m)
        t = np.linspace(0, 1, mh, dtype=np.float32)[:, None, None]
        grad = np.where(t < 0.5, top * (1 - t * 2) + mid * (t * 2),
                        low * (1 - (t - 0.5) * 2) * 1.0 + bottom * ((t - 0.5) * 2))
        grad = np.where((t > 0.48) & (t < 0.56), WHITE, grad)            # chrome horizon line
        grad = np.broadcast_to(grad, (mh, mw, 3))
        reg = lay[y:y + mh, x:x + mw]
        lay[y:y + mh, x:x + mw] = reg * (1 - m[..., None]) + grad * m[..., None]
        al[y:y + mh, x:x + mw] = np.maximum(al[y:y + mh, x:x + mw], m)
    return lay, al


def logo_bg(b, rise):
    low = sky_layer(b, top=BG, bottom=hexc('3b0a5c'), horizon=200, glow=PINK, glow_k=0.45)
    draw_stars(low, b, speed=0.3, count=140, region_h=200)
    draw_sun(low, 240, 190 - 14 * rise, 90, b)
    draw_mountains(low, horizon=200)
    low[200:] = 0.02
    low[200:] += hexc('1a0533') * 0.6
    draw_grid(low, b, horizon=200, speed=1.6, color=PINK, bright=0.95)
    return lowres_to_full(low)


def s19_logo(b):
    fx = dict(noise=0.014, hud=False)
    lb = b - 52
    rise = ease_out(u(lb, 0, 6), 2)
    img = logo_bg(b, 0.55 + 0.45 * rise)
    lay, al = logo_layers()
    p = back_out(u(lb, 0, 0.3), 1.6)
    k = 1.6 - 0.6 * p
    if abs(k - 1) > 1e-3:
        M = cv2.getRotationMatrix2D((960, 350), 0, k)
        lay2 = cv2.warpAffine(lay, M, (W, H), flags=cv2.INTER_NEAREST)
        al2 = cv2.warpAffine(al, M, (W, H), flags=cv2.INTER_NEAREST)
    else:
        lay2, al2 = lay, al
    a = min(1.0, u(lb, 0, 0.08) * 1.5)
    img = img * (1 - al2[..., None] * a) + lay2 * a
    # shine sweep
    for sb in (1.0, 5.0):
        sp = u(lb, sb, 0.6)
        if 0 < sp < 1:
            xs = -400 + 2700 * sp
            band = np.clip(1 - np.abs((np.arange(W, dtype=np.float32)[None, :] - xs) + (np.arange(H, dtype=np.float32)[:, None] - 350) * 0.5) / 60, 0, 1)
            img += (band * al2)[..., None] * 0.85
    # shockwave ring
    d = lb * BEAT
    if d < 0.6:
        r = int(2600 * d)
        cv2.circle(img, (960, 350), max(1, r), tuple(float(v) * (1 - d / 0.6) for v in WHITE), int(30 * (1 - d / 0.6)) + 2)
    # subtitle
    if lb >= 2.0:
        type_text(img, 'A SYNTHWAVE INVASION', lb - 2.0, 960 - (20 * 32 - 4) / 2, 92, 4, AMBER, cps_beats=0.035,
                  shadow=(BLACK, 1))
    if lb >= 4.0:
        cp = step(u(lb, 4.0, 0.25), 4)
        bw_, bh_ = 560, 110
        x0, y0 = 960 - bw_ / 2, 810
        on = int((lb - 4.0) * 2) % 2 == 0
        rect(img, x0, y0, bw_ * cp, bh_, hexc('140428'), 0.92)
        frame_rect(img, x0, y0, bw_ * cp, bh_, 6, AMBER if on else AMBER * 0.6)
        if cp >= 1:
            draw_text(img, 'PLAY NOW', 960, y0 + bh_ / 2, 6, AMBER if on else WHITE, anchor='cm')
            sub = 'FREE IN YOUR BROWSER - DESKTOP & MOBILE'
            draw_text(img, sub, 960, y0 + bh_ + 24, 3, WHITE, anchor='ct', alpha=u(lb, 4.3, 0.3), shadow=(BLACK, 1))
            if URL:
                draw_text(img, URL, 960, y0 + bh_ + 80, 3, CYAN, anchor='ct', alpha=u(lb, 4.5, 0.3), shadow=(BLACK, 1))
    if lb < 0.2:
        fx['flash'] = 0.9 * (1 - lb / 0.2)
    return img, fx


def s20_power_off(b):
    fx = dict(noise=0.01, hud=False, crt=True)
    t = (b - 60) * BEAT
    t0 = 0.12
    if t < t0:
        return s19_logo(b)
    src, _ = s19_logo(60 + t0 / BEAT)
    out = blank(BLACK)
    d = t - t0
    if d < 0.13:                         # squash vertically to a line
        p = ease_in(d / 0.13, 2)
        hh = max(4, int(H * (1 - p)))
        sq = cv2.resize(src, (W, hh), interpolation=cv2.INTER_AREA) * (1 + p * 1.5)
        y0 = H // 2 - hh // 2
        out[y0:y0 + hh] = sq
    elif d < 0.26:                       # line collapses to a dot
        p = ease_in((d - 0.13) / 0.13, 2)
        lw = max(8, int(W * (1 - p)))
        rect(out, W / 2 - lw / 2, H / 2 - 3, lw, 6, WHITE * 2.0)
    elif d < 0.55:
        p = (d - 0.26) / 0.29
        s = int(16 * (1 - p)) + 2
        rect(out, W / 2 - s / 2, H / 2 - s / 2, s, s, WHITE * (1.5 * (1 - p)))
    lb = b - 61.5
    if lb >= 0:
        if int(lb * 2) % 2 == 0:
            draw_text(out, 'INSERT COIN', 960, 520, 5, AMBER, anchor='cm')
        draw_text(out, URL or 'NEON BREACH', 960, 610, 3, LAV, anchor='ct', alpha=u(lb, 0.2, 0.4))
    return out, fx


# ====================================================================== shot table
SHOTS = [
    (0.0, 3.5, s01_power_on),
    (3.5, 8.0, s02_boot),
    (8.0, 16.0, s03_title),
    (16.0, 18.0, s04_reveal),
    (18.0, 22.0, s05_strips),
    (22.0, 24.0, s06_storm),
    (24.0, 26.0, s07_graze),
    (26.0, 28.0, s08_combo),
    (28.0, 30.0, s09_cards),
    (30.0, 32.0, s10_result),
    (32.0, 34.0, s11_warning),
    (34.0, 36.0, lambda b: s_boss(b, 0)),
    (36.0, 38.0, lambda b: s_boss(b, 1)),
    (38.0, 40.0, lambda b: s_boss(b, 2)),
    (40.0, 42.0, lambda b: s_boss(b, 3)),
    (42.0, 44.0, lambda b: s_boss(b, 4)),
    (44.0, 48.0, s17_od_charge),
    (48.0, 52.0, s18_climax),
    (52.0, 60.0, s19_logo),
    (60.0, 64.1, s20_power_off),
]


def render_frame(f):
    t = f / FPS
    b = t / BEAT + 1e-6
    for b0, b1, fn in SHOTS:
        if b0 <= b < b1:
            img, fx = fn(b)
            break
    img = np.ascontiguousarray(img, dtype=np.float32)
    if fx.get('desat'):
        g = img.mean(axis=2, keepdims=True)
        img = img * (1 - fx['desat']) + g * fx['desat']
    ca, zoom, shake = impact_env(b)
    if fx.get('hud', False):
        draw_hud(img, b)
    r = rng_for('shake', f)
    img = shake_img(img, r.normal(0, 1) * shake, r.normal(0, 1) * shake, 1 + zoom)
    img = post(img, t, ca=0.9 + ca + fx.get('ca', 0), bloom_k=fx.get('bloom', 0.5), noise=fx.get('noise', 0.016) * 0.4,
               flash=min(1.0, fx.get('flash', 0.0)), crt=fx.get('crt', True), seed=f)
    return img
