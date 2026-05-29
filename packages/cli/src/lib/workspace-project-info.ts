// #workspace-project-info — pure helpers powering the studio's
// `/api/project/:name/{media,transcripts,artifacts}` endpoints.
//
// All functions are pure (string in, structured object out). The HTTP
// middleware in `commands/studio.ts` wires them to URLs; tests exercise
// them directly without booting Vite.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { classifyMedia, listMediaFiles, type MediaKind } from "./media-project.js";
import { notesPathFor } from "./media-notes.js";

/** A media file in a project, as exposed over the HTTP surface. */
export interface ProjectMediaEntry {
  /** Basename of the file. */
  name: string;
  /** "video" | "image" | "audio" | "font" | "other" */
  kind: MediaKind;
  /** Workspace-or-project-relative path the studio uses for further requests. */
  path: string;
  sizeBytes: number;
  /** True iff a transcript exists for this file (root transcript.json OR transcripts/<name>.json). */
  hasTranscript: boolean;
  /**
   * Workspace-or-project-relative path to the transcript file backing this
   * media entry, when `hasTranscript` is true. Null otherwise. The split-pane
   * media preview uses this to load the transcript without re-deriving the
   * filename on the client. Prefers the per-file mirror under
   * `transcripts/<stem>.json`; falls back to the legacy root `transcript.json`
   * for root `source.<ext>` files only.
   */
  transcriptPath: string | null;
  /** True iff a .notes.md sidecar exists. */
  hasNotes: boolean;
  /** True iff this is a top-level `source.<ext>` (legacy VideoProject convention). */
  isRootSource: boolean;
}

/**
 * List media files for a project. Includes both:
 *   - Files in `<project>/media/` (the new MediaProject convention)
 *   - The legacy root-level `source.<ext>` (kept so existing creator/test1
 *     projects still surface their video without a manual migration).
 *
 * `pathPrefix` is prepended to each entry's `path` so the studio can address
 * the file via `/api/file?path=...`. In workspace mode the server serves the
 * workspace root, so paths look like `<project>/media/source.mp4`.
 */
export function listProjectMedia(
  projectDir: string,
  pathPrefix: string = "",
): ProjectMediaEntry[] {
  const absProject = resolve(projectDir);
  if (!existsSync(absProject)) return [];

  const entries: ProjectMediaEntry[] = [];

  // (1) Root-level source.<ext> — legacy VideoProject layout.
  //     Hidden from the sidebar when the project has any files under media/.
  //     In multi-media mode the root source.<ext> is an INGEST IMPLEMENTATION
  //     DETAIL (a copy of one media/<basename> that `transcribeProject`'s
  //     legacy source-scanner needs) — surfacing it would show a duplicate
  //     of an existing media/ entry. Legacy single-source projects (no
  //     media/ dir) still see their root source.<ext> as the sole entry.
  const mediaDir = join(absProject, "media");
  const hasMediaDir = existsSync(mediaDir) && readdirSync(mediaDir).some((f) => !f.startsWith("."));
  if (!hasMediaDir) {
    const possibleExts = [".mp4", ".mov", ".webm", ".mkv", ".avi"];
    for (const ext of possibleExts) {
      const filename = `source${ext}`;
      const abs = join(absProject, filename);
      if (!existsSync(abs)) continue;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const mirrorPath = join(absProject, "transcripts", "source.json");
      const rootTranscript = join(absProject, "transcript.json");
      let transcriptRel: string | null = null;
      if (existsSync(mirrorPath)) {
        transcriptRel = joinPath(pathPrefix, "transcripts/source.json");
      } else if (existsSync(rootTranscript)) {
        transcriptRel = joinPath(pathPrefix, "transcript.json");
      }
      entries.push({
        name: filename,
        kind: classifyMedia(abs),
        path: joinPath(pathPrefix, filename),
        sizeBytes: st.size,
        hasTranscript: transcriptRel !== null,
        transcriptPath: transcriptRel,
        hasNotes: existsSync(notesPathFor(abs)),
        isRootSource: true,
      });
      break;
    }
  }

  // (2) Files under media/.
  for (const m of listMediaFiles(absProject)) {
    const stemNoExt = m.name.replace(/\.[^.]+$/, "");
    const perFileMirror = join(absProject, "transcripts", `${stemNoExt}.json`);
    const transcriptRel = existsSync(perFileMirror)
      ? joinPath(pathPrefix, `transcripts/${stemNoExt}.json`)
      : null;
    entries.push({
      name: m.name,
      kind: m.kind,
      path: joinPath(pathPrefix, `media/${m.name}`),
      sizeBytes: m.sizeBytes,
      // transcripts may live alongside (transcripts/<basename>.json) or at root.
      hasTranscript: transcriptRel !== null,
      transcriptPath: transcriptRel,
      hasNotes: existsSync(notesPathFor(m.absPath)),
      isRootSource: false,
    });
  }

  return entries;
}

/** A transcript file metadata entry. */
export interface ProjectTranscriptEntry {
  /** Workspace-or-project-relative path. */
  path: string;
  /** Basename. */
  name: string;
  /** Segment count parsed from the file (or null on read error). */
  segments: number | null;
  /** Total duration in seconds (end of last word; null on read error). */
  totalDuration: number | null;
  /** Detected language code (null when absent). */
  language: string | null;
}

/**
 * List transcripts for a project. Looks for:
 *   - Root-level `transcript.json` (legacy VideoProject layout)
 *   - `transcripts/*.json` (newer convention — multi-source projects)
 */
export function listProjectTranscripts(
  projectDir: string,
  pathPrefix: string = "",
): ProjectTranscriptEntry[] {
  const absProject = resolve(projectDir);
  if (!existsSync(absProject)) return [];

  const entries: ProjectTranscriptEntry[] = [];

  // Prefer per-file `transcripts/*.json` (multi-source MediaProject convention).
  // The legacy root `transcript.json` is shown ONLY if no per-file transcripts
  // exist — for a fresh single-source project that hasn't migrated yet. This
  // prevents the confusing case where the root has stale content from a
  // recently-ingested media file and the sidebar shows it side-by-side with
  // the correct per-file transcripts (the studio UX bug surfaced 2026-05-27).
  const transcriptsDir = join(absProject, "transcripts");
  let perFileFound = false;
  if (existsSync(transcriptsDir) && safeIsDir(transcriptsDir)) {
    const list = readdirSync(transcriptsDir).sort();
    for (const name of list) {
      if (!name.endsWith(".json")) continue;
      const abs = join(transcriptsDir, name);
      if (!safeIsFile(abs)) continue;
      entries.push({
        path: joinPath(pathPrefix, `transcripts/${name}`),
        name,
        ...readTranscriptMeta(abs),
      });
      perFileFound = true;
    }
  }

  if (!perFileFound) {
    const rootTranscript = join(absProject, "transcript.json");
    if (existsSync(rootTranscript)) {
      entries.push({
        path: joinPath(pathPrefix, "transcript.json"),
        name: "transcript.json",
        ...readTranscriptMeta(rootTranscript),
      });
    }
  }

  return entries;
}

/** Per-artifact metadata: presence + freshness. */
export interface ProjectArtifactsInfo {
  design: ArtifactEntry;
  script: ArtifactEntry;
  storyboard: ArtifactEntry;
}

export interface ArtifactEntry {
  /** Workspace-or-project-relative path. */
  path: string;
  exists: boolean;
  /** Modified time as ISO string when the file exists. */
  mtime: string | null;
  /** File size in bytes when the file exists. */
  sizeBytes: number | null;
}

/**
 * Report on the three creative-direction artifacts (DESIGN/SCRIPT/STORYBOARD).
 * Used by the workspace sidebar to show checkmarks vs empty rings.
 */
export function listProjectArtifacts(
  projectDir: string,
  pathPrefix: string = "",
): ProjectArtifactsInfo {
  const absProject = resolve(projectDir);
  const entry = (filename: string): ArtifactEntry => {
    const abs = join(absProject, filename);
    if (!existsSync(abs)) {
      return {
        path: joinPath(pathPrefix, filename),
        exists: false,
        mtime: null,
        sizeBytes: null,
      };
    }
    let st;
    try {
      st = statSync(abs);
    } catch {
      return { path: joinPath(pathPrefix, filename), exists: false, mtime: null, sizeBytes: null };
    }
    return {
      path: joinPath(pathPrefix, filename),
      exists: st.isFile(),
      mtime: st.isFile() ? st.mtime.toISOString() : null,
      sizeBytes: st.isFile() ? st.size : null,
    };
  };
  return {
    design: entry("DESIGN.md"),
    script: entry("SCRIPT.md"),
    storyboard: entry("STORYBOARD.md"),
  };
}

// ─── Internal helpers ─────────────────────────────────────────

function joinPath(prefix: string, rest: string): string {
  if (!prefix) return rest;
  // Both prefix and rest are filesystem-style relative paths; join with /.
  return prefix.endsWith("/") ? prefix + rest : `${prefix}/${rest}`;
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeIsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function readTranscriptMeta(absPath: string): {
  segments: number | null;
  totalDuration: number | null;
  language: string | null;
} {
  try {
    const raw = readFileSync(absPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      language?: string;
      segments?: Array<{ words?: Array<{ end?: number }>; end?: number }>;
    };
    const segs = parsed.segments ?? [];
    let maxEnd = 0;
    for (const s of segs) {
      if (typeof s.end === "number" && s.end > maxEnd) maxEnd = s.end;
      for (const w of s.words ?? []) {
        if (typeof w.end === "number" && w.end > maxEnd) maxEnd = w.end;
      }
    }
    return {
      segments: segs.length,
      totalDuration: maxEnd > 0 ? maxEnd : null,
      language: parsed.language ?? null,
    };
  } catch {
    return { segments: null, totalDuration: null, language: null };
  }
}

/** Compute the project subdir name when given a path inside the workspace. */
export function projectNameFromPath(workspaceDir: string, path: string): string | null {
  const absWs = resolve(workspaceDir);
  const abs = resolve(workspaceDir, path);
  if (!abs.startsWith(absWs)) return null;
  const rel = abs.slice(absWs.length + 1);
  const first = rel.split("/")[0];
  return first || null;
}

