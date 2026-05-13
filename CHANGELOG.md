# Changelog

All notable changes to this project will be documented in this file.

Format: [major.minor.fix] — based on milestone progression.

## [0.32.0] — 2026-05-13

### Added
- **`atelier transcribe` — Whisper pipeline with editable transcripts** (T-006)
  - `TranscriptWord` is now editable: `detected` (immutable Whisper output) + `text` (user-overridable) + `userEdited`/`userAdded`/`hidden` flags + optional `confidence`
  - `VideoTranscript` bumped to version 1.1 with forward-only migration from 1.0 (flat `word: string` becomes `detected = text = word`)
  - `whisper.ts` lib: `probeWhisper` (whisper-cpp / openai-api / none), `runWhisperCpp` subprocess, `parseWhisperCppJson` (token-level word timing when available, even-split fallback, filters special tokens) — all via `child_process.spawn`
  - `transcript-model.ts` lib: pure functions `flattenWords`, `groupIntoPhrases` (3–5 word phrases on punctuation/pause), `mergeTranscriptWithExisting` (preserves user edits on words matching by start time ±0.3s AND detected text; re-inserts userAdded orphans), `applyTextEdit`, `applyBatchReplace`, `applyHide`, `applyAdd`, `applyMerge`, `applySplit`
  - `caption-builder.ts` lib: `buildCaptionLayers` (transcript → caption-tagged TextVisual + opacity fade deltas), `rewriteCaptionLayers` (drops only caption-tagged layers and their deltas from the default state; preserves silence-trim, overlay, and user-authored layers — the tag-namespace isolation invariant, now proven across both pipelines)
  - CLI commands:
    - `atelier transcribe <project>` — full pipeline with `--model`, `--language`, `--reset`, `--no-captions`, `--dry-run`, `--json`
    - `atelier transcript fix` — single-word or batch `--replace` editing
    - `atelier transcript add` / `delete` / `merge` / `split` — non-destructive edit operations, all set the appropriate flag
    - `atelier transcript list` — print indexed word list for reference
    - `atelier captions regenerate` — re-derive caption layers without re-running Whisper (recipe-swap path)
  - 33 new tests covering Whisper parser edge cases, all 8 transcript transforms, phrase grouping, mergeTranscriptWithExisting preservation invariants, caption layer generation, and the rewrite-preserves-overlays invariant
  - **One optional system binary** — whisper.cpp via subprocess (MIT, install via `brew install whisper-cpp`); no required npm dependencies

## [0.31.0] — 2026-05-13

### Added
- **`atelier trim` — silence-trim pipeline with parametric cuts** (T-007b)
  - `CutEntry` is now parametric: `rawStart`/`rawEnd` (immutable detected boundaries) + `paddingPre`/`paddingPost` (user-tunable seconds)
  - `effectiveSpan(cut, duration)` helper computes the clamped in/out span
  - `cuts.json` bumped to version 1.1 with forward-only migration from 1.0 (flat `{start, end}` becomes `{rawStart, rawEnd, paddingPre: 0, paddingPost: 0}` on read)
  - `rewriteCutLayers` rewrites only layers tagged `silence-trim`; user-authored or differently-tagged layers (captions, overlays) are preserved untouched — the **layer-tag isolation invariant**
  - `silence-detect.ts` lib: `probeSilencedetect`, `probeDuration` (via ffprobe), `runSilenceDetect`, `parseSilenceDetectStderr` — all via `child_process.spawn`, no new dependencies
  - `cut-model.ts` lib: pure functions for `invertToSpeechIntervals`, `buildInitialCuts`, `resolveOverlaps` (split at silence midpoint), `clampBoundaries`, `mergeWithExisting` (preserves user padding on raw-boundary match within 0.5s tolerance), `applyGlobalPadding` (floors at 0)
  - CLI: `atelier trim <project>` with `--noise`, `--min-silence`, `--pad-pre`, `--pad-post`, `--tighten <ms>`, `--loosen <ms>`, `--cut <idx>`, `--reset`, `--dry-run`, `--json`
  - Startup probe via `ffmpeg -filters` fails loud if silencedetect is missing from a custom build
  - 26 new tests covering the silencedetect parser, all five pure cut-model transforms, the migration path, and the rewrite-preserves-overlays invariant
  - **Zero new npm dependencies** — ffmpeg silencedetect via subprocess (same pattern as `render-pipeline.ts`)

## [0.30.0] — 2026-05-10

### Added
- **VideoProject folder structure** (T-004) — local-first video project convention for UGC editing
  - New types in `@a-company/atelier-types`: `CutEntry`, `VideoCutList`, `TranscriptWord`, `TranscriptSegment`, `VideoTranscript`, `VideoProjectManifest`
  - New `VideoProject` filesystem utilities in `@a-company/atelier` CLI: `createVideoProject`, `loadVideoProject`, `readCutList/writeCutList`, `readTranscript/writeTranscript`, `readComposition/writeComposition`
  - Project folder layout: `source.<ext>` / `project.atelier` / `transcript.json` / `cuts.json` / `export/`
  - `createVideoProject` is idempotent — safe to re-run on an existing folder without overwriting
  - Draft composition scaffolded with a single video layer pointing to `source.<ext>` (canvas dimensions and `videoMeta` filled by `atelier edit` at ingest time, T-005)

### Fixed
- **Workspace-wide audit pass** — restored strict typecheck across all packages and full `pnpm -r test` green
  - `packages/canvas`: fixed 3× TS6133 unused-variable errors in test file (replaced meaningless `expect(true).toBe(true)` with a real assertion against `drawCalls`; underscored two unused mock params)
  - `packages/video`: added 8 smoke tests covering `FfmpegEncoder` option defaults, pre-T-003 throw behavior, `WebCodecsVideoProvider.isSupported()`, and dispose safety — `vitest run` no longer exits 1 on the package
  - Dogfooded `atelier lint` against valid and invalid fixtures — confirms correct PASS/FAIL output and exit codes after the 0.29.0 launch

## [0.29.0] — 2026-05-07

### Added
- **`VideoVisual` layer type** — first-class video layer across the full stack
  - `VideoVisual` added to the `Visual` discriminated union with `startFrame`, `sourceOffset`, `sourceEnd`, `playbackRate`, `volume`, `muted`, `objectFit`
  - `"video"` added to `AssetType`; `videoMeta` (duration/fps/width/height) added to `Asset`
  - `VideoVisualSchema` exported from `@a-company/atelier-schema`
  - `videoSourceTime` computed on `ResolvedLayer` in `@a-company/atelier-core` — accounts for `startFrame`, `playbackRate`, `sourceOffset`, and `sourceEnd` clamping
  - `VideoFrameProvider` injectable callback type in `@a-company/atelier-canvas`; `videoFrameProvider` option in `RenderOptions` — supports both preview (HTMLVideoElement) and export (WebCodecs/Mediabunny) backends without coupling to DOM globals
  - New `video-renderer.ts` in `@a-company/atelier-canvas` — follows `image-renderer` injection pattern
- **`validateVideoLayer`** — semantic gate (`^valid-video-layer`) exported from `@a-company/atelier-schema`; enforces `sourceEnd > sourceOffset` and `sourceEnd ≤ videoMeta.duration`
- **`atelier lint`** CLI command — runs all named gates (`^valid-document`, `^valid-delta`, `^valid-video-layer`) across one or more files with gate-grouped output; `--json` flag for CI pipelines

## [0.28.2] — 2026-03-03

### Fixed
- MP4 export now tries H.264 High Profile (Level 5.1/4.2/4.0) before falling back to Baseline 3.1 — fixes `codec not supported` error for 1080p@60fps documents

## [0.28.1] — 2026-03-03

### Fixed
- `atelier --version` now reads from package.json instead of hardcoded `0.1.0`
- Export All batch export now logs errors to browser console for debugging

## [0.28.0] — 2026-03-03

### Added
- **Export filename** — single-file export now uses the loaded file's name (e.g., `the-brain.gif`) instead of hardcoded `animation.gif`
  - `AtelierStudio.setFilename(name)` public API added
  - `ExportDialog.show()` accepts optional `filename` parameter
- **Export All** — batch-export every `.atelier` file from the sidebar in one click
  - Format picker (GIF / MP4 / WebM) in sidebar footer
  - Iterates all files, renders each to offscreen canvas, saves output alongside source file
  - Progress overlay with per-file and overall progress
- **`POST /api/export`** — new binary write endpoint for saving export output to disk
- `ImageCache` re-exported from `@a-company/atelier-studio` for standalone rendering use

## [0.27.4] — 2026-03-03

### Fixed
- CLI `atelier studio` — removed stale `resolve.alias` paths that broke global npm install (was looking for `@a-company/studio/src/index.ts` instead of `@a-company/atelier-studio`)

## [0.25.2] — 2026-03-03

### Fixed
- `@a-company/atelier-types` — added `"linear"` to `EasingPreset` string union (was only accepted as `{ type: "linear" }` object form)
- `@a-company/atelier-schema` — added `"linear"` to `EasingPresetSchema` enum
- `@a-company/atelier-core` — added explicit `"linear"` case in easing resolver string switch
- `@a-company/atelier-core` — overlap validator now allows boundary-touching delta ranges (e.g., `[0-50]` + `[50-90]`); changed from inclusive to strict inequality
- `@a-company/atelier-studio` — version bump to pick up fixed schema/core/types deps

## [0.27.3] — 2026-03-03

### Fixed
- `atelier studio` — replaced hardcoded monorepo alias paths with node_modules symlink into temp dir; now works for both npm global install and monorepo development
- Disabled Vite `server.fs.strict` so the dev server can follow symlinks to package sources

## [0.27.2] — 2026-03-03

### Fixed
- `@a-company/atelier-studio` dependency changed from `workspace:*` to `>=0.25.1` so npm global install works

## [0.27.1] — 2026-03-03

### Fixed
- `atelier studio` — Vite pre-transform error on macOS ("Failed to load url /main.ts") caused by `/var` → `/private/var` symlink mismatch; temp directory now uses `realpathSync` for canonical path
- `atelier studio` — added `server.fs.allow` so Vite can access workspace packages from the temp directory root

## [0.27.0] — 2026-03-03

### Added
- **`atelier studio` CLI command** — launch the browser-based AtelierStudio editor from any directory with `.atelier` files
  - Vite dev server with HMR, serving an inline app with the `AtelierStudio` widget
  - File sidebar grouped by folder, auto-discovers all `.atelier` files recursively
  - REST API middleware: `GET /api/files`, `GET /api/file`, `POST /api/file`, `GET /api/cwd`
  - Auto-save with 800ms debounce and save status indicator
  - Path traversal protection on file API
  - `--port` option (default 4321), `--no-open` to skip browser launch
  - Accepts optional `[file]` argument to open a specific file on launch

### Changed
- `@a-company/atelier` CLI now depends on `vite` and `@a-company/atelier-studio` at runtime (for the studio command)
- `vite` externalized in tsup config to avoid bundling

## [0.26.1] — 2026-02-23

### Changed
- **All 10 subpackages published to npm under `@a-company` scope** — previously private `@atelier/*`, now public:
  - `@a-company/atelier-types` — TypeScript type definitions
  - `@a-company/atelier-math` — Interpolation engine (easing, lerp, spring, color)
  - `@a-company/atelier-schema` — Zod validation schemas
  - `@a-company/atelier-core` — Animation engine (delta resolution, builder API)
  - `@a-company/atelier-canvas` — Canvas 2D renderer and playback controller
  - `@a-company/atelier-studio` — Reusable editor widget
  - `@a-company/atelier-svg` — SVG renderer
  - `@a-company/atelier-lottie` — Lottie JSON exporter
  - `@a-company/atelier-react` — React integration (Animation component and hooks)
  - `@a-company/atelier-mcp` — MCP server for AI authoring
- Renamed all internal imports from `@atelier/*` to `@a-company/atelier-*`
- All subpackages versioned at `0.25.1` to match CLI release
- Added `publishConfig: { "access": "public" }` to all subpackages

## [0.26.0] — 2026-02-22

### Added
- **Spritesheet animation** — grid-based sprite atlas support for image layers
  - `SpritesheetConfig` on `ImageVisual` (columns, rows, frameCount, frameWidth, frameHeight)
  - `frameIndex` animatable property on image layers with step-easing for cell snapping
  - Canvas: 9-arg `drawImage` source-rect calculation from grid coordinates
  - SVG: nested `<svg viewBox>` with full sheet dimensions for correct cropping
  - `@atelier/schema` validation for spritesheet config (positive ints, required dimensions)
- **Source-rect cropping** — viewport cropping for texture atlases and camera pans
  - `sourceRect` on `ImageVisual` (x, y, width, height)
  - All four sourceRect fields independently animatable (`visual.image.sourceRect.x/y/width/height`)
  - Canvas: 9-arg `drawImage` with sourceRect coordinates
  - SVG: nested `<svg viewBox>` crop
- **Animatable visibility** — frame-precise show/hide via boolean midpoint snapping
  - `visible` property on layers with boolean delta support
  - Canvas: invisible layers skipped in render loop
  - SVG: invisible layers omitted from output
- **Image tinting** — color overlay via multiply compositing
  - `tint` property on layers (`{ color: string; amount: number }`)
  - Both `tint.color` (RGBA lerp) and `tint.amount` (linear lerp) are animatable
  - Canvas: offscreen multiply pipeline with `destination-in` alpha clipping
  - SVG: `<filter>` with `feFlood` + `feBlend mode="multiply"`
  - `atelier_set_tint` MCP tool for setting/removing tint
- **Ref layer sub-document composition** — embed one `.atelier` document inside another
  - `DocumentResolver` callback API: `(src: string) => AtelierDocument | undefined`
  - `RenderOptions` interface with `imageCache`, `documentResolver`, `maxRefDepth` (backward-compatible with old `imageCache?` arg)
  - `RefVisual` extended with `state?` and `frame?` fields
  - Canvas: recursive sub-document rendering with context scaling
  - SVG: nested `<svg>` elements with viewBox scaling
  - Cycle detection via visited-ref Set; max depth limiting (default 4)
  - Lottie: warns on ref/spritesheet/sourceRect/tint features (no native equivalent)
- 8 new animatable properties (27→35 total): `visual.image.sourceRect.x/y/width/height`, `visual.image.frameIndex`, `visible`, `tint.color`, `tint.amount`
- ~60 new tests across all 5 packages (core, canvas, svg, schema, mcp)
- Handoff doc for Pretend integration at `a-pretend/docs/ATELIER-INTEGRATION.md`

### Fixed
- Boolean interpolation now snaps at `t >= 0.5` (midpoint) instead of `t >= 1` (end), enabling frame-precise visibility control
- SVG spritesheet viewBox now uses full sheet pixel dimensions (`columns * frameWidth` × `rows * frameHeight`) instead of destination `eff.width/height`

## [0.25.1] — 2026-02-21

### Fixed
- 3 `.purpose` files with YAML syntax errors — `#`-prefixed component IDs in `packages/schema`, `packages/types`, and `packages/math` were parsed as YAML comments; now properly quoted
- 2 unregistered components in `packages/core/.purpose` — `state-machine` and `template-resolver` now use `#` prefix convention
- Root `.purpose` — MCP tool count updated from 27 to 52, CLI commands from 4 to 9, type count from 48 to 60+

### Added
- `packages/svg/.purpose` — 7 components (#svg-renderer, #svg-shapes, #svg-text, #svg-gradients, #svg-filters, #svg-clip, #svg-properties)
- `packages/lottie/.purpose` — 8 components (#lottie-exporter, #lottie-types, #lottie-map-layers, #lottie-map-shapes, #lottie-map-keyframes, #lottie-map-colors, #lottie-map-easing, #lottie-warnings)
- `packages/types/.purpose` — 6 missing type components (#shadow-types, #audio-types, #asset-types, #variable-types, #interaction-types, #preset-types)
- `packages/core/.purpose` — 2 missing engine components (#expression-evaluator, #audio-timing)
- Paradigm symbol count: 74 → 129 (125 components, 3 gates, 1 flow) across 11 .purpose files

## [0.25.0] — 2026-02-21

### Added
- `@atelier/mcp` — 4 new MCP tools (48→52 total) for performance analysis:
  - `atelier_profile` — profile frame resolution with timing breakdown, layer/delta/expression counts
  - `atelier_diff_frames` — compare two frames and return only changed properties per layer
  - `atelier_batch_preview` — resolve multiple frames at once (max 60) with aggregate timing
  - `atelier_complexity` — analyze document complexity: layers, deltas, expressions, interactions, hierarchy depth, animated properties
- ~11 new MCP tests (profile/diff/batch/complexity with timing, hierarchy, interactions)

## [0.24.0] — 2026-02-21

### Added
- `@atelier/mcp` — 2 new MCP tools (46→48 total) for composition/nesting:
  - `atelier_set_ref` — set the source reference on a ref-type layer (file path, URL, or in-memory document ID) with self-reference prevention
  - `atelier_resolve_refs` — check which ref layers resolve to valid in-memory documents with target info
- ~8 new MCP tests (ref set/resolve with in-memory resolution, self-reference prevention, error cases)

## [0.23.0] — 2026-02-21

### Added
- `@atelier/types` — `Interaction` type system: `Trigger` (click, hover, pointerdown, pointerup, timer, signal), `Action` (go-to-state, emit-signal, set-variable, toggle-visibility), `Interaction` interface with id/trigger/action/description
- `@atelier/types` — `interactions?: Interaction[]` on Layer interface
- `@atelier/schema` — `TriggerSchema`, `ActionSchema`, `InteractionSchema` with contextual validation (timer requires delay, signal requires signal name, go-to-state requires state, set-variable requires variable+value)
- `@atelier/schema` — `interactions` field on `LayerSchema`
- `@atelier/mcp` — 3 new MCP tools (43→46 total) for interaction management:
  - `atelier_add_interaction` — add a trigger-action binding to a layer with validation (state exists, target layer exists, timer has delay)
  - `atelier_list_interactions` — list all interactions across all layers or filtered by layer
  - `atelier_remove_interaction` — remove an interaction from a layer
- ~11 new MCP tests (interaction add/list/remove with validation)

## [0.22.0] — 2026-02-21

### Added
- `@atelier/mcp` — 3 new MCP tools (40→43 total) for variable management:
  - `atelier_add_variable` — define a template variable on a document
  - `atelier_list_variables` — list all variables with usage info (referenced vs unused, undeclared references)
  - `atelier_remove_variable` — remove a variable with warnings if still referenced
- `@a-company/atelier` — 1 new CLI command:
  - `atelier variables <file>` — list all variables in an .atelier file with usage info
- ~10 new MCP tests (variable add/list/remove with usage tracking)

## [0.21.0] — 2026-02-21

### Added
- `@atelier/mcp` — 3 new MCP tools (37→40 total) for asset management:
  - `atelier_add_asset` — register an external asset (image, SVG, font, animation, audio) on a document
  - `atelier_list_assets` — list all assets with usage info (which layers/states reference them)
  - `atelier_remove_asset` — remove an asset with warnings if still referenced by layers or state audio
- `@a-company/atelier` — 1 new CLI command:
  - `atelier assets <file>` — list all assets in an .atelier file with usage info
- ~9 new MCP tests (asset add/list/remove with usage tracking)

## [0.20.0] — 2026-02-21

### Added
- `@atelier/mcp` — 10 new MCP tools (27→37 total) for MCP + CLI parity with M7/M8 engine capabilities:
  - **Layer Effects** (5): `atelier_set_blend_mode` (16 blend modes + null clear), `atelier_set_shadow` (color/blur/offset + null remove), `atelier_set_motion_path` (path points/autoRotate + null remove), `atelier_set_clip_path` (rect/ellipse/path + null remove), `atelier_edit_visual` (edit text content/style, image src/assetId, shape/fill/stroke post-creation with type validation)
  - **State Config** (3): `atelier_set_audio` (audio track on state + null remove), `atelier_configure_transition` (state-to-state transitions with easing + null remove, validates target exists, rejects self-transition), `atelier_set_state_parent` (hierarchical state inheritance with cycle detection + null clear)
  - **Export** (2): `atelier_export_svg` (frame→SVG string via `@atelier/svg`), `atelier_export_lottie` (document→Lottie JSON via `@atelier/lottie` with warnings)
- `@a-company/atelier` — 2 new CLI commands:
  - `atelier export-svg <file>` — export a frame as SVG (`-s/--state`, `-f/--frame`, `-o/--output`, `--xml-declaration`)
  - `atelier export-lottie <file>` — export to Lottie JSON (`-s/--state`, `-o/--output`, warnings to stderr)
- `@a-company/atelier` — `atelier still` now supports `--format png` with `-o/--output` for PNG rendering via node-canvas (JSON remains default)
- ~28 new MCP tests (layer effects, state config, export tools, tool listing)
- ~6 new CLI tests (SVG export, Lottie export)

### Changed
- `@atelier/mcp` — `@atelier/svg` and `@atelier/lottie` added as dependencies
- `@a-company/atelier` — `@atelier/svg` and `@atelier/lottie` added as devDependencies

## [0.19.0] — 2026-02-20

### Added
- `@atelier/types` — `parent?: string` on State interface: enables hierarchical state inheritance where child states inherit deltas from parent states (child overrides win on same layer+property)
- `@atelier/types` — `StateTransitionConfig` interface: `duration` (frames) + `easing` for smooth crossfade transitions between states
- `@atelier/types` — `transitions?: Record<string, StateTransitionConfig>` on State interface
- `@atelier/schema` — `StateTransitionConfigSchema` validation; `parent` and `transitions` fields on `StateSchema`
- `@atelier/core` — Hierarchical state resolution: `resolveAncestorChain()` walks parent chain (with cycle detection), `collectDeltas()` merges ancestor deltas (child wins per layer+property)
- `@atelier/core` — State transition interpolation: `transitionTo()` with duration/easing, `isTransitioning()`, `getTransitionProgress()` for smooth crossfade blending
- `@atelier/core` — `blendResolvedFrames()`: frame-level blending for state transitions — lerps numeric properties, color-lerps hex values, snaps discrete values at t >= 0.5, fades in/out layers unique to source/target
- `@atelier/core` — Frame resolver accepts optional `overrideDeltas` parameter for hierarchical state resolution
- `@atelier/svg` — New package: SVG renderer for static frame export (thumbnails, SSR, static export)
  - `renderFrameSVG(doc, state, frame, opts?)` → SVG string with full visual fidelity
  - Shape mapping: rect→`<rect>` (with rounded corners), ellipse→`<ellipse>`, path→`<path>` (with bezier curves)
  - Fill/stroke rendering, linear/radial gradient `<defs>`, shadow `<filter>` (feDropShadow)
  - Clip path support, blend modes via CSS `mix-blend-mode`, image/text layers
  - Transform stack: translate, rotate, scale with anchor point support
  - Options: `xmlDeclaration`, `viewBox`, `indent` control
- `@atelier/lottie` — New package: Lottie JSON exporter (lossy, best-effort)
  - `exportToLottie(doc, opts?)` → `{ json: LottieAnimation; warnings: string[] }`
  - Full mapping: rect, ellipse, path shapes; solid/gradient fills; stroke; position/opacity/rotation animation
  - Easing mapping: linear, cubic-bezier (exact), presets (mapped), spring (approximated as cubic-bezier), step (hold keyframes)
  - Color mapping: hex/RGBA/HSLA → Lottie [r,g,b,a] 0–1 arrays
  - Text layer support (basic), image layer with asset references, blend mode mapping
  - Warnings for unsupported features: audio (dropped), expressions (dropped), shadows (dropped), motion paths, clip paths (partial)
- `@atelier/react` — New package: React integration for embedding Atelier animations
  - `<Animation>` component: renders to canvas with autoplay, loop, width/height, callbacks (onFrame, onComplete)
  - `useAnimation()` hook: play/pause/seek controls, currentFrame/isPlaying state, canvas ref binding
  - `useAnimationState()` hook: state machine controls for multi-state animations
  - `AnimationPlayer` class: requestAnimationFrame loop with frame timing, play/pause/seek/loop
  - Peer dependencies: React >= 18
- 22 new tests for hierarchical states and state transitions (core package)
- 26 new tests for SVG renderer
- 37 new tests for Lottie exporter
- 15 new tests for React integration (happy-dom + @testing-library/react)
- `examples/hierarchical-states.atelier` — Three-level state inheritance (idle → hover → active) with scale/opacity overrides
- `examples/state-transitions.atelier` — Day/night scene with smooth crossfade transition using cubic-bezier easing

## [0.18.0] — 2026-02-20

### Added
- `@atelier/types` — `BlendMode` type (16 Canvas 2D composite operations: multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion, hue, saturation, color, luminosity)
- `@atelier/types` — `MotionPath` interface: path-based position animation with `points`, `closed`, `autoRotate`, `autoRotateOffset`
- `@atelier/types` — `motionPath.progress` animatable property (0–1, drives position along a motion path)
- `@atelier/types` — `clipPath?: Shape` on Layer — restricts rendering to within a shape (rect, ellipse, path)
- `@atelier/types` — 4 gradient animation properties: `visual.fill.angle`, `visual.fill.center.x`, `visual.fill.center.y`, `visual.fill.radius`
- `@atelier/math` — `evaluatePathAtProgress()`: arc-length parameterized path interpolation with tangent angle computation, cubic bezier segment evaluation, multi-segment support
- `@atelier/schema` — `BlendModeSchema`, `MotionPathSchema` validation schemas; `clipPath` on `LayerSchema`; all new animatable properties in `AnimatablePropertySchema`
- `@atelier/canvas` — Blend mode rendering via `ctx.globalCompositeOperation`; motion path position override and auto-rotation in `buildEffectiveLayer`
- `@atelier/canvas` — Clip path rendering: `applyClipPath()` supports rect (with rounded corners), ellipse, and bezier path clipping via `ctx.clip()`
- `@atelier/canvas` — Gradient animation: animated `angle` on linear gradients, animated `center.x`/`center.y`/`radius` on radial gradients
- `@atelier/canvas` — `globalCompositeOperation` and `clip()` added to `RenderContext` interface
- `@atelier/mcp` — All new animatable properties in delta and preset `AnimatablePropertyEnum`
- `examples/blend-modes.atelier` — Overlapping circles with multiply/screen blend modes
- `examples/motion-path.atelier` — Circle following a figure-eight bezier curve with auto-rotate
- `examples/clip-path.atelier` — Gradient rectangle clipped to ellipse with rotating angle
- `examples/gradient-animation.atelier` — Radial gradient with animated center and radius
- `@atelier/core` — Expression evaluator: safe recursive descent parser (no `eval()`), supports arithmetic (`+ - * / % **`), math functions (`sin cos abs floor ceil round sqrt min max pow clamp`), constants (`pi tau e`), context variables (`t progress frame duration`), comparisons (`< > <= >= == !=`), ternary (`cond ? a : b`)
- `@atelier/core` — Expression integration: `{ expr: "..." }` object form in delta `from`/`to` values, evaluated per-frame with animation context
- `examples/expression-wobble.atelier` — Sine/cosine oscillation using expression-driven position and scale
- `@atelier/types` — `Audio` interface: `src`, `offset`, `volume`, `loop`, `startFrame` for audio tracks on states
- `@atelier/types` — `audio` asset type added to `AssetType` union
- `@atelier/types` — `audio?: Audio` field on `State` interface
- `@atelier/schema` — `AudioSchema` validation (src required, volume 0–1, non-negative offset/startFrame)
- `@atelier/schema` — `"audio"` added to `AssetTypeSchema`
- `@atelier/core` — Audio timing utilities: `frameToTime()`, `timeToFrame()`, `computeAudioState()` (playback state at any frame), `computeAudioCues()` (start/end/loop cue points)
- `examples/audio-sync.atelier` — Pulsing circle synchronized to a looping beat track
- 8 new tests for path interpolation (math package): start/end/midpoint, tangent angles, bezier curves, multi-segment, clamping
- 21 new tests for expression evaluator (core package): arithmetic, precedence, power, unary, variables, constants, functions, comparisons, ternary, error handling, delta integration
- `@atelier/studio` — Easing curve editor: visual canvas-based easing curve graph with interactive cubic-bezier control point dragging
- `@atelier/studio` — Easing picker upgrade: shows curve preview for all easing types, parameter inputs for cubic-bezier (x1/y1/x2/y2), spring (mass/stiffness/damping), and step (steps/position)
- 12 new tests for audio timing (core package): frameToTime, timeToFrame, computeAudioState (basic, offset, volume, delayed start, loop, end), computeAudioCues

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
