/**
 * Where an image or video layer's source lives on disk (#asset-src).
 *
 * A relative `src` is looked up, in order:
 *   1. in the .atelier file's own folder (the rule video always used);
 *   2. in each folder above it — a nested doc such as `slides/slide-1.atelier`
 *      that composeImageProject wrote points at `media/<file>` in the project
 *      root, not beside the doc;
 *   3. in the working directory — what every render did before docPath was
 *      passed, so docs written against the cwd keep rendering.
 * The first candidate that exists wins. When none exists, the doc-relative path
 * is returned so the "didn't load" warning names a sensible place.
 *
 * Absolute paths and URLs pass through; `file:` URLs become paths. Without the
 * document's path, a relative src is left as is (cwd-relative, the old rule —
 * carousel's in-memory docs rely on it).
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** A URL scheme (`data:`, `http:`, `blob:` …), but not a Windows drive letter (`C:`). */
const URL_SCHEME = /^[a-z][a-z0-9+.-]+:/i;

export function resolveAssetSrc(src: string, docPath?: string): string {
  if (/^file:/i.test(src)) {
    try {
      return fileURLToPath(src);
    } catch {
      return src;
    }
  }
  if (!docPath || isAbsolute(src) || URL_SCHEME.test(src)) return src;

  const docRelative = resolve(dirname(docPath), src);
  for (const candidate of assetCandidates(src, docPath)) {
    if (existsSync(candidate)) return candidate;
  }
  return docRelative;
}

/** The doc's folder, each folder above it, then the working directory — deduplicated. */
function assetCandidates(src: string, docPath: string): string[] {
  const out: string[] = [];
  let dir = dirname(resolve(docPath));
  for (;;) {
    out.push(resolve(dir, src));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const fromCwd = resolve(src);
  if (!out.includes(fromCwd)) out.push(fromCwd);
  return out;
}

/** Tell the creator which images didn't load, instead of rendering them blank in silence. */
export function warnMissingImages(failed: { src: string; tried: string }[]): void {
  // The CLI reports through stdout/stderr like every other command; there is no
  // Paradigm logger in this package.
  for (const f of failed) {
    process.stderr.write(`  warning: image didn't load, rendering it blank: ${f.src}${f.tried !== f.src ? ` (looked at ${f.tried})` : ""}\n`);
  }
}
