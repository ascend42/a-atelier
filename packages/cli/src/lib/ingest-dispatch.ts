// #ingest-dispatch — classify drag-drop media + route to the right composer.
//
// The studio HTTP server accepts an arbitrary file via `POST /api/media/ingest`
// (see #studio). Before slice B3 every upload went straight to
// `composeVideoProject`, which is wrong for images and audio. This module is
// the kind-aware dispatcher that decides, given (filename, currentProjectKind),
// which composer to invoke — or whether to reject the upload outright.
//
// Pure / synchronous / no fs — the caller wires the routing decision to its
// own composer calls and broadcast envelopes. Keeping the routing matrix in a
// pure helper makes it cheap to test the full 12-cell truth table without
// standing up the HTTP server.
//
// Routing matrix (see ingest-dispatch.test.ts for the table-driven tests):
//
//   file kind   project kind  →  target
//   ───────────────────────────────────
//   video       video/undef   →  compose-video
//   video       image         →  reject
//   video       carousel      →  reject
//   image       video         →  reject
//   image       image         →  reject
//   image       carousel      →  reject
//   image       undefined     →  compose-image
//   audio       video         →  add-audio-clip
//   audio       image         →  reject
//   audio       carousel      →  reject
//   audio       undefined     →  reject
//   unsupported *             →  reject

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { ProjectKind } from "@a-company/atelier-types";
import { readAtelierDoc, slugifyBasename } from "./compose-video-project.js";

/** Classification result for a media filename. */
export type IngestKind = "video" | "image" | "audio" | "unsupported";

/** Routing decision produced by `routeIngest`. */
export interface IngestRoute {
  kind: IngestKind;
  target: "compose-video" | "compose-image" | "add-audio-clip" | "reject";
  /** When target === "reject", the human-readable reason. */
  error?: string;
  /**
   * When set, the project-relative `.atelier` doc path the route resolved
   * to. Populated by `routeIngestWithTarget` for explicit canvas drops so the
   * server-side handler can pass it straight to the composer / audio-add path
   * without re-deriving via `computeIngestDocPath` or `findSingleVideoDoc`.
   *
   * Always undefined for the free `routeIngest` (no target) — that path keeps
   * the legacy "scaffold a fresh <slug>.atelier" semantics.
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

/**
 * Decide which composer (if any) should handle a drag-drop upload.
 *
 * `projectKind === undefined` means "no project.atelier exists yet — the
 * caller should scaffold a fresh project of the appropriate kind." Only
 * video+undefined and image+undefined are valid scaffold-on-ingest paths;
 * audio cannot establish a project on its own because it has no visual.
 */
export function routeIngest(
  filename: string,
  projectKind: ProjectKind | undefined,
): IngestRoute {
  const kind = classifyMediaFile(filename);

  if (kind === "unsupported") {
    return { kind, target: "reject", error: "file type not supported" };
  }

  if (kind === "video") {
    if (projectKind === undefined || projectKind === "video") {
      return { kind, target: "compose-video" };
    }
    if (projectKind === "image") {
      return {
        kind,
        target: "reject",
        error: "image projects are single-image; create a carousel to combine",
      };
    }
    // carousel
    return {
      kind,
      target: "reject",
      error: "carousel slides are added via the slides API, not drag-drop",
    };
  }

  if (kind === "image") {
    if (projectKind === undefined) {
      return { kind, target: "compose-image" };
    }
    if (projectKind === "video") {
      return {
        kind,
        target: "reject",
        error: "image drag-drop into video projects not supported in v1",
      };
    }
    if (projectKind === "image") {
      return {
        kind,
        target: "reject",
        error:
          "image project already has its image; use rename or delete first",
      };
    }
    // carousel
    return {
      kind,
      target: "reject",
      error: "carousel slides are added via the slides API, not drag-drop",
    };
  }

  // audio
  if (projectKind === "video") {
    return { kind, target: "add-audio-clip" };
  }
  if (projectKind === "image") {
    return {
      kind,
      target: "reject",
      error: "cannot add audio to image project",
    };
  }
  if (projectKind === "carousel") {
    return {
      kind,
      target: "reject",
      error: "cannot add audio to carousel project directly",
    };
  }
  // undefined
  return {
    kind,
    target: "reject",
    error:
      "audio cannot create a project; drag audio into an existing video project",
  };
}

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
  projectKind: ProjectKind | undefined,
  targetDocPath: string | undefined,
  targetDocKind: ProjectKind | undefined,
): IngestRoute {
  // Fall through to the no-target routing when the caller didn't pick a doc.
  if (targetDocPath === undefined) {
    return routeIngest(filename, projectKind);
  }

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
