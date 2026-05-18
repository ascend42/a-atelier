---
id: N-atel-301-composition-and-overlays
title: Composition, refs, and the overlay namespace
type: note
track: ATEL-301
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-301
  - composition
  - overlays
  - refs
  - groups
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-301-effects
summary: GroupVisual + parentId for transform-inherited clusters, RefVisual for sub-documents, and the `overlay` tag namespace — handle and page-number overlays as parameterized text layers protected by the layer-tag isolation invariant.
---

## Groups and parentId

A `GroupVisual` layer renders nothing of its own. It exists to provide a parent transform for child layers:

```yaml
- id: card
  visual: { type: group }
  frame: { x: 200, y: 400 }
  rotation: -8
  bounds: { width: 600, height: 800 }

- id: card-photo
  parentId: card
  visual: { type: image, assetId: hero-photo }
  frame: { x: 0, y: 0 }
  bounds: { width: 600, height: 600 }

- id: card-title
  parentId: card
  visual: { type: text, content: "Title", style: { ... }}
  frame: { x: 24, y: 640 }
  bounds: { width: 552, height: 80 }
```

The `card` group is positioned at canvas (200, 400) and rotated -8°. Its children render in the group's local coordinate space — the photo is at (0, 0) relative to the rotated card, not the canvas. Animating the group's `rotation` or `frame.x` moves the whole cluster as one unit.

**Use groups for:** anything that needs to move/rotate/scale as a unit. Cards, lower-thirds, picture-in-picture clusters, repeated elements you want to manage together.

**Don't use groups for:** ordering or styling. Layer z-order is the array index; styling is per-layer.

## Refs — sub-documents

```yaml
- id: lower-third
  visual:
    type: ref
    src: ./lower-third.atelier
    state: default           # optional — defaults to first state
    frame: 0                 # optional — defaults to parent frame, clamped to sub-doc duration
  frame: { x: 0, y: 900 }
  bounds: { width: 1920, height: 180 }
```

A `RefVisual` renders another `.atelier` document inside itself. The sub-document is resolved (via `resolveFrame`) and rendered into the parent's coordinate space.

**Use refs for:** brand lock-ups (logo + tagline) reused across compositions, lower-thirds with consistent style, carousel templates where every page references a shared layout, scenes that are themselves composed scenes.

The studio file-watches every referenced `.atelier` file. Editing the sub-document updates every parent composition that references it — refs are how Atelier expresses "single source of truth."

## The overlay namespace

The `overlay` tag namespace is a Phase 1.5 first-class slot for decorative text layers that mark a composition (handle, page-number, credit, date, QR). Every overlay layer carries `tags: ["overlay"]`.

The contract:

1. Pipelines and recipes that produce overlays use `applyRecipeToOverlay`, which drops only `overlay`-tagged layers before re-adding. The layer-tag isolation invariant (ATEL-501) applies.
2. User edits to overlay layers (move, restyle, hide) survive re-runs as long as the layer id matches a recipe-defined overlay (the `userEdited` flag is preserved across re-applications).
3. MCP convenience tools (`atelier_add_handle`, `atelier_add_page_number`) emit overlay-tagged layers with sensible defaults; recipes generate the same shape declaratively.

### Handle overlay

A handle is a static text overlay — typically a social-media handle (`@username`), credit (`by Author`), or watermark. Authored:

```yaml
overlay_rules:
  handle:
    text: "@username"
    anchor: bottom-left
    margin: 32
    style:
      fontFamily: Inter
      fontSize: 24
      fontWeight: 600
      color: "#F5F5F7"
```

Applied via `apply-recipe` or `atelier_add_handle`. Layer id: `overlay-handle` (stable, so re-apply replaces in place).

### Page-number overlay

A page-number is a parameterized text overlay rendering a template like `{current}/{total}` or `{current:02d} of {total:02d}`. Authored:

```yaml
overlay_rules:
  page_number:
    format: "{current:02d}/{total:02d}"
    anchor: bottom-right
    margin: 32
    style:
      fontFamily: Inter
      fontSize: 18
      fontWeight: 500
      color: "#9CA3AF"
```

Applied during carousel batch processing: the renderer threads `currentIndex` and `totalCount` into `applyRecipeToOverlay`, which renders the format string into the layer's content. Layer id: `overlay-page-number`.

Single-frame applies (where the carousel context isn't available) skip the page-number layer with a logger warning — by design. A page-number doesn't make sense on a standalone composition.

### Anchor math

All four corners are supported. The translator maps anchor → frame/anchorPoint as follows:

| `anchor` | `frame` | `anchorPoint` |
|---|---|---|
| `top-left` | `{ x: margin, y: margin }` | `{ x: 0, y: 0 }` |
| `top-right` | `{ x: canvas.width - margin, y: margin }` | `{ x: 1, y: 0 }` |
| `bottom-left` | `{ x: margin, y: canvas.height - margin }` | `{ x: 0, y: 1 }` |
| `bottom-right` | `{ x: canvas.width - margin, y: canvas.height - margin }` | `{ x: 1, y: 1 }` |

The anchor doubles as the rotation/scale pivot — animating `rotation` on an overlay rotates around the corner the overlay is anchored to.

### Why overlays are their own namespace (and not just "text layers")

Because they're **generated and re-generated** by recipes. The layer-tag isolation invariant lets a user tweak an overlay (drag the handle a few pixels, restyle it), re-apply the recipe, and keep the tweak. Untagged user-authored text layers are never touched. Caption-pipeline layers (`tags: ["caption"]`) and silence-trim layers (`tags: ["silence-trim"]`) are never touched either.

That isolation is what makes the human↔agent symbiotic loop safe at every level of the pipeline — silence-trim, captions, overlays, and (soon) carousel-batch page-numbers.

That closes ATEL-301. You now know every visual primitive Atelier renders and how composition + overlays slot into the layer-tag invariant. The remaining tracks (ATEL-401 motion deep-dive, ATEL-501 video pipelines, ATEL-601 recipes, ATEL-701 export) layer on top of this foundation.
