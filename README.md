# ⚡ Kinetic Lyric Studio

A pro-grade **kinetic typography engine** for lyric videos & word-synced subtitles — built as a single
self-contained web app (no build step, no dependencies). Paste lyrics, load a song, and cut
word-level animated subtitles like a full-time lyric-video editor.

![styles](https://img.shields.io/badge/styles-6-6ee7ff) ![engine](https://img.shields.io/badge/engine-canvas%20%2B%20WebAudio-7c5cff)

## Quick start

```bash
# any static server works
python3 -m http.server 8000
# open http://localhost:8000
```

## Workflow (the pro way)

1. **Load your song** → `♪ Load Song` (stays 100% in your browser — nothing is uploaded).
2. **Paste lyrics** in the Lyrics tab.
   - Wrap a word in `*asterisks*` for accent-color emphasis (`*fire*`), CAPS works too (`GOLD`).
3. **Time it** — three ways:
   - **Auto-time** — lays every line on the bar grid (BPM × line/bar). Set the BPM, or hit **TAP**
     3–4 times with the song to detect it.
   - **Tap timing** (`⏱ Tap Timing` or `T`) — play the song and stamp each line with `SPACE`.
     `⌫` undoes, `ESC` finishes. Word-level timings are distributed automatically.
   - **Import** an `.lrc` (plain **or** enhanced `<mm:ss.xx>` word tags) or `.srt`.
4. **Pick a style** (`1`–`6`):

| # | Style | Look |
|---|-------|------|
| 1 | **Punch** | words slam in with squash & stretch, shockwave rings + spark bursts on `*emphasis*`, ghost echo, hard shadow |
| 2 | **Blur Focus** | Apple-Music-style blur → pull-into-focus per word |
| 3 | **Glitch** | RGB channel split + torn slices on the active word |
| 4 | **Neon Wave** | per-letter glow, letters rise as they're sung |
| 5 | **Typewriter** | character-by-character with a blinking caret |
| 6 | **Slide Cut** | masked slide reveal + broadcast highlight box |

5. **Dial the motion** — beat zoom punch, camera shake, enter/exit timing, film grain, vignette.
   Toggle **reactive** to drive all motion from the song's live bass energy (FFT) instead of the BPM grid.
6. **Export**:
   - `Record Video (WebM)` — realtime capture of exactly what you see, song + beat included. Drops
     straight into DaVinci Resolve / Premiere / CapCut.
   - `Save PNG` — current frame at full resolution.
   - `Export .SRT` — your timed lines as a standard subtitle file.

## Formats

`16:9` YouTube · `9:16` Reels/Shorts · `1:1` square — rendered at 1080p-class internal resolution.

## Shortcuts

| Key | Action |
|-----|--------|
| `SPACE` | play / pause |
| `T` | tap-timing mode |
| `1`–`6` | switch kinetic style |
| `←` / `→` | seek ±2s |
| `[` / `]` | nudge all timings ±0.1s |
| `F` | fullscreen preview |

## Notes

- No song? A synthesized kick/snare/hat groove follows your BPM so the preview still bumps —
  it's muted automatically when you load a real track (re-enable via the `beat` checkbox).
- Projects auto-save to `localStorage`. `↺ Demo` resets everything.
- Export uses `MediaRecorder` — Chrome/Edge give the best results (VP9).

## Layout

```
index.html          editor shell
css/style.css       dark NLE-style chrome
js/util.js          easings, rng, color + time helpers
js/lyrics.js        lyric parsing (text/LRC/SRT), word timing distribution
js/transport.js     unified play clock, audio file, FFT analyser, beat synth
js/engine.js        canvas engine: layout, beat camera, backgrounds, grain, vignette
js/styles.js        the six kinetic typography renderers
js/ui.js            panels, tap mode, shortcuts, file IO
js/export.js        MediaRecorder video, PNG, SRT export
js/demo.js          demo project + palettes
js/main.js          orchestration + render loop
```
