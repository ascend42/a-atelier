import type { TextVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";
import { colorToCSS } from "../styles.js";

export function renderText(ctx: RenderContext, eff: EffectiveLayer): void {
  const visual = eff.layer.visual as TextVisual;
  const { style } = visual;

  // Build font string
  const fontStyle = style.fontStyle ?? "normal";
  const fontWeight = style.fontWeight ?? "normal";
  const fontSize = style.fontSize;
  const fontFamily = style.fontFamily;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

  // Set alignment
  ctx.textAlign = style.textAlign ?? "left";
  ctx.textBaseline = "top";

  // Set color
  ctx.fillStyle = colorToCSS(style.color);

  // Draw text
  ctx.fillText(visual.content, 0, 0);
}
