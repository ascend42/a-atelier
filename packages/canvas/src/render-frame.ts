import type { AtelierDocument, ImageVisual, Shape } from "@atelier/types";
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

    // Apply blend mode
    if (eff.blendMode !== "normal") {
      ctx.globalCompositeOperation = blendModeToComposite(eff.blendMode);
    }

    ctx.translate(eff.x, eff.y);

    // Apply anchor-relative transforms
    const anchorPixelX = eff.anchorX * eff.width;
    const anchorPixelY = eff.anchorY * eff.height;

    // Combine explicit rotation with motion path auto-rotation
    const totalRotation = eff.rotation + eff.motionPathAngle;

    if (totalRotation !== 0 || eff.scaleX !== 1 || eff.scaleY !== 1) {
      ctx.translate(anchorPixelX, anchorPixelY);
      if (totalRotation !== 0) {
        ctx.rotate((totalRotation * Math.PI) / 180);
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

    // Apply clip path if present
    if (layer.clipPath) {
      applyClipPath(ctx, layer.clipPath, eff.width, eff.height);
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

/** Apply a shape as a clipping region */
function applyClipPath(ctx: RenderContext, shape: Shape, width: number, height: number): void {
  ctx.beginPath();
  switch (shape.type) {
    case "rect":
      if (shape.cornerRadius && ctx.roundRect) {
        ctx.roundRect(0, 0, width, height, shape.cornerRadius);
      } else {
        // Manual rect path for clipping (fillRect doesn't create a path)
        ctx.moveTo(0, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
      }
      break;
    case "ellipse":
      ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;
    case "path":
      if (shape.points.length >= 2) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          const prev = shape.points[i - 1];
          const curr = shape.points[i];
          if (prev.out && curr.in) {
            ctx.bezierCurveTo(
              prev.x + prev.out.x, prev.y + prev.out.y,
              curr.x + curr.in.x, curr.y + curr.in.y,
              curr.x, curr.y,
            );
          } else {
            ctx.lineTo(curr.x, curr.y);
          }
        }
        if (shape.closed) ctx.closePath();
      }
      break;
  }
  ctx.clip();
}

/** Map Atelier blend mode names to Canvas 2D globalCompositeOperation values */
function blendModeToComposite(mode: string): string {
  const map: Record<string, string> = {
    "multiply": "multiply",
    "screen": "screen",
    "overlay": "overlay",
    "darken": "darken",
    "lighten": "lighten",
    "color-dodge": "color-dodge",
    "color-burn": "color-burn",
    "hard-light": "hard-light",
    "soft-light": "soft-light",
    "difference": "difference",
    "exclusion": "exclusion",
    "hue": "hue",
    "saturation": "saturation",
    "color": "color",
    "luminosity": "luminosity",
  };
  return map[mode] ?? "source-over";
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
