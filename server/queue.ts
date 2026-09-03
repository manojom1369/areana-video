import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
  type BrowserExecutable,
} from "@remotion/renderer";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * A tiny FIFO render queue. Jobs run one at a time because every render is
 * CPU/GPU heavy (headless Chrome + encoding). In production, back this with a
 * real job store (e.g. Postgres/Redis) and scale horizontally — see README.
 */

export type RenderJobData = {
  readonly templateId: string;
  readonly props: Record<string, string>;
};

export type RenderJob =
  | {
      readonly id: string;
      readonly status: "queued";
      readonly createdAt: number;
      readonly data: RenderJobData;
    }
  | {
      readonly id: string;
      readonly status: "in-progress";
      readonly createdAt: number;
      readonly startedAt: number;
      readonly progress: number; // 0..100
      readonly data: RenderJobData;
      readonly cancel: () => void;
    }
  | {
      readonly id: string;
      readonly status: "completed";
      readonly createdAt: number;
      readonly startedAt: number;
      readonly finishedAt: number;
      readonly downloadUrl: string;
      readonly data: RenderJobData;
    }
  | {
      readonly id: string;
      readonly status: "failed";
      readonly createdAt: number;
      readonly startedAt?: number;
      readonly finishedAt: number;
      readonly error: string;
      readonly data: RenderJobData;
    };

export const makeRenderQueue = ({
  serveUrl,
  rendersDir,
  browserExecutable,
  publicBaseUrl,
  onLog,
}: {
  serveUrl: string;
  rendersDir: string;
  browserExecutable: BrowserExecutable;
  publicBaseUrl: string;
  onLog?: (message: string) => void;
}) => {
  const log = (message: string) => {
    if (onLog) {
      onLog(message);
    }
  };

  const jobs = new Map<string, RenderJob>();
  let queue: Promise<unknown> = Promise.resolve();

  const processRender = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    if (!job || job.status !== "queued") {
      return;
    }

    const { cancel, cancelSignal } = makeCancelSignal();
    const startedAt = Date.now();

    jobs.set(jobId, {
      id: jobId,
      status: "in-progress",
      createdAt: job.createdAt,
      startedAt,
      progress: 0,
      data: job.data,
      cancel,
    });

    const fail = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log(`Job ${jobId} failed: ${message}`);
      jobs.set(jobId, {
        id: jobId,
        status: "failed",
        createdAt: job.createdAt,
        startedAt,
        finishedAt: Date.now(),
        error: message.slice(0, 1000),
        data: job.data,
      });
    };

    try {
      log(`Job ${jobId} started (${job.data.templateId})`);
      const outputLocation = path.join(rendersDir, `${jobId}.mp4`);

      const composition = await selectComposition({
        serveUrl,
        id: job.data.templateId,
        inputProps: job.data.props,
        browserExecutable,
      });

      log(`Job ${jobId}: composition "${composition.id}" selected, rendering…`);

      await renderMedia({
        cancelSignal,
        serveUrl,
        composition,
        inputProps: job.data.props,
        codec: "h264",
        browserExecutable,
        onProgress: ({ progress }) => {
          const current = jobs.get(jobId);
          if (!current || current.status !== "in-progress") {
            return;
          }
          jobs.set(jobId, {
            ...current,
            progress: Math.round(progress * 100),
          });
        },
        outputLocation,
      });

      const final = jobs.get(jobId);
      if (!final || final.status !== "in-progress") {
        return; // cancelled while rendering
      }

      const downloadUrl = `${publicBaseUrl}/renders/${jobId}.mp4`;
      log(`Job ${jobId} completed → ${downloadUrl}`);
      jobs.set(jobId, {
        id: jobId,
        status: "completed",
        createdAt: job.createdAt,
        startedAt,
        finishedAt: Date.now(),
        downloadUrl,
        data: job.data,
      });
    } catch (error) {
      if ((error as Error).message?.includes("got cancelled")) {
        log(`Job ${jobId} cancelled`);
        jobs.delete(jobId);
        return;
      }
      fail(error);
    }
  };

  const enqueue = (data: RenderJobData): string => {
    const id = randomUUID();
    const createdAt = Date.now();
    jobs.set(id, {
      id,
      status: "queued",
      createdAt,
      data,
    });
    const run = queue.then(() => processRender(id));
    queue = run.catch(() => undefined);
    return id;
  };

  const cancel = (jobId: string): boolean => {
    const job = jobs.get(jobId);
    if (!job) {
      return false;
    }
    if (job.status === "queued") {
      jobs.delete(jobId);
      return true;
    }
    if (job.status === "in-progress") {
      job.cancel();
      return true;
    }
    return false;
  };

  return { enqueue, cancel, jobs };
};

export type RenderQueue = ReturnType<typeof makeRenderQueue>;
