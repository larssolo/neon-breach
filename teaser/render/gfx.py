"""Pixel motion-graphics toolkit for the NEON BREACH teaser (numpy + OpenCV + PIL).
Frames are float32 RGB arrays (H, W, 3) in 0..1 (sRGB values)."""
import json
import math
import os
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 30
BPM = 128
BEAT = 60.0 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.dirname(HERE)
CLIPS = os.path.join(SCR, 'clips')
FONT_PS = os.path.join(SCR, 'fonts', 'PressStart2P.ttf')
FONT_VT = os.path.join(SCR, 'fonts', 'VT323.ttf')
GW, GH = 800, 1422          # logical game field
SS = 2                      # capture supersampling


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


CYAN, PINK, AMBER, GREEN = hexc('00f6ff'), hexc('ff2bd6'), hexc('ffb000'), hexc('39ff6a')
YELLOW, WHITE, BLACK = hexc('ffe14d'), hexc('ffffff'), hexc('000000')
BG, DEEP, VIOLET, RED = hexc('06010f'), hexc('1a0533'), hexc('a03cff'), hexc('ff4d4d')
ORANGE, LAV, DIM = hexc('ff7b00'), hexc('b9b3e6'), hexc('6f68a8')


def clamp01(x):
    return np.clip(x, 0.0, 1.0)


def ease_out(x, p=3):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** p


def ease_in(x, p=3):
    x = min(1.0, max(0.0, x))
    return x ** p


def ease_inout(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def back_out(x, s=1.9):
    x = min(1.0, max(0.0, x))
    x -= 1
    return x * x * ((s + 1) * x + s) + 1


def lerp(a, b, k):
    return a + (b - a) * k


def step(x, n):
    """quantize animation progress to n steps (8-bit feel)"""
    return math.floor(min(1.0, max(0.0, x)) * n) / n


def blank(color=BG):
    f = np.empty((H, W, 3), np.float32)
    f[:] = color
    return f


# ------------------------------------------------------------------ text
@lru_cache(maxsize=4096)
def _glyphs(s, font='ps', size=None):
    if font == 'ps':
        size = size or 8
        f = ImageFont.truetype(FONT_PS, size)
        w, h = int(f.getlength(s)) + 1, size
        img = Image.new('L', (max(1, w), h), 0)
        d = ImageDraw.Draw(img)
        d.fontmode = '1'
        d.text((0, 0), s, font=f, fill=255)
        a = np.array(img, np.float32) / 255.0
        return a[:, :max(1, int(f.getlength(s)) - 1)] if len(s) else a
    size = size or 20
    f = ImageFont.truetype(FONT_VT, size)
    w = int(math.ceil(f.getlength(s))) + 2
    img = Image.new('L', (max(1, w), size + 4), 0)
    d = ImageDraw.Draw(img)
    d.fontmode = '1'
    d.text((0, -3), s, font=f, fill=255)
    a = np.array(img, np.float32) / 255.0
    ys = np.nonzero(a.sum(1))[0]
    return a[2:size - 1] if len(ys) == 0 else a[max(0, 2):max(ys.max() + 1, size - 1)]


def text_mask(s, scale=1, font='ps', size=None):
    m = _glyphs(s, font, size)
    if scale != 1:
        m = cv2.resize(m, (max(1, int(round(m.shape[1] * scale))), max(1, int(round(m.shape[0] * scale)))),
                       interpolation=cv2.INTER_NEAREST)
    return m


def blit(dst, rgb, alpha, x, y, mode='over'):
    """rgb: (h,w,3) or color vec; alpha: (h,w) mask; x,y top-left (ints)."""
    h, w = alpha.shape
    x, y = int(round(x)), int(round(y))
    x0, y0, x1, y1 = max(0, x), max(0, y), min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    a = alpha[y0 - y:y1 - y, x0 - x:x1 - x, None]
    c = rgb if np.ndim(rgb) == 1 else rgb[y0 - y:y1 - y, x0 - x:x1 - x]
    region = dst[y0:y1, x0:x1]
    if mode == 'over':
        region *= (1 - a)
        region += c * a
    elif mode == 'add':
        region += c * a
    elif mode == 'mul':
        region *= (1 - a) + c * a


def draw_text(dst, s, x, y, scale=4, color=WHITE, font='ps', size=None, anchor='lt', shadow=None,
              outline=None, alpha=1.0, spacing=0, mode='over'):
    """anchor: two letters, horizontal l/c/r + vertical t/m/b. Returns (x, y, w, h)."""
    if spacing:
        masks = [text_mask(ch, scale, font, size) for ch in s]
        hh = max(m.shape[0] for m in masks)
        ww = sum(m.shape[1] for m in masks) + int(spacing * scale) * (len(s) - 1)
        m = np.zeros((hh, ww), np.float32)
        cx = 0
        for mk in masks:
            m[:mk.shape[0], cx:cx + mk.shape[1]] = mk
            cx += mk.shape[1] + int(spacing * scale)
    else:
        m = text_mask(s, scale, font, size)
    h, w = m.shape
    ax = {'l': 0, 'c': w / 2, 'r': w}[anchor[0]]
    ay = {'t': 0, 'm': h / 2, 'b': h}[anchor[1]]
    X, Y = int(round(x - ax)), int(round(y - ay))
    if outline is not None:
        k = max(1, int(round(scale * outline[1])))
        o = cv2.dilate(np.pad(m, k), np.ones((2 * k + 1, 2 * k + 1), np.uint8))
        blit(dst, outline[0], o * alpha, X - k, Y - k)
    if shadow is not None:
        off = max(1, int(round(scale * shadow[1])))
        blit(dst, shadow[0], m * alpha * (shadow[2] if len(shadow) > 2 else 1.0), X + off, Y + off)
    blit(dst, color, m * alpha, X, Y, mode)
    return X, Y, w, h


# ------------------------------------------------------------------ shapes
def rect(dst, x, y, w, h, color, alpha=1.0, mode='over'):
    x0, y0 = int(round(x)), int(round(y))
    x1, y1 = int(round(x + w)), int(round(y + h))
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(dst.shape[1], x1), min(dst.shape[0], y1)
    if x1 <= x0 or y1 <= y0:
        return
    if mode == 'over':
        dst[y0:y1, x0:x1] = dst[y0:y1, x0:x1] * (1 - alpha) + np.asarray(color) * alpha
    else:
        dst[y0:y1, x0:x1] += np.asarray(color) * alpha


def frame_rect(dst, x, y, w, h, t, color, alpha=1.0):
    rect(dst, x, y, w, t, color, alpha); rect(dst, x, y + h - t, w, t, color, alpha)
    rect(dst, x, y, t, h, color, alpha); rect(dst, x + w - t, y, t, h, color, alpha)


def hazard_band(dst, y, h, offset, c1, c2, period=64, alpha=1.0):
    yy, xx = np.mgrid[0:h, 0:W]
    stripe = (((xx + yy + offset) // (period // 2)) % 2).astype(np.float32)
    band = c1 * stripe[..., None] + c2 * (1 - stripe[..., None])
    y0, y1 = max(0, int(y)), min(H, int(y + h))
    if y1 > y0:
        sl = band[y0 - int(y):y1 - int(y)]
        dst[y0:y1] = dst[y0:y1] * (1 - alpha) + sl * alpha


# ------------------------------------------------------------------ game clips
class Clip:
    def __init__(self, name):
        self.name = name
        self.dir = os.path.join(CLIPS, name)
        self.meta = json.load(open(os.path.join(self.dir, 'meta.json')))
        self.n = len(self.meta['frames'])

    def path(self, i):
        i = int(min(self.n - 1, max(0, i)))
        return os.path.join(self.dir, f'f_{i:05d}.png')


_clips = {}


def clip(name):
    if name not in _clips:
        _clips[name] = Clip(name)
    return _clips[name]


@lru_cache(maxsize=10)
def game_frame(name, i):
    c = clip(name)
    im = cv2.imread(c.path(i), cv2.IMREAD_COLOR)
    return cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0


def game_view(name, i, rx, ry, rw, rh, ow, oh):
    """crop logical game rect (rx,ry,rw,rh) from frame i and resize to (ow,oh)."""
    src = game_frame(name, i)
    sh, sw = src.shape[:2]
    x0, y0 = rx * SS, ry * SS
    x1, y1 = (rx + rw) * SS, (ry + rh) * SS
    # affine map so sub-pixel crops and out-of-bounds both work
    sx, sy = ow / (x1 - x0), oh / (y1 - y0)
    M = np.array([[sx, 0, -x0 * sx], [0, sy, -y0 * sy]], np.float32)
    interp = cv2.INTER_AREA if sx < 1 else cv2.INTER_CUBIC
    if sx < 0.75:     # proper prefilter for strong downscales
        k = 1.0 / sx
        pre = cv2.resize(src, (max(1, int(sw / k * 1.0)), max(1, int(sh / k * 1.0))), interpolation=cv2.INTER_AREA)
        f = pre.shape[1] / sw
        M = np.array([[sx / f, 0, -x0 * sx], [0, sy / f, -y0 * sy]], np.float32)
        src = pre
        interp = cv2.INTER_LINEAR
    out = cv2.warpAffine(src, M, (int(ow), int(oh)), flags=interp, borderMode=cv2.BORDER_CONSTANT,
                         borderValue=tuple(float(v) for v in BG))
    return np.clip(out, 0, 1)


def fullframe(name, i, cx, cy, cw, zoom=1.0, dx=0, dy=0):
    """16:9 full-bleed crop centred on (cx,cy) with logical width cw."""
    w = cw / zoom
    h = w * 9 / 16
    return game_view(name, i, cx - w / 2 + dx, cy - h / 2 + dy, w, h, W, H)


# ------------------------------------------------------------------ 8-bit treatment
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) + 0.5) / 16 - 0.5
PALETTE = np.stack([hexc(c) for c in (
    '06010f', '1a0533', '3b0a5c', 'ff2bd6', '00f6ff', 'ffb000', 'ff7b00', '39ff6a', 'ffe14d', 'ffffff',
    '7a3cff', 'c86bff', 'ff4d4d', '0a5c7a', '8f8ab8', '30123d')])


def demake(img, block=12, levels=None, palette=PALETTE, dither=0.10):
    """chunky 8-bit look: downsample, ordered dither, nearest-palette, upscale nearest."""
    h, w = img.shape[:2]
    sw, sh = max(1, w // block), max(1, h // block)
    small = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
    small = small * 1.25                                        # keep neon punchy after averaging
    by = np.tile(BAYER4, (sh // 4 + 1, sw // 4 + 1))[:sh, :sw]
    small = small + by[..., None] * dither * 2
    d = ((small[:, :, None, :] - palette[None, None]) ** 2).sum(-1)
    q = palette[np.argmin(d, axis=2)]
    return cv2.resize(q, (w, h), interpolation=cv2.INTER_NEAREST)


def mosaic(img, block):
    if block <= 1:
        return img
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(1, w // block), max(1, h // block)), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)


# ------------------------------------------------------------------ post
_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_nx, _ny = (_xx - W / 2) / (W / 2), (_yy - H / 2) / (H / 2)
_r2 = _nx ** 2 + _ny ** 2
VIGNETTE = np.clip(1.0 - 0.32 * _r2 ** 1.4, 0, 1)[..., None].astype(np.float32)
SCAN = np.ones((H, 1, 1), np.float32)
SCAN[2::4] = 0.86
SCAN[3::4] = 0.74


def _curve_maps(k):
    f = (1 + k * _r2) / (1 + k)
    mx = (_nx * f) * (W / 2) + W / 2
    my = (_ny * f) * (H / 2) + H / 2
    return mx.astype(np.float32), my.astype(np.float32)


CURVE_K = 0.025
MAPX, MAPY = _curve_maps(CURVE_K)
CORNER = np.clip(np.minimum.reduce([MAPX, W - 1 - MAPX, MAPY, H - 1 - MAPY]) / 6.0, 0, 1)[..., None]


def bloom(img, strength=0.55, thresh=0.42):
    small = cv2.resize(img, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    lum = small @ np.array([0.3, 0.55, 0.15], np.float32)
    k = np.clip((lum - thresh) / (1 - thresh), 0, 1)[..., None]
    br = small * k
    g = cv2.GaussianBlur(br, (0, 0), 2.2) * 0.55 + cv2.GaussianBlur(br, (0, 0), 9) * 0.45 + \
        cv2.GaussianBlur(br, (0, 0), 26) * 0.35
    g = cv2.resize(g, (W, H), interpolation=cv2.INTER_LINEAR)
    return img + g * strength


def chroma(img, amount):
    """radial chromatic aberration; amount in pixels at the frame edge"""
    if amount < 0.25:
        return img
    s = amount / (W / 2)
    out = img.copy()
    for c, k in ((0, 1 + s), (2, 1 - s)):
        mx = (_xx - W / 2) * k + W / 2
        my = (_yy - H / 2) * k + H / 2
        out[..., c] = cv2.remap(img[..., c], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return out


def shake_img(img, dx, dy, zoom=1.0, rot=0.0):
    if abs(dx) < 0.3 and abs(dy) < 0.3 and abs(zoom - 1) < 1e-4 and abs(rot) < 1e-5:
        return img
    M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, zoom)
    M[0, 2] += dx
    M[1, 2] += dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


def post(img, t, ca=1.2, bloom_k=0.5, noise=0.018, flash=0.0, crt=True, seed=None, lift=True, gain=1.0):
    x = img
    if gain != 1.0:
        x = x * gain
    x = bloom(x, bloom_k)
    if flash > 0:
        x = x * (1 - flash) + flash
    x = chroma(x, ca)
    if crt:
        x = x * SCAN
        x = cv2.remap(x, MAPX, MAPY, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
        x = x * VIGNETTE * CORNER
    if noise > 0:
        r = np.random.default_rng(seed)
        n = r.standard_normal((H // 2, W // 2, 1)).astype(np.float32)
        n = cv2.resize(n, (W, H), interpolation=cv2.INTER_NEAREST)[..., None]
        x = x + n * noise
    if lift:   # deep-purple blacks, like the game's #06010f
        x = x + (1 - np.clip(x * 6, 0, 1)) * BG * 0.6
    return np.clip(x, 0, 1)


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
