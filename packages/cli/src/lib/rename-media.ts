// #rename-media — atomic media-file rename cascade.
//
// One creator-visible operation, multiple on-disk + in-doc effects:
//   1. `<projectDir>/media/<oldBasename>` → `<projectDir>/media/<newBasename>`.
//   2. `<projectDir>/transcripts/<oldStem>.json` → `transcripts/<newStem>.json`
//      (when present; absence is fine).
//   3. `<projectDir>/project.atelier`:
//        a. Every `assets[key].src` referencing the old basename is rewritten
//           to the new basename. The KEY itself is preserved per the
//           TD-2026-05-27 decision (`clip-<slug>` provenance is stable).
//        b. Every `layers[i].visual.src` (video / audio / image) referencing
//           the old basename is rewritten.
//        c. Every `timeline.tracks[*].clips[*].source` referencing the old
//           basename is rewritten via `recomputeTimeline` from #timeline-ops.
//   4. Warnings for DESIGN.md / SCRIPT.md / STORYBOARD.md references to the
//      old basename — NOT rewritten in v1 (warning-only).
//
// Two-phase with rollback so a mid-op failure never leaves the project in a
// half-renamed state:
//   - Phase 1 stages every change in memory. Disk untouched.
//   - Phase 2 writes (media rename → transcript rename → doc write). On
//     failure at any step, the prior disk writes are reversed best-effort
//     before the original error is rethrown.
//
// Pure helpers (the doc walk, the warning scan) are extracted as testable
// functions; the public `renameMedia` glues them together with the fs ops.

import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import type { AtelierDocument, Asset, Layer } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";
import { recomputeTimeline } from "./timeline-ops.js";

// ── Per-project mutex (Aegis Finding 3, TD-2026-05-27) ───────────────
// In-process serialization keyed by resolved projectDir. Prevents two
// concurrent `renameMedia` calls on the SAME project from racing through
// the two-phase fs ops and corrupting the doc / leaving orphaned files.
// Different projects do NOT block each other (each gets its own queue).
//
// Why a Map of promises (vs. a real lock): single-process Node, no shared
// state between workers. The chained `.then` is the queue; the latest
// settled promise gets garbage-collected when no waiters reference it.
const renameLocks = new Map<string, Promise<unknown>>();

/** Options for `renameMedia`. */
export interface RenameMediaOptions {
  /** Absolute path to the project root (contains project.atelier + media/). */
  projectDir: string;
  /** Basename inside `media/`, e.g. `IMG_7346.MOV`. */
  oldBasename: string;
  /** New basename inside `media/`. */
  newBasename: string;
  /** When true, computes the result but skips every disk write. */
  dryRun?: boolean;
}

/** Result of `renameMedia`. */
export interface RenameMediaResult {
  /** True iff project.atelier was rewritten on disk. */
  docUpdated: boolean;
  /** True iff a transcript file was renamed on disk. */
  transcriptRenamed: boolean;
  /**
   * Asset keys whose `.src` was updated. The keys themselves DO NOT change
   * (TD-2026-05-27: `clip-<slug>` is stable provenance).
   */
  assetKeysUpdated: string[];
  /** Layer ids whose `visual.src` was updated. */
  layersUpdated: string[];
  /**
   * True iff a `timeline` block was present in the doc and was recomputed.
   * Note: when only the assets / visuals are touched, recomputeTimeline still
   * walks the doc and emits / refreshes the block when track groups exist.
   */
  timelineRegenerated: boolean;
  /**
   * Human-readable warnings — e.g. "DESIGN.md references old path 'IMG_7346.MOV'".
   * These artifacts are NOT modified by this v1; they're surfaced so the caller
   * (CLI / studio / agent) can prompt the creator to fix them.
   */
  warnings: string[];
}

/** Read `project.atelier` with the parseAtelier + JSON.parse fallback dance. */
function readAtelierDoc(absPath: string): AtelierDocument {
  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseAtelier(raw);
  if (parsed.success) return parsed.data as AtelierDocument;
  return JSON.parse(raw) as AtelierDocument;
}

/** `IMG_7346.MOV` → `IMG_7346`. */
function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * True when `src` references the given media basename. We match both the
 * literal basename (e.g. `IMG_7346.MOV`) AND the path form `media/<basename>`
 * — both shapes appear in the wild (the compose pipeline emits one, hand-edits
 * sometimes the other). False for empty / undefined inputs.
 */
function srcReferencesBasename(src: string | undefined, oldBasename: string): boolean {
  if (typeof src !== "string" || src.length === 0) return false;
  if (src === oldBasename) return true;
  if (src === `media/${oldBasename}`) return true;
  // Endswith match catches subpath variants without false-positiving on
  // unrelated names (we anchor with a path separator).
  if (src.endsWith(`/${oldBasename}`)) return true;
  return false;
}

/**
 * Rewrite an old-basename reference in a `src` string to use the new basename,
 * preserving any directory prefix the old value had.
 *
 * `media/IMG_7346.MOV` + new=`IMG_NEW.MOV` → `media/IMG_NEW.MOV`.
 * Bare basename → bare new basename.
 */
function rewriteSrc(src: string, oldBasename: string, newBasename: string): string {
  if (src === oldBasename) return newBasename;
  if (src === `media/${oldBasename}`) return `media/${newBasename}`;
  if (src.endsWith(`/${oldBasename}`)) {
    return src.slice(0, -oldBasename.length) + newBasename;
  }
  return src;
}

/**
 * Pure doc walk. Returns a new doc with old-basename references rewritten to
 * new-basename, plus the lists of asset keys / layer ids touched. Does NOT
 * mutate input. Caller is responsible for `recomputeTimeline` after.
 */
export function applyMediaRenameToDoc(
  doc: AtelierDocument,
  oldBasename: string,
  newBasename: string,
): { doc: AtelierDocument; assetKeysUpdated: string[]; layersUpdated: string[] } {
  const assetKeysUpdated: string[] = [];
  const layersUpdated: string[] = [];

  // Asset map: rewrite .src; keep the KEY stable per TD-2026-05-27.
  let newAssets: Record<string, Asset> | undefined = undefined;
  if (doc.assets && typeof doc.assets === "object") {
    const out: Record<string, Asset> = {};
    for (const [key, asset] of Object.entries(doc.assets)) {
      if (asset && typeof asset === "object" && srcReferencesBasename(asset.src, oldBasename)) {
        out[key] = { ...asset, src: rewriteSrc(asset.src, oldBasename, newBasename) };
        assetKeysUpdated.push(key);
      } else {
        out[key] = asset;
      }
    }
    newAssets = out;
  }

  // Layers: rewrite visual.src for video / audio / image visuals. We do NOT
  // touch visual.assetId — the assetId is the asset key, and per the stable-key
  // decision the key doesn't change.
  const newLayers: Layer[] = doc.layers.map((layer) => {
    const v = layer.visual;
    if (!v || (v.type !== "video" && v.type !== "audio" && v.type !== "image")) {
      return layer;
    }
    const visualWithSrc = v as { type: string; src?: string };
    if (!srcReferencesBasename(visualWithSrc.src, oldBasename)) return layer;
    layersUpdated.push(layer.id);
    return {
      ...layer,
      visual: {
        ...v,
        src: rewriteSrc(visualWithSrc.src as string, oldBasename, newBasename),
      },
    } as Layer;
  });

  const out: AtelierDocument = { ...doc, layers: newLayers };
  if (newAssets !== undefined) out.assets = newAssets;
  return { doc: out, assetKeysUpdated, layersUpdated };
}

/**
 * Scan DESIGN.md / SCRIPT.md / STORYBOARD.md for substring references to the
 * old basename. v1 is warning-only — files are NOT rewritten — because a
 * basename mention might appear inside backtick-fenced examples, prior-art
 * citations, etc. False positives are accepted; the creator can spot-check.
 */
export function scanArtifactsForOldBasename(
  projectDir: string,
  oldBasename: string,
): string[] {
  const warnings: string[] = [];
  const artifactFiles = ["DESIGN.md", "SCRIPT.md", "STORYBOARD.md"];
  for (const name of artifactFiles) {
    const absPath = join(projectDir, name);
    if (!existsSync(absPath)) continue;
    try {
      const raw = readFileSync(absPath, "utf-8");
      if (raw.includes(oldBasename)) {
        warnings.push(`${name} references old path '${oldBasename}'`);
      }
    } catch {
      // Non-fatal: a present-but-unreadable artifact just doesn't get scanned.
    }
  }
  return warnings;
}

/**
 * Atomic media-rename cascade with two-phase rollback.
 *
 * Phase 1 (memory): load doc → apply rename walk → recompute timeline → scan
 * artifacts for warnings. No disk writes.
 *
 * Phase 2 (disk): rename media → rename transcript (if present) → write doc.
 * If any step throws, prior steps are reverse-rolled-back best-effort before
 * the original error is rethrown.
 *
 * Edge cases:
 *   - `oldBasename === newBasename` → no-op result (everything false / empty).
 *   - `media/<oldBasename>` missing → throws "media file not found".
 *   - `media/<newBasename>` already exists → throws BEFORE any rename.
 *   - `media/` dir missing → throws "project has no media/ dir".
 *   - Doc references nothing → still renames file + transcript; returns
 *     empty `assetKeysUpdated` / `layersUpdated` arrays.
 *   - `dryRun: true` → reports what WOULD have changed via the lists, but
 *     every boolean (`docUpdated`, `transcriptRenamed`, `timelineRegenerated`)
 *     is `false` and nothing is touched on disk.
 */
export async function renameMedia(opts: RenameMediaOptions): Promise<RenameMediaResult> {
  const projectDir = resolve(opts.projectDir);
  const oldBasename = opts.oldBasename;
  const newBasename = opts.newBasename;

  // Same-name no-op — short-circuit; do not even touch disk.
  if (oldBasename === newBasename) {
    return {
      docUpdated: false,
      transcriptRenamed: false,
      assetKeysUpdated: [],
      layersUpdated: [],
      timelineRegenerated: false,
      warnings: [],
    };
  }

  // ── per-project critical section ────────────────────────────
  // Two concurrent calls on the SAME projectDir serialize behind one another.
  // The second call sees post-first-rename state (most likely the source file
  // is now gone → "media file not found"), which is the safe outcome —
  // either ordering is fine, just not a race.
  const lockKey = projectDir;
  const prev = renameLocks.get(lockKey) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(() => renameMediaImpl(projectDir, oldBasename, newBasename, opts.dryRun));
  renameLocks.set(lockKey, run);
  try {
    return await run;
  } finally {
    if (renameLocks.get(lockKey) === run) renameLocks.delete(lockKey);
  }
}

async function renameMediaImpl(
  projectDir: string,
  oldBasename: string,
  newBasename: string,
  dryRun: boolean | undefined,
): Promise<RenameMediaResult> {
  // Resolve key paths up front so all "would-be" checks share one truth.
  const mediaDir = join(projectDir, "media");
  if (!existsSync(mediaDir)) {
    throw new Error(`renameMedia: project has no media/ dir at ${mediaDir}`);
  }
  const mediaOldAbs = join(mediaDir, oldBasename);
  const mediaNewAbs = join(mediaDir, newBasename);
  if (!existsSync(mediaOldAbs)) {
    throw new Error(`renameMedia: media file not found: ${mediaOldAbs}`);
  }
  if (existsSync(mediaNewAbs)) {
    throw new Error(`renameMedia: destination file already exists: ${mediaNewAbs}`);
  }

  const transcriptsDir = join(projectDir, "transcripts");
  const transcriptOldAbs = join(transcriptsDir, `${stripExt(oldBasename)}.json`);
  const transcriptNewAbs = join(transcriptsDir, `${stripExt(newBasename)}.json`);
  const transcriptExists = existsSync(transcriptOldAbs);

  // ── Phase 1 — stage in memory ─────────────────────────────────
  const docPath = join(projectDir, "project.atelier");
  if (!existsSync(docPath)) {
    throw new Error(`renameMedia: missing project.atelier at ${docPath}`);
  }
  const originalDoc = readAtelierDoc(docPath);
  const walked = applyMediaRenameToDoc(originalDoc, oldBasename, newBasename);

  // recomputeTimeline strips any stale timeline block when no track groups
  // exist, or rebuilds it when they do — which is what we want either way.
  const hadTimeline = originalDoc.timeline !== undefined;
  const newDoc = recomputeTimeline(walked.doc);
  const hasTimelineAfter = newDoc.timeline !== undefined;
  const timelineRegenerated = hadTimeline || hasTimelineAfter;

  const warnings = scanArtifactsForOldBasename(projectDir, oldBasename);

  // ── Dry-run short-circuit ─────────────────────────────────────
  if (dryRun === true) {
    return {
      docUpdated: false,
      transcriptRenamed: false,
      assetKeysUpdated: walked.assetKeysUpdated,
      layersUpdated: walked.layersUpdated,
      timelineRegenerated: false,
      warnings,
    };
  }

  // ── Phase 2 — disk writes with rollback ───────────────────────
  // Step (a): rename the media file.
  // NOTE: Per Aegis security audit (TD-2026-05-27, Finding 2),
  // `renameSync` does NOT follow symlinks — it renames the link itself.
  // This is the desired behavior: a symlink in media/ stays a symlink
  // after rename. Dangling symlinks at the destination are extremely
  // rare in the local-only threat model; tracked as an aspect
  // (~rename-symlink-passthrough). If symlink handling becomes
  // load-bearing, switch to `lstatSync` for destination checks.
  let mediaRenamed = false;
  try {
    renameSync(mediaOldAbs, mediaNewAbs);
    mediaRenamed = true;
  } catch (err) {
    throw new Error(
      `renameMedia: failed to rename media file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step (b): rename transcript if present.
  let transcriptRenamed = false;
  if (transcriptExists) {
    try {
      renameSync(transcriptOldAbs, transcriptNewAbs);
      transcriptRenamed = true;
    } catch (err) {
      // Rollback step (a) best-effort.
      try {
        renameSync(mediaNewAbs, mediaOldAbs);
      } catch (rbErr) {
        console.error(
          `renameMedia: CRITICAL — rollback of media rename failed: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
        );
      }
      throw new Error(
        `renameMedia: failed to rename transcript: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Step (c): write the doc.
  try {
    writeFileSync(docPath, JSON.stringify(newDoc, null, 2), "utf-8");
  } catch (err) {
    // Rollback step (b) then step (a). Each in its own try/catch — a
    // rollback failure must NOT swallow the original error.
    if (transcriptRenamed) {
      try {
        renameSync(transcriptNewAbs, transcriptOldAbs);
      } catch (rbErr) {
        console.error(
          `renameMedia: CRITICAL — rollback of transcript rename failed: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
        );
      }
    }
    if (mediaRenamed) {
      try {
        renameSync(mediaNewAbs, mediaOldAbs);
      } catch (rbErr) {
        console.error(
          `renameMedia: CRITICAL — rollback of media rename failed: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`,
        );
      }
    }
    throw new Error(
      `renameMedia: failed to write project.atelier: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    docUpdated: true,
    transcriptRenamed,
    assetKeysUpdated: walked.assetKeysUpdated,
    layersUpdated: walked.layersUpdated,
    timelineRegenerated,
    warnings,
  };
}

/** Re-exported helper for the studio HTTP layer's basename validation. */
export function isValidMediaBasenameForRename(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0) return false;
  if (name !== name.trim()) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  if (name.startsWith(".")) return false;
  // Reject any segment containing only dots (e.g. "...").
  // Reject NUL / control chars (control range is 0x00-0x1F).
  // Aegis Finding 4 (TD-2026-05-27): use the ESCAPED \x?? form so
  // a future linter / auto-format pass cannot silently mangle the
  // literal-byte class. Both the CLI and the MCP duplicate use
  // the same regex shape.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}
