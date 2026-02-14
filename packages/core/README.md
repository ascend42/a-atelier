---
title: "@atelier/core"
scope: Animation engine — frame resolver, DocumentBuilder, StateMachine, templates, presets
packages: ["@atelier/core"]
related: ["docs/format-spec.md", "docs/architecture.md", "docs/builder-guide.md", "docs/state-machine-guide.md", "docs/rendering-pipeline.md"]
---

# @atelier/core

Animation engine for the Atelier document format. Resolves frames from declarative animation documents, provides a fluent builder API for constructing documents, and includes a state machine for multi-state playback.

## Package Info

| Field | Value |
|-------|-------|
| **Name** | `@atelier/core` |
| **Version** | `0.1.0` |
| **Description** | Animation engine -- delta resolution, builder API, state machine |
| **Source** | `packages/core/src/` |
| **Build** | tsup (ESM + CJS + DTS, with sourcemaps) |
| **Test** | vitest |

### Dependencies

All workspace packages:

- `@atelier/types` -- type definitions for documents, layers, deltas, easings
- `@atelier/schema` -- Zod validation schemas
- `@atelier/math` -- interpolation, easing curves (lerp, cubicBezier, spring, etc.)

## Installation

```bash
pnpm add @atelier/core
```

Or from the monorepo root:

```bash
pnpm --filter @atelier/core build
```

## Exports

Everything is exported from a single entry point:

```typescript
import {
  // Frame resolution
  resolveFrame,
  resolveDeltaValue,
  resolvePropertyAtFrame,
  isFrameInRange,
  computeProgress,
  interpolateValue,
  resolveEasing,

  // Validation
  validateNoOverlap,
  validateAllDeltas,
  rangesOverlap,

  // Builder
  DocumentBuilder,
  createDocument,

  // Units
  resolveUnit,
  isPercentage,
  parsePercentage,

  // Presets
  expandPreset,

  // State machine
  StateMachine,

  // Templates
  instantiateTemplate,
  findTemplateVariables,
} from "@atelier/core";

// Types
import type {
  ResolvedFrame,
  ResolvedLayer,
  OverlapError,
  StateTransition,
  PlaybackState,
  TemplateBindings,
  TemplateError,
  TemplateResult,
} from "@atelier/core";
```

---

## Modules

### 1. Frame Resolver

**`src/resolver/frame-resolver.ts`** -- Main entry point for frame resolution.

Given an `AtelierDocument`, a state name, and a frame number, resolves every layer's animated properties at that instant.

```typescript
function resolveFrame(doc: AtelierDocument, stateName: string, frame: number): ResolvedFrame;
```

**Interfaces:**

```typescript
interface ResolvedLayer {
  id: string;
  layer: Layer;                                              // original layer definition
  computedProperties: Partial<Record<AnimatableProperty, unknown>>; // animated overrides
}

interface ResolvedFrame {
  frame: number;       // frame number that was resolved
  stateName: string;   // state name that was resolved
  layers: ResolvedLayer[];
}
```

**Algorithm:**

1. Look up the state by name (throws if not found).
2. Group all deltas by `layerId`, then by `property` name.
3. For each layer, for each animated property, call `resolvePropertyAtFrame()`.
4. Return a `ResolvedFrame` containing all layers with their computed property values.

**Example:**

```typescript
import { resolveFrame } from "@atelier/core";

const result = resolveFrame(doc, "intro", 15);

for (const layer of result.layers) {
  console.log(layer.id, layer.computedProperties);
  // "title" { opacity: 0.75, y: 120 }
}
```

---

### 2. Delta Resolver

**`src/resolver/delta-resolver.ts`** -- Per-property interpolation logic.

```typescript
function isFrameInRange(frame: number, range: FrameRange): boolean;
function computeProgress(frame: number, range: FrameRange): number;
function resolveDeltaValue(delta: Delta, frame: number): unknown | undefined;
function interpolateValue(from: unknown, to: unknown, t: number): unknown;
function resolvePropertyAtFrame(deltas: Delta[], frame: number): unknown | undefined;
```

**Key behaviors:**

| Scenario | Result |
|----------|--------|
| Frame is within a delta's range | Interpolated value using eased progress |
| Frame is AFTER all deltas | **Hold** the `to` value of the most recently completed delta |
| Frame is BEFORE all deltas | `undefined` (layer defaults apply) |
| Instantaneous delta (start === end) | Progress = 1, returns `to` value |

**Interpolation rules:**

- **Numbers**: Linearly interpolated via `lerp(from, to, t)`.
- **Strings** (hex colors, labels, etc.): Snap to `to` at `t >= 1`, otherwise hold `from`.
- **Other types**: Snap at `t >= 1`.

**Value hold behavior:**

After a delta's range ends, the property retains its `to` value rather than reverting. If multiple deltas have completed, the one with the latest end frame wins.

```typescript
import { resolvePropertyAtFrame } from "@atelier/core";

// Two sequential deltas for opacity on the same layer:
// Delta A: frames [0, 10], from: 0, to: 1
// Delta B: frames [20, 30], from: 1, to: 0

resolvePropertyAtFrame(deltas, 5);   // 0.5  (mid-interpolation of A)
resolvePropertyAtFrame(deltas, 10);  // 1    (end of A)
resolvePropertyAtFrame(deltas, 15);  // 1    (hold A's `to` value)
resolvePropertyAtFrame(deltas, 25);  // 0.5  (mid-interpolation of B)
resolvePropertyAtFrame(deltas, 35);  // 0    (hold B's `to` value)
```

---

### 3. Easing Resolver

**`src/resolver/easing-resolver.ts`** -- Bridges `Easing` type definitions to executable math functions.

```typescript
function resolveEasing(easing: Easing | undefined): (t: number) => number;
```

**Supported easings:**

| Easing Type | Source |
|-------------|--------|
| `undefined` / omitted | `linear` |
| `"ease-in"` | `easeIn` preset |
| `"ease-out"` | `easeOut` preset |
| `"ease-in-out"` | `easeInOut` preset |
| `{ type: "linear" }` | `linear` |
| `{ type: "cubic-bezier", x1, y1, x2, y2 }` | `cubicBezier(x1, y1, x2, y2)` |
| `{ type: "spring", mass, stiffness, damping, velocity }` | `spring({ ... })` |
| `{ type: "step", steps, position }` | `step(steps, position)` |

All underlying functions are provided by `@atelier/math`.

---

### 4. Document Builder

**`src/builder/document-builder.ts`** -- Fluent API for constructing valid `AtelierDocument` objects.

```typescript
class DocumentBuilder {
  constructor(name: string, canvas: Canvas);

  description(desc: string): this;
  tags(...tags: string[]): this;
  variable(id: string, variable: Variable): this;
  asset(id: string, asset: Asset): this;
  preset(id: string, preset: Preset): this;

  addLayer(layer: Layer): this;
  addState(name: string, state: Omit<State, "deltas"> & { deltas?: Delta[] }): this;
  addDelta(stateName: string, delta: Delta): this;

  build(): AtelierDocument;
}

function createDocument(name: string, canvas: Canvas): DocumentBuilder;
```

**Validations performed on every mutation:**

| Method | Validation |
|--------|-----------|
| `addLayer()` | Rejects duplicate layer IDs |
| `addState()` | Rejects duplicate state names |
| `addDelta()` | Checks that the referenced layer exists |
| `addDelta()` | Runs `validateNoOverlap()` against existing deltas |

`build()` returns a deep clone (via `JSON.parse(JSON.stringify(...))`) so the builder's internal state is not shared.

**Example:**

```typescript
import { createDocument } from "@atelier/core";

const doc = createDocument("fade-in", { width: 1920, height: 1080, fps: 30 })
  .description("Simple fade-in animation")
  .tags("intro", "fade")
  .addLayer({ id: "bg", type: "fill", fill: "#000000" })
  .addLayer({ id: "title", type: "text", text: "Hello", x: 960, y: 540 })
  .addState("main", { duration: 60 })
  .addDelta("main", {
    id: "title-fade",
    layer: "title",
    property: "opacity",
    range: [0, 30],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("main", {
    id: "title-slide",
    layer: "title",
    property: "y",
    range: [0, 30],
    from: 560,
    to: 540,
    easing: "ease-out",
  })
  .build();
```

---

### 5. Overlap Validator

**`src/validation/overlap-validator.ts`** -- Ensures no two deltas animate the same property on the same layer during overlapping frame ranges.

```typescript
interface OverlapError {
  layerId: string;
  property: string;
  existingRange: FrameRange;
  newRange: FrameRange;
  message: string;
}

function rangesOverlap(a: FrameRange, b: FrameRange): boolean;
function validateNoOverlap(existing: Delta[], newDelta: Delta): OverlapError | null;
function validateAllDeltas(deltas: Delta[]): OverlapError[];
```

**Overlap rule:** Two deltas conflict when they share the same `layer` and `property` AND their frame ranges intersect. The intersection check is `a[0] <= b[1] && b[0] <= a[1]` (inclusive on both ends).

- `validateNoOverlap()` checks a single new delta against an existing array (used by `DocumentBuilder.addDelta()`).
- `validateAllDeltas()` checks all pairs in an array, returning every overlap found (useful for batch validation of imported documents).

---

### 6. Unit Resolver

**`src/units/resolve-units.ts`** -- Converts `UnitValue` (number or percentage string) to pixel values.

```typescript
function isPercentage(value: UnitValue): value is `${number}%`;
function parsePercentage(value: `${number}%`): number;
function resolveUnit(value: UnitValue, reference: number): number;
```

**Behavior:**

- Numeric values pass through unchanged.
- Percentage strings (e.g. `"50%"`) are resolved relative to the reference dimension.

```typescript
import { resolveUnit } from "@atelier/core";

resolveUnit(100, 1920);    // 100    (pixel value, unchanged)
resolveUnit("50%", 1920);  // 960    (50% of 1920)
resolveUnit("100%", 1080); // 1080   (100% of 1080)
```

---

### 7. Preset Resolver

**`src/presets/preset-resolver.ts`** -- Expands reusable preset definitions into concrete deltas.

```typescript
function expandPreset(
  preset: Preset,
  layerId: string,
  startFrame: number,
  duration: number,
): Delta[];
```

Presets contain delta templates with relative offsets. `expandPreset()` converts them to absolute frame ranges by:

1. If the preset delta has an `offset` tuple, the range becomes `[startFrame + offset[0], startFrame + offset[1]]`.
2. If no offset is specified, the range spans the full duration: `[startFrame, startFrame + duration]`.

Each generated delta gets an auto-generated ID in the format `preset-{layerId}-{index}`.

```typescript
import { expandPreset } from "@atelier/core";

const fadePreset = {
  name: "fade-in",
  deltas: [
    { property: "opacity", from: 0, to: 1, offset: [0, 30] },
  ],
};

const deltas = expandPreset(fadePreset, "title", 10, 60);
// [{ id: "preset-title-0", layer: "title", property: "opacity",
//    range: [10, 40], from: 0, to: 1 }]
```

---

### 8. State Machine

**`src/state/state-machine.ts`** -- Frame-by-frame playback controller with multi-state transitions.

```typescript
interface StateTransition {
  from: string;
  to: string;
  at: number;  // frame at which the transition occurred
}

interface PlaybackState {
  stateName: string;
  frame: number;
  resolved: ResolvedFrame;
  isComplete: boolean;
}

class StateMachine {
  constructor(doc: AtelierDocument, initialState?: string);

  // Accessors
  get state(): string;
  get frame(): number;
  get stateNames(): string[];
  get duration(): number;
  get isComplete(): boolean;
  get history(): ReadonlyArray<StateTransition>;

  // Playback
  tick(): PlaybackState;
  transition(stateName: string, startFrame?: number): void;
  seek(frame: number): void;
  reset(stateName?: string): void;

  // Query
  resolveAt(stateName: string, frame: number): ResolvedFrame;

  // Batch
  playThrough(onFrame: (state: PlaybackState) => void): void;
}
```

**Behavior details:**

- **Constructor**: Defaults to the first state in the document if `initialState` is omitted. Throws if the document has no states or the requested state does not exist.
- **`tick()`**: Returns the resolved frame at the current position, then advances the internal frame counter. Clamps at `duration - 1` (does not advance past the last frame).
- **`transition()`**: Records the transition in `history`, switches to the target state, and resets the frame counter (or sets it to the provided `startFrame`).
- **`seek()`**: Jumps to a frame, clamped to `[0, duration - 1]`.
- **`reset()`**: Resets the frame to 0. Optionally switches to a different state.
- **`resolveAt()`**: Resolves a frame without advancing the internal counter -- useful for previews and scrubbing.
- **`playThrough()`**: Resets to frame 0, then calls the callback on every frame from 0 through `duration - 1`.

```typescript
import { StateMachine } from "@atelier/core";

const machine = new StateMachine(doc, "intro");

// Frame-by-frame playback
while (!machine.isComplete) {
  const { frame, resolved } = machine.tick();
  render(resolved);
}

// Transition to next state
machine.transition("main");

// Play entire state with callback
machine.playThrough(({ frame, resolved, isComplete }) => {
  render(resolved);
  if (isComplete) console.log("Done with", machine.state);
});
```

---

### 9. Template Resolver

**`src/templates/template-resolver.ts`** -- Instantiates parameterized document templates into concrete documents.

```typescript
interface TemplateBindings {
  [variableName: string]: unknown;
}

interface TemplateError {
  variable: string;
  message: string;
}

type TemplateResult =
  | { success: true; document: AtelierDocument }
  | { success: false; errors: TemplateError[] };

function instantiateTemplate(template: AtelierDocument, bindings: TemplateBindings): TemplateResult;
function findTemplateVariables(doc: AtelierDocument): string[];
```

**`instantiateTemplate()` algorithm:**

1. **Validate required variables** -- any variable without a `default` must have a binding. Errors are collected, not thrown.
2. **Reject unknown bindings** -- binding keys that do not match any declared variable produce errors.
3. **Merge with defaults** -- bindings override defaults; defaults fill in where bindings are absent.
4. **Deep clone and substitute** -- walks the entire document tree, replacing `{{variableName}}` patterns.
5. **Type preservation** -- if an entire string value is exactly `{{var}}`, the raw bound value is returned (a number stays a number, not a string).
6. **Remove variables section** -- the output document has no `variables` key (it is no longer a template).

**`findTemplateVariables()`** scans the entire document for `{{variableName}}` patterns and returns a deduplicated list of variable names found.

```typescript
import { instantiateTemplate, findTemplateVariables } from "@atelier/core";

// Discover what a template needs
const vars = findTemplateVariables(templateDoc);
// ["brandColor", "headline", "duration"]

// Instantiate with bindings
const result = instantiateTemplate(templateDoc, {
  brandColor: "#ff6600",
  headline: "Launch Day",
  duration: 90,
});

if (result.success) {
  const doc = result.document;
  // doc has no `variables` section, all {{var}} patterns are resolved
} else {
  for (const err of result.errors) {
    console.error(`${err.variable}: ${err.message}`);
  }
}
```

---

## Usage Examples

### Complete workflow: Build, Resolve, Play

```typescript
import {
  createDocument,
  resolveFrame,
  StateMachine,
  type PlaybackState,
} from "@atelier/core";

// 1. Build a document
const doc = createDocument("demo", { width: 1920, height: 1080, fps: 30 })
  .description("Two-state animation demo")
  .addLayer({ id: "bg", type: "fill", fill: "#1a1a2e" })
  .addLayer({ id: "circle", type: "shape", shape: "circle", x: 960, y: 540, width: 100, height: 100 })
  .addLayer({ id: "label", type: "text", text: "Hello", x: 960, y: 700, opacity: 0 })

  // State 1: intro (60 frames = 2 seconds at 30fps)
  .addState("intro", { duration: 60 })
  .addDelta("intro", {
    id: "circle-scale",
    layer: "circle",
    property: "width",
    range: [0, 30],
    from: 0,
    to: 100,
    easing: "ease-out",
  })
  .addDelta("intro", {
    id: "label-fade",
    layer: "label",
    property: "opacity",
    range: [20, 50],
    from: 0,
    to: 1,
    easing: "ease-in-out",
  })

  // State 2: outro (45 frames = 1.5 seconds)
  .addState("outro", { duration: 45 })
  .addDelta("outro", {
    id: "circle-shrink",
    layer: "circle",
    property: "width",
    range: [0, 30],
    from: 100,
    to: 0,
    easing: "ease-in",
  })
  .addDelta("outro", {
    id: "label-out",
    layer: "label",
    property: "opacity",
    range: [0, 20],
    from: 1,
    to: 0,
  })
  .build();

// 2. Resolve a single frame
const snapshot = resolveFrame(doc, "intro", 25);
for (const layer of snapshot.layers) {
  console.log(`${layer.id}:`, layer.computedProperties);
}
// circle: { width: 83.33 }   (eased)
// label:  { opacity: 0.25 }  (5 frames into its 30-frame range)

// 3. Multi-state playback with StateMachine
const machine = new StateMachine(doc, "intro");

const allFrames: PlaybackState[] = [];

// Play through intro
machine.playThrough((state) => {
  allFrames.push(state);
});

// Transition to outro
machine.transition("outro");

// Play through outro
machine.playThrough((state) => {
  allFrames.push(state);
});

console.log(`Total frames rendered: ${allFrames.length}`);
console.log(`Transitions: ${machine.history.length}`);
// Transitions: 1 (intro -> outro)
```

### Template workflow

```typescript
import {
  createDocument,
  instantiateTemplate,
  findTemplateVariables,
} from "@atelier/core";

// Build a template with variables
const template = createDocument("branded-intro", { width: 1920, height: 1080, fps: 30 })
  .variable("brandColor", { type: "string", description: "Primary brand color" })
  .variable("headline", { type: "string", description: "Main headline text" })
  .variable("animDuration", { type: "number", default: 30, description: "Fade duration in frames" })
  .addLayer({ id: "bg", type: "fill", fill: "{{brandColor}}" })
  .addLayer({ id: "title", type: "text", text: "{{headline}}", x: 960, y: 540, opacity: 0 })
  .addState("main", { duration: 60 })
  .addDelta("main", {
    id: "title-fade",
    layer: "title",
    property: "opacity",
    range: [0, 30],  // would use {{animDuration}} in a real scenario
    from: 0,
    to: 1,
  })
  .build();

// Discover variables
const vars = findTemplateVariables(template);
// ["brandColor", "headline"]  (animDuration has a default, but also shows up in scan)

// Instantiate
const result = instantiateTemplate(template, {
  brandColor: "#e94560",
  headline: "Welcome",
});

if (result.success) {
  // result.document is a concrete AtelierDocument with no variables section
  console.log(result.document.layers[0].fill); // "#e94560"
}
```

### Preset expansion

```typescript
import { createDocument, expandPreset } from "@atelier/core";

const fadeInPreset = {
  name: "fade-in",
  deltas: [
    { property: "opacity", from: 0, to: 1, offset: [0, 20] as [number, number] },
    { property: "y", from: 20, to: 0, offset: [0, 15] as [number, number] },
  ],
};

// Expand preset into deltas starting at frame 10
const deltas = expandPreset(fadeInPreset, "title", 10, 30);
// [
//   { id: "preset-title-0", layer: "title", property: "opacity", range: [10, 30], from: 0, to: 1 },
//   { id: "preset-title-1", layer: "title", property: "y", range: [10, 25], from: 20, to: 0 },
// ]

// Feed expanded deltas into a builder
const builder = createDocument("preset-demo", { width: 1920, height: 1080, fps: 30 })
  .addLayer({ id: "title", type: "text", text: "Hi", x: 960, y: 540 })
  .addState("main", { duration: 60 });

for (const delta of deltas) {
  builder.addDelta("main", delta);
}

const doc = builder.build();
```

## Architecture

```
@atelier/core
  src/
    index.ts                          -- barrel exports
    resolver/
      frame-resolver.ts               -- resolveFrame (main entry)
      delta-resolver.ts               -- per-property interpolation + hold logic
      easing-resolver.ts              -- Easing type -> math function
    validation/
      overlap-validator.ts            -- delta overlap detection
    builder/
      document-builder.ts             -- fluent DocumentBuilder + createDocument
    units/
      resolve-units.ts                -- UnitValue -> pixel conversion
    presets/
      preset-resolver.ts              -- Preset -> Delta[] expansion
    state/
      state-machine.ts                -- StateMachine playback controller
    templates/
      template-resolver.ts            -- template instantiation + variable scanning
```

## Scripts

```bash
pnpm --filter @atelier/core build      # Build with tsup (ESM + CJS + DTS)
pnpm --filter @atelier/core test       # Run tests with vitest
pnpm --filter @atelier/core typecheck  # Type-check without emitting
pnpm --filter @atelier/core clean      # Remove dist/
```

## License

See the repository root for license information.
