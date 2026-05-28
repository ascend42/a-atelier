// #mcp-lib-doc-management — doc-management helpers for the MCP doc tools.
//
// **Intentional duplication** of `packages/cli/src/lib/doc-management.ts`.
// MCP cannot import from `@a-company/atelier` (the CLI package) because
// `cli → mcp` already runs in the dep graph — re-importing back would close
// the cycle. The same duplication convention is used by clips.ts,
// rename-media.ts, and timeline-ops.ts (all carry this header).
//
// If the canonical helpers in cli/lib/doc-management.ts change semantics,
// this file MUST be kept in sync — there is no shared package between mcp
// and cli for these primitives in v1.0. Lifting to a shared package (e.g.
// `atelier-doc-management`) is tracked as a Unit-0.5 follow-up.
//
// Scope (v1.0, see doc-management-types.ts for the type contracts):
//   - createDoc:    scaffold a fresh .atelier; optionally append a SlideRef
//                   to a target carousel's slides[].
//   - duplicateDoc: copy a doc to "<stem>-copy.atelier"; optionally append
//                   a SlideRef.
//   - deleteDoc:    unlink a doc; scrub workspace-wide SlideRefs that
//                   pointed at it; report dangling RefVisual layers
//                   (not auto-removed).
//   - listDocs:     enumerate .atelier files in a project root + slides/.
//
// ~doc-cycle-v1-simple-check
// Cycle-check simplification (v1, deliberate divergence from the CLI):
//   The canonical CLI version delegates the carousel append to
//   `composeCarouselProject`, which runs the full transitive cycle walk via
//   `ref-cycle.ts`. The MCP duplicate has no compose-* helpers (the cycle
//   between mcp and cli prevents importing them), so we use a simple direct-
//   duplicate check before appending a SlideRef: refuse if the target src is
//   already in slides[]. This covers the common case; deeper transitive
//   cycles can still pass through. Lifting to a shared package would let us
//   call the canonical cycle walker — tracked as a Unit-0.5 follow-up.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import type { AtelierDocument, Layer, RefVisual, SlideRef } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

import {
  isValidDocName,
  type CreateDocOptions,
  type DeleteDocOptions,
  type DocDeleteCascadeReport,
  type DocDuplicateReport,
  type DocListEntry,
  type DuplicateDocOptions,
} from "./doc-management-types.js";

// ─── Slugifier (inline; do NOT import from cli/compose-video-project.ts) ───

/**
 * Slug an arbitrary doc display name into a filesystem-safe stem.
 * Mirror of cli/lib/doc-management.ts:slugifyBasename.
 *
 * Algorithm:
 *   1. Strip a trailing extension (single dot, last group of non-dot bytes).
 *   2. Lowercase.
 *   3. Replace runs of non-[a-z0-9] with `-`.
 *   4. Trim leading/trailing dashes.
 *
 * e.g. `Hello World.atelier` → `hello-world`.
 */
function slugifyBasename(name: string): string {
  const noExt = name.replace(/\.[^.]+$/, "");
  const slugged = noExt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slugged;
}

// ─── readAtelierDoc — mirror of the rename-media.ts local helper ─────

function readAtelierDoc(absPath: string): AtelierDocument {
  const raw = readFileSync(absPath, "utf-8");
  const parsed = parseAtelier(raw);
  if (parsed.success) return parsed.data as AtelierDocument;
  return JSON.parse(raw) as AtelierDocument;
}

// ─── Scaffolder ─────────────────────────────────────────────────────

function scaffoldDoc(slug: string, kind: "video" | "image" | "carousel"): AtelierDocument {
  const base: AtelierDocument = {
    version: "1.0",
    name: slug,
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

// ─── createDoc ───────────────────────────────────────────────────────

/**
 * Result of `createDoc` — keeps the MCP-specific shape (`newDocPath` +
 * `newDocAbsPath`) deliberately diverging from the CLI's `{ doc, docPath }`.
 * The MCP tool wrapper consumes `newDocAbsPath` to reload the right doc into
 * the per-session store after writing.
 */
export interface CreateDocResult {
  /** Project-relative path of the new doc. */
  newDocPath: string;
  /** Absolute path of the new doc. */
  newDocAbsPath: string;
  /** When the new doc was appended as a SlideRef: its index in slides[]. */
  appendedSlideIndex?: number;
}

/**
 * Create a new `.atelier` doc inside a project.
 *
 * - Validates name via `isValidDocName`.
 * - Slugs to a filesystem-safe stem; collision-suffixes -1, -2, ... up to 999.
 * - For `asCarouselSlide:true`, writes under `slides/<slug>.atelier` AND
 *   appends a SlideRef to `opts.carouselDocPath`'s slides[]. The SlideRef src
 *   is relative to `projectDir` (the dual-base resolver tries projectDir
 *   first, so writing srcs project-relative makes them stable when the
 *   carousel doc moves around within the project subtree).
 * - Cycle check (v1, see ~doc-cycle-v1-simple-check at top of file): refuses
 *   if the new src already exists in slides[].
 */
export function createDoc(opts: CreateDocOptions): CreateDocResult {
  if (!isValidDocName(opts.name)) {
    throw new Error("invalid doc name");
  }

  const projectDir = resolve(opts.projectDir);
  const slug = slugifyBasename(opts.name);
  if (slug.length === 0) {
    throw new Error("invalid doc name");
  }

  // ── Compute target path with collision suffix ─────────────────
  const subdir = opts.asCarouselSlide ? "slides" : "";
  const baseDir = subdir ? join(projectDir, subdir) : projectDir;

  let finalStem = slug;
  let attempt = 0;
  while (existsSync(join(baseDir, `${finalStem}.atelier`))) {
    attempt += 1;
    if (attempt > 999) {
      throw new Error(`createDoc: could not find a non-colliding stem for "${slug}"`);
    }
    finalStem = `${slug}-${attempt}`;
  }

  const newDocAbsPath = join(baseDir, `${finalStem}.atelier`);
  const newDocPath = subdir ? `${subdir}/${finalStem}.atelier` : `${finalStem}.atelier`;

  // ── Scaffold + write ──────────────────────────────────────────
  const newDoc = scaffoldDoc(finalStem, opts.kind);
  mkdirSync(dirname(newDocAbsPath), { recursive: true });
  writeFileSync(newDocAbsPath, JSON.stringify(newDoc, null, 2), "utf-8");

  // ── Carousel-slide append (optional) ──────────────────────────
  if (opts.asCarouselSlide) {
    if (!opts.carouselDocPath) {
      throw new Error("createDoc: asCarouselSlide requires carouselDocPath");
    }
    const carouselAbs = resolve(opts.carouselDocPath);
    if (!existsSync(carouselAbs)) {
      throw new Error(`createDoc: carouselDocPath does not exist: ${carouselAbs}`);
    }
    const carouselDoc = readAtelierDoc(carouselAbs);
    if (carouselDoc.kind !== "carousel") {
      throw new Error(`createDoc: carouselDocPath is not a carousel doc (kind=${carouselDoc.kind ?? "video"})`);
    }

    // SlideRef.src is computed relative to projectDir (NOT to the carousel
    // doc's directory). Matches the dual-base resolver's preferred basis and
    // stays stable when carousel docs live at non-root paths. When the
    // carousel is at the project root the two bases coincide.
    const slideSrc = relative(projectDir, newDocAbsPath).split("\\").join("/");

    // v1 cycle simplification (see ~doc-cycle-v1-simple-check at top of
    // file): refuse if the src is already in slides[].
    const slides = carouselDoc.slides ?? [];
    if (slides.some((s) => s.src === slideSrc)) {
      // Roll back the freshly-written file so we don't leave litter.
      try { unlinkSync(newDocAbsPath); } catch { /* best-effort */ }
      throw new Error(`createDoc: slide ${slideSrc} already exists in carousel`);
    }

    // Compute insertion index.
    const insertAt =
      typeof opts.insertAt === "number" && opts.insertAt >= 0 && opts.insertAt <= slides.length
        ? opts.insertAt
        : slides.length;

    // Note: SlideRef.label is NOT populated here. Matches the CLI's createDoc
    // posture — `composeCarouselProject` only sets `label` when the caller
    // passes one; createDoc does not, so the slide has no label by default.
    const newSlide: SlideRef = { src: slideSrc };
    const newSlides = [...slides.slice(0, insertAt), newSlide, ...slides.slice(insertAt)];
    const updatedCarousel: AtelierDocument = { ...carouselDoc, slides: newSlides };

    writeFileSync(carouselAbs, JSON.stringify(updatedCarousel, null, 2), "utf-8");

    return { newDocPath, newDocAbsPath, appendedSlideIndex: insertAt };
  }

  return { newDocPath, newDocAbsPath };
}

// ─── duplicateDoc ────────────────────────────────────────────────────

/**
 * Duplicate an existing doc inside a project. Source is given as a project-
 * relative path; destination is `<stem>-copy.atelier` (with -copy-2, -copy-3…
 * collision suffixes — there is intentionally no `-copy-1` since `-copy` is
 * conceptually copy #1).
 *
 * - When `appendSlideRef:true`, requires the source to live directly under
 *   `slides/` (matches the CLI guard exactly: `dirname === "slides"`, NOT
 *   "starts with slides/"). Locates the project's carousel manifest at
 *   `project.atelier`, and appends a SlideRef pointing at the duplicate.
 *   Refuses (v1 simplification, see ~doc-cycle-v1-simple-check at top of
 *   file) if the duplicate src already exists in slides[].
 */
export function duplicateDoc(opts: DuplicateDocOptions): DocDuplicateReport {
  const projectDir = resolve(opts.projectDir);

  const sourceAbs = join(projectDir, opts.sourceDocPath);
  if (!existsSync(sourceAbs)) {
    throw new Error(`duplicateDoc: source doc not found: ${opts.sourceDocPath}`);
  }

  // Parse the source so we preserve its content verbatim (including layer ids).
  const sourceDoc = readAtelierDoc(sourceAbs);

  // ── Compute "<stem>-copy[-N].atelier" with collision suffix ───
  const sourceDir = dirname(sourceAbs);
  const sourceBase = basename(sourceAbs);
  const sourceExt = extname(sourceBase); // ".atelier"
  const sourceStem = sourceExt ? sourceBase.slice(0, -sourceExt.length) : sourceBase;

  // Collision suffix sequence: -copy, -copy-2, -copy-3, ... (matches CLI
  // canonical). NOTE the gap at -copy-1: the first suffix bump goes straight
  // to -copy-2 because -copy itself is conceptually copy #1.
  let finalStem: string | undefined;
  for (let attempt = 1; attempt <= 999; attempt++) {
    const candidate = attempt === 1 ? `${sourceStem}-copy` : `${sourceStem}-copy-${attempt}`;
    if (!existsSync(join(sourceDir, `${candidate}.atelier`))) {
      finalStem = candidate;
      break;
    }
  }
  if (!finalStem) {
    throw new Error(`duplicateDoc: could not find a non-colliding stem for "${sourceStem}-copy"`);
  }

  const newDocAbsPath = join(sourceDir, `${finalStem}.atelier`);

  // Project-relative new path — preserves the source's parent dir.
  const sourceRel = opts.sourceDocPath;
  const lastSlash = sourceRel.lastIndexOf("/");
  const parentRel = lastSlash >= 0 ? sourceRel.slice(0, lastSlash + 1) : "";
  const newDocPath = `${parentRel}${finalStem}.atelier`;

  // Preserve `doc.name` verbatim on the duplicate. Matches the CLI's
  // canonical behavior — the studio sidebar uses the filename as the display
  // label, so the in-doc `name` does NOT need to track the new stem.
  const dupDoc: AtelierDocument = { ...sourceDoc };
  writeFileSync(newDocAbsPath, JSON.stringify(dupDoc, null, 2), "utf-8");

  const report: DocDuplicateReport = {
    sourceDocPath: opts.sourceDocPath,
    newDocPath,
  };

  // ── Optional SlideRef append ──────────────────────────────────
  if (opts.appendSlideRef) {
    // Guard: appendSlideRef only makes sense when the source is a slide
    // (lives DIRECTLY under `slides/`). Matches the CLI guard exactly —
    // `dirname === "slides"`, NOT "starts with slides/". A source nested
    // deeper (e.g. `slides/nested/foo.atelier`) is rejected.
    const sourceDirRel = dirname(opts.sourceDocPath);
    if (sourceDirRel !== "slides") {
      // Roll back to avoid leaving an orphan.
      try { unlinkSync(newDocAbsPath); } catch { /* best-effort */ }
      throw new Error("appendSlideRef requires a slide source");
    }

    const manifestAbs = join(projectDir, "project.atelier");
    if (!existsSync(manifestAbs)) {
      throw new Error("duplicateDoc: appendSlideRef requested but project.atelier is missing");
    }
    const manifest = readAtelierDoc(manifestAbs);
    if (manifest.kind !== "carousel") {
      throw new Error(`duplicateDoc: appendSlideRef requires a carousel manifest (kind=${manifest.kind ?? "video"})`);
    }

    // SlideRef src basis is projectDir; for the manifest at the project root
    // `dirname(manifestAbs) === projectDir` so this matches both the canonical
    // dual-base resolver's preferred basis and the existing CLI behavior.
    const slideSrc = relative(projectDir, newDocAbsPath).split("\\").join("/");
    const slides = manifest.slides ?? [];
    if (slides.some((s) => s.src === slideSrc)) {
      throw new Error(`duplicateDoc: slide ${slideSrc} already exists in carousel`);
    }

    // Find the source's index in slides[] so we can insert the duplicate
    // adjacent (right after source). Matches the CLI's canonical behavior.
    // Falls back to append if the source isn't currently in slides[].
    const sourceSlideSrc = relative(projectDir, sourceAbs).split("\\").join("/");
    const sourceIndex = slides.findIndex((s) => s.src === sourceSlideSrc);
    const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : slides.length;

    const newSlide: SlideRef = { src: slideSrc };
    const newSlides = [...slides.slice(0, insertAt), newSlide, ...slides.slice(insertAt)];
    const updatedManifest: AtelierDocument = { ...manifest, slides: newSlides };

    writeFileSync(manifestAbs, JSON.stringify(updatedManifest, null, 2), "utf-8");
    report.appendedSlideIndex = insertAt;
  }

  return report;
}

// ─── deleteDoc ───────────────────────────────────────────────────────

/**
 * Delete an `.atelier` doc inside a project. Cascades:
 *   - Walks every project under `workspaceDir`. For each project, scans
 *     EVERY `.atelier` file (manifest + root docs + `slides/*`) for both:
 *       * SlideRefs whose resolved src points at the deleted doc — these
 *         are scrubbed (spliced out) and reported in `slideRefsRemoved`.
 *       * RefVisual layers (`visual.type === "ref"`) whose src points at
 *         the deleted doc — reported as dangling in `refLayersDangling`
 *         with the accurate per-match docPath. NOT auto-removed (the
 *         renderer tolerates missing refs; the studio surfaces warnings).
 *   - Unlinks the doc file last.
 *
 * Post-pivot: there is no special "manifest" guard — `project.atelier` is
 * just another `.atelier` doc and can be deleted like any other.
 */
export function deleteDoc(opts: DeleteDocOptions): DocDeleteCascadeReport {
  const workspaceDir = resolve(opts.workspaceDir);
  const projectDir = join(workspaceDir, opts.projectName);
  const docAbs = join(projectDir, opts.docPath);

  if (!existsSync(docAbs)) {
    throw new Error(`deleteDoc: doc not found: ${opts.docPath}`);
  }

  const report: DocDeleteCascadeReport = {
    docPath: opts.docPath,
    slideRefsRemoved: [],
    refLayersDangling: [],
  };

  // ── Workspace walk: every immediate subdir of workspaceDir with a
  //    project.atelier is a project candidate.
  let projectNames: string[] = [];
  try {
    projectNames = readdirSync(workspaceDir).filter((entry) => {
      if (entry.startsWith(".")) return false;
      try {
        const projDir = join(workspaceDir, entry);
        if (!statSync(projDir).isDirectory()) return false;
        return existsSync(join(projDir, "project.atelier"));
      } catch {
        return false;
      }
    });
  } catch {
    projectNames = [];
  }

  for (const projName of projectNames) {
    const projDir = join(workspaceDir, projName);

    // Walk every .atelier in this project: root docs + slides/*.atelier.
    const projectAtelierFiles = listAtelierFilesUnderProject(projDir);

    for (const atelierAbs of projectAtelierFiles) {
      let doc: AtelierDocument;
      try {
        doc = readAtelierDoc(atelierAbs);
      } catch {
        continue;
      }
      let mutated = false;
      const docRel = relative(projDir, atelierAbs).split("\\").join("/");

      // ── SlideRef scrub (any carousel doc, not just project.atelier) ──
      if (doc.kind === "carousel" && Array.isArray(doc.slides)) {
        const keptSlides: SlideRef[] = [];
        doc.slides.forEach((slide, idx) => {
          const slideAbs = resolveRefSrc(slide.src, atelierAbs, projDir, workspaceDir);
          if (slideAbs === docAbs) {
            report.slideRefsRemoved.push({ project: projName, slideIndex: idx });
            mutated = true;
            return;
          }
          keptSlides.push(slide);
        });
        if (mutated) {
          doc = { ...doc, slides: keptSlides };
        }
      }

      // ── RefVisual dangling scan (any .atelier) ───────────────
      if (Array.isArray(doc.layers)) {
        for (const layer of doc.layers as Layer[]) {
          const v = layer.visual as Layer["visual"] | undefined;
          if (!v || (v as { type?: string }).type !== "ref") continue;
          const refV = v as RefVisual;
          if (typeof refV.src !== "string" || !refV.src) continue;
          const refAbs = resolveRefSrc(refV.src, atelierAbs, projDir, workspaceDir);
          if (refAbs === docAbs) {
            report.refLayersDangling.push({
              project: projName,
              docPath: docRel,
              layerId: layer.id,
            });
          }
        }
      }

      if (mutated) {
        writeFileSync(atelierAbs, JSON.stringify(doc, null, 2), "utf-8");
      }
    }
  }

  // ── Unlink the doc itself last (after the cascade) ───────────
  unlinkSync(docAbs);

  return report;
}

/**
 * Enumerate `.atelier` files under a project: every `.atelier` at the
 * project root, plus everything immediately inside `slides/`. Deeper
 * nesting is NOT walked (matches `listDocs`'s posture).
 *
 * Defense-in-depth: filters to regular files via `isFile()` (so directories
 * like `.atelier/` — the paradigm metadata dir — never sneak in) AND skips
 * the literal `.atelier` entry name explicitly.
 */
function listAtelierFilesUnderProject(projectDir: string): string[] {
  const out: string[] = [];

  // Root-level .atelier files (manifest + compose targets + any sibling docs).
  try {
    for (const entry of readdirSync(projectDir)) {
      if (entry === ".atelier") continue; // skip paradigm metadata dir
      if (!entry.endsWith(".atelier")) continue;
      const abs = join(projectDir, entry);
      try {
        if (statSync(abs).isFile()) out.push(abs);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // slides/*.atelier (one level deep only).
  const slidesDir = join(projectDir, "slides");
  if (existsSync(slidesDir)) {
    try {
      for (const entry of readdirSync(slidesDir)) {
        if (!entry.endsWith(".atelier")) continue;
        const abs = join(slidesDir, entry);
        try {
          if (statSync(abs).isFile()) out.push(abs);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return out;
}

/**
 * Resolve a SlideRef.src (or RefVisual.src) using the dual-base pattern from
 * `#ref-cycle`: try the doc's owning project dir first (project-relative
 * srcs), then fall back to the workspace root (workspace-relative srcs).
 * Absolute refs are short-circuited via `existsSync`. Returns the absolute
 * resolved path or undefined when neither candidate exists on disk.
 */
function resolveRefSrc(
  src: string,
  currentDocAbs: string,
  ownerProjectDir: string,
  workspaceRoot: string,
): string | undefined {
  if (isAbsolute(src)) {
    return existsSync(src) ? resolve(src) : undefined;
  }
  // Primary: project-relative (matches the createDoc/duplicateDoc src basis).
  const projectRelative = resolve(ownerProjectDir, src);
  if (existsSync(projectRelative)) return projectRelative;
  // Fallback: relative to the carousel doc's own directory (legacy basis
  // before the projectDir-basis alignment).
  const docRelative = resolve(dirname(currentDocAbs), src);
  if (existsSync(docRelative)) return docRelative;
  // Last resort: workspace-relative srcs.
  const workspaceRelative = resolve(workspaceRoot, src);
  if (existsSync(workspaceRelative)) return workspaceRelative;
  return undefined;
}

// ─── listDocs ───────────────────────────────────────────────────────

/**
 * Enumerate every `.atelier` doc inside a project for the studio sidebar.
 *
 * Pure filesystem walk: project root + `slides/` (no recursion deeper). Does
 * NOT follow `slides[]` references — slide refs may point anywhere in the
 * workspace, but `listDocs` only reports docs that physically live in THIS
 * project's subtree (root or `slides/`). Carousel refs pointing into other
 * projects surface when THOSE projects are queried.
 *
 * Result is flat alphabetical (by project-relative path), and each entry
 * carries just `{ path, kind? }` — no `role`, no `slideIndex`, no
 * `slideLabel` (those were the pre-pivot manifest-centric fields).
 */
export function listDocs(projectDir: string): DocListEntry[] {
  const projAbs = resolve(projectDir);
  const collected: Array<{ rel: string; abs: string }> = [];

  // Root-level .atelier files.
  try {
    for (const entry of readdirSync(projAbs)) {
      if (entry === ".atelier") continue; // skip paradigm metadata dir
      if (!entry.endsWith(".atelier")) continue;
      const abs = join(projAbs, entry);
      try {
        if (!statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      collected.push({ rel: entry, abs });
    }
  } catch { /* skip */ }

  // slides/*.atelier (one level deep).
  const slidesDir = join(projAbs, "slides");
  if (existsSync(slidesDir)) {
    try {
      for (const entry of readdirSync(slidesDir)) {
        if (!entry.endsWith(".atelier")) continue;
        const abs = join(slidesDir, entry);
        try {
          if (!statSync(abs).isFile()) continue;
        } catch {
          continue;
        }
        collected.push({ rel: `slides/${entry}`, abs });
      }
    } catch { /* skip */ }
  }

  // Flat alphabetical sort by project-relative path.
  collected.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const out: DocListEntry[] = [];
  for (const { rel, abs } of collected) {
    let kind: "video" | "image" | "carousel" | undefined;
    try {
      kind = readAtelierDoc(abs).kind;
    } catch { /* skip — entry surfaces with kind undefined */ }
    const entry: DocListEntry = { path: rel };
    if (kind !== undefined) entry.kind = kind;
    out.push(entry);
  }

  // Note on cross-project containment (Judge flag item 7): N/A under the
  // pure FS-walk model. Since we never follow slide refs, there are no
  // out-of-project paths to filter. The CLI's containment check is needed
  // there because the CLI's listDocs still walks slides[]; this version
  // doesn't.

  return out;
}
