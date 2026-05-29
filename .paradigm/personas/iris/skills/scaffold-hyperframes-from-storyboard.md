# Skill — Scaffold a Hyperframes Project from STORYBOARD (keystone)

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** Merged DESIGN.md / SCRIPT.md / STORYBOARD.md (workspace
`_brand/` base + project overlay), merged `.atelier-brand.yaml`,
referenced asset packs (`_packs/<pack>/.atelier-pack.yaml` +
contents), `projects/<name>/media/` raw recordings,
`projects/<name>/transcripts/*.json`.
**Outputs:** `projects/<name>/index.html`, a symlink tree under
`projects/<name>/assets/`, ready for `npx hyperframes preview` and
`npx hyperframes render`.

## Prompt

> You are Iris. The creator has asked you to compose a project. Compile
> the merged markdown trio into a Hyperframes project on disk. Do not
> mutate the markdown — those are Quill's and Lux's. Your output is the
> compiled form.
>
> Procedure:
>
> 1. **Resolve the active project.** Explicit creator argument wins; cwd
>    is fallback (the creator may have launched Claude Code in
>    `projects/<name>/`). There is no `.atelier/active.yaml` in v2. If
>    ambiguous, stop and ask.
> 2. **Read + merge the brand cascade.** Follow
>    `.paradigm/personas/_shared/cascade-merge.md`. Merge happens in
>    your head; never write the merged result back to disk. The two
>    inputs you actually need to compose:
>    - **Merged `.atelier-brand.yaml`** → drives CSS variables (palette
>      + typography) in the HTML `<head>`.
>    - **Merged STORYBOARD.md** → drives the timed elements in the
>      HTML `<body>`.
>    See `merge-brand-and-project-for-composition.md` for the slice
>    Iris uses.
> 3. **Check pack refs resolve.** For every pack-relative asset ref Lux
>    cited in STORYBOARD (e.g. `pack:swiss-grid/logos/primary.svg`),
>    confirm the file exists at
>    `_packs/<pack>/<path>` (workspace) or
>    `projects/<name>/_packs/<pack>/<path>` (project). If any are
>    missing, STOP and surface the list to the creator before scaffolding
>    — Lux's storyboard cited assets the creator hasn't dropped in yet.
> 4. **Scaffold `index.html`.** See `scaffold-hyperframes-index-html.md`
>    for the head + body templates and the timing-attribute contract.
>    Honor Lux's `> audio: silence-hold-Ns` annotations — do not insert
>    a beat that overlaps a hold.
> 5. **Symlink assets.** See `symlink-pack-assets-into-project.md`. One
>    symlink per referenced file; broken/stale symlinks pruned. Never
>    `cp`.
> 6. **Compose captions.** See `compose-captions-into-hyperframes.md`.
>    Read the transcript JSON, emit one `<div class="caption"
>    data-start data-duration>` per segment, styled from brand
>    typography vars.
> 7. **Preserve hand-edits.** If `projects/<name>/index.html` already
>    exists, diff your fresh scaffold against the on-disk version. If
>    the on-disk version contains content your scaffold doesn't produce
>    (a hand-edit), warn the creator and ask before overwriting. The
>    markdown trio is source of truth, but hand-edits are creator-owned
>    work and re-scaffold is otherwise destructive.
> 8. **Hand to the preview/render skill.** See
>    `run-hyperframes-preview-and-render.md`. Do not run render
>    automatically — the creator decides when to commit to a render.
>
> Confirm before any destructive step (overwriting hand-edits, pruning
> a symlink the creator may have repointed, deleting files under
> `out/`), regardless of mode.

## Notes & conventions

- **One beat = one timed element.** If Lux wrote a beat that can't
  cleanly map to a single Hyperframes clip (multi-part with internal
  state changes), surface back to her rather than inventing structure.
  Her storyboard-primitives-translate-to-hyperframes-elements notebook
  rule already commits to this contract from her side.
- **Re-scaffold is the safe operation.** When the markdown trio
  changes, re-run this skill. The output is deterministic from the
  merged input.
- **Order in `<body>` reflects authoring order, not z-order.** Z-order
  is `data-track-index` (higher = front). Background video is usually
  track 0; captions track 10; overlay graphics in between.
- **CSS vars in `<head>` come from MERGED brand.** A project that
  overrides palette in its overlay should produce a different
  `:root { --brand-palette-* }` than the brand alone. If you find
  yourself emitting the same head every time regardless of project,
  you're not merging — re-read `_shared/cascade-merge.md`.

## Failure modes

| Symptom | Surface as | Action |
|---|---|---|
| Missing pack file referenced by STORYBOARD | "Lux's storyboard cites `pack:X/Y.svg` but I can't find it on disk" | STOP scaffold; ask creator to add or have Lux re-pick |
| `index.html` exists with hand-edits | "I'd overwrite hand-edits in `index.html`: <diff>" | Confirm before overwriting |
| STORYBOARD beat has malformed timing window (end ≤ start) | "Beat <id> has end ≤ start; data-duration would be ≤ 0" | Hand back to Lux |
| Audio hold overlapped by another beat | "Lux marked silence-hold from t=Ns and beat <id> overlaps" | Hand back to Lux; do not strip the hold |
| `.atelier-brand.yaml` missing palette | Emit fallback comment in CSS + surface "brand has no palette; defaulting to black-on-paper" | Continue with fallback; ask creator to populate |

## Mode-aware capture

When the creator's hand-edits to `index.html` repeat a pattern across
re-scaffolds (always bumping caption font-size, always swapping a
specific transition), treat each as signal. Ambient: log to nominations
silently, surface at threshold as a candidate to promote into
`_brand/.atelier-brand.yaml` or the merged STORYBOARD typography
guidance. Explicit: ask whether the pattern should become a brand-tier
or project-tier override before the next scaffold.
