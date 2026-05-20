---
id: N-atel-701-png-and-frames
title: PNG and frames — the raster export path
type: note
track: ATEL-701
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-701
  - png
  - raster
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-the-atelier-format
summary: Single-frame raster output via `atelier export-image` and `atelier still`. The @napi-rs/canvas rasterizer ships prebuilt platform binaries — PNG export works on a plain `npm install`, no brew, no cairo, no node-gyp build.
---

## One frame, one PNG

A whole animation is a sequence of resolved frames. To pull a single one out as an image:

```bash
atelier export-image hello.atelier --out frame.png
```

That renders the document's first state at frame `0` to `frame.png`. To pick a different moment, name the state and the frame:

```bash
atelier export-image hello.atelier --out mid-fade.png --frame 15 --state intro
```

The flags are exactly:

- `-o, --out <path>` — output PNG path (required)
- `-s, --state <name>` — state name (defaults to the first state)
- `-f, --frame <number>` — frame within the state (defaults to `0`)
- `--width <number>` / `--height <number>` — output dimension overrides

Pick a frame past the end of the state's `duration` and the command refuses it with `Frame N is out of range for state "X" (duration D)`. The renderer validates the selection before it touches a canvas.

## Resizing on export

Override one dimension and the other is derived to preserve the document's aspect ratio:

```bash
atelier export-image hero.atelier --out thumb.png --width 400
```

A 1920×1080 document exported with `--width 400` comes out 400×225. Override *both* and the renderer uses both verbatim — which can squash the image if the ratio doesn't match. That's deliberate: sometimes you genuinely want a non-uniform target size. Most of the time, set one and let the aspect ratio carry the other.

## `still` — the same frame, two formats

`atelier still` resolves a single frame too, but it can emit either the resolved-frame JSON or a PNG:

```bash
atelier still hello.atelier --frame 15                    # JSON to stdout
atelier still hello.atelier --frame 15 --format png -o f.png
```

- `--format json` (default) prints the `resolveFrame` output — every layer's interpolated position, opacity, scale, and resolved visual at that frame. This is the inspection tool: see exactly what the renderer sees before it draws.
- `--format png` rasterizes that resolved frame. With no `-o, --output`, the PNG bytes go to stdout (pipe it somewhere); with `-o`, it writes a file.

So `export-image` is the dedicated "give me a PNG" command with resize flags; `still` is the "show me this frame" command that happens to also rasterize. When you want a sized image file, reach for `export-image`. When you're debugging interpolation, reach for `still --format json`.

## The rasterizer: @napi-rs/canvas

Both raster paths go through the same backend — `@napi-rs/canvas`, a Canvas2D implementation shipped as **prebuilt platform binaries**. This matters more than it sounds:

- No `node-gyp` compile step.
- No system libraries — no `brew install cairo pango libpng`, no `apt install libcairo2-dev`.
- It's a hard dependency, so PNG export works the moment `npm install` finishes, on any platform with a prebuilt binary.

The renderer pre-loads every `ImageVisual` source first (file path, `data:` URL, or buffer all work server-side), wires them into an `ImageCache`, then renders one resolved frame scaled to the requested output dimensions. If the binary somehow fails to load — a corrupt install, an unsupported platform — you get a typed `CanvasUnavailableError` telling you to reinstall, not a cryptic native crash.

> Hold onto this distinction: the **single-frame raster** path (`export-image`, `still --format png`, and `carousel`) needs nothing beyond `npm install`. The **video** path (`atelier render`, covered in N-atel-701-video) is a different backend with different requirements. PNG-clean install does not imply MP4-clean install.

## When raster is the right call

A PNG is the right output when the destination is a still image: a thumbnail, an Open Graph card, a poster frame, a single social image, a print proof. It's the wrong output for anything that needs to scale crisply at arbitrary sizes (a logo destined for a stylesheet) — that's the vector path in N-atel-701-vector — or anything that moves (the video path in N-atel-701-video).

For batch raster delivery — a whole folder of images composed into a uniform set of posts — don't loop `export-image` by hand. ATEL-601's `atelier carousel` drives the same `renderDocumentToPng` path across many inputs with recipe overlays applied. See that track; this note stays on the single-frame primitives.
