# Changelog

All notable changes to this project will be documented in this file.

Format: [major.minor.fix] — based on milestone progression.

## [0.17.3] — 2026-02-20

### Changed
- Renamed repository and folder from `a-maker` to `a-atelier`
- Updated all `a-maker` references across project config, docs, and MCP configs
- Rebuilt Paradigm index files (scan-index, navigator, flow-index) with corrected paths
- `@atelier/cli` renamed to `@a-company/atelier` for npm publishing
- `@atelier/cli` tsup config: two-entry build bundles all `@atelier/*` internals via `noExternal` + MCP server entry from `../mcp/src/index.ts`
- All other packages (`types`, `math`, `schema`, `core`, `canvas`, `mcp`, `studio`) marked `"private": true`

### Added
- `atelier-mcp` binary in `@a-company/atelier` — runs the MCP server standalone
- `publishConfig: { "access": "public" }` and `prepublishOnly` script
- `yaml` added as runtime dependency (required external for ESM compatibility)
- Install via `npm i -g @a-company/atelier` provides both `atelier` CLI and `atelier-mcp` server

## [0.17.2] — 2026-02-20

### Changed
- `README.md` — Full overhaul: version 0.7.2 → 0.17.1, added `@atelier/studio` to packages table (8 total), added `render` CLI command, updated dependency graph, added version history rows for 0.8.0–0.17.1, added Documentation section linking all docs, removed stale test count
- `AGENTS.md` — Added Atelier overview section (what it is, 8 packages, key concepts) above Paradigm boilerplate
- Root `.purpose` — Restored Atelier-specific content: description, context notes, features (animation-engine, rendering, ai-authoring, studio, cli), component references to all 8 packages
- `docs/ai-agent-guide.md` — Updated animatable properties from 16 to 22 (added stroke.start/end, shadow.color/blur/offsetX/offsetY), added ecosystem section for studio and CLI render
- `packages/mcp/.purpose` — Fixed tool count: "25 tools" → "27 tools"

### Added
- `examples/hello-world.atelier` — Minimal example: 1 text layer, fade-in + slide-up
- `examples/easing-race.atelier` — 7 circles racing with different easing types
- `examples/glow-pulse.atelier` — Shadow animation with breathing glow effect
- `examples/traffic-light.atelier` — 3-state animation demonstrating the state machine pattern
- `docs/website-concept.md` — Atelier website page concept: keynote-energy scroll sequence, live canvas demos, technical rendering notes

## [0.17.1] — 2026-02-20

### Changed
- Paradigm config generalized: removed atelier-specific symbol mappings, set discipline to `auto`, added inline documentation comments
- Root `.purpose` reset to generic project template (atelier-specific components/flows/gates/signals removed)
- `CLAUDE.md` / `AGENTS.md` — removed atelier-specific descriptions, added Session Checkpoints section, updated `.purpose` directory paths, removed package-specific logging mappings
- `.paradigm/navigator.yaml` and `.paradigm/scan-index.json` rebuilt from updated `.purpose` files

### Added
- `.claude/hooks/` — Paradigm compliance hooks (post-write, pre-commit, stop)
- `.claude/settings.json` — Claude Code settings
- `.paradigm/flow-index.json` — flow index for `paradigm_flows_affected` queries
- `paradigm_session_checkpoint` documented in AGENTS.md tool table

## [0.17.0] — 2026-02-15

### Added
- `@atelier/studio` — Browser-based Export button in toolbar with modal dialog (format picker, progress bar, download link)
- `@atelier/studio` — MP4 export via WebCodecs `VideoEncoder` + `mp4-muxer` (dynamic import, H.264, 5Mbps)
- `@atelier/studio` — WebM export via WebCodecs VP9 + `webm-muxer` with alpha channel support for transparent video assets; codec fallback chain (VP9+alpha → VP9 → VP8)
- `@atelier/studio` — Built-in GIF89a encoder (~250 lines, zero dependencies): popularity-based color quantization with full 15-bit LUT, numeric hash-trie LZW compression
- `@atelier/studio` — GIF accumulated-time rounding for correct playback tempo across all fps values; frame skipping for high-fps documents (≥34fps) with 3cs minimum delay to avoid browser clamping
- `@atelier/studio` — `VideoEncoder.isConfigSupported()` pre-validation with clear error messages; managed encoder wrapper with async error capture and backpressure (`encodeQueueSize`) draining
- `@atelier/studio` — Public API: `exportDocument()`, `supportsWebCodecs()`, `supportsWebM()`, `supportsGifExport()`, `ExportFormat`, `ExportOptions`, `ExportResult`
- `@atelier/studio` — `CanvasPanel.getCanvas()`, `getImageCache()`, `pause()` public accessors
- `@atelier/studio` — 8 new tests: GIF encoder (header, multi-frame, empty), capability checks (WebCodecs, WebM, GIF)
- Dependencies: `mp4-muxer`, `webm-muxer` added to `@atelier/studio`

## [0.16.0] — 2026-02-15

### Added
- `@atelier/cli` — `atelier render <file>` command: renders animations to MP4 or GIF via FFmpeg
  - Core render pipeline (`render-pipeline.ts`): frame loop with backpressure handling, FFmpeg spawning, image pre-loading via node-canvas `loadImage`
  - Commander wrapper (`render.ts`): `-o/--output`, `-f/--format` (mp4|gif), `-s/--state` options with progress display and ETA
  - Validates H.264 even-dimension requirement, graceful errors for missing FFmpeg / missing `canvas` package
  - `canvas` added as optional peer dependency (`>=2.0.0`)
  - Public API exports: `renderCommand`, `renderDocument`, `buildFfmpegArgs`, `checkFfmpeg`
  - Tests for `buildFfmpegArgs` (MP4 + GIF arg validation) and `checkFfmpeg`

## [0.15.0] — 2026-02-15

### Added
- `@atelier/studio` — Undo/redo system: snapshot-based `History` class (50-entry max) with `Cmd+Z` / `Cmd+Shift+Z` keyboard shortcuts and toolbar buttons
- `@atelier/canvas` — Group layer parent transform inheritance: child layers with `parentId` now accumulate ancestor translate/rotate/scale via `applyAncestorTransforms()` walk
- `@atelier/canvas` — Ref layer placeholder renderer: dashed outline rectangle with "REF: {src}" label text
- `@atelier/canvas` — Asset-to-src resolution: image layers with `assetId` and no `src` resolve from `doc.assets` before rendering
- `@atelier/studio` — Image visual section in property panel: Asset ID input, Src URL input, "Use Asset" button for `doc.assets` resolution
- `@atelier/studio` — Test suite: 21 tests (vitest + happy-dom) covering History, NumberInput, ColorPicker, SliderInput, SelectInput, LayerPanel, PropertyPanel
- `@atelier/canvas` — `maxWidth` optional parameter added to `RenderContext.fillText()` signature
- `@atelier/canvas` — `renderRef` exported from package index

## [0.14.0] — 2026-02-14

### Added
- `@atelier/types` + `@atelier/schema` — `Shadow` interface and `ShadowSchema` (color, blur, offsetX, offsetY) as an optional layer-level property
- `@atelier/types` + `@atelier/schema` — 4 new animatable properties: `shadow.color`, `shadow.blur`, `shadow.offsetX`, `shadow.offsetY`
- `@atelier/canvas` — Shadow rendering via Canvas 2D `shadowColor`/`shadowBlur`/`shadowOffsetX`/`shadowOffsetY`, resolved from layer defaults and animated computed properties
- `@atelier/canvas` — `drawImage` added to `RenderContext` interface; new `ImageCache` (browser-agnostic with injectable `createImage` factory) and `renderImage()` renderer for image layers
- `@atelier/types` + `@atelier/schema` — `src?: string` field on `ImageVisual` for direct URL / data-URL rendering
- `@atelier/studio` — Shadow section in property panel: color picker, blur slider (0–50), offset X/Y inputs, add/remove shadow buttons
- `@atelier/studio` — Keyboard shortcuts: Space (play/pause), ArrowLeft/Right (frame step), Delete/Backspace (remove selected layer)
- `@atelier/studio` — Path point editing in property panel for `PathShape`: per-point X/Y inputs, remove button, closed toggle, add point button
- `@atelier/studio` — Image layer rendering via `ImageCache` integration in canvas panel
- `@atelier/studio` — Shadow animatable properties in delta panel with proper defaults and configs
- `@atelier/mcp` — 4 shadow values added to `AnimatablePropertyEnum` for delta tools
- `@atelier/showcase` — "Glow Pulse" example: circle with animated `shadow.blur` (5→30→5) and `shadow.color` (blue→purple→blue)

## [0.13.0] — 2026-02-14

### Added
- `@atelier/types` + `@atelier/schema` — `strokeStart` (0–1) and `strokeEnd` (0–1) optional fields on `Stroke` interface and `StrokeSchema`
- `@atelier/types` + `@atelier/schema` — `visual.stroke.start` and `visual.stroke.end` added to `AnimatableProperty` union and `AnimatablePropertySchema` enum
- `@atelier/canvas` — Stroke trim rendering via `setLineDash` + `lineDashOffset` simulation in `applyStroke()`
  - Per-shape perimeter helpers: `rectPerimeter`, `ellipsePerimeter` (Ramanujan), `pathPerimeter` (with bezier chord approximation)
  - Trim overrides existing dash pattern when `strokeStart !== 0` or `strokeEnd !== 1`
- `@atelier/canvas` — `lineDashOffset` added to `RenderContext` interface
- `@atelier/canvas` — `buildEffectiveVisual` resolves animated `visual.stroke.start` / `visual.stroke.end` properties
- `@atelier/studio` — Start/End sliders (0–1, step 0.01) in property panel stroke section
- `@atelier/studio` — `visual.stroke.start` and `visual.stroke.end` in delta panel animatable properties with slider controls
- `@atelier/mcp` — `visual.stroke.start` and `visual.stroke.end` in `AnimatablePropertyEnum` for delta tools
- `@atelier/showcase` — "Stroke Trim" example: staggered draw-on and wipe-away across circle, rect, and star path shapes

### Fixed
- `@atelier/core` — Hex color interpolation now lerps through RGBA space instead of snapping between values (fixes Color Shift and all `visual.fill.color` / `visual.stroke.color` animations)
- `@atelier/studio` — Layer panel scroll position no longer resets when selecting a layer
- `@atelier/studio` — Selected layer highlight now uses accent left border + stronger background for better visibility

## [0.12.0] — 2026-02-14

### Added
- `@atelier/types` + `@atelier/schema` — Optional `name?: string` field on `Delta` type and `DeltaSchema`
- `@atelier/studio` — Dual-thumb range slider (`#range-slider`) for visualizing and editing delta frame ranges
  - Two overlaid native `<input type="range">` elements with filled accent track between thumbs
  - Bidirectional sync: slider updates number inputs and vice versa
  - `max` bound to animation duration
- `@atelier/studio` — Optional delta naming: text input in editor, name shown in collapsed header before property label
- `@atelier/studio` — Sort button (`↕ Sort`) in delta panel title row — orders deltas by start frame ascending
- `@atelier/studio` — Mini timeline bar in collapsed delta view — non-interactive accent segment showing frame range position relative to animation duration

## [0.11.0] — 2026-02-14

### Added
- `@atelier/studio` — Drag-to-reorder for layers and deltas
  - Shared `enableDragReorder()` utility (`#drag-reorder`) using HTML5 Drag and Drop API
  - Grip handle (`☰`) on each layer item and delta header, hidden by default, fades in on hover
  - Accent-colored drop indicator line (`box-shadow`) shows above/below target
  - Dragged item reduces opacity; handle-only activation prevents accidental drags
  - `MutationObserver` re-binds handles after each re-render; `AbortController` for clean teardown
  - Layer reordering splices `doc.layers` array directly (affects Z-order / painters algorithm)
  - Delta reordering maps filtered per-layer indices back to absolute positions in `state.deltas` flat array

## [0.10.0] — 2026-02-14

### Added
- `@atelier/studio` — Inline delta editor: clicking a delta header expands an editor with property-matched controls
  - `SliderInput` for opacity (0–1), `ColorPicker` for fill/stroke/style colors, `NumberInput` for position/size/rotation/scale
  - Property dropdown to change animated property (resets from/to to sensible defaults)
  - `EasingPicker` for easing selection, dual `NumberInput` for frame range
  - Only one delta expanded at a time; new deltas auto-expand for immediate editing
  - All edits mutate delta directly and fire `onDeltaChange()` for live canvas updates
  - Added `anchorPoint.x` / `anchorPoint.y` to animatable property list

## [0.9.0] — 2026-02-14

### Changed
- `@atelier/studio` — Side-by-side layout: canvas always visible on left, tabbed right panel (YAML / Editor)
  - Replaced three-way view toggle (`preview` | `yaml` | `editor`) with two-tab right panel (`yaml` | `editor`)
  - `StudioView` type replaced by `RightTab`; `initialView` option replaced by `initialTab`
  - Editor tab shows layers list (top) and property inspector (bottom) in a single right column
- `apps/showcase` — Simplified to always embed studio widget; removed standalone preview mode and view-toggle buttons
- `@atelier/studio` — CSS now bundled via tsup and explicitly imported (`@atelier/studio/styles.css`)

### Fixed
- `@atelier/studio` — CSS was not included in build output (`dist/styles.css` never existed); added `import "./styles.css"` to source and updated package.json export to `dist/index.css`

## [0.8.0] — 2026-02-14

### Added
- `@atelier/studio` — New reusable editor widget package with three view modes:
  - **Preview**: Canvas playback with play/pause/scrub controls
  - **YAML**: Read-only syntax-highlighted YAML viewer with copy-to-clipboard
  - **Editor**: Three-panel layout (layer sidebar | canvas | property inspector)
- Studio panels: `#canvas-panel`, `#layer-panel`, `#property-panel`, `#delta-panel`, `#yaml-panel`
- Reusable controls: `#number-input`, `#color-picker`, `#select-input`, `#slider-input`, `#easing-picker`
- Editor features: add/remove layers, toggle visibility, edit position/size/transform/visual properties, add/remove deltas, state selector for multi-state documents, reset button
- `apps/showcase` — View toggle buttons (Preview / YAML / Editor) in header to embed the studio widget per example
- `docs/getting-started.md` — "See It In Action" section with showcase run instructions

## [0.7.3] — 2026-02-14

### Added
- 22-document documentation suite:
  - **Foundation**: `README.md` (rewrite), `docs/format-spec.md`, `docs/architecture.md`
  - **Package READMEs**: types, math, schema, core, canvas, mcp, cli
  - **App READMEs**: playground, showcase
  - **Deep Reference**: `docs/mcp-reference.md`, `docs/builder-guide.md`, `docs/state-machine-guide.md`, `docs/rendering-pipeline.md`
  - **Guides**: `docs/getting-started.md`, `docs/examples.md`, `docs/contributing.md`, `docs/design-decisions.md`, `docs/glossary.md`, `docs/ai-agent-guide.md`

## [0.7.2] — 2026-02-14

### Changed
- `apps/showcase` — Restyle with Cormorant Garamond font and editorial color palette (Deep Charcoal, Paper White, Terracotta, Instructional Blue) across both themes and all 19 examples

### Fixed
- `@atelier/canvas` — Text layers with `textAlign: "center"` or `"right"` now render correctly within their bounding box. Previously, Canvas 2D alignment anchored at local origin (0,0), pushing right-aligned text off the left edge of the canvas.

## [0.7.1] — 2026-02-14

### Fixed
- `@atelier/core` — Properties no longer revert after a delta's range ends. `resolvePropertyAtFrame` now holds the `to` value of the most recently completed delta, preventing layers from disappearing after their animations finish.

## [0.7.0] — 2026-02-14

### Added
- `apps/showcase` — Interactive animation catalog with 19 examples across 8 categories:
  - **Shapes** (3): primitives, path drawing, animated corner radius
  - **Easing** (2): easing race (7 types side-by-side), bounce vs spring comparison
  - **Motion** (3): slide, spin (720deg), scale pulse
  - **Styles** (3): gradient reveal, animated stroke width, color cycling
  - **Composition** (2): staggered entrance, multi-phase choreography
  - **Presets** (2): fade-in preset, slide-up preset via `expandPreset()`
  - **Templates** (2): branded title card with variables, notification banner
  - **States** (2): intro/outro states, traffic light state machine
- Two themes: **Minimal** (monospace, monochrome) and **Branded** (Inter, red accent, glow effects)
- Theme toggle, sidebar navigation, play/pause/scrub controls, keyboard shortcuts
- All examples use consistent 600x400 canvas at 60fps

## [0.6.0] — 2026-02-14

### Added
- `@atelier/core` — State machine and template system:
  - `StateMachine` class: tick-based playback, state transitions with history, seek/reset, playThrough
  - `instantiateTemplate()`: deep substitution of `{{variableName}}` patterns with type preservation
  - `findTemplateVariables()`: scans document tree for template variable references
- `@atelier/mcp` — 2 new template tools (27 total):
  - `atelier_instantiate_template`: creates new document from template + bindings
  - `atelier_find_variables`: scans document for declared, referenced, and undeclared variables
- 28 new tests: 21 core (state machine + templates), 7 MCP (181 total across workspace)

## [0.5.0] — 2026-02-14

### Added
- `@atelier/cli` — CLI tool with 3 commands:
  - `atelier validate <file>` — schema validation + delta overlap detection
  - `atelier info <file>` — document summary (canvas, layers, states, presets)
  - `atelier still <file> --state <name> --frame <N>` — resolve frame to JSON
- `apps/playground` — Vite dev app with canvas playback:
  - Demo animation using DocumentBuilder (4 layers, 7 deltas, easing)
  - Player class with play/pause/seek/loop via requestAnimationFrame
  - Dark theme UI with scrubber, frame counter, and keyboard controls
- 13 new CLI tests (146 total across workspace)
- `packages/cli/.purpose` with 3 component symbols

## [0.4.0] — 2026-02-14

### Added
- `@atelier/mcp` — MCP server with 25 tools across 7 categories:
  - **Document** (5): `atelier_create`, `atelier_info`, `atelier_load`, `atelier_export`, `atelier_list`
  - **Layer** (5): `atelier_add_layer`, `atelier_edit_layer`, `atelier_remove_layer`, `atelier_list_layers`, `atelier_reorder`
  - **Shape** (3): `atelier_set_shape`, `atelier_set_fill`, `atelier_set_stroke`
  - **State** (4): `atelier_add_state`, `atelier_edit_state`, `atelier_remove_state`, `atelier_list_states`
  - **Delta** (4): `atelier_add_delta`, `atelier_edit_delta`, `atelier_remove_delta`, `atelier_apply_preset`
  - **Preset** (2): `atelier_define_preset`, `atelier_list_presets`
  - **Preview** (2): `atelier_validate`, `atelier_preview`
- In-memory `DocumentStore` for session-scoped animation accumulation
- Structured error responses with AI-readable Zod validation feedback
- StdioServerTransport for CLI usage as MCP server binary
- 43 new tests including full end-to-end workflow (136 total across workspace)
- `packages/mcp/.purpose` with 8 component symbols

## [0.3.0] — 2026-02-14

### Added
- `@atelier/canvas` — Canvas 2D renderer with 6 modules:
  - `renderFrame(ctx, resolvedFrame, doc)` — main entry, clears canvas, iterates layers (painters algorithm), applies transform stack
  - `renderShape()` — rect (with cornerRadius/roundRect fallback), ellipse, path (with bezier curves)
  - `renderText()` — text rendering with font string building and color
  - `buildEffectiveLayer()` — merges computed animation properties over layer defaults, resolves percentage units
  - `colorToCSS()` / `applyFill()` / `applyStroke()` — solid color + linear/radial gradient support, dash patterns
  - `RenderContext` interface — minimal Canvas 2D subset, avoids DOM lib dependency
- 13 new tests for canvas (93 total across workspace)
- `packages/canvas/.purpose` with 5 component symbols

## [0.2.0] — 2026-02-13

### Added
- `@atelier/core` — animation engine with 7 modules:
  - `resolveFrame(doc, stateName, frame)` — full frame resolution, computes all layer states
  - `resolveDeltaValue()` — per-property interpolation with easing
  - `resolveEasing()` — bridges type definitions to executable math functions
  - `DocumentBuilder` — fluent API for constructing documents with live validation
  - `validateNoOverlap()` / `validateAllDeltas()` — delta overlap detection (^no-overlap gate)
  - `resolveUnit()` — percentage-to-pixel conversion
  - `expandPreset()` — expands preset definitions into concrete deltas
- 35 new tests for core (80 total across workspace)

## [0.1.0] — 2026-02-13

### Added
- `@atelier/types` — 44 type definitions across 12 modules: document, layer, delta, state, preset, variable, asset, canvas, shapes, colors, easing, coordinates/units
- `@atelier/math` — pure interpolation engine: linear/cubic-bezier/ease-in-out/step easing, spring physics solver (underdamped/critically/overdamped), numeric lerp, color interpolation (RGB + HSL with shortest hue path)
- `@atelier/schema` — Zod validation schemas mirroring all types, `validateDocument()`/`validateLayer()`/`validateDelta()` with AI-readable errors, YAML parse (`parseAtelier`) and serialize (`serializeAtelier`) with roundtrip support
- Per-package `.purpose` files for types, math, schema
- Paradigm wisdom: decisions 001 (YAML format), 002 (external state management), 003 (no-overlap delta validation)

## [0.0.1] — 2026-02-13

### Added
- Monorepo scaffold with pnpm workspaces and Turborepo
- 7 packages: `@atelier/types`, `@atelier/math`, `@atelier/schema`, `@atelier/core`, `@atelier/canvas`, `@atelier/mcp`, `@atelier/cli`
- 1 app: `@atelier/playground` (Vite dev app)
- tsup build (ESM + CJS + DTS dual output) for all packages
- vitest test runner with placeholder tests
- TypeScript strict mode via shared `tsconfig.base.json`
- Paradigm framework configuration (`.paradigm/config.yaml`, root `.purpose`)
