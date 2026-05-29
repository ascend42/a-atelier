// MediaProject helpers — the `<projectDir>/media/` convention.
//
// A Project's canonical home for source files of any type — videos, images,
// audio, fonts, animation files. Extends today's flat `source.mp4`
// convention (preserved for back-compat) into a directory so a Project can
// hold multiple media files of multiple kinds.
//
// This module is intentionally tiny: file IO + classification. The CLI verb
// `atelier media ingest|list|note` (commands/media.ts) sits on top and wires
// in transcription + notes scaffolding.

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

/** Subdirectory inside a project that holds source media. */
export const MEDIA_DIRNAME = "media";

/** Closed kind enum, matching the slot-kind extension table used in the MCP mind-map. */
export type MediaKind = "video" | "image" | "audio" | "font" | "other";

/**
 * Extension → kind table. Lifted from `packages/mcp/src/tools/mind-map.ts`
 * (KIND_EXTENSIONS) so kind detection stays consistent across the codebase.
 * Unknown extensions fall through to "other" rather than throwing — a creator
 * might drop a `.pen` design file or a `.psd` into media/ and we surface it.
 */
const KIND_EXTENSIONS: Record<Exclude<MediaKind, "other">, ReadonlySet<string>> = {
  video: new Set([".mp4", ".mov", ".webm", ".mkv", ".avi"]),
  image: new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]),
  audio: new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]),
  font: new Set([".ttf", ".otf", ".woff", ".woff2"]),
};

/** Absolute path to a project's `media/` directory. Does NOT create it. */
export function mediaDir(projectDir: string): string {
  return join(resolve(projectDir), MEDIA_DIRNAME);
}

/** Idempotent `mkdir -p` for a project's media dir. */
export function ensureMediaDir(projectDir: string): string {
  const dir = mediaDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Classify a file by extension. Returns "other" for anything not in the
 * KIND_EXTENSIONS table. Case-insensitive on the extension to handle the
 * `.MP4` capitalization Camera apps emit.
 */
export function classifyMedia(absPath: string): MediaKind {
  const ext = extname(absPath).toLowerCase();
  for (const [kind, exts] of Object.entries(KIND_EXTENSIONS) as Array<[
    Exclude<MediaKind, "other">,
    ReadonlySet<string>,
  ]>) {
    if (exts.has(ext)) return kind;
  }
  return "other";
}

/**
 * Predicate: is `absPath` a media file of the given (or any recognized) kind?
 * Extension-based — does not stat the file. `kind` defaults to "any
 * recognized kind", i.e. anything classified non-"other".
 */
export function isMediaFile(absPath: string, kind?: MediaKind): boolean {
  const classified = classifyMedia(absPath);
  if (kind === undefined) return classified !== "other";
  return classified === kind;
}

/** A single entry from `listMediaFiles`. */
export interface MediaListEntry {
  /** basename(file) */
  name: string;
  /** Absolute path on disk. */
  absPath: string;
  /** Classified kind. */
  kind: MediaKind;
  /** Lowercased extension including the leading dot (e.g. ".mp4"). */
  ext: string;
  /** Size in bytes from stat. */
  sizeBytes: number;
}

/**
 * Non-recursive listing of files in `<projectDir>/media/`. Returns an empty
 * array if `media/` does not exist (rather than throwing — common during a
 * fresh project). Files prefixed with `.` (hidden / OS detritus like
 * .DS_Store) are skipped, as are anything that looks like a notes sidecar
 * (`*.notes.md`) — those are accessed via the notes API, not the media
 * lister.
 *
 * Sorted by name for determinism (matters for tests and for human listing).
 */
export function listMediaFiles(projectDir: string): MediaListEntry[] {
  const dir = mediaDir(projectDir);
  if (!existsSync(dir)) return [];
  const stat = statSync(dir);
  if (!stat.isDirectory()) return [];

  const entries = readdirSync(dir).sort();
  const out: MediaListEntry[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (name.endsWith(".notes.md")) continue; // sidecar — not a media file
    const absPath = join(dir, name);
    let st;
    try {
      st = statSync(absPath);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.push({
      name,
      absPath,
      kind: classifyMedia(absPath),
      ext: extname(absPath).toLowerCase(),
      sizeBytes: st.size,
    });
  }
  return out;
}
