// #doc-management — create / duplicate / delete .atelier docs inside a
// project, with workspace-wide cascade handling.
//
// Three public verbs that the studio's right-click menus + the MCP doc tools
// share so the on-disk effect is identical regardless of entry point:
//
//   - `createDoc` — scaffold a fresh kind:"video" / "image" / "carousel" doc
//     at the project root, OR a slide under `slides/` that also gets a
//     SlideRef appended to the carousel's host doc (cycle-safe via
//     `composeCarouselProject`).
//
//   - `duplicateDoc` — copy an existing doc next to itself with a `-copy`
//     suffix (and `-copy-2`, `-copy-3`, ... on collisions). When the source
//     is a slide and `appendSlideRef: true` is passed, the new doc is also
//     appended into the carousel right after the source's slot.
//
//   - `deleteDoc` — remove a doc file AND scrub any SlideRef across the
//     workspace that pointed at it. RefVisual layers pointing at the deleted
//     doc are NOT removed (the renderer tolerates missing refs) but are
//     reported as dangling so the UI can surface them.
//
// Post-pivot (Wave 1): every .atelier doc is equal. There is no privileged
// "project manifest"; project.atelier is just a doc that happens to share its
// dir's basename. Cascade walks therefore inspect EVERY .atelier under each
// project subdir (root + slides/), not just the historical project.atelier.
//
// Cascade resolution mirrors `#ref-cycle`'s dual-base pattern: slide srcs
// may be either project-relative ("slides/foo.atelier") or workspace-relative
// ("my-carousel/slides/foo.atelier"). We try the owning project dir first,
// fall back to workspaceRoot — and only when one of those resolves to the
// absolute path of the doc under operation do we count it as a match.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  AtelierDocument,
  Layer,
  RefVisual,
  SlideRef,
} from "@a-company/atelier-types";

import {
  type CreateDocOptions,
  type DeleteDocOptions,
  type DocDeleteCascadeReport,
  type DocDuplicateReport,
  type DocKind,
  type DocListEntry,
  type DuplicateDocOptions,
  isValidDocName,
} from "./doc-management-types.js";
import {
  readAtelierDoc,
  slugifyBasename,
} from "./compose-video-project.js";
import { composeCarouselProject } from "./compose-carousel-project.js";

/** Max collision-suffix attempts before we give up. */
const MAX_COLLISION_ATTEMPTS = 999;

// ─── createDoc ──────────────────────────────────────────────────────

export interface CreateDocResult {
  doc: AtelierDocument;
  /** Project-relative. */
  docPath: string;
  /** Present when the new doc was appended as a SlideRef into a carousel. */
  appendedSlideIndex?: number;
}

/**
 * Scaffold a new .atelier doc inside a project.
 *
 * - Validates `opts.name` via `isValidDocName` (rejects path separators,
 *   `..`, control bytes, etc.).
 * - Slugs the name via `slugifyBasename` for the filesystem path.
 * - Collision-suffixes with `-1`, `-2`, ... up to 999.
 * - For `asCarouselSlide: true`, writes under `slides/<slug>.atelier` AND
 *   calls `composeCarouselProject` so the cycle check + SlideRef append
 *   run as one indivisible step.
 */
export async function createDoc(opts: CreateDocOptions): Promise<CreateDocResult> {
  if (!isValidDocName(opts.name)) {
    throw new Error("invalid doc name");
  }
  const slug = slugifyBasename(opts.name);
  if (!slug) {
    throw new Error("invalid doc name");
  }

  const projectDir = resolve(opts.projectDir);
  const subdir = opts.asCarouselSlide ? "slides" : "";
  const subdirAbs = subdir ? join(projectDir, subdir) : projectDir;

  // Collision-suffix loop.
  let chosenName: string | undefined;
  let chosenAbs: string | undefined;
  for (let attempt = 0; attempt <= MAX_COLLISION_ATTEMPTS; attempt++) {
    const candidateStem = attempt === 0 ? slug : `${slug}-${attempt}`;
    const candidateName = `${candidateStem}.atelier`;
    const candidateAbs = join(subdirAbs, candidateName);
    if (!existsSync(candidateAbs)) {
      chosenName = candidateName;
      chosenAbs = candidateAbs;
      break;
    }
  }
  if (!chosenName || !chosenAbs) {
    throw new Error("collision suffix exhausted (999 attempts)");
  }

  const docPath = subdir ? `${subdir}/${chosenName}` : chosenName;
  const docName = chosenName.slice(0, -".atelier".length);
  const doc = scaffoldDoc(docName, opts.kind);

  // mkdir parent if needed (slides/ for slide docs).
  if (subdir) {
    mkdirSync(subdirAbs, { recursive: true });
  }
  writeFileSync(chosenAbs, JSON.stringify(doc, null, 2), "utf-8");

  let appendedSlideIndex: number | undefined;
  if (opts.asCarouselSlide && opts.carouselDocPath) {
    // The carouselDocPath we accept is project-relative or absolute; we
    // derive both the host carousel's projectDir AND its in-project docPath
    // (post-pivot the host doc need not be project.atelier).
    const carouselAbs = isAbsolute(opts.carouselDocPath)
      ? opts.carouselDocPath
      : join(projectDir, opts.carouselDocPath);
    const carouselProjectDir = dirname(carouselAbs);
    const carouselDocRel = relative(carouselProjectDir, carouselAbs);
    try {
      const composeOpts: Parameters<typeof composeCarouselProject>[0] = {
        projectDir: carouselProjectDir,
        docPath: carouselDocRel,
        slidePath: chosenAbs,
      };
      if (opts.insertAt !== undefined) composeOpts.insertAt = opts.insertAt;
      const composeResult = await composeCarouselProject(composeOpts);
      appendedSlideIndex = composeResult.slideIndex;
    } catch (err) {
      // Cycle (or any compose failure) — roll back the new file so the
      // creator doesn't end up with an orphan slide doc on disk.
      try {
        unlinkSync(chosenAbs);
      } catch {
        // best-effort
      }
      throw err;
    }
  }

  return {
    doc,
    docPath,
    ...(appendedSlideIndex !== undefined ? { appendedSlideIndex } : {}),
  };
}

/** Build a fresh AtelierDocument of the given kind with sensible defaults. */
function scaffoldDoc(name: string, kind: DocKind): AtelierDocument {
  const base: AtelierDocument = {
    version: "1.0",
    name,
    kind,
    canvas: { width: 1080, height: 1920, fps: 30 },
    layers: [],
    states: { default: { duration: 1, deltas: [] } },
  };
  if (kind === "carousel") {
    base.slides = [];
  }
  return base;
}

// ─── duplicateDoc ───────────────────────────────────────────────────

/**
 * Duplicate an existing doc next to itself with a `-copy` (then `-copy-2`,
 * `-copy-3`, ...) suffix. Layer ids are preserved verbatim (they're
 * doc-local — no cross-doc id collision concern).
 *
 * `appendSlideRef: true` requires the source to live under `slides/`; we
 * also call `composeCarouselProject` for the append so the cycle detector
 * runs defensively even though duplicating a clean slide can't introduce a
 * new cycle.
 */
export async function duplicateDoc(opts: DuplicateDocOptions): Promise<DocDuplicateReport> {
  const projectDir = resolve(opts.projectDir);
  const sourceAbs = join(projectDir, opts.sourceDocPath);

  if (!existsSync(sourceAbs)) {
    throw new Error("source doc not found");
  }

  const doc = readAtelierDoc(sourceAbs);

  // Compute new path at the SAME depth.
  const sourceDir = dirname(sourceAbs);
  const sourceBase = basename(sourceAbs);
  const sourceExt = extname(sourceBase); // ".atelier"
  const sourceStem = sourceExt ? sourceBase.slice(0, -sourceExt.length) : sourceBase;

  let chosenAbs: string | undefined;
  let chosenStem: string | undefined;
  for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS; attempt++) {
    const candidateStem = attempt === 1 ? `${sourceStem}-copy` : `${sourceStem}-copy-${attempt}`;
    const candidateAbs = join(sourceDir, `${candidateStem}${sourceExt}`);
    if (!existsSync(candidateAbs)) {
      chosenAbs = candidateAbs;
      chosenStem = candidateStem;
      break;
    }
  }
  if (!chosenAbs || !chosenStem) {
    throw new Error("collision suffix exhausted (999 attempts)");
  }

  // Compute project-relative newDocPath. Project root → just basename; under
  // slides/ → slides/<basename>; preserve directory depth verbatim.
  const newDocPath = sourceRelDir(opts.sourceDocPath)
    ? `${sourceRelDir(opts.sourceDocPath)}/${chosenStem}${sourceExt}`
    : `${chosenStem}${sourceExt}`;

  // Write the duplicate. Keep doc.name as-is for the duplicate; nothing in
  // the spec says we should rename it and the studio sidebar uses the
  // filename as the display label anyway.
  writeFileSync(chosenAbs, JSON.stringify(doc, null, 2), "utf-8");

  let appendedSlideIndex: number | undefined;
  if (opts.appendSlideRef) {
    const sourceDirRel = sourceRelDir(opts.sourceDocPath);
    if (sourceDirRel !== "slides") {
      // Roll back to avoid leaving an orphan.
      try {
        unlinkSync(chosenAbs);
      } catch {
        // best-effort
      }
      throw new Error("appendSlideRef requires a slide source");
    }

    // Find the source's index in the carousel host doc (project.atelier in
    // the duplicateDoc path — pre-pivot behavior preserved here; non-manifest
    // hosts are out of scope for Unit B's duplicateDoc).
    const manifestPath = join(projectDir, "project.atelier");
    let sourceIndex = -1;
    if (existsSync(manifestPath)) {
      try {
        const manifest = readAtelierDoc(manifestPath);
        if (manifest.kind === "carousel" && Array.isArray(manifest.slides)) {
          const workspaceRoot = dirname(projectDir);
          for (let i = 0; i < manifest.slides.length; i++) {
            const ref = manifest.slides[i]!;
            const resolved = resolveSlideRef(ref.src, projectDir, workspaceRoot);
            if (resolved === sourceAbs) {
              sourceIndex = i;
              break;
            }
          }
        }
      } catch {
        // ignore — sourceIndex stays -1 and we'll append at end
      }
    }

    try {
      const composeOpts: Parameters<typeof composeCarouselProject>[0] = {
        projectDir,
        docPath: "project.atelier",
        slidePath: chosenAbs,
      };
      if (sourceIndex >= 0) composeOpts.insertAt = sourceIndex + 1;
      const composeResult = await composeCarouselProject(composeOpts);
      appendedSlideIndex = composeResult.slideIndex;
    } catch (err) {
      try {
        unlinkSync(chosenAbs);
      } catch {
        // best-effort
      }
      throw err;
    }
  }

  return {
    sourceDocPath: opts.sourceDocPath,
    newDocPath,
    ...(appendedSlideIndex !== undefined ? { appendedSlideIndex } : {}),
  };
}

/** Return the directory portion of a project-relative path, or "". */
function sourceRelDir(relPath: string): string {
  const dir = dirname(relPath);
  return dir === "." ? "" : dir;
}

// ─── deleteDoc ──────────────────────────────────────────────────────

/**
 * Delete a doc inside a project AND scrub any workspace-wide references:
 *
 *   1. Walk every project subdir of the workspace. For each project, walk
 *      its root + `slides/` for *.atelier files (mirroring listDocs' scope).
 *   2. For each `.atelier` doc found: scan `slides[]` (if kind:carousel) for
 *      refs that resolve to the absolute path of the doc being deleted;
 *      splice those refs out, persist the updated doc.
 *   3. Same walk, but scan `layers[]` for RefVisual layers (`visual.type ==
 *      "ref"`) whose `src` resolves to the same absolute path. Collect
 *      these as `refLayersDangling` — do NOT remove them; the renderer
 *      tolerates missing refs and we want the studio to surface dangling
 *      refs as warnings rather than silently nuke them.
 *   4. Unlink the doc.
 *
 * Every .atelier is equal — there is no "project manifest" carve-out.
 */
export function deleteDoc(opts: DeleteDocOptions): DocDeleteCascadeReport {
  const workspaceAbs = resolve(opts.workspaceDir);
  const projectDir = join(workspaceAbs, opts.projectName);
  const docAbs = join(projectDir, opts.docPath);

  if (!existsSync(docAbs)) {
    throw new Error("doc not found");
  }

  const slideRefsRemoved: Array<{ project: string; slideIndex: number }> = [];
  const refLayersDangling: Array<{ project: string; docPath: string; layerId: string }> = [];

  // Walk workspace subdirs for sibling projects (and the owning project too —
  // self-refs are valid cascade targets).
  let entries: string[];
  try {
    entries = readdirSync(workspaceAbs);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const otherProjectDir = join(workspaceAbs, entry);
    let st;
    try {
      st = statSync(otherProjectDir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    // Enumerate all .atelier docs in this project (root + slides/).
    const projectDocs = enumerateProjectAtelierDocs(otherProjectDir);

    for (const { absPath, relPath } of projectDocs) {
      // Skip the doc being deleted — we'll unlink it at the end.
      if (absPath === docAbs) continue;

      let otherDoc: AtelierDocument;
      try {
        otherDoc = readAtelierDoc(absPath);
      } catch {
        continue;
      }

      // ── SlideRef scrub ─────────────────────────────────────────
      let docMutated = false;
      if (otherDoc.kind === "carousel" && Array.isArray(otherDoc.slides)) {
        const slides = otherDoc.slides;
        // First pass — collect PRE-removal indices of refs that match.
        const matchIndices: number[] = [];
        for (let i = 0; i < slides.length; i++) {
          const ref = slides[i]!;
          const resolved = resolveSlideRef(ref.src, otherProjectDir, workspaceAbs);
          if (resolved === docAbs) {
            matchIndices.push(i);
            slideRefsRemoved.push({ project: entry, slideIndex: i });
          }
        }
        if (matchIndices.length > 0) {
          const matchSet = new Set(matchIndices);
          const kept: SlideRef[] = slides.filter((_, i) => !matchSet.has(i));
          otherDoc = { ...otherDoc, slides: kept };
          docMutated = true;
        }
      }

      // ── RefVisual dangling scan (read-only) ────────────────────
      if (Array.isArray(otherDoc.layers)) {
        for (const layer of otherDoc.layers as Layer[]) {
          const v = layer.visual as Layer["visual"];
          if (v && (v as { type?: string }).type === "ref") {
            const refVisual = v as RefVisual;
            if (typeof refVisual.src === "string" && refVisual.src.length > 0) {
              const resolved = resolveSlideRef(refVisual.src, otherProjectDir, workspaceAbs);
              if (resolved === docAbs) {
                refLayersDangling.push({
                  project: entry,
                  docPath: relPath,
                  layerId: layer.id,
                });
              }
            }
          }
        }
      }

      if (docMutated) {
        writeFileSync(absPath, JSON.stringify(otherDoc, null, 2), "utf-8");
      }
    }
  }

  // Unlink the doc itself.
  unlinkSync(docAbs);

  return {
    docPath: opts.docPath,
    slideRefsRemoved,
    refLayersDangling,
  };
}

/**
 * Resolve a slide / ref src using the dual-base pattern from `#ref-cycle`:
 * try the doc's owning project dir first (project-relative srcs), then fall
 * back to the workspace root (workspace-relative srcs). Absolute refs are
 * short-circuited via `existsSync`. Returns the absolute resolved path or
 * undefined when neither candidate exists on disk.
 */
function resolveSlideRef(
  src: string,
  ownerProjectDir: string,
  workspaceRoot: string,
): string | undefined {
  if (isAbsolute(src)) {
    return existsSync(src) ? resolve(src) : undefined;
  }
  const projectRelative = resolve(ownerProjectDir, src);
  if (existsSync(projectRelative)) return projectRelative;
  const workspaceRelative = resolve(workspaceRoot, src);
  if (existsSync(workspaceRelative)) return workspaceRelative;
  return undefined;
}

// ─── listDocs ───────────────────────────────────────────────────────

/**
 * Enumerate the .atelier docs belonging to a project for the studio sidebar.
 *
 * Post-pivot: every .atelier is equal. Returns a flat alphabetical list of
 * docs in the project's root + `slides/` subdir. The optional `kind` field
 * is filled in when the doc parses and has a top-level `kind`; otherwise
 * omitted.
 *
 * Scope is intentionally non-recursive (root + slides/ only) — per Arky's
 * v1 plan, deeper trees are out of scope for the sidebar.
 *
 * Hardening: the `.atelier/` directory at project root (paradigm artifact
 * sibling) matches `*.atelier` by name but is NOT a doc. We filter by
 * `statSync().isFile()` AND skip basename `.atelier` defensively.
 */
export function listDocs(projectDir: string): DocListEntry[] {
  const projectAbs = resolve(projectDir);
  const found = enumerateProjectAtelierDocs(projectAbs);

  const out: DocListEntry[] = found
    .map(({ absPath, relPath }) => {
      let kind: "video" | "image" | "carousel" | undefined;
      try {
        const doc = readAtelierDoc(absPath);
        kind = doc.kind;
      } catch {
        kind = undefined;
      }
      const entry: DocListEntry = { path: relPath };
      if (kind !== undefined) entry.kind = kind;
      return entry;
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return out;
}

// ─── shared walk ────────────────────────────────────────────────────

interface FoundDoc {
  absPath: string;
  /** Project-relative, using forward slashes ("slides/foo.atelier"). */
  relPath: string;
}

/**
 * Enumerate every .atelier doc in a project's root + `slides/` subdir.
 *
 * Filters:
 * - must end with `.atelier`
 * - must NOT have basename exactly `.atelier` (defensive — paradigm dir)
 * - must be a regular file (statSync().isFile()) — the `.atelier/` directory
 *   at project root would otherwise match the suffix
 *
 * Used by both `listDocs` (sidebar) and `deleteDoc` (cascade scrub) so the
 * two surfaces see the same set of docs.
 */
function enumerateProjectAtelierDocs(projectAbs: string): FoundDoc[] {
  const out: FoundDoc[] = [];

  for (const sub of ["", "slides"]) {
    const dirAbs = sub ? join(projectAbs, sub) : projectAbs;
    let entries: string[];
    try {
      entries = readdirSync(dirAbs);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".atelier")) continue;
      if (name === ".atelier") continue; // defense: paradigm dir basename
      const abs = join(dirAbs, name);
      try {
        const st = statSync(abs);
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      const relPath = sub ? `${sub}/${name}` : name;
      out.push({ absPath: abs, relPath });
    }
  }

  return out;
}
