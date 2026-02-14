import type { ImageVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import type { ImageCache } from "../image-cache.js";

/**
 * Render an image layer to the canvas.
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
  ctx.drawImage(img, 0, 0, eff.width, eff.height);
}
