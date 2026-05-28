// Tests for the workspace-aware Studio UI backend surface.
//
// Coverage:
//   - resolveWhisperModelPath: absolute path / cache hit / download branch.
//   - composeVideoProject: ensureVideoLayer idempotence + state duration write.
//   - workspace-project-info: media / transcript / artifact listings.
//   - studio endpoints: project route matcher + handler shape.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

import {
  resolveWhisperModelPath,
  modelCachePath,
  whisperCacheDir,
} from "./lib/whisper.js";

import {
  composeVideoProject,
  ensureVideoLayer,
  slugifyBasename,
} from "./lib/compose-video-project.js";

import {
  transcribeMediaFile,
} from "./lib/transcribe-orchestrator.js";

import {
  listProjectMedia,
  listProjectTranscripts,
  listProjectArtifacts,
} from "./lib/workspace-project-info.js";

import {
  matchProjectInfoRoute,
  buildProjectMedia,
  buildProjectTranscripts,
  buildProjectArtifacts,
  resolveProjectInWorkspace,
  handleMediaIngestRequest,
} from "./commands/studio.js";

import { EventEmitter } from "node:events";

import type { AtelierDocument } from "@a-company/atelier-types";

// ─── resolveWhisperModelPath ─────────────────────────────────────────

describe("resolveWhisperModelPath", () => {
  let workDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "atelier-whisper-test-"));
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
  });

  it("returns an absolute path as-is when the file exists", async () => {
    const modelPath = join(workDir, "ggml-test.bin");
    writeFileSync(modelPath, "dummy");
    const resolved = await resolveWhisperModelPath(modelPath);
    expect(resolved).toBe(modelPath);
  });

  it("throws when an absolute path is given but file missing", async () => {
    const modelPath = join(workDir, "missing.bin");
    await expect(resolveWhisperModelPath(modelPath)).rejects.toThrow(/not found/);
  });

  it("computes the canonical cache path matching whisper.cpp's convention", () => {
    expect(modelCachePath("base.en")).toBe(
      join(homedir(), ".cache", "whisper.cpp", "models", "ggml-base.en.bin"),
    );
    expect(whisperCacheDir()).toBe(join(homedir(), ".cache", "whisper.cpp", "models"));
  });

  it("invokes fetch with the HuggingFace registry URL on missing model", async () => {
    // Don't actually hit the network — stub fetch with a non-OK response so the
    // download function throws BEFORE pulling bytes. We only assert the URL.
    const fetchSpy = vi.fn(async (input: string | URL | Request) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      expect(urlStr).toContain(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-",
      );
      expect(urlStr).toContain("nonexistent-model");
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
    await expect(resolveWhisperModelPath("nonexistent-model")).rejects.toThrow(/HTTP 404/);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

// ─── composeVideoProject + ensureVideoLayer ──────────────────────────

describe("composeVideoProject", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "atelier-compose-test-"));
    // Minimal project.atelier — empty layers, default state.
    const doc: AtelierDocument = {
      version: "1.0",
      name: "test",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    };
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("adds a track group + parented clip layer when absent", () => {
    const doc: AtelierDocument = {
      version: "1.0",
      name: "x",
      canvas: { width: 1920, height: 1080, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    };
    const { doc: out, addedVideoLayer } = ensureVideoLayer(doc, "source.mp4");
    expect(addedVideoLayer).toBe(true);
    // Two layers: the lazy-created `track-video-1` group, plus the clip.
    expect(out.layers).toHaveLength(2);
    const track = out.layers.find((l) => l.id === "track-video-1")!;
    expect(track).toBeDefined();
    expect((track.visual as { type: string }).type).toBe("group");
    const clip = out.layers.find((l) => l.id === "clip-source")!;
    expect(clip).toBeDefined();
    expect(clip.parentId).toBe("track-video-1");
    expect(clip.visual).toMatchObject({ type: "video", src: "source.mp4" });
    expect(clip.bounds).toMatchObject({ width: 1920, height: 1080 });
  });

  it("is idempotent — does not double-add when video already present", () => {
    const doc: AtelierDocument = {
      version: "1.0",
      name: "x",
      canvas: { width: 1920, height: 1080, fps: 30 },
      layers: [{
        id: "clip-source",
        parentId: "track-video-1",
        visual: { type: "video", src: "source.mp4", startFrame: 0, sourceOffset: 0, playbackRate: 1, objectFit: "contain" } as never,
        frame: { x: 0, y: 0 },
        bounds: { width: 1920, height: 1080 },
      }],
      states: { default: { duration: 30, deltas: [] } },
    };
    const { doc: out, addedVideoLayer } = ensureVideoLayer(doc, "source.mp4");
    expect(addedVideoLayer).toBe(false);
    expect(out.layers).toHaveLength(1);
  });

  it("slugifyBasename produces stable kebab-case ids", () => {
    expect(slugifyBasename("IMG_7346.MOV")).toBe("img-7346");
    expect(slugifyBasename("media/B-roll Clip.mp4")).toBe("b-roll-clip");
    expect(slugifyBasename("source.mp4")).toBe("source");
    expect(slugifyBasename("__weird__name__.webm")).toBe("weird-name");
  });

  it("composes a playable project with transcription stubbed", async () => {
    // Drop a fake source file in the project root so the compose helper
    // resolves it. The transcribe step is stubbed.
    const sourceFile = join(projectDir, "source.mp4");
    writeFileSync(sourceFile, "fake bytes");

    const transcribeFn = vi.fn(async () => ({
      projectDir,
      backend: "whisper-cpp",
      transcript: {
        version: "1.1" as const,
        language: "en",
        segments: [
          {
            text: "hello world",
            start: 0,
            end: 1.5,
            words: [
              { detected: "hello", text: "hello", start: 0, end: 0.7 },
              { detected: "world", text: "world", start: 0.8, end: 1.5 },
            ],
          },
        ],
      },
      wordCount: 2,
      captionsGenerated: true,
    }));
    const probeDurationFn = vi.fn(async () => 5.0);

    const result = await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile,
      transcribeFn,
      probeDurationFn,
    });

    expect(transcribeFn).toHaveBeenCalled();
    expect(probeDurationFn).toHaveBeenCalledWith(sourceFile);
    expect(result.addedVideoLayer).toBe(true);
    expect(result.targetStateName).toBe("default");
    expect(result.targetDurationSeconds).toBe(5.0);

    const persisted = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    expect(persisted.states.default.duration).toBe(150); // 5s * 30fps
    // Track group + clip layer present, both with correct ids.
    expect(persisted.layers.some((l) => l.id === "track-video-1")).toBe(true);
    const clip = persisted.layers.find((l) => l.id === "clip-source")!;
    expect(clip).toBeDefined();
    expect(clip.parentId).toBe("track-video-1");
    expect((clip.visual as { type: string }).type).toBe("video");
    // Timeline summary block reflects the placement.
    expect(persisted.timeline).toBeDefined();
    expect(persisted.timeline!.fps).toBe(30);
    expect(persisted.timeline!.totalFrames).toBe(150);
    expect(persisted.timeline!.tracks).toHaveLength(1);
    expect(persisted.timeline!.tracks[0].id).toBe("track-video-1");
    expect(persisted.timeline!.tracks[0].clips).toHaveLength(1);
    expect(persisted.timeline!.tracks[0].clips[0]).toMatchObject({
      layerId: "clip-source",
      startFrame: 0,
      endFrame: 150,
    });
  });

  it("two sequential ingests produce two clip layers parented to track-video-1", async () => {
    // Seed two source files inside media/ and a fresh project.atelier.
    mkdirSync(join(projectDir, "media"), { recursive: true });
    const fileA = join(projectDir, "media", "IMG_7346.MOV");
    const fileB = join(projectDir, "media", "IMG_7347.MOV");
    writeFileSync(fileA, "fakeA");
    writeFileSync(fileB, "fakeB");

    const makeTranscribe = (segText: string) => vi.fn(async (dir: string, opts?: { dryRun?: boolean }) => {
      const payload = {
        version: "1.1" as const,
        language: "en",
        segments: [
          {
            text: segText,
            start: 0,
            end: 1,
            words: [{ detected: segText, text: segText, start: 0, end: 1 }],
          },
        ],
      };
      if (!opts?.dryRun) {
        writeFileSync(join(dir, "transcript.json"), JSON.stringify(payload));
      }
      return {
        projectDir: dir,
        backend: "whisper-cpp",
        transcript: payload,
        wordCount: 1,
        captionsGenerated: false,
      };
    });

    // First ingest — 2s clip.
    const r1 = await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile: fileA,
      mediaBasename: "IMG_7346.MOV",
      transcribeFn: makeTranscribe("a"),
      probeDurationFn: async () => 2.0,
    });
    expect(r1.addedVideoLayer).toBe(true);
    expect(r1.clipLayerId).toBe("clip-img-7346");

    // Second ingest — 3s clip. Must NOT delete clip A.
    const r2 = await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile: fileB,
      mediaBasename: "IMG_7347.MOV",
      transcribeFn: makeTranscribe("b"),
      probeDurationFn: async () => 3.0,
    });
    expect(r2.addedVideoLayer).toBe(true);
    expect(r2.clipLayerId).toBe("clip-img-7347");

    const persisted = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;

    // Both clip layers present, both parented to track-video-1.
    const clipA = persisted.layers.find((l) => l.id === "clip-img-7346")!;
    const clipB = persisted.layers.find((l) => l.id === "clip-img-7347")!;
    expect(clipA).toBeDefined();
    expect(clipB).toBeDefined();
    expect(clipA.parentId).toBe("track-video-1");
    expect(clipB.parentId).toBe("track-video-1");

    // Clip B placed at end-of-clip-A (2s * 30fps = 60).
    expect((clipA.visual as { startFrame?: number }).startFrame).toBe(0);
    expect((clipB.visual as { startFrame?: number }).startFrame).toBe(60);

    // Timeline summary block has both clips in order, fps + totalFrames set.
    expect(persisted.timeline).toBeDefined();
    expect(persisted.timeline!.fps).toBe(30);
    expect(persisted.timeline!.tracks).toHaveLength(1);
    const clips = persisted.timeline!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ layerId: "clip-img-7346", startFrame: 0, endFrame: 60 });
    expect(clips[1]).toMatchObject({ layerId: "clip-img-7347", startFrame: 60, endFrame: 150 });
    expect(persisted.timeline!.totalFrames).toBe(150);

    // State.duration covers both clips.
    expect(persisted.states.default.duration).toBe(150);

    // Asset entries are clip-<slug> one-to-one.
    expect(persisted.assets?.["clip-img-7346"]).toBeDefined();
    expect(persisted.assets?.["clip-img-7347"]).toBeDefined();
    expect(persisted.assets!["clip-img-7346"].src).toContain("IMG_7346.MOV");
    expect(persisted.assets!["clip-img-7347"].src).toContain("IMG_7347.MOV");
  });

  it("per-clip captions are parented and survive a subsequent ingest", async () => {
    mkdirSync(join(projectDir, "media"), { recursive: true });
    const fileA = join(projectDir, "media", "IMG_7346.MOV");
    const fileB = join(projectDir, "media", "IMG_7347.MOV");
    writeFileSync(fileA, "fakeA");
    writeFileSync(fileB, "fakeB");

    const makeTranscribe = (segText: string) => vi.fn(async (dir: string, opts?: { dryRun?: boolean }) => {
      const payload = {
        version: "1.1" as const,
        language: "en",
        segments: [
          {
            text: segText,
            start: 0,
            end: 1.5,
            words: [{ detected: segText, text: segText, start: 0, end: 1.5 }],
          },
        ],
      };
      if (!opts?.dryRun) {
        writeFileSync(join(dir, "transcript.json"), JSON.stringify(payload));
      }
      return {
        projectDir: dir,
        backend: "whisper-cpp",
        transcript: payload,
        wordCount: 1,
        captionsGenerated: false,
      };
    });

    await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile: fileA,
      mediaBasename: "IMG_7346.MOV",
      transcribeFn: makeTranscribe("hello"),
      probeDurationFn: async () => 2.0,
    });

    // After first ingest, clip A captions should exist parented to clip-img-7346.
    let persisted = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    const aCaptions = persisted.layers.filter((l) => l.id.startsWith("cap-img-7346-"));
    expect(aCaptions.length).toBeGreaterThan(0);
    for (const cap of aCaptions) {
      expect(cap.parentId).toBe("clip-img-7346");
      expect(cap.tags).toContain("caption");
    }

    await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile: fileB,
      mediaBasename: "IMG_7347.MOV",
      transcribeFn: makeTranscribe("world"),
      probeDurationFn: async () => 3.0,
    });

    // After second ingest, clip A captions should STILL exist (multi-clip preservation).
    persisted = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    const aCaptionsAfter = persisted.layers.filter((l) => l.id.startsWith("cap-img-7346-"));
    expect(aCaptionsAfter.length).toBe(aCaptions.length);
    for (const cap of aCaptionsAfter) {
      expect(cap.parentId).toBe("clip-img-7346");
    }

    // Clip B captions also exist parented to clip B.
    const bCaptions = persisted.layers.filter((l) => l.id.startsWith("cap-img-7347-"));
    expect(bCaptions.length).toBeGreaterThan(0);
    for (const cap of bCaptions) {
      expect(cap.parentId).toBe("clip-img-7347");
    }

    // No unparented `caption-N` layers leak through.
    const unparented = persisted.layers.filter(
      (l) => (l.tags ?? []).includes("caption") && !l.parentId,
    );
    expect(unparented).toHaveLength(0);
  });
});

// ─── transcribe-orchestrator: per-file transcript mirror ──────────────

describe("transcribeMediaFile", () => {
  let projectDir: string;

  /**
   * Stubbed transcribeProject that writes a synthetic transcript.json to disk
   * (the production transcribeProject would do this via whisper-cpp). The
   * orchestrator's job is to mirror that output to transcripts/<stem>.json.
   */
  function makeFakeTranscribe(payload: object) {
    return vi.fn(async (dir: string, opts?: { dryRun?: boolean }) => {
      // Mirror production transcribeProject behaviour: dryRun returns the
      // result without writing root transcript.json. The orchestrator forces
      // dryRun=true so root never gets clobbered on multi-media ingest.
      if (!opts?.dryRun) {
        writeFileSync(join(dir, "transcript.json"), JSON.stringify(payload));
      }
      return {
        projectDir: dir,
        backend: "whisper-cpp",
        transcript: payload as never,
        wordCount: 0,
        captionsGenerated: false,
      };
    });
  }

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "atelier-orch-test-"));
    writeFileSync(join(projectDir, "project.atelier"), "{}");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("writes the per-file transcript without touching root transcript.json", async () => {
    // Pre-existing root transcript represents the original single-source project's
    // content — multi-media ingest must NOT clobber it.
    const preexistingRoot = JSON.stringify({ version: "1.1", language: "en", segments: [{ preexisting: true }] });
    const { writeFileSync: wf } = await import("node:fs");
    wf(join(projectDir, "transcript.json"), preexistingRoot, "utf-8");

    const fakeTranscribe = makeFakeTranscribe({ language: "en", segments: [{ new: true }] });
    const result = await transcribeMediaFile(projectDir, "IMG_7347.MOV", {
      transcribeFn: fakeTranscribe,
    });

    expect(result.mediaStem).toBe("IMG_7347");
    expect(result.mirroredTranscriptPath).toBe(
      join(projectDir, "transcripts", "IMG_7347.json"),
    );
    // Root transcript preserved verbatim (no overwrite).
    expect(readFileSync(join(projectDir, "transcript.json"), "utf-8")).toBe(preexistingRoot);
    // Per-file written with the new ingest's content.
    expect(existsSync(join(projectDir, "transcripts", "IMG_7347.json"))).toBe(true);
    const perFile = JSON.parse(readFileSync(join(projectDir, "transcripts", "IMG_7347.json"), "utf-8"));
    expect(perFile.segments[0].new).toBe(true);
  });

  it("preserves both transcripts when two media files are ingested in sequence", async () => {
    // First ingest — writes mirror for first.json
    const tx1 = makeFakeTranscribe({ language: "en", segments: [{ first: true }] });
    await transcribeMediaFile(projectDir, "first.mp4", { transcribeFn: tx1 });

    // Second ingest — overwrites root transcript.json, mirrors to second.json
    const tx2 = makeFakeTranscribe({ language: "en", segments: [{ second: true }] });
    await transcribeMediaFile(projectDir, "second.mp4", { transcribeFn: tx2 });

    // Both mirrors exist; the first is NOT overwritten.
    expect(existsSync(join(projectDir, "transcripts", "first.json"))).toBe(true);
    expect(existsSync(join(projectDir, "transcripts", "second.json"))).toBe(true);
    const first = JSON.parse(readFileSync(join(projectDir, "transcripts", "first.json"), "utf-8"));
    const second = JSON.parse(readFileSync(join(projectDir, "transcripts", "second.json"), "utf-8"));
    expect(first.segments[0].first).toBe(true);
    expect(second.segments[0].second).toBe(true);
  });

  it("strips uppercase + multi-char extensions consistently", async () => {
    const tx = makeFakeTranscribe({ segments: [] });
    const result = await transcribeMediaFile(projectDir, "Clip.WebM", {
      transcribeFn: tx,
    });
    expect(result.mediaStem).toBe("Clip");
    expect(existsSync(join(projectDir, "transcripts", "Clip.json"))).toBe(true);
  });

  it("skips mirror write on dry-run (no side effects)", async () => {
    // Dry-run fake doesn't write transcript.json (production transcribeProject
    // honours dryRun similarly).
    const tx = vi.fn(async (dir: string) => ({
      projectDir: dir,
      backend: "whisper-cpp",
      transcript: { segments: [] } as never,
      wordCount: 0,
      captionsGenerated: false,
    }));
    await transcribeMediaFile(projectDir, "a.mp4", { dryRun: true, transcribeFn: tx });
    expect(existsSync(join(projectDir, "transcripts", "a.json"))).toBe(false);
  });

  it("composeVideoProject mirrors the transcript when mediaBasename is provided", async () => {
    const sourceFile = join(projectDir, "media", "IMG_7347.MOV");
    mkdirSync(join(projectDir, "media"), { recursive: true });
    writeFileSync(sourceFile, "fake");
    // Seed project.atelier so compose can load + write it.
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify({
      version: "1.0",
      name: "x",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    }));
    const tx = makeFakeTranscribe({ language: "en", segments: [] });
    const result = await composeVideoProject({
      projectDir,
      docPath: "project.atelier",
      sourceFile,
      mediaBasename: "IMG_7347.MOV",
      transcribeFn: tx,
      probeDurationFn: async () => 2.0,
    });
    expect(result.mirroredTranscriptPath).toBe(
      join(projectDir, "transcripts", "IMG_7347.json"),
    );
    expect(existsSync(result.mirroredTranscriptPath!)).toBe(true);
  });
});

// ─── workspace-project-info pure helpers ────────────────────────────

describe("workspace-project-info helpers", () => {
  let workspaceDir: string;
  let projectDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "atelier-ws-info-"));
    projectDir = join(workspaceDir, "proj");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "project.atelier"), "{}");
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("listProjectMedia hides root source.<ext> when media/ has entries (avoids duplicate display)", () => {
    // The root source.<ext> is an INGEST IMPLEMENTATION DETAIL — a copy of
    // one media/<basename> that legacy transcribeProject needs. Surfacing it
    // alongside the media/ entry shows the creator two listings of the same
    // content. The fix (2026-05-27): hide root source.<ext> when media/ is
    // populated; only single-source legacy projects (no media/ dir) see it.
    writeFileSync(join(projectDir, "source.mp4"), "vid bytes");
    writeFileSync(join(projectDir, "transcript.json"), "{}");
    mkdirSync(join(projectDir, "media"), { recursive: true });
    writeFileSync(join(projectDir, "media", "broll.mp4"), "another");

    const entries = listProjectMedia(projectDir, "proj");
    expect(entries.length).toBe(1);
    const broll = entries.find((e) => e.name === "broll.mp4");
    expect(broll).toBeDefined();
    expect(broll?.path).toBe("proj/media/broll.mp4");
    // Root source is NOT in the list.
    expect(entries.find((e) => e.name === "source.mp4")).toBeUndefined();
  });

  it("listProjectMedia shows root source.<ext> when no media/ dir (legacy single-source layout)", () => {
    writeFileSync(join(projectDir, "source.mp4"), "vid bytes");
    writeFileSync(join(projectDir, "transcript.json"), "{}");
    // No media/ dir, no media/ files.

    const entries = listProjectMedia(projectDir, "proj");
    expect(entries.length).toBe(1);
    const root = entries.find((e) => e.name === "source.mp4");
    expect(root).toBeDefined();
    expect(root?.isRootSource).toBe(true);
    expect(root?.hasTranscript).toBe(true);
    expect(root?.transcriptPath).toBe("proj/transcript.json");
  });

  it("listProjectMedia surfaces per-file transcripts for media/ files", () => {
    // Two media files, two per-file transcript mirrors — what the multi-ingest
    // flow produces after the #transcribe-orchestrator change.
    mkdirSync(join(projectDir, "media"), { recursive: true });
    writeFileSync(join(projectDir, "media", "IMG_7347.MOV"), "video1");
    writeFileSync(join(projectDir, "media", "second.mp4"), "video2");
    mkdirSync(join(projectDir, "transcripts"), { recursive: true });
    writeFileSync(join(projectDir, "transcripts", "IMG_7347.json"), "{}");
    writeFileSync(join(projectDir, "transcripts", "second.json"), "{}");

    const entries = listProjectMedia(projectDir, "proj");
    const first = entries.find((e) => e.name === "IMG_7347.MOV");
    const second = entries.find((e) => e.name === "second.mp4");
    expect(first?.hasTranscript).toBe(true);
    expect(first?.transcriptPath).toBe("proj/transcripts/IMG_7347.json");
    expect(second?.hasTranscript).toBe(true);
    expect(second?.transcriptPath).toBe("proj/transcripts/second.json");
  });

  it("listProjectMedia recognises transcripts/source.json mirror for root source", () => {
    // No legacy root transcript.json, but the new mirror exists at
    // transcripts/source.json — listing should treat the root source as
    // transcribed.
    writeFileSync(join(projectDir, "source.mp4"), "bytes");
    mkdirSync(join(projectDir, "transcripts"), { recursive: true });
    writeFileSync(join(projectDir, "transcripts", "source.json"), "{}");

    const entries = listProjectMedia(projectDir, "proj");
    const root = entries.find((e) => e.name === "source.mp4");
    expect(root?.hasTranscript).toBe(true);
    expect(root?.transcriptPath).toBe("proj/transcripts/source.json");
  });

  it("listProjectTranscripts prefers per-file transcripts; hides root when per-file present", () => {
    // Sidebar policy: when per-file transcripts exist they are authoritative.
    // The root transcript.json is hidden to avoid the confusing case where
    // it's stale from a multi-media ingest (the studio bug surfaced 2026-05-27).
    writeFileSync(join(projectDir, "transcript.json"), JSON.stringify({
      language: "en",
      segments: [
        { text: "hi", start: 0, end: 1, words: [{ text: "hi", start: 0, end: 1 }] },
      ],
    }));
    mkdirSync(join(projectDir, "transcripts"));
    writeFileSync(join(projectDir, "transcripts", "alt.json"), JSON.stringify({
      segments: [],
    }));

    const entries = listProjectTranscripts(projectDir, "proj");
    expect(entries.length).toBe(1);
    const alt = entries.find((e) => e.name === "alt.json")!;
    expect(alt.path).toBe("proj/transcripts/alt.json");
    // Root NOT in the list when per-file exists.
    expect(entries.find((e) => e.name === "transcript.json")).toBeUndefined();
  });

  it("listProjectTranscripts falls back to root transcript.json when no per-file transcripts exist", () => {
    // Legacy single-source project: only the root transcript.json exists,
    // no transcripts/ dir. Sidebar shows it so the creator isn't transcript-less.
    writeFileSync(join(projectDir, "transcript.json"), JSON.stringify({
      language: "en",
      segments: [
        { text: "hi", start: 0, end: 1, words: [{ text: "hi", start: 0, end: 1 }] },
      ],
    }));

    const entries = listProjectTranscripts(projectDir, "proj");
    expect(entries.length).toBe(1);
    const root = entries.find((e) => e.name === "transcript.json")!;
    expect(root.language).toBe("en");
    expect(root.segments).toBe(1);
    expect(root.path).toBe("proj/transcript.json");
  });

  it("listProjectArtifacts reports presence + mtime", () => {
    writeFileSync(join(projectDir, "DESIGN.md"), "# design");
    const info = listProjectArtifacts(projectDir, "proj");
    expect(info.design.exists).toBe(true);
    expect(info.design.mtime).toBeTypeOf("string");
    expect(info.design.path).toBe("proj/DESIGN.md");
    expect(info.script.exists).toBe(false);
    expect(info.storyboard.exists).toBe(false);
  });
});

// ─── Studio endpoint pure handlers + route matcher ─────────────────

describe("studio /api/project route handlers", () => {
  let workspaceDir: string;
  let projectDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "atelier-studio-routes-"));
    // workspace.atelier marker so this looks like a workspace dir.
    writeFileSync(join(workspaceDir, "workspace.atelier"),
      `version: '1.0'\nname: testws\ncreated: '2026-01-01T00:00:00.000Z'\ndefault_mode: explicit\n`);
    projectDir = join(workspaceDir, "demo");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "project.atelier"), "{}");
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("matchProjectInfoRoute parses the path shape", () => {
    expect(matchProjectInfoRoute("/api/project/demo/media")).toEqual({ name: "demo", kind: "media" });
    expect(matchProjectInfoRoute("/api/project/demo/transcripts")).toEqual({ name: "demo", kind: "transcripts" });
    expect(matchProjectInfoRoute("/api/project/demo/artifacts")).toEqual({ name: "demo", kind: "artifacts" });
    expect(matchProjectInfoRoute("/api/project/demo/unknown")).toBeNull();
    expect(matchProjectInfoRoute("/api/file")).toBeNull();
    expect(matchProjectInfoRoute("/api/project//media")).toBeNull();
  });

  it("resolveProjectInWorkspace rejects invalid names and missing projects", () => {
    expect(resolveProjectInWorkspace(workspaceDir, "demo")).toBe(projectDir);
    expect(resolveProjectInWorkspace(workspaceDir, "../escape")).toBeNull();
    expect(resolveProjectInWorkspace(workspaceDir, ".hidden")).toBeNull();
    expect(resolveProjectInWorkspace(workspaceDir, "")).toBeNull();
    expect(resolveProjectInWorkspace(workspaceDir, "missing-project")).toBeNull();
  });

  it("buildProjectMedia / Transcripts / Artifacts handlers return 200 with expected body shape", () => {
    writeFileSync(join(projectDir, "source.mp4"), "vid");
    writeFileSync(join(projectDir, "DESIGN.md"), "# d");

    const mediaResult = buildProjectMedia(workspaceDir, "demo");
    expect(mediaResult.status).toBe(200);
    expect(Array.isArray(mediaResult.body)).toBe(true);
    expect((mediaResult.body as Array<{ name: string }>)[0].name).toBe("source.mp4");

    const transcripts = buildProjectTranscripts(workspaceDir, "demo");
    expect(transcripts.status).toBe(200);
    expect(Array.isArray(transcripts.body)).toBe(true);

    const artifacts = buildProjectArtifacts(workspaceDir, "demo");
    expect(artifacts.status).toBe(200);
    expect((artifacts.body as { design: { exists: boolean } }).design.exists).toBe(true);
  });

  it("returns 404 on unknown project", () => {
    expect(buildProjectMedia(workspaceDir, "ghost").status).toBe(404);
    expect(buildProjectTranscripts(workspaceDir, "ghost").status).toBe(404);
    expect(buildProjectArtifacts(workspaceDir, "ghost").status).toBe(404);
  });
});

// ─── handleMediaIngestRequest — kind-aware dispatch (B3) ────────────
//
// Two coverage points the slice spec calls out:
//   1. Image-only project (fresh dir, no project.atelier yet, image drag) →
//      composeImageProject runs, project.atelier is written with kind:"image"
//      and an ImageVisual layer.
//   2. Image-into-video reject path → 400 response, error string present,
//      AND the file just uploaded into media/ is removed (no orphans).
//
// We drive the handler directly (it's exported) using a tiny mock req that
// extends EventEmitter — same shape as Node's IncomingMessage for the bits
// the handler reads.

/** Minimal IncomingMessage-shaped mock with controllable body chunks. */
function makeMockReq(headers: Record<string, string>, body: Buffer): EventEmitter & {
  headers: Record<string, string>;
} {
  const req = new EventEmitter() as EventEmitter & { headers: Record<string, string> };
  req.headers = headers;
  // Defer emission so the handler has a chance to attach listeners.
  setImmediate(() => {
    req.emit("data", body);
    req.emit("end");
  });
  return req;
}

/** Mock ServerResponse — captures statusCode + body + headers. */
interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  ended: Promise<void>;
}

function makeMockRes(): MockRes {
  let resolveEnded!: () => void;
  const ended = new Promise<void>((r) => { resolveEnded = r; });
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body?: string) {
      if (body !== undefined) this.body = body;
      resolveEnded();
    },
    ended,
  };
}

/** Wait one task tick — composeImageProject's promise chain resolves async. */
async function flushAsync(): Promise<void> {
  // Two ticks: setImmediate + composeImageProject resolution + .then().
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

describe("handleMediaIngestRequest — kind-aware dispatch", () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), "atelier-ingest-dispatch-"));
    writeFileSync(join(workspaceDir, "workspace.atelier"),
      `version: '1.0'\nname: testws\ncreated: '2026-01-01T00:00:00.000Z'\ndefault_mode: explicit\n`);
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("fresh project + image drag → scaffolds kind:'image' with an ImageVisual layer", async () => {
    // No project dir exists yet — the handler must create it from scratch.
    const projectName = "demo-img";
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const req = makeMockReq(
      {
        "x-atelier-project": projectName,
        "x-atelier-filename": "photo.png",
      },
      fakePng,
    );
    const res = makeMockRes();
    // Cast: our EventEmitter mock satisfies the bits handleMediaIngestRequest
    // actually reads (headers + 'data' / 'end' / 'error' events).
    handleMediaIngestRequest(
      req as unknown as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
      workspaceDir,
      new Set(),
    );
    await res.ended;
    await flushAsync();

    const projectDir = join(workspaceDir, projectName);

    // Post-pivot (TD-2026-05-27): drag-drop ingest targets `<slug>.atelier`
    // — derived from the source basename — not the legacy `project.atelier`.
    // `photo.png` → `photo.atelier`.
    const compositionPath = join(projectDir, "photo.atelier");
    expect(existsSync(compositionPath)).toBe(true);
    // And the legacy path is NOT created.
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(false);

    const doc = JSON.parse(readFileSync(compositionPath, "utf-8")) as AtelierDocument;
    expect(doc.kind).toBe("image");

    const imageLayers = doc.layers.filter((l) => l.visual.type === "image");
    expect(imageLayers.length).toBe(1);
    expect((imageLayers[0]!.visual as { src?: string }).src).toBe("media/photo.png");

    // The dropped file is preserved at media/photo.png.
    expect(existsSync(join(projectDir, "media", "photo.png"))).toBe(true);

    // Response shape — handler writes ok:true + kind:"image".
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: boolean; kind: string; addedImageLayer: boolean };
    expect(body.ok).toBe(true);
    expect(body.kind).toBe("image");
    expect(body.addedImageLayer).toBe(true);
  });

  it("image-into-video-project rejects with 400, error message, and removes the uploaded file", async () => {
    // Seed an EXISTING kind:"video" project — image drag must be refused.
    const projectName = "demo-vid";
    const projectDir = join(workspaceDir, projectName);
    mkdirSync(projectDir, { recursive: true });
    const videoDoc: AtelierDocument = {
      version: "1.0",
      name: projectName,
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    };
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(videoDoc, null, 2));

    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const req = makeMockReq(
      {
        "x-atelier-project": projectName,
        "x-atelier-filename": "intruder.png",
      },
      fakePng,
    );
    const res = makeMockRes();
    handleMediaIngestRequest(
      req as unknown as import("node:http").IncomingMessage,
      res as unknown as import("node:http").ServerResponse,
      workspaceDir,
      new Set(),
    );
    await res.ended;
    await flushAsync();

    // Status + body.
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);

    // Critical invariant: the uploaded file must NOT linger in media/.
    const uploadedPath = join(projectDir, "media", "intruder.png");
    expect(existsSync(uploadedPath)).toBe(false);

    // The pre-existing project.atelier must be untouched — no spurious layer.
    const persisted = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    expect(persisted.kind).toBe("video");
    expect(persisted.layers.length).toBe(0);
  });
});

// Defensive: keep the existsSync import referenced for tooling stability.
void existsSync;
