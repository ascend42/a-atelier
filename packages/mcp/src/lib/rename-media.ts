// #mcp-rename-media — atomic media-file rename cascade for the MCP rename tool.
//
// **Intentional duplication** of `packages/cli/src/lib/rename-media.ts`.
// MCP cannot import from `@a-company/atelier` (the CLI package) because
// `cli → mcp` already runs in the dep graph — re-importing back would close
// the cycle. The same duplication convention is used by `./timeline-ops.ts`
// and by recipes.ts / overlays.ts / effective-transcript.ts / media-notes.ts
// in the tools/ directory.
//
// If the canonical implementation in cli/lib/rename-media.ts changes semantics,
// this file MUST be kept in sync — there is no shared package between mcp and
// cli for these primitives in v1.0. Lifting media-cascade ops into a shared
// package is tracked alongside the timeline-ops follow-up.
//
// Behavior mirror (see cli/lib/rename-media.ts for the long-form spec):
//   1. media/<old> → media/<new>
//   2. transcripts/<old-stem>.json → transcripts/<new-stem>.json (when present)
//   3. project.atelier: rewrite assets[*].src, layers[*].visual.src,
//      timeline.tracks[*].clips[*].source via `recomputeTimeline`
//   4. Warnings for DESIGN/SCRIPT/STORYBOARD.md references (no rewrite)
// Two-phase with rollback so a mid-op failure never leaves a half-renamed state.

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
// MUST mirror the cli/lib/rename-media.ts implementation per the duplication
// convention — see header comment.
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
  docUpdated: boolean;
  transcriptRenamed: boolean;
  assetKeysUpdated: string[];
  layersUpdated: string[];
  timelineRegenerated: boolean;
  warnings: string[];
}

function readAtelierDoc(absPath: string): AtelierDocument {
  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseAtelier(raw);
  if (parsed.success) return parsed.data as AtelierDocument;
  return JSON.parse(raw) as AtelierDocument;
}

function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

function srcReferencesBasename(src: string | undefined, oldBasename: string): boolean {
  if (typeof src !== "string" || src.length === 0) return false;
  if (src === oldBasename) return true;
  if (src === `media/${oldBasename}`) return true;
  if (src.endsWith(`/${oldBasename}`)) return true;
  return false;
}

function rewriteSrc(src: string, oldBasename: string, newBasename: string): string {
  if (src === oldBasename) return newBasename;
  if (src === `media/${oldBasename}`) return `media/${newBasename}`;
  if (src.endsWith(`/${oldBasename}`)) {
    return src.slice(0, -oldBasename.length) + newBasename;
  }
  return src;
}

export function applyMediaRenameToDoc(
  doc: AtelierDocument,
  oldBasename: string,
  newBasename: string,
): { doc: AtelierDocument; assetKeysUpdated: string[]; layersUpdated: string[] } {
  const assetKeysUpdated: string[] = [];
  const layersUpdated: string[] = [];

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
      // Non-fatal.
    }
  }
  return warnings;
}

/**
 * Atomic media-rename cascade with two-phase rollback. See header comment +
 * cli/lib/rename-media.ts for the long-form spec.
 */
export async function renameMedia(opts: RenameMediaOptions): Promise<RenameMediaResult> {
  const projectDir = resolve(opts.projectDir);
  const oldBasename = opts.oldBasename;
  const newBasename = opts.newBasename;

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
  // See cli/lib/rename-media.ts for the long-form rationale (Aegis Finding 3).
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

  const docPath = join(projectDir, "project.atelier");
  if (!existsSync(docPath)) {
    throw new Error(`renameMedia: missing project.atelier at ${docPath}`);
  }
  const originalDoc = readAtelierDoc(docPath);
  const walked = applyMediaRenameToDoc(originalDoc, oldBasename, newBasename);

  const hadTimeline = originalDoc.timeline !== undefined;
  const newDoc = recomputeTimeline(walked.doc);
  const hasTimelineAfter = newDoc.timeline !== undefined;
  const timelineRegenerated = hadTimeline || hasTimelineAfter;

  const warnings = scanArtifactsForOldBasename(projectDir, oldBasename);

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

  // Phase 2 — disk writes with rollback.
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

  let transcriptRenamed = false;
  if (transcriptExists) {
    try {
      renameSync(transcriptOldAbs, transcriptNewAbs);
      transcriptRenamed = true;
    } catch (err) {
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

  try {
    writeFileSync(docPath, JSON.stringify(newDoc, null, 2), "utf-8");
  } catch (err) {
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

/**
 * Path-traversal defense for media basenames. Rejects any value containing
 * a directory separator, `..`, leading `.`, or NUL / control bytes. Used by
 * the MCP tool wrapper and re-implementable by the studio HTTP layer.
 */
export function isValidMediaBasenameForRename(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0) return false;
  if (name !== name.trim()) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name === "." || name === "..") return false;
  if (name.startsWith(".")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}
