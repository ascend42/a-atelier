---
title: Design Decisions
scope: Architectural decision records for the Atelier project
packages: ["all"]
related: ["docs/architecture.md", "docs/format-spec.md"]
---

# Design Decisions

This document records the key architectural decisions made during the design and implementation of the Atelier animation engine. Each entry follows the ADR (Architectural Decision Record) format: context, decision, rationale, and consequences.

Decisions are numbered sequentially. New decisions are appended; superseded decisions are marked but never deleted, preserving the full decision history.


## ADR-001: YAML as Primary Format

- **Status**: Accepted
- **Date**: Project inception

### Context

The Atelier engine needs a file format for defining animations. The format must be readable and writable by both humans and AI models, support comments for documentation, and have mature tooling in the Node.js ecosystem. Options considered:

1. **JSON** -- universal support, but no comments, verbose syntax (quoted keys, trailing comma issues).
2. **YAML** -- human-readable, supports comments, superset of JSON.
3. **Custom DSL** -- maximum expressiveness, but requires building a parser, no AI training data.
4. **Binary format** -- compact and fast, but opaque to humans and AI.

### Decision

Use YAML as the primary format with the `.atelier` file extension. JSON is also accepted as input since YAML is a superset of JSON. Parsing and serialization are handled by the `yaml` npm package via `parseAtelier()` and `serializeAtelier()` in `packages/schema/src/parse.ts`.

### Rationale

- YAML is more readable than JSON for hierarchical animation data: no quotes on keys, inline comments, and multi-line strings.
- AI models handle YAML well -- it appears extensively in training data (Kubernetes manifests, CI configs, Ansible playbooks).
- The YAML superset property means any valid JSON document is also valid YAML, so consumers can use whichever they prefer.
- The `yaml` npm package provides robust parsing with good error messages, which matters for validation feedback.

### Consequences

- **Positive**: Human readable, AI readable, comments allowed for inline documentation, familiar to most developers.
- **Negative**: YAML has well-known gotchas -- indentation sensitivity, implicit type coercion (`yes` becomes `true`, `3.10` becomes `3.1`), and percentage strings like `50%` must be quoted. YAML parsing is slightly slower than `JSON.parse()`, though this is negligible for document-sized inputs.

### Source

`packages/schema/src/parse.ts` -- `parseAtelier()`, `serializeAtelier()`


---


## ADR-002: External State Management

- **Status**: Accepted
- **Date**: M2 (core engine)

### Context

The animation engine resolves visual state at a given frame. The question is whether the engine should manage playback state (current frame, play/pause, playback direction) internally, or whether consumers should own that responsibility. Options:

1. **Internal state**: Engine maintains a frame counter, tick loop, and play/pause controls.
2. **External state**: Engine is a pure function pipeline. Consumers manage playback.

### Decision

The engine core is stateless. The primary entry point is `resolveFrame(doc, stateName, frame)` -- a pure function that takes an `AtelierDocument`, a state name, and a frame number, and returns a `ResolvedFrame` with all computed property values. No internal frame counter, no tick loop, no side effects.

For consumers who want managed playback, the `StateMachine` class (`packages/core/src/state/state-machine.ts`) provides an opt-in wrapper with `tick()`, `seek()`, `transition()`, and `playThrough()` methods. The playground app provides a `Player` class that connects `StateMachine` to a `requestAnimationFrame` loop.

### Rationale

- Pure functions are easier to test. Testing `resolveFrame()` requires no setup or teardown -- pass inputs, assert outputs.
- Pure functions are easier to debug. The output at any frame is fully determined by the inputs; no hidden state.
- Different consumers have different playback needs. A browser app uses `requestAnimationFrame`. A CLI rendering to PNG calls `resolveFrame()` once. A server rendering to video calls it in a loop. An MCP preview tool resolves a single frame on demand. A stateful engine would impose one model on all of them.
- The `StateMachine` class is a thin wrapper (122 lines) that adds state tracking without polluting the core pipeline.

### Consequences

- **Positive**: Pure function pipeline, trivially testable, no side effects in core, framework-agnostic, composable with any rendering backend.
- **Negative**: Consumers must build their own playback loop. This is mitigated by the `StateMachine` class in core and the `Player` class in the playground, which serve as reference implementations.

### Source

`packages/core/src/resolver/frame-resolver.ts` -- `resolveFrame()`
`packages/core/src/state/state-machine.ts` -- `StateMachine`


---


## ADR-003: No-Overlap Delta Validation

- **Status**: Accepted
- **Date**: M2 (core engine)

### Context

A delta animates a single property on a single layer across a frame range. What happens when two deltas target the same layer+property with overlapping frame ranges? Options:

1. **Last-wins**: The delta defined later in the array takes precedence.
2. **Blending/mixing**: Interpolate between the two deltas' outputs (additive animation).
3. **Error**: Reject overlapping deltas at validation time.

### Decision

Overlapping deltas on the same layer+property within the same state are a validation error. The `validateNoOverlap()` function in `packages/core/src/validation/overlap-validator.ts` checks for this condition. The `DocumentBuilder.addDelta()` method invokes this check and throws on violation. Two ranges `[a0, a1]` and `[b0, b1]` overlap when `a0 <= b1 && b0 <= a1`.

### Rationale

- Overlapping deltas create ambiguity. If two deltas both animate `opacity` on the same layer from frame 10 to 20, which output value is correct? Any resolution rule (last-wins, average, additive) requires the author to understand that rule, which makes the format harder to reason about.
- Blending adds significant complexity: you need a blending mode system, weight controls, and the interpolation logic becomes non-trivial. This complexity is not justified for the declarative, AI-authored use case.
- Explicit sequencing -- non-overlapping ranges -- is clearer, deterministic, and easy to validate. An author who wants an opacity pulse from 1.0 to 0.5 and back writes two sequential deltas: `[0, 30]` from 1.0 to 0.5 and `[31, 60]` from 0.5 to 1.0.

### Consequences

- **Positive**: Deterministic animation output, clear mental model for authoring, catches errors early at build time rather than producing surprising visual results.
- **Negative**: Cannot do additive blending (e.g., two independent forces on the same property). Authors must merge overlapping intentions into sequential, non-overlapping ranges. This is a deliberate simplicity trade-off.

### Source

`packages/core/src/validation/overlap-validator.ts` -- `validateNoOverlap()`, `validateAllDeltas()`, `rangesOverlap()`
`packages/core/src/builder/document-builder.ts` -- `addDelta()` calls `validateNoOverlap()` on every insertion


---


## ADR-004: MCP-First AI Integration

- **Status**: Accepted
- **Date**: M4 (MCP server)

### Context

Atelier is designed for AI-first authoring. AI agents need a reliable way to create and modify animation documents. Options:

1. **Generate code directly**: AI writes TypeScript that calls the builder API.
2. **Generate YAML**: AI outputs raw YAML strings that are parsed.
3. **Structured tools (MCP)**: AI calls typed tool functions with validated parameters.

### Decision

Provide a Model Context Protocol (MCP) server (`@atelier/mcp`) with 27 typed tools across 8 tool groups. AI agents call tools like `atelier_create`, `atelier_add_layer`, `atelier_add_delta`, and `atelier_preview`. All tool inputs are validated by Zod schemas. An in-memory `DocumentStore` accumulates changes across multiple tool calls within a session.

The 8 tool groups are:
- **document** (5 tools): `atelier_create`, `atelier_info`, `atelier_load`, `atelier_export`, `atelier_list`
- **layers** (5 tools): `atelier_add_layer`, `atelier_edit_layer`, `atelier_remove_layer`, `atelier_list_layers`, `atelier_reorder`
- **shapes** (3 tools): `atelier_set_shape`, `atelier_set_fill`, `atelier_set_stroke`
- **states** (4 tools): `atelier_add_state`, `atelier_edit_state`, `atelier_remove_state`, `atelier_list_states`
- **deltas** (4 tools): `atelier_add_delta`, `atelier_edit_delta`, `atelier_remove_delta`, `atelier_apply_preset`
- **presets** (2 tools): `atelier_define_preset`, `atelier_list_presets`
- **preview** (2 tools): `atelier_validate`, `atelier_preview`
- **templates** (2 tools): `atelier_instantiate_template`, `atelier_find_variables`

### Rationale

- MCP provides structured, validated tool calls. Every input is checked by a Zod schema before execution, catching errors before they produce invalid documents.
- No string parsing is needed. The AI never outputs raw YAML or code that must be parsed and evaluated. Each tool call is a typed function invocation with explicit parameters.
- The `DocumentStore` enables an accumulative workflow: the AI creates a document, adds layers one at a time, adds deltas, previews the result, and iterates -- all within a single conversation session.
- Error messages from validation failures are structured and AI-readable, enabling the model to self-correct.

### Consequences

- **Positive**: Type-safe AI interaction, validation at every step, accumulative multi-turn workflow, no string parsing or code execution, clear error feedback.
- **Negative**: Requires an MCP-compatible client (Claude Desktop, Claude Code, etc.). The 27-tool surface area is large, though the grouping into 8 categories keeps it navigable.

### Source

`packages/mcp/src/index.ts` -- `createServer()`, tool registration
`packages/mcp/src/store.ts` -- `DocumentStore`
`packages/mcp/src/tools/` -- 8 tool modules


---


## ADR-005: Frame-Based Animation (Not Time-Based)

- **Status**: Accepted
- **Date**: Project inception

### Context

Animation timing can be expressed in two ways:

1. **Time-based**: Positions are specified in milliseconds or seconds (e.g., "move from 0ms to 500ms").
2. **Frame-based**: Positions are specified as frame indices (e.g., "move from frame 0 to frame 30").

### Decision

All timing in Atelier is frame-based. The `Canvas` type includes an `fps` field that maps frames to real time. Delta ranges are `FrameRange` tuples `[startFrame, endFrame]` with inclusive, 0-based integer indices. State durations are specified in frames. A state with `duration: 120` at `fps: 60` runs for 2 seconds.

### Rationale

- Frame-based timing is deterministic. `resolveFrame(doc, "idle", 15)` always produces the same output regardless of real-time playback speed, system load, or display refresh rate.
- Frame-based is easier to test. Pass an integer, get a result. No floating-point timing comparisons, no epsilon tolerances.
- Programmatic use is simpler. Iterating frames 0 through 119 is a basic `for` loop. There is no need to reason about frame boundaries or sub-frame interpolation.
- Time-to-frame conversion is trivial when needed: `frame = Math.floor(elapsedSeconds * fps)`. The `fps` field on the canvas provides the conversion factor.

### Consequences

- **Positive**: Deterministic output, easy to test, no floating-point timing issues, simple iteration.
- **Negative**: Real-time playback consumers must convert clock time to frame indices. This conversion is a single multiplication and floor operation, so the cost is negligible.

### Source

`packages/types/src/delta.ts` -- `FrameRange = [number, number]`
`packages/types/src/document.ts` -- `Canvas.fps`
`packages/types/src/state.ts` -- `State.duration` (in frames)


---


## ADR-006: Painters Algorithm for Layer Ordering

- **Status**: Accepted
- **Date**: M3 (canvas renderer)

### Context

When rendering multiple layers, their visual stacking order must be defined. Options:

1. **Explicit z-index**: Each layer has a `z` property; higher values render on top.
2. **Array order (painters algorithm)**: Layers are drawn in array order; later entries cover earlier ones.

### Decision

Layers are rendered in array order. The first layer in the `layers` array is drawn first (bottom of the visual stack); the last layer is drawn last (top of the stack). There is no z-index property. Reordering is accomplished by reordering the array. The MCP server provides an `atelier_reorder` tool for this purpose.

### Rationale

- Simple and predictable. The visual stacking order is the array order -- no mental mapping between z-index values and visual position.
- Matches how most design tools (Figma, Sketch) present layers: the list order is the draw order.
- Z-index introduces complexity: stacking contexts, tie-breaking rules, potential for non-contiguous index values that are hard to reason about.
- Array reordering is a well-understood operation. Moving a layer up or down is a splice and insert.

### Consequences

- **Positive**: Simple mental model, predictable rendering, easy reordering via array manipulation, no stacking context bugs.
- **Negative**: Cannot animate z-ordering without reordering the layers array between frames. For the declarative, state-based model this is acceptable -- z-order changes would be expressed as different states with different layer orderings.

### Source

`packages/types/src/document.ts` -- `AtelierDocument.layers: Layer[]` (ordered array)
`packages/core/src/resolver/frame-resolver.ts` -- `resolveFrame()` iterates `doc.layers` in order
`packages/mcp/src/tools/layers.ts` -- `atelier_reorder` tool


---


## ADR-007: Hold-After-End Behavior

- **Status**: Accepted (fixed in v0.7.1)
- **Date**: M2 (core engine), bug fix in v0.7.1

### Context

A delta animates a property from frame `start` to frame `end`. After frame `end`, what value does the property have? Options:

1. **Revert**: Property snaps back to its original layer value.
2. **Hold**: Property stays at the delta's `to` value for all subsequent frames.
3. **Configurable**: Per-delta `fillMode` option (like CSS `animation-fill-mode`).

### Decision

Hold the `to` value. Once a delta's frame range ends, its target value persists for all subsequent frames within the same state, until another delta for that layer+property begins. This is implemented in `resolvePropertyAtFrame()`: when no delta is active at a given frame, the resolver finds the most recently completed delta (the one whose `range[1]` is the largest value still less than the current frame) and returns its `to` value.

The initial implementation had a bug where the value reverted to `undefined` after a delta ended. This was fixed in v0.7.1 (commit `6d4e37d`).

### Rationale

- Matches CSS `animation-fill-mode: forwards` behavior and user expectations. When an element fades in (opacity 0 to 1 over frames 0-30), users expect it to remain visible after frame 30, not snap back to invisible.
- Without hold, intro sequences and state transitions break. An intro that moves a title into position would see the title jump back after the animation completes.
- A configurable `fillMode` per delta adds complexity with marginal benefit. The hold behavior is correct for the vast majority of use cases.

### Consequences

- **Positive**: Intuitive behavior, animations compose naturally, intro/outro sequences work correctly, state transitions are clean.
- **Negative**: Cannot easily "reset" a property to its original value without an explicit reverse delta. To make something disappear after appearing, you must add a second delta that animates it back.

### Source

`packages/core/src/resolver/delta-resolver.ts` -- `resolvePropertyAtFrame()`, lines 67-89


---


## ADR-008: Minimal Canvas Interface (RenderContext)

- **Status**: Accepted
- **Date**: M3 (canvas renderer)

### Context

The `@atelier/canvas` package renders resolved frames to a Canvas 2D context. It needs access to Canvas 2D API methods. Options:

1. **Depend on DOM types**: Import `CanvasRenderingContext2D` from the `lib.dom.d.ts` type library.
2. **Minimal interface**: Define a custom interface with only the Canvas 2D methods actually used.

### Decision

Define a `RenderContext` interface in `packages/canvas/src/canvas-types.ts` that includes only the Canvas 2D methods and properties the renderer actually calls: state management (`save`, `restore`), transforms (`translate`, `rotate`, `scale`), path operations (`beginPath`, `moveTo`, `lineTo`, `bezierCurveTo`, `ellipse`, `fill`, `stroke`), rect operations, text operations, style properties (`fillStyle`, `strokeStyle`, `globalAlpha`, `lineWidth`, `font`, `textAlign`, `textBaseline`), gradient creation, and canvas dimensions. A companion `GradientLike` interface wraps `addColorStop()`.

No DOM library dependency is added to `tsconfig.json`.

### Rationale

- Enables server-side rendering with `node-canvas` or any other Canvas 2D implementation without depending on browser types.
- Library packages in a monorepo should not depend on browser-specific type libraries. Adding `"lib": ["DOM"]` to tsconfig would leak DOM types into all packages, potentially masking errors.
- The interface is straightforward to implement as a mock for testing: only ~25 methods and properties.
- Any conforming Canvas 2D implementation (browser `CanvasRenderingContext2D`, `node-canvas`, `skia-canvas`) satisfies the interface without adaptation.

### Consequences

- **Positive**: Works in both browser and Node.js, no DOM dependency, testable with lightweight mocks, compatible with multiple Canvas 2D backends.
- **Negative**: The interface must be maintained as new Canvas 2D features are used by the renderer. When a new method is needed (e.g., `roundRect`), it must be added to `RenderContext`. Currently `roundRect` is marked optional (`roundRect?`) since not all implementations support it.

### Source

`packages/canvas/src/canvas-types.ts` -- `RenderContext`, `GradientLike`


---


## ADR-009: Dual Output (ESM + CJS)

- **Status**: Accepted
- **Date**: Project inception

### Context

Node.js packages can be distributed in ESM (ECMAScript Modules), CJS (CommonJS), or both formats. Options:

1. **ESM only**: Modern, tree-shakeable, but breaks legacy consumers.
2. **CJS only**: Maximum backward compatibility, but no tree-shaking.
3. **Dual (ESM + CJS)**: Both formats, plus TypeScript declarations.

### Decision

All packages are built with `tsup` using `format: ["esm", "cjs"]` and `dts: true`. Each package ships ESM (`.js`), CJS (`.cjs`), and TypeScript declaration files (`.d.ts`). Source maps are enabled.

### Rationale

- Maximum compatibility. ESM for modern bundlers (Vite, esbuild, Rollup) and Node.js ESM mode. CJS for legacy Node.js, Jest (which has historically had ESM issues), and tools that do not yet fully support ESM.
- The `tsup` configuration is minimal -- 6 lines per package -- and handles the format splitting, declaration generation, and output cleaning automatically.
- TypeScript declarations are essential for the monorepo's internal package references and for downstream consumers.

### Consequences

- **Positive**: Works everywhere, no consumer migration friction, tree-shaking available via ESM, full TypeScript support.
- **Negative**: Slightly larger package size (two copies of the code). Occasional dual-package hazard -- if a consumer loads both the ESM and CJS copies, singletons or `instanceof` checks can break. This risk is low for library packages with no global state (except `@atelier/mcp`'s `DocumentStore`, which is instantiated per-server).

### Source

`packages/types/tsup.config.ts` (representative; all 7 packages use the same pattern)


---


## ADR-010: Per-Property Deltas (Not Keyframes)

- **Status**: Accepted
- **Date**: Project inception

### Context

Two dominant models exist for describing animation over time:

1. **Keyframes**: At specific points in time, capture a snapshot of all properties. Interpolate between snapshots. (CSS `@keyframes`, After Effects keyframes.)
2. **Per-property deltas**: Each animation instruction targets one property with its own timing and easing. (Atelier's approach.)

### Decision

Each `Delta` animates one `property` on one `layer` across one `range` with one `easing`. The Delta type has fields `layer`, `property`, `range: [start, end]`, `from`, `to`, and optional `easing`. To animate multiple properties simultaneously, define multiple deltas with the same range. To animate properties with different timings, give each delta its own range.

### Rationale

- Per-property deltas are more granular and composable. An opacity fade can run from frame 0-30 while a position slide runs from frame 10-40 -- different timings, different easings, defined independently.
- Keyframes require interpolating all properties between snapshots, even those that are not changing. This wastes specification space and makes it harder to modify one property's timing without affecting others.
- Per-property deltas map naturally to the delta resolver's algorithm: group deltas by layer+property, resolve each property independently. No cross-property coordination is needed.
- The model is AI-friendly. An AI agent can add, modify, or remove individual property animations without touching unrelated properties. With keyframes, modifying one property's timing requires editing multiple keyframe snapshots.

### Consequences

- **Positive**: Fine-grained control, different easing per property, simple resolution algorithm, independent modification of individual property animations, natural fit for the MCP tool model.
- **Negative**: More verbose for cases where "everything moves together" -- animating 5 properties in lockstep requires 5 delta definitions. This is mitigated by presets (`packages/core/src/presets/preset-resolver.ts`), which bundle multiple property deltas into reusable templates applied with a single `atelier_apply_preset` tool call.

### Source

`packages/types/src/delta.ts` -- `Delta` type definition
`packages/core/src/resolver/delta-resolver.ts` -- `resolvePropertyAtFrame()` resolves one property at a time
`packages/core/src/presets/preset-resolver.ts` -- `expandPreset()` expands preset templates into per-property deltas


---


## Decision Index

| ADR | Title | Status | Primary Package |
|-----|-------|--------|-----------------|
| 001 | YAML as Primary Format | Accepted | `@atelier/schema` |
| 002 | External State Management | Accepted | `@atelier/core` |
| 003 | No-Overlap Delta Validation | Accepted | `@atelier/core` |
| 004 | MCP-First AI Integration | Accepted | `@atelier/mcp` |
| 005 | Frame-Based Animation | Accepted | `@atelier/types` |
| 006 | Painters Algorithm for Layer Ordering | Accepted | `@atelier/canvas` |
| 007 | Hold-After-End Behavior | Accepted | `@atelier/core` |
| 008 | Minimal Canvas Interface | Accepted | `@atelier/canvas` |
| 009 | Dual Output (ESM + CJS) | Accepted | all |
| 010 | Per-Property Deltas | Accepted | `@atelier/types`, `@atelier/core` |
