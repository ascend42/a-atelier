---
id: N-atel-301-effects
title: Effects — fills, strokes, shadows, blends, clips, motion paths, tints
type: note
track: ATEL-301
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-301
  - effects
  - rendering
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-301-images-and-video
summary: The non-geometry visual surface — paint (fills/strokes/gradients), depth (shadows), compositing (blends), masking (clip paths), trajectory (motion paths), color overlays (tints). What each does, when each animates well.
---

## Fills

```yaml
fill:
  type: color                    # or: linear-gradient | radial-gradient | pattern
  color: "#3B82F6"
```

Four fill types:

| `type` | Shape |
|---|---|
| `color` | `color: "#RRGGBB"` or `"rgba(...)"` |
| `linear-gradient` | `stops: [{offset, color}, ...]`, `angle: degrees` |
| `radial-gradient` | `stops: [{offset, color}, ...]`, `center: {x, y}`, `radius: number` |
| `pattern` | `assetId` (image), optional `repeat: 'repeat' \| 'no-repeat'` |

Apply via `atelier_set_fill({ documentId, layerId, fill })`. Animatable: stop colors and offsets via deltas on `fill.stops[N].color` and `fill.stops[N].offset`. Solid colors animate via `fill.color`.

## Strokes

```yaml
stroke:
  color: "#F5F5F7"
  width: 2
  dash: [4, 4]                   # optional dash pattern
  lineJoin: round                # 'miter' | 'round' | 'bevel'
  lineCap: round                 # 'butt' | 'round' | 'square'
```

Animatable: `width`, `color`, `dash` (animate `dash[0]` and `dash[1]` for marching-ants effects).

## Shadows

```yaml
shadow:
  color: "#000000AA"
  blur: 20
  offsetX: 0
  offsetY: 8
  spread: 0                      # optional — extends the shadow before blur
```

Drop shadows (`offsetX/Y > 0`) and glows (`offsetX/Y === 0` with high `blur`) both use the same primitive. Animate `blur` and `spread` for pulse effects.

Applied per-layer via `atelier_set_shadow({ documentId, layerId, shadow })`. Removing: pass `shadow: null`.

## Blend modes

```yaml
blendMode: multiply              # or any Canvas composite operation
```

Layer-level. The full list: `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`.

Most common in practice:
- `multiply` — color over background (good for grading photos)
- `screen` — lighten effect (good for flares, highlights)
- `overlay` — contrast boost
- `color` — preserve luminosity of base, take hue+saturation of overlay (good for color grading)

Animatable indirectly: animate the layer's `opacity` with the blend mode held constant. The blend mode itself is not interpolated (it's a discrete switch).

## Clip paths

```yaml
clipPath:
  kind: ellipse                  # any Shape
  radiusX: 200
  radiusY: 200
```

Restricts rendering to inside the clip shape. Useful for: avatar circles, ken-burns inside a non-rectangular frame, transition reveals.

The clip path is in the layer's local coordinate space (same as visual shapes). Animatable: animate the clip shape's properties (e.g. `clipPath.radiusX`) for reveal animations.

## Motion paths

```yaml
motionPath:
  points:
    - { x: 100, y: 400 }
    - { x: 600, y: 100, outControl: { x: 800, y: 100 }}
    - { x: 1100, y: 400, inControl: { x: 900, y: 400 }}
  closed: false
  autoRotate: true               # layer rotates to follow path tangent
  autoRotateOffset: 0            # degrees added to the auto-rotation
```

The layer's `frame.x` / `frame.y` is overridden by the motion path. Deltas that animate `frame.x` or `frame.y` are ignored when a motion path is present (the path is the trajectory; the delta on a parametric position would conflict). To control speed along the path, animate `motionProgress` (0..1) with a delta.

If `autoRotate: true`, the layer's `rotation` follows the path's tangent — good for arrows tracing a curve, cars driving along a road.

## Tints

```yaml
tint:
  color: "#3B82F6"
  amount: 0.4                    # 0..1, strength of the tint overlay
```

A solid color overlay applied to the rendered layer. Animatable: `tint.amount` produces a tint fade-in/out. `tint.color` interpolates RGB → animatable for color-cycling.

Distinct from `blendMode: color` — tint is a per-layer overlay; blend mode is a composite operation between layers.

## When to use what

- **Color emphasis on a shape:** fill.
- **Outline:** stroke.
- **Depth:** shadow.
- **Photo grading:** blendMode (`multiply`, `color`).
- **Reveal mask:** clipPath.
- **Curved trajectory:** motionPath.
- **Color cycle without changing assets:** tint.

For carousel social posts (the v1 headline use case): fills + a subtle `blendMode: multiply` on a dark overlay layer above the photo for caption legibility, with `tint` reserved for brand-color accents on overlay text.
