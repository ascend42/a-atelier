import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import type { AtelierDocument, ImageVisual, VideoVisual, AudioVisual } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

/**
 * Asset summary entry. v1.0: `usedByStates` removed — audio is no longer
 * state-scoped (it's an AudioVisual layer), so layer-only tracking is now
 * the complete picture.
 */
export interface AssetInfo {
  assetId: string;
  type: string;
  src: string;
  description?: string;
  usedByLayers: string[];
}

/**
 * Extract asset info from a parsed AtelierDocument.
 *
 * Walks all layers (image, video, audio) for assetId references. Pre-v1
 * docs that still carry `state.audio` are silently migrated by the parser
 * (audio field stripped); no per-state asset usage is tracked.
 */
export function getAssets(doc: AtelierDocument): AssetInfo[] {
  const assets = doc.assets ?? {};
  return Object.entries(assets).map(([assetId, asset]) => {
    const usedByLayers = doc.layers
      .filter(l => {
        const v = l.visual as ImageVisual | VideoVisual | AudioVisual | { type: string; assetId?: string };
        return (
          (v.type === "image" || v.type === "video" || v.type === "audio") &&
          "assetId" in v && v.assetId === assetId
        );
      })
      .map(l => l.id);

    return {
      assetId,
      type: asset.type,
      src: asset.src,
      description: asset.description,
      usedByLayers,
    };
  });
}

/**
 * Format asset info for terminal output.
 */
function formatAssets(assets: AssetInfo[]): string {
  if (assets.length === 0) return "No assets registered.";

  const lines: string[] = [`Assets: ${assets.length}`];
  for (const a of assets) {
    const desc = a.description ? ` — ${a.description}` : "";
    lines.push(`  - ${a.assetId} (${a.type}): ${a.src}${desc}`);
    if (a.usedByLayers.length > 0) {
      lines.push(`    Layers: ${a.usedByLayers.join(", ")}`);
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
 * Register the `assets` subcommand on the Commander program.
 */
export function assetsCommand(program: Command): void {
  program
    .command("assets <file>")
    .description("List all assets in an .atelier file with usage info")
    .action((file: string) => {
      const doc = readAndParse(file);
      const assets = getAssets(doc);
      console.log(formatAssets(assets));
    });
}
