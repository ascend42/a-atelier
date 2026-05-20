/**
 * Shared single-frame render-to-PNG path.
 *
 * Extracted from `atelier export-image` so the carousel batch driver and the
 * single-frame export command render through one code path. Rasterizes via
 * `@napi-rs/canvas` — a Canvas2D implementation shipped as prebuilt platform
 * binaries, so PNG export works on a plain install with no node-gyp build and
 * no system libraries (cairo/pango/etc.). Pre-loads any ImageVisual layers via
 * its `loadImage` (file path / data-URL / buffer all work server-side, the same
 * mechanism the MP4 render-pipeline uses) and renders one resolved frame scaled
 * to the requested output dimensions.
 */

import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/** @napi-rs/canvas surface — the subset this module touches. */
interface NodeCanvas {
  getContext(id: "2d"): unknown;
  toBuffer(format: "image/png"): Buffer;
}

/** A loaded image — width/height are the natural pixel dims. */
export interface LoadedImage {
  width: number;
  height: number;
}

/** Canvas module surface (createCanvas + loadImage). */
interface CanvasModule {
  createCanvas: (w: number, h: number) => NodeCanvas;
  loadImage: (src: string) => Promise<LoadedImage>;
}

/** Bounds + centered frame for fitting an image into a canvas. */
export interface ImageFitResult {
  bounds: { width: number; height: number };
  frame: { x: number; y: number };
}

/**
 * Fit a natural-sized image into a canvas while preserving aspect ratio,
 * centered. Adapted from studio's image-drop helper (kept local so the CLI's
 * server-side render path doesn't import the browser studio package).
 *
 * Landscape (wider than canvas) → fit to width; portrait (taller or equal) →
 * fit to height; both dims capped at the canvas extents. Degenerate natural
 * sizes fall back to canvas extents so callers always get valid bounds.
 */
export function fitImageToCanvas(
  canvas: { width: number; height: number },
  natural: { width: number; height: number },
): ImageFitResult {
  const cw = canvas.width;
  const ch = canvas.height;
  const iw = natural.width;
  const ih = natural.height;

  if (!iw || !ih) {
    return { bounds: { width: cw, height: ch }, frame: { x: cw / 2, y: ch / 2 } };
  }

  const imageAspect = iw / ih;
  const canvasAspect = cw / ch;

  let width: number;
  let height: number;
  if (imageAspect > canvasAspect) {
    width = cw;
    height = cw / imageAspect;
  } else {
    height = ch;
    width = ch * imageAspect;
  }
  width = Math.min(width, cw);
  height = Math.min(height, ch);

  return { bounds: { width, height }, frame: { x: cw / 2, y: ch / 2 } };
}

/**
 * Raised when the `@napi-rs/canvas` rasterizer cannot be loaded. In practice
 * this never fires: `@napi-rs/canvas` is a hard dependency that ships prebuilt
 * platform binaries (no node-gyp, no system libraries). It can only happen if
 * the install is corrupt or running on an unsupported platform with no prebuilt
 * binary — in which case a reinstall is the fix. Kept as a typed seam so call
 * sites can still distinguish a missing-rasterizer failure from a bad document.
 */
export class CanvasUnavailableError extends Error {
  constructor() {
    super(
      "The '@napi-rs/canvas' rasterizer could not be loaded.\n" +
        "This package ships prebuilt platform binaries — no system libraries needed.\n" +
        "Try reinstalling dependencies (e.g. `npm install`) to fetch the binary for this platform.",
    );
    this.name = "CanvasUnavailableError";
  }
}

/**
 * Resolve the canvas module. `@napi-rs/canvas` is a hard, statically-imported
 * dependency, so this is a thin accessor that surfaces a typed
 * {@link CanvasUnavailableError} on the (essentially impossible) chance the
 * platform binary failed to load.
 */
export async function loadCanvasModule(): Promise<CanvasModule> {
  if (typeof createCanvas !== "function" || typeof loadImage !== "function") {
    throw new CanvasUnavailableError();
  }
  return {
    createCanvas: createCanvas as unknown as CanvasModule["createCanvas"],
    loadImage: loadImage as unknown as CanvasModule["loadImage"],
  };
}

/**
 * Compute final output dimensions from the document canvas and optional
 * width/height overrides. When only one of width/height is provided, the
 * other is derived to preserve the document's aspect ratio. When both are
 * provided, both are used verbatim (allows non-uniform scaling).
 */
export function resolveExportDimensions(
  docWidth: number,
  docHeight: number,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }
  if (width !== undefined) {
    const h = Math.max(1, Math.round((width * docHeight) / docWidth));
    return { width, height: h };
  }
  if (height !== undefined) {
    const w = Math.max(1, Math.round((height * docWidth) / docHeight));
    return { width: w, height };
  }
  return { width: docWidth, height: docHeight };
}

/**
 * Build an {@link ImageCache} pre-populated with every ImageVisual source in
 * the document. Mirrors render-pipeline.ts: load each source with
 * `loadImage`, then wire a synchronous-from-cache `createImage` so the renderer
 * resolves images immediately. Returns the cache plus a map of src → loaded
 * image so callers can read natural dimensions.
 */
async function preloadImages(
  doc: AtelierDocument,
  loadImage: (src: string) => Promise<LoadedImage>,
): Promise<{
  imageCache: import("@a-company/atelier-canvas").ImageCache;
  loaded: Map<string, LoadedImage>;
}> {
  const { ImageCache } = await import("@a-company/atelier-canvas");

  const sources = new Set<string>();
  for (const layer of doc.layers) {
    if (layer.visual.type === "image") {
      const iv = layer.visual as { src?: string; assetId?: string };
      if (iv.src) sources.add(iv.src);
      else if (iv.assetId && doc.assets?.[iv.assetId]) sources.add(doc.assets[iv.assetId].src);
    }
  }

  if (sources.size === 0) {
    return { imageCache: new ImageCache(), loaded: new Map() };
  }

  const preloaded = new Map<string, LoadedImage>();
  await Promise.all(
    [...sources].map(async (src) => {
      try {
        preloaded.set(src, await loadImage(src));
      } catch {
        // Sources that fail to load render blank — same tolerance as render-pipeline.
      }
    }),
  );

  const imageCache = new ImageCache({
    createImage: (src, onLoad, onError) => {
      const img = preloaded.get(src);
      if (img) {
        process.nextTick(onLoad);
        return img;
      }
      process.nextTick(onError);
      return {};
    },
  });
  for (const src of preloaded.keys()) imageCache.load(src);
  await new Promise<void>((resolve) => process.nextTick(resolve));

  return { imageCache, loaded: preloaded };
}

export interface RenderToPngOptions {
  /** State to resolve (defaults to the first state). */
  state?: string;
  /** Frame within the state (defaults to 0). */
  frame?: number;
  /** Output width override (px). */
  width?: number;
  /** Output height override (px). */
  height?: number;
  /**
   * Optional hook to adjust each image layer's bounds once natural dimensions
   * are known from the loaded image. Receives the layer src + natural dims and
   * the doc canvas; returns new bounds (and frame). Used by the carousel driver
   * to aspect-fit fit-to-canvas images that were composed with placeholder
   * bounds (natural dims are unknown until the rasterizer decodes the file).
   */
  refitImageBounds?: (args: {
    canvas: { width: number; height: number };
    natural: { width: number; height: number };
  }) => { bounds: { width: number; height: number }; frame: { x: number; y: number } };
}

/**
 * Render a single resolved frame of a document to a PNG buffer.
 *
 * Validates state/frame, pre-loads image layers, scales rendering to fit the
 * requested output dimensions, and returns the encoded PNG bytes. Throws
 * {@link CanvasUnavailableError} when the rasterizer is missing and a plain
 * Error for bad state/frame selection.
 */
export async function renderDocumentToPng(
  doc: AtelierDocument,
  opts: RenderToPngOptions = {},
): Promise<Buffer> {
  const stateNames = Object.keys(doc.states);
  if (stateNames.length === 0) {
    throw new Error("Document has no states");
  }
  const stateName = opts.state ?? stateNames[0];
  if (!doc.states[stateName]) {
    throw new Error(`State "${stateName}" not found. Available: ${stateNames.join(", ")}`);
  }
  const frameNumber = opts.frame ?? 0;
  if (!Number.isInteger(frameNumber) || frameNumber < 0) {
    throw new Error(`Invalid frame number: ${frameNumber}`);
  }
  const duration = doc.states[stateName].duration;
  if (frameNumber >= duration) {
    throw new Error(
      `Frame ${frameNumber} is out of range for state "${stateName}" (duration ${duration})`,
    );
  }

  const { createCanvas, loadImage } = await loadCanvasModule();
  const { renderFrame } = await import("@a-company/atelier-canvas");

  const { imageCache, loaded } = await preloadImages(doc, loadImage);

  // Re-fit image layers now that natural dims are known (carousel path).
  let renderDoc = doc;
  if (opts.refitImageBounds && loaded.size > 0) {
    renderDoc = {
      ...doc,
      layers: doc.layers.map((layer) => {
        if (layer.visual.type !== "image") return layer;
        const iv = layer.visual as { src?: string; assetId?: string };
        const src = iv.src ?? (iv.assetId ? doc.assets?.[iv.assetId]?.src : undefined);
        const natural = src ? loaded.get(src) : undefined;
        if (!natural || !natural.width || !natural.height) return layer;
        const fit = opts.refitImageBounds!({ canvas: doc.canvas, natural });
        return { ...layer, bounds: fit.bounds, frame: fit.frame };
      }),
    };
  }

  const { width: outW, height: outH } = resolveExportDimensions(
    renderDoc.canvas.width,
    renderDoc.canvas.height,
    opts.width,
    opts.height,
  );

  const resolved = resolveFrame(renderDoc, stateName, frameNumber);
  const cvs = createCanvas(outW, outH);
  const ctx = cvs.getContext("2d") as unknown as import("@a-company/atelier-canvas").RenderContext;

  const sx = outW / renderDoc.canvas.width;
  const sy = outH / renderDoc.canvas.height;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

  renderFrame(ctx, resolved, renderDoc, imageCache);

  return cvs.toBuffer("image/png");
}
