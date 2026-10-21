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
import { checkText, themeBlockLines } from "./design-check.js";
import { extract, nearDuplicates } from "./design-extract.js";
import { specimenPage, specimenFramePage, inventoryPage } from "./design-pages.js";
import { lintSystem, contrastRatio, contrastPairs, INTERACTIVE_STATES, INPUT_STATES } from "./design-lint.js";

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

describe("system lint (playbook v1)", () => {
  const base = {
    themes: ["day", "night"],
    foundations: {
      color: { ink: "#16150f", paper: "#ede8dc", mist: "#d9d4c8" },
      space: { base: 4, scale: [4, 8, 12, 14, 16] },
    },
  };

  it("passes a tiered system with contrast in every theme", () => {
    const s = {
      ...base,
      foundations: { ...base.foundations, space: { base: 4, scale: [4, 8, 12, 16] } },
      roles: {
        "text.primary": { day: "color.ink", night: "color.paper" },
        "surface.base": { day: "color.paper", night: "color.ink" },
      },
      components: { chip: { kind: "informational", tokens: { text: "text.primary" } } },
    };
    expect(lintSystem(s)).toEqual([]);
  });

  it("flags look-named roles, missing themes, chains, literals, low contrast and off-base spacing", () => {
    const s = {
      ...base,
      roles: {
        "text.primary": { day: "color.ink" },
        "surface.base": { day: "color.paper", night: "color.mist" },
        "text.muted": { day: "color.mist", night: "color.paper" },
        "gray-border": "#cccccc",
        "border.subtle": "surface.base",
        "loop.a": "loop.b",
        "loop.b": "loop.a",
        "link.color": "color.missing",
        "d.1": "d.2",
        "d.2": "d.3",
        "d.3": "d.4",
        "d.4": "color.ink",
      },
    };
    const ids = lintSystem(s).map((f) => `${f.id}:${f.where}`);
    expect(ids).toContain("role-missing-theme:roles.text.primary");
    expect(ids).toContain("role-named-by-look:roles.gray-border");
    expect(ids).toContain("role-literal:roles.gray-border");
    expect(ids.some((i) => i.startsWith("role-chain-deep:roles.border.subtle"))).toBe(false); // a one-hop chain is fine
    expect(ids).toContain("role-circular:roles.loop.a");
    expect(ids).toContain("role-unresolved:roles.link.color");
    expect(ids).toContain("role-chain-deep:roles.d.1");
    expect(ids).toContain("role-contrast:text.muted on surface.base (day)");
    expect(ids).toContain("role-contrast:text.muted on surface.base (night)");
    expect(ids).toContain("space-off-base:foundations.space.scale");
  });

  it("asks components for role bindings, the states their kind needs, and when-to-use for look-alikes", () => {
    const s = {
      foundations: { color: { ink: "#111111" } },
      roles: { "text.primary": "color.ink" },
      components: {
        "button-primary": { kind: "input", states: ["default", "hover"], tokens: { fill: "color.ink", text: "#fff" } },
        "button-ghost": { kind: "input", states: [...INTERACTIVE_STATES, ...INPUT_STATES], when_to_use: "secondary actions" },
        old: { status: "deprecated" },
      },
    };
    const ids = lintSystem(s).map((f) => `${f.id}:${f.where}`);
    expect(ids).toContain("component-binds-primitive:components.button-primary.tokens.fill");
    expect(ids).toContain("component-binds-literal:components.button-primary.tokens.text");
    expect(ids).toContain("component-states:components.button-primary");
    expect(ids).toContain("component-when-to-use:components (input)");
    expect(ids).toContain("component-deprecated-without-replacement:components.old");
    expect(ids.filter((i) => i.startsWith("component-states"))).toHaveLength(1);
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(contrastRatio("oklch(0.5 0.1 200)", "#fff")).toBeNull();
  });

  it("check: literals that are tokens, and spacing off the base unit", () => {
    write(".atelier/systems/console/design-system.yaml", "version: 2\nfoundations:\n  color: { ink: '#16150f' }\n  space: { base: 4 }\nrules:\n  - { id: on-base, check: spacing-off-base }\n");
    const f = write("apps/console/a.css", ".a { color: #16150F; padding: 6px 8px; }");
    const ids = checkText(".a { color: #16150F; padding: 6px 8px; }", f, systemForFile(f)!).map((x) => `${x.id}:${x.message.split(" ")[0]}`);
    expect(ids).toEqual(["on-base:6px", "literal-has-token:#16150F"]);
  });
});

describe("tells catalog in check (playbook v1)", () => {
  it("flags palette steps in components but not in the role definitions", () => {
    const tells = [{ id: "primitive-in-component", severity: "warn" as const, detect: { kind: "pattern", regex: "var\\(--(?:[a-z]+-)?(?:gray|blue)-?\\d{2,3}\\)", skip_definitions: true } }];
    const f = write("apps/console/b.css", ":root { --text-muted: var(--gray-500); }\n.b { color: var(--gray-500); }");
    const found = checkText(":root {\n  --text-muted: var(--gray-500);\n}\n.b { color: var(--gray-500); }", f, systemForFile(f)!, tells);
    expect(found.map((x) => x.line)).toEqual([4]);
  });
});

describe("system lint: review fixes (PR #15)", () => {
  it("infers themes from the roles when none are declared, instead of skipping every check", () => {
    const s = { foundations: { color: { mist: "#eeeeee", paper: "#ffffff" } }, roles: { "text.primary": { light: "color.mist", dark: "color.missing" }, "surface.base": { light: "color.paper" } } };
    const ids = lintSystem(s).map((f) => `${f.id}:${f.where}`);
    expect(ids).toContain("role-unresolved:roles.text.primary (dark)");
    expect(ids).toContain("role-missing-theme:roles.surface.base");
    expect(ids).toContain("role-contrast:text.primary on surface.base (light)");
  });

  it("treats a theme literally named default like any other", () => {
    const s = { themes: ["default", "dark"], foundations: { color: { ink: "#111111" } }, roles: { "text.primary": { default: "color.ink" } } };
    expect(lintSystem(s).map((f) => f.id)).toContain("role-missing-theme");
  });

  it("pairs inverse text with inverse surfaces and on-X text with X, so a correct inverse set passes", () => {
    const s = {
      foundations: { color: { ink: "#111111", paper: "#ffffff", accent: "#1d4ed8" } },
      roles: { "text.primary": "color.ink", "text.inverse": "color.paper", "surface.base": "color.paper", "surface.inverse": "color.ink", "text.on-accent": "color.paper", accent: "color.accent" },
    };
    expect(contrastPairs(s)).toEqual([["text.primary", "surface.base"], ["text.inverse", "surface.inverse"], ["text.on-accent", "accent"]]);
    expect(lintSystem(s).filter((f) => f.id === "role-contrast")).toEqual([]);
  });

  it("reads states written as a map or a string without crashing", () => {
    const s = { components: { a: { kind: "input", states: { default: "<b/>", hover: "<b/>" } }, b: { kind: "navigational", states: "default, hover, focus, active, disabled" } } };
    const f = lintSystem(s);
    expect(f.filter((x) => x.id === "component-states").map((x) => x.where)).toEqual(["components.a"]);
  });

  it("reports a theme-independent role once, not once per theme", () => {
    const s = { themes: ["day", "night"], foundations: { color: {} }, roles: { "border.subtle": "#cccccc", "link.x": "color.nope" } };
    const ids = lintSystem(s).map((f) => `${f.id}:${f.where}`);
    expect(ids.filter((i) => i === "role-literal:roles.border.subtle")).toHaveLength(1);
    expect(ids.filter((i) => i === "role-unresolved:roles.link.x")).toHaveLength(1);
  });

  it("reads a base with units and a named scale", () => {
    expect(lintSystem({ foundations: { space: { base: "4px", scale: ["4px", "6px"] } } }).map((f) => f.id)).toEqual(["space-off-base"]);
    expect(lintSystem({ foundations: { space: { base: 4, scale: { sm: 4, md: 6 } } } }).map((f) => f.id)).toEqual(["space-off-base"]);
  });

  it("doesn't score translucent colours as opaque", () => {
    expect(contrastRatio("#111111", "#ffffff10")).toBeNull();
    const s = { foundations: { color: { ink: "#111111", glass: "#ffffff10" } }, roles: { "text.primary": "color.ink", "surface.glass": "color.glass" } };
    expect(lintSystem(s).map((f) => f.id)).toEqual(["role-contrast-unknown"]);
  });
});

describe("check: review fixes (PR #15)", () => {
  it("doesn't flag the token source file, honours an override, and counts SCSS vars as definitions", () => {
    write(".atelier/systems/console/design-system.yaml", "version: 2\nfoundations:\n  color: { ink: '#16150f', paper: '#ede8dc', accent: '#44577c' }\n");
    const src = write("apps/console/tokens.ts", 'export const colors = { ink: "#16150f", paper: "#ede8dc", accent: "#44577c" };');
    expect(checkText(require("node:fs").readFileSync(src, "utf8"), src, systemForFile(src)!).filter((x) => x.id === "literal-has-token")).toEqual([]);
    const scss = write("apps/console/_vars.scss", "$ink: #16150f;\n.a { color: $ink; }");
    expect(checkText("$ink: #16150f;\n.a { color: $ink; }", scss, systemForFile(scss)!).filter((x) => x.id === "literal-has-token")).toEqual([]);
    const use = write("apps/console/b.css", ".b { color: #16150f; }");
    expect(checkText(".b { color: #16150f; }", use, systemForFile(use)!).map((x) => x.id)).toEqual(["literal-has-token"]);
    write(".atelier/systems/console/design-system.yaml", "version: 2\nfoundations:\n  color: { ink: '#16150f' }\noverrides:\n  - { tell: literal-has-token, reason: legacy }\n");
    expect(checkText(".b { color: #16150f; }", use, systemForFile(use)!)).toEqual([]);
  });

  it("skips role definitions only inside theme blocks, one-line or not", () => {
    const tells = [{ id: "primitive-in-component", severity: "warn" as const, detect: { kind: "pattern", regex: "var\\(--(?:[a-z]+-)?(?:gray|blue)-?\\d{2,3}\\)", skip_definitions: true } }];
    const f = write("apps/console/c.css", "");
    const text = [".dark { --text-muted: var(--gray-400); }", ".btn {", "  --btn-bg: var(--blue-500);", "}"].join("\n");
    expect(checkText(text, f, systemForFile(f)!, tells).map((x) => x.line)).toEqual([3]);
  });

  it("marks theme blocks line by line", () => {
    expect(themeBlockLines([":root {", "  --a: 1;", "}", ".x {", "  --b: 2;", "}"])).toEqual([true, true, true, false, false, false]);
  });
});
