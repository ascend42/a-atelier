import type { VideoVisual } from "@a-company/atelier-types";
import type { RenderContext, VideoFrameProvider } from "../canvas-types.js";
import type { EffectiveLayer } from "../apply-properties.js";

/**
 * Render a video layer to the canvas at the given source time.
 * Delegates actual frame extraction to the injected VideoFrameProvider,
 * which may be backed by HTMLVideoElement (preview) or WebCodecs (export).
 * Returns without drawing if the provider returns null — caller retries next tick.
 *
 * Honors `visual.objectFit`:
 *   - `"fill"`  (default for legacy behavior) — stretch to layer bounds, may distort.
 *   - `"contain"` — aspect-preserving fit-inside, letterbox with transparent gutters.
 *   - `"cover"`  — aspect-preserving fill-outside, crop overflow.
 * The default is `contain` when omitted — for a creator authoring a 9:16
 * portrait canvas with a 16:9 source clip, `fill` would squash visibly;
 * `contain` shows the clip in its natural aspect within the layer's box.
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

  const fit = visual.objectFit ?? "contain";
  if (fit === "fill") {
    ctx.drawImage(frame as unknown, 0, 0, eff.width, eff.height);
    return;
  }

  // Frame has natural dimensions — HTMLVideoElement carries videoWidth/Height,
  // ImageBitmap carries width/height. Both surface as `.width` / `.height` /
  // `.videoWidth` / `.videoHeight`. Probe at runtime; fall back to fill if we
  // can't read the source's intrinsic size (e.g. partially-loaded video).
  const src_w = (frame as { videoWidth?: number; width?: number }).videoWidth
    ?? (frame as { width?: number }).width
    ?? 0;
  const src_h = (frame as { videoHeight?: number; height?: number }).videoHeight
    ?? (frame as { height?: number }).height
    ?? 0;
  if (src_w <= 0 || src_h <= 0) {
    ctx.drawImage(frame as unknown, 0, 0, eff.width, eff.height);
    return;
  }

  const srcAspect = src_w / src_h;
  const dstAspect = eff.width / eff.height;
  let dw: number, dh: number, dx: number, dy: number;

  if (fit === "cover") {
    // Fill the box, overflow on the longer axis is cropped.
    if (srcAspect > dstAspect) {
      dh = eff.height;
      dw = dh * srcAspect;
    } else {
      dw = eff.width;
      dh = dw / srcAspect;
    }
  } else {
    // contain — fit inside the box, transparent letterbox on the shorter axis.
    if (srcAspect > dstAspect) {
      dw = eff.width;
      dh = dw / srcAspect;
    } else {
      dh = eff.height;
      dw = dh * srcAspect;
    }
  }
  dx = (eff.width - dw) / 2;
  dy = (eff.height - dh) / 2;
  ctx.drawImage(frame as unknown, dx, dy, dw, dh);
}
