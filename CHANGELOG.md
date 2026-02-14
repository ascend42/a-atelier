# Changelog

All notable changes to this project will be documented in this file.

Format: [major.minor.fix] — based on milestone progression.

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
