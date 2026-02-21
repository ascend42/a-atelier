import type { AtelierDocument, State } from "@atelier/types";

/** Check for unsupported features and collect warnings */
export function collectUnsupportedWarnings(doc: AtelierDocument, state: State): string[] {
  const warnings: string[] = [];

  // Audio not supported
  if (state.audio) {
    warnings.push("Audio tracks are not supported in Lottie format and will be dropped");
  }

  // Expressions not supported
  for (const delta of state.deltas) {
    if (isExpression(delta.from) || isExpression(delta.to)) {
      warnings.push(`Expression values on "${delta.layer}.${delta.property}" not supported in Lottie`);
    }
  }

  // Shadow not supported in base Lottie
  for (const layer of doc.layers) {
    if (layer.shadow) {
      warnings.push(`Shadow on layer "${layer.id}" is not supported in base Lottie format`);
    }
  }

  // Motion path not directly mapped
  for (const layer of doc.layers) {
    if (layer.motionPath) {
      warnings.push(`Motion path on layer "${layer.id}" is not directly mappable to Lottie`);
    }
  }

  // Clip paths have limited support
  for (const layer of doc.layers) {
    if (layer.clipPath) {
      warnings.push(`Clip path on layer "${layer.id}" mapped as Lottie mask (partial support)`);
    }
  }

  // States/transitions
  if (Object.keys(doc.states).length > 1) {
    warnings.push("Multiple states flattened to single timeline in Lottie export");
  }

  return warnings;
}

function isExpression(val: unknown): boolean {
  return typeof val === "object" && val !== null && "expr" in val;
}
