import type { AtelierDocument, Layer, Delta, AnimatableProperty, VideoVisual } from "@a-company/atelier-types";
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

  // Pre-compute the nearest ancestor video-clip startFrame for every layer.
  // v1.0 multi-clip: captions parented to a clip (parentId = clip-layer-id)
  // author their deltas in clip-local frames (0..clipDuration). The renderer
  // shifts the evaluation frame by the parent clip's startFrame so the deltas
  // fire when the clip is actually playing on the composition timeline. This
  // is what makes "move a clip and its captions go with it" work.
  const ancestorClipStartFrame = computeAncestorClipStartFrames(doc);

  // Resolve each layer
  const resolvedLayers: ResolvedLayer[] = doc.layers.map((layer) => {
    const computedProperties: Partial<Record<AnimatableProperty, unknown>> = {};

    // Find all animated properties for this layer
    const layerDeltas = deltasByLayerProperty.get(layer.id);
    if (layerDeltas) {
      // Clip-local time = composition frame - nearest ancestor video startFrame.
      // For layers with no video ancestor, the offset is 0 (no shift).
      const offset = ancestorClipStartFrame.get(layer.id) ?? 0;
      const localFrame = frame - offset;
      for (const [property, deltas] of layerDeltas) {
        const value = resolvePropertyAtFrame(deltas, localFrame);
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
 * For each layer in the document, walk the parentId chain looking for the
 * nearest ancestor whose visual is a VideoVisual; return that ancestor's
 * `startFrame` (or 0 if no video ancestor exists). The result is a
 * layer-id → offset map used to shift delta evaluation into clip-local time.
 *
 * Note: this resolves only on a video clip ancestor, not on Group or other
 * layer types. A Group used as a "track" doesn't shift child time — only the
 * clip itself does. This keeps non-clip parenting (groups for positioning,
 * masks, etc.) decoupled from the timeline-shift behavior.
 *
 * Cycle-safe via a visited set; a malformed doc with parentId cycles falls
 * back to offset 0 for affected layers rather than looping.
 */
function computeAncestorClipStartFrames(doc: AtelierDocument): Map<string, number> {
  const byId = new Map<string, Layer>();
  for (const l of doc.layers) byId.set(l.id, l);

  const result = new Map<string, number>();
  for (const layer of doc.layers) {
    let cursor: Layer | undefined = byId.get(layer.parentId ?? "");
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      if (cursor.visual.type === "video") {
        const v = cursor.visual as VideoVisual;
        result.set(layer.id, v.startFrame ?? 0);
        break;
      }
      cursor = byId.get(cursor.parentId ?? "");
    }
  }
  return result;
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
