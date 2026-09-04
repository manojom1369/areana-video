# Kila Kila — 3D Kinetic Typography Lyric Video

A word-by-word **3D kinetic-typography** lyric video rendered with Python + Pillow:
extruded gold 3D letters, glossy faces, floor reflections, bokeh stage lights,
beat-synced camera shake/flashes, and a synthesized drum-and-bass groove that
drives the animation.

- Output: `output/kila_kila_kinetic_lyrics.mp4` — 1920×1080, 30 fps, H.264 + AAC
- Renderer: `src/lyric_video.py`
- Fonts: `assets/fonts/` (Anton is used by default; Bungee, BebasNeue, ArchivoBlack included)

## Usage

```bash
python -m venv .venv && source .venv/bin/activate
pip install pillow numpy imageio-ffmpeg
python src/lyric_video.py
```

## Swapping in your own font/style

To use the font from your reference image:

1. Drop the font file (`.ttf`/`.otf`) into `assets/fonts/` — a font **file** is
   needed; a picture of lettering can't be converted to a font, but its
   *style* (colors, outline, shadow) can be matched visually.
2. Set `FONT_PATH` in `src/lyric_video.py` to your font (or pass the reference
   image in chat and the style will be matched — e.g. outline color, gradient,
   neon glow, chrome/metal finish).

Tunables at the top of `src/lyric_video.py`:

| Setting | Meaning |
|---|---|
| `FONT_PATH` / `BASE_FONT_SIZE` | typeface and size |
| `BEAT` | seconds per word pop (timing/speed) |
| `ACCENT_WORDS` | words rendered in hot pink (default: `hello`, `honey`) |
| `GOLD_*`, `PINK_*`, `DIM_*` | face gradient / extrusion / stroke colors |
| `BG_TOP`, `BG_BOT` | background gradient |

If you have the actual song audio, replace `synth_audio()` with your track and
set `BEAT` to match its tempo.
