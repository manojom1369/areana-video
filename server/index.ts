import express from "express";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, type BrowserExecutable } from "@remotion/renderer";
import { makeRenderQueue, type RenderJob } from "./queue";
import { getTemplate, TEMPLATES } from "./templates";

/**
 * Areana Video render API
 *
 * Endpoints:
 *   GET    /api/templates          list renderable templates + field metadata
 *   POST   /api/jobs               start a render job  { templateId, props }
 *   GET    /api/jobs               list jobs
 *   GET    /api/jobs/:id           poll a job (progress, result, errors)
 *   DELETE /api/jobs/:id           cancel a queued/running job
 *   GET    /renders/:file.mp4      download finished videos
 *   GET    /                       demo web UI (form → job → preview player)
 *
 * Environment:
 *   PORT                    HTTP port (default 3000)
 *   BROWSER_EXECUTABLE      path to a Chrome/Chromium binary. If unset,
 *                           Remotion downloads its tested headless Chrome
 *                           automatically (needs internet access).
 */

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const browserExecutable: BrowserExecutable = process.env.BROWSER_EXECUTABLE ?? null;
const baseUrl = process.env.PUBLIC_BASE_URL ?? "";

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const validateProps = (
  templateId: string,
  props: unknown,
): { ok: true; props: Record<string, string> } | { ok: false; error: string } => {
  const template = getTemplate(templateId);
  if (!template) {
    return { ok: false, error: `Unknown template "${templateId}". Known: ${TEMPLATES.map((t) => t.id).join(", ")}` };
  }
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    return { ok: false, error: "props must be an object of string values" };
  }

  const input = props as Record<string, unknown>;
  const merged: Record<string, string> = { ...template.defaultProps };

  for (const field of template.fields) {
    const raw = input[field.key];
    if (raw === undefined) {
      continue; // use default
    }
    if (typeof raw !== "string" || raw.length > 500) {
      return { ok: false, error: `Field "${field.key}" must be a string (max 500 chars)` };
    }
    const value = raw.trim();
    if (value.length === 0) {
      return { ok: false, error: `Field "${field.key}" must not be empty` };
    }
    if (field.type === "color" && !COLOR_RE.test(value)) {
      return { ok: false, error: `Field "${field.key}" must be a hex color like #8B5CF6` };
    }
    merged[field.key] = value;
  }

  const unknownKeys = Object.keys(input).filter((k) => !template.fields.some((f) => f.key === k));
  if (unknownKeys.length > 0) {
    return { ok: false, error: `Unknown prop(s): ${unknownKeys.join(", ")}` };
  }

  return { ok: true, props: merged };
};

const main = async (): Promise<void> => {
  console.info(`Ensure browser… ${browserExecutable ?? "(downloads automatically)"}`);
  await ensureBrowser({ browserExecutable });

  const entryPoint = path.resolve("remotion/index.ts");
  const serveUrl = process.env.REMOTION_SERVE_URL
    ? process.env.REMOTION_SERVE_URL
    : await bundle({
        entryPoint,
        publicDir: path.resolve("public"),
        rspack: true,
        onProgress: (progress) => {
          console.info(`Bundling compositions… ${Math.round(progress)}%`);
        },
      });
  console.info(`Bundle ready: ${serveUrl}`);

  const app = express();
  app.use(express.json({ limit: "64kb" }));

  // Finished videos are served from /renders/<jobId>.mp4
  const rendersDir = path.resolve("renders");
  app.use("/renders", express.static(rendersDir, { immutable: true, maxAge: "1h" }));

  // Demo web UI
  app.use(express.static(path.resolve("server/public")));

  const queue = makeRenderQueue({
    serveUrl,
    rendersDir,
    browserExecutable,
    publicBaseUrl: baseUrl,
    onLog: (message) => console.info(`[queue] ${message}`),
  });

  const publicJob = (job: RenderJob | undefined) => {
    if (!job) {
      return null;
    }
    return {
      id: job.id,
      status: job.status,
      progress: job.status === "in-progress" ? job.progress : job.status === "completed" ? 100 : 0,
      createdAt: job.createdAt,
      startedAt: "startedAt" in job ? job.startedAt : undefined,
      finishedAt: "finishedAt" in job ? job.finishedAt : undefined,
      templateId: job.data.templateId,
      props: job.data.props,
      downloadUrl: job.status === "completed" ? job.downloadUrl : undefined,
      error: job.status === "failed" ? job.error : undefined,
    };
  };

  app.get("/api/templates", (_req, res) => {
    res.json({
      templates: TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        width: t.width,
        height: t.height,
        fps: t.fps,
        durationSeconds: t.durationSeconds,
        defaultProps: t.defaultProps,
        fields: t.fields,
      })),
    });
  });

  app.post("/api/jobs", (req, res) => {
    const templateId: unknown = req.body?.templateId;
    const props: unknown = req.body?.props;
    if (typeof templateId !== "string") {
      res.status(400).json({ error: "templateId is required" });
      return;
    }
    const validated = validateProps(templateId, props);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const jobId = queue.enqueue({ templateId, props: validated.props });
    res.status(202).json({ jobId, status: "queued" });
  });

  app.get("/api/jobs", (_req, res) => {
    res.json({ jobs: [...queue.jobs.values()].map(publicJob).sort((a, b) => b!.createdAt - a!.createdAt) });
  });

  app.get("/api/jobs/:id", (req, res) => {
    const job = publicJob(queue.jobs.get(req.params.id));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json({ job });
  });

  app.delete("/api/jobs/:id", (req, res) => {
    const cancelled = queue.cancel(req.params.id);
    if (!cancelled) {
      res.status(400).json({ error: "Job cannot be cancelled (not queued/running, or not found)" });
      return;
    }
    res.json({ ok: true });
  });

  app.listen(PORT, HOST, () => {
    console.info(`Areana video API listening on http://${HOST}:${PORT}`);
    console.info(`  Templates: ${TEMPLATES.map((t) => `${t.id} (${t.width}x${t.height})`).join(", ")}`);
  });
};

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
