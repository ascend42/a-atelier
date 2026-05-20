---
id: N-atel-501-layer-tag-isolation
title: Layer-tag isolation — pipelines that never step on each other
type: note
track: ATEL-501
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-501
  - video
  - aspects
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-101-layers
summary: The `~layer-tag-isolation` aspect — each content pipeline owns a tag namespace and on re-run drops ONLY its own tagged layers, never touching another pipeline's output or user-authored layers. Proven by tests.
---

## One document, many writers

A `project.atelier` is written by several actors at once: `atelier trim` owns the cut layers, `atelier transcribe` owns the caption layers, recipes own the overlay layers — and *you* hand-author whatever else the scene needs. They all live in the same `layers` array. Re-running any one of them must not disturb the others.

`~layer-tag-isolation` is the rule that makes that work:

> Every content pipeline owns a layer tag-namespace and, on re-run, drops ONLY its own tagged layers before re-adding them — never touching user-authored (untagged) layers or other pipelines' outputs.

This is the load-bearing invariant of the whole human-and-agent loop. Without it, every regenerate would be a gamble; with it, you can re-run a pipeline a hundred times and lose nothing you didn't ask it to touch.

## The namespaces

| Tag | Owner | Status |
|---|---|---|
| `silence-trim` | `atelier trim` | Actively written |
| `caption` | `atelier transcribe` / `atelier captions regenerate` | Actively written |
| `caption-word` | reserved for per-word caption layers | Reserved in the isolation contract |
| `overlay` | Studio Recipes (handle, page-number, decoration) | Written by the recipe pipeline |

`silence-trim` and `caption` are what the commands in this track produce. `caption-word` is a reserved slot in the isolation contract — the namespace is claimed so that a future per-word caption mode can't collide with phrase-level `caption` layers. `overlay` belongs to the recipe pipeline (ATEL-301 covers it). Anything **untagged** is yours, and no pipeline ever touches it.

## How a rewrite stays isolated

The mechanism is one line of intent: **filter by tag before rewriting.** When the caption builder rewrites, it partitions the document:

```ts
// keep everything that ISN'T a caption layer
const preserved = doc.layers.filter((l) => !(l.tags ?? []).includes("caption"));
// build fresh caption layers from the current transcript
const { layers: captionLayers } = buildCaptionLayers(transcript, doc.canvas, options);
return { ...doc, layers: [...preserved, ...captionLayers] };
```

`silence-trim` layers, `overlay` layers, and your untagged layers all fall into `preserved` and pass through unchanged. Only the `caption` set is dropped and rebuilt. `atelier trim` does the identical thing for its `silence-trim` tag. Two pipelines, two namespaces, zero overlap.

The same care extends to deltas: when captions are rebuilt, only the deltas keyed to the caption layers being replaced are dropped — every other delta in the state survives.

## Proven by tests, not just by convention

Layer-tag isolation isn't an honor system. The test suite asserts the invariant directly: it seeds a document with a user-authored layer plus one pipeline's tagged layers, re-runs the *other* pipeline, and checks that the user layer and the sibling pipeline's layers are byte-for-byte present afterward. A regression that let `transcribe` clobber a `silence-trim` layer — or a hand-authored title — would turn the suite red.

That's the contract you get to lean on: tag a layer with a pipeline's namespace and that pipeline owns it; leave a layer untagged and it's untouchable. Regenerate as often as you like. The machine only ever cleans up after itself.
