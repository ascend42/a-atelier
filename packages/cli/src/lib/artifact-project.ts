import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  parseDesign,
  parseScript,
  parseStoryboard,
  type DesignArtifact,
  type ScriptArtifact,
  type StoryboardArtifact,
} from "@a-company/atelier-schema";

/**
 * Pure filesystem walker for the front-of-pipeline artifact triplet
 * (DESIGN.md, SCRIPT.md, STORYBOARD.md). Sibling-of-`project.atelier`
 * convention per `docs/keynote/paradigm/atelier-front-of-pipeline-artifacts.md`
 * §2 — the three files sit at the root of a Project directory.
 *
 * This module is intentionally pure: no stdout/exit-code coupling. The
 * `atelier artifacts validate` CLI command (and any future agent / MCP
 * caller) consumes the structured result and decides what to print.
 *
 * Any subset of the three files may exist — the absent ones are
 * surfaced via `missing` (informational, NOT an error). The validator
 * (`validateArtifactSet`) runs on whatever was successfully parsed.
 */

/** Filenames the walker looks for at the project-dir root. */
export const ARTIFACT_FILENAMES = {
  design: "DESIGN.md",
  script: "SCRIPT.md",
  storyboard: "STORYBOARD.md",
} as const;

/** Per-file parse failure surface. */
export interface ArtifactParseError {
  /** Which artifact triplet slot failed. */
  artifact: "design" | "script" | "storyboard";
  /** Absolute path to the file that failed. */
  file: string;
  /** Human-readable failure message. */
  message: string;
}

/** Structured result of loading the three artifacts from a project dir. */
export interface LoadedArtifactProject {
  /** Absolute project-dir path that was inspected. */
  projectDir: string;
  /** Successfully-parsed DESIGN.md, if present and valid. */
  design?: DesignArtifact;
  /** Successfully-parsed SCRIPT.md, if present and valid. */
  script?: ScriptArtifact;
  /** Successfully-parsed STORYBOARD.md, if present and valid. */
  storyboard?: StoryboardArtifact;
  /**
   * Names of artifact files that were not found on disk.
   * NOT an error — absent artifacts are valid per the spec
   * (only what is present is validated).
   */
  missing: string[];
  /** Per-file parse errors. Empty when all present artifacts parsed cleanly. */
  parseErrors: ArtifactParseError[];
}

/**
 * Walk a project directory for DESIGN.md / SCRIPT.md / STORYBOARD.md and
 * parse whichever are present.
 *
 * Throws (synchronously) only when `projectDir` itself does not exist or
 * is not a directory — per-file parse failures are captured into the
 * returned `parseErrors` array so callers can show every problem at
 * once instead of one at a time.
 */
export function loadArtifactsFromProject(projectDir: string): LoadedArtifactProject {
  const absDir = resolve(projectDir);
  if (!existsSync(absDir)) {
    throw new Error(`project directory does not exist: ${absDir}`);
  }
  const stat = statSync(absDir);
  if (!stat.isDirectory()) {
    throw new Error(`project path is not a directory: ${absDir}`);
  }

  const result: LoadedArtifactProject = {
    projectDir: absDir,
    missing: [],
    parseErrors: [],
  };

  for (const slot of ["design", "script", "storyboard"] as const) {
    const filename = ARTIFACT_FILENAMES[slot];
    const filePath = join(absDir, filename);
    if (!existsSync(filePath)) {
      result.missing.push(filename);
      continue;
    }
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf-8");
    } catch (err) {
      result.parseErrors.push({
        artifact: slot,
        file: filePath,
        message: `read failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    try {
      if (slot === "design") {
        result.design = parseDesign(raw);
      } else if (slot === "script") {
        result.script = parseScript(raw);
      } else {
        result.storyboard = parseStoryboard(raw);
      }
    } catch (err) {
      result.parseErrors.push({
        artifact: slot,
        file: filePath,
        message: formatParseError(err),
      });
    }
  }

  return result;
}

/**
 * Render a parse-time exception into a readable single-line message.
 * Flattens ZodError issues into `field: message` form so multi-issue
 * failures stay legible without a JSON dump.
 */
function formatParseError(err: unknown): string {
  if (err instanceof Error) {
    // ZodError carries `issues`; we surface them inline for clarity.
    const issues = (err as Error & { issues?: Array<{ path: (string | number)[]; message: string }> }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      const formatted = issues
        .map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
          return `${path}: ${issue.message}`;
        })
        .join("; ");
      return formatted;
    }
    return err.message;
  }
  return String(err);
}
