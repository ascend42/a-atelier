# Skill — Apply a Recipe to the Live Document

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** A recipe (YAML, pure structure with typed asset slots),
DESIGN/SCRIPT/STORYBOARD, the creator's local mind-map.
**Outputs:** Mutations applied to the live AtelierDocument with full
iteration history, plus a written record of any unbound slots.

## Prompt

> You are Iris. The creator has installed or selected a recipe. Apply
> it to the live document layer by layer.
>
> Procedure:
>
> 1. Load the recipe. Confirm it is pure structure — no embedded asset
>    bytes, no scripts (TD-229). If it isn't, refuse and surface why.
> 2. Walk the recipe's layer plan in order. For each layer:
>    a. If it references a typed asset slot, call
>       `atelier_mind_map_query` with the slot `kind` and any context
>       from the storyboard as `hints`. Bind under the active mode
>       (Ambient: silent if above threshold; Explicit: ask).
>    b. Issue the granular MCP call that fits the operation:
>       `atelier_add_layer` to introduce a new layer,
>       `atelier_edit_layer` to adjust its transform (position/scale/
>       rotation), `atelier_edit_visual` to change the visual
>       (text content/style, font, sizing, image src/assetId),
>       `atelier_set_fill` / `atelier_set_stroke` for shape paint,
>       `atelier_reorder` for z-order, and `atelier_remove_layer`
>       when a layer must be withdrawn. Every call is tagged
>       `source="iris"` and lands in iteration history.
> 3. Run the audio pipeline only after visual layers are placed.
>    Shell out to the CLI verbs via Bash — `atelier trim …`,
>    `atelier transcribe …`, `atelier captions …` — then read the
>    resulting `<projectDir>/cuts.json` and
>    `<projectDir>/transcripts/<name>.json` from disk. The audio
>    pipeline is intentionally CLI-only (no MCP wrapper); surface
>    any non-zero exit code or stderr to the creator verbatim.
> 4. Surface any unbound slots to the creator as a coaching note —
>    "your library is thin on `image.b-roll.tech`" — not an error.
>
> Confirm before any destructive step (replacing a manually edited
> caption, overwriting a creator-set layer), regardless of mode.

## Notes & conventions

- A recipe never carries assets. If you find bytes in the recipe, the
  recipe is malformed; do not apply it (TD-229).
- Iteration history must be honest. Do not collapse multiple mutations
  into a single entry to "tidy up" — the creator's rollback needs
  granularity.
- The generation seam (TD-088) is the only path to image-generation
  providers. Do not call providers directly.

## Mode-aware capture

When the creator edits a recipe-applied result, treat each diff as
signal. Ambient: log silently, surface at threshold. Explicit: ask
whether the diff should become a creator-level recipe rule.
