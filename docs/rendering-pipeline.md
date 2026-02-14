---
title: Rendering Pipeline
scope: Three-stage pipeline from document definition to canvas pixels
packages: ["@atelier/core", "@atelier/canvas"]
related: ["docs/format-spec.md", "docs/architecture.md", "packages/core/README.md", "packages/canvas/README.md"]
---

# Rendering Pipeline

Atelier uses a three-stage rendering pipeline that transforms a declarative
animation document into pixels on a canvas. Each stage has a single
responsibility, a clear input/output contract, and no knowledge of the stages
around it.

```
                          DOCUMENT                RESOLVE                 RENDER
                       (declaration)            (computation)           (rasterization)

  .atelier file    AtelierDocument         ResolvedFrame            Canvas 2D context
  +-----------+    +---------------+       +---------------+        +---------------+
  | canvas    |    | canvas        |       | frame: 12     |        |               |
  | layers[]  | -> | layers[]      |  -->  | stateName     |  --->  |   [pixels]    |
  | states{}  |    | states{}      |       | layers[]      |        |               |
  +-----------+    +---------------+       |   .computed   |        +---------------+
                                           +---------------+

                   resolveFrame(doc,        renderFrame(ctx,
                     state, frame)            resolved, doc)

  @atelier/types     @atelier/core            @atelier/canvas
```

The pipeline is invoked once per frame. For a 60fps animation, the host calls
`resolveFrame` then `renderFrame` 60 times per second, advancing the frame
counter each tick.


## Stage 1: Document (Types)

**Package:** `@atelier/types`

The document is the static, declarative description of an animation. It never
changes at runtime. All mutation happens in the resolve stage through deltas.

### AtelierDocument

```typescript
// packages/types/src/document.ts
interface AtelierDocument {
  version: string;
  name: string;
  description?: string;
  tags?: string[];
  canvas: Canvas;
  variables?: Record<string, Variable>;
  assets?: Record<string, Asset>;
  presets?: Record<string, Preset>;
  layers: Layer[];
  states: Record<string, State>;
}
```

### Canvas

Defines the viewport dimensions and timing.

```typescript
// packages/types/src/document.ts
interface Canvas {
  width: number;      // pixels
  height: number;     // pixels
  fps: number;        // frames per second
  background?: string; // CSS color string
}
```

### Layer

A layer is a positioned visual element. Layers are ordered by array index using
the painters algorithm: the first layer in the array is drawn first (back),
the last is drawn last (front).

```typescript
// packages/types/src/layer.ts
interface Layer {
  id: string;
  description?: string;
  tags?: string[];
  visual: Visual;            // shape | text | image | group | ref
  frame: Frame;              // { x: UnitValue, y: UnitValue }
  bounds: Bounds;            // { width: UnitValue, height: UnitValue }
  anchorPoint?: AnchorPoint; // { x: number, y: number } normalized 0-1
  parentId?: string;         // parent layer for transform inheritance
  opacity?: number;          // 0-1
  rotation?: number;         // degrees
  scale?: { x: number; y: number };
  visible?: boolean;
}
```

The `UnitValue` type accepts either a pixel number or a percentage string
(e.g., `"50%"`). Percentage values are resolved against the canvas dimensions
during the render stage.

### Visual Types

| Type      | Description                        | Status       |
|-----------|------------------------------------|--------------|
| `shape`   | Rect, ellipse, or path geometry    | Implemented  |
| `text`    | Styled text content                | Implemented  |
| `image`   | Reference to an asset by ID        | Deferred     |
| `group`   | Structural container (no visual)   | Deferred     |
| `ref`     | Reference to another .atelier file | Deferred     |

### State

A named animation choreography. Each state defines a duration and a set of
deltas that animate layer properties over time.

```typescript
// packages/types/src/state.ts
interface State {
  description?: string;
  tags?: string[];
  duration: number;   // total duration in frames
  deltas: Delta[];    // animation instructions
}
```

### Delta

A delta is a single property animation instruction. It targets one property
on one layer over a frame range.

```typescript
// packages/types/src/delta.ts
interface Delta {
  id?: string;
  layer: string;               // target layer ID
  property: AnimatableProperty; // which property to animate
  range: FrameRange;           // [startFrame, endFrame] inclusive, 0-based
  from: unknown;               // value at range start
  to: unknown;                 // value at range end
  easing?: Easing;             // timing function
  description?: string;
  tags?: string[];
}
```

### Animatable Properties

The 16 properties that can be targeted by deltas:

| Property                     | Type             | Description                    |
|------------------------------|------------------|--------------------------------|
| `frame.x`                   | number / string  | Horizontal position            |
| `frame.y`                   | number / string  | Vertical position              |
| `bounds.width`              | number / string  | Layer width                    |
| `bounds.height`             | number / string  | Layer height                   |
| `opacity`                   | number           | Transparency (0-1)             |
| `rotation`                  | number           | Rotation in degrees            |
| `scale.x`                   | number           | Horizontal scale factor        |
| `scale.y`                   | number           | Vertical scale factor          |
| `anchorPoint.x`             | number           | Anchor X (0-1 normalized)      |
| `anchorPoint.y`             | number           | Anchor Y (0-1 normalized)      |
| `visual.shape.cornerRadius` | number           | Rect corner radius             |
| `visual.fill.color`         | string           | Fill color (hex)               |
| `visual.stroke.color`       | string           | Stroke color (hex)             |
| `visual.stroke.width`       | number           | Stroke thickness               |
| `visual.style.fontSize`     | number           | Text font size                 |
| `visual.style.color`        | string           | Text color (hex)               |

### Easing

Easing controls the rate of change over the delta's frame range. It can be a
named preset string or a typed object.

```typescript
// packages/types/src/easing.ts
type Easing =
  | "ease-in" | "ease-out" | "ease-in-out"         // presets
  | { type: "linear" }                              // constant speed
  | { type: "cubic-bezier"; x1; y1; x2; y2 }       // CSS-compatible bezier
  | { type: "spring"; mass?; stiffness?; damping?; velocity? }  // physics
  | { type: "step"; steps; position?: "start"|"end" }           // discrete
```


## Stage 2: Resolve (Core)

**Package:** `@atelier/core`
**Entry point:** `packages/core/src/resolver/frame-resolver.ts`

The resolve stage computes the effective value of every animated property at a
specific frame number. It takes the immutable document and produces a
`ResolvedFrame` -- a snapshot of all layers with their computed overrides.

### resolveFrame

```typescript
// packages/core/src/resolver/frame-resolver.ts
function resolveFrame(
  doc: AtelierDocument,
  stateName: string,
  frame: number,
): ResolvedFrame
```

**Algorithm:**

1. Look up the named state in `doc.states[stateName]`. Throws if not found.
2. Call `groupDeltas(state.deltas)` to build a `Map<layerID, Map<property, Delta[]>>`.
3. Iterate `doc.layers` in order. For each layer:
   a. Look up the layer's deltas from the grouped map.
   b. For each animated property, call `resolvePropertyAtFrame(deltas, frame)`.
   c. Collect non-undefined results into `computedProperties`.
4. Return a `ResolvedFrame` with all layers.

### ResolvedFrame and ResolvedLayer

```typescript
// packages/core/src/resolver/frame-resolver.ts
interface ResolvedFrame {
  frame: number;
  stateName: string;
  layers: ResolvedLayer[];
}

interface ResolvedLayer {
  id: string;
  layer: Layer;               // original layer reference (unmodified)
  computedProperties: Partial<Record<AnimatableProperty, unknown>>;
}
```

The `computedProperties` map contains **only** the properties that have active
or completed deltas. Properties with no deltas are absent from the map; the
render stage falls back to the layer's default values.

### groupDeltas

```
groupDeltas(deltas: Delta[]) -> Map<layerID, Map<property, Delta[]>>
```

Organizes a flat delta array into a two-level map for O(1) lookup per
layer+property combination.

### resolvePropertyAtFrame

```typescript
// packages/core/src/resolver/delta-resolver.ts
function resolvePropertyAtFrame(
  deltas: Delta[],
  frame: number,
): unknown | undefined
```

This is the core resolution logic for a single layer+property pair. Given all
deltas that target the same layer and property, it determines the value at the
requested frame.

**Algorithm:**

```
for each delta:
    if frame is within [range[0], range[1]]:
        return interpolated value (active delta)

-- no active delta found --

for each delta:
    if frame > range[1]:
        track the delta with the latest range[1]

return lastCompleted.to   // hold-after-end
```

There are three possible outcomes:

| Condition               | Result                        | Source                          |
|--------------------------|-------------------------------|---------------------------------|
| Frame is within a range | Interpolated value            | `resolveDeltaValue(delta, frame)` |
| Frame is after all ranges | Held `to` value of last delta | `lastCompleted.to`              |
| Frame is before all ranges | `undefined`                 | Layer default used in render    |

### resolveDeltaValue

```typescript
// packages/core/src/resolver/delta-resolver.ts
function resolveDeltaValue(delta: Delta, frame: number): unknown | undefined
```

Resolves a single delta at a frame:

1. `isFrameInRange(frame, range)` -- range check, inclusive on both ends.
2. `computeProgress(frame, range)` -- normalized progress `(frame - start) / (end - start)`, clamped to [0, 1]. Instantaneous deltas (start === end) return progress 1.
3. `resolveEasing(delta.easing)` -- convert the easing definition to a `(t) => number` function.
4. `easingFn(progress)` -- apply the easing curve.
5. `interpolateValue(from, to, easedProgress)` -- compute the final value.

### interpolateValue

```typescript
// packages/core/src/resolver/delta-resolver.ts
function interpolateValue(from: unknown, to: unknown, t: number): unknown
```

| from/to types     | Behavior                                      |
|-------------------|-----------------------------------------------|
| Both numbers      | `lerp(from, to, t)` from `@atelier/math`      |
| Both strings      | Snap: returns `from` while `t < 1`, then `to` |
| Other / mismatch  | Snap: returns `from` while `t < 1`, then `to` |

String values (hex colors, percentage strings) currently use snap interpolation.
Smooth color interpolation would require the math package's `hexToRgba` /
`lerpRgba` / `rgbaToHex` pipeline, which is available but not yet wired into
the delta resolver.

### resolveEasing

```typescript
// packages/core/src/resolver/easing-resolver.ts
function resolveEasing(easing: Easing | undefined): (t: number) => number
```

Bridges the type-level easing definitions to executable functions from
`@atelier/math`:

| Easing input                        | Resolved function                              |
|-------------------------------------|-------------------------------------------------|
| `undefined`                         | `linear` (identity)                             |
| `"ease-in"`                         | `cubicBezier(0.42, 0, 1, 1)`                   |
| `"ease-out"`                        | `cubicBezier(0, 0, 0.58, 1)`                   |
| `"ease-in-out"`                     | `cubicBezier(0.42, 0, 0.58, 1)`                |
| `{ type: "linear" }`               | `linear`                                        |
| `{ type: "cubic-bezier", ... }`     | `cubicBezier(x1, y1, x2, y2)`                  |
| `{ type: "spring", ... }`          | `spring({ mass, stiffness, damping, velocity })` |
| `{ type: "step", steps, position }` | `step(steps, position)`                         |

**Cubic bezier** uses binary search (20 iterations) to solve the parametric
equation, matching the CSS `cubic-bezier()` specification.

**Spring** implements a damped harmonic oscillator with three regimes:
underdamped (zeta < 1, oscillates), critically damped (zeta = 1), and
overdamped (zeta > 1). The physical time is normalized to [0, 1] by estimating
the settle time.

**Step** divides the range into discrete jumps. The `position` parameter
controls whether the jump happens at the start or end of each interval.


## Stage 3: Render (Canvas)

**Package:** `@atelier/canvas`
**Entry point:** `packages/canvas/src/render-frame.ts`

The render stage takes a `ResolvedFrame` and draws it onto a Canvas 2D
context. It handles coordinate transforms, property merging, and visual
dispatch.

### renderFrame

```typescript
// packages/canvas/src/render-frame.ts
function renderFrame(
  ctx: RenderContext,
  resolvedFrame: ResolvedFrame,
  doc: AtelierDocument,
): void
```

**Algorithm:**

1. **Clear and fill background:**
   Set `fillStyle` to `doc.canvas.background` (or `"transparent"`) and fill
   the entire canvas.

2. **Iterate layers in order** (painters algorithm -- index 0 is the back).

3. **For each layer:**
   a. Skip if `layer.visible === false`.
   b. Build an `EffectiveLayer` by merging computed properties over defaults.
   c. Skip if `opacity <= 0`.
   d. `ctx.save()`.
   e. Apply `globalAlpha`, translation, anchor-relative rotation/scale.
   f. Dispatch to the appropriate visual renderer.
   g. `ctx.restore()`.

### buildEffectiveLayer

```typescript
// packages/canvas/src/apply-properties.ts
function buildEffectiveLayer(
  resolved: ResolvedLayer,
  parentWidth: number,
  parentHeight: number,
): EffectiveLayer
```

Merges resolved animation values over the layer's default values and resolves
percentage units to pixels.

```typescript
interface EffectiveLayer {
  layer: Layer;         // original layer reference
  x: number;           // resolved position X in pixels
  y: number;           // resolved position Y in pixels
  width: number;       // resolved width in pixels
  height: number;      // resolved height in pixels
  opacity: number;     // 0-1
  rotation: number;    // degrees
  scaleX: number;      // scale factor
  scaleY: number;      // scale factor
  anchorX: number;     // 0-1 normalized
  anchorY: number;     // 0-1 normalized
}
```

**Property resolution order** (first non-undefined wins):

```
computedProperties["frame.x"]  ??  layer.frame.x  ??  0
```

**Percentage resolution:**
If the value is a string ending in `%`, it is resolved against the parent
dimension: `parseFloat(value) / 100 * reference`.

| Property       | Reference dimension |
|----------------|---------------------|
| `x`, `width`   | `parentWidth` (canvas width) |
| `y`, `height`  | `parentHeight` (canvas height) |

### Transform Stack

The transform stack applies position, rotation, and scale around the layer's
anchor point. All transforms use the Canvas 2D context's matrix operations.

```
Canvas origin (0,0)
       |
       v
  1. translate(x, y)             -- move to layer position
       |
       v
  2. translate(anchorPx, anchorPy)  -- move to anchor point
       |                              (anchorX * width, anchorY * height)
       v
  3. rotate(radians)              -- rotate around anchor
       |
       v
  4. scale(scaleX, scaleY)       -- scale around anchor
       |
       v
  5. translate(-anchorPx, -anchorPy) -- offset back so (0,0) is top-left
       |
       v
  6. globalAlpha = opacity        -- set transparency
       |
       v
  [RENDER VISUAL at (0, 0, width, height)]
```

**Important:** Steps 2-5 are only applied when rotation or scale differ from
their defaults (rotation !== 0 or scale !== 1). For layers with no rotation or
scale, only the position translate and opacity are applied.

**Rotation conversion:** Degrees to radians via `rotation * Math.PI / 180`.

### Visual Renderers

#### Shape Renderer

**File:** `packages/canvas/src/renderers/shape-renderer.ts`

Dispatches on `shape.type`:

**Rect:**
- If `fill` is set: apply fill style, then `roundRect(0, 0, w, h, cornerRadius)` (if available and cornerRadius is set) or `fillRect(0, 0, w, h)`.
- If `stroke` is set: apply stroke style, then stroke the same path.
- The `roundRect` method is optional on `RenderContext` since older Canvas implementations may not support it.

**Ellipse:**
- `ctx.ellipse(w/2, h/2, w/2, h/2, 0, 0, 2*PI)` -- centered within bounds.
- Fill and/or stroke the ellipse path.

**Path:**
- `moveTo` to the first point.
- For subsequent points: `bezierCurveTo` if both the previous point has an `out` handle and the current point has an `in` handle; otherwise `lineTo`.
- Control points are relative to their parent point (added to the point's coordinates).
- `closePath()` if `closed` is true.

#### Text Renderer

**File:** `packages/canvas/src/renderers/text-renderer.ts`

1. Build the CSS font string: `"${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}"`.
2. Set `textAlign` and `textBaseline` ("top").
3. Set `fillStyle` to the text color via `colorToCSS()`.
4. Compute the X offset within the bounding box based on alignment:

| textAlign  | textX offset    |
|------------|-----------------|
| `"left"`   | `0`             |
| `"center"` | `width / 2`     |
| `"right"`  | `width`         |

5. `ctx.fillText(content, textX, 0)`.

### Styles

**File:** `packages/canvas/src/styles.ts`

**colorToCSS(color):**
Converts an Atelier `Color` to a CSS string. Accepts hex strings (pass-through),
`RGBAColor` objects (`rgba(r, g, b, a)`), and `HSLAColor` objects
(`hsla(h, s%, l%, a)`).

**applyFill(ctx, fill, width, height):**

| Fill type           | Canvas operation                                        |
|---------------------|---------------------------------------------------------|
| `solid`             | `fillStyle = colorToCSS(color)`                         |
| `linear-gradient`   | `createLinearGradient` computed from angle and dimensions |
| `radial-gradient`   | `createRadialGradient` with center and radius resolution |

**applyStroke(ctx, stroke):**
Sets `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, and `setLineDash`.

### RenderContext

**File:** `packages/canvas/src/canvas-types.ts`

A minimal interface abstracting the Canvas 2D API. It declares only the
methods and properties used by Atelier, avoiding a DOM lib dependency.
Compatible with:

- Browser `CanvasRenderingContext2D` (via `<canvas>` element)
- Node.js `node-canvas` (server-side rendering)
- Any conforming implementation

The `roundRect` method is marked optional (`roundRect?`) for compatibility with
older Canvas implementations.


## Following a Single Pixel

This walkthrough traces how a layer's `frame.x` property with `ease-out`
easing moves from 0 to 300 over frames 0-30 and is sampled at frame 18.

### Document Definition

```yaml
layers:
  - id: "box"
    visual: { type: "shape", shape: { type: "rect" }, fill: { type: "solid", color: "#3366FF" } }
    frame: { x: 0, y: 100 }
    bounds: { width: 80, height: 80 }

states:
  slide:
    duration: 30
    deltas:
      - layer: "box"
        property: "frame.x"
        range: [0, 30]
        from: 0
        to: 300
        easing: "ease-out"
```

### Stage 1: Document

The document is parsed and validated. The delta declares: animate `box.frame.x`
from 0 to 300 over frames 0-30 with ease-out easing.

### Stage 2: Resolve at frame 18

```
resolveFrame(doc, "slide", 18)
```

1. **groupDeltas**: Creates `Map{ "box" => Map{ "frame.x" => [delta] } }`.

2. **resolvePropertyAtFrame([delta], 18)**:
   - `isFrameInRange(18, [0, 30])` --> `true` (18 >= 0 && 18 <= 30).
   - Calls `resolveDeltaValue(delta, 18)`.

3. **resolveDeltaValue**:
   - `computeProgress(18, [0, 30])` --> `(18 - 0) / (30 - 0)` = `0.6`.
   - `resolveEasing("ease-out")` --> `cubicBezier(0, 0, 0.58, 1)`.
   - `easingFn(0.6)` --> `~0.808` (ease-out accelerates early, decelerates late).
   - `interpolateValue(0, 300, 0.808)` --> `lerp(0, 300, 0.808)` = `242.4`.

4. **Result**:
   ```
   ResolvedFrame {
     frame: 18,
     stateName: "slide",
     layers: [{
       id: "box",
       layer: <original>,
       computedProperties: { "frame.x": 242.4 }
     }]
   }
   ```

### Stage 3: Render

```
renderFrame(ctx, resolvedFrame, doc)
```

1. **Clear canvas**: `fillRect(0, 0, canvasWidth, canvasHeight)`.

2. **buildEffectiveLayer**: Merges `computedProperties["frame.x"] = 242.4` over
   layer default `frame.x = 0`. All other properties use defaults.
   ```
   EffectiveLayer { x: 242.4, y: 100, width: 80, height: 80,
                    opacity: 1, rotation: 0, scaleX: 1, scaleY: 1,
                    anchorX: 0, anchorY: 0 }
   ```

3. **Transform**: `ctx.translate(242.4, 100)`. No rotation/scale transforms
   needed (defaults).

4. **Render shape**: Rect with solid fill `#3366FF`.
   `applyFill` --> `fillStyle = "#3366FF"` --> `fillRect(0, 0, 80, 80)`.

5. **Pixel result**: An 80x80 blue rectangle at position (242.4, 100).


## Hold-After-End Behavior

**Fixed in v0.7.1** -- Prior to this fix, when a delta's frame range ended,
the animated property would revert to the layer's default value instead of
holding at the delta's `to` value.

### The Problem

Consider a delta that moves `frame.x` from 0 to 200 over frames [0, 15] in a
state with duration 30. Without hold-after-end:

| Frame | Expected | Before v0.7.1       |
|-------|----------|---------------------|
| 0     | 0        | 0                   |
| 7     | ~100     | ~100                |
| 15    | 200      | 200                 |
| 16    | 200      | 0 (reverted!)       |
| 30    | 200      | 0 (reverted!)       |

### The Fix

`resolvePropertyAtFrame` in `delta-resolver.ts` now checks for completed
deltas when no active delta is found:

```typescript
// No active delta -- hold the `to` value of the most recently completed delta
let lastCompleted: Delta | undefined;
for (const delta of deltas) {
  if (frame > delta.range[1]) {
    if (!lastCompleted || delta.range[1] > lastCompleted.range[1]) {
      lastCompleted = delta;
    }
  }
}
return lastCompleted?.to;
```

When multiple deltas target the same property at different time ranges, the
hold value comes from the delta whose range ended most recently before the
current frame.


## Edge Cases

### No Deltas for a Property

If a layer has no deltas targeting a given property, `computedProperties` will
not contain that key. The render stage falls back to the layer's default
value in `buildEffectiveLayer`:

```typescript
x: resolveUnit((cp["frame.x"] ?? layer.frame.x) as number | string, parentWidth)
```

### Multiple Deltas on the Same Property

Multiple deltas can target the same layer+property as long as their frame
ranges do not overlap. The system assumes no overlaps (enforced by schema
validation's no-overlap rule).

At any given frame:
- **At most one** delta is "active" (frame is within its range).
- If no delta is active, the most recently completed delta's `to` value is held.
- If no delta has completed yet (frame is before all ranges), `undefined` is
  returned and the layer default is used.

```
Frame:   0----5----10----15----20----25----30
Delta A: [====]                              from:0  to:100
Delta B:              [=======]              from:100 to:250

Result:  0..100  100  100..250  250  250  250
         ^^^^^^  ^^^  ^^^^^^^^^  ^^^^^^^^^^
         active  hold  active     hold B
         A       A     B
```

### Color Interpolation

The current delta resolver uses snap interpolation for string values (including
hex colors). A color delta with `from: "#FF0000"` and `to: "#0000FF"` will
display red for the entire range and snap to blue only at `t = 1`.

The `@atelier/math` package provides full RGBA interpolation infrastructure
(`hexToRgba`, `lerpRgba`, `rgbaToHex`) that could be wired in for smooth
color transitions in a future release.

### Percentage Units

Percentage strings (e.g., `"50%"`) in `frame.x`, `frame.y`, `bounds.width`,
or `bounds.height` are resolved to pixel values during the render stage by
`buildEffectiveLayer`:

```typescript
function resolveUnit(value: number | string, reference: number): number {
  if (typeof value === "string" && value.endsWith("%")) {
    return (parseFloat(value) / 100) * reference;
  }
  return value as number;
}
```

Since `interpolateValue` treats string-to-string as snap interpolation,
animating between two percentage values (e.g., from `"10%"` to `"90%"`) will
snap rather than interpolate smoothly. To animate position/size smoothly,
use numeric pixel values.

### Invisible and Transparent Layers

Two optimizations skip unnecessary rendering:

1. **`layer.visible === false`**: The layer is skipped entirely before
   `buildEffectiveLayer` is called. This is a static property (not animatable).

2. **`opacity <= 0`**: After building the effective layer, if opacity is zero
   or negative, the layer is skipped. This catches layers that have been
   animated to full transparency.

### Instantaneous Deltas

When `range[0] === range[1]` (start equals end), `computeProgress` returns 1.
This means the value jumps directly to `to` at that exact frame. Combined with
hold-after-end, this creates a "set value at frame N" behavior.


## Performance Considerations

### Painters Algorithm (No Depth Buffer)

Layers are drawn in array order, front-to-back from the viewer's perspective
(index 0 = furthest back). Every visible layer is drawn every frame regardless
of whether it overlaps with other layers. There is no depth buffer or
occlusion culling.

### No Spatial Culling

All visible layers are rendered every frame, even if they are positioned
entirely outside the canvas viewport. For documents with many off-screen
layers (e.g., layers that slide in from off-screen), this means unnecessary
draw calls.

### Per-Frame Resolution

`resolveFrame` iterates all layers and all deltas every frame. The
`groupDeltas` call builds a new `Map` each frame. For documents with many
layers and deltas, this allocation could become a bottleneck.

**Potential optimizations (not yet implemented):**
- Cache the `groupDeltas` result across frames (it depends only on the state's
  delta array, which is immutable).
- Pre-sort deltas by range start to enable binary search in
  `resolvePropertyAtFrame`.
- Skip layers with no deltas and no visibility changes.

### Canvas 2D State Management

Each layer uses a `save()`/`restore()` pair to isolate its transform and style
state. This is the standard Canvas 2D pattern but has a cost proportional to
the number of layers.

### No GPU Acceleration

The renderer targets Canvas 2D, which is CPU-rasterized in most environments.
For high-layer-count animations, a WebGL or WebGPU backend would provide
better performance, but is out of scope for the current architecture.

### Transform Optimization

The rotation/scale transforms (steps 2-5 of the transform stack) are
conditionally applied: they are skipped when `rotation === 0` and
`scaleX === 1` and `scaleY === 1`. This avoids unnecessary matrix
multiplications for static or translation-only layers.


## Data Flow Summary

```
AtelierDocument (immutable)
  |
  |  doc.states[stateName].deltas
  |
  v
groupDeltas(deltas)
  |
  |  Map<layerId, Map<property, Delta[]>>
  |
  v
resolvePropertyAtFrame(deltas, frame)     -- per layer, per property
  |
  |  isFrameInRange -> computeProgress -> resolveEasing -> interpolateValue
  |                                         |
  |                                    @atelier/math
  |                                    (lerp, cubicBezier, spring, step)
  |
  v
ResolvedFrame { layers: ResolvedLayer[] }
  |
  |  computedProperties per layer
  |
  v
buildEffectiveLayer(resolved, canvasW, canvasH)
  |
  |  merge computed over defaults, resolve % units
  |
  v
EffectiveLayer { x, y, width, height, opacity, rotation, scaleX, scaleY, ... }
  |
  |  transform stack + visual dispatch
  |
  v
Canvas 2D pixels
```


## File Reference

### @atelier/types

| File                       | Purpose                              |
|----------------------------|--------------------------------------|
| `src/document.ts`          | `AtelierDocument`, `Canvas`          |
| `src/layer.ts`             | `Layer`, `Visual` union              |
| `src/delta.ts`             | `Delta`, `AnimatableProperty`, `FrameRange` |
| `src/state.ts`             | `State`                              |
| `src/easing.ts`            | `Easing` type union                  |
| `src/shape.ts`             | `Shape`, `Fill`, `Stroke`, `TextStyle` |
| `src/coordinates.ts`       | `Frame`, `Bounds`, `AnchorPoint`     |
| `src/color.ts`             | `Color`, `RGBAColor`, `HSLAColor`    |
| `src/units.ts`             | `UnitValue`, `Pixel`, `Percentage`   |

### @atelier/core

| File                            | Purpose                           |
|---------------------------------|-----------------------------------|
| `src/resolver/frame-resolver.ts`  | `resolveFrame`, `ResolvedFrame`, `ResolvedLayer` |
| `src/resolver/delta-resolver.ts`  | `resolvePropertyAtFrame`, `interpolateValue`, `computeProgress` |
| `src/resolver/easing-resolver.ts` | `resolveEasing` -- bridges types to math functions |

### @atelier/math

| File              | Purpose                                    |
|-------------------|--------------------------------------------|
| `src/lerp.ts`     | `lerp`, `clamp`, `lerpArray`, `remap`      |
| `src/easing.ts`   | `linear`, `cubicBezier`, `easeIn/Out/InOut`, `step` |
| `src/spring.ts`   | `spring` -- damped harmonic oscillator     |
| `src/color.ts`    | `hexToRgba`, `rgbaToHex`, `lerpRgba`, `lerpHsla` |

### @atelier/canvas

| File                             | Purpose                          |
|----------------------------------|----------------------------------|
| `src/render-frame.ts`            | `renderFrame` -- main entry point |
| `src/apply-properties.ts`        | `buildEffectiveLayer`, `EffectiveLayer` |
| `src/renderers/shape-renderer.ts` | `renderShape` -- rect, ellipse, path |
| `src/renderers/text-renderer.ts`  | `renderText` -- styled text       |
| `src/styles.ts`                   | `colorToCSS`, `applyFill`, `applyStroke` |
| `src/canvas-types.ts`            | `RenderContext` -- minimal Canvas 2D interface |


## Related Documents

- [Format Specification](format-spec.md) -- Full .atelier document schema
- [Architecture](architecture.md) -- Package dependency graph and design decisions
- [Core Package](../packages/core/README.md) -- Resolver API reference
- [Canvas Package](../packages/canvas/README.md) -- Renderer API reference
