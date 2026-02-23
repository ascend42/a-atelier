import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { resolveFrame } from "@a-company/atelier-core";
import type { ResolvedFrame } from "@a-company/atelier-core";

/**
 * Resolve a single frame from a document, returning the resolved frame data.
 * If stateName is not provided, uses the first state.
 * If frame is not provided, uses frame 0.
 */
export function resolveStill(
  doc: AtelierDocument,
  stateName?: string,
  frame?: number,
): ResolvedFrame {
  const stateNames = Object.keys(doc.states);
  if (stateNames.length === 0) {
    throw new Error("Document has no states");
  }

  const resolvedStateName = stateName ?? stateNames[0];
  if (!(resolvedStateName in doc.states)) {
    throw new Error(
      `State "${resolvedStateName}" not found. Available: ${stateNames.join(", ")}`,
    );
  }

  const resolvedFrame = frame ?? 0;
  return resolveFrame(doc, resolvedStateName, resolvedFrame);
}

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
 * Register the `still` subcommand on the Commander program.
 */
export function stillCommand(program: Command): void {
  program
    .command("still <file>")
    .description(
      "Resolve a single frame and output as JSON or render as PNG",
    )
    .option("-s, --state <name>", "State name (defaults to first state)")
    .option(
      "-f, --frame <number>",
      "Frame number (defaults to 0)",
      "0",
    )
    .option(
      "--format <type>",
      "Output format: json | png (default: json)",
      "json",
    )
    .option("-o, --output <path>", "Output file path (default: stdout)")
    .action(
      async (
        file: string,
        options: { state?: string; frame: string; format: string; output?: string },
      ) => {
        const doc = readAndParse(file);

        const frameNumber = parseInt(options.frame, 10);
        if (isNaN(frameNumber) || frameNumber < 0) {
          console.error(
            `Invalid frame number: ${options.frame}`,
          );
          process.exit(1);
          return;
        }

        if (options.format !== "json" && options.format !== "png") {
          console.error(`Unknown format: "${options.format}". Use json or png.`);
          process.exit(1);
          return;
        }

        try {
          const resolved = resolveStill(
            doc,
            options.state,
            frameNumber,
          );

          if (options.format === "json") {
            const json = JSON.stringify(resolved, null, 2);
            if (options.output) {
              writeFileSync(resolve(options.output), json, "utf-8");
            } else {
              console.log(json);
            }
          } else {
            // PNG format — dynamic import of canvas
            let canvasMod: typeof import("canvas");
            try {
              canvasMod = await import("canvas");
            } catch {
              console.error("PNG output requires the 'canvas' package. Install it: npm i canvas");
              process.exit(1);
              return;
            }

            const { renderFrame } = await import("@a-company/atelier-canvas");

            const { createCanvas } = canvasMod;
            const cvs = createCanvas(doc.canvas.width, doc.canvas.height);
            const ctx = cvs.getContext("2d");
            renderFrame(ctx as unknown as import("@a-company/atelier-canvas").RenderContext, resolved, doc);

            const buffer = cvs.toBuffer("image/png");
            if (options.output) {
              writeFileSync(resolve(options.output), buffer);
            } else {
              process.stdout.write(buffer);
            }
          }
        } catch (err) {
          console.error(
            (err as Error).message,
          );
          process.exit(1);
        }
      },
    );
}
