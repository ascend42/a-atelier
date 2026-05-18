---
id: N-atel-301-images-and-video
title: Images and video — assets, cropping, spritesheets, playback
type: note
track: ATEL-301
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-301
  - images
  - video
  - assets
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-301-shapes-and-text
summary: ImageVisual and VideoVisual. The asset system, cropping via sourceRect, spritesheet animation, video playback controls, and the objectFit rules that decide what "fitting" actually means.
---

## ImageVisual

```yaml
visual:
  type: image
  assetId: hero-photo            # registered via atelier_add_asset
  src: assets/hero.jpg           # optional — direct URL or data URL for inline use
  sourceRect:                    # optional — crop region in source pixels
    x: 100
    y: 50
    width: 800
    height: 600
  spritesheet:                   # optional — for spritesheet animation
    columns: 4
    rows: 4
    frameWidth: 256
    frameHeight: 256
    frameCount: 16               # optional, defaults to columns*rows
  frameIndex: 0                  # animatable for spritesheet playback
```

**Crop with `sourceRect`.** The 9-arg form of canvas `drawImage` is exposed directly — pick a sub-rectangle from the source image and draw it into the layer's bounds. The crop is in source-image pixels (not normalized 0–1). Animatable: deltas on `sourceRect.x`, `sourceRect.y`, `sourceRect.width`, `sourceRect.height` produce ken-burns-style pan/zoom.

**Spritesheet animation.** Set `spritesheet` and animate `frameIndex` with a `step()` easing for sprite-frame indexing:

```yaml
deltas:
  - layer: walking-character
    property: frameIndex
    from: 0
    to: 15
    startFrame: 0
    endFrame: 120
    easing:
      type: step
      count: 16
      position: jump-none
```

That walks through 16 spritesheet frames over 2 seconds at 60fps.

## VideoVisual

```yaml
visual:
  type: video
  assetId: hero-clip
  src: assets/hero.mp4
  startFrame: 30                 # composition frame when clip begins playing
  sourceOffset: 5.2              # seconds into source video to start from
  sourceEnd: 12.7                # seconds into source to stop (undefined = play to end)
  playbackRate: 1.0              # 1.0 = normal speed
  volume: 0.8                    # 0–1
  muted: false
  objectFit: contain             # 'contain' | 'cover' | 'fill'
```

- **`startFrame`** anchors the video to the composition timeline. Frame `0` of the composition shows the video frame at `sourceOffset` seconds.
- **`sourceOffset` / `sourceEnd`** trim the source. The `atelier trim` pipeline writes these values onto `clip-trim-N` layers (with `tags: ["silence-trim"]`) — the layer-tag isolation invariant covered in ATEL-501.
- **`playbackRate`** changes the source playback speed. `2.0` is 2x faster; `0.5` is half-speed. The audio is pitch-shifted accordingly (or muted if `muted: true`).
- **`objectFit`** decides what to do when the video's intrinsic aspect doesn't match the layer's bounds:
  - `contain` — fit entirely inside bounds, possibly with letterboxing
  - `cover` — fill bounds entirely, possibly cropping
  - `fill` — stretch to fit (distorts aspect)

For most layouts: `cover`. For preserving aspect: `contain`. `fill` is rarely correct.

## The asset system

```
atelier_add_asset    — register an asset with id + src + kind
atelier_list_assets  — enumerate
atelier_remove_asset — remove (rejects if referenced by a layer)
```

```ts
await atelier_add_asset({ documentId,
  asset: { id: "hero-photo", kind: "image", src: "assets/hero.jpg" }});
```

`src` can be:
- A relative path (relative to the doc's directory). The studio's `/api/assets/:base64path` endpoint serves these with path-traversal protection.
- An absolute `file://` URL.
- A `data:` URL (inline base64) for portability — useful when shipping a doc as a single file.
- An `https://` URL (the renderer fetches it; not recommended for offline rendering).

**Why `assetId` + optional `src` (vs just `src`)?** Refactoring. Renaming an asset's source path means updating one entry in `atelier_add_asset`, not every layer that references it.

## Cropping vs scaling — three knobs

Atelier gives you three independent ways to control how an image fits into a layer:

1. **`sourceRect`** — pick a sub-rectangle from the source. Crop *what's drawn*.
2. **`Layer.scale.x` / `Layer.scale.y`** — scale the layer's transform. Stretch *how it's drawn*.
3. **`Layer.bounds.width` / `bounds.height`** — change the destination size. Crop *where it's drawn* (and the renderer interpolates fit per `objectFit` if it's a video).

For image carousels with consistent framing: set `bounds` to your target aspect (e.g. 1080×1080), use `sourceRect` to pick the focal area, leave `scale` at 1.0.

For ken-burns pan/zoom: animate `sourceRect.x`/`sourceRect.y`/`sourceRect.width`/`sourceRect.height` with deltas. The image stays in place; the visible crop pans and zooms.

## Drag-and-drop in the studio (v1)

Dropping an image file onto the canvas creates an `ImageVisual` layer with the dropped file inlined as a `data:` URL (small files) or registered as an asset and referenced by `assetId` (larger files). The dropped image is centered on the canvas with bounds matching the image's intrinsic dimensions; you scale and crop from there.

This is the headline workflow for v1: drop a photo, add overlays (handle, page-number), tweak crop, export PNG. The studio's first-run scaffolds a `welcome.atelier` with a placeholder image you immediately replace.
