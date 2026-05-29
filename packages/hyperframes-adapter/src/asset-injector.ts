/**
 * asset-injector — copy or symlink creator media into a Hyperframes
 * project's `assets/` directory.
 *
 * Symlinks by default (zero-copy, fast iteration during agent-driven
 * authoring). Falls back to copy when the source + destination are on
 * different filesystems or when running in environments where symlinks
 * are unsupported (rare on macOS/Linux dev boxes; possible in CI).
 *
 * v0 scope (this spike): just the named files. v1.0 will walk the
 * mind-map index and resolve SlotKind bindings instead of taking an
 * explicit filename list.
 */

import { mkdirSync, symlinkSync, copyFileSync, statSync, unlinkSync } from "node:fs";
import { join, resolve, basename } from "node:path";

export interface InjectAssetsOptions {
  /** Hyperframes project root (where `index.html` lives). */
  projectDir: string;
  /** Absolute paths of source files to make available under `assets/`. */
  sourceFiles: string[];
  /** When true, fall back to copy if symlink fails. Default: true. */
  copyOnSymlinkFailure?: boolean;
}

export interface InjectAssetsResult {
  /** Map of source path → resolved relative path under projectDir/assets/. */
  injected: Record<string, string>;
  /** Files we couldn't make available (e.g. source missing on disk). */
  skipped: string[];
}

export function injectAssets(opts: InjectAssetsOptions): InjectAssetsResult {
  const assetsDir = join(opts.projectDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  const injected: Record<string, string> = {};
  const skipped: string[] = [];

  for (const src of opts.sourceFiles) {
    const abs = resolve(src);
    try {
      statSync(abs);
    } catch {
      skipped.push(src);
      continue;
    }
    const filename = basename(abs);
    const dest = join(assetsDir, filename);
    // Clean up any prior symlink/file at the destination so re-scaffolding
    // is idempotent (otherwise symlinkSync throws EEXIST).
    try { unlinkSync(dest); } catch { /* dest didn't exist — fine */ }

    try {
      symlinkSync(abs, dest);
    } catch (err) {
      if (opts.copyOnSymlinkFailure !== false) {
        copyFileSync(abs, dest);
      } else {
        throw err;
      }
    }
    injected[src] = `assets/${filename}`;
  }

  return { injected, skipped };
}
