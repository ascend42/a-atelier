/**
 * Browser-side shared state types for the bottom timeline UI (TD-2026-05-28).
 *
 * The timeline is a READ-ONLY view of the active doc's `timeline` block in
 * v1.0 — click to select, no drag-to-reposition (that's v1.1). These types
 * model the selection + frame-conversion helpers shared between the
 * canvas-panel and the new TimelineView component.
 */

/** What's currently selected on the timeline, if anything. */
export interface TimelineSelection {
  /** Layer id of the selected clip — matches a layer in doc.layers. */
  layerId: string;
  /** Track id the clip belongs to (e.g. "track-video-1"). */
  trackId: string;
}

/** Convert a composition frame to a horizontal pixel offset in the timeline. */
export function frameToPixel(frame: number, totalFrames: number, widthPx: number): number {
  if (totalFrames <= 0) return 0;
  return Math.max(0, Math.min(widthPx, (frame / totalFrames) * widthPx));
}

/** Inverse — convert a pixel offset back to a composition frame. */
export function pixelToFrame(px: number, totalFrames: number, widthPx: number): number {
  if (widthPx <= 0) return 0;
  return Math.max(0, Math.min(totalFrames, Math.round((px / widthPx) * totalFrames)));
}
