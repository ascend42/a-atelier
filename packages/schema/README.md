---
title: "@atelier/schema"
scope: Zod validation schemas, YAML parse/serialize, AI-readable error formatting
packages: ["@atelier/schema"]
related: ["docs/format-spec.md", "packages/types/README.md", "packages/core/README.md"]
---

# @atelier/schema

Zod validation schemas for the Atelier animation document format. Every type in `@atelier/types` has a corresponding runtime schema here, plus validation functions that return flat, AI-readable errors and YAML parse/serialize utilities.

## Package Info

| Field | Value |
|-------|-------|
| Name | `@atelier/schema` |
| Version | `0.1.0` |
| Build | tsup (ESM + CJS + DTS) |
| Source | `packages/schema/src/` |
| Test | `vitest run` |

### Dependencies

| Package | Version |
|---------|---------|
| `@atelier/types` | `workspace:*` |
| `zod` | `^4.6.7` |
| `yaml` | `^2.7.0` |

## Architecture

```
@atelier/types (TypeScript interfaces)
        |
        v
@atelier/schema (Zod runtime schemas)
   |         |
   v         v
validate  parse/serialize
   |         |
   +----+----+
        |
        v
  ValidationResult<T>
  { success, data | errors }
```

All validation paths converge on a single `ValidationResult<T>` type. Whether you validate a JS object or parse YAML, you get the same result shape with flat `{path, message}` errors.

## Exports

### Zod Schemas

Every schema mirrors a type from `@atelier/types` one-to-one.

#### Units (`src/units.ts`)

| Schema | Validates |
|--------|-----------|
| `PixelSchema` | Any number (pixel value) |
| `PercentageSchema` | String matching `/^-?\d+(\.\d+)?%$/` (e.g. `"50%"`) |
| `UnitValueSchema` | Union of `PixelSchema \| PercentageSchema` |

#### Coordinates (`src/coordinates.ts`)

| Schema | Validates |
|--------|-----------|
| `FrameSchema` | `{ x: UnitValue, y: UnitValue }` |
| `BoundsSchema` | `{ width: UnitValue, height: UnitValue }` |
| `AnchorPointSchema` | `{ x: 0..1, y: 0..1 }` |

#### Color (`src/color.ts`)

| Schema | Validates |
|--------|-----------|
| `RGBAColorSchema` | `{ r: 0-255, g: 0-255, b: 0-255, a: 0-1 }` |
| `HSLAColorSchema` | `{ h: 0-360, s: 0-100, l: 0-100, a: 0-1 }` |
| `HexColorSchema` | Hex string: `#RGB`, `#RGBA`, `#RRGGBB`, or `#RRGGBBAA` |
| `ColorSchema` | Union of `RGBA \| HSLA \| Hex` |

#### Shape & Fill (`src/shape.ts`)

| Schema | Validates |
|--------|-----------|
| `PathPointSchema` | `{ x, y }` with optional `in`/`out` control points |
| `RectShapeSchema` | `{ type: "rect" }` with optional `cornerRadius` (number or 4-tuple) |
| `EllipseShapeSchema` | `{ type: "ellipse" }` |
| `PathShapeSchema` | `{ type: "path", points: [...] }` (min 2 points), optional `closed` |
| `ShapeSchema` | Discriminated union on `type`: rect, ellipse, path |
| `GradientStopSchema` | `{ offset: 0-1, color: Color }` |
| `SolidFillSchema` | `{ type: "solid", color: Color }` |
| `LinearGradientFillSchema` | `{ type: "linear-gradient", angle, stops }` (min 2 stops) |
| `RadialGradientFillSchema` | `{ type: "radial-gradient", center, radius, stops }` (min 2 stops) |
| `FillSchema` | Discriminated union on `type`: solid, linear-gradient, radial-gradient |
| `StrokeSchema` | `{ color, width }` with optional `dash`, `lineCap`, `lineJoin` |
| `TextStyleSchema` | `{ fontFamily, fontSize, color }` with optional weight, style, align, etc. |

#### Easing (`src/easing.ts`)

| Schema | Validates |
|--------|-----------|
| `LinearEasingSchema` | `{ type: "linear" }` |
| `CubicBezierEasingSchema` | `{ type: "cubic-bezier", x1, y1, x2, y2 }` (x1/x2 clamped 0-1) |
| `SpringEasingSchema` | `{ type: "spring" }` with optional mass, stiffness, damping, velocity |
| `StepEasingSchema` | `{ type: "step", steps }` with optional position (start/end) |
| `EasingPresetSchema` | Enum: `"ease-in"`, `"ease-out"`, `"ease-in-out"` |
| `EasingSchema` | Union of all easing types + presets |

#### Layer (`src/layer.ts`)

| Schema | Validates |
|--------|-----------|
| `ShapeVisualSchema` | `{ type: "shape", shape }` with optional fill/stroke |
| `TextVisualSchema` | `{ type: "text", content, style }` |
| `ImageVisualSchema` | `{ type: "image", assetId }` |
| `GroupVisualSchema` | `{ type: "group" }` |
| `RefVisualSchema` | `{ type: "ref", src }` |
| `VisualSchema` | Discriminated union on `type`: shape, text, image, group, ref |
| `LayerSchema` | Full layer: `{ id, visual, frame, bounds }` + optional fields |

#### Delta (`src/delta.ts`)

| Schema | Validates |
|--------|-----------|
| `AnimatablePropertySchema` | Enum of animatable dot-paths (e.g. `"opacity"`, `"frame.x"`, `"scale.y"`) |
| `FrameRangeSchema` | `[start, end]` tuple where end >= start (both non-negative integers) |
| `DeltaSchema` | `{ layer, property, range, from, to }` with optional easing, id, description, tags |

#### State (`src/state.ts`)

| Schema | Validates |
|--------|-----------|
| `StateSchema` | `{ duration, deltas: Delta[] }` with optional description, tags |

#### Preset (`src/preset.ts`)

| Schema | Validates |
|--------|-----------|
| `PresetDeltaSchema` | `{ property, from, to }` with optional offset and easing |
| `PresetSchema` | `{ deltas: PresetDelta[] }` (min 1 delta) with optional description, tags |

#### Variable (`src/variable.ts`)

| Schema | Validates |
|--------|-----------|
| `VariableTypeSchema` | Enum: `"string"`, `"number"`, `"color"`, `"asset"`, `"boolean"` |
| `VariableSchema` | `{ type: VariableType }` with optional default, description |

#### Asset (`src/asset.ts`)

| Schema | Validates |
|--------|-----------|
| `AssetTypeSchema` | Enum: `"image"`, `"svg"`, `"font"`, `"animation"` |
| `AssetSchema` | `{ type: AssetType, src }` with optional description |

#### Document (`src/document.ts`)

| Schema | Validates |
|--------|-----------|
| `CanvasSchema` | `{ width, height, fps }` (positive integers) with optional background |
| `AtelierDocumentSchema` | Full document: `{ version, name, canvas, layers, states }` with optional description, tags, variables, assets, presets |

### Validation Functions (`src/validate.ts`)

```typescript
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

interface ValidationError {
  path: string;
  message: string;
}

function validateDocument(input: unknown): ValidationResult<AtelierDocument>;
function validateLayer(input: unknown): ValidationResult<Layer>;
function validateDelta(input: unknown): ValidationResult<Delta>;
```

All three functions follow the same pattern: call `safeParse` on the corresponding Zod schema, then flatten any Zod issues into `{path, message}` pairs via an internal `formatErrors()` function. The path is built from `issue.path.join(".")`, falling back to `"(root)"` when the issue has no path segments.

### YAML Parsing (`src/parse.ts`)

```typescript
function parseAtelier(yamlString: string): ValidationResult<AtelierDocument>;
function serializeAtelier(doc: AtelierDocument): string;
```

**`parseAtelier`** performs YAML parse followed by `validateDocument()` in one step. If the YAML itself is malformed, it returns a single error with `path: "(yaml)"` and the parse error message. Otherwise, it delegates to `validateDocument` and returns whatever schema errors apply.

**`serializeAtelier`** converts a validated `AtelierDocument` to a YAML string using `yaml.stringify` with `indent: 2`.

Roundtrip fidelity is tested: parse, validate, serialize, re-parse produces matching data.

## Usage Examples

### 1. Validating a Document

```typescript
import { validateDocument } from "@atelier/schema";

const result = validateDocument({
  version: "1.0",
  name: "my-animation",
  canvas: { width: 1080, height: 1080, fps: 30 },
  layers: [],
  states: {},
});

if (result.success) {
  console.log(result.data.name); // "my-animation"
} else {
  console.error(result.errors);
}
```

### 2. Parsing YAML

```typescript
import { parseAtelier } from "@atelier/schema";

const yaml = `
version: "1.0"
name: fade-in
canvas:
  width: 1920
  height: 1080
  fps: 60
layers:
  - id: bg
    visual:
      type: shape
      shape:
        type: rect
      fill:
        type: solid
        color: "#000000"
    frame: { x: 0, y: 0 }
    bounds: { width: 1920, height: 1080 }
states:
  idle:
    duration: 30
    deltas: []
`;

const result = parseAtelier(yaml);
if (result.success) {
  console.log(result.data.layers[0].id); // "bg"
}
```

### 3. Serializing to YAML

```typescript
import { validateDocument, serializeAtelier } from "@atelier/schema";

const result = validateDocument({
  version: "1.0",
  name: "bounce",
  canvas: { width: 1080, height: 1080, fps: 30 },
  layers: [],
  states: {},
});

if (result.success) {
  const yaml = serializeAtelier(result.data);
  console.log(yaml);
  // version: "1.0"
  // name: bounce
  // canvas:
  //   width: 1080
  //   height: 1080
  //   fps: 30
  // layers: []
  // states: {}
}
```

### 4. Handling Validation Errors (Flat Format)

Errors are flat `{path, message}` objects -- no nested Zod error trees. This makes them easy to log, display, or feed to an AI model.

```typescript
import { validateDocument } from "@atelier/schema";

const result = validateDocument({ name: "test" });
// result:
// {
//   success: false,
//   errors: [
//     { path: "version", message: "Invalid input: expected string, received undefined" },
//     { path: "canvas", message: "Invalid input: expected object, received undefined" },
//     { path: "layers", message: "Invalid input: expected array, received undefined" },
//     { path: "states", message: "Invalid input: expected record, received undefined" }
//   ]
// }

if (!result.success) {
  for (const err of result.errors) {
    console.error(`${err.path}: ${err.message}`);
  }
  // version: Required
  // canvas: Required
  // layers: Required
  // states: Required
}
```

YAML parse errors follow the same shape:

```typescript
import { parseAtelier } from "@atelier/schema";

const result = parseAtelier("{{{{ not yaml");
// { success: false, errors: [{ path: "(yaml)", message: "YAML parse error: ..." }] }
```

### 5. Using Individual Schemas for Partial Validation

You can import any schema directly for ad-hoc validation of fragments:

```typescript
import { LayerSchema, DeltaSchema, ColorSchema } from "@atelier/schema";

// Validate a single layer
const layerResult = LayerSchema.safeParse({
  id: "circle",
  visual: { type: "shape", shape: { type: "ellipse" } },
  frame: { x: "50%", y: "50%" },
  bounds: { width: 200, height: 200 },
});

// Validate a color value
const colorResult = ColorSchema.safeParse("#FF5500");

// Validate a delta
const deltaResult = DeltaSchema.safeParse({
  layer: "title",
  property: "opacity",
  range: [0, 30],
  from: 0,
  to: 1,
  easing: { type: "spring", stiffness: 200, damping: 12 },
});
```

## Schema Source Map

| File | Schemas |
|------|---------|
| `src/units.ts` | PixelSchema, PercentageSchema, UnitValueSchema |
| `src/coordinates.ts` | FrameSchema, BoundsSchema, AnchorPointSchema |
| `src/color.ts` | RGBAColorSchema, HSLAColorSchema, HexColorSchema, ColorSchema |
| `src/shape.ts` | PathPointSchema, RectShapeSchema, EllipseShapeSchema, PathShapeSchema, ShapeSchema, GradientStopSchema, SolidFillSchema, LinearGradientFillSchema, RadialGradientFillSchema, FillSchema, StrokeSchema, TextStyleSchema |
| `src/easing.ts` | LinearEasingSchema, CubicBezierEasingSchema, SpringEasingSchema, StepEasingSchema, EasingPresetSchema, EasingSchema |
| `src/layer.ts` | ShapeVisualSchema, TextVisualSchema, ImageVisualSchema, GroupVisualSchema, RefVisualSchema, VisualSchema, LayerSchema |
| `src/delta.ts` | AnimatablePropertySchema, FrameRangeSchema, DeltaSchema |
| `src/state.ts` | StateSchema |
| `src/preset.ts` | PresetDeltaSchema, PresetSchema |
| `src/variable.ts` | VariableTypeSchema, VariableSchema |
| `src/asset.ts` | AssetTypeSchema, AssetSchema |
| `src/document.ts` | CanvasSchema, AtelierDocumentSchema |
| `src/validate.ts` | validateDocument, validateLayer, validateDelta, ValidationResult, ValidationError |
| `src/parse.ts` | parseAtelier, serializeAtelier |

## Animatable Properties

The `AnimatablePropertySchema` defines every dot-path that can appear in a delta's `property` field:

```
frame.x           frame.y
bounds.width       bounds.height
opacity            rotation
scale.x            scale.y
anchorPoint.x      anchorPoint.y
visual.shape.cornerRadius
visual.fill.color  visual.stroke.color  visual.stroke.width
visual.style.fontSize  visual.style.color
```

## Design Decisions

**Flat errors over Zod error trees.** Zod's native `ZodError` produces deeply nested issue objects with arrays of unions. The `formatErrors()` function flattens these into `{path, message}` pairs that are trivial to iterate, log, or pass to an LLM for interpretation.

**Single result type for JSON and YAML.** Both `validateDocument()` and `parseAtelier()` return `ValidationResult<AtelierDocument>`, so consuming code handles one shape regardless of input format.

**Discriminated unions for extensibility.** Shapes, fills, visuals, and easings all use Zod's `discriminatedUnion` on the `type` field, matching the tagged-union pattern in `@atelier/types`. Adding a new visual type means adding one schema variant to the union.

**Schemas mirror types, not the other way around.** `@atelier/types` is the source of truth for the type system. Schemas here validate against those types at runtime but do not generate them. This keeps the types package dependency-free.
