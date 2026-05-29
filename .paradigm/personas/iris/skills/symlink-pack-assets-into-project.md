# Skill — Symlink Pack Assets into the Project

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** STORYBOARD.md (carrying pack-relative asset refs Lux
already resolved), workspace `_packs/` + project `_packs/` folder
contents, `projects/<name>/media/` raw recordings.
**Outputs:** `projects/<name>/assets/` containing one symlink per
referenced file, each pointing into its canonical pack or media
location.

## Prompt

> You are Iris. Lux's STORYBOARD cites asset files by pack-relative
> path. Hyperframes serves `projects/<name>/` as its web root, so
> every referenced file must be reachable at `assets/<filename>`. You
> achieve that with symlinks — never copies.

## Procedure

1. **Collect every asset reference from the merged STORYBOARD.** Lux
   cites them as either:
   - **Pack-relative path** — `pack:swiss-grid/logos/primary.svg` →
     resolves to `_packs/swiss-grid/logos/primary.svg` (workspace) or
     `projects/<name>/_packs/swiss-grid/logos/primary.svg` (project;
     project wins on collision).
   - **Project media path** — `media/IMG_7346.MOV` → resolves to
     `projects/<name>/media/IMG_7346.MOV`.
   - **Category descriptor** — `category: logo, treatment: dark-bg` →
     walk the matching `.atelier-pack.yaml` to pick a file. If
     ambiguous, surface the candidates and ask the creator.
2. **Resolve each reference to an absolute source path.** Confirm the
   file exists. If a referenced file is missing, STOP and surface the
   list to the creator before scaffolding — do not invent a fallback.
3. **Compute the destination filename.** Default: the basename of the
   source. On collision between two refs with the same basename
   (e.g. two packs each shipping `logo.svg`), namespace with the pack
   slug (`swiss-grid-logo.svg`) and update the corresponding
   `index.html` element's `src` attribute.
4. **Prune stale symlinks.** Before creating new ones, list the current
   contents of `projects/<name>/assets/`. Any entry that:
   - Is a symlink AND whose target no longer exists → remove it.
   - Is a symlink AND is not referenced by the current STORYBOARD →
     remove it (and surface a one-line note so the creator knows).
   - Is a regular file (not a symlink) → STOP and ask. The creator
     may have manually placed it; don't delete their work.
5. **Create the symlinks.**
   ```sh
   ln -s "<absolute-source-path>" "projects/<name>/assets/<destname>"
   ```
   On `EEXIST` (a prior run left a symlink), `unlink` first then re-`ln -s`.
   On cross-filesystem error (rare on macOS/Linux dev boxes; possible
   on some network drives), surface the error — do NOT silently
   fall back to `cp`. Copies fork the pack folder and break the
   single-source invariant.

## Notes & conventions

- **Pack folder is the truth.** When the creator updates a pack file
  in place (re-exports a logo, swaps a hero image), the symlink
  picks up the new bytes automatically. That's the entire point —
  copies would freeze the asset at scaffold time.
- **Symlinks are absolute.** Relative symlinks would break when the
  workspace or project is moved; absolute symlinks survive moves of
  the project dir as long as the pack stays put. (Trade-off accepted:
  Atelier is a single-laptop tool; portability across machines is
  handled by the creator's source-control or sync setup.)
- **Iris does not register or scan packs.** That's Lux's job (she
  walks `.atelier-pack.yaml` sidecars). Iris consumes the pack-relative
  paths Lux already cited; if a referenced pack isn't registered in
  `workspace.atelier`, that's a Lux-side gap, not an Iris-side
  recovery.
- **Project `media/` is symlinked too, not referenced directly.**
  Even though `projects/<name>/media/IMG_7346.MOV` is already inside
  the project, Hyperframes' web root is `projects/<name>/`, so the
  resolved web path would be `media/IMG_7346.MOV` — which works. But
  for consistency (and so a future move of media into a project pack
  doesn't require re-emitting `index.html`), symlink it under
  `assets/` and reference `assets/IMG_7346.MOV` in the HTML.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Missing source file | Lux's STORYBOARD cites a file the creator hasn't dropped in | STOP scaffold; surface the missing list |
| Filename collision across packs | Two packs ship the same basename | Namespace with pack slug; update `index.html` src |
| Symlink unsupported (FS error) | Cross-filesystem, restricted environment | Surface verbatim; do NOT `cp` silently |
| Non-symlink file in `assets/` at prune time | Creator manually placed it | STOP; ask before removing |
| Broken symlink after pack file rename | Pack was reorganized without updating STORYBOARD | Surface to Lux for re-pick; do not auto-repair |

## Mode-aware capture

If the creator repeatedly drops the same kind of file into project
`media/` and the symlink layer always promotes it the same way
(always namespaced, always renamed), that's a candidate convention.
Ambient: log silently. Explicit: ask whether the convention should
land in the creator's notebook.
