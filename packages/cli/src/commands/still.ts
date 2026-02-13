import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@atelier/types";
import { parseAtelier } from "@atelier/schema";
import { resolveFrame } from "@atelier/core";
import type { ResolvedFrame } from "@atelier/core";

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
      "Resolve a single frame and output as JSON",
    )
    .option("-s, --state <name>", "State name (defaults to first state)")
    .option(
      "-f, --frame <number>",
      "Frame number (defaults to 0)",
      "0",
    )
    .action(
      (
        file: string,
        options: { state?: string; frame: string },
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

        try {
          const resolved = resolveStill(
            doc,
            options.state,
            frameNumber,
          );
          console.log(JSON.stringify(resolved, null, 2));
        } catch (err) {
          console.error(
            (err as Error).message,
          );
          process.exit(1);
        }
      },
    );
}
