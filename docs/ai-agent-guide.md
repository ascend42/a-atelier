---
title: AI Agent Guide
scope: MCP setup, authoring workflows, recipes, and error recovery for AI agents
packages: ["@atelier/mcp", "@atelier/core", "@atelier/types"]
related: ["docs/mcp-reference.md", "docs/builder-guide.md", "docs/format-spec.md"]
---

# AI Agent Guide

This guide is for AI agents that author animations through the Atelier MCP server. It covers server setup, the standard authoring workflow, ready-to-use recipes, and error recovery patterns.

## 1. Overview

Atelier is an AI-native animation system. The primary authoring path for AI agents is through the MCP server, which exposes 27 structured tools with Zod validation. Every tool accepts JSON parameters, validates them against a schema, and returns JSON responses. The entire authoring flow is tool-call driven.

The mental model: **layers** define what is visible, **states** define time segments, and **deltas** define how layer properties change over frame ranges within a state.

All documents live in an in-memory store. They persist within a session but are lost when the server restarts. Always export to YAML before ending a session.

---

## 2. MCP Server Setup

```json
{
  "mcpServers": {
    "atelier": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

The server uses `StdioServerTransport`. Build first with `pnpm -F @atelier/mcp build`.

---

## 3. Tool Categories (27 Tools)

| Category | Count | Tools | Purpose |
|----------|-------|-------|---------|
| Document | 5 | `atelier_create`, `atelier_info`, `atelier_load`, `atelier_export`, `atelier_list` | Create and manage documents |
| Layer | 5 | `atelier_add_layer`, `atelier_edit_layer`, `atelier_remove_layer`, `atelier_list_layers`, `atelier_reorder` | Add/modify visual layers |
| Shape | 3 | `atelier_set_shape`, `atelier_set_fill`, `atelier_set_stroke` | Configure shape layer visuals |
| State | 4 | `atelier_add_state`, `atelier_edit_state`, `atelier_remove_state`, `atelier_list_states` | Manage animation states |
| Delta | 4 | `atelier_add_delta`, `atelier_edit_delta`, `atelier_remove_delta`, `atelier_apply_preset` | Define property animations |
| Preset | 2 | `atelier_define_preset`, `atelier_list_presets` | Create reusable animation patterns |
| Preview | 2 | `atelier_validate`, `atelier_preview` | Validate and preview resolved frames |
| Template | 2 | `atelier_instantiate_template`, `atelier_find_variables` | Template variable system |

For full parameter reference, see [docs/mcp-reference.md](./mcp-reference.md).

---

## 4. Standard Authoring Workflow

Follow these steps in order.

**Step 1 -- Create a document:**

```
atelier_create { name: "My Animation", width: 600, height: 400, fps: 60, background: "#1E1E1E" }
```

Returns `{ success: true, id: "doc_..." }`. Save this `id` -- every subsequent call requires it.

**Step 2 -- Add layers** (one per visual element):

```
atelier_add_layer {
  id: "<doc-id>", layerId: "title-text",
  visual: { type: "text", content: "Hello World",
    style: { fontFamily: "sans-serif", fontSize: 32, color: "#FFFFFF", textAlign: "center" }
  },
  x: 200, y: 180, width: 200, height: 40, opacity: 0
}
```

**Step 3 -- Add a state** (time segment in frames):

```
atelier_add_state { id: "<doc-id>", stateName: "intro", duration: 60 }
```

**Step 4 -- Add deltas** (property animations):

```
atelier_add_delta {
  id: "<doc-id>", stateName: "intro", layer: "title-text",
  property: "opacity", range: [0, 30], from: 0, to: 1, easing: "ease-out"
}
```

**Step 5 -- Validate:**

```
atelier_validate { id: "<doc-id>" }
```

**Step 6 -- Export:**

```
atelier_export { id: "<doc-id>" }
```

---

## 5. Key Concepts

### Layer-Delta Model

Layers define WHAT is visible. Deltas define HOW it changes. A layer with no deltas is static. A delta referencing a nonexistent layer is an error.

### Visual Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `shape` | Geometric shape | `shape` (rect/ellipse/path), optional `fill`, `stroke` |
| `text` | Text content | `content`, `style` (fontFamily, fontSize, color, textAlign) |
| `image` | External image | `assetId` |
| `group` | Container for child layers | (none) |
| `ref` | Embeds another .atelier file | `src` |

### Frame Ranges and Timing

Deltas use `[startFrame, endFrame]` (inclusive, 0-based). Duration in frames = seconds x fps.

| Timing | Frames at 60fps | Seconds |
|--------|-----------------|---------|
| Quick transition | 15-20 | 0.25-0.33s |
| Standard animation | 30-45 | 0.5-0.75s |
| Slow, smooth | 60-90 | 1-1.5s |
| Dramatic reveal | 90-120 | 1.5-2s |

### The 22 Animatable Properties

| Property | Type | Description |
|----------|------|-------------|
| `frame.x` | number | Horizontal position |
| `frame.y` | number | Vertical position |
| `bounds.width` | number | Element width |
| `bounds.height` | number | Element height |
| `opacity` | number (0-1) | Transparency |
| `rotation` | number (degrees) | Clockwise rotation |
| `scale.x` | number | Horizontal scale factor |
| `scale.y` | number | Vertical scale factor |
| `anchorPoint.x` | number (0-1) | Rotation/scale pivot X |
| `anchorPoint.y` | number (0-1) | Rotation/scale pivot Y |
| `visual.shape.cornerRadius` | number | Rect corner rounding |
| `visual.fill.color` | hex string | Fill color |
| `visual.stroke.color` | hex string | Stroke color |
| `visual.stroke.width` | number | Stroke thickness |
| `visual.stroke.start` | number (0-1) | Stroke trim start position |
| `visual.stroke.end` | number (0-1) | Stroke trim end position |
| `visual.style.fontSize` | number | Text font size |
| `visual.style.color` | hex string | Text color |
| `shadow.color` | hex string | Drop shadow color |
| `shadow.blur` | number | Drop shadow blur radius |
| `shadow.offsetX` | number | Drop shadow horizontal offset |
| `shadow.offsetY` | number | Drop shadow vertical offset |

These strings are case-sensitive and must be used exactly as shown.

### Easing Options

**String presets:** `"ease-in"`, `"ease-out"`, `"ease-in-out"`

**Object-based easing:**

```
Linear:       { type: "linear" }
Cubic bezier: { type: "cubic-bezier", x1: 0.4, y1: 0, x2: 0.2, y2: 1 }
Spring:       { type: "spring", mass: 1, stiffness: 200, damping: 15 }
Stepped:      { type: "step", steps: 5 }
```

Spring parameters (`mass`, `stiffness`, `damping`, `velocity`) are all optional. Step easing accepts an optional `position`: `"start"` or `"end"`. When no easing is specified, the animation is linear.

### No-Overlap Rule

Two deltas on the same layer + same property CANNOT have overlapping frame ranges.

```
WRONG:  range [0, 30] and range [20, 50] on same layer+property
RIGHT:  range [0, 30] and range [31, 50] on same layer+property
```

Different properties on the same layer CAN overlap. Different layers CAN overlap on the same property.

### Hold-After-End

After a delta's range ends, the `to` value is held for the remainder of the state. You do not need extra deltas to "maintain" a value -- it persists automatically.

---

## 6. Recipes

### Recipe 1: Fade-In Text

```
1. atelier_create { name: "Title Card", width: 600, height: 400, fps: 60, background: "#1E1E1E" }
2. atelier_add_layer {
     id: "<doc-id>", layerId: "title",
     visual: { type: "text", content: "Hello",
       style: { fontFamily: "sans-serif", fontSize: 32, color: "#FFFFFF", textAlign: "center" } },
     x: 200, y: 195, width: 200, height: 40, opacity: 0
   }
3. atelier_add_state { id: "<doc-id>", stateName: "intro", duration: 60 }
4. atelier_add_delta { ..., layer: "title", property: "opacity",
     range: [0, 30], from: 0, to: 1, easing: "ease-out" }
5. atelier_add_delta { ..., layer: "title", property: "frame.y",
     range: [0, 30], from: 195, to: 180, easing: "ease-out" }
6. atelier_validate + atelier_export
```

### Recipe 2: Bouncing Ball

```
1. Create 600x400 document at 60fps
2. atelier_add_layer { layerId: "ball",
     visual: { type: "shape", shape: { type: "ellipse" },
       fill: { type: "solid", color: "#C75B39" } },
     x: 270, y: 50, width: 60, height: 60 }
3. atelier_add_state { stateName: "bounce", duration: 120 }
4. Delta: frame.y [0, 60] from 50 to 300, easing: { type: "spring", stiffness: 120, damping: 8 }
5. Delta: scale.y [55, 70] from 1 to 0.8 (squish on landing)
6. Delta: scale.x [55, 70] from 1 to 1.2 (stretch on landing)
```

### Recipe 3: Staggered Entrance (5 Elements)

```
1. Create document
2. For i in [0..4]: add ellipse layer "dot-<i>" at x: 100+i*100, y: 220, opacity: 0
3. atelier_add_state { stateName: "enter", duration: 90 }
4. For i in [0..4]:
   - Delta: opacity [i*10, i*10+20] from 0 to 1, easing: "ease-out"
   - Delta: frame.y [i*10, i*10+20] from 240 to 220, easing: "ease-out"
```

### Recipe 4: Color Transition

```
1. Create document, add rect layer "box" with fill "#C75B39"
2. atelier_add_state { stateName: "shift", duration: 60 }
3. Delta: visual.fill.color [0, 60] from "#C75B39" to "#4A7C91"
```

### Recipe 5: Multi-State (Intro / Hold / Outro)

```
1. Create document, add card layer at opacity: 0
2. Add three states: "intro" (60 frames), "hold" (120 frames), "outro" (60 frames)
3. Intro deltas: opacity [0, 35] from 0 to 1; frame.y [0, 35] from 115 to 100
4. Hold: no deltas needed -- values persist from intro
5. Outro deltas: opacity [0, 35] from 1 to 0; frame.y [0, 35] from 100 to 115
```

Use `StateMachine.playThrough()` from `@atelier/core` to sequence states at runtime.

### Recipe 6: Preset-Driven Stagger

```
1. Create document, add layers "card-a", "card-b", "card-c" (opacity: 0)
2. atelier_define_preset {
     presetName: "fade-slide-in",
     deltas: [
       { property: "opacity", offset: [0, 20], from: 0, to: 1, easing: "ease-out" },
       { property: "frame.y", offset: [0, 20], from: 15, to: 0, easing: "ease-out" }
     ]
   }
3. atelier_add_state { stateName: "enter", duration: 90 }
4. atelier_apply_preset { presetName: "fade-slide-in", layerId: "card-a", startFrame: 0 }
   atelier_apply_preset { presetName: "fade-slide-in", layerId: "card-b", startFrame: 15 }
   atelier_apply_preset { presetName: "fade-slide-in", layerId: "card-c", startFrame: 30 }
```

---

## 7. Common Patterns

### Standard Canvas

```
width: 600, height: 400, fps: 60, background: "#1E1E1E"
```

### Centering Text

Set `textAlign: "center"` and position: `x = (canvasWidth - textBoundsWidth) / 2`. For a 600px canvas with 400px text: `x: 100`.

### Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Terracotta | `#C75B39` | Primary accent |
| Instructional Blue | `#4A7C91` | Secondary accent |
| Sage Green | `#7A8B6F` | Tertiary accent |
| Warm Tan | `#D4A574` | Warm elements |
| Paper White | `#F5F0EB` | Text on dark |
| Dark Background | `#1E1E1E` | Canvas background |
| Card Background | `#363636` | Card surfaces |
| Border Blue | `#3A5A6B` | Borders and strokes |

### Fade + Slide Pattern

The most natural-looking entrance combines opacity and position:

```
opacity:  range [start, start+25], from: 0, to: 1, easing: "ease-out"
frame.y:  range [start, start+25], from: y+15, to: y, easing: "ease-out"
```

### Stagger Timing

Offset each element by 10-15 frames:

```
Element 0: range [0, 20]     Element 2: range [20, 40]
Element 1: range [10, 30]    Element 3: range [30, 50]
```

### Layer Ordering

Layers render in array order -- index 0 is at the back. Add background layers first, foreground last. Use `atelier_reorder` to adjust after the fact.

### Inspecting State

Call `atelier_info` to see layer count, state names, total duration, and presets. Call `atelier_preview` to see computed property values at a specific frame.

---

## 8. Error Recovery

### Response Format

- Success: `{ "success": true, ...data }`
- Error: `{ "error": "message" }` with `isError: true`

### Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Overlapping delta on layer X, property Y" | Two deltas on same layer+property overlap in time | Adjust ranges so they do not overlap |
| 'Layer "X" not found' | Delta references nonexistent layer | Check spelling; add the layer first |
| 'State "X" not found' | Delta targets nonexistent state | Add the state with `atelier_add_state` first |
| 'Layer "X" already exists' | Duplicate layer ID | Choose a unique ID |
| 'State "X" already exists' | Duplicate state name | Choose a unique name |
| 'Layer "X" is type "text", not "shape"' | Shape tool used on non-shape layer | Only `atelier_set_shape/fill/stroke` work on shape layers |
| 'Invalid range: start > end' | Range tuple is backwards | First number must be <= second |

### Zod Validation Errors

If parameters have wrong types, the server returns structured errors:

```json
{ "error": "Validation failed", "issues": [
    { "path": ["range", 0], "message": "Expected number, received string" }
]}
```

Common causes: strings where numbers expected (`range: ["0", "30"]`), missing required fields, invalid enum values (`"position.x"` instead of `"frame.x"`).

### Document Not Found

Documents are in-memory only. If the server restarts, re-create documents or reload from YAML with `atelier_load`.

### Recovery Workflow

1. `atelier_validate` -- see all current errors
2. `atelier_list_layers` + `atelier_list_states` -- see current document state
3. `atelier_edit_delta` or `atelier_remove_delta` -- fix delta issues
4. `atelier_edit_layer` -- fix layer issues
5. Re-validate

---

## 9. Best Practices

1. **Create the document first.** You need the document ID for every other tool call.
2. **Add all layers before deltas.** Layers must exist before deltas reference them.
3. **Use descriptive layer IDs.** `"title-text"` not `"layer1"`. Makes deltas self-documenting.
4. **Validate before export.** Always call `atelier_validate` before `atelier_export`.
5. **Start simple.** Begin with 2-3 layers and basic easing. Add complexity incrementally.
6. **Use `atelier_info` to check your work.** Verify layer counts and state names between steps.
7. **Plan timing before adding deltas.** Prevents overlap errors and makes staggering easier.
8. **Use presets for repetition.** `atelier_define_preset` + `atelier_apply_preset` reduces tool calls.
9. **Use `atelier_preview` for debugging.** Preview specific frames to verify computed values.
10. **Export before session end.** Documents are ephemeral. Always export the YAML.

---

## Quick Reference

### Minimal Animation (5 Tool Calls)

```
atelier_create    -> get document id
atelier_add_layer -> add a visual element
atelier_add_state -> define a time segment
atelier_add_delta -> animate a property
atelier_export    -> get the YAML output
```

### Parameter Names

| Tool | Document | Layer | State |
|------|----------|-------|-------|
| `atelier_create` | (returns `id`) | -- | -- |
| `atelier_add_layer` | `id` | `layerId` | -- |
| `atelier_add_state` | `id` | -- | `stateName` |
| `atelier_add_delta` | `id` | `layer` | `stateName` |
| `atelier_validate` | `id` | -- | -- |
| `atelier_export` | `id` | -- | -- |
| `atelier_preview` | `id` | -- | `stateName` + `frame` |

### Duration Cheat Sheet (60fps)

| Seconds | Frames |
|---------|--------|
| 0.25s | 15 |
| 0.5s | 30 |
| 1s | 60 |
| 1.5s | 90 |
| 2s | 120 |
| 3s | 180 |

### Easing Quick Reference

| Feel | Easing | Use Case |
|------|--------|----------|
| Natural entrance | `"ease-out"` | Elements appearing |
| Natural exit | `"ease-in"` | Elements disappearing |
| Smooth transition | `"ease-in-out"` | State changes |
| Constant speed | `{ type: "linear" }` | Rotation, progress bars |
| Bouncy / organic | `{ type: "spring", stiffness: 200, damping: 10 }` | Playful motion |
| Snappy | `{ type: "spring", stiffness: 300, damping: 20 }` | UI interactions |
| Discrete steps | `{ type: "step", steps: 5 }` | Frame-by-frame |

---

## 10. Ecosystem

Beyond the MCP server, Atelier includes tools for visual editing and export:

- **`@atelier/studio`** -- a browser-based editor widget with canvas preview, YAML viewer, GUI property panels, undo/redo, drag-to-reorder, and export to MP4/WebM/GIF via WebCodecs. Embeddable in any web page.
- **`atelier render`** (CLI) -- renders animations to MP4 or GIF via FFmpeg and @napi-rs/canvas (no native build). Useful for headless/CI export pipelines.

Both tools consume the same `.atelier` format, so documents authored through MCP can be opened in the studio or rendered from the command line without modification.
