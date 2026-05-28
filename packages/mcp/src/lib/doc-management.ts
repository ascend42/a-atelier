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
//   - deleteDoc:    unlink a non-manifest doc; scrub workspace-wide
//                   SlideRefs that pointed at it; report dangling RefVisual
//                   layers (not auto-removed).
//   - listDocs:     enumerate .atelier files in a project + slides/.
//
// Cycle-check simplification (per Unit B spec):
//   v1 does NOT run the full transitive cycle walk from ref-cycle.ts.
//   Instead, before appending a SlideRef, we refuse if the target src is
//   already present in slides[] (covers the common direct/duplicate case).
//   Full detectCarouselCycle integration is tracked as a Unit-0.5 follow-up.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { AtelierDocument, Layer, RefVisual, SlideRef } from "@a-company/atelier-types";
import { parseAtelier } from "@a-company/atelier-schema";

import {
  isManifestDoc,
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
 *   is relative to the carousel doc's directory (per SlideRef contract).
 * - Cycle check (v1): refuses if the new src already exists in slides[].
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

    // SlideRef.src must be relative to the carousel doc's directory (the
    // carousel manifest is the resolution origin per ref-cycle's contract).
    const slideSrc = relative(dirname(carouselAbs), newDocAbsPath).split("\\").join("/");

    // v1 cycle simplification: refuse if the src is already in slides[].
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

    // Note: SlideRef.label is NOT populated here. Matches Kit-A's createDoc
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
 * relative path; destination is `<stem>-copy.atelier` (with -copy-1, -copy-2…
 * collision suffixes).
 *
 * - Refuses to duplicate `project.atelier` (the manifest).
 * - When `appendSlideRef:true`, locates the project's manifest (project.atelier),
 *   and if it's a carousel, appends a SlideRef pointing at the duplicate.
 *   Refuses (v1 simplification) if the duplicate src already exists in slides[].
 */
export function duplicateDoc(opts: DuplicateDocOptions): DocDuplicateReport {
  const projectDir = resolve(opts.projectDir);

  if (isManifestDoc(opts.sourceDocPath)) {
    throw new Error("duplicateDoc: refusing to duplicate project.atelier (manifest)");
  }

  const sourceAbs = join(projectDir, opts.sourceDocPath);
  if (!existsSync(sourceAbs)) {
    throw new Error(`duplicateDoc: source doc not found: ${opts.sourceDocPath}`);
  }

  // Parse the source so we preserve its content verbatim (including layer ids).
  const sourceDoc = readAtelierDoc(sourceAbs);

  // ── Compute "<stem>-copy[-N].atelier" with collision suffix ───
  const sourceDir = dirname(sourceAbs);
  // Strip the trailing ".atelier" to get the stem.
  const sourceBase = opts.sourceDocPath.split("/").pop() ?? opts.sourceDocPath;
  const sourceStem = sourceBase.replace(/\.atelier$/, "");

  // Collision suffix sequence: -copy, -copy-2, -copy-3, ... (matches Kit-A
  // CLI). NOTE the gap at -copy-1: the first suffix bump goes straight to
  // -copy-2 because -copy itself is conceptually copy #1.
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

  // Preserve `doc.name` verbatim on the duplicate. Matches Kit-A's
  // canonical CLI behavior — the studio sidebar uses the filename as the
  // display label, so the in-doc `name` does NOT need to track the new stem.
  const dupDoc: AtelierDocument = { ...sourceDoc };
  writeFileSync(newDocAbsPath, JSON.stringify(dupDoc, null, 2), "utf-8");

  const report: DocDuplicateReport = {
    sourceDocPath: opts.sourceDocPath,
    newDocPath,
  };

  // ── Optional SlideRef append ──────────────────────────────────
  if (opts.appendSlideRef) {
    const manifestAbs = join(projectDir, "project.atelier");
    if (!existsSync(manifestAbs)) {
      throw new Error("duplicateDoc: appendSlideRef requested but project.atelier is missing");
    }
    const manifest = readAtelierDoc(manifestAbs);
    if (manifest.kind !== "carousel") {
      throw new Error(`duplicateDoc: appendSlideRef requires a carousel manifest (kind=${manifest.kind ?? "video"})`);
    }

    const slideSrc = relative(dirname(manifestAbs), newDocAbsPath).split("\\").join("/");
    const slides = manifest.slides ?? [];
    if (slides.some((s) => s.src === slideSrc)) {
      throw new Error(`duplicateDoc: slide ${slideSrc} already exists in carousel`);
    }

    // Find the source's index in slides[] so we can insert the duplicate
    // adjacent (right after source). Matches Kit-A's CLI behavior. Falls
    // back to append if the source isn't currently in slides[].
    const sourceSlideSrc = relative(dirname(manifestAbs), sourceAbs).split("\\").join("/");
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
 * Delete a non-manifest `.atelier` doc inside a project. Cascades:
 *   - Scans every project under `workspaceDir` for `project.atelier` carousels
 *     and scrubs any SlideRef whose resolved src points at the deleted doc.
 *   - Scans every `.atelier` in those projects for RefVisual layers that
 *     reference the deleted doc; reports them as dangling (NOT auto-removed).
 *   - Unlinks the doc file last.
 */
export function deleteDoc(opts: DeleteDocOptions): DocDeleteCascadeReport {
  const workspaceDir = resolve(opts.workspaceDir);
  const projectDir = join(workspaceDir, opts.projectName);
  const docAbs = join(projectDir, opts.docPath);

  if (isManifestDoc(opts.docPath)) {
    throw new Error("deleteDoc: refusing to delete project.atelier (manifest)");
  }
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
    const manifestAbs = join(projDir, "project.atelier");

    // Walk every .atelier in this project: project.atelier + slides/*.atelier.
    const projectAtelierFiles = listAtelierFilesUnderProject(projDir);

    for (const atelierAbs of projectAtelierFiles) {
      let doc: AtelierDocument;
      try {
        doc = readAtelierDoc(atelierAbs);
      } catch {
        continue;
      }
      let mutated = false;

      // ── SlideRef scrub (only the manifest carries slides[]) ──
      if (atelierAbs === manifestAbs && doc.kind === "carousel" && Array.isArray(doc.slides)) {
        const keptSlides: SlideRef[] = [];
        doc.slides.forEach((slide, idx) => {
          const slideAbs = resolveSlideSrc(slide.src, atelierAbs);
          if (slideAbs === docAbs) {
            report.slideRefsRemoved.push({ project: projName, slideIndex: idx });
            mutated = true;
            return;
          }
          keptSlides.push(slide);
        });
        if (mutated) {
          const updated: AtelierDocument = { ...doc, slides: keptSlides };
          writeFileSync(atelierAbs, JSON.stringify(updated, null, 2), "utf-8");
        }
      }

      // ── RefVisual dangling scan (any .atelier) ───────────────
      if (Array.isArray(doc.layers)) {
        for (const layer of doc.layers as Layer[]) {
          const v = layer.visual as Layer["visual"] | undefined;
          if (!v || (v as { type?: string }).type !== "ref") continue;
          const refV = v as RefVisual;
          if (typeof refV.src !== "string" || !refV.src) continue;
          const refAbs = resolveSlideSrc(refV.src, atelierAbs);
          if (refAbs === docAbs) {
            const docRel = relative(projDir, atelierAbs).split("\\").join("/");
            report.refLayersDangling.push({
              project: projName,
              docPath: docRel,
              layerId: layer.id,
            });
          }
        }
      }
    }
  }

  // ── Unlink the doc itself last (after the cascade) ───────────
  unlinkSync(docAbs);

  return report;
}

/**
 * Enumerate `.atelier` files under a project: the manifest at the root, plus
 * anything immediately inside `slides/`. Other arbitrary nesting is ignored
 * for v1 (matches `listDocs`'s posture).
 */
function listAtelierFilesUnderProject(projectDir: string): string[] {
  const out: string[] = [];
  const manifest = join(projectDir, "project.atelier");
  if (existsSync(manifest)) out.push(manifest);

  // Other top-level .atelier files (e.g. compose targets).
  try {
    for (const entry of readdirSync(projectDir)) {
      if (entry === "project.atelier") continue;
      if (!entry.endsWith(".atelier")) continue;
      const abs = join(projectDir, entry);
      try {
        if (statSync(abs).isFile()) out.push(abs);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  // slides/*.atelier
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
 * Resolve a SlideRef.src (or RefVisual.src) against the doc's directory.
 * Returns absolute path. Does NOT check existsSync — the caller compares
 * absolute strings.
 */
function resolveSlideSrc(src: string, currentDocAbs: string): string {
  return resolve(dirname(currentDocAbs), src);
}

// ─── listDocs ───────────────────────────────────────────────────────

/**
 * Enumerate every `.atelier` doc inside a project. The manifest is always
 * first when present; carousel slides follow in their `slides[]` order; any
 * remaining top-level `.atelier` files are listed last (role="other").
 */
export function listDocs(projectDir: string): DocListEntry[] {
  const projAbs = resolve(projectDir);
  const out: DocListEntry[] = [];

  // ── Manifest (always first when present) ──────────────────────
  const manifestAbs = join(projAbs, "project.atelier");
  let manifestDoc: AtelierDocument | undefined;
  if (existsSync(manifestAbs)) {
    try {
      manifestDoc = readAtelierDoc(manifestAbs);
    } catch { /* swallow */ }
    out.push({
      path: "project.atelier",
      role: "manifest",
      kind: manifestDoc?.kind,
    });
  }

  // ── Carousel slides (when manifest is a carousel) ─────────────
  if (manifestDoc?.kind === "carousel" && Array.isArray(manifestDoc.slides)) {
    manifestDoc.slides.forEach((slide, idx) => {
      // Project-relative path of the slide.
      const slideAbs = resolve(dirname(manifestAbs), slide.src);
      let rel = relative(projAbs, slideAbs).split("\\").join("/");
      if (!rel) rel = slide.src;

      let kind: "video" | "image" | "carousel" | undefined;
      if (existsSync(slideAbs)) {
        try {
          const slideDoc = readAtelierDoc(slideAbs);
          kind = slideDoc.kind;
        } catch { /* skip */ }
      }

      out.push({
        path: rel,
        role: "slide",
        ...(kind !== undefined ? { kind } : {}),
        slideIndex: idx,
        ...(slide.label !== undefined ? { slideLabel: slide.label } : {}),
      });
    });
  }

  // ── Other .atelier files at the project root ──────────────────
  // (slides/*.atelier listed via the carousel branch above; we do NOT
  // double-count them as "other".)
  const slidePaths = new Set(out.filter((e) => e.role === "slide").map((e) => e.path));
  try {
    for (const entry of readdirSync(projAbs)) {
      if (!entry.endsWith(".atelier")) continue;
      if (entry === "project.atelier") continue;
      if (slidePaths.has(entry)) continue;
      const abs = join(projAbs, entry);
      try {
        if (!statSync(abs).isFile()) continue;
      } catch {
        continue;
      }
      let kind: "video" | "image" | "carousel" | undefined;
      try {
        kind = readAtelierDoc(abs).kind;
      } catch { /* skip */ }
      out.push({
        path: entry,
        role: "other",
        ...(kind !== undefined ? { kind } : {}),
      });
    }
  } catch { /* skip */ }

  return out;
}
