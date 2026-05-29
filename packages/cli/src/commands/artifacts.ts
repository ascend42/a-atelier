import type { Command } from "commander";
import { validateArtifactSet } from "@a-company/atelier-schema";
import { relative, resolve, join } from "node:path";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import {
  loadArtifactsFromProject,
  ARTIFACT_FILENAMES,
  type LoadedArtifactProject,
} from "../lib/artifact-project.js";
import {
  ARTIFACT_TEMPLATES,
  ARTIFACT_SLOTS,
  type ArtifactSlot,
} from "../lib/artifact-templates.js";

/**
 * `atelier artifacts <verb>` — first user-facing surface over the
 * Phase 2 front-of-pipeline artifact schemas (DESIGN/SCRIPT/STORYBOARD).
 *
 * Phase 2 lands the schemas + the `^valid-artifact-set` gate; this CLI
 * verb is the on-disk runner. `atelier artifacts validate <project-dir>`
 * walks a Project directory for the three artifact files, parses each
 * one that's present, runs the cross-artifact validator on whatever
 * parsed, and prints a human or JSON report.
 *
 * Exit-code matrix:
 *   - parse error on any file → 1
 *   - validator returns ok: false → 1
 *   - warnings only, no errors → 0 (per spec §9: pre-VO duration overrun
 *     is warn-only and must NOT fail the gate)
 *   - missing artifacts → 0 (per validator: only what's present is checked)
 *
 * Output style mirrors `recipe.ts` — `console.log` for results, status
 * lines prefixed with PASS/FAIL/WARN, `--json` toggles a machine
 * readable payload. (CLI stdout IS the deliverable here; the generic
 * Paradigm-logger rule does not apply to CLI verbs — see `recipe.ts`,
 * `validate.ts`, etc., which all follow this same convention.)
 */
export function artifactsCommand(program: Command): void {
  const artifacts = program
    .command("artifacts")
    .description("Manage Atelier front-of-pipeline artifacts (DESIGN/SCRIPT/STORYBOARD)");

  artifacts
    .command("validate <project-dir>")
    .description(
      "Validate the DESIGN.md / SCRIPT.md / STORYBOARD.md triplet inside a Project directory. " +
      "Runs the ^valid-artifact-set gate; absent artifacts are noted, not failed.",
    )
    .option("--json", "Emit a machine-readable JSON report instead of human-formatted output")
    .action((projectDir: string, opts: { json?: boolean }) => {
      let loaded: LoadedArtifactProject;
      try {
        loaded = loadArtifactsFromProject(projectDir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`atelier artifacts validate: ${msg}`);
        }
        process.exit(1);
      }

      // Run the cross-artifact validator on whatever parsed cleanly.
      // The validator is no-throw (returns {ok, warnings, errors}).
      const validation = validateArtifactSet({
        design: loaded.design,
        script: loaded.script,
        storyboard: loaded.storyboard,
      });

      const hasParseErrors = loaded.parseErrors.length > 0;
      const ok = !hasParseErrors && validation.ok;

      if (opts.json) {
        emitJson(loaded, validation, ok);
      } else {
        emitHuman(loaded, validation, ok);
      }

      if (!ok) {
        process.exit(1);
      }
    });

  artifacts
    .command("scaffold <project-dir>")
    .description(
      "Write canonical empty DESIGN.md / SCRIPT.md / STORYBOARD.md templates into a Project directory. " +
      "Creates the directory if absent; refuses to overwrite existing files without --force.",
    )
    .option(
      "--only <slots>",
      "Restrict to a subset (design | script | storyboard); comma-separated or repeated flag.",
      collectOnly,
      [] as string[],
    )
    .option("--force", "Overwrite existing artifact files in <project-dir>")
    .option("--json", "Emit a machine-readable JSON report instead of human-formatted output")
    .action((projectDir: string, opts: { only?: string[]; force?: boolean; json?: boolean }) => {
      try {
        const slots = resolveSlots(opts.only ?? []);
        const result = scaffoldArtifacts(projectDir, {
          slots,
          force: opts.force === true,
        });
        if (opts.json) {
          console.log(JSON.stringify({
            ok: true,
            projectDir: result.projectDir,
            created: result.created,
            skipped: result.skipped,
          }, null, 2));
        } else {
          console.log(`Project: ${result.projectDir}`);
          for (const c of result.created) console.log(`  Created  ${c}`);
          for (const s of result.skipped) console.log(`  Skipped  ${s}  (already exists; use --force to overwrite)`);
          console.log("");
          console.log(
            `Result: ${result.created.length} written, ${result.skipped.length} skipped.`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`atelier artifacts scaffold: ${msg}`);
        }
        process.exit(1);
      }
    });
}

/**
 * Commander value collector for `--only`. Supports both `--only design`
 * repeated and `--only design,script` comma-split (and any mix). The
 * previous value is the accumulator commander threads through repeated
 * invocations; default is set to `[]` on the option.
 */
function collectOnly(value: string, previous: string[]): string[] {
  const parts = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return [...previous, ...parts];
}

/**
 * Translate the raw `--only` string list into typed `ArtifactSlot`s and
 * dedupe. Empty input expands to ALL slots (the default behavior). Unknown
 * tokens throw with the legal set listed.
 */
function resolveSlots(raw: string[]): ArtifactSlot[] {
  if (raw.length === 0) return [...ARTIFACT_SLOTS];
  const seen = new Set<ArtifactSlot>();
  for (const token of raw) {
    if (!isArtifactSlot(token)) {
      throw new Error(
        `unknown --only value "${token}" — expected one of ${ARTIFACT_SLOTS.join(", ")}`,
      );
    }
    seen.add(token);
  }
  // Preserve canonical write order (design → script → storyboard).
  return ARTIFACT_SLOTS.filter((s) => seen.has(s));
}

function isArtifactSlot(value: string): value is ArtifactSlot {
  return (ARTIFACT_SLOTS as readonly string[]).includes(value);
}

/** Result surface for the pure `scaffoldArtifacts` helper. */
export interface ScaffoldResult {
  /** Absolute path to the project dir that was written into. */
  projectDir: string;
  /** Absolute paths of files that were created/overwritten. */
  created: string[];
  /** Absolute paths of files that already existed and were skipped. */
  skipped: string[];
}

/**
 * Pure scaffold helper — creates the project dir if absent, writes the
 * selected artifact templates, refuses to overwrite without `force`.
 *
 * If `force` is false and ANY targeted file already exists, the whole
 * operation aborts with a single error listing every would-clobber path
 * (so the creator sees the full conflict in one pass rather than failing
 * one file at a time). Throws on a non-directory project path.
 */
export function scaffoldArtifacts(
  projectDir: string,
  opts: { slots: ArtifactSlot[]; force: boolean },
): ScaffoldResult {
  const absDir = resolve(projectDir);

  // If the path exists, it must be a directory — refusing-to-write into a
  // file is the same failure mode `loadArtifactsFromProject` enforces on
  // the read side, kept symmetric here.
  if (existsSync(absDir)) {
    const stat = statSync(absDir);
    if (!stat.isDirectory()) {
      throw new Error(`project path is not a directory: ${absDir}`);
    }
  } else {
    // Scaffold is a create-then-fill verb — create missing dirs recursively.
    mkdirSync(absDir, { recursive: true });
  }

  const targets = opts.slots.map((slot) => ({
    slot,
    filename: ARTIFACT_TEMPLATES[slot].filename,
    abs: join(absDir, ARTIFACT_TEMPLATES[slot].filename),
    content: ARTIFACT_TEMPLATES[slot].content,
  }));

  // Pre-flight overwrite check: collect EVERY existing target so the error
  // lists the full set, not just the first hit.
  if (!opts.force) {
    const clobbered = targets.filter((t) => existsSync(t.abs)).map((t) => t.abs);
    if (clobbered.length > 0) {
      throw new Error(
        `refusing to overwrite existing file${clobbered.length === 1 ? "" : "s"} ` +
        `(use --force to replace): ${clobbered.join(", ")}`,
      );
    }
  }

  const created: string[] = [];
  const skipped: string[] = [];
  for (const t of targets) {
    if (!opts.force && existsSync(t.abs)) {
      // Defensive — should never hit since the pre-flight aborts, but
      // keeps the helper safe if called programmatically with a partial
      // state.
      skipped.push(t.abs);
      continue;
    }
    writeFileSync(t.abs, t.content, "utf-8");
    created.push(t.abs);
  }

  return { projectDir: absDir, created, skipped };
}

interface ArtifactValidationSummary {
  ok: boolean;
  projectDir: string;
  present: { design: boolean; script: boolean; storyboard: boolean };
  missing: string[];
  parseErrors: Array<{ artifact: string; file: string; message: string }>;
  validation: { ok: boolean; warnings: string[]; errors: string[] };
}

function emitJson(
  loaded: LoadedArtifactProject,
  validation: { ok: boolean; warnings: string[]; errors: string[] },
  ok: boolean,
): void {
  const payload: ArtifactValidationSummary = {
    ok,
    projectDir: loaded.projectDir,
    present: {
      design: loaded.design !== undefined,
      script: loaded.script !== undefined,
      storyboard: loaded.storyboard !== undefined,
    },
    missing: loaded.missing,
    parseErrors: loaded.parseErrors.map((e) => ({
      artifact: e.artifact,
      file: e.file,
      message: e.message,
    })),
    validation: {
      ok: validation.ok,
      warnings: validation.warnings,
      errors: validation.errors,
    },
  };
  console.log(JSON.stringify(payload, null, 2));
}

function emitHuman(
  loaded: LoadedArtifactProject,
  validation: { ok: boolean; warnings: string[]; errors: string[] },
  ok: boolean,
): void {
  console.log(`Project: ${loaded.projectDir}`);

  // Header — show found / not-present status per artifact slot.
  for (const slot of ["design", "script", "storyboard"] as const) {
    const filename = ARTIFACT_FILENAMES[slot];
    const present = loaded[slot] !== undefined;
    const parseErr = loaded.parseErrors.find((e) => e.artifact === slot);
    if (parseErr) {
      console.log(`  ${filename}  FAIL  (parse error)`);
      console.log(`    ${formatRelativeFile(parseErr.file, loaded.projectDir)}: ${parseErr.message}`);
    } else if (present) {
      console.log(`  ${filename}  OK`);
    } else {
      console.log(`  ${filename}  [not present]`);
    }
  }

  // Cross-artifact validation block.
  console.log("");
  console.log("Cross-artifact validation:");
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    console.log("  PASS (no warnings, no errors)");
  } else {
    if (validation.errors.length > 0) {
      console.log(`  Errors (${validation.errors.length}):`);
      for (const e of validation.errors) {
        console.log(`    - ${e}`);
      }
    }
    if (validation.warnings.length > 0) {
      console.log(`  Warnings (${validation.warnings.length}):`);
      for (const w of validation.warnings) {
        console.log(`    - ${w}`);
      }
    }
  }

  // Footer — one-line verdict.
  console.log("");
  console.log(ok ? "Result: PASS" : "Result: FAIL");
}

/**
 * Render an absolute artifact path relative to the project dir for tidy
 * human output, falling back to the absolute path if `relative` fails.
 */
function formatRelativeFile(file: string, projectDir: string): string {
  try {
    const rel = relative(projectDir, file);
    return rel.length > 0 ? rel : file;
  } catch {
    return file;
  }
}
