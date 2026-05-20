---
id: N-atel-501-silence-trim
title: Silence trimming with parametric cuts
type: note
track: ATEL-501
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-501
  - video
  - trim
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-layers
summary: How `atelier trim` turns ffmpeg silencedetect output into parametric video cuts — the immutable-boundary + tunable-padding model, the `--tighten`/`--loosen`/`--cut` overrides, and the `cuts.json` artifact.
---

## What `atelier trim` does

```
atelier trim ./my-video-project
```

A VideoProject is a folder: a source clip, a `project.atelier` composition, and the pipeline artifacts (`cuts.json`, `transcript.json`). `atelier trim` reads the source, finds the silence, and rewrites the `silence-trim` tagged layers in `project.atelier` so the timeline plays only the parts where someone is talking.

It does this in a fixed pipeline:

1. Probe that ffmpeg has the `silencedetect` filter.
2. `ffprobe` the source duration.
3. Run `silencedetect` → silence intervals.
4. Invert silence into the gaps between it — the **speech intervals**.
5. Build a fresh `CutEntry[]` with default (or recipe) padding.
6. Merge with the existing `cuts.json` to preserve user padding (unless `--reset`).
7. Apply `--tighten` / `--loosen` / `--cut` overrides.
8. Resolve overlaps at silence midpoints.
9. Clamp boundaries to `[0, duration]`.
10. Write `cuts.json` and rewrite the `silence-trim` layers.

## The detect step

`silencedetect` is a threshold detector: anything quieter than `--noise` for at least `--min-silence` seconds is silence.

| Flag | Default | Meaning |
|---|---|---|
| `--noise <dB>` | `-30dB` | Below this level counts as silence |
| `--min-silence <seconds>` | `0.35` | Shortest gap that registers as silence |

Atelier never stores the silence directly — it inverts it. Leading silence (before the first detected gap) and trailing silence (after the last) are handled so the very start and end of a clip aren't accidentally cut.

## Immutable boundary, tunable padding

This is the core idea of the cut model. A `CutEntry` is four numbers:

```json
{ "rawStart": 4.21, "rawEnd": 9.83, "paddingPre": 0.08, "paddingPost": 0.12 }
```

- **`rawStart` / `rawEnd`** are the *detected* speech boundaries. They are the machine's findings and you don't edit them by hand.
- **`paddingPre` / `paddingPost`** are *yours*. They widen (or tighten) the cut around the raw boundary so a clip doesn't snap shut on the first or last syllable.

The effective cut is `[rawStart - paddingPre, rawEnd + paddingPost]`. Defaults are deliberately asymmetric — `paddingPre` is `0.08s`, `paddingPost` is `0.12s` — because a hair more room after a phrase reads more natural than room before it.

Why separate the two? Because re-running detection regenerates `rawStart`/`rawEnd` from the audio, but your padding is an editorial decision that should survive. That separation is the `~detected-vs-user-edited` aspect, and note 3 covers exactly how the padding gets re-attached after a re-detect.

## The three padding overrides

You tune padding without ever touching a raw boundary:

| Flag | Effect |
|---|---|
| `--tighten <ms>` | Reduce padding on **every** cut by N milliseconds |
| `--loosen <ms>` | Increase padding on **every** cut by N milliseconds |
| `--cut <index>` | Scope `--pad-pre` / `--pad-post` to **one** cut |

`--tighten` and `--loosen` are in **milliseconds** — they're converted to seconds (`ms / 1000`) and added to current padding, which is why they compose with whatever per-cut overrides already exist instead of clobbering them. Padding floors at zero; you can't tighten a cut into a negative span.

```
atelier trim ./proj --loosen 120          # everything breathes a bit more
atelier trim ./proj --cut 3 --pad-post 0.4  # cut #3 lingers; the rest unchanged
```

`--pad-pre` / `--pad-post` without `--cut` set the *default* padding applied to freshly-detected cuts.

## Overlap and clamp

After overrides, two adjacent cuts can have padding that overruns the silence between them. `resolveOverlaps` splits the gap at its **midpoint** — neither cut wins, each takes its half. Then `clampBoundaries` pulls the first cut's `paddingPre` and the last cut's `paddingPost` back inside `[0, duration]` so nothing reaches past the clip.

## `cuts.json` is the source of truth

```
atelier trim ./proj --dry-run   # print computed cuts, write nothing
atelier trim ./proj --json      # emit the result as JSON for piping
```

`cuts.json` (version `1.1`) is the durable artifact. The `silence-trim` layers in `project.atelier` are *derived* from it — a re-run drops and rebuilds them. Edit padding through the CLI, not by hand-editing the layers, and your intent persists across every re-detect.
