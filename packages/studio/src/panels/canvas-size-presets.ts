/**
 * Canvas size presets shown in the toolbar dropdown.
 *
 * v1.0 ships a closed preset list. "Custom…" is a v1.1 follow-up (would
 * need a number-input dialog + bounds validation). Captions baked at
 * compose-time may need re-position after a size change — see the inline
 * warning at the dropdown's render site.
 */
export interface CanvasSizePreset {
  /** Display label, e.g. "Portrait 1080×1920". */
  label: string;
  width: number;
  height: number;
}

export const CANVAS_SIZE_PRESETS: readonly CanvasSizePreset[] = [
  { label: "Portrait 9:16 — 1080×1920", width: 1080, height: 1920 },
  { label: "Landscape 16:9 — 1920×1080", width: 1920, height: 1080 },
  { label: "Square 1:1 — 1080×1080", width: 1080, height: 1080 },
  { label: "Feed 4:5 — 1080×1350", width: 1080, height: 1350 },
];

/** Find the preset matching a width/height pair, or undefined if non-preset (custom). */
export function findPresetMatch(width: number, height: number): CanvasSizePreset | undefined {
  return CANVAS_SIZE_PRESETS.find((p) => p.width === width && p.height === height);
}
