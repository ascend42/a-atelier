---
id: N-atel-201-visual-and-effects
title: Visual configuration, effects, assets, and refs
type: note
track: ATEL-201
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-201
  - mcp
  - visual
  - assets
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-201-authoring-tools
summary: The visual configuration toolset — shape, fill, stroke, shadow, blend mode, clip path, motion path, tint. Plus assets, variables, presets, templates, interactions, refs, audio, and the overlay namespace.
---

## Visual configuration tools

These tools mutate a layer's `visual` or layer-level effect properties:

```
atelier_set_shape       — change a ShapeVisual's shape (rect → ellipse → path)
atelier_set_fill        — set/clear fill color, gradient, or pattern
atelier_set_stroke      — set/clear stroke color, width, dash pattern
atelier_set_shadow      — drop shadow / glow on the layer
atelier_set_blend_mode  — Canvas composite operation (multiply, screen, etc.)
atelier_set_clip_path   — restrict rendering to inside a shape
atelier_set_motion_path — animate position along a path with optional auto-rotate
atelier_set_tint        — color overlay strength 0-1
```

Each is a single mutation. The tools exist (instead of bundling into `atelier_edit_visual`) because their argument shapes are stable — fill takes a color/gradient/pattern union, stroke takes width + color + dash, shadow takes offset + blur + color. Type narrowing in your IDE makes them friendly to call.

**Fill, stroke, and shadow are animatable.** A delta on `fill.color` or `shadow.blur` interpolates the value frame-by-frame. The visual-config tools set the *current* (static) value; deltas animate it.

## Assets

```
atelier_add_asset    — register an image / video / audio asset (assetId + src)
atelier_list_assets  — enumerate registered assets
atelier_remove_asset — remove (rejects if referenced by a layer)
```

Assets are referenced by `assetId` from `ImageVisual.assetId`, `VideoVisual.assetId`, and the audio block. Registering an asset doesn't load it — the renderer fetches lazily. Use relative paths (relative to the doc) or absolute file:// URLs; the studio's `/api/assets/:base64path` endpoint serves them with path-traversal protection.

## Variables

```
atelier_add_variable    — declare a named variable with a default value
atelier_list_variables  — enumerate variables
atelier_remove_variable — remove a variable (rejects if referenced)
atelier_find_variables  — find layers/deltas using ${name} substitution
```

Variables enable templates and parametric documents. A `${title}` in a text layer's `content` is substituted at resolve time. The recipe system (ATEL-601) uses variables to inject `{current}`/`{total}` for page-number overlays.

## Presets and templates

```
atelier_define_preset    — bundle a set of deltas as a named preset
atelier_list_presets     — enumerate presets
atelier_apply_preset     — apply a preset's deltas to one or more layers
atelier_instantiate_template — instantiate a named layer subtree with variable substitution
```

**Preset** = "I want this fade-in pattern on every title." Define it once with `atelier_define_preset`, apply it to N layers with `atelier_apply_preset` — each application substitutes the layer id and produces deltas.

**Template** = "I want this layout (logo + handle + page-number) in every carousel page." Define a template subtree with variable holes; `atelier_instantiate_template({ template, variables: { handle: "@me", page: "01/05" }})` produces a fresh subtree with those values.

The studio recipe system (ATEL-601) is partially built on templates — applying a recipe instantiates a default template per layer type if no user-authored layer occupies that slot.

## Interactions

```
atelier_add_interaction     — bind an event (hover, click) to an action (state transition)
atelier_list_interactions   — enumerate interactions on the document
atelier_remove_interaction  — remove an interaction
```

Interactions live on layers and trigger state transitions. `hover` on the title layer transitions the document into the `hover` state with the transition easing defined by `atelier_configure_transition`. The renderer's interactive runtime (used by the studio, by SVG embeds, and by `@atelier/react`) consumes these.

For pure video output: skip interactions. They're for interactive embeds.

## Refs (sub-documents)

```
atelier_set_ref      — point a RefVisual layer at another .atelier file
atelier_resolve_refs — preview the rendered ref tree (for nested refs)
```

A `RefVisual` layer renders another `.atelier` document inside itself. Use for: reusable lower-thirds across multiple compositions, lock-up logos that need a single source of truth, carousels where every page references a shared layout template.

Refs are resolved at render time. The studio re-renders the ref when the source file changes (file watcher), so editing the referenced doc updates every composition that uses it.

## Audio

```
atelier_set_audio — attach an audio track to the document with sync metadata
```

For video projects with sound. The `atelier transcribe` pipeline (ATEL-501) writes the transcript and the audio sync metadata that drives caption layer alignment.

## Overlays (Phase 1.5)

```
atelier_add_handle      — create a @handle text overlay layer (tag: overlay)
atelier_add_page_number — render {current}/{total} into a text overlay layer
```

These are convenience tools matching the recipe `overlay_rules` schema. Layers carry `tags: ["overlay"]` so they participate in the layer-tag isolation invariant — re-applying an overlay recipe drops only overlay-tagged layers and replaces them; user-authored layers and other pipelines' outputs are untouched.

## Export

```
atelier_export        — top-level export (auto-detects format from --out extension)
atelier_export_svg    — SVG string of one frame
atelier_export_lottie — Lottie JSON of the full document
```

Export tools call into `@atelier/canvas`, `@atelier/svg`, `@atelier/lottie`, or `@atelier/video` depending on format. Single-frame PNG, multi-frame MP4/WebM/GIF, vector SVG, and motion-design Lottie all land here.
