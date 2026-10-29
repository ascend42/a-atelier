/**
 * `atelier doctor` — check that Atelier Design + Produce will work on this machine.
 *
 * Read-only. Reports, for each check, ok / warn / fail plus the one command
 * that fixes it:
 *
 *   node       Node ≥ 20                                    (fail)
 *   skills     ~/.claude/skills/atelier-* present + current (fail if missing, warn if outdated)
 *   agents     ~/.claude/agents/atelier-* shims current     (warn)
 *   crew       ~/.paradigm/agents/<persona>.agent present   (warn)
 *   config     ~/.atelier/config.yaml + home studio valid   (warn)
 *   cli        `atelier` on PATH, or a working `cli:`        (warn)
 *   media      ffmpeg / ffprobe / whisper-cli on PATH       (warn — episode runs only)
 *   ui-gate    opt-in UI review gate: hook current, and when registered in
 *              ~/.claude/settings.json, registered for every event   (warn)
 *
 * Exit code 1 only when a `fail` check exists, so it's safe in scripts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Command } from "commander";
import { parse as parseYaml } from "yaml";

import { INSTALL_TARGETS, templateFiles, findOnPath, isAtelierWorkspace } from "./setup.js";

export type CheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  id: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

export interface DoctorOptions {
  homeDir?: string;
  pathEnv?: string;
  nodeVersion?: string;
}

const CREW = ["luna", "designer", "patrick", "lux", "quill", "iris"];
const MEDIA_TOOLS = ["ffmpeg", "ffprobe", "whisper-cli"];
const SETUP_FIX = "atelier setup";
/** Each ui-gate.mjs mode and the Claude Code hook events it must be registered on. */
export const UI_GATE_EVENTS: { event: string; mode: string; matcher?: string }[] = [
  { event: "PostToolUse", mode: "post", matcher: "Edit|Write|MultiEdit|NotebookEdit" },
  { event: "PreToolUse", mode: "pre", matcher: "Agent|Task" },
  { event: "Stop", mode: "stop" },
  { event: "SubagentStop", mode: "stop" },
];

/** Which UI_GATE_EVENTS ~/.claude/settings.json registers ui-gate.mjs on (by event name). */
export function uiGateRegistrations(settingsPath: string): Set<string> {
  const found = new Set<string>();
  if (!existsSync(settingsPath)) return found;
  let hooks: Record<string, { hooks?: { command?: string }[] }[]> = {};
  try {
    hooks = JSON.parse(readFileSync(settingsPath, "utf8"))?.hooks ?? {};
  } catch {
    return found;
  }
  for (const { event, mode } of UI_GATE_EVENTS) {
    const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
    const re = new RegExp(`ui-gate\\.mjs["']?\\s+${mode}\\b`);
    if (groups.some((g) => (g.hooks ?? []).some((h) => typeof h.command === "string" && re.test(h.command)))) found.add(event);
  }
  return found;
}

export function runDoctor(opts: DoctorOptions = {}): DoctorCheck[] {
  const homeDir = opts.homeDir ?? homedir();
  const pathEnv = opts.pathEnv ?? process.env.PATH ?? "";
  const checks: DoctorCheck[] = [];

  // node
  const nodeVersion = opts.nodeVersion ?? process.versions.node;
  const major = Number(nodeVersion.split(".")[0]);
  checks.push(
    major >= 20
      ? { id: "node", status: "ok", message: `Node ${nodeVersion}` }
      : { id: "node", status: "fail", message: `Node ${nodeVersion} is too old (need ≥ 20)`, fix: "install Node 20 or newer" },
  );

  // skills + agent shims: compare installed files to the templates this CLI ships
  const files = templateFiles();
  for (const [folder, label, missingStatus] of [
    ["skills", "skills", "fail"],
    ["agents", "agents", "warn"],
  ] as const) {
    const root = INSTALL_TARGETS[folder].root;
    const mine = files.filter((f) => f.folder === folder);
    const missing = mine.filter((f) => !existsSync(join(homeDir, root, f.rel)));
    const outdated = mine.filter(
      (f) => existsSync(join(homeDir, root, f.rel)) && readFileSync(join(homeDir, root, f.rel), "utf8") !== readFileSync(f.abs, "utf8"),
    );
    if (missing.length) {
      checks.push({
        id: label,
        status: missingStatus,
        message: `${missing.length} of ${mine.length} ${label} files missing in ~/${root} (e.g. ${missing[0].rel})`,
        fix: SETUP_FIX,
      });
    } else if (outdated.length) {
      checks.push({
        id: label,
        status: "warn",
        message: `${outdated.length} ${label} files differ from this CLI's version (e.g. ${outdated[0].rel})`,
        fix: SETUP_FIX,
      });
    } else {
      checks.push({ id: label, status: "ok", message: `${mine.length} ${label} files current in ~/${root}` });
    }
  }

  // crew personas
  const missingCrew = CREW.filter((p) => !existsSync(join(homeDir, ".paradigm", "agents", `${p}.agent`)));
  checks.push(
    missingCrew.length
      ? {
          id: "crew",
          status: "warn",
          message: `missing personas: ${missingCrew.join(", ")} (sessions run, with less guidance)`,
          fix: SETUP_FIX,
        }
      : { id: "crew", status: "ok", message: "Luna, Mika, Patrick, Lux, Quill, Iris installed" },
  );

  // config + home studio
  const configPath = join(homeDir, ".atelier", "config.yaml");
  let config: Record<string, unknown> = {};
  if (!existsSync(configPath)) {
    checks.push({ id: "config", status: "warn", message: "~/.atelier/config.yaml not found", fix: SETUP_FIX });
  } else {
    try {
      const parsed = parseYaml(readFileSync(configPath, "utf8"));
      if (parsed && typeof parsed === "object") config = parsed as Record<string, unknown>;
      const home = typeof config.home === "string" ? config.home : null;
      if (!home) {
        checks.push({
          id: "config",
          status: "ok",
          message: "no home studio — sessions run repo-only",
          fix: "optional: atelier setup --home <atelier-workspace>",
        });
      } else if (isAtelierWorkspace(home)) {
        checks.push({ id: "config", status: "ok", message: `home studio: ${home}` });
      } else {
        checks.push({
          id: "config",
          status: "warn",
          message: `home studio ${home} is not an Atelier workspace (moved or deleted?)`,
          fix: "atelier setup --home <atelier-workspace>",
        });
      }
    } catch (err) {
      checks.push({ id: "config", status: "warn", message: `config.yaml unreadable: ${(err as Error).message}`, fix: SETUP_FIX });
    }
  }

  // cli
  const onPath = findOnPath("atelier", pathEnv);
  const cli = typeof config.cli === "string" ? config.cli : null;
  if (onPath) {
    checks.push({ id: "cli", status: "ok", message: `atelier on PATH (${onPath})` });
  } else if (cli && cli !== "atelier") {
    checks.push({
      id: "cli",
      status: "ok",
      message: `atelier not on PATH; sessions use ${cli}`,
      fix: "optional: npm i -g @a-company/atelier (or `npm link` in packages/cli of a clone)",
    });
  } else {
    checks.push({
      id: "cli",
      status: "warn",
      message: "atelier not on PATH and no cli: in config — episode runs can't ingest or transcribe",
      fix: "npm i -g @a-company/atelier (or `npm link` in packages/cli of a clone), then atelier setup",
    });
  }

  // media tools (produce episode runs)
  const missingMedia = MEDIA_TOOLS.filter((t) => !findOnPath(t, pathEnv));
  checks.push(
    missingMedia.length
      ? {
          id: "media",
          status: "warn",
          message: `not found: ${missingMedia.join(", ")} (needed for produce episode runs, not design)`,
          fix: "brew install ffmpeg whisper-cpp (macOS); renders also need `npx hyperframes doctor`",
        }
      : { id: "media", status: "ok", message: "ffmpeg, ffprobe, whisper-cli found" },
  );

  // ui-gate: opt in, so "not registered" is fine; half registered or stale is not
  const hookPath = join(homeDir, ".atelier", "hooks", "ui-gate.mjs");
  const shipped = templateFiles().find((f) => f.folder === "atelier" && f.rel === join("hooks", "ui-gate.mjs"));
  const registered = uiGateRegistrations(join(homeDir, ".claude", "settings.json"));
  const missingEvents = UI_GATE_EVENTS.filter((e) => !registered.has(e.event)).map((e) => e.event);
  if (!registered.size) {
    checks.push({ id: "ui-gate", status: "ok", message: "UI review gate not switched on (opt in: see the README)" });
  } else if (!existsSync(hookPath) || (shipped && readFileSync(hookPath, "utf8") !== readFileSync(shipped.abs, "utf8"))) {
    checks.push({ id: "ui-gate", status: "warn", message: "UI review gate is on, but ~/.atelier/hooks/ui-gate.mjs is missing or outdated", fix: SETUP_FIX });
  } else if (missingEvents.length) {
    checks.push({
      id: "ui-gate",
      status: "warn",
      message: `UI review gate is on, but not registered for ${missingEvents.join(", ")}`,
      fix: "add the missing entries from the README's UI review gate snippet to ~/.claude/settings.json",
    });
  } else {
    checks.push({ id: "ui-gate", status: "ok", message: "UI review gate on and current" });
  }

  return checks;
}

const MARK: Record<CheckStatus, string> = { ok: "✓", warn: "!", fail: "✗" };

/** Register the `doctor` subcommand on the Commander program. */
export function doctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check that Atelier Design + Produce are installed and ready on this machine")
    .option("--json", "Print a machine-readable result")
    .action((options: { json?: boolean }) => {
      const checks = runDoctor();
      const failed = checks.some((c) => c.status === "fail");
      if (options.json) {
        console.log(JSON.stringify({ ok: !failed, checks }, null, 2));
      } else {
        console.log("  Atelier doctor");
        console.log("");
        for (const c of checks) {
          console.log(`  ${MARK[c.status]} ${c.id.padEnd(7)} ${c.message}`);
          if (c.fix && c.status !== "ok") console.log(`    ${"".padEnd(7)} fix: ${c.fix}`);
        }
        console.log("");
        if (failed) console.log("  Not ready — run the fixes above.");
        else console.log('  Ready. In a new Claude Code session: "can we use atelier design for this?"');
        console.log("");
      }
      if (failed) process.exit(1);
    });
}
