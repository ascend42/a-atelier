import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { renderFrameSVG } from "@a-company/atelier-svg";

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

/** Register the `export-svg` subcommand on the Commander program. */
export function exportSvgCommand(program: Command): void {
  program
    .command("export-svg <file>")
    .description("Export a frame as SVG")
    .option("-s, --state <name>", "State name (defaults to first state)")
    .option("-f, --frame <number>", "Frame number (defaults to 0)", "0")
    .option("-o, --output <path>", "Output file path (default: stdout)")
    .option("--xml-declaration", "Include XML declaration")
    .action(
      (
        file: string,
        options: { state?: string; frame: string; output?: string; xmlDeclaration?: boolean },
      ) => {
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
          console.error(`State "${stateName}" not found. Available: ${stateNames.join(", ")}`);
          process.exit(1);
          return;
        }

        try {
          const svg = renderFrameSVG(doc, stateName, frameNumber, {
            xmlDeclaration: options.xmlDeclaration,
          });

          if (options.output) {
            writeFileSync(resolve(options.output), svg, "utf-8");
          } else {
            console.log(svg);
          }
        } catch (err) {
          console.error((err as Error).message);
          process.exit(1);
        }
      },
    );
}
