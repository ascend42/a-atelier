// #mcp-timeline-ops — clip + caption timeline helpers for the MCP clip tools.
//
// **Intentional duplication** of `packages/cli/src/lib/timeline-ops.ts` plus
// the transitively-required slugifier / caption-builder / phrase-grouper.
// MCP cannot import from `@a-company/atelier` (the CLI package) because
// `cli → mcp` already runs in the dep graph — re-importing back would close
// the cycle. The same duplication convention is used by recipes.ts /
// overlays.ts / effective-transcript.ts / media-notes.ts (all carry a
// "re-implemented from cli/..." header comment).
//
// If the canonical helpers in cli/lib/timeline-ops.ts change semantics, this
// file MUST be kept in sync — there is no shared package between mcp and cli
// for these primitives in v1.0. Lifting timeline-ops into a shared package
// (e.g. `atelier-timeline`) is tracked as a Unit-0.5 follow-up.
//
// Track convention (matches cli/timeline-ops):
//   - track-video-1, track-audio-1 are the stable ids for the primary video
//     and primary audio Group layers. Lazy-created by `ensureTrackLayer`.

import { basename, extname } from "node:path";
import { spawn } from "node:child_process";

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
  TranscriptWord,
  VideoTranscript,
  VideoVisual,
} from "@a-company/atelier-types";

/** Stable id for the lazily-created primary video track group layer. */
export const VIDEO_TRACK_ID = "track-video-1";

/** Stable id for the lazily-created primary audio track group layer. */
export const AUDIO_TRACK_ID = "track-audio-1";

// ─── Slugifier (duplicated from cli/compose-video-project.ts) ─────

/**
 * Slug an arbitrary basename into a kebab-case identifier suitable for layer /
 * asset ids: lowercase, strip extension, replace runs of non-[a-z0-9] with `-`,
 * trim leading/trailing dashes. e.g. `IMG_7346.MOV` → `img-7346`.
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

// ─── Track + clip helpers (duplicated from cli/timeline-ops.ts) ───

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

/** Lazy-create a track Group layer if missing. Idempotent. */
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
  return {
    doc: { ...doc, layers: [trackLayer, ...doc.layers] },
    created: true,
  };
}

/** Args for ensureClipLayer — supports both video and audio clips. */
export interface EnsureClipArgs {
  clipLayerId: string;
  trackId: string;
  sourceName: string;
  clipDurationSeconds: number;
  clipDurationFrames: number;
  kind: "video" | "audio";
  startFrame?: number;
  sourceOffset?: number;
  sourceEnd?: number;
}

/**
 * Idempotent clip-layer placement, generalized for video AND audio.
 * Mirror of cli/timeline-ops.ts:ensureClipLayer.
 */
export function ensureClipLayer(
  doc: AtelierDocument,
  args: EnsureClipArgs,
): { doc: AtelierDocument; addedLayer: boolean; clipLayerId: string } {
  const existing = doc.layers.find((l) => l.id === args.clipLayerId);
  if (existing) {
    return { doc, addedLayer: false, clipLayerId: args.clipLayerId };
  }

  const ensured = ensureTrackLayer(doc, args.trackId, args.kind);
  const working = ensured.doc;

  const startFrame =
    args.startFrame !== undefined
      ? args.startFrame
      : endOfTrackFrame(working.layers, args.trackId, working.canvas.fps);

  const sourceOffset = args.sourceOffset ?? 0;
  const sourceEnd = args.sourceEnd ?? args.clipDurationSeconds;

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

/** Recompute the derived `timeline` summary block. Mirror of cli helper. */
export function recomputeTimeline(doc: AtelierDocument): AtelierDocument {
  const fps = doc.canvas.fps;
  const trackGroups = doc.layers.filter(
    (l) => l.visual.type === "group" && (l.tags ?? []).includes("track"),
  );

  if (trackGroups.length === 0) {
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

/** Drop caption artifacts that conflict with a fresh rebuild of `clipLayerId`. */
export function stripStaleCaptionArtifacts(
  doc: AtelierDocument,
  clipLayerId: string,
): AtelierDocument {
  const droppedIds = new Set<string>();
  const keptLayers = doc.layers.filter((layer) => {
    if (!(layer.tags ?? []).includes("caption")) return true;
    if (!layer.parentId) {
      droppedIds.add(layer.id);
      return false;
    }
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

// ─── Caption builder (duplicated from cli/caption-builder.ts) ────

export interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  color?: string;
  yRatio?: number;
  widthRatio?: number;
  fadeSeconds?: number;
}

export interface BuildCaptionsOptions {
  style?: CaptionStyle;
  maxWords?: number;
  pauseGap?: number;
}

const DEFAULT_STYLE: Required<CaptionStyle> = {
  fontFamily: "Inter",
  fontSize: 84,
  fontWeight: "bold" as const,
  textAlign: "center" as const,
  color: "#FFFFFF",
  yRatio: 0.85,
  widthRatio: 0.9,
  fadeSeconds: 0.05,
};

const DEFAULT_PHRASE_MAX_WORDS = 5;
const DEFAULT_PHRASE_PAUSE_GAP_SECONDS = 0.4;
const END_PUNCT = /[.!?,;:]\s*$/;

interface CaptionPhrase {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

function flattenWords(transcript: VideoTranscript): TranscriptWord[] {
  return transcript.segments.flatMap((s) => s.words);
}

function groupIntoPhrases(
  transcript: VideoTranscript,
  options: { maxWords?: number; pauseGap?: number } = {},
): CaptionPhrase[] {
  const maxWords = options.maxWords ?? DEFAULT_PHRASE_MAX_WORDS;
  const pauseGap = options.pauseGap ?? DEFAULT_PHRASE_PAUSE_GAP_SECONDS;

  const phrases: CaptionPhrase[] = [];
  const visibleWords = flattenWords(transcript).filter((w) => !w.hidden);

  let current: TranscriptWord[] = [];
  for (let i = 0; i < visibleWords.length; i++) {
    const w = visibleWords[i];
    current.push(w);

    const next = visibleWords[i + 1];
    const gap = next ? next.start - w.end : 0;
    const endsOnPunct = END_PUNCT.test(w.text);
    const atMax = current.length >= maxWords;

    if (!next || atMax || endsOnPunct || gap > pauseGap) {
      phrases.push({
        start: current[0].start,
        end: current[current.length - 1].end,
        text: current.map((c) => c.text).join(" "),
        words: current,
      });
      current = [];
    }
  }

  return phrases;
}

function buildCaptionLayers(
  transcript: VideoTranscript,
  canvas: AtelierDocument["canvas"],
  options: BuildCaptionsOptions = {},
): { layers: Layer[]; deltas: Delta[] } {
  const style = { ...DEFAULT_STYLE, ...options.style };
  const phrases = groupIntoPhrases(transcript, {
    maxWords: options.maxWords,
    pauseGap: options.pauseGap,
  });

  const layers: Layer[] = [];
  const deltas: Delta[] = [];
  const fps = canvas.fps;

  phrases.forEach((phrase, idx) => {
    const layerId = `caption-${idx}`;
    layers.push(buildPhraseLayer(layerId, phrase, canvas, style));
    deltas.push(...buildPhraseDeltas(layerId, phrase, style.fadeSeconds, fps));
  });

  return { layers, deltas };
}

function buildPhraseLayer(
  id: string,
  phrase: CaptionPhrase,
  canvas: AtelierDocument["canvas"],
  style: Required<CaptionStyle>,
): Layer {
  return {
    id,
    tags: ["caption"],
    visual: {
      type: "text",
      content: phrase.text,
      style: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        color: style.color,
      },
    },
    frame: {
      x: canvas.width / 2,
      y: canvas.height * style.yRatio,
    },
    bounds: {
      width: canvas.width * style.widthRatio,
      height: Math.max(120, style.fontSize * 1.6),
    },
    anchorPoint: { x: 0.5, y: 0.5 },
    opacity: 0,
  };
}

function buildPhraseDeltas(
  layerId: string,
  phrase: CaptionPhrase,
  fadeSeconds: number,
  fps: number,
): Delta[] {
  const fadeFrames = Math.max(1, Math.round(fadeSeconds * fps));
  const startFrame = Math.floor(phrase.start * fps);
  const endFrame = Math.ceil(phrase.end * fps);
  const fadeOutStart = Math.max(startFrame + 1, endFrame - fadeFrames);

  return [
    {
      layer: layerId,
      property: "opacity",
      range: [Math.max(0, startFrame - fadeFrames), startFrame],
      from: 0,
      to: 1,
      easing: "ease-out",
    },
    {
      layer: layerId,
      property: "opacity",
      range: [fadeOutStart, endFrame],
      from: 1,
      to: 0,
      easing: "ease-in",
    },
  ];
}

/**
 * Drop caption layers + deltas tied SOLELY to `clipLayerId`. Other clips' captions
 * pass through untouched.
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

/**
 * Build + attach captions to a clip, parented and clip-local.
 * Mirror of cli/timeline-ops.ts:rebuildClipCaptions.
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

  let working = stripCaptionsForClip(doc, clipLayerId);

  const built = buildCaptionLayers(transcript, canvas, captionOptions ?? {});

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

// ─── ffprobe (duplicated from cli/silence-detect.ts) ──────────────

/**
 * Probe source media duration via ffprobe, in seconds. Duplicated from
 * cli/silence-detect.ts so the MCP package doesn't need to depend on cli.
 */
export async function probeDuration(sourcePath: string): Promise<number> {
  const stdout = await runCapture("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    sourcePath,
  ]);
  const n = parseFloat(stdout.trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ffprobe returned invalid duration for ${sourcePath}: "${stdout}"`);
  }
  return n;
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr}`));
    });
  });
}
