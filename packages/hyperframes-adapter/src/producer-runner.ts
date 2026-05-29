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
 */

import { createRenderJob, executeRenderJob, type RenderJob } from "@hyperframes/producer";

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
  const job = createRenderJob({
    fps: { num: opts.fps, den: 1 },
    quality: "high",
    format: "mp4",
    // The producer pulls the rest from defaults (codec, hdr, audio mode).
    // When we need to expose more knobs, extend RunRenderOptions and pass
    // through here.
  } as never);

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
