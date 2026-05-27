// #compose-video-project — turn an ingested video + transcript into a playable
// project.atelier document.
//
// Both `atelier media ingest` (CLI) and `POST /api/media/ingest` (studio HTTP)
// call this helper so the post-ingest state is identical regardless of entry
// point. After this runs, opening the project in the studio shows the video
// playing with caption overlays animating — the "v1 UX bundle" payoff.
//
// Pipeline (idempotent, safe to re-run):
//   1. Transcribe the source via `transcribeProject` (in-process whisper-cpp).
//      This already writes transcript.json AND calls `rewriteCaptionLayers`,
//      so caption-tagged TextVisual layers + their fade deltas land in
//      project.atelier under the "default" state.
//   2. Ensure project.atelier has a non-caption VideoVisual layer pointing
//      at the source file, covering the canvas. If it already does, leave
//      it alone.
//   3. Ensure the target state's `duration` reflects the actual video length.
//      Prefer ffprobe (precise); fall back to the transcript's last word time
//      when ffprobe isn't available or the source isn't a video file.
//
// All operations preserve user-authored layers/deltas (the
// "tag-namespace isolation" invariant rewriteCaptionLayers + rewriteCutLayers
// rely on). This helper is additive — it never deletes a user's work.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { AtelierDocument, Asset, Layer, State, VideoTranscript } from "@a-company/atelier-types";
import { parseAtelier, serializeAtelier } from "@a-company/atelier-schema";
import { transcribeProject, type TranscribeOptions, type TranscribeResult } from "../commands/transcribe.js";
import { transcribeMediaFile } from "./transcribe-orchestrator.js";
import { probeDuration } from "./silence-detect.js";

/**
 * Read project.atelier handling both JSON and YAML on-disk formats — the
 * studio's YAML tab can save the doc as YAML and our compose pipeline must
 * survive that. Falls back to the raw JSON.parse path if parseAtelier
 * yields a schema error so the caller's catch can still surface a useful
 * message for malformed docs.
 */
function readAtelierDoc(absPath: string): AtelierDocument {
  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseAtelier(raw);
  if (parsed.success) return parsed.data as AtelierDocument;
  // Defensive fallback for legacy docs that pre-date schema-strictness.
  return JSON.parse(raw) as AtelierDocument;
}

export interface ComposeVideoProjectOptions {
  /** Absolute path to the project root (contains project.atelier). */
  projectDir: string;
  /**
   * Absolute path to the source media file. Used to (a) compute a canonical
   * assetId/layer src reference, and (b) probe duration via ffprobe.
   */
  sourceFile: string;
  /**
   * Whether to run whisper transcription. Default true. When false, only the
   * state-duration + video-layer wiring runs (useful when re-composing a
   * project that already has transcript.json).
   */
  transcribe?: boolean;
  /** Forwarded to `transcribeProject` — model selection, language, etc. */
  transcribeOptions?: TranscribeOptions;
  /**
   * When set, after `transcribeProject` writes the root `transcript.json`
   * the result is mirrored to `<projectDir>/transcripts/<stem>.json` (per
   * #transcribe-orchestrator). Pass the basename of the file the creator
   * just ingested — e.g. `IMG_7347.MOV` for a drag-drop video, or
   * `source.mp4` for the legacy single-source layout. Omit for
   * single-source projects that only need the root `transcript.json`
   * (preserves the legacy `atelier transcribe` contract).
   */
  mediaBasename?: string;
  /**
   * Test injection point — production wiring uses the real `transcribeProject`.
   * Mirrors the same hook on `runMediaIngest`. Used by both the single-source
   * `transcribeProject` path and the per-file `transcribeMediaFile` path
   * (the orchestrator forwards this fn through unchanged).
   */
  transcribeFn?: (dir: string, opts: TranscribeOptions) => Promise<TranscribeResult>;
  /**
   * Test injection point — production wiring uses `probeDuration` (ffprobe).
   * When omitted and ffprobe fails (or isn't installed), we fall back to the
   * transcript's last word end time.
   */
  probeDurationFn?: (sourcePath: string) => Promise<number>;
}

export interface ComposeVideoProjectResult {
  /** The project.atelier as written to disk. */
  doc: AtelierDocument;
  /** True iff a new VideoVisual layer was added (vs. already present). */
  addedVideoLayer: boolean;
  /** Name of the state whose duration was set/updated. */
  targetStateName: string;
  /** Total duration in seconds written into the target state. */
  targetDurationSeconds: number;
  /** Transcription result, when transcription ran. */
  transcribe?: TranscribeResult;
  /**
   * Absolute path to the per-file transcript mirror at
   * `<projectDir>/transcripts/<stem>.json`. Present only when caller passed
   * `mediaBasename` and transcription actually ran (and wasn't a dry-run).
   */
  mirroredTranscriptPath?: string;
}

const POSSIBLE_SOURCE_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];

/**
 * Compose a playable VideoProject from an ingested source + transcript.
 *
 * - Transcribes (unless `transcribe: false`) — caption layers + opacity deltas
 *   land via the existing `rewriteCaptionLayers` pipeline.
 * - Ensures a single VideoVisual layer covers the canvas and references the
 *   ingested source.
 * - Ensures the target state's duration matches the source video (frames),
 *   so the caption deltas (in absolute frames) actually animate in-bounds.
 */
export async function composeVideoProject(
  opts: ComposeVideoProjectOptions,
): Promise<ComposeVideoProjectResult> {
  const projectDir = resolve(opts.projectDir);
  const compositionPath = `${projectDir}/project.atelier`;
  if (!existsSync(compositionPath)) {
    throw new Error(
      `composeVideoProject: missing project.atelier at ${compositionPath}`,
    );
  }

  // 0. Pre-clean stale ingest artifacts so each compose lands a SINGLE source
  //    video + a single set of caption layers/deltas. Without this, every
  //    new ingest stacks source-video-N + caption-N+M layers on top of the
  //    previous media's leftovers, producing the "overlapping text" bug
  //    surfaced 2026-05-27. Creator-owned non-caption / non-source layers
  //    pass through untouched.
  {
    const docPre: AtelierDocument = readAtelierDoc(compositionPath);
    const keptLayers = docPre.layers.filter((layer) => {
      // Drop any prior caption-tagged layer — the transcribe step about to run
      // will rewrite a fresh set keyed to the new transcript.
      if ((layer.tags ?? []).includes("caption")) return false;
      // Drop any prior source-video* layer — ensureVideoLayer will add the
      // correct one for the current ingest below.
      if (/^source-video(-\d+)?$/.test(layer.id)) return false;
      return true;
    });
    // Also reset the caption-deltas in the target state so old caption fade
    // timings don't survive (rewriteCaptionLayers will repopulate).
    const statesPre = { ...docPre.states };
    const targetStateName = "default" in statesPre ? "default" : (Object.keys(statesPre)[0] ?? "default");
    if (statesPre[targetStateName]) {
      const filteredDeltas = (statesPre[targetStateName].deltas ?? []).filter(
        (d) => !d.layerId?.startsWith("caption-"),
      );
      statesPre[targetStateName] = { ...statesPre[targetStateName], deltas: filteredDeltas };
    }
    const cleanedDoc: AtelierDocument = { ...docPre, layers: keptLayers, states: statesPre };
    writeFileSync(compositionPath, JSON.stringify(cleanedDoc, null, 2), "utf-8");
  }

  // 1. Transcribe — writes transcript.json AND rewrites caption layers/deltas
  //    into the document on disk. We re-read the on-disk doc afterwards so
  //    subsequent steps work against the up-to-date composition.
  let transcribeResult: TranscribeResult | undefined;
  let mirroredTranscriptPath: string | undefined;
  const shouldTranscribe = opts.transcribe !== false;
  if (shouldTranscribe) {
    if (opts.mediaBasename) {
      // Multi-media projects — additive per-file mirror via #transcribe-orchestrator.
      // Root `transcript.json` still gets written; the mirror at
      // `transcripts/<stem>.json` is the canonical per-file location.
      const result = await transcribeMediaFile(projectDir, opts.mediaBasename, {
        ...(opts.transcribeOptions ?? {}),
        ...(opts.transcribeFn !== undefined ? { transcribeFn: opts.transcribeFn } : {}),
      });
      transcribeResult = result;
      mirroredTranscriptPath = result.mirroredTranscriptPath;
    } else {
      // Single-source legacy path — only the root transcript is written.
      const fn = opts.transcribeFn ?? transcribeProject;
      transcribeResult = await fn(projectDir, opts.transcribeOptions ?? {});
    }
  }

  // 2. Load the (possibly transcribe-mutated) document.
  let doc: AtelierDocument = readAtelierDoc(compositionPath);

  // 3. Ensure a non-caption VideoVisual layer referencing the source exists.
  //    Use the source basename as the layer src — matches the convention
  //    `loadVideoProject` reads on disk (source.<ext> sits at project root).
  const sourceBasename = canonicalSourceName(opts.sourceFile, projectDir);
  const { doc: docWithVideo, addedVideoLayer } = ensureVideoLayer(doc, sourceBasename);
  doc = docWithVideo;

  // 4. Determine duration. Prefer ffprobe (precise, frame-accurate). Fall back
  //    to the transcript's tail when ffprobe isn't available or fails.
  let durationSeconds: number;
  const probeFn = opts.probeDurationFn ?? probeDuration;
  try {
    durationSeconds = await probeFn(opts.sourceFile);
  } catch {
    durationSeconds = lastTranscriptWordEnd(transcribeResult?.transcript) ?? 0;
  }

  // 5. Write the duration into the target state. `rewriteCaptionLayers` lands
  //    caption deltas in the "default" state (or first state otherwise); we
  //    match that selection so the deltas live in a state whose duration covers
  //    them. State `duration` is in FRAMES, per the AtelierDocument schema.
  const stateNames = Object.keys(doc.states);
  const targetStateName = stateNames.includes("default")
    ? "default"
    : (stateNames[0] ?? "default");

  const fps = doc.canvas.fps;
  const targetDurationFrames = Math.max(1, Math.round(durationSeconds * fps));

  const states = { ...doc.states };
  const existing = states[targetStateName];
  const updatedState: State = existing
    ? { ...existing, duration: Math.max(existing.duration, targetDurationFrames) }
    : { duration: targetDurationFrames, deltas: [] };
  states[targetStateName] = updatedState;
  doc = { ...doc, states };

  writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");

  return {
    doc,
    addedVideoLayer,
    targetStateName,
    targetDurationSeconds: durationSeconds,
    ...(transcribeResult !== undefined ? { transcribe: transcribeResult } : {}),
    ...(mirroredTranscriptPath !== undefined ? { mirroredTranscriptPath } : {}),
  };
}

/**
 * Pick the layer-src string for the ingested video. If the source file lives
 * at the project root as `source.<ext>`, use that name (matches the legacy
 * VideoProject convention). Otherwise use `media/<basename>` (matches the
 * new media-dir convention) when the source is inside the project tree, else
 * fall back to the file's basename.
 */
function canonicalSourceName(sourceFile: string, projectDir: string): string {
  const abs = resolve(sourceFile);
  const projectAbs = resolve(projectDir);
  const ext = extname(abs);
  // source.<ext> at project root → return as-is
  if (POSSIBLE_SOURCE_EXTS.includes(ext.toLowerCase())) {
    const flat = `${projectAbs}/source${ext}`;
    if (resolve(flat) === abs) return `source${ext}`;
  }
  // inside project tree → relative path
  if (abs.startsWith(`${projectAbs}/`)) {
    return abs.slice(projectAbs.length + 1);
  }
  // foreign path → use basename
  return basename(abs);
}

/**
 * Ensure the document has a VideoVisual layer covering the full canvas and
 * pointing at `sourceName`. If one already does (any non-caption layer with
 * a VideoVisual whose src or assetId references the source), pass through
 * untouched. Otherwise prepend a new layer so it renders BELOW any captions
 * (caption layers are drawn last → on top).
 */
export function ensureVideoLayer(
  doc: AtelierDocument,
  sourceName: string,
): { doc: AtelierDocument; addedVideoLayer: boolean } {
  // Detect: does any layer already reference this source as a VideoVisual?
  const alreadyReferenced = doc.layers.some((layer) => {
    const v = layer.visual as { type?: string; src?: string; assetId?: string } | undefined;
    if (!v || v.type !== "video") return false;
    if (v.src === sourceName) return true;
    // If there's a matching asset entry, accept assetId references too.
    const assets = doc.assets;
    if (v.assetId && assets && assets[v.assetId]?.src === sourceName) return true;
    return false;
  });

  if (alreadyReferenced) return { doc, addedVideoLayer: false };

  // Register an asset entry so the layer can refer to it by id (mirrors the
  // VideoProject scaffold's pattern; consumers that walk `assets` will see
  // the source).
  const assetId = pickAssetId(doc.assets ?? {}, "src");
  const newAsset: Asset = {
    type: "video",
    src: sourceName,
    description: `Source: ${sourceName}`,
  };
  const assets: Record<string, Asset> = {
    ...(doc.assets ?? {}),
    [assetId]: newAsset,
  };

  const newLayer: Layer = {
    id: pickLayerId(doc.layers, "source-video"),
    visual: {
      type: "video",
      assetId,
      src: sourceName,
      startFrame: 0,
      sourceOffset: 0,
      playbackRate: 1.0,
      objectFit: "contain",
    },
    frame: { x: 0, y: 0 },
    bounds: { width: doc.canvas.width, height: doc.canvas.height },
  };

  // Prepend so the video renders beneath any caption-tagged layers.
  const newDoc: AtelierDocument = {
    ...doc,
    ...(Object.keys(assets).length > 0 ? { assets } : {}),
    layers: [newLayer, ...doc.layers],
  };
  return { doc: newDoc, addedVideoLayer: true };
}

function pickAssetId(existing: Record<string, unknown>, preferred: string): string {
  if (!(preferred in existing)) return preferred;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${preferred}-${i}`;
    if (!(candidate in existing)) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}

function pickLayerId(layers: Layer[], preferred: string): string {
  const ids = new Set(layers.map((l) => l.id));
  if (!ids.has(preferred)) return preferred;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${preferred}-${i}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}

/** Last word end time across all segments, or undefined when no words. */
function lastTranscriptWordEnd(transcript: VideoTranscript | undefined): number | undefined {
  if (!transcript) return undefined;
  let max = 0;
  for (const seg of transcript.segments) {
    for (const w of seg.words) {
      if (w.end > max) max = w.end;
    }
  }
  return max > 0 ? max : undefined;
}
