---
title: MCP Tool Reference
scope: Complete reference for all 27 Atelier MCP tools — parameters, returns, errors
packages: ["@atelier/mcp"]
related: ["packages/mcp/README.md", "docs/ai-agent-guide.md", "docs/builder-guide.md"]
---

# MCP Tool Reference

The Atelier MCP server exposes **27 tools** across **8 categories** for AI-driven animation authoring. All tools operate on an in-memory `DocumentStore` -- documents persist within a session but not across server restarts.

## Response Format

All tools return JSON text content unless otherwise noted.

- **Success:** `{ "success": true, ...data }`
- **Error:** `{ "error": "message" }` (with `isError: true` on the MCP response)

## Common Parameters

These parameters appear across many tools and share consistent semantics:

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Document ID returned by `atelier_create` or `atelier_load` |
| `stateName` | string | Name of an animation state within a document |
| `layerId` | string | Unique layer ID within a document |
| `deltaIndex` | integer | Zero-based index of a delta within a state's delta array |

## Source Layout

All tool implementations live under `packages/mcp/src/tools/`:

| File | Category | Tools |
|------|----------|-------|
| `document.ts` | Document | 5 |
| `layers.ts` | Layer | 5 |
| `shapes.ts` | Shape | 3 |
| `states.ts` | State | 4 |
| `deltas.ts` | Delta | 4 |
| `presets.ts` | Preset | 2 |
| `preview.ts` | Preview | 2 |
| `templates.ts` | Template | 2 |

---

## Document Tools (5)

Tools for creating, loading, exporting, and listing animation documents.

### `atelier_create`

Create a new Atelier animation document with canvas settings.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Animation name |
| `width` | number (positive) | Yes | Canvas width in pixels |
| `height` | number (positive) | Yes | Canvas height in pixels |
| `fps` | number (positive int) | Yes | Frames per second |
| `background` | string | No | Background color (hex string) |
| `description` | string | No | Animation description |
| `tags` | string[] | No | Tags for categorization |

**Returns:**

```json
{ "success": true, "id": "doc_...", "name": "...", "canvas": { "width": 1920, "height": 1080, "fps": 30 } }
```

**Errors:**
- Validation failed -- Zod schema errors for invalid width/height/fps values.

**Source:** `packages/mcp/src/tools/document.ts`

---

### `atelier_info`

Get summary information about a document including layer count, state names, total duration, and preset names.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "name": "...",
  "description": "...",
  "tags": [],
  "canvas": { "width": 1920, "height": 1080, "fps": 30 },
  "layerCount": 3,
  "stateNames": ["intro", "hover"],
  "totalDuration": 90,
  "presetNames": ["fade-in"]
}
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/document.ts`

---

### `atelier_load`

Load a document from a YAML string. Parses and validates the YAML against the Atelier schema before storing.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `yaml` | string | Yes | YAML string of an Atelier document |
| `id` | string | No | Custom document ID (auto-generated if omitted) |

**Returns:**

```json
{ "success": true, "id": "doc_...", "name": "..." }
```

**Errors:**
- `Parse/validation failed: {path}: {message}` -- YAML parse errors or Zod validation errors.

**Source:** `packages/mcp/src/tools/document.ts`

---

### `atelier_export`

Export a document as a YAML string. The response is raw YAML text, not wrapped in a JSON success envelope.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:** Raw YAML text content (not JSON wrapped).

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/document.ts`

---

### `atelier_list`

List all documents currently held in the in-memory store.

**Parameters:** None.

**Returns:**

```json
{
  "success": true,
  "documents": [
    { "id": "doc_...", "name": "...", "canvas": { "width": 1920, "height": 1080, "fps": 30 } }
  ],
  "count": 1
}
```

**Source:** `packages/mcp/src/tools/document.ts`

---

## Layer Tools (5)

Tools for adding, editing, removing, listing, and reordering layers within a document.

### `atelier_add_layer`

Add a new layer to a document. Layers are appended to the end of the layer stack.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Unique layer ID |
| `visual` | object | Yes | Visual content definition (see below) |
| `x` | number \| string | Yes | X position (pixels or percentage string like `"50%"`) |
| `y` | number \| string | Yes | Y position (pixels or percentage string) |
| `width` | number \| string | Yes | Width (pixels or percentage string) |
| `height` | number \| string | Yes | Height (pixels or percentage string) |
| `description` | string | No | Layer description |
| `tags` | string[] | No | Tags |
| `opacity` | number (0--1) | No | Layer opacity |
| `rotation` | number | No | Rotation in degrees |
| `parentId` | string | No | Parent layer ID for transform inheritance |
| `anchorPoint` | `{ x: number, y: number }` | No | Anchor point (0--1 normalized) |
| `scale` | `{ x: number, y: number }` | No | Scale factors |
| `visible` | boolean | No | Whether layer is visible |

**Visual object** must include a `type` field. Accepted types and their fields:

| Visual type | Required fields | Optional fields |
|-------------|----------------|-----------------|
| `"shape"` | `shape: { type: "rect" \| "ellipse" \| "path" }` | `shape.cornerRadius`, `shape.points`, `shape.closed`, `fill`, `stroke` |
| `"text"` | `content` (string) | `style` (font settings object) |
| `"image"` | `assetId` (string) | -- |
| `"group"` | -- | -- |
| `"ref"` | `src` (string) | -- |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "index": 0 }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" already exists in document "{id}"` -- duplicate layer ID.
- `Parent layer "{parentId}" not found` -- invalid parentId reference.

**Source:** `packages/mcp/src/tools/layers.ts`

---

### `atelier_edit_layer`

Edit properties of an existing layer. Only provided fields are updated; omitted fields are unchanged.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID to edit |
| `x` | number \| string | No | New X position |
| `y` | number \| string | No | New Y position |
| `width` | number \| string | No | New width |
| `height` | number \| string | No | New height |
| `description` | string | No | New description |
| `tags` | string[] | No | New tags (replaces existing) |
| `opacity` | number (0--1) | No | New opacity |
| `rotation` | number | No | New rotation in degrees |
| `parentId` | string \| null | No | New parent layer ID, or `null` to clear the parent |
| `anchorPoint` | `{ x: number, y: number }` | No | New anchor point |
| `scale` | `{ x: number, y: number }` | No | New scale factors |
| `visible` | boolean | No | New visibility |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "updated": true }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`
- `Parent layer "{parentId}" not found` -- when setting a parentId that does not exist.

**Source:** `packages/mcp/src/tools/layers.ts`

---

### `atelier_remove_layer`

Remove a layer from a document. Returns warnings if deltas or child layers reference the removed layer (the layer is still removed).

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID to remove |

**Returns:**

```json
{
  "success": true,
  "layerId": "bg-rect",
  "removed": true,
  "warnings": [
    "State \"intro\" has 2 delta(s) referencing this layer",
    "1 child layer(s) reference this layer as parent"
  ]
}
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`

**Source:** `packages/mcp/src/tools/layers.ts`

---

### `atelier_list_layers`

List all layers in a document with summary information.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "layers": [
    {
      "index": 0,
      "id": "bg-rect",
      "type": "shape",
      "frame": { "x": 0, "y": 0 },
      "bounds": { "width": 1920, "height": 1080 },
      "description": "Background",
      "tags": ["background"],
      "opacity": 1,
      "rotation": 0,
      "parentId": null,
      "visible": true
    }
  ],
  "count": 1
}
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/layers.ts`

---

### `atelier_reorder`

Move a layer to a new position in the layer stack. If the target position exceeds the array length, the layer is moved to the last position.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID to move |
| `position` | integer (>= 0) | Yes | Target position index (0-based) |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "from": 2, "to": 0 }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`

**Source:** `packages/mcp/src/tools/layers.ts`

---

## Shape Tools (3)

Tools for modifying the shape, fill, and stroke of shape-type layers. All three tools require the target layer to have `visual.type === "shape"`.

### `atelier_set_shape`

Set or replace the shape definition on a shape-type layer.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID (must be a shape visual) |
| `shape` | object | Yes | Shape definition (see below) |

**Shape object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"rect"` \| `"ellipse"` \| `"path"` | Yes | Shape type |
| `cornerRadius` | number \| `[number, number, number, number]` | No | Corner radius (rect only) |
| `points` | array of `{ x, y, in?, out? }` | No | Path points (path only) |
| `closed` | boolean | No | Whether path is closed (path only) |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "shape": "rect" }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`
- `Layer "{layerId}" is type "{actualType}", not "shape"` -- layer is not a shape visual.

**Source:** `packages/mcp/src/tools/shapes.ts`

---

### `atelier_set_fill`

Set the fill on a shape-type layer. Supports solid colors and gradients.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID (must be a shape visual) |
| `fill` | object | Yes | Fill definition (see below) |

**Fill object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"solid"` \| `"linear-gradient"` \| `"radial-gradient"` | Yes | Fill type |
| `color` | any | No | Color for solid fill (hex string or RGBA/HSLA object) |
| `angle` | number | No | Angle in degrees (linear-gradient only) |
| `center` | `{ x: number \| string, y: number \| string }` | No | Center point (radial-gradient only) |
| `radius` | number \| string | No | Radius (radial-gradient only) |
| `stops` | `[{ offset: number (0--1), color: any }]` | No | Gradient color stops |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "fillType": "solid" }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`
- `Layer "{layerId}" is type "{actualType}", not "shape"`

**Source:** `packages/mcp/src/tools/shapes.ts`

---

### `atelier_set_stroke`

Set the stroke on a shape-type layer.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `layerId` | string | Yes | Layer ID (must be a shape visual) |
| `stroke` | object | Yes | Stroke definition (see below) |

**Stroke object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `color` | any | Yes | Stroke color (hex string or RGBA/HSLA object) |
| `width` | number (positive) | Yes | Stroke width in pixels |
| `dash` | number[] | No | Dash pattern (e.g., `[5, 3]`) |
| `lineCap` | `"butt"` \| `"round"` \| `"square"` | No | Line cap style |
| `lineJoin` | `"miter"` \| `"round"` \| `"bevel"` | No | Line join style |

**Returns:**

```json
{ "success": true, "layerId": "bg-rect", "strokeWidth": 2 }
```

**Errors:**
- `Document "{id}" not found`
- `Layer "{layerId}" not found`
- `Layer "{layerId}" is type "{actualType}", not "shape"`

**Source:** `packages/mcp/src/tools/shapes.ts`

---

## State Tools (4)

Tools for managing named animation states. Each state has a duration (in frames) and contains an array of deltas (keyframe transitions).

### `atelier_add_state`

Add a named animation state to a document.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name (e.g., `"intro"`, `"hover"`, `"exit"`) |
| `duration` | number (positive int) | Yes | Duration in frames |
| `description` | string | No | State description |
| `tags` | string[] | No | Tags |

**Returns:**

```json
{ "success": true, "stateName": "intro", "duration": 60 }
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" already exists`

**Source:** `packages/mcp/src/tools/states.ts`

---

### `atelier_edit_state`

Edit metadata of an existing animation state. Only provided fields are updated.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name to edit |
| `duration` | number (positive int) | No | New duration in frames |
| `description` | string | No | New description |
| `tags` | string[] | No | New tags (replaces existing) |

**Returns:**

```json
{ "success": true, "stateName": "intro", "updated": true }
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`

**Source:** `packages/mcp/src/tools/states.ts`

---

### `atelier_remove_state`

Remove an animation state and all its deltas. This is a destructive operation.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name to remove |

**Returns:**

```json
{ "success": true, "stateName": "intro", "removed": true, "deltasRemoved": 5 }
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`

**Source:** `packages/mcp/src/tools/states.ts`

---

### `atelier_list_states`

List all animation states in a document with their metadata and delta counts.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "states": [
    {
      "name": "intro",
      "duration": 60,
      "description": "Entry animation",
      "tags": ["entrance"],
      "deltaCount": 3
    }
  ],
  "count": 1
}
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/states.ts`

---

## Delta Tools (4)

Tools for managing deltas (keyframe transitions) within animation states. Deltas define how a layer property changes over a frame range. The engine enforces that no two deltas for the same layer+property can have overlapping frame ranges.

### `atelier_add_delta`

Add an animation delta (keyframe transition) to a state. Validates that the target layer exists and that the new delta does not overlap with existing deltas on the same layer+property.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name |
| `layer` | string | Yes | Target layer ID |
| `property` | AnimatableProperty | Yes | Property to animate (see list below) |
| `range` | `[integer, integer]` | Yes | Frame range `[start, end]`, inclusive, where start <= end |
| `from` | any | Yes | Starting value |
| `to` | any | Yes | Ending value |
| `easing` | Easing | No | Easing function (see list below) |
| `description` | string | No | Delta description |
| `tags` | string[] | No | Tags |
| `deltaId` | string | No | Custom delta ID |

**AnimatableProperty values:**

| Category | Properties |
|----------|-----------|
| Position | `frame.x`, `frame.y` |
| Size | `bounds.width`, `bounds.height` |
| Transform | `opacity`, `rotation`, `scale.x`, `scale.y`, `anchorPoint.x`, `anchorPoint.y` |
| Shape | `visual.shape.cornerRadius` |
| Fill/Stroke | `visual.fill.color`, `visual.stroke.color`, `visual.stroke.width` |
| Text style | `visual.style.fontSize`, `visual.style.color` |

**Easing values:**

| Form | Example |
|------|---------|
| Shorthand string | `"ease-in"`, `"ease-out"`, `"ease-in-out"` |
| Linear | `{ "type": "linear" }` |
| Cubic bezier | `{ "type": "cubic-bezier", "x1": 0.4, "y1": 0, "x2": 0.2, "y2": 1 }` |
| Spring | `{ "type": "spring", "mass": 1, "stiffness": 100, "damping": 10, "velocity": 0 }` |
| Step | `{ "type": "step", "steps": 5, "position": "end" }` |

Spring parameters (`mass`, `stiffness`, `damping`, `velocity`) and step `position` (`"start"` or `"end"`) are all optional.

**Returns:**

```json
{ "success": true, "stateName": "intro", "deltaIndex": 0, "layer": "bg-rect", "property": "opacity" }
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`
- `Layer "{layer}" not found`
- `Invalid range: start ({start}) must be <= end ({end})`
- Overlap error -- when a delta for the same layer+property already covers part of the requested range.

**Source:** `packages/mcp/src/tools/deltas.ts`

---

### `atelier_edit_delta`

Edit an existing delta by its index within a state. After applying changes, re-validates that the edited delta does not overlap with other deltas on the same layer+property.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name |
| `deltaIndex` | integer (>= 0) | Yes | Delta index within the state |
| `layer` | string | No | New target layer ID |
| `property` | AnimatableProperty | No | New property |
| `range` | `[integer, integer]` | No | New frame range `[start, end]` |
| `from` | any | No | New starting value |
| `to` | any | No | New ending value |
| `easing` | Easing | No | New easing function |
| `description` | string | No | New description |
| `tags` | string[] | No | New tags |

**Returns:**

```json
{ "success": true, "stateName": "intro", "deltaIndex": 0, "updated": true }
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`
- `Delta index {n} out of range ({total} deltas)`
- `Layer "{layer}" not found` -- when changing the layer to one that does not exist.
- `Invalid range: start ({start}) must be <= end ({end})`
- `Edit would cause overlap: {message}`

**Source:** `packages/mcp/src/tools/deltas.ts`

---

### `atelier_remove_delta`

Remove a delta by its index from a state.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name |
| `deltaIndex` | integer (>= 0) | Yes | Delta index to remove |

**Returns:**

```json
{
  "success": true,
  "stateName": "intro",
  "removed": { "layer": "bg-rect", "property": "opacity", "range": [0, 30] },
  "remainingDeltas": 2
}
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`
- `Delta index {n} out of range ({total} deltas)`

**Source:** `packages/mcp/src/tools/deltas.ts`

---

### `atelier_apply_preset`

Apply a named preset to a layer, expanding it into concrete deltas. Each preset delta is validated against existing deltas for overlap before any are added.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name to add deltas to |
| `presetName` | string | Yes | Preset name (must be defined on the document) |
| `layerId` | string | Yes | Target layer ID |
| `startFrame` | integer (>= 0) | No | Start frame for the preset (default: `0`) |
| `duration` | integer (positive) | No | Duration for the preset (default: state duration) |

**Returns:**

```json
{
  "success": true,
  "stateName": "intro",
  "presetName": "fade-in",
  "layerId": "bg-rect",
  "deltasAdded": 2,
  "totalDeltas": 5
}
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`
- `Layer "{layerId}" not found`
- `Preset "{presetName}" not found`
- `Preset would cause overlaps: {details}` -- if any expanded delta would overlap existing deltas.

**Source:** `packages/mcp/src/tools/deltas.ts`

---

## Preset Tools (2)

Presets are reusable animation templates defined at the document level. They contain relative delta definitions that are expanded into concrete deltas when applied via `atelier_apply_preset`.

### `atelier_define_preset`

Define a reusable animation preset on a document. If a preset with the same name already exists, it is overwritten.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `presetName` | string | Yes | Preset name |
| `deltas` | array (min 1) | Yes | Preset delta definitions (see below) |
| `description` | string | No | Preset description |
| `tags` | string[] | No | Tags |

**Preset delta object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `property` | AnimatableProperty | Yes | Property to animate |
| `offset` | `[integer, integer]` | No | Relative frame offset `[start, end]` within preset duration |
| `from` | any | Yes | Starting value |
| `to` | any | Yes | Ending value |
| `easing` | Easing | No | Easing function |

**Returns:**

```json
{ "success": true, "presetName": "fade-in", "deltaCount": 2 }
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/presets.ts`

---

### `atelier_list_presets`

List all presets defined on a document.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "presets": [
    {
      "name": "fade-in",
      "description": "Fade from transparent to opaque",
      "tags": ["entrance"],
      "deltaCount": 1,
      "properties": ["opacity"]
    }
  ],
  "count": 1
}
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/presets.ts`

---

## Preview Tools (2)

Tools for validating documents and previewing resolved frame data (computed property values at a specific frame).

### `atelier_validate`

Validate a document for schema correctness and delta overlap errors across all states.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "valid": true,
  "schemaErrors": [],
  "overlapErrors": [],
  "summary": "Document is valid"
}
```

When invalid:

```json
{
  "success": true,
  "valid": false,
  "schemaErrors": [{ "path": "canvas.fps", "message": "Expected positive integer" }],
  "overlapErrors": [{ "state": "intro", "message": "Overlap on layer bg-rect, property opacity" }],
  "summary": "Found 1 schema error(s) and 1 overlap error(s)"
}
```

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/preview.ts`

---

### `atelier_preview`

Preview the resolved state of all layers at a specific frame. Returns computed property values (interpolated from deltas) rather than rendered pixels.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |
| `stateName` | string | Yes | State name to preview |
| `frame` | integer (>= 0) | Yes | Frame number to resolve |

**Returns:**

```json
{
  "success": true,
  "stateName": "intro",
  "frame": 15,
  "duration": 60,
  "layers": [
    {
      "id": "bg-rect",
      "visualType": "shape",
      "baseFrame": { "x": 0, "y": 0 },
      "baseBounds": { "width": 1920, "height": 1080 },
      "baseOpacity": 1,
      "baseRotation": 0,
      "computedProperties": {
        "opacity": 0.5
      }
    }
  ]
}
```

**Errors:**
- `Document "{id}" not found`
- `State "{stateName}" not found`
- `Preview failed: {message}` -- runtime errors during frame resolution.

**Source:** `packages/mcp/src/tools/preview.ts`

---

## Template Tools (2)

Tools for working with template documents that contain `{{variableName}}` placeholders. Templates allow creating parameterized animations that can be instantiated with different bindings.

### `atelier_instantiate_template`

Instantiate a template document with variable bindings. Creates a new document in the store with all `{{variableName}}` patterns replaced by the provided values.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Template document ID |
| `bindings` | object | Yes | Variable bindings: `{ variableName: value }` |

**Returns:**

```json
{
  "success": true,
  "id": "doc_...",
  "name": "My Animation",
  "message": "Template instantiated successfully"
}
```

**Errors:**
- `Document "{id}" not found`
- `Template errors: {variable}: {message}` -- when required variables are missing or unknown variable names are provided.

**Source:** `packages/mcp/src/tools/templates.ts`

---

### `atelier_find_variables`

Scan a document for `{{variableName}}` patterns. Reports which variables are declared in the document's `variables` section, which are referenced but not declared, and which are declared but never referenced.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Document ID |

**Returns:**

```json
{
  "success": true,
  "variables": ["title", "brandColor", "duration"],
  "declared": ["title", "brandColor"],
  "undeclared": ["duration"],
  "unused": []
}
```

| Field | Description |
|-------|-------------|
| `variables` | All `{{...}}` references found anywhere in the document |
| `declared` | Variables defined in the document's `variables` section |
| `undeclared` | Referenced in the document but not declared (may cause errors on instantiation) |
| `unused` | Declared in `variables` but never referenced in the document |

**Errors:**
- `Document "{id}" not found`

**Source:** `packages/mcp/src/tools/templates.ts`

---

## Quick Reference

All 27 tools at a glance:

| # | Tool | Category | Description |
|---|------|----------|-------------|
| 1 | `atelier_create` | Document | Create a new animation document |
| 2 | `atelier_info` | Document | Get document summary |
| 3 | `atelier_load` | Document | Load document from YAML |
| 4 | `atelier_export` | Document | Export document as YAML |
| 5 | `atelier_list` | Document | List all documents |
| 6 | `atelier_add_layer` | Layer | Add a layer |
| 7 | `atelier_edit_layer` | Layer | Edit layer properties |
| 8 | `atelier_remove_layer` | Layer | Remove a layer |
| 9 | `atelier_list_layers` | Layer | List all layers |
| 10 | `atelier_reorder` | Layer | Reorder layer position |
| 11 | `atelier_set_shape` | Shape | Set shape definition |
| 12 | `atelier_set_fill` | Shape | Set fill on shape layer |
| 13 | `atelier_set_stroke` | Shape | Set stroke on shape layer |
| 14 | `atelier_add_state` | State | Add animation state |
| 15 | `atelier_edit_state` | State | Edit state metadata |
| 16 | `atelier_remove_state` | State | Remove state and its deltas |
| 17 | `atelier_list_states` | State | List all states |
| 18 | `atelier_add_delta` | Delta | Add a keyframe delta |
| 19 | `atelier_edit_delta` | Delta | Edit a delta by index |
| 20 | `atelier_remove_delta` | Delta | Remove a delta by index |
| 21 | `atelier_apply_preset` | Delta | Apply preset to a layer |
| 22 | `atelier_define_preset` | Preset | Define a reusable preset |
| 23 | `atelier_list_presets` | Preset | List all presets |
| 24 | `atelier_validate` | Preview | Validate document |
| 25 | `atelier_preview` | Preview | Preview resolved frame data |
| 26 | `atelier_instantiate_template` | Template | Instantiate template with bindings |
| 27 | `atelier_find_variables` | Template | Scan for template variables |
