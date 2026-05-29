/**
 * @a-company/atelier-hyperframes-adapter
 *
 * The v2 Atelier renderer bridge. Reads a creator Project directory
 * (DESIGN.md / SCRIPT.md / STORYBOARD.md + media/ + transcripts/) and
 * emits a Hyperframes project directory ready for
 * `@hyperframes/producer`'s `executeRenderJob`.
 *
 * v0 scope (this spike):
 *   - Single VideoVisual layer from the first media file
 *   - DESIGN brand palette → :root CSS variables
 *   - Transcript segments → caption overlays with `data-start`/`data-duration`
 *   - Source video + audio carried natively by Hyperframes' video element
 *
 * v1.0 follow-ups (see docs/v2-hyperframes-migration.md):
 *   - Multi-clip composition
 *   - Technique-library bindings (ken-burns, split-reveal, etc)
 *   - Recipe binding for reusable presets
 *   - Mind-map asset resolution (vs. media/ flat directory)
 */

export { scaffoldHyperframesProject } from "./scaffolder.js";
export type { ScaffoldOptions, ScaffoldResult } from "./scaffolder.js";

export { designToCss } from "./design-to-css.js";
export { storyboardToHtml } from "./storyboard-to-html.js";
export { injectAssets } from "./asset-injector.js";
export { runRender } from "./producer-runner.js";
export type { RunRenderOptions, RunRenderResult } from "./producer-runner.js";
