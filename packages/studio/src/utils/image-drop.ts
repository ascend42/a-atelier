import type { AtelierDocument, Layer } from "@a-company/atelier-types";

/**
 * Shared helper module powering the v1 headline image-drop workflow:
 *
 *   1. User drops an image onto the Studio canvas (canvas-panel), OR picks
 *      one via Layer panel's Add → Image menu (layer-panel).
 *   2. The file is read as a data URL, its natural dimensions are measured.
 *   3. A fully-formed ImageVisual Layer is appended to the document — sized
 *      to fit the canvas while preserving aspect, centered, with a 0.5/0.5
 *      anchor — plus a matching entry in `doc.assets`.
 *   4. If the doc has a placeholder layer with id "background" (the
 *      welcome.atelier scaffold), the FIRST dropped image REPLACES it
 *      rather than appending. That matches the natural user intent of
 *      "fill in the placeholder."
 *
 * The math + layer-building logic is exposed as pure functions so it can
 * be unit-tested without simulating real DOM File/Image events (which
 * happy-dom only partially supports).
 *
 * Note on z-order: the canvas renderer paints layers in array order, so
 * index 0 is BEHIND every other layer. New images get `unshift`-ed onto
 * the layers array — they sit behind existing overlays (e.g. @handle,
 * page-number), which is the desired composition order.
 */

/** Bounds + frame computation for a given image into a given canvas. */
export interface ImageFitResult {
  bounds: { width: number; height: number };
  frame: { x: number; y: number };
}

/**
 * Fit a natural-sized image into the canvas while preserving aspect ratio.
 * - Landscape (image aspect wider than canvas): scale to canvas width.
 * - Portrait (image aspect taller than canvas): scale to canvas height.
 * - Both dims are capped at the canvas extents (a square image into a
 *   square canvas → fills exactly).
 *
 * The returned `frame` centers the image on the canvas. Combined with a
 * `0.5/0.5` anchor, this puts the image's centerpoint at canvas center.
 */
export function fitImageToCanvas(
  canvas: { width: number; height: number },
  natural: { naturalWidth: number; naturalHeight: number },
): ImageFitResult {
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = natural.naturalWidth;
  const ih = natural.naturalHeight;

  // Guard against degenerate sizes — fall back to canvas extents so the
  // caller still gets a valid layer rather than NaN bounds.
  if (!iw || !ih) {
    return {
      bounds: { width: cw, height: ch },
      frame: { x: cw / 2, y: ch / 2 },
    };
  }

  const imageAspect = iw / ih;
  const canvasAspect = cw / ch;

  let width: number;
  let height: number;
  if (imageAspect > canvasAspect) {
    // Landscape relative to canvas — fit to width.
    width = cw;
    height = cw / imageAspect;
  } else {
    // Portrait (or equal) — fit to height.
    height = ch;
    width = ch * imageAspect;
  }

  // Cap each dimension at the canvas extent — protects against tiny
  // floating-point overshoot from the aspect math.
  width = Math.min(width, cw);
  height = Math.min(height, ch);

  return {
    bounds: { width, height },
    frame: { x: cw / 2, y: ch / 2 },
  };
}

/**
 * Pick a unique layer id of form `${prefix}-N` that does not collide with
 * any layer already in the document.
 */
function nextImageLayerId(doc: AtelierDocument, prefix = "image"): string {
  const existing = new Set(doc.layers.map((l) => l.id));
  let n = doc.layers.length + 1;
  while (existing.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/**
 * Build (and mutate the doc to include) an ImageVisual layer from a
 * known data URL + natural-dims. Pure synchronous core — used both by
 * the async file-drop path and by the helper-math tests.
 *
 * If `replaceBackground` is true AND `doc.layers[0]?.id === "background"`,
 * the placeholder is swapped out in-place. Otherwise the new layer is
 * `unshift`-ed onto the layers array (bottom of z-stack, behind any
 * existing overlays).
 */
export function buildImageLayer(
  doc: AtelierDocument,
  args: {
    dataUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    replaceBackground?: boolean;
  },
): Layer {
  const fit = fitImageToCanvas(doc.canvas, args);
  const id = nextImageLayerId(doc);
  const assetId = `${id}-asset`;

  const layer: Layer = {
    id,
    visual: {
      type: "image",
      assetId,
      src: args.dataUrl,
    },
    frame: fit.frame,
    bounds: fit.bounds,
    anchorPoint: { x: 0.5, y: 0.5 },
    opacity: 1,
  };

  // Register the asset alongside the layer. The layer's inline `src` is
  // what the renderer uses today (ImageCache resolves by src); the asset
  // registry entry is belt-and-suspenders so the future "load asset by
  // id" path stays consistent even if the data URL is later swapped out.
  if (!doc.assets) doc.assets = {};
  doc.assets[assetId] = { type: "image", src: args.dataUrl };

  if (args.replaceBackground && doc.layers[0]?.id === "background") {
    // Swap in-place so handle/page-number overlays stay on top.
    doc.layers[0] = layer;
  } else {
    // Append at the bottom of the z-stack (renderer paints index 0 first).
    doc.layers.unshift(layer);
  }

  return layer;
}

/**
 * Read a File as a data URL. Wraps FileReader in a Promise so callers
 * can `await` the result.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader produced non-string result"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

/**
 * Measure the natural dimensions of an image loaded from a data URL.
 * Stubbed-out in tests; in the browser this resolves once the image has
 * decoded.
 */
export function measureImage(
  dataUrl: string,
): Promise<{ naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = () => reject(new Error("Image failed to decode"));
    img.src = dataUrl;
  });
}

/**
 * Headline drop-to-layer pipeline. Pure-helper composition: read the
 * file, measure the image, build (+ mutate) the doc.
 *
 * Returns the newly-created Layer so callers can select it.
 *
 * Non-image files should be filtered by the caller BEFORE invoking this
 * helper (e.g. by checking `file.type.startsWith("image/")`).
 *
 * Manual test (not covered by vitest — requires browser-grade Image
 * decoding):
 *   1. `pnpm dev` → open Studio, load welcome.atelier
 *   2. Drag a .jpg from Finder onto the canvas
 *   3. Confirm the placeholder background is replaced, overlays still visible
 *   4. Drag a second image → confirm it stacks behind overlays + above the
 *      first image's natural slot (unshifted onto the layers array)
 */
export async function createImageLayerFromFile(
  doc: AtelierDocument,
  file: File,
  opts?: { replaceBackground?: boolean },
): Promise<Layer> {
  const dataUrl = await readFileAsDataUrl(file);
  const natural = await measureImage(dataUrl);
  return buildImageLayer(doc, {
    dataUrl,
    naturalWidth: natural.naturalWidth,
    naturalHeight: natural.naturalHeight,
    replaceBackground: opts?.replaceBackground ?? false,
  });
}
