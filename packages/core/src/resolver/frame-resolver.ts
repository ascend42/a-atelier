import type { AtelierDocument, Layer, Delta, AnimatableProperty } from "@a-company/atelier-types";
import { resolvePropertyAtFrame } from "./delta-resolver.js";

/** A resolved layer at a specific frame — all animated properties computed */
export interface ResolvedLayer {
  id: string;
  /** Original layer definition */
  layer: Layer;
  /** Computed property overrides from active deltas */
  computedProperties: Partial<Record<AnimatableProperty, unknown>>;
  /** Seconds into source video to seek to — only present for video visual layers */
  videoSourceTime?: number;
}

/** The resolved state of an entire document at a specific frame */
export interface ResolvedFrame {
  /** Frame number that was resolved */
  frame: number;
  /** State name that was resolved */
  stateName: string;
  /** All layers with their computed properties */
  layers: ResolvedLayer[];
}

/**
 * Resolve all layers at a given frame within a named state.
 * This is the main entry point for frame resolution.
 * @param overrideDeltas - Optional pre-merged deltas (used for hierarchical state resolution)
 */
export function resolveFrame(
  doc: AtelierDocument,
  stateName: string,
  frame: number,
  overrideDeltas?: Delta[],
): ResolvedFrame {
  const state = doc.states[stateName];
  if (!state) {
    throw new Error(`State "${stateName}" not found in document "${doc.name}"`);
  }

  // Group deltas by layer+property
  const deltasByLayerProperty = groupDeltas(overrideDeltas ?? state.deltas);

  // Resolve each layer
  const resolvedLayers: ResolvedLayer[] = doc.layers.map((layer) => {
    const computedProperties: Partial<Record<AnimatableProperty, unknown>> = {};

    // Find all animated properties for this layer
    const layerDeltas = deltasByLayerProperty.get(layer.id);
    if (layerDeltas) {
      for (const [property, deltas] of layerDeltas) {
        const value = resolvePropertyAtFrame(deltas, frame);
        if (value !== undefined) {
          computedProperties[property as AnimatableProperty] = value;
        }
      }
    }

    const resolvedLayer: ResolvedLayer = { id: layer.id, layer, computedProperties };

    if (layer.visual.type === "video") {
      const video = layer.visual;
      const fps = doc.canvas.fps;
      const startFrame = video.startFrame ?? 0;
      const sourceOffset = video.sourceOffset ?? 0;
      const playbackRate = video.playbackRate ?? 1.0;
      const relativeFrame = Math.max(0, frame - startFrame);
      const sourceTime = (relativeFrame / fps) * playbackRate + sourceOffset;
      resolvedLayer.videoSourceTime =
        video.sourceEnd !== undefined ? Math.min(sourceTime, video.sourceEnd) : sourceTime;
    }

    return resolvedLayer;
  });

  return { frame, stateName, layers: resolvedLayers };
}

/**
 * Group deltas by layer ID, then by property name.
 */
function groupDeltas(
  deltas: Delta[],
): Map<string, Map<string, Delta[]>> {
  const map = new Map<string, Map<string, Delta[]>>();

  for (const delta of deltas) {
    let layerMap = map.get(delta.layer);
    if (!layerMap) {
      layerMap = new Map();
      map.set(delta.layer, layerMap);
    }

    let propDeltas = layerMap.get(delta.property);
    if (!propDeltas) {
      propDeltas = [];
      layerMap.set(delta.property, propDeltas);
    }

    propDeltas.push(delta);
  }

  return map;
}
