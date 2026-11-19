/**
 * Where an image layer's source lives on disk (#asset-src).
 *
 * A relative `src` (on the layer or its asset) is relative to the .atelier
 * file, the same rule `findPrimaryVideoSource` uses for video. Absolute
 * paths, data URLs and http(s) URLs pass through. Without the document's
 * path, a relative src is left as is (resolved against the working directory,
 * the old behaviour).
 */

import { dirname, isAbsolute, resolve } from "node:path";

export function resolveAssetSrc(src: string, docPath?: string): string {
  if (!docPath || isAbsolute(src) || /^(data:|https?:\/\/)/i.test(src)) return src;
  return resolve(dirname(docPath), src);
}

/** Tell the creator which images didn't load, instead of rendering them blank in silence. */
export function warnMissingImages(failed: { src: string; tried: string }[]): void {
  for (const f of failed) {
    process.stderr.write(`  warning: image didn't load, rendering it blank: ${f.src}${f.tried !== f.src ? ` (looked at ${f.tried})` : ""}\n`);
  }
}
