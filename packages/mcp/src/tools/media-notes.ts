// @a-company/atelier-mcp — Media notes (sidecar `<file>.notes.md`) tools.
//
// Two tools:
//   atelier_get_media_notes   — pure read of a media file's notes sidecar.
//   atelier_write_media_note  — append/replace an author's section.
//
// Dependency note: the canonical readMediaNotes/appendNoteSection helpers
// live in the CLI package (`packages/cli/src/lib/media-notes.ts`). MCP does
// NOT depend on CLI (cycle), so the read+upsert logic is re-implemented here
// against @a-company/atelier-schema (MediaNotesFrontmatterSchema +
// MEDIA_NOTES_HEADINGS) and the `yaml` package. This mirrors the existing
// duplication of recipe overlay logic in recipes.ts.
//
// Both tools are scoped via projectDir + filename so callers cannot read or
// write outside the project's media/ subtree. The filename argument is
// basename-only (no path separators) — defense in depth against a malformed
// path argument escaping the media/ root.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  MediaNotesAuthorSchema,
  MediaNotesFrontmatterSchema,
  MEDIA_NOTES_HEADINGS,
  type MediaNotes,
  type MediaNotesAuthor,
  type MediaNotesFrontmatter,
} from "@a-company/atelier-schema";
import type { DocumentStore } from "../store.js";

// ─── Envelope helpers (mirror mind-map.ts) ────────────────────────

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ─── Path resolution (basename-only guard) ────────────────────────

const MEDIA_NOTES_SUFFIX = ".notes.md";

/**
 * Resolve `<projectDir>/media/<filename>` and its sidecar. Refuses any
 * filename that includes a path separator — callers are expected to pass a
 * bare basename, never a path. Returns the absolute paths.
 */
function resolveMediaPaths(
  projectDir: string,
  filename: string,
): { project: string; mediaPath: string; notesPath: string } | { error: string } {
  const absProject = resolve(projectDir);
  if (!existsSync(absProject) || !statSync(absProject).isDirectory()) {
    return { error: `projectDir "${absProject}" is not a directory` };
  }
  if (filename.includes("/") || filename.includes("\\") || filename === "..") {
    return { error: `filename must be a bare basename (got "${filename}")` };
  }
  const mediaPath = join(absProject, "media", filename);
  const notesPath = `${mediaPath}${MEDIA_NOTES_SUFFIX}`;
  return { project: absProject, mediaPath, notesPath };
}

// ─── Notes read/write (duplicated from cli/media-notes.ts) ────────

interface FrontmatterSplit {
  frontmatter: string;
  body: string;
}

function splitFrontmatter(raw: string): FrontmatterSplit | null {
  const trimmed = raw.replace(/^﻿/, "");
  if (!trimmed.startsWith("---")) return null;
  const lines = trimmed.split(/\r?\n/);
  if (lines[0].trim() !== "---") return null;
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return null;
  return {
    frontmatter: lines.slice(1, closeIdx).join("\n"),
    body: lines.slice(closeIdx + 1).join("\n").replace(/^\n+/, ""),
  };
}

function readNotesFile(notesPath: string): MediaNotes | null {
  if (!existsSync(notesPath)) return null;
  const raw = readFileSync(notesPath, "utf-8");
  const split = splitFrontmatter(raw);
  if (split === null) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(split.frontmatter);
  } catch {
    return null;
  }
  const validated = MediaNotesFrontmatterSchema.safeParse(parsed);
  if (!validated.success) return null;
  return { frontmatter: validated.data, body: split.body };
}

function writeNotesFile(notesPath: string, notes: MediaNotes): void {
  const yamlText = stringifyYaml(notes.frontmatter);
  const body = notes.body.endsWith("\n") ? notes.body : `${notes.body}\n`;
  writeFileSync(notesPath, `---\n${yamlText}---\n\n${body}`, "utf-8");
}

function upsertSection(body: string, heading: string, newBlock: string): string {
  const lines = body.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === heading) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    const existing = body.trimEnd();
    return existing.length > 0 ? `${existing}\n\n${newBlock.trimEnd()}\n` : `${newBlock.trimEnd()}\n`;
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  const replacement = newBlock.split(/\r?\n/);
  while (replacement.length > 0 && replacement[replacement.length - 1] === "") {
    replacement.pop();
  }
  const joined = [...before, ...replacement];
  if (after.length > 0 && after[0].startsWith("## ")) {
    joined.push("");
  }
  joined.push(...after);
  return joined.join("\n").replace(/\n+$/, "\n");
}

// ─── Tool registration ───────────────────────────────────────────

export function register(server: McpServer, _store: DocumentStore): void {
  // _store unused — both tools work against the filesystem only.

  server.tool(
    "atelier_get_media_notes",
    "Read the sidecar notes file for a media entry — <projectDir>/media/<filename>.notes.md. " +
      "Returns the parsed frontmatter (file, added, added_by, tags, optional constraints) " +
      "plus the Markdown body. Returns an error envelope when the notes file is absent or " +
      "malformed; pure read, does not touch the document store.",
    {
      projectDir: z.string().describe("Absolute or cwd-relative project root"),
      filename: z.string().describe("Bare basename of the media file (e.g. 'b-roll-laptop.mp4')"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ projectDir, filename }) => {
      const paths = resolveMediaPaths(projectDir, filename);
      if ("error" in paths) return err(paths.error);

      if (!existsSync(paths.notesPath)) {
        return err(`notes file not found: ${paths.notesPath}`);
      }
      const notes = readNotesFile(paths.notesPath);
      if (notes === null) {
        return err(`notes file at ${paths.notesPath} is malformed (frontmatter parse / schema validation failed)`);
      }
      return ok({
        path: paths.notesPath,
        frontmatter: notes.frontmatter as unknown as Record<string, unknown>,
        body: notes.body,
      });
    },
  );

  server.tool(
    "atelier_write_media_note",
    "Append or replace an author's section in a media file's sidecar notes. " +
      "Section boundaries are detected by the per-author sentinel headings " +
      "(## Lux notes / Quill notes / Iris notes / Creator notes); a second call with the " +
      "same author replaces the prior section rather than duplicating. The notes file " +
      "MUST exist already (scaffold via `atelier media ingest` or `atelier media note`). " +
      "Mutates disk; the calling agent is tagged via the `author` argument.",
    {
      projectDir: z.string().describe("Absolute or cwd-relative project root"),
      filename: z.string().describe("Bare basename of the media file"),
      author: MediaNotesAuthorSchema.describe("Section owner: lux | quill | iris | creator"),
      section: z.string().describe("Markdown body for the section (heading is added automatically)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ projectDir, filename, author, section }) => {
      const paths = resolveMediaPaths(projectDir, filename);
      if ("error" in paths) return err(paths.error);

      if (!existsSync(paths.notesPath)) {
        return err(
          `notes file not found: ${paths.notesPath} — scaffold via \`atelier media ingest\` or \`atelier media note\` first`,
        );
      }
      const existing = readNotesFile(paths.notesPath);
      if (existing === null) {
        return err(
          `notes file at ${paths.notesPath} is malformed — refusing to write into a file with unparseable frontmatter`,
        );
      }

      const typedAuthor = author as MediaNotesAuthor;
      const heading = MEDIA_NOTES_HEADINGS[typedAuthor];
      const trimmed = section.trim();
      const newBlock = `${heading}\n${trimmed}\n`;

      // Did the section already exist? Used to report action: replaced|appended.
      const hasExistingSection = existing.body
        .split(/\r?\n/)
        .some((l) => l.trim() === heading);

      const updatedBody = upsertSection(existing.body, heading, newBlock);
      const updated: MediaNotes = { frontmatter: existing.frontmatter as MediaNotesFrontmatter, body: updatedBody };
      writeNotesFile(paths.notesPath, updated);

      return ok({
        path: paths.notesPath,
        action: hasExistingSection ? "replaced" : "appended",
        author: typedAuthor,
      });
    },
  );
}
