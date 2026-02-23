import type { Layer, Visual, ShapeVisual, TextVisual, ImageVisual, Color, BlendMode, LinearGradientFill, RadialGradientFill } from "@atelier/types";
import { colorToCSS } from "./styles.js";
import { evaluatePathAtProgress } from "@atelier/math";
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
  /** Blend mode for compositing */
  blendMode: string;
  /** Motion path auto-rotation in degrees (applied additively to rotation) */
  motionPathAngle: number;
  /** Whether this layer is visible (may be animated) */
  visible: boolean;
  /** Color tint overlay */
  tint?: {
    color: string;
    amount: number;
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
  const hasTint = layer.tint || cp["tint.amount"] !== undefined || cp["tint.color"] !== undefined;

  // Resolve base position
  let x = resolveUnit((cp["frame.x"] ?? layer.frame.x) as number | string, parentWidth);
  let y = resolveUnit((cp["frame.y"] ?? layer.frame.y) as number | string, parentHeight);
  let motionPathAngle = 0;

  // Motion path overrides position when progress is animated
  const motionProgress = cp["motionPath.progress"] as number | undefined;
  if (motionProgress !== undefined && layer.motionPath && layer.motionPath.points.length >= 2) {
    const pos = evaluatePathAtProgress(layer.motionPath.points, motionProgress, layer.motionPath.closed);
    x = pos.x;
    y = pos.y;
    if (layer.motionPath.autoRotate) {
      motionPathAngle = pos.angle + (layer.motionPath.autoRotateOffset ?? 0);
    }
  }

  return {
    layer,
    visual: buildEffectiveVisual(layer.visual, cp),
    x,
    y,
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
    blendMode: (layer.blendMode as BlendMode) ?? "normal",
    motionPathAngle,
    visible: (cp["visible"] as boolean) ?? layer.visible ?? true,
    tint: hasTint ? {
      color: colorToCSS((cp["tint.color"] ?? layer.tint?.color ?? "#FF0000") as Color),
      amount: (cp["tint.amount"] as number) ?? layer.tint?.amount ?? 0,
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
    cp["visual.fill.angle"] !== undefined ||
    cp["visual.fill.center.x"] !== undefined ||
    cp["visual.fill.center.y"] !== undefined ||
    cp["visual.fill.radius"] !== undefined ||
    cp["visual.stroke.color"] !== undefined ||
    cp["visual.stroke.width"] !== undefined ||
    cp["visual.stroke.start"] !== undefined ||
    cp["visual.stroke.end"] !== undefined ||
    cp["visual.shape.cornerRadius"] !== undefined ||
    cp["visual.style.fontSize"] !== undefined ||
    cp["visual.style.color"] !== undefined;

  const hasImageOverride =
    cp["visual.image.sourceRect.x"] !== undefined ||
    cp["visual.image.sourceRect.y"] !== undefined ||
    cp["visual.image.sourceRect.width"] !== undefined ||
    cp["visual.image.sourceRect.height"] !== undefined ||
    cp["visual.image.frameIndex"] !== undefined;

  if (!hasVisualOverride && !hasImageOverride) return visual;

  if (visual.type === "shape") {
    const v: ShapeVisual = { ...visual };

    if (cp["visual.shape.cornerRadius"] !== undefined && v.shape.type === "rect") {
      v.shape = { ...v.shape, cornerRadius: cp["visual.shape.cornerRadius"] as number };
    }

    if (v.fill) {
      if (cp["visual.fill.color"] !== undefined && v.fill.type === "solid") {
        v.fill = { ...v.fill, color: cp["visual.fill.color"] as string };
      }
      if (cp["visual.fill.angle"] !== undefined && v.fill.type === "linear-gradient") {
        v.fill = { ...v.fill, angle: cp["visual.fill.angle"] as number } as LinearGradientFill;
      }
      if (v.fill.type === "radial-gradient") {
        const cx = cp["visual.fill.center.x"];
        const cy = cp["visual.fill.center.y"];
        const r = cp["visual.fill.radius"];
        if (cx !== undefined || cy !== undefined || r !== undefined) {
          const f = v.fill as RadialGradientFill;
          v.fill = {
            ...f,
            center: {
              x: cx !== undefined ? (cx as number) : f.center.x,
              y: cy !== undefined ? (cy as number) : f.center.y,
            },
            radius: r !== undefined ? (r as number) : f.radius,
          } as RadialGradientFill;
        }
      }
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

  if (visual.type === "image" && hasImageOverride) {
    const v: ImageVisual = { ...visual };

    // Merge animated sourceRect fields
    if (
      cp["visual.image.sourceRect.x"] !== undefined ||
      cp["visual.image.sourceRect.y"] !== undefined ||
      cp["visual.image.sourceRect.width"] !== undefined ||
      cp["visual.image.sourceRect.height"] !== undefined
    ) {
      const base = v.sourceRect ?? { x: 0, y: 0, width: 0, height: 0 };
      v.sourceRect = {
        x: (cp["visual.image.sourceRect.x"] as number) ?? base.x,
        y: (cp["visual.image.sourceRect.y"] as number) ?? base.y,
        width: (cp["visual.image.sourceRect.width"] as number) ?? base.width,
        height: (cp["visual.image.sourceRect.height"] as number) ?? base.height,
      };
    }

    // Merge animated frameIndex
    if (cp["visual.image.frameIndex"] !== undefined) {
      v.frameIndex = Math.floor(cp["visual.image.frameIndex"] as number);
    }

    return v;
  }

  return visual;
}
