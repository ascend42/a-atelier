# Asset Packs

Asset packs are **folders + sidecars**. Each subdirectory here is a pack.
Anywhere else on disk works too — register external folders via:

```sh
atelier pack register ~/Dropbox/Shared/CompanyBrand
```

(`atelier pack register` ships in a later release. For now, register by
editing `workspace.atelier`'s `packs.external` list.)

## Pack structure

```
_packs/<pack-name>/
├── .atelier-pack.yaml         # required — sidecar describes what/when/how
├── logos/                     # category folders (yours to name)
├── photos/
├── transitions/
└── ...
```

## Sidecar shape

See `.paradigm/personas/lux/skills/walk-asset-packs.md` for the canonical
schema. Quick reference:

```yaml
name: swiss-grid
owner: you
vibe: editorial, clinical, generous whitespace
categories:
  logos:
    when: full-screen reveals, watermarks
    when_not: inline with body copy
    treatment: monochrome on photos; full color on solid paper
restrictions:
  - never combine logos/ with grids/ in same frame
```

## Who reads packs

- **Lux** (Cinematographer) walks `_packs/*/` to resolve asset slots when
  storyboarding. Cites pack-relative paths or category descriptors in
  STORYBOARD.md.
- **Iris** (Composer) symlinks the cited pack assets into
  `projects/<name>/assets/` at scaffold time.

## What NOT to put here

- Bytes you want to share publicly — packs are local-first (`TD-2026-05-26-271`)
- Generated outputs — those live in `projects/<name>/out/`
- Per-project raw recordings — those live in `projects/<name>/media/`
