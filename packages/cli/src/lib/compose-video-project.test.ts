// Tests for #compose-video-project — focused on the caller-supplied docPath
// contract introduced by the v1 ingest pivot. Broader behavioral coverage
// (multi-clip preservation, caption rebuild, slug derivation) lives in
// workspace-ui.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";

import { composeVideoProject } from "./compose-video-project.js";

let workDir: string;
let projectDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "atelier-compose-video-test-"));
  projectDir = join(workDir, "my-video-project");
  mkdirSync(projectDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeTranscribe(text: string) {
  return vi.fn(async () => ({
    projectDir,
    backend: "whisper-cpp",
    transcript: {
      version: "1.1" as const,
      language: "en",
      segments: [
        {
          text,
          start: 0,
          end: 1.0,
          words: [{ detected: text, text, start: 0, end: 1.0 }],
        },
      ],
    },
    wordCount: 1,
    captionsGenerated: true,
  }));
}

describe("composeVideoProject — docPath contract", () => {
  it("writes to a non-default docPath and does NOT touch project.atelier", async () => {
    // Caller specifies a slug-based doc path — the v1 ingest pivot.
    // The compose helper must write ONLY to <projectDir>/<docPath>, never
    // to project.atelier.
    const sourceFile = join(projectDir, "clip-a.mp4");
    writeFileSync(sourceFile, "fake bytes");

    const result = await composeVideoProject({
      projectDir,
      docPath: "clip-A.atelier",
      sourceFile,
      transcribeFn: makeTranscribe("alpha"),
      probeDurationFn: async () => 2.0,
    });

    expect(result.addedVideoLayer).toBe(true);

    // The slug-based doc file exists.
    const slugDocPath = join(projectDir, "clip-A.atelier");
    expect(existsSync(slugDocPath)).toBe(true);

    // Critical: the helper must NOT write project.atelier.
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(false);

    const persisted = JSON.parse(
      readFileSync(slugDocPath, "utf-8"),
    ) as AtelierDocument;
    expect(persisted.kind).toBe("video");
    expect(persisted.layers.some((l) => l.id === "track-video-1")).toBe(true);
    expect(persisted.layers.some((l) => l.id === "clip-clip-a")).toBe(true);
  });

  it("scaffolds the doc when docPath is absent (no pre-seeded project.atelier required)", async () => {
    // Today the helper threw when project.atelier was missing. After the
    // pivot it scaffolds a fresh kind:"video" doc at the supplied docPath.
    const sourceFile = join(projectDir, "source.mp4");
    writeFileSync(sourceFile, "fake bytes");

    const result = await composeVideoProject({
      projectDir,
      docPath: "source.atelier",
      sourceFile,
      transcribeFn: makeTranscribe("hi"),
      probeDurationFn: async () => 1.0,
    });

    expect(result.addedVideoLayer).toBe(true);
    const persisted = JSON.parse(
      readFileSync(join(projectDir, "source.atelier"), "utf-8"),
    ) as AtelierDocument;
    expect(persisted.kind).toBe("video");
  });

  it("creates parent directories for nested docPaths", async () => {
    // A docPath like "slides/slide-1.atelier" needs the parent dir created.
    const sourceFile = join(projectDir, "vid.mp4");
    writeFileSync(sourceFile, "fake bytes");

    await composeVideoProject({
      projectDir,
      docPath: "slides/slide-1.atelier",
      sourceFile,
      transcribeFn: makeTranscribe("hi"),
      probeDurationFn: async () => 1.0,
    });

    expect(existsSync(join(projectDir, "slides", "slide-1.atelier"))).toBe(true);
  });
});
