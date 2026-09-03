# Areana Video

Programmatic video maker built on **[Remotion](https://github.com/remotion-dev/remotion)** —
write video templates as React components, then render them into MP4s on demand.

The repo has two halves that share one codebase:

| Directory    | What it is                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| `remotion/`  | The video **templates** (React compositions + zod schemas)                 |
| `server/`    | An Express **render API**: start a job, poll progress, cancel, download MP4 |
| `public/`    | Assets bundled into renders (vendored Montserrat fonts)                    |
| `scripts/`   | Font sync helper                                                           |

> Built by following Remotion's official templates
> ([template-render-server](https://github.com/remotion-dev/remotion/tree/main/packages/template-render-server))
> — remotion 4.0.520, React 19.

## What you can do right now

Two product-ad templates are included (add more by dropping a new component in
`remotion/templates/` and registering it in `remotion/Root.tsx`):

- **`ProductAd`** — 1920×1080, 10 s landscape drop ad (headline, subheadline,
  price, CTA, glowing product card)
- **`ProductAdVertical`** — 1080×1920, 10 s vertical ad for Reels/Shorts

Every text string and both accent colors are parameters validated with a zod
schema — the same schema powers the Remotion Studio prop editor **and** the
render API, so invalid input is rejected before a render starts.

## Previews

Rendered stills (frame 150 of 300) of the two included templates:

| `ProductAd` (1920×1080) | `ProductAdVertical` (1080×1920) |
| --- | --- |
| ![ProductAd landscape preview](docs/previews/product-ad.jpg) | ![ProductAd vertical preview](docs/previews/product-ad-vertical.jpg) |

## Quickstart

```console
npm install        # installs deps; run `npm run fonts` afterwards if fonts are missing
npm run studio     # Remotion Studio: preview + edit the templates live (localhost:3000)
npm run render:demo  # render the demo video straight to out/product-ad.mp4
npm run server     # start the render API + demo web UI (localhost:3000)
```

The first CLI render or server start downloads Remotion's tested headless
Chrome automatically (needs internet, ~150 MB, cached in
`node_modules/.remotion`).

Open http://localhost:3000 — it is a small "render lab" UI: pick a template,
edit copy/colors, hit **Render video** and watch the job progress until the
player shows the finished MP4.

## Render API

```
POST   /api/jobs              start a render          { "templateId": "ProductAd", "props": { ... } }
GET    /api/jobs              list jobs
GET    /api/jobs/:id          job status + progress   → 202 { "jobId": "…" }
DELETE /api/jobs/:id          cancel a queued/running job
GET    /renders/<jobId>.mp4   download the finished video
GET    /api/templates         template metadata (drives the UI, defaults, fields)
```

Example:

```console
curl -s -X POST localhost:3000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "templateId": "ProductAd",
    "props": {
      "productName": "Nebula Watch",
      "headline": "Time, redesigned.",
      "price": "$199",
      "ctaText": "Pre-order now",
      "accent": "#22D3EE",
      "accent2": "#8B5CF6"
    }
  }'

curl -s localhost:3000/api/jobs/<jobId>     # poll → { status: "in-progress", progress: 47 }
```

### Environment variables

| Variable                | Default                | Meaning                                                                  |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `PORT` / `HOST`         | `3000` / `0.0.0.0`     | HTTP bind address                                                        |
| `BROWSER_EXECUTABLE`    | *(auto-download)*      | Path to a Chrome/Chromium binary to use for rendering                    |
| `REMOTION_SERVE_URL`    | *(bundles on boot)*    | Reuse an already-bundled Remotion site (`remotion bundle`)               |
| `PUBLIC_BASE_URL`       | *(relative URLs)*      | Base URL used in job `downloadUrl` values                                |

## Rendering in a browser-less / offline CI

Remotion renders with headless Chrome. If your machine can't download it
(restricted network), point `BROWSER_EXECUTABLE` at any modern Chromium:

```console
BROWSER_EXECUTABLE=/path/to/chromium npm run server
```

The demo in this repo was verified end-to-end against a Chromium 149 binary
that was fetched from the npm registry and run with its bundled shared
libraries (see `server/index.ts` → `ensureBrowser({ browserExecutable })`).

## Project layout

```
remotion/
  index.ts                  entry point (registerRoot)
  Root.tsx                  <Composition> registry — one per template id
  lib/fonts.ts              vendored Montserrat loader (offline-safe)
  lib/motion.tsx            reusable animation helpers (springs, glows, reveals)
  templates/ProductAd.tsx   schema + defaults + component (handles 16:9 & 9:16)
server/
  index.ts                  Express app + job endpoints + static UI
  queue.ts                  FIFO render queue (single worker, cancel support)
  templates.ts              template registry the API/UI read from
  public/index.html         the "render lab" demo UI (no build step)
```

### Adding a template

1. Create `remotion/templates/YourTemplate.tsx` with a zod schema +
   `defaultProps` (colors via `zColor()` from `@remotion/zod-types`).
2. Register a `<Composition>` in `remotion/Root.tsx`.
3. Add matching metadata in `server/templates.ts` so the API and web UI know
   about it — that's it. Studio, API and UI all pick it up.

## Production notes

- The queue is in-memory and renders **one job at a time** — perfect for a
  hobby/demo server. For production, persist jobs (Postgres/Redis), use a real
  queue (BullMQ/SQS), run workers on more/faster CPUs, and store outputs in an
  object store (S3). Remotion also offers [Lambda rendering](https://www.remotion.dev/docs/lambda)
  for scale-to-zero video generation.
- Fonts are vendored (see `scripts/copy-fonts.mjs`, sourced from the OFL
  `@fontsource/montserrat` package) so renders never depend on a font CDN.
- Video codec is H.264 (`codec: "h264"` in `server/queue.ts`). `@remotion/renderer`
  supports WebM/VP8/VP9, ProRes and more.

## Useful links

- Remotion repo: https://github.com/remotion-dev/remotion
- Remotion docs: https://www.remotion.dev/docs
- Render server template this is based on:
  https://github.com/remotion-dev/remotion/tree/main/packages/template-render-server
