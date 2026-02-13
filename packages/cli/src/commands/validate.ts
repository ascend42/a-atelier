import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { parseAtelier } from "@atelier/schema";
import { validateAllDeltas } from "@atelier/core";

/**
 * Validate an .atelier file: parse YAML, check schema, check delta overlaps.
 * Returns { valid, errors } for programmatic use.
 */
export function validateFile(filePath: string): {
  valid: boolean;
  errors: string[];
} {
  const absPath = resolve(filePath);
  let content: string;
  try {
    content = readFileSync(absPath, "utf-8");
  } catch {
    return { valid: false, errors: [`Cannot read file: ${absPath}`] };
  }

  const result = parseAtelier(content);
  if (!result.success) {
    return {
      valid: false,
      errors: result.errors.map(
        (e) => `${e.path}: ${e.message}`,
      ),
    };
  }

  // Check all states for delta overlaps
  const overlapErrors: string[] = [];
  for (const [stateName, state] of Object.entries(result.data.states)) {
    const overlaps = validateAllDeltas(state.deltas);
    for (const overlap of overlaps) {
      overlapErrors.push(`State "${stateName}": ${overlap.message}`);
    }
  }

  if (overlapErrors.length > 0) {
    return { valid: false, errors: overlapErrors };
  }

  return { valid: true, errors: [] };
}

/**
 * Register the `validate` subcommand on the Commander program.
 */
export function validateCommand(program: Command): void {
  program
    .command("validate <file>")
    .description("Validate an .atelier YAML file")
    .action((file: string) => {
      const { valid, errors } = validateFile(file);
      if (valid) {
        console.log("Valid");
      } else {
        console.error("Validation errors:");
        for (const error of errors) {
          console.error(`  - ${error}`);
        }
        process.exit(1);
      }
    });
}
