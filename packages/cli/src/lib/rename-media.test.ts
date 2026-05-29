// #rename-media tests — cover the public surface + the two-phase rollback.
//
// Coverage matrix:
//   - Happy path: media + transcript + doc all updated; asset keys preserved
//     per TD-2026-05-27; .src rewritten; layer ids in result.
//   - No transcript exists → succeeds with transcriptRenamed: false.
//   - Destination already exists → throws with no changes made.
//   - Mid-op failure: mock writeFileSync to throw → assert media + transcript
//     rolled back.
//   - DESIGN.md / SCRIPT.md / STORYBOARD.md references → warnings populated,
//     files untouched on disk.
//   - Asset key `clip-<old-slug>` retained; `.src` updated.
//   - Doc with timeline block: clips[*].source rewritten via recomputeTimeline.
//   - dryRun: true → no disk writes; lists report what WOULD have changed.
//   - Same-name no-op.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AtelierDocument } from "@a-company/atelier-types";
import {
  renameMedia,
  applyMediaRenameToDoc,
  scanArtifactsForOldBasename,
  isValidMediaBasenameForRename,
} from "./rename-media.js";

/** Minimal multi-clip doc fixture — one track group, one video clip,
 *  one asset keyed by the clip layer id (mirrors compose-video-project). */
function makeDocFixture(
  basename: string,
  opts: { withTimeline?: boolean } = {},
): AtelierDocument {
  const trackId = "track-video-1";
  const clipLayerId = "clip-img-7346";
  const doc: AtelierDocument = {
    version: "1.0",
    name: "fixture",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [
      {
        id: trackId,
        tags: ["track", "video"],
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
      {
        id: clipLayerId,
        parentId: trackId,
        visual: {
          type: "video",
          assetId: clipLayerId,
          src: `media/${basename}`,
          startFrame: 0,
          sourceOffset: 0,
          sourceEnd: 2,
          playbackRate: 1.0,
          objectFit: "contain",
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
    ],
    assets: {
      [clipLayerId]: {
        type: "video",
        src: `media/${basename}`,
        description: `Source: media/${basename}`,
      },
    },
    states: { default: { duration: 60, deltas: [] } },
  };
  if (opts.withTimeline) {
    doc.timeline = {
      fps: 30,
      totalFrames: 60,
      tracks: [
        {
          id: trackId,
          kind: "video",
          clips: [
            { layerId: clipLayerId, startFrame: 0, endFrame: 60, source: `media/${basename}` },
          ],
        },
      ],
    };
  }
  return doc;
}

function setupProject(opts: {
  oldBasename: string;
  withTranscript?: boolean;
  withDesign?: boolean;
  withTimeline?: boolean;
  withSibling?: boolean;
}): string {
  const projectDir = mkdtempSync(join(tmpdir(), "rename-media-test-"));
  mkdirSync(join(projectDir, "media"), { recursive: true });
  writeFileSync(join(projectDir, "media", opts.oldBasename), "fake-bytes");
  if (opts.withSibling) {
    writeFileSync(join(projectDir, "media", "other.mp4"), "other-bytes");
  }
  if (opts.withTranscript) {
    mkdirSync(join(projectDir, "transcripts"), { recursive: true });
    const stem = opts.oldBasename.replace(/\.[^./\\]+$/, "");
    writeFileSync(
      join(projectDir, "transcripts", `${stem}.json`),
      JSON.stringify({ segments: [] }, null, 2),
    );
  }
  const doc = makeDocFixture(opts.oldBasename, { withTimeline: opts.withTimeline });
  writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
  if (opts.withDesign) {
    writeFileSync(
      join(projectDir, "DESIGN.md"),
      `# Design\n\nWe use ${opts.oldBasename} as the source.\n`,
    );
  }
  return projectDir;
}

describe("renameMedia — pure helpers", () => {
  it("applyMediaRenameToDoc rewrites assets src + layer visual.src; keeps keys", () => {
    const doc = makeDocFixture("IMG_7346.MOV");
    const out = applyMediaRenameToDoc(doc, "IMG_7346.MOV", "IMG_NEW.MOV");

    // Asset key stable per TD-2026-05-27
    expect(Object.keys(out.doc.assets ?? {})).toEqual(["clip-img-7346"]);
    expect(out.doc.assets?.["clip-img-7346"]?.src).toBe("media/IMG_NEW.MOV");
    expect(out.assetKeysUpdated).toEqual(["clip-img-7346"]);

    // Layer src rewritten; same id
    const clip = out.doc.layers.find((l) => l.id === "clip-img-7346");
    expect(clip).toBeDefined();
    const visual = clip!.visual as { src?: string };
    expect(visual.src).toBe("media/IMG_NEW.MOV");
    expect(out.layersUpdated).toEqual(["clip-img-7346"]);
  });

  it("applyMediaRenameToDoc is a no-op when nothing matches", () => {
    const doc = makeDocFixture("IMG_7346.MOV");
    const out = applyMediaRenameToDoc(doc, "OTHER.MOV", "REPLACEMENT.MOV");
    expect(out.assetKeysUpdated).toEqual([]);
    expect(out.layersUpdated).toEqual([]);
  });

  it("scanArtifactsForOldBasename surfaces a warning per artifact mentioning the basename", () => {
    const dir = mkdtempSync(join(tmpdir(), "rename-warn-"));
    try {
      writeFileSync(join(dir, "DESIGN.md"), "we use IMG_7346.MOV here");
      writeFileSync(join(dir, "SCRIPT.md"), "no mention");
      writeFileSync(join(dir, "STORYBOARD.md"), "panel 1: IMG_7346.MOV cutaway");
      const warnings = scanArtifactsForOldBasename(dir, "IMG_7346.MOV");
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain("DESIGN.md");
      expect(warnings[1]).toContain("STORYBOARD.md");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("isValidMediaBasenameForRename rejects path-traversal + hidden", () => {
    expect(isValidMediaBasenameForRename("IMG_NEW.MOV")).toBe(true);
    expect(isValidMediaBasenameForRename("my.file.mp4")).toBe(true);
    expect(isValidMediaBasenameForRename("../escape.mov")).toBe(false);
    expect(isValidMediaBasenameForRename("sub/dir.mov")).toBe(false);
    expect(isValidMediaBasenameForRename("..")).toBe(false);
    expect(isValidMediaBasenameForRename(".hidden.mp4")).toBe(false);
    expect(isValidMediaBasenameForRename("")).toBe(false);
    expect(isValidMediaBasenameForRename(undefined)).toBe(false);
    expect(isValidMediaBasenameForRename(42)).toBe(false);
    expect(isValidMediaBasenameForRename("with space.mp4")).toBe(true);
  });

  // Aegis Finding 4 (TD-2026-05-27) — control-char rejection. Both CLI and
  // MCP duplicates use the escaped `[\x00-\x1f]` form; this assertion
  // anchors the behavior so a future regex mangle (literal-byte mode) is
  // caught here before it ships.
  it("isValidMediaBasenameForRename rejects NUL / control bytes in basenames", () => {
    expect(isValidMediaBasenameForRename("IMG\x00.MOV")).toBe(false);
    expect(isValidMediaBasenameForRename("IMG\x01.MOV")).toBe(false);
    expect(isValidMediaBasenameForRename("IMG\x1f.MOV")).toBe(false);
    expect(isValidMediaBasenameForRename("IMG\nNEW.MOV")).toBe(false);
    expect(isValidMediaBasenameForRename("IMG\tNEW.MOV")).toBe(false);
  });
});

describe("renameMedia — public API", () => {
  let projectDir: string;
  afterEach(() => {
    if (projectDir && existsSync(projectDir)) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("happy path: renames media + transcript + updates doc; keys preserved", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });

    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
    });

    expect(result.docUpdated).toBe(true);
    expect(result.transcriptRenamed).toBe(true);
    expect(result.assetKeysUpdated).toEqual(["clip-img-7346"]);
    expect(result.layersUpdated).toEqual(["clip-img-7346"]);
    expect(result.warnings).toEqual([]);

    // Disk state.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(false);
    expect(existsSync(join(projectDir, "media", "IMG_NEW.MOV"))).toBe(true);
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts", "IMG_NEW.json"))).toBe(true);

    const docOnDisk = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    expect(docOnDisk.assets?.["clip-img-7346"]?.src).toBe("media/IMG_NEW.MOV");
    const visual = docOnDisk.layers.find((l) => l.id === "clip-img-7346")!.visual as { src?: string };
    expect(visual.src).toBe("media/IMG_NEW.MOV");
  });

  it("no transcript present → succeeds with transcriptRenamed:false", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV" });
    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
    });
    expect(result.docUpdated).toBe(true);
    expect(result.transcriptRenamed).toBe(false);
  });

  it("destination already exists → throws BEFORE any rename, no disk changes", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });
    writeFileSync(join(projectDir, "media", "IMG_NEW.MOV"), "pre-existing");

    await expect(
      renameMedia({
        projectDir,
        oldBasename: "IMG_7346.MOV",
        newBasename: "IMG_NEW.MOV",
      }),
    ).rejects.toThrow(/destination file already exists/);

    // Original media untouched; pre-existing dest untouched.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
    expect(readFileSync(join(projectDir, "media", "IMG_NEW.MOV"), "utf-8")).toBe("pre-existing");
    // Transcript untouched.
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(true);
  });

  it("source media file missing → throws media file not found", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV" });
    await expect(
      renameMedia({
        projectDir,
        oldBasename: "DOES_NOT_EXIST.MOV",
        newBasename: "IMG_NEW.MOV",
      }),
    ).rejects.toThrow(/media file not found/);
  });

  it("project has no media/ dir → throws", async () => {
    projectDir = mkdtempSync(join(tmpdir(), "rename-no-media-"));
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(makeDocFixture("x.mov"), null, 2));
    await expect(
      renameMedia({
        projectDir,
        oldBasename: "x.mov",
        newBasename: "y.mov",
      }),
    ).rejects.toThrow(/project has no media\/ dir/);
  });

  it("mid-op writeFileSync failure → rolls back media + transcript renames", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });

    // Force the doc write to fail by replacing project.atelier with a directory
    // of the same name after the in-memory read completes — but we can't time
    // that. Simpler trick: delete project.atelier and put a DIRECTORY at the
    // same path so the staged-write step throws EISDIR. Phase 1 reads the
    // original doc, then we swap before Phase 2 runs. Race-free because
    // renameMedia is single-threaded; we mutate after reading is done by
    // pre-staging a no-op doc and then swapping.
    //
    // Easier still: chmod the .atelier file to 0o444 (read-only) AFTER the
    // doc was read. We can't because Phase 1 happens inside the call. Use a
    // pre-write hook: make the .atelier path a directory BEFORE the call so
    // Phase 1's readAtelierDoc would fail. That doesn't reach Phase 2.
    //
    // Working approach: chmod the .atelier to read-only, and on systems where
    // root would bypass chmod, also chmod the project directory itself. We
    // run as non-root in CI/dev so writeFileSync gets EACCES.
    chmodSync(join(projectDir, "project.atelier"), 0o444);
    chmodSync(projectDir, 0o555);

    let threw = false;
    try {
      await renameMedia({
        projectDir,
        oldBasename: "IMG_7346.MOV",
        newBasename: "IMG_NEW.MOV",
      });
    } catch {
      threw = true;
    } finally {
      // Restore perms so rmSync in afterEach works.
      chmodSync(projectDir, 0o755);
      chmodSync(join(projectDir, "project.atelier"), 0o644);
    }

    expect(threw).toBe(true);

    // Rollback assertions: media + transcript back to old names.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
    expect(existsSync(join(projectDir, "media", "IMG_NEW.MOV"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(true);
    expect(existsSync(join(projectDir, "transcripts", "IMG_NEW.json"))).toBe(false);
  });

  it("DESIGN.md / SCRIPT.md / STORYBOARD.md references → warnings populated, files untouched", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withDesign: true });
    const designBefore = readFileSync(join(projectDir, "DESIGN.md"), "utf-8");

    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("DESIGN.md");
    expect(result.warnings[0]).toContain("IMG_7346.MOV");

    // File on disk unchanged.
    expect(readFileSync(join(projectDir, "DESIGN.md"), "utf-8")).toBe(designBefore);
  });

  it("doc with timeline block → clips[*].source rewritten via recomputeTimeline", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTimeline: true });
    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
    });
    expect(result.timelineRegenerated).toBe(true);

    const docOnDisk = JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8")) as AtelierDocument;
    const clipSrc = docOnDisk.timeline?.tracks[0]?.clips[0]?.source;
    expect(clipSrc).toBe("media/IMG_NEW.MOV");
  });

  it("dryRun:true → no disk writes; lists report what WOULD have changed", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });
    const docBefore = readFileSync(join(projectDir, "project.atelier"), "utf-8");

    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
      dryRun: true,
    });

    expect(result.docUpdated).toBe(false);
    expect(result.transcriptRenamed).toBe(false);
    expect(result.timelineRegenerated).toBe(false);
    // Lists still report what WOULD have changed.
    expect(result.assetKeysUpdated).toEqual(["clip-img-7346"]);
    expect(result.layersUpdated).toEqual(["clip-img-7346"]);

    // Disk untouched.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
    expect(existsSync(join(projectDir, "media", "IMG_NEW.MOV"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(true);
    expect(readFileSync(join(projectDir, "project.atelier"), "utf-8")).toBe(docBefore);
  });

  it("same-name no-op", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });
    const docBefore = readFileSync(join(projectDir, "project.atelier"), "utf-8");

    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_7346.MOV",
    });

    expect(result.docUpdated).toBe(false);
    expect(result.transcriptRenamed).toBe(false);
    expect(result.assetKeysUpdated).toEqual([]);
    expect(result.layersUpdated).toEqual([]);
    expect(result.timelineRegenerated).toBe(false);

    // Disk untouched.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
    expect(readFileSync(join(projectDir, "project.atelier"), "utf-8")).toBe(docBefore);
  });

  // Aegis Finding 3 (TD-2026-05-27) — per-project mutex serializes
  // concurrent rename calls on the same projectDir, eliminating the TOCTOU
  // race in the two-phase fs ops. Either ordering is acceptable; the
  // forbidden outcome is a partial / corrupted state.
  it("two concurrent renameMedia calls on the same project serialize (no race)", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });

    // Kick off two concurrent calls. The first should succeed; the second
    // should see the post-first-rename state (source missing) and reject
    // with "media file not found". The crucial assertion: there's exactly
    // one settled-OK and one rejected — never two OKs (would mean races
    // overlapped) and never one corrupted disk state.
    const [res1, res2] = await Promise.allSettled([
      renameMedia({
        projectDir,
        oldBasename: "IMG_7346.MOV",
        newBasename: "IMG_NEW.MOV",
      }),
      renameMedia({
        projectDir,
        oldBasename: "IMG_7346.MOV",
        newBasename: "IMG_OTHER.MOV",
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
    const rejected = [res1, res2].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(
      /media file not found/,
    );

    // Disk state: source gone, exactly ONE of the two destinations exists.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(false);
    const dests = [
      existsSync(join(projectDir, "media", "IMG_NEW.MOV")),
      existsSync(join(projectDir, "media", "IMG_OTHER.MOV")),
    ];
    expect(dests.filter(Boolean)).toHaveLength(1);
  });

  it("doc references nothing → still renames file + transcript; empty lists", async () => {
    projectDir = setupProject({ oldBasename: "IMG_7346.MOV", withTranscript: true });
    // Replace the doc with one that has no media references.
    const emptyDoc: AtelierDocument = {
      version: "1.0",
      name: "empty",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 0, deltas: [] } },
    };
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(emptyDoc, null, 2));

    const result = await renameMedia({
      projectDir,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG_NEW.MOV",
    });
    expect(result.docUpdated).toBe(true);
    expect(result.transcriptRenamed).toBe(true);
    expect(result.assetKeysUpdated).toEqual([]);
    expect(result.layersUpdated).toEqual([]);
    expect(existsSync(join(projectDir, "media", "IMG_NEW.MOV"))).toBe(true);
  });
});

// Defensive: keep beforeEach referenced so the harness doesn't tree-shake it.
void beforeEach;
