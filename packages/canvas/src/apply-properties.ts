import type { Layer } from "@atelier/types";
import type { ResolvedLayer } from "@atelier/core";

/**
 * Effective values for a layer at a given frame,
 * with computed properties merged over defaults.
 */
export interface EffectiveLayer {
  /** Original layer */
  layer: Layer;
  /** Effective frame position (may be animated) */
  x: number;
  y: number;
  /** Effective bounds */
  width: number;
  height: number;
  /** Effective transform values */
  opacity: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
}

/**
 * Resolve a UnitValue to pixels. Percentages resolve against a reference dimension.
 */
function resolveUnit(value: number | string, reference: number): number {
  if (typeof value === "string" && value.endsWith("%")) {
    return (parseFloat(value) / 100) * reference;
  }
  return value as number;
}

/**
 * Build the effective layer values by merging computed properties over layer defaults.
 * @param resolved - The resolved layer from frame resolution
 * @param parentWidth - Parent/canvas width for percentage resolution
 * @param parentHeight - Parent/canvas height for percentage resolution
 */
export function buildEffectiveLayer(
  resolved: ResolvedLayer,
  parentWidth: number,
  parentHeight: number,
): EffectiveLayer {
  const { layer, computedProperties } = resolved;
  const cp = computedProperties as Record<string, unknown>;

  return {
    layer,
    x: resolveUnit((cp["frame.x"] ?? layer.frame.x) as number | string, parentWidth),
    y: resolveUnit((cp["frame.y"] ?? layer.frame.y) as number | string, parentHeight),
    width: resolveUnit((cp["bounds.width"] ?? layer.bounds.width) as number | string, parentWidth),
    height: resolveUnit((cp["bounds.height"] ?? layer.bounds.height) as number | string, parentHeight),
    opacity: (cp["opacity"] as number) ?? layer.opacity ?? 1,
    rotation: (cp["rotation"] as number) ?? layer.rotation ?? 0,
    scaleX: (cp["scale.x"] as number) ?? layer.scale?.x ?? 1,
    scaleY: (cp["scale.y"] as number) ?? layer.scale?.y ?? 1,
    anchorX: (cp["anchorPoint.x"] as number) ?? layer.anchorPoint?.x ?? 0,
    anchorY: (cp["anchorPoint.y"] as number) ?? layer.anchorPoint?.y ?? 0,
  };
}
