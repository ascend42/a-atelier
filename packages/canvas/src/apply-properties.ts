import type { Layer, Visual, ShapeVisual, TextVisual, Color } from "@atelier/types";
import { colorToCSS } from "./styles.js";
import type { ResolvedLayer } from "@atelier/core";

/**
 * Effective values for a layer at a given frame,
 * with computed properties merged over defaults.
 */
export interface EffectiveLayer {
  /** Original layer */
  layer: Layer;
  /** Visual with animated property overrides applied */
  visual: Visual;
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
  /** Resolved shadow (if layer has shadow or shadow is animated) */
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
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

  const hasShadow = layer.shadow || cp["shadow.blur"] !== undefined || cp["shadow.color"] !== undefined;

  return {
    layer,
    visual: buildEffectiveVisual(layer.visual, cp),
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
    shadow: hasShadow ? {
      color: colorToCSS((cp["shadow.color"] ?? layer.shadow?.color ?? "#00000080") as Color),
      blur: (cp["shadow.blur"] as number) ?? layer.shadow?.blur ?? 0,
      offsetX: (cp["shadow.offsetX"] as number) ?? layer.shadow?.offsetX ?? 0,
      offsetY: (cp["shadow.offsetY"] as number) ?? layer.shadow?.offsetY ?? 0,
    } : undefined,
  };
}

/**
 * Build an effective visual by applying computed property overrides.
 * Returns the original visual if no visual properties are animated.
 */
function buildEffectiveVisual(visual: Visual, cp: Record<string, unknown>): Visual {
  const hasVisualOverride =
    cp["visual.fill.color"] !== undefined ||
    cp["visual.stroke.color"] !== undefined ||
    cp["visual.stroke.width"] !== undefined ||
    cp["visual.stroke.start"] !== undefined ||
    cp["visual.stroke.end"] !== undefined ||
    cp["visual.shape.cornerRadius"] !== undefined ||
    cp["visual.style.fontSize"] !== undefined ||
    cp["visual.style.color"] !== undefined;

  if (!hasVisualOverride) return visual;

  if (visual.type === "shape") {
    const v: ShapeVisual = { ...visual };

    if (cp["visual.shape.cornerRadius"] !== undefined && v.shape.type === "rect") {
      v.shape = { ...v.shape, cornerRadius: cp["visual.shape.cornerRadius"] as number };
    }

    if (v.fill && cp["visual.fill.color"] !== undefined) {
      v.fill = v.fill.type === "solid"
        ? { ...v.fill, color: cp["visual.fill.color"] as string }
        : v.fill;
    }

    if (v.stroke) {
      const strokeColor = cp["visual.stroke.color"] ?? v.stroke.color;
      const strokeWidth = (cp["visual.stroke.width"] as number) ?? v.stroke.width;
      const strokeStart = (cp["visual.stroke.start"] as number | undefined) ?? v.stroke.strokeStart;
      const strokeEnd = (cp["visual.stroke.end"] as number | undefined) ?? v.stroke.strokeEnd;
      if (
        strokeColor !== v.stroke.color ||
        strokeWidth !== v.stroke.width ||
        strokeStart !== v.stroke.strokeStart ||
        strokeEnd !== v.stroke.strokeEnd
      ) {
        v.stroke = {
          ...v.stroke,
          color: strokeColor as string,
          width: strokeWidth,
          strokeStart,
          strokeEnd,
        };
      }
    }

    return v;
  }

  if (visual.type === "text") {
    const v: TextVisual = { ...visual };
    const fontSize = (cp["visual.style.fontSize"] as number) ?? v.style.fontSize;
    const color = cp["visual.style.color"] ?? v.style.color;
    if (fontSize !== v.style.fontSize || color !== v.style.color) {
      v.style = { ...v.style, fontSize, color: color as string };
    }
    return v;
  }

  return visual;
}
