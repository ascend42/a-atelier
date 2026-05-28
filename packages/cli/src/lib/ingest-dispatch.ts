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

import { extname } from "node:path";
import type { ProjectKind } from "@a-company/atelier-types";

/** Classification result for a media filename. */
export type IngestKind = "video" | "image" | "audio" | "unsupported";

/** Routing decision produced by `routeIngest`. */
export interface IngestRoute {
  kind: IngestKind;
  target: "compose-video" | "compose-image" | "add-audio-clip" | "reject";
  /** When target === "reject", the human-readable reason. */
  error?: string;
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
