/**
 * `atelier setup` — install Atelier Design for every repo on this machine.
 *
 * Copies templates/design/ into the creator's home so "can we use atelier
 * design for this" works in any Claude Code session:
 *
 *   templates/design/skills/**    → ~/.claude/skills/**     (always refreshed)
 *   templates/design/agents/**    → ~/.claude/agents/**     (always refreshed)
 *   templates/design/paradigm/**  → ~/.paradigm/**          (skip-if-exists —
 *                                    Luna's agent state + notebook accumulate
 *                                    learning; --force overwrites)
 *
 * and records the home studio (an Atelier v2 workspace) in
 * ~/.atelier/config.yaml so sessions inherit the brand cascade.
 *
 * Usage:
 *   atelier setup                    → install; detect home studio from cwd
 *   atelier setup --home ~/my-brand  → install + set the home studio
 *   atelier setup --force            → also overwrite Luna's agent + notebook
 *
 * Idempotent: re-running refreshes the skill and agent shim, keeps learned
 * persona state, and only changes `home:` when a new one is given/detected.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** Resolve `templates/design/` relative to this file (src + dist layouts). */
function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "..", "templates", "design"),
    join(here, "..", "templates", "design"),
    join(here, "templates", "design"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`templates/design not found relative to ${here}`);
}

/** Template top-level folder → install root (relative to the user's home)
 *  and whether files there are refreshed on every run. */
const INSTALL_TARGETS: Record<string, { root: string; refresh: boolean }> = {
  skills: { root: ".claude/skills", refresh: true },
  agents: { root: ".claude/agents", refresh: true },
  paradigm: { root: ".paradigm", refresh: false },
};

export interface SetupOptions {
  /** User home to install into. Defaults to os.homedir(); tests pass a tmp dir. */
  homeDir?: string;
  /** Explicit home studio path (an Atelier v2 workspace). */
  home?: string;
  /** Directory to detect a home studio from when `home` isn't given. */
  cwd?: string;
  /** Overwrite skip-if-exists files (Luna's agent state + notebook). */
  force?: boolean;
}

export interface SetupResult {
  written: string[];   // paths (relative to homeDir) we created
  updated: string[];   // paths we refreshed
  skipped: string[];   // paths we left alone (learned state)
  configPath: string;
  homeStudio: string | null;
  homeStudioSource: "flag" | "detected" | "existing" | "none";
}

/** True when `dir` looks like an Atelier v2 workspace (the brand container). */
export function isAtelierWorkspace(dir: string): boolean {
  return existsSync(join(dir, "workspace.atelier")) && existsSync(join(dir, "_brand"));
}

/** Walk up from `start` looking for an Atelier v2 workspace. */
export function findHomeStudio(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (isAtelierWorkspace(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function expandHome(p: string, homeDir: string): string {
  return p === "~" || p.startsWith("~/") ? join(homeDir, p.slice(1)) : p;
}

export function runSetup(opts: SetupOptions = {}): SetupResult {
  const homeDir = opts.homeDir ?? homedir();
  const tmpl = templatesDir();
  const written: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const tokens: Record<string, string> = {
    "{{ISO_NOW}}": new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  const copyTree = (srcDir: string, dstDir: string, relBase: string, refresh: boolean): void => {
    mkdirSync(dstDir, { recursive: true });
    for (const entry of readdirSync(srcDir)) {
      const src = join(srcDir, entry);
      const dst = join(dstDir, entry);
      const rel = join(relBase, entry);
      if (statSync(src).isDirectory()) {
        copyTree(src, dst, rel, refresh);
        continue;
      }
      const exists = existsSync(dst);
      if (exists && !refresh && !opts.force) {
        skipped.push(rel);
        continue;
      }
      let body = readFileSync(src, "utf8");
      for (const [k, v] of Object.entries(tokens)) body = body.split(k).join(v);
      writeFileSync(dst, body, "utf8");
      (exists ? updated : written).push(rel);
    }
  };

  for (const [folder, target] of Object.entries(INSTALL_TARGETS)) {
    const src = join(tmpl, folder);
    if (!existsSync(src)) continue;
    copyTree(src, join(homeDir, target.root), target.root, target.refresh);
  }

  // ~/.atelier/config.yaml — preserve every other key; only `home` is ours.
  const configPath = join(homeDir, ".atelier", "config.yaml");
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const parsed = parseYaml(readFileSync(configPath, "utf8"));
    if (parsed && typeof parsed === "object") config = parsed as Record<string, unknown>;
  }

  let homeStudio: string | null = null;
  let homeStudioSource: SetupResult["homeStudioSource"] = "none";
  if (opts.home) {
    homeStudio = resolve(expandHome(opts.home, homeDir));
    if (!isAtelierWorkspace(homeStudio)) {
      throw new Error(
        `${homeStudio} is not an Atelier workspace (needs workspace.atelier + _brand/). ` +
          "Create one with `atelier workspace <name>`.",
      );
    }
    homeStudioSource = "flag";
  } else {
    const detected = opts.cwd ? findHomeStudio(opts.cwd) : null;
    if (detected) {
      homeStudio = detected;
      homeStudioSource = "detected";
    } else if (typeof config.home === "string" && config.home) {
      homeStudio = config.home;
      homeStudioSource = "existing";
    }
  }

  const configExisted = existsSync(configPath);
  config = { version: 1, ...config, home: homeStudio };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    "# Atelier machine config — written by `atelier setup`.\n" +
      "# home: the Atelier workspace whose _brand/ cascade every `atelier design` session inherits.\n" +
      stringifyYaml(config),
    "utf8",
  );
  (configExisted ? updated : written).push(".atelier/config.yaml");

  return { written, updated, skipped, configPath, homeStudio, homeStudioSource };
}

/** Register the `setup` subcommand on the Commander program. */
export function setupCommand(program: Command): void {
  program
    .command("setup")
    .description(
      "Install Atelier Design for every repo: the atelier-design skill, the Luna agent, " +
        "and the home studio pointer (~/.atelier/config.yaml).",
    )
    .option("--home <path>", "Atelier workspace to use as the home studio (brand cascade)")
    .option("--force", "Also overwrite Luna's agent state and notebook (learned data)")
    .option("--json", "Print a machine-readable result")
    .action((options: { home?: string; force?: boolean; json?: boolean }) => {
      try {
        const result = runSetup({ home: options.home, cwd: process.cwd(), force: !!options.force });
        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
          return;
        }
        console.log("  Atelier Design installed");
        console.log("");
        if (result.written.length) {
          console.log(`  Created (${result.written.length}):`);
          for (const f of result.written) console.log(`    + ~/${f}`);
        }
        if (result.updated.length) {
          console.log(`  Updated (${result.updated.length}):`);
          for (const f of result.updated) console.log(`    ~ ~/${f}`);
        }
        if (result.skipped.length) {
          console.log(`  Kept (${result.skipped.length}) — learned state, use --force to reset:`);
          for (const f of result.skipped) console.log(`    . ~/${f}`);
        }
        console.log("");
        if (result.homeStudio) {
          console.log(`  Home studio (${result.homeStudioSource}): ${result.homeStudio}`);
        } else {
          console.log("  Home studio: none — sessions will run repo-only.");
          console.log("    Set one with: atelier setup --home <atelier-workspace>");
        }
        console.log("");
        console.log("  Next: in any repo, ask Claude Code \"can we use atelier design for this?\"");
        console.log("");
      } catch (err) {
        if (options.json) {
          console.log(JSON.stringify({ ok: false, error: (err as Error).message }, null, 2));
        } else {
          console.error(`Failed to set up Atelier Design: ${(err as Error).message}`);
        }
        process.exit(1);
      }
    });
}
