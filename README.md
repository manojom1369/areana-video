# YESHA — kinetic lyric studio

A dependency-free vertical lyric-video compositor for the supplied Roman Telugu lyrics. It is intentionally built as a browser canvas so the picture, audio, font, and export stay local to the user's browser.

## Run it

From the repository root:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

Then open `http://localhost:4173` (or the live preview URL in Arena).

## Workflow

1. Load the hero MP4/MOV in **Source**. The WeTransfer share page is kept as the reference link from the request, but it does not expose a browser-safe media URL to this local compositor, so the file itself must be selected.
2. Load the song in **Soundtrack**. Audio is added to the canvas recording when the browser supports `MediaRecorder`.
3. Use **Safe area** to check story-safe margins. Switch between the Editorial, Modern, and Mono treatments, or load the supplied `.ttf`, `.otf`, `.woff`, or `.woff2` font through **Use attached font**.
4. Choose Saffron, Pearl, Coral, or Mint ink, and Rise, Drift, or Stamp motion.
5. Press **Export video** → **Render WebM**. The output is `yesha_kinetic_lyric_film.webm`, 9:16, 30 fps, with the 22.4-second beat map and optional audio.

## Creative treatment

- 9:16 vertical composition at a 540 × 960 canvas backing a 1080 × 1920 delivery spec.
- Warm saffron editorial type over a low-contrast moving studio plate when no source is loaded.
- Beat-led word entrances, soft rise, refrain accent, top/bottom editorial labels, and story-safe guides.
- Lyric timing pre-arranged for the supplied refrain; scrub the timeline to inspect each phrase.

The default plate is only a proof layer. For the finished edit, load the linked video file and the original song before export.
