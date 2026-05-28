// Tests for the v1.0.x doc-management MCP tools (docs.ts).
//
// Pattern mirrors rename-media.test.ts + clips.test.ts:
//   - Real DocumentStore + linked in-memory transport pair
//   - callTool helper parses JSON envelopes from the SDK response
//   - Temp dirs hold a freshly-written project.atelier
//
// Coverage:
//   atelier_create_doc:
//     - video kind at project root → success, file exists with correct kind
//     - carousel slide creation → file at slides/, SlideRef appended to manifest
//     - Invalid name → error envelope
//     - Out-of-workspace projectDir → workspace-scoping error
//     - Missing project.atelier → error
//
//   atelier_duplicate_doc:
//     - Duplicate a root doc → "<stem>-copy.atelier", layers preserved
//     - Duplicate a slide with appendSlideRef:true → SlideRef appended
//     - Refuse project.atelier → error
//     - Out-of-workspace → error
//
//   atelier_delete_doc:
//     - Delete a slide → file removed, SlideRef scrubbed
//     - Refuse project.atelier → error
//     - Out-of-workspace → error
//     - DocDeleteCascadeReport shape correct
//
//   atelier_list_docs:
//     - Project with manifest only → 1 entry
//     - Carousel with slides → manifest + slides in order
//     - Project with other root docs → manifest + "other" entries

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
  const client = new Client({ name: "docs-test-client", version: "1.0.0" });
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

function makeVideoManifest(name = "video-proj"): AtelierDocument {
  return {
    version: "1.0",
    kind: "video",
    name,
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
  };
}

function makeCarouselManifest(name = "carousel-proj"): AtelierDocument {
  return {
    version: "1.0",
    kind: "carousel",
    name,
    canvas: { width: 1080, height: 1080, fps: 30 },
    layers: [],
    states: {},
    slides: [],
  };
}

function writeProject(projectDir: string, doc: AtelierDocument): void {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(doc, null, 2));
}

function readDoc(absPath: string): AtelierDocument {
  return JSON.parse(readFileSync(absPath, "utf-8"));
}

// ─── Fixtures ─────────────────────────────────────────────────

let tmpRoot: string; // workspace root
let projectDir: string; // <tmpRoot>/proj
let client: Client;
let store: DocumentStore;
const DOC_ID = "doc-under-test";

beforeEach(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-docs-"));
  projectDir = join(tmpRoot, "proj");
  const s = await setup();
  client = s.client;
  store = s.store;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── atelier_create_doc ───────────────────────────────────────

describe("atelier_create_doc", () => {
  it("creates a video doc at the project root and reloads it into the store", async () => {
    writeProject(projectDir, makeVideoManifest());

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "Intro Clip",
      kind: "video",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.docPath).toBe("intro-clip.atelier");
    expect(res.appendedSlideIndex).toBeUndefined();

    const newAbs = join(projectDir, "intro-clip.atelier");
    expect(existsSync(newAbs)).toBe(true);

    const onDisk = readDoc(newAbs);
    expect(onDisk.kind).toBe("video");
    expect(onDisk.name).toBe("intro-clip");

    // Reloaded into store under DOC_ID (the new doc itself since no carousel append).
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.kind).toBe("video");
    expect(stored!.name).toBe("intro-clip");
  });

  it("creates a carousel slide and appends a SlideRef to the carousel manifest", async () => {
    writeProject(projectDir, makeCarouselManifest());

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "Slide One",
      kind: "image",
      asCarouselSlide: true,
      carouselDocPath: join(projectDir, "project.atelier"),
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.docPath).toBe("slides/slide-one.atelier");
    expect(res.appendedSlideIndex).toBe(0);

    // File on disk under slides/.
    const slideAbs = join(projectDir, "slides", "slide-one.atelier");
    expect(existsSync(slideAbs)).toBe(true);
    expect(readDoc(slideAbs).kind).toBe("image");

    // SlideRef appended to manifest. Label is NOT auto-populated by createDoc
    // (matches Kit-A — composeCarouselProject only sets label when explicitly
    // passed, which createDoc does not do).
    const manifest = readDoc(join(projectDir, "project.atelier"));
    expect(manifest.slides).toHaveLength(1);
    expect(manifest.slides![0].src).toBe("slides/slide-one.atelier");
    expect(manifest.slides![0].label).toBeUndefined();

    // Reload target is the carousel manifest (we appended a SlideRef).
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.kind).toBe("carousel");
    expect(stored!.slides).toHaveLength(1);
  });

  it("rejects an invalid doc name (path traversal)", async () => {
    writeProject(projectDir, makeVideoManifest());

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "../escape",
      kind: "video",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/invalid doc name/);
  });

  it("rejects an out-of-workspace projectDir", async () => {
    const otherRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-docs-OTHER-"));
    try {
      writeProject(otherRoot, makeVideoManifest());
      const res = await callTool(client, "atelier_create_doc", {
        documentId: DOC_ID,
        projectDir: otherRoot,
        workspaceDir: tmpRoot,
        name: "Whatever",
        kind: "video",
      });
      expect(res._isError).toBe(true);
      expect(res.error).toMatch(/projectDir must be inside workspace/);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("rejects a projectDir that lacks project.atelier", async () => {
    mkdirSync(projectDir, { recursive: true });

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "Whatever",
      kind: "video",
    });
    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/projectDir does not contain project\.atelier/);
  });

  it("honors insertAt when appending a SlideRef to a carousel", async () => {
    writeProject(projectDir, makeCarouselManifest());
    // Pre-seed two slides so insertAt is meaningful.
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    writeFileSync(join(projectDir, "slides", "a.atelier"), JSON.stringify(makeVideoManifest("a")));
    writeFileSync(join(projectDir, "slides", "b.atelier"), JSON.stringify(makeVideoManifest("b")));
    const manifest = makeCarouselManifest();
    manifest.slides = [
      { src: "slides/a.atelier", label: "A" },
      { src: "slides/b.atelier", label: "B" },
    ];
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(manifest, null, 2));

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "Middle Slide",
      kind: "image",
      asCarouselSlide: true,
      carouselDocPath: join(projectDir, "project.atelier"),
      insertAt: 1,
    });

    expect(res._isError).toBe(false);
    expect(res.appendedSlideIndex).toBe(1);

    const updatedManifest = readDoc(join(projectDir, "project.atelier"));
    expect(updatedManifest.slides!.map((s) => s.src)).toEqual([
      "slides/a.atelier",
      "slides/middle-slide.atelier",
      "slides/b.atelier",
    ]);
  });

  it("collision-suffixes when the slugged stem already exists", async () => {
    writeProject(projectDir, makeVideoManifest());
    // Pre-create the colliding file.
    writeFileSync(join(projectDir, "clip.atelier"), JSON.stringify(makeVideoManifest("clip")));

    const res = await callTool(client, "atelier_create_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      name: "Clip",
      kind: "video",
    });

    expect(res._isError).toBe(false);
    expect(res.docPath).toBe("clip-1.atelier");
    expect(existsSync(join(projectDir, "clip-1.atelier"))).toBe(true);
  });
});

// ─── atelier_duplicate_doc ────────────────────────────────────

describe("atelier_duplicate_doc", () => {
  it("duplicates a root doc to <stem>-copy.atelier preserving content", async () => {
    writeProject(projectDir, makeVideoManifest());
    // Add a "scenes/intro.atelier" doc.
    const introAbs = join(projectDir, "intro.atelier");
    const introDoc: AtelierDocument = {
      ...makeVideoManifest("intro"),
      layers: [
        {
          id: "layer-x",
          visual: { type: "shape", shape: { type: "rect" } },
          frame: { x: 0, y: 0 },
          bounds: { width: 100, height: 100 },
        },
      ],
    };
    writeFileSync(introAbs, JSON.stringify(introDoc, null, 2));

    const res = await callTool(client, "atelier_duplicate_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      sourceDocPath: "intro.atelier",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.sourceDocPath).toBe("intro.atelier");
    expect(res.newDocPath).toBe("intro-copy.atelier");

    const dupAbs = join(projectDir, "intro-copy.atelier");
    expect(existsSync(dupAbs)).toBe(true);
    const dupDoc = readDoc(dupAbs);
    expect(dupDoc.layers).toHaveLength(1);
    expect(dupDoc.layers[0].id).toBe("layer-x");
    // Source doc's `name` field is preserved verbatim (matches Kit-A CLI).
    expect(dupDoc.name).toBe("intro");

    // Reload target = the duplicate (no SlideRef append).
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.name).toBe("intro");
  });

  it("duplicates a slide with appendSlideRef:true and adds it to the carousel", async () => {
    writeProject(projectDir, makeCarouselManifest());
    // Existing slide.
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    const slideADoc = makeVideoManifest("slide-a");
    writeFileSync(join(projectDir, "slides", "slide-a.atelier"), JSON.stringify(slideADoc, null, 2));
    // Manifest references it.
    const manifest = makeCarouselManifest();
    manifest.slides = [{ src: "slides/slide-a.atelier", label: "A" }];
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(manifest, null, 2));

    const res = await callTool(client, "atelier_duplicate_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      sourceDocPath: "slides/slide-a.atelier",
      appendSlideRef: true,
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.newDocPath).toBe("slides/slide-a-copy.atelier");
    expect(res.appendedSlideIndex).toBe(1);

    // Manifest now has two slides.
    const updatedManifest = readDoc(join(projectDir, "project.atelier"));
    expect(updatedManifest.slides).toHaveLength(2);
    expect(updatedManifest.slides![1].src).toBe("slides/slide-a-copy.atelier");

    // Reload target = the carousel manifest.
    const stored = store.get(DOC_ID);
    expect(stored).toBeDefined();
    expect(stored!.kind).toBe("carousel");
    expect(stored!.slides).toHaveLength(2);
  });

  it("inserts the duplicate's SlideRef adjacent to source (sourceIndex+1), not at end", async () => {
    writeProject(projectDir, makeCarouselManifest());
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    // Three slides A, B, C — we duplicate B; expect the dup to land at index 2 (between B and C).
    writeFileSync(join(projectDir, "slides", "a.atelier"), JSON.stringify(makeVideoManifest("a")));
    writeFileSync(join(projectDir, "slides", "b.atelier"), JSON.stringify(makeVideoManifest("b")));
    writeFileSync(join(projectDir, "slides", "c.atelier"), JSON.stringify(makeVideoManifest("c")));
    const manifest = makeCarouselManifest();
    manifest.slides = [
      { src: "slides/a.atelier", label: "A" },
      { src: "slides/b.atelier", label: "B" },
      { src: "slides/c.atelier", label: "C" },
    ];
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(manifest, null, 2));

    const res = await callTool(client, "atelier_duplicate_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      sourceDocPath: "slides/b.atelier",
      appendSlideRef: true,
    });

    expect(res._isError).toBe(false);
    expect(res.appendedSlideIndex).toBe(2);

    const updated = readDoc(join(projectDir, "project.atelier"));
    expect(updated.slides!.map((s) => s.src)).toEqual([
      "slides/a.atelier",
      "slides/b.atelier",
      "slides/b-copy.atelier",
      "slides/c.atelier",
    ]);
  });

  it("collision-suffixes the duplicate stem when <stem>-copy.atelier already exists", async () => {
    writeProject(projectDir, makeVideoManifest());
    writeFileSync(join(projectDir, "intro.atelier"), JSON.stringify(makeVideoManifest("intro")));
    writeFileSync(join(projectDir, "intro-copy.atelier"), JSON.stringify(makeVideoManifest("intro")));

    const res = await callTool(client, "atelier_duplicate_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      sourceDocPath: "intro.atelier",
    });

    expect(res._isError).toBe(false);
    // Suffix sequence: -copy, -copy-2, -copy-3 (matches Kit-A CLI; -copy is copy #1).
    expect(res.newDocPath).toBe("intro-copy-2.atelier");
    expect(existsSync(join(projectDir, "intro-copy-2.atelier"))).toBe(true);
  });

  it("refuses to duplicate project.atelier (the manifest)", async () => {
    writeProject(projectDir, makeVideoManifest());

    const res = await callTool(client, "atelier_duplicate_doc", {
      documentId: DOC_ID,
      projectDir,
      workspaceDir: tmpRoot,
      sourceDocPath: "project.atelier",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/manifest|project\.atelier/i);
  });

  it("rejects an out-of-workspace projectDir", async () => {
    const otherRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-docs-DUPOUT-"));
    try {
      writeProject(otherRoot, makeVideoManifest());
      writeFileSync(join(otherRoot, "intro.atelier"), JSON.stringify(makeVideoManifest("intro")));
      const res = await callTool(client, "atelier_duplicate_doc", {
        documentId: DOC_ID,
        projectDir: otherRoot,
        workspaceDir: tmpRoot,
        sourceDocPath: "intro.atelier",
      });
      expect(res._isError).toBe(true);
      expect(res.error).toMatch(/projectDir must be inside workspace/);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});

// ─── atelier_delete_doc ───────────────────────────────────────

describe("atelier_delete_doc", () => {
  it("deletes a carousel slide, scrubs the SlideRef, and reports the cascade", async () => {
    writeProject(projectDir, makeCarouselManifest());
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    const slideAbs = join(projectDir, "slides", "slide-b.atelier");
    writeFileSync(slideAbs, JSON.stringify(makeVideoManifest("slide-b"), null, 2));

    // Manifest references it.
    const manifest = makeCarouselManifest();
    manifest.slides = [
      { src: "slides/slide-a.atelier", label: "A" }, // doesn't exist on disk — fine
      { src: "slides/slide-b.atelier", label: "B" },
      { src: "slides/slide-c.atelier", label: "C" }, // ditto
    ];
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(manifest, null, 2));

    const res = await callTool(client, "atelier_delete_doc", {
      documentId: DOC_ID,
      workspaceDir: tmpRoot,
      projectName: "proj",
      docPath: "slides/slide-b.atelier",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.docPath).toBe("slides/slide-b.atelier");
    // DocDeleteCascadeReport shape.
    expect(Array.isArray(res.slideRefsRemoved)).toBe(true);
    expect(Array.isArray(res.refLayersDangling)).toBe(true);
    expect(res.slideRefsRemoved).toHaveLength(1);
    expect(res.slideRefsRemoved[0]).toEqual({ project: "proj", slideIndex: 1 });

    // File gone.
    expect(existsSync(slideAbs)).toBe(false);
    // Manifest scrubbed.
    const updated = readDoc(join(projectDir, "project.atelier"));
    expect(updated.slides).toHaveLength(2);
    expect(updated.slides!.map((s) => s.src)).toEqual([
      "slides/slide-a.atelier",
      "slides/slide-c.atelier",
    ]);
  });

  it("refuses to delete project.atelier (the manifest)", async () => {
    writeProject(projectDir, makeVideoManifest());

    const res = await callTool(client, "atelier_delete_doc", {
      documentId: DOC_ID,
      workspaceDir: tmpRoot,
      projectName: "proj",
      docPath: "project.atelier",
    });

    expect(res._isError).toBe(true);
    expect(res.error).toMatch(/manifest|project\.atelier/i);
    expect(existsSync(join(projectDir, "project.atelier"))).toBe(true);
  });

  it("rejects an out-of-workspace projectName (path traversal)", async () => {
    writeProject(projectDir, makeVideoManifest());
    // Build a sibling project outside the workspace.
    const evilRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-docs-EVIL-"));
    try {
      writeProject(evilRoot, makeVideoManifest());
      writeFileSync(join(evilRoot, "victim.atelier"), JSON.stringify(makeVideoManifest("victim")));

      // Try to escape via projectName="../<evil>"
      const evilName = `..${join("", evilRoot).split("/").filter(Boolean).slice(-1)[0]}`; // best-effort
      void evilName;
      const res = await callTool(client, "atelier_delete_doc", {
        documentId: DOC_ID,
        workspaceDir: tmpRoot,
        projectName: "../whatever",
        docPath: "victim.atelier",
      });
      expect(res._isError).toBe(true);
      expect(res.error).toMatch(/projectName must resolve inside workspace/);
    } finally {
      rmSync(evilRoot, { recursive: true, force: true });
    }
  });

  it("reports an empty DocDeleteCascadeReport when no SlideRefs reference the deleted doc", async () => {
    writeProject(projectDir, makeVideoManifest());
    const loneAbs = join(projectDir, "lone.atelier");
    writeFileSync(loneAbs, JSON.stringify(makeVideoManifest("lone"), null, 2));

    const res = await callTool(client, "atelier_delete_doc", {
      documentId: DOC_ID,
      workspaceDir: tmpRoot,
      projectName: "proj",
      docPath: "lone.atelier",
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.slideRefsRemoved).toEqual([]);
    expect(res.refLayersDangling).toEqual([]);
    expect(existsSync(loneAbs)).toBe(false);
  });
});

// ─── atelier_list_docs ────────────────────────────────────────

describe("atelier_list_docs", () => {
  it("returns a single manifest entry for a project with only project.atelier", async () => {
    writeProject(projectDir, makeVideoManifest());

    const res = await callTool(client, "atelier_list_docs", {
      projectDir,
      workspaceDir: tmpRoot,
    });

    expect(res._isError).toBe(false);
    expect(res.success).toBe(true);
    expect(res.docs).toHaveLength(1);
    expect(res.docs[0]).toEqual({
      path: "project.atelier",
      role: "manifest",
      kind: "video",
    });
  });

  it("returns manifest + carousel slides in slides[] order", async () => {
    writeProject(projectDir, makeCarouselManifest());
    mkdirSync(join(projectDir, "slides"), { recursive: true });
    writeFileSync(join(projectDir, "slides", "a.atelier"), JSON.stringify(makeVideoManifest("a")));
    writeFileSync(join(projectDir, "slides", "b.atelier"), JSON.stringify(makeVideoManifest("b")));
    const manifest = makeCarouselManifest();
    manifest.slides = [
      { src: "slides/a.atelier", label: "A" },
      { src: "slides/b.atelier", label: "B" },
    ];
    writeFileSync(join(projectDir, "project.atelier"), JSON.stringify(manifest, null, 2));

    const res = await callTool(client, "atelier_list_docs", {
      projectDir,
      workspaceDir: tmpRoot,
    });

    expect(res._isError).toBe(false);
    expect(res.docs).toHaveLength(3);
    expect(res.docs[0].role).toBe("manifest");
    expect(res.docs[0].kind).toBe("carousel");

    expect(res.docs[1].role).toBe("slide");
    expect(res.docs[1].path).toBe("slides/a.atelier");
    expect(res.docs[1].slideIndex).toBe(0);
    expect(res.docs[1].slideLabel).toBe("A");
    expect(res.docs[1].kind).toBe("video");

    expect(res.docs[2].role).toBe("slide");
    expect(res.docs[2].path).toBe("slides/b.atelier");
    expect(res.docs[2].slideIndex).toBe(1);
    expect(res.docs[2].slideLabel).toBe("B");
  });

  it("returns manifest + other root docs (role=other) for video-kind projects", async () => {
    writeProject(projectDir, makeVideoManifest());
    writeFileSync(join(projectDir, "scene-intro.atelier"), JSON.stringify(makeVideoManifest("scene-intro")));
    writeFileSync(join(projectDir, "scene-outro.atelier"), JSON.stringify(makeVideoManifest("scene-outro")));

    const res = await callTool(client, "atelier_list_docs", {
      projectDir,
      workspaceDir: tmpRoot,
    });

    expect(res._isError).toBe(false);
    expect(res.docs.length).toBeGreaterThanOrEqual(3);
    expect(res.docs[0].role).toBe("manifest");
    const others = res.docs.filter((d: { role: string }) => d.role === "other");
    expect(others).toHaveLength(2);
    const otherPaths = others.map((d: { path: string }) => d.path).sort();
    expect(otherPaths).toEqual(["scene-intro.atelier", "scene-outro.atelier"]);
  });

  it("rejects an out-of-workspace projectDir", async () => {
    const otherRoot = mkdtempSync(join(tmpdir(), "atelier-mcp-docs-LISTOUT-"));
    try {
      writeProject(otherRoot, makeVideoManifest());
      const res = await callTool(client, "atelier_list_docs", {
        projectDir: otherRoot,
        workspaceDir: tmpRoot,
      });
      expect(res._isError).toBe(true);
      expect(res.error).toMatch(/projectDir must be inside workspace/);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });
});
