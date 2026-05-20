---
id: N-atel-801-editing-surface
title: The editing surface — layers, image drop, and slider commit-gating
type: note
track: ATEL-801
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-801
  - studio
  - editing
  - undo
difficulty: advanced
estimatedMinutes: 5
prerequisites:
  - N-atel-201-mcp-overview
summary: The studio's hands-on surface — the Text/Shape/Image/Handle/Page Number layer-type picker, image drag-drop via createImageLayerFromFile (aspect-fit, centered, first drop replaces the `background` placeholder), the canvas/layer/property/yaml panels, and slider commit-gating (onInput live preview vs onChange commit) so one drag is one undo.
---

## The four panels

The studio is a two-column layout: the canvas on the left, and a right panel that hosts the **layer panel**, the **property panel**, and the **yaml panel** (the studio opens on the YAML tab by default). The canvas renders the resolved frame; the layer panel lists and reorders layers; the property panel edits the selected layer's properties; the yaml panel shows the live `.atelier` source. Every panel reads from one document — edit in any of them and the others refresh.

## The layer-type picker

The layer panel's Add menu offers five variants, each a one-glyph icon plus a label:

| Variant | Icon | What it adds |
|---|---|---|
| `text` | T | a TextVisual layer |
| `shape` | ■ | a ShapeVisual layer |
| `image` | ▣ | an ImageVisual layer (opens a file picker) |
| `handle` | @ | an overlay-tagged handle (`@username`, credit, watermark) |
| `page-number` | # | an overlay-tagged page-number (`{current}/{total}`) |

`Handle` and `Page Number` carry `tags: ["overlay"]` so the layer-tag isolation invariant (ATEL-301, ATEL-501) protects them across recipe re-runs — the studio's Add menu generates the same overlay shape the MCP convenience tools and recipes do. The other three are plain content layers.

## Image drag-drop

The headline image workflow is drag-and-drop. Drop one or more image files onto the canvas and each becomes an ImageVisual layer. The same path runs whether you drop on the canvas or pick a file via the layer panel's Add → Image menu; both call `createImageLayerFromFile`.

The geometry is fixed for you by `fitImageToCanvas`:

- **Aspect-fit.** A landscape-relative image fits to canvas width; a portrait-relative image fits to canvas height. Each dimension is capped at the canvas extent, so a square image into a square canvas fills exactly.
- **Centered.** The frame is `{ x: canvas.width / 2, y: canvas.height / 2 }`, combined with a `0.5 / 0.5` anchor, so the image's centerpoint sits at canvas center.

Two placement rules govern where the new layer lands in the z-stack:

1. **First-drop-replaces.** When the FIRST image of a drop batch lands and `doc.layers[0]?.id === "background"`, it swaps that placeholder layer **in place**. That's how the welcome scaffold's `background` placeholder gets filled by your first image. `createImageLayerFromFile` is called with `replaceBackground: true` only for the first file in the batch.
2. **Everything else unshifts.** Subsequent images are `unshift`-ed onto the layers array. The renderer paints index 0 first (bottom of the z-stack), so new images sit behind existing overlays like a handle or page-number — the desired composition order.

Each layer also gets a matching `doc.assets` entry registered alongside it, keyed by `${id}-asset`. Non-image files are silently filtered out before the helper runs.

## Slider commit-gating — one drag, one undo

The property panel's sliders distinguish two events, and the difference is what keeps undo sane:

- **`onInput`** (continuous, during a drag) → `onPropertyPreview`: a **cheap canvas re-render only**. No undo snapshot. No host notification. You get live feedback as you drag.
- **`onChange`** (once, on release) → `onPropertyChange`: the **commit**. Snapshot undo history, then notify the host (which triggers autosave).

So dragging a slider produces exactly **one** undo entry, not one per pixel of travel. If a control doesn't distinguish the two events, the preview hook degrades to a full commit, so behavior is never worse than committing on every tick — but the sliders that matter (opacity, transforms) split them.

This was the **slider-commit-flood** bug: in the old un-typechecked string form of the client, the commit fired on every `input` event, flooding the undo stack and re-saving on every frame of a drag. Like the autosave save-race, it only became fixable once the client moved into a real, compiler-visible module.

## Why this surface exists

Everything here is something a human does directly — pick a layer type, drop a photo, nudge a slider. The next note introduces the other editor at the same canvas: an agent, mutating the same document over a WebSocket while you watch.
