import type { Command } from "commander";
import { existsSync, copyFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  classifyMedia,
  ensureMediaDir,
  listMediaFiles,
  mediaDir,
  type MediaKind,
  type MediaListEntry,
} from "../lib/media-project.js";
import {
  notesPathFor,
  scaffoldMediaNotes,
} from "../lib/media-notes.js";
import { transcribeProject, type TranscribeOptions, type TranscribeResult } from "./transcribe.js";

/**
 * `atelier media <verb>` — the creator-facing surface over the project's
 * `media/` directory convention.
 *
 *   atelier media ingest <file> [--project <dir>] [--no-transcribe] [--no-notes] [--json]
 *   atelier media list   [--project <dir>] [--json]
 *   atelier media note   <file> [--project <dir>]
 *
 * Ingest copies a file into `<project>/media/<basename>`, optionally
 * transcribes (videos only) via the in-process `transcribeProject` helper,
 * and scaffolds a sidecar `<file>.notes.md`. List inventories what's there.
 * Note opens the notes file in $EDITOR (or prints the path when no editor
 * is configured).
 */
export function mediaCommand(program: Command): void {
  const media = program
    .command("media")
    .description("Manage a Project's media/ directory (videos, images, audio, fonts)");

  // ── atelier media ingest ────────────────────────────────────
  media
    .command("ingest <file>")
    .description(
      "Copy a media file into <project>/media/, optionally transcribe (videos) " +
      "and scaffold a sidecar notes file.",
    )
    .option("--project <dir>", "Project directory (default: cwd)")
    .option("--no-transcribe", "Skip transcription for video files")
    .option("--no-notes", "Skip notes-file scaffolding")
    .option("--force", "Overwrite an existing media/<basename> entry")
    .option("--json", "Emit a machine-readable JSON report")
    .action(
      async (
        file: string,
        opts: {
          project?: string;
          transcribe: boolean; // commander inverts --no-transcribe → false
          notes: boolean;
          force?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          const result = await runMediaIngest({
            file,
            projectDir: opts.project ?? process.cwd(),
            transcribe: opts.transcribe,
            notes: opts.notes,
            force: opts.force === true,
          });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatIngestReport(result));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
          } else {
            console.error(`atelier media ingest: ${msg}`);
          }
          process.exit(1);
        }
      },
    );

  // ── atelier media list ──────────────────────────────────────
  media
    .command("list")
    .description("List files in <project>/media/ with kind and size.")
    .option("--project <dir>", "Project directory (default: cwd)")
    .option("--json", "Emit JSON array")
    .action((opts: { project?: string; json?: boolean }) => {
      try {
        const projectDir = resolveProjectDir(opts.project ?? process.cwd());
        const entries = listMediaFiles(projectDir);
        if (opts.json) {
          console.log(JSON.stringify(entries, null, 2));
        } else {
          if (entries.length === 0) {
            console.log(`media/ is empty (project: ${projectDir})`);
            return;
          }
          console.log(`media/ in ${projectDir}:`);
          for (const e of entries) {
            console.log(`  ${e.kind.padEnd(6)} ${formatBytes(e.sizeBytes).padStart(10)}  ${e.name}`);
          }
          console.log("");
          console.log(`${entries.length} file${entries.length === 1 ? "" : "s"}.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ ok: false, error: msg }, null, 2));
        } else {
          console.error(`atelier media list: ${msg}`);
        }
        process.exit(1);
      }
    });

  // ── atelier media note ──────────────────────────────────────
  media
    .command("note <file>")
    .description(
      "Open <project>/media/<file>.notes.md in $EDITOR. Scaffolds the notes " +
      "file if it doesn't exist; prints the path when no editor is configured.",
    )
    .option("--project <dir>", "Project directory (default: cwd)")
    .action((file: string, opts: { project?: string }) => {
      try {
        const result = runMediaNote({
          file,
          projectDir: opts.project ?? process.cwd(),
        });
        if (result.editorLaunched) {
          // No additional output — the editor takes over.
          return;
        }
        // No-TTY / no-EDITOR path: print the path so the creator can open it
        // themselves. This is the documented behavior in the spec.
        console.log(result.notesPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`atelier media note: ${msg}`);
        process.exit(1);
      }
    });
}

// ─── Pure helpers — testable without spawning processes ──────────

export interface RunMediaIngestOptions {
  file: string;
  projectDir: string;
  transcribe: boolean;
  notes: boolean;
  force: boolean;
  /**
   * Test injection point — production wiring uses the exported
   * `transcribeProject` helper. Tests stub this to avoid spawning
   * whisper-cpp in CI (same pattern as `reconstruct.ts`).
   */
  transcribeFn?: (dir: string, opts: TranscribeOptions) => Promise<TranscribeResult>;
  /** Test injection point for the creator id stamped into notes frontmatter. */
  addedBy?: string;
}

export interface IngestResult {
  ok: true;
  projectDir: string;
  ingestedAs: string;
  kind: MediaKind;
  transcribed: boolean;
  transcriptPath?: string;
  notesPath?: string;
  notesAction?: "created" | "preserved";
}

/**
 * Pure ingest helper — copies the file into the project's media dir,
 * optionally transcribes a video, optionally scaffolds notes. Returns a
 * structured result; throws on irrecoverable errors (missing source file,
 * non-project dir, refused-overwrite).
 */
export async function runMediaIngest(opts: RunMediaIngestOptions): Promise<IngestResult> {
  const absProject = resolveProjectDir(opts.projectDir);
  const absSource = resolve(opts.file);

  if (!existsSync(absSource)) {
    throw new Error(`source file does not exist: ${absSource}`);
  }
  const srcStat = statSync(absSource);
  if (!srcStat.isFile()) {
    throw new Error(`source path is not a regular file: ${absSource}`);
  }

  const mediaDirAbs = ensureMediaDir(absProject);
  const destBasename = basename(absSource);
  const destPath = join(mediaDirAbs, destBasename);

  if (existsSync(destPath) && !opts.force) {
    throw new Error(
      `media/${destBasename} already exists in ${absProject} — re-run with --force to overwrite`,
    );
  }

  // Atomic-ish: copy, then verify presence. fs.copyFileSync overwrites by
  // default; we have already gated overwrite above.
  copyFileSync(absSource, destPath);
  if (!existsSync(destPath)) {
    throw new Error(`copy succeeded but destination missing: ${destPath}`);
  }

  const kind = classifyMedia(destPath);

  const result: IngestResult = {
    ok: true,
    projectDir: absProject,
    ingestedAs: destPath,
    kind,
    transcribed: false,
  };

  // Transcription — videos only, opt-out via --no-transcribe.
  if (opts.transcribe && kind === "video") {
    // Per the spec, transcription runs against the project root (which is
    // where transcript.json lands). We invoke the existing helper exactly
    // like reconstruct.ts does — same in-process pattern, no subprocess.
    const fn = opts.transcribeFn ?? transcribeProject;
    // The transcribe pipeline reads `source.<ext>` from the project root.
    // If the project has a top-level source.<ext>, that's what it uses;
    // here we're working with media/<name>.<ext>, so transcription only
    // runs when the project also has a usable source (the typical case
    // after `atelier init`). If it doesn't, we skip rather than fail —
    // the creator may have ingested a B-roll clip into media/ without a
    // primary source video being set up yet.
    if (projectHasSourceVideo(absProject)) {
      await fn(absProject, {});
      result.transcribed = true;
      result.transcriptPath = join(absProject, "transcript.json");
    }
  }

  // Notes scaffolding — default-on, opt-out via --no-notes.
  if (opts.notes) {
    const addedBy = opts.addedBy ?? process.env.USER ?? "creator";
    const noteResult = scaffoldMediaNotes(destPath, { addedBy });
    result.notesPath = noteResult.path;
    result.notesAction = noteResult.action;
  }

  return result;
}

export interface RunMediaNoteResult {
  notesPath: string;
  editorLaunched: boolean;
  scaffolded: boolean;
}

/**
 * Open / scaffold a notes file for a media entry. Returns whether an editor
 * was launched and whether the file was freshly scaffolded. Pure-ish: spawns
 * $EDITOR when present, never throws on a successful scaffold.
 */
export function runMediaNote(opts: { file: string; projectDir: string }): RunMediaNoteResult {
  const absProject = resolveProjectDir(opts.projectDir);
  const mediaDirAbs = mediaDir(absProject);

  // The caller may pass either a basename ("source.mp4") or an absolute
  // path. Normalize: if the path doesn't exist as-is, look it up under
  // media/.
  let mediaAbsPath: string;
  if (existsSync(opts.file) && statSync(opts.file).isFile()) {
    mediaAbsPath = resolve(opts.file);
  } else {
    mediaAbsPath = join(mediaDirAbs, opts.file);
    if (!existsSync(mediaAbsPath)) {
      throw new Error(
        `media file not found: ${opts.file} (looked in ${mediaDirAbs})`,
      );
    }
  }

  const notesPath = notesPathFor(mediaAbsPath);

  let scaffolded = false;
  if (!existsSync(notesPath)) {
    const addedBy = process.env.USER ?? "creator";
    const res = scaffoldMediaNotes(mediaAbsPath, { addedBy });
    scaffolded = res.action === "created";
  }

  const editor = process.env.EDITOR;
  const hasTty = Boolean(process.stdout.isTTY);
  // Spec: when EDITOR is unset and there's no TTY, print the path instead
  // of launching anything. With EDITOR + TTY we spawn; with EDITOR + no
  // TTY (CI / piped) we still try, since the user explicitly chose an
  // editor.
  if (!editor && !hasTty) {
    return { notesPath, editorLaunched: false, scaffolded };
  }
  const cmd = editor && editor.length > 0 ? editor : "vi";
  const spawn = spawnSync(cmd, [notesPath], { stdio: "inherit" });
  if (spawn.error) {
    // Fall back to printing the path if the editor can't run. Don't throw —
    // a missing editor isn't a project error.
    return { notesPath, editorLaunched: false, scaffolded };
  }
  return { notesPath, editorLaunched: true, scaffolded };
}

// ─── Internal helpers ────────────────────────────────────────────

/** Resolve and validate that a directory is an Atelier project (has project.atelier). */
function resolveProjectDir(projectDir: string): string {
  const abs = resolve(projectDir);
  if (!existsSync(abs)) {
    throw new Error(`project dir does not exist: ${abs}`);
  }
  if (!statSync(abs).isDirectory()) {
    throw new Error(`project path is not a directory: ${abs}`);
  }
  const atelierPath = join(abs, "project.atelier");
  if (!existsSync(atelierPath)) {
    throw new Error(
      `not an Atelier project (missing project.atelier): ${abs}\n` +
      `  hint: run \`atelier init ${abs}\` first.`,
    );
  }
  return abs;
}

const POSSIBLE_SOURCE_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".avi"];

function projectHasSourceVideo(projectDir: string): boolean {
  for (const ext of POSSIBLE_SOURCE_EXTS) {
    if (existsSync(join(projectDir, `source${ext}`))) return true;
  }
  return false;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatIngestReport(r: IngestResult): string {
  const lines: string[] = [];
  lines.push(`Ingested ${r.ingestedAs}`);
  lines.push(`  kind:        ${r.kind}`);
  lines.push(`  project:     ${r.projectDir}`);
  if (r.transcribed) {
    lines.push(`  transcript:  ${r.transcriptPath}`);
  } else {
    lines.push(`  transcript:  skipped`);
  }
  if (r.notesPath) {
    lines.push(`  notes:       ${r.notesPath} (${r.notesAction})`);
  } else {
    lines.push(`  notes:       skipped`);
  }
  return lines.join("\n");
}

// Re-export the list entry shape for outside consumers (tests, MCP wrappers).
export type { MediaListEntry };
