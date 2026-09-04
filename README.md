# Kila Kila — 3D Kinetic Typography Lyric Video

A word-by-word **3D kinetic-typography** lyric video rendered with Python + Pillow:
extruded gold 3D letters, glossy faces, floor reflections, bokeh stage lights,
beat-synced camera shake/flashes, and a synthesized drum-and-bass groove that
drives the animation.

- Outputs (1920×1080 and 1080×1920, 30 fps, H.264 + AAC):
  - `output/kila_kila_kinetic_lyrics.mp4` — landscape 16:9
  - `output/kila_kila_kinetic_lyrics_9x16.mp4` — vertical 9:16 (Reels/Shorts), word rows
    auto-wrap and the active row stays centered with a karaoke-style scroll
- Renderer: `src/lyric_video.py` — render with `python src/lyric_video.py [vertical] [landscape]`
- Font: **Alex Brush** (OFL) with a faux-bold stroke (`BOLD_FRAC`), matched to the
  reference's bold flowing brush-script style with swash capitals. Alternatives
  (Playball, Pacifico, Great Vibes, Anton, Bungee…) are in `assets/fonts/`.

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
