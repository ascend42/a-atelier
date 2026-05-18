---
id: N-atel-101-layers
title: Layer anatomy
type: note
track: ATEL-101
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-101
  - layers
  - format
difficulty: beginner
estimatedMinutes: 5
prerequisites:
  - N-atel-101-the-atelier-format
summary: Every field on the `Layer` type, what it does, what's required vs optional, and which fields are animatable through deltas.
---

## The minimum layer

```yaml
- id: title
  visual:
    type: text
    content: Hello
    style:
      fontFamily: Inter, system-ui, sans-serif
      fontSize: 48
  frame:
    x: 400
    y: 300
  bounds:
    width: 600
    height: 80
```

Four required fields: `id`, `visual`, `frame`, `bounds`. The rest are optional and default to sensible values.

## The six visual types

The `visual` field is a discriminated union on `type`:

| `type` | Renders | Required sub-fields |
|---|---|---|
| `shape` | A geometric shape — rect, ellipse, polygon, path | `shape`, optional `fill` and `stroke` |
| `text` | A string with typography | `content`, `style` (fontFamily required) |
| `image` | A static image asset | `assetId` (and optional `src`, `sourceRect`, `spritesheet`) |
| `video` | A video clip | `assetId`, optional `sourceOffset`, `sourceEnd`, `playbackRate` |
| `group` | A container for child layers (via `parentId`) | none — just a container |
| `ref` | A reference to another `.atelier` file rendered as a sub-document | `src`, optional `state` and `frame` |

## Position, size, and anchor

- **`frame: { x, y }`** — position of the anchor point in canvas pixels.
- **`bounds: { width, height }`** — the layer's box.
- **`anchorPoint: { x, y }`** — normalized 0–1 coordinate inside the bounds that `frame` positions. `{x: 0.5, y: 0.5}` centers the layer on `frame`. `{x: 0, y: 0}` puts the top-left at `frame`. Default is `{x: 0, y: 0}`.

The anchor also defines the pivot for `rotation` and `scale`.

## Animatable layer properties

These can appear in deltas (`property: <name>`):

| Property | Type | Default |
|---|---|---|
| `opacity` | number 0–1 | 1 |
| `rotation` | degrees | 0 |
| `scale` | `{ x, y }` | `{1, 1}` |
| `frame.x`, `frame.y` | number | as authored |
| `bounds.width`, `bounds.height` | number | as authored |
| `tint.amount` | 0–1 (color tint strength) | 0 |
| Any color, gradient stop, stroke width, shadow blur on the visual or its style | various | — |

The full animatable list is 27 properties. The schema enforces that a delta's `property` path is reachable on the named layer's visual.

## Non-animatable structural fields

| Field | Purpose |
|---|---|
| `id` | Unique identifier |
| `tags` | Namespace markers (used by pipelines for layer-tag isolation) |
| `description` | Human-readable note, kept out of render |
| `parentId` | Parents this layer to another for transform inheritance |
| `visible` | Hard on/off (rendered if `true` or absent) |
| `blendMode` | Canvas composite operation |
| `clipPath` | A Shape that restricts rendering to its interior |
| `motionPath` | A path the layer follows over time, with optional auto-rotate |
| `interactions` | Event-driven trigger-action bindings (e.g. hover → state transition) |

## Parent-child and transform inheritance

Setting `parentId` on a layer makes its `frame`, `rotation`, and `scale` relative to the parent's transformed coordinate space. A `group` visual has no rendered output of its own — it exists purely to provide a parent transform. Use groups when you want to translate or rotate a cluster of layers as one unit.

## Tags: the pipeline contract

Tags are how the silence-trim, caption, and overlay pipelines find layers they own. Each pipeline writes a tag namespace:

- `silence-trim` — clip layers produced by `atelier trim`
- `caption`, `caption-word` — text layers produced by `atelier captions regenerate`
- `overlay` — handle / page-number / recipe-driven decorative layers

The invariant: re-running a pipeline drops only its own tagged layers and replaces them. Layers without that tag (user-authored, or owned by another pipeline) are never touched. This is what makes the human↔agent symbiotic loop safe (ATEL-501 covers this in depth).

Next: states and deltas.
