---
id: N-atel-101-the-atelier-format
title: The `.atelier` document format
type: note
track: ATEL-101
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-101
  - format
  - schema
difficulty: beginner
estimatedMinutes: 4
prerequisites:
  - N-atel-001-first-render
summary: The top-level shape of an `.atelier` YAML document — canvas, layers, states, assets, variables, presets, templates. Every field exists for one reason, named for what it means.
---

## The five required parts

Every `.atelier` document is YAML with five mandatory top-level keys:

```yaml
name: My Animation                    # human-readable label
canvas:                               # global render context
  width: 800
  height: 600
  fps: 60
  background: "#0F1115"               # optional, defaults to transparent
layers: [ ... ]                       # ordered array of visual elements
states:                               # named keyframes (always at least one)
  default:
    duration: 60                      # in frames
    deltas: [ ... ]
```

That is the minimum. Validators accept it. The renderer can resolve any frame in the `default` state.

## The optional parts

Any of these can be absent. Add them when you need them.

| Key | What it holds | When you need it |
|---|---|---|
| `assets` | External resources (images, videos, audio) referenced by `assetId` from layers | The moment you add an image or video layer |
| `variables` | Named values referenced by `${name}` in templates and expression-driven deltas | When you want to parametrize a document or template |
| `presets` | Reusable delta bundles applied by name | When the same animation pattern repeats across layers |
| `templates` | Reusable layer subtrees instantiated by name with variable substitution | Carousels, lower-thirds, repeating motifs |
| `audio` | Audio track + sync metadata | Video projects with sound |
| `meta` | Free-form metadata (author, tags, source notes) | Anything you want a downstream tool to read |

## The order of keys is not meaningful (to the engine)

YAML is unordered for objects. The schema doesn't care whether `states` comes before `layers`. Conventionally we write them top-down — `name`, `canvas`, `assets`, `variables`, `presets`, `templates`, `layers`, `states`, `audio`, `meta` — because that order roughly matches "global setup → reusable bits → scene → motion → output."

## The order of `layers` IS meaningful

Layers render back-to-front. Index 0 is drawn first (background); the last layer is on top. This is also the order the layer panel shows them in the studio (top of the list = top of the stack, matching most design-tool conventions — the array is rendered bottom-up for display).

## Layer IDs and references

Every layer needs an `id` that is unique within the document. Deltas reference layers by id (`layer: title`). Parent-child relationships use `parentId`. Templates reference instance ids. The schema enforces uniqueness and rejects dangling references at validate time — you don't have to track them by hand.

Conventionally, layer ids are kebab-case (`title`, `subtitle`, `clip-trim-1`, `caption-word-7`). Pipeline-generated layers carry a tag namespace prefix in the id: `silence-trim-N`, `caption-N`, `caption-word-N`, `overlay-N`. The tags drive the layer-tag isolation invariant (ATEL-501).

## Reading order for the rest of ATEL-101

1. **Layers** — anatomy of a single layer: visual, frame, bounds, anchor, opacity, rotation, scale, parent, visible, motion path, clip path, blend mode, shadow, tint, interactions
2. **States and deltas** — what a state is, what a delta is, how `resolveFrame(doc, stateName, frame)` produces a renderable scene
3. **Easings** — linear / cubic-bezier / ease presets / spring / step; the math you don't have to remember but should recognize
