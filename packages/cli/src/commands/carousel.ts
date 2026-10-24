import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, join, basename, extname, dirname, sep } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument, StudioRecipe } from "@a-company/atelier-types";
import { loadRecipe, applyRecipeToOverlay } from "../lib/recipe.js";
import {
  renderDocumentToPng,
  fitImageToCanvas,
  CanvasUnavailableError,
} from "../lib/render-image.js";

/** Image extensions the carousel driver accepts (lower-cased, with leading dot). */
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/** Default canvas size when neither --width/--height nor a recipe aspect is set. */
const DEFAULT_CANVAS = 1080;

/**
 * Expand an --inputs pattern into a sorted list of absolute image file paths.
 *
 * Deliberately minimal (no new glob dependency): supports a directory path
 * (lists all image files within), a single file path, or a single-segment
 * `*`-glob in the final path component (e.g. `shots/*.png`, `shots/img-*`).
 * Multi-segment / recursive globs are out of scope — point --inputs at a
 * directory instead. The returned list is filtered to image extensions and
 * sorted lexicographically so output ordering is stable.
 */
export function expandInputs(pattern: string): string[] {
  const abs = resolve(pattern);

  // Directory → every image file inside it.
  let isDir = false;
  try {
    isDir = statSync(abs).isDirectory();
  } catch {
    isDir = false;
  }
  if (isDir) {
    return listImages(abs);
  }

  const dir = dirname(abs);
  const base = basename(abs);

  // Single-segment `*` glob in the final component.
  if (base.includes("*")) {
    const matcher = globToRegExp(base);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries
      .filter((name) => matcher.test(name) && isImageFile(name))
      .map((name) => join(dir, name))
      .sort();
  }

  // Literal file path — keep it only if it is an image file.
  return isImageFile(base) ? [abs] : [];
}

/** List image files directly within a directory, sorted, as absolute paths. */
function listImages(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter(isImageFile)
    .map((name) => join(dir, name))
    .sort();
}

/** True when a filename has an accepted image extension. */
function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(extname(name).toLowerCase());
}

/**
 * Convert a single path-component glob (only `*` and `?` honored) into a
 * RegExp anchored to the whole name. `*` matches any run except the path
 * separator; `?` matches a single non-separator char.
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\*/g, `[^${sep === "\\" ? "\\\\" : sep}]*`).replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`);
}

/**
 * Build a single-frame carousel document for one image: a canvas-sized doc with
 * a background and one fit-to-canvas ImageVisual layer, then the recipe's
 * overlay_rules applied with currentIndex/totalCount threaded so the page-number
 * overlay renders "i/N".
 *
 * Pure + synchronous (no canvas): image bounds use the canvas-extent
 * fallback because natural dimensions aren't known until the rasterizer decodes
 * the file at render time. {@link renderDocumentToPng} re-fits the bounds via
 * `refitImageBounds` once the image is loaded.
 */
export function composeCarouselFrameDoc(args: {
  imagePath: string;
  index: number;
  total: number;
  width: number;
  height: number;
  recipe: StudioRecipe;
  background?: string;
}): AtelierDocument {
  const { imagePath, index, total, width, height, recipe } = args;
  const canvas = { width, height };

  // Natural dims unknown here → fitImageToCanvas falls back to canvas extents.
  const fit = fitImageToCanvas(canvas, { width: 0, height: 0 });

  const assetId = "carousel-image-asset";
  const baseDoc: AtelierDocument = {
    version: "1.0",
    name: `carousel-${index}`,
    canvas: { width, height, fps: 30, background: args.background ?? "#000000" },
    assets: { [assetId]: { type: "image", src: imagePath } },
    layers: [
      {
        id: "carousel-image",
        visual: { type: "image", assetId, src: imagePath },
        frame: fit.frame,
        bounds: fit.bounds,
        anchorPoint: { x: 0.5, y: 0.5 },
        opacity: 1,
      },
    ],
    states: { default: { duration: 1, deltas: [] } },
  };

  // Thread the carousel position so page_number resolves "i/N"; handle (if any)
  // is anchored on top of the image.
  return applyRecipeToOverlay(baseDoc, recipe, { currentIndex: index, totalCount: total });
}

/** Zero-padded sortable filename prefix: width = max(2, digits in N). */
export function carouselFileName(index: number, total: number, imagePath: string): string {
  const padWidth = Math.max(2, String(total).length);
  const prefix = String(index).padStart(padWidth, "0");
  const ext = extname(imagePath);
  const stem = basename(imagePath, ext);
  return `${prefix}-${stem}.png`;
}

interface CarouselOptions {
  inputs: string;
  outDir: string;
  width?: string;
  height?: string;
  frame: string;
}

/** Parse a positive-integer CLI option, exiting on bad input. */
function parseDim(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    console.error(`Invalid --${name}: ${raw}`);
    process.exit(1);
  }
  return n;
}

/**
 * Register `atelier carousel <recipe> --inputs <glob> --out-dir <dir>` — batch
 * compose a folder of images into recipe-overlaid PNGs.
 *
 * For each image i of N: build a fit-to-canvas doc, apply the recipe's
 * overlay_rules with currentIndex=i / totalCount=N (handle + "i/N" page-number),
 * render via the shared export-image path, and write a zero-padded sortable
 * PNG into --out-dir.
 */
export function carouselCommand(program: Command): void {
  program
    .command("carousel <recipe>")
    .description(
      "Batch-compose a folder of images into recipe-overlaid PNGs. " +
        "Each image becomes a fit-to-canvas post with the recipe's handle + " +
        "page-number ('i/N') overlays, written to --out-dir as zero-padded PNGs.",
    )
    .requiredOption("-i, --inputs <glob>", "Input images: a directory, file, or single-segment *-glob")
    .requiredOption("-d, --out-dir <dir>", "Destination directory for composed PNGs")
    .option("--width <number>", "Canvas width (px)", String(DEFAULT_CANVAS))
    .option("--height <number>", "Canvas height (px)", String(DEFAULT_CANVAS))
    .option("-f, --frame <number>", "Frame to render (defaults to 0)", "0")
    .action(async (recipeRef: string, options: CarouselOptions) => {
      // Resolve the recipe (same chain as other recipe commands).
      let recipe: StudioRecipe;
      try {
        const loaded = loadRecipe(recipeRef, process.cwd());
        recipe = loaded.recipe;
        console.log(`Loaded recipe ${loaded.path}`);
        for (const w of loaded.warnings) console.log(`  ⚠  ${w}`);
      } catch (err) {
        console.error(`atelier carousel: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
        return;
      }

      // Expand inputs.
      const inputs = expandInputs(options.inputs);
      if (inputs.length === 0) {
        console.error(
          `atelier carousel: no image files matched --inputs "${options.inputs}" ` +
            `(accepted: ${[...IMAGE_EXTS].join(", ")})`,
        );
        process.exit(1);
        return;
      }

      const width = parseDim(options.width, "width") ?? DEFAULT_CANVAS;
      const height = parseDim(options.height, "height") ?? DEFAULT_CANVAS;
      const frame = parseInt(options.frame, 10);
      if (isNaN(frame) || frame < 0) {
        console.error(`Invalid frame number: ${options.frame}`);
        process.exit(1);
        return;
      }

      // Ensure the destination exists / is writable.
      const outDir = resolve(options.outDir);
      try {
        mkdirSync(outDir, { recursive: true });
      } catch (err) {
        console.error(`atelier carousel: cannot create out-dir ${outDir}: ${(err as Error).message}`);
        process.exit(1);
        return;
      }

      const total = inputs.length;
      console.log(`Composing ${total} image${total === 1 ? "" : "s"} → ${outDir}`);

      try {
        for (let n = 0; n < total; n++) {
          const index = n + 1; // 1-based
          const imagePath = inputs[n];
          const doc = composeCarouselFrameDoc({
            imagePath,
            index,
            total,
            width,
            height,
            recipe,
          });

          const buffer = await renderDocumentToPng(doc, {
            frame,
            // Re-fit the image to the canvas using real natural dims once decoded.
            refitImageBounds: ({ canvas, natural }) => fitImageToCanvas(canvas, natural),
          });

          const outName = carouselFileName(index, total, imagePath);
          writeFileSync(join(outDir, outName), buffer);
          console.log(`  [${index}/${total}] ${basename(imagePath)} → ${outName}`);
        }
      } catch (err) {
        if (err instanceof CanvasUnavailableError) {
          console.error(err.message);
          process.exit(1);
          return;
        }
        console.error(`atelier carousel: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
        return;
      }

      console.log(`\nDone. ${total} image${total === 1 ? "" : "s"} → ${outDir}`);
    });
}
