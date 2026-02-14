---
title: Atelier Architecture
scope: Package dependency graph, data flow pipeline, key design decisions
packages: ["@atelier/types", "@atelier/math", "@atelier/schema", "@atelier/core", "@atelier/canvas", "@atelier/mcp", "@atelier/cli"]
related: ["docs/format-spec.md", "README.md", "docs/design-decisions.md"]
---

# Atelier Architecture

Atelier is a declarative animation engine designed for AI-first authoring. Animations are defined as structured YAML documents (`.atelier` files), resolved frame-by-frame through a deterministic pipeline, and rendered to Canvas 2D. AI agents author animations through MCP tools without ever editing YAML directly; humans verify visual output.

This document covers the monorepo structure, package dependency graph, data flow pipelines, module responsibilities, and the key design decisions that shape the system.

---

## 1. Project Structure

Atelier is a pnpm + Turborepo monorepo with 7 packages and 2 apps.

### 1.1 Packages

| Package | Description | Runtime Dependencies |
|---------|-------------|---------------------|
| `@atelier/types` | 47 pure TypeScript type definitions, zero runtime | None |
| `@atelier/math` | Pure interpolation engine (easing, lerp, spring, color) | None |
| `@atelier/schema` | Zod validation schemas + YAML parse/serialize | `@atelier/types`, `zod`, `yaml` |
| `@atelier/core` | Animation engine (frame resolver, builder, state machine, presets, templates) | `@atelier/types`, `@atelier/schema`, `@atelier/math` |
| `@atelier/canvas` | Canvas 2D renderer | `@atelier/types`, `@atelier/core` |
| `@atelier/mcp` | MCP server with 27 tools for AI authoring | `@atelier/types`, `@atelier/schema`, `@atelier/core`, `@atelier/canvas`, `@modelcontextprotocol/sdk`, `zod` |
| `@atelier/cli` | CLI tool (validate, info, still) | `@atelier/types`, `@atelier/schema`, `@atelier/core`, `@atelier/canvas`, `commander` |

### 1.2 Apps

| App | Description | Dependencies |
|-----|-------------|--------------|
| `@atelier/playground` | Vite dev app with canvas playback, Player class | `@atelier/types`, `@atelier/core`, `@atelier/canvas` |
| `@atelier/showcase` | Interactive animation catalog with 19 examples, 2 themes | `@atelier/types`, `@atelier/core`, `@atelier/canvas` |

### 1.3 Build Order

Turborepo respects the dependency graph and parallelizes where possible:

```
@atelier/types  ──┐
                   ├──> @atelier/schema ──┐
@atelier/math  ───┤                       ├──> @atelier/core ──> @atelier/canvas ──┐
                   └──────────────────────┘                                         ├──> @atelier/mcp
                                                                                    ├──> @atelier/cli
                                                                                    ├──> @atelier/playground
                                                                                    └──> @atelier/showcase
```

`@atelier/types` and `@atelier/math` have zero dependencies on each other and build in parallel. `@atelier/schema` depends on `@atelier/types`. `@atelier/core` depends on all three foundation packages. Everything downstream depends on `@atelier/core`.

---

## 2. Data Flow Pipeline

There are three distinct pipelines: document creation, frame resolution, and rendering.

### 2.1 Document Creation

Three paths produce the same `AtelierDocument` object:

```
AI Agent Path:     MCP tools --> DocumentStore (in-memory Map) --> document accumulates through tool calls
Builder Path:      createDocument() --> fluent API --> .build() --> AtelierDocument
YAML Path:         .atelier file --> parseAtelier() --> Zod validate --> AtelierDocument
```

All three paths produce a validated `AtelierDocument` conforming to the same type contract. The MCP path is the primary authoring interface; the builder path is for programmatic construction in tests and apps; the YAML path is for loading saved animations.

### 2.2 Frame Resolution Pipeline

The frame resolver is the computational core. Given a document, a state name, and a frame number, it produces a `ResolvedFrame` with all animated property values computed for that instant.

```
AtelierDocument + stateName + frameNumber
  |
  v
resolveFrame()                          [packages/core/src/resolver/frame-resolver.ts]
  |
  +--> groupDeltas()                    Group all deltas by layer ID, then by property name
  |
  +--> For each layer in doc.layers:
  |      |
  |      +--> For each animated property on this layer:
  |             |
  |             +--> resolvePropertyAtFrame()   [packages/core/src/resolver/delta-resolver.ts]
  |                    |
  |                    +--> isFrameInRange()     Check if frame falls within delta's [start, end]
  |                    |
  |                    +--> If active delta found:
  |                    |      +--> computeProgress()    Compute 0..1 progress within range
  |                    |      +--> resolveEasing()      [easing-resolver.ts] Map Easing type to math fn
  |                    |      +--> interpolateValue()   lerp numbers, snap strings at threshold
  |                    |
  |                    +--> If no active delta:
  |                           +--> Hold `to` value of most recently completed delta
  |
  v
ResolvedFrame { frame, stateName, layers: ResolvedLayer[] }
```

Key invariants:
- Deltas for the same layer+property NEVER overlap (enforced by `validateNoOverlap` at build time)
- After a delta's range ends, its `to` value is held indefinitely (hold-after-end)
- The easing resolver maps the `Easing` union type (string presets, cubic-bezier objects, spring configs, step configs) to a `(t: number) => number` function

### 2.3 Render Pipeline

The render pipeline takes a `ResolvedFrame` and paints it onto a Canvas 2D context.

```
ResolvedFrame + AtelierDocument + RenderContext
  |
  v
renderFrame()                           [packages/canvas/src/render-frame.ts]
  |
  +--> Clear canvas with doc.canvas.background
  |
  +--> For each layer (painters algorithm, first = back):
         |
         +--> Skip if layer.visible === false
         |
         +--> buildEffectiveLayer()     [apply-properties.ts]
         |     Merge computed properties over layer defaults
         |     Resolve percentage units to pixels (% of canvas dimensions)
         |
         +--> Skip if opacity <= 0
         |
         +--> ctx.save()
         +--> Apply transforms:
         |     translate(x, y)
         |     translate to anchor, rotate, scale, translate back
         |
         +--> Dispatch to type-specific renderer:
         |     "shape"  --> renderShape()   rect (with cornerRadius), ellipse, path with fill/stroke
         |     "text"   --> renderText()    font building, alignment, color
         |     "image"  --> (deferred, needs async asset loading)
         |     "group"  --> (structural only, children via parentId)
         |     "ref"    --> (deferred, needs sub-document loading)
         |
         +--> ctx.restore()
```

The renderer uses the `RenderContext` interface, not the browser's `CanvasRenderingContext2D` directly. This interface includes only the methods Atelier actually calls (`save`, `restore`, `translate`, `rotate`, `scale`, `fillRect`, `strokeRect`, `beginPath`, `ellipse`, `roundRect`, `fillText`, `strokeText`, gradients, etc.), enabling rendering in both browser and Node.js (via `node-canvas`).

---

## 3. Module Architecture

### 3.1 Core Modules (`packages/core/src/`)

| Module | Path | Responsibility |
|--------|------|----------------|
| Frame Resolver | `resolver/frame-resolver.ts` | Groups deltas by layer+property, resolves all layers at a frame. Entry point: `resolveFrame()` |
| Delta Resolver | `resolver/delta-resolver.ts` | Per-property interpolation: range checking, progress computation, value interpolation, hold-after-end |
| Easing Resolver | `resolver/easing-resolver.ts` | Maps the `Easing` union type to executable `(t: number) => number` functions |
| Document Builder | `builder/document-builder.ts` | Fluent API (`createDocument().addLayer().addState().addDelta().build()`) with overlap validation on every delta addition |
| Overlap Validator | `validation/overlap-validator.ts` | Enforces the no-overlap constraint: two deltas on the same layer+property cannot have overlapping frame ranges |
| Unit Resolver | `units/resolve-units.ts` | Converts `UnitValue` (pixel or percentage) to absolute pixels given a reference dimension |
| Preset Resolver | `presets/preset-resolver.ts` | Expands preset definitions into concrete deltas for a target layer and start frame |
| State Machine | `state/state-machine.ts` | Tick-based playback controller: manages current state/frame, transitions between states, seek, and play-through |
| Template Resolver | `templates/template-resolver.ts` | `{{variable}}` substitution in template documents. Validates bindings, preserves types for exact-match substitutions |

### 3.2 Math Modules (`packages/math/src/`)

All math modules are pure functions with zero dependencies.

| Module | Path | Exports |
|--------|------|---------|
| Easing | `easing.ts` | `linear`, `cubicBezier(x1, y1, x2, y2)`, `easeIn`, `easeOut`, `easeInOut`, `step(steps, position)` |
| Spring | `spring.ts` | `spring(config)` -- damped harmonic oscillator with configurable mass, stiffness, damping, velocity |
| Lerp | `lerp.ts` | `lerp(a, b, t)`, `clamp(value, min, max)`, `lerpArray(a, b, t)`, `remap(value, inMin, inMax, outMin, outMax)` |
| Color | `color.ts` | `hexToRgba`, `rgbaToHex`, `lerpRgba`, `rgbaToHsla`, `hslaToRgba`, `lerpHsla` (shortest hue path) |

### 3.3 Canvas Modules (`packages/canvas/src/`)

| Module | Path | Responsibility |
|--------|------|----------------|
| Render Frame | `render-frame.ts` | Orchestrates canvas clear, layer iteration, transform application, renderer dispatch |
| Apply Properties | `apply-properties.ts` | Merges `ResolvedLayer` computed properties over `Layer` defaults; resolves `%` to `px` |
| Canvas Types | `canvas-types.ts` | `RenderContext` and `GradientLike` interfaces for platform-independent rendering |
| Styles | `styles.ts` | `applyFill()` and `applyStroke()` helpers for solid colors, linear/radial gradients |
| Shape Renderer | `renderers/shape-renderer.ts` | Renders rect (with rounded corners), ellipse, and bezier path shapes |
| Text Renderer | `renderers/text-renderer.ts` | Renders text with font building, alignment (left/center/right), and color |

### 3.4 Schema Modules (`packages/schema/src/`)

| Module | Responsibility |
|--------|----------------|
| Per-type schema files | Zod schemas mirroring every type in `@atelier/types` with AI-readable error messages |
| `validate.ts` | `validateDocument()`, `validateLayer()`, `validateDelta()` -- structural validation |
| `parse.ts` | `parseAtelier(yaml)` parses YAML to validated `AtelierDocument`; `serializeAtelier(doc)` writes YAML |

### 3.5 MCP Tool Categories (`packages/mcp/src/tools/`)

The MCP server exposes 27 tools organized into 8 categories:

| Category | File | Tools | Count |
|----------|------|-------|-------|
| Document | `document.ts` | `atelier_create`, `atelier_info`, `atelier_load`, `atelier_export`, `atelier_list` | 5 |
| Layer | `layers.ts` | `atelier_add_layer`, `atelier_edit_layer`, `atelier_remove_layer`, `atelier_list_layers`, `atelier_reorder_layers` | 5 |
| Shape | `shapes.ts` | `atelier_set_shape`, `atelier_set_fill`, `atelier_set_stroke` | 3 |
| State | `states.ts` | `atelier_add_state`, `atelier_edit_state`, `atelier_remove_state`, `atelier_list_states` | 4 |
| Delta | `deltas.ts` | `atelier_add_delta`, `atelier_edit_delta`, `atelier_remove_delta`, `atelier_apply_preset` | 4 |
| Preset | `presets.ts` | `atelier_define_preset`, `atelier_list_presets` | 2 |
| Preview | `preview.ts` | `atelier_validate`, `atelier_preview` | 2 |
| Template | `templates.ts` | `atelier_instantiate_template`, `atelier_find_variables` | 2 |

---

## 4. Type System

`@atelier/types` exports 47 pure TypeScript types with zero runtime code. The type hierarchy follows the document structure:

```
AtelierDocument
  +-- Canvas { width, height, fps, background? }
  +-- Layer[]
  |     +-- Visual (union: ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual)
  |     +-- Frame { x, y } (UnitValue: number | `${number}%`)
  |     +-- Bounds { width, height }
  |     +-- AnchorPoint? { x, y }
  |     +-- opacity?, rotation?, scale?, visible?, parentId?
  +-- states: Record<string, State>
  |     +-- State { duration, deltas: Delta[] }
  |           +-- Delta { layer, property: AnimatableProperty, range: FrameRange, from, to, easing? }
  |                 +-- Easing (union: EasingPreset | LinearEasing | CubicBezierEasing | SpringEasing | StepEasing)
  +-- presets?: Record<string, Preset>
  +-- variables?: Record<string, Variable>
  +-- assets?: Record<string, Asset>
```

The `AnimatableProperty` type is a string literal union of 16 dot-path property names (`frame.x`, `frame.y`, `bounds.width`, `bounds.height`, `opacity`, `rotation`, `scale.x`, `scale.y`, `anchorPoint.x`, `anchorPoint.y`, `visual.shape.cornerRadius`, `visual.fill.color`, `visual.stroke.color`, `visual.stroke.width`, `visual.style.fontSize`, `visual.style.color`).

---

## 5. Key Architecture Decisions

### 5.1 YAML Format (not JSON)

Animation files use `.atelier` extension with YAML syntax. YAML was chosen for human inspectability -- animations can be reviewed and diffed in version control. Zod schemas validate structure at parse time, providing AI-readable error messages when validation fails.

### 5.2 Machine-First, Human-Readable

AI agents author animations through MCP tools. They never edit YAML directly. The MCP server maintains an in-memory `DocumentStore` (a `Map<string, AtelierDocument>`) that accumulates changes through tool calls. Humans verify visual output in the playground or showcase apps.

### 5.3 Flat Layer Model

Layers are a flat array, not a nested tree. Hierarchy is expressed through optional `parentId` references. This simplifies iteration, serialization, and the frame resolution pipeline. The painters algorithm renders layers in array order (first = back).

### 5.4 Per-Property Deltas

Each delta animates exactly ONE property over exactly ONE frame range. A "fade in while sliding right" requires two deltas: one for `opacity` and one for `frame.x`. This granularity enables the no-overlap constraint and makes animation behavior fully deterministic.

### 5.5 No-Overlap Constraint

Two deltas targeting the same layer+property CANNOT have overlapping frame ranges. This is enforced at three levels:
1. `DocumentBuilder.addDelta()` validates on every addition
2. `validateNoOverlap()` checks a single new delta against existing deltas
3. `validateAllDeltas()` checks all deltas pairwise (used by the `atelier_validate` MCP tool)

This constraint eliminates ambiguous interpolation. At any frame, at most one delta is active for a given layer+property pair.

### 5.6 State-Based Architecture

Documents contain multiple named states (e.g., "intro", "hover", "outro"), each with its own duration and delta set. The `StateMachine` class manages transitions between states, tracking playback position and transition history. States are independent -- transitioning to a new state resets the frame counter.

### 5.7 Hold-After-End

When a delta's frame range ends, the `to` value is held for all subsequent frames (until another delta for the same layer+property begins). This is implemented in `resolvePropertyAtFrame()`: when no active delta is found, it returns the `to` value of the most recently completed delta. This prevents layers from reverting to their initial state after an animation completes.

### 5.8 RenderContext Interface

The canvas renderer depends on a minimal `RenderContext` interface (defined in `canvas-types.ts`) rather than the browser's `CanvasRenderingContext2D`. This interface includes only the methods Atelier actually uses: state management (`save`/`restore`), transforms (`translate`/`rotate`/`scale`), drawing (`fillRect`/`strokeRect`/`beginPath`/`ellipse`/`fillText`), and styling. This enables rendering in Node.js via `node-canvas` or any compatible implementation.

### 5.9 In-Memory DocumentStore

The MCP server stores documents in a `Map<string, AtelierDocument>`. There is no persistence layer -- each MCP session starts fresh. Documents are exported as YAML when the user wants to save. This keeps the server stateless between sessions and avoids filesystem side effects during AI authoring.

### 5.10 External State Management

The `.atelier` format itself is a static data structure. Playback state (current frame, current state, transition history) lives outside the document in the `StateMachine` class or the app's `Player` class. The format describes *what* can happen; the runtime decides *when* it happens.

---

## 6. Build System

| Tool | Purpose |
|------|---------|
| **pnpm** | Package manager with workspace protocol (`workspace:*`) |
| **Turborepo** | Parallel build orchestration respecting the dependency graph |
| **tsup** | ESM + CJS dual output with `.d.ts` declarations |
| **vitest** | Test runner across workspace packages |
| **TypeScript 5.7+** | Strict mode via shared `tsconfig.base.json` |

All packages produce dual-format output (ESM via `dist/index.js`, CJS via `dist/index.cjs`) with TypeScript declarations (`dist/index.d.ts`). Package entry points use the `exports` field for clean resolution:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

---

## 7. Boundary Summary

```
                    +-----------+
                    |  .atelier |  YAML files (human-readable format)
                    +-----+-----+
                          |
                    parseAtelier() / serializeAtelier()
                          |
                    +-----v-----+
                    |  @atelier  |  Zod validation + parse
                    |   /schema  |
                    +-----+-----+
                          |
                    +-----v-----+      +-----------+
                    |  @atelier  |<---->|  @atelier  |
                    |   /core    |      |   /math    |  Pure interpolation
                    +-----+-----+      +-----------+
                          |
              +-----------+-----------+
              |                       |
        +-----v-----+          +-----v-----+
        |  @atelier  |          |  @atelier  |
        |  /canvas   |          |  /builder  |  (DocumentBuilder in core)
        +-----+-----+          +-----------+
              |
    +---------+---------+
    |         |         |
+---v---+ +--v---+ +---v-----+
| /mcp  | | /cli | | /apps   |
+-------+ +------+ +---------+
```

The boundaries are strict:
- `@atelier/types` and `@atelier/math` are leaf dependencies with zero imports from other workspace packages
- `@atelier/schema` imports only `@atelier/types` (plus `zod` and `yaml`)
- `@atelier/core` is the convergence point -- it imports `types`, `schema`, and `math`
- `@atelier/canvas` imports `types` and `core` but NOT `schema` or `math` directly
- Consumer packages (`mcp`, `cli`, apps) sit at the top of the dependency graph
