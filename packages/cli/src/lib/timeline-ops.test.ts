// Tests for #timeline-ops — pure helpers over an AtelierDocument's track +
// clip layers (extracted + generalized from #compose-video-project).

import { describe, it, expect } from "vitest";
import type {
  AtelierDocument,
  Layer,
  VideoTranscript,
} from "@a-company/atelier-types";

import {
  VIDEO_TRACK_ID,
  AUDIO_TRACK_ID,
  endOfTrackFrame,
  ensureTrackLayer,
  ensureClipLayer,
  recomputeTimeline,
  rebuildClipCaptions,
  stripStaleCaptionArtifacts,
} from "./timeline-ops.js";

const fps = 30;

function emptyDoc(): AtelierDocument {
  return {
    version: "1.0",
    name: "t",
    canvas: { width: 1080, height: 1920, fps },
    layers: [],
    states: { default: { duration: 0, deltas: [] } },
  };
}

function videoChild(
  id: string,
  parentId: string,
  startFrame: number,
  src = `media/${id}.mp4`,
  sourceEnd = 2,
): Layer {
  return {
    id,
    parentId,
    visual: {
      type: "video",
      assetId: id,
      src,
      startFrame,
      sourceOffset: 0,
      sourceEnd,
      playbackRate: 1,
      objectFit: "contain",
    },
    frame: { x: 0, y: 0 },
    bounds: { width: 1080, height: 1920 },
  };
}

// ─── endOfTrackFrame ─────────────────────────────────────────────────

describe("endOfTrackFrame", () => {
  it("returns 0 for an empty track", () => {
    expect(endOfTrackFrame([], VIDEO_TRACK_ID, fps)).toBe(0);
  });

  it("returns the single clip's endFrame", () => {
    // 2s @ 30fps = 60 frames, starting at 0 → endFrame 60
    const layers = [videoChild("a", VIDEO_TRACK_ID, 0, "a.mp4", 2)];
    expect(endOfTrackFrame(layers, VIDEO_TRACK_ID, fps)).toBe(60);
  });

  it("returns the max endFrame across multiple clips", () => {
    const layers = [
      videoChild("a", VIDEO_TRACK_ID, 0, "a.mp4", 2), // [0, 60)
      videoChild("b", VIDEO_TRACK_ID, 60, "b.mp4", 1), // [60, 90)
      videoChild("c", VIDEO_TRACK_ID, 90, "c.mp4", 3), // [90, 180)
    ];
    expect(endOfTrackFrame(layers, VIDEO_TRACK_ID, fps)).toBe(180);
  });

  it("ignores children of a different track", () => {
    const layers = [
      videoChild("a", VIDEO_TRACK_ID, 0, "a.mp4", 2),
      videoChild("b", AUDIO_TRACK_ID, 0, "b.mp4", 10), // foreign track
    ];
    expect(endOfTrackFrame(layers, VIDEO_TRACK_ID, fps)).toBe(60);
  });
});

// ─── ensureTrackLayer ────────────────────────────────────────────────

describe("ensureTrackLayer", () => {
  it("creates the track group with the right tags + bounds when missing", () => {
    const doc = emptyDoc();
    const { doc: out, created } = ensureTrackLayer(doc, VIDEO_TRACK_ID, "video");
    expect(created).toBe(true);
    expect(out.layers).toHaveLength(1);
    const track = out.layers[0]!;
    expect(track.id).toBe(VIDEO_TRACK_ID);
    expect(track.visual.type).toBe("group");
    expect(track.tags).toEqual(["track", "video"]);
    expect(track.bounds).toEqual({ width: 1080, height: 1920 });
  });

  it("creates an audio track with the right tags", () => {
    const doc = emptyDoc();
    const { doc: out, created } = ensureTrackLayer(doc, AUDIO_TRACK_ID, "audio");
    expect(created).toBe(true);
    expect(out.layers[0]!.tags).toEqual(["track", "audio"]);
  });

  it("is a no-op when the track already exists", () => {
    const doc = emptyDoc();
    const seeded = ensureTrackLayer(doc, VIDEO_TRACK_ID, "video").doc;
    const { doc: out, created } = ensureTrackLayer(seeded, VIDEO_TRACK_ID, "video");
    expect(created).toBe(false);
    expect(out).toBe(seeded); // same reference
    expect(out.layers).toHaveLength(1);
  });
});

// ─── ensureClipLayer ─────────────────────────────────────────────────

describe("ensureClipLayer (video)", () => {
  it("adds layer + asset + lazy track to a fresh doc", () => {
    const doc = emptyDoc();
    const { doc: out, addedLayer, clipLayerId } = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    });
    expect(addedLayer).toBe(true);
    expect(clipLayerId).toBe("clip-a");
    expect(out.layers).toHaveLength(2);
    const track = out.layers.find((l) => l.id === VIDEO_TRACK_ID)!;
    const clip = out.layers.find((l) => l.id === "clip-a")!;
    expect(track.visual.type).toBe("group");
    expect(clip.parentId).toBe(VIDEO_TRACK_ID);
    expect(clip.visual).toMatchObject({
      type: "video",
      src: "media/a.mp4",
      startFrame: 0,
      sourceOffset: 0,
      sourceEnd: 2,
      playbackRate: 1,
      objectFit: "contain",
    });
    expect(out.assets?.["clip-a"]).toMatchObject({ type: "video", src: "media/a.mp4" });
  });

  it("is idempotent — re-adding the same id is a no-op", () => {
    const doc = emptyDoc();
    const r1 = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    });
    const r2 = ensureClipLayer(r1.doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    });
    expect(r2.addedLayer).toBe(false);
    expect(r2.doc).toBe(r1.doc); // unchanged reference
    expect(r2.doc.layers).toHaveLength(2);
  });

  it("honors an explicit startFrame override", () => {
    const doc = emptyDoc();
    const { doc: out } = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "a.mp4",
      clipDurationSeconds: 1,
      clipDurationFrames: 30,
      kind: "video",
      startFrame: 100,
    });
    const clip = out.layers.find((l) => l.id === "clip-a")!;
    expect((clip.visual as { startFrame?: number }).startFrame).toBe(100);
  });

  it("appends at end-of-track when startFrame is unset", () => {
    let doc = emptyDoc();
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    }).doc;
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-b",
      trackId: VIDEO_TRACK_ID,
      sourceName: "b.mp4",
      clipDurationSeconds: 1,
      clipDurationFrames: 30,
      kind: "video",
    }).doc;
    const b = doc.layers.find((l) => l.id === "clip-b")!;
    // Second clip should start where the first ended: 60 frames in.
    expect((b.visual as { startFrame?: number }).startFrame).toBe(60);
  });
});

describe("ensureClipLayer (audio)", () => {
  it("creates an AudioVisual layer with the audio track + asset:type audio", () => {
    const doc = emptyDoc();
    const { doc: out, addedLayer } = ensureClipLayer(doc, {
      clipLayerId: "aud-music",
      trackId: AUDIO_TRACK_ID,
      sourceName: "media/music.mp3",
      clipDurationSeconds: 10,
      clipDurationFrames: 300,
      kind: "audio",
    });
    expect(addedLayer).toBe(true);
    const track = out.layers.find((l) => l.id === AUDIO_TRACK_ID)!;
    expect(track.tags).toEqual(["track", "audio"]);
    const aud = out.layers.find((l) => l.id === "aud-music")!;
    expect(aud.visual.type).toBe("audio");
    expect(aud.visual).toMatchObject({
      type: "audio",
      src: "media/music.mp3",
      startFrame: 0,
      sourceOffset: 0,
      sourceEnd: 10,
    });
    // Audio leaves playbackRate undefined.
    expect((aud.visual as { playbackRate?: number }).playbackRate).toBeUndefined();
    expect(aud.bounds).toEqual({ width: 0, height: 0 });
    expect(out.assets?.["aud-music"]).toMatchObject({ type: "audio" });
  });
});

// ─── recomputeTimeline ───────────────────────────────────────────────

describe("recomputeTimeline", () => {
  it("attaches no timeline when no track groups exist", () => {
    const out = recomputeTimeline(emptyDoc());
    expect(out.timeline).toBeUndefined();
  });

  it("strips a stale timeline when no tracks remain", () => {
    const doc = {
      ...emptyDoc(),
      timeline: { fps, totalFrames: 999, tracks: [] },
    };
    const out = recomputeTimeline(doc);
    expect(out.timeline).toBeUndefined();
  });

  it("emits one track + one clip for a single-clip doc", () => {
    let doc = emptyDoc();
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    }).doc;
    const out = recomputeTimeline(doc);
    expect(out.timeline).toBeDefined();
    expect(out.timeline!.fps).toBe(fps);
    expect(out.timeline!.tracks).toHaveLength(1);
    const track = out.timeline!.tracks[0]!;
    expect(track.id).toBe(VIDEO_TRACK_ID);
    expect(track.kind).toBe("video");
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0]).toMatchObject({
      layerId: "clip-a",
      startFrame: 0,
      endFrame: 60,
      source: "media/a.mp4",
    });
    expect(out.timeline!.totalFrames).toBe(60);
  });

  it("emits 2 tracks when both video + audio clips exist", () => {
    let doc = emptyDoc();
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 2,
      clipDurationFrames: 60,
      kind: "video",
    }).doc;
    doc = ensureClipLayer(doc, {
      clipLayerId: "aud-music",
      trackId: AUDIO_TRACK_ID,
      sourceName: "media/music.mp3",
      clipDurationSeconds: 5,
      clipDurationFrames: 150,
      kind: "audio",
    }).doc;
    const out = recomputeTimeline(doc);
    expect(out.timeline!.tracks).toHaveLength(2);
    const v = out.timeline!.tracks.find((t) => t.id === VIDEO_TRACK_ID)!;
    const a = out.timeline!.tracks.find((t) => t.id === AUDIO_TRACK_ID)!;
    expect(v.kind).toBe("video");
    expect(v.clips).toHaveLength(1);
    expect(v.clips[0]!.layerId).toBe("clip-a");
    expect(a.kind).toBe("audio");
    expect(a.clips).toHaveLength(1);
    expect(a.clips[0]).toMatchObject({
      layerId: "aud-music",
      startFrame: 0,
      endFrame: 150,
      source: "media/music.mp3",
    });
    // totalFrames = max across tracks
    expect(out.timeline!.totalFrames).toBe(150);
  });

  it("does NOT cross-pollinate: a video clip on the audio track is skipped", () => {
    let doc = emptyDoc();
    doc = ensureTrackLayer(doc, AUDIO_TRACK_ID, "audio").doc;
    // Manually parent a video clip onto the audio track group.
    doc = {
      ...doc,
      layers: [...doc.layers, videoChild("rogue", AUDIO_TRACK_ID, 0, "rogue.mp4", 99)],
    };
    const out = recomputeTimeline(doc);
    const a = out.timeline!.tracks.find((t) => t.id === AUDIO_TRACK_ID)!;
    expect(a.clips).toHaveLength(0);
  });
});

// ─── rebuildClipCaptions ─────────────────────────────────────────────

function transcriptFromWords(words: { text: string; start: number; end: number }[]): VideoTranscript {
  return {
    version: "1.1",
    segments: [
      {
        text: words.map((w) => w.text).join(" "),
        start: words[0]?.start ?? 0,
        end: words[words.length - 1]?.end ?? 0,
        words: words.map((w) => ({
          detected: w.text,
          text: w.text,
          start: w.start,
          end: w.end,
        })),
      },
    ],
  };
}

describe("rebuildClipCaptions", () => {
  const canvas = { width: 1080, height: 1920, fps };
  const transcript = transcriptFromWords([
    { text: "hello", start: 0, end: 0.5 },
    { text: "world.", start: 0.5, end: 1.0 },
  ]);

  it("lands caption layers parented to clip with cap-<slug>-N ids", () => {
    let doc = emptyDoc();
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "media/a.mp4",
      clipDurationSeconds: 1,
      clipDurationFrames: 30,
      kind: "video",
    }).doc;

    const out = rebuildClipCaptions(doc, "clip-a", transcript, canvas);
    const captions = out.layers.filter((l) => (l.tags ?? []).includes("caption"));
    expect(captions.length).toBeGreaterThan(0);
    for (const cap of captions) {
      expect(cap.id).toMatch(/^cap-a-\d+$/);
      expect(cap.parentId).toBe("clip-a");
    }
  });

  it("drops THIS clip's old captions but preserves other clips' captions", () => {
    let doc = emptyDoc();
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-a",
      trackId: VIDEO_TRACK_ID,
      sourceName: "a.mp4",
      clipDurationSeconds: 1,
      clipDurationFrames: 30,
      kind: "video",
    }).doc;
    doc = ensureClipLayer(doc, {
      clipLayerId: "clip-b",
      trackId: VIDEO_TRACK_ID,
      sourceName: "b.mp4",
      clipDurationSeconds: 1,
      clipDurationFrames: 30,
      kind: "video",
    }).doc;

    // Build captions for both clips.
    doc = rebuildClipCaptions(doc, "clip-a", transcript, canvas);
    doc = rebuildClipCaptions(doc, "clip-b", transcript, canvas);

    const beforeA = doc.layers.filter((l) => l.parentId === "clip-a" && (l.tags ?? []).includes("caption"));
    const beforeB = doc.layers.filter((l) => l.parentId === "clip-b" && (l.tags ?? []).includes("caption"));
    expect(beforeA.length).toBeGreaterThan(0);
    expect(beforeB.length).toBeGreaterThan(0);

    // Rebuild ONLY clip-a's captions; clip-b's must be untouched.
    const beforeBIds = new Set(beforeB.map((l) => l.id));
    doc = rebuildClipCaptions(doc, "clip-a", transcript, canvas);
    const afterB = doc.layers.filter((l) => l.parentId === "clip-b" && (l.tags ?? []).includes("caption"));
    expect(afterB.map((l) => l.id).sort()).toEqual([...beforeBIds].sort());

    // And clip-a doesn't double up — same count as before.
    const afterA = doc.layers.filter((l) => l.parentId === "clip-a" && (l.tags ?? []).includes("caption"));
    expect(afterA.length).toBe(beforeA.length);
  });
});

// ─── stripStaleCaptionArtifacts ──────────────────────────────────────

describe("stripStaleCaptionArtifacts", () => {
  it("drops only the target clip's captions + unparented captions; preserves others", () => {
    const captionLayer = (id: string, parentId?: string): Layer => ({
      id,
      ...(parentId !== undefined ? { parentId } : {}),
      tags: ["caption"],
      visual: {
        type: "text",
        content: id,
        style: { fontFamily: "Inter", fontSize: 32, color: "#fff" },
      },
      frame: { x: 0, y: 0 },
      bounds: { width: 100, height: 50 },
    });
    const doc: AtelierDocument = {
      ...emptyDoc(),
      layers: [
        captionLayer("caption-0"), // unparented (legacy)
        captionLayer("cap-a-0", "clip-a"), // target clip
        captionLayer("cap-a-1", "clip-a"),
        captionLayer("cap-b-0", "clip-b"), // OTHER clip — must survive
      ],
      states: {
        default: {
          duration: 30,
          deltas: [
            { layer: "caption-0", property: "opacity", from: 0, to: 1, range: [0, 5] },
            { layer: "cap-a-0", property: "opacity", from: 0, to: 1, range: [0, 5] },
            { layer: "cap-b-0", property: "opacity", from: 0, to: 1, range: [0, 5] },
          ],
        },
      },
    };
    const out = stripStaleCaptionArtifacts(doc, "clip-a");
    const ids = out.layers.map((l) => l.id);
    expect(ids).not.toContain("caption-0");
    expect(ids).not.toContain("cap-a-0");
    expect(ids).not.toContain("cap-a-1");
    expect(ids).toContain("cap-b-0");

    const deltaLayers = out.states["default"]!.deltas.map((d) => d.layer);
    expect(deltaLayers).not.toContain("caption-0");
    expect(deltaLayers).not.toContain("cap-a-0");
    expect(deltaLayers).toContain("cap-b-0");
  });
});
