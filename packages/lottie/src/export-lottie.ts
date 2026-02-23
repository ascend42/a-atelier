import type { AtelierDocument } from "@atelier/types";
import type { LottieAnimation, LottieAsset } from "./lottie-types.js";
import { mapLayers } from "./map-layers.js";
import { collectUnsupportedWarnings } from "./warnings.js";

export interface ExportLottieOptions {
  /** State to export (defaults to first state) */
  state?: string;
}

export interface ExportLottieResult {
  /** The Lottie JSON animation */
  json: LottieAnimation;
  /** Warnings about unsupported features */
  warnings: string[];
}

/**
 * Export an Atelier document to Lottie JSON format.
 * This is a lossy conversion — not all features are supported.
 */
export function exportToLottie(
  doc: AtelierDocument,
  opts?: ExportLottieOptions,
): ExportLottieResult {
  const stateNames = Object.keys(doc.states);
  if (stateNames.length === 0) {
    throw new Error("Document has no states to export");
  }

  const stateName = opts?.state ?? stateNames[0];
  const state = doc.states[stateName];
  if (!state) {
    throw new Error(`State "${stateName}" not found`);
  }

  const warnings: string[] = [];

  // Collect unsupported feature warnings
  warnings.push(...collectUnsupportedWarnings(doc, state));

  // Map layers
  const layers = mapLayers(doc, state, warnings);

  // Map assets
  const assets: LottieAsset[] = [];
  if (doc.assets) {
    for (const [id, asset] of Object.entries(doc.assets)) {
      if (asset.type === "image") {
        assets.push({
          id,
          w: 100,
          h: 100,
          p: asset.src,
          e: 0,
        });
      }
    }
  }

  const json: LottieAnimation = {
    v: "5.7.4",
    fr: doc.canvas.fps,
    ip: 0,
    op: state.duration,
    w: doc.canvas.width,
    h: doc.canvas.height,
    nm: doc.name,
    layers,
    ...(assets.length > 0 ? { assets } : {}),
  };

  // Deduplicate warnings
  const uniqueWarnings = [...new Set(warnings)];

  return { json, warnings: uniqueWarnings };
}
