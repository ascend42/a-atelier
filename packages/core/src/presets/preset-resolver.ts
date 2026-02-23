import type { Preset, Delta, FrameRange } from "@a-company/atelier-types";

/**
 * Expand a preset into concrete deltas for a specific layer and start frame.
 *
 * @param preset - The preset to expand
 * @param layerId - Target layer ID
 * @param startFrame - Frame to start the preset from
 * @param duration - Total duration to map preset offsets into
 */
export function expandPreset(
  preset: Preset,
  layerId: string,
  startFrame: number,
  duration: number,
): Delta[] {
  return preset.deltas.map((pd, index) => {
    let range: FrameRange;
    if (pd.offset) {
      range = [startFrame + pd.offset[0], startFrame + pd.offset[1]];
    } else {
      range = [startFrame, startFrame + duration];
    }

    return {
      id: `preset-${layerId}-${index}`,
      layer: layerId,
      property: pd.property,
      range,
      from: pd.from,
      to: pd.to,
      easing: pd.easing,
    };
  });
}
