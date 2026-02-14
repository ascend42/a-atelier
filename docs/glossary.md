---
title: Glossary
scope: Every Atelier term with canonical type paths and definitions
packages: ["all"]
related: ["docs/format-spec.md", "docs/architecture.md"]
---

# Glossary

Canonical reference for every Atelier-specific term. Each entry lists the
type path (package, file, line), a definition, and cross-references.

## Quick Reference

| Term | Definition |
|------|------------|
| **AnchorPoint** | Pivot for rotation/scale, normalized 0-1 within layer bounds |
| **AnimatableProperty** | Union of 16 string literals naming delta-animatable properties |
| **Asset** | External resource (image, font, SVG, animation) referenced by a document |
| **AtelierDocument** | Root type for an entire animation definition |
| **Bounds** | Width and height of a layer in pixels or percentages |
| **Canvas** | Viewport settings: dimensions, frame rate, background color |
| **Color** | Union of hex string, RGBA, or HSLA color representations |
| **Corner Radius** | Numeric value rounding a RectShape's corners |
| **Cubic Bezier** | Easing via four control points, CSS `cubic-bezier()` compatible |
| **Delta** | Per-property animation instruction over a frame range |
| **DocumentBuilder** | Fluent API for constructing documents with validation |
| **DocumentStore** | In-memory `Map<string, AtelierDocument>` for MCP sessions |
| **Easing** | Function mapping linear time to visual time (6 variants) |
| **EffectiveLayer** | Render-time merge of animated properties over layer defaults |
| **Fill** | Shape interior paint: solid, linear gradient, or radial gradient |
| **Frame** | X/Y position of a layer on the canvas |
| **FrameRange** | `[start, end]` tuple for a delta's frame interval |
| **fps** | Frames per second; converts frame numbers to wall-clock time |
| **GradientStop** | Single color stop in a gradient fill |
| **Hold-After-End** | Delta `to` value persists after its frame range ends |
| **Layer** | Visual element with position, size, and transform properties |
| **Lerp** | Linear interpolation: `a + (b - a) * t` |
| **MCP** | Model Context Protocol for AI tool integration |
| **No-Overlap** | Two deltas on same layer+property cannot overlap in time |
| **Opacity** | Layer transparency, 0 (invisible) to 1 (fully opaque) |
| **Painters Algorithm** | Layers draw first-to-last, no z-index |
| **Path** | Shape type for custom geometry via points and bezier handles |
| **Percentage** | Template literal type `` `${number}%` `` for relative sizing |
| **Pixel** | Alias for `number`, absolute pixel value |
| **Preset** | Reusable animation pattern expanded into concrete deltas |
| **RenderContext** | Minimal Canvas 2D API interface for the renderer |
| **ResolvedFrame** | All layers with computed properties at one frame |
| **ResolvedLayer** | Single layer with computed animation overrides |
| **Rotation** | Clockwise rotation in degrees around the anchor point |
| **Scale** | X/Y scale multiplier around the anchor point |
| **Shape** | Union of rect, ellipse, and path geometry |
| **Spring** | Physics-based easing via damped harmonic oscillator |
| **State** | Named timeline with duration and delta list |
| **StateMachine** | Playback controller for advancing, seeking, transitioning |
| **Step** | Easing that jumps between discrete values |
| **Stroke** | Shape outline: color, width, dash, caps, joins |
| **Template Variable** | Named substitution slot in a document |
| **TextStyle** | Font and color configuration for text visuals |
| **UnitValue** | Union of Pixel or Percentage for flexible sizing |
| **Visual** | Layer content type: shape, text, image, group, or ref |

## Definitions

---

### AnchorPoint
`packages/types/src/coordinates.ts:16` -- `interface AnchorPoint { x: number; y: number }`

The pivot point for rotation and scale transforms, expressed as a normalized coordinate within the layer's **Bounds**. `{ x: 0, y: 0 }` is the top-left corner; `{ x: 0.5, y: 0.5 }` is the center. During rendering, the transform stack translates to the anchor pixel position, applies **Rotation** and **Scale**, then translates back. Animatable via `"anchorPoint.x"` and `"anchorPoint.y"` **AnimatableProperty** values. Defaults to `{ x: 0, y: 0 }` when omitted on a **Layer**.

### AnimatableProperty
`packages/types/src/delta.ts:4` -- `type AnimatableProperty = "frame.x" | "frame.y" | "bounds.width" | "bounds.height" | "opacity" | "rotation" | "scale.x" | "scale.y" | "anchorPoint.x" | "anchorPoint.y" | "visual.shape.cornerRadius" | "visual.fill.color" | "visual.stroke.color" | "visual.stroke.width" | "visual.style.fontSize" | "visual.style.color"`

A union of 16 string literals naming every property a **Delta** can animate. Each uses dot-path notation relative to the **Layer** type. Numeric properties interpolate via **Lerp**; string properties (such as hex colors) snap at the end of the easing curve. The delta resolver in `packages/core/src/resolver/delta-resolver.ts` uses this to write computed values into the **ResolvedLayer**.

### Asset
`packages/types/src/asset.ts:4` -- `interface Asset { type: "image" | "svg" | "font" | "animation"; src: string; description?: string }`

An external resource referenced by an **AtelierDocument**, stored in the `assets` record keyed by string ID. The `src` field holds a file path or URL. An **ImageVisual** references an asset by `assetId`. Asset loading and rendering are not yet fully implemented in the canvas renderer.

### AtelierDocument
`packages/types/src/document.ts:17` -- `interface AtelierDocument { version, name, canvas: Canvas, layers: Layer[], states: Record<string, State>, variables?, assets?, presets?, ... }`

The root type for an animation definition. Contains **Canvas** viewport settings, an ordered **Layer** array (rendered via the **Painters Algorithm**), and named **State** timelines. Optionally includes **Template Variable** definitions, **Asset** references, and **Preset** libraries. Constructed via the **DocumentBuilder** or parsed from YAML. Held by the **DocumentStore** during MCP sessions.

### Bounds
`packages/types/src/coordinates.ts:10` -- `interface Bounds { width: UnitValue; height: UnitValue }`

The size of a **Layer** in pixels or **Percentage** values. Percentages resolve against the parent canvas or group dimensions at render time. Animatable via `"bounds.width"` and `"bounds.height"`. The **EffectiveLayer** builder resolves unit values to absolute pixels.

### Canvas
`packages/types/src/document.ts:8` -- `interface Canvas { width: number; height: number; fps: number; background?: string }`

Viewport configuration for an **AtelierDocument**. `width`/`height` set dimensions in pixels. **fps** defines the frame rate. The optional `background` color is drawn before any layers (defaults to `"transparent"`). Passed to `renderFrame()` in `packages/canvas/src/render-frame.ts`.

### Color
`packages/types/src/color.ts:21` -- `type Color = RGBAColor | HSLAColor | HexColor`

Union of three color formats. **HexColor** (line 18): string `"#RRGGBB"` or `"#RRGGBBAA"`. **RGBAColor** (line 2): `{ r, g, b, a }` with 0-255 channels and 0-1 alpha. **HSLAColor** (line 9): `{ h, s, l, a }` with h 0-360, s/l 0-100, a 0-1. Conversions and interpolation functions (`hexToRgba`, `rgbaToHex`, `lerpRgba`, `lerpHsla`) live in `packages/math/src/color.ts`. Used in **Fill**, **Stroke**, and **TextStyle**.

### Corner Radius
`packages/types/src/shape.ts:17` -- `cornerRadius?: number | [number, number, number, number]`

Rounds the corners of a **RectShape**. A single number applies uniform rounding; a four-tuple sets each corner individually. `0` or `undefined` means sharp corners. Animatable via `"visual.shape.cornerRadius"`. Rendered using `roundRect()` on the **RenderContext**.

### Cubic Bezier
`packages/types/src/easing.ts:5` -- `interface CubicBezierEasing { type: "cubic-bezier"; x1: number; y1: number; x2: number; y2: number }`

An **Easing** variant defined by four control points, directly compatible with CSS `cubic-bezier()`. The implementation in `packages/math/src/easing.ts:16` uses binary search to find the parametric `t` producing the desired x, then samples y. Common presets: `easeIn` (0.42,0,1,1), `easeOut` (0,0,0.58,1), `easeInOut` (0.42,0,0.58,1) at lines 55-57.

### Delta
`packages/types/src/delta.ts:26` -- `interface Delta { id?, layer: string, property: AnimatableProperty, range: FrameRange, from: unknown, to: unknown, easing?: Easing, ... }`

The fundamental unit of animation in Atelier. Interpolates a single **AnimatableProperty** on one **Layer** over a **FrameRange** using an **Easing** function (default linear). Deltas live inside **State** objects. The **No-Overlap** constraint prevents two deltas from targeting the same layer+property over overlapping ranges. After a delta's range ends, **Hold-After-End** keeps the `to` value active. Resolved in `packages/core/src/resolver/delta-resolver.ts`.

### DocumentBuilder
`packages/core/src/builder/document-builder.ts:11` -- `class DocumentBuilder`

Fluent API for constructing **AtelierDocument** objects programmatically. Entry point: `createDocument(name, canvas)` (line 108). Methods chain: `.addLayer()`, `.addState()`, `.addDelta()`, `.variable()`, `.asset()`, `.preset()`, `.build()`. Validates during construction: rejects duplicate layer IDs and **No-Overlap** violations. `build()` returns a deep-cloned document.

### DocumentStore
`packages/mcp/src/store.ts:16` -- `class DocumentStore`

In-memory `Map<string, AtelierDocument>` used by the **MCP** server. Each document gets a unique ID (auto-generated or user-supplied). Provides `create()`, `get()`, `set()`, `delete()`, `has()`, and `list()` (returns summaries with id, name, canvas). Cleared via `clear()` in tests.

### Easing
`packages/types/src/easing.ts:30` -- `type Easing = LinearEasing | CubicBezierEasing | SpringEasing | StepEasing | EasingPreset`

Maps animation progress from linear time to visual time. Six effective variants: `{ type: "linear" }`, the string presets `"ease-in"` / `"ease-out"` / `"ease-in-out"` (pre-built **Cubic Bezier** curves), `{ type: "cubic-bezier" }` (custom curve), `{ type: "spring" }` (see **Spring**), and `{ type: "step" }` (see **Step**). Resolved to executable functions by `packages/core/src/resolver/easing-resolver.ts:8`. Math in `packages/math/src/easing.ts` and `packages/math/src/spring.ts`.

### EffectiveLayer
`packages/canvas/src/apply-properties.ts:8` -- `interface EffectiveLayer { layer, x, y, width, height, opacity, rotation, scaleX, scaleY, anchorX, anchorY }`

Internal render-time type produced by `buildEffectiveLayer()` (line 42). Merges **ResolvedLayer** computed properties over **Layer** defaults, resolving **UnitValue** percentages to absolute pixels. All fields are plain numbers ready for the Canvas 2D transform stack. Used by `renderFrame()` in `packages/canvas/src/render-frame.ts`.

### Fill
`packages/types/src/shape.ts:56` -- `type Fill = SolidFill | LinearGradientFill | RadialGradientFill`

How a **Shape** interior is painted. `SolidFill` (line 38) has a single **Color**. `LinearGradientFill` (line 43) has an `angle` in degrees and **GradientStop** array. `RadialGradientFill` (line 49) has `center`, `radius`, and stops. Solid fill color is animatable via `"visual.fill.color"`. Gradients use `createLinearGradient()` / `createRadialGradient()` on the **RenderContext**.

### Frame
`packages/types/src/coordinates.ts:4` -- `interface Frame { x: UnitValue; y: UnitValue }`

Position of a **Layer** on the canvas in pixels or **Percentage** from the top-left origin. Animatable via `"frame.x"` and `"frame.y"`. Not to be confused with a frame number (integer timeline index); context always disambiguates.

### FrameRange
`packages/types/src/delta.ts:23` -- `type FrameRange = [number, number]`

A `[startFrame, endFrame]` tuple defining a **Delta**'s frame interval. Both ends inclusive, zero-based. When `start === end`, progress snaps to 1 (instantaneous). The basis of **No-Overlap** validation: `rangesOverlap(a, b)` at `packages/core/src/validation/overlap-validator.ts:14` checks `a[0] <= b[1] && b[0] <= a[1]`.

### fps
`packages/types/src/document.ts:11` -- `Canvas.fps: number`

Frames per second, set on the **Canvas** object (typically 60). Converts frame numbers to real time: `seconds = frame / fps`. All **Delta** ranges and **State** durations are in frame counts, making fps the single conversion factor between frame space and wall-clock time.

### GradientStop
`packages/types/src/shape.ts:33` -- `interface GradientStop { offset: number; color: Color }`

A color stop in a gradient **Fill**. `offset` ranges from 0 (start) to 1 (end). The `color` is any **Color** type. Passed to the **RenderContext** via `addColorStop()` on gradient objects.

### Hold-After-End
`packages/core/src/resolver/delta-resolver.ts:67` -- behavior in `resolvePropertyAtFrame()`

When no active **Delta** covers the current frame, the resolver finds the most recently completed delta (whose range ended before the current frame) and returns its `to` value, preventing the property from reverting to the **Layer** default. Fixed in v0.7.1 to address a regression where properties snapped back between deltas.

### Layer
`packages/types/src/layer.ts:38` -- `interface Layer { id, visual: Visual, frame: Frame, bounds: Bounds, anchorPoint?, opacity?, rotation?, scale?, visible?, parentId?, ... }`

A visual element in the animation. Each layer has a unique `id`, a **Visual** (content type), **Frame** (position), and **Bounds** (size). Optional transforms: **Opacity**, **Rotation**, **Scale**, **AnchorPoint**. Layers render in array order via the **Painters Algorithm** (first = backmost). `parentId` enables transform inheritance from a **GroupVisual** parent. `visible: false` hides without removing.

### Lerp
`packages/math/src/lerp.ts:4` -- `function lerp(a: number, b: number, t: number): number`

Linear interpolation: `a + (b - a) * t`. The fundamental numeric interpolation in Atelier. Used by the delta resolver for numeric **AnimatableProperty** values after applying **Easing**. The same module exports `clamp()` (line 11), `lerpArray()` (line 19), and `remap()` (line 26).

### MCP
`packages/mcp/` -- Model Context Protocol

A standard for AI tool integration. Atelier's MCP server exposes tools for document authoring: creating documents, adding layers, defining states, inserting deltas, expanding presets, previewing frames. Uses a **DocumentStore** for session state. Tool modules in `packages/mcp/src/tools/`: document, layers, shapes, states, deltas, presets, templates, preview.

### No-Overlap
`packages/core/src/validation/overlap-validator.ts:22` -- `function validateNoOverlap(existing: Delta[], newDelta: Delta): OverlapError | null`

The constraint that two **Delta** objects on the same **Layer** and **AnimatableProperty** cannot have overlapping **FrameRange** values. Enforced by the **DocumentBuilder**'s `addDelta()`. `validateAllDeltas()` (line 49) performs pairwise checks across all deltas in a **State**, returning `OverlapError[]`.

### Opacity
`packages/types/src/layer.ts:49` -- `Layer.opacity?: number`

Layer transparency from 0 (fully transparent) to 1 (fully opaque). Animatable via `"opacity"`. Applied as `globalAlpha` on the **RenderContext**. The renderer skips layers with effective opacity <= 0 as an optimization.

### Painters Algorithm
`packages/canvas/src/render-frame.ts:24` -- rendering loop

Layers draw in array order from the **AtelierDocument**'s `layers` list: first = backmost, last = frontmost. There is no z-index. Reorder the array to change stacking. Matches physical painting where later strokes cover earlier ones.

### Path
`packages/types/src/shape.ts:24` -- `interface PathShape { type: "path"; points: PathPoint[]; closed?: boolean }`

A **Shape** variant for custom geometry. Each `PathPoint` (line 5) has `x`, `y` and optional `in`/`out` control points for bezier curves (relative to the point). `closed` auto-closes the path. Rendered via `beginPath()`, `moveTo()`, `lineTo()`, and `bezierCurveTo()` on the **RenderContext**.

### Percentage
`packages/types/src/units.ts:5` -- `` type Percentage = `${number}%` ``

Template literal type for relative sizing (e.g. `"50%"`, `"100%"`). Combined with **Pixel** to form **UnitValue**. Resolved against a reference dimension (typically **Canvas** width or height) by the **EffectiveLayer** builder at render time.

### Pixel
`packages/types/src/units.ts:2` -- `type Pixel = number`

Type alias for `number` representing an absolute pixel value. Combined with **Percentage** to form **UnitValue**. Used in **Frame** and **Bounds** definitions.

### Preset
`packages/types/src/preset.ts:15` -- `interface Preset { description?, tags?, deltas: PresetDelta[] }`

A reusable animation pattern in the **AtelierDocument**'s `presets` record. Contains `PresetDelta` objects (line 5) that resemble **Delta** but omit `layer` and use relative `offset` ranges. Expanded via `expandPreset(preset, layerId, startFrame, duration)` in `packages/core/src/presets/preset-resolver.ts:11`, mapping each onto a target **Layer** and absolute **FrameRange**.

### RenderContext
`packages/canvas/src/canvas-types.ts:6` -- `interface RenderContext { save, restore, translate, rotate, scale, fillRect, beginPath, fill, stroke, ... }`

Minimal interface matching the Canvas 2D API subset the Atelier renderer uses. Avoids DOM `lib` dependency, making the renderer compatible with browser `CanvasRenderingContext2D`, node-canvas, or mocks. Also defines `GradientLike` (line 61) for gradient **Fill** rendering.

### ResolvedFrame
`packages/core/src/resolver/frame-resolver.ts:14` -- `interface ResolvedFrame { frame: number; stateName: string; layers: ResolvedLayer[] }`

Output of `resolveFrame(doc, stateName, frame)` (line 27). The fully computed state of an **AtelierDocument** at a single frame number within a **State**. Contains **ResolvedLayer** objects with all **Delta**-driven overrides applied. Consumed by `renderFrame()` and the **StateMachine**'s `tick()`.

### ResolvedLayer
`packages/core/src/resolver/frame-resolver.ts:5` -- `interface ResolvedLayer { id: string; layer: Layer; computedProperties: Partial<Record<AnimatableProperty, unknown>> }`

A **Layer** paired with computed animation values at a specific frame. `computedProperties` contains only properties with active or held **Delta** values; others retain **Layer** defaults. Part of **ResolvedFrame**. Converted to **EffectiveLayer** at render time.

### Rotation
`packages/types/src/layer.ts:51` -- `Layer.rotation?: number`

Clockwise rotation in degrees around the **AnchorPoint**. Animatable via `"rotation"`. Converted to radians (`rotation * Math.PI / 180`) during rendering at `packages/canvas/src/render-frame.ts:48`. `0` = no rotation; `360` = full turn.

### Scale
`packages/types/src/layer.ts:53` -- `Layer.scale?: { x: number; y: number }`

Scale multipliers applied around the **AnchorPoint**. Default `{ x: 1, y: 1 }`. Values < 1 shrink, > 1 enlarge. Animatable independently via `"scale.x"` and `"scale.y"`. Applied via `ctx.scale()` on the **RenderContext**.

### Shape
`packages/types/src/shape.ts:30` -- `type Shape = RectShape | EllipseShape | PathShape`

Union of geometry types for **ShapeVisual** layers. `RectShape` (line 14) has optional **Corner Radius**. `EllipseShape` (line 20) is a marker type. `PathShape` (line 24) holds points for custom geometry (see **Path**). Rendered by `packages/canvas/src/renderers/shape-renderer.ts`.

### Spring
`packages/types/src/easing.ts:13` -- `interface SpringEasing { type: "spring"; mass?, stiffness?, damping?, velocity? }`

Physics-based **Easing** via damped harmonic oscillator. Implemented in `packages/math/src/spring.ts:15`. Damping ratio `zeta = damping / (2 * sqrt(stiffness * mass))` determines regime: underdamped (`zeta < 1`) oscillates, critically damped (`zeta = 1`) fastest without overshoot, overdamped (`zeta > 1`) slow approach. Defaults: mass=1, stiffness=100, damping=10. Normalized to `t = 0..1`.

### State
`packages/types/src/state.ts:4` -- `interface State { description?, tags?, duration: number, deltas: Delta[] }`

A named animation timeline within an **AtelierDocument**. `duration` is in frames (convert to seconds via **fps**). The `deltas` array contains all **Delta** instructions. Documents typically have multiple states (e.g. `"intro"`, `"hover"`, `"outro"`). The **StateMachine** manages transitions between them.

### StateMachine
`packages/core/src/state/state-machine.ts:17` -- `class StateMachine`

Managed playback controller for an **AtelierDocument**. `tick()` advances frame by one, returns `PlaybackState` with the **ResolvedFrame**. `transition(stateName)` switches **State** and logs to history. `seek(frame)` jumps without advancing. `playThrough(onFrame)` iterates every frame, calling the callback. `resolveAt(stateName, frame)` resolves without modifying position. Properties: `state`, `frame`, `duration`, `isComplete`, `history`.

### Step
`packages/types/src/easing.ts:21` -- `interface StepEasing { type: "step"; steps: number; position?: "start" | "end" }`

**Easing** variant producing discrete jumps. `steps` sets how many plateaus divide 0-1. `position` (default `"end"`) controls whether each step jumps at interval start or end. Implemented in `packages/math/src/easing.ts:64`. Useful for sprite-sheet animation, typewriter effects, or quantized motion.

### Stroke
`packages/types/src/shape.ts:58` -- `interface Stroke { color: Color; width: number; dash?: number[]; lineCap?; lineJoin? }`

Outline styling for a **ShapeVisual**. `color` accepts any **Color** (animatable via `"visual.stroke.color"`). `width` is in pixels (animatable via `"visual.stroke.width"`). `dash` creates dashed lines via `setLineDash()`. `lineCap` options: `"butt"`, `"round"`, `"square"`. `lineJoin` options: `"miter"`, `"round"`, `"bevel"`.

### Template Variable
`packages/types/src/variable.ts:4` -- `interface Variable { type: "string" | "number" | "color" | "asset" | "boolean"; default?; description? }`

A named slot in an **AtelierDocument**'s `variables` record for substitution at instantiation. The `{{variableName}}` pattern in any string value is replaced by `instantiateTemplate()` in `packages/core/src/templates/template-resolver.ts:26`. Validates bindings, merges defaults, performs deep substitution, and strips the `variables` section. If an entire string is `{{var}}`, the raw typed value is preserved.

### TextStyle
`packages/types/src/shape.ts:66` -- `interface TextStyle { fontFamily, fontSize, fontWeight?, fontStyle?, textAlign?, lineHeight?, letterSpacing?, color: Color }`

Font and color configuration for **TextVisual** layers. `fontSize` animatable via `"visual.style.fontSize"`, `color` via `"visual.style.color"`. Rendered by `packages/canvas/src/renderers/text-renderer.ts`, which builds the CSS `font` shorthand and sets `textAlign` on the **RenderContext**.

### UnitValue
`packages/types/src/units.ts:8` -- `type UnitValue = Pixel | Percentage`

Union of **Pixel** (raw `number`) and **Percentage** (string like `"50%"`). Used by **Frame** and **Bounds** for flexible sizing. Percentages resolved against parent dimensions by `buildEffectiveLayer()` in `packages/canvas/src/apply-properties.ts:29`.

### Visual
`packages/types/src/layer.ts:35` -- `type Visual = ShapeVisual | TextVisual | ImageVisual | GroupVisual | RefVisual`

Discriminated union for **Layer** content. `ShapeVisual` (line 5): **Shape** with optional **Fill** and **Stroke**. `TextVisual` (line 12): string with **TextStyle**. `ImageVisual` (line 18): references an **Asset** by ID. `GroupVisual` (line 24): structural container for child layers via `parentId`. `RefVisual` (line 29): embeds another `.atelier` animation. Dispatched by the renderer at `packages/canvas/src/render-frame.ts:57`.

---

## Package Index

| Package | Path | Contains |
|---------|------|----------|
| `@atelier/types` | `packages/types/src/` | All type definitions: AtelierDocument, Layer, Delta, Easing, Color, Shape, etc. |
| `@atelier/math` | `packages/math/src/` | Lerp, clamp, cubic bezier, spring, step easing, color interpolation |
| `@atelier/core` | `packages/core/src/` | Frame resolver, delta resolver, overlap validator, DocumentBuilder, StateMachine, presets, templates |
| `@atelier/canvas` | `packages/canvas/src/` | RenderContext, EffectiveLayer, renderFrame, shape/text renderers |
| `@atelier/mcp` | `packages/mcp/src/` | MCP server, DocumentStore, tool definitions |
| `@atelier/cli` | `packages/cli/` | Command-line interface (planned) |

## See Also

- [Format Specification](format-spec.md) -- full YAML schema for `.atelier` files
- [Architecture](architecture.md) -- package dependency graph and data flow
- [Rendering Pipeline](rendering-pipeline.md) -- how frames resolve and render
- [Builder Guide](builder-guide.md) -- DocumentBuilder usage patterns
- [State Machine Guide](state-machine-guide.md) -- StateMachine playback API
- [MCP Reference](mcp-reference.md) -- complete tool listing for the MCP server
- [Examples](examples.md) -- annotated animation documents
