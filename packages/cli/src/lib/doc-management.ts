// #doc-management — create / duplicate / delete .atelier docs inside a
// project, with workspace-wide cascade handling.
//
// Three public verbs that the studio's right-click menus + the MCP doc tools
// share so the on-disk effect is identical regardless of entry point:
//
//   - `createDoc` — scaffold a fresh kind:"video" / "image" / "carousel" doc
//     at the project root, OR a slide under `slides/` that also gets a
//     SlideRef appended to the carousel's `project.atelier` (cycle-safe via
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
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
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
  isManifestDoc,
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
    // The carouselDocPath we accept is project-relative or absolute; we only
    // use it to derive the host carousel's projectDir. composeCarouselProject
    // operates on projectDir + slidePath directly.
    const carouselAbs = isAbsolute(opts.carouselDocPath)
      ? opts.carouselDocPath
      : join(projectDir, opts.carouselDocPath);
    const carouselProjectDir = dirname(carouselAbs);
    try {
      const composeOpts: Parameters<typeof composeCarouselProject>[0] = {
        projectDir: carouselProjectDir,
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
  if (isManifestDoc(opts.sourceDocPath)) {
    throw new Error("cannot duplicate the project manifest");
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

    // Find the source's index in the carousel manifest.
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
 *   1. Refuse the project manifest (use project-delete instead).
 *   2. Walk every sibling project subdir. For each carousel-kind project,
 *      scan `slides[]` for refs that resolve to the absolute path of the
 *      doc being deleted; splice those refs out, persist the updated
 *      manifest.
 *   3. Same walk, but scan `layers[]` for RefVisual layers (`visual.type ==
 *      "ref"`) whose `src` resolves to the same absolute path. Collect
 *      these as `refLayersDangling` — do NOT remove them; the renderer
 *      tolerates missing refs and we want the studio to surface dangling
 *      refs as warnings rather than silently nuke them.
 *   4. Unlink the doc.
 */
export function deleteDoc(opts: DeleteDocOptions): DocDeleteCascadeReport {
  if (isManifestDoc(opts.docPath)) {
    throw new Error("cannot delete the project manifest; use the project-delete flow instead");
  }

  const workspaceAbs = resolve(opts.workspaceDir);
  const projectDir = join(workspaceAbs, opts.projectName);
  const docAbs = join(projectDir, opts.docPath);

  if (!existsSync(docAbs)) {
    throw new Error("doc not found");
  }

  const slideRefsRemoved: Array<{ project: string; slideIndex: number }> = [];
  const refLayersDangling: Array<{ project: string; docPath: string; layerId: string }> = [];

  // Walk workspace subdirs for sibling projects with project.atelier.
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
    const otherManifest = join(otherProjectDir, "project.atelier");
    if (!existsSync(otherManifest)) continue;

    let otherDoc: AtelierDocument;
    try {
      otherDoc = readAtelierDoc(otherManifest);
    } catch {
      continue;
    }

    // ── SlideRef scrub ─────────────────────────────────────────
    let manifestMutated = false;
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
        // Build kept[] preserving order; PRE-removal indices already in
        // `slideRefsRemoved` so we just need the new array here.
        const matchSet = new Set(matchIndices);
        const kept: SlideRef[] = slides.filter((_, i) => !matchSet.has(i));
        otherDoc = { ...otherDoc, slides: kept };
        manifestMutated = true;
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
                docPath: "project.atelier",
                layerId: layer.id,
              });
            }
          }
        }
      }
    }

    if (manifestMutated) {
      writeFileSync(otherManifest, JSON.stringify(otherDoc, null, 2), "utf-8");
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
 * Order: manifest → slides (in carousel slides[] order) → other (alphabetical).
 *
 * Slides that resolve outside the project (carousels can reference any
 * .atelier in the workspace) are valid in the manifest but are NOT surfaced
 * as project docs — the sidebar shows only docs that live in this project's
 * subtree.
 */
export function listDocs(projectDir: string): DocListEntry[] {
  const projectAbs = resolve(projectDir);
  const manifestAbs = join(projectAbs, "project.atelier");
  const out: DocListEntry[] = [];

  let manifest: AtelierDocument | undefined;
  if (existsSync(manifestAbs)) {
    try {
      manifest = readAtelierDoc(manifestAbs);
    } catch {
      manifest = undefined;
    }
    const manifestEntry: DocListEntry = {
      path: "project.atelier",
      role: "manifest",
    };
    if (manifest?.kind !== undefined) {
      manifestEntry.kind = manifest.kind;
    }
    out.push(manifestEntry);
  }

  // Track slides we surfaced — used to filter the "other" pass below so a
  // doc that's both on disk AND referenced from slides[] surfaces once.
  const surfacedSlideAbs = new Set<string>();

  if (manifest?.kind === "carousel" && Array.isArray(manifest.slides)) {
    const workspaceRoot = dirname(projectAbs);
    for (let i = 0; i < manifest.slides.length; i++) {
      const ref = manifest.slides[i]!;
      const resolved = resolveSlideRef(ref.src, projectAbs, workspaceRoot);
      if (resolved === undefined) continue;
      // Containment check — only surface slides that live in THIS project.
      if (!resolved.startsWith(projectAbs + sep)) continue;
      // Compute project-relative path.
      const rel = resolved.slice(projectAbs.length + 1).split(sep).join("/");
      surfacedSlideAbs.add(resolved);

      let slideKind: "video" | "image" | "carousel" | undefined;
      try {
        const slideDoc = readAtelierDoc(resolved);
        slideKind = slideDoc.kind;
      } catch {
        slideKind = undefined;
      }
      const entry: DocListEntry = {
        path: rel,
        role: "slide",
        slideIndex: i,
      };
      if (slideKind !== undefined) entry.kind = slideKind;
      if (ref.label !== undefined) entry.slideLabel = ref.label;
      out.push(entry);
    }
  }

  // "Other" pass — *.atelier at project root other than project.atelier and
  // any docs we already surfaced as slides. Alphabetical.
  let rootEntries: string[];
  try {
    rootEntries = readdirSync(projectAbs);
  } catch {
    rootEntries = [];
  }
  const others = rootEntries
    .filter((e) => e.endsWith(".atelier") && e !== "project.atelier")
    .sort();
  for (const name of others) {
    const abs = join(projectAbs, name);
    if (surfacedSlideAbs.has(abs)) continue;
    let kind: "video" | "image" | "carousel" | undefined;
    try {
      const otherDoc = readAtelierDoc(abs);
      kind = otherDoc.kind;
    } catch {
      kind = undefined;
    }
    const entry: DocListEntry = {
      path: name,
      role: "other",
    };
    if (kind !== undefined) entry.kind = kind;
    out.push(entry);
  }

  return out;
}
