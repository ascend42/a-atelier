---
id: N-atel-601-studio-recipe
title: The Studio Recipe — style as a reusable preset
type: note
track: ATEL-601
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-601
  - recipe
  - presets
difficulty: intermediate
estimatedMinutes: 5
prerequisites:
  - N-atel-301-composition-and-overlays
summary: A Studio Recipe is a reusable bundle of style defaults — silence policy, caption style, phrase grouping — authored once and applied to many projects. Phase 1 ships three implemented sections; partial recipes fall back to code defaults; six Phase 3 fields parse as opaque values for forward-compat.
---

## The value play

A Studio Recipe is *your style, saved as a preset.* You spend an afternoon dialing in how your shorts look — how aggressively silence gets trimmed, what font and size the captions render at, how words group into phrases — and then you never tune it by hand again. You write those decisions into one YAML file and apply it to the next project, and the one after that.

That's the whole pitch: **a recipe makes a look reproducible.** The same defaults, every project, until you decide to change them in one place.

The type lives in `packages/types/src/recipe.ts` as `StudioRecipe`. The top of the file is metadata:

```yaml
version: "1.0"          # recipe format version — current is "1.0"
name: "my-shorts-style"
description: "Punchy captions, tight silence trim"
author: "@me"
tags: [shorts, vertical]
```

## The three Phase 1 sections

Phase 1 implements three sections, each consumed by a different pipeline:

```yaml
silence_policy:           # consumed by `atelier trim`
  noise: "-30dB"
  min_silence: 0.35
  default_padding_pre: 0.08
  default_padding_post: 0.12
  match_tolerance: 0.5

caption_style:            # consumed by `atelier transcribe` / `captions regenerate`
  font_family: "Inter"
  font_size: 84
  font_weight: "bold"     # normal | bold | numeric 100..900
  text_align: "center"    # left | center | right
  color: "#FFFFFF"
  y_ratio: 0.85           # 0=top, 1=bottom
  width_ratio: 0.9
  fade_seconds: 0.05

caption_grouping:         # consumed by `atelier transcribe` phrase grouping
  max_words: 5
  pause_gap: 0.4
```

**`silence_policy`** is the silence-trim baseline. Every field maps one-to-one onto an `atelier trim` option — `noise` is the `silencedetect` threshold, `min_silence` is the minimum gap that registers as a cut, the two `default_padding_*` values are the leading/trailing pad on new cuts, and `match_tolerance` is the timing window that preserves your hand-tuned padding when you re-run the trim (the detected-vs-user-edited invariant from ATEL-501).

**`caption_style`** is the caption layer's visual presentation — font, color, vertical position as a ratio of canvas height, width as a ratio of canvas width, fade duration. The recipe is the canonical source for caption styling; the CLI doesn't expose per-invocation caption-style flags.

**`caption_grouping`** controls how transcribed words clump into on-screen phrases: at most `max_words` per phrase, with a forced break whenever the gap between words exceeds `pause_gap` seconds.

## Partial recipes fall back to code defaults

Every section — and every field within a section — is optional. A recipe that only sets caption color is completely valid:

```yaml
version: "1.0"
name: "just-the-color"
caption_style:
  color: "#FFD60A"
```

Omitted fields fall back to the code defaults baked into `renderRecipeWithDefaults` (in `packages/cli/src/lib/recipe.ts`). Those defaults are the same values the scaffold writes: `noise: -30dB`, `min_silence: 0.35`, caption `font_size: 84`, `max_words: 5`, and so on. The merge is shallow-per-section: your recipe's section overlays the defaults section, so setting one caption field doesn't wipe out the rest.

To see the effective values — your recipe overlaid on the defaults — run `atelier recipe show <name> --with-defaults`. It prints the fully-resolved recipe so there's no guessing about what an omitted field will become.

## Reserved Phase 3 fields parse as opaque values

Five fields are declared in the type but not yet implemented:

```
caption_highlight    # per-word highlight color animation
transition_kit       # transition defaults between clips
palette              # brand colors / font set
audio_policy         # ducking, music lane
aspect_targets       # multi-aspect render targets
```

These are **reserved for Phase 3** (extraction-of-style-from-a-reference-video). They parse cleanly as opaque values — the schema accepts them as `unknown` — so a recipe that includes them today stays forward-compatible. Phase 1 simply ignores their contents.

The one caveat: `atelier recipe validate` emits a forward-compat *warning* (not an error) when a reserved field is present, so you're never caught off-guard that a section you authored isn't doing anything yet. (`overlay_rules`, covered in the next note, was promoted out of this reserved set into first-class Phase 1.5 — it does *not* warn.)

## Why a flat preset and not a template engine

A recipe is deliberately *data, not behavior.* It carries no logic, no conditionals, no per-layer targeting — just a flat bag of style values that three pipelines read. That keeps recipes diffable, shareable, and safe to validate before they ever touch a document. The richer machinery (templates, presets, variables from ATEL-201) is what the pipelines use internally; the recipe is the human-facing dial.
