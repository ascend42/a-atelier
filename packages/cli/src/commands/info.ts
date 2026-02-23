import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

/**
 * Info summary for an AtelierDocument.
 */
export interface DocumentInfo {
  name: string;
  description?: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    background?: string;
  };
  layers: {
    count: number;
    items: { id: string; type: string }[];
  };
  states: {
    count: number;
    items: { name: string; duration: number; deltaCount: number }[];
  };
  presets: {
    count: number;
  };
}

/**
 * Extract summary info from a parsed AtelierDocument.
 */
export function getInfo(doc: AtelierDocument): DocumentInfo {
  return {
    name: doc.name,
    description: doc.description,
    canvas: {
      width: doc.canvas.width,
      height: doc.canvas.height,
      fps: doc.canvas.fps,
      background: doc.canvas.background,
    },
    layers: {
      count: doc.layers.length,
      items: doc.layers.map((layer) => ({
        id: layer.id,
        type: layer.visual.type,
      })),
    },
    states: {
      count: Object.keys(doc.states).length,
      items: Object.entries(doc.states).map(([name, state]) => ({
        name,
        duration: state.duration,
        deltaCount: state.deltas.length,
      })),
    },
    presets: {
      count: doc.presets ? Object.keys(doc.presets).length : 0,
    },
  };
}

/**
 * Format a DocumentInfo for terminal output.
 */
function formatInfo(info: DocumentInfo): string {
  const lines: string[] = [];

  lines.push(`Name: ${info.name}`);
  if (info.description) {
    lines.push(`Description: ${info.description}`);
  }

  const bg = info.canvas.background
    ? `, background: ${info.canvas.background}`
    : "";
  lines.push(
    `Canvas: ${info.canvas.width}x${info.canvas.height} @ ${info.canvas.fps}fps${bg}`,
  );

  lines.push(`Layers: ${info.layers.count}`);
  for (const layer of info.layers.items) {
    lines.push(`  - ${layer.id} (${layer.type})`);
  }

  lines.push(`States: ${info.states.count}`);
  for (const state of info.states.items) {
    lines.push(
      `  - ${state.name}: ${state.duration} frames, ${state.deltaCount} deltas`,
    );
  }

  if (info.presets.count > 0) {
    lines.push(`Presets: ${info.presets.count}`);
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
 * Register the `info` subcommand on the Commander program.
 */
export function infoCommand(program: Command): void {
  program
    .command("info <file>")
    .description("Display summary info for an .atelier file")
    .action((file: string) => {
      const doc = readAndParse(file);
      const info = getInfo(doc);
      console.log(formatInfo(info));
    });
}
