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

**First session?** Just ask the team to get you set up:

```
get me set up
```

They'll work through `SETUP.md` — checking every prerequisite (Node, Hyperframes,
ffmpeg, optional transcription + learning loop), running each verification, and
walking you through any fixes until you're render-ready.

Once you're set up, in chat:

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

You don't have to install these by hand — ask the team **"get me set up"** and
they'll verify each one. For reference:

- **[Claude Code](https://claude.com/claude-code)** — to talk to the agents (you're using it).
- **[Node.js 22+](https://nodejs.org)** — runs everything.
- **[Hyperframes](https://hyperframes.mintlify.app/quickstart)** — the render engine.
  Iris drives it via `npx hyperframes preview` / `render`. **No separate install:**
  `npx` auto-fetches the published `hyperframes` package on first run. You just need
  Node + a network connection the first time.
- **[ffmpeg](https://ffmpeg.org)** + **headless Chrome** — render dependencies
  (ffmpeg for the `.mp4` mux + audio, Chrome to capture frames). Run
  `npx hyperframes doctor` to check both at once; `brew install ffmpeg` and
  `npx hyperframes browser install` are the usual fixes. The "get me set up" flow
  does this for you.
- *Optional* — **[whisper.cpp](https://github.com/ggerganov/whisper.cpp)** for
  transcription (`brew install whisper-cpp`); the team surfaces install steps if missing.
- *Optional* — the **Paradigm plugin** + Atelier personas in `~/.paradigm/`, which
  enable the cross-session learning loop (agents remember across sessions). The
  agents work without it; it just makes them get smarter over time.

## v2 architecture pointer

This workspace is the front-of-pipeline. The renderer is Hyperframes; Iris
drives it via `npx hyperframes preview` / `render`. Atelier owns the brand,
the asset packs, the agent personas + their notebooks, and the workspace
conventions. Nothing renders inside Atelier itself.

Full architecture: `docs/v2-hyperframes-migration.md` in the Atelier repo.
