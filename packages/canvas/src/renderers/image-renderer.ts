import type { ImageVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import type { ImageCache } from "../image-cache.js";

/**
 * Render an image layer to the canvas.
 * Supports sourceRect cropping and spritesheet grid animation.
 * If the image hasn't loaded yet, triggers a cache load and returns
 * (the image will appear on the next re-render).
 */
export function renderImage(ctx: RenderContext, eff: EffectiveLayer, imageCache: ImageCache): void {
  const visual = eff.visual as ImageVisual;
  const src = visual.src;
  if (!src) return;

  const img = imageCache.get(src);
  if (!img) {
    imageCache.load(src);
    return;
  }

  // Spritesheet grid computation takes precedence over manual sourceRect
  if (visual.spritesheet) {
    const { columns, rows, frameWidth, frameHeight, frameCount } = visual.spritesheet;
    const maxFrames = frameCount ?? (columns * rows);
    const idx = Math.max(0, Math.min(Math.floor(visual.frameIndex ?? 0), maxFrames - 1));
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const sx = col * frameWidth;
    const sy = row * frameHeight;
    (ctx.drawImage as Function)(img, sx, sy, frameWidth, frameHeight, 0, 0, eff.width, eff.height);
    return;
  }

  // Manual sourceRect crop
  if (visual.sourceRect) {
    const sr = visual.sourceRect;
    (ctx.drawImage as Function)(img, sr.x, sr.y, sr.width, sr.height, 0, 0, eff.width, eff.height);
    return;
  }

  // Default: draw full image to bounds
  ctx.drawImage(img, 0, 0, eff.width, eff.height);
}
