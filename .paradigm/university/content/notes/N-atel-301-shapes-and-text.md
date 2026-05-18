---
id: N-atel-301-shapes-and-text
title: Shapes and text — the foundational visuals
type: note
track: ATEL-301
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-301
  - shapes
  - text
  - typography
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-101-layers
summary: The four shape primitives (rect, ellipse, polygon, path), the typography stack, and the design rules that prevent 90% of "the text looks wrong" problems.
---

## ShapeVisual — four primitives

```yaml
visual:
  type: shape
  shape:
    kind: rect           # or: ellipse | polygon | path
    # ... kind-specific fields
```

| `kind` | Required fields | Notes |
|---|---|---|
| `rect` | `width`, `height`, optional `cornerRadius` | The most common. `cornerRadius` accepts a number or `{tl, tr, br, bl}` for per-corner control. |
| `ellipse` | `radiusX`, `radiusY` | For circles, set `radiusX === radiusY`. |
| `polygon` | `points: [{x, y}, ...]` (≥ 3 points) | Closed path through the points. |
| `path` | `points: PathPoint[]`, optional `closed` | Bezier-capable. Each PathPoint has `{x, y}` and optional `inControl`/`outControl` for curves. |

Shapes are drawn at the layer's `frame` position with the layer's `bounds` as the local coordinate space. Shape coordinates are in that local space — `(0, 0)` is the bounds' top-left.

## Fills and strokes — covered in the effects note

The shape `kind` defines geometry; `fill` and `stroke` (on the visual or set via `atelier_set_fill` / `atelier_set_stroke`) define paint. They're covered in N-atel-301-effects because they apply to text and image layers too, not just shapes.

## TextVisual — the typography stack

```yaml
visual:
  type: text
  content: "Hello"
  style:
    fontFamily: Inter, system-ui, sans-serif    # required
    fontSize: 48                                  # required
    fontWeight: 600                               # optional, defaults to "normal"
    color: "#F5F5F7"                              # optional, defaults to canvas-appropriate
    letterSpacing: 0                              # optional, em units
    lineHeight: 1.2                               # optional, multiplier
    textAlign: center                             # 'left' | 'center' | 'right' | 'justify'
    fontStyle: normal                             # 'normal' | 'italic'
    textDecoration: none                          # 'none' | 'underline' | 'line-through'
```

`fontFamily` is treated as a CSS-style fallback chain. The renderer (canvas, SVG, Lottie) loads the first available font and falls back through the chain. **For consistent rendering across renderers and platforms, ship your fonts as assets** — register a font file with `atelier_add_asset({ kind: "font", src: "fonts/Inter-SemiBold.woff2" })` and reference it by the font's PostScript name in `fontFamily`.

Without font assets, the browser studio uses system fonts; the CLI's PNG export (node-canvas) uses whatever's installed on the machine. Renders diverge. Font assets fix this.

## Text bounds

Text layers have `bounds` like every other layer. The renderer wraps text to fit the bounds' width. Lines that exceed the bounds' height are clipped (not pushed off-screen — clipped, like overflow:hidden).

If you want auto-sizing bounds: leave bounds at a generous default (e.g. 1200×400 for a title) and let the text size itself within. Tight bounds give precise layout but require you to know the text content in advance.

Animatable text properties via deltas:
- `opacity`, `rotation`, `scale`, `frame.x`/`frame.y`, `bounds.width`/`bounds.height` (layer-level — animate any text)
- `style.fontSize`, `style.color`, `style.letterSpacing`, `style.lineHeight` (style-level)
- `content` is **not** animatable — to "type" text on, use a series of TextVisual layers each appearing on a successive frame, or use the upcoming `atelier_set_typewriter` interaction (planned, not yet shipped)

## The three rules that prevent most text problems

1. **Always specify `fontSize`.** Defaults exist but vary by renderer. Pin it.
2. **Always specify `fontFamily` with a fallback chain.** Even if you ship font assets, the chain handles "asset not loaded yet" gracefully.
3. **Use `anchorPoint: {x: 0.5, y: 0.5}` for any text you'll animate.** Rotation and scale pivot from the anchor — centered text rotates around its center, top-left text rotates around the corner. The latter is almost never what you want.

## Worked example — a title with subtitle

```yaml
layers:
  - id: title
    visual:
      type: text
      content: Atelier
      style:
        fontFamily: Inter, system-ui, sans-serif
        fontSize: 120
        fontWeight: 700
        color: "#F5F5F7"
        textAlign: center
    frame: { x: 960, y: 460 }
    bounds: { width: 1200, height: 160 }
    anchorPoint: { x: 0.5, y: 0.5 }

  - id: subtitle
    visual:
      type: text
      content: AI-native animation, locally launched
      style:
        fontFamily: Inter, system-ui, sans-serif
        fontSize: 32
        fontWeight: 400
        color: "#9CA3AF"
        textAlign: center
        letterSpacing: 0.02
    frame: { x: 960, y: 600 }
    bounds: { width: 1400, height: 60 }
    anchorPoint: { x: 0.5, y: 0.5 }
```

Two layers, no animation — just composition. Open this in the studio and you have a still composition; add deltas and the title fades and the subtitle slides.
