import type { Delta, FrameRange } from "@atelier/types";

export interface OverlapError {
  layerId: string;
  property: string;
  existingRange: FrameRange;
  newRange: FrameRange;
  message: string;
}

/**
 * Check if two frame ranges overlap.
 */
export function rangesOverlap(a: FrameRange, b: FrameRange): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * Validate that a new delta doesn't overlap with existing deltas
 * on the same layer+property.
 */
export function validateNoOverlap(
  existing: Delta[],
  newDelta: Delta,
): OverlapError | null {
  for (const delta of existing) {
    if (
      delta.layer === newDelta.layer &&
      delta.property === newDelta.property &&
      rangesOverlap(delta.range, newDelta.range)
    ) {
      return {
        layerId: newDelta.layer,
        property: newDelta.property,
        existingRange: delta.range,
        newRange: newDelta.range,
        message: `Overlapping delta on layer "${newDelta.layer}" property "${newDelta.property}": ` +
          `existing [${delta.range[0]}-${delta.range[1]}] overlaps with new [${newDelta.range[0]}-${newDelta.range[1]}]`,
      };
    }
  }
  return null;
}

/**
 * Validate all deltas in a state have no overlaps.
 * Returns all overlap errors found.
 */
export function validateAllDeltas(deltas: Delta[]): OverlapError[] {
  const errors: OverlapError[] = [];

  for (let i = 0; i < deltas.length; i++) {
    for (let j = i + 1; j < deltas.length; j++) {
      const a = deltas[i];
      const b = deltas[j];

      if (
        a.layer === b.layer &&
        a.property === b.property &&
        rangesOverlap(a.range, b.range)
      ) {
        errors.push({
          layerId: a.layer,
          property: a.property,
          existingRange: a.range,
          newRange: b.range,
          message: `Overlapping deltas on layer "${a.layer}" property "${a.property}": ` +
            `[${a.range[0]}-${a.range[1]}] overlaps with [${b.range[0]}-${b.range[1]}]`,
        });
      }
    }
  }

  return errors;
}
