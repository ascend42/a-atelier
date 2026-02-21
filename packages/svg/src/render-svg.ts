import type { AtelierDocument, ImageVisual } from "@atelier/types";
import { resolveFrame, type ResolvedFrame } from "@atelier/core";
import { buildEffectiveLayer, type EffectiveLayer } from "@atelier/canvas";
import { buildTransform, buildStyleAttrs } from "./svg-properties.js";
import { renderShapeSVG } from "./svg-shapes.js";
import { renderTextSVG } from "./svg-text.js";
import { buildShadowFilter, resetFilterCounter } from "./svg-filters.js";
import { resetGradientCounter } from "./svg-gradients.js";
import { buildClipPathDef, resetClipCounter } from "./svg-clip.js";
import { escapeXml } from "./svg-properties.js";

export interface RenderSVGOptions {
  /** Include XML declaration (default: false) */
  xmlDeclaration?: boolean;
  /** Include viewBox attribute (default: true) */
  viewBox?: boolean;
  /** Indent size in spaces (default: 2) */
  indent?: number;
}

/**
 * Render a resolved frame as an SVG string.
 * If no resolved frame is provided, resolves the given state and frame.
 */
export function renderFrameSVG(
  doc: AtelierDocument,
  stateOrFrame: string | ResolvedFrame,
  frame?: number,
  opts?: RenderSVGOptions,
): string {
  // Reset counters for deterministic IDs
  resetGradientCounter();
  resetFilterCounter();
  resetClipCounter();

  let resolved: ResolvedFrame;
  if (typeof stateOrFrame === "string") {
    resolved = resolveFrame(doc, stateOrFrame, frame ?? 0);
  } else {
    resolved = stateOrFrame;
  }

  const { width, height } = doc.canvas;
  const indent = opts?.indent ?? 2;
  const pad = " ".repeat(indent);

  // Build effective layers
  const effLayers: EffectiveLayer[] = resolved.layers.map(rl =>
    buildEffectiveLayer(rl, width, height),
  );

  // Collect all defs and layer elements
  const allDefs: string[] = [];
  const layerElements: string[] = [];

  for (let i = 0; i < effLayers.length; i++) {
    const eff = effLayers[i];
    const layer = resolved.layers[i].layer;

    // Skip invisible or fully transparent
    if (layer.visible === false) continue;
    if (eff.opacity <= 0) continue;

    // Resolve asset for images
    if (layer.visual.type === "image") {
      const iv = eff.visual as ImageVisual;
      if (!iv.src && iv.assetId && doc.assets?.[iv.assetId]) {
        (eff.visual as ImageVisual).src = doc.assets[iv.assetId].src;
      }
    }

    // Build transform
    const transform = buildTransform(eff);
    const styleAttrs = buildStyleAttrs(eff);

    // Build shadow filter
    const filterResult = buildShadowFilter(eff);
    if (filterResult) allDefs.push(filterResult.defs);

    // Build clip path
    let clipAttr = "";
    if (layer.clipPath) {
      const clipResult = buildClipPathDef(layer.clipPath, eff.width, eff.height);
      if (clipResult.defs) {
        allDefs.push(clipResult.defs);
        clipAttr = ` clip-path="${clipResult.clipRef}"`;
      }
    }

    // Build group attributes
    const gAttrs: string[] = [];
    if (transform) gAttrs.push(`transform="${transform}"`);
    if (styleAttrs) gAttrs.push(styleAttrs);
    if (filterResult) gAttrs.push(`filter="${filterResult.filterRef}"`);
    if (clipAttr) gAttrs.push(clipAttr.trim());

    // Render visual content
    let content = "";
    let layerDefs = "";

    switch (layer.visual.type) {
      case "shape": {
        const result = renderShapeSVG(eff, eff.visual as import("@atelier/types").ShapeVisual);
        content = result.elements;
        layerDefs = result.defs;
        break;
      }
      case "text":
        content = renderTextSVG(eff, eff.visual as import("@atelier/types").TextVisual);
        break;
      case "image": {
        const iv = eff.visual as ImageVisual;
        if (iv.src) {
          content = `<image href="${escapeXml(iv.src)}" width="${eff.width}" height="${eff.height}" />`;
        }
        break;
      }
      case "group":
        // Groups are structural — no visual content in SVG either
        break;
      case "ref":
        // Ref layers: render placeholder
        content = `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#999" stroke-dasharray="4 2" />`;
        break;
    }

    if (layerDefs) allDefs.push(layerDefs);

    if (content) {
      const gOpen = gAttrs.length > 0 ? `<g ${gAttrs.join(" ")}>` : "<g>";
      layerElements.push(`${pad}${gOpen}${content}</g>`);
    }
  }

  // Build SVG
  const lines: string[] = [];

  if (opts?.xmlDeclaration) {
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  }

  const viewBox = opts?.viewBox !== false ? ` viewBox="0 0 ${width} ${height}"` : "";
  const bg = doc.canvas.background;

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"${viewBox}>`);

  // Defs section
  if (allDefs.length > 0) {
    lines.push(`${pad}<defs>`);
    for (const def of allDefs) {
      lines.push(`${pad}${pad}${def}`);
    }
    lines.push(`${pad}</defs>`);
  }

  // Background
  if (bg && bg !== "transparent") {
    lines.push(`${pad}<rect width="${width}" height="${height}" fill="${bg}" />`);
  }

  // Layers
  lines.push(...layerElements);

  lines.push("</svg>");

  return lines.join("\n");
}
