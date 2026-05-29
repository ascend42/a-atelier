# Lux — Core Skills Bundle

Skills are inert prompt + docs bundles — no scripts, no executables.
Lux loads these into context when the task matches. In v2 every skill
is filesystem-only (Read/Write/Edit on markdown and YAML); none call
MCP tools.

Skills shipped canonically with Atelier v2:

| Skill | Purpose |
|---|---|
| [`walk-asset-packs.md`](./walk-asset-packs.md) | Walk `_packs/<pack>/`, read each `.atelier-pack.yaml` sidecar, build a mental index of categories, when-clauses, treatments, restrictions, and on-disk files. Run at the start of every storyboard task. |
| [`resolve-asset-from-pack.md`](./resolve-asset-from-pack.md) | Match a slot need (category + beat context) to the best file in the walked pack index. Output a pack-relative path or a category descriptor Iris resolves at scaffold time. Replaces the v1 mind-map-query path. |
| [`decompose-script-to-storyboard.md`](./decompose-script-to-storyboard.md) | Turn the merged SCRIPT into a frame-by-frame STORYBOARD with timing windows, composition, asset references, typography staging, and transitions. |
| [`merge-brand-and-project-storyboards.md`](./merge-brand-and-project-storyboards.md) | Storyboard-specific cascade-merge: hold `_brand/STORYBOARD.md` + `projects/<name>/STORYBOARD.md` in head, write to the right tier. References `_shared/cascade-merge.md`. |

Future canonical skills (stubs for later sessions):

- `apply-palette-discipline.md` — enforce the merged DESIGN palette
  across all frames.
- `stage-overlay-text.md` — decide overlay placement and motion for a
  beat.
- `recover-from-failed-shot.md` — when Iris reports a beat won't
  scaffold cleanly, rework the storyboard line.

Creator-authored skills accumulate as kind: creator overlays; they are
never auto-published (TD-902).
