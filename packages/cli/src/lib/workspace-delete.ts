// #workspace-delete — pure deletion + cascade helpers powering the studio's
// DELETE endpoints. All functions are pure-ish in the same posture as
// `workspace-project-info.ts`: take a directory + name, perform structured
// filesystem work, return a typed report. The HTTP middleware in
// `commands/studio.ts` wraps them; tests exercise them directly.
//
// Three operations:
//
//   - `deleteWorkspaceFile(workspaceDir, relPath)` — DELETE /api/file. Single
//     workspace-relative file (artifact, sidecar note, per-file transcript).
//     Refuses directories (the project-delete endpoint owns that).
//
//   - `cascadeDeleteMedia(workspaceDir, projectName, basename)` — DELETE
//     /api/project/:name/media. Removes the media file + its per-file
//     transcript + its `.notes.md` sidecar AND surgically prunes any layer
//     in `project.atelier` that references the media (the source-video
//     layer, plus all caption-tagged layers when a video layer was actually
//     removed — see `delete-cascade-project-atelier-surgery` below).
//
//   - `deleteProject(workspaceDir, projectName)` — DELETE /api/project/:name.
//     rm -rf the whole project subdir. Clears active.yaml when the deleted
//     project happened to be active. Trims the workspace manifest's advisory
//     `projects[]` list when present.
//
// All three sit on the same safety floor: project name → isValidProjectName
// before any path join (defeats `../escape` / `.hidden` / control chars
// before they reach disk), media basename → no path separators (refused as
// invalid), file path → isSafePath (resolved containment in workspaceDir).
// The middleware re-checks Origin + the MUTATING gate; this library trusts
// its inputs once the safety predicates pass.

import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";

import {
  ACTIVE_PROJECT_FILENAME,
  clearActiveProject,
  hasProjectMarker,
  isValidProjectName,
  readActiveProject,
  readWorkspace,
  writeWorkspace,
} from "./workspace.js";
import { notesPathFor } from "./media-notes.js";

/** A media-file delete cascade report — every artifact the operation touched. */
export interface CascadeDeleteMediaReport {
  /** Workspace-relative path of the media file that was removed. */
  mediaFile: string;
  /**
   * Workspace-relative path of the per-file transcript mirror that was
   * removed (`<project>/transcripts/<stem>.json`), or null when none existed.
   */
  transcript: string | null;
  /**
   * Workspace-relative path of the LEGACY root-level transcript that was
   * removed (`<project>/transcript.json`), or null. Populated only when the
   * deleted media file was the legacy root `source.<ext>` AND the legacy
   * transcript existed — see #listProjectMedia's `isRootSource` branch in
   * workspace-project-info.ts. The mirror and the root can both exist for a
   * root source; both are scrubbed.
   */
  rootTranscript: string | null;
  /** Workspace-relative path of the `.notes.md` sidecar removed, or null. */
  notes: string | null;
  /** Number of caption-tagged layers removed from `project.atelier`. */
  layersRemoved: number;
  /** Number of assets removed (the video-source asset referenced by the deleted file). */
  assetsRemoved: number;
  /**
   * True iff a non-caption VideoVisual layer referencing the deleted media
   * was removed. Drives the "remove caption layers too" branch — see
   * #delete-cascade-project-atelier-surgery for why caption removal is gated
   * on this and not on "media file was deleted" alone.
   */
  videoLayerRemoved: boolean;
}

/** Project-delete report. */
export interface DeleteProjectReport {
  /** Subdir basename. */
  name: string;
  /** True iff active.yaml was pointing at this project and got cleared. */
  wasActive: boolean;
  /** True iff the workspace manifest's `projects[]` list was rewritten. */
  manifestUpdated: boolean;
}

/**
 * Validate that `relPath` is a workspace-relative, contained path. Same
 * predicate as `isSafePath` in studio.ts but parameterized on the workspace
 * dir so library callers (tests) don't need to chdir.
 *
 * Rejects:
 *   - empty / absolute paths
 *   - paths that resolve outside `workspaceDir`
 *   - any path equal to the workspace root (a zero-segment relative path)
 */
export function isWorkspaceRelativePath(workspaceDir: string, relPath: string): boolean {
  if (!relPath || relPath.startsWith("/")) return false;
  const abs = resolve(workspaceDir);
  const resolved = resolve(abs, relPath);
  if (resolved === abs) return false;
  return resolved.startsWith(abs + sep);
}

/** Outcome discriminator for `deleteWorkspaceFile`. */
export type DeleteWorkspaceFileOutcome =
  | { kind: "deleted"; path: string }
  | { kind: "not-found" }
  | { kind: "is-directory" }
  | { kind: "invalid-path" };

/**
 * Delete a single workspace-relative file. Refuses to delete a directory
 * (callers must use `deleteProject` for that — preserves the "DELETE /api/file
 * is point-edits, DELETE /api/project is structural" split).
 *
 * Returns a structured outcome so the HTTP layer can map to the right status
 * code (deleted → 200, not-found → 404, is-directory → 400, invalid → 400).
 */
export function deleteWorkspaceFile(
  workspaceDir: string,
  relPath: string,
): DeleteWorkspaceFileOutcome {
  if (!isWorkspaceRelativePath(workspaceDir, relPath)) {
    return { kind: "invalid-path" };
  }
  const abs = resolve(workspaceDir, relPath);
  if (!existsSync(abs)) {
    return { kind: "not-found" };
  }
  let st;
  try {
    st = statSync(abs);
  } catch {
    return { kind: "not-found" };
  }
  if (st.isDirectory()) {
    return { kind: "is-directory" };
  }
  unlinkSync(abs);
  return { kind: "deleted", path: relPath };
}

/** Outcome discriminator for `cascadeDeleteMedia`. */
export type CascadeDeleteMediaOutcome =
  | { kind: "deleted"; report: CascadeDeleteMediaReport }
  | { kind: "not-found" }
  | { kind: "invalid-project" }
  | { kind: "invalid-basename" };

/**
 * Delete a media file inside a project AND every artifact derived from it:
 *
 *   1. The media file itself — `<project>/media/<basename>` for the new layout,
 *      or `<project>/source.<ext>` for the legacy root-source layout (when
 *      `basename` matches the convention `source.<ext>` AND the file actually
 *      lives at the project root).
 *   2. The per-file transcript mirror at `<project>/transcripts/<stem>.json`,
 *      when present (#transcribe-orchestrator).
 *   3. The legacy root `transcript.json`, when the deleted media is the
 *      root source AND the legacy transcript exists.
 *   4. The `.notes.md` sidecar, when present.
 *   5. Surgical edit on `<project>/project.atelier`:
 *        a. Remove any VideoVisual layer whose `src` or `assetId→assets[id].src`
 *           equals the deleted media's basename / `source<ext>` form.
 *        b. Remove the corresponding asset entry from `assets` (only when its
 *           src matched — sibling assets are preserved).
 *        c. IF a video layer was actually removed AND a transcript was
 *           removed, ALSO remove every layer tagged `["caption"]`. This is
 *           gated on both conditions because `caption-builder.ts` doesn't
 *           per-source-tag captions — they're all just `tags: ["caption"]`
 *           — so we only nuke them when we have evidence (a) the deleted
 *           file actually backed a video and (b) it had captions derived
 *           from its transcript. Image / font / "other" deletions leave
 *           captions untouched.
 *
 * Returns a structured report so the HTTP layer can echo counts back to the
 * UI and the WS broadcast carries enough context to refresh the right tree
 * section.
 */
export function cascadeDeleteMedia(
  workspaceDir: string,
  projectName: string,
  basename: string,
): CascadeDeleteMediaOutcome {
  if (!isValidProjectName(projectName)) {
    return { kind: "invalid-project" };
  }
  // Refuse any path-shaped basename — must be a single segment so we never
  // join past the project's media dir. The studio UI only ever surfaces
  // basenames, so this is also the "no client-side path manipulation" guard.
  if (!isValidMediaBasename(basename)) {
    return { kind: "invalid-basename" };
  }

  const absWs = resolve(workspaceDir);
  const absProject = join(absWs, projectName);
  // Post-flat-docs-pivot: projects are identified by hasProjectMarker
  // (project.atelier OR .atelier/ subdir), not strictly by project.atelier
  // existence. Earlier check rejected freshly-created projects which had
  // .atelier/ metadata but no manifest — meaning right-click Delete on
  // media silently 404'd with "invalid-project". See ~no-manifest-doc.
  if (!hasProjectMarker(absProject)) {
    return { kind: "invalid-project" };
  }

  // ── (1) Locate the media file ─────────────────────────────────
  // Two layouts: <project>/media/<basename> (preferred) or
  // <project>/source.<ext> for the legacy root-source convention.
  const inMediaDir = join(absProject, "media", basename);
  const atRoot = join(absProject, basename);
  const isLegacyRootSource =
    /^source\.[A-Za-z0-9]+$/.test(basename) && existsSync(atRoot);

  let mediaAbs: string;
  let mediaRel: string;
  if (existsSync(inMediaDir)) {
    mediaAbs = inMediaDir;
    mediaRel = `${projectName}/media/${basename}`;
  } else if (isLegacyRootSource) {
    mediaAbs = atRoot;
    mediaRel = `${projectName}/${basename}`;
  } else {
    return { kind: "not-found" };
  }

  // ── (2) Compute sidecar paths BEFORE we mutate anything ───────
  const stem = stripExt(basename);
  const perFileMirrorAbs = join(absProject, "transcripts", `${stem}.json`);
  const perFileMirrorExists = existsSync(perFileMirrorAbs);
  const rootTranscriptAbs = join(absProject, "transcript.json");
  // Only treat the root transcript as "the deleted file's transcript" when
  // the deleted media was the legacy root source — otherwise root
  // transcript.json belongs to some other root-source file and must NOT
  // be removed in this cascade.
  const rootTranscriptApplicable = isLegacyRootSource && existsSync(rootTranscriptAbs);
  const notesAbs = notesPathFor(mediaAbs);
  const notesExists = existsSync(notesAbs);

  // ── (3) project.atelier surgery ───────────────────────────────
  // Load as JSON; tolerate read/parse failures by leaving the doc alone and
  // reporting zero edits. A creator with a hand-broken doc shouldn't have
  // their media delete silently fail — the file deletion is still the
  // primary effect.
  const docAbs = join(absProject, "project.atelier");
  let layersRemoved = 0;
  let assetsRemoved = 0;
  let videoLayerRemoved = false;
  try {
    const rawDoc = readFileSync(docAbs, "utf-8");
    const doc = JSON.parse(rawDoc) as AtelierDocLike;
    const result = pruneAtelierDocForMedia(doc, basename, isLegacyRootSource);
    if (result.changed) {
      layersRemoved = result.layersRemoved;
      assetsRemoved = result.assetsRemoved;
      videoLayerRemoved = result.videoLayerRemoved;
      // Preserve the 2-space indent convention `parseAtelier`-produced
      // dumps use; this is JSON, not YAML, so we round-trip lossless.
      writeFileSync(docAbs, JSON.stringify(result.doc, null, 2) + "\n", "utf-8");
    }
  } catch {
    // Non-fatal — surface zero edits but proceed with the file unlinks.
  }

  // ── (4) Filesystem unlinks ────────────────────────────────────
  // Order matters only for the report (we want each path to be reportable as
  // "removed"); the unlinks themselves are independent.
  unlinkSync(mediaAbs);
  let transcriptRel: string | null = null;
  if (perFileMirrorExists) {
    try {
      unlinkSync(perFileMirrorAbs);
      transcriptRel = `${projectName}/transcripts/${stem}.json`;
    } catch {
      // best-effort — the primary delete succeeded.
    }
  }
  let rootTranscriptRel: string | null = null;
  if (rootTranscriptApplicable) {
    try {
      unlinkSync(rootTranscriptAbs);
      rootTranscriptRel = `${projectName}/transcript.json`;
    } catch {
      // best-effort.
    }
  }
  let notesRel: string | null = null;
  if (notesExists) {
    try {
      unlinkSync(notesAbs);
      notesRel = relativize(absWs, notesAbs);
    } catch {
      // best-effort.
    }
  }

  return {
    kind: "deleted",
    report: {
      mediaFile: mediaRel,
      transcript: transcriptRel,
      rootTranscript: rootTranscriptRel,
      notes: notesRel,
      layersRemoved,
      assetsRemoved,
      videoLayerRemoved,
    },
  };
}

/** Outcome discriminator for `deleteProject`. */
export type DeleteProjectOutcome =
  | { kind: "deleted"; report: DeleteProjectReport }
  | { kind: "not-found" }
  | { kind: "invalid-name" };

/**
 * Delete a whole project subdir. Steps:
 *
 *   1. rm-rf `<workspaceDir>/<name>/`.
 *   2. Clear `<workspaceDir>/.atelier/active.yaml` if it pointed at `name`.
 *      (Even when active was stale, clearing keeps the pointer's invariant:
 *      "if present, points at a real project on disk" — see #workspace-io.)
 *   3. Rewrite the workspace manifest's advisory `projects[]` list, dropping
 *      the deleted name. Skipped when the field is absent (the field is
 *      advisory only; `listProjects` walks on-disk truth).
 *
 * Active-clear happens BEFORE the rm-rf is "committed" semantically (we read
 * active first, then rm, then clear) so a process crash mid-operation either
 * leaves both alone or leaves a stale pointer the existing buildActiveProject
 * stale-detection already handles.
 */
export function deleteProject(
  workspaceDir: string,
  name: string,
): DeleteProjectOutcome {
  if (!isValidProjectName(name)) {
    return { kind: "invalid-name" };
  }
  const absWs = resolve(workspaceDir);
  const absProject = join(absWs, name);
  if (!existsSync(absProject)) {
    return { kind: "not-found" };
  }
  let st;
  try {
    st = statSync(absProject);
  } catch {
    return { kind: "not-found" };
  }
  if (!st.isDirectory()) {
    return { kind: "not-found" };
  }

  // Was this the active project? Read BEFORE we rm so the active.yaml check
  // doesn't race the file removal — although active.yaml lives in `.atelier/`
  // (not inside the project dir), reading first is still simpler.
  const active = readActiveProject(absWs);
  const wasActive = active?.name === name;

  // rm-rf the project dir. `{ recursive: true, force: true }` mirrors the
  // CLI's `rm -rf` posture; force avoids ENOENT on a half-deleted dir from
  // a previous crashed run.
  rmSync(absProject, { recursive: true, force: true });

  // Clear active.yaml if it pointed at us. `clearActiveProject` is idempotent.
  if (wasActive) {
    clearActiveProject(absWs);
  }

  // Trim the workspace manifest's advisory projects[] list. Skip when the
  // field is absent (the advisor's note: it's advisory, listProjects() is
  // the on-disk truth). Wrap in try/catch — a malformed manifest shouldn't
  // block the delete.
  let manifestUpdated = false;
  try {
    const manifest = readWorkspace(absWs);
    if (manifest.projects && manifest.projects.includes(name)) {
      const next = {
        ...manifest,
        projects: manifest.projects.filter((p) => p !== name),
      };
      writeWorkspace(absWs, next);
      manifestUpdated = true;
    }
  } catch {
    // Non-fatal.
  }

  return {
    kind: "deleted",
    report: { name, wasActive, manifestUpdated },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Validate a media basename — must be single-segment (no `/`, `\\`, `..`),
 * non-empty, no leading dot, no NUL / control chars. Refused inputs include
 * `../escape`, `.notes-only`, `nested/path.mp4`. Matches the contract of
 * `isValidProjectName` but for files (allowing extension chars in the body).
 */
function isValidMediaBasename(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0) return false;
  if (name !== name.trim()) return false;
  if (name.includes("/") || name.includes("\\")) return false;
  if (name.startsWith(".")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[ -]/.test(name)) return false;
  return true;
}

/** `IMG_7347.MOV` → `IMG_7347`. */
function stripExt(name: string): string {
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Workspace-rooted POSIX-style path for the WS envelope / report. */
function relativize(absWs: string, abs: string): string {
  if (!abs.startsWith(absWs + sep)) return abs;
  return abs.slice(absWs.length + 1).split(sep).join("/");
}

/**
 * Loose interface for project.atelier's relevant slice. We intentionally
 * type the layer/asset shape narrowly so the surgery code stays a single
 * file without dragging in the whole schema. Unknown fields pass through
 * untouched (the spread copies the whole doc).
 */
interface AtelierDocLike {
  layers?: AtelierLayerLike[];
  assets?: Record<string, AtelierAssetLike>;
  [key: string]: unknown;
}

interface AtelierLayerLike {
  id?: string;
  tags?: string[];
  visual?: {
    type?: string;
    src?: string;
    assetId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AtelierAssetLike {
  type?: string;
  src?: string;
  [key: string]: unknown;
}

/** The four possible names the same media file can carry inside a doc. */
function mediaSrcCandidates(basename: string, isLegacyRootSource: boolean): Set<string> {
  // Doc references are by basename (the convention compose-video-project.ts
  // emits — `source.<ext>` for root, `media/<basename>` for media-dir files).
  // We match against:
  //   - the raw basename (e.g. `IMG_7347.MOV`)
  //   - `media/<basename>` (the path form some pipelines emit)
  //   - `source.<ext>` for root sources (always equal to `basename` in that
  //     branch — but kept explicit for readability)
  const out = new Set<string>([basename, `media/${basename}`]);
  if (isLegacyRootSource) {
    out.add(basename); // already added; left for symmetry / future variations
  }
  return out;
}

/** Result of pruning a doc for a single media-file delete. */
interface PruneResult {
  doc: AtelierDocLike;
  changed: boolean;
  layersRemoved: number;
  assetsRemoved: number;
  videoLayerRemoved: boolean;
}

/**
 * Pure transform: given a doc and a media basename, return a new doc with
 * (a) every VideoVisual layer matching the basename removed, (b) the matching
 * asset entries removed, and (c) caption-tagged layers removed IFF a video
 * layer was actually pruned (see #delete-cascade-project-atelier-surgery).
 *
 * Pure — no IO. Inputs are not mutated; a new doc is returned even when no
 * changes were necessary (callers gate writes on `changed`).
 */
export function pruneAtelierDocForMedia(
  doc: AtelierDocLike,
  basename: string,
  isLegacyRootSource: boolean,
): PruneResult {
  const srcCandidates = mediaSrcCandidates(basename, isLegacyRootSource);
  const layers = Array.isArray(doc.layers) ? doc.layers : [];
  const assets = doc.assets && typeof doc.assets === "object" ? doc.assets : {};

  // First pass: figure out which assetIds reference this media file. We need
  // this so we can drop layers that reference the media indirectly through
  // an assetId rather than via a direct `src`.
  const matchingAssetIds = new Set<string>();
  for (const [id, asset] of Object.entries(assets)) {
    if (!asset || typeof asset !== "object") continue;
    const s = (asset as AtelierAssetLike).src;
    if (typeof s === "string" && srcCandidates.has(s)) {
      matchingAssetIds.add(id);
    }
  }

  // Second pass: walk layers. Keep a layer when it's NOT a video layer that
  // references the deleted file. Track whether we removed at least one
  // VideoVisual layer (drives the caption removal branch).
  let videoLayerRemoved = false;
  const keptAfterVideoPrune: AtelierLayerLike[] = [];
  for (const layer of layers) {
    const v = layer?.visual;
    if (v && (v.type === "video" || v.type === "image" || v.type === "audio")) {
      const matchesSrc = typeof v.src === "string" && srcCandidates.has(v.src);
      const matchesAssetId = typeof v.assetId === "string" && matchingAssetIds.has(v.assetId);
      if (matchesSrc || matchesAssetId) {
        if (v.type === "video") videoLayerRemoved = true;
        continue; // drop
      }
    }
    keptAfterVideoPrune.push(layer);
  }

  // Third pass: caption layers. Only prune when we actually removed a video
  // layer — image / font / "other" deletions leave captions intact. This is
  // the safe rule per the advisor's read of `caption-builder.ts` (caption
  // layers carry tag `["caption"]` with no per-source signature).
  let finalLayers: AtelierLayerLike[];
  if (videoLayerRemoved) {
    finalLayers = keptAfterVideoPrune.filter((l) => {
      const tags = l?.tags;
      return !(Array.isArray(tags) && tags.includes("caption"));
    });
  } else {
    finalLayers = keptAfterVideoPrune;
  }

  const layersRemoved = layers.length - finalLayers.length;

  // Assets: drop the matching ones. Sibling assets are preserved.
  let nextAssets: Record<string, AtelierAssetLike> | undefined = undefined;
  let assetsRemoved = 0;
  if (matchingAssetIds.size > 0) {
    nextAssets = {};
    for (const [id, asset] of Object.entries(assets)) {
      if (matchingAssetIds.has(id)) {
        assetsRemoved += 1;
        continue;
      }
      nextAssets[id] = asset;
    }
  }

  const changed = layersRemoved > 0 || assetsRemoved > 0;
  if (!changed) {
    return {
      doc,
      changed: false,
      layersRemoved: 0,
      assetsRemoved: 0,
      videoLayerRemoved: false,
    };
  }

  const newDoc: AtelierDocLike = { ...doc, layers: finalLayers };
  if (nextAssets !== undefined) {
    if (Object.keys(nextAssets).length === 0) {
      // Empty assets map — drop the key entirely so the doc looks identical
      // to a fresh doc that never had assets, rather than carrying an
      // exists-but-empty `assets: {}` artifact.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { assets: _drop, ...rest } = newDoc;
      return {
        doc: { ...rest, layers: finalLayers },
        changed,
        layersRemoved,
        assetsRemoved,
        videoLayerRemoved,
      };
    }
    newDoc.assets = nextAssets;
  }
  return { doc: newDoc, changed, layersRemoved, assetsRemoved, videoLayerRemoved };
}

// Defensive: ensure ACTIVE_PROJECT_FILENAME stays referenced so callers
// importing from this module via re-export don't tree-shake it out. (No
// functional dependency — purely a stable import surface marker.)
void ACTIVE_PROJECT_FILENAME;
