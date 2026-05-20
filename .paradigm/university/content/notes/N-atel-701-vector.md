---
id: N-atel-701-vector
title: Vector export — SVG per frame, Lottie per document
type: note
track: ATEL-701
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-701
  - svg
  - lottie
  - vector
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-the-atelier-format
summary: '`atelier export-svg` emits one frame as a resolution-independent SVG string; `atelier export-lottie` emits the whole animated document as Lottie JSON. When to choose vector over raster — web embeds and motion-design handoff.'
---

## Two vector exporters, two scopes

Raster gives you pixels at a fixed size. Vector gives you shapes that stay crisp at any size. Atelier ships two vector exporters, and the scope difference is the thing to internalize:

- `atelier export-svg` exports **one frame** as an SVG document.
- `atelier export-lottie` exports the **whole animated document** as Lottie JSON.

One is a still snapshot in vector form; the other is the animation itself, handed to a runtime that plays it.

## `export-svg` — a frame as SVG

```bash
atelier export-svg lockup.atelier --frame 0 --out logo.svg
atelier export-svg lockup.atelier --state hero --frame 12   # to stdout
```

Flags:

- `-s, --state <name>` — state name (defaults to the first state)
- `-f, --frame <number>` — frame within the state (defaults to `0`)
- `-o, --output <path>` — output path (defaults to stdout)
- `--xml-declaration` — prepend the `<?xml ...?>` declaration

Like the raster path, it resolves a single frame — but instead of rasterizing it, it serializes the resolved layers as SVG elements. Shapes become `<path>` / `<rect>` / `<ellipse>`, text becomes `<text>`, fills and strokes and gradients map to SVG paint. The output scales to any size with no quality loss, which is the whole point: a logo lock-up exported as SVG drops straight into a stylesheet or a React component and renders sharp on a retina display and a billboard alike.

Use `--xml-declaration` when the SVG is a standalone file consumed by tooling that wants the prolog; omit it when you're inlining the markup into HTML (where the declaration is noise).

## `export-lottie` — the document as Lottie

```bash
atelier export-lottie intro.atelier --out intro.json
atelier export-lottie intro.atelier --state hero -o hero.json
```

Flags:

- `-s, --state <name>` — state name (defaults to the first state)
- `-o, --output <path>` — output path (defaults to stdout)

Notice what's **missing**: there's no `--frame`. Lottie is an animation format, so the exporter takes the whole timeline, not a single moment. It walks the document's deltas and writes them as Lottie keyframes — opacity tracks, transform tracks, the lot. The result is a JSON file a Lottie player (lottie-web, the iOS/Android runtimes, After Effects via Bodymovin) plays back as vector animation.

The exporter is honest about its limits. Anything it can't faithfully translate — an effect with no Lottie equivalent, a visual type outside Lottie's model — comes back as a **warning on stderr**, not a silent omission:

```
Warning: <unsupported feature> — skipped in Lottie output
```

Read those warnings. A clean export means the Lottie matches the document; a warning means a feature dropped on the way out and you should check the result in a player before shipping it.

## Vector vs raster — choosing

Reach for **vector** when:

- **The output embeds in the web and must scale.** An SVG logo or icon stays crisp at every density and size. No `@2x`/`@3x` asset matrix.
- **You're handing off to motion design.** Lottie is the lingua franca between Atelier and design/runtime teams — tiny files, vector-crisp, playable in every major runtime. Export the document as Lottie and a front-end engineer drops it into a screen with three lines of code.
- **File size and scalability beat pixel fidelity.** Vector files are small and resolution-independent.

Reach for **raster** (N-atel-701-png-and-frames) when:

- The artwork is photographic or has effects vector can't express cleanly (complex blurs, blends, image content).
- The destination wants a fixed-size pixel image (an OG card, a thumbnail).
- You need a single still and the consumer expects a PNG.

The rule of thumb: **SVG for a still that must scale, Lottie for motion handed to a player, raster for everything photographic or pixel-final.** When a Lottie export warns, treat that as a signal that the document leans on something raster (or video) would carry better.
