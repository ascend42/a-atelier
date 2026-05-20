---
id: N-atel-601-overlay-rules
title: Overlay rules — anchored handle and page-number presets
type: note
track: ATEL-601
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-601
  - overlays
  - recipe
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-301-composition-and-overlays
summary: overlay_rules (Phase 1.5) declares two anchored text presets — handle and page_number. Page-number formats support {current}/{total} and zero-padded {current:02d}/{total:02d}. Anchors map to four corners via frame + anchorPoint. Overlays live in the overlay tag namespace and the translator builds a brand-new document (~copy-on-write-doc).
---

## The overlay_rules block

`overlay_rules` was promoted from the reserved Phase 3 set into first-class **Phase 1.5**. It declares anchored text overlays that mark a composition. There are two sub-blocks, both optional:

```yaml
overlay_rules:
  handle:
    text: "@username"
    anchor: "bottom-left"
    margin: 32
    style:
      font_family: "Inter"
      font_size: 36
      font_weight: "bold"
      color: "#FFFFFF"
  page_number:
    format: "{current:02d}/{total:02d}"
    anchor: "bottom-right"
    margin: 32
    style:
      font_family: "Inter"
      font_size: 18
      font_weight: "normal"
      color: "#9CA3AF"
```

The translator that turns these rules into layers is `applyRecipeToOverlay` (in `packages/cli/src/lib/recipe.ts`). It builds at most one `handle` layer and one `page_number` layer, both `TextVisual`.

## handle — a static marker

A `handle` is a literal text overlay: a social handle, a credit, a watermark. Its `OverlayHandleRule` shape is `{ text, anchor, margin?, style? }`. The `text` is rendered verbatim — template variables are reserved for later, so today `text` is exactly the string that appears.

The built layer always gets the stable id **`overlay-handle`** and `tags: ["overlay"]`. The handle is *unconditional*: if `overlay_rules.handle` is present, the handle layer is always produced, on single frames and carousel pages alike.

## page_number — a parameterized template

A `page_number` is a template, not a literal. Its `OverlayPageNumberRule` shape is `{ format, anchor, margin?, style? }`, and `format` is a string with placeholders:

```
"{current}/{total}"           -> "3/5"
"{current:02d}/{total:02d}"   -> "03/05"
"Page {current} of {total}"   -> "Page 3 of 5"
```

Two placeholder forms are recognized: bare `{current}` / `{total}`, and the zero-padded `{current:0Nd}` / `{total:0Nd}` form (the `N` is the pad width, so `{current:02d}` pads to two digits). The schema (`^valid-recipe` gate) enforces the syntax at validate time and requires **at least one** of `{current}` / `{total}` to appear — a format with neither is rejected. Render-time substitution happens in `renderPageNumberFormat`, which is a regex replace over those two placeholder shapes.

The built layer gets the stable id **`overlay-page-number`** and `tags: ["overlay"]`.

**Page-number needs carousel context.** `applyRecipeToOverlay` only emits the page-number layer when both `currentIndex` and `totalCount` are passed in its context argument. On a single-frame apply (no carousel), the context is absent, so the layer is skipped with a one-shot warning — `01/01` on a standalone post is misleading, so skipping is by design. The handle is unaffected. The carousel driver (next note) is what threads `currentIndex`/`totalCount` in.

## The four-corner anchor math

`anchor` is one of `top-left | top-right | bottom-left | bottom-right` (the `OverlayAnchor` type). The translator's `anchorToFrame` maps each corner to a `frame` position plus an `anchorPoint`, with `margin` (default 24px) insetting from the anchored edges:

| `anchor` | `frame` | `anchorPoint` |
|---|---|---|
| `top-left` | `{ x: margin, y: margin }` | `{ x: 0, y: 0 }` |
| `top-right` | `{ x: canvas.width - margin, y: margin }` | `{ x: 1, y: 0 }` |
| `bottom-left` | `{ x: margin, y: canvas.height - margin }` | `{ x: 0, y: 1 }` |
| `bottom-right` | `{ x: canvas.width - margin, y: canvas.height - margin }` | `{ x: 1, y: 1 }` |

The pairing of `frame` and `anchorPoint` is what makes the corner stick. A `bottom-right` overlay anchors its own bottom-right corner (`anchorPoint {1, 1}`) at the canvas's bottom-right-minus-margin point — so the text grows inward, away from the edge, regardless of how long it is. The anchor also doubles as the rotation/scale pivot if you later animate the overlay.

The `style` block is a partial `OverlayTextStyle` (`font_family`, `font_size`, `font_weight`, `color`) and merges over a runtime baseline of `Inter / 24px / 600 / #F5F5F7` — so an overlay with no `style` still renders legibly.

## The overlay tag namespace and ~copy-on-write-doc

Two invariants govern how overlays touch a document.

**Layer-tag isolation (`~layer-tag-isolation`).** Every overlay layer carries `tags: ["overlay"]`. Before appending the freshly-derived overlays, `applyRecipeToOverlay` filters out *every* existing `overlay`-tagged layer: `doc.layers.filter((l) => !(l.tags ?? []).includes("overlay"))`. Re-applying a recipe drops the prior overlay set and re-adds — idempotent, repeatable. User-authored (untagged) layers, caption-pipeline layers (`tags: ["caption"]`), and silence-trim layers are never touched. The stable ids (`overlay-handle`, `overlay-page-number`) mean a re-apply replaces in place rather than stacking duplicates.

**Copy-on-write (`~copy-on-write-doc`).** The translator never mutates the input. It constructs a *new* document — spreads the doc, swaps in a new layers array — and returns it: `return { ...doc, layers: [...preserved, ...overlayLayers] }`. The input document is left untouched. This guarantees a concurrent reader (notably the studio's live WebSocket bridge) can never observe a half-mutated document mid-update.

## One translator, two homes

`applyRecipeToOverlay` exists in two places: the canonical version in `packages/cli/src/lib/recipe.ts` and a deliberate duplicate in `packages/mcp/src/tools/recipes.ts`. The MCP package does *not* depend on the CLI package — importing it would risk a cli↔mcp dependency cycle — so the overlay translator (and `renderPageNumberFormat`) are re-implemented on top of the shared schema package. The duplication is intentional and documented in the MCP file; both implementations honor the same two invariants above.
