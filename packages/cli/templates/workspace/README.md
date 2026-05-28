# {{WORKSPACE_NAME}}

An [Atelier v2](https://github.com/ascend42/a-atelier) workspace.
Brand intelligence + asset orchestration for agent-driven content production
on top of [HeyGen Hyperframes](https://github.com/heygen-com/hyperframes).

Scaffolded `{{ISO_DATE}}` by `atelier workspace`.

## Get started

```sh
cd {{WORKSPACE_NAME}}
claude          # launch a Claude Code session
```

Then in chat:

```
@atelier-quill draft a 15s teaser script for my-first-project
@atelier-lux storyboard it
@atelier-iris compose + render
```

See `CLAUDE.md` for the full session shape.

## What goes where

| Folder | What |
|---|---|
| `_brand/` | Brand truth — DESIGN/SCRIPT/STORYBOARD + `.atelier-brand.yaml`. Inherited by every project. |
| `_packs/` | Asset packs (folders + `.atelier-pack.yaml` sidecars). Visible to every project. |
| `projects/<name>/` | One output series — DESIGN/SCRIPT/STORYBOARD overrides + media + Hyperframes scaffold |
| `.claude/agents/` | Three persona shims — Quill (Showrunner), Lux (Cinematographer), Iris (Composer) |
| `.paradigm/` | Persistent agent learning across sessions |

## Prerequisites

- [Claude Code](https://claude.com/claude-code) (to talk to the agents)
- [Node.js 22+](https://nodejs.org) (for `npx hyperframes`)
- Optional: [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for
  transcription (Lux / Iris will surface install instructions if missing)

## v2 architecture pointer

This workspace is the front-of-pipeline. The renderer is Hyperframes; Iris
drives it via `npx hyperframes preview` / `render`. Atelier owns the brand,
the asset packs, the agent personas + their notebooks, and the workspace
conventions. Nothing renders inside Atelier itself.

Full architecture: `docs/v2-hyperframes-migration.md` in the Atelier repo.
