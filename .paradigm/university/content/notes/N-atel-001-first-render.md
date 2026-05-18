---
id: N-atel-001-first-render
title: Render your first animation
type: note
track: ATEL-001
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-001
  - first-render
  - cli
difficulty: beginner
estimatedMinutes: 5
prerequisites:
  - N-atel-001-install-and-launch
summary: Create a minimal `.atelier` document by hand, preview a frame, and export to PNG — three CLI calls, no studio needed. Demystifies the document format before the visual surfaces hide it.
---

## The smallest possible document

Save this as `hello.atelier` in any directory:

```yaml
name: Hello
canvas:
  width: 800
  height: 600
  fps: 60
  background: "#0F1115"
layers:
  - id: title
    visual:
      type: text
      content: Hello, Atelier
      style:
        fontFamily: Inter, system-ui, sans-serif
        fontSize: 64
        fontWeight: 600
        color: "#F5F5F7"
    frame:
      x: 400
      y: 300
    bounds:
      width: 600
      height: 100
    anchorPoint:
      x: 0.5
      y: 0.5
    opacity: 0
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

That's a full Atelier document. One text layer, one state, one delta that fades the title in over 30 frames.

## Validate it

```bash
atelier validate hello.atelier
```

The schema catches malformed easings, references to nonexistent layers, out-of-range frame numbers, missing required fields. Validation runs against a Zod schema with AI-readable error messages — if you ever ship a corrupt document, the validator will point at the field, not just say "invalid YAML."

## Preview a frame

```bash
atelier preview hello.atelier --frame 15
```

Outputs the resolved layer state at frame 15: the title at 50% opacity, mid-fade. This is the same `resolveFrame` call the renderer makes; `preview` lets you inspect it without rendering.

## Export

```bash
atelier export hello.atelier --frame 30 --out hello.png
```

PNG export from a single frame. For MP4 / WebM / GIF, drop the `--frame` flag and add `--format mp4`:

```bash
atelier export hello.atelier --format mp4 --out hello.mp4
```

The CLI uses FFmpeg for video formats (must be on `$PATH`). The studio exports use WebCodecs in the browser — no FFmpeg dependency there.

## What you just learned about the format

- **Canvas** sets dimensions, frame rate, background — the global render context.
- **Layers** are visual elements with an ID, a `visual` (shape/text/image/video/group/ref), a `frame` (position), `bounds` (size), `anchorPoint`, and animatable properties (opacity, rotation, scale).
- **States** are named keyframes. Each has a `duration` (in frames) and `deltas` (interpolations).
- **Deltas** animate one property of one layer from a `from` value to a `to` value across `startFrame`–`endFrame`, with an `easing`.

That's the mental model. Layers describe what exists. States describe how long. Deltas describe how things change. Everything else — easings, presets, templates, interactions, refs — extends these primitives.

## Where to go next

- **ATEL-101**: Document Model Fundamentals — every layer type, every easing, the resolveFrame interpolation model
- **ATEL-201**: Authoring via MCP — the 52 tools an agent uses to build documents like this without touching YAML
- **ATEL-301**: Visual System — shapes, typography, images, video; fills, strokes, shadows, blend modes, motion paths
- **ATEL-501**: Video Project Pipeline — silence-trim, transcribe, captions, parametric cuts
- **ATEL-601**: Studio Recipes — bundle silence policy + caption style + overlay rules + palette into a reusable preset

You can also just run `atelier studio hello.atelier` and edit this document in the browser. Anything you change in the studio writes back to the same file.
