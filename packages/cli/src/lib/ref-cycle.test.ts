// Tests for #ref-cycle — carousel + ref-visual cycle detector.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AtelierDocument } from "@a-company/atelier-types";

import { detectCarouselCycle } from "./ref-cycle.js";

let workDir: string;

function writeDoc(rel: string, doc: AtelierDocument): string {
  const abs = join(workDir, rel);
  const parent = abs.split("/").slice(0, -1).join("/");
  if (parent && parent !== workDir) mkdirSync(parent, { recursive: true });
  writeFileSync(abs, JSON.stringify(doc, null, 2));
  return abs;
}

function carousel(name: string, slideSrcs: string[]): AtelierDocument {
  return {
    version: "1.0",
    name,
    kind: "carousel",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 0, deltas: [] } },
    slides: slideSrcs.map((src) => ({ src })),
  };
}

function videoDoc(name: string): AtelierDocument {
  return {
    version: "1.0",
    name,
    kind: "video",
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 0, deltas: [] } },
  };
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "atelier-ref-cycle-test-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("detectCarouselCycle", () => {
  it("detects a direct self-ref (carousel A → slides: [A])", () => {
    // A carousel whose slides[0].src points at itself.
    const aPath = writeDoc("a.atelier", carousel("A", ["./a.atelier"]));
    // The candidate IS the root.
    const result = detectCarouselCycle(aPath, aPath, workDir);
    expect(result.cycle).toBe(true);
    expect(result.path).toBeDefined();
    // Duplicate node appears twice — start AND end of the chain.
    expect(result.path![0]).toBe(aPath);
    expect(result.path![result.path!.length - 1]).toBe(aPath);
  });

  it("detects a 3-hop transitive cycle A → B → C → A", () => {
    const aPath = join(workDir, "a.atelier");
    const bPath = join(workDir, "b.atelier");
    const cPath = join(workDir, "c.atelier");
    writeFileSync(aPath, JSON.stringify(carousel("A", ["./b.atelier"]), null, 2));
    writeFileSync(bPath, JSON.stringify(carousel("B", ["./c.atelier"]), null, 2));
    writeFileSync(cPath, JSON.stringify(carousel("C", ["./a.atelier"]), null, 2));

    // Adding B as a slide to A — walks B → C → A, finds the cycle.
    const result = detectCarouselCycle(aPath, bPath, workDir);
    expect(result.cycle).toBe(true);
    expect(result.path).toBeDefined();
    // Chain shape: rootPath → candidate → ... → duplicate.
    // Here that's A → B → C → A — 4 nodes with the cycle target at both ends.
    expect(result.path).toEqual([aPath, bPath, cPath, aPath]);
  });

  it("does NOT flag a DAG diamond as a cycle (A→B, A→C, B→D, C→D)", () => {
    const aPath = join(workDir, "a.atelier");
    const bPath = join(workDir, "b.atelier");
    const cPath = join(workDir, "c.atelier");
    const dPath = join(workDir, "d.atelier");
    writeFileSync(aPath, JSON.stringify(carousel("A", ["./b.atelier", "./c.atelier"]), null, 2));
    writeFileSync(bPath, JSON.stringify(carousel("B", ["./d.atelier"]), null, 2));
    writeFileSync(cPath, JSON.stringify(carousel("C", ["./d.atelier"]), null, 2));
    writeFileSync(dPath, JSON.stringify(videoDoc("D"), null, 2));

    // Adding D directly to A — D points nowhere back to A.
    const result = detectCarouselCycle(aPath, dPath, workDir);
    expect(result.cycle).toBe(false);
  });

  it("returns cycle:false + warn when the candidate file is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const aPath = writeDoc("a.atelier", carousel("A", []));
    const missingPath = join(workDir, "missing.atelier");

    const result = detectCarouselCycle(aPath, missingPath, workDir);
    expect(result.cycle).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    // Confirm the warning mentions the missing path.
    const calls = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((m) => m.includes("missing"))).toBe(true);
  });

  it("detects cycles through a RefVisual layer in a non-carousel doc", () => {
    // A is a carousel referring to B. B is a video-kind doc that has a
    // RefVisual layer pointing back at A.
    const aPath = join(workDir, "a.atelier");
    const bPath = join(workDir, "b.atelier");

    writeFileSync(aPath, JSON.stringify(carousel("A", ["./b.atelier"]), null, 2));
    const bDoc: AtelierDocument = {
      version: "1.0",
      name: "B",
      kind: "video",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [
        {
          id: "ref-layer",
          visual: { type: "ref", src: "./a.atelier" },
          frame: { x: 0, y: 0 },
          bounds: { width: 1080, height: 1920 },
        },
      ],
      states: { default: { duration: 0, deltas: [] } },
    };
    writeFileSync(bPath, JSON.stringify(bDoc, null, 2));

    const result = detectCarouselCycle(aPath, bPath, workDir);
    expect(result.cycle).toBe(true);
    // Chain: A (root) → B (candidate) → A (cycle target via RefVisual).
    expect(result.path).toEqual([aPath, bPath, aPath]);
  });

  it("returns cycle:false gracefully when depth exceeds 64 hops (no throw)", () => {
    // Build a non-cyclic chain longer than 64 hops:
    // n0 → n1 → n2 → ... → n80 (each points at the next; the last refs nothing).
    const CHAIN = 80;
    const paths: string[] = [];
    for (let i = 0; i < CHAIN; i++) {
      paths.push(join(workDir, `n${i}.atelier`));
    }
    for (let i = 0; i < CHAIN; i++) {
      const refs = i < CHAIN - 1 ? [`./n${i + 1}.atelier`] : [];
      writeFileSync(paths[i]!, JSON.stringify(carousel(`N${i}`, refs), null, 2));
    }

    // Root is a SEPARATE file that the chain never points back at,
    // so no cycle exists — but the chain length itself should trigger
    // the depth limit. The chain candidate is n0.
    const rootPath = writeDoc("root.atelier", carousel("ROOT", []));
    expect(() => detectCarouselCycle(rootPath, paths[0]!, workDir)).not.toThrow();
    const result = detectCarouselCycle(rootPath, paths[0]!, workDir);
    // The chain is acyclic w.r.t. root, but we hit the hop cap before
    // confirming — so we return false (no confirmed cycle).
    expect(result.cycle).toBe(false);
  });
});
