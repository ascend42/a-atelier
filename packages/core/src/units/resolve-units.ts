import type { UnitValue } from "@a-company/atelier-types";

/**
 * Check if a UnitValue is a percentage string.
 */
export function isPercentage(value: UnitValue): value is `${number}%` {
  return typeof value === "string" && value.endsWith("%");
}

/**
 * Parse a percentage string to its numeric value (0-100).
 */
export function parsePercentage(value: `${number}%`): number {
  return parseFloat(value);
}

/**
 * Resolve a UnitValue to pixels given a reference dimension.
 * Pixel values pass through unchanged.
 * Percentage values are computed relative to the reference.
 */
export function resolveUnit(value: UnitValue, reference: number): number {
  if (isPercentage(value)) {
    return (parsePercentage(value) / 100) * reference;
  }
  return value;
}
