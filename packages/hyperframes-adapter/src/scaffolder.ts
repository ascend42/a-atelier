/**
 * scaffolder — produce a complete Hyperframes project directory from an
 * Atelier creator Project (DESIGN/SCRIPT/STORYBOARD + media + transcripts).
 *
 * Output layout (Hyperframes convention):
 *   <outDir>/
 *   ├── meta.json              { name, id, createdAt }
 *   ├── index.html             root composition
 *   └── assets/
 *       ├── <source video>     symlinked from creator/<project>/media/
 *       └── ...
 *
 * v0 input (this spike): we take a concrete config object. The full
 * pipeline (v1.0) will read DESIGN.md / SCRIPT.md / STORYBOARD.md from the
 * creator project dir using the artifact-project loader; here we keep the
 * adapter pure (no FS reads of artifacts) so the caller composes the input
 * however they like.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { storyboardToHtml, type StoryboardInput } from "./storyboard-to-html.js";
import { injectAssets } from "./asset-injector.js";

export interface ScaffoldOptions {
  /** Target directory for the Hyperframes project (created if missing). */
  outDir: string;
  /** Project name written to meta.json + index.html title. */
  projectName: string;
  /** Story input that maps to the index.html (video + captions + brand). */
  storyboard: StoryboardInput;
  /** Absolute paths of all media files that need to land in assets/. */
  sourceFiles: string[];
}

export interface ScaffoldResult {
  projectDir: string;
  indexHtmlPath: string;
  metaJsonPath: string;
  assetsInjected: Record<string, string>;
  assetsSkipped: string[];
}

/**
 * Materialize a Hyperframes project. Idempotent: re-running over an
 * existing scaffold updates index.html + meta.json + asset symlinks
 * without clobbering renders/ or snapshots/ if Hyperframes has written
 * those (we never touch any directory besides assets/).
 */
export function scaffoldHyperframesProject(opts: ScaffoldOptions): ScaffoldResult {
  mkdirSync(opts.outDir, { recursive: true });

  const html = storyboardToHtml(opts.storyboard);
  const indexPath = `${opts.outDir}/index.html`;
  writeFileSync(indexPath, html, "utf8");

  const meta = {
    name: opts.projectName,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    // Atelier-namespaced fields — Hyperframes ignores them but downstream
    // tools (CHANGELOG generators, the agent team's reporting) can read
    // them as provenance.
    atelier: {
      adapterVersion: "0.0.1",
      source: "atelier-hyperframes-adapter",
    },
  };
  const metaPath = `${opts.outDir}/meta.json`;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  const { injected, skipped } = injectAssets({
    projectDir: opts.outDir,
    sourceFiles: opts.sourceFiles,
  });

  return {
    projectDir: opts.outDir,
    indexHtmlPath: indexPath,
    metaJsonPath: metaPath,
    assetsInjected: injected,
    assetsSkipped: skipped,
  };
}
