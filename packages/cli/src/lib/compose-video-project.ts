// #compose-video-project — turn an ingested video + transcript into a playable
// project.atelier document, supporting MULTI-CLIP timelines.
//
// Both `atelier media ingest` (CLI) and `POST /api/media/ingest` (studio HTTP)
// call this helper so the post-ingest state is identical regardless of entry
// point. After this runs, opening the project in the studio shows ALL
// previously-ingested clips on the video track in order, with per-clip caption
// overlays animating — the "v1 UX bundle" payoff, now multi-clip aware.
//
// Pipeline (additive; safe to re-run; preserves prior clips):
//   1. Transcribe the source. The legacy `transcribeProject` /
//      `transcribeMediaFile` writes `transcript.json` (and per-file mirror) AND
//      runs `rewriteCaptionLayers` as a side effect — landing unparented
//      `caption-N` layers + deltas in the doc. We compensate by re-reading
//      the doc and dropping those unparented caption layers; we rebuild
//      properly-parented `cap-<slug>-N` layers below from the same transcript.
//   2. Ensure the doc has a lazily-created `track-video-1` Group layer.
//   3. Ensure the doc has a `clip-<slug>` VideoVisual layer parented to that
//      track. New ingest → appended at end-of-track startFrame; re-ingest of
//      the same src → placement preserved, captions refreshed.
//   4. Append per-clip caption layers parented to `clip-<slug>` with
//      ids `cap-<slug>-N`. Other clips' captions are NOT touched.
//   5. Recompute the derived `timeline` summary block (track + clips).
//   6. State duration = max(existing, max(clip.endFrame)).
//
// Tag-namespace isolation:
//   - Layers tagged "caption" are mutated only when:
//       * unparented (the legacy `rewriteCaptionLayers` byproduct), OR
//       * parented to the clip currently being (re-)ingested.
//     Other clips' caption layers + their deltas pass through untouched.
//   - Layers tagged "track" / "video" track group are lazy-created and reused.
//   - All other user-authored layers/deltas are preserved.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type {
  AtelierDocument,
  Asset,
  Delta,
  Layer,
  State,
  Timeline,
  TimelineClip,
  TimelineTrack,
  VideoTranscript,
  VideoVisual,
} from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { transcribeProject, type TranscribeOptions, type TranscribeResult } from "../commands/transcribe.js";
import { transcribeMediaFile } from "./transcribe-orchestrator.js";
import { probeDuration } from "./silence-detect.js";
import { buildCaptionLayers, type BuildCaptionsOptions } from "./caption-builder.js";

/** Stable id for the lazily-created primary video track group layer. */
const VIDEO_TRACK_ID = "track-video-1";

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
  /** Optional caption style overrides passed through to `buildCaptionLayers`. */
  captionOptions?: BuildCaptionsOptions;
}

export interface ComposeVideoProjectResult {
  /** The project.atelier as written to disk. */
  doc: AtelierDocument;
  /** True iff a NEW clip layer was added (false on re-ingest of the same src). */
  addedVideoLayer: boolean;
  /** Slug derived from the source basename — `clip-<slug>` is the clip layer id. */
  clipSlug: string;
  /** Id of the clip layer just (re-)ingested. */
  clipLayerId: string;
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
 * Slug an arbitrary basename into a kebab-case identifier suitable for layer /
 * asset ids: lowercase, strip extension, replace runs of non-[a-z0-9] with `-`,
 * trim leading/trailing dashes. e.g. `IMG_7346.MOV` → `img-7346`,
 * `media/B-roll Clip.mp4` → `b-roll-clip`.
 *
 * Exported so tests can derive expected layer ids without hardcoding.
 */
export function slugifyBasename(name: string): string {
  const base = basename(name);
  const stem = stripExt(base);
  const lower = stem.toLowerCase();
  const replaced = lower.replace(/[^a-z0-9]+/g, "-");
  return replaced.replace(/^-+|-+$/g, "");
}

function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * Compose a playable VideoProject from an ingested source + transcript.
 *
 * - Transcribes (unless `transcribe: false`) — writes the transcript file(s).
 *   The legacy caption-rewrite side effect is neutralized below.
 * - Lazy-creates the `track-video-1` Group layer if absent.
 * - Appends a `clip-<slug>` VideoVisual layer parented to the track at the
 *   end-of-track startFrame (or preserves placement on re-ingest of the same).
 * - Rebuilds per-clip captions as `cap-<slug>-N` parented to `clip-<slug>`,
 *   leaving other clips' captions untouched.
 * - Regenerates the derived `timeline` summary block.
 * - Sets the target state's duration to cover all clips on all tracks.
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

  const sourceBasename = canonicalSourceName(opts.sourceFile, projectDir);
  const clipSlug = slugifyBasename(sourceBasename);
  if (!clipSlug) {
    throw new Error(
      `composeVideoProject: cannot derive a slug from source "${opts.sourceFile}"`,
    );
  }
  const clipLayerId = `clip-${clipSlug}`;

  // 1. Transcribe — writes transcript file(s). NOTE: the underlying
  //    `transcribeProject` ALSO calls `rewriteCaptionLayers` as a side effect,
  //    landing unparented `caption-N` layers + deltas in the doc on disk. We
  //    re-read after, then strip those unparented caption artifacts in step 3
  //    before rebuilding properly-parented captions for THIS clip.
  let transcribeResult: TranscribeResult | undefined;
  let mirroredTranscriptPath: string | undefined;
  const shouldTranscribe = opts.transcribe !== false;
  if (shouldTranscribe) {
    if (opts.mediaBasename) {
      // Multi-media projects — additive per-file mirror via #transcribe-orchestrator.
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

  // 3. Pre-clean: drop caption artifacts that conflict with the rebuild below.
  //    - Unparented `caption-N` layers come from the legacy `rewriteCaptionLayers`
  //      side effect of the just-completed transcribe step. They MUST go (we'll
  //      replace them with parented `cap-<slug>-N` from the same transcript).
  //    - Any prior `cap-<clipSlug>-*` layers belong to a previous ingest of
  //      THIS exact clip — drop them, fresh rebuild incoming.
  //    - Caption layers parented to OTHER clips pass through untouched (this
  //      is the multi-clip preservation invariant).
  //    In test environments the stub `transcribeFn` typically doesn't mutate
  //    the doc, so the first bullet is a no-op; the logic is for production.
  doc = stripStaleCaptionArtifacts(doc, clipLayerId);

  // 4. Ensure the video track group exists, then ensure a `clip-<slug>` layer
  //    parented to it. New ingest → append at end-of-track. Re-ingest of the
  //    same src → leave placement alone (preserve user trim, etc.).
  const probeFn = opts.probeDurationFn ?? probeDuration;
  let clipDurationSeconds: number;
  try {
    clipDurationSeconds = await probeFn(opts.sourceFile);
  } catch {
    clipDurationSeconds = lastTranscriptWordEnd(transcribeResult?.transcript) ?? 0;
  }

  const fps = doc.canvas.fps;
  const clipDurationFrames = Math.max(1, Math.round(clipDurationSeconds * fps));

  const { doc: docWithClip, addedVideoLayer } = ensureClipLayer(doc, {
    clipLayerId,
    sourceName: sourceBasename,
    clipDurationSeconds,
    clipDurationFrames,
  });
  doc = docWithClip;

  // 5. Rebuild captions for THIS clip from the transcript, parented to the
  //    clip layer. `buildCaptionLayers` emits clip-LOCAL frame ranges (since
  //    transcript times are relative to the source = 0); the renderer's
  //    parent-aware clip-local-time pass shifts them into composition frames
  //    at render-time. We just rename ids + set parentId.
  if (transcribeResult?.transcript) {
    const built = buildCaptionLayers(
      transcribeResult.transcript,
      doc.canvas,
      opts.captionOptions ?? {},
    );
    const idMap = new Map<string, string>();
    const renamedLayers: Layer[] = built.layers.map((layer, idx) => {
      const newId = `cap-${clipSlug}-${idx}`;
      idMap.set(layer.id, newId);
      return { ...layer, id: newId, parentId: clipLayerId };
    });
    const renamedDeltas: Delta[] = built.deltas.map((d) => ({
      ...d,
      layer: idMap.get(d.layer) ?? d.layer,
    }));

    doc = {
      ...doc,
      layers: [...doc.layers, ...renamedLayers],
    };

    // Land caption deltas in the target state.
    const stateNames = Object.keys(doc.states);
    const captionStateName = stateNames.includes("default")
      ? "default"
      : (stateNames[0] ?? "default");
    const captionStates = { ...doc.states };
    const existingCap = captionStates[captionStateName];
    if (existingCap) {
      captionStates[captionStateName] = {
        ...existingCap,
        deltas: [...existingCap.deltas, ...renamedDeltas],
      };
    } else {
      captionStates[captionStateName] = {
        duration: 0,
        deltas: renamedDeltas,
      };
    }
    doc = { ...doc, states: captionStates };
  }

  // 6. Recompute the derived `timeline` summary block from current clip layers.
  doc = recomputeTimeline(doc);

  // 7. Write the duration into the target state. State `duration` is in FRAMES;
  //    must cover the latest clip's endFrame across all tracks.
  const stateNames = Object.keys(doc.states);
  const targetStateName = stateNames.includes("default")
    ? "default"
    : (stateNames[0] ?? "default");

  const totalFrames = doc.timeline?.totalFrames ?? 0;

  const states = { ...doc.states };
  const existing = states[targetStateName];
  const updatedState: State = existing
    ? { ...existing, duration: Math.max(existing.duration, totalFrames) }
    : { duration: totalFrames, deltas: [] };
  states[targetStateName] = updatedState;
  doc = { ...doc, states };

  writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");

  return {
    doc,
    addedVideoLayer,
    clipSlug,
    clipLayerId,
    targetStateName,
    targetDurationSeconds: clipDurationSeconds,
    ...(transcribeResult !== undefined ? { transcribe: transcribeResult } : {}),
    ...(mirroredTranscriptPath !== undefined ? { mirroredTranscriptPath } : {}),
  };
}

/**
 * Strip caption-layer + delta artifacts that conflict with the per-clip
 * rebuild incoming. Drops:
 *   - Unparented `caption-N` (legacy rewriteCaptionLayers byproduct)
 *   - `cap-<clipSlug>-*` (this clip's prior captions, about to be rebuilt)
 * Preserves every caption layer parented to ANOTHER clip.
 */
function stripStaleCaptionArtifacts(
  doc: AtelierDocument,
  thisClipLayerId: string,
): AtelierDocument {
  const droppedIds = new Set<string>();
  const keptLayers = doc.layers.filter((layer) => {
    if (!(layer.tags ?? []).includes("caption")) return true;
    // Unparented caption layer — legacy artifact, drop.
    if (!layer.parentId) {
      droppedIds.add(layer.id);
      return false;
    }
    // Caption belonging to THIS clip — drop, will be rebuilt.
    if (layer.parentId === thisClipLayerId) {
      droppedIds.add(layer.id);
      return false;
    }
    // Belongs to another clip — preserve.
    return true;
  });

  if (droppedIds.size === 0) return doc;

  const states: Record<string, State> = {};
  for (const [name, st] of Object.entries(doc.states)) {
    states[name] = {
      ...st,
      deltas: st.deltas.filter((d) => !droppedIds.has(d.layer)),
    };
  }
  return { ...doc, layers: keptLayers, states };
}

interface EnsureClipArgs {
  clipLayerId: string;
  sourceName: string;
  clipDurationSeconds: number;
  clipDurationFrames: number;
}

/**
 * Idempotent clip-layer placement.
 *
 * - If `clip-<slug>` already exists (re-ingest of the same src): leave it
 *   untouched (preserves user trim) and return `addedVideoLayer: false`.
 * - Otherwise: lazy-create the `track-video-1` Group if missing, then append
 *   a new `VideoVisual` clip layer parented to the track at the end-of-track
 *   startFrame.
 */
export function ensureClipLayer(
  doc: AtelierDocument,
  args: EnsureClipArgs,
): { doc: AtelierDocument; addedVideoLayer: boolean } {
  const existingClip = doc.layers.find((l) => l.id === args.clipLayerId);
  if (existingClip) {
    return { doc, addedVideoLayer: false };
  }

  // Lazy-create the video track group.
  let workingLayers = doc.layers;
  const hasTrack = workingLayers.some((l) => l.id === VIDEO_TRACK_ID);
  if (!hasTrack) {
    const trackLayer: Layer = {
      id: VIDEO_TRACK_ID,
      tags: ["track", "video"],
      description: "Video track 1",
      visual: { type: "group" },
      frame: { x: 0, y: 0 },
      bounds: { width: doc.canvas.width, height: doc.canvas.height },
    };
    workingLayers = [trackLayer, ...workingLayers];
  }

  // Compute end-of-track startFrame for the new clip.
  const startFrame = endOfTrackFrame(workingLayers, VIDEO_TRACK_ID, doc.canvas.fps);

  // Register an asset entry keyed by the layer id (one-to-one — eliminates
  // orphan-asset accumulation).
  const newAsset: Asset = {
    type: "video",
    src: args.sourceName,
    description: `Source: ${args.sourceName}`,
  };
  const assets: Record<string, Asset> = {
    ...(doc.assets ?? {}),
    [args.clipLayerId]: newAsset,
  };

  const visual: VideoVisual = {
    type: "video",
    assetId: args.clipLayerId,
    src: args.sourceName,
    startFrame,
    sourceOffset: 0,
    sourceEnd: args.clipDurationSeconds,
    playbackRate: 1.0,
    objectFit: "contain",
  };

  const newClip: Layer = {
    id: args.clipLayerId,
    parentId: VIDEO_TRACK_ID,
    visual,
    frame: { x: 0, y: 0 },
    bounds: { width: doc.canvas.width, height: doc.canvas.height },
  };

  return {
    doc: {
      ...doc,
      assets,
      layers: [...workingLayers, newClip],
    },
    addedVideoLayer: true,
  };
}

/**
 * Find the highest endFrame across all VideoVisual clip layers parented to
 * the given track. Returns 0 when the track has no clips yet. Clip duration
 * is derived from `(sourceEnd - sourceOffset) * fps` (seconds → frames).
 */
function endOfTrackFrame(layers: Layer[], trackId: string, fps: number): number {
  let maxEnd = 0;
  for (const layer of layers) {
    if (layer.parentId !== trackId) continue;
    const v = layer.visual;
    if (v.type !== "video") continue;
    const start = v.startFrame ?? 0;
    const offset = v.sourceOffset ?? 0;
    const end = v.sourceEnd;
    if (end === undefined) continue;
    const durFrames = Math.max(0, Math.round((end - offset) * fps));
    const layerEnd = start + durFrames;
    if (layerEnd > maxEnd) maxEnd = layerEnd;
  }
  return maxEnd;
}

/** Build the derived `timeline` summary block from the current clip layers. */
function recomputeTimeline(doc: AtelierDocument): AtelierDocument {
  const fps = doc.canvas.fps;
  const clipLayers = doc.layers
    .filter((l) => l.parentId === VIDEO_TRACK_ID && l.visual.type === "video")
    .map((l) => ({ layer: l, visual: l.visual as VideoVisual }));

  // Only attach a `timeline` block when there's at least one track-parented
  // clip — keeps legacy single-source projects unchanged.
  const hasTrack = doc.layers.some((l) => l.id === VIDEO_TRACK_ID);
  if (!hasTrack || clipLayers.length === 0) {
    // Strip any stale timeline so we don't leave a misleading summary.
    if (doc.timeline === undefined) return doc;
    const { timeline: _omit, ...rest } = doc;
    void _omit;
    return rest as AtelierDocument;
  }

  const clips: TimelineClip[] = clipLayers
    .map(({ layer, visual }) => {
      const start = visual.startFrame ?? 0;
      const offset = visual.sourceOffset ?? 0;
      const end = visual.sourceEnd ?? offset;
      const durFrames = Math.max(0, Math.round((end - offset) * fps));
      return {
        layerId: layer.id,
        startFrame: start,
        endFrame: start + durFrames,
        source: visual.src ?? "",
      } satisfies TimelineClip;
    })
    .sort((a, b) => a.startFrame - b.startFrame);

  const totalFrames = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);

  const track: TimelineTrack = {
    id: VIDEO_TRACK_ID,
    kind: "video",
    clips,
  };
  const timeline: Timeline = {
    fps,
    totalFrames,
    tracks: [track],
  };

  return { ...doc, timeline };
}

/**
 * Pick the layer-src string for the ingested video. If the source file lives
 * at the project root as `source.<ext>`, use that name (matches the legacy
 * VideoProject convention). Otherwise use the project-relative path when the
 * source is inside the project tree, else fall back to the file's basename.
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
 * Backwards-compatible `ensureVideoLayer(doc, sourceName)` — kept for the
 * existing tests and any other call-sites. Internally delegates to
 * `ensureClipLayer` so the new multi-clip + parented structure is produced.
 *
 * Note: this signature can't compute a frame-accurate `sourceEnd` (no probe
 * available), so the produced clip has `sourceEnd: undefined` and the
 * timeline block reports zero duration for it. Production code paths go
 * through `composeVideoProject` which does the probe. Tests that exercise
 * `ensureVideoLayer` directly are validating layer-shape, not timeline math.
 */
export function ensureVideoLayer(
  doc: AtelierDocument,
  sourceName: string,
): { doc: AtelierDocument; addedVideoLayer: boolean } {
  const clipSlug = slugifyBasename(sourceName);
  if (!clipSlug) return { doc, addedVideoLayer: false };
  const clipLayerId = `clip-${clipSlug}`;

  // Idempotence preserved by id: if a clip with this id exists, skip.
  // Also accept any pre-existing VideoVisual layer that already references
  // this `sourceName` (legacy `source-video` layers from pre-v1 docs) — this
  // matches the prior `ensureVideoLayer` contract and the existing test for
  // a layer with id "existing" that references `src: source.mp4`.
  const alreadyReferenced = doc.layers.some((layer) => {
    if (layer.id === clipLayerId) return true;
    const v = layer.visual as { type?: string; src?: string; assetId?: string };
    if (!v || v.type !== "video") return false;
    if (v.src === sourceName) return true;
    const assets = doc.assets;
    if (v.assetId && assets && assets[v.assetId]?.src === sourceName) return true;
    return false;
  });
  if (alreadyReferenced) return { doc, addedVideoLayer: false };

  return ensureClipLayer(doc, {
    clipLayerId,
    sourceName,
    clipDurationSeconds: 0,
    clipDurationFrames: 0,
  });
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
