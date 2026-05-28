// #timeline-ops — pure helpers over an AtelierDocument's track + clip layers.
//
// Extracted from #compose-video-project and generalized for audio tracks.
// All helpers are pure (immutable returns) so they're safe to reuse from
// either the CLI compose path or the MCP/HTTP per-clip ops surface
// (atelier_transcribe_clip, future slice A). No fs / no logging side effects.
//
// Track convention:
//   - track-video-1, track-audio-1 are the stable ids for the primary video
//     and primary audio Group layers. Lazy-created by `ensureTrackLayer`.
//   - Multi-track expansions (track-video-2, etc.) follow the same pattern;
//     `recomputeTimeline` walks any Group layer tagged with "track".

import type {
  AtelierDocument,
  Asset,
  AudioVisual,
  Delta,
  Layer,
  State,
  Timeline,
  TimelineClip,
  TimelineTrack,
  VideoTranscript,
  VideoVisual,
} from "@a-company/atelier-types";

import { buildCaptionLayers, type BuildCaptionsOptions } from "./caption-builder.js";

/** Stable id for the lazily-created primary video track group layer. */
export const VIDEO_TRACK_ID = "track-video-1";

/** Stable id for the lazily-created primary audio track group layer. */
export const AUDIO_TRACK_ID = "track-audio-1";

/**
 * Frame at which the next clip on `trackId` should start —
 *   max(startFrame + clipDurationFrames) across all children parented to the
 *   track, or 0 when the track is empty.
 *
 * Works for both video AND audio children: AudioVisual carries the same
 * startFrame / sourceOffset / sourceEnd fields as VideoVisual, so the math is
 * identical. Layers whose visual type is neither video nor audio are skipped.
 */
export function endOfTrackFrame(
  layers: Layer[],
  trackId: string,
  fps: number,
): number {
  let maxEnd = 0;
  for (const layer of layers) {
    if (layer.parentId !== trackId) continue;
    const v = layer.visual;
    if (v.type !== "video" && v.type !== "audio") continue;
    const tv = v as VideoVisual | AudioVisual;
    const start = tv.startFrame ?? 0;
    const offset = tv.sourceOffset ?? 0;
    const end = tv.sourceEnd;
    if (end === undefined) continue;
    const durFrames = Math.max(0, Math.round((end - offset) * fps));
    const layerEnd = start + durFrames;
    if (layerEnd > maxEnd) maxEnd = layerEnd;
  }
  return maxEnd;
}

/**
 * Lazy-create a track Group layer if missing. Idempotent: returns
 * `{ created: false }` and the original doc if a layer with the given id
 * already exists.
 *
 * The track group spans the full canvas and is tagged ["track", kind] so
 * `recomputeTimeline` can discriminate video vs audio tracks by tag.
 */
export function ensureTrackLayer(
  doc: AtelierDocument,
  trackId: string,
  kind: "video" | "audio",
): { doc: AtelierDocument; created: boolean } {
  const exists = doc.layers.some((l) => l.id === trackId);
  if (exists) return { doc, created: false };

  const trackLayer: Layer = {
    id: trackId,
    tags: ["track", kind],
    description: kind === "video" ? "Video track 1" : "Audio track 1",
    visual: { type: "group" },
    frame: { x: 0, y: 0 },
    bounds: { width: doc.canvas.width, height: doc.canvas.height },
  };
  // Prepend so tracks render under their children when read top-down.
  return {
    doc: { ...doc, layers: [trackLayer, ...doc.layers] },
    created: true,
  };
}

/** Args for ensureClipLayer — supports both video and audio clips. */
export interface EnsureClipArgs {
  /** Stable layer id (e.g. "clip-img-7346" or "aud-music"). */
  clipLayerId: string;
  /** Which track this clip lives on — VIDEO_TRACK_ID or AUDIO_TRACK_ID. */
  trackId: string;
  /** Asset src — e.g. "media/IMG_7346.MOV" or "media/track.mp3". */
  sourceName: string;
  /** Source duration in seconds (used for sourceEnd default). */
  clipDurationSeconds: number;
  /** Source duration in frames — caller pre-converts to avoid fps coupling. */
  clipDurationFrames: number;
  /** Clip kind. */
  kind: "video" | "audio";
  /** Explicit composition-frame override; defaults to endOfTrackFrame(). */
  startFrame?: number;
  /** Seconds into source to begin from; default 0. */
  sourceOffset?: number;
  /** Seconds into source to stop at; default clipDurationSeconds. */
  sourceEnd?: number;
}

/**
 * Idempotent clip-layer placement, generalized for video AND audio.
 *
 * - If a layer with `clipLayerId` already exists: leave it untouched and
 *   return `{ addedLayer: false }`. Idempotence preserves user trim / volume
 *   on re-ingest of the same source.
 * - Otherwise: lazy-create the track group (via `ensureTrackLayer`) then
 *   append a new VideoVisual or AudioVisual clip parented to that track.
 *
 * For video clips: bounds match the canvas, objectFit defaults to "contain".
 * For audio clips: bounds are 0×0 (no visible footprint).
 */
export function ensureClipLayer(
  doc: AtelierDocument,
  args: EnsureClipArgs,
): { doc: AtelierDocument; addedLayer: boolean; clipLayerId: string } {
  const existing = doc.layers.find((l) => l.id === args.clipLayerId);
  if (existing) {
    return { doc, addedLayer: false, clipLayerId: args.clipLayerId };
  }

  // Lazy-create the track group if needed.
  const ensured = ensureTrackLayer(doc, args.trackId, args.kind);
  const working = ensured.doc;

  // Compute end-of-track startFrame when no override supplied.
  const startFrame =
    args.startFrame !== undefined
      ? args.startFrame
      : endOfTrackFrame(working.layers, args.trackId, working.canvas.fps);

  const sourceOffset = args.sourceOffset ?? 0;
  const sourceEnd = args.sourceEnd ?? args.clipDurationSeconds;

  // Register an asset entry keyed by the layer id (one-to-one).
  const newAsset: Asset = {
    type: args.kind === "video" ? "video" : "audio",
    src: args.sourceName,
    description: `Source: ${args.sourceName}`,
  };
  const assets: Record<string, Asset> = {
    ...(working.assets ?? {}),
    [args.clipLayerId]: newAsset,
  };

  let newClip: Layer;
  if (args.kind === "video") {
    const visual: VideoVisual = {
      type: "video",
      assetId: args.clipLayerId,
      src: args.sourceName,
      startFrame,
      sourceOffset,
      sourceEnd,
      playbackRate: 1.0,
      objectFit: "contain",
    };
    newClip = {
      id: args.clipLayerId,
      parentId: args.trackId,
      visual,
      frame: { x: 0, y: 0 },
      bounds: { width: working.canvas.width, height: working.canvas.height },
    };
  } else {
    // Audio: no objectFit / no playbackRate default; zero-bounds (no visible).
    const visual: AudioVisual = {
      type: "audio",
      assetId: args.clipLayerId,
      src: args.sourceName,
      startFrame,
      sourceOffset,
      sourceEnd,
    };
    newClip = {
      id: args.clipLayerId,
      parentId: args.trackId,
      visual,
      frame: { x: 0, y: 0 },
      bounds: { width: 0, height: 0 },
    };
  }

  return {
    doc: {
      ...working,
      assets,
      layers: [...working.layers, newClip],
    },
    addedLayer: true,
    clipLayerId: args.clipLayerId,
  };
}

/**
 * Recompute the derived `timeline` summary block from current track + clip
 * layers. Walks every Group layer tagged "track" and emits one
 * TimelineTrack per group; each track's `kind` is read from its tags.
 *
 * Children are filtered to match the track's kind — video clips on the
 * video track, audio clips on the audio track. Cross-kind children are
 * skipped (the schema can't enforce this, but tooling should).
 *
 * Preserves byte-stability for legacy single-source projects: if no track
 * groups exist, the doc's timeline field is dropped (returns the doc
 * unchanged when it was already absent).
 */
export function recomputeTimeline(doc: AtelierDocument): AtelierDocument {
  const fps = doc.canvas.fps;

  const trackGroups = doc.layers.filter(
    (l) => l.visual.type === "group" && (l.tags ?? []).includes("track"),
  );

  if (trackGroups.length === 0) {
    // Strip any stale timeline summary so we don't leave a misleading block.
    if (doc.timeline === undefined) return doc;
    const { timeline: _omit, ...rest } = doc;
    void _omit;
    return rest as AtelierDocument;
  }

  const tracks: TimelineTrack[] = [];
  let totalFrames = 0;

  for (const track of trackGroups) {
    const tags = track.tags ?? [];
    const kind: "video" | "audio" = tags.includes("audio") ? "audio" : "video";

    const children = doc.layers.filter(
      (l) => l.parentId === track.id && l.visual.type === kind,
    );

    const clips: TimelineClip[] = children
      .map((layer) => {
        const v = layer.visual as VideoVisual | AudioVisual;
        const start = v.startFrame ?? 0;
        const offset = v.sourceOffset ?? 0;
        const end = v.sourceEnd ?? offset;
        const durFrames = Math.max(0, Math.round((end - offset) * fps));
        return {
          layerId: layer.id,
          startFrame: start,
          endFrame: start + durFrames,
          source: v.src ?? "",
        } satisfies TimelineClip;
      })
      .sort((a, b) => a.startFrame - b.startFrame);

    const trackEnd = clips.reduce((m, c) => Math.max(m, c.endFrame), 0);
    if (trackEnd > totalFrames) totalFrames = trackEnd;

    tracks.push({ id: track.id, kind, clips });
  }

  const timeline: Timeline = { fps, totalFrames, tracks };
  return { ...doc, timeline };
}

/**
 * Drop caption layers + their deltas for ONLY the given clip layer.
 * Caption layers belonging to OTHER clips pass through untouched —
 * the multi-clip preservation invariant.
 *
 * Also drops unparented caption layers (the legacy `rewriteCaptionLayers`
 * byproduct from #caption-builder). Caption layers parented to other
 * clips are preserved verbatim.
 */
export function stripStaleCaptionArtifacts(
  doc: AtelierDocument,
  clipLayerId: string,
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
    if (layer.parentId === clipLayerId) {
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

/**
 * Build + attach captions to a clip, parented and clip-local.
 *
 * Drops any prior `cap-<clipSlug>-*` layers for THIS clip + their deltas
 * before rebuilding (idempotent re-run safety). Other clips' captions are
 * untouched.
 *
 * Caption frame ranges are CLIP-LOCAL (transcript times are relative to the
 * source = 0); the renderer's parent-aware clip-local-time pass shifts them
 * into composition frames at render-time.
 *
 * `clipSlug` is derived from `clipLayerId` by stripping the leading
 * `clip-` prefix; fall back to the full id when the prefix isn't present.
 */
export function rebuildClipCaptions(
  doc: AtelierDocument,
  clipLayerId: string,
  transcript: VideoTranscript,
  canvas: AtelierDocument["canvas"],
  captionOptions?: BuildCaptionsOptions,
): AtelierDocument {
  const clipSlug = clipLayerId.startsWith("clip-")
    ? clipLayerId.slice("clip-".length)
    : clipLayerId;

  // 1. Drop any prior captions for THIS clip (idempotent re-run).
  let working = stripCaptionsForClip(doc, clipLayerId);

  // 2. Build fresh caption layers from the transcript.
  const built = buildCaptionLayers(transcript, canvas, captionOptions ?? {});

  // 3. Rename ids to `cap-<clipSlug>-N` and parent to the clip layer.
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

  working = { ...working, layers: [...working.layers, ...renamedLayers] };

  // 4. Land caption deltas in the target state ("default" if present, else
  //    first state, else a fresh "default").
  const stateNames = Object.keys(working.states);
  const targetStateName = stateNames.includes("default")
    ? "default"
    : (stateNames[0] ?? "default");
  const states = { ...working.states };
  const existing = states[targetStateName];
  if (existing) {
    states[targetStateName] = {
      ...existing,
      deltas: [...existing.deltas, ...renamedDeltas],
    };
  } else {
    states[targetStateName] = { duration: 0, deltas: renamedDeltas };
  }

  return { ...working, states };
}

/**
 * Internal helper — drops caption layers + deltas tied SOLELY to the given
 * clip. Does NOT touch unparented captions or other clips' captions.
 * Used by rebuildClipCaptions to wipe its own prior output before
 * re-emitting.
 */
function stripCaptionsForClip(
  doc: AtelierDocument,
  clipLayerId: string,
): AtelierDocument {
  const droppedIds = new Set<string>();
  const keptLayers = doc.layers.filter((layer) => {
    if (!(layer.tags ?? []).includes("caption")) return true;
    if (layer.parentId === clipLayerId) {
      droppedIds.add(layer.id);
      return false;
    }
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
