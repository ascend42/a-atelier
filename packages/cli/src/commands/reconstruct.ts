import type { Command } from "commander";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  transcribeProject,
  type TranscribeOptions,
  type TranscribeResult,
} from "./transcribe.js";

/**
 * `atelier reconstruct [project-dir]` — primes a project for Quill's
 * SCRIPT-reconstruction skill.
 *
 * The pure CLI half of the Veteran hero path:
 *   1. Validate `<project-dir>` (defaults to cwd) is an Atelier Project
 *      (has `project.atelier`).
 *   2. If `transcript.json` already exists, skip transcription.
 *   3. Otherwise, require a `source.<ext>` video, then call into
 *      `transcribeProject` (the existing #cli-transcribe helper — NOT a
 *      shell-out) to write `transcript.json`.
 *   4. Print a one-screen hint telling the creator to invoke Quill in
 *      Claude Code: `@atelier-quill reconstruct`.
 *
 * The CLI does NOT invoke any LLM. Reasoning is Quill's job — she runs in
 * Claude Code, reads the transcript, and writes SCRIPT.md per the
 * canonical `reconstruct-script-from-transcript` skill. The CLI's only job
 * is to make the inputs exist so the chat invocation is one sentence.
 */
export function reconstructCommand(program: Command): void {
  program
    .command("reconstruct [project-dir]")
    .description(
      "Prime an Atelier Project for Quill to reconstruct SCRIPT.md from a " +
      "Whisper transcript. Runs `atelier transcribe` first if no transcript " +
      "exists yet, then prints the hint to invoke @atelier-quill in Claude Code.",
    )
    .option("--json", "Emit a machine-readable JSON report instead of human-formatted output")
    .action(async (
      projectDirArg: string | undefined,
      opts: { json?: boolean },
    ) => {
      try {
        const result = await runReconstruct({
          projectDir: projectDirArg ?? process.cwd(),
          json: opts.json === true,
        });
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
          console.error(`atelier reconstruct: ${msg}`);
        }
        process.exit(1);
      }
    });
}

/** Input to the pure `runReconstruct` helper. */
export interface RunReconstructOptions {
  /** Absolute or relative path to the Project dir. */
  projectDir: string;
  /** Mirror init.ts — JSON mode disables interactive prompts (none here today, kept for parity). */
  json: boolean;
  /**
   * Test injection point — production wiring uses the exported
   * `transcribeProject` helper from `./transcribe.js`. Tests stub this to
   * avoid spawning whisper-cpp in CI; the stub writes a fixture
   * transcript.json into the project dir.
   */
  transcribeFn?: (dir: string, opts: TranscribeOptions) => Promise<TranscribeResult>;
}

/** Result returned by `runReconstruct` and serialized for `--json`. */
export interface ReconstructResult {
  ok: true;
  projectDir: string;
  /** Absolute path to the transcript.json that's ready for Quill. */
  transcriptPath: string;
  /**
   * `null` when SCRIPT.md doesn't exist yet (the typical case — Quill is
   * about to write it). `"existing"` when SCRIPT.md is already on disk
   * (Quill should preserve creator edits per the skill).
   */
  scriptPath: null | "existing";
  /** True after this invocation guarantees `transcript.json` exists. */
  ready: boolean;
  /** True if this invocation ran the transcribe pipeline (vs reused existing transcript). */
  transcribed: boolean;
  /** Notes accumulated during the run (re-use, etc.). */
  notes: string[];
}

const POSSIBLE_SOURCE_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];

/**
 * Pure helper for `atelier reconstruct`. Throws on any irrecoverable
 * error; the Commander wrapper catches and maps to `process.exit(1)`.
 *
 * The flow is deliberately tight:
 *   - Project-dir check before any other work (no source file = no
 *     transcript path forward; a clear error beats a confusing whisper-cpp
 *     stderr later).
 *   - Existing `transcript.json` short-circuits — Quill can reconstruct
 *     against either a fresh or a long-lived transcript.
 *   - Source-file check before invoking transcribe — the whisper error
 *     paths are noisy; this one is precise.
 */
export async function runReconstruct(
  opts: RunReconstructOptions,
): Promise<ReconstructResult> {
  const absDir = resolve(opts.projectDir);
  const notes: string[] = [];

  // 1. Project-dir validation. Must be a directory containing project.atelier.
  if (!existsSync(absDir)) {
    throw new Error(`project dir does not exist: ${absDir}`);
  }
  const st = statSync(absDir);
  if (!st.isDirectory()) {
    throw new Error(`project path is not a directory: ${absDir}`);
  }
  const projectAtelierPath = join(absDir, "project.atelier");
  if (!existsSync(projectAtelierPath)) {
    throw new Error(
      `not an Atelier Project (missing project.atelier): ${absDir}\n` +
      `  hint: run \`atelier init ${absDir}\` first.`,
    );
  }

  // 2. Transcript-discovery: prefer the canonical `transcript.json` at the
  //    project root (the path `atelier transcribe` writes to via
  //    `writeTranscript`). The spec also references `transcripts/<name>.json`
  //    as a forward-compat shape — accept that too, picking the first match.
  const canonicalTranscript = join(absDir, "transcript.json");
  let transcriptPath: string | undefined;
  if (existsSync(canonicalTranscript)) {
    transcriptPath = canonicalTranscript;
  } else {
    // Forward-compat secondary location: transcripts/*.json
    const transcriptsDir = join(absDir, "transcripts");
    if (existsSync(transcriptsDir) && statSync(transcriptsDir).isDirectory()) {
      const fs = await import("node:fs");
      const entries = fs.readdirSync(transcriptsDir)
        .filter((f) => f.endsWith(".json"))
        .sort();
      if (entries.length > 0) {
        transcriptPath = join(transcriptsDir, entries[0]);
      }
    }
  }

  let transcribed = false;
  if (transcriptPath) {
    notes.push(`transcript already present; skipped transcribe`);
  } else {
    // 3. No transcript — we have to run transcribe. Verify the source file
    //    exists FIRST so the error is clear ("no source video") rather than
    //    coming from whisper-cpp's stderr buried in a subprocess failure.
    let foundSource = false;
    for (const ext of POSSIBLE_SOURCE_EXTS) {
      if (existsSync(join(absDir, `source${ext}`))) {
        foundSource = true;
        break;
      }
    }
    if (!foundSource) {
      throw new Error(
        `no source video found in ${absDir} ` +
        `(expected source.mp4 / source.mov / source.webm / source.mkv / source.avi).\n` +
        `  hint: drop your recorded clip into the project dir as source.<ext>, then re-run.`,
      );
    }

    // 4. Invoke the transcribe helper (NOT a subprocess). Tests inject a
    //    stub via opts.transcribeFn that writes a fixture transcript.json.
    const fn = opts.transcribeFn ?? transcribeProject;
    await fn(absDir, {});
    transcribed = true;
    transcriptPath = canonicalTranscript;
    if (!existsSync(transcriptPath)) {
      // Transcribe helper SHOULD have written this; if it didn't, the
      // injected stub is buggy or whisper produced no segments. Either
      // way, surface a precise error rather than printing a hint pointing
      // at a file that doesn't exist.
      throw new Error(
        `transcribe ran but no transcript.json was written at ${transcriptPath}`,
      );
    }
  }

  // 5. SCRIPT.md presence — informational for Quill (she preserves edits
  //    when one already exists per the canonical skill).
  const scriptPathOnDisk = join(absDir, "SCRIPT.md");
  const scriptPath: null | "existing" = existsSync(scriptPathOnDisk) ? "existing" : null;

  return {
    ok: true,
    projectDir: absDir,
    transcriptPath,
    scriptPath,
    ready: true,
    transcribed,
    notes,
  };
}

/**
 * Human-formatted hint — the whole point of the CLI verb is to print one
 * sentence the creator can paste into Claude Code. Mirror the init.ts /
 * artifacts.ts step-by-step style; keep the @atelier-quill invocation
 * line copy-pasteable.
 */
function formatHumanReport(r: ReconstructResult): string[] {
  const lines: string[] = [];
  if (r.transcribed) {
    lines.push(`Transcribed and wrote ${r.transcriptPath}`);
  } else {
    lines.push(`Transcript already present: ${r.transcriptPath}`);
  }
  if (r.scriptPath === "existing") {
    lines.push(`SCRIPT.md already exists; Quill will preserve creator edits where possible.`);
  }
  for (const note of r.notes) {
    lines.push(`  Note: ${note}`);
  }
  lines.push("");
  lines.push(`Transcript ready: ${r.transcriptPath}`);
  lines.push(`  Now ask Quill in Claude Code:`);
  lines.push(`    @atelier-quill reconstruct the SCRIPT for this project from the transcript`);
  lines.push(``);
  lines.push(`  (or, in workspace mode with active project set, just):`);
  lines.push(`    @atelier-quill reconstruct`);
  return lines;
}
