// #ingest-dispatch — classify drag-drop media + route to the right destination.
//
// The studio HTTP server accepts an arbitrary file via `POST /api/media/ingest`
// (see #studio). Two routing pathways live here:
//
// ── v1.0 media-bin pivot (Kit-A) ──────────────────────────────────────
// `routeIngest(filename)` — NO TARGET path. Post-pivot (TD-2026-05-28) a drop
// onto the sidebar / page level NO LONGER auto-creates a doc. Files land in
// `media/` only; composition is explicit (`+ new doc` then sidebar-drag-to-
// canvas). The dispatcher collapses to a 4-cell truth table:
//
//   file kind     →  target
//   ──────────────────────────────
//   video         →  add-to-bin
//   image         →  add-to-bin
//   audio         →  add-to-bin
//   unsupported   →  reject
//
// Project kind no longer matters for the no-target ingest — the file is the
// file. Composition decisions happen later via the canvas-area drop (which is
// the target-set path below).
// ──────────────────────────────────────────────────────────────────────
//
// `routeIngestWithTarget(filename, targetDocPath, targetDocKind)` — TARGET-SET
// path. The browser canvas drop carries the loaded doc's path; routing is
// then governed by the TARGET doc's kind. Unchanged by the pivot — this is
// where actual composition happens.
//
// Pure / synchronous / no fs — the caller wires the routing decision to its
// own composer calls and broadcast envelopes.

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { ProjectKind } from "@a-company/atelier-types";
import { readAtelierDoc, slugifyBasename } from "./compose-video-project.js";

/** Classification result for a media filename. */
export type IngestKind = "video" | "image" | "audio" | "unsupported";

/**
 * Routing decision for a no-target ingest (file lands in the media bin).
 *
 * Post-pivot (TD-2026-05-28): either the file is a supported media kind and
 * goes to `add-to-bin`, or it's unsupported and we reject. Project kind no
 * longer factors in — composition is a separate, explicit step.
 */
export interface BinIngestRoute {
  kind: IngestKind;
  target: "add-to-bin" | "reject";
  /** When target === "reject", the human-readable reason. */
  error?: string;
}

/**
 * Routing decision for an explicit-target ingest (canvas-area drop).
 *
 * The target-set path still uses the legacy four-way target enum since it
 * really does dispatch to compose-video / add-audio-clip / etc.
 */
export interface IngestRoute {
  kind: IngestKind;
  target: "compose-video" | "compose-image" | "add-audio-clip" | "reject";
  /** When target === "reject", the human-readable reason. */
  error?: string;
  /**
   * When set, the project-relative `.atelier` doc path the route resolved
   * to. Populated by `routeIngestWithTarget` for explicit canvas drops so the
   * server-side handler can pass it straight to the composer / audio-add path
   * without re-deriving.
   */
  docPath?: string;
}

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"]);

/**
 * Classify a media filename by its extension. Case-insensitive — `.MOV` and
 * `.mov` both yield `"video"`. Returns `"unsupported"` for anything outside
 * the known video/image/audio extension lists, including files with no
 * extension at all.
 */
export function classifyMediaFile(filename: string): IngestKind {
  const ext = extname(filename).toLowerCase();
  if (!ext) return "unsupported";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return "unsupported";
}

// ── v1.0 media-bin pivot (Kit-A) ──────────────────────────────────────
/**
 * Route a no-target ingest into the project's media bin.
 *
 * Post-pivot (TD-2026-05-28) the no-target path doesn't care about project
 * kind — supported media always goes to `add-to-bin`, unsupported types are
 * rejected. Composition is a separate explicit step downstream.
 *
 * Mirrors `classifyMediaFile` for the kind detection; the routing decision is
 * a pure function of the filename.
 */
export function routeIngest(filename: string): BinIngestRoute {
  const kind = classifyMediaFile(filename);
  if (kind === "unsupported") {
    return { kind, target: "reject", error: "file type not supported" };
  }
  return { kind, target: "add-to-bin" };
}
// ──────────────────────────────────────────────────────────────────────

/**
 * Routing matrix for explicit "add to this specific doc" drops (canvas-area
 * drag-drop, post-pivot). When the browser knows which doc is loaded in the
 * canvas, it sends `targetDocPath` + the target doc's `kind`; the routing
 * decision is then governed by the TARGET doc's kind — not the project's
 * inferred kind — because the user picked a specific doc.
 *
 *   file kind   target doc kind  →  target
 *   ─────────────────────────────────────
 *   video       video            →  compose-video    (docPath = targetDocPath)
 *   audio       video            →  add-audio-clip   (docPath = targetDocPath)
 *   image       *                →  reject (v1)
 *   video       image / carousel →  reject
 *   audio       image / carousel →  reject
 *   unsupported *                →  reject
 *
 * Pure / synchronous. The caller is responsible for verifying the target doc
 * exists on disk and reading its kind — this function only encodes the
 * compatibility matrix and produces the route decision.
 */
export function routeIngestWithTarget(
  filename: string,
  targetDocPath: string,
  targetDocKind: ProjectKind | undefined,
): IngestRoute {
  const kind = classifyMediaFile(filename);

  if (kind === "unsupported") {
    return { kind, target: "reject", error: "file type not supported" };
  }

  // Caller must supply the target doc's kind once a path is set.
  if (targetDocKind === undefined) {
    return {
      kind,
      target: "reject",
      error: "target doc kind unresolved",
    };
  }

  if (kind === "video") {
    if (targetDocKind === "video") {
      return { kind, target: "compose-video", docPath: targetDocPath };
    }
    return {
      kind,
      target: "reject",
      error:
        targetDocKind === "image"
          ? "cannot add video clip to an image doc"
          : "cannot add video clip to a carousel doc",
    };
  }

  if (kind === "audio") {
    if (targetDocKind === "video") {
      return { kind, target: "add-audio-clip", docPath: targetDocPath };
    }
    return {
      kind,
      target: "reject",
      error:
        targetDocKind === "image"
          ? "cannot add audio to an image doc"
          : "cannot add audio to a carousel doc",
    };
  }

  // image — out of scope for v1 explicit-target drops; the user can swap an
  // image doc's source via rename, or compose a carousel via the slides API.
  return {
    kind,
    target: "reject",
    error: "image drag-drop into an existing doc not supported in v1",
  };
}

/** Cap on `<slug>-N` collision attempts before we give up. Mirrors createDoc. */
const MAX_INGEST_COLLISION_ATTEMPTS = 999;

/**
 * Compute the project-relative `.atelier` doc path a drag-drop ingest should
 * target. Slugs the source basename, then collision-suffixes with `-1`, `-2`,
 * ... up to 999.
 *
 * Examples:
 * - `IMG_7346.MOV` → `img-7346.atelier`
 * - `IMG_7346.MOV` (when `img-7346.atelier` exists) → `img-7346-1.atelier`
 * - `media/B-roll Clip.mp4` → `b-roll-clip.atelier`
 *
 * Returns a project-relative filename (no subdirectory). The caller passes it
 * straight to `composeVideoProject({ docPath })` / `composeImageProject({ docPath })`.
 *
 * Post-pivot: every drag-drop creates its OWN .atelier doc — there is no
 * shared `project.atelier`. See Wave 3 retarget (TD-2026-05-27).
 */
export function computeIngestDocPath(
  projectDir: string,
  sourceFilename: string,
): string {
  const slug = slugifyBasename(sourceFilename);
  if (!slug) {
    throw new Error(
      `computeIngestDocPath: cannot derive a slug from "${sourceFilename}"`,
    );
  }
  for (let attempt = 0; attempt <= MAX_INGEST_COLLISION_ATTEMPTS; attempt++) {
    const candidateStem = attempt === 0 ? slug : `${slug}-${attempt}`;
    const candidateName = `${candidateStem}.atelier`;
    const candidateAbs = join(projectDir, candidateName);
    if (!existsSync(candidateAbs)) {
      return candidateName;
    }
  }
  throw new Error("computeIngestDocPath: collision suffix exhausted (999 attempts)");
}

/**
 * Locate the single kind:"video" doc inside a project so an audio drag-drop
 * can target it. Returns the project-relative path or `null` when there is
 * zero or more-than-one video doc.
 *
 * The lenient fallback for the audio-into-video routing post-pivot — there is
 * no studio header that tells the ingest handler "which doc is loaded", so we
 * unambiguously route only when the choice is unambiguous. The caller turns a
 * null into a 400 with "open a video doc first" so the creator knows why.
 *
 * Scope: project root + `slides/` subdir (mirrors `listDocs`). Reads each
 * candidate to discover its kind; non-parseable files are skipped silently.
 */
export function findSingleVideoDoc(projectDir: string): string | null {
  const matches: string[] = [];
  for (const sub of ["", "slides"] as const) {
    const dirAbs = sub ? join(projectDir, sub) : projectDir;
    let entries: string[];
    try {
      entries = readdirSync(dirAbs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".atelier")) continue;
      if (name === ".atelier") continue;
      const abs = join(dirAbs, name);
      try {
        const st = statSync(abs);
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      try {
        const doc = readAtelierDoc(abs);
        if (doc.kind === "video") {
          matches.push(sub ? `${sub}/${name}` : name);
        }
      } catch {
        // unparseable — skip
      }
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}
