/**
 * producer-runner — thin wrapper around `@hyperframes/producer`'s
 * `createRenderJob` + `executeRenderJob` to give Atelier callers a
 * one-call render path.
 *
 * Why a wrapper: the producer's `RenderConfigInput` has many knobs
 * (fps rational, hdr mode, quality preset, codec, etc.) that Atelier
 * callers don't need to think about. This wrapper picks Atelier-sensible
 * defaults and exposes only the inputs the agent team works with
 * (project dir, output path, dimensions, fps).
 *
 * v0 scope: MP4 H.264 at quality:"high". v1.0 will surface format +
 * quality + codec options.
 *
 * `@hyperframes/producer` is an optional peer dependency (adapter 0.1.0+).
 * Its install pulls puppeteer + chromium-bidi, which carry upstream npm
 * advisories, so the adapter's scaffolding/translation code must work
 * without it. The producer is therefore loaded lazily, on the first
 * `runRender` call, and only `import type` references it statically
 * (erased at build time, so the emitted JS never requires it).
 */

import type { RenderJob } from "@hyperframes/producer";

/** The producer range this adapter is built and tested against. */
export const PRODUCER_RANGE = "^0.8.214";

export const PRODUCER_MISSING_MESSAGE =
  `Install @hyperframes/producer@${PRODUCER_RANGE} to render Hyperframes projects ` +
  `(it is an optional peer dependency of @a-company/atelier-hyperframes-adapter).`;

type ProducerModule = typeof import("@hyperframes/producer");

const PRODUCER_SPECIFIER = "@hyperframes/producer";

function isProducerMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const message = String((err as { message?: unknown }).message ?? "");
  return (
    (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") &&
    message.includes(PRODUCER_SPECIFIER)
  );
}

/**
 * Load `@hyperframes/producer` on demand. A missing package becomes a
 * clear install hint; any other failure (a broken install, a runtime
 * error inside the producer) is rethrown unchanged.
 *
 * `importer` is a seam for tests; callers use the default.
 */
export async function loadProducer(
  importer: () => Promise<ProducerModule> = () => import(PRODUCER_SPECIFIER) as Promise<ProducerModule>,
): Promise<ProducerModule> {
  try {
    return await importer();
  } catch (err) {
    if (isProducerMissing(err)) {
      throw new Error(PRODUCER_MISSING_MESSAGE, { cause: err });
    }
    throw err;
  }
}

export interface RunRenderOptions {
  /** Absolute path to the scaffolded Hyperframes project (with index.html). */
  projectDir: string;
  /** Absolute output path (e.g. /…/exports/clip.mp4). */
  outputPath: string;
  /** Canvas dimensions (must match the scaffolded index.html dimensions). */
  width: number;
  height: number;
  /** Frame rate. Integer fps is fine — wrapper converts to Hyperframes rational. */
  fps: number;
  /** Optional progress callback. Fires as Hyperframes' stages advance. */
  onProgress?: (info: ProgressInfo) => void;
  /** Optional abort signal — wires into executeRenderJob's cancellation. */
  abortSignal?: AbortSignal;
}

export interface ProgressInfo {
  /** Hyperframes RenderJob stage name (preprocessing | rendering | encoding | …). */
  stage: string;
  /** 0-100. Hyperframes' `progress` is also 0-100. */
  percent: number;
  /** Human-readable progress message Hyperframes emitted. */
  message: string;
}

export interface RunRenderResult {
  outputPath: string;
  totalFrames: number;
  durationSeconds: number;
  /** Wall clock render time, ms. */
  elapsedMs: number;
}

export async function runRender(opts: RunRenderOptions): Promise<RunRenderResult> {
  const { createRenderJob, executeRenderJob } = await loadProducer();

  const job = createRenderJob({
    fps: { num: opts.fps, den: 1 },
    quality: "high",
    format: "mp4",
    // The producer pulls the rest from defaults (codec, hdr, audio mode).
    // When we need to expose more knobs, extend RunRenderOptions and pass
    // through here.
  });

  const startedAt = Date.now();

  await executeRenderJob(
    job,
    opts.projectDir,
    opts.outputPath,
    (j: RenderJob, message: string) => {
      opts.onProgress?.({
        stage: j.currentStage,
        percent: j.progress,
        message,
      });
    },
    opts.abortSignal,
  );

  return {
    outputPath: opts.outputPath,
    totalFrames: job.totalFrames ?? 0,
    durationSeconds: job.duration ?? 0,
    elapsedMs: Date.now() - startedAt,
  };
}
