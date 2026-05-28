// Tests for #ingest-dispatch — classifier + 12-cell routing matrix.

import { describe, it, expect } from "vitest";
import type { ProjectKind } from "@a-company/atelier-types";

import {
  classifyMediaFile,
  routeIngest,
  routeIngestWithTarget,
  type IngestKind,
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

// ─── routeIngest — 12-cell truth table ────────────────────────────

interface MatrixCell {
  label: string;
  filename: string;
  projectKind: ProjectKind | undefined;
  expectedKind: IngestKind;
  expectedTarget: "compose-video" | "compose-image" | "add-audio-clip" | "reject";
  /** When target is reject, the substring we expect inside `error`. */
  expectedErrorSubstring?: string;
}

const MATRIX: MatrixCell[] = [
  {
    label: "video + video → compose-video",
    filename: "clip.mp4",
    projectKind: "video",
    expectedKind: "video",
    expectedTarget: "compose-video",
  },
  {
    label: "video + undefined → compose-video (scaffold)",
    filename: "clip.mp4",
    projectKind: undefined,
    expectedKind: "video",
    expectedTarget: "compose-video",
  },
  {
    label: "video + image → reject",
    filename: "clip.mp4",
    projectKind: "image",
    expectedKind: "video",
    expectedTarget: "reject",
    expectedErrorSubstring: "carousel to combine",
  },
  {
    label: "video + carousel → reject",
    filename: "clip.mp4",
    projectKind: "carousel",
    expectedKind: "video",
    expectedTarget: "reject",
    expectedErrorSubstring: "slides API",
  },
  {
    label: "image + video → reject",
    filename: "photo.png",
    projectKind: "video",
    expectedKind: "image",
    expectedTarget: "reject",
    expectedErrorSubstring: "not supported in v1",
  },
  {
    label: "image + image → reject",
    filename: "photo.png",
    projectKind: "image",
    expectedKind: "image",
    expectedTarget: "reject",
    expectedErrorSubstring: "rename or delete",
  },
  {
    label: "image + carousel → reject",
    filename: "photo.png",
    projectKind: "carousel",
    expectedKind: "image",
    expectedTarget: "reject",
    expectedErrorSubstring: "slides API",
  },
  {
    label: "image + undefined → compose-image",
    filename: "photo.png",
    projectKind: undefined,
    expectedKind: "image",
    expectedTarget: "compose-image",
  },
  {
    label: "audio + video → add-audio-clip",
    filename: "track.mp3",
    projectKind: "video",
    expectedKind: "audio",
    expectedTarget: "add-audio-clip",
  },
  {
    label: "audio + image → reject",
    filename: "track.mp3",
    projectKind: "image",
    expectedKind: "audio",
    expectedTarget: "reject",
    expectedErrorSubstring: "image project",
  },
  {
    label: "audio + carousel → reject",
    filename: "track.mp3",
    projectKind: "carousel",
    expectedKind: "audio",
    expectedTarget: "reject",
    expectedErrorSubstring: "carousel project",
  },
  {
    label: "audio + undefined → reject",
    filename: "track.mp3",
    projectKind: undefined,
    expectedKind: "audio",
    expectedTarget: "reject",
    expectedErrorSubstring: "audio cannot create a project",
  },
];

describe("routeIngest — 12-cell matrix", () => {
  for (const cell of MATRIX) {
    it(cell.label, () => {
      const route = routeIngest(cell.filename, cell.projectKind);
      expect(route.kind).toBe(cell.expectedKind);
      expect(route.target).toBe(cell.expectedTarget);
      if (cell.expectedTarget === "reject") {
        expect(route.error).toBeDefined();
        expect(typeof route.error).toBe("string");
        expect((route.error ?? "").length).toBeGreaterThan(0);
        if (cell.expectedErrorSubstring) {
          expect(route.error).toContain(cell.expectedErrorSubstring);
        }
      } else {
        expect(route.error).toBeUndefined();
      }
    });
  }
});

describe("routeIngest — unsupported types reject regardless of project kind", () => {
  for (const projectKind of [undefined, "video", "image", "carousel"] as const) {
    it(`unsupported + ${projectKind ?? "undefined"} → reject`, () => {
      const route = routeIngest("notes.txt", projectKind);
      expect(route.kind).toBe("unsupported");
      expect(route.target).toBe("reject");
      expect(route.error).toBe("file type not supported");
    });
  }
});

// ─── routeIngestWithTarget — explicit canvas drop matrix ───────────
//
// Canvas-area drag-drop carries the loaded doc's path so the upload attaches
// to that doc instead of scaffolding a fresh <slug>.atelier. The
// compatibility matrix is governed by the TARGET doc's kind, not the
// project's inferred kind. When `targetDocPath` is absent the call must
// degrade to `routeIngest`'s legacy semantics — the sidebar/page-level drop
// is still the default.

describe("routeIngestWithTarget — explicit target compatibility", () => {
  it("video file + video target doc → compose-video carrying docPath", () => {
    const route = routeIngestWithTarget("foo.mp4", "video", "vid.atelier", "video");
    expect(route.kind).toBe("video");
    expect(route.target).toBe("compose-video");
    expect(route.docPath).toBe("vid.atelier");
    expect(route.error).toBeUndefined();
  });

  it("video file + image target doc → reject (cannot mix kinds)", () => {
    const route = routeIngestWithTarget("foo.mp4", "video", "img.atelier", "image");
    expect(route.kind).toBe("video");
    expect(route.target).toBe("reject");
    expect(route.docPath).toBeUndefined();
    expect(route.error).toContain("image doc");
  });

  it("video file + carousel target doc → reject", () => {
    const route = routeIngestWithTarget("foo.mp4", "carousel", "deck.atelier", "carousel");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("carousel doc");
  });

  it("audio file + video target doc → add-audio-clip carrying docPath", () => {
    const route = routeIngestWithTarget("track.mp3", "video", "vid.atelier", "video");
    expect(route.kind).toBe("audio");
    expect(route.target).toBe("add-audio-clip");
    expect(route.docPath).toBe("vid.atelier");
  });

  it("audio file + image target doc → reject", () => {
    const route = routeIngestWithTarget("track.mp3", "image", "img.atelier", "image");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("image doc");
  });

  it("audio file + carousel target doc → reject", () => {
    const route = routeIngestWithTarget("track.mp3", "carousel", "deck.atelier", "carousel");
    expect(route.target).toBe("reject");
    expect(route.error).toContain("carousel doc");
  });

  it("image file + any target → reject (v1 scope)", () => {
    for (const k of ["video", "image", "carousel"] as const) {
      const route = routeIngestWithTarget("photo.png", k, "any.atelier", k);
      expect(route.target).toBe("reject");
      expect(route.error).toContain("v1");
    }
  });

  it("unsupported file with explicit target → reject", () => {
    const route = routeIngestWithTarget("notes.txt", "video", "vid.atelier", "video");
    expect(route.kind).toBe("unsupported");
    expect(route.target).toBe("reject");
    expect(route.error).toBe("file type not supported");
  });

  it("no targetDocPath → identical to routeIngest (sidebar fallback)", () => {
    const target = routeIngestWithTarget("clip.mp4", "video", undefined, undefined);
    const legacy = routeIngest("clip.mp4", "video");
    expect(target.kind).toBe(legacy.kind);
    expect(target.target).toBe(legacy.target);
    expect(target.docPath).toBeUndefined();
  });

  it("targetDocPath set but targetDocKind missing → reject (caller bug guard)", () => {
    const route = routeIngestWithTarget("clip.mp4", "video", "vid.atelier", undefined);
    expect(route.target).toBe("reject");
    expect(route.error).toContain("target doc kind");
  });
});
