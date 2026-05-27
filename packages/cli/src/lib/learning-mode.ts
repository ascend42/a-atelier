import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Forward import — workspace.ts also imports from this module, but only the
// writer (writeLearningMode), so there is no circular import at the value
// level. The `findWorkspace` helper is used purely for read-side resolution.
import { findWorkspace } from "./workspace.js";

/**
 * Atelier creator learning-mode I/O.
 *
 * `learning-mode.yaml` lives at `<project-dir>/.atelier/learning-mode.yaml`
 * and stores the creator's pre-declared autonomy posture (TD-2026-05-26-646):
 *
 *   - `ambient`  — the agent team captures corrections silently and surfaces
 *                  patterns when confident.
 *   - `explicit` — nothing locks in without the creator's "yes"; high control,
 *                  more friction.
 *
 * Set once by `atelier init`. The system never auto-prompts to switch — the
 * creator changes mode by editing the file. Iris (and friends) read it at
 * session start to calibrate their behavior.
 *
 * Format is hand-rolled YAML (a handful of scalars) so we don't pull in a YAML
 * dep here; the schema is intentionally tiny and stable.
 */

export type LearningMode = "ambient" | "explicit";

export const LEARNING_MODES: readonly LearningMode[] = ["ambient", "explicit"] as const;

export const LEARNING_MODE_VERSION = "1.0" as const;

/** Shape persisted to disk. */
export interface LearningModeFile {
  /** Schema version of this file. */
  version: string;
  /** Creator's chosen autonomy posture. */
  mode: LearningMode;
  /** ISO 8601 timestamp set by the writer. */
  chosen_at: string;
}

/** Absolute path to the learning-mode file for a project. */
export function learningModePath(projectDir: string): string {
  return join(resolve(projectDir), ".atelier", "learning-mode.yaml");
}

/**
 * Write `<projectDir>/.atelier/learning-mode.yaml` with the given mode and a
 * fresh ISO timestamp. Creates `<projectDir>/.atelier/` if absent. Overwrites
 * any existing file — re-running init is supported and refreshes the
 * timestamp (mode is whatever the caller passes; the caller decides whether
 * to re-prompt). Returns the absolute path written.
 */
export function writeLearningMode(
  projectDir: string,
  mode: LearningMode,
  opts: { chosenAt?: Date } = {},
): string {
  const absPath = learningModePath(projectDir);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const ts = (opts.chosenAt ?? new Date()).toISOString();
  const content = renderLearningModeYaml({ version: LEARNING_MODE_VERSION, mode, chosen_at: ts });
  writeFileSync(absPath, content, "utf-8");
  return absPath;
}

/**
 * Read `<projectDir>/.atelier/learning-mode.yaml` if present. Returns `undefined`
 * when the file does not exist. Throws a clear Error when the file exists but
 * is malformed (missing required fields, unknown mode). Hand-rolled scalar
 * parser — no YAML dep — matched to whatever `writeLearningMode` emits.
 */
export function readLearningMode(projectDir: string): LearningModeFile | undefined {
  const absPath = learningModePath(projectDir);
  if (!existsSync(absPath)) return undefined;
  const raw = readFileSync(absPath, "utf-8");
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    fields[m[1]] = stripYamlScalar(m[2]);
  }
  const mode = fields.mode;
  if (mode !== "ambient" && mode !== "explicit") {
    throw new Error(
      `learning-mode.yaml at ${absPath} has invalid mode "${mode ?? "<missing>"}" ` +
      `— expected one of ${LEARNING_MODES.join(", ")}`,
    );
  }
  const chosen_at = fields.chosen_at;
  if (!chosen_at) {
    throw new Error(`learning-mode.yaml at ${absPath} is missing chosen_at`);
  }
  return {
    version: fields.version ?? LEARNING_MODE_VERSION,
    mode,
    chosen_at,
  };
}

/**
 * Render the canonical YAML body — a fixed-shape doc with header comments
 * pointing the creator at where to change the mode (TD-2026-05-26-646). Kept
 * here so the writer and any future reader/round-tripper agree on the shape.
 */
export function renderLearningModeYaml(file: LearningModeFile): string {
  return (
    `# Atelier creator learning mode.\n` +
    `# Set by \`atelier init\`. Change anytime by editing this file — the system\n` +
    `# never auto-prompts to switch (TD-2026-05-26-646).\n` +
    `version: '${file.version}'\n` +
    `mode: ${file.mode}\n` +
    `chosen_at: '${file.chosen_at}'\n`
  );
}

/**
 * Resolve the effective learning mode for `cwd`, with explicit provenance.
 *
 * Resolution order:
 *   1. If `cwd` is inside a workspace (per `findWorkspace`), read the
 *      WORKSPACE-LEVEL `.atelier/learning-mode.yaml`. Source = "workspace".
 *   2. Otherwise, walk up from `cwd` looking for a project root (a dir
 *      containing `.atelier/learning-mode.yaml`). The first hit wins.
 *      Source = "project".
 *   3. Otherwise default to ambient. Source = "default" — note that the
 *      default is for READ paths only (callers needing to record the
 *      mode somewhere should call `writeLearningMode` at the appropriate
 *      level — workspace if in a workspace, else project).
 *
 * Pure read; never writes. Returns `mode` + a `source` discriminator so
 * callers (e.g. agent calibration) can show the creator where the value
 * came from.
 */
export function resolveLearningMode(
  cwd: string,
): { mode: LearningMode; source: "workspace" | "project" | "default" } {
  const start = resolve(cwd);

  // Workspace-level wins when present — the manifest is the explicit
  // creator-wide declaration.
  const ws = findWorkspace(start);
  if (ws) {
    const wsMode = readLearningMode(ws.workspaceDir);
    if (wsMode) {
      return { mode: wsMode.mode, source: "workspace" };
    }
    // Workspace exists but has no learning-mode.yaml — fall through to
    // the manifest's default_mode (createWorkspace always writes the
    // YAML, so this branch is rare and indicates a hand-edited dir).
    return { mode: ws.manifest.default_mode, source: "workspace" };
  }

  // Project-level walk: look for `<dir>/.atelier/learning-mode.yaml`.
  let dir = start;
  while (true) {
    if (existsSync(learningModePath(dir))) {
      const proj = readLearningMode(dir);
      if (proj) {
        return { mode: proj.mode, source: "project" };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { mode: "ambient", source: "default" };
}

/** Strip wrapping single/double quotes from a YAML scalar value. */
function stripYamlScalar(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}
