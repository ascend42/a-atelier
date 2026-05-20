---
id: N-atel-501-detected-vs-user-edited
title: Detected vs. user-edited — why your fixes survive a re-run
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
estimatedMinutes: 6
prerequisites:
  - N-atel-101-layers
summary: The `~detected-vs-user-edited` aspect — detections are immutable, but your overrides (padding, userEdited/userAdded/hidden, corrected text) are re-attached across re-runs by matching on timing tolerance plus unchanged detected text.
---

## The problem this aspect solves

The video pipeline is meant to be re-run. You re-transcribe after swapping the audio; you re-detect after a re-cut. But every re-run regenerates the machine's findings from scratch. If a re-run wiped your corrections, you'd never trust it — you'd transcribe once, then refuse to touch it.

`~detected-vs-user-edited` is the invariant that makes re-running safe:

> AI-detected content is immutable. User overrides are preserved across re-runs by matching fresh detections to existing entries on timing tolerance **plus** unchanged detected text.

Detected and edited values live in *separate fields* so the two never collide. A transcript word carries both:

```json
{ "detected": "atelyer", "text": "atelier", "start": 3.40, "end": 3.72, "userEdited": true }
```

`detected` is what Whisper heard — the machine's column. `text` is what renders — yours. The same split exists on a cut: `rawStart`/`rawEnd` are detected, `paddingPre`/`paddingPost` are yours.

## How a re-run re-attaches your edits

When you re-run, the merge walks the **fresh** detections and asks, for each one: did the user override a matching old entry? "Matching" means two conditions, both required:

1. the timing is within a tolerance, **and**
2. the `detected` string is unchanged.

| Pipeline | Tolerance | Second condition |
|---|---|---|
| Transcript (`mergeTranscriptWithExisting`) | `0.3s` | `detected` string identical |
| Cuts (`mergeWithExisting`) | `0.5s` | both `rawStart` and `rawEnd` within tolerance |

If both hold, the old override (`text`, `userEdited`, `hidden`, or the cut's padding and label) is copied onto the fresh detection. If they don't, the fresh default wins — because the underlying audio genuinely changed there, and your old correction may no longer make sense.

Requiring **unchanged detected text** is the subtle part. Timing alone isn't enough: if Whisper now hears a different word at that timestamp, blindly carrying your old correction forward would graft a fix onto the wrong word. Matching the `detected` string guarantees you're editing the same finding you edited before.

## userAdded words are orphans — and they're kept

A word you inserted with `atelier transcript add` has no fresh detection to match — Whisper never heard it. These `userAdded` words are preserved as orphans and re-inserted into the right segment by their timing. Your additions don't evaporate just because they aren't in the new Whisper output.

`hidden` words (from `atelier transcript delete`) follow the same rule as edits: matched on timing + unchanged `detected`, then the `hidden` flag rides along.

## Concrete: fix a misheard word, re-transcribe, fix survives

```
# Whisper hears "atelyer" at word 12
atelier transcript fix ./proj --word 12 --text 'atelier'
#   → word 12 now { detected: "atelyer", text: "atelier", userEdited: true }

# later — re-transcribe (swapped a louder take of the same audio)
atelier transcribe ./proj
#   → fresh detection at ~3.40s still hears "atelyer"
#   → matches on 0.3s timing + unchanged detected "atelyer"
#   → your text:"atelier" + userEdited:true are re-attached

atelier transcript list ./proj
#   [  12]    3.40s  "atelier" ← "atelyer" [edited]
```

The same shape holds for cuts: nudge `--cut 3 --pad-post 0.4`, re-run `atelier trim`, and as long as cut #3's raw boundaries land within `0.5s` of where they were, your `0.4s` of trailing padding rides through. Re-detect freely; the human's editorial layer is sticky by construction.
