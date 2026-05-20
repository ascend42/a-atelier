---
id: N-atel-401-presets-and-templates
title: Presets and templates — reusing motion and structure
type: note
track: ATEL-401
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-401
  - presets
  - templates
  - reuse
difficulty: intermediate
estimatedMinutes: 7
prerequisites:
  - N-atel-101-easings
summary: Two reuse mechanisms that are easy to confuse. Presets are bundles of deltas you apply to a layer; templates are layer subtrees you instantiate with variables. One rule keeps them straight.
---

## The one rule

> **Presets = delta bundles. Templates = layer subtrees.**

A preset is *motion* you stamp onto a layer that already exists. A template is *structure* — layers and their content — you instantiate to create new layers. If you keep that distinction, the rest of this note is detail.

## Presets — define once, apply anywhere

Define a named bundle of deltas on the document. Each preset delta describes a property animation **without naming a layer or absolute frames** — those get filled in at apply time.

```ts
atelier_define_preset({
  id,
  presetName: "fade-rise",
  description: "Fade in while rising 20px",
  deltas: [
    { property: "opacity", from: 0,  to: 1, offset: [0, 20], easing: "ease-out" },
    { property: "frame.y", from: 20, to: 0, offset: [0, 20], easing: "ease-out" },
  ],
});
```

The `offset: [start, end]` on a preset delta is a **relative frame window** — measured from wherever you apply the preset, not from the document's frame 0. Then apply it to a concrete layer in a state:

```ts
atelier_apply_preset({
  id,
  stateName: "intro",
  presetName: "fade-rise",
  layerId: "title",
  startFrame: 0,
});
```

Apply expands the preset into real deltas on that layer: each delta's `range` becomes `[startFrame + offset[0], startFrame + offset[1]]`. If a preset delta has no `offset`, it spans `startFrame` to `startFrame + duration` (where `duration` defaults to the state's duration). Expanded deltas go through the same no-overlap check as hand-authored ones — applying a preset that collides with existing motion on the same `layer+property` is rejected.

## Two kinds of stagger

Stagger — the same motion rippling across a row of elements — comes from two different offsets, and it's worth knowing both:

1. **Intra-preset sequencing** — give the deltas *inside* one preset stepped `offset` windows so they fire in sequence from a single apply (e.g. opacity at `[0, 12]`, then a label at `[6, 18]`).
2. **Cross-instance stagger** — apply the *same* preset to several layers with stepped `startFrame` values. This is the classic stagger-cards pattern:

```ts
atelier_apply_preset({ id, stateName: "intro", presetName: "fade-rise", layerId: "card-1", startFrame: 0  });
atelier_apply_preset({ id, stateName: "intro", presetName: "fade-rise", layerId: "card-2", startFrame: 5  });
atelier_apply_preset({ id, stateName: "intro", presetName: "fade-rise", layerId: "card-3", startFrame: 10 });
```

Three identical applies, each five frames later than the last — the cards cascade in. Author the motion once; the stagger lives entirely in the stepped `startFrame`.

## Templates — instantiate a layer subtree

A template is a document that uses `{{variableName}}` placeholders in its layers and content. `atelier_instantiate_template` resolves the placeholders against bindings you provide and **creates a new document** in the store:

```ts
atelier_instantiate_template({
  id: "lower-third-template",
  bindings: { name: "Ada Lovelace", title: "Mathematician" },
});
```

Use `atelier_find_variables` first to see what a template expects — it reports the `{{...}}` references found, which are declared, and which are undeclared or unused. Instantiation fails (with per-variable messages) if a required binding is missing, so you find gaps before you render.

A template gives you the *whole structure* — layers, text, the lock-up — parameterized. That is fundamentally different from a preset, which only carries motion and needs a layer to land on.

## Choosing

| You have… | You want… | Reach for |
|---|---|---|
| A layer that exists | To animate it like other layers | **Preset** (`define` then `apply`) |
| A repeated structure (cards, lower-thirds) | To stamp out copies with different content | **Template** (`instantiate`) |
| A row of elements | The same motion, cascading | **Preset** applied N times with stepped `startFrame` |

Presets and templates compose: instantiate a template to build the structure, then apply presets to the layers it produced. Structure from one mechanism, motion from the other — the rule holds.

That closes ATEL-401. You can now build hierarchical, interactive, physically-tuned motion and package it for reuse.
