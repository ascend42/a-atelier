import type { AtelierDocument, ImageVisual } from "@atelier/types";
import type { ResolvedFrame } from "@atelier/core";
import type { RenderContext } from "./canvas-types.js";
import { buildEffectiveLayer, type EffectiveLayer } from "./apply-properties.js";
import { renderShape } from "./renderers/shape-renderer.js";
import { renderText } from "./renderers/text-renderer.js";
import { renderImage } from "./renderers/image-renderer.js";
import { renderRef } from "./renderers/ref-renderer.js";
import type { ImageCache } from "./image-cache.js";

/**
 * Render a resolved frame to a Canvas 2D context.
 * Clears the canvas and draws all visible layers in order.
 */
export function renderFrame(
  ctx: RenderContext,
  resolvedFrame: ResolvedFrame,
  doc: AtelierDocument,
  imageCache?: ImageCache,
): void {
  const { width, height } = doc.canvas;

  // Clear canvas
  ctx.fillStyle = doc.canvas.background ?? "transparent";
  ctx.fillRect(0, 0, width, height);

  // Build effective layers into a map for ancestor transform lookups
  const effMap = new Map<string, EffectiveLayer>();
  const effList: EffectiveLayer[] = [];

  for (const resolvedLayer of resolvedFrame.layers) {
    const eff = buildEffectiveLayer(resolvedLayer, width, height);
    effMap.set(resolvedLayer.layer.id, eff);
    effList.push(eff);
  }

  // Render each layer in order (painters algorithm — first = back)
  for (const eff of effList) {
    const { layer } = eff;

    // Skip invisible layers
    if (layer.visible === false) continue;

    // Skip fully transparent layers
    if (eff.opacity <= 0) continue;

    // Resolve assetId → src for image visuals
    if (layer.visual.type === "image") {
      const iv = eff.visual as ImageVisual;
      if (!iv.src && iv.assetId && doc.assets?.[iv.assetId]) {
        iv.src = doc.assets[iv.assetId].src;
      }
    }

    ctx.save();

    // Apply ancestor transforms (group/parent inheritance)
    applyAncestorTransforms(ctx, layer.id, effMap, doc);

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

    // Apply shadow if present
    if (eff.shadow) {
      ctx.shadowColor = eff.shadow.color;
      ctx.shadowBlur = eff.shadow.blur;
      ctx.shadowOffsetX = eff.shadow.offsetX;
      ctx.shadowOffsetY = eff.shadow.offsetY;
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
        if (imageCache) renderImage(ctx, eff, imageCache);
        break;
      case "group":
        // Groups are structural containers — no visual output
        break;
      case "ref":
        renderRef(ctx, eff);
        break;
    }

    ctx.restore();
  }
}

/**
 * Walk the parentId chain and apply each ancestor's transforms.
 * This makes child layers inherit parent position/rotation/scale.
 */
function applyAncestorTransforms(
  ctx: RenderContext,
  layerId: string,
  effMap: Map<string, EffectiveLayer>,
  doc: AtelierDocument,
): void {
  // Collect ancestor chain (excluding self)
  const chain: EffectiveLayer[] = [];
  const layer = doc.layers.find((l) => l.id === layerId);
  let parentId = layer?.parentId;
  const visited = new Set<string>();

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parentEff = effMap.get(parentId);
    if (!parentEff) break;
    chain.push(parentEff);
    parentId = parentEff.layer.parentId;
  }

  // Apply from root ancestor down to direct parent
  for (let i = chain.length - 1; i >= 0; i--) {
    const p = chain[i];
    ctx.translate(p.x, p.y);

    const ax = p.anchorX * p.width;
    const ay = p.anchorY * p.height;

    if (p.rotation !== 0 || p.scaleX !== 1 || p.scaleY !== 1) {
      ctx.translate(ax, ay);
      if (p.rotation !== 0) ctx.rotate((p.rotation * Math.PI) / 180);
      if (p.scaleX !== 1 || p.scaleY !== 1) ctx.scale(p.scaleX, p.scaleY);
      ctx.translate(-ax, -ay);
    }
  }
}
