# Skill — Merge Brand + Project for Composition

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** `_brand/.atelier-brand.yaml`,
`projects/<name>/.atelier-overlay.yaml`, `_brand/STORYBOARD.md`,
`projects/<name>/STORYBOARD.md`.
**Outputs:** The two in-memory merged slices Iris needs to scaffold:
the merged brand sidecar (drives CSS vars) and the merged STORYBOARD
(drives timed elements).

This skill is Iris's specific application of the cross-cutting
cascade protocol. The full rules live in
`.paradigm/personas/_shared/cascade-merge.md` — read those once;
this skill is the slice Iris actually uses.

## Prompt

> You are Iris. Before you scaffold `index.html`, you need two
> merged inputs. Do not write the merge back to disk — it lives in
> your head, fresh per task.

## Procedure

### 1. Merge `.atelier-brand.yaml` (drives CSS vars)

Read both files:

- **Base:** `_brand/.atelier-brand.yaml`
- **Overlay:** `projects/<name>/.atelier-overlay.yaml` (may be absent;
  that's fine — base alone is a valid effective brand)

Apply YAML merge rules:

- **Scalars** (string, number, boolean) — project overrides base.
- **Lists** — project items APPEND to base items (additive). The
  creator may have explicitly set a brand palette of three colors;
  the project may extend it with a campaign accent.
- **Maps** — recurse per key. Project keys absent in base are added;
  base keys absent in project are kept.

What Iris consumes from the merged result:

- `visual.primary_palette` (list of named color roles) → emit one
  `--brand-palette-<role>: <hex>` per entry.
- `visual.typography.display` and `visual.typography.body` (or
  whatever the brand declares under `typography.families` with
  `usage`) → emit one `--brand-font-<usage>: "<name>"` per entry
  (quoted; font names may contain spaces).
- Anything else (voice, restrictions, techniques) is informational —
  not consumed by Iris's CSS emission directly, but worth knowing
  for the rare case where a STORYBOARD beat references a token by
  semantic role.

### 2. Merge STORYBOARD.md (drives timed elements)

Read both files:

- **Base:** `_brand/STORYBOARD.md` — recurring brand frames
  (intro/outro shells, signature transitions, watermark placement).
- **Overlay:** `projects/<name>/STORYBOARD.md` — this series' shot
  list.

Apply markdown section merge rules:

- A section is a `## Heading` block.
- **Project section with same heading replaces base section** (project
  override).
- **Project section with new heading appends** (project extension).
- **Base sections not mentioned in project remain** (base inheritance).

What Iris consumes:

- Each beat (a heading + its body) becomes one timed element in
  `index.html`. The beat's timing window, asset ref, overlay text,
  transition out, audio annotation are all expressed in the beat's
  body.
- The order of beats in the merged document is the authoring order;
  it does NOT dictate z-order. Z-order is `data-track-index` per
  the beat's role (background video low, captions high).

### 3. Sanity-check the merged result

Before scaffolding:

- **Palette present?** If merged `visual.primary_palette` is empty,
  Iris's emitted `<style>` falls back to "no brand tokens" comment.
  Surface to the creator that brand has no palette — do not silently
  invent.
- **Typography present?** Same fallback rule.
- **Beat coverage?** If the merged STORYBOARD has zero beats, Iris
  cannot scaffold a meaningful body — STOP and surface.
- **Asset refs resolve?** Cross-check pack-relative refs against
  registered packs (workspace + project). See
  `symlink-pack-assets-into-project.md` for resolution rules.

## Notes & conventions

- **Re-merge every task.** Never cache. The creator may have edited
  `_brand/.atelier-brand.yaml` or either STORYBOARD between Iris
  invocations.
- **Never write the merge back to disk.** The two source files stay
  separate so the creator can see what's brand truth vs what's
  this-project. Writing the merge would collapse that distinction.
- **A missing project artifact is not an error.** If
  `projects/<name>/.atelier-overlay.yaml` doesn't exist, the project
  inherits the brand sidecar verbatim — that's a valid pattern.
  Same for `projects/<name>/STORYBOARD.md`: if absent, the project
  is using the brand's storyboard shells without project-specific
  beats.
- **Surface promotion candidates.** If the project's STORYBOARD
  override introduces a frame Iris notices the creator using across
  multiple projects, that's a promotion candidate to `_brand/`. Ask
  before promoting — workspace edits affect every future project.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| `.atelier-brand.yaml` missing entirely | Workspace not initialized | STOP; ask creator to run `atelier brand init` |
| Merged palette empty | Brand never declared one | Emit "no brand tokens" fallback comment; surface |
| Merged STORYBOARD has zero beats | Project not yet storyboarded | STOP; hand back to Lux |
| YAML parse error in either file | Hand-edit broke the syntax | Surface the parse error verbatim with line number |
| Project overlay introduces unknown top-level key | Schema drift (new key not yet in brand) | Pass through if it doesn't break consumers; surface as advisory |

## Mode-aware capture

When a project overlay repeats the same key override across multiple
re-scaffolds, that's a promotion signal. Ambient: log silently,
surface at threshold. Explicit: ask before promoting the override
into `_brand/.atelier-brand.yaml`.
