---
id: N-atel-501-transcribe-and-captions
title: Transcription, transcript editing, and captions
type: note
track: ATEL-501
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-501
  - video
  - captions
difficulty: intermediate
estimatedMinutes: 7
prerequisites:
  - N-atel-101-layers
summary: '`atelier transcribe` (Whisper), the `atelier transcript` edit family (fix/add/delete/merge/split/list), and `atelier captions regenerate` — how spoken audio becomes word-level caption layers you can correct by hand.'
---

## Transcribe

```
atelier transcribe ./my-video-project
```

This runs Whisper over the source clip, writes `transcript.json`, and rewrites the `caption` tagged `TextVisual` layers in `project.atelier`. The pipeline:

1. Probe a Whisper backend.
2. Run Whisper → raw transcript JSON.
3. Parse into the `VideoTranscript` shape (segments → words).
4. Merge with the existing transcript to preserve your edits (unless `--reset`).
5. Write `transcript.json`.
6. Unless `--no-captions`: rebuild the caption layers.

### Backend probe order

The probe checks, in order:

1. **`whisper-cpp`** — if `whisper-cli` is on your PATH (`brew install whisper-cpp`).
2. **`openai-api`** — if `OPENAI_API_KEY` is set. Reserved for an opt-in path; it currently throws "not yet implemented." Install whisper.cpp for local transcription.
3. **`none`** — nothing available; the command throws with install guidance.

| Flag | Default | Meaning |
|---|---|---|
| `--model <name>` | `base.en` | `tiny`/`base`/`small`/`medium`/`large-v3` (and `.en` variants) |
| `--language <code>` | autodetect | BCP-47 hint; omit to autodetect |
| `--reset` | off | Discard existing edits; full fresh transcript |
| `--no-captions` | off | Write `transcript.json` only; skip caption layers |

whisper.cpp is run with `--word-thold 0.01` so it emits word-level timestamps. When only segment-level boundaries come back, word timing is synthesized by an even split across the segment — captions still get per-word timing to animate against.

## The transcript edit family

Whisper mishears. `atelier transcript` is the family of subcommands that correct it without re-running the model. Words are addressed by a **global index** across all segments — start with `list`:

```
atelier transcript list ./proj          # every word, its index, start time, and flags
```

| Subcommand | What it does |
|---|---|
| `fix` | Correct text — `--replace 'wrong=right'` (batch) or `--word <idx> --text '...'` (single) |
| `add` | Insert a user-added word — `--after-word <idx> --text '...'` (`--duration` default `0.15s`) |
| `delete` | Hide a word — `--word <idx>` (kept in transcript, dropped from captions) |
| `merge` | Join words `i` and `i+1` — `--word <i>` |
| `split` | Split one word at a fraction — `--word <idx> --at <0–1>` |

```
atelier transcript fix ./proj --replace 'atelyer=atelier' --replace 'lottie=Lottie'
atelier transcript fix ./proj --word 42 --text 'parametric'
atelier transcript delete ./proj --word 7
```

Two behaviors worth burning in:

- **`delete` doesn't delete.** It sets `hidden` on the word. The word stays in `transcript.json` (so a re-transcribe can re-recognize it) but is skipped when captions are built. This is a soft, reversible cut.
- **`split --at` must be strictly between 0 and 1.** Exactly `0` or `1` is rejected — there's nothing to split off. Timing prorates across the split point; text defaults to slicing at the character midpoint, overridable with `--first` / `--second`.

Every edit subcommand regenerates the caption layers after writing the transcript, unless you pass `--no-regenerate`.

## Captions: phrases and word-level timing

Captions aren't one layer per word — words are grouped into **phrases**, one `caption` tagged layer each. A new phrase starts whenever any of these is true:

- the phrase reaches the max-words ceiling (default 5),
- the current word ends in `. ! ? , ; :`, or
- the gap to the next word exceeds the pause threshold (default `0.4s`).

Hidden words are skipped during grouping. Each phrase layer is a `TextVisual` placed in the lower third (`yRatio` default `0.85`) with `opacity: 0`, and gets a fade-in / fade-out delta pair keyed to its start and end times.

## Regenerate without re-running Whisper

```
atelier captions regenerate ./proj
```

When you only change *styling* — font, size, position, phrase grouping — there's no reason to transcribe again. `captions regenerate` re-derives the caption layers from the current `transcript.json`. Its only flag is `--recipe <name>`, which applies a Studio Recipe's `caption_style` + `caption_grouping`. Whisper stays untouched; your transcript edits stay intact.
