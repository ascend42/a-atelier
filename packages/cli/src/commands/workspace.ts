/**
 * `atelier workspace [name]` — scaffold a v2 Atelier workspace.
 *
 * v2 design: the workspace folder IS the brand+project container. This
 * command lays down the directory shape + brand artifact templates +
 * persona shims so a creator can `cd` in and immediately invoke
 * `@atelier-quill` / `@atelier-lux` / `@atelier-iris` in Claude Code.
 *
 * Usage:
 *   atelier workspace                  → scaffold in cwd (named after cwd basename)
 *   atelier workspace my-brand         → create <cwd>/my-brand/ then scaffold
 *   atelier workspace --here           → scaffold in cwd (alias for no-arg form)
 *   atelier workspace my-brand --force → overwrite existing files (rare)
 *
 * Idempotent: re-running over an existing workspace updates the templated
 * files (workspace.atelier, persona shims) but never clobbers creator-
 * authored content (DESIGN.md, SCRIPT.md, STORYBOARD.md, projects/).
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, copyFileSync } from "node:fs";
import { resolve, join, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

/** Resolve `templates/workspace/` relative to this file (works for both
 *  dist/ build and ts-node source paths). */
function templatesDir(): string {
  // src/commands/workspace.ts → ../../templates/workspace
  // dist/cli.js              → ../templates/workspace
  const here = dirname(fileURLToPath(import.meta.url));
  // Walk up looking for templates/workspace — handles both src + dist layouts
  for (const candidate of [
    join(here, "..", "..", "templates", "workspace"),
    join(here, "..", "templates", "workspace"),
    join(here, "templates", "workspace"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`templates/workspace not found relative to ${here}`);
}

interface ScaffoldOptions {
  /** Absolute path to scaffold INTO. */
  targetDir: string;
  /** Human-readable workspace name (substituted into templated files). */
  workspaceName: string;
  /** Overwrite creator-authored files (DESIGN.md / SCRIPT.md / etc). Default false. */
  force: boolean;
}

interface ScaffoldResult {
  written: string[];      // files we created
  skipped: string[];      // files we left alone (already existed, force=false)
  updated: string[];      // templated files we refreshed (workspace.atelier, persona shims)
}

/**
 * Files we consider TEMPLATED — safe to update on re-run because they're
 * scaffold-generated and don't carry creator content. Everything else gets
 * the "skip-if-exists" treatment so re-running never clobbers authored work.
 */
const TEMPLATED_PATHS = new Set([
  "workspace.atelier",
  ".claude/agents/atelier-quill.md",
  ".claude/agents/atelier-lux.md",
  ".claude/agents/atelier-iris.md",
  "CLAUDE.md",
  "README.md",
  "SETUP.md",
  "_packs/README.md",
  "projects/README.md",
  // Shipped reference doc — canonical cascade protocol the personas link to.
  // Generated (mirror of repo `.paradigm/personas/_shared/cascade-merge.md`),
  // so refresh it on re-scaffold rather than treating it as creator content.
  ".paradigm/personas/_shared/cascade-merge.md",
]);

/**
 * Map a template path to its scaffolded path. npm renames any `.gitignore`
 * inside a published package to `.npmignore`, so the template ships it as
 * `gitignore` and the dot is restored here.
 */
function toScaffoldPath(srcRel: string): string {
  return basename(srcRel) === "gitignore" ? join(dirname(srcRel), ".gitignore") : srcRel;
}

export function scaffoldWorkspace(opts: ScaffoldOptions): ScaffoldResult {
  const tmpl = templatesDir();
  const written: string[] = [];
  const skipped: string[] = [];
  const updated: string[] = [];

  const tokens: Record<string, string> = {
    "{{WORKSPACE_NAME}}": opts.workspaceName,
    "{{ISO_DATE}}": new Date().toISOString().slice(0, 10),
  };

  mkdirSync(opts.targetDir, { recursive: true });

  // Walk template tree and copy with token substitution. Hidden dirs
  // (`.claude`, etc) need explicit handling because Node's readdirSync
  // includes them by default — we want them.
  const walk = (srcRel: string): void => {
    const srcPath = join(tmpl, srcRel);
    const rel = toScaffoldPath(srcRel);
    const dstPath = join(opts.targetDir, rel);
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      mkdirSync(dstPath, { recursive: true });
      for (const entry of readdirSync(srcPath)) {
        walk(srcRel ? join(srcRel, entry) : entry);
      }
      return;
    }
    // File — decide whether to write
    const isTemplated = TEMPLATED_PATHS.has(rel);
    const exists = existsSync(dstPath);

    if (exists && !isTemplated && !opts.force) {
      skipped.push(rel);
      return;
    }

    // Token substitution for text files; binary copy otherwise. We're all
    // text here, but check by extension to future-proof.
    const isText = /\.(md|yaml|atelier|gitignore|html|txt|json)$/.test(rel) || rel.endsWith("/.gitignore") || rel.endsWith(".gitignore");
    if (isText) {
      let body = readFileSync(srcPath, "utf8");
      for (const [k, v] of Object.entries(tokens)) {
        body = body.split(k).join(v);
      }
      writeFileSync(dstPath, body, "utf8");
    } else {
      copyFileSync(srcPath, dstPath);
    }
    (exists ? updated : written).push(rel);
  };

  for (const entry of readdirSync(tmpl)) walk(entry);

  return { written, skipped, updated };
}

/** Register the `workspace` subcommand on the Commander program. */
export function workspaceCommand(program: Command): void {
  program
    .command("workspace [name]")
    .description(
      "Scaffold a v2 Atelier workspace (brand artifacts + persona shims + folder shape). " +
      "With a name, creates <cwd>/<name>/; without, scaffolds into cwd.",
    )
    .option("--here", "Scaffold into cwd (alias for no-name form)")
    .option(
      "--force",
      "Overwrite creator-authored files (DESIGN.md, SCRIPT.md, etc). " +
      "Templated files (workspace.atelier, persona shims) always refresh.",
    )
    .action((nameArg: string | undefined, options: { here?: boolean; force?: boolean }) => {
      const cwd = process.cwd();
      let targetDir: string;
      let workspaceName: string;

      if (nameArg && !options.here) {
        targetDir = resolve(cwd, nameArg);
        // Always use basename for the display/template name — the arg may be
        // a relative or absolute path (`./my-brand`, `/tmp/foo`, `~/x`); we
        // don't want `{{WORKSPACE_NAME}}` substituted with the full path.
        workspaceName = basename(targetDir);
      } else {
        targetDir = cwd;
        workspaceName = basename(cwd);
      }

      try {
        const result = scaffoldWorkspace({
          targetDir,
          workspaceName,
          force: !!options.force,
        });

        const relTarget = relative(cwd, targetDir) || ".";
        console.log(`  Atelier v2 workspace: ${workspaceName}`);
        console.log(`  Location: ${targetDir}`);
        console.log("");
        if (result.written.length) {
          console.log(`  Created (${result.written.length}):`);
          for (const f of result.written) console.log(`    + ${f}`);
        }
        if (result.updated.length) {
          console.log(`  Updated (${result.updated.length}):`);
          for (const f of result.updated) console.log(`    ~ ${f}`);
        }
        if (result.skipped.length) {
          console.log(`  Skipped (${result.skipped.length}) — already authored:`);
          for (const f of result.skipped) console.log(`    . ${f}`);
        }
        console.log("");
        console.log(`  Next:`);
        console.log(`    cd ${relTarget === "." ? cwd : relTarget}`);
        console.log(`    # edit _brand/DESIGN.md, SCRIPT.md, STORYBOARD.md, .atelier-brand.yaml`);
        console.log(`    # drop asset folders into _packs/ (with .atelier-pack.yaml sidecars)`);
        console.log(`    claude    # launch Claude Code; @atelier-quill / @atelier-lux / @atelier-iris are ready`);
        console.log("");
      } catch (err) {
        console.error(`Failed to scaffold workspace: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
