# {{WORKSPACE_NAME}} — Atelier v2 workspace

This is an **Atelier v2 workspace**. Three opinionated agent personas handle
creative direction, asset orchestration, and Hyperframes rendering.

## The shape

```
{{WORKSPACE_NAME}}/
├── workspace.atelier          ← workspace config + external pack pointers
├── _brand/                    ← brand truth — inherited by every project
│   ├── DESIGN.md              ← brand palette, typography, treatment
│   ├── SCRIPT.md              ← voice exemplars, brand do/don't
│   ├── STORYBOARD.md          ← visual patterns the brand favors
│   └── .atelier-brand.yaml    ← structured overlay (palette, fonts, etc)
├── _packs/                    ← workspace asset packs (folders + sidecars)
│   └── <pack>/.atelier-pack.yaml
├── projects/                  ← output series (one per video or related batch)
│   └── <name>/
│       ├── DESIGN.md          ← project-tier overrides
│       ├── SCRIPT.md          ← this video's script
│       ├── STORYBOARD.md      ← this video's shot list
│       ├── media/             ← raw recordings (project-scoped)
│       ├── transcripts/       ← whisper output
│       └── (Iris emits: index.html, assets/, out/)
└── .paradigm/                 ← persistent agent learning across sessions
```

## The agents

Start a Claude Code session in this folder and invoke any of:

- **`@atelier-quill`** — Showrunner. Authors brand voice + scripts at workspace
  AND project tier. Reads transcripts. Filesystem-only.
- **`@atelier-lux`** — Cinematographer. Authors storyboards. Walks `_packs/`
  for asset selection. Cites pack-relative paths or category descriptors.
- **`@atelier-iris`** — Composer. Reads merged brand + project artifacts,
  writes Hyperframes `index.html`, symlinks pack assets, runs `npx hyperframes
  preview` / `render` via Bash.

All three READ the workspace `_brand/` + active project artifacts and **merge
them in head** per the cascade rules at
`.paradigm/personas/_shared/cascade-merge.md`.

## First-time setup — "get me set up"

When the creator asks to **get set up** (or "run the setup checklist", "check my
environment", "am I ready to render"), work through **`SETUP.md`** in this
workspace top to bottom: run each Check, judge it against Pass, walk the creator
through any Fix, then re-run the Check. Finish with the ✓/✗/– Report at the
bottom of `SETUP.md` and the single recommended next action. Do not skip steps
silently; surface failing command output verbatim. This is the first thing a new
creator should do.

## Typical session

```
@atelier-quill draft a 15s teaser script for spring-launch
@atelier-lux storyboard it
# drop a recording into projects/spring-launch/media/
# (auto-transcribed)
@atelier-iris compose the teaser variant
@atelier-iris preview     # opens Hyperframes dev server
@atelier-iris render      # writes projects/spring-launch/out/teaser-15s.mp4
```

## Cascade — workspace brand → project overrides

When agents work in a project, they read:
1. `_brand/<artifact>` as the base
2. `projects/<active>/<artifact>` as the overlay
3. Merge in head: strings override, lists extend, map bindings override-at-key

Full rules: `.paradigm/personas/_shared/cascade-merge.md`.

## What's NOT in v2

- No `.atelier` YAML doc format (gone — replaced by Hyperframes HTML)
- No browser editor (`atelier studio` — gone — use Hyperframes preview)
- No custom canvas/SVG/Lottie renderers (gone — Hyperframes renders)
- No MCP layer-mutation tools (gone — agents use filesystem)
- No `.atelier/active.yaml` (gone — cwd or explicit project arg)

## What's next

- Edit `_brand/DESIGN.md`, `_brand/SCRIPT.md`, `_brand/STORYBOARD.md` to
  capture your brand identity (replace the TODO placeholders)
- Edit `_brand/.atelier-brand.yaml` to capture structured fields (palette,
  typography, technique whitelist)
- Register at least one asset pack (drop a folder into `_packs/` with a
  `.atelier-pack.yaml` sidecar, or `atelier pack register <external-dir>`
  when that command ships)
- Create your first project via `@atelier-quill` in a Claude Code session
