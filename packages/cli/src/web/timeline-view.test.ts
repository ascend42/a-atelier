// Tests for #bottom-timeline-view's pure layout helper (`computeClipPositions`).
//
// The DOM-bound parts of TimelineView are manually verified — there's no jsdom
// harness in this repo (Kit-D from an earlier session). Anything pure lands
// here so the math is regression-guarded.

import { describe, it, expect } from "vitest";

import { computeClipPositions } from "./timeline-view.js";

describe("computeClipPositions", () => {
  it("places a single clip at the start of the lane", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-1", startFrame: 0, endFrame: 30, source: "media/IMG_7346.MOV" }],
      "track-video-1",
      150,
      1000,
    );
    expect(out).toHaveLength(1);
    expect(out[0].leftPx).toBe(0);
    // 30 / 150 * 1000 = 200
    expect(out[0].widthPx).toBeCloseTo(200);
    expect(out[0].trackId).toBe("track-video-1");
    expect(out[0].layerId).toBe("clip-1");
  });

  it("derives the label from the source basename without extension", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-1", startFrame: 0, endFrame: 30, source: "media/IMG_7346.MOV" }],
      "track-video-1",
      150,
      1000,
    );
    expect(out[0].label).toBe("IMG_7346");
  });

  it("falls back to layerId when source is empty", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-fallback", startFrame: 0, endFrame: 30, source: "" }],
      "track-video-1",
      150,
      1000,
    );
    expect(out[0].label).toBe("clip-fallback");
  });

  it("positions sequential clips proportionally to startFrame/endFrame", () => {
    const out = computeClipPositions(
      [
        { layerId: "clip-a", startFrame: 0, endFrame: 60, source: "a.mov" },
        { layerId: "clip-b", startFrame: 60, endFrame: 120, source: "b.mov" },
      ],
      "track-video-1",
      120,
      600,
    );
    expect(out[0].leftPx).toBe(0);
    expect(out[0].widthPx).toBeCloseTo(300);
    expect(out[1].leftPx).toBeCloseTo(300);
    expect(out[1].widthPx).toBeCloseTo(300);
  });

  it("clamps zero-length clips to a minimum 4px width", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-zero", startFrame: 30, endFrame: 30, source: "z.mov" }],
      "track-video-1",
      150,
      1000,
    );
    expect(out[0].widthPx).toBe(4);
  });

  it("returns an empty array for an empty clip list", () => {
    const out = computeClipPositions([], "track-video-1", 150, 1000);
    expect(out).toEqual([]);
  });

  it("handles totalFrames=0 by collapsing every clip to the lane origin", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-1", startFrame: 0, endFrame: 30, source: "a.mov" }],
      "track-video-1",
      0,
      1000,
    );
    expect(out[0].leftPx).toBe(0);
    // endPx - leftPx === 0, so the 4px floor kicks in.
    expect(out[0].widthPx).toBe(4);
  });

  it("strips only the last extension from a dotted basename", () => {
    const out = computeClipPositions(
      [{ layerId: "clip-1", startFrame: 0, endFrame: 30, source: "media/scene.take.1.mov" }],
      "track-video-1",
      150,
      1000,
    );
    expect(out[0].label).toBe("scene.take.1");
  });
});
