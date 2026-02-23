import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { findTemplateVariables } from "@a-company/atelier-core";

/** Variable summary entry */
export interface VariableInfo {
  name: string;
  type: string;
  description?: string;
  default?: unknown;
  referenced: boolean;
}

/**
 * Extract variable info from a parsed AtelierDocument.
 */
export function getVariables(doc: AtelierDocument): { variables: VariableInfo[]; undeclared: string[] } {
  const variables = doc.variables ?? {};
  const referenced = findTemplateVariables(doc);

  const entries = Object.entries(variables).map(([name, variable]) => ({
    name,
    type: variable.type,
    description: variable.description,
    default: variable.default,
    referenced: referenced.includes(name),
  }));

  const undeclared = referenced.filter(r => !variables[r]);

  return { variables: entries, undeclared };
}

/**
 * Format variable info for terminal output.
 */
function formatVariables(info: { variables: VariableInfo[]; undeclared: string[] }): string {
  if (info.variables.length === 0 && info.undeclared.length === 0) return "No variables declared or referenced.";

  const lines: string[] = [];

  if (info.variables.length > 0) {
    lines.push(`Variables: ${info.variables.length}`);
    for (const v of info.variables) {
      const desc = v.description ? ` — ${v.description}` : "";
      const def = v.default !== undefined ? ` [default: ${JSON.stringify(v.default)}]` : "";
      const ref = v.referenced ? "" : " (unused)";
      lines.push(`  - {{${v.name}}} (${v.type})${def}${desc}${ref}`);
    }
  }

  if (info.undeclared.length > 0) {
    lines.push(`Undeclared references: ${info.undeclared.length}`);
    for (const name of info.undeclared) {
      lines.push(`  - {{${name}}} (not declared in variables)`);
    }
  }

  return lines.join("\n");
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
 * Register the `variables` subcommand on the Commander program.
 */
export function variablesCommand(program: Command): void {
  program
    .command("variables <file>")
    .description("List all variables in an .atelier file with usage info")
    .action((file: string) => {
      const doc = readAndParse(file);
      const info = getVariables(doc);
      console.log(formatVariables(info));
    });
}
