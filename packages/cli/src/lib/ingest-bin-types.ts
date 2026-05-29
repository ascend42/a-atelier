/**
 * Types for the media-bin pivot (TD-2026-05-28).
 *
 * Post-pivot: drag-drop of media files no longer auto-creates docs. Files
 * land in `media/`, transcription runs in background, and creators
 * explicitly compose via `+ new doc` + sidebar-drag-to-canvas.
 */

/** Outcome of a no-target ingest (drag onto sidebar / page level). */
export interface BinAddResult {
  /** Workspace-relative path the file landed at — e.g. "media/foo.mp4". */
  mediaPath: string;
  /** File kind detected from extension. */
  fileKind: "video" | "image" | "audio";
  /** True iff background transcription was kicked off (video + audio only). */
  transcribePending: boolean;
}

/** Outcome when the dispatcher rejects a no-target ingest. */
export interface BinAddRejected {
  /** Why the file wasn't accepted into the media bin. */
  error: string;
  /** File extension we saw (lowercased) — useful for the toast message. */
  ext: string;
}

/**
 * Payload sent by the sidebar→canvas drag handoff. The file is already in
 * the project's media/ folder — no upload needed. The server routes
 * through composeVideoProject (or audio-add) using the existing media.
 */
export interface MediaRefPayload {
  /** Project-relative media path, e.g. "media/foo.mp4". Always under media/. */
  path: string;
  /** Optional file kind hint — server validates anyway. */
  kind?: "video" | "image" | "audio";
}

/** Validates a MediaRefPayload's path: must be under "media/" and contain no traversal. */
export function isValidMediaRefPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const trimmed = path.trim();
  if (trimmed.length === 0) return false;
  if (!trimmed.startsWith("media/")) return false;
  if (trimmed.includes("..") || trimmed.includes("\\")) return false;
  if (/[\x00-\x1f]/.test(trimmed)) return false;
  // basename portion must be a real filename (no slashes after the prefix).
  const rest = trimmed.slice("media/".length);
  if (rest.includes("/") || rest.length === 0) return false;
  return true;
}
