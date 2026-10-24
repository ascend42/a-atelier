import type { Command } from "commander";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { findBrandDir as findBrandDirOrThrow, loadBrand, checkBrand, BrandError } from "../lib/brand.js";
import { boardPage, brandSheet } from "../lib/brand-pages.js";

/**
 * Brand kits (#brand-kit), the CLI half of the atelier-design `brand` verb:
 *
 *   atelier brand board <dir> [--out file] [--title t]   one exploration round as a sheet
 *   atelier brand sheet [dir] [--product id]             brand.yaml + marks/ → brand.html
 *   atelier brand check [dir] [--product id] [--json]    the kit against the process; exit 1 on a fail
 */
/** findBrandDir, printing a BrandError (an undeclared --product) as a one-line error. */
function findBrandDir(start: string, product?: string): string | null {
  try {
    return findBrandDirOrThrow(start, product);
  } catch (e) {
    if (!(e instanceof BrandError)) throw e;
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

/** Say where we looked, so a wrong folder isn't a mystery, and exit 1. */
function notFound(start: string, looked: string | null): never {
  const where = looked ? `no brand.yaml in ${relative(process.cwd(), looked) || "."}` : "no brand folder found";
  console.error(`  No brand.yaml found (${where}, searched from ${relative(process.cwd(), resolve(start)) || "."}). A brand lives in .atelier/brand/, .atelier/systems/<product>/brand/ or _brand/.`);
  process.exit(1);
}

export function brandCommand(program: Command): void {
  const brand = program.command("brand").description("Brand kits: exploration boards, the brand sheet, and checks");

  brand
    .command("board <dir>")
    .description("Lay out a round of mark options (SVG/PNG files in <dir>) as a labelled sheet: large, at 64/32/16 px, on dark, in one colour")
    .option("--out <file>", "Output HTML (default <dir>/board.html)")
    .option("--title <title>", "Page title", "Round")
    .option("--notes <file>", "JSON of file name → note shown under that option (e.g. misreading-test results)")
    .action((dir: string, opts: { out?: string; title: string; notes?: string }) => {
      const abs = resolve(dir);
      if (!existsSync(abs)) {
        console.error(`  ${dir} doesn't exist`);
        process.exit(1);
      }
      // one option per name: an SVG wins over its own PNG render
      const all = readdirSync(abs).filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f)).sort();
      const svgStems = new Set(all.filter((f) => /\.svg$/i.test(f)).map((f) => f.replace(/\.svg$/i, "")));
      const files = all.filter((f) => /\.svg$/i.test(f) || !svgStems.has(f.replace(/\.[a-z]+$/i, "")));
      if (!files.length) {
        console.error("  No .svg/.png/.jpg/.webp files to show.");
        process.exit(1);
      }
      const out = resolve(opts.out ?? join(abs, "board.html"));
      const srcs = files.map((f) => relative(dirname(out), join(abs, f)));  // raw paths; boardPage encodes them for the page
      mkdirSync(dirname(out), { recursive: true });
      let notes: Record<string, string> = {};
      if (opts.notes) {
        try {
          notes = JSON.parse(readFileSync(resolve(opts.notes), "utf8"));
        } catch (e) {
          console.error(`  --notes ${opts.notes}: ${(e as Error).message}`);
          process.exit(1);
        }
      }
      writeFileSync(out, boardPage(opts.title, srcs, notes));
      console.log(`  ${files.length} options → ${relative(process.cwd(), out)}`);
    });

  brand
    .command("sheet [dir]")
    .description("Render the brand sheet (brand.html) from brand.yaml and marks/")
    .option("--product <id>", "A product's brand in a multi-product repo")
    .option("--offline", "Don't link Google Fonts; type specimens use the system fonts")
    .action((dir: string | undefined, opts: { product?: string; offline?: boolean }) => {
      const brandDir = findBrandDir(dir ?? process.cwd(), opts.product);
      const b = brandDir ? loadBrand(brandDir) : null;
      if (!brandDir || !b) return notFound(dir ?? process.cwd(), brandDir);
      const out = join(brandDir, "brand.html");
      writeFileSync(out, brandSheet(b, brandDir, out, checkBrand(b, brandDir), { fonts: !opts.offline }));
      console.log(`  ${b.name ?? "brand"} → ${relative(process.cwd(), out)}`);
    });

  brand
    .command("check [dir]")
    .description("Check a brand kit: strategy and nouns before the mark, a logo system by media size, the mark compact and simple enough for small media, colour contrast")
    .option("--product <id>", "A product's brand in a multi-product repo")
    .option("--json", "Machine-readable output")
    .action((dir: string | undefined, opts: { product?: string; json?: boolean }) => {
      const brandDir = findBrandDir(dir ?? process.cwd(), opts.product);
      const b = brandDir ? loadBrand(brandDir) : null;
      if (!brandDir || !b) return notFound(dir ?? process.cwd(), brandDir);
      const checks = checkBrand(b, brandDir);
      const fails = checks.filter((c) => c.severity === "fail").length;
      if (opts.json) console.log(JSON.stringify({ ok: fails === 0, checks }, null, 2));
      else {
        console.log(`  ${b.name ?? "brand"}${checks.length ? "" : ": clean"}`);
        for (const c of checks) console.log(`    ${c.severity}  ${c.id}  ${c.message}`);
      }
      if (fails) process.exit(1);
    });
}
