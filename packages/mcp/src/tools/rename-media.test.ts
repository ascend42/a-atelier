// Tests for the v1.0 atelier_rename_media MCP tool (rename-media.ts).
//
// Pattern mirrors clips.test.ts:
//   - Real DocumentStore + linked in-memory transport pair
//   - callTool helper parses JSON envelopes from the SDK response
//   - Temp dirs hold a freshly-written project.atelier + media/ + transcripts/
//
// Coverage:
//   - Happy path: tool returns { success: true, result } with expected fields.
//   - Path traversal in oldBasename → tool returns error envelope.
//   - Path traversal in newBasename → tool returns error envelope.
//   - Leading-dot rejected.
//   - Backslash rejected.
//   - Missing project dir → returns error.
//   - dryRun:true → media file unchanged on disk.
//   - Doc reloaded into store after success.
//   - Workspace scoping (Aegis Finding 1, TD-2026-05-27):
//       - projectDir inside workspaceDir → accepted
//       - projectDir outside workspaceDir → rejected
//       - missing project.atelier in projectDir → rejected
//   - Control-char regex (Aegis Finding 4): NUL in basename rejected.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AtelierDocument } from "@a-company/atelier-types";
import { createServer, DocumentStore } from "../index.js";

// ─── Helpers ──────────────────────────────────────────────────

async function setup() {
  const { server, store } = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "rename-media-test-client", version: "1.0.0" });
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

/**
 * Project fixture: a single-clip doc referencing media/IMG_7346.MOV in
 * assets[].src + a video layer's visual.src. Mirrors what compose-video-project
 * lands after a single ingest.
 */
function makeProjectDocFixture(): AtelierDocument {
  return {
    version: "1.0",
    kind: "video",
    name: "rename-test",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [
      {
        id: "track-video-1",
        tags: ["track", "video"],
        visual: { type: "group" },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
      {
        id: "clip-img-7346",
        parentId: "track-video-1",
        visual: {
          type: "video",
          assetId: "clip-img-7346",
          src: "media/IMG_7346.MOV",
          startFrame: 0,
          sourceOffset: 0,
          sourceEnd: 5,
        },
        frame: { x: 0, y: 0 },
        bounds: { width: 1080, height: 1920 },
      },
    ],
    states: { default: { duration: 150, deltas: [] } },
    assets: {
      "clip-img-7346": { type: "video", src: "media/IMG_7346.MOV" },
    },
  };
}

/** Build the project on disk: project.atelier + media/<basename> + maybe a transcript. */
function writeProject(
  projectDir: string,
  doc: AtelierDocument,
  mediaBasename: string,
  opts: { transcript?: boolean } = {},
): void {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
  mkdirSync(join(projectDir, "media"), { recursive: true });
  writeFileSync(join(projectDir, "media", mediaBasename), "fake-media-bytes");
  if (opts.transcript) {
    mkdirSync(join(projectDir, "transcripts"), { recursive: true });
    const stem = mediaBasename.replace(/\.[^.]+$/, "");
    writeFileSync(
      join(projectDir, "transcripts", `${stem}.json`),
      JSON.stringify({ version: "1.1", segments: [] }),
    );
  }
}

function readProjectDoc(projectDir: string): AtelierDocument {
  return JSON.parse(readFileSync(join(projectDir, "project.atelier"), "utf-8"));
}

// ─── Fixtures ─────────────────────────────────────────────────

let tmpRoot: string;
let projectDir: string;
let client: Client;
let store: DocumentStore;
const DOC_ID = "doc-under-test";

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-rename-media-"));
  projectDir = tmpRoot;
  const s = await setup();
  client = s.client;
  store = s.store;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── atelier_rename_media ─────────────────────────────────────

describe("atelier_rename_media", () => {
  it("renames media file + transcript + project.atelier on the happy path", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV", { transcript: true });

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.result.docUpdated).toBe(true);
    expect(res.result.transcriptRenamed).toBe(true);
    expect(res.result.assetKeysUpdated).toContain("clip-img-7346");
    expect(res.result.layersUpdated).toContain("clip-img-7346");

    // Disk state.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(false);
    expect(existsSync(join(projectDir, "media", "RENAMED.MOV"))).toBe(true);
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts", "RENAMED.json"))).toBe(true);

    // Doc rewritten on disk.
    const doc = readProjectDoc(projectDir);
    expect(doc.assets?.["clip-img-7346"].src).toBe("media/RENAMED.MOV");

    // Doc reloaded into the store under documentId.
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.assets?.["clip-img-7346"].src).toBe("media/RENAMED.MOV");
  });

  it("rejects path traversal in oldBasename (../etc/passwd)", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "../etc/passwd",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid oldBasename/);
    // Disk untouched.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
  });

  it("rejects path traversal in newBasename (../escape.mov)", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "../escape.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid newBasename/);
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
  });

  it("rejects leading-dot basenames", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: ".hidden.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid newBasename/);
  });

  it("rejects backslash in basenames (Windows-style traversal)", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "sub\\nested.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid newBasename/);
  });

  it("returns an error when the project dir is missing", async () => {
    // No project written. With workspace scoping (Aegis Finding 1), the
    // ghost dir IS inside the workspace but lacks project.atelier, so the
    // pre-flight check trips before any rename op runs.
    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir: join(tmpRoot, "ghost"),
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toBeDefined();
    expect(res.error).toMatch(/projectDir does not contain project\.atelier/);
  });

  it("dryRun:true leaves the media file unchanged on disk", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV", { transcript: true });

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
      dryRun: true,
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.result.docUpdated).toBe(false);
    expect(res.result.transcriptRenamed).toBe(false);
    // The lists STILL report what would have changed.
    expect(res.result.assetKeysUpdated).toContain("clip-img-7346");
    expect(res.result.layersUpdated).toContain("clip-img-7346");

    // Disk completely untouched.
    expect(existsSync(join(projectDir, "media", "IMG_7346.MOV"))).toBe(true);
    expect(existsSync(join(projectDir, "media", "RENAMED.MOV"))).toBe(false);
    expect(existsSync(join(projectDir, "transcripts", "IMG_7346.json"))).toBe(true);
    expect(existsSync(join(projectDir, "transcripts", "RENAMED.json"))).toBe(false);

    // Doc on disk unchanged.
    const doc = readProjectDoc(projectDir);
    expect(doc.assets?.["clip-img-7346"].src).toBe("media/IMG_7346.MOV");

    // Store NOT populated on a dryRun (no reload).
    expect(store.get(DOC_ID)).toBeUndefined();
  });

  it("missing media file (only doc present) surfaces an error envelope", async () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(makeProjectDocFixture(), null, 2));
    mkdirSync(join(projectDir, "media"), { recursive: true });
    // Note: no media file written.

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/media file not found/);
  });

  // ── Aegis Finding 1 — workspace scoping ────────────────────────
  it("accepts a projectDir nested inside workspaceDir", async () => {
    // Workspace = tmpRoot; project nested as <tmpRoot>/sub/project
    const nestedProject = join(tmpRoot, "sub", "project");
    writeProject(nestedProject, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir: nestedProject,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(existsSync(join(nestedProject, "media", "RENAMED.MOV"))).toBe(true);
  });

  it("rejects a projectDir outside the workspaceDir (workspace escape)", async () => {
    // Build two sibling roots so projectDir is NOT a descendant of workspaceDir.
    const otherRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-rename-media-OTHER-"));
    try {
      writeProject(otherRoot, makeProjectDocFixture(), "IMG_7346.MOV");
      const res = await callTool(client, "atelier_rename_media", {
        documentId: DOC_ID,
        projectDir: otherRoot,
        workspaceDir: tmpRoot,
        oldBasename: "IMG_7346.MOV",
        newBasename: "RENAMED.MOV",
      });
      expect(res._isError).toBe(true);
      expect(res.error).toMatch(/projectDir must be inside workspace/);
      // Disk in `otherRoot` untouched.
      expect(existsSync(join(otherRoot, "media", "IMG_7346.MOV"))).toBe(true);
      expect(existsSync(join(otherRoot, "media", "RENAMED.MOV"))).toBe(false);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("rejects a projectDir that lacks project.atelier", async () => {
    // Make the dir but no project.atelier inside.
    mkdirSync(projectDir, { recursive: true });

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "RENAMED.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/projectDir does not contain project\.atelier/);
  });

  // ── Aegis Finding 4 — control-char regex alignment ──────────────
  it("rejects basenames containing NUL / control bytes", async () => {
    writeProject(projectDir, makeProjectDocFixture(), "IMG_7346.MOV");

    const res = await callTool(client, "atelier_rename_media", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      oldBasename: "IMG_7346.MOV",
      newBasename: "IMG\x00.MOV",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid newBasename/);
  });
});
