// #asset-src tests: a relative image src is relative to the .atelier file, not the shell's cwd.
// Invariants:
//   1. Relative srcs resolve against the document's folder when its path is known.
//   2. Absolute paths, data URLs and http(s) URLs pass through.
//   3. A render with docPath finds a relative image from any working directory; a missing one warns.

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveAssetSrc } from "./asset-src.js";
import { renderDocumentToPng } from "./render-image.js";

describe("resolveAssetSrc", () => {
  it("resolves relative srcs against the document's folder", () => {
    expect(resolveAssetSrc("parts/a.svg", "/r/motion/reveal.atelier")).toBe("/r/motion/parts/a.svg");
    expect(resolveAssetSrc("../a.png", "/r/motion/x.atelier")).toBe("/r/a.png");
  });

  it("passes absolute paths, data and http URLs, and docless calls through", () => {
    expect(resolveAssetSrc("/abs/a.svg", "/r/x.atelier")).toBe("/abs/a.svg");
    expect(resolveAssetSrc("data:image/png;base64,AA", "/r/x.atelier")).toBe("data:image/png;base64,AA");
    expect(resolveAssetSrc("https://x.test/a.png", "/r/x.atelier")).toBe("https://x.test/a.png");
    expect(resolveAssetSrc("parts/a.svg")).toBe("parts/a.svg");
  });
});

describe("rendering with a relative image asset", () => {
  let dir: string;
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const doc = (src: string): AtelierDocument =>
    ({
      version: "1.0",
      name: "t",
      canvas: { width: 20, height: 20, fps: 30, background: "#ffffff" },
      assets: { a: { type: "svg", src } },
      layers: [{ id: "img", visual: { type: "image", assetId: "a" }, frame: { x: 0, y: 0 }, bounds: { width: 20, height: 20 } }],
      states: { s: { duration: 1, deltas: [] } },
    }) as unknown as AtelierDocument;

  it("loads the image from the document's folder, whatever the cwd", async () => {
    dir = mkdtempSync(join(tmpdir(), "atelier-asset-"));
    mkdirSync(join(dir, "parts"));
    writeFileSync(join(dir, "parts", "black.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#000"/></svg>');
    const png = await renderDocumentToPng(doc("parts/black.svg"), { docPath: join(dir, "x.atelier") });
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(png);
    const c = createCanvas(20, 20);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    expect(ctx.getImageData(10, 10, 1, 1).data[0]).toBeLessThan(20); // black, not the white ground
  });

  it("warns when an image doesn't load", async () => {
    dir = mkdtempSync(join(tmpdir(), "atelier-asset-"));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await renderDocumentToPng(doc("parts/missing.svg"), { docPath: join(dir, "x.atelier") });
    expect(err.mock.calls.map((c) => String(c[0])).join("")).toContain("parts/missing.svg");
  });
});
