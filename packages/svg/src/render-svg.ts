import type { AtelierDocument, ImageVisual, RefVisual } from "@atelier/types";
import { resolveFrame, type ResolvedFrame } from "@atelier/core";
import { buildEffectiveLayer, type EffectiveLayer, type DocumentResolver } from "@atelier/canvas";
import { buildTransform, buildStyleAttrs } from "./svg-properties.js";
import { renderShapeSVG } from "./svg-shapes.js";
import { renderTextSVG } from "./svg-text.js";
import { buildShadowFilter, buildTintFilter, resetFilterCounter } from "./svg-filters.js";
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
  /** Resolves ref layer src paths to loaded AtelierDocuments */
  documentResolver?: DocumentResolver;
  /** Maximum ref nesting depth (default: 4) */
  maxRefDepth?: number;
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
    if (!eff.visible) continue;
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

    // Build tint filter
    const tintResult = buildTintFilter(eff);
    if (tintResult) allDefs.push(tintResult.defs);

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
    // Apply combined or individual filters
    if (filterResult && tintResult) {
      // When both shadow and tint exist, we need a combined filter
      // For simplicity, apply shadow filter and tint separately via style
      gAttrs.push(`filter="${filterResult.filterRef}"`);
      // Tint is a second filter — wrap content in nested group
    } else if (filterResult) {
      gAttrs.push(`filter="${filterResult.filterRef}"`);
    } else if (tintResult) {
      gAttrs.push(`filter="${tintResult.filterRef}"`);
    }
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
          if (iv.spritesheet) {
            // Spritesheet: compute source rect and use full sheet dimensions for inner image
            const { columns, rows, frameWidth, frameHeight, frameCount } = iv.spritesheet;
            const maxFrames = frameCount ?? (columns * rows);
            const idx = Math.max(0, Math.min(Math.floor(iv.frameIndex ?? 0), maxFrames - 1));
            const col = idx % columns;
            const row = Math.floor(idx / columns);
            const sx = col * frameWidth;
            const sy = row * frameHeight;
            const imgW = columns * frameWidth;
            const imgH = rows * frameHeight;
            content = `<svg viewBox="${sx} ${sy} ${frameWidth} ${frameHeight}" width="${eff.width}" height="${eff.height}">` +
              `<image href="${escapeXml(iv.src)}" width="${imgW}" height="${imgH}" />` +
              `</svg>`;
          } else if (iv.sourceRect) {
            // Manual sourceRect: viewBox crops from image coordinate space
            const sr = iv.sourceRect;
            content = `<svg viewBox="${sr.x} ${sr.y} ${sr.width} ${sr.height}" width="${eff.width}" height="${eff.height}">` +
              `<image href="${escapeXml(iv.src)}" width="${eff.width}" height="${eff.height}" />` +
              `</svg>`;
          } else {
            content = `<image href="${escapeXml(iv.src)}" width="${eff.width}" height="${eff.height}" />`;
          }
        }
        break;
      }
      case "group":
        // Groups are structural — no visual content in SVG either
        break;
      case "ref": {
        const refVisual = eff.visual as RefVisual;
        const refContent = renderRefSVG(eff, refVisual, doc, opts);
        content = refContent;
        break;
      }
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

/**
 * Render a ref layer as SVG. Uses documentResolver to inline sub-doc content,
 * or falls back to a dashed placeholder rectangle.
 */
function renderRefSVG(
  eff: EffectiveLayer,
  visual: RefVisual,
  _parentDoc: AtelierDocument,
  opts?: RenderSVGOptions,
  _depth?: number,
  _visitedRefs?: Set<string>,
): string {
  const resolver = opts?.documentResolver;

  if (!resolver) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#999" stroke-dasharray="4 2" />`;
  }

  const depth = _depth ?? 0;
  const maxDepth = opts?.maxRefDepth ?? 4;
  if (depth >= maxDepth) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#c33" stroke-dasharray="4 2" /><text x="${eff.width / 2}" y="${eff.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#c33" font-size="12">MAX DEPTH</text>`;
  }

  const visitedRefs = _visitedRefs ?? new Set<string>();
  if (visitedRefs.has(visual.src)) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#c33" stroke-dasharray="4 2" /><text x="${eff.width / 2}" y="${eff.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#c33" font-size="12">CYCLE</text>`;
  }

  const subDoc = resolver(visual.src);
  if (!subDoc) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#999" stroke-dasharray="4 2" /><text x="${eff.width / 2}" y="${eff.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#999" font-size="12">NOT FOUND</text>`;
  }

  const stateNames = Object.keys(subDoc.states);
  if (stateNames.length === 0) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#999" stroke-dasharray="4 2" />`;
  }

  const stateName = visual.state ?? stateNames[0];
  const stateObj = subDoc.states[stateName];
  if (!stateObj) {
    return `<rect width="${eff.width}" height="${eff.height}" fill="none" stroke="#999" stroke-dasharray="4 2" />`;
  }

  const maxFrame = Math.max(0, stateObj.duration - 1);
  const frame = Math.min(visual.frame ?? 0, maxFrame);

  visitedRefs.add(visual.src);

  // Render sub-doc as nested <svg> with viewBox for scaling
  const subW = subDoc.canvas.width;
  const subH = subDoc.canvas.height;
  const resolved = resolveFrame(subDoc, stateName, frame);

  const subParts: string[] = [];
  for (const rl of resolved.layers) {
    const subEff = buildEffectiveLayer(rl, subW, subH);
    if (!subEff.visible || subEff.opacity <= 0) continue;

    // Resolve asset
    if (rl.layer.visual.type === "image") {
      const iv = subEff.visual as ImageVisual;
      if (!iv.src && iv.assetId && subDoc.assets?.[iv.assetId]) {
        iv.src = subDoc.assets[iv.assetId].src;
      }
    }

    const transform = buildTransform(subEff);
    const styleAttrs = buildStyleAttrs(subEff);
    const gAttrs: string[] = [];
    if (transform) gAttrs.push(`transform="${transform}"`);
    if (styleAttrs) gAttrs.push(styleAttrs);

    let childContent = "";
    switch (rl.layer.visual.type) {
      case "shape": {
        const result = renderShapeSVG(subEff, subEff.visual as import("@atelier/types").ShapeVisual);
        childContent = result.elements;
        break;
      }
      case "text":
        childContent = renderTextSVG(subEff, subEff.visual as import("@atelier/types").TextVisual);
        break;
      case "image": {
        const iv = subEff.visual as ImageVisual;
        if (iv.src) {
          childContent = `<image href="${escapeXml(iv.src)}" width="${subEff.width}" height="${subEff.height}" />`;
        }
        break;
      }
      case "ref": {
        const refV = subEff.visual as RefVisual;
        childContent = renderRefSVG(subEff, refV, subDoc, opts, depth + 1, visitedRefs);
        break;
      }
    }

    if (childContent) {
      const gOpen = gAttrs.length > 0 ? `<g ${gAttrs.join(" ")}>` : "<g>";
      subParts.push(`${gOpen}${childContent}</g>`);
    }
  }

  visitedRefs.delete(visual.src);

  return `<svg x="0" y="0" width="${eff.width}" height="${eff.height}" viewBox="0 0 ${subW} ${subH}">${subParts.join("")}</svg>`;
}
