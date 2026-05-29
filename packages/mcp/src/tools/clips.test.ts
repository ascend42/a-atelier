// Tests for the v1.0 clip + slide MCP tools (clips.ts).
//
// Pattern mirrors index.test.ts:
//   - Real DocumentStore + linked in-memory transport pair
//   - callTool helper parses JSON envelopes from the SDK response
//   - Temp dirs hold a freshly-written project.atelier; tools mutate disk + store
//   - probeDuration / transcribeFn injected via __set* hooks (no ffprobe / whisper)

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AtelierDocument, VideoTranscript } from "@a-company/atelier-types";
import { createServer, DocumentStore } from "../index.js";
import { __setProbeDurationFn, __setTranscribeClipFn } from "./clips.js";

// ─── Helpers ──────────────────────────────────────────────────

async function setup() {
  const { server, store } = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "clips-test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, store };
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  try {
    return { ...JSON.parse(text), _isError: result.isError ?? false };
  } catch {
    return { _raw: text, _isError: result.isError ?? false };
  }
}

/** Fresh empty video-kind doc with a "default" state. */
function makeVideoDoc(): AtelierDocument {
  return {
    version: "1.0",
    kind: "video",
    name: "test-clip-project",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 0, deltas: [] } },
  };
}

/** Fresh empty carousel doc with two slides. */
function makeCarouselDoc(): AtelierDocument {
  return {
    version: "1.0",
    kind: "carousel",
    name: "test-carousel",
    canvas: { width: 1080, height: 1080, fps: 30 },
    layers: [],
    states: {},
    slides: [
      { src: "slides/slide-a.atelier", duration: 60, label: "A" },
      { src: "slides/slide-b.atelier", duration: 60, label: "B" },
      { src: "slides/slide-c.atelier", duration: 60, label: "C" },
    ],
  };
}

function writeProject(projectDir: string, doc: AtelierDocument): void {
  writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
}

function readProject(projectDir: string): AtelierDocument {
  return JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8"));
}

// ─── Fixtures ─────────────────────────────────────────────────

let tmpRoot: string;
let projectDir: string;
let client: Client;
let store: DocumentStore;
const DOC_ID = "doc-under-test";

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-clips-"));
  projectDir = tmpRoot;
  const s = await setup();
  client = s.client;
  store = s.store;
  __setProbeDurationFn(async () => 10); // every "clip" is 10s by default
  __setTranscribeClipFn(undefined);
});

afterEach(() => {
  __setProbeDurationFn(undefined);
  __setTranscribeClipFn(undefined);
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── atelier_add_clip ─────────────────────────────────────────

describe("atelier_add_clip", () => {
  it("adds a new video clip; addedLayer=true; track + asset + timeline land", async () => {
    writeProject(projectDir, makeVideoDoc());

    const res = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/IMG_7346.MOV",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.layerId).toBe("clip-img-7346");
    expect(res.trackId).toBe("track-video-1");
    expect(res.startFrame).toBe(0);
    expect(res.endFrame).toBe(300); // 10s * 30fps
    expect(res.addedLayer).toBe(true);

    const doc = readProject(projectDir);
    expect(doc.layers.some((l) => l.id === "track-video-1")).toBe(true);
    expect(doc.layers.some((l) => l.id === "clip-img-7346")).toBe(true);
    expect(doc.assets?.["clip-img-7346"]).toBeDefined();
    expect(doc.assets?.["clip-img-7346"].src).toBe("media/IMG_7346.MOV");
    expect(doc.timeline).toBeDefined();
    expect(doc.timeline!.tracks).toHaveLength(1);
    expect(doc.timeline!.tracks[0].clips).toHaveLength(1);
    expect(doc.timeline!.totalFrames).toBe(300);

    // Doc landed in the store under documentId.
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.layers.some((l) => l.id === "clip-img-7346")).toBe(true);
  });

  it("re-adding the same source returns addedLayer:false and preserves fields", async () => {
    writeProject(projectDir, makeVideoDoc());

    const first = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/IMG_7346.MOV",
      startFrame: 100,
      sourceOffset: 1.0,
      sourceEnd: 5.0,
    });
    expect(first.addedLayer).toBe(true);
    expect(first.startFrame).toBe(100);

    // Second call: no explicit overrides — fields preserved verbatim.
    const second = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/IMG_7346.MOV",
    });
    expect(second._isError).toBe(false);
    expect(second.addedLayer).toBe(false);
    expect(second.startFrame).toBe(100);

    const doc = readProject(projectDir);
    const clip = doc.layers.find((l) => l.id === "clip-img-7346")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = clip.visual as any;
    expect(v.startFrame).toBe(100);
    expect(v.sourceOffset).toBe(1.0);
    expect(v.sourceEnd).toBe(5.0);
  });

  it("re-add with explicit overrides updates ONLY the passed fields", async () => {
    writeProject(projectDir, makeVideoDoc());
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/IMG_7346.MOV",
      startFrame: 50,
      sourceOffset: 1.0,
      sourceEnd: 5.0,
    });

    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/IMG_7346.MOV",
      sourceEnd: 7.5, // only this changes
    });

    const doc = readProject(projectDir);
    const clip = doc.layers.find((l) => l.id === "clip-img-7346")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = clip.visual as any;
    expect(v.startFrame).toBe(50);
    expect(v.sourceOffset).toBe(1.0);
    expect(v.sourceEnd).toBe(7.5);
  });

  it("kind:audio uses aud-<slug> id and lazy-creates track-audio-1", async () => {
    writeProject(projectDir, makeVideoDoc());

    const res = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/music.mp3",
      kind: "audio",
    });
    expect(res._isError).toBe(false);
    expect(res.layerId).toBe("aud-music");
    expect(res.trackId).toBe("track-audio-1");

    const doc = readProject(projectDir);
    expect(doc.layers.some((l) => l.id === "track-audio-1")).toBe(true);
    const audClip = doc.layers.find((l) => l.id === "aud-music")!;
    expect(audClip.visual.type).toBe("audio");
  });

  it("explicit startFrame:0 overrides end-of-track placement", async () => {
    writeProject(projectDir, makeVideoDoc());

    // Drop two clips back-to-back.
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/a.mp4",
    });
    const second = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/b.mp4",
      startFrame: 0, // explicit override — should NOT land at end-of-track
    });
    expect(second.startFrame).toBe(0);
  });

  it("missing project.atelier returns an error envelope (not throw)", async () => {
    // No file written.
    const res = await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/x.mp4",
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/project\.atelier not found/);
  });
});

// ─── atelier_move_clip ────────────────────────────────────────

describe("atelier_move_clip", () => {
  it("shifts startFrame and updates the timeline endFrame", async () => {
    writeProject(projectDir, makeVideoDoc());
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/a.mp4",
    });

    const res = await callTool(client, "atelier_move_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
      newStartFrame: 120,
    });
    expect(res._isError).toBe(false);
    expect(res.oldStartFrame).toBe(0);
    expect(res.newStartFrame).toBe(120);
    expect(res.endFrame).toBe(120 + 300);

    const doc = readProject(projectDir);
    const clip = doc.layers.find((l) => l.id === "clip-a")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((clip.visual as any).startFrame).toBe(120);
    expect(doc.timeline!.totalFrames).toBe(420);
  });

  it("returns an error when the layer is missing", async () => {
    writeProject(projectDir, makeVideoDoc());

    const res = await callTool(client, "atelier_move_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-ghost",
      newStartFrame: 30,
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/not found/);
  });
});

// ─── atelier_trim_clip ────────────────────────────────────────

describe("atelier_trim_clip", () => {
  beforeEach(async () => {
    writeProject(projectDir, makeVideoDoc());
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/a.mp4",
    });
  });

  it("updates sourceOffset only", async () => {
    const res = await callTool(client, "atelier_trim_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
      sourceOffset: 1.5,
    });
    expect(res._isError).toBe(false);
    expect(res.sourceOffset).toBe(1.5);
    expect(res.sourceEnd).toBe(10);
  });

  it("updates sourceEnd only", async () => {
    const res = await callTool(client, "atelier_trim_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
      sourceEnd: 4.0,
    });
    expect(res._isError).toBe(false);
    expect(res.sourceOffset).toBe(0);
    expect(res.sourceEnd).toBe(4.0);
    expect(res.endFrame).toBe(120); // 4s * 30fps
  });

  it("updates both fields", async () => {
    const res = await callTool(client, "atelier_trim_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
      sourceOffset: 2.0,
      sourceEnd: 6.0,
    });
    expect(res._isError).toBe(false);
    expect(res.sourceOffset).toBe(2.0);
    expect(res.sourceEnd).toBe(6.0);
    expect(res.endFrame).toBe(120); // (6 - 2) * 30
  });

  it("requires at least one of sourceOffset/sourceEnd", async () => {
    const res = await callTool(client, "atelier_trim_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/sourceOffset.*sourceEnd|sourceEnd.*sourceOffset/);
  });
});

// ─── atelier_remove_clip ──────────────────────────────────────

describe("atelier_remove_clip", () => {
  it("removes a clip plus all parented descendants (captions)", async () => {
    const doc = makeVideoDoc();
    // Hand-assemble a clip + two parented caption layers + deltas
    doc.layers = [
      {
        id: "track-video-1",
        tags: ["track", "video"],
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
      {
        id: "clip-a",
        parentId: "track-video-1",
        visual: {
          type: "video",
          assetId: "clip-a",
          src: "media/a.mp4",
          startFrame: 0,
          sourceOffset: 0,
          sourceEnd: 5,
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
      {
        id: "cap-a-0",
        parentId: "clip-a",
        tags: ["caption"],
        visual: { type: "text", content: "hello", style: { fontFamily: "Inter", fontSize: 84, color: "#fff" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      },
      {
        id: "cap-a-1",
        parentId: "clip-a",
        tags: ["caption"],
        visual: { type: "text", content: "world", style: { fontFamily: "Inter", fontSize: 84, color: "#fff" } },
        frame: { x: 0, y: 0 },
        bounds: { width: 100, height: 100 },
      },
    ];
    doc.assets = {
      "clip-a": { type: "video", src: "media/a.mp4" },
    };
    doc.states = {
      default: {
        duration: 150,
        deltas: [
          { layer: "cap-a-0", property: "opacity", range: [0, 5], from: 0, to: 1 },
          { layer: "cap-a-1", property: "opacity", range: [10, 15], from: 0, to: 1 },
        ],
      },
    };
    writeProject(projectDir, doc);

    const res = await callTool(client, "atelier_remove_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
    });
    expect(res._isError).toBe(false);
    expect(res.removedLayerIds).toEqual(expect.arrayContaining(["clip-a", "cap-a-0", "cap-a-1"]));
    expect(res.removedCount).toBe(3);

    const after = readProject(projectDir);
    expect(after.layers.find((l) => l.id === "clip-a")).toBeUndefined();
    expect(after.layers.find((l) => l.id === "cap-a-0")).toBeUndefined();
    expect(after.layers.find((l) => l.id === "cap-a-1")).toBeUndefined();
    expect(after.layers.find((l) => l.id === "track-video-1")).toBeDefined();
    expect(after.states.default.deltas).toHaveLength(0);
    expect(after.assets?.["clip-a"]).toBeUndefined();
  });

  it("refuses to remove a track group layer", async () => {
    const doc = makeVideoDoc();
    doc.layers = [
      {
        id: "track-video-1",
        tags: ["track", "video"],
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
    ];
    writeProject(projectDir, doc);

    const res = await callTool(client, "atelier_remove_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "track-video-1",
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/track group/);
  });
});

// ─── atelier_transcribe_clip ──────────────────────────────────

describe("atelier_transcribe_clip", () => {
  function stubTranscript(): VideoTranscript {
    return {
      version: "1.1",
      segments: [
        {
          text: "hello world",
          start: 0,
          end: 1,
          words: [
            { text: "hello", detected: "hello", start: 0, end: 0.5 },
            { text: "world", detected: "world", start: 0.5, end: 1.0 },
          ],
        },
      ],
    };
  }

  it("stubbed transcribe lands cap-<slug>-N caption layers parented to the clip", async () => {
    writeProject(projectDir, makeVideoDoc());
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/a.mp4",
    });

    __setTranscribeClipFn(async ({ projectDir: pd, mediaBasename }) => {
      return {
        transcript: stubTranscript(),
        transcriptPath: join(pd, "transcripts", `${mediaBasename.replace(/\.[^.]+$/, "")}.json`),
      };
    });

    const res = await callTool(client, "atelier_transcribe_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "clip-a",
    });
    expect(res._isError).toBe(false);
    expect(res.captionCount).toBeGreaterThan(0);
    expect(res.transcriptPath).toMatch(/a\.json$/);

    const doc = readProject(projectDir);
    const captions = doc.layers.filter((l) => l.parentId === "clip-a" && (l.tags ?? []).includes("caption"));
    expect(captions.length).toBeGreaterThan(0);
    for (const c of captions) {
      expect(c.id).toMatch(/^cap-a-\d+$/);
    }
  });

  it("refuses on audio layers", async () => {
    writeProject(projectDir, makeVideoDoc());
    await callTool(client, "atelier_add_clip", {
      documentId: DOC_ID,
      projectDir,
      source: "media/music.mp3",
      kind: "audio",
    });

    __setTranscribeClipFn(async () => ({ transcript: stubTranscript(), transcriptPath: "/tmp/x.json" }));

    const res = await callTool(client, "atelier_transcribe_clip", {
      documentId: DOC_ID,
      projectDir,
      layerId: "aud-music",
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/audio layer captions are not supported/);
  });
});

// ─── atelier_move_slide ───────────────────────────────────────

describe("atelier_move_slide", () => {
  it("reorders middle → end", async () => {
    writeProject(projectDir, makeCarouselDoc());

    const res = await callTool(client, "atelier_move_slide", {
      documentId: DOC_ID,
      projectDir,
      fromIndex: 1,
      toIndex: 2,
    });
    expect(res._isError).toBe(false);
    expect(res.slides.map((s: { label: string }) => s.label)).toEqual(["A", "C", "B"]);

    const doc = readProject(projectDir);
    expect(doc.slides!.map((s) => s.label)).toEqual(["A", "C", "B"]);
  });

  it("rejects out-of-bounds indices", async () => {
    writeProject(projectDir, makeCarouselDoc());

    const res = await callTool(client, "atelier_move_slide", {
      documentId: DOC_ID,
      projectDir,
      fromIndex: 5,
      toIndex: 0,
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/out of bounds/);
  });

  it("refuses on non-carousel projects", async () => {
    writeProject(projectDir, makeVideoDoc());

    const res = await callTool(client, "atelier_move_slide", {
      documentId: DOC_ID,
      projectDir,
      fromIndex: 0,
      toIndex: 1,
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/not "carousel"/);
  });
});
