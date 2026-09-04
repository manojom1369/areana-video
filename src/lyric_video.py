#!/usr/bin/env python3
"""
3D Kinetic Typography lyric-video renderer.

- Word-by-word pop-in with a 3D extruded gold face, soft glow, and floor reflection.
- Beat-synced camera zoom/shake, white flashes on every word pop.
- Bokeh particles, radial stage lights, vignette and film grain.
- Synthesized drum & bass beat driving the animation (no external music needed).

Swap assets/fonts/<Font>.ttf to change the typeface.
"""

import math
import os
import struct
import subprocess
import sys
import wave
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

# ---------------------------------------------------------------- config ----
W, H = 1920, 1080
FPS = 30
BEAT = 0.52            # seconds per word pop
LINE_GAP = 0.35
INTRO_T = 1.2
OUTRO_T = 1.6
SS = 2                 # supersample factor for sprite rendering

FONT_PATH = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "Anton.ttf")
FONT_PATH = os.path.abspath(FONT_PATH)
BASE_FONT_SIZE = 150
ACCENT_WORDS = {"hello", "honey"}   # words rendered in hot pink instead of gold

# lyrics ---------------------------------------------------------------
LINES_TEXT = [
    "Kila kila mani kalaavaru rani",
    "ghallughallu mane kadhaakali kaanee",
    "kallem leni kallalloni kavvintalni hello ani",
    "chal mohanaanga sukhalaku bonee",
    "chaligili annee polo mani ponee",
    "sigge leni singaaraanni chindinchanee chalo honey",
]

# palette --------------------------------------------------------------
GOLD_TOP = (255, 246, 214)
GOLD_BOT = (226, 160, 38)
GOLD_SIDE_TOP = (178, 110, 20)
GOLD_SIDE_BOT = (60, 34, 6)
GOLD_STROKE = (70, 40, 4)
PINK_TOP = (255, 226, 244)
PINK_BOT = (236, 74, 169)
PINK_SIDE_TOP = (166, 24, 112)
PINK_SIDE_BOT = (58, 6, 40)
PINK_STROKE = (62, 6, 44)
# settled (already-sung) words: muted gold, no glow
DIM_TOP = (214, 168, 92)
DIM_BOT = (122, 80, 26)
DIM_SIDE_TOP = (84, 50, 12)
DIM_SIDE_BOT = (30, 18, 4)
DIM_STROKE = (40, 24, 6)
# settled accent words: muted pink, no glow
HOTDIM_TOP = (212, 116, 176)
HOTDIM_BOT = (134, 32, 94)
HOTDIM_SIDE_TOP = (96, 16, 66)
HOTDIM_SIDE_BOT = (38, 6, 28)
HOTDIM_STROKE = (52, 8, 38)

BG_TOP = np.array([26, 10, 44], dtype=np.float32)
BG_BOT = np.array([8, 4, 18], dtype=np.float32)


# ---------------------------------------------------------------- timing ----
def build_timing():
    words = []
    lines = []
    t = INTRO_T
    for li, text in enumerate(LINES_TEXT):
        toks = text.split()
        wl = []
        for tok in toks:
            words.append({"text": tok.strip(".,").lower(), "raw": tok,
                          "t": t, "line": li})
            wl.append(len(words) - 1)
            t += BEAT
        lines.append(wl)
        t += LINE_GAP
    total = t - LINE_GAP + OUTRO_T
    return words, lines, total


WORDS, LINES, TOTAL_T = build_timing()
N_FRAMES = int(math.ceil(TOTAL_T * FPS))


# ------------------------------------------------------------- easing ------
def ease_out_back(x, s=1.70158):
    x1 = x - 1.0
    return 1.0 + (s + 1) * x1 ** 3 + s * x1 ** 2

def ease_out_cubic(x):
    return 1 - (1 - x) ** 3

def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else x


# -------------------------------------------------------------- sprites ----
_font_cache = {}
def font(size):
    size = int(round(size))
    if size not in _font_cache:
        _font_cache[size] = ImageFont.truetype(FONT_PATH, size)
    return _font_cache[size]


def vgrad(w, h, c_top, c_bot):
    g = np.zeros((h, w, 4), dtype=np.uint8)
    for i in range(3):
        g[:, :, i] = (np.linspace(c_top[i], c_bot[i], h)[:, None]
                      .repeat(w, axis=1)).astype(np.uint8)
    g[:, :, 3] = 255
    return Image.fromarray(g, "RGBA")


def make_word_sprite(text, kind="normal", size=BASE_FONT_SIZE):
    """kind: normal | hot | dim | hotdim -> returns RGBA sprite (SS supersampled)."""
    f = font(size * SS)
    tb = f.getbbox(text, stroke_width=0)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    depth = int(14 * SS * (size / BASE_FONT_SIZE))
    pad = 90 * SS
    cw, ch = tw + 2 * pad + depth, th + 2 * pad + depth

    img = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    if kind == "hot":
        top, bot, stop, sbot, stroke = PINK_TOP, PINK_BOT, PINK_SIDE_TOP, PINK_SIDE_BOT, PINK_STROKE
    elif kind == "dim":
        top, bot, stop, sbot, stroke = DIM_TOP, DIM_BOT, DIM_SIDE_TOP, DIM_SIDE_BOT, DIM_STROKE
    elif kind == "hotdim":
        top, bot, stop, sbot, stroke = HOTDIM_TOP, HOTDIM_BOT, HOTDIM_SIDE_TOP, HOTDIM_SIDE_BOT, HOTDIM_STROKE
    else:
        top, bot, stop, sbot, stroke = GOLD_TOP, GOLD_BOT, GOLD_SIDE_TOP, GOLD_SIDE_BOT, GOLD_STROKE

    tx, ty = pad - tb[0], pad - tb[1]

    # --- glow (hot words and a subtle one on normal) ---
    if kind in ("hot", "normal"):
        glow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        glow_col = (255, 110, 200, 130) if kind == "hot" else (255, 200, 90, 70)
        gd.text((tx, ty), text, font=f, fill=glow_col,
                stroke_width=6 * SS, stroke_fill=glow_col)
        glow = glow.filter(ImageFilter.GaussianBlur(26 * SS))
        img.alpha_composite(glow)

    # --- extruded sides (draw dark layers along the offset direction) ---
    ox, oy = 12 * SS, 13 * SS
    side_grad = vgrad(cw, ch, stop, sbot)
    side_mask = Image.new("L", (cw, ch), 0)
    smd = ImageDraw.Draw(side_mask)
    sw = 3 * SS
    for k in range(depth, 0, -1):
        smd.text((tx + ox * k / depth, ty + oy * k / depth), text, font=f,
                 fill=255, stroke_width=sw, stroke_fill=255)
    img.paste(side_grad, (0, 0), side_mask)

    # edge dark stroke between face and extrusion
    edge = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.text((tx, ty), text, font=f, fill=(0, 0, 0, 0),
            stroke_width=sw + 2 * SS, stroke_fill=stroke)
    img.alpha_composite(edge)

    # --- front face ---
    face_mask = Image.new("L", (cw, ch), 0)
    fmd = ImageDraw.Draw(face_mask)
    fmd.text((tx, ty), text, font=f, fill=255,
             stroke_width=sw, stroke_fill=255)
    face_grad = vgrad(cw, ch, top, bot)
    face = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    face.paste(face_grad, (0, 0), face_mask)
    # glossy specular band across the top third
    gloss = Image.new("L", (cw, ch), 0)
    gd2 = ImageDraw.Draw(gloss)
    gd2.text((tx, ty), text, font=f, fill=120,
             stroke_width=sw, stroke_fill=120)
    band = Image.new("RGBA", (cw, ch), (255, 255, 255, 0))
    band_arr = np.zeros((ch, cw, 4), dtype=np.uint8)
    band_alpha = np.clip(np.linspace(110, 0, ch // 2).repeat(cw).reshape(ch // 2, cw), 0, 110).astype(np.uint8)
    band_arr[: ch // 2, :, 3] = band_alpha
    band = Image.fromarray(band_arr, "RGBA")
    band.putalpha(Image.composite(band.split()[3], Image.new("L", (cw, ch), 0), gloss))
    face.alpha_composite(band)
    img.alpha_composite(face)

    # downscale -> target res
    out = img.resize((cw // SS, ch // SS), Image.LANCZOS)
    # autocrop
    bbox = out.getbbox()
    return out.crop(bbox)


@lru_cache(maxsize=None)
def word_sprite(key, text):
    return make_word_sprite(text, kind=key)


def make_reflection(sprite):
    a = sprite.split()[3]
    refl = sprite.transpose(Image.FLIP_TOP_BOTTOM)
    alpha = refl.split()[3]
    arr = np.array(alpha, dtype=np.float32)
    h = arr.shape[0]
    fade = np.linspace(0.45, 0.0, h)[:, None].repeat(arr.shape[1], axis=1)
    arr = (arr * fade).astype(np.uint8)
    refl.putalpha(Image.fromarray(arr, "L"))
    return refl


@lru_cache(maxsize=None)
def reflection(key, text):
    return make_reflection(word_sprite(key, text))


# ------------------------------------------------------------- layout ------
def line_metrics(words_idxs):
    toks = [WORDS[i] for i in words_idxs]
    f = font(BASE_FONT_SIZE)
    gap = int(BASE_FONT_SIZE * 0.32)
    widths = []
    for w in toks:
        bb = f.getbbox(w["raw"], stroke_width=0)
        widths.append(bb[2] - bb[0])
    total = sum(widths) + gap * (len(toks) - 1)
    max_width = 1720
    scale = min(1.0, max_width / total)
    gap_s = gap * scale
    total_s = sum(widths) * scale + gap_s * (len(toks) - 1)
    x = (W - total_s) / 2
    layout = []
    for w, ww in zip(toks, widths):
        layout.append((w, x, ww * scale))
        x += ww * scale + gap_s
    return layout, scale


LINE_LAYOUT = [line_metrics(li) for li in LINES]
LINE_Y = 560
BASELINE = 790   # floor for reflections


# ------------------------------------------------------------ background ----
@lru_cache(maxsize=1)
def base_background():
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    arr = (BG_TOP[None, None, :] * (1 - y[..., None]) + BG_BOT[None, None, :] * y[..., None])
    bg = np.repeat(arr, W, axis=1)
    img = Image.fromarray(bg.astype(np.uint8), "RGB").convert("RGBA")
    img.alpha_composite(stage_glows())
    return img


def make_background(frame_idx):
    return base_background().copy()


_rng = np.random.default_rng(7)
BOKEH = []
for i in range(46):
    r = _rng.uniform(18, 120)
    BOKEH.append({
        "x": _rng.uniform(0, W), "y": _rng.uniform(0, H),
        "r": r,
        "phase": _rng.uniform(0, math.tau),
        "speed": _rng.uniform(0.15, 0.5),
        "col": _rng.choice([(255, 190, 90), (255, 90, 190), (120, 170, 255),
                            (180, 120, 255), (255, 230, 150)]),
        "a": _rng.uniform(18, 70),
    })


@lru_cache(maxsize=1)
def bokeh_disk():
    s = 256
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:s, 0:s]
    d = np.sqrt(((xx - s / 2) / (s / 2)) ** 2 + ((yy - s / 2) / (s / 2)) ** 2)
    a = np.clip(1 - d, 0, 1) ** 2 * 255
    rgba = np.zeros((s, s, 4), dtype=np.uint8)
    rgba[..., 3] = a.astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


@lru_cache(maxsize=1)
def stage_glows():
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for cx, cy, col, rad in [
        (W * 0.5, H * 0.52, (255, 190, 80), 720),
        (W * 0.18, H * 0.25, (150, 70, 220), 520),
        (W * 0.84, H * 0.22, (220, 60, 150), 520),
    ]:
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / rad
        a = np.clip(1 - d, 0, 1) ** 2
        layer = np.zeros((H, W, 4), dtype=np.uint8)
        for i in range(3):
            layer[..., i] = col[i]
        layer[..., 3] = (a * 90).astype(np.uint8)
        im.alpha_composite(Image.fromarray(layer, "RGBA"))
    return im.filter(ImageFilter.GaussianBlur(60))


@lru_cache(maxsize=1)
def vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    cx, cy = W / 2, H / 2
    d = np.sqrt(((xx - cx) / (W * 0.62)) ** 2 + ((yy - cy) / (H * 0.62)) ** 2)
    v = np.clip(d ** 2.2, 0, 1)
    layer = np.zeros((H, W, 4), dtype=np.uint8)
    layer[..., 3] = (v * 215).astype(np.uint8)
    return Image.fromarray(layer, "RGBA")


def draw_bokeh(im, t):
    disk = bokeh_disk()
    for b in BOKEH:
        a = 0.55 + 0.45 * math.sin(t * b["speed"] * math.tau + b["phase"])
        r = b["r"] * (0.85 + 0.3 * a)
        size = int(r * 2)
        sp = disk.resize((size, size), Image.LANCZOS)
        col = list(b["col"]) + [int(b["a"] * a)]
        tint = Image.new("RGBA", (size, size), tuple(col))
        tint.putalpha(sp.split()[3].point(lambda p: int(p * col[3] / 255)))
        x = b["x"] + 22 * math.sin(t * 0.2 + b["phase"]) - r
        y = b["y"] + 30 * math.cos(t * 0.13 + b["phase"]) - r
        im.alpha_composite(tint, (int(x), int(y)))


# ----------------------------------------------------------------- flash ----
@lru_cache(maxsize=1)
def flash_sprite():
    s = 900
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:s, 0:s]
    d = np.sqrt(((xx - s / 2) / (s / 2)) ** 2 + ((yy - s / 2) / (s / 2)) ** 2)
    a = np.clip(1 - d, 0, 1) ** 2.5
    rgba = np.zeros((s, s, 4), dtype=np.uint8)
    rgba[..., 0] = 255
    rgba[..., 1] = 244
    rgba[..., 2] = 214
    rgba[..., 3] = (a * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


# ----------------------------------------------------------------- frame ----
_transform_cache = {}
def get_transformed(sprite, scale, angle):
    key = (id(sprite), round(scale, 4), round(angle, 3))
    if key in _transform_cache:
        return _transform_cache[key]
    w, h = sprite.size
    im = sprite.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    if abs(angle) > 0.02:   # angle is already in degrees
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    if len(_transform_cache) > 600:
        _transform_cache.clear()
    _transform_cache[key] = im
    return im


def word_state(w, t):
    """returns (kind, scale, angle, alpha, active) or None if not yet sung."""
    dt = t - w["t"]
    if dt < 0:
        return None
    accent = w["text"] in ACCENT_WORDS
    li = w["line"]
    idxs = LINES[li]
    my_pos = next(k for k, j in enumerate(idxs) if WORDS[j] is w)
    next_t = WORDS[idxs[my_pos + 1]]["t"] if my_pos + 1 < len(idxs) else t + 99
    line_end = WORDS[idxs[-1]]["t"] + 0.55

    if dt < 0.34:                       # pop
        p = clamp01(dt / 0.34)
        e = ease_out_back(p)
        scale = 0.25 + 0.75 * e
        angle = -11 * (1 - ease_out_cubic(p))
        alpha = clamp01(p * 2.4)
        return ("hot" if accent else "normal", scale, angle, alpha, True)

    # line exit
    if t > line_end:
        ep = clamp01((t - line_end) / 0.28)
        kind = "hotdim" if accent else "dim"
        return (kind, 1.0 - 0.06 * ep, 0, 1 - ep, False)

    active = t < next_t
    pulse = 1.0 + 0.03 * math.sin(t * 6.0 + w["t"])
    if active:
        return ("hot" if accent else "normal", pulse, 0, 1.0, True)
    return ("hotdim" if accent else "dim", 0.99, 0, 0.92, False)


def render_frame(t, frame_idx):
    im = make_background(frame_idx)
    draw_bokeh(im, t)

    # which lines are visible
    for li, (layout, lscale) in enumerate(LINE_LAYOUT):
        idxs = LINES[li]
        first_t = WORDS[idxs[0]]["t"]
        last_t = WORDS[idxs[-1]]["t"]
        if t < first_t - 0.1:
            continue
        if t > last_t + 1.0:
            continue

        for w, cx, ww in layout:
            st = word_state(w, t)
            if st is None:
                continue
            kind, scale, angle, alpha, active = st

            spr = word_sprite(kind, w["raw"])
            size_s = BASE_FONT_SIZE * lscale
            spr_scale = (size_s / BASE_FONT_SIZE) * scale
            spr_t = get_transformed(spr, spr_scale, angle)
            sw, sh = spr_t.size

            # anchor: word bottom sits on a common baseline (LINE_Y), horizontally centered
            px = int(cx + ww / 2 - sw / 2)
            bottom_y = LINE_Y + int(70 * lscale * scale)
            py = bottom_y - sh

            # floor reflection: only when the word is upright (avoids rotated artifact)
            if alpha > 0.35 and abs(angle) < 0.6:
                refl = get_transformed(reflection(kind, w["raw"]), spr_scale, 0)
                rw, rh = refl.size
                rx = int(cx + ww / 2 - rw / 2)
                ry = bottom_y - 2          # tight under the word
                if alpha < 1.0:
                    ra = refl.split()[3].point(lambda p: int(p * alpha))
                    refl = refl.copy(); refl.putalpha(ra)
                im.alpha_composite(refl, (rx, ry))

            layer = spr_t
            if alpha < 1.0:
                aa = layer.split()[3].point(lambda p: int(p * alpha))
                layer = layer.copy(); layer.putalpha(aa)
            im.alpha_composite(layer, (px, py))

    # beat flash
    for w in WORDS:
        dt = t - w["t"]
        if 0 <= dt < 0.22:
            a = (1 - dt / 0.22)
            fs = flash_sprite().resize((700, 700), Image.LANCZOS)
            fa = fs.split()[3].point(lambda p: int(p * 0.5 * a))
            fs = fs.copy(); fs.putalpha(fa)
            li = w["line"]
            layout, lscale = LINE_LAYOUT[li]
            ent = next(e for e in layout if e[0] is w)
            fx = int(ent[1] + ent[2] / 2 - 350)
            fy = int(LINE_Y - 350)
            im.alpha_composite(fs, (fx, fy))

    # light sweep
    sweep_x = -500 + (t / TOTAL_T) * (W + 1000)
    sweep = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sweep)
    sd.polygon([(sweep_x - 160, H), (sweep_x + 60, H),
                (sweep_x + 360, 0), (sweep_x + 140, 0)],
               fill=(255, 230, 180, 26))
    sweep = sweep.filter(ImageFilter.GaussianBlur(30))
    im.alpha_composite(sweep)

    # vignette + grain
    im.alpha_composite(vignette())
    grain = (_rng.normal(0, 4, (H, W, 1))).astype(np.int16)
    arr = np.array(im.convert("RGB"), dtype=np.int16) + grain
    arr = np.clip(arr, 0, 255).astype(np.uint8)

    # camera: subtle global zoom pulse on each beat
    zoom = 1.0
    shake_x = shake_y = 0
    for w in WORDS:
        dt = t - w["t"]
        if 0 <= dt < 0.3:
            zoom = max(zoom, 1.0 + 0.03 * (1 - dt / 0.3))
            shake_x = int(6 * (1 - dt / 0.3) * math.sin(t * 90))
            shake_y = int(5 * (1 - dt / 0.3) * math.cos(t * 78))
    if zoom > 1.0001 or shake_x or shake_y:
        im2 = Image.fromarray(arr, "RGB")
        zw, zh = int(W / zoom), int(H / zoom)
        im2 = im2.crop(((W - zw) // 2, (H - zh) // 2,
                        (W - zw) // 2 + zw, (H - zh) // 2 + zh)).resize((W, H), Image.BICUBIC)
        if shake_x or shake_y:
            im2 = im2.transform((W, H), Image.AFFINE, (1, 0, -shake_x, 0, 1, -shake_y),
                                resample=Image.BICUBIC, fillcolor=(8, 4, 18))
        arr = np.array(im2, dtype=np.uint8)
    return arr


# ---------------------------------------------------------------- audio -----
def synth_audio(path):
    sr = 44100
    n = int(TOTAL_T * sr)
    buf = np.zeros(n, dtype=np.float32)
    t_a = np.arange(n) / sr

    def kick(at, vel=1.0):
        i = int(at * sr)
        dur = int(0.24 * sr)
        if i + dur > n:
            dur = n - i
        if dur <= 0:
            return
        tt = np.arange(dur) / sr
        f = 120 * np.exp(-tt * 28) + 45
        env = np.exp(-tt * 9)
        buf[i:i + dur] += np.sin(2 * np.pi * np.cumsum(f) / sr) * env * 0.9 * vel

    def hat(at, vel=1.0):
        i = int(at * sr)
        dur = int(0.05 * sr)
        if i + dur > n:
            dur = n - i
        if dur <= 0:
            return
        tt = np.arange(dur) / sr
        noise = _rng.standard_normal(dur)
        env = np.exp(-tt * 60)
        buf[i:i + dur] += noise * env * 0.18 * vel

    def clap(at, vel=1.0):
        i = int(at * sr)
        dur = int(0.18 * sr)
        if i + dur > n:
            dur = n - i
        if dur <= 0:
            return
        tt = np.arange(dur) / sr
        noise = _rng.standard_normal(dur)
        env = np.exp(-tt * 22) * (1 - np.exp(-tt * 200))
        buf[i:i + dur] += noise * env * 0.4 * vel

    def bass(at, freq, vel=1.0):
        i = int(at * sr)
        dur = int(BEAT * 0.9 * sr)
        if i + dur > n:
            dur = n - i
        if dur <= 0:
            return
        tt = np.arange(dur) / sr
        env = np.minimum(tt * 12, 1) * np.exp(-tt * 3.2)
        wave_ = (np.sin(2 * np.pi * freq * tt) +
                 0.4 * np.sin(2 * np.pi * freq * 2 * tt))
        buf[i:i + dur] += wave_ * env * 0.22 * vel

    roots = [55.0, 55.0, 49.0, 43.65, 49.0, 58.27]  # A1 A1 G1 F1 G1 A#1
    for w in WORDS:
        at = w["t"]
        kick(at)
        bass(at, roots[w["line"]])
    # hats on offbeats + clap at end of each line
    k = 0
    bt = BEAT / 2
    tt0 = INTRO_T
    while tt0 < TOTAL_T - 0.5:
        if k % 2 == 1:
            hat(tt0)
        k += 1
        tt0 += bt
    for li, idxs in enumerate(LINES):
        clap(WORDS[idxs[-1]]["t"] + BEAT * 0.5, 0.8)

    # warm pad (Am-ish drone with line changes)
    pad = np.zeros(n, dtype=np.float32)
    chords = [
        (110.0, 164.81, 220.0),   # Am
        (110.0, 164.81, 220.0),
        (98.0, 146.83, 196.0),    # G
        (87.31, 130.81, 174.61),  # F
        (98.0, 146.83, 196.0),    # G
        (116.54, 174.61, 233.08), # A#
    ]
    line_bounds = []
    for idxs in LINES:
        line_bounds.append((WORDS[idxs[0]]["t"], WORDS[idxs[-1]]["t"] + BEAT))
    for (s, e), ch in zip(line_bounds, chords):
        i0, i1 = int(s * sr), int(min(e, TOTAL_T) * sr)
        if i1 <= i0:
            continue
        tt = np.arange(i1 - i0) / sr
        seg = np.zeros(i1 - i0, dtype=np.float32)
        for f in ch:
            seg += np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.01 * tt)
        seg /= len(ch) * 1.3
        env = np.minimum(tt * 2, 1) * np.clip((e - s - tt) * 2, 0, 1)
        pad[i0:i1] += seg * env * 0.06
    buf += pad

    # gentle limiter + stereo
    buf = np.tanh(buf * 1.2) * 0.9
    stereo = np.stack([buf, np.roll(buf, 12)], axis=1)
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ main ----
def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "output")
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    silent = os.path.join(out_dir, "_silent.mp4")
    wav = os.path.join(out_dir, "_beat.wav")
    final = os.path.join(out_dir, "kila_kila_kinetic_lyrics.mp4")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    print(f"Total duration: {TOTAL_T:.1f}s, frames: {N_FRAMES}")
    cmd = [ffmpeg, "-y", "-f", "rawvideo", "-vcodec", "rawvideo",
           "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(FPS),
           "-i", "pipe:0",
           "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for fi in range(N_FRAMES):
        t = fi / FPS
        frame = render_frame(t, fi)
        proc.stdin.write(frame.tobytes())
        if fi % 60 == 0:
            print(f"  frame {fi}/{N_FRAMES} ({t:.1f}s)", flush=True)
    proc.stdin.close()
    proc.wait()

    print("Synthesizing beat audio...")
    synth_audio(wav)

    print("Muxing final video...")
    subprocess.run([ffmpeg, "-y", "-i", silent, "-i", wav,
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", final],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    os.remove(silent)
    os.remove(wav)
    print("Done:", final)


if __name__ == "__main__":
    main()
