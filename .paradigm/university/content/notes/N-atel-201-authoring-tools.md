---
id: N-atel-201-authoring-tools
title: Authoring tools — document, layer, state, delta
type: note
track: ATEL-201
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-201
  - mcp
  - authoring
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-201-mcp-overview
summary: The tools you reach for to build animations. Document lifecycle, layer composition, state machines, delta authoring. Annotated by which to call when.
---

## Document lifecycle

```
atelier_create        — make a new document with name + canvas
atelier_load          — load a .atelier file from disk by path
atelier_list          — list .atelier files in CWD
atelier_info          — return name + canvas + layer count + state count
atelier_validate      — schema-validate the current doc; returns errors with paths
atelier_preview       — resolve one frame and return ResolvedLayer[]
atelier_batch_preview — resolve multiple frames in one call (for thumbnail rows)
atelier_diff_frames   — compare two resolved frames; return property-level diffs
atelier_profile       — measure resolveFrame latency per state
atelier_complexity    — count layers, deltas, refs, max nesting; flag perf risks
```

**When to use which:**

- Starting from scratch: `atelier_create({ name, canvas: { width, height, fps }})`. Returns a minimal doc with one empty `default` state.
- Resuming on an existing file: `atelier_load({ path })`. The store now holds that doc; subsequent calls operate on it.
- Sanity-checking before you ship: `atelier_validate` then `atelier_complexity` — the first catches schema issues, the second flags renderer perf risks (1000+ layers, 10+ levels of group nesting, etc.).
- Visual debugging: `atelier_preview({ frame: 30 })` returns the same `ResolvedLayer[]` the renderer consumes. Compare against `atelier_diff_frames({ from: 29, to: 31 })` to find what changes.

## Layer composition

```
atelier_add_layer    — add a layer with visual + frame + bounds
atelier_edit_layer   — edit non-visual layer properties (id, tags, parentId, etc.)
atelier_remove_layer — remove a layer by id (and any deltas referencing it)
atelier_reorder      — change layer z-order
atelier_list_layers  — list all layer ids + types
atelier_edit_visual  — replace or patch the visual block (shape→text, fill, etc.)
```

**Pattern:** build all layers first, then animate. Adding layers triggers immediate validation; adding deltas requires the target layer to exist. Reverse order works but emits more errors.

**`atelier_edit_visual` is the underrated one.** It's the single tool for "I want this rect to become a text layer" or "change this image's `assetId`." Most edit-flow agents use this far more than the dedicated `atelier_set_*` family.

## State machines

```
atelier_add_state           — name a new state with duration (frames)
atelier_edit_state          — change duration, parent state, transitions
atelier_remove_state        — remove a state (rejects if it's the only one)
atelier_list_states         — list state names + durations + parent chain
atelier_set_state_parent    — make a state inherit deltas from another
atelier_configure_transition — define transition from state A→B with easing
```

**State machines are the foundation of interactive motion.** A `default` state shows the resting layout. `hover` extends `default` (via `set_state_parent`) with extra deltas. `pressed` transitions from `hover` with a 200ms ease-out (via `configure_transition`). Three states, total complexity stays low, the interactive feel is right.

For non-interactive animations: one `default` state is fine. State-machine complexity is opt-in.

## Delta authoring

```
atelier_add_delta    — animate one property of one layer
atelier_edit_delta   — change from/to/easing/range of an existing delta
atelier_remove_delta — remove a delta
```

`atelier_add_delta` takes:

```ts
{
  state: "default",
  layer: "title",
  property: "opacity",        // or "frame.x", "style.color", "scale.x", ...
  from: 0,
  to: 1,
  startFrame: 0,
  endFrame: 30,
  easing: "ease-out"          // or cubic-bezier(...), spring({...}), step(...)
}
```

The **no-overlap gate** rejects two deltas on the same `layer` + `property` whose `[startFrame, endFrame]` ranges overlap. If you need composed motion (e.g. wobble overlaid on a slide), use two layers or a `group`. The error message names both deltas; the fix is obvious.

**Easing as an object, not just a string.** The string form (`"ease-out"`) is the preset shortcut; the object form (`{ type: "spring", stiffness: 170, damping: 26 }`) is the full surface. Use the object form when you want spring physics or a custom cubic-bezier with specific control points.

## A complete worked example

Building "fade in title, slide subtitle from below, hold for 2 seconds" from zero:

```ts
const { documentId } = await atelier_create({
  name: "Intro", canvas: { width: 1920, height: 1080, fps: 60 }
});

await atelier_add_layer({ documentId, layer: {
  id: "title", visual: { type: "text", content: "Atelier",
    style: { fontFamily: "Inter", fontSize: 120, color: "#F5F5F7" }},
  frame: { x: 960, y: 480 }, bounds: { width: 1200, height: 160 },
  anchorPoint: { x: 0.5, y: 0.5 }, opacity: 0
}});

await atelier_add_layer({ documentId, layer: {
  id: "subtitle", visual: { type: "text", content: "AI-native animation",
    style: { fontFamily: "Inter", fontSize: 40, color: "#9CA3AF" }},
  frame: { x: 960, y: 580 }, bounds: { width: 1200, height: 60 },
  anchorPoint: { x: 0.5, y: 0.5 }, opacity: 0
}});

await atelier_edit_state({ documentId, state: "default", duration: 180 });

await atelier_add_delta({ documentId, state: "default", layer: "title",
  property: "opacity", from: 0, to: 1, startFrame: 0, endFrame: 30,
  easing: "ease-out" });

await atelier_add_delta({ documentId, state: "default", layer: "subtitle",
  property: "opacity", from: 0, to: 1, startFrame: 20, endFrame: 50,
  easing: "ease-out" });

await atelier_add_delta({ documentId, state: "default", layer: "subtitle",
  property: "frame.y", from: 680, to: 580, startFrame: 20, endFrame: 50,
  easing: { type: "spring", stiffness: 120, damping: 22 } });

await atelier_validate({ documentId });
await atelier_preview({ documentId, frame: 40 }); // inspect mid-motion
```

Eight calls. Two layers, three deltas, one validate, one preview. The agent never touched YAML.
