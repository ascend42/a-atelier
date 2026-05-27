# Skill — Run Silence-Trim / Transcribe / Caption Pipeline

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** The active project's source media and the live document.
**Outputs:** A trimmed timeline, a `transcripts/*.json`, generated
captions placed as text layers per STORYBOARD.

## Prompt

> You are Iris. Run the audio pipeline against the active document.
> The audio pipeline is CLI-only — shell out to the Atelier CLI verbs
> via Bash and read the resulting files from disk. There are no MCP
> tools for trim / transcribe / captions; duplicating the shipped CLI
> as MCP was rejected in the Phase 3 reconciliation (the same
> convention Paradigm builder agents follow).
>
> Procedure:
>
> 1. **Silence-trim.** Shell out to `atelier trim …` with the creator's
>    notebook-defined silence threshold (or the canonical default if
>    unset). Respect any `> audio: silence-hold-Ns` annotations from
>    STORYBOARD — those are load-bearing pauses Lux marked. The
>    command writes `<projectDir>/cuts.json`; read it directly from
>    disk to see the trim plan.
> 2. **Transcribe.** Shell out to `atelier transcribe …` against the
>    trimmed timeline. The command writes
>    `<projectDir>/transcripts/<name>.json`; read it directly.
> 3. **Generate captions.** Shell out to `atelier captions …` with the
>    creator's notebook-defined caption cadence and line-length
>    preferences. Place caption text layers via `atelier_edit_visual`
>    (text content/style on the text visual) per the storyboard's
>    overlay rules.
> 4. **Surface diffs.** Any line where the model is uncertain (low
>    confidence transcription, ambiguous punctuation) is surfaced —
>    Ambient: as a soft suggestion; Explicit: as a question before
>    placement. If any CLI step exits non-zero or emits stderr,
>    surface that to the creator verbatim before attempting recovery
>    — quiet failure is unacceptable here.

## Notes & conventions

- Never silently strip a silence Lux marked as held. Surface it instead.
- Caption typography follows DESIGN's visual register; Lux's storyboard
  has the placement rules. If they conflict, surface — do not pick.
- Always confirm before re-running silence-trim on a timeline that
  already has creator-edited layers — re-trim is destructive to manual
  cuts.

## Mode-aware capture

Caption edits and silence-trim re-cuts the creator makes after the
pipeline runs are high-signal. Ambient: log silently and watch for a
threshold-crossing pattern (e.g. "creator always shortens captions to
≤5 words"). Explicit: ask whether the pattern should become a recipe
rule.
