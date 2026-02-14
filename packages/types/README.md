---
title: "@atelier/types"
scope: 47 TypeScript type definitions across 12 modules
packages: ["@atelier/types"]
related: ["docs/format-spec.md", "docs/architecture.md", "packages/schema/README.md"]
---

# @atelier/types

Pure TypeScript type definitions for the Atelier animation format. Zero runtime -- every export is a `type` or `interface`. No dependencies.

## Overview

| | |
|---|---|
| **Package** | `@atelier/types` |
| **Version** | `0.1.0` |
| **Runtime footprint** | Zero -- types are erased at compile time |
| **Dependencies** | None |
| **Build** | tsup (ESM + CJS + DTS) |
| **Source** | `packages/types/src/` |
| **Exports** | 47 types and interfaces across 12 modules |

All other `@atelier/*` packages depend on these types. They define the complete vocabulary for describing layered, frame-based animations in YAML or JSON.

## Installation

```bash
pnpm add @atelier/types
```

```typescript
import type { AtelierDocument, Layer, Delta } from "@atelier/types";
```

## Type Hierarchy

The types compose from primitives up to the root document:

```
AtelierDocument
 |-- version, name, description, tags
 |-- Canvas  (width, height, fps, background)
 |-- Record<string, Variable>       -- template slots
 |-- Record<string, Asset>          -- external files
 |-- Record<string, Preset>         -- reusable delta sets
 |     '-- PresetDelta[]
 |           '-- AnimatableProperty, Easing
 |-- Layer[]
 |     |-- id, parentId, opacity, rotation, scale, visible
 |     |-- Frame  (x, y)            -- position
 |     |-- Bounds (width, height)   -- size
 |     |-- AnchorPoint (x, y)       -- transform origin
 |     '-- Visual (union)
 |           |-- ShapeVisual
 |           |     |-- Shape (RectShape | EllipseShape | PathShape)
 |           |     |     '-- PathPoint (x, y, in?, out?)
 |           |     |-- Fill  (SolidFill | LinearGradientFill | RadialGradientFill)
 |           |     |     '-- GradientStop (offset, Color)
 |           |     '-- Stroke (color, width, dash?, lineCap?, lineJoin?)
 |           |-- TextVisual
 |           |     '-- TextStyle (fontFamily, fontSize, color, ...)
 |           |-- ImageVisual (assetId)
 |           |-- GroupVisual
 |           '-- RefVisual  (src -- path to another .atelier file)
 |
 '-- Record<string, State>
       |-- duration (frames)
       '-- Delta[]
             |-- layer        -- target layer ID
             |-- property     -- AnimatableProperty (16 paths)
             |-- range        -- FrameRange [start, end]
             |-- from / to   -- start and end values
             '-- easing?      -- Easing
                   |-- LinearEasing
                   |-- CubicBezierEasing (x1, y1, x2, y2)
                   |-- SpringEasing (mass, stiffness, damping, velocity)
                   |-- StepEasing (steps, position)
                   '-- EasingPreset ("ease-in" | "ease-out" | "ease-in-out")

Primitives:
  UnitValue = Pixel (number) | Percentage (`${number}%`)
  Color     = RGBAColor | HSLAColor | HexColor (string)
```

---

## Module Reference

### 1. `units.ts` -- Unit System

Three types that underpin all spatial values.

```typescript
type Pixel = number;
type Percentage = `${number}%`;
type UnitValue = Pixel | Percentage;
```

`UnitValue` appears throughout `Frame`, `Bounds`, gradient centers, and radii. A plain number is interpreted as pixels; a template-literal string like `"50%"` is a percentage of the parent dimension.

---

### 2. `coordinates.ts` -- Spatial Types

Position, size, and transform origin for every layer.

```typescript
interface Frame {
  x: UnitValue;
  y: UnitValue;
}

interface Bounds {
  width: UnitValue;
  height: UnitValue;
}

interface AnchorPoint {
  x: number;  // 0-1 normalized
  y: number;  // 0-1 normalized
}
```

`AnchorPoint` defaults to `{ x: 0.5, y: 0.5 }` (center) when omitted. Rotation and scale transforms pivot around this point.

---

### 3. `color.ts` -- Color Formats

Four types supporting RGB, HSL, and hex notation.

```typescript
interface RGBAColor {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-1
}

interface HSLAColor {
  h: number;  // 0-360 degrees
  s: number;  // 0-100
  l: number;  // 0-100
  a: number;  // 0-1
}

type HexColor = string;  // e.g. "#FF0000" or "#FF000080"

type Color = RGBAColor | HSLAColor | HexColor;
```

`Color` is the universal color union used by fills, strokes, gradients, and text styles.

---

### 4. `shape.ts` -- Shape Primitives

Twelve types covering geometry, fills, strokes, and text styling.

```typescript
interface PathPoint {
  x: number;
  y: number;
  in?: { x: number; y: number };   // incoming bezier handle (relative)
  out?: { x: number; y: number };  // outgoing bezier handle (relative)
}

interface RectShape {
  type: "rect";
  cornerRadius?: number | [number, number, number, number];
}

interface EllipseShape {
  type: "ellipse";
}

interface PathShape {
  type: "path";
  points: PathPoint[];
  closed?: boolean;
}

type Shape = RectShape | EllipseShape | PathShape;
```

```typescript
interface GradientStop {
  offset: number;  // 0-1
  color: Color;
}

interface SolidFill {
  type: "solid";
  color: Color;
}

interface LinearGradientFill {
  type: "linear-gradient";
  angle: number;  // degrees
  stops: GradientStop[];
}

interface RadialGradientFill {
  type: "radial-gradient";
  center: { x: UnitValue; y: UnitValue };
  radius: UnitValue;
  stops: GradientStop[];
}

type Fill = SolidFill | LinearGradientFill | RadialGradientFill;
```

```typescript
interface Stroke {
  color: Color;
  width: number;
  dash?: number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number | "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  color: Color;
}
```

---

### 5. `layer.ts` -- Layer System

Seven types that define visual content and the layer container itself.

```typescript
interface ShapeVisual  { type: "shape"; shape: Shape; fill?: Fill; stroke?: Stroke; }
interface TextVisual   { type: "text"; content: string; style: TextStyle; }
interface ImageVisual  { type: "image"; assetId: string; }
interface GroupVisual   { type: "group"; }
interface RefVisual     { type: "ref"; src: string; }

type Visual = ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual;
```

```typescript
interface Layer {
  id: string;
  description?: string;
  tags?: string[];
  visual: Visual;
  frame: Frame;
  bounds: Bounds;
  anchorPoint?: AnchorPoint;
  parentId?: string;        // parent layer ID for transform inheritance
  opacity?: number;         // 0-1
  rotation?: number;        // degrees
  scale?: { x: number; y: number };
  visible?: boolean;
}
```

Layers form a flat list with optional parent-child relationships via `parentId`. Child layers inherit their parent's transform.

---

### 6. `easing.ts` -- Easing Definitions

Six types controlling interpolation curves.

```typescript
interface LinearEasing       { type: "linear"; }
interface CubicBezierEasing  { type: "cubic-bezier"; x1: number; y1: number; x2: number; y2: number; }
interface SpringEasing        { type: "spring"; mass?: number; stiffness?: number; damping?: number; velocity?: number; }
interface StepEasing          { type: "step"; steps: number; position?: "start" | "end"; }

type EasingPreset = "ease-in" | "ease-out" | "ease-in-out";

type Easing = LinearEasing | CubicBezierEasing | SpringEasing | StepEasing | EasingPreset;
```

`Easing` accepts either a structured object or a named preset string. When omitted from a `Delta`, linear interpolation is assumed.

---

### 7. `delta.ts` -- Animation Instructions

Three types that describe a single property change over a frame range.

```typescript
type AnimatableProperty =
  | "frame.x" | "frame.y"
  | "bounds.width" | "bounds.height"
  | "opacity" | "rotation"
  | "scale.x" | "scale.y"
  | "anchorPoint.x" | "anchorPoint.y"
  | "visual.shape.cornerRadius"
  | "visual.fill.color"
  | "visual.stroke.color" | "visual.stroke.width"
  | "visual.style.fontSize" | "visual.style.color";

type FrameRange = [number, number];  // [start, end], inclusive, 0-based

interface Delta {
  id?: string;
  layer: string;             // target layer ID
  property: AnimatableProperty;
  range: FrameRange;
  from: unknown;
  to: unknown;
  easing?: Easing;
  description?: string;
  tags?: string[];
}
```

A `Delta` is the atomic unit of animation. It says: "on layer X, animate property Y from value A to value B across frames [start, end] using easing Z."

---

### 8. `state.ts` -- Animation States

A named choreography grouping deltas with a duration.

```typescript
interface State {
  description?: string;
  tags?: string[];
  duration: number;   // in frames
  deltas: Delta[];
}
```

Each key in `AtelierDocument.states` is a state name (e.g. `"idle"`, `"hover"`, `"entrance"`). States can be sequenced or triggered independently.

---

### 9. `preset.ts` -- Reusable Animations

Two types for defining layer-agnostic delta templates.

```typescript
interface PresetDelta {
  property: AnimatableProperty;
  offset?: [number, number];   // relative frame offset
  from: unknown;
  to: unknown;
  easing?: Easing;
}

interface Preset {
  description?: string;
  tags?: string[];
  deltas: PresetDelta[];
}
```

Presets omit the `layer` field. When applied, the target layer and absolute frame range are supplied at the call site.

---

### 10. `variable.ts` -- Template Variables

Two types for parameterizing documents.

```typescript
type VariableType = "string" | "number" | "color" | "asset" | "boolean";

interface Variable {
  type: VariableType;
  default?: unknown;
  description?: string;
}
```

Variables allow a single `.atelier` document to serve as a template. Consumers supply values at render time; unset variables fall back to `default`.

---

### 11. `asset.ts` -- External Assets

Two types for referencing external files.

```typescript
type AssetType = "image" | "svg" | "font" | "animation";

interface Asset {
  type: AssetType;
  src: string;         // file path or URL
  description?: string;
}
```

Assets are declared in `AtelierDocument.assets` and referenced by ID from `ImageVisual.assetId` or variable bindings.

---

### 12. `document.ts` -- Root Document

Two types that form the top-level structure.

```typescript
interface Canvas {
  width: number;
  height: number;
  fps: number;
  background?: string;
}

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

`AtelierDocument` is the root type. Every `.atelier` YAML/JSON file deserializes to this shape.

---

## AnimatableProperty Catalog

All 16 properties that can be animated via `Delta`:

| Property | Value Type | Description |
|---|---|---|
| `frame.x` | `UnitValue` (number or `"N%"`) | X position within parent |
| `frame.y` | `UnitValue` (number or `"N%"`) | Y position within parent |
| `bounds.width` | `UnitValue` (number or `"N%"`) | Layer width |
| `bounds.height` | `UnitValue` (number or `"N%"`) | Layer height |
| `opacity` | `number` (0--1) | Layer opacity |
| `rotation` | `number` (degrees) | Rotation around anchor point |
| `scale.x` | `number` | Horizontal scale factor |
| `scale.y` | `number` | Vertical scale factor |
| `anchorPoint.x` | `number` (0--1) | Anchor X (normalized) |
| `anchorPoint.y` | `number` (0--1) | Anchor Y (normalized) |
| `visual.shape.cornerRadius` | `number` | Corner radius (rect shapes only) |
| `visual.fill.color` | `Color` | Fill color |
| `visual.stroke.color` | `Color` | Stroke color |
| `visual.stroke.width` | `number` | Stroke width in pixels |
| `visual.style.fontSize` | `number` | Font size (text layers only) |
| `visual.style.color` | `Color` | Text color (text layers only) |

---

## Export Summary

All 47 types re-exported from the barrel `index.ts`:

| Module | Exports | Count |
|---|---|---|
| `units.ts` | `Pixel`, `Percentage`, `UnitValue` | 3 |
| `coordinates.ts` | `Frame`, `Bounds`, `AnchorPoint` | 3 |
| `color.ts` | `RGBAColor`, `HSLAColor`, `HexColor`, `Color` | 4 |
| `shape.ts` | `PathPoint`, `RectShape`, `EllipseShape`, `PathShape`, `Shape`, `GradientStop`, `SolidFill`, `LinearGradientFill`, `RadialGradientFill`, `Fill`, `Stroke`, `TextStyle` | 12 |
| `layer.ts` | `ShapeVisual`, `TextVisual`, `ImageVisual`, `GroupVisual`, `RefVisual`, `Visual`, `Layer` | 7 |
| `easing.ts` | `LinearEasing`, `CubicBezierEasing`, `SpringEasing`, `StepEasing`, `EasingPreset`, `Easing` | 6 |
| `delta.ts` | `AnimatableProperty`, `FrameRange`, `Delta` | 3 |
| `state.ts` | `State` | 1 |
| `preset.ts` | `PresetDelta`, `Preset` | 2 |
| `variable.ts` | `VariableType`, `Variable` | 2 |
| `asset.ts` | `AssetType`, `Asset` | 2 |
| `document.ts` | `Canvas`, `AtelierDocument` | 2 |
| **Total** | | **47** |

---

## Build

```bash
pnpm --filter @atelier/types build       # compile with tsup
pnpm --filter @atelier/types typecheck   # tsc --noEmit
pnpm --filter @atelier/types test        # vitest run
pnpm --filter @atelier/types clean       # rm -rf dist
```

Output lands in `dist/` with three artifacts:

| File | Format |
|---|---|
| `dist/index.js` | ESM |
| `dist/index.cjs` | CommonJS |
| `dist/index.d.ts` | TypeScript declarations |

---

## Design Principles

**Type-only, zero runtime.** Every export uses `export type` or `export interface`. The compiled JavaScript output is empty. This guarantees the package adds nothing to bundle size.

**Flat union discrimination.** Shape, Visual, Fill, and Easing unions use a literal `type` field for narrowing:

```typescript
function renderVisual(v: Visual) {
  switch (v.type) {
    case "shape": /* v is ShapeVisual */ break;
    case "text":  /* v is TextVisual  */ break;
    case "image": /* v is ImageVisual */ break;
    case "group": /* v is GroupVisual */ break;
    case "ref":   /* v is RefVisual   */ break;
  }
}
```

**Flat layer list.** Layers are stored as a flat array with optional `parentId` references rather than a nested tree. This simplifies serialization and delta targeting while still supporting transform inheritance.

**Stringly-typed property paths.** `AnimatableProperty` uses dot-notation strings (`"frame.x"`, `"visual.fill.color"`) to address nested fields. This keeps the `Delta` interface uniform regardless of property depth.
