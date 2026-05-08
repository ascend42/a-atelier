import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { VideoVisual } from "@a-company/atelier-types";
import { parseAtelier, validateVideoLayer } from "@a-company/atelier-schema";
import { validateAllDeltas } from "@a-company/atelier-core";

export interface GateResult {
  gate: string;
  pass: boolean;
  errors: string[];
}

export interface LintResult {
  file: string;
  valid: boolean;
  gates: GateResult[];
}

/**
 * Run all gates against a single .atelier file.
 * Gates checked:
 *   ^valid-document  — Zod schema conformance
 *   ^valid-delta     — no overlapping deltas on same layer+property
 *   ^valid-video-layer — semantic video layer constraints
 */
export function lintFile(filePath: string): LintResult {
  const absPath = resolve(filePath);

  let content: string;
  try {
    content = readFileSync(absPath, "utf-8");
  } catch {
    return {
      file: absPath,
      valid: false,
      gates: [
        {
          gate: "^valid-document",
          pass: false,
          errors: [`Cannot read file: ${absPath}`],
        },
      ],
    };
  }

  const gates: GateResult[] = [];

  // ── Gate 1: ^valid-document ──────────────────────────────────
  const parseResult = parseAtelier(content);
  if (!parseResult.success) {
    gates.push({
      gate: "^valid-document",
      pass: false,
      errors: parseResult.errors.map((e) => `${e.path}: ${e.message}`),
    });
    // Can't run further gates without a valid document
    return { file: absPath, valid: false, gates };
  }

  gates.push({ gate: "^valid-document", pass: true, errors: [] });
  const doc = parseResult.data;

  // ── Gate 2: ^valid-delta ─────────────────────────────────────
  const deltaErrors: string[] = [];
  for (const [stateName, state] of Object.entries(doc.states)) {
    const overlaps = validateAllDeltas(state.deltas);
    for (const overlap of overlaps) {
      deltaErrors.push(`State "${stateName}": ${overlap.message}`);
    }
  }
  gates.push({
    gate: "^valid-delta",
    pass: deltaErrors.length === 0,
    errors: deltaErrors,
  });

  // ── Gate 3: ^valid-video-layer ───────────────────────────────
  const videoErrors: string[] = [];
  for (const layer of doc.layers) {
    if (layer.visual.type !== "video") continue;
    const visual = layer.visual as VideoVisual;
    const duration = doc.assets?.[visual.assetId]?.videoMeta?.duration;
    const result = validateVideoLayer(visual, duration);
    if (!result.success) {
      for (const err of result.errors) {
        videoErrors.push(`Layer "${layer.id}" (${err.path}): ${err.message}`);
      }
    }
  }
  gates.push({
    gate: "^valid-video-layer",
    pass: videoErrors.length === 0,
    errors: videoErrors,
  });

  const valid = gates.every((g) => g.pass);
  return { file: absPath, valid, gates };
}

/** Format a LintResult for terminal output */
function formatResult(result: LintResult): string {
  const lines: string[] = [];
  const status = result.valid ? "PASS" : "FAIL";
  lines.push(`${status}  ${result.file}`);

  for (const gate of result.gates) {
    const gateStatus = gate.pass ? "  ✓" : "  ✗";
    lines.push(`${gateStatus} ${gate.gate}`);
    for (const err of gate.errors) {
      lines.push(`       ${err}`);
    }
  }

  return lines.join("\n");
}

/**
 * Register the `lint` subcommand on the Commander program.
 */
export function lintCommand(program: Command): void {
  program
    .command("lint <files...>")
    .description(
      "Lint .atelier files against all gates (^valid-document, ^valid-delta, ^valid-video-layer)",
    )
    .option("--json", "Output results as JSON array")
    .action((files: string[], opts: { json?: boolean }) => {
      const results = files.map(lintFile);

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        for (const result of results) {
          console.log(formatResult(result));
        }
      }

      const allValid = results.every((r) => r.valid);
      if (!allValid) process.exit(1);
    });
}
