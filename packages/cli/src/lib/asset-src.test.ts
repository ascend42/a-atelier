// #asset-src tests: a relative image src is found next to the .atelier file, above it, or in the cwd.
// Invariants:
//   1. A relative src that exists beside the doc resolves there.
//   2. A nested doc finds `media/<file>` in a folder above it (composeImageProject's layout).
//   3. A src written against the working directory still resolves (back-compat).
//   4. Absolute paths and URL schemes pass through; file: URLs become paths; no docPath leaves src alone.
//   5. A render with docPath finds a relative image whatever the cwd is; a missing one warns.

import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveAssetSrc } from "./asset-src.js";
import { renderDocumentToPng } from "./render-image.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#000"/></svg>';

let dirs: string[] = [];
const tempDir = (): string => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "atelier-asset-")));
  dirs.push(d);
  return d;
};
const put = (path: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, SVG);
};

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
  vi.restoreAllMocks();
});

describe("resolveAssetSrc", () => {
  it("finds a src beside the document", () => {
    const p = tempDir();
    put(join(p, "motion", "parts", "a.svg"));
    expect(resolveAssetSrc("parts/a.svg", join(p, "motion", "reveal.atelier"))).toBe(join(p, "motion", "parts", "a.svg"));
  });

  it("finds media/ in a folder above a nested document", () => {
    const p = tempDir();
    put(join(p, "media", "a.svg"));
    expect(resolveAssetSrc("media/a.svg", join(p, "slides", "slide-1.atelier"))).toBe(join(p, "media", "a.svg"));
  });

  it("falls back to the working directory for docs written against it", () => {
    const cwd = tempDir();
    const elsewhere = tempDir();
    put(join(cwd, "assets", "logo.svg"));
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    expect(resolveAssetSrc("assets/logo.svg", join(elsewhere, "scenes", "a.atelier"))).toBe(join(cwd, "assets", "logo.svg"));
  });

  it("prefers the document's folder over the cwd", () => {
    const p = tempDir();
    put(join(p, "doc", "a.svg"));
    put(join(p, "cwd", "a.svg"));
    vi.spyOn(process, "cwd").mockReturnValue(join(p, "cwd"));
    expect(resolveAssetSrc("a.svg", join(p, "doc", "x.atelier"))).toBe(join(p, "doc", "a.svg"));
  });

  it("returns the doc-relative path when nothing exists", () => {
    const p = tempDir();
    expect(resolveAssetSrc("parts/none.svg", join(p, "x.atelier"))).toBe(join(p, "parts", "none.svg"));
  });

  it("passes absolute paths, URL schemes and docless calls through", () => {
    const abs = resolve("/abs/a.svg");
    const doc = resolve("/r/x.atelier");
    expect(resolveAssetSrc(abs, doc)).toBe(abs);
    expect(resolveAssetSrc("data:image/png;base64,AA", doc)).toBe("data:image/png;base64,AA");
    expect(resolveAssetSrc("https://x.test/a.png", doc)).toBe("https://x.test/a.png");
    expect(resolveAssetSrc("blob:https://x.test/1", doc)).toBe("blob:https://x.test/1");
    expect(resolveAssetSrc("parts/a.svg")).toBe("parts/a.svg");
  });

  it("turns file: URLs into paths", () => {
    const abs = resolve("/Users/me/a.png");
    expect(resolveAssetSrc(pathToFileURL(abs).href, resolve("/r/x.atelier"))).toBe(abs);
  });
});

describe("rendering with a relative image asset", () => {
  const doc = (src: string): AtelierDocument =>
    ({
      version: "1.0",
      name: "t",
      canvas: { width: 20, height: 20, fps: 30, background: "#ffffff" },
      assets: { a: { type: "svg", src } },
      layers: [{ id: "img", visual: { type: "image", assetId: "a" }, frame: { x: 0, y: 0 }, bounds: { width: 20, height: 20 } }],
      states: { s: { duration: 1, deltas: [] } },
    }) as unknown as AtelierDocument;

  const centerRed = async (png: Buffer): Promise<number> => {
    const { loadImage, createCanvas } = await import("@napi-rs/canvas");
    const img = await loadImage(png);
    const c = createCanvas(20, 20);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(10, 10, 1, 1).data[0];
  };

  it("loads the image from the document's folder, whatever the cwd", async () => {
    const dir = tempDir();
    put(join(dir, "parts", "black.svg"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir()); // an unrelated folder
    const png = await renderDocumentToPng(doc("parts/black.svg"), { docPath: join(dir, "x.atelier") });
    expect(await centerRed(png)).toBeLessThan(20); // black, not the white ground
  });

  it("loads media/ from the project root for a nested doc", async () => {
    const dir = tempDir();
    put(join(dir, "media", "black.svg"));
    const png = await renderDocumentToPng(doc("media/black.svg"), { docPath: join(dir, "slides", "slide-1.atelier") });
    expect(await centerRed(png)).toBeLessThan(20);
  });

  it("warns when an image doesn't load", async () => {
    const dir = tempDir();
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await renderDocumentToPng(doc("parts/missing.svg"), { docPath: join(dir, "x.atelier") });
    expect(err.mock.calls.map((c) => String(c[0])).join("")).toContain("parts/missing.svg");
  });
});
