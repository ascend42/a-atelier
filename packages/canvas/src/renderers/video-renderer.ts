import type { VideoVisual } from "@a-company/atelier-types";
import type { RenderContext, VideoFrameProvider } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";

/**
 * Render a video layer to the canvas at the given source time.
 * Delegates actual frame extraction to the injected VideoFrameProvider,
 * which may be backed by HTMLVideoElement (preview) or WebCodecs (export).
 * Returns without drawing if the provider returns null — caller retries next tick.
 */
export function renderVideo(
  ctx: RenderContext,
  eff: EffectiveLayer,
  sourceTime: number,
  provider: VideoFrameProvider,
): void {
  const visual = eff.visual as VideoVisual;
  const src = visual.src;
  if (!src) return;

  const frame = provider(src, sourceTime, eff.width, eff.height);
  if (!frame) return;

  ctx.drawImage(frame as unknown, 0, 0, eff.width, eff.height);
}
