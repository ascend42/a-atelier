# Skill — Decompose SCRIPT into STORYBOARD

**Owner:** #lux-cinematographer
**Kind:** canonical
**Inputs:** merged DESIGN (`_brand/DESIGN.md` + project overlay),
merged SCRIPT (`_brand/SCRIPT.md` + project overlay), merged
`.atelier-brand.yaml`, mental index of all registered asset packs
(produced by `walk-asset-packs.md`).
**Outputs:** `projects/<active>/STORYBOARD.md` (project tier) or
`_brand/STORYBOARD.md` (workspace tier, when defining recurring
primitives).

## Prompt

> You are Lux. Read the merged DESIGN for register, palette, treatment,
> and constraints. Read the merged SCRIPT for beats and `[viz: ...]`
> cues. Walk every registered asset pack (run
> `walk-asset-packs.md`) so you know what's actually on disk before
> you commit to a shot. Produce STORYBOARD.md as a shot-by-shot (or
> frame-by-frame for short-form) plan.
>
> For each beat, specify:
>
> 1. **Timing window** — start and end seconds, matching the script
>    beat.
> 2. **Composition** — what fills the frame, where the focal point
>    sits, foreground/background roles. One focal point per frame.
> 3. **Asset reference** — choose ONE form per slot:
>    - **Pack-relative path** when you've already walked the pack and
>      chosen the file, e.g. `pack:swiss-grid/logos/primary` or
>      `pack:swiss-grid/grids/12-col-1080.svg`. Cite the sidecar's
>      `when` / `when_not` if it matched the beat context.
>    - **Category descriptor** when you want Iris to pick at scaffold
>      time, e.g. `category: logo, treatment: dark-bg` or
>      `category: b-roll, tags: [tech, hands]`. Iris will walk the same
>      sidecars and resolve.
>    Never embed bytes. Never write absolute filesystem paths.
> 4. **Typography staging** — where overlay text from
>    `[overlay: ...]` markers will land, motion in/out, hold duration.
> 5. **Transition out** — the named transition into the next beat
>    (`hard cut`, `match cut`, `crossfade-200ms`), or `hard cut` if
>    intentional.
>
> Annotations for Iris's handoff:
>
> - `> blocked: <reason>` — if a beat cannot stage as written, surface
>   back to Quill for a rewrite. Do not bend composition around bad
>   copy.
> - `> audio: silence-hold-Ns` — when silence is load-bearing, so the
>   render pipeline preserves it.
> - `> proposed-slot: <name>` — when no existing pack category fits and
>   you want to flag the gap (also see
>   `pack-discovery-as-coaching` notebook entry).

## Procedure

1. Resolve the active project (see system prompt + cascade-merge).
2. Read and merge DESIGN, SCRIPT, STORYBOARD, and brand sidecars in
   your head — see `merge-brand-and-project-storyboards.md` for the
   storyboard-specific cascade.
3. Run `walk-asset-packs.md` to build a fresh pack index. Don't cache
   between sessions — the creator may have added files.
4. For each script beat, choose a pack-relative path (if you have
   strong confidence) or a category descriptor (if you'd rather Iris
   resolve at scaffold). Use `resolve-asset-from-pack.md` per slot.
5. Write to the right tier:
   - **Workspace** (`_brand/STORYBOARD.md`) → only when defining
     reusable primitives (intro shell, outro shell, watermark frame,
     signature transition).
   - **Project** (`projects/<active>/STORYBOARD.md`) → the shot list
     for this specific piece, which extends the brand storyboard.
6. Re-check: every beat has timing, composition, asset reference,
   typography (if overlay), transition. Every beat fits the
   one-element-per-beat shape Iris needs (see notebook:
   `storyboard-primitives-translate-to-hyperframes-elements`).

## Notes & conventions

- Read the creator's notebook before composing. Palette commitments,
  typography choices, and overlay-placement habits override my defaults.
- Pack-relative paths use the form `pack:<pack-name>/<category>/<file>`
  (matching the sidecar's category keys). Category descriptors use the
  form `category: <name>, <key>: <value>`.
- Cue Iris explicitly where audio/silence is load-bearing.
- If a needed pack category does not exist anywhere on disk, that's
  signal — surface it (`pack-discovery-as-coaching`); don't fabricate.

## Failure modes

- **Beat won't fit one-element shape** → split the beat, don't smuggle
  composition complexity into a single storyboard line. Iris cannot
  scaffold what doesn't map.
- **No pack satisfies a slot** → annotate `> proposed-slot:` and
  surface to the creator. Never silently invent a binding.
- **Storyboard contradicts merged brand** → check the cascade.
  Workspace primitives might be overriding what you'd default to. If
  the project genuinely needs to break a brand primitive, ASK before
  promoting that decision anywhere.

## Mode-aware capture

When the creator nudges composition between sessions, treat each nudge
as signal. Ambient: log to nominations silently, surface only at
threshold. Explicit: ask before persisting a new visual rule.
