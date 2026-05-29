import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { DesignArtifactSchema } from "./design.js";
import type { DesignArtifact } from "./design.js";
import {
  ScriptArtifactSchema,
  NarratedScriptSchema,
  NarratedBeatSchema,
  NonNarratedBeatSchema,
  type ScriptArtifact,
} from "./script.js";
import { StoryboardArtifactSchema, type StoryboardArtifact } from "./storyboard.js";

/**
 * Parsers for the three front-of-pipeline artifacts (DESIGN.md, SCRIPT.md,
 * STORYBOARD.md). Universal file shape:
 *
 *   ---
 *   <YAML frontmatter>
 *   ---
 *   <Markdown body>
 *
 * For DESIGN, the body is free prose (kept verbatim as `body`).
 * For SCRIPT, the body has `# Hook | # Story | # Proof | # CTA` headings
 *   with YAML-list beats — or, in carousel/text-only modes, a flat
 *   beat list. The parser lifts beats out of the body into typed fields.
 * For STORYBOARD, the body has `## <beat-id>` headings followed by a
 *   YAML mapping block; the parser lifts beats into typed fields.
 *
 * Each parser returns a fully-validated artifact (throws z.ZodError on
 * structural failure — callers wrap as needed). Serializers emit a
 * canonical form so round-trip-then-re-parse is structurally stable.
 */

const FRONTMATTER_FENCE = "---";

/** Internal: split a raw artifact string into its YAML frontmatter and body. */
export interface FrontmatterSplit {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function splitFrontmatter(raw: string): FrontmatterSplit {
  // Normalize newlines so Windows-style files don't break the split.
  const text = raw.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const lines = text.split("\n");

  // First non-empty line must be `---`.
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].trim() !== FRONTMATTER_FENCE) {
    throw new Error("artifact missing leading `---` frontmatter fence");
  }
  const startLine = i + 1;

  // Find closing fence.
  let endLine = -1;
  for (let j = startLine; j < lines.length; j++) {
    if (lines[j].trim() === FRONTMATTER_FENCE) {
      endLine = j;
      break;
    }
  }
  if (endLine === -1) {
    throw new Error("artifact missing closing `---` frontmatter fence");
  }

  const frontmatterText = lines.slice(startLine, endLine).join("\n");
  const body = lines.slice(endLine + 1).join("\n").replace(/^\n+/, "");

  let frontmatter: unknown;
  try {
    frontmatter = frontmatterText.trim().length === 0 ? {} : yamlParse(frontmatterText);
  } catch (err) {
    throw new Error(`frontmatter YAML parse error: ${(err as Error).message}`);
  }
  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error("frontmatter must be a YAML mapping");
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body };
}

/** Internal: render YAML for embedding inside a fenced block. */
function dumpYaml(value: unknown): string {
  // `lineWidth: 0` keeps long lines unwrapped (better for round-trip stability).
  return yamlStringify(value, { indent: 2, lineWidth: 0 });
}

// ---------- DESIGN ----------

/**
 * Parse a DESIGN.md raw string into a validated `DesignArtifact`. The body
 * is carried verbatim (no further structural lifting).
 */
export function parseDesign(raw: string): DesignArtifact {
  const { frontmatter, body } = splitFrontmatter(raw);
  return DesignArtifactSchema.parse({ ...frontmatter, body });
}

/** Serialize a DesignArtifact to a canonical Markdown-with-frontmatter string. */
export function serializeDesign(artifact: DesignArtifact): string {
  const { body, ...frontmatter } = artifact;
  return `---\n${dumpYaml(frontmatter)}---\n\n${body}`;
}

// ---------- SCRIPT ----------

/**
 * Extract beat lists from a SCRIPT body.
 *
 * The body uses `# Hook | # Story | # Proof | # CTA` H1 headings for
 * narrated mode, with each section containing a YAML-list of beat
 * mappings. For carousel / text-only modes, the body is a single YAML
 * list (no headings required) — but we also accept a `# Beats` heading
 * for symmetry.
 *
 * NOTE on idiom choice: we elected to put beats in the body (per the
 * spec's EXAMPLE) rather than in frontmatter — it diffs better when a
 * creator edits a single beat, which is the load-bearing re-entry move
 * (spec §7).
 */
const NARRATED_SECTION_HEADERS: Record<string, "hook" | "story" | "proof" | "cta"> = {
  hook: "hook",
  story: "story",
  proof: "proof",
  cta: "cta",
};

interface ParsedScriptBody {
  blocks?: { hook: unknown[]; story: unknown[]; proof: unknown[]; cta: unknown[] };
  beats?: unknown[];
  remainder: string;
}

function parseScriptBody(body: string, mode: string): ParsedScriptBody {
  const text = body.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  if (mode === "narrated") {
    const blocks: { hook: unknown[]; story: unknown[]; proof: unknown[]; cta: unknown[] } = {
      hook: [], story: [], proof: [], cta: [],
    };
    let currentKey: "hook" | "story" | "proof" | "cta" | null = null;
    let buffer: string[] = [];
    const remainder: string[] = [];

    const flush = () => {
      if (currentKey === null) return;
      const yamlText = buffer.join("\n").trim();
      if (yamlText.length === 0) return;
      const parsed = yamlParse(yamlText);
      if (!Array.isArray(parsed)) {
        throw new Error(`SCRIPT section "${currentKey}" must be a YAML list of beats`);
      }
      blocks[currentKey] = parsed;
    };

    for (const line of lines) {
      const headingMatch = /^#\s+(.+?)\s*$/.exec(line);
      if (headingMatch) {
        const key = headingMatch[1].toLowerCase();
        if (key in NARRATED_SECTION_HEADERS) {
          flush();
          currentKey = NARRATED_SECTION_HEADERS[key];
          buffer = [];
          continue;
        }
      }
      if (currentKey === null) {
        remainder.push(line);
      } else {
        buffer.push(line);
      }
    }
    flush();
    return { blocks, remainder: remainder.join("\n").trim() };
  }

  // carousel / text-only — single YAML list, optionally under `# Beats`.
  const beatLines: string[] = [];
  const remainder: string[] = [];
  let inBeats = false;
  let sawAnyHeading = false;
  for (const line of lines) {
    const headingMatch = /^#\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      sawAnyHeading = true;
      inBeats = headingMatch[1].toLowerCase() === "beats";
      continue;
    }
    if (sawAnyHeading) {
      if (inBeats) beatLines.push(line);
      else remainder.push(line);
    } else {
      beatLines.push(line);
    }
  }
  const yamlText = beatLines.join("\n").trim();
  let beats: unknown[] = [];
  if (yamlText.length > 0) {
    const parsed = yamlParse(yamlText);
    if (!Array.isArray(parsed)) {
      throw new Error(`SCRIPT body must be a YAML list of beats (mode: ${mode})`);
    }
    beats = parsed;
  }
  return { beats, remainder: remainder.join("\n").trim() };
}

/** Parse a SCRIPT.md raw string into a validated `ScriptArtifact`. */
export function parseScript(raw: string): ScriptArtifact {
  const { frontmatter, body } = splitFrontmatter(raw);
  const mode = (frontmatter as { mode?: unknown }).mode;
  if (mode !== "narrated" && mode !== "carousel" && mode !== "text-only") {
    throw new Error(`SCRIPT frontmatter "mode" must be one of narrated | carousel | text-only (got ${JSON.stringify(mode)})`);
  }
  const parsed = parseScriptBody(body, mode);

  const assembled: Record<string, unknown> = { ...frontmatter, body: parsed.remainder };
  if (mode === "narrated") {
    assembled.blocks = parsed.blocks;
  } else {
    assembled.beats = parsed.beats;
  }
  return ScriptArtifactSchema.parse(assembled);
}

/** Serialize a ScriptArtifact to a canonical Markdown-with-frontmatter string. */
export function serializeScript(artifact: ScriptArtifact): string {
  if (artifact.mode === "narrated") {
    // Validate-and-strip default-bearing fields via the per-beat schema so
    // round-trip stays canonical (bind_to_transcript defaults to true).
    const { mode, target_duration_s, language, tts_voice, blocks, body } = artifact;
    const fm: Record<string, unknown> = { mode, target_duration_s, language };
    if (tts_voice !== undefined) fm.tts_voice = tts_voice;
    const sectionDump = (key: "Hook" | "Story" | "Proof" | "CTA", beats: unknown[]) =>
      `# ${key}\n${dumpYaml(beats).trimEnd()}\n`;
    const sections = [
      sectionDump("Hook", blocks.hook),
      sectionDump("Story", blocks.story),
      sectionDump("Proof", blocks.proof),
      sectionDump("CTA", blocks.cta),
    ].join("\n");
    const trailingBody = body.trim().length > 0 ? `\n${body.trim()}\n` : "";
    return `---\n${dumpYaml(fm)}---\n\n${sections}${trailingBody}`;
  }
  const { mode, target_duration_s, language, tts_voice, beats, body } = artifact;
  const fm: Record<string, unknown> = { mode, target_duration_s, language };
  if (tts_voice !== undefined) fm.tts_voice = tts_voice;
  const trailingBody = body.trim().length > 0 ? `\n${body.trim()}\n` : "";
  return `---\n${dumpYaml(fm)}---\n\n# Beats\n${dumpYaml(beats).trimEnd()}\n${trailingBody}`;
}

/** Re-export — useful for fixture builders that want to validate piecewise. */
export { NarratedBeatSchema, NonNarratedBeatSchema, NarratedScriptSchema };

// ---------- STORYBOARD ----------

/**
 * Extract a STORYBOARD body into a list of beats. Each beat is a `## <id>`
 * heading followed by a YAML mapping block (lines until the next `##`).
 */
function parseStoryboardBody(body: string): unknown[] {
  const text = body.replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  type Pending = { id: string; buffer: string[] };
  const beats: Pending[] = [];
  let current: Pending | null = null;

  for (const line of lines) {
    const headingMatch = /^##\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      if (current !== null) beats.push(current);
      current = { id: headingMatch[1].trim(), buffer: [] };
      continue;
    }
    if (current !== null) {
      current.buffer.push(line);
    }
  }
  if (current !== null) beats.push(current);

  return beats.map(({ id, buffer }) => {
    const yamlText = buffer.join("\n").trim();
    if (yamlText.length === 0) {
      return { id };
    }
    const parsed = yamlParse(yamlText);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`STORYBOARD beat "${id}" body must be a YAML mapping`);
    }
    return { id, ...(parsed as Record<string, unknown>) };
  });
}

/** Parse a STORYBOARD.md raw string into a validated `StoryboardArtifact`. */
export function parseStoryboard(raw: string): StoryboardArtifact {
  const { frontmatter, body } = splitFrontmatter(raw);
  const beats = parseStoryboardBody(body);
  return StoryboardArtifactSchema.parse({ ...frontmatter, beats });
}

/** Serialize a StoryboardArtifact to a canonical Markdown-with-frontmatter string. */
export function serializeStoryboard(artifact: StoryboardArtifact): string {
  const { technique_library_version, aspect_ratio, beats } = artifact;
  const fm = { technique_library_version, aspect_ratio };
  const beatBlocks = beats.map((beat) => {
    const { id, ...rest } = beat;
    return `## ${id}\n${dumpYaml(rest).trimEnd()}\n`;
  }).join("\n");
  return `---\n${dumpYaml(fm)}---\n\n${beatBlocks}`;
}
