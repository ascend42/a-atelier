/**
 * `atelier render <file>` — render an animation to MP4 or GIF via FFmpeg.
 *
 * Usage:
 *   atelier render animation.atelier                   → animation.mp4
 *   atelier render animation.atelier -f gif            → animation.gif
 *   atelier render animation.atelier -o out/video.mp4  → custom path
 *   atelier render animation.atelier -s intro outro    → specific states
 */

import { readFileSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import {
  checkFfmpeg,
  renderDocument,
  type RenderFormat,
} from "./render-pipeline.js";

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

function inferFormat(output: string | undefined): RenderFormat {
  if (!output) return "mp4";
  const ext = extname(output).toLowerCase();
  if (ext === ".gif") return "gif";
  return "mp4";
}

/** Register the `render` subcommand on the Commander program. */
export function renderCommand(program: Command): void {
  program
    .command("render <file>")
    .description("Render animation to MP4 or GIF via FFmpeg")
    .option("-o, --output <path>", "Output file path")
    .option("-f, --format <type>", "Output format: mp4 | gif")
    .option(
      "-s, --state <names...>",
      "State(s) to render (default: all in order)",
    )
    .action(
      async (
        file: string,
        options: {
          output?: string;
          format?: string;
          state?: string[];
        },
      ) => {
        // Check FFmpeg availability
        const hasFfmpeg = await checkFfmpeg();
        if (!hasFfmpeg) {
          console.error("FFmpeg is not installed or not in PATH.");
          console.error("Install it:");
          console.error("  macOS:   brew install ffmpeg");
          console.error("  Ubuntu:  sudo apt install ffmpeg");
          console.error("  Windows: https://ffmpeg.org/download.html");
          process.exit(1);
          return;
        }

        const doc = readAndParse(file);

        // Resolve format
        let format: RenderFormat;
        if (options.format) {
          if (options.format !== "mp4" && options.format !== "gif") {
            console.error(
              `Unknown format: "${options.format}". Use mp4 or gif.`,
            );
            process.exit(1);
            return;
          }
          format = options.format;
        } else {
          format = inferFormat(options.output);
        }

        // Resolve output path
        const inputName = basename(file, extname(file));
        const output = options.output ?? `${inputName}.${format}`;

        const startTime = Date.now();

        try {
          const result = await renderDocument(doc, {
            output: resolve(output),
            format,
            states: options.state,
            onProgress: ({ frame, totalFrames, state, percent }) => {
              const elapsed = (Date.now() - startTime) / 1000;
              const rate = elapsed > 0 ? frame / elapsed : 0;
              const remaining =
                rate > 0 ? (totalFrames - frame) / rate : 0;
              process.stderr.write(
                `\rRendering: frame ${frame}/${totalFrames} (${percent}%) - state "${state}" - ETA ${remaining.toFixed(1)}s`,
              );
            },
          });

          process.stderr.write("\n");
          console.log(
            `Done: ${result.totalFrames} frames \u2192 ${result.output} (${(result.durationMs / 1000).toFixed(1)}s)`,
          );
        } catch (err) {
          process.stderr.write("\n");
          console.error((err as Error).message);
          process.exit(1);
        }
      },
    );
}
