import type { AtelierDocument } from "@atelier/types";
import type { ResolvedFrame } from "@atelier/core";
import type { RenderContext } from "./canvas-types.js";
import { buildEffectiveLayer } from "./apply-properties.js";
import { renderShape } from "./renderers/shape-renderer.js";
import { renderText } from "./renderers/text-renderer.js";

/**
 * Render a resolved frame to a Canvas 2D context.
 * Clears the canvas and draws all visible layers in order.
 */
export function renderFrame(
  ctx: RenderContext,
  resolvedFrame: ResolvedFrame,
  doc: AtelierDocument,
): void {
  const { width, height } = doc.canvas;

  // Clear canvas
  ctx.fillStyle = doc.canvas.background ?? "transparent";
  ctx.fillRect(0, 0, width, height);

  // Render each layer in order (painters algorithm — first = back)
  for (const resolvedLayer of resolvedFrame.layers) {
    const { layer } = resolvedLayer;

    // Skip invisible layers
    if (layer.visible === false) continue;

    const eff = buildEffectiveLayer(resolvedLayer, width, height);

    // Skip fully transparent layers
    if (eff.opacity <= 0) continue;

    ctx.save();

    // Apply transforms
    ctx.globalAlpha = eff.opacity;
    ctx.translate(eff.x, eff.y);

    // Apply anchor-relative transforms
    const anchorPixelX = eff.anchorX * eff.width;
    const anchorPixelY = eff.anchorY * eff.height;

    if (eff.rotation !== 0 || eff.scaleX !== 1 || eff.scaleY !== 1) {
      ctx.translate(anchorPixelX, anchorPixelY);
      if (eff.rotation !== 0) {
        ctx.rotate((eff.rotation * Math.PI) / 180);
      }
      if (eff.scaleX !== 1 || eff.scaleY !== 1) {
        ctx.scale(eff.scaleX, eff.scaleY);
      }
      ctx.translate(-anchorPixelX, -anchorPixelY);
    }

    // Dispatch to type-specific renderer
    switch (layer.visual.type) {
      case "shape":
        renderShape(ctx, eff);
        break;
      case "text":
        renderText(ctx, eff);
        break;
      case "image":
        // Image rendering deferred — needs async asset loading
        break;
      case "group":
        // Groups are structural — children render via parentId (future)
        break;
      case "ref":
        // Ref rendering deferred — needs sub-document loading
        break;
    }

    ctx.restore();
  }
}
