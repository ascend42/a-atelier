// #design-system tests — one system per product, the merged view, and the tools on top.
// Invariants:
//   1. A file resolves to the product whose paths hold it (longest prefix), else the
//      repo-wide base; a nested .atelier/ system wins for its subtree.
//   2. Products inherit the repo-wide base and follow `extends`; loops are errors.
//   3. A product's file walk never enters another product's paths.
//   4. `check` reports off-scale values, forbidden values, retired words and mechanical
//      tells, and respects tell overrides.
//   5. The scanner separates token definitions from uses.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { listSystems, resolveProduct, systemForFile, uiFilesFor, mergeSystems, isUiPath } from "./design-system.js";
import { scanText, normColor } from "./design-scan.js";
import { checkText } from "./design-check.js";
import { extract, nearDuplicates } from "./design-extract.js";
import { specimenPage, specimenFramePage, inventoryPage } from "./design-pages.js";

let root: string;

function write(rel: string, body: string): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atelier-ds-"));
  mkdirSync(join(root, ".git"));
  write(".atelier/design-system.yaml", "version: 2\ncontent:\n  vocabulary:\n    retired: { jobs: runs }\n");
  write(
    ".atelier/systems.yaml",
    [
      "version: 1",
      "products:",
      "  console: { name: Console, paths: [apps/console] }",
      "  console-mods: { name: Mods, paths: [apps/console/mods], extends: console }",
      "  site: { name: Site, paths: [apps/site], extends: none }",
    ].join("\n"),
  );
  write(
    ".atelier/systems/console/design-system.yaml",
    [
      "version: 2",
      "foundations:",
      "  color: { ink: '#16150f', accent: '#44577c' }",
      "  type: { sizes: [10.5, 12, 14] }",
      "  space: { scale: [4, 8, 12] }",
      "rules:",
      "  - { id: type-on-scale, check: type-off-scale, severity: fail }",
      "  - { id: no-pure-black, check: color-literal-forbidden, args: { values: ['#000'] } }",
    ].join("\n"),
  );
  write(".atelier/systems/console-mods/design-system.yaml", "version: 2\nfoundations:\n  space: { scale: [2, 4] }\n");
  write(".atelier/systems/site/design-system.yaml", "version: 2\nfoundations:\n  font: { display: 'Playfair Display' }\n");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("product resolution", () => {
  it("lists one system per product, each with its sources", () => {
    const systems = listSystems(root);
    expect(systems.map((s) => s.product)).toEqual(["console", "console-mods", "site"]);
    const console_ = systems[0];
    expect(console_.sources.map((p) => relative(root, p))).toEqual([".atelier/design-system.yaml", ".atelier/systems/console/design-system.yaml"]);
  });

  it("resolves a file to the longest matching product path", () => {
    const f = write("apps/console/mods/panel.css", ".x{}");
    expect(systemForFile(f)?.product).toBe("console-mods");
    expect(systemForFile(write("apps/console/header.css", ".x{}"))?.product).toBe("console");
  });

  it("falls back to the repo-wide base outside every product", () => {
    const s = systemForFile(write("packages/other/ui/a.css", ".x{}"));
    expect(s?.product).toBeNull();
    expect(s?.system.content?.vocabulary?.retired).toEqual({ jobs: "runs" });
  });

  it("inherits the base and follows extends; extends: none skips the base", () => {
    const mods = resolveProduct(root, "console-mods");
    expect(mods.sources.map((p) => relative(root, p))).toEqual([
      ".atelier/design-system.yaml",
      ".atelier/systems/console/design-system.yaml",
      ".atelier/systems/console-mods/design-system.yaml",
    ]);
    expect((mods.system.foundations as { space: { scale: number[] } }).space.scale).toEqual([2, 4]);
    expect(mods.system.rules?.map((r) => r.id)).toEqual(["type-on-scale", "no-pure-black"]);
    const site = resolveProduct(root, "site");
    expect(site.sources.map((p) => relative(root, p))).toEqual([".atelier/systems/site/design-system.yaml"]);
    expect(site.system.content).toBeUndefined();
  });

  it("rejects extends loops", () => {
    write(".atelier/systems.yaml", "products:\n  a: { paths: [a], extends: b }\n  b: { paths: [b], extends: a }\n");
    expect(() => resolveProduct(root, "a")).toThrow(/loops/);
  });

  it("lets a nested .atelier/ system own its subtree", () => {
    write("apps/site/blog/.atelier/design-system.yaml", "version: 2\nread: blog\n");
    const s = systemForFile(write("apps/site/blog/post.css", ".x{}"));
    expect(s?.system.read).toBe("blog");
    expect(s?.root).toBe(join(root, "apps/site/blog"));
  });

  it("walks only a product's own files, never another product's paths", () => {
    write("apps/console/header.css", ".a{}");
    write("apps/console/mods/panel.css", ".b{}");
    write("apps/console/node_modules/x/y.css", ".c{}");
    write("apps/console/header.test.ts", "");
    const files = uiFilesFor(resolveProduct(root, "console")).map((f) => relative(root, f));
    expect(files).toEqual(["apps/console/header.css"]);
  });

  it("merges maps by key and concatenates record lists", () => {
    const m = mergeSystems({ foundations: { color: { a: "#1" } }, rules: [{ id: "x" }] }, { foundations: { color: { b: "#2" } }, rules: [{ id: "y" }] });
    expect(m.foundations).toEqual({ color: { a: "#1", b: "#2" } });
    expect(m.rules?.map((r) => r.id)).toEqual(["x", "y"]);
  });

  it("treats script files as UI only inside UI folders or a product's paths", () => {
    expect(isUiPath("src/server/db.ts")).toBe(false);
    expect(isUiPath("src/components/Button.ts")).toBe(true);
    expect(isUiPath("packages/gnomon-gui/src/main.ts")).toBe(true);
    expect(isUiPath("src/core/state.ts", true)).toBe(true);
    expect(isUiPath("src/app.css")).toBe(true);
  });
});

describe("scanner", () => {
  it("separates token definitions from uses and normalises colours", () => {
    const r = scanText(":root { --accent: #2457D6; }\n.btn { color: #FFF; padding: 4px 12px; }", "a.css");
    const colors = r.occurrences.filter((o) => o.kind === "color");
    expect(colors.map((c) => [c.value, c.definition])).toEqual([["#2457d6", true], ["#ffffff", false]]);
    expect(r.occurrences.filter((o) => o.kind === "spacing").map((o) => o.value)).toEqual(["4", "12"]);
    expect(normColor("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
  });

  it("reads script style objects and assignments without bleeding across properties", () => {
    const r = scanText('const s = { padding: 6, borderRadius: 999, color: "#abc" };\nel.style.fontSize = "12px";', "gui/a.ts");
    expect(r.occurrences.map((o) => `${o.kind}:${o.value}`)).toEqual(["spacing:6", "radius:999", "color:#aabbcc", "font-size:12"]);
  });

  it("ignores id selectors and anchors that look like hex", () => {
    const r = scanText('#add { color: red; }\n<a href="#fab">x</a>', "a.html");
    expect(r.occurrences.filter((o) => o.kind === "color")).toEqual([]);
  });

  it("keeps class strings out of copy", () => {
    const r = scanText('el.className = "chip chip--status";\nel.textContent = "Voice off · app not running";', "gui/a.ts");
    expect(r.strings.map((s) => s.text)).toEqual(["Voice off · app not running"]);
  });
});

describe("check", () => {
  const tells = [
    { id: "pure-black", severity: "warn" as const, detect: { kind: "literal", values: ["#000"] } },
    { id: "default-display-serif", severity: "warn" as const, detect: { kind: "literal", target: "font.display", values: ["Playfair Display"] } },
    { id: "filler-verbs", severity: "warn" as const, detect: { kind: "pattern", regex: "\\bseamless\\b", flags: "i", where: "user-visible strings" } },
  ];

  it("reports off-scale sizes, forbidden values and retired words for the governing product", () => {
    const f = write("apps/console/a.ts", 'el.style.fontSize = "11px";\nconst c = { color: "#000" };\nel.textContent = "Your jobs are seamless now";');
    const sys = systemForFile(f)!;
    const ids = checkText(require("node:fs").readFileSync(f, "utf8"), f, sys, tells).map((x) => `${x.id}@${x.line}:${x.severity}`);
    expect(ids).toEqual(["type-on-scale@1:fail", "no-pure-black@2:fail", "retired-term@3:fail", "pure-black@2:warn", "filler-verbs@3:warn"]);
  });

  it("respects tell overrides recorded in the system", () => {
    write(".atelier/systems/site/design-system.yaml", "version: 2\noverrides:\n  - { tell: default-display-serif, reason: brand face }\n");
    const f = write("apps/site/hero.css", '.h { font-family: "Playfair Display", serif; }');
    expect(checkText('.h { font-family: "Playfair Display", serif; }', f, systemForFile(f)!, tells)).toEqual([]);
  });
});

describe("extract and pages", () => {
  it("groups near-duplicates by relative distance, not by chaining", () => {
    const e = (value: string, count = 1) => ({ value, count, where: [], tokens: [] });
    const groups = nearDuplicates("spacing", [e("6", 9), e("5"), e("4", 5), e("8", 5), e("7")]);
    expect(groups.map((g) => g.values)).toEqual([["6", "5"], ["8", "7"]]);
    expect(nearDuplicates("font-size", [e("11", 4), e("10.5"), e("12")]).map((g) => g.values)).toEqual([["11", "10.5"]]);
  });

  it("marks values on and off the product's system", () => {
    write("apps/console/a.css", ".a { font-size: 12px; padding: 5px; }");
    const inv = extract(resolveProduct(root, "console"));
    expect(inv.values["font-size"].map((v) => [v.value, v.onSystem])).toEqual([["12", true]]);
    expect(inv.values.spacing.map((v) => [v.value, v.onSystem])).toEqual([["5", false]]);
    expect(inv.drift).toEqual({ spacing: 1 });
    expect(inventoryPage(inv)).toContain("off system");
  });

  it("renders the specimen with examples served by the frame page", () => {
    write(
      ".atelier/systems/console/design-system.yaml",
      "version: 2\ncomponents:\n  chip:\n    states: [default, disabled]\n    examples: { default: '<span class=\"chip\">ok</span>' }\nspecimen:\n  stylesheets: [apps/console/app.css]\n",
    );
    const sys = resolveProduct(root, "console");
    const out = join(sys.dir, "specimen.html");
    const html = specimenPage(sys, out);
    expect(html).toContain('src="specimen-frame.html#c=chip&amp;s=default&amp;t=default"');
    expect(html).toContain("No example for: disabled");
    const frame = specimenFramePage(sys, out);
    expect(frame).toContain('href="../../../apps/console/app.css"');
    expect(frame).not.toContain("</span>"); // markup is JSON-escaped inside the script
  });
});
