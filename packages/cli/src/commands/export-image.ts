import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import {
  renderDocumentToPng,
  resolveExportDimensions,
  CanvasUnavailableError,
} from "../lib/render-image.js";

// Re-export so existing import sites (index.ts, tests) keep resolving.
export { resolveExportDimensions };

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

      const width = parseDim(options.width, "width");
      const height = parseDim(options.height, "height");

      try {
        const buffer = await renderDocumentToPng(doc, {
          state: options.state,
          frame: frameNumber,
          width,
          height,
        });
        writeFileSync(resolve(options.out), buffer);
      } catch (err) {
        if (err instanceof CanvasUnavailableError) {
          console.error(err.message);
          process.exit(1);
          return;
        }
        console.error((err as Error).message);
        process.exit(1);
      }
    });
}
