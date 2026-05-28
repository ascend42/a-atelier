# Projects

Each subdirectory here is one **output series** — typically one video or a
small batch of related variants (teaser-15s / trailer-30s / full-spot-60s
sharing the same beat).

## Project structure

```
projects/<name>/
├── DESIGN.md                  # project overrides to workspace _brand/DESIGN.md
├── SCRIPT.md                  # this project's actual script
├── STORYBOARD.md              # this project's shot list
├── .atelier-overlay.yaml      # optional — structured overrides to brand .yaml
├── media/                     # raw recordings for this project
├── transcripts/               # auto-generated from media/
├── _packs/                    # optional — project-only packs (rare)
└── (Iris emits these as needed)
    ├── index.html             # Hyperframes composition
    ├── assets/                # symlinks into media/ + _packs/
    └── out/                   # final renders
```

## Creating a project

Ask Quill in a Claude Code session:

> @atelier-quill draft a 15s teaser for `<project-name>`

Quill will scaffold `projects/<name>/` with starter DESIGN.md / SCRIPT.md /
STORYBOARD.md that inherit the workspace `_brand/` voice + visual register
via the cascade rules.

## Cascade rules (TL;DR)

When agents work in `projects/<name>/`, the **effective brand** they read is
`_brand/<file>` (workspace) overlaid with `projects/<name>/<file>`:

- **Strings** → project overrides workspace
- **Lists** → project extends workspace (additive)
- **Map bindings** → project overrides at the key, leaves siblings intact

Full rules: `.paradigm/personas/_shared/cascade-merge.md`.

## What NOT to put here

- Brand-level rules (those go in `_brand/` — agents will prompt promotion when
  they see something repeat across projects)
- Pack bytes (those go in `_packs/<pack-name>/` or external pack folders)
