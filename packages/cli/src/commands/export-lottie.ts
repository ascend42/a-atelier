import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { exportToLottie } from "@a-company/atelier-lottie";

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

/** Register the `export-lottie` subcommand on the Commander program. */
export function exportLottieCommand(program: Command): void {
  program
    .command("export-lottie <file>")
    .description("Export a document to Lottie JSON format")
    .option("-s, --state <name>", "State name (defaults to first state)")
    .option("-o, --output <path>", "Output file path (default: stdout)")
    .action(
      (
        file: string,
        options: { state?: string; output?: string },
      ) => {
        const doc = readAndParse(file);

        try {
          const { json, warnings } = exportToLottie(doc, {
            state: options.state,
          });

          // Print warnings to stderr
          for (const warning of warnings) {
            console.error(`Warning: ${warning}`);
          }

          const output = JSON.stringify(json, null, 2);
          if (options.output) {
            writeFileSync(resolve(options.output), output, "utf-8");
          } else {
            console.log(output);
          }
        } catch (err) {
          console.error((err as Error).message);
          process.exit(1);
        }
      },
    );
}
