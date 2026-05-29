// #transcribe-orchestrator — per-media-file transcription orchestrator.
//
// The legacy `transcribeProject(projectDir, opts)` writes a single
// `transcript.json` at the project root (the VideoProject 1.0 contract). When
// a project holds multiple media files (the MediaProject convention,
// `<project>/media/<basename>`), one root transcript can't represent all of
// them — every new ingest would overwrite the previous one.
//
// `transcribeMediaFile(projectDir, mediaBasename, opts)` fixes the gap with a
// thin wrapper:
//
//   1. Call `transcribeProject` — preserves the legacy root `transcript.json`
//      write, so single-source projects, the `atelier transcribe` CLI verb,
//      and every existing caller keep working untouched.
//   2. Mirror the result to `<projectDir>/transcripts/<basename-no-ext>.json`
//      — the per-file canonical location. Multiple ingests stack instead of
//      overwriting; the studio sidebar can light up a transcript badge for
//      each media file.
//
// The mirror is additive. The root `transcript.json` keeps reflecting the
// most-recent transcription (still useful for the legacy renderers); the
// per-file mirror provides the multi-source surface.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import {
  transcribeProject,
  type TranscribeOptions,
  type TranscribeResult,
} from "../commands/transcribe.js";
import {
  probeWhisper,
  runWhisperCpp,
  parseWhisperCppJson,
} from "./whisper.js";

/** Result of `transcribeMediaFile` — extends the base result with the mirror path. */
export interface TranscribeMediaFileResult extends TranscribeResult {
  /**
   * Absolute path to the per-file transcript copy under
   * `<projectDir>/transcripts/<stem>.json`. Always written (assuming the
   * underlying `transcribeProject` succeeded) — present even when the
   * basename happens to be `source.<ext>`, in which case both the root
   * `transcript.json` and the mirror exist side-by-side.
   */
  mirroredTranscriptPath: string;
  /**
   * The basename-without-extension used to derive the mirror filename.
   * Surfaced so callers (e.g. ingest broadcasters) can build their own paths
   * without recomputing.
   */
  mediaStem: string;
}

/**
 * Inject-point for tests so they can stub the underlying `transcribeProject`
 * (the real implementation spawns whisper-cpp). Mirrors the pattern used by
 * `composeVideoProject` and `runMediaIngest`.
 */
export type TranscribeProjectFn = (
  dir: string,
  opts: TranscribeOptions,
) => Promise<TranscribeResult>;

export interface TranscribeMediaFileOptions extends TranscribeOptions {
  /** Test injection point. Defaults to the real `transcribeProject`. */
  transcribeFn?: TranscribeProjectFn;
}

/**
 * Run transcription for a single ingested media file and mirror the result
 * to the per-file location.
 *
 * - `projectDir` — project root (contains `project.atelier`, and the legacy
 *   `source.<ext>` that `transcribeProject` reads).
 * - `mediaBasename` — basename of the file the creator dropped (e.g.
 *   `IMG_7347.MOV` or `interview-cut.mp4`). The mirror's filename is derived
 *   by stripping the extension and appending `.json`.
 *
 * Re-running for the same `mediaBasename` overwrites that media's mirror
 * (matching the legacy "latest wins" behaviour on the root transcript) but
 * leaves other media files' mirrors untouched.
 */
export async function transcribeMediaFile(
  projectDir: string,
  mediaBasename: string,
  options: TranscribeMediaFileOptions = {},
): Promise<TranscribeMediaFileResult> {
  const absProject = resolve(projectDir);
  const stem = stripExt(basename(mediaBasename));
  if (!stem) {
    throw new Error(
      `transcribeMediaFile: invalid mediaBasename "${mediaBasename}" — derived stem is empty`,
    );
  }

  const { transcribeFn, ...transcribeOpts } = options;
  const fn = transcribeFn ?? transcribeProject;

  // Save the existing root transcript.json so we can restore it after
  // transcribeProject runs. Multi-media ingest must NOT permanently clobber
  // the legacy root transcript (it belongs to the original single-source
  // layout). But transcribeProject's full pipeline (writeTranscript +
  // rewriteCaptionLayers) is the right way to land caption layers in
  // project.atelier, so we let it run, then mirror+restore.
  const rootTranscript = join(absProject, "transcript.json");
  const priorRoot = existsSync(rootTranscript) ? readFileSync(rootTranscript) : null;

  const result = await fn(absProject, transcribeOpts);

  if (transcribeOpts.dryRun) {
    return {
      ...result,
      mirroredTranscriptPath: join(absProject, "transcripts", `${stem}.json`),
      mediaStem: stem,
    };
  }

  // Mirror the just-written root transcript to the per-file canonical location.
  const transcriptsDir = join(absProject, "transcripts");
  if (!existsSync(transcriptsDir)) {
    mkdirSync(transcriptsDir, { recursive: true });
  }
  const mirroredTranscriptPath = join(transcriptsDir, `${stem}.json`);
  if (existsSync(rootTranscript)) {
    copyFileSync(rootTranscript, mirroredTranscriptPath);
  }

  // Restore the prior root transcript (or remove if there was none) so each
  // ingest doesn't permanently clobber the legacy single-source transcript.
  // Caption layers + deltas already landed in project.atelier from the run.
  if (priorRoot !== null) {
    writeFileSync(rootTranscript, priorRoot);
  } else {
    try { rmSync(rootTranscript); } catch { /* swallow */ }
  }

  return {
    ...result,
    mirroredTranscriptPath,
    mediaStem: stem,
  };
}

/** Strip the trailing extension (case-insensitive); `IMG_7347.MOV` → `IMG_7347`. */
function stripExt(name: string): string {
  const ext = extname(name);
  if (!ext) return name;
  return name.slice(0, -ext.length);
}

// ── v1.0 media-bin pivot (Kit-A) ──────────────────────────────────────
/**
 * Run transcription on a media file in isolation — no doc, no compose.
 *
 * Used by the media-bin add path (post-pivot, TD-2026-05-28): when a creator
 * drops a video into the bin we want the transcript ready by the time they
 * compose with it.
 *
 * Behaviour:
 *   - Writes `<projectDir>/transcripts/<stem>.json` (canonical per-file
 *     location matching the existing convention).
 *   - Does NOT touch project.atelier or any compose target. Pure media-side.
 *   - Idempotent: if the transcript already exists, no-op (background work
 *     skips duplicates).
 *
 * The legacy `transcribeMediaFile` is left intact for the compose-time path
 * (`composeVideoProject` still calls it). This function bypasses
 * `transcribeProject` entirely so we don't trip the root-transcript +
 * caption-rebuild side effects.
 */
export async function transcribeMediaToBin(
  projectDir: string,
  mediaBasename: string,
  options: TranscribeMediaFileOptions = {},
): Promise<TranscribeMediaFileResult> {
  const absProject = resolve(projectDir);
  const stem = stripExt(basename(mediaBasename));
  if (!stem) {
    throw new Error(
      `transcribeMediaToBin: invalid mediaBasename "${mediaBasename}" — derived stem is empty`,
    );
  }

  const transcriptsDir = join(absProject, "transcripts");
  const mirroredTranscriptPath = join(transcriptsDir, `${stem}.json`);

  // Idempotency guard — background workers running multiple times for the
  // same media file must no-op once the transcript exists.
  if (existsSync(mirroredTranscriptPath)) {
    let cached: unknown = null;
    try {
      cached = JSON.parse(readFileSync(mirroredTranscriptPath, "utf-8"));
    } catch {
      cached = null;
    }
    return {
      projectDir: absProject,
      backend: "cached",
      transcript: cached as never,
      wordCount: 0,
      captionsGenerated: false,
      mirroredTranscriptPath,
      mediaStem: stem,
    };
  }

  const { transcribeFn, dryRun, model, modelPath, language, sourcePath } = options;
  const mediaPath = sourcePath ?? join(absProject, "media", mediaBasename);

  // Test injection: when a stub `transcribeFn` is supplied, reuse it so unit
  // tests don't need a real whisper binary. The stub's result shape matches
  // production runWhisperCpp + parseWhisperCppJson once we mirror it.
  if (transcribeFn) {
    const result = await transcribeFn(absProject, { dryRun, model, modelPath, language, sourcePath: mediaPath });
    if (dryRun) {
      return {
        ...result,
        mirroredTranscriptPath,
        mediaStem: stem,
      };
    }
    // The stub may have written transcript.json to satisfy
    // transcribeProject's legacy contract — for the bin path we MUST NOT keep
    // it around. Mirror it (if present) then remove.
    const rootTranscript = join(absProject, "transcript.json");
    if (existsSync(rootTranscript)) {
      if (!existsSync(transcriptsDir)) {
        mkdirSync(transcriptsDir, { recursive: true });
      }
      copyFileSync(rootTranscript, mirroredTranscriptPath);
      try { rmSync(rootTranscript); } catch { /* swallow */ }
    } else {
      // No legacy artifact — write the transcript object directly. Stubs that
      // skip the root-write path still need the mirror produced.
      if (!existsSync(transcriptsDir)) {
        mkdirSync(transcriptsDir, { recursive: true });
      }
      writeFileSync(
        mirroredTranscriptPath,
        JSON.stringify(result.transcript ?? {}, null, 2),
        "utf-8",
      );
    }
    return {
      ...result,
      mirroredTranscriptPath,
      mediaStem: stem,
    };
  }

  // Production path: probe whisper, run it directly, parse, write mirror.
  // We bypass transcribeProject entirely so neither root transcript.json nor
  // project.atelier are touched.
  const backend = await probeWhisper();
  if (backend === "none") {
    throw new Error(
      "No Whisper backend available. Install whisper.cpp (brew install whisper-cpp).",
    );
  }
  if (backend === "openai-api") {
    throw new Error(
      "OpenAI API backend is not yet implemented for bin-side transcription.",
    );
  }

  const rawJson = await runWhisperCpp(mediaPath, {
    model,
    modelPath,
    language,
  });
  const transcript = parseWhisperCppJson(rawJson);
  const wordCount = transcript.segments.reduce((n, s) => n + s.words.length, 0);

  const result: TranscribeMediaFileResult = {
    projectDir: absProject,
    backend,
    transcript,
    wordCount,
    captionsGenerated: false,
    mirroredTranscriptPath,
    mediaStem: stem,
  };

  if (dryRun) return result;

  if (!existsSync(transcriptsDir)) {
    mkdirSync(transcriptsDir, { recursive: true });
  }
  writeFileSync(mirroredTranscriptPath, JSON.stringify(transcript, null, 2), "utf-8");
  return result;
}
// ──────────────────────────────────────────────────────────────────────
