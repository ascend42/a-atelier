// @a-company/atelier-mcp — Clip + slide authoring tools (v1.0 Slice A)
//
// Six tools that give programmatic clip authoring on disk-backed projects:
//   - atelier_add_clip         — register an asset + clip layer on a track
//   - atelier_move_clip        — shift a clip's composition-time startFrame
//   - atelier_trim_clip        — adjust a clip's sourceOffset / sourceEnd
//   - atelier_remove_clip      — drop a clip and its parented captions
//   - atelier_transcribe_clip  — run transcription and (re)build clip captions
//   - atelier_move_slide       — reorder a carousel project's slides array
//
// All take `documentId + projectDir` and round-trip through disk:
//   read project.atelier → mutate → write JSON → reload into the store.
// Mutations land via store.set(documentId, doc, "llm") so the live bridge
// re-broadcasts to attached studio instances.
//
// Dependency note: timeline primitives (track + clip helpers, caption build,
// ffprobe wrap) are duplicated under packages/mcp/src/lib/timeline-ops.ts to
// avoid a cli↔mcp cycle — see that file's header for the rationale.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  AtelierDocument,
  AudioVisual,
  Layer,
  SlideRef,
  State,
  VideoTranscript,
  VideoVisual,
} from "@a-company/atelier-types";
import type { DocumentStore } from "../store.js";
import {
  AUDIO_TRACK_ID,
  VIDEO_TRACK_ID,
  ensureClipLayer,
  probeDuration as defaultProbeDuration,
  rebuildClipCaptions,
  recomputeTimeline,
  slugifyBasename,
} from "../lib/timeline-ops.js";

// ─── Response envelopes (mirror assets.ts) ────────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ─── Disk round-trip helpers ──────────────────────────────────────

interface LoadedDoc {
  doc: AtelierDocument;
  compositionPath: string;
}

function loadDocFromDisk(projectDir: string): LoadedDoc | { error: string } {
  const absProject = resolve(projectDir);
  const compositionPath = join(absProject, "project.atelier");
  if (!existsSync(compositionPath)) {
    return { error: `project.atelier not found at ${compositionPath}` };
  }
  let raw: string;
  try {
    raw = readFileSync(compositionPath, "utf-8");
  } catch (e) {
    return { error: `failed to read ${compositionPath}: ${(e as Error).message}` };
  }
  let doc: AtelierDocument;
  try {
    doc = JSON.parse(raw) as AtelierDocument;
  } catch (e) {
    return { error: `failed to parse ${compositionPath}: ${(e as Error).message}` };
  }
  return { doc, compositionPath };
}

function persistDoc(
  store: DocumentStore,
  documentId: string,
  doc: AtelierDocument,
  compositionPath: string,
): void {
  writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");
  if (store.has(documentId)) {
    store.set(documentId, doc, "llm");
  } else {
    store.create(doc, documentId, "llm");
  }
}

/**
 * Resolve a media source to a project-relative `media/<basename>` string +
 * absolute path. Accepts absolute paths anywhere on disk OR project-relative
 * paths. The stored `src` is always relative to projectDir when the file
 * lives under projectDir, otherwise the basename.
 */
function canonicalSourceName(source: string, projectDir: string): { srcRef: string; absPath: string } {
  const absProject = resolve(projectDir);
  const abs = isAbsolute(source) ? source : resolve(absProject, source);
  if (abs.startsWith(`${absProject}/`)) {
    return { srcRef: abs.slice(absProject.length + 1), absPath: abs };
  }
  return { srcRef: basename(abs), absPath: abs };
}

// ─── Endpoint-frame computation for move/trim ─────────────────────

function clipEndFrame(visual: VideoVisual | AudioVisual, fps: number): number {
  const start = visual.startFrame ?? 0;
  const offset = visual.sourceOffset ?? 0;
  const end = visual.sourceEnd ?? offset;
  const durFrames = Math.max(0, Math.round((end - offset) * fps));
  return start + durFrames;
}

// ─── Transcribe injection point ───────────────────────────────────

/**
 * Tool-input fn for transcribing a media file. Mirrors composeVideoProject's
 * `transcribeFn` test-injection pattern. In tests this is stubbed to return a
 * pre-baked transcript; in production a studio host wires this to the real
 * whisper-backed pipeline.
 */
export type TranscribeClipFn = (
  args: { projectDir: string; mediaBasename: string; model?: string },
) => Promise<{ transcript: VideoTranscript; transcriptPath: string }>;

// NOTE: these are module-level globals. Safe under vitest's default worker
// isolation (one process per test file) and under the typical single-process
// stdio server. Running tests with --no-isolate, or instantiating two
// MCP servers in the same process that need different stubs, would race —
// add per-call options to the tool inputs if that becomes a constraint.
let injectedTranscribeFn: TranscribeClipFn | undefined;
let injectedProbeDurationFn: ((sourcePath: string) => Promise<number>) | undefined;

/** Test hook — install a transcribe stub used when a per-call fn isn't passed. */
export function __setTranscribeClipFn(fn: TranscribeClipFn | undefined): void {
  injectedTranscribeFn = fn;
}

/** Test hook — install a probeDuration stub used when a per-call fn isn't passed. */
export function __setProbeDurationFn(fn: ((sourcePath: string) => Promise<number>) | undefined): void {
  injectedProbeDurationFn = fn;
}

// ─── Tool registrations ───────────────────────────────────────────

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_add_clip ────────────────────────────────────────
  server.tool(
    "atelier_add_clip",
    "Register a media source as a clip layer on a video or audio track. Idempotent: " +
      "re-running with the same source preserves the existing clip's placement and " +
      "applies only explicitly-passed startFrame/sourceOffset/sourceEnd overrides.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root (contains project.atelier)"),
      source: z.string().describe("Absolute media path OR project-relative path (e.g. media/clip.mp4)"),
      kind: z.enum(["video", "audio"]).optional().describe("Clip kind (default: video)"),
      trackId: z.string().optional().describe("Track layer id (default: track-video-1 / track-audio-1)"),
      startFrame: z.number().int().nonnegative().optional().describe("Composition-frame start (default: end-of-track)"),
      sourceOffset: z.number().nonnegative().optional().describe("Seconds into source to begin from"),
      sourceEnd: z.number().positive().optional().describe("Seconds into source to stop at"),
      layerIdHint: z.string().optional().describe("Explicit layer id override (default: clip-<slug> or aud-<slug>)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, source, kind, trackId, startFrame, sourceOffset, sourceEnd, layerIdHint }) => {
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      const clipKind: "video" | "audio" = kind ?? "video";
      const resolvedTrackId = trackId ?? (clipKind === "video" ? VIDEO_TRACK_ID : AUDIO_TRACK_ID);

      const { srcRef, absPath } = canonicalSourceName(source, projectDir);
      const slug = slugifyBasename(srcRef);
      if (!slug) return err(`cannot derive a slug from source "${source}"`);

      const layerId = layerIdHint ?? (clipKind === "video" ? `clip-${slug}` : `aud-${slug}`);

      // Probe duration; ffprobe failures fall back to 0 so the clip still lands
      // (mirrors composeVideoProject's fallback contract).
      const probeFn = injectedProbeDurationFn ?? defaultProbeDuration;
      let clipDurationSeconds = 0;
      try {
        clipDurationSeconds = await probeFn(absPath);
      } catch {
        clipDurationSeconds = 0;
      }
      const fps = doc.canvas.fps;
      const clipDurationFrames = Math.max(1, Math.round(clipDurationSeconds * fps));

      // Idempotence: if the layer already exists, apply ONLY explicit overrides.
      const existing = doc.layers.find((l) => l.id === layerId);
      let addedLayer = false;
      if (existing) {
        if (existing.visual.type !== clipKind) {
          return err(`layer "${layerId}" exists but is type "${existing.visual.type}", not "${clipKind}"`);
        }
        const v = existing.visual as VideoVisual | AudioVisual;
        const patched = { ...v };
        if (startFrame !== undefined) patched.startFrame = startFrame;
        if (sourceOffset !== undefined) patched.sourceOffset = sourceOffset;
        if (sourceEnd !== undefined) patched.sourceEnd = sourceEnd;
        doc = {
          ...doc,
          layers: doc.layers.map((l) => (l.id === layerId ? { ...l, visual: patched } : l)),
        };
      } else {
        const ensured = ensureClipLayer(doc, {
          clipLayerId: layerId,
          trackId: resolvedTrackId,
          sourceName: srcRef,
          clipDurationSeconds,
          clipDurationFrames,
          kind: clipKind,
          ...(startFrame !== undefined ? { startFrame } : {}),
          ...(sourceOffset !== undefined ? { sourceOffset } : {}),
          ...(sourceEnd !== undefined ? { sourceEnd } : {}),
        });
        doc = ensured.doc;
        addedLayer = ensured.addedLayer;
      }

      doc = recomputeTimeline(doc);

      const final = doc.layers.find((l) => l.id === layerId);
      if (!final) return err(`internal: layer "${layerId}" missing after ensureClipLayer`);
      const visual = final.visual as VideoVisual | AudioVisual;
      const resolvedStart = visual.startFrame ?? 0;
      const resolvedEnd = clipEndFrame(visual, fps);

      persistDoc(store, documentId, doc, compositionPath);

      return ok({
        layerId,
        trackId: resolvedTrackId,
        startFrame: resolvedStart,
        endFrame: resolvedEnd,
        addedLayer,
      });
    },
  );

  // ── atelier_move_clip ───────────────────────────────────────
  server.tool(
    "atelier_move_clip",
    "Shift a clip's composition-frame start. Caption layers parented to the clip stay " +
      "aligned automatically (renderer uses clip-local time). Recomputes the timeline.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root"),
      layerId: z.string().describe("Layer id of the clip to move"),
      newStartFrame: z.number().int().nonnegative().describe("New composition-frame start"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, layerId, newStartFrame }) => {
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      const layer = doc.layers.find((l) => l.id === layerId);
      if (!layer) return err(`clip layer "${layerId}" not found`);
      if (layer.visual.type !== "video" && layer.visual.type !== "audio") {
        return err(`layer "${layerId}" is type "${layer.visual.type}", not a clip`);
      }

      const oldVisual = layer.visual as VideoVisual | AudioVisual;
      const oldStartFrame = oldVisual.startFrame ?? 0;
      const newVisual = { ...oldVisual, startFrame: newStartFrame };
      doc = {
        ...doc,
        layers: doc.layers.map((l) => (l.id === layerId ? { ...l, visual: newVisual } : l)),
      };
      doc = recomputeTimeline(doc);

      const endFrame = clipEndFrame(newVisual, doc.canvas.fps);
      persistDoc(store, documentId, doc, compositionPath);

      return ok({ layerId, oldStartFrame, newStartFrame, endFrame });
    },
  );

  // ── atelier_trim_clip ───────────────────────────────────────
  server.tool(
    "atelier_trim_clip",
    "Adjust a clip's sourceOffset / sourceEnd (in seconds). Captions outside the new " +
      "effective range are not auto-pruned — the renderer skips out-of-range deltas.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root"),
      layerId: z.string().describe("Layer id of the clip to trim"),
      sourceOffset: z.number().nonnegative().optional().describe("New seconds-into-source start"),
      sourceEnd: z.number().positive().optional().describe("New seconds-into-source end"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, layerId, sourceOffset, sourceEnd }) => {
      if (sourceOffset === undefined && sourceEnd === undefined) {
        return err("at least one of sourceOffset / sourceEnd must be provided");
      }
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      const layer = doc.layers.find((l) => l.id === layerId);
      if (!layer) return err(`clip layer "${layerId}" not found`);
      if (layer.visual.type !== "video" && layer.visual.type !== "audio") {
        return err(`layer "${layerId}" is type "${layer.visual.type}", not a clip`);
      }

      const oldVisual = layer.visual as VideoVisual | AudioVisual;
      const newVisual: VideoVisual | AudioVisual = { ...oldVisual };
      if (sourceOffset !== undefined) newVisual.sourceOffset = sourceOffset;
      if (sourceEnd !== undefined) newVisual.sourceEnd = sourceEnd;
      doc = {
        ...doc,
        layers: doc.layers.map((l) => (l.id === layerId ? { ...l, visual: newVisual } : l)),
      };
      doc = recomputeTimeline(doc);

      persistDoc(store, documentId, doc, compositionPath);

      return ok({
        layerId,
        sourceOffset: newVisual.sourceOffset ?? 0,
        sourceEnd: newVisual.sourceEnd,
        startFrame: newVisual.startFrame ?? 0,
        endFrame: clipEndFrame(newVisual, doc.canvas.fps),
      });
    },
  );

  // ── atelier_remove_clip ────────────────────────────────────
  server.tool(
    "atelier_remove_clip",
    "Remove a clip layer plus all transitively-parented descendants (e.g. its caption " +
      "layers) and any deltas referencing them. Refuses to remove a track group layer.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root"),
      layerId: z.string().describe("Layer id of the clip to remove"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ documentId, projectDir, layerId }) => {
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      const layer = doc.layers.find((l) => l.id === layerId);
      if (!layer) return err(`layer "${layerId}" not found`);
      if ((layer.tags ?? []).includes("track")) {
        return err("Cannot remove track group; use atelier_remove_track (not implemented in v1)");
      }

      // BFS transitive descendants.
      const toRemove = new Set<string>([layerId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const l of doc.layers) {
          if (toRemove.has(l.id)) continue;
          if (l.parentId && toRemove.has(l.parentId)) {
            toRemove.add(l.id);
            grew = true;
          }
        }
      }

      const remainingLayers: Layer[] = doc.layers.filter((l) => !toRemove.has(l.id));
      const newStates: Record<string, State> = {};
      for (const [name, st] of Object.entries(doc.states)) {
        newStates[name] = {
          ...st,
          deltas: st.deltas.filter((d) => !toRemove.has(d.layer)),
        };
      }
      const assets = { ...(doc.assets ?? {}) };
      for (const id of toRemove) delete assets[id];

      // Drop the assets field entirely when empty to match the existing
      // convention (compose-video-project never writes an empty assets map).
      if (Object.keys(assets).length === 0) {
        const { assets: _omit, ...rest } = doc;
        void _omit;
        doc = { ...(rest as AtelierDocument), layers: remainingLayers, states: newStates };
      } else {
        doc = { ...doc, layers: remainingLayers, states: newStates, assets };
      }
      doc = recomputeTimeline(doc);

      persistDoc(store, documentId, doc, compositionPath);

      return ok({
        layerId,
        removedLayerIds: Array.from(toRemove),
        removedCount: toRemove.size,
      });
    },
  );

  // ── atelier_transcribe_clip ────────────────────────────────
  server.tool(
    "atelier_transcribe_clip",
    "Run transcription on a clip's source media and (re)build parented caption layers. " +
      "Audio-layer captions are not supported in v1. Requires a transcribeFn injected via " +
      "__setTranscribeClipFn (tests) or a pre-existing transcript at " +
      "<projectDir>/transcripts/<stem>.json.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root"),
      layerId: z.string().describe("Video clip layer id"),
      model: z.string().optional().describe("Whisper model selection forwarded to the injected transcribeFn"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, layerId, model }) => {
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      const layer = doc.layers.find((l) => l.id === layerId);
      if (!layer) return err(`clip layer "${layerId}" not found`);
      if (layer.visual.type === "audio") {
        return err("audio layer captions are not supported in v1");
      }
      if (layer.visual.type !== "video") {
        return err(`layer "${layerId}" is type "${layer.visual.type}", not a video clip`);
      }

      const v = layer.visual as VideoVisual;
      const srcRef = v.src;
      if (!srcRef) return err(`video layer "${layerId}" has no src`);
      const mediaBasename = basename(srcRef);

      // Production wiring: prefer an injected transcribeFn (studio host). Tests
      // also inject via __setTranscribeClipFn. Fallback: read an existing
      // transcript mirror from <projectDir>/transcripts/<stem>.json.
      let transcript: VideoTranscript | undefined;
      let transcriptPath: string | undefined;
      if (injectedTranscribeFn) {
        const result = await injectedTranscribeFn({
          projectDir,
          mediaBasename,
          ...(model !== undefined ? { model } : {}),
        });
        transcript = result.transcript;
        transcriptPath = result.transcriptPath;
      } else {
        const stem = stripExt(mediaBasename);
        const candidate = join(resolve(projectDir), "transcripts", `${stem}.json`);
        if (!existsSync(candidate)) {
          return err(
            `no transcribeFn injected and no transcript mirror at ${candidate}. ` +
              "Install a host-provided transcribeFn via __setTranscribeClipFn or pre-write the transcript.",
          );
        }
        try {
          transcript = JSON.parse(readFileSync(candidate, "utf-8")) as VideoTranscript;
          transcriptPath = candidate;
        } catch (e) {
          return err(`failed to read transcript at ${candidate}: ${(e as Error).message}`);
        }
      }

      if (!transcript) return err("transcribeFn returned no transcript");

      doc = rebuildClipCaptions(doc, layerId, transcript, doc.canvas);
      doc = recomputeTimeline(doc);

      const captionCount = doc.layers.filter(
        (l) => l.parentId === layerId && (l.tags ?? []).includes("caption"),
      ).length;

      persistDoc(store, documentId, doc, compositionPath);

      return ok({
        layerId,
        transcriptPath: transcriptPath ?? null,
        captionCount,
      });
    },
  );

  // ── atelier_move_slide ─────────────────────────────────────
  server.tool(
    "atelier_move_slide",
    "Reorder a carousel project's slides[] array. Refuses on non-carousel projects.",
    {
      documentId: z.string().describe("In-memory document ID to reload after disk write"),
      projectDir: z.string().describe("Absolute path to the project root"),
      fromIndex: z.number().int().nonnegative().describe("Current index in slides[]"),
      toIndex: z.number().int().nonnegative().describe("Target index in slides[]"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, projectDir, fromIndex, toIndex }) => {
      const loaded = loadDocFromDisk(projectDir);
      if ("error" in loaded) return err(loaded.error);
      let { doc } = loaded;
      const { compositionPath } = loaded;

      if (doc.kind !== "carousel") {
        return err(`project kind is "${doc.kind ?? "video"}", not "carousel"`);
      }
      const slides: SlideRef[] = [...(doc.slides ?? [])];
      if (fromIndex >= slides.length) {
        return err(`fromIndex ${fromIndex} out of bounds (slides.length=${slides.length})`);
      }
      if (toIndex >= slides.length) {
        return err(`toIndex ${toIndex} out of bounds (slides.length=${slides.length})`);
      }

      const [moved] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, moved);
      doc = { ...doc, slides };

      persistDoc(store, documentId, doc, compositionPath);

      return ok({ slides });
    },
  );
}

function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}
