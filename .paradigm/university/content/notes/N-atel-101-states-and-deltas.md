---
id: N-atel-101-states-and-deltas
title: States, deltas, and `resolveFrame`
type: note
track: ATEL-101
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-101
  - states
  - deltas
  - resolve-frame
difficulty: beginner
estimatedMinutes: 5
prerequisites:
  - N-atel-101-layers
summary: A state is a named span of frames. A delta animates one property of one layer over a sub-range of that span. `resolveFrame(doc, stateName, frame)` is the function the renderer calls — knowing its shape demystifies everything else.
---

## A state is a named span

```yaml
states:
  default:
    duration: 60
    deltas:
      - layer: title
        property: opacity
        from: 0
        to: 1
        startFrame: 0
        endFrame: 30
        easing: ease-out
```

`default` is the state name. `duration: 60` means this state runs for 60 frames (one second at 60fps). Frames are 0-indexed, so this state spans `0..59` inclusive. The renderer plays through the state and either loops, transitions to another state, or stops, depending on configuration.

A document always has at least one state. Most documents have only one. Multi-state documents are the foundation of interactive UI motion (`hover`, `active`, `pressed`) and segmented narratives.

## A delta animates one property

Every field on a delta exists for a reason:

| Field | Meaning |
|---|---|
| `layer` | Which layer (by id) this delta animates |
| `property` | Which animatable property (e.g. `opacity`, `frame.x`, `style.color`) |
| `from` | Starting value at `startFrame` |
| `to` | Ending value at `endFrame` |
| `startFrame` | Frame within the state where this delta begins |
| `endFrame` | Frame within the state where this delta ends |
| `easing` | How the value interpolates between `from` and `to` |
| `expression` | Optional override — a function of `t` (0..1) returning the interpolated value, for non-trivial animations |

Outside `[startFrame, endFrame]`, the property holds its boundary value (clamped). Multiple deltas on the same `layer` + `property` are rejected by the schema's no-overlap gate — overlapping motion is almost always a bug; if you need composition, use two layers or a `group`.

## `resolveFrame` is the whole engine in one function

```ts
const scene = resolveFrame(doc, stateName, frameNumber);
// scene is { layers: ResolvedLayer[] } — every property concrete, no deltas
```

What it does, in order:

1. Look up the state by name. If it doesn't exist, throw.
2. For each layer in `doc.layers`, start with its authored values.
3. For each delta in `state.deltas`:
   - If `frameNumber < startFrame`, the layer's property stays at `from`.
   - If `frameNumber > endFrame`, the layer's property stays at `to`.
   - If between: compute `t = (frameNumber - startFrame) / (endFrame - startFrame)`, run `t` through the easing function (returning `t'`), then interpolate `from + (to - from) * t'`.
4. Apply parent transforms (if a layer has `parentId`), motion paths, clip paths, tints.
5. Return the resolved scene — every layer now has concrete property values ready for the renderer.

The renderer (canvas, SVG export, Lottie export, video exporter) all consume the same `ResolvedLayer[]` output. Adding a new renderer is "consume one frame at a time"; adding a new animatable property is "add to the interpolation switch."

## Hierarchical states and transitions

States can declare a `parent` (extending another state's deltas) and a `transitions` block (named transitions from one state to another with their own duration, easing, and target deltas). This is the foundation of interactive UI motion — `hover` extends `default` with extra deltas, `pressed` transitions from `hover` with a 200ms ease-out. Full coverage in ATEL-401 (State Machines & Motion).

## Inspecting a frame from the CLI

```bash
atelier preview hello.atelier --frame 15
atelier preview hello.atelier --frame 15 --state hover
```

The output is the same `ResolvedLayer[]` array `resolveFrame` produces — perfect for debugging "what does the engine actually think this scene looks like at frame N?"

For multi-frame inspection, `atelier_batch_preview` (MCP) or `atelier diff_frames` (CLI) compare two frames side by side.

Next: easings.
