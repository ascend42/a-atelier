---
title: "@atelier/mcp"
scope: MCP server with 27 tools for AI animation authoring
packages: ["@atelier/mcp"]
related: ["docs/mcp-reference.md", "docs/ai-agent-guide.md", "docs/architecture.md"]
---

# @atelier/mcp

MCP server -- AI authoring interface for animations.

Exposes 27 tools across 8 categories that let an AI agent create, edit, animate, validate, and export Atelier animation documents through the [Model Context Protocol](https://modelcontextprotocol.io/).

## Package Info

| Field | Value |
|-------|-------|
| Name | `@atelier/mcp` |
| Version | `0.1.0` |
| Description | MCP server -- AI authoring interface for animations |
| Binary | `atelier-mcp` -> `./dist/index.js` |
| Build | tsup (ESM + CJS + DTS) |
| Source | `packages/mcp/src/` |

### Dependencies

| Package | Version |
|---------|---------|
| `@atelier/types` | `workspace:*` |
| `@atelier/schema` | `workspace:*` |
| `@atelier/core` | `workspace:*` |
| `@atelier/canvas` | `workspace:*` |
| `@modelcontextprotocol/sdk` | `^1.0.0` |
| `zod` | `^3.25.0` |

## Setup

### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "atelier": {
      "command": "node",
      "args": ["/path/to/a-atelier/packages/mcp/dist/index.js"]
    }
  }
}
```

When run directly, the server connects via the stdio transport automatically.

### Programmatic

```typescript
import { createServer } from "@atelier/mcp";

const { server, store } = createServer();
// server: McpServer (fully configured with all 27 tools)
// store:  DocumentStore (in-memory backing store)
```

## Exports

All public exports from `packages/mcp/src/index.ts`:

```typescript
export { DocumentStore } from "./store.js";
export { createServer } from "./index.js";

export { register as registerDocumentTools } from "./tools/document.js";
export { register as registerLayerTools } from "./tools/layers.js";
export { register as registerShapeTools } from "./tools/shapes.js";
export { register as registerStateTools } from "./tools/states.js";
export { register as registerDeltaTools } from "./tools/deltas.js";
export { register as registerPresetTools } from "./tools/presets.js";
export { register as registerPreviewTools } from "./tools/preview.js";
export { register as registerTemplateTools } from "./tools/templates.js";
```

`createServer()` returns `{ server: McpServer, store: DocumentStore }`. The server is pre-wired with all tool registrations. Individual `register*` functions are exported for selective tool registration on a custom server instance.

## DocumentStore

`packages/mcp/src/store.ts`

In-memory `Map`-based document storage. Each document is keyed by a string ID (auto-generated as `doc_{timestamp}_{counter}` if not provided).

```typescript
class DocumentStore {
  create(doc: AtelierDocument, id?: string): string;  // auto-generates ID if omitted
  get(id: string): AtelierDocument | undefined;
  set(id: string, doc: AtelierDocument): void;
  delete(id: string): boolean;
  has(id: string): boolean;
  list(): Array<{ id: string; name: string; canvas: Canvas }>;
  clear(): void;
}
```

- `create` throws if a document with the given ID already exists.
- `list` returns the ID, name, and canvas dimensions for each document.
- `clear` removes all documents (useful for testing).

## All 27 Tools by Category

### Document Tools (5) -- `src/tools/document.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_create` | Create a new animation document with canvas settings | `name`, `width`, `height`, `fps`, `background?`, `description?`, `tags?` |
| `atelier_info` | Get document summary (layers, states, duration, presets) | `id` |
| `atelier_load` | Load a document from a YAML string | `yaml`, `id?` |
| `atelier_export` | Export a document as a YAML string | `id` |
| `atelier_list` | List all documents in the store | _(none)_ |

### Layer Tools (5) -- `src/tools/layers.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_add_layer` | Add a new layer to a document | `id`, `layerId`, `visual`, `x`, `y`, `width`, `height`, `opacity?`, `rotation?`, `parentId?`, `anchorPoint?`, `scale?`, `visible?`, `description?`, `tags?` |
| `atelier_edit_layer` | Edit layer properties | `id`, `layerId`, plus any property to update |
| `atelier_remove_layer` | Remove a layer (warns about referencing deltas and child layers) | `id`, `layerId` |
| `atelier_list_layers` | List all layers with index, type, frame, bounds | `id` |
| `atelier_reorder` | Move a layer to a new position in the stack | `id`, `layerId`, `position` (0-based index) |

The `visual` parameter accepts a structured object with a required `type` field (`"shape"`, `"text"`, `"image"`, `"group"`, or `"ref"`) and type-specific fields:

- **shape**: `shape` (type + cornerRadius/points/closed), `fill`, `stroke`
- **text**: `content`, `style`
- **image**: `assetId`
- **ref**: `src`

Position and size values (`x`, `y`, `width`, `height`) accept either a number (pixels) or a string (percentage, e.g. `"50%"`).

### Shape Tools (3) -- `src/tools/shapes.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_set_shape` | Set shape geometry on a shape-type layer | `id`, `layerId`, `shape` (`type`: rect/ellipse/path, `cornerRadius?`, `points?`, `closed?`) |
| `atelier_set_fill` | Set fill on a shape-type layer | `id`, `layerId`, `fill` (`type`: solid/linear-gradient/radial-gradient, `color?`, `angle?`, `center?`, `radius?`, `stops?`) |
| `atelier_set_stroke` | Set stroke on a shape-type layer | `id`, `layerId`, `stroke` (`color`, `width`, `dash?`, `lineCap?`, `lineJoin?`) |

All three tools validate that the target layer has `visual.type === "shape"` and return an error otherwise.

### State Tools (4) -- `src/tools/states.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_add_state` | Add a named animation state | `id`, `stateName`, `duration` (in frames), `description?`, `tags?` |
| `atelier_edit_state` | Edit state metadata | `id`, `stateName`, `duration?`, `description?`, `tags?` |
| `atelier_remove_state` | Remove a state and all its deltas | `id`, `stateName` |
| `atelier_list_states` | List all states with duration, description, delta count | `id` |

### Delta Tools (4) -- `src/tools/deltas.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_add_delta` | Add an animation delta (keyframe transition) to a state | `id`, `stateName`, `layer`, `property`, `range` [start, end], `from`, `to`, `easing?`, `description?`, `tags?`, `deltaId?` |
| `atelier_edit_delta` | Edit an existing delta by index | `id`, `stateName`, `deltaIndex`, plus any field to update |
| `atelier_remove_delta` | Remove a delta by index | `id`, `stateName`, `deltaIndex` |
| `atelier_apply_preset` | Apply a named preset to a layer, expanding into concrete deltas | `id`, `stateName`, `presetName`, `layerId`, `startFrame?`, `duration?` |

**Animatable properties** (the `property` enum):

```
frame.x, frame.y, bounds.width, bounds.height,
opacity, rotation, scale.x, scale.y,
anchorPoint.x, anchorPoint.y,
visual.shape.cornerRadius, visual.fill.color,
visual.stroke.color, visual.stroke.width,
visual.style.fontSize, visual.style.color
```

**Easing options** (the `easing` parameter):

| Type | Params |
|------|--------|
| Shorthand | `"ease-in"`, `"ease-out"`, `"ease-in-out"` |
| Linear | `{ type: "linear" }` |
| Cubic Bezier | `{ type: "cubic-bezier", x1, y1, x2, y2 }` |
| Spring | `{ type: "spring", mass?, stiffness?, damping?, velocity? }` |
| Step | `{ type: "step", steps, position?: "start" \| "end" }` |

Both `atelier_add_delta` and `atelier_edit_delta` run overlap validation (via `@atelier/core` `validateNoOverlap`) and reject conflicting deltas on the same layer+property+range.

### Preset Tools (2) -- `src/tools/presets.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_define_preset` | Define a reusable animation preset on a document | `id`, `presetName`, `deltas` (array of `{ property, offset?, from, to, easing? }`), `description?`, `tags?` |
| `atelier_list_presets` | List all presets with descriptions and properties | `id` |

Presets are stored on the document object under `doc.presets`. Each preset contains an array of delta definitions with relative offsets. Use `atelier_apply_preset` (in Delta Tools) to expand a preset into concrete deltas on a specific layer and state.

### Preview Tools (2) -- `src/tools/preview.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_validate` | Validate schema correctness and check for delta overlaps across all states | `id` |
| `atelier_preview` | Preview the resolved state of all layers at a specific frame | `id`, `stateName`, `frame` |

- `atelier_validate` runs both `@atelier/schema` `validateDocument` and `@atelier/core` `validateAllDeltas` per state.
- `atelier_preview` calls `@atelier/core` `resolveFrame` to compute interpolated property values at the given frame number.

### Template Tools (2) -- `src/tools/templates.ts`

| Tool | Description | Key Params |
|------|-------------|------------|
| `atelier_instantiate_template` | Instantiate a template document with variable bindings, creating a new document in the store | `id` (template doc), `bindings` (`{ variableName: value }`) |
| `atelier_find_variables` | Scan a document for `{{variableName}}` patterns | `id` |

- `atelier_find_variables` returns `variables` (all found), `declared` (in `doc.variables`), `undeclared` (found but not declared), and `unused` (declared but not found).
- `atelier_instantiate_template` calls `@atelier/core` `instantiateTemplate` and stores the resulting document under a new auto-generated ID.

## Error Handling

All tools return structured JSON in a `text` content block:

**Success:**
```json
{ "success": true, "id": "doc_1234_1", "name": "My Animation" }
```

**Error:**
```json
{ "error": "Document \"doc_abc\" not found" }
```

Error responses also set `isError: true` on the MCP result object. Zod validation errors are flattened to `"path: message"` format for AI readability.

## Typical AI Workflow

```
1. atelier_create           -> get document ID
2. atelier_add_layer        -> (repeat for each layer)
3. atelier_set_shape/fill   -> configure shape visuals
4. atelier_add_state        -> name state, set duration in frames
5. atelier_add_delta        -> (repeat for each animation keyframe)
6. atelier_validate         -> check for schema/overlap errors
7. atelier_preview          -> inspect resolved frame data
8. atelier_export           -> get YAML output
```

Optional steps:

- `atelier_define_preset` + `atelier_apply_preset` to reuse animation patterns across layers
- `atelier_find_variables` + `atelier_instantiate_template` for template-based workflows
- `atelier_load` to import existing YAML documents into the store

## Building

```bash
# From the monorepo root
pnpm --filter @atelier/mcp build

# Or from this package directory
pnpm build
```

Build output goes to `dist/` with ESM (`index.js`), CJS (`index.cjs`), declaration files (`index.d.ts`), and sourcemaps.

## Testing

```bash
pnpm --filter @atelier/mcp test
```

## Project Structure

```
packages/mcp/
  src/
    index.ts              # Server creation, stdio entry point, re-exports
    store.ts              # DocumentStore (in-memory Map-based storage)
    tools/
      document.ts         # 5 tools: create, info, load, export, list
      layers.ts           # 5 tools: add, edit, remove, list, reorder
      shapes.ts           # 3 tools: set_shape, set_fill, set_stroke
      states.ts           # 4 tools: add, edit, remove, list
      deltas.ts           # 4 tools: add, edit, remove, apply_preset
      presets.ts           # 2 tools: define, list
      preview.ts           # 2 tools: validate, preview
      templates.ts         # 2 tools: instantiate_template, find_variables
  tsup.config.ts          # Build configuration
  package.json
```
