import type { TextVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import { colorToCSS } from "../styles.js";

export function renderText(ctx: RenderContext, eff: EffectiveLayer): void {
  const visual = eff.visual as TextVisual;
  const { style } = visual;

  // Build font string
  const fontStyle = style.fontStyle ?? "normal";
  const fontWeight = style.fontWeight ?? "normal";
  const fontSize = style.fontSize;
  const fontFamily = style.fontFamily;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

  // Set alignment — position text within its bounding box
  const align = style.textAlign ?? "left";
  ctx.textAlign = align;
  ctx.textBaseline = "top";

  // Set color
  ctx.fillStyle = colorToCSS(style.color);

  // Canvas 2D textAlign anchors at the draw point, so offset within bounds:
  // "left" → draw at x=0 (text flows right from left edge)
  // "center" → draw at x=width/2 (text centers within bounds)
  // "right" → draw at x=width (text flows left from right edge)
  let textX = 0;
  if (align === "center") {
    textX = eff.width / 2;
  } else if (align === "right") {
    textX = eff.width;
  }

  ctx.fillText(visual.content, textX, 0);
}
