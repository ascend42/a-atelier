---
title: DocumentBuilder Guide
scope: Step-by-step tutorial for creating animations with the fluent builder API
packages: ["@atelier/core"]
related: ["packages/core/README.md", "docs/format-spec.md", "docs/state-machine-guide.md", "docs/examples.md"]
---

# DocumentBuilder Guide

This tutorial walks through building animations from scratch using the `DocumentBuilder` fluent API. By the end, you will understand how to create layers, define animation states, apply easing, use presets, and build template-driven animations.

## Table of Contents

1. [Creating Your First Animation](#1-creating-your-first-animation)
2. [Layer Types](#2-layer-types)
3. [Shape Types](#3-shape-types)
4. [Fills and Strokes](#4-fills-and-strokes)
5. [Animation with Deltas](#5-animation-with-deltas)
6. [Easing Functions](#6-easing-functions)
7. [Multi-State Animations](#7-multi-state-animations)
8. [Using Presets](#8-using-presets)
9. [Template Variables](#9-template-variables)
10. [Complete Example](#10-complete-example-branded-title-card)

---

## 1. Creating Your First Animation

Every Atelier animation starts with two things: a **name** and a **canvas**. The canvas defines the dimensions and frame rate of your animation.

```typescript
import { createDocument } from "@atelier/core";

const doc = createDocument("Fade Circle", { width: 400, height: 400, fps: 60 })
  .addLayer({
    id: "circle",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#e94560" },
    },
    frame: { x: 150, y: 150 },
    bounds: { width: 100, height: 100 },
    opacity: 0,
  })
  .addState("show", { duration: 60 })
  .addDelta("show", {
    layer: "circle",
    property: "opacity",
    range: [0, 30],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .build();
```

Let's break down what happened:

1. **`createDocument(name, canvas)`** -- Creates a new `DocumentBuilder`. The canvas specifies `width`, `height`, and `fps` (frames per second). An optional `background` color can also be set.
2. **`.addLayer(...)`** -- Adds a visual element (an ellipse filled with red). The circle starts fully transparent (`opacity: 0`).
3. **`.addState("show", { duration: 60 })`** -- Defines a named animation state lasting 60 frames (1 second at 60fps).
4. **`.addDelta("show", ...)`** -- Adds an animation instruction: over frames 0-30, fade the circle's opacity from 0 to 1 with an ease-out curve.
5. **`.build()`** -- Returns the final `AtelierDocument` object as a deep clone.

### Key Concepts

- **Frame ranges are inclusive and 0-based.** The range `[0, 30]` means the animation runs from frame 0 through frame 30, inclusive -- that is 31 frames total.
- **Duration is measured in frames.** To convert seconds to frames, multiply by `fps`. A 2-second animation at 60fps has a duration of `120`.
- **After a delta ends, the `to` value is held.** Once frame 30 passes, the circle stays at opacity 1 for the remainder of the state. The property does not snap back to its original value.
- **`build()` returns a deep clone.** You can safely mutate the result without affecting the builder's internal state.

### Canvas Options

```typescript
interface Canvas {
  width: number;        // Canvas width in pixels
  height: number;       // Canvas height in pixels
  fps: number;          // Frames per second (commonly 30 or 60)
  background?: string;  // Optional background color (hex string)
}
```

### Builder Method Reference

| Method | Description |
|--------|-------------|
| `description(desc)` | Set an optional description for the document |
| `tags(...tags)` | Add classification tags |
| `variable(id, variable)` | Define a template variable |
| `asset(id, asset)` | Register an external asset (image, font, etc.) |
| `preset(id, preset)` | Define a reusable animation preset |
| `addLayer(layer)` | Add a visual layer |
| `addState(name, state)` | Add a named animation state |
| `addDelta(stateName, delta)` | Add a delta (animation instruction) to an existing state |
| `build()` | Return the final `AtelierDocument` |

---

## 2. Layer Types

Every layer has an `id`, a `visual` (what it looks like), a `frame` (position), and `bounds` (size). There are five visual types.

### Shape Layer

The most common layer type. Draws a geometric shape with optional fill and stroke.

```typescript
.addLayer({
  id: "box",
  visual: {
    type: "shape",
    shape: { type: "rect", cornerRadius: 8 },
    fill: { type: "solid", color: "#4A7C91" },
    stroke: { color: "#3A5A6B", width: 2 },
  },
  frame: { x: 50, y: 50 },
  bounds: { width: 200, height: 100 },
})
```

### Text Layer

Renders text with full style control.

```typescript
.addLayer({
  id: "heading",
  visual: {
    type: "text",
    content: "Hello, World",
    style: {
      fontFamily: "sans-serif",
      fontSize: 32,
      fontWeight: "bold",
      textAlign: "center",
      color: "#F5F0EB",
    },
  },
  frame: { x: 100, y: 150 },
  bounds: { width: 400, height: 44 },
})
```

### Image Layer

References an external image asset by ID. The asset must be registered with `.asset()`.

```typescript
.asset("hero-img", {
  type: "image",
  src: "./assets/hero.png",
  description: "Hero banner image",
})
.addLayer({
  id: "hero",
  visual: {
    type: "image",
    assetId: "hero-img",
  },
  frame: { x: 0, y: 0 },
  bounds: { width: 600, height: 300 },
})
```

### Group Layer

A container for organizing child layers. Child layers reference the group via `parentId` for transform inheritance.

```typescript
.addLayer({
  id: "card-group",
  visual: { type: "group" },
  frame: { x: 100, y: 100 },
  bounds: { width: 200, height: 150 },
})
.addLayer({
  id: "card-bg",
  visual: {
    type: "shape",
    shape: { type: "rect", cornerRadius: 12 },
    fill: { type: "solid", color: "#363636" },
  },
  frame: { x: 0, y: 0 },
  bounds: { width: 200, height: 150 },
  parentId: "card-group",  // Inherits transforms from card-group
})
```

### Ref Layer

Embeds another `.atelier` animation file, enabling composition.

```typescript
.addLayer({
  id: "nested-animation",
  visual: {
    type: "ref",
    src: "./components/spinner.atelier",
  },
  frame: { x: 250, y: 250 },
  bounds: { width: 50, height: 50 },
})
```

### Common Layer Properties

Every layer supports these optional properties beyond `id`, `visual`, `frame`, and `bounds`:

```typescript
interface Layer {
  id: string;
  description?: string;          // Human-readable description
  tags?: string[];               // Classification tags
  visual: Visual;                // One of shape, text, image, group, ref
  frame: Frame;                  // Position { x, y } in parent space
  bounds: Bounds;                // Size { width, height }
  anchorPoint?: AnchorPoint;     // Transform origin { x, y } normalized 0-1
  parentId?: string;             // Parent layer ID for transform inheritance
  opacity?: number;              // 0 (transparent) to 1 (opaque), default 1
  rotation?: number;             // Rotation in degrees
  scale?: { x: number; y: number }; // Scale factors, default { x: 1, y: 1 }
  visible?: boolean;             // Whether the layer renders
}
```

Frame and bounds values accept either pixel numbers or percentage strings (e.g., `"50%"`).

---

## 3. Shape Types

### Rect

A rectangle with optional corner rounding. The `cornerRadius` can be a single number (all corners) or a tuple of four numbers (top-left, top-right, bottom-right, bottom-left).

```typescript
// Uniform corners
{ type: "rect", cornerRadius: 12 }

// Per-corner radii: [topLeft, topRight, bottomRight, bottomLeft]
{ type: "rect", cornerRadius: [20, 20, 0, 0] }

// Sharp corners (default)
{ type: "rect" }
```

### Ellipse

A circle or oval, sized by the layer's `bounds`. A square bounds produces a circle.

```typescript
// Circle (equal width and height)
.addLayer({
  id: "circle",
  visual: {
    type: "shape",
    shape: { type: "ellipse" },
    fill: { type: "solid", color: "#C75B39" },
  },
  frame: { x: 100, y: 100 },
  bounds: { width: 80, height: 80 },  // Square bounds = circle
})

// Oval
.addLayer({
  id: "oval",
  visual: {
    type: "shape",
    shape: { type: "ellipse" },
    fill: { type: "solid", color: "#7A8B6F" },
  },
  frame: { x: 100, y: 100 },
  bounds: { width: 120, height: 60 },  // Rectangular bounds = oval
})
```

### Path

A freeform shape defined by a sequence of points with optional bezier control handles. Control handles are specified relative to their point.

```typescript
// Triangle (straight lines, no curves)
.addLayer({
  id: "triangle",
  visual: {
    type: "shape",
    shape: {
      type: "path",
      points: [
        { x: 50, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      closed: true,
    },
    fill: { type: "solid", color: "#D4A574" },
  },
  frame: { x: 200, y: 100 },
  bounds: { width: 100, height: 100 },
})

// Curved shape with bezier handles
.addLayer({
  id: "wave",
  visual: {
    type: "shape",
    shape: {
      type: "path",
      points: [
        { x: 0, y: 50 },
        { x: 50, y: 0, in: { x: -20, y: 0 }, out: { x: 20, y: 0 } },
        { x: 100, y: 50, in: { x: -20, y: 0 }, out: { x: 20, y: 0 } },
        { x: 150, y: 100, in: { x: -20, y: 0 } },
      ],
      closed: false,
    },
    stroke: { color: "#4A7C91", width: 3 },
  },
  frame: { x: 100, y: 150 },
  bounds: { width: 150, height: 100 },
})
```

Each `PathPoint` has this structure:

```typescript
interface PathPoint {
  x: number;
  y: number;
  in?: { x: number; y: number };   // Incoming control point (relative to point)
  out?: { x: number; y: number };  // Outgoing control point (relative to point)
}
```

---

## 4. Fills and Strokes

### Solid Color Fill

The simplest fill. Accepts any `Color` type: a hex string, an RGBA object, or an HSLA object.

```typescript
// Hex string (most common)
fill: { type: "solid", color: "#C75B39" }

// Hex with alpha
fill: { type: "solid", color: "#C75B3980" }

// RGBA object
fill: { type: "solid", color: { r: 199, g: 91, b: 57, a: 1 } }

// HSLA object
fill: { type: "solid", color: { h: 14, s: 60, l: 50, a: 1 } }
```

### Linear Gradient Fill

A gradient along a direction defined by `angle` (in degrees). Stops define color positions from 0 to 1.

```typescript
.addLayer({
  id: "gradient-bar",
  visual: {
    type: "shape",
    shape: { type: "rect", cornerRadius: 20 },
    fill: {
      type: "linear-gradient",
      angle: 90,  // Left to right
      stops: [
        { offset: 0, color: "#C75B39" },   // Start color
        { offset: 0.5, color: "#D4A574" },  // Midpoint
        { offset: 1, color: "#4A7C91" },    // End color
      ],
    },
  },
  frame: { x: 50, y: 150 },
  bounds: { width: 300, height: 40 },
})
```

Common angles: `0` = bottom to top, `90` = left to right, `180` = top to bottom, `270` = right to left.

### Radial Gradient Fill

A circular gradient radiating from a center point. The `center` and `radius` accept pixel values or percentage strings.

```typescript
.addLayer({
  id: "glow",
  visual: {
    type: "shape",
    shape: { type: "ellipse" },
    fill: {
      type: "radial-gradient",
      center: { x: "50%", y: "50%" },
      radius: "50%",
      stops: [
        { offset: 0, color: "#C75B39" },
        { offset: 1, color: "#1E1E1E" },
      ],
    },
  },
  frame: { x: 100, y: 100 },
  bounds: { width: 200, height: 200 },
})
```

### Stroke

Strokes define the outline of a shape. They support dashed lines and line cap/join styles.

```typescript
// Simple solid stroke
stroke: { color: "#3A5A6B", width: 2 }

// Dashed stroke
stroke: {
  color: "#C75B39",
  width: 3,
  dash: [10, 5],           // 10px dash, 5px gap
  lineCap: "round",        // "butt" | "round" | "square"
  lineJoin: "round",       // "miter" | "round" | "bevel"
}

// Combining fill and stroke
.addLayer({
  id: "outlined-box",
  visual: {
    type: "shape",
    shape: { type: "rect", cornerRadius: 12 },
    fill: { type: "solid", color: "#363636" },
    stroke: { color: "#4A7C91", width: 2, dash: [8, 4], lineCap: "round" },
  },
  frame: { x: 50, y: 50 },
  bounds: { width: 200, height: 120 },
})
```

---

## 5. Animation with Deltas

A **delta** is a single property animation within a state. It specifies which layer, which property, over which frames, from what value, to what value, and with what easing.

```typescript
interface Delta {
  id?: string;                      // Optional identifier
  layer: string;                    // Target layer ID
  property: AnimatableProperty;     // Which property to animate
  range: [number, number];          // [startFrame, endFrame] inclusive
  from: unknown;                    // Starting value
  to: unknown;                      // Ending value
  easing?: Easing;                  // Easing function (default: linear)
  description?: string;             // Optional description
  tags?: string[];                  // Optional tags
}
```

### All 16 Animatable Properties

| Property | Type | Description |
|----------|------|-------------|
| `frame.x` | `number` | Horizontal position |
| `frame.y` | `number` | Vertical position |
| `bounds.width` | `number` | Layer width |
| `bounds.height` | `number` | Layer height |
| `opacity` | `number` | Transparency (0-1) |
| `rotation` | `number` | Rotation in degrees |
| `scale.x` | `number` | Horizontal scale factor |
| `scale.y` | `number` | Vertical scale factor |
| `anchorPoint.x` | `number` | Transform origin X (0-1) |
| `anchorPoint.y` | `number` | Transform origin Y (0-1) |
| `visual.shape.cornerRadius` | `number` | Corner radius of rect shapes |
| `visual.fill.color` | `Color` | Fill color |
| `visual.stroke.color` | `Color` | Stroke color |
| `visual.stroke.width` | `number` | Stroke width |
| `visual.style.fontSize` | `number` | Text font size |
| `visual.style.color` | `Color` | Text color |

### Property Examples

**Movement -- `frame.x` and `frame.y`:**

```typescript
// Slide a layer from left to right
.addDelta("animate", {
  layer: "box",
  property: "frame.x",
  range: [0, 60],
  from: 0,
  to: 300,
  easing: "ease-in-out",
})
```

**Resize -- `bounds.width` and `bounds.height`:**

```typescript
// Expand a bar's width (like a progress bar or line drawing in)
.addDelta("animate", {
  layer: "bar",
  property: "bounds.width",
  range: [0, 45],
  from: 0,
  to: 200,
  easing: "ease-out",
})
```

**Rotation:**

```typescript
// Spin a shape 360 degrees
.addDelta("animate", {
  layer: "spinner",
  property: "rotation",
  range: [0, 120],
  from: 0,
  to: 360,
  easing: { type: "linear" },
})
```

**Scale -- `scale.x` and `scale.y`:**

```typescript
// Pulse effect: scale up slightly
.addDelta("animate", {
  layer: "icon",
  property: "scale.x",
  range: [0, 30],
  from: 1,
  to: 1.2,
  easing: "ease-out",
})
.addDelta("animate", {
  layer: "icon",
  property: "scale.y",
  range: [0, 30],
  from: 1,
  to: 1.2,
  easing: "ease-out",
})
```

**Corner radius animation:**

```typescript
// Morph from rounded rectangle to circle-like shape
.addDelta("animate", {
  layer: "morphing-box",
  property: "visual.shape.cornerRadius",
  range: [0, 60],
  from: 8,
  to: 50,
  easing: "ease-in-out",
})
```

**Color animation -- `visual.fill.color` and `visual.style.color`:**

```typescript
// Change fill color (snaps at completion since colors are strings)
.addDelta("animate", {
  layer: "box",
  property: "visual.fill.color",
  range: [0, 30],
  from: "#C75B39",
  to: "#4A7C91",
})
```

> **Note on color interpolation:** When colors are specified as hex strings, the transition snaps to the `to` value at completion rather than smoothly interpolating. Numeric properties (opacity, position, scale, etc.) interpolate smoothly.

### Combining Multiple Deltas

You can animate multiple properties on the same layer simultaneously, as long as the same layer+property combination does not overlap in time.

```typescript
const doc = createDocument("Moving Box", { width: 400, height: 400, fps: 60 })
  .addLayer({
    id: "box",
    visual: {
      type: "shape",
      shape: { type: "rect", cornerRadius: 8 },
      fill: { type: "solid", color: "#4A7C91" },
    },
    frame: { x: 50, y: 150 },
    bounds: { width: 60, height: 60 },
    opacity: 0,
    rotation: 0,
  })
  .addState("animate", { duration: 120 })
  // Fade in
  .addDelta("animate", {
    layer: "box",
    property: "opacity",
    range: [0, 20],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  // Slide right
  .addDelta("animate", {
    layer: "box",
    property: "frame.x",
    range: [10, 90],
    from: 50,
    to: 300,
    easing: { type: "spring", stiffness: 180, damping: 12 },
  })
  // Rotate while moving
  .addDelta("animate", {
    layer: "box",
    property: "rotation",
    range: [10, 90],
    from: 0,
    to: 180,
    easing: "ease-in-out",
  })
  // Scale up at the end
  .addDelta("animate", {
    layer: "box",
    property: "scale.x",
    range: [80, 110],
    from: 1,
    to: 1.3,
    easing: { type: "spring", stiffness: 200, damping: 10 },
  })
  .addDelta("animate", {
    layer: "box",
    property: "scale.y",
    range: [80, 110],
    from: 1,
    to: 1.3,
    easing: { type: "spring", stiffness: 200, damping: 10 },
  })
  .build();
```

### Sequential Deltas on the Same Property

You can chain deltas on the same layer+property as long as their ranges do not overlap. This is useful for multi-stage animations.

```typescript
// Move right, then move back
.addDelta("animate", {
  layer: "box",
  property: "frame.x",
  range: [0, 30],
  from: 50,
  to: 300,
  easing: "ease-out",
})
.addDelta("animate", {
  layer: "box",
  property: "frame.x",
  range: [60, 90],   // Starts after the first delta ends
  from: 300,
  to: 50,
  easing: "ease-in",
})
```

Between frames 31 and 59 (the gap between deltas), the property holds at the `to` value of the most recently completed delta -- in this case, the box stays at `x: 300`.

---

## 6. Easing Functions

Easing controls the acceleration curve of an animation. Without easing, properties change at a constant rate (linear). Atelier supports four easing types plus three named presets.

### String Presets

The simplest way to add easing. Pass a string directly to the `easing` field.

```typescript
// Starts slow, ends fast -- good for exits
easing: "ease-in"

// Starts fast, ends slow -- good for entrances
easing: "ease-out"

// Slow at both ends -- good for transitions
easing: "ease-in-out"
```

### Cubic Bezier

Full control over the easing curve via four control points, identical to CSS `cubic-bezier()`.

```typescript
// Custom bounce-like curve
easing: { type: "cubic-bezier", x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 }

// Equivalent to CSS ease
easing: { type: "cubic-bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 }

// Sharp deceleration
easing: { type: "cubic-bezier", x1: 0.0, y1: 0.0, x2: 0.2, y2: 1.0 }
```

### Spring Physics

Physically-based spring simulation. Produces natural, organic motion that can overshoot the target.

```typescript
// Default spring (all parameters optional)
easing: { type: "spring" }

// Bouncy spring
easing: { type: "spring", mass: 1, stiffness: 200, damping: 10 }

// Stiff, snappy spring
easing: { type: "spring", mass: 1, stiffness: 300, damping: 20 }

// Gentle, slow spring
easing: { type: "spring", mass: 2, stiffness: 100, damping: 15 }

// Spring with initial velocity
easing: { type: "spring", mass: 1, stiffness: 180, damping: 12, velocity: 5 }
```

Spring parameters:

| Parameter | Default | Effect |
|-----------|---------|--------|
| `mass` | 1 | Higher = slower, more inertia |
| `stiffness` | 100 | Higher = faster, snappier |
| `damping` | 10 | Higher = less bounce, more controlled |
| `velocity` | 0 | Initial velocity of the animation |

### Step Easing

Jumps between values in discrete steps, like a frame-by-frame animation.

```typescript
// 5 discrete steps
easing: { type: "step", steps: 5 }

// Steps that change at the start of each interval
easing: { type: "step", steps: 4, position: "start" }

// Steps that change at the end of each interval (default)
easing: { type: "step", steps: 4, position: "end" }
```

### Linear (Explicit)

Constant rate of change. This is the default when no easing is specified, but you can be explicit:

```typescript
easing: { type: "linear" }
```

---

## 7. Multi-State Animations

A document can contain multiple states, each representing a distinct phase of the animation (intro, idle, hover, outro, etc.). Each state has its own duration and set of deltas.

```typescript
const doc = createDocument("Intro / Outro", {
  width: 600,
  height: 400,
  fps: 60,
  background: "#1E1E1E",
})
  .addLayer({
    id: "card",
    visual: {
      type: "shape",
      shape: { type: "rect", cornerRadius: 20 },
      fill: {
        type: "linear-gradient",
        angle: 135,
        stops: [
          { offset: 0, color: "#3A5A6B" },
          { offset: 1, color: "#363636" },
        ],
      },
    },
    frame: { x: 150, y: 100 },
    bounds: { width: 300, height: 200 },
    opacity: 0,
  })
  .addLayer({
    id: "title",
    visual: {
      type: "text",
      content: "Hello, World",
      style: {
        fontFamily: "sans-serif",
        fontSize: 32,
        fontWeight: "bold",
        color: "#F5F0EB",
        textAlign: "center",
      },
    },
    frame: { x: 200, y: 170 },
    bounds: { width: 200, height: 44 },
    opacity: 0,
  })

  // --- INTRO state: fade in with motion ---
  .addState("intro", { duration: 90, description: "Entrance animation" })
  .addDelta("intro", {
    layer: "card",
    property: "opacity",
    range: [0, 35],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "card",
    property: "scale.x",
    range: [0, 35],
    from: 0.9,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "card",
    property: "scale.y",
    range: [0, 35],
    from: 0.9,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "title",
    property: "opacity",
    range: [20, 50],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "title",
    property: "frame.y",
    range: [20, 50],
    from: 185,
    to: 170,
    easing: "ease-out",
  })

  // --- OUTRO state: fade out ---
  .addState("outro", { duration: 60, description: "Exit animation" })
  .addDelta("outro", {
    layer: "title",
    property: "opacity",
    range: [0, 25],
    from: 1,
    to: 0,
    easing: "ease-in",
  })
  .addDelta("outro", {
    layer: "title",
    property: "frame.y",
    range: [0, 25],
    from: 170,
    to: 155,
    easing: "ease-in",
  })
  .addDelta("outro", {
    layer: "card",
    property: "opacity",
    range: [15, 45],
    from: 1,
    to: 0,
    easing: "ease-in",
  })
  .addDelta("outro", {
    layer: "card",
    property: "scale.x",
    range: [15, 45],
    from: 1,
    to: 0.9,
    easing: "ease-in",
  })
  .addDelta("outro", {
    layer: "card",
    property: "scale.y",
    range: [15, 45],
    from: 1,
    to: 0.9,
    easing: "ease-in",
  })
  .build();
```

States are independent -- each has its own timeline starting at frame 0. Use a `StateMachine` (from `@atelier/core`) to control transitions between states at runtime. See the [State Machine Guide](./state-machine-guide.md) for details.

### Design Patterns for States

- **Intro / Outro:** The most common pattern. Intro brings elements in; outro takes them out.
- **Discrete modes:** Like a traffic light with "red", "yellow", "green" states, where each state configures visibility differently.
- **Interactive states:** "idle", "hover", "active" for UI components.

---

## 8. Using Presets

Presets define reusable animation patterns that can be applied to any layer. A preset contains delta templates without layer or range information -- those are provided when the preset is expanded.

### Defining a Preset

```typescript
import { createDocument, expandPreset } from "@atelier/core";
import type { Preset } from "@atelier/types";

const fadeIn: Preset = {
  description: "Fade in with upward slide",
  deltas: [
    { property: "opacity", offset: [0, 30], from: 0, to: 1, easing: "ease-out" },
    { property: "frame.y", offset: [0, 30], from: 20, to: 0, easing: "ease-out" },
  ],
};
```

Each `PresetDelta` has an optional `offset` field -- a relative frame range from the application point. If omitted, the delta spans the full duration passed to `expandPreset`.

### Expanding a Preset

`expandPreset(preset, layerId, startFrame, duration)` converts a preset into concrete `Delta[]` that can be added to a state.

```typescript
const builder = createDocument("Preset Demo", { width: 600, height: 400, fps: 60 })
  .preset("fade-in", fadeIn)
  .addLayer({
    id: "card-a",
    visual: {
      type: "shape",
      shape: { type: "rect", cornerRadius: 12 },
      fill: { type: "solid", color: "#C75B39" },
    },
    frame: { x: 100, y: 150 },
    bounds: { width: 120, height: 100 },
    opacity: 0,
  })
  .addLayer({
    id: "card-b",
    visual: {
      type: "shape",
      shape: { type: "rect", cornerRadius: 12 },
      fill: { type: "solid", color: "#4A7C91" },
    },
    frame: { x: 280, y: 150 },
    bounds: { width: 120, height: 100 },
    opacity: 0,
  })
  .addState("enter", { duration: 120 });

// Apply preset to card-a starting at frame 10
const cardADeltas = expandPreset(fadeIn, "card-a", 10, 30);
for (const delta of cardADeltas) {
  // Adjust relative frame.y to absolute values
  if (delta.property === "frame.y") {
    delta.from = 170;  // 150 + 20 (the preset's "from")
    delta.to = 150;    // 150 + 0 (the preset's "to")
  }
  builder.addDelta("enter", delta);
}

// Apply same preset to card-b with staggered timing
const cardBDeltas = expandPreset(fadeIn, "card-b", 35, 30);
for (const delta of cardBDeltas) {
  if (delta.property === "frame.y") {
    delta.from = 170;
    delta.to = 150;
  }
  builder.addDelta("enter", delta);
}

const doc = builder.build();
```

### How `expandPreset` Works

Given a preset with `offset: [5, 25]`, a `startFrame` of 10, and a `duration` of 30:

- The resulting delta gets `range: [10 + 5, 10 + 25]` = `[15, 35]`

If a preset delta has no `offset`, it spans `[startFrame, startFrame + duration]`.

Each expanded delta gets an auto-generated `id` in the format `preset-{layerId}-{index}`.

---

## 9. Template Variables

Templates turn animations into reusable blueprints. Define variable slots with `{{variableName}}` placeholders in your document, then instantiate them with concrete values.

### Defining Variables

```typescript
const template = createDocument("Title Card", {
  width: 600,
  height: 400,
  fps: 60,
  background: "#1E1E1E",
})
  .variable("title", {
    type: "string",
    default: "Hello",
    description: "Title text displayed on the card",
  })
  .variable("color", {
    type: "color",
    default: "#FF0000",
    description: "Brand color for the title",
  })
  .variable("fontSize", {
    type: "number",
    default: 48,
    description: "Title font size",
  })
  .addLayer({
    id: "title",
    visual: {
      type: "text",
      content: "{{title}}",
      style: {
        fontFamily: "sans-serif",
        fontSize: "{{fontSize}}" as any,
        color: "{{color}}",
      },
    },
    frame: { x: 100, y: 150 },
    bounds: { width: 400, height: 60 },
  })
  .addState("show", { duration: 60 })
  .build();
```

### Variable Types

| Type | Description | Example Default |
|------|-------------|-----------------|
| `string` | Text content | `"Hello World"` |
| `number` | Numeric value | `48` |
| `color` | Color value (hex, RGBA, HSLA) | `"#FF0000"` |
| `boolean` | True/false flag | `true` |
| `asset` | Asset reference | `"./logo.png"` |

### Instantiating a Template

```typescript
import { instantiateTemplate } from "@atelier/core";

const result = instantiateTemplate(template, {
  title: "My Brand",
  color: "#0066FF",
  fontSize: 36,
});

if (result.success) {
  const doc = result.document;
  // doc.variables is removed -- it's no longer a template
  // All {{title}} replaced with "My Brand"
  // All {{color}} replaced with "#0066FF"
  // {{fontSize}} replaced with the number 36 (type preserved)
} else {
  console.error("Template errors:", result.errors);
}
```

### Substitution Rules

- **Exact match:** If an entire string is `"{{varName}}"`, the raw bound value is used, preserving its type. So `"{{fontSize}}"` with binding `36` becomes the number `36`, not the string `"36"`.
- **Partial match:** If a string contains `{{var}}` alongside other text (e.g., `"Hello {{name}}!"`), the binding is converted to a string and interpolated.
- **Defaults:** Variables with a `default` value are optional in bindings. Variables without defaults are required.
- **Unknown bindings:** Passing a binding for a variable that is not defined in the template produces an error.
- **After instantiation:** The `variables` section is removed from the resulting document. It is a concrete document, not a template.

### Error Handling

`instantiateTemplate` returns a discriminated union:

```typescript
type TemplateResult =
  | { success: true; document: AtelierDocument }
  | { success: false; errors: TemplateError[] };

interface TemplateError {
  variable: string;
  message: string;
}
```

Always check `result.success` before accessing `result.document`.

### Discovering Variables

You can scan a document for all `{{variableName}}` patterns, even if they are not formally declared in the `variables` section:

```typescript
import { findTemplateVariables } from "@atelier/core";

const vars = findTemplateVariables(doc);
// e.g., ["title", "color", "fontSize"]
```

---

## 10. Complete Example: Branded Title Card

This example brings together layers, states, deltas, variables, and staggered timing to create a polished title card animation. It is based on the Atelier showcase's branded title card.

```typescript
import { createDocument, instantiateTemplate } from "@atelier/core";
import type { AtelierDocument } from "@atelier/types";

function createTitleCard(): AtelierDocument {
  const titleText = "Atelier Studio";
  const brandColor = "#C75B39";
  const accentColor = "#4A7C91";

  return createDocument("Branded Title Card", {
    width: 600,
    height: 400,
    fps: 60,
    background: "#1E1E1E",
  })
    // --- Template variables for customization ---
    .variable("title", {
      type: "string",
      default: titleText,
      description: "Main title text displayed on the card",
    })
    .variable("brandColor", {
      type: "color",
      default: brandColor,
      description: "Primary brand color for the accent bar and decorations",
    })
    .variable("accentColor", {
      type: "color",
      default: accentColor,
      description: "Secondary accent color for the subtitle",
    })

    // --- Layer 1: Accent line that draws in from center ---
    .addLayer({
      id: "accent-line",
      visual: {
        type: "shape",
        shape: { type: "rect", cornerRadius: 2 },
        fill: { type: "solid", color: brandColor },
      },
      frame: { x: 200, y: 130 },
      bounds: { width: 0, height: 4 },  // Starts at zero width
    })

    // --- Layer 2: Title text (starts invisible) ---
    .addLayer({
      id: "title",
      visual: {
        type: "text",
        content: titleText,
        style: {
          fontFamily: "sans-serif",
          fontSize: 36,
          fontWeight: "bold",
          color: "#F5F0EB",
          textAlign: "center",
        },
      },
      frame: { x: 100, y: 155 },
      bounds: { width: 400, height: 50 },
      opacity: 0,
    })

    // --- Layer 3: Subtitle (starts invisible) ---
    .addLayer({
      id: "subtitle",
      visual: {
        type: "text",
        content: "Motion Design System",
        style: {
          fontFamily: "sans-serif",
          fontSize: 16,
          color: accentColor,
          textAlign: "center",
        },
      },
      frame: { x: 175, y: 215 },
      bounds: { width: 250, height: 24 },
      opacity: 0,
    })

    // --- Layers 4-7: Decorative corner brackets ---
    .addLayer({
      id: "corner-tl",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: brandColor },
      },
      frame: { x: 120, y: 110 },
      bounds: { width: 24, height: 2 },
      opacity: 0,
    })
    .addLayer({
      id: "corner-tl-v",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: brandColor },
      },
      frame: { x: 120, y: 110 },
      bounds: { width: 2, height: 24 },
      opacity: 0,
    })
    .addLayer({
      id: "corner-br",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: brandColor },
      },
      frame: { x: 456, y: 248 },
      bounds: { width: 24, height: 2 },
      opacity: 0,
    })
    .addLayer({
      id: "corner-br-v",
      visual: {
        type: "shape",
        shape: { type: "rect" },
        fill: { type: "solid", color: brandColor },
      },
      frame: { x: 478, y: 226 },
      bounds: { width: 2, height: 24 },
      opacity: 0,
    })

    // --- Animation state: 180 frames = 3 seconds at 60fps ---
    .addState("intro", { duration: 180 })

    // Phase 1 (frames 0-50): Accent line draws in from center
    .addDelta("intro", {
      layer: "accent-line",
      property: "bounds.width",
      range: [0, 50],
      from: 0,
      to: 200,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "accent-line",
      property: "frame.x",
      range: [0, 50],
      from: 300,
      to: 200,
      easing: "ease-out",
    })

    // Phase 2 (frames 30-65): Title fades in and slides up
    .addDelta("intro", {
      layer: "title",
      property: "opacity",
      range: [30, 65],
      from: 0,
      to: 1,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "title",
      property: "frame.y",
      range: [30, 65],
      from: 170,
      to: 155,
      easing: "ease-out",
    })

    // Phase 3 (frames 55-90): Subtitle fades in and slides up
    .addDelta("intro", {
      layer: "subtitle",
      property: "opacity",
      range: [55, 90],
      from: 0,
      to: 1,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "subtitle",
      property: "frame.y",
      range: [55, 90],
      from: 230,
      to: 215,
      easing: "ease-out",
    })

    // Phase 4 (frames 70-110): Corner decorations fade in with stagger
    .addDelta("intro", {
      layer: "corner-tl",
      property: "opacity",
      range: [70, 100],
      from: 0,
      to: 0.6,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "corner-tl-v",
      property: "opacity",
      range: [70, 100],
      from: 0,
      to: 0.6,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "corner-br",
      property: "opacity",
      range: [80, 110],
      from: 0,
      to: 0.6,
      easing: "ease-out",
    })
    .addDelta("intro", {
      layer: "corner-br-v",
      property: "opacity",
      range: [80, 110],
      from: 0,
      to: 0.6,
      easing: "ease-out",
    })

    .build();
}

// --- Create the template ---
const template = createTitleCard();

// --- Instantiate with custom branding ---
const result = instantiateTemplate(template, {
  title: "My Product",
  brandColor: "#6C5CE7",
  accentColor: "#00B894",
});

if (result.success) {
  // result.document is a concrete AtelierDocument
  // with "My Product" as the title and purple/green branding
  console.log(result.document.name); // "Branded Title Card"
}
```

### Choreography Breakdown

The animation unfolds in four staggered phases:

| Phase | Frames | Duration | What Happens |
|-------|--------|----------|--------------|
| 1 | 0--50 | ~0.8s | Accent line expands from center |
| 2 | 30--65 | ~0.6s | Title fades in and slides up (overlaps with phase 1) |
| 3 | 55--90 | ~0.6s | Subtitle fades in and slides up (overlaps with phase 2) |
| 4 | 70--110 | ~0.7s | Corner brackets fade in with a stagger between top-left and bottom-right |

After frame 110, all elements hold their final values for the remaining 70 frames of the state. This "hold" behavior is automatic -- once a delta's range ends, its `to` value persists.

---

## Validation and Error Handling

The builder validates constraints as you build. Here are the errors you may encounter and when they are thrown.

### Duplicate Layer ID

```typescript
builder
  .addLayer({ id: "box", /* ... */ })
  .addLayer({ id: "box", /* ... */ });
// Error: Layer with id "box" already exists
```

Every layer must have a unique `id` within the document.

### Duplicate State Name

```typescript
builder
  .addState("intro", { duration: 60 })
  .addState("intro", { duration: 90 });
// Error: State "intro" already exists
```

State names must be unique within the document.

### Delta Referencing Non-Existent Layer

```typescript
builder
  .addState("show", { duration: 60 })
  .addDelta("show", { layer: "ghost", property: "opacity", range: [0, 30], from: 0, to: 1 });
// Error: Layer "ghost" not found — add the layer before adding deltas
```

Layers must be added before any deltas that reference them.

### Delta Referencing Non-Existent State

```typescript
builder
  .addDelta("missing-state", { layer: "box", property: "opacity", range: [0, 30], from: 0, to: 1 });
// Error: State "missing-state" not found
```

States must be added before deltas can be added to them.

### Overlapping Deltas

```typescript
builder
  .addDelta("show", {
    layer: "box", property: "opacity", range: [0, 30], from: 0, to: 1,
  })
  .addDelta("show", {
    layer: "box", property: "opacity", range: [20, 50], from: 0.5, to: 0,
  });
// Error: Overlapping delta on layer "box" property "opacity":
//   existing [0-30] overlaps with new [20-50]
```

Two deltas on the same layer and property must not have overlapping frame ranges. The error message includes both the existing and conflicting ranges to help you fix the timing.

You *can* have multiple deltas on the same layer+property, as long as their ranges are non-overlapping:

```typescript
// This is valid: ranges [0, 30] and [31, 60] do not overlap
.addDelta("show", { layer: "box", property: "opacity", range: [0, 30], from: 0, to: 1 })
.addDelta("show", { layer: "box", property: "opacity", range: [31, 60], from: 1, to: 0 })
```

### Build Order

The required order of operations:

1. Set metadata (description, tags) -- any time
2. Define variables, assets, presets -- any time
3. **Add layers** -- before any deltas that reference them
4. **Add states** -- before adding deltas to them
5. **Add deltas** -- after both the target layer and state exist
6. **Call `.build()`** -- returns a deep-cloned `AtelierDocument`

---

## Quick Reference

### Imports

```typescript
// Builder
import { createDocument, DocumentBuilder } from "@atelier/core";

// Presets
import { expandPreset } from "@atelier/core";

// Templates
import { instantiateTemplate, findTemplateVariables } from "@atelier/core";

// Types (type-only, zero runtime)
import type {
  AtelierDocument, Canvas, Layer, State, Delta,
  Preset, PresetDelta, Variable, Asset,
  Shape, Fill, Stroke, TextStyle,
  Easing, EasingPreset, AnimatableProperty,
} from "@atelier/types";
```

### Duration Cheat Sheet

| Duration | 30 fps | 60 fps |
|----------|--------|--------|
| 0.5 seconds | 15 frames | 30 frames |
| 1 second | 30 frames | 60 frames |
| 2 seconds | 60 frames | 120 frames |
| 3 seconds | 90 frames | 180 frames |
| 5 seconds | 150 frames | 300 frames |
