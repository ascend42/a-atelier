import type { TextVisual } from "@atelier/types";
import type { EffectiveLayer } from "@atelier/canvas";
import { colorToCSS } from "./svg-gradients.js";
import { escapeXml } from "./svg-properties.js";

/** Render a text visual as SVG elements */
export function renderTextSVG(eff: EffectiveLayer, visual: TextVisual): string {
  const { style } = visual;

  const attrs: string[] = [];

  // Font attributes
  attrs.push(`font-family="${escapeXml(style.fontFamily)}"`);
  attrs.push(`font-size="${style.fontSize}"`);

  if (style.fontWeight && style.fontWeight !== "normal") {
    attrs.push(`font-weight="${style.fontWeight}"`);
  }
  if (style.fontStyle && style.fontStyle !== "normal") {
    attrs.push(`font-style="${style.fontStyle}"`);
  }

  // Color
  attrs.push(`fill="${colorToCSS(style.color)}"`);

  // Text alignment
  const align = style.textAlign ?? "left";
  let textAnchor = "start";
  let x = 0;
  if (align === "center") {
    textAnchor = "middle";
    x = eff.width / 2;
  } else if (align === "right") {
    textAnchor = "end";
    x = eff.width;
  }
  attrs.push(`text-anchor="${textAnchor}"`);

  // Letter spacing
  if (style.letterSpacing) {
    attrs.push(`letter-spacing="${style.letterSpacing}"`);
  }

  // SVG text baseline: use dominant-baseline for top alignment
  attrs.push(`dominant-baseline="hanging"`);

  return `<text x="${x}" y="0" ${attrs.join(" ")}>${escapeXml(visual.content)}</text>`;
}
