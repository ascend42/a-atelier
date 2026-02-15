import type { RefVisual } from "@atelier/types";
import type { RenderContext } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";

/**
 * Render a ref layer as a dashed placeholder rectangle with label.
 * Sub-document loading is not yet implemented.
 */
export function renderRef(ctx: RenderContext, eff: EffectiveLayer): void {
  const visual = eff.visual as RefVisual;
  const { width, height } = eff;

  // Dashed outline
  ctx.strokeStyle = "#888888";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(0, 0, width, height);
  ctx.setLineDash([]);

  // Label
  const label = `REF: ${visual.src}`;
  ctx.fillStyle = "#888888";
  ctx.font = `${Math.max(12, Math.min(16, height * 0.15))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, height / 2, width - 8);
}
