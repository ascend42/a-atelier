---
id: N-atel-201-patterns
title: Authoring patterns and decision rules
type: note
track: ATEL-201
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-201
  - mcp
  - patterns
  - best-practices
difficulty: intermediate
estimatedMinutes: 4
prerequisites:
  - N-atel-201-visual-and-effects
summary: The high-frequency patterns — build-then-animate, snapshot-edit-restore, batch-mutate-validate, preset-vs-hand-author. When to reach for which tool, and the four mistakes agents make most.
---

## Pattern 1 — Build, then animate

Adding deltas before layers is rejected (the delta's target layer doesn't exist yet). Adding all layers first, then all deltas in the order they'll fire, produces clean diffs and easy debugging.

Rough order for a fresh document:

```
atelier_create
↓ (variables / assets / presets / templates if needed)
atelier_add_variable        (× N)
atelier_add_asset           (× N)
atelier_define_preset       (× N)
↓
atelier_add_layer           (× N)
atelier_edit_visual / set_* (× N — visual configuration that doesn't animate)
↓
atelier_add_state           (× N — if multi-state)
atelier_set_state_parent    (× N — for hierarchical states)
atelier_configure_transition (× N — for interactive transitions)
↓
atelier_add_delta           (× N — the motion)
↓
atelier_validate
atelier_preview { frame: N } (sanity-check mid-motion)
```

Reverse-order works (the validator still catches problems) but produces noisier error logs.

## Pattern 2 — Snapshot, edit, restore

When an agent is about to make a destructive change (e.g. restructuring states, replacing a layer type), snapshot first:

```ts
const before = await atelier_info({ documentId });
// ... mutations ...
await atelier_validate({ documentId });
// if it doesn't pass: reload from the prior state or use the studio's undo stack
```

The MCP store doesn't have an undo stack of its own (yet — that's Studio-side via `History`). For agent workflows: persist the doc with `atelier_export` before risky changes, restore from the export if validation fails.

## Pattern 3 — Batch-mutate-validate

Many small mutations followed by one `atelier_validate` is more efficient than validating after every call. The schema runs on every tool call regardless (you can't bypass it), but `atelier_validate` also reports advisory warnings — long pauses, overly-deep nesting, missing transitions — that you don't want firing 50 times during a build.

For very large compositions (50+ layers), the studio bridge benefits from grouping mutations into a "build session" — start with `atelier_create`, end with one validate, broadcast one `doc:patch` instead of 50 incremental `llm:mutation` events. The bridge's `coalesce` flag (when set on the WS envelope) suppresses incremental broadcasts until the session ends.

## Pattern 4 — Preset vs. hand-author

If the same motion repeats across three or more layers: define a preset.

```ts
await atelier_define_preset({ documentId, name: "fade-in-from-below",
  deltas: [
    { property: "opacity", from: 0, to: 1, startFrame: 0, endFrame: 24, easing: "ease-out" },
    { property: "frame.y", from: "${baseY + 24}", to: "${baseY}", startFrame: 0, endFrame: 24, easing: { type: "spring", stiffness: 120, damping: 22 }}
  ]});

for (const layerId of ["title", "subtitle", "caption"]) {
  await atelier_apply_preset({ documentId, name: "fade-in-from-below",
    layer: layerId, state: "default", offset: layerId === "title" ? 0 : 6 });
}
```

The `offset` parameter shifts the applied deltas by N frames — that's how you stagger entrances without hand-authoring N delta sets.

If a motion is one-of-a-kind: hand-author. Don't define a preset for a one-time animation.

## Pattern 5 — Use templates for *layers*, presets for *deltas*

Templates produce layer subtrees (with variable substitution). Presets produce delta bundles.

If you find yourself defining a "preset" that's actually a `group` layer with three children — that's a template. Switch and use `atelier_instantiate_template`.

If you find yourself defining a "template" that's just three deltas on a single layer — that's a preset. Switch and use `atelier_define_preset`.

## The four most common agent mistakes

1. **Adding a delta to a property that doesn't exist on the layer's visual type.** A `TextVisual` has `style.fontSize` but no `style.borderRadius`. The schema rejects it; the agent should read the error message verbatim ("`property "style.borderRadius" is not animatable on a text layer`") and pick a real property.

2. **Forgetting to set `endFrame ≤ state.duration`.** The schema accepts deltas that extend past the state's duration, but the renderer clamps them — you get motion that "freezes" at the boundary value. If you want a 2-second animation, set `state.duration: 120` (at 60fps) before adding deltas.

3. **Overlapping deltas on the same layer + property.** The no-overlap gate rejects it. Fix: split into two adjacent ranges (`0–30` then `30–60`), or use two layers.

4. **Mutating a doc without saving.** The MCP store is in-memory. Closing the session loses unsaved work. Either run inside `atelier studio` (which autosaves), or call `atelier_export({ format: "yaml", out: "session.atelier" })` periodically.

That closes ATEL-201. The next track (ATEL-301) covers the visual system in depth — every shape, every fill mode, the typography stack, image handling, and the new overlay namespace.
