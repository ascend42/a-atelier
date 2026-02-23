import type { AtelierDocument, Layer, Delta, State, UnitValue } from "@a-company/atelier-types";
import type { LottieLayer, LottieTransform, LottieTextData } from "./lottie-types.js";
import { mapShapeVisual } from "./map-shapes.js";
import { mapDeltasToAnimated, mapPositionDeltas } from "./map-keyframes.js";
import { colorToLottie } from "./map-colors.js";

/** Resolve a UnitValue to a plain number (percentages treated as 0 for Lottie) */
function toNum(v: UnitValue): number {
  return typeof v === "number" ? v : 0;
}

/** Map all layers in a document+state to Lottie layers */
export function mapLayers(
  doc: AtelierDocument,
  state: State,
  warnings: string[],
): LottieLayer[] {
  const layerIndexMap = new Map<string, number>();
  doc.layers.forEach((l, i) => layerIndexMap.set(l.id, i));

  return doc.layers.map((layer, index) => {
    const deltas = state.deltas.filter(d => d.layer === layer.id);
    return mapLayer(layer, index, deltas, layerIndexMap, doc, warnings);
  });
}

function mapLayer(
  layer: Layer,
  index: number,
  deltas: Delta[],
  layerIndexMap: Map<string, number>,
  doc: AtelierDocument,
  warnings: string[],
): LottieLayer {
  const duration = getMaxFrame(deltas, doc);

  const base: LottieLayer = {
    ty: getLayerType(layer),
    nm: layer.id,
    ind: index,
    ip: 0,
    op: duration,
    st: 0,
    ks: buildTransform(layer, deltas, warnings),
  };

  // Parent
  if (layer.parentId) {
    const parentIdx = layerIndexMap.get(layer.parentId);
    if (parentIdx !== undefined) {
      base.parent = parentIdx;
    }
  }

  // Blend mode
  if (layer.blendMode) {
    base.bm = mapBlendMode(layer.blendMode);
  }

  // Shape layer
  if (layer.visual.type === "shape") {
    base.shapes = mapShapeVisual(layer.visual, toNum(layer.bounds.width), toNum(layer.bounds.height));
  }

  // Text layer
  if (layer.visual.type === "text") {
    const color = colorToLottie(layer.visual.style.color);
    base.t = {
      d: {
        k: [{
          s: {
            s: layer.visual.style.fontSize,
            f: layer.visual.style.fontFamily,
            t: layer.visual.content,
            fc: color.slice(0, 3),
            j: layer.visual.style.textAlign === "center" ? 1 :
               layer.visual.style.textAlign === "right" ? 2 : 0,
          },
          t: 0,
        }],
      },
    } as LottieTextData;
  }

  // Image layer
  if (layer.visual.type === "image") {
    base.refId = layer.visual.assetId;
    base.w = toNum(layer.bounds.width);
    base.h = toNum(layer.bounds.height);

    if (layer.visual.spritesheet) {
      warnings.push(`Layer "${layer.id}": Spritesheet animation not supported in Lottie export`);
    }
    if (layer.visual.sourceRect) {
      warnings.push(`Layer "${layer.id}": sourceRect cropping not supported in Lottie export`);
    }
  }

  // Tint warning
  if (layer.tint && layer.tint.amount > 0) {
    warnings.push(`Layer "${layer.id}": Tint effect not supported in Lottie export`);
  }

  return base;
}

function getLayerType(layer: Layer): number {
  switch (layer.visual.type) {
    case "shape": return 4;
    case "text": return 5;
    case "image": return 2;
    case "group": return 3; // null layer
    case "ref": return 0; // precomp
    default: return 4;
  }
}

function buildTransform(
  layer: Layer,
  deltas: Delta[],
  warnings: string[],
): LottieTransform {
  // Group deltas by property
  const byProp = new Map<string, Delta[]>();
  for (const d of deltas) {
    if (!byProp.has(d.property)) byProp.set(d.property, []);
    byProp.get(d.property)!.push(d);
  }

  const xDeltas = byProp.get("frame.x") ?? [];
  const yDeltas = byProp.get("frame.y") ?? [];
  const opacityDeltas = byProp.get("opacity") ?? [];
  const rotationDeltas = byProp.get("rotation") ?? [];
  const scaleXDeltas = byProp.get("scale.x") ?? [];
  const scaleYDeltas = byProp.get("scale.y") ?? [];

  // Position
  const position = mapPositionDeltas(
    xDeltas, yDeltas,
    typeof layer.frame.x === "number" ? layer.frame.x : 0,
    typeof layer.frame.y === "number" ? layer.frame.y : 0,
    warnings,
  );

  // Opacity (Lottie uses 0–100)
  let opacity;
  if (opacityDeltas.length > 0) {
    const raw = mapDeltasToAnimated(opacityDeltas, "opacity", warnings);
    // Scale 0-1 to 0-100
    if (raw.a === 0) {
      opacity = { a: 0 as const, k: (raw.k as number) * 100 };
    } else {
      const kfs = (raw.k as Array<{ t: number; s: [number]; e?: [number]; [key: string]: unknown }>).map(kf => ({
        ...kf,
        s: [kf.s[0] * 100] as [number],
        e: kf.e ? [kf.e[0] * 100] as [number] : undefined,
      }));
      opacity = { a: 1 as const, k: kfs };
    }
  } else {
    opacity = { a: 0 as const, k: (layer.opacity ?? 1) * 100 };
  }

  // Rotation
  const rotation = rotationDeltas.length > 0
    ? mapDeltasToAnimated(rotationDeltas, "rotation", warnings)
    : { a: 0 as const, k: layer.rotation ?? 0 };

  // Scale (Lottie uses 0–100)
  const baseScaleX = (layer.scale?.x ?? 1) * 100;
  const baseScaleY = (layer.scale?.y ?? 1) * 100;
  let scale;
  if (scaleXDeltas.length > 0 || scaleYDeltas.length > 0) {
    // Simplified: use x deltas for now
    scale = { a: 0 as const, k: [baseScaleX, baseScaleY, 100] };
    if (scaleXDeltas.length > 0 || scaleYDeltas.length > 0) {
      warnings.push("Scale animation partially mapped to Lottie");
    }
  } else {
    scale = { a: 0 as const, k: [baseScaleX, baseScaleY, 100] };
  }

  // Anchor point
  const ax = (layer.anchorPoint?.x ?? 0) * toNum(layer.bounds.width);
  const ay = (layer.anchorPoint?.y ?? 0) * toNum(layer.bounds.height);

  return {
    o: opacity,
    r: rotation,
    p: position,
    a: { a: 0, k: [ax, ay, 0] },
    s: scale,
  };
}

function getMaxFrame(deltas: Delta[], doc: AtelierDocument): number {
  let max = 0;
  for (const state of Object.values(doc.states)) {
    if (state.duration > max) max = state.duration;
  }
  for (const d of deltas) {
    if (d.range[1] > max) max = d.range[1];
  }
  return max || 60;
}

function mapBlendMode(mode: string): number {
  const map: Record<string, number> = {
    normal: 0, multiply: 1, screen: 2, overlay: 3,
    darken: 4, lighten: 5, "color-dodge": 6, "color-burn": 7,
    "hard-light": 8, "soft-light": 9, difference: 10, exclusion: 11,
    hue: 12, saturation: 13, color: 14, luminosity: 15,
  };
  return map[mode] ?? 0;
}
