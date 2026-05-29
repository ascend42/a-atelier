# Brand cascade — the shared protocol all three personas use

> **All three Atelier personas (Quill, Lux, Iris) read this. Don't duplicate the rules in your own notebook — link here.**
>
> Last updated: 2026-05-28 (v2.0 pivot). Authority: `docs/v2-hyperframes-migration.md`.

## The hierarchy

```
<workspace-root>/                   ← workspace = brand parent
├── workspace.atelier               ← config + registered pack pointers
├── _brand/                         ← BRAND truth — inherited by every project
│   ├── DESIGN.md                   ← brand palette, typography, treatment
│   ├── SCRIPT.md                   ← voice exemplars, brand do/don't
│   ├── STORYBOARD.md               ← visual patterns the brand favors
│   └── .atelier-brand.yaml         ← structured agent-readable overlay
├── _packs/                         ← workspace-level asset packs
│   └── <pack-name>/.atelier-pack.yaml
├── projects/                       ← each = one output series
│   └── <project-name>/             ← inherits workspace; adds/overrides
│       ├── DESIGN.md               ← project overrides (only what differs)
│       ├── SCRIPT.md               ← this series' actual script
│       ├── STORYBOARD.md           ← this series' shot list
│       ├── media/                  ← raw recordings (project-scoped)
│       ├── transcripts/            ← auto-generated
│       ├── _packs/                 ← optional project-only packs
│       └── (Iris emits: index.html, assets/, out/)
└── .paradigm/                      ← persistent agent learning
```

**You are reading from `<workspace-root>/projects/<active-project>/` when working in v2.** The active project is determined by:
1. Explicit argument from the creator ("work on the spring-launch project") → use that
2. Otherwise: cwd (if the creator launched Claude Code in `projects/<name>/`, that's it)
3. Otherwise: workspace-only mode (you're authoring `_brand/` itself)

There is no `.atelier/active.yaml` in v2. That file is a v1 artifact. Stop looking for it.

## The merge rules

When you need the "effective brand for project X", merge `_brand/<artifact>` (base) with `projects/X/<artifact>` (overlay) using these rules. The merge happens in your head — there is no engine.

### Markdown sections (DESIGN.md, SCRIPT.md, STORYBOARD.md)

A section is a `## Heading` block in the markdown.

- **Project section with the same heading replaces** the base section. (Project override.)
- **Project section with a new heading appends** to the merged document. (Project extension.)
- **Base sections not mentioned in project remain** in the merged document. (Base inheritance.)

Example:
```md
# _brand/SCRIPT.md
## Voice
Clinical-editorial. Confident-not-cocky.
## Do
- Lead with the metric.
- End on the actionable beat.
```
```md
# projects/spring-launch/SCRIPT.md
## Voice
Clinical-editorial with a hint of playfulness for this campaign.
## Constraints
- Must reference the demo URL in the CTA.
```
**Merged in your head:**
```md
## Voice                    ← project override
Clinical-editorial with a hint of playfulness for this campaign.
## Do                        ← base inherited
- Lead with the metric.
- End on the actionable beat.
## Constraints               ← project extension
- Must reference the demo URL in the CTA.
```

### YAML overlays (.atelier-brand.yaml, .atelier-pack.yaml)

YAML lets us be more precise about merge:

- **Scalars (strings, numbers, booleans)** → project value overrides base value
- **Lists / arrays** → project items APPEND to base items (additive; project does not replace)
- **Maps / objects** → recurse per key (the merge applies to each key independently; project keys absent in base are added; base keys absent in project are kept)

Example:
```yaml
# _brand/.atelier-brand.yaml
voice:
  register: clinical-editorial
  exemplars:
    - "We measured this."
  do:
    - lead with the metric
visual:
  primary_palette: [paper, ink, accent]
```
```yaml
# projects/spring-launch/.atelier-overlay.yaml
voice:
  exemplars:
    - "Three months of founder velocity."
  do:
    - punch the verb
techniques_blacklist:
  - kinetic-typography-heavy
```
**Merged in your head:**
```yaml
voice:
  register: clinical-editorial          # base inherited (scalar, no project override)
  exemplars:                             # list extended
    - "We measured this."
    - "Three months of founder velocity."
  do:                                    # list extended
    - lead with the metric
    - punch the verb
visual:                                  # base inherited (no project override)
  primary_palette: [paper, ink, accent]
techniques_blacklist:                    # project addition
  - kinetic-typography-heavy
```

### Asset packs

The same rules apply across the pack tier:

- **Workspace `_packs/` is visible to every project.**
- **Project `_packs/` is additive** — visible only to that project, on top of workspace packs.
- **Pack name collisions** between workspace and project: project wins (override).

## When to write where

This is the discipline that keeps the cascade healthy:

| Signal | Write to |
|---|---|
| Said it once for one episode | Project (`projects/<name>/*`) |
| Said it twice across episodes | Workspace (`_brand/*`) — surface as promotion candidate |
| New brand decision the creator wants on every future output | Workspace |
| Project-specific creative beat (a one-time campaign concept) | Project |
| Sample voice exemplar that defines the brand | Workspace SCRIPT.md |
| Sample voice exemplar that's specific to this campaign | Project SCRIPT.md |
| Hard rule ("never use exclamation marks") | Workspace `.atelier-brand.yaml.voice.dont` |
| Soft preference for this episode | Project DESIGN/SCRIPT/STORYBOARD prose |

If you're unsure, ASK THE CREATOR before promoting from project → workspace. Workspace edits affect every future project.

## Reading order

Whenever you need to know "what's true for this project right now":

1. Read `<workspace-root>/_brand/<artifact>.md` (or `.yaml`)
2. Read `<workspace-root>/projects/<active>/<artifact>.md` (or `.yaml`)
3. Merge per the rules above
4. Act on the merged result

You do not cache. Re-read on every task. The creator may have edited between your sessions.

## Common mistakes

- **Don't write the merged result back to disk.** The merge lives only in your head. The two source files stay separate so the creator can see what's brand vs what's this-project.
- **Don't treat a missing project artifact as an error.** A project with no DESIGN.md just uses the workspace DESIGN.md verbatim — that's a valid pattern (creator wants brand defaults).
- **Don't add to workspace silently.** If you discover something during a project that feels brand-level, write it in the project AND surface to the creator: "I noticed this feels brand-level — want me to promote to `_brand/`?"
- **Don't read `.atelier/active.yaml`.** It doesn't exist in v2. Use cwd or explicit project argument.
- **Don't use MCP tools to mutate documents.** You write markdown via Read/Write/Edit. The MCP layer-mutation tools are v1 — gone in v2.

## Cross-references

- `docs/v2-hyperframes-migration.md` — v2 architecture overview
- `docs/asset-packs.md` (forthcoming) — full pack schema
- `docs/brand-cascade.md` (forthcoming) — creator-facing version of this doc
- TD-2026-05-28-097 — v2 pivot decision
