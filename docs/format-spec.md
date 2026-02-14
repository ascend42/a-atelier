---
title: Atelier Format Specification
scope: Complete .atelier YAML format -- every field, type, and constraint
packages: ["@atelier/types"]
related: ["docs/architecture.md", "packages/types/README.md"]
---

# Atelier Format Specification

Version: **1.0**

## 1. Overview

The `.atelier` format is a YAML-based declarative animation description language. It defines motion graphics as a structured document containing visual layers, named animation states, and frame-by-frame property interpolation instructions called **deltas**. The format is designed to be authored by humans and AI agents alike, validated by machine, and rendered by any conforming engine.

An Atelier document describes **what** an animation looks like and how it moves, but not **how** to render it. The rendering pipeline (canvas, SVG, video export) is a separate concern. This separation allows the same `.atelier` file to be rendered across different backends.

Key design principles:

- **Declarative**: Layers define static appearance; deltas define change over time.
- **State-based**: Animations are organized into named states, each with its own duration and set of deltas. A state machine can transition between them.
- **No overlap**: Within a single state, two deltas targeting the same layer and property must not have overlapping frame ranges. This constraint makes resolution deterministic.
- **Hold-after-end**: After a delta's frame range ends, its `to` value is held for all subsequent frames (within the same state) until another delta for that property begins.

### Source of Truth

The canonical TypeScript types live in `packages/types/src/`. The Zod validation schemas live in `packages/schema/src/`. This specification documents both the logical type system and the validation constraints enforced at parse time.


## 2. Complete Annotated Example

The following is a valid `.atelier` document demonstrating every major section. Comments explain each field.

```yaml
# --- Root Document ---
version: "1.0"                    # Required. Format version string.
name: "loading-spinner"           # Required. Non-empty animation name.
description: "A pulsing loading indicator with fade-in"  # Optional.
tags: ["ui", "loading"]           # Optional. Freeform string tags.

# --- Canvas ---
canvas:
  width: 400                      # Required. Positive integer. Pixels.
  height: 400                     # Required. Positive integer. Pixels.
  fps: 60                         # Required. Positive integer. Frames per second.
  background: "#1A1A2E"           # Optional. Hex color string.

# --- Variables (template slots) ---
variables:
  brandColor:                     # Key = variable name
    type: color                   # Required. One of: string, number, color, asset, boolean
    default: "#E94560"            # Optional. Default value if not bound.
    description: "Primary brand color"  # Optional.
  spinSpeed:
    type: number
    default: 1.5

# --- Assets (external references) ---
assets:
  logo:                           # Key = asset ID (referenced by ImageVisual.assetId)
    type: image                   # Required. One of: image, svg, font, animation
    src: "./assets/logo.png"      # Required. Non-empty file path or URL.
    description: "Company logo"   # Optional.

# --- Presets (reusable delta templates) ---
presets:
  fade-in:                        # Key = preset name
    description: "Standard fade-in effect"  # Optional.
    tags: ["transition"]          # Optional.
    deltas:                       # Required. At least one PresetDelta.
      - property: opacity         # AnimatableProperty (no layer -- applied at usage)
        offset: [0, 15]           # Optional. Relative frame offset [start, end].
        from: 0                   # Starting value.
        to: 1                     # Ending value.
        easing: ease-out          # Optional. Easing function or preset name.

# --- Layers ---
layers:
  - id: background                # Required. Non-empty. Unique within document.
    description: "Full-canvas background rectangle"  # Optional.
    tags: ["bg"]                  # Optional.
    visual:                       # Required. One of: shape, text, image, group, ref.
      type: shape
      shape:
        type: rect
        cornerRadius: 0          # Optional. Number or [tl, tr, br, bl] tuple.
      fill:                       # Optional.
        type: solid
        color: "#1A1A2E"
      stroke:                     # Optional.
        color: "#333355"
        width: 2
        dash: [5, 3]             # Optional. Dash pattern.
        lineCap: round           # Optional. "butt" | "round" | "square"
        lineJoin: round          # Optional. "miter" | "round" | "bevel"
    frame:                        # Required. Position in parent coordinate space.
      x: 0                       # UnitValue: number (pixels) or "50%" (percentage)
      y: 0
    bounds:                       # Required. Size of the layer.
      width: 400
      height: 400
    anchorPoint:                  # Optional. Normalized 0-1. Default assumed [0, 0].
      x: 0.5
      y: 0.5
    opacity: 1                    # Optional. 0-1.
    rotation: 0                   # Optional. Degrees.
    scale:                        # Optional.
      x: 1
      y: 1
    visible: true                 # Optional. Boolean.

  - id: spinner
    visual:
      type: shape
      shape:
        type: ellipse
      fill:
        type: linear-gradient
        angle: 45                 # Degrees.
        stops:
          - offset: 0            # 0-1 position along gradient.
            color: "#E94560"
          - offset: 1
            color: "#0F3460"
      stroke:
        color: { r: 233, g: 69, b: 96, a: 1 }  # RGBA color object
        width: 3
    frame:
      x: "50%"                   # Percentage -- resolved against parent/canvas width.
      y: "50%"
    bounds:
      width: 80
      height: 80
    anchorPoint:
      x: 0.5
      y: 0.5
    parentId: background          # Optional. Parent layer ID for transform inheritance.

  - id: label
    visual:
      type: text
      content: "Loading..."       # Required. Text string to render.
      style:                      # Required. TextStyle object.
        fontFamily: "Inter"       # Required. Non-empty.
        fontSize: 16              # Required. Positive number.
        fontWeight: bold          # Optional. Number or "normal" | "bold".
        fontStyle: normal         # Optional. "normal" | "italic".
        textAlign: center         # Optional. "left" | "center" | "right".
        lineHeight: 1.5           # Optional. Positive number.
        letterSpacing: 0.5        # Optional. Number.
        color: "#FFFFFF"          # Required. Color value.
    frame:
      x: "50%"
      y: "75%"
    bounds:
      width: 200
      height: 30
    anchorPoint:
      x: 0.5
      y: 0.5

  - id: logo-layer
    visual:
      type: image
      assetId: logo               # Required. Non-empty. Must match an asset key.
    frame:
      x: 10
      y: 10
    bounds:
      width: 40
      height: 40

  - id: container
    visual:
      type: group                 # Group layers use parentId on children.
    frame:
      x: 0
      y: 0
    bounds:
      width: "100%"
      height: "100%"

# --- States ---
states:
  idle:                           # Key = state name. Must be unique.
    description: "Continuous spinning animation"  # Optional.
    tags: ["loop"]                # Optional.
    duration: 120                 # Required. Positive integer. Duration in frames.
    deltas:                       # Required. Array of Delta objects.
      - id: spin-rotation         # Optional. Identifier for this delta.
        layer: spinner            # Required. Non-empty. Must reference an existing layer ID.
        property: rotation        # Required. AnimatableProperty enum value.
        range: [0, 119]           # Required. [start, end] inclusive, 0-based.
        from: 0                   # Required. Starting value.
        to: 360                   # Required. Ending value.
        easing:                   # Optional. Easing definition or preset name.
          type: linear
        description: "Full rotation"  # Optional.
        tags: ["loop"]           # Optional.

      - layer: spinner
        property: scale.x
        range: [0, 59]
        from: 1
        to: 1.2
        easing: ease-in-out

      - layer: spinner
        property: scale.x
        range: [60, 119]          # Non-overlapping with previous scale.x delta.
        from: 1.2
        to: 1
        easing: ease-in-out

      - layer: spinner
        property: scale.y
        range: [0, 59]
        from: 1
        to: 1.2
        easing: ease-in-out

      - layer: spinner
        property: scale.y
        range: [60, 119]
        from: 1.2
        to: 1
        easing: ease-in-out

  intro:
    duration: 30
    deltas:
      - layer: spinner
        property: opacity
        range: [0, 29]
        from: 0
        to: 1
        easing:
          type: cubic-bezier
          x1: 0.25
          y1: 0.1
          x2: 0.25
          y2: 1

      - layer: label
        property: frame.y
        range: [10, 29]
        from: "80%"
        to: "75%"
        easing:
          type: spring
          mass: 1
          stiffness: 100
          damping: 10
          velocity: 0
```


## 3. Type Reference

### 3.1 AtelierDocument (Root)

The top-level object representing a complete animation.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | `string` | Yes | -- | Format version. Currently `"1.0"`. Must be non-empty. |
| `name` | `string` | Yes | -- | Animation name. Must be non-empty. |
| `description` | `string` | No | -- | Human-readable description. |
| `tags` | `string[]` | No | -- | Freeform classification tags. |
| `canvas` | `Canvas` | Yes | -- | Canvas dimensions and playback settings. |
| `variables` | `Record<string, Variable>` | No | -- | Template variable slots. Keys are variable names. |
| `assets` | `Record<string, Asset>` | No | -- | External asset references. Keys are asset IDs. |
| `presets` | `Record<string, Preset>` | No | -- | Reusable delta templates. Keys are preset names. |
| `layers` | `Layer[]` | Yes | -- | Ordered list of visual layers. |
| `states` | `Record<string, State>` | Yes | -- | Named animation states. Keys are state names. |

**Source:** `packages/types/src/document.ts`
**Schema:** `packages/schema/src/document.ts`

---

### 3.2 Canvas

Defines the viewport and playback timing.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `width` | `number` | Yes | Positive integer | Canvas width in pixels. |
| `height` | `number` | Yes | Positive integer | Canvas height in pixels. |
| `fps` | `number` | Yes | Positive integer | Frames per second for playback. |
| `background` | `string` | No | -- | Background color as a hex string (e.g. `"#1A1A2E"`). |

**Source:** `packages/types/src/document.ts`
**Schema:** `packages/schema/src/document.ts`

---

### 3.3 Units

All positional and dimensional values in the format use the `UnitValue` union type.

| Type | Format | Example | Description |
|------|--------|---------|-------------|
| `Pixel` | `number` | `200` | A raw numeric pixel value. Any number. |
| `Percentage` | `string` | `"50%"` | A number followed by `%`. Regex: `/^-?\d+(\.\d+)?%$/`. Resolved relative to the parent container or canvas dimension at render time. |
| `UnitValue` | `Pixel \| Percentage` | `200` or `"50%"` | Either form is accepted anywhere a position or dimension is expected. |

Percentage resolution is performed by the unit resolver (`packages/core/src/units/resolve-units.ts`): `resolveUnit(value, referenceDimension)` converts percentages to pixels using `(parseFloat(pct) / 100) * reference`.

**Source:** `packages/types/src/units.ts`
**Schema:** `packages/schema/src/units.ts`

---

### 3.4 Coordinates

#### 3.4.1 Frame

Position within the parent coordinate space.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `UnitValue` | Yes | Horizontal position. Pixels or percentage of parent width. |
| `y` | `UnitValue` | Yes | Vertical position. Pixels or percentage of parent height. |

#### 3.4.2 Bounds

Size of a layer.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `width` | `UnitValue` | Yes | Layer width. Pixels or percentage. |
| `height` | `UnitValue` | Yes | Layer height. Pixels or percentage. |

#### 3.4.3 AnchorPoint

The transform origin, normalized to a 0-1 range within the layer's bounds. All transforms (rotation, scale) pivot around this point.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `x` | `number` | Yes | 0 to 1 | Horizontal anchor. 0 = left edge, 0.5 = center, 1 = right edge. |
| `y` | `number` | Yes | 0 to 1 | Vertical anchor. 0 = top edge, 0.5 = center, 1 = bottom edge. |

**Source:** `packages/types/src/coordinates.ts`
**Schema:** `packages/schema/src/coordinates.ts`

---

### 3.5 Colors

Three color representations are supported. They can be used interchangeably anywhere a `Color` value is expected.

#### 3.5.1 HexColor

A CSS-style hex string. Validated against the regex:

```
/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
```

| Format | Example | Description |
|--------|---------|-------------|
| `#RGB` | `"#F00"` | 3-digit shorthand |
| `#RGBA` | `"#F008"` | 4-digit shorthand with alpha |
| `#RRGGBB` | `"#FF0000"` | 6-digit full |
| `#RRGGBBAA` | `"#FF000080"` | 8-digit with alpha |

#### 3.5.2 RGBAColor

An object with explicit red, green, blue, and alpha channels.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `r` | `number` | 0-255 | Red channel |
| `g` | `number` | 0-255 | Green channel |
| `b` | `number` | 0-255 | Blue channel |
| `a` | `number` | 0-1 | Alpha (opacity) |

#### 3.5.3 HSLAColor

An object with hue, saturation, lightness, and alpha.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `h` | `number` | 0-360 | Hue in degrees |
| `s` | `number` | 0-100 | Saturation percentage |
| `l` | `number` | 0-100 | Lightness percentage |
| `a` | `number` | 0-1 | Alpha (opacity) |

#### 3.5.4 Color (Union)

```
Color = RGBAColor | HSLAColor | HexColor
```

The schema validates against all three forms in order. In YAML, hex strings are the most concise:

```yaml
color: "#E94560"
```

Object forms are also valid:

```yaml
color: { r: 233, g: 69, b: 96, a: 1 }
color: { h: 350, s: 78, l: 59, a: 1 }
```

**Source:** `packages/types/src/color.ts`
**Schema:** `packages/schema/src/color.ts`

---

### 3.6 Shapes

Shapes define the geometry of a `ShapeVisual` layer.

#### 3.6.1 RectShape

A rectangle.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"rect"` | Yes | Literal | Discriminator. |
| `cornerRadius` | `number \| [number, number, number, number]` | No | Each value >= 0 | Uniform radius or per-corner `[topLeft, topRight, bottomRight, bottomLeft]`. |

#### 3.6.2 EllipseShape

An ellipse that fills the layer bounds.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"ellipse"` | Yes | Discriminator. |

No additional fields.

#### 3.6.3 PathShape

A freeform path defined by a series of points with optional Bezier handles.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"path"` | Yes | Literal | Discriminator. |
| `points` | `PathPoint[]` | Yes | Minimum 2 points | Ordered array of path vertices. |
| `closed` | `boolean` | No | -- | Whether the path forms a closed shape. |

#### 3.6.4 PathPoint

A vertex on a path with optional cubic Bezier control points.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `number` | Yes | X coordinate of the point. |
| `y` | `number` | Yes | Y coordinate of the point. |
| `in` | `{ x: number, y: number }` | No | Incoming control point (relative to the point). |
| `out` | `{ x: number, y: number }` | No | Outgoing control point (relative to the point). |

#### 3.6.5 Shape (Union)

```
Shape = RectShape | EllipseShape | PathShape
```

Discriminated on the `type` field.

**Source:** `packages/types/src/shape.ts`
**Schema:** `packages/schema/src/shape.ts`

---

### 3.7 Fills

Fills define how a shape's interior is painted.

#### 3.7.1 SolidFill

A flat single-color fill.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"solid"` | Yes | Discriminator. |
| `color` | `Color` | Yes | The fill color. |

#### 3.7.2 LinearGradientFill

A linear gradient across the shape.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"linear-gradient"` | Yes | Literal | Discriminator. |
| `angle` | `number` | Yes | -- | Gradient angle in degrees. |
| `stops` | `GradientStop[]` | Yes | Minimum 2 stops | Color stops along the gradient. |

#### 3.7.3 RadialGradientFill

A radial gradient emanating from a center point.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"radial-gradient"` | Yes | Literal | Discriminator. |
| `center` | `{ x: UnitValue, y: UnitValue }` | Yes | -- | Center point of the gradient. |
| `radius` | `UnitValue` | Yes | -- | Radius of the gradient. |
| `stops` | `GradientStop[]` | Yes | Minimum 2 stops | Color stops along the gradient. |

#### 3.7.4 GradientStop

A single stop within a gradient.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `offset` | `number` | Yes | 0 to 1 | Position along the gradient. 0 = start, 1 = end. |
| `color` | `Color` | Yes | -- | Color at this stop. |

#### 3.7.5 Fill (Union)

```
Fill = SolidFill | LinearGradientFill | RadialGradientFill
```

Discriminated on the `type` field.

**Source:** `packages/types/src/shape.ts`
**Schema:** `packages/schema/src/shape.ts`

---

### 3.8 Stroke

Defines the outline of a shape.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `color` | `Color` | Yes | -- | Stroke color. |
| `width` | `number` | Yes | >= 0 | Stroke width in pixels. |
| `dash` | `number[]` | No | Each value >= 0 | Dash pattern array (alternating dash/gap lengths). |
| `lineCap` | `string` | No | `"butt"` \| `"round"` \| `"square"` | End cap style. |
| `lineJoin` | `string` | No | `"miter"` \| `"round"` \| `"bevel"` | Corner join style. |

**Source:** `packages/types/src/shape.ts`
**Schema:** `packages/schema/src/shape.ts`

---

### 3.9 TextStyle

Defines how text is rendered in a `TextVisual` layer.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `fontFamily` | `string` | Yes | Non-empty | Font family name. |
| `fontSize` | `number` | Yes | Positive (> 0) | Font size in pixels. |
| `fontWeight` | `number \| "normal" \| "bold"` | No | -- | Numeric weight (100-900) or named preset. |
| `fontStyle` | `string` | No | `"normal"` \| `"italic"` | Font style. |
| `textAlign` | `string` | No | `"left"` \| `"center"` \| `"right"` | Horizontal text alignment. |
| `lineHeight` | `number` | No | Positive (> 0) | Line height multiplier. |
| `letterSpacing` | `number` | No | -- | Letter spacing in pixels. Can be negative. |
| `color` | `Color` | Yes | -- | Text color. |

**Source:** `packages/types/src/shape.ts`
**Schema:** `packages/schema/src/shape.ts`

---

### 3.10 Visuals

A `Visual` defines what a layer looks like. It is a discriminated union on the `type` field.

#### 3.10.1 ShapeVisual

Renders a geometric shape.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"shape"` | Yes | Discriminator. |
| `shape` | `Shape` | Yes | The geometry (rect, ellipse, or path). |
| `fill` | `Fill` | No | How to fill the shape interior. |
| `stroke` | `Stroke` | No | How to outline the shape. |

#### 3.10.2 TextVisual

Renders text content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"text"` | Yes | Discriminator. |
| `content` | `string` | Yes | The text string to render. |
| `style` | `TextStyle` | Yes | Styling configuration. |

#### 3.10.3 ImageVisual

Renders an external image asset.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"image"` | Yes | Literal | Discriminator. |
| `assetId` | `string` | Yes | Non-empty | Must reference a key in the document's `assets` map. |

#### 3.10.4 GroupVisual

A container layer. Has no visual output of its own. Child layers reference it via `parentId` to inherit its transforms.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"group"` | Yes | Discriminator. |

#### 3.10.5 RefVisual

A reference to another `.atelier` animation file, enabling composition.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"ref"` | Yes | Literal | Discriminator. |
| `src` | `string` | Yes | Non-empty | Path to another `.atelier` file. |

#### 3.10.6 Visual (Union)

```
Visual = ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual
```

Discriminated on the `type` field.

**Source:** `packages/types/src/layer.ts`
**Schema:** `packages/schema/src/layer.ts`

---

### 3.11 Layer

A visual element in the animation scene graph. Layers are rendered in array order (first = bottommost).

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | `string` | Yes | Non-empty, unique within document | Unique identifier. Referenced by deltas and `parentId`. |
| `description` | `string` | No | -- | Human-readable description. |
| `tags` | `string[]` | No | -- | Freeform classification tags. |
| `visual` | `Visual` | Yes | -- | What this layer looks like. |
| `frame` | `Frame` | Yes | -- | Position within parent coordinate space. |
| `bounds` | `Bounds` | Yes | -- | Width and height of the layer. |
| `anchorPoint` | `AnchorPoint` | No | x,y in 0-1 | Transform origin. |
| `parentId` | `string` | No | -- | ID of a parent layer for transform inheritance. The parent must exist. |
| `opacity` | `number` | No | 0 to 1 | Layer opacity. 0 = fully transparent, 1 = fully opaque. |
| `rotation` | `number` | No | -- | Rotation in degrees around the anchor point. |
| `scale` | `{ x: number, y: number }` | No | -- | Scale factors. 1 = normal size. |
| `visible` | `boolean` | No | -- | Whether the layer is rendered. |

**Source:** `packages/types/src/layer.ts`
**Schema:** `packages/schema/src/layer.ts`

---

### 3.12 Easing

Easing functions control the rate of change during property interpolation. A delta's `easing` field accepts either a string preset or a structured easing object.

#### 3.12.1 EasingPreset (String)

A shorthand string for common easing curves.

| Value | Description |
|-------|-------------|
| `"ease-in"` | Accelerating from rest. |
| `"ease-out"` | Decelerating to rest. |
| `"ease-in-out"` | Accelerating then decelerating. |

When no easing is specified on a delta, `linear` is used by default.

#### 3.12.2 LinearEasing

Constant rate of change.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"linear"` | Yes | Discriminator. |

#### 3.12.3 CubicBezierEasing

A cubic Bezier curve, identical to CSS `cubic-bezier()`.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"cubic-bezier"` | Yes | Literal | Discriminator. |
| `x1` | `number` | Yes | 0 to 1 | First control point X. |
| `y1` | `number` | Yes | -- | First control point Y. May exceed 0-1 for overshoot. |
| `x2` | `number` | Yes | 0 to 1 | Second control point X. |
| `y2` | `number` | Yes | -- | Second control point Y. May exceed 0-1 for overshoot. |

Note: `x1` and `x2` are constrained to `[0, 1]` by the schema, while `y1` and `y2` are unconstrained to allow overshoot/anticipation effects.

#### 3.12.4 SpringEasing

A physics-based spring simulation.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"spring"` | Yes | Literal | Discriminator. |
| `mass` | `number` | No | Positive (> 0) | Mass of the spring object. |
| `stiffness` | `number` | No | Positive (> 0) | Spring stiffness constant. |
| `damping` | `number` | No | Positive (> 0) | Damping coefficient. |
| `velocity` | `number` | No | -- | Initial velocity. Can be negative. |

#### 3.12.5 StepEasing

Discrete stepping (no interpolation between steps).

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `"step"` | Yes | Literal | Discriminator. |
| `steps` | `number` | Yes | Positive integer | Number of discrete steps. |
| `position` | `string` | No | `"start"` \| `"end"` | When the step occurs within each interval. |

#### 3.12.6 Easing (Union)

```
Easing = LinearEasing | CubicBezierEasing | SpringEasing | StepEasing | EasingPreset
```

In YAML, the simplest form is a bare string:

```yaml
easing: ease-out
```

The full object form:

```yaml
easing:
  type: cubic-bezier
  x1: 0.25
  y1: 0.1
  x2: 0.25
  y2: 1
```

**Source:** `packages/types/src/easing.ts`
**Schema:** `packages/schema/src/easing.ts`

---

### 3.13 AnimatableProperty

A string enum listing every property path that can be targeted by a delta.

| Property | Value Type | Description |
|----------|-----------|-------------|
| `"frame.x"` | `UnitValue` | Layer horizontal position. |
| `"frame.y"` | `UnitValue` | Layer vertical position. |
| `"bounds.width"` | `UnitValue` | Layer width. |
| `"bounds.height"` | `UnitValue` | Layer height. |
| `"opacity"` | `number` (0-1) | Layer opacity. |
| `"rotation"` | `number` (degrees) | Layer rotation. |
| `"scale.x"` | `number` | Horizontal scale factor. |
| `"scale.y"` | `number` | Vertical scale factor. |
| `"anchorPoint.x"` | `number` (0-1) | Anchor point horizontal position. |
| `"anchorPoint.y"` | `number` (0-1) | Anchor point vertical position. |
| `"visual.shape.cornerRadius"` | `number` | Rectangle corner radius. |
| `"visual.fill.color"` | `Color` | Fill color. |
| `"visual.stroke.color"` | `Color` | Stroke color. |
| `"visual.stroke.width"` | `number` | Stroke width. |
| `"visual.style.fontSize"` | `number` | Text font size. |
| `"visual.style.color"` | `Color` | Text color. |

**Source:** `packages/types/src/delta.ts`
**Schema:** `packages/schema/src/delta.ts`

---

### 3.14 FrameRange

A two-element tuple `[start, end]` defining the time span of a delta.

| Index | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `0` | `number` | Integer, >= 0 | Start frame (inclusive). |
| `1` | `number` | Integer, >= 0, >= start | End frame (inclusive). |

When `start === end`, the delta is instantaneous: it snaps to the `to` value at that single frame.

Frame indices are 0-based. A state with `duration: 120` has valid frames `0` through `119`.

**Source:** `packages/types/src/delta.ts`
**Schema:** `packages/schema/src/delta.ts`

---

### 3.15 Delta

A delta is a single property animation instruction. It interpolates one property on one layer across a frame range.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | `string` | No | -- | Optional identifier for this delta. |
| `layer` | `string` | Yes | Non-empty | Target layer ID. Must reference an existing layer. |
| `property` | `AnimatableProperty` | Yes | Enum value | The property being animated. |
| `range` | `FrameRange` | Yes | `[start, end]`, end >= start | Inclusive frame range. |
| `from` | `unknown` | Yes | -- | Starting value. Type depends on `property`. |
| `to` | `unknown` | Yes | -- | Ending value. Type depends on `property`. |
| `easing` | `Easing` | No | -- | Easing function. Defaults to linear if omitted. |
| `description` | `string` | No | -- | Human-readable description. |
| `tags` | `string[]` | No | -- | Freeform classification tags. |

#### Value Types by Property

The `from` and `to` fields are typed as `unknown` in the schema to allow flexibility, but at runtime the engine expects values matching the property type:

| Property | Expected `from`/`to` type |
|----------|--------------------------|
| `frame.x`, `frame.y` | `UnitValue` (number or percentage string) |
| `bounds.width`, `bounds.height` | `UnitValue` |
| `opacity` | `number` (0-1) |
| `rotation` | `number` (degrees) |
| `scale.x`, `scale.y` | `number` |
| `anchorPoint.x`, `anchorPoint.y` | `number` (0-1) |
| `visual.shape.cornerRadius` | `number` |
| `visual.fill.color` | `Color` |
| `visual.stroke.color` | `Color` |
| `visual.stroke.width` | `number` |
| `visual.style.fontSize` | `number` |
| `visual.style.color` | `Color` |

#### Interpolation Behavior

The delta resolver (`packages/core/src/resolver/delta-resolver.ts`) interpolates values as follows:

- **Numbers**: Linear interpolation (`lerp(from, to, easedProgress)`).
- **Strings** (hex colors, percentages): Snap to `to` at `t >= 1`, otherwise hold `from`.
- **All other types**: Snap to `to` at `t >= 1`, otherwise hold `from`.

**Source:** `packages/types/src/delta.ts`
**Schema:** `packages/schema/src/delta.ts`

---

### 3.16 State

A named choreography defining what layers do during a period of time.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `description` | `string` | No | -- | Human-readable description. |
| `tags` | `string[]` | No | -- | Freeform classification tags. |
| `duration` | `number` | Yes | Positive integer | Total duration of this state in frames. |
| `deltas` | `Delta[]` | Yes | -- | Animation instructions active during this state. |

States are keyed by name in the document's `states` map. The state machine (`packages/core/src/state/state-machine.ts`) defaults to the first state in key order if no initial state is specified.

**Source:** `packages/types/src/state.ts`
**Schema:** `packages/schema/src/state.ts`

---

### 3.17 Preset

A reusable template of deltas that can be expanded onto any layer. Presets omit the `layer` field because the target is specified at application time.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `description` | `string` | No | -- | Human-readable description. |
| `tags` | `string[]` | No | -- | Freeform classification tags. |
| `deltas` | `PresetDelta[]` | Yes | Minimum 1 | Delta templates within this preset. |

#### 3.17.1 PresetDelta

A delta template without a layer binding.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `property` | `AnimatableProperty` | Yes | Enum value | The property to animate. |
| `offset` | `[number, number]` | No | Integers, each >= 0 | Relative frame offset from the application start frame. |
| `from` | `unknown` | Yes | -- | Starting value. |
| `to` | `unknown` | Yes | -- | Ending value. |
| `easing` | `Easing` | No | -- | Easing function. |

#### Preset Expansion

Presets are expanded via `expandPreset(preset, layerId, startFrame, duration)` in `packages/core/src/presets/preset-resolver.ts`:

- If a preset delta has an `offset`, the concrete range is `[startFrame + offset[0], startFrame + offset[1]]`.
- If no `offset` is provided, the range defaults to `[startFrame, startFrame + duration]`.
- Each expanded delta receives a generated `id` of the form `preset-{layerId}-{index}`.

**Source:** `packages/types/src/preset.ts`
**Schema:** `packages/schema/src/preset.ts`

---

### 3.18 Variable

A template variable slot. When a document defines variables, it acts as a template: values marked with `{{variableName}}` patterns in string fields throughout the document are substituted at instantiation time.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `VariableType` | Yes | Enum value | The expected type of the variable. |
| `default` | `unknown` | No | -- | Default value if no binding is provided. |
| `description` | `string` | No | -- | Human-readable description. |

#### 3.18.1 VariableType

| Value | Description |
|-------|-------------|
| `"string"` | A text string. |
| `"number"` | A numeric value. |
| `"color"` | A color value (hex string or color object). |
| `"asset"` | An asset reference. |
| `"boolean"` | A true/false value. |

#### Template Substitution

The template resolver (`packages/core/src/templates/template-resolver.ts`) handles variable binding:

- `{{variableName}}` patterns in string values are replaced with the bound value.
- If the entire string is a single `{{varName}}` expression, the raw value is returned (preserving its original type, e.g., a number remains a number).
- If the pattern appears within a larger string, the bound value is coerced to a string via `String()`.
- Variables without a binding or a default cause a validation error.
- Unknown variable bindings (names not in the `variables` map) cause a validation error.
- After instantiation, the `variables` section is removed from the resolved document.

**Source:** `packages/types/src/variable.ts`
**Schema:** `packages/schema/src/variable.ts`

---

### 3.19 Asset

A reference to an external resource.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | `AssetType` | Yes | Enum value | The kind of asset. |
| `src` | `string` | Yes | Non-empty | File path or URL to the asset. |
| `description` | `string` | No | -- | Human-readable description. |

#### 3.19.1 AssetType

| Value | Description |
|-------|-------------|
| `"image"` | Raster image (PNG, JPEG, WebP, etc.). |
| `"svg"` | SVG vector graphic. |
| `"font"` | Font file (TTF, OTF, WOFF, etc.). |
| `"animation"` | Another animation file (for composition via `RefVisual`). |

**Source:** `packages/types/src/asset.ts`
**Schema:** `packages/schema/src/asset.ts`


## 4. Constraints and Validation Rules

The following constraints are enforced by the schema (`@atelier/schema`) and the core engine (`@atelier/core`). A conforming document must satisfy all of them.

### 4.1 Schema-Level Constraints (Parse Time)

These are enforced by Zod schemas during `parseAtelier()` / `validateDocument()`.

| # | Constraint | Enforced By |
|---|-----------|-------------|
| 1 | `version` must be a non-empty string. | `AtelierDocumentSchema` |
| 2 | `name` must be a non-empty string. | `AtelierDocumentSchema` |
| 3 | `canvas.width`, `canvas.height`, and `canvas.fps` must be positive integers. | `CanvasSchema` |
| 4 | Hex colors must match `/^#([0-9a-fA-F]{3,4}\|[0-9a-fA-F]{6}\|[0-9a-fA-F]{8})$/`. | `HexColorSchema` |
| 5 | RGBA channels `r`, `g`, `b` must be in 0-255; `a` must be in 0-1. | `RGBAColorSchema` |
| 6 | HSLA `h` must be in 0-360; `s` and `l` in 0-100; `a` in 0-1. | `HSLAColorSchema` |
| 7 | Percentage strings must match `/^-?\d+(\.\d+)?%$/`. | `PercentageSchema` |
| 8 | `AnchorPoint` `x` and `y` must be in 0-1. | `AnchorPointSchema` |
| 9 | Layer `opacity` must be in 0-1. | `LayerSchema` |
| 10 | Layer `id` must be non-empty. | `LayerSchema` |
| 11 | `ImageVisual.assetId` must be non-empty. | `ImageVisualSchema` |
| 12 | `RefVisual.src` must be non-empty. | `RefVisualSchema` |
| 13 | `PathShape.points` must have at least 2 points. | `PathShapeSchema` |
| 14 | `cornerRadius` values must be >= 0. | `RectShapeSchema` |
| 15 | `Stroke.width` must be >= 0. Dash values must each be >= 0. | `StrokeSchema` |
| 16 | `TextStyle.fontFamily` must be non-empty. `fontSize` must be positive. | `TextStyleSchema` |
| 17 | `TextStyle.lineHeight` must be positive if provided. | `TextStyleSchema` |
| 18 | Gradient stops require a minimum of 2 stops. | `LinearGradientFillSchema`, `RadialGradientFillSchema` |
| 19 | Gradient stop `offset` must be in 0-1. | `GradientStopSchema` |
| 20 | `CubicBezierEasing` `x1` and `x2` must be in 0-1. | `CubicBezierEasingSchema` |
| 21 | `SpringEasing` `mass`, `stiffness`, and `damping` must be positive if provided. | `SpringEasingSchema` |
| 22 | `StepEasing.steps` must be a positive integer. | `StepEasingSchema` |
| 23 | `Delta.layer` must be non-empty. | `DeltaSchema` |
| 24 | `FrameRange` values must be non-negative integers, and end must be >= start. | `FrameRangeSchema` |
| 25 | `State.duration` must be a positive integer. | `StateSchema` |
| 26 | `Preset.deltas` must have at least one entry. | `PresetSchema` |
| 27 | `PresetDelta.offset` values must be non-negative integers. | `PresetDeltaSchema` |
| 28 | `Asset.src` must be non-empty. | `AssetSchema` |

### 4.2 Semantic Constraints (Runtime)

These are enforced by `@atelier/core` validation utilities or expected by the engine at render time.

| # | Constraint | Enforced By |
|---|-----------|-------------|
| 29 | **No overlapping deltas.** Two deltas within the same state targeting the same `layer` + `property` must not have overlapping frame ranges. Ranges `[a0, a1]` and `[b0, b1]` overlap when `a0 <= b1 && b0 <= a1`. | `validateNoOverlap()`, `validateAllDeltas()` in `packages/core/src/validation/overlap-validator.ts` |
| 30 | **Layer IDs must be unique** within the `layers` array. | Consumer responsibility; the schema validates non-empty but does not check uniqueness across the array. |
| 31 | **Delta `layer` references must point to existing layer IDs.** | Consumer responsibility at render time. |
| 32 | **State names must be unique.** Guaranteed by the `Record<string, State>` structure (YAML map keys are unique). | YAML specification / Record semantics. |
| 33 | **`ImageVisual.assetId` should reference a key in the `assets` map.** | Consumer responsibility at render time. |
| 34 | **Percentage resolution.** Percentage `UnitValue` fields are resolved against the parent layer's or canvas's dimensions at render time. | `resolveUnit()` in `packages/core/src/units/resolve-units.ts` |

### 4.3 Hold-After-End Semantics

When a delta's frame range ends but no new delta for that layer+property is active, the `to` value of the most recently completed delta is held. This is **not** a constraint to be validated but a behavioral guarantee of the engine:

- At frame `F`, if no delta covers `F` for a given layer+property, the resolver searches for the delta whose `range[1]` is the largest value still less than `F`.
- If found, that delta's `to` value is returned.
- If no delta has completed before frame `F`, the property returns `undefined` and the layer's original static value is used.

This behavior is implemented in `resolvePropertyAtFrame()` in `packages/core/src/resolver/delta-resolver.ts`.

### 4.4 State Machine Behavior

The state machine (`packages/core/src/state/state-machine.ts`) enforces the following at runtime:

- A document must have at least one state.
- The initial state defaults to the first key in the `states` map.
- `seek()` clamps the frame to `[0, duration - 1]`.
- `transition()` validates that the target state exists.
- `isComplete` is true when `currentFrame >= duration - 1`.


## 5. File Format Summary

### File Extension

`.atelier` (YAML format)

### YAML Conventions

- Documents are standard YAML 1.2.
- Parsed via the `yaml` npm package.
- Serialized with 2-space indentation.
- Boolean values use YAML native `true`/`false`.
- Percentage strings must be quoted in YAML to prevent interpretation as numbers: `"50%"`.

### Parsing and Serialization

```typescript
import { parseAtelier, serializeAtelier } from "@atelier/schema";

// Parse YAML string -> validated AtelierDocument
const result = parseAtelier(yamlString);
if (result.success) {
  const doc = result.data;  // AtelierDocument
} else {
  console.error(result.errors);  // ValidationError[]
}

// Serialize AtelierDocument -> YAML string
const yaml = serializeAtelier(doc);
```

**Source:** `packages/schema/src/parse.ts`


## 6. Source File Index

| File | Package | Contents |
|------|---------|----------|
| `packages/types/src/document.ts` | `@atelier/types` | `AtelierDocument`, `Canvas` |
| `packages/types/src/units.ts` | `@atelier/types` | `Pixel`, `Percentage`, `UnitValue` |
| `packages/types/src/coordinates.ts` | `@atelier/types` | `Frame`, `Bounds`, `AnchorPoint` |
| `packages/types/src/color.ts` | `@atelier/types` | `RGBAColor`, `HSLAColor`, `HexColor`, `Color` |
| `packages/types/src/shape.ts` | `@atelier/types` | `Shape`, `Fill`, `Stroke`, `TextStyle`, `PathPoint`, `GradientStop` |
| `packages/types/src/layer.ts` | `@atelier/types` | `Layer`, `Visual`, `ShapeVisual`, `TextVisual`, `ImageVisual`, `GroupVisual`, `RefVisual` |
| `packages/types/src/easing.ts` | `@atelier/types` | `Easing`, `EasingPreset`, `LinearEasing`, `CubicBezierEasing`, `SpringEasing`, `StepEasing` |
| `packages/types/src/delta.ts` | `@atelier/types` | `Delta`, `AnimatableProperty`, `FrameRange` |
| `packages/types/src/state.ts` | `@atelier/types` | `State` |
| `packages/types/src/preset.ts` | `@atelier/types` | `Preset`, `PresetDelta` |
| `packages/types/src/variable.ts` | `@atelier/types` | `Variable`, `VariableType` |
| `packages/types/src/asset.ts` | `@atelier/types` | `Asset`, `AssetType` |
| `packages/schema/src/document.ts` | `@atelier/schema` | `AtelierDocumentSchema`, `CanvasSchema` |
| `packages/schema/src/units.ts` | `@atelier/schema` | `PixelSchema`, `PercentageSchema`, `UnitValueSchema` |
| `packages/schema/src/coordinates.ts` | `@atelier/schema` | `FrameSchema`, `BoundsSchema`, `AnchorPointSchema` |
| `packages/schema/src/color.ts` | `@atelier/schema` | `RGBAColorSchema`, `HSLAColorSchema`, `HexColorSchema`, `ColorSchema` |
| `packages/schema/src/shape.ts` | `@atelier/schema` | `ShapeSchema`, `FillSchema`, `StrokeSchema`, `TextStyleSchema`, `PathPointSchema`, `GradientStopSchema` |
| `packages/schema/src/layer.ts` | `@atelier/schema` | `LayerSchema`, `VisualSchema` |
| `packages/schema/src/easing.ts` | `@atelier/schema` | `EasingSchema` and individual easing schemas |
| `packages/schema/src/delta.ts` | `@atelier/schema` | `DeltaSchema`, `AnimatablePropertySchema`, `FrameRangeSchema` |
| `packages/schema/src/state.ts` | `@atelier/schema` | `StateSchema` |
| `packages/schema/src/preset.ts` | `@atelier/schema` | `PresetSchema`, `PresetDeltaSchema` |
| `packages/schema/src/variable.ts` | `@atelier/schema` | `VariableSchema`, `VariableTypeSchema` |
| `packages/schema/src/asset.ts` | `@atelier/schema` | `AssetSchema`, `AssetTypeSchema` |
| `packages/schema/src/validate.ts` | `@atelier/schema` | `validateDocument()`, `validateLayer()`, `validateDelta()` |
| `packages/schema/src/parse.ts` | `@atelier/schema` | `parseAtelier()`, `serializeAtelier()` |
| `packages/core/src/resolver/delta-resolver.ts` | `@atelier/core` | `resolveDeltaValue()`, `resolvePropertyAtFrame()`, `interpolateValue()` |
| `packages/core/src/resolver/frame-resolver.ts` | `@atelier/core` | `resolveFrame()` |
| `packages/core/src/resolver/easing-resolver.ts` | `@atelier/core` | `resolveEasing()` |
| `packages/core/src/validation/overlap-validator.ts` | `@atelier/core` | `validateNoOverlap()`, `validateAllDeltas()`, `rangesOverlap()` |
| `packages/core/src/units/resolve-units.ts` | `@atelier/core` | `resolveUnit()`, `isPercentage()`, `parsePercentage()` |
| `packages/core/src/presets/preset-resolver.ts` | `@atelier/core` | `expandPreset()` |
| `packages/core/src/state/state-machine.ts` | `@atelier/core` | `StateMachine` |
| `packages/core/src/templates/template-resolver.ts` | `@atelier/core` | `instantiateTemplate()`, `findTemplateVariables()` |
