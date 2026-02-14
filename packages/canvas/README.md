---
title: "@atelier/canvas"
scope: Canvas 2D renderer — renderFrame, shape/text renderers, RenderContext, styles
packages: ["@atelier/canvas"]
related: ["docs/rendering-pipeline.md", "docs/architecture.md", "packages/core/README.md"]
---

# @atelier/canvas

Canvas 2D renderer and playback controller for Atelier animation documents. Takes a resolved frame from `@atelier/core` and draws it to any Canvas 2D-compatible context -- browser `CanvasRenderingContext2D`, `node-canvas`, or any object that implements the `RenderContext` interface.

## Package Info

| Field | Value |
|-------|-------|
| **Name** | `@atelier/canvas` |
| **Version** | `0.1.0` |
| **Description** | Canvas 2D renderer and playback controller |
| **Dependencies** | `@atelier/types` (workspace), `@atelier/core` (workspace) |
| **Build** | tsup (ESM + CJS + DTS, with sourcemaps) |
| **Source** | `packages/canvas/src/` |
| **Entry** | `src/index.ts` |

## Installation

```bash
pnpm add @atelier/canvas
```

This package requires its workspace siblings `@atelier/types` and `@atelier/core`.

## Exports

```typescript
// Main render entry
export { renderFrame } from "./render-frame.js";

// Types
export type { RenderContext, GradientLike } from "./canvas-types.js";
export type { EffectiveLayer } from "./apply-properties.js";

// Utilities (useful for custom renderers)
export { buildEffectiveLayer } from "./apply-properties.js";
export { colorToCSS, applyFill, applyStroke } from "./styles.js";
export { renderShape } from "./renderers/shape-renderer.js";
export { renderText } from "./renderers/text-renderer.js";
```

## Usage

```typescript
import { resolveFrame } from "@atelier/core";
import { renderFrame } from "@atelier/canvas";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const resolved = resolveFrame(doc, "intro", frameNumber);
renderFrame(ctx, resolved, doc);
```

For a playback loop:

```typescript
import { resolveFrame } from "@atelier/core";
import { renderFrame } from "@atelier/canvas";

function animate(doc: AtelierDocument, sceneName: string) {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let frame = 0;

  function tick() {
    const resolved = resolveFrame(doc, sceneName, frame);
    renderFrame(ctx, resolved, doc);
    frame++;
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}
```

## Modules

The package contains five modules, each with a single responsibility.

---

### 1. render-frame.ts -- Main Entry

**File:** `packages/canvas/src/render-frame.ts`

```typescript
function renderFrame(
  ctx: RenderContext,
  resolvedFrame: ResolvedFrame,
  doc: AtelierDocument,
): void;
```

The top-level render function. Clears the canvas and draws all visible layers for a single resolved frame.

**Algorithm:**

1. **Clear canvas** with `doc.canvas.background` (falls back to `"transparent"` if unset).
2. **Iterate layers** in order (painters algorithm -- first layer in the array = backmost).
3. **Skip invisible layers**: layers with `visible === false` are skipped entirely.
4. **Build effective layer**: call `buildEffectiveLayer()` to merge computed animation properties over layer defaults.
5. **Skip fully transparent layers**: layers with `opacity <= 0` are skipped after property computation.
6. **For each visible layer:**
   - `ctx.save()` -- push state
   - Apply `globalAlpha` (opacity)
   - `translate(x, y)` to layer position
   - Apply anchor-relative rotation and scale: translate to anchor point, rotate (degrees to radians), scale, translate back
   - Dispatch to type-specific renderer based on `layer.visual.type`:
     - `"shape"` calls `renderShape()`
     - `"text"` calls `renderText()`
     - `"image"`, `"group"`, `"ref"` -- deferred (not yet implemented)
   - `ctx.restore()` -- pop state

---

### 2. canvas-types.ts -- RenderContext Interface

**File:** `packages/canvas/src/canvas-types.ts`

```typescript
interface RenderContext {
  // State
  save(): void;
  restore(): void;

  // Transform
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;

  // Rect
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;

  // Path
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number, cp1y: number,
    cp2x: number, cp2y: number,
    x: number, y: number,
  ): void;
  fill(): void;
  stroke(): void;

  // Ellipse
  ellipse(
    x: number, y: number,
    radiusX: number, radiusY: number,
    rotation: number, startAngle: number, endAngle: number,
  ): void;

  // Rounded rect (optional -- fallback to fillRect/strokeRect if absent)
  roundRect?(x: number, y: number, w: number, h: number, radii: number | number[]): void;

  // Text
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;

  // Style properties
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;

  // Line dash
  setLineDash(segments: number[]): void;

  // Gradient factories
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;

  // Canvas dimensions
  canvas: { width: number; height: number };
}

interface GradientLike {
  addColorStop(offset: number, color: string): void;
}
```

This is a **minimal subset** of the Canvas 2D API. It includes only the methods and properties that the Atelier renderer actually uses, which means:

- It is compatible with browser `CanvasRenderingContext2D` out of the box.
- It is compatible with `node-canvas` (server-side rendering).
- It avoids any dependency on the DOM `lib` typings, keeping the package environment-agnostic.
- Custom implementations can be provided for testing or alternative render targets.

The `roundRect` method is marked optional (`roundRect?`) because it is not available in all environments. When absent, the shape renderer falls back to `fillRect`/`strokeRect`.

---

### 3. apply-properties.ts -- Effective Layer Computation

**File:** `packages/canvas/src/apply-properties.ts`

```typescript
interface EffectiveLayer {
  layer: Layer;          // Original layer reference
  x: number;             // Effective X position (px)
  y: number;             // Effective Y position (px)
  width: number;         // Effective width (px)
  height: number;        // Effective height (px)
  opacity: number;       // Effective opacity (0..1)
  rotation: number;      // Effective rotation (degrees)
  scaleX: number;        // Effective horizontal scale
  scaleY: number;        // Effective vertical scale
  anchorX: number;       // Anchor point X (0..1, fraction of width)
  anchorY: number;       // Anchor point Y (0..1, fraction of height)
}

function buildEffectiveLayer(
  resolved: ResolvedLayer,
  parentWidth: number,
  parentHeight: number,
): EffectiveLayer;
```

Merges computed animation properties (produced by the delta resolver in `@atelier/core`) over the layer's default values. This is where animation values take effect at render time.

**Property resolution priority:** `computedProperties[prop] ?? layer.defaultValue`

**Computed property keys:** `frame.x`, `frame.y`, `bounds.width`, `bounds.height`, `opacity`, `rotation`, `scale.x`, `scale.y`, `anchorPoint.x`, `anchorPoint.y`

**Unit resolution:** String values ending in `%` are resolved to pixels against the parent dimension (e.g., `"50%"` with a parent width of 800 becomes 400). Numeric values pass through unchanged.

---

### 4. renderers/shape-renderer.ts -- Shape Rendering

**File:** `packages/canvas/src/renderers/shape-renderer.ts`

```typescript
function renderShape(ctx: RenderContext, eff: EffectiveLayer): void;
```

Dispatches to internal rendering functions based on `shape.type`:

**Rect:**
- If `cornerRadius` is set and `ctx.roundRect` is available, uses `roundRect()` for rounded corners.
- Otherwise falls back to `fillRect()`/`strokeRect()`.
- Applies fill first, then stroke.

**Ellipse:**
- Uses `ctx.ellipse()` centered within the layer bounds (`width/2, height/2` as center, `width/2, height/2` as radii).
- Full arc from 0 to 2pi.
- Applies fill first, then stroke.

**Path:**
- Requires at least 2 points; returns early otherwise.
- Iterates `PathPoint[]`. Uses `bezierCurveTo()` when both `prev.out` and `curr.in` control points exist. Uses `lineTo()` for straight segments.
- Control points are relative offsets from their parent point.
- Closes the path if `closed: true`.
- Applies fill first, then stroke.

All shape types apply fill via `applyFill()` and stroke via `applyStroke()` from the styles module.

---

### 5. renderers/text-renderer.ts -- Text Rendering

**File:** `packages/canvas/src/renderers/text-renderer.ts`

```typescript
function renderText(ctx: RenderContext, eff: EffectiveLayer): void;
```

Renders a text layer using the Canvas 2D text API.

**Steps:**

1. **Build font string:** `"${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}"` (defaults: `fontStyle = "normal"`, `fontWeight = "normal"`).
2. **Set alignment:** `textAlign` from style (defaults to `"left"`), `textBaseline` always set to `"top"`.
3. **Set color:** converts `style.color` to CSS via `colorToCSS()` and assigns to `fillStyle`.
4. **Compute text X position** based on alignment:
   - `"left"` -- `x = 0` (text flows right from the left edge of bounds)
   - `"center"` -- `x = width / 2` (text centers within bounds)
   - `"right"` -- `x = width` (text flows left from the right edge of bounds)
5. **Draw:** calls `ctx.fillText(content, textX, 0)`.

---

### styles.ts -- Color and Fill Utilities

**File:** `packages/canvas/src/styles.ts`

```typescript
function colorToCSS(color: Color): string;
function applyFill(ctx: RenderContext, fill: Fill, width: number, height: number): void;
function applyStroke(ctx: RenderContext, stroke: Stroke): void;
```

**`colorToCSS(color)`:**
Converts an Atelier `Color` value to a CSS color string.
- Hex strings (e.g., `"#ff0000"`) pass through unchanged.
- `RGBAColor` objects produce `rgba(r, g, b, a)` (values are rounded to integers for r/g/b).
- `HSLAColor` objects produce `hsla(h, s%, l%, a)`.
- Falls back to `"#000000"` for unrecognized formats.

**`applyFill(ctx, fill, width, height)`:**
Sets `ctx.fillStyle` based on the fill type:
- **`"solid"`** -- sets `fillStyle` to `colorToCSS(fill.color)`.
- **`"linear-gradient"`** -- computes start/end points from the gradient angle using trigonometry. The gradient line runs through the center of the bounding box. Creates a `CanvasGradient` via `createLinearGradient()` and adds all color stops.
- **`"radial-gradient"`** -- resolves center (`x`, `y`) and radius from the fill definition. Percentage units resolve against `width`/`height` (radius resolves against the larger dimension). Creates a gradient from center with `r0=0` to center with `r1=radius`.

**`applyStroke(ctx, stroke)`:**
Configures the context for stroking:
- Sets `strokeStyle` from `stroke.color` (via `colorToCSS`).
- Sets `lineWidth` from `stroke.width`.
- Optionally sets `lineCap`, `lineJoin`, and dash pattern via `setLineDash()`.

## Architecture

```
@atelier/types    @atelier/core
      |                |
      v                v
  [Layer, Fill,   [ResolvedFrame,
   Stroke, Color,  ResolvedLayer]
   ShapeVisual,         |
   TextVisual]          |
      |                 |
      +--------+--------+
               |
        @atelier/canvas
               |
     +---------+---------+
     |         |         |
 render-   apply-    styles.ts
 frame.ts  properties.ts  |
     |         |         |
     +----+----+---------+
          |
    +-----+------+
    |            |
 shape-      text-
 renderer.ts renderer.ts
```

`renderFrame` is the orchestrator. It receives a `ResolvedFrame` (with all animation deltas already applied by `@atelier/core`), builds effective layer values via `buildEffectiveLayer`, and dispatches each layer to the appropriate renderer. The renderers use `applyFill` and `applyStroke` from `styles.ts` to configure the canvas context.

## Building

```bash
pnpm run build        # Build ESM + CJS + DTS via tsup
pnpm run typecheck    # Type-check without emitting
pnpm run test         # Run tests via vitest
pnpm run clean        # Remove dist/
```

## Design Decisions

**Environment-agnostic RenderContext:** The package defines its own `RenderContext` interface instead of depending on DOM typings. This allows the same rendering code to run in browsers, Node.js (via `node-canvas`), and test environments with mock contexts.

**Optional `roundRect`:** Since `roundRect` is not universally available (it was added to the Canvas spec relatively recently), the shape renderer checks for its existence at runtime and falls back gracefully.

**Painters algorithm (back-to-front):** Layers are rendered in array order, with the first layer at the back. This matches the convention used throughout the Atelier document model.

**Anchor-relative transforms:** Rotation and scale are applied around the layer's anchor point, not its origin. The renderer translates to the anchor, applies transforms, then translates back -- a standard technique for anchor-based transformations.

**Deferred renderers:** Image, group, and ref layer types are recognized in the dispatch switch but not yet implemented. They require async asset loading and recursive rendering, respectively, and will be added in a future milestone.
