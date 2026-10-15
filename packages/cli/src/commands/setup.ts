/**
 * `atelier setup` — install Atelier Design + Produce for every repo on this machine.
 *
 * Copies templates/studio/ into the creator's home so "can we use atelier
 * design for this" and "atelier produce my podcast" work in any Claude Code
 * session:
 *
 *   templates/studio/skills/**    → ~/.claude/skills/**     (always refreshed)
 *   templates/studio/agents/**    → ~/.claude/agents/**     (always refreshed)
 *   templates/studio/atelier/**   → ~/.atelier/**           (always refreshed —
 *                                    cascade-merge.md for repos outside a workspace)
 *   templates/studio/paradigm/**  → ~/.paradigm/**          (skip-if-exists — the crew:
 *                                    Luna, Patrick, Mika (designer), Lux, Quill, Iris;
 *                                    agent state + notebooks accumulate learning;
 *                                    --force overwrites)
 *
 * and records the home studio (an Atelier v2 workspace) and the CLI command
 * in ~/.atelier/config.yaml so sessions inherit the brand cascade and can
 * call the CLI even when `atelier` isn't on PATH.
 *
 * Usage:
 *   atelier setup                    → install; detect home studio from cwd
 *   atelier setup --home ~/my-brand  → install + set the home studio
 *   atelier setup --force            → also overwrite Luna's agent + notebook
 *
 * Idempotent: re-running refreshes the skill and agent shim, keeps learned
 * persona state, and only changes `home:` when a new one is given/detected.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, accessSync, constants } from "node:fs";
import { resolve, join, dirname, delimiter } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** Resolve `templates/studio/` relative to this file (src + dist layouts). */
export function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "..", "templates", "studio"),
    join(here, "..", "templates", "studio"),
    join(here, "templates", "studio"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`templates/studio not found relative to ${here}`);
}

/** Template top-level folder → install root (relative to the user's home)
 *  and whether files there are refreshed on every run. */
export const INSTALL_TARGETS: Record<string, { root: string; refresh: boolean }> = {
  skills: { root: ".claude/skills", refresh: true },
  agents: { root: ".claude/agents", refresh: true },
  atelier: { root: ".atelier", refresh: true },
  paradigm: { root: ".paradigm", refresh: false },
};

/** Every template file as [template folder, path relative to it]. */
export function templateFiles(): { folder: string; rel: string; abs: string }[] {
  const tmpl = templatesDir();
  const out: { folder: string; rel: string; abs: string }[] = [];
  const walk = (folder: string, dir: string, rel: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(folder, abs, join(rel, entry));
      else out.push({ folder, rel: join(rel, entry), abs });
    }
  };
  for (const folder of Object.keys(INSTALL_TARGETS)) {
    const dir = join(tmpl, folder);
    if (existsSync(dir)) walk(folder, dir, "");
  }
  return out;
}

/** Absolute path of `bin` on PATH, or null. */
export function findOnPath(bin: string, pathEnv: string = process.env.PATH ?? ""): string | null {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";") : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      try {
        accessSync(candidate, constants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

export interface SetupOptions {
  /** User home to install into. Defaults to os.homedir(); tests pass a tmp dir. */
  homeDir?: string;
  /** Explicit home studio path (an Atelier v2 workspace). */
  home?: string;
  /** Directory to detect a home studio from when `home` isn't given. */
  cwd?: string;
  /** Overwrite skip-if-exists files (Luna's agent state + notebook). */
  force?: boolean;
  /** Absolute path of the running CLI entry (process.argv[1]); recorded as `cli:`. */
  cliPath?: string;
  /** PATH to search for `atelier`. Defaults to process.env.PATH. */
  pathEnv?: string;
}

export interface SetupResult {
  written: string[];   // paths (relative to homeDir) we created
  updated: string[];   // paths we refreshed
  skipped: string[];   // paths we left alone (learned state)
  configPath: string;
  homeStudio: string | null;
  homeStudioSource: "flag" | "detected" | "existing" | "none";
  /** Command sessions use to run the CLI (`atelier`, or `node <path>`). */
  cli: string | null;
  /** True when `atelier` resolves on PATH. */
  cliOnPath: boolean;
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

  const cliOnPath = findOnPath("atelier", opts.pathEnv) !== null;
  let cli: string | null = typeof config.cli === "string" ? config.cli : null;
  if (cliOnPath) cli = "atelier";
  else if (opts.cliPath) cli = `node ${JSON.stringify(resolve(opts.cliPath))}`;

  const configExisted = existsSync(configPath);
  config = { version: 1, ...config, home: homeStudio, cli };
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    "# Atelier machine config — written by `atelier setup`.\n" +
      "# home: the Atelier workspace whose _brand/ cascade every `atelier design` session inherits.\n" +
      "# cli: how sessions run the Atelier CLI (`atelier`, or `node <path>` when it isn't on PATH).\n" +
      stringifyYaml(config, { lineWidth: 0 }),
    "utf8",
  );
  (configExisted ? updated : written).push(".atelier/config.yaml");

  return { written, updated, skipped, configPath, homeStudio, homeStudioSource, cli, cliOnPath };
}

/** Register the `setup` subcommand on the Commander program. */
export function setupCommand(program: Command): void {
  program
    .command("setup")
    .description(
      "Install Atelier Design + Produce for every repo: the atelier-design and atelier-produce " +
        "skills, the crew (Luna, Mika, Patrick, Lux, Quill, Iris), and ~/.atelier/config.yaml.",
    )
    .option("--home <path>", "Atelier workspace to use as the home studio (brand cascade)")
    .option("--force", "Also overwrite the crew's agent state and notebooks (learned data)")
    .option("--verbose", "List every file written, updated or kept")
    .option("--json", "Print a machine-readable result")
    .action((options: { home?: string; force?: boolean; json?: boolean; verbose?: boolean }) => {
      try {
        const result = runSetup({
          home: options.home,
          cwd: process.cwd(),
          force: !!options.force,
          cliPath: process.argv[1],
        });
        if (options.json) {
          console.log(JSON.stringify({ ok: true, ...result }, null, 2));
          return;
        }
        console.log("  Atelier Design + Produce installed");
        console.log("");
        console.log(
          `  ${result.written.length} created · ${result.updated.length} updated · ` +
            `${result.skipped.length} kept (learned crew state; --force resets)`,
        );
        if (options.verbose) {
          for (const f of result.written) console.log(`    + ~/${f}`);
          for (const f of result.updated) console.log(`    ~ ~/${f}`);
          for (const f of result.skipped) console.log(`    . ~/${f}`);
        }
        console.log("    skills  ~/.claude/skills/atelier-design, atelier-produce");
        console.log("    crew    Luna, Mika, Patrick, Lux, Quill, Iris (~/.paradigm/agents)");
        console.log("");
        if (result.homeStudio) {
          console.log(`  Home studio (${result.homeStudioSource}): ${result.homeStudio}`);
        } else {
          console.log("  Home studio: none — sessions will run repo-only.");
          console.log("    Set one with: atelier setup --home <atelier-workspace>");
        }
        if (!result.cliOnPath) {
          console.log("");
          console.log("  ! `atelier` isn't on your PATH. Sessions will use:");
          console.log(`      ${result.cli ?? "(unknown — re-run setup via the CLI)"}`);
          console.log("    To put it on PATH: npm i -g @a-company/atelier");
          console.log("    or, from an Atelier clone: cd packages/cli && npm link");
        }
        console.log("");
        console.log("  Next: start a NEW Claude Code session (skills load at session start), then");
        console.log("        in any repo: \"can we use atelier design for this?\"");
        console.log("        in your workspace: \"atelier produce my podcast\"");
        console.log("  Check anytime: atelier doctor");
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
