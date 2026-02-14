---
title: State Machine & Template Guide
scope: StateMachine class, state transitions, template variables, and examples
packages: ["@atelier/core"]
related: ["packages/core/README.md", "docs/builder-guide.md", "docs/format-spec.md"]
---

# State Machine & Template Guide

Atelier documents support multiple **states**, each with its own duration and set of deltas. The `StateMachine` class drives playback across those states, while the **template system** turns documents into reusable blueprints with substitutable variables.

Both systems are exported from `@atelier/core`.

---

## Table of Contents

1. [StateMachine API](#statemachine-api)
2. [Template System API](#template-system-api)
3. [Tutorial: Basic State Machine Usage](#1-basic-state-machine-usage)
4. [Tutorial: Traffic Light](#2-traffic-light-example)
5. [Tutorial: Transition History](#3-transition-history)
6. [Tutorial: Server-Side Batch Processing](#4-server-side-batch-processing-with-playthrough)
7. [Tutorial: Creating a Template](#5-creating-a-template)
8. [Tutorial: Instantiating a Template](#6-instantiating-a-template)
9. [Tutorial: Finding Variables](#7-finding-variables)
10. [Tutorial: Error Handling](#8-error-handling)

---

## StateMachine API

**Source:** `packages/core/src/state/state-machine.ts`

### Types

```typescript
interface StateTransition {
  from: string;   // state transitioned from
  to: string;     // state transitioned to
  at: number;     // frame at which the transition occurred
}

interface PlaybackState {
  stateName: string;          // current state name
  frame: number;              // current frame number
  resolved: ResolvedFrame;    // fully resolved layer data for this frame
  isComplete: boolean;        // true when frame >= duration - 1
}
```

### Class

```typescript
class StateMachine {
  constructor(doc: AtelierDocument, initialState?: string);

  // Properties
  get state(): string;                          // current state name
  get frame(): number;                          // current frame index
  get stateNames(): string[];                   // all state names in the document
  get duration(): number;                       // duration of the current state
  get isComplete(): boolean;                    // true when frame >= duration - 1
  get history(): ReadonlyArray<StateTransition>;// recorded transitions

  // Methods
  tick(): PlaybackState;                        // resolve current frame, then advance
  transition(stateName: string, startFrame?: number): void;
  seek(frame: number): void;                    // jump to a frame (clamped to [0, duration-1])
  reset(stateName?: string): void;              // reset frame to 0, optionally switch state
  resolveAt(stateName: string, frame: number): ResolvedFrame;
  playThrough(onFrame: (state: PlaybackState) => void): void;
}
```

### Constructor

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `doc` | `AtelierDocument` | required | Document with at least one state |
| `initialState` | `string` | first state key | State to start in |

Behavior:

- Defaults to the first state in `doc.states` if `initialState` is omitted.
- Throws `"Document has no states"` if `doc.states` is empty.
- Throws `"State \"<name>\" not found"` if the specified initial state does not exist.
- Starts at frame 0.

### tick()

Resolves the current frame via `resolveFrame(doc, currentState, currentFrame)`, packages the result into a `PlaybackState`, then advances the internal frame counter by one.

Key details:

- Returns the `PlaybackState` **before** advancing. The `frame` field in the return value reflects the frame that was just resolved.
- If the frame is already at `duration - 1`, the counter stays put (it does not wrap or overflow).
- Does **not** auto-transition to the next state. The caller must decide when and whether to call `transition()`.

### transition()

Switches to a new state and records the transition in `history`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `stateName` | `string` | required | Target state |
| `startFrame` | `number` | `0` | Frame to begin the new state at |

Throws if the target state does not exist.

### seek()

Jumps the current frame to a specific value, clamped to the valid range `[0, duration - 1]`. Does not record a transition or modify state.

### reset()

Resets the frame to 0. If a `stateName` argument is provided, also switches to that state (throws if it does not exist). Does **not** clear transition history.

### resolveAt()

Returns the resolved frame data for a given state and frame index **without** modifying the machine's internal position. Useful for previewing or inspecting arbitrary frames.

### playThrough()

Convenience method for batch processing. Resets the frame to 0, then calls `onFrame` for every frame from 0 through `duration - 1` (inclusive). After this call, the machine's frame will be at `duration - 1`.

---

## Template System API

**Source:** `packages/core/src/templates/template-resolver.ts`

### Variable Definition

Variables are declared on a document's `variables` record. Each entry is keyed by variable name.

```typescript
type VariableType = "string" | "number" | "color" | "asset" | "boolean";

interface Variable {
  type: VariableType;
  default?: unknown;       // if omitted, the variable is required
  description?: string;
}
```

### instantiateTemplate

```typescript
function instantiateTemplate(
  template: AtelierDocument,
  bindings: TemplateBindings,
): TemplateResult;

type TemplateBindings = { [variableName: string]: unknown };

type TemplateResult =
  | { success: true; document: AtelierDocument }
  | { success: false; errors: TemplateError[] };

interface TemplateError {
  variable: string;
  message: string;
}
```

Processing steps:

1. **Validate required variables.** Any variable without a `default` must have a corresponding binding. Missing ones produce a `TemplateError` with `"Required variable \"<name>\" not provided"`.
2. **Reject unknown bindings.** Any binding key that does not match a declared variable produces a `TemplateError` with `"Unknown variable \"<name>\""`. This catches typos early.
3. **Merge bindings with defaults.** Provided bindings take precedence; otherwise the default value is used.
4. **Deep clone the document.** The original template is never mutated.
5. **Recursive substitution.** All string values in the cloned document tree are scanned for `{{variableName}}` patterns.
6. **Type preservation.** If an entire string value is exactly `{{var}}` (no surrounding text), the raw bound value is inserted, preserving its original type. A bound number stays a number; a bound object stays an object. If the pattern is embedded within a larger string (e.g., `"Hello {{name}}"`), the bound value is stringified and interpolated.
7. **Strip variables section.** The output document's `variables` field is deleted. The result is a concrete document, not a template.

### findTemplateVariables

```typescript
function findTemplateVariables(doc: AtelierDocument): string[];
```

Scans the entire document tree for `{{variableName}}` patterns in string values. Returns a deduplicated array of variable names found. Useful for inspecting which variables a template actually uses, regardless of what is declared in the `variables` section.

---

## Tutorials

### 1. Basic State Machine Usage

Build a document with two states -- "intro" and "outro" -- then drive playback with `StateMachine`.

```typescript
import { createDocument, StateMachine } from "@atelier/core";

const doc = createDocument("Multi-State", { width: 600, height: 400, fps: 60 })
  .addLayer({
    id: "box",
    visual: {
      type: "shape",
      shape: { type: "rect" },
      fill: { type: "solid", color: "#e94560" },
    },
    frame: { x: 100, y: 150 },
    bounds: { width: 100, height: 100 },
    opacity: 0,
  })
  .addState("intro", { duration: 60 })
  .addDelta("intro", {
    layer: "box",
    property: "opacity",
    range: [0, 30],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .addState("outro", { duration: 60 })
  .addDelta("outro", {
    layer: "box",
    property: "opacity",
    range: [0, 30],
    from: 1,
    to: 0,
    easing: "ease-in",
  })
  .build();

const sm = new StateMachine(doc, "intro");

// Play through the intro state
while (!sm.isComplete) {
  const { resolved } = sm.tick();
  renderFrame(ctx, resolved, doc); // your rendering function
}

// Transition to outro
sm.transition("outro");

// Play through the outro state
while (!sm.isComplete) {
  const { resolved } = sm.tick();
  renderFrame(ctx, resolved, doc);
}
```

The machine starts at frame 0 of "intro". Each `tick()` resolves one frame and advances. When `isComplete` becomes true, the caller transitions to "outro" and plays through that state the same way.

### 2. Traffic Light Example

A traffic light with three states -- red, yellow, green. Each state brightens its light while dimming the others. This mirrors the `states-traffic-light` example in the Atelier showcase.

```typescript
import { createDocument, StateMachine } from "@atelier/core";

const doc = createDocument("Traffic Light", {
  width: 600,
  height: 400,
  fps: 60,
  background: "#1E1E1E",
})
  // Housing
  .addLayer({
    id: "housing",
    visual: {
      type: "shape",
      shape: { type: "rect", cornerRadius: 20 },
      fill: { type: "solid", color: "#363636" },
    },
    frame: { x: 245, y: 30 },
    bounds: { width: 110, height: 340 },
  })
  // Three lights -- all start dim
  .addLayer({
    id: "red-light",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#C75B39" },
    },
    frame: { x: 265, y: 55 },
    bounds: { width: 70, height: 70 },
    opacity: 0.2,
  })
  .addLayer({
    id: "yellow-light",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#D4A574" },
    },
    frame: { x: 265, y: 160 },
    bounds: { width: 70, height: 70 },
    opacity: 0.2,
  })
  .addLayer({
    id: "green-light",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#7A8B6F" },
    },
    frame: { x: 265, y: 265 },
    bounds: { width: 70, height: 70 },
    opacity: 0.2,
  })
  // --- RED state: red brightens, others dim ---
  .addState("red", { duration: 120, description: "Red light active" })
  .addDelta("red", {
    layer: "red-light",
    property: "opacity",
    range: [0, 30],
    from: 0.2,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("red", {
    layer: "yellow-light",
    property: "opacity",
    range: [0, 20],
    from: 0.6,
    to: 0.2,
    easing: "ease-out",
  })
  .addDelta("red", {
    layer: "green-light",
    property: "opacity",
    range: [0, 20],
    from: 0.6,
    to: 0.2,
    easing: "ease-out",
  })
  // --- YELLOW state: yellow brightens ---
  .addState("yellow", { duration: 90, description: "Yellow light active" })
  .addDelta("yellow", {
    layer: "yellow-light",
    property: "opacity",
    range: [0, 25],
    from: 0.2,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("yellow", {
    layer: "red-light",
    property: "opacity",
    range: [0, 20],
    from: 1,
    to: 0.2,
    easing: "ease-out",
  })
  // --- GREEN state: green brightens ---
  .addState("green", { duration: 120, description: "Green light active" })
  .addDelta("green", {
    layer: "green-light",
    property: "opacity",
    range: [0, 25],
    from: 0.2,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("green", {
    layer: "yellow-light",
    property: "opacity",
    range: [0, 20],
    from: 1,
    to: 0.2,
    easing: "ease-out",
  })
  .build();

// Drive the traffic light through a full cycle
const sm = new StateMachine(doc, "red");

const cycle = ["red", "green", "yellow"] as const;
let step = 0;

function playCurrentState() {
  while (!sm.isComplete) {
    const { resolved } = sm.tick();
    renderFrame(ctx, resolved, doc);
  }
  // Move to next state in the cycle
  step = (step + 1) % cycle.length;
  sm.transition(cycle[step]);
}

// Play three full cycles
for (let i = 0; i < 3 * cycle.length; i++) {
  playCurrentState();
}
```

Each state's deltas handle the crossfade: the active light ramps from 0.2 to 1.0 while the previously active light fades from its bright value back to 0.2. The `StateMachine` does not auto-transition -- the application logic decides when to move to the next light.

### 3. Transition History

Every call to `transition()` appends a record to the read-only `history` array. This is useful for debugging, analytics, or replaying a user's state path.

```typescript
const sm = new StateMachine(doc, "red");

// Play through red, then transition to yellow
while (!sm.isComplete) sm.tick();
sm.transition("yellow");

// Play through yellow, then transition to green
while (!sm.isComplete) sm.tick();
sm.transition("green");

console.log(sm.history);
// [
//   { from: "red",    to: "yellow", at: 119 },
//   { from: "yellow", to: "green",  at: 89  }
// ]
```

The `at` field records the frame index in the **source** state where the transition happened. In this example, frame 119 is the last frame of the "red" state (duration 120), and frame 89 is the last frame of "yellow" (duration 90).

### 4. Server-Side Batch Processing with playThrough

`playThrough()` resolves every frame in the current state without requiring a manual loop. This is ideal for server-side rendering, pre-computing sprite sheets, or exporting to video.

```typescript
import { StateMachine } from "@atelier/core";
import type { ResolvedFrame } from "@atelier/core";

const sm = new StateMachine(doc, "intro");

const frames: ResolvedFrame[] = [];
sm.playThrough(({ resolved }) => {
  frames.push(resolved);
});

console.log(`Captured ${frames.length} frames`); // equals doc.states.intro.duration
```

After `playThrough` completes, the machine's frame is at `duration - 1`. You can then call `transition()` to move to the next state and call `playThrough()` again.

```typescript
// Capture all states sequentially
const allFrames: Map<string, ResolvedFrame[]> = new Map();

for (const name of sm.stateNames) {
  if (sm.state !== name) sm.transition(name);
  else sm.reset();

  const stateFrames: ResolvedFrame[] = [];
  sm.playThrough(({ resolved }) => stateFrames.push(resolved));
  allFrames.set(name, stateFrames);
}
```

### 5. Creating a Template

A template is an ordinary `AtelierDocument` with a `variables` section. Use the builder's `.variable()` method to declare each variable.

```typescript
import { createDocument } from "@atelier/core";

const template = createDocument("Notification", { width: 600, height: 100, fps: 60 })
  // Declare variables
  .variable("message", {
    type: "string",
    description: "Notification text",
  })
  .variable("iconColor", {
    type: "color",
    default: "#4CAF50",
    description: "Status icon color",
  })
  // Layers reference variables with {{name}} syntax
  .addLayer({
    id: "text",
    visual: {
      type: "text",
      content: "{{message}}",
      style: {
        fontFamily: "sans-serif",
        fontSize: 16,
        color: "#FFFFFF",
      },
    },
    frame: { x: 50, y: 40 },
    bounds: { width: 500, height: 24 },
  })
  .addLayer({
    id: "icon",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "{{iconColor}}" },
    },
    frame: { x: 10, y: 35 },
    bounds: { width: 30, height: 30 },
  })
  .addState("show", { duration: 120 })
  .addDelta("show", {
    layer: "text",
    property: "opacity",
    range: [0, 20],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .build();
```

Variable rules:

- A variable with no `default` is **required** -- instantiation fails without a binding for it.
- A variable with a `default` is **optional** -- the default is used when no binding is provided.
- Supported types: `"string"`, `"number"`, `"color"`, `"asset"`, `"boolean"`.
- The `description` field is informational and does not affect substitution.

### 6. Instantiating a Template

Pass the template document and a bindings object to `instantiateTemplate`. The return value is a discriminated union: check `result.success` before accessing the document.

```typescript
import { instantiateTemplate } from "@atelier/core";

const result = instantiateTemplate(template, {
  message: "File saved successfully",
  iconColor: "#4CAF50",
});

if (result.success) {
  const doc = result.document;
  // doc.variables is undefined -- no longer a template
  // "{{message}}" has been replaced with "File saved successfully"
  // "{{iconColor}}" has been replaced with "#4CAF50"

  // Use the document normally
  const sm = new StateMachine(doc, "show");
  sm.playThrough(({ resolved }) => renderFrame(ctx, resolved, doc));
}
```

Using defaults:

```typescript
// Only provide the required variable; iconColor falls back to "#4CAF50"
const result = instantiateTemplate(template, {
  message: "Upload complete",
});
```

Type preservation in action:

```typescript
const tmpl = createDocument("Positioned", { width: 400, height: 400, fps: 30 })
  .variable("xPos", { type: "number", default: 10 })
  .addLayer({
    id: "dot",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#FFF" },
    },
    frame: { x: "{{xPos}}" as unknown as number, y: 50 },
    bounds: { width: 20, height: 20 },
  })
  .addState("idle", { duration: 1 })
  .build();

const result = instantiateTemplate(tmpl, { xPos: 200 });
if (result.success) {
  // result.document.layers[0].frame.x is the number 200, not the string "200"
  console.log(typeof result.document.layers[0].frame.x); // "number"
}
```

Because `"{{xPos}}"` is the entire string value (an exact match), the substitution returns the raw bound value `200` as a number. If the pattern were embedded in a larger string like `"x is {{xPos}}px"`, the result would be the string `"x is 200px"`.

### 7. Finding Variables

`findTemplateVariables` scans a document for all `{{variableName}}` patterns and returns the variable names it finds. This is independent of the `variables` section -- it reports what is actually referenced in the document tree.

```typescript
import { findTemplateVariables } from "@atelier/core";

const vars = findTemplateVariables(template);
console.log(vars); // ["message", "iconColor"]
```

This is useful for:

- Building UI forms that expose a template's customization points.
- Validating that declared variables are actually used.
- Detecting undeclared variables that appear in the document but are not in the `variables` section.

### 8. Error Handling

`instantiateTemplate` returns errors rather than throwing. Always check `result.success`.

**Missing a required variable:**

```typescript
const result = instantiateTemplate(template, {
  // "message" is required but not provided
});

if (!result.success) {
  for (const err of result.errors) {
    console.error(`${err.variable}: ${err.message}`);
  }
  // Output:
  // message: Required variable "message" not provided
}
```

**Unknown variable name (typo protection):**

```typescript
const result = instantiateTemplate(template, {
  message: "Hello",
  mesage: "typo",  // not a declared variable
});

if (!result.success) {
  for (const err of result.errors) {
    console.error(`${err.variable}: ${err.message}`);
  }
  // Output:
  // mesage: Unknown variable "mesage"
}
```

**Multiple errors at once:**

Both missing and unknown variable errors are collected and returned together, so you can report all problems in a single pass rather than fixing them one at a time.

```typescript
const result = instantiateTemplate(template, {
  unknownA: "x",
  unknownB: "y",
  // "message" is also missing
});

if (!result.success) {
  console.log(`${result.errors.length} errors found`);
  // 3 errors: missing "message", unknown "unknownA", unknown "unknownB"
}
```

**Document with no variables:**

If a document has no `variables` section, calling `instantiateTemplate` with an empty bindings object succeeds. This is a no-op -- the document is returned as-is (minus the absent `variables` key).

```typescript
const plain = createDocument("Plain", { width: 100, height: 100, fps: 30 })
  .addLayer({ /* ... */ })
  .addState("idle", { duration: 1 })
  .build();

const result = instantiateTemplate(plain, {});
// result.success === true
```
