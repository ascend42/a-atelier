// #doc-management-types — shared types + pure validators for the doc-management
// bundle (create / duplicate / delete of .atelier docs inside a project).
//
// This module is the foundation that three parallel builders consume. It is
// intentionally I/O-free and import-free: pure types and two pure functions.
// Anything that touches disk, the doc schema, or the workspace lives in the
// builder modules that depend on these contracts.
//
// Aegis posture mirrors `isValidMediaBasenameForRename` in `rename-media.ts`:
// validators reject control bytes, path separators, parent-dir traversal,
// hidden-dot leaders, and out-of-range lengths. Slugging of the human-typed
// `name` into a filesystem-safe stem is the caller's concern (via
// `slugifyBasename`); this module only validates the raw input.

/**
 * Project kind that a NEW doc can be created as.
 *
 * Owner explicitly excluded "blank" from v1 — only the three named kinds.
 * Future v1.1 may add `undefined` for blank docs.
 */
export type DocKind = "video" | "image" | "carousel";

export interface CreateDocOptions {
  projectDir: string; // absolute
  name: string; // user-typed display name; slugged internally
  kind: DocKind;
  /** For carousel slides: place file under slides/ and append SlideRef to target carousel. */
  asCarouselSlide?: boolean;
  /** Required when asCarouselSlide:true — the carousel doc whose slides[] should receive the ref. Usually <projectDir>/project.atelier. */
  carouselDocPath?: string;
  /** Insertion index for SlideRef (default = append). */
  insertAt?: number;
}

export interface DuplicateDocOptions {
  projectDir: string;
  /** Project-relative path of the doc to duplicate (e.g. "slides/slide-1.atelier" or "scenes/intro.atelier"). */
  sourceDocPath: string;
  /** When source is a slide, also append a new SlideRef pointing at the duplicate. */
  appendSlideRef?: boolean;
}

export interface DeleteDocOptions {
  workspaceDir: string; // absolute — needed for workspace-wide SlideRef scrub
  projectName: string; // project subdir name; with workspaceDir gives projectDir
  /** Project-relative path of the doc to delete. */
  docPath: string;
}

export interface DocListEntry {
  /** Project-relative path. */
  path: string;
  /** When determinable from the doc's `kind` field; undefined if doc kind is absent or unrecognized. */
  kind?: "video" | "image" | "carousel";
}

export interface DocDeleteCascadeReport {
  /** Project-relative path of the doc that was deleted. */
  docPath: string;
  /** SlideRefs removed across the workspace. Each entry identifies the carousel project name + the index of the removed ref (PRE-removal index, in case multiple were removed). */
  slideRefsRemoved: Array<{ project: string; slideIndex: number }>;
  /** RefVisual layers in any .atelier across the workspace that still point at the deleted doc. These are NOT auto-removed; reported for surfacing as warnings. */
  refLayersDangling: Array<{ project: string; docPath: string; layerId: string }>;
}

export interface DocDuplicateReport {
  /** Source doc path (project-relative). */
  sourceDocPath: string;
  /** New doc path (project-relative). */
  newDocPath: string;
  /** When appendSlideRef was set and the source is a carousel slide: the index of the appended SlideRef. */
  appendedSlideIndex?: number;
}

/**
 * Aegis surface — same posture as `isValidMediaBasenameForRename` in rename-media.ts.
 * Validates a user-typed doc display name.
 *
 * Rejects:
 * - empty / whitespace-only
 * - leading dot (hidden files)
 * - any `/`, `\`, or `..` substring
 * - control bytes (NUL through 0x1f)
 * - longer than 200 characters
 *
 * The slug (kebab-case derivative) is computed elsewhere via `slugifyBasename`;
 * this validator only checks the raw human input.
 */
export function isValidDocName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 200) return false;
  if (trimmed.startsWith(".")) return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return false;
  // Reject control bytes (NUL through 0x1f). Use the escaped form, not literal
  // bytes — matches the Aegis Finding 4 (TD-2026-05-27) note in rename-media.ts
  // so a future linter / auto-format pass cannot silently mangle the class.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(trimmed)) return false;
  return true;
}