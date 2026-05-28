// #compose-carousel-project — append/insert a slide ref into a kind:"carousel"
// Atelier project (a manifest of ordered .atelier sub-documents).
//
// A carousel project's `slides[]` may point at any .atelier file in the
// workspace (other carousels, video projects, image projects, ref-visual
// composites). Cycle safety is non-negotiable: a carousel that refs itself —
// directly or transitively — locks the resolver, so this helper consults
// #ref-cycle (`detectCarouselCycle`) BEFORE writing any slide.
//
// Pipeline:
//   1. Read or scaffold `<projectDir>/project.atelier` (kind:"carousel").
//   2. Refuse if the existing doc is kind !== "carousel".
//   3. Run #ref-cycle against (rootPath=projectDir/.atelier, candidate=slidePath,
//      workspaceRoot). Throw on cycle with the chain in the message.
//   4. Compute the slide src as `relative(workspaceRoot, slidePath)`.
//   5. Idempotent on duplicate src — return the existing slideIndex.
//   6. Insert at `opts.insertAt` (default: append).
//
// NO layers added. NO transcription. The carousel doc owns no clip layers
// of its own — render-time the exporter walks slides[] and stitches each
// sub-document's render.

import { existsSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import type {
  AtelierDocument,
  SlideRef,
  SlideTransition,
} from "@a-company/atelier-types";
import { readAtelierDoc } from "./compose-video-project.js";
import { detectCarouselCycle } from "./ref-cycle.js";

export interface ComposeCarouselProjectOptions {
  /** Absolute path to project root (contains or will contain project.atelier). */
  projectDir: string;
  /** Absolute path to any .atelier file in the workspace. */
  slidePath: string;
  /** Workspace root used for cycle detection. Defaults to dirname(projectDir). */
  workspaceRoot?: string;
  /** Index to insert at; default = append. */
  insertAt?: number;
  transition?: SlideTransition;
  /** For image slides — frames to hold; ignored for video slides. */
  duration?: number;
  label?: string;
}

export interface ComposeCarouselProjectResult {
  doc: AtelierDocument;
  slideIndex: number;
  addedSlide: boolean;
}

/**
 * Add a slide reference to a carousel project, cycle-safe.
 *
 * - Scaffolds a fresh kind:"carousel" doc if project.atelier is absent.
 * - Refuses to convert a non-carousel project.
 * - Refuses to introduce a cycle.
 * - Idempotent on duplicate slide src.
 */
export async function composeCarouselProject(
  opts: ComposeCarouselProjectOptions,
): Promise<ComposeCarouselProjectResult> {
  const projectDir = resolve(opts.projectDir);
  const slidePath = resolve(opts.slidePath);
  const workspaceRoot = resolve(opts.workspaceRoot ?? dirname(projectDir));
  const compositionPath = `${projectDir}/project.atelier`;

  // 1. Read or scaffold.
  let doc: AtelierDocument;
  if (existsSync(compositionPath)) {
    doc = readAtelierDoc(compositionPath);
  } else {
    doc = {
      version: "1.0",
      name: basename(projectDir),
      kind: "carousel",
      canvas: { width: 1080, height: 1920, fps: 30 },
      layers: [],
      states: { default: { duration: 1, deltas: [] } },
      slides: [],
    };
  }

  // 2. Kind check.
  if (doc.kind !== undefined && doc.kind !== "carousel") {
    throw new Error("project is not a carousel; cannot add slides");
  }

  // 3. Cycle check — root is THIS carousel, candidate is the new slide.
  const cycleResult = detectCarouselCycle(
    compositionPath,
    slidePath,
    workspaceRoot,
  );
  if (cycleResult.cycle) {
    const chain = cycleResult.path ?? [];
    throw new Error(`carousel cycle detected: ${chain.join(" → ")}`);
  }

  // 4. Compute workspace-relative src.
  const computedSrc = relative(workspaceRoot, slidePath);

  // 5. Idempotence — duplicate src returns the existing index.
  const slides: SlideRef[] = doc.slides ? [...doc.slides] : [];
  const existingIndex = slides.findIndex((s) => s.src === computedSrc);
  if (existingIndex >= 0) {
    // Make sure the doc on disk has slides[] — if we just scaffolded a fresh
    // one, write it. But existence-check + read path means we only reach here
    // when an existing slide was found, so a write is unnecessary. Still,
    // we persist for consistency when we scaffolded above.
    if (!existsSync(compositionPath)) {
      doc = { ...doc, slides };
      writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");
    }
    return {
      doc: { ...doc, slides },
      addedSlide: false,
      slideIndex: existingIndex,
    };
  }

  // 6. Build the slide ref + insert.
  const slideRef: SlideRef = { src: computedSrc };
  if (opts.duration !== undefined) slideRef.duration = opts.duration;
  if (opts.transition !== undefined) slideRef.transition = opts.transition;
  if (opts.label !== undefined) slideRef.label = opts.label;

  let insertIndex: number;
  if (opts.insertAt !== undefined) {
    insertIndex = Math.max(0, Math.min(opts.insertAt, slides.length));
    slides.splice(insertIndex, 0, slideRef);
  } else {
    insertIndex = slides.length;
    slides.push(slideRef);
  }

  doc = { ...doc, slides };

  writeFileSync(compositionPath, JSON.stringify(doc, null, 2), "utf-8");

  return {
    doc,
    addedSlide: true,
    slideIndex: insertIndex,
  };
}
