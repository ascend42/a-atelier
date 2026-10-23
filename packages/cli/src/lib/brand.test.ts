// #brand-kit tests — where a brand lives, what `atelier brand check` asks of it, and the two pages.
// Invariants:
//   1. A repo's brand is .atelier/brand/, a product's is .atelier/systems/<id>/brand/, a workspace's is _brand/.
//   2. Strategy before marks: no truths is a fail; a mark from a struck or unlisted noun is flagged.
//   3. The mark serves small media: roughly square, few colours, few shapes, a lockup for 32px or less.
//   4. Boards label options A, B, C… and show each at 64/32/16 px; the sheet lays the system small → large.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBrandDir, loadBrand, checkBrand, svgAspect, svgColors, BrandError, type Brand } from "./brand.js";
import { boardPage, brandSheet } from "./brand-pages.js";

let root: string;
const write = (rel: string, body: string): string => {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
  return abs;
};
const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#14213d" d="M0 0h64v64H0z"/></svg>';

const good = (): Brand => ({
  name: "Golden Bear",
  kind: "new",
  strategy: { truths: [{ truth: "fixes houses", evidence: "brief" }] },
  nouns: { kept: ["bear silhouette", "roofline"], struck: [] },
  mark: { idea: "a bear framing a house", nouns: ["bear silhouette", "roofline"], file: "marks/mark.svg" },
  system: [
    { id: "mark", file: "marks/mark.svg", min_px: 16 },
    { id: "horizontal", file: "marks/horizontal.svg" },
    { id: "badge", file: "marks/badge.svg" },
  ],
  color: { ink: "#14213d", paper: "#ffffff", accent: "#b45309" },
  type: { display: "Bebas Neue" },
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atelier-brand-"));
  mkdirSync(join(root, ".git"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("where a brand lives", () => {
  it("finds the repo brand, a product's brand, and a workspace _brand", () => {
    write(".atelier/brand/brand.yaml", "name: Repo\n");
    expect(findBrandDir(join(root, "src"))).toBe(join(root, ".atelier", "brand"));
    write(".atelier/systems.yaml", "products:\n  console: { paths: [apps/console] }\n");
    expect(findBrandDir(root, "console")).toBe(join(root, ".atelier", "systems", "console", "brand"));
    const ws = mkdtempSync(join(tmpdir(), "atelier-ws-"));
    mkdirSync(join(ws, "_brand"), { recursive: true });
    writeFileSync(join(ws, "_brand", "brand.yaml"), "name: Studio\n");
    expect(loadBrand(findBrandDir(join(ws, "projects"))!)?.name).toBe("Studio");
    rmSync(ws, { recursive: true, force: true });
  });

  it("takes a brand folder passed directly, and refuses an undeclared product", () => {
    write(".atelier/brand/brand.yaml", "name: Repo\n");
    write(".atelier/systems/app/brand/brand.yaml", "name: App\n");
    expect(findBrandDir(join(root, ".atelier", "systems", "app", "brand"))).toBe(join(root, ".atelier", "systems", "app", "brand"));
    // no systems.yaml: --product is an error, not a silent fall back to the repo brand
    expect(() => findBrandDir(root, "app")).toThrow(BrandError);
    write(".atelier/systems.yaml", "products:\n  app: { paths: [app] }\n");
    expect(() => findBrandDir(root, "typo")).toThrow(BrandError);
  });
});

describe("brand check", () => {
  it("passes a complete kit", () => {
    for (const f of ["mark", "horizontal", "badge"]) write(`.atelier/brand/marks/${f}.svg`, square);
    expect(checkBrand(good(), join(root, ".atelier", "brand"))).toEqual([]);
  });

  it("fails without strategy or a mark file, and flags a thin system", () => {
    const ids = checkBrand({ name: "x", system: [{ id: "mark", file: "marks/none.svg" }] }, join(root, ".atelier", "brand")).map((c) => `${c.id}:${c.severity}`);
    expect(ids).toEqual(expect.arrayContaining(["brand-no-strategy:fail", "brand-missing-file:fail", "brand-system-thin:warn", "brand-no-nouns:warn", "brand-no-small-form:warn"]));
  });

  it("asks the mark to hold up small: compact, few colours, few shapes, kept nouns", () => {
    const wide = `<svg viewBox="0 0 300 60">${Array.from({ length: 30 }, (_, i) => `<circle fill="#${(i * 111111).toString(16).padStart(6, "0").slice(0, 6)}" r="1"/>`).join("")}</svg>`;
    for (const f of ["horizontal", "badge"]) write(`.atelier/brand/marks/${f}.svg`, square);
    write(".atelier/brand/marks/mark.svg", wide);
    const b = good();
    b.mark!.nouns = ["rocket"];
    const ids = checkBrand(b, join(root, ".atelier", "brand")).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["mark-not-compact", "mark-too-many-colours", "mark-too-complex", "mark-noun-not-kept"]));
  });

  it("checks ink and accent contrast on paper", () => {
    for (const f of ["mark", "horizontal", "badge"]) write(`.atelier/brand/marks/${f}.svg`, square);
    const b = good();
    b.color = { ink: "#999999", paper: "#ffffff", accent: "#ffd166" };
    expect(checkBrand(b, join(root, ".atelier", "brand")).map((c) => c.id)).toEqual(["brand-ink-contrast", "brand-accent-contrast"]);
  });

  it("treats 3:4 and 4:3 marks alike", () => {
    for (const f of ["horizontal", "badge"]) write(`.atelier/brand/marks/${f}.svg`, square);
    for (const vb of ["0 0 400 300", "0 0 300 400"]) {
      write(".atelier/brand/marks/mark.svg", `<svg viewBox="${vb}"><path fill="#14213d" d="M0 0h1v1z"/></svg>`);
      expect(checkBrand(good(), join(root, ".atelier", "brand")).map((c) => c.id)).not.toContain("mark-not-compact");
    }
  });

  it("reads SVG aspect and colours", () => {
    expect(svgAspect('<svg viewBox="0 0 120 40">')).toBe(3);
    expect(svgAspect('<svg width="32" height="32">')).toBe(1);
    expect(svgColors('<path fill="#ABC"/><g style="stroke:#112233"/>')).toEqual(["#abc", "#112233"]);
  });
});

describe("brand pages", () => {
  it("labels a board's options and shows each at 64/32/16 px", () => {
    const html = boardPage("Round 1", ["a.svg", "b.svg"]);
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    for (const px of [64, 32, 16]) expect(html).toContain(`height:${px}px`);
  });

  it("renders the sheet with the system small to large and open checks", () => {
    const html = brandSheet(good(), "/r/.atelier/brand", "/r/.atelier/brand/brand.html", [{ id: "brand-no-type", severity: "warn", message: "x" }]);
    expect(html.indexOf("<b>horizontal</b>")).toBeLessThan(html.indexOf("<b>badge</b>"));
    expect(html.indexOf("<b>mark</b>")).toBeLessThan(html.indexOf("<b>horizontal</b>"));
    expect(html).toContain("small media → large media");
    expect(html).toContain('src="marks/mark.svg"');
    expect(html).toContain("brand-no-type");
  });

  it("takes board notes by letter or file name", () => {
    const html = boardPage("R", ["x/a.svg", "x/b.svg"], { A: "by letter", "b.svg": "by file" });
    expect(html).toContain("by letter");
    expect(html).toContain("by file");
  });

  it("survives non-string type values and skips generic families in the font request", () => {
    const b = good();
    b.type = { weight: 420 as unknown as string, text: "system-ui" };
    const html = brandSheet(b, "/r/.atelier/brand", "/r/.atelier/brand/brand.html");
    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("sets type specimens in the family named before any notes, and loads it", () => {
    const b = good();
    b.type = { display: "Fraunces (wght 420); outlined", text: "Geist" };
    const html = brandSheet(b, "/r/.atelier/brand", "/r/.atelier/brand/brand.html");
    expect(html).toContain("font-family:&quot;Fraunces&quot;");
    expect(html).toContain("family=Fraunces&family=Geist");
  });
});
