import type { Command } from "commander";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { scaffoldArtifacts } from "./artifacts.js";
import { ARTIFACT_SLOTS } from "../lib/artifact-templates.js";
import {
  LEARNING_MODES,
  writeLearningMode,
  type LearningMode,
} from "../lib/learning-mode.js";
import {
  findWorkspace,
  hasProjectMarker,
  isValidProjectName,
  isV2Workspace,
  listProjects,
  projectsDir,
  readWorkspace,
  writeWorkspace,
} from "../lib/workspace.js";

/**
 * `atelier init <project-dir>` — first-run setup for a creator Project.
 *
 * Sequence (Phase 3, delegation C; see
 * docs/keynote/paradigm/phase-3-reconciliation-notes.md §3):
 *
 *   1. Create `<project-dir>` if absent (recursive). Refuse if the path
 *      exists as a file rather than a directory. Existing non-empty dir is
 *      a "complete the init" workflow — proceed with a note in output.
 *   2. Determine learning mode. `--mode <ambient|explicit>` skips the
 *      prompt; otherwise readline-prompts the creator (single question, two
 *      options, max 3 attempts). Bad `--mode` value exits 1 before any fs
 *      writes (TD-2026-05-26-646: autonomy posture is pre-declared).
 *   3. Write `<project-dir>/.atelier/learning-mode.yaml` with the choice
 *      and an ISO timestamp (delegated to #learning-mode-io).
 *   4. Create `<project-dir>/.atelier/mind-map/` with a README explaining
 *      what to put there. README is preserved on re-init (TD-2026-05-26-271:
 *      nothing in the mind-map leaves the machine).
 *   5. Unless `--no-scaffold`, drop DESIGN/SCRIPT/STORYBOARD via the
 *      existing #cli-artifacts `scaffoldArtifacts` helper. Re-init swallows
 *      the refuse-to-overwrite throw as a soft skip (the operation is
 *      explicitly idempotent — see init-idempotent-re-run-safe aspect).
 *   6. Unless `--no-git`, run `git init` in `<project-dir>` if it isn't
 *      already inside a git repo. Writes a minimal `.gitignore` only when
 *      one doesn't exist.
 *
 * Output: human-formatted step-by-step summary by default; `--json` emits
 * the documented machine-readable shape. Exit 0 on success, 1 on any
 * irrecoverable error (file-not-dir, can't determine mode, fs failure).
 *
 * The Commander wiring is a thin shell around the pure `runInit(opts)`
 * helper so test code drives the same code path without process.exit
 * shenanigans (matches the artifacts.ts split).
 */
export function initCommand(program: Command): void {
  program
    .command("init <project-dir>")
    .description(
      "First-run setup for a creator Project: pick a learning mode, scaffold artifacts, " +
      "create the local mind-map, optionally git-init.",
    )
    .option(
      "--mode <ambient|explicit>",
      "Skip the interactive prompt and set learning mode directly.",
    )
    .option("--no-git", "Skip `git init` (and skip writing .gitignore).")
    .option(
      "--no-scaffold",
      "Skip writing DESIGN.md / SCRIPT.md / STORYBOARD.md templates.",
    )
    .option(
      "--force",
      "Force-overwrite existing artifact files when scaffolding " +
        "(delegates to `atelier artifacts scaffold --force`).",
    )
    .option("--json", "Emit a machine-readable JSON report instead of human-formatted output.")
    .option(
      "--no-workspace-relative",
      "When inside a workspace, resolve <project-dir> relative to cwd instead of " +
      "the workspace root. Useful for power-user paths that escape the workspace.",
    )
    .action(async (
      projectDir: string,
      opts: {
        mode?: string;
        git?: boolean;             // commander --no-git → opts.git === false
        scaffold?: boolean;        // commander --no-scaffold → opts.scaffold === false
        workspaceRelative?: boolean; // commander --no-workspace-relative → false
        force?: boolean;
        json?: boolean;
      },
    ) => {
      try {
        // Workspace-aware resolution: when cwd is inside a workspace AND the
        // provided <project-dir> is RELATIVE, resolve against the workspace
        // root rather than cwd. Power-users can pass --no-workspace-relative
        // to opt out (the boolean defaults true via Commander's --no-* flag).
        let resolvedProjectDir = projectDir;
        let inheritedMode: string | undefined;
        let workspaceCtx: { workspaceDir: string; manifest: { name: string; default_mode: LearningMode; projects?: string[] } } | null = null;
        const cwd = process.cwd();
        const workspaceRelative = opts.workspaceRelative !== false;
        const ws = findWorkspace(cwd);
        if (ws) {
          workspaceCtx = ws;
          if (
            workspaceRelative &&
            !projectDir.startsWith("/") &&
            !projectDir.startsWith(".")
          ) {
            // v2 workspaces keep projects under `projects/<name>/`.
            resolvedProjectDir = join(projectsDir(ws.workspaceDir), projectDir);
          }
          // Inherit default_mode from the workspace UNLESS the creator
          // explicitly passed --mode. Skip the interactive prompt inside a
          // workspace — the autonomy posture is pre-declared at the
          // workspace level (TD-2026-05-26-646).
          if (opts.mode === undefined) {
            inheritedMode = ws.manifest.default_mode;
          }
        }

        const result = await runInit({
          projectDir: resolvedProjectDir,
          mode: opts.mode ?? inheritedMode,
          modeInheritedFromWorkspace: opts.mode === undefined && inheritedMode !== undefined,
          git: opts.git !== false,
          scaffold: opts.scaffold !== false,
          force: opts.force === true,
          json: opts.json === true,
        });

        // Refresh the workspace manifest's advisory `projects` list to
        // include the newly-initialized project, if cwd was inside a
        // workspace and the new project landed inside it. v2 manifests don't
        // track projects (on-disk `projects/` is the list), so skip them.
        if (workspaceCtx && !isV2Workspace(workspaceCtx.workspaceDir)) {
          try {
            const projects = listProjects(workspaceCtx.workspaceDir);
            writeWorkspace(workspaceCtx.workspaceDir, {
              ...workspaceCtx.manifest,
              version: "1.0",
              created: (workspaceCtx as { manifest: { created?: string } }).manifest.created ?? new Date().toISOString(),
              projects,
            });
          } catch {
            // Non-fatal — manifest is advisory.
          }
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          for (const line of formatHumanReport(result)) {
            console.log(line);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`atelier init: ${msg}`);
        }
        process.exit(1);
      }
    });
}

/** Input to `runInit`. Booleans are positive-form (caller pre-resolves --no-X). */
export interface RunInitOptions {
  projectDir: string;
  /** Pre-supplied mode (skips the prompt). */
  mode?: string;
  /**
   * When the mode was inherited from a workspace (not explicitly chosen
   * by the creator for this project), the per-project learning-mode.yaml
   * gets a comment noting the inheritance. The wrapper sets this when
   * `--mode` was absent and a workspace's `default_mode` was used.
   */
  modeInheritedFromWorkspace?: boolean;
  /** Run `git init` when not already in a repo. Default true. */
  git: boolean;
  /** Drop DESIGN/SCRIPT/STORYBOARD via `scaffoldArtifacts`. Default true. */
  scaffold: boolean;
  /** Forward to `scaffoldArtifacts({ force })`. Default false. */
  force: boolean;
  /** Suppress interactive prompt fallback (used by --json path). Default false. */
  json: boolean;
  /**
   * Drop a minimal `project.atelier` manifest at the project root so this
   * directory is recognized as a Project by legacy discovery callers. The
   * CLI surface (`atelier init`) leaves this true so existing tooling that
   * keys on the manifest's presence keeps working; the workspace `+ new`
   * surface (via `createProjectInWorkspace`) passes `false` so the project
   * stays "lazy" until its first composed `.atelier` doc lands. Default
   * true (preserves pre-pivot behavior on the CLI path).
   */
  writeManifest?: boolean;
  /**
   * Test/programmatic override: a function that resolves to the chosen mode
   * when no `--mode` was passed. Production wiring uses the readline prompt.
   * Returning `undefined` or throwing aborts with the standard "couldn't
   * determine learning mode" error.
   */
  promptForMode?: () => Promise<LearningMode>;
}

/** Result returned by `runInit` and serialized for `--json`. */
export interface InitResult {
  /** True on the success path. */
  ok: true;
  projectDir: string;
  mode: LearningMode;
  learningModeFile: string;
  /** Absolute paths of artifacts written by the scaffold step (may be empty). */
  scaffolded: string[];
  /** Absolute paths of artifacts skipped (already existed, no --force). */
  scaffoldSkipped: string[];
  mindMapDir: string;
  /** True when `git init` ran in this invocation. */
  gitInitialized: boolean;
  /** True when the dir was already inside an existing git repo. */
  alreadyInRepo: boolean;
  /** Notes accumulated during the run (re-init warnings, etc.). */
  notes: string[];
}

const MIND_MAP_README = `# Your Mind-Map

This directory holds the creator's local asset library — clips, memes,
graphics, audio — that the agent team queries when binding typed slots
in recipes and storyboards (TD-2026-05-26-229).

Organize however you want; the \`atelier_mind_map_query\` tool walks
recursively and matches by file extension against slot \`kind\` values
(image, video, audio, font, etc.).

Nothing in this directory leaves your machine (TD-2026-05-26-271).
`;

const DEFAULT_GITIGNORE = `node_modules/
*.log
.atelier/cache/
`;

/**
 * Pure helper for `atelier init`. Throws on any irrecoverable error; the
 * Commander wrapper catches and maps to `process.exit(1)`. Re-runnable on an
 * already-initialized dir (scaffold's refuse-to-overwrite is downgraded to a
 * soft skip in this surface — see init-idempotent-re-run-safe aspect).
 */
export async function runInit(opts: RunInitOptions): Promise<InitResult> {
  const absDir = resolve(opts.projectDir);
  const notes: string[] = [];

  // 1. Validate --mode BEFORE any fs writes. A typo'd mode must not leave a
  //    half-created dir behind.
  let mode: LearningMode | undefined;
  if (opts.mode !== undefined) {
    const normalized = opts.mode.toLowerCase();
    if (normalized !== "ambient" && normalized !== "explicit") {
      throw new Error(
        `invalid --mode "${opts.mode}" — expected one of ${LEARNING_MODES.join(", ")}`,
      );
    }
    mode = normalized;
  }

  // 2. Dir handling. File-collision is fatal; non-empty existing dir is fine
  //    (the explicit "complete the init" workflow).
  if (existsSync(absDir)) {
    const st = statSync(absDir);
    if (!st.isDirectory()) {
      throw new Error(`project path is not a directory: ${absDir}`);
    }
    if (readdirSync(absDir).length > 0) {
      notes.push(`project dir exists and is non-empty; completing init in place`);
    }
  } else {
    mkdirSync(absDir, { recursive: true });
  }

  // 3. Resolve the mode if --mode wasn't supplied. Prompt is the production
  //    fallback; tests inject `promptForMode`. --json without --mode is an
  //    error — scripted use must pre-declare.
  if (mode === undefined) {
    if (opts.promptForMode) {
      mode = await opts.promptForMode();
    } else if (opts.json) {
      throw new Error(
        `--mode is required with --json (scripted use must pre-declare; ` +
        `pass --mode ambient or --mode explicit)`,
      );
    } else {
      mode = await promptForLearningMode();
    }
  }

  // 4. Write learning-mode.yaml. Always overwrites — re-init refreshes the
  //    chosen_at timestamp. When the wrapper inherited the mode from a
  //    workspace, record that as a note so the human report makes the
  //    inheritance visible (the YAML file itself stays unchanged in shape).
  const learningModeFile = writeLearningMode(absDir, mode);
  if (opts.modeInheritedFromWorkspace) {
    notes.push(`learning mode inherited from workspace (${mode})`);
  }

  // 5. Create the mind-map dir + README. README is preserved on re-init so
  //    creator notes/edits survive.
  const mindMapDir = join(absDir, ".atelier", "mind-map");
  if (!existsSync(mindMapDir)) {
    mkdirSync(mindMapDir, { recursive: true });
  }
  const readmePath = join(mindMapDir, "README.md");
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, MIND_MAP_README, "utf-8");
  }

  // 5b. Drop a minimal `project.atelier` so this directory is recognized as
  //     a Project by legacy workspace-discovery callers and so workspace-
  //     level operations like `setActiveProject` can point at it. Minimal
  //     scaffold; Iris populates layers/states/etc. during the live loop.
  //     The shape matches the canonical empty doc produced by the
  //     `atelier_create` MCP tool (states: {}, empty layers) — `parseAtelier`
  //     accepts both YAML and JSON, and JSON keeps the on-disk format
  //     trivially editable without a YAML dep.
  //
  //     Gated by `writeManifest` (default true). The workspace `+ new`
  //     flow passes `false` to keep freshly-created Projects "lazy" — they
  //     become real Projects on disk once the creator composes their first
  //     `.atelier` doc. Discovery (`hasProjectMarker` in workspace.ts)
  //     now accepts the `.atelier/` metadata subdir as an equivalent
  //     marker so manifestless Projects still surface in the sidebar.
  //     Idempotent: re-init never clobbers a creator's edits.
  if (opts.writeManifest !== false) {
    const projectAtelierPath = join(absDir, "project.atelier");
    if (!existsSync(projectAtelierPath)) {
      const minimalDoc = {
        version: "1.0",
        // Default to a vertical short-form canvas (TikTok/Reels/Shorts) at
        // 30fps; Iris/Lux rewrite canvas dimensions when DESIGN.md specifies
        // a different aspect ratio.
        name: basename(absDir),
        canvas: { width: 1080, height: 1920, fps: 30 },
        layers: [],
        states: {},
      };
      writeFileSync(
        projectAtelierPath,
        JSON.stringify(minimalDoc, null, 2) + "\n",
        "utf-8",
      );
    }
  }

  // 6. Scaffold the three artifacts (unless opted out). Re-init: swallow the
  //    refuse-to-overwrite throw — this surface is intentionally idempotent.
  //    A genuine non-overwrite error (e.g. file-not-dir) is re-raised; we
  //    detect the overwrite case by message prefix written by scaffoldArtifacts.
  const scaffolded: string[] = [];
  const scaffoldSkipped: string[] = [];
  if (opts.scaffold) {
    try {
      const sr = scaffoldArtifacts(absDir, {
        slots: [...ARTIFACT_SLOTS],
        force: opts.force,
      });
      scaffolded.push(...sr.created);
      scaffoldSkipped.push(...sr.skipped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("refusing to overwrite")) {
        notes.push(
          `artifacts already present; skipped scaffold (use --force to replace)`,
        );
      } else {
        throw err;
      }
    }
  }

  // 7. Git step. Skipped when --no-git OR when already inside a repo.
  let gitInitialized = false;
  let alreadyInRepo = false;
  if (opts.git) {
    if (isInsideGitRepo(absDir)) {
      alreadyInRepo = true;
      notes.push(`already inside a git repo; skipped \`git init\``);
    } else {
      try {
        execFileSync("git", ["init"], { cwd: absDir, stdio: "ignore" });
        gitInitialized = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        notes.push(`\`git init\` failed (${msg}); continuing without git`);
      }
      // Write a minimal .gitignore only if one doesn't exist — never clobber
      // a creator-authored ignore file.
      const gitignorePath = join(absDir, ".gitignore");
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
      }
    }
  }

  return {
    ok: true,
    projectDir: absDir,
    mode,
    learningModeFile,
    scaffolded,
    scaffoldSkipped,
    mindMapDir,
    gitInitialized,
    alreadyInRepo,
    notes,
  };
}

/**
 * Returns true when `dir` (or any ancestor) sits inside an existing git work
 * tree. Implemented via `git rev-parse --show-toplevel`; non-zero exit and
 * any spawn failure (missing git, etc.) are treated as "not in a repo" so the
 * caller falls through to `git init`.
 */
export function isInsideGitRepo(dir: string): boolean {
  try {
    execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Production interactive mode prompt. One readable question, two options,
 * 3 attempts before giving up. Accepts `1`, `2`, `ambient`, `explicit`
 * (case-insensitive). The phrasing cites TD-2026-05-26-646's autonomy stance
 * via the two option blurbs.
 */
async function promptForLearningMode(): Promise<LearningMode> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(
      `How should your agent team learn?\n` +
      `\n` +
      `  1) Ambient — the team captures corrections silently and surfaces patterns when confident.\n` +
      `  2) Explicit — nothing locks in without your "yes"; high-control, more friction.\n` +
      `\n`,
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = (await question(rl, `Choose [1/2]: `)).trim().toLowerCase();
      const parsed = parseModeAnswer(answer);
      if (parsed) return parsed;
      process.stdout.write(`Please enter 1, 2, ambient, or explicit.\n`);
    }
    throw new Error(
      `couldn't determine learning mode after 3 attempts ` +
      `(hint: re-run with --mode ambient or --mode explicit for scripted use)`,
    );
  } finally {
    rl.close();
  }
}

/** Parse a single answer to the mode prompt. Returns undefined on no match. */
export function parseModeAnswer(answer: string): LearningMode | undefined {
  const a = answer.trim().toLowerCase();
  if (a === "1" || a === "ambient") return "ambient";
  if (a === "2" || a === "explicit") return "explicit";
  return undefined;
}

/** Promisified readline.question. */
function question(rl: ReadlineInterface, prompt: string): Promise<string> {
  return new Promise((resolvePromise) => {
    rl.question(prompt, (answer) => resolvePromise(answer));
  });
}

/**
 * Human-formatted step-by-step output, mirroring the artifacts.ts style.
 * Each line is a discrete bullet — easy to scan, no chalk colors.
 */
function formatHumanReport(r: InitResult): string[] {
  const lines: string[] = [];
  lines.push(`Project: ${r.projectDir}`);
  lines.push(`  Learning mode: ${r.mode}`);
  lines.push(`  Wrote ${r.learningModeFile}`);
  lines.push(`  Mind-map: ${r.mindMapDir}`);
  if (r.scaffolded.length > 0) {
    lines.push(`  Scaffolded artifacts:`);
    for (const f of r.scaffolded) lines.push(`    - ${f}`);
  }
  if (r.scaffoldSkipped.length > 0) {
    lines.push(`  Skipped (already exists):`);
    for (const f of r.scaffoldSkipped) lines.push(`    - ${f}`);
  }
  if (r.gitInitialized) {
    lines.push(`  Initialized git repo`);
  } else if (r.alreadyInRepo) {
    lines.push(`  Git: already inside a repo (skipped)`);
  }
  for (const note of r.notes) {
    lines.push(`  Note: ${note}`);
  }
  lines.push("");
  lines.push(`Result: PASS`);
  return lines;
}

// ─── Workspace-scoped project creation (no subprocess) ──────────────────
//
// Extracted from initCommand's action body so the studio HTTP endpoint can
// invoke the same flow in-process — no `atelier init` subprocess fork. The
// CLI wrapper still goes through `runInit` directly; this helper layers
// the workspace-relative resolution + manifest refresh on top so both
// callers stay in lock-step.

/** Options for `createProjectInWorkspace`. */
export interface CreateProjectInWorkspaceOptions {
  /** Single-segment project name (gated by `isValidProjectName`). */
  name: string;
  /**
   * Override the workspace's `default_mode` for this one project. When
   * omitted the workspace's mode is inherited and the inheritance is
   * recorded as a note (mirrors the CLI's behavior).
   */
  mode?: LearningMode;
  /** Forward to `runInit` — drops DESIGN/SCRIPT/STORYBOARD. Defaults true. */
  scaffold?: boolean;
  /** Forward to `runInit` — overwrite existing artifacts. Defaults false. */
  force?: boolean;
  /**
   * Run `git init` inside the new project dir. Defaults false for the
   * endpoint surface — a UI-driven create-project click shouldn't quietly
   * fork git in the background; the CLI sets this true via `runInit`.
   */
  git?: boolean;
}

/**
 * Create a new Project subdirectory inside an existing workspace. Pure
 * function — takes the workspace dir explicitly, never reads cwd. Used by
 * the `/api/workspace/projects` HTTP handler so the endpoint never spawns
 * an `atelier init` subprocess.
 *
 * Pipeline:
 *   1. Validate `name` against `isValidProjectName` (rejects path
 *      separators, leading dot, control chars) before any fs work.
 *   2. Refuse if the target dir already looks like a Project — i.e. has
 *      a `project.atelier` manifest OR an `.atelier/` metadata subdir
 *      (`hasProjectMarker`). A bare empty dir is OK.
 *   3. Delegate to `runInit` with `writeManifest: false` so the new
 *      Project stays "lazy" — no auto-scaffolded `project.atelier`. The
 *      directory + `.atelier/` metadata subdir is enough for discovery
 *      to pick it up; the first composed `.atelier` doc lands when the
 *      creator drops in media or asks an agent to compose one.
 *   4. Refresh the workspace manifest's advisory `projects[]` list so the
 *      manifest reflects on-disk truth (same logic as the CLI wrapper).
 *
 * Throws on: invalid name, workspace not found, target-is-existing-project,
 * any `runInit` failure. Manifest-refresh failures are non-fatal (manifest
 * is advisory; we never block a successful project creation on a manifest
 * write error).
 */
export async function createProjectInWorkspace(
  workspaceDir: string,
  opts: CreateProjectInWorkspaceOptions,
): Promise<InitResult> {
  if (!isValidProjectName(opts.name)) {
    throw new Error(
      `invalid project name "${opts.name}" — must be a single-segment basename ` +
      `(no path separators, no leading dot, no control chars)`,
    );
  }
  const absWs = resolve(workspaceDir);
  // Re-read the manifest so we know the inherited default_mode + can
  // refresh `projects[]` after creation. A missing/bad manifest throws.
  const manifest = readWorkspace(absWs);
  const projectDir = join(absWs, opts.name);

  // Refuse to clobber an existing project at this name. Use the same
  // marker as discovery (either `project.atelier` OR `.atelier/`) so a
  // freshly-created lazy project is also recognized as "already exists".
  // An empty/missing dir is fine — that's the standard "create new" case.
  if (hasProjectMarker(projectDir)) {
    throw new Error(
      `project "${opts.name}" already exists at ${projectDir}`,
    );
  }

  const mode = opts.mode ?? manifest.default_mode;
  const result = await runInit({
    projectDir,
    mode,
    modeInheritedFromWorkspace: opts.mode === undefined,
    git: opts.git === true,
    scaffold: opts.scaffold !== false,
    force: opts.force === true,
    // The endpoint surface ALWAYS needs a deterministic mode (no
    // interactive prompt available behind an HTTP request), so we pass
    // --mode-equivalent and json:false (no need to error on missing mode
    // — we always supply one).
    json: false,
    // Workspace `+ new` is the "lazy project" path — no auto-scaffolded
    // `project.atelier`. The creator's first compose action drops a real
    // `.atelier` doc; until then the project lives off its `.atelier/`
    // metadata subdir alone.
    writeManifest: false,
  });

  // Refresh the manifest's advisory projects[] list. Non-fatal.
  try {
    const projects = listProjects(absWs);
    writeWorkspace(absWs, {
      ...manifest,
      projects,
    });
  } catch {
    // Advisory only; surface in logs rather than fail the create.
  }

  return result;
}
