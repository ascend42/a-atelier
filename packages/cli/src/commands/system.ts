import type { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  findSystemRoot,
  listSystems,
  readIndex,
  resolveProduct,
  systemForFile,
  type ResolvedSystem,
  type SystemsIndex,
} from "../lib/design-system.js";
import { extract } from "../lib/design-extract.js";
import { inventoryPage, specimenPage, specimenFramePage } from "../lib/design-pages.js";
import { check, loadTells, CHECK_IDS, type Finding } from "../lib/design-check.js";
import { lintSystem } from "../lib/design-lint.js";
import { templatesDir } from "./setup.js";

/**
 * Design systems, one per product (#design-system):
 *
 *   atelier system list [dir]                       products, paths, sources
 *   atelier system which <file>                     the system that governs a file
 *   atelier system init [dir] --product <id> --paths a,b [--name N] [--extends id]
 *   atelier system extract [dir] [--product id | --paths a,b] [--json]
 *   atelier system specimen [dir] [--product id]
 *   atelier system lint [dir] [--product id] [--json]  the system against the playbook; exit 1 on a fail
 *   atelier check [files...] [--product id] [--json]   exit 1 on a fail
 *
 * The process around these (extract → reconcile with the creator → codify →
 * specimen → enforce) is the `system` verb of the atelier-design skill.
 */

function repoRootFrom(dir: string): string {
  let d = resolve(dir);
  for (;;) {
    if (existsSync(join(d, ".git")) || existsSync(join(d, ".atelier"))) return d;
    const parent = resolve(d, "..");
    if (parent === d) return resolve(dir);
    d = parent;
  }
}

function splitList(v?: string): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Pick the systems a command acts on. */
function pickSystems(dir: string, opts: { product?: string; paths?: string; name?: string }): ResolvedSystem[] {
  const root = findSystemRoot(dir) ?? repoRootFrom(dir);
  if (opts.paths) {
    // Ad-hoc scope, e.g. before a product is declared: extract to see what exists.
    const id = opts.product ?? null;
    const index = readIndex(root);
    if (id && index?.products?.[id]) return [{ ...resolveProduct(root, id, index), paths: splitList(opts.paths) }];
    return [{ root, product: id ?? "adhoc", name: opts.name ?? id ?? "adhoc", paths: splitList(opts.paths), dir: join(root, ".atelier", "systems", id ?? "adhoc"), sources: [], system: {} }];
  }
  if (opts.product) return [resolveProduct(root, opts.product)];
  const systems = listSystems(root);
  if (systems.length) return systems;
  return [{ root, product: null, name: opts.name ?? "repo", paths: [""], dir: join(root, ".atelier"), sources: [], system: {} }];
}

function printFindings(findings: Finding[]): void {
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  for (const [file, list] of byFile) {
    console.log(`  ${file}`);
    for (const f of list.sort((a, b) => a.line - b.line)) {
      console.log(`    ${String(f.line).padStart(5)}  ${f.severity === "fail" ? "fail" : "warn"}  ${f.id}  ${f.message}`);
    }
  }
}

export function systemCommand(program: Command): void {
  const sys = program.command("system").description("Design systems, one per product: list, which, init, extract, specimen");

  sys
    .command("list [dir]")
    .description("List the repo's design systems (one per product) with their paths and source files")
    .option("--json", "Machine-readable output")
    .action((dir: string | undefined, opts: { json?: boolean }) => {
      const root = findSystemRoot(dir ?? process.cwd());
      const systems = root ? listSystems(root) : [];
      if (opts.json) {
        console.log(JSON.stringify(systems.map(({ system: _s, ...rest }) => rest), null, 2));
        return;
      }
      if (!systems.length) {
        console.log("  No design system here yet. Start one with: atelier system extract (then the atelier-design `system` session).");
        return;
      }
      for (const s of systems) {
        console.log(`  ${s.product ?? "(repo)"}  ${s.name}`);
        console.log(`    paths    ${s.paths.map((p) => p || "(whole repo)").join(", ")}`);
        console.log(`    sources  ${s.sources.map((p) => relative(s.root, p)).join(" + ") || "(none yet)"}`);
      }
    });

  sys
    .command("which <file>")
    .description("Show which design system governs a file")
    .action((file: string) => {
      const s = systemForFile(resolve(file));
      if (!s) {
        console.log("  No design system covers this file.");
        process.exit(1);
      }
      console.log(`  ${s.product ?? "(repo)"}  ${s.name}`);
      console.log(`    sources  ${s.sources.map((p) => relative(s.root, p)).join(" + ")}`);
    });

  sys
    .command("init [dir]")
    .description("Declare a product and its paths in .atelier/systems.yaml and create its system folder")
    .requiredOption("--product <id>", "Product id (kebab-case)")
    .requiredOption("--paths <list>", "Comma-separated paths the product's UI lives in, relative to the repo root")
    .option("--name <name>", "Display name")
    .option("--extends <id>", "Inherit another product's system (default: the repo-wide base, if any)")
    .action((dir: string | undefined, opts: { product: string; paths: string; name?: string; extends?: string }) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.product)) {
        console.error("  --product must be kebab-case");
        process.exit(1);
      }
      const root = findSystemRoot(dir ?? process.cwd()) ?? repoRootFrom(dir ?? process.cwd());
      const indexPath = join(root, ".atelier", "systems.yaml");
      const index: SystemsIndex = existsSync(indexPath) ? ((parseYaml(readFileSync(indexPath, "utf8")) as SystemsIndex) ?? {}) : { version: 1 };
      index.products = index.products ?? {};
      if (opts.extends && opts.extends !== "none" && !index.products[opts.extends]) {
        console.error(`  --extends: no product "${opts.extends}" yet`);
        process.exit(1);
      }
      index.products[opts.product] = {
        ...(index.products[opts.product] ?? {}),
        name: opts.name ?? index.products[opts.product]?.name ?? opts.product,
        paths: splitList(opts.paths),
        ...(opts.extends ? { extends: opts.extends } : {}),
      };
      mkdirSync(join(root, ".atelier"), { recursive: true });
      writeFileSync(
        indexPath,
        "# Products in this repo, each with its own design system (.atelier/systems/<id>/).\n" +
          "# .atelier/design-system.yaml, if present, is the repo-wide base every product inherits.\n" +
          stringifyYaml({ version: 1, ...index }, { lineWidth: 0 }),
      );
      const productDir = join(root, ".atelier", "systems", opts.product);
      mkdirSync(productDir, { recursive: true });
      const file = join(productDir, "design-system.yaml");
      if (!existsSync(file)) {
        writeFileSync(
          file,
          `# ${opts.name ?? opts.product} design system. Layers: foundations, components, zones, content,\n` +
            "# rules, preserve, overrides, decisions. Every entry traces to a decision (from:).\n" +
            stringifyYaml({ version: 2, foundations: {}, components: {}, zones: {}, content: {}, rules: [], decisions: [] }, { lineWidth: 0 }),
        );
      }
      console.log(`  Declared ${opts.product} → ${splitList(opts.paths).join(", ")}`);
      console.log(`    index   ${relative(root, indexPath)}`);
      console.log(`    system  ${relative(root, file)}`);
    });

  sys
    .command("extract [dir]")
    .description("Inventory what a product's UI actually uses (values, tokens, components, copy) and write inventory.html + .json")
    .option("--product <id>", "Only this product")
    .option("--paths <list>", "Ad-hoc scope (comma-separated), e.g. before the product is declared")
    .option("--name <name>", "Display name for an ad-hoc scope")
    .option("--json", "Print the inventory as JSON instead of writing files")
    .action((dir: string | undefined, opts: { product?: string; paths?: string; name?: string; json?: boolean }) => {
      const systems = pickSystems(dir ?? process.cwd(), opts);
      const out: unknown[] = [];
      for (const s of systems) {
        const inv = extract(s);
        if (opts.json) {
          out.push(inv);
          continue;
        }
        mkdirSync(s.dir, { recursive: true });
        writeFileSync(join(s.dir, "inventory.json"), JSON.stringify(inv, null, 2));
        writeFileSync(join(s.dir, "inventory.html"), inventoryPage(inv));
        const v = inv.values;
        console.log(`  ${s.name}: ${inv.files} UI files`);
        console.log(`    ${v.color.length} colours · ${v.font.length} families · ${v["font-size"].length} sizes · ${v.spacing.length} spacings · ${v.radius.length} radii · ${inv.tokens.length} tokens`);
        console.log(`    ${inv.nearDuplicates.length} near-duplicate groups${inv.hasSystem ? ` · ${Object.values(inv.drift).reduce((n, x) => n + (x ?? 0), 0)} off-system uses` : ""}`);
        console.log(`    → ${relative(process.cwd(), join(s.dir, "inventory.html"))}`);
      }
      if (opts.json) console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
    });

  sys
    .command("specimen [dir]")
    .description("Render the design system (foundations, components in every state and theme, zones, content) to specimen.html")
    .option("--product <id>", "Only this product")
    .action((dir: string | undefined, opts: { product?: string }) => {
      const root = findSystemRoot(dir ?? process.cwd());
      if (!root) {
        console.error("  No design system here yet.");
        process.exit(1);
      }
      const systems = opts.product ? [resolveProduct(root, opts.product)] : listSystems(root);
      for (const s of systems) {
        const file = join(s.dir, "specimen.html");
        mkdirSync(s.dir, { recursive: true });
        writeFileSync(file, specimenPage(s, file));
        writeFileSync(join(s.dir, "specimen-frame.html"), specimenFramePage(s, file));
        console.log(`  ${s.name} → ${relative(process.cwd(), file)}`);
      }
    });
  sys
    .command("lint [dir]")
    .description("Check each design system against the playbook: token tiers, roles per theme, text contrast per theme, base unit, component states")
    .option("--product <id>", "Only this product")
    .option("--json", "Machine-readable output")
    .action((dir: string | undefined, opts: { product?: string; json?: boolean }) => {
      const root = findSystemRoot(dir ?? process.cwd());
      if (!root) {
        console.error("  No design system here yet.");
        process.exit(1);
      }
      const systems = opts.product ? [resolveProduct(root, opts.product)] : listSystems(root);
      const results = systems.map((s) => ({ product: s.product, name: s.name, findings: lintSystem(s.system) }));
      const fails = results.reduce((n, r) => n + r.findings.filter((f) => f.severity === "fail").length, 0);
      if (opts.json) {
        console.log(JSON.stringify({ ok: fails === 0, results }, null, 2));
      } else {
        for (const r of results) {
          console.log(`  ${r.name}${r.findings.length ? "" : ": clean"}`);
          for (const f of r.findings) console.log(`    ${f.severity === "fail" ? "fail" : "warn"}  ${f.id}  ${f.where}: ${f.message}`);
        }
      }
      if (fails) process.exit(1);
    });
}

export function checkCommand(program: Command): void {
  program
    .command("check [files...]")
    .description(`Check UI files against their product's design system (rules: ${CHECK_IDS.join(", ")}; retired words; mechanical tells)`)
    .option("--product <id>", "Check every file of this product")
    .option("--no-tells", "Skip the mechanical tells")
    .option("--json", "Machine-readable output")
    .action((files: string[], opts: { product?: string; tells?: boolean; json?: boolean }) => {
      let tmpl: string | undefined;
      try {
        tmpl = templatesDir();
      } catch {
        tmpl = undefined;
      }
      const tells = opts.tells === false ? [] : loadTells(tmpl);
      const cwd = process.cwd();
      const result = files.length
        ? check([], { files: files.map((f) => resolve(f)), tells })
        : (() => {
            const root = findSystemRoot(cwd);
            if (!root) return { findings: [], files: 0 };
            return check(opts.product ? [resolveProduct(root, opts.product)] : listSystems(root), { tells });
          })();
      const fails = result.findings.filter((f) => f.severity === "fail").length;
      if (opts.json) {
        console.log(JSON.stringify({ ok: fails === 0, files: result.files, fails, warnings: result.findings.length - fails, findings: result.findings }, null, 2));
      } else {
        if (!result.files) console.log("  No UI files under a design system here.");
        else {
          printFindings(result.findings);
          console.log(`  ${result.files} files · ${fails} fail · ${result.findings.length - fails} warn`);
        }
      }
      if (fails) process.exit(1);
    });
}
