// Tests for #ingest-dispatch — classifier + post-pivot routing.

import { describe, it, expect } from "vitest";

import {
  classifyMediaFile,
  routeIngest,
  routeIngestWithTarget,
} from "./ingest-dispatch.js";

// ─── classifyMediaFile ────────────────────────────────────────────

describe("classifyMediaFile", () => {
  it("recognizes video extensions case-insensitively", () => {
    expect(classifyMediaFile("clip.mp4")).toBe("video");
    expect(classifyMediaFile("IMG_7346.MOV")).toBe("video");
    expect(classifyMediaFile("anim.WebM")).toBe("video");
    expect(classifyMediaFile("backup.mkv")).toBe("video");
    expect(classifyMediaFile("legacy.avi")).toBe("video");
  });

  it("recognizes image extensions case-insensitively", () => {
    expect(classifyMediaFile("photo.png")).toBe("image");
    expect(classifyMediaFile("photo.jpg")).toBe("image");
    expect(classifyMediaFile("photo.jpeg")).toBe("image");
    expect(classifyMediaFile("photo.webp")).toBe("image");
    expect(classifyMediaFile("anim.GIF")).toBe("image");
  });

  it("recognizes audio extensions case-insensitively", () => {
    expect(classifyMediaFile("track.mp3")).toBe("audio");
    expect(classifyMediaFile("voice.WAV")).toBe("audio");
    expect(classifyMediaFile("mix.m4a")).toBe("audio");
    expect(classifyMediaFile("clip.aac")).toBe("audio");
    expect(classifyMediaFile("master.flac")).toBe("audio");
    expect(classifyMediaFile("sound.ogg")).toBe("audio");
  });

  it("returns unsupported for unknown / extensionless filenames", () => {
    expect(classifyMediaFile("notes.txt")).toBe("unsupported");
    expect(classifyMediaFile("paper.pdf")).toBe("unsupported");
    expect(classifyMediaFile("no-extension")).toBe("unsupported");
    expect(classifyMediaFile("README")).toBe("unsupported");
  });
});

// ─── routeIngest — post-pivot 4-cell matrix ───────────────────────
//
// ── v1.0 media-bin pivot (Kit-A) ──
// Post-TD-2026-05-28: project kind no longer factors in. Supported media
// always lands in the bin; unsupported types reject. The dispatcher's
// no-target branch is now a thin classify-then-decide.

describe("routeIngest — post-pivot media-bin routing", () => {
  it("video → add-to-bin", () => {
    const route = routeIngest("clip.mp4");
    expect(route.kind).toBe("video");
    expect(route.target).toBe("add-to-bin");
    expect(route.error).toBeUndefined();
  });

  it("image → add-to-bin", () => {
    const route = routeIngest("photo.png");
    expect(route.kind).toBe("image");
    expect(route.target).toBe("add-to-bin");
    expect(route.error).toBeUndefined();
  });

  it("audio → add-to-bin", () => {
    const route = routeIngest("track.mp3");
    expect(route.kind).toBe("audio");
    expect(route.target).toBe("add-to-bin");
    expect(route.error).toBeUndefined();
  });

  it("unsupported → reject with file-type message", () => {
    const route = routeIngest("notes.txt");
    expect(route.kind).toBe("unsupported");
    expect(route.target).toBe("reject");
    expect(route.error).toBe("file type not supported");
  });
});

// ─── routeIngestWithTarget — explicit canvas drop matrix ───────────
//
// Canvas-area drag-drop carries the loaded doc's path so the upload attaches
// to that doc. The compatibility matrix is governed by the TARGET doc's
// kind. Unchanged by the media-bin pivot — this is where actual composition
// happens.

describe("routeIngestWithTarget — explicit target compatibility", () => {
  it("video file + video target doc → compose-video carrying docPath", () => {
    const route = routeIngestWithTarget("foo.mp4", "vid.atelier", "video");
    expect(route.kind).toBe("video");
    expect(route.target).toBe("compose-video");
    expect(route.docPath).toBe("vid.atelier");
    expect(route.error).toBeUndefined();
  });

  it("video file + image target doc → reject (cannot mix kinds)", () => {
    const route = routeIngestWithTarget("foo.mp4", "img.atelier", "image");
    expect(route.kind).toBe("video");
    expect(route.target).toBe("reject");
    expect(route.docPath).toBeUndefined();
    expect(route.error).toContain("image doc");
  });

  it("video file + carousel target doc → reject", () => {
    const route = routeIngestWithTarget("foo.mp4", "deck.atelier", "carousel");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("carousel doc");
  });

  it("audio file + video target doc → add-audio-clip carrying docPath", () => {
    const route = routeIngestWithTarget("track.mp3", "vid.atelier", "video");
    expect(route.kind).toBe("audio");
    expect(route.target).toBe("add-audio-clip");
    expect(route.docPath).toBe("vid.atelier");
  });

  it("audio file + image target doc → reject", () => {
    const route = routeIngestWithTarget("track.mp3", "img.atelier", "image");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("image doc");
  });

  it("audio file + carousel target doc → reject", () => {
    const route = routeIngestWithTarget("track.mp3", "deck.atelier", "carousel");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("carousel doc");
  });

  it("image file + any target → reject (v1 scope)", () => {
    for (const k of ["video", "image", "carousel"] as const) {
      const route = routeIngestWithTarget("photo.png", "any.atelier", k);
      expect(route.target).toBe("reject");
      expect(route.error).toContain("v1");
    }
  });

  it("unsupported file with explicit target → reject", () => {
    const route = routeIngestWithTarget("notes.txt", "vid.atelier", "video");
    expect(route.kind).toBe("unsupported");
    expect(route.target).toBe("reject");
    expect(route.error).toBe("file type not supported");
  });

  it("targetDocKind missing → reject (caller bug guard)", () => {
    const route = routeIngestWithTarget("clip.mp4", "vid.atelier", undefined);
    expect(route.target).toBe("reject");
    expect(route.error).toContain("target doc kind");
  });
});
