// MediaNotes — sidecar notes for a media file.
//
// Lives at `<media-file>.notes.md` next to every media file in a Project's
// `media/` directory. Structured YAML frontmatter (constraints + tags) plus a
// freeform Markdown body with conventional per-author headings (Lux notes,
// Quill notes, Iris notes, Creator notes). Inert artifact — pure data, no
// executables, no upload paths (TD-229, TD-271).
//
// The frontmatter is the contract Lux/Iris/Quill honor at slot-binding time:
//   - constraints.do_not[]  — non-negotiable exclusions
//   - constraints.prefer_for[]  — soft preference signals
//   - tags[]                — free-form labels the mind-map / scorer reads
//
// The body is the conversation log between the creator and the agent team.
// Each author appends to their own section (sentinel headings); idempotent
// replacement keeps the file readable across many sessions.

import { z } from "zod";

/**
 * Free-form string list that may not contain blank entries — used for tags,
 * do_not, and prefer_for. Empties are dropped at parse time so a forgotten
 * trailing dash in YAML doesn't break a build.
 */
const NonEmptyStringListSchema = z.array(z.string().min(1));

/** Optional constraint sub-object on a notes frontmatter. */
export const MediaNotesConstraintsSchema = z.object({
  /**
   * Hard exclusions. Lux + Iris MUST refuse to bind this media to a slot if
   * any do_not rule applies (the rule is a free-text string the agent reads
   * with judgement — e.g. "never use in a CTA beat", "no client logos").
   */
  do_not: NonEmptyStringListSchema.optional(),
  /**
   * Soft preferences — weight up candidacy when these conditions hold. Same
   * free-text shape as do_not but the polarity is positive ("good for hooks",
   * "prefer for warm tone").
   */
  prefer_for: NonEmptyStringListSchema.optional(),
}).strict();

export type MediaNotesConstraints = z.infer<typeof MediaNotesConstraintsSchema>;

/**
 * Frontmatter shape — the typed half of a `<file>.notes.md`. Required fields
 * (file/added/added_by) are written by `scaffoldMediaNotes` at ingest time;
 * everything else accumulates over the life of the project.
 */
export const MediaNotesFrontmatterSchema = z.object({
  /** Basename of the media file this notes file sits next to. */
  file: z.string().min(1),
  /** ISO 8601 timestamp captured at ingest. */
  added: z.string().min(1),
  /** User identifier (env $USER at ingest, "creator" fallback). */
  added_by: z.string().min(1),
  /** Free-form labels. Empty by default; agents and creator both append. */
  tags: NonEmptyStringListSchema.default([]),
  /** Optional do_not / prefer_for object. Absent means "no rules yet." */
  constraints: MediaNotesConstraintsSchema.optional(),
}).strict();

export type MediaNotesFrontmatter = z.infer<typeof MediaNotesFrontmatterSchema>;

/**
 * Whole-file shape — frontmatter plus the Markdown body. The body is parsed
 * as opaque text; the per-author section convention is enforced at write time
 * (via `appendNoteSection`) rather than at the schema level so creators can
 * freely edit the body without breaking validation.
 */
export const MediaNotesSchema = z.object({
  frontmatter: MediaNotesFrontmatterSchema,
  body: z.string(),
}).strict();

export type MediaNotes = z.infer<typeof MediaNotesSchema>;

/**
 * Closed enum of author identities recognized in per-section appends. Matches
 * the persona ids registered in `.paradigm/personas/index.yaml` (lux/quill/
 * iris) plus the `creator` self-author.
 */
export const MediaNotesAuthorSchema = z.enum(["lux", "quill", "iris", "creator"]);
export type MediaNotesAuthor = z.infer<typeof MediaNotesAuthorSchema>;

/**
 * Stable per-author heading text — exported for the CLI/MCP writers so the
 * sentinel format never drifts. Format: `## <Name> notes (<role>?)` where the
 * "(role)" suffix matches the canonical persona file for the named persona.
 */
export const MEDIA_NOTES_HEADINGS: Record<MediaNotesAuthor, string> = {
  lux: "## Lux notes (cinematographer)",
  quill: "## Quill notes (showrunner)",
  iris: "## Iris notes (composer)",
  creator: "## Creator notes",
};
