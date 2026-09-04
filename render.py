#!/usr/bin/env python3
"""
Glitch kinetic-typography lyric video renderer.

Style reference: bold black italic display type with cyan/magenta RGB split,
horizontal slice displacement, scanline bars and digital noise speckle.
Adapted here as a NEON variant (glowing cyan/magenta on the footage).

Usage:
    python3 render.py                     # demo render on generated background
    python3 render.py --video assets/source.mp4
"""
import argparse, os, subprocess, sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import imageio_ffmpeg
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1280, 720, 30
FONT_MAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "fonts", "Montserrat-BlackItalic.ttf")

CYAN    = (0, 229, 255)
MAGENTA = (255, 0, 128)
INK     = (14, 14, 24)
WHITE   = (245, 248, 255)

# ---------------------------------------------------------------- lyric sheet
# (start, end, text, mode)
#   mode: 'hero'  -> single huge word, hard slam
#         'line'  -> full lyric line, word-by-word pop
#         'stack' -> short phrase, stacked / scaling
LYRICS = [
    (0.60,  2.60, "yesha yesha",                            "hero"),
    (2.80,  6.40, "Yeshanagula kattameedha yeshina uyyala", "line"),
    (6.50,  8.80, "Manamvugudhame baala",                   "stack"),
    (9.00, 12.60, "Yeshanagula kattameedha yeshina uyyala", "line"),
    (12.70,15.00, "Manamvugudhame baala",                   "stack"),

    (15.40,18.20, "Yeshanagula kattameedha yeshanagula",    "line"),
    (18.30,20.10, "Yeshanagula kattameedha",                "hero"),
    (20.20,22.00, "Yeshanagula kattameedha",                "hero"),

    (22.40,26.00, "Yeshanagula kattameedha yeshina uyyala", "line"),
    (26.10,28.40, "Manamvugudhame baala",                   "stack"),
    (28.60,32.20, "Yeshanagula kattameedha yeshina uyyala", "line"),
    (32.30,35.00, "Manamvugudhame baala",                   "stack"),
]
DURATION = 36.0

# assume a steady folk-song pulse for beat-synced glitching
BPM = 96.0
BEAT = 60.0 / BPM


# ---------------------------------------------------------------- font cache
_fc = {}
def font(size):
    if size not in _fc:
        _fc[size] = ImageFont.truetype(FONT_MAIN, size)
    return _fc[size]


def text_size(txt, f):
    b = f.getbbox(txt)
    return b[2] - b[0], b[3] - b[1], b[0], b[1]


def fit_font(txt, max_w, start, floor=22):
    s = start
    while s > floor:
        f = font(s)
        if text_size(txt, f)[0] <= max_w:
            return f
        s -= 2
    return font(floor)


# ------------------------------------------------------------- text layer art
def layer_text(txt, f, color, extrude=0, extrude_color=None):
    """Render text on a transparent layer sized to the glyphs, with optional
    3D extrusion (repeated offset copies receding down-right)."""
    tw, th, ox, oy = text_size(txt, f)
    pad = max(40, extrude * 2 + 30)
    img = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x, y = pad - ox, pad - oy
    if extrude:
        ec = extrude_color or (0, 0, 0)
        for i in range(extrude, 0, -1):
            t = i / extrude
            c = tuple(int(v * (0.30 + 0.55 * (1 - t))) for v in ec)
            d.text((x + i, y + i), txt, font=f, fill=c + (255,))
    d.text((x, y), txt, font=f, fill=color + (255,))
    return img


def neon(txt, f, extrude=0):
    """Neon glow treatment: magenta/cyan bloom behind a bright core."""
    core = layer_text(txt, f, WHITE, extrude, INK)
    w, h = core.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    for col, rad, off, alpha in ((MAGENTA, 14, (-8, 0), 255),
                                 (CYAN,    14, ( 8, 0), 255),
                                 (MAGENTA, 34, (-4, 0), 200),
                                 (CYAN,    34, ( 4, 0), 200),
                                 (MAGENTA, 70, ( 0, 0), 150),
                                 (CYAN,    70, ( 0, 0), 150)):
        g = layer_text(txt, f, col)
        g = g.filter(ImageFilter.GaussianBlur(rad))
        a = g.split()[3].point(lambda v: min(255, int(v * alpha / 255 * 2.2)))
        g.putalpha(a)
        out.alpha_composite(g, (off[0] + (w - g.width) // 2,
                                off[1] + (h - g.height) // 2))
    out.alpha_composite(core)
    return out


def rgb_split(img, dx):
    """Chromatic aberration: push red channel one way, blue the other."""
    if dx == 0:
        return img
    a = np.array(img).astype(np.int16)
    r = np.roll(a[..., 0], dx, axis=1)
    b = np.roll(a[..., 2], -dx, axis=1)
    al = np.maximum.reduce([np.roll(a[..., 3], dx, axis=1),
                            a[..., 3],
                            np.roll(a[..., 3], -dx, axis=1)])
    o = np.stack([r, a[..., 1], b, al], axis=-1)
    return Image.fromarray(np.clip(o, 0, 255).astype(np.uint8))


def slice_glitch(img, amount, rng):
    """Horizontal slice displacement, like a broken scanline feed."""
    if amount <= 0:
        return img
    a = np.array(img)
    h = a.shape[0]
    for _ in range(int(2 + amount * 10)):
        y0 = rng.randrange(0, h)
        y1 = min(h, y0 + rng.randrange(4, 26))
        sh = int(rng.randrange(-1, 2) * rng.randrange(6, 60) * amount)
        if sh:
            a[y0:y1] = np.roll(a[y0:y1], sh, axis=1)
    return Image.fromarray(a)


def speckle(draw, rng, n, w, h, alpha):
    """Digital dust: tiny bright/dark dashes scattered over the frame."""
    for _ in range(n):
        x = rng.randrange(0, w)
        y = rng.randrange(0, h)
        L = rng.randrange(2, 16)
        c = rng.choice([(255, 255, 255), (10, 10, 20), CYAN, MAGENTA])
        draw.rectangle([x, y, x + L, y + rng.randrange(1, 3)],
                       fill=c + (alpha,))


def bars(draw, rng, w, h, cy, n, alpha):
    """The heavy horizontal rules that cut through the reference lettering."""
    for _ in range(n):
        y = cy + rng.randrange(-140, 140)
        x0 = rng.randrange(-100, w // 3)
        x1 = x0 + rng.randrange(w // 3, w)
        t = rng.randrange(3, 9)
        c = rng.choice([(8, 8, 16), CYAN, MAGENTA, (255, 255, 255)])
        draw.rectangle([x0, y, x1, y + t], fill=c + (alpha,))


# ------------------------------------------------------------------ easing
def out_expo(t):
    return 1.0 if t >= 1 else 1 - pow(2, -10 * t)


def out_back(t):
    t = min(1.0, max(0.0, t))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)


# ------------------------------------------------------------ line rendering
def draw_hero(frame, txt, p, rng, beat):
    """Huge single slam word, scales in and rips apart on exit."""
    f = fit_font(txt.upper(), int(W * 0.88), 170)
    img = neon(txt.upper(), f, extrude=14)

    if p < 0.16:
        k = out_back(p / 0.16)
        sc = 0.55 + 0.45 * k
        al = min(1.0, p / 0.08)
        gl = 0.9 * (1 - k)
    elif p > 0.86:
        k = (p - 0.86) / 0.14
        sc = 1.0 + 0.22 * k
        al = 1 - k
        gl = k
    else:
        sc = 1.0 + 0.012 * math.sin(p * 22)
        al = 1.0
        gl = 0.30 * beat

    nw, nh = max(2, int(img.width * sc)), max(2, int(img.height * sc))
    img = img.resize((nw, nh), Image.LANCZOS)
    img = rgb_split(img, int(4 + 26 * gl))
    img = slice_glitch(img, gl, rng)
    if al < 1:
        img.putalpha(img.split()[3].point(lambda v: int(v * al)))

    frame.alpha_composite(img, ((W - nw) // 2, (H - nh) // 2 - 10))


def draw_line(frame, txt, p, rng, beat):
    """Full lyric line: words pop in sequentially, wrapped to 2 rows."""
    words = txt.split()
    mid = (len(words) + 1) // 2
    rows = [" ".join(words[:mid]), " ".join(words[mid:])]
    rows = [r for r in rows if r]

    fs = [fit_font(r.upper(), int(W * 0.86), 104) for r in rows]
    hs = [text_size(r.upper(), f)[1] for r, f in zip(rows, fs)]
    gap = 26
    total = sum(hs) + gap * (len(rows) - 1)
    y = (H - total) // 2 - 8

    n = sum(len(r.split()) for r in rows)
    idx = 0
    for r, f, rh in zip(rows, fs, hs):
        rwords = r.split()
        widths, sp = [], f.getlength(" ")
        for w_ in rwords:
            widths.append(f.getlength(w_.upper()))
        rw = sum(widths) + sp * (len(rwords) - 1)
        x = (W - rw) / 2
        for w_, ww in zip(rwords, widths):
            # each word gets its own slot in the line's timeline
            t0 = 0.05 + 0.42 * (idx / max(1, n))
            wp = (p - t0) / 0.16
            if wp < 0:
                x += ww + sp
                idx += 1
                continue
            k = out_expo(min(1.0, wp))
            al = min(1.0, max(0.0, wp * 2.2))
            if p > 0.90:
                al *= 1 - (p - 0.90) / 0.10

            img = neon(w_.upper(), f, extrude=9)
            dy = int((1 - k) * 46)
            gl = max(0.0, 1 - wp) * 0.85 + 0.18 * beat
            img = rgb_split(img, int(3 + 20 * gl))
            img = slice_glitch(img, gl * 0.8, rng)
            img.putalpha(img.split()[3].point(lambda v: int(v * max(0, min(1, al)))))

            cx = int(x + ww / 2 - img.width / 2)
            cy = int(y + rh / 2 - img.height / 2 + dy)
            frame.alpha_composite(img, (cx, cy))
            x += ww + sp
            idx += 1
        y += rh + gap


def draw_stack(frame, txt, p, rng, beat):
    """Short phrase stacked word over word, breathing scale."""
    words = txt.split()
    fs = [fit_font(w.upper(), int(W * 0.78), 130) for w in words]
    hs = [text_size(w.upper(), f)[1] for w, f in zip(words, fs)]
    gap = 18
    total = sum(hs) + gap * (len(words) - 1)
    y = (H - total) // 2

    for i, (w_, f, hh) in enumerate(zip(words, fs, hs)):
        t0 = 0.04 + 0.20 * i
        wp = (p - t0) / 0.18
        if wp < 0:
            y += hh + gap
            continue
        k = out_back(min(1.0, wp))
        al = min(1.0, wp * 2.4)
        if p > 0.88:
            al *= 1 - (p - 0.88) / 0.12

        img = neon(w_.upper(), f, extrude=11)
        sc = 0.72 + 0.28 * k + 0.02 * beat
        nw, nh = max(2, int(img.width * sc)), max(2, int(img.height * sc))
        img = img.resize((nw, nh), Image.LANCZOS)
        gl = max(0.0, 1 - wp) * 0.9 + 0.2 * beat
        img = rgb_split(img, int(3 + 22 * gl))
        img = slice_glitch(img, gl * 0.9, rng)
        img.putalpha(img.split()[3].point(lambda v: int(v * max(0, min(1, al)))))

        sx = int((W - nw) / 2 + (14 if i % 2 else -14))
        frame.alpha_composite(img, (sx, int(y + hh / 2 - nh / 2)))
        y += hh + gap


# ------------------------------------------------------------------ backdrop
_PLATES = None
def _plates():
    """Load the generated cinematic backplates once, oversized for drift."""
    global _PLATES
    if _PLATES is None:
        here = os.path.dirname(os.path.abspath(__file__))
        out = []
        for n in ("bg1.jpg", "bg2.jpg"):
            p = os.path.join(here, "assets", n)
            if os.path.exists(p):
                im = Image.open(p).convert("RGB")
                out.append(im.resize((int(W * 1.18), int(H * 1.18)),
                                     Image.LANCZOS))
        _PLATES = out
    return _PLATES


def gen_bg(i):
    """Animated background: drifting generated plates, else procedural."""
    t = i / FPS
    pl = _plates()
    if pl:
        cyc = 9.0                      # seconds per plate
        idx = int(t / cyc) % len(pl)
        nxt = (idx + 1) % len(pl)
        lp = (t % cyc) / cyc

        def crop(im, ph):
            # slow ken-burns drift + gentle zoom
            mx, my = im.width - W, im.height - H
            x = int(mx * (0.5 + 0.5 * math.sin(ph * 0.9)))
            y = int(my * (0.5 + 0.5 * math.cos(ph * 0.6)))
            z = 1.0 + 0.03 * math.sin(ph * 0.4)
            cw, ch = int(W / z), int(H / z)
            x = min(x, im.width - cw)
            y = min(y, im.height - ch)
            return im.crop((x, y, x + cw, y + ch)).resize((W, H), Image.LANCZOS)

        a = crop(pl[idx], t * 0.35)
        if lp > 0.86 and len(pl) > 1:          # crossfade into next plate
            b = crop(pl[nxt], t * 0.35)
            a = Image.blend(a, b, (lp - 0.86) / 0.14)
        return a.convert("RGBA")
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = (np.sin(xx / 190 + t * 0.7) + np.cos(yy / 150 - t * 0.5)) * 0.5
    r = 18 + 26 * (v + 1)
    g = 10 + 14 * (v + 1)
    b = 40 + 60 * (1 - v)
    a = np.stack([r, g, b], -1)
    a += (yy / H)[..., None] * np.array([10, 0, 30])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("RGBA")


def darken(img, k=0.55):
    a = np.array(img).astype(np.float32)
    a[..., :3] *= k
    return Image.fromarray(a.astype(np.uint8))


# --------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=None, help="source footage (optional)")
    ap.add_argument("--out", default="output/lyric_video.mp4")
    ap.add_argument("--duration", type=float, default=DURATION)
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    nframes = int(args.duration * FPS)

    # ---- source footage reader (raw rgb24 pipe), if provided
    src = None
    if args.video and os.path.exists(args.video):
        src = subprocess.Popen(
            [FFMPEG, "-nostdin", "-stream_loop", "-1", "-i", args.video,
             "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,"
                    f"crop={W}:{H},fps={FPS}",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            bufsize=W * H * 3 * 4)

    # ---- encoder
    cmd = [FFMPEG, "-y", "-nostdin",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if args.video and os.path.exists(args.video):
        cmd += ["-i", args.video, "-map", "0:v", "-map", "1:a?",
                "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", args.out]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                           stderr=subprocess.DEVNULL)

    rng = random.Random(7)
    for i in range(nframes):
        t = i / FPS

        if src:
            raw = src.stdout.read(W * H * 3)
            if not raw or len(raw) < W * H * 3:
                bg = gen_bg(i)
            else:
                bg = Image.frombytes("RGB", (W, H), raw).convert("RGBA")
        else:
            bg = gen_bg(i)

        frame = darken(bg, 0.52)

        # beat pulse 0..1
        ph = (t % BEAT) / BEAT
        beat = max(0.0, 1 - ph * 3.2)

        # beat flash on the plate
        if beat > 0.75:
            fl = Image.new("RGBA", (W, H), CYAN + (int(16 * beat),))
            frame.alpha_composite(fl)

        for (s, e, txt, mode) in LYRICS:
            if s <= t < e:
                p = (t - s) / (e - s)
                if mode == "hero":
                    draw_hero(frame, txt, p, rng, beat)
                elif mode == "stack":
                    draw_stack(frame, txt, p, rng, beat)
                else:
                    draw_line(frame, txt, p, rng, beat)

        # ---- global glitch pass (frame-wide, occasional)
        fx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(fx)
        heavy = beat > 0.80 or rng.random() < 0.06
        speckle(d, rng, 160 if heavy else 60, W, H, 150 if heavy else 80)
        bars(d, rng, W, H, H // 2, 4 if heavy else 1, 190 if heavy else 90)
        frame.alpha_composite(fx)

        if heavy:
            frame = slice_glitch(frame, 0.35, rng)
            frame = rgb_split(frame, rng.choice([-6, -4, 4, 6]))

        # scanlines
        a = np.array(frame.convert("RGB")).astype(np.float32)
        a[::3] *= 0.90
        # subtle vignette
        yy, xx = np.mgrid[0:H, 0:W]
        vg = 1 - 0.45 * (((xx - W / 2) / (W / 2)) ** 2 +
                         ((yy - H / 2) / (H / 2)) ** 2)
        a *= np.clip(vg, 0.35, 1)[..., None]
        enc.stdin.write(np.clip(a, 0, 255).astype(np.uint8).tobytes())

        if i % 60 == 0:
            print(f"  frame {i}/{nframes}", flush=True)

    enc.stdin.close()
    enc.wait()
    if src:
        src.kill()
    print("wrote", args.out)


if __name__ == "__main__":
    main()
