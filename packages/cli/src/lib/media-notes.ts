// Media-notes IO — `<media-file>.notes.md` sidecar reader/writer.
//
// The notes file lives next to its media file, sharing the basename with
// `.notes.md` appended. Hand-rolled here, like learning-mode.ts: the
// frontmatter is tiny enough that we don't bring in the `yaml` package
// just for read/write. The body is opaque Markdown.
//
// Per-author sections use sentinel headings declared in
// `@a-company/atelier-schema` (MEDIA_NOTES_HEADINGS). appendNoteSection
// replaces an existing section in-place rather than duplicating it, so the
// file stays readable across many sessions where each author writes once
// per session.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  MEDIA_NOTES_HEADINGS,
  MediaNotesFrontmatterSchema,
  type MediaNotes,
  type MediaNotesAuthor,
  type MediaNotesFrontmatter,
} from "@a-company/atelier-schema";
import { basename } from "node:path";

/** Sidecar filename suffix appended to every media file's basename. */
export const MEDIA_NOTES_SUFFIX = ".notes.md";

/**
 * Compute the canonical notes-file path for a media file. Pure function,
 * does not touch the filesystem.
 */
export function notesPathFor(mediaAbsPath: string): string {
  return `${mediaAbsPath}${MEDIA_NOTES_SUFFIX}`;
}

/**
 * Read a notes file. Returns `null` when:
 *   - the file does not exist (the typical "fresh project" case)
 *   - the file is malformed (the frontmatter doesn't parse, or doesn't pass
 *     the Zod schema). We pick null-over-throw here because the read side is
 *     used by agents at slot-resolution time and a corrupt note shouldn't
 *     break the build — it should surface a warning at next-write.
 *
 * Frontmatter syntax: a literal `---` line at file start, YAML until the
 * next `---` line, then the body. Matches the convention used by
 * `parseDesign` / `parseScript` / `parseStoryboard` in the artifact pipeline.
 */
export function readMediaNotes(notesPath: string): MediaNotes | null {
  if (!existsSync(notesPath)) return null;

  const raw = readFileSync(notesPath, "utf-8");
  const split = splitFrontmatter(raw);
  if (split === null) return null;

  let parsedFrontmatter: unknown;
  try {
    parsedFrontmatter = parseYaml(split.frontmatter);
  } catch {
    return null;
  }

  const validated = MediaNotesFrontmatterSchema.safeParse(parsedFrontmatter);
  if (!validated.success) return null;

  return {
    frontmatter: validated.data,
    body: split.body,
  };
}

/**
 * Write a notes file. Always emits the canonical `---\n<yaml>\n---\n\n<body>`
 * shape; the body is written verbatim (trailing newline ensured).
 */
export function writeMediaNotes(notesPath: string, notes: MediaNotes): void {
  const yamlText = stringifyYaml(notes.frontmatter);
  const body = notes.body.endsWith("\n") ? notes.body : `${notes.body}\n`;
  const content = `---\n${yamlText}---\n\n${body}`;
  writeFileSync(notesPath, content, "utf-8");
}

/**
 * Scaffold a fresh notes file next to a media file. If a notes file already
 * exists, preserve it untouched — the creator's prior context (and any prior
 * agent annotations) trump a re-ingest of the same media. Returns the path
 * and an action discriminator the caller surfaces to the creator.
 */
export function scaffoldMediaNotes(
  mediaAbsPath: string,
  opts: { addedBy: string; now?: Date },
): { path: string; action: "created" | "preserved" } {
  const path = notesPathFor(mediaAbsPath);
  if (existsSync(path)) {
    return { path, action: "preserved" };
  }
  const now = (opts.now ?? new Date()).toISOString();
  const frontmatter: MediaNotesFrontmatter = {
    file: basename(mediaAbsPath),
    added: now,
    added_by: opts.addedBy,
    tags: [],
  };
  const body = SCAFFOLD_BODY;
  writeMediaNotes(path, { frontmatter, body });
  return { path, action: "created" };
}

/**
 * Append or replace an author's notes section in an existing notes file.
 * Idempotent per author: a second call with the same author replaces that
 * author's prior section rather than duplicating it. Section boundaries are
 * detected by sentinel headings (MEDIA_NOTES_HEADINGS) — any line starting
 * with `## ` ends the current section.
 *
 * If the notes file doesn't exist yet, this throws — callers must scaffold
 * first via `scaffoldMediaNotes`. (Writing notes without a frontmatter would
 * silently destroy the convention.)
 */
export function appendNoteSection(
  notesPath: string,
  author: MediaNotesAuthor,
  section: string,
): void {
  if (!existsSync(notesPath)) {
    throw new Error(
      `notes file does not exist: ${notesPath} — scaffold via scaffoldMediaNotes() first`,
    );
  }

  const existing = readMediaNotes(notesPath);
  if (existing === null) {
    throw new Error(
      `notes file at ${notesPath} is malformed — refusing to append a section ` +
      `to a file with unparseable frontmatter`,
    );
  }

  const heading = MEDIA_NOTES_HEADINGS[author];
  const trimmedSection = section.trim();
  const newSectionBlock = `${heading}\n${trimmedSection}\n`;

  const updatedBody = upsertAuthorSection(existing.body, heading, newSectionBlock);
  writeMediaNotes(notesPath, { ...existing, body: updatedBody });
}

// ─── Helpers ─────────────────────────────────────────────────────

/** The starter body written into a freshly-scaffolded notes file. */
const SCAFFOLD_BODY = `${MEDIA_NOTES_HEADINGS.lux}
> (Lux will write composition + palette + staging notes here when she first uses this media.)

${MEDIA_NOTES_HEADINGS.quill}
> (Quill will write intent + narrative-fit notes here.)

${MEDIA_NOTES_HEADINGS.iris}
> (Iris will note how this got used in builds, plus any post-use observations.)

${MEDIA_NOTES_HEADINGS.creator}
> (Your space. Add tags, rules, references, or comments anytime.)
`;

/**
 * Split a Markdown file with optional YAML frontmatter into its parts.
 * Returns null when the file doesn't lead with `---`. Mirrors the
 * splitFrontmatter convention in `packages/schema/src/artifacts/parse.ts`
 * but kept local here to avoid pulling on the artifact parser surface
 * (which has artifact-specific concerns).
 */
function splitFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  const trimmed = raw.replace(/^﻿/, ""); // strip BOM if present
  if (!trimmed.startsWith("---")) return null;
  const lines = trimmed.split(/\r?\n/);
  // First line must be exactly `---` (allow trailing whitespace).
  if (lines[0].trim() !== "---") return null;
  // Find the closing fence at column 0.
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return null;
  const frontmatter = lines.slice(1, closeIdx).join("\n");
  const body = lines.slice(closeIdx + 1).join("\n").replace(/^\n+/, ""); // drop leading blank lines
  return { frontmatter, body };
}

/**
 * Find an existing section by heading and replace it; otherwise append the
 * new block to the body. Section boundary detection: from the heading line,
 * scan forward for the next line that begins with `## ` (any other `##`
 * heading — including a different author or an unrelated section).
 *
 * Pure string work — body in, body out, no IO.
 */
function upsertAuthorSection(body: string, heading: string, newBlock: string): string {
  const lines = body.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === heading) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // No existing section — append. Separate from prior content with a blank
    // line if the existing body has any content, then drop the new block.
    const existing = body.trimEnd();
    return existing.length > 0 ? `${existing}\n\n${newBlock.trimEnd()}\n` : `${newBlock.trimEnd()}\n`;
  }

  // Existing section — find its end (next `## ` heading or EOF).
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      endIdx = i;
      break;
    }
  }

  // Replace lines[startIdx..endIdx) with the new block. Preserve any
  // trailing blank lines that were between this section and the next so
  // the file's visual rhythm survives the replacement.
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const replacement = newBlock.split(/\r?\n/);
  // Trim trailing empties from replacement so we don't accumulate them on
  // repeat updates.
  while (replacement.length > 0 && replacement[replacement.length - 1] === "") {
    replacement.pop();
  }
  // Insert a single blank line between the replacement and the `after`
  // block when `after` starts with a heading (keeps sections visually
  // separated).
  const joined = [...before, ...replacement];
  if (after.length > 0 && after[0].startsWith("## ")) {
    joined.push("");
  }
  joined.push(...after);
  return joined.join("\n").replace(/\n+$/, "\n");
}
