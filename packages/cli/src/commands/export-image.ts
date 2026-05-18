import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { resolveFrame } from "@a-company/atelier-core";

/** Read and parse an .atelier file, exiting on failure. */
function readAndParse(file: string): AtelierDocument {
  const absPath = resolve(file);
  let content: string;
  try {
    content = readFileSync(absPath, "utf-8");
  } catch {
    console.error(`Cannot read file: ${absPath}`);
    return process.exit(1);
  }

  const result = parseAtelier(content);
  if (!result.success) {
    console.error("Parse errors:");
    for (const error of result.errors) {
      console.error(`  - ${error.path}: ${error.message}`);
    }
    return process.exit(1);
  }

  return result.data;
}

/**
 * Compute final output dimensions from the document canvas and optional
 * width/height overrides. When only one of width/height is provided, the
 * other is derived to preserve the document's aspect ratio. When both are
 * provided, both are used verbatim (allows non-uniform scaling).
 */
export function resolveExportDimensions(
  docWidth: number,
  docHeight: number,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }
  if (width !== undefined) {
    const h = Math.max(1, Math.round((width * docHeight) / docWidth));
    return { width, height: h };
  }
  if (height !== undefined) {
    const w = Math.max(1, Math.round((height * docWidth) / docHeight));
    return { width: w, height };
  }
  return { width: docWidth, height: docHeight };
}

interface ExportImageOptions {
  state?: string;
  frame: string;
  width?: string;
  height?: string;
  out: string;
}

/** Parse a positive integer CLI option, returning undefined if not set. */
function parseDim(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) {
    console.error(`Invalid --${name}: ${raw}`);
    process.exit(1);
  }
  return n;
}

/** Register the `export-image` subcommand on the Commander program. */
export function exportImageCommand(program: Command): void {
  program
    .command("export-image <file>")
    .description(
      "Export a single frame as a PNG image. " +
        "Aspect-preserving when only one of --width/--height is set; " +
        "if both are set the renderer uses both verbatim (may squash).",
    )
    .requiredOption("-o, --out <path>", "Output PNG file path")
    .option("-s, --state <name>", "State name (defaults to first state)")
    .option("-f, --frame <number>", "Frame number (defaults to 0)", "0")
    .option("--width <number>", "Override output width (px)")
    .option("--height <number>", "Override output height (px)")
    .action(async (file: string, options: ExportImageOptions) => {
      const doc = readAndParse(file);

      const frameNumber = parseInt(options.frame, 10);
      if (isNaN(frameNumber) || frameNumber < 0) {
        console.error(`Invalid frame number: ${options.frame}`);
        process.exit(1);
        return;
      }

      const stateNames = Object.keys(doc.states);
      if (stateNames.length === 0) {
        console.error("Document has no states");
        process.exit(1);
        return;
      }

      const stateName = options.state ?? stateNames[0];
      if (!doc.states[stateName]) {
        console.error(
          `State "${stateName}" not found. Available: ${stateNames.join(", ")}`,
        );
        process.exit(1);
        return;
      }

      const duration = doc.states[stateName].duration;
      if (frameNumber >= duration) {
        console.error(
          `Frame ${frameNumber} is out of range for state "${stateName}" (duration ${duration})`,
        );
        process.exit(1);
        return;
      }

      const width = parseDim(options.width, "width");
      const height = parseDim(options.height, "height");

      // Dynamic import — canvas requires native compilation.
      const canvasModuleName = "canvas";
      let createCanvas: (w: number, h: number) => {
        getContext(id: "2d"): unknown;
        toBuffer(format: "image/png"): Buffer;
      };
      try {
        const canvasModule = await import(/* webpackIgnore: true */ canvasModuleName);
        createCanvas = canvasModule.createCanvas;
      } catch {
        console.error(
          "The 'canvas' package is not installed.\n" +
            "Install it with:\n" +
            "  npm install canvas\n" +
            "Prerequisites vary by OS:\n" +
            "  macOS:   brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman\n" +
            "  Ubuntu:  sudo apt install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev\n" +
            "See: https://github.com/Automattic/node-canvas#compiling",
        );
        process.exit(1);
        return;
      }

      const { renderFrame } = await import("@a-company/atelier-canvas");

      try {
        const { width: outW, height: outH } = resolveExportDimensions(
          doc.canvas.width,
          doc.canvas.height,
          width,
          height,
        );

        const resolved = resolveFrame(doc, stateName, frameNumber);
        const cvs = createCanvas(outW, outH);
        const ctx = cvs.getContext("2d") as unknown as import("@a-company/atelier-canvas").RenderContext;

        // Scale rendering to fit the output canvas while letting renderFrame
        // operate on the document's native canvas dimensions.
        const sx = outW / doc.canvas.width;
        const sy = outH / doc.canvas.height;
        if (sx !== 1 || sy !== 1) {
          ctx.scale(sx, sy);
        }

        renderFrame(ctx, resolved, doc);

        const buffer = cvs.toBuffer("image/png");
        writeFileSync(resolve(options.out), buffer);
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
