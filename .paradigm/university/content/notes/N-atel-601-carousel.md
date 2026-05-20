---
id: N-atel-601-carousel
title: The carousel driver — a folder of images into posts
type: note
track: ATEL-601
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-601
  - carousel
  - batch
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-301-composition-and-overlays
summary: atelier carousel takes a recipe plus a folder of images and composes one PNG per image, threading currentIndex/totalCount into the page-number overlay so each post reads "i/N". The folder → posts → destination workflow, the 1-based index, fit-to-canvas composition, and zero-padded sortable output names.
---

## The workflow: folder into posts

A carousel is the multi-image-post format — a swipeable deck where each frame is its own image with consistent branding and a "where am I in the deck" indicator. The `atelier carousel` command is the batch driver for exactly that:

```
atelier carousel <recipe> --inputs <glob> --out-dir <dir>
```

The shape of the workflow is **folder → posts → destination.** Point `--inputs` at a folder of images, hand it a recipe, name a `--out-dir`, and it composes one recipe-overlaid PNG per image. Short forms `-i` / `-d` exist; `--width` / `--height` set the canvas (default 1080×1080), and `-f` / `--frame` pick the frame to render.

```
atelier carousel my-style --inputs ./shots --out-dir ./posts
atelier carousel my-style -i "shots/*.png" -d ./posts --width 1080 --height 1350
```

`--inputs` accepts a directory (every image inside), a single file, or a single-segment `*`-glob in the final path component (`shots/*.png`). Multi-segment and recursive globs are out of scope — point it at a directory instead. Accepted extensions are `.png`, `.jpg`, `.jpeg`, `.webp`. The matched list is sorted lexicographically so ordering is stable and predictable.

## Per-image composition

For each image, `composeCarouselFrameDoc` builds a minimal single-frame document: a canvas-sized doc with a background and one fit-to-canvas `ImageVisual` layer (anchored centered at `{0.5, 0.5}`). The image's natural dimensions aren't known until node-canvas decodes the file, so the bounds start at the canvas extent and are re-fitted (`refitImageBounds`) once the real dimensions are available at render time.

Then the recipe's `overlay_rules` are applied on top of that base doc — the handle (if any) and, crucially, the page-number.

## currentIndex / totalCount threaded into page-number

This is what makes the carousel a carousel. The driver loops over the sorted inputs and, for image `n`, applies the recipe with a **1-based** index:

```
const index = n + 1;       // 1-based
applyRecipeToOverlay(baseDoc, recipe, { currentIndex: index, totalCount: total });
```

`totalCount` is the count of matched images. Because both context values are present, the page-number layer *is* emitted (unlike a single-frame `apply-recipe`), and `renderPageNumberFormat` substitutes them into the format string. A recipe whose `page_number.format` is `"{current:02d}/{total:02d}"` produces `01/05`, `02/05`, … across a five-image deck. This is the one place page-numbers come fully alive — the carousel batch is the natural carrier of the `i/N` context.

## Output names: zero-padded and sortable

Each composed PNG is written to `--out-dir` (created if missing) with a zero-padded, sortable name (`carouselFileName`):

```
03-myphoto.png      # prefix = index, zero-padded to max(2, digits-in-N)
```

The prefix width is `Math.max(2, String(total).length)` — always at least two digits, widening when the deck has 100+ images — so the files sort in deck order in any file browser or upload picker, then carry the original stem and a `.png` extension. The page-number *content* and the filename *prefix* both derive from the same 1-based index, so what the viewer sees and how the files sort stay in agreement.

## Where it sits in the pipeline

The carousel driver renders through the same shared export-image path the rest of the CLI uses, so it inherits node-canvas's font and image handling. It needs node-canvas available; if the optional native renderer is missing, it fails with a clear `CanvasUnavailableError` rather than a cryptic crash.

The carousel is the culmination of the recipe story: one authored style, one folder of raw images, and a complete branded, numbered, swipeable deck out the other end — every overlay placed by the same `overlay_rules` translator and the same layer-tag isolation invariant that protects every other Atelier pipeline.

That closes ATEL-601. You can now author a Studio Recipe, apply it through the CLI and through MCP, attach anchored handle and page-number overlays, and batch a folder of images into a finished carousel.
