// #compose-image-project — ingest a single image file into a kind:"image"
// Atelier project.
//
// Single-image projects (TD-2026-05-27): an "image" project holds exactly one
// ImageVisual layer. To swap the image, rename or delete the existing image
// before adding another — composeImageProject REFUSES a second image rather
// than overwriting silently. (Multi-image compositions are carousel projects.)
//
// Pipeline (additive; safe to re-run for the same image; refuses a second):
//   1. Ensure `<projectDir>/media/` exists.
//   2. Copy the source file into `media/<basename>` (skipped if dest exists).
//   3. Read `project.atelier` (or scaffold a fresh kind:"image" doc).
//   4. Validate: existing img-* layer with a DIFFERENT basename → throw.
//      Same basename → idempotent (return addedImageLayer:false).
//   5. Add `img-<slug>` ImageVisual layer + asset entry, bounds = canvas.
//
// NO transcription. NO timeline block. Image-kind projects skip both —
// that's what distinguishes them from video projects.

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { AtelierDocument, Layer } from "@a-company/atelier-types";
import { readAtelierDoc, slugifyBasename } from "./compose-video-project.js";

export interface ComposeImageProjectOptions {
  /** Absolute path to project root (contains or will contain project.atelier). */
  projectDir: string;
  /** Absolute path to the source image file. */
  sourceFile: string;
  /** Override target basename inside media/. Defaults to basename(sourceFile). */
  mediaBasename?: string;
}

export interface ComposeImageProjectResult {
  doc: AtelierDocument;
  /** True iff a new ImageVisual layer was added (vs. doc already had one). */
  addedImageLayer: boolean;
  /** Slug-based layer id, e.g. "img-photo-1". One-to-one with assetId. */
  layerId: string;
  /** Same as layerId — the asset key. */
  assetId: string;
}

/**
 * Compose (or re-compose) an Atelier image project from a single source image.
 *
 * - Single-image invariant: a second, differently-named image throws.
 * - Idempotent on re-ingest of the same basename.
 * - No timeline, no transcript — image projects render as a single frame.
 */
export async function composeImageProject(
  opts: ComposeImageProjectOptions,
): Promise<ComposeImageProjectResult> {
  const projectDir = resolve(opts.projectDir);
  const sourceAbs = resolve(opts.sourceFile);
  const mediaBasename = opts.mediaBasename ?? basename(sourceAbs);

  // 1. Ensure media/ dir exists.
  const mediaDir = `${projectDir}/media`;
  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });

  // 2. Copy source into media/ (skip if already there).
  const mediaDest = `${mediaDir}/${mediaBasename}`;
  if (!existsSync(mediaDest)) {
    copyFileSync(sourceAbs, mediaDest);
  }

  // 3. Read or scaffold project.atelier.
  const compositionPath = `${projectDir}/project.atelier`;
  let doc: AtelierDocument;
  if (existsSync(compositionPath)) {
    doc = readAtelierDoc(compositionPath);
  } else {
    doc = {
      version: "1.0",
      name: basename(projectDir),
      kind: "image",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
    };
  }

  const slug = slugifyBasename(mediaBasename);
  if (!slug) {
    throw new Error(
      `composeImageProject: cannot derive a slug from "${mediaBasename}"`,
    );
  }
  const layerId = `img-${slug}`;
  const expectedSrc = `media/${mediaBasename}`;

  // 4. Single-image invariant: if the doc already has an img-* layer pointing
  //    at a DIFFERENT basename, refuse. Compare by the src on disk
  //    (media/<basename>) rather than by slug — different basenames CAN slug
  //    to the same id, and the on-disk truth is what matters.
  const existingImageLayer = doc.layers.find((l) => {
    if (!l.id.startsWith("img-")) return false;
    const v = l.visual as { type?: string; src?: string };
    return v?.type === "image";
  });
  if (existingImageLayer) {
    const existingSrc =
      (existingImageLayer.visual as { src?: string }).src ?? "";
    const existingBasename = basename(existingSrc);
    if (existingBasename !== mediaBasename) {
      throw new Error(
        "image project already has an image; rename or delete the existing image before adding another",
      );
    }
    // Same basename — idempotent re-ingest.
    return {
      doc,
      addedImageLayer: false,
      layerId: existingImageLayer.id,
      assetId: existingImageLayer.id,
    };
  }

  // 5. Add the image layer + asset entry.
  const newLayer: Layer = {
    id: layerId,
    tags: ["image"],
    description: mediaBasename,
    visual: {
      type: "image",
      assetId: layerId,
      src: expectedSrc,
    },
    frame: { x: 0, y: 0 },
    bounds: { width: doc.canvas.width, height: doc.canvas.height },
  };

  const assets = { ...(doc.assets ?? {}) };
  assets[layerId] = {
    type: "image",
    src: expectedSrc,
    description: mediaBasename,
  };

  doc = {
    ...doc,
    layers: [...doc.layers, newLayer],
    assets,
  };

  writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");

  return {
    doc,
    addedImageLayer: true,
    layerId,
    assetId: layerId,
  };
}
