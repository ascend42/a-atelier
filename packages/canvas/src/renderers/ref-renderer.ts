import type { AtelierDocument, RefVisual, ImageVisual } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import type { RenderContext, DocumentResolver } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import { buildEffectiveLayer } from "../apply-properties.js";
import { renderShape } from "./shape-renderer.js";
import { renderText } from "./text-renderer.js";
import { renderImage } from "./image-renderer.js";
import type { ImageCache } from "../image-cache.js";

export interface RefRenderOpts {
  documentResolver?: DocumentResolver;
  maxRefDepth?: number;
  imageCache?: ImageCache;
  /** Internal: tracks visited refs for cycle detection */
  _visitedRefs?: Set<string>;
  /** Internal: current recursion depth */
  _depth?: number;
}

/**
 * Render a ref layer. If a documentResolver is provided, resolves and renders
 * the sub-document inline. Otherwise falls back to a placeholder rectangle.
 */
export function renderRef(
  ctx: RenderContext,
  eff: EffectiveLayer,
  opts?: RefRenderOpts,
  _parentDoc?: AtelierDocument,
): void {
  const visual = eff.visual as RefVisual;
  const resolver = opts?.documentResolver;

  if (!resolver) {
    renderPlaceholder(ctx, eff, `REF: ${visual.src}`);
    return;
  }

  const depth = opts?._depth ?? 0;
  const maxDepth = opts?.maxRefDepth ?? 4;

  if (depth >= maxDepth) {
    renderPlaceholder(ctx, eff, "MAX DEPTH");
    return;
  }

  const visitedRefs = opts?._visitedRefs ?? new Set<string>();

  if (visitedRefs.has(visual.src)) {
    renderPlaceholder(ctx, eff, "CYCLE");
    return;
  }

  const subDoc = resolver(visual.src);
  if (!subDoc) {
    renderPlaceholder(ctx, eff, "NOT FOUND");
    return;
  }

  // Determine which state and frame to render
  const stateNames = Object.keys(subDoc.states);
  if (stateNames.length === 0) {
    renderPlaceholder(ctx, eff, "NO STATES");
    return;
  }

  const stateName = visual.state ?? stateNames[0];
  const stateObj = subDoc.states[stateName];
  if (!stateObj) {
    renderPlaceholder(ctx, eff, `STATE? ${stateName}`);
    return;
  }

  const maxFrame = Math.max(0, stateObj.duration - 1);
  const frame = Math.min(visual.frame ?? 0, maxFrame);

  // Resolve the sub-document frame
  const resolved = resolveFrame(subDoc, stateName, frame);

  // Mark as visited for cycle detection
  visitedRefs.add(visual.src);

  // Scale to fit eff bounds
  const scaleX = eff.width / subDoc.canvas.width;
  const scaleY = eff.height / subDoc.canvas.height;

  ctx.save();
  ctx.scale(scaleX, scaleY);

  // Build and render sub-doc layers
  const { width: subW, height: subH } = subDoc.canvas;

  for (const resolvedLayer of resolved.layers) {
    const subEff = buildEffectiveLayer(resolvedLayer, subW, subH);

    if (!subEff.visible) continue;
    if (subEff.opacity <= 0) continue;

    // Resolve asset for images
    if (resolvedLayer.layer.visual.type === "image") {
      const iv = subEff.visual as ImageVisual;
      if (!iv.src && iv.assetId && subDoc.assets?.[iv.assetId]) {
        iv.src = subDoc.assets[iv.assetId].src;
      }
    }

    ctx.save();
    ctx.globalAlpha = subEff.opacity;
    ctx.translate(subEff.x, subEff.y);

    switch (resolvedLayer.layer.visual.type) {
      case "shape":
        renderShape(ctx, subEff);
        break;
      case "text":
        renderText(ctx, subEff);
        break;
      case "image":
        if (opts?.imageCache) renderImage(ctx, subEff, opts.imageCache);
        break;
      case "ref":
        renderRef(ctx, subEff, {
          ...opts,
          _visitedRefs: visitedRefs,
          _depth: depth + 1,
        }, subDoc);
        break;
      case "group":
        break;
    }

    ctx.restore();
  }

  ctx.restore();

  // Remove from visited after rendering (allow same ref in different branches)
  visitedRefs.delete(visual.src);
}

/** Render a dashed placeholder rectangle with label */
function renderPlaceholder(ctx: RenderContext, eff: EffectiveLayer, label: string): void {
  const { width, height } = eff;

  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(0, 0, width, height);
  ctx.setLineDash([]);

  ctx.fillStyle = "#888888";
  ctx.font = `${Math.max(12, Math.min(16, height * 0.15))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2, width - 8);
}
