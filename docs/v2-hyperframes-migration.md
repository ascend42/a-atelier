# Atelier v2.0 — Brand Intelligence + Creative Direction Layer

> **Status:** Active — `feat/v2-hyperframes-pivot` branch
> **Decision:** [TD-2026-05-28-097](../.paradigm/) — companion lore `L-2026-05-28-ascend-184856-364`
> **Sharpened scope:** owner clarification 2026-05-28 — Atelier v2 is the brand+asset+voice layer for agent-driven content production, with Hyperframes as the renderer

## What Atelier IS in v2

> **Atelier is the brand intelligence + creative direction + asset library + voice knowledge layer for agent-driven content production. It feeds Hyperframes. It is not a renderer.**

The four pillars Atelier owns:

| Pillar | Owns |
|---|---|
| **Design direction** | The persistent editorial contract — voice, palette, typography, tone, visual style. The "what does this brand stand for + how does it look + how does it sound" knowledge that survives across every piece of content. Lives in DESIGN.md / SCRIPT.md / STORYBOARD.md plus the agent personas Quill (Showrunner) + Lux (Cinematographer) that author + maintain them. |
| **Asset handling** | Ingest, transcribe, tag, organize. Media flows into a project's `media/` + gets sidecar metadata + transcripts + ref-rewrites on rename. The `atelier media` / `atelier transcribe` / media-notes / mind-map / ref-cycle surfaces. |
| **Asset packs** | **(NEW first-class)** Folders on disk + Atelier-maintained knowledge overlay. NOT a packaged format. The folder is the truth; Atelier owns the layer that tells agents what's in the pack + when to use what + how to use it. Single-creator-multi-project scope for v2.0. |
| **Brand voice knowledge** | DESIGN.md / SCRIPT.md / STORYBOARD.md as on-disk source of truth + a `.atelier-brand.yaml` overlay that captures the what/when/how that agents query. Same folder-as-truth pattern as packs. Paradigm lore captures the durable agent learning across sessions. |

Everything else is delegated:

- **Composition format** → Hyperframes' HTML/CSS
- **Timeline / playback** → Hyperframes' built-in
- **Rendering** → `@hyperframes/producer`
- **Frame-level editing UI** → Hyperframes' Studio
- **Output formats** → Hyperframes (MP4 / WebM-alpha / ProRes / PNG-sequence)

## The workspace = brand, project = series hierarchy

A creator's setup:

```
~/my-brand-workspace/                ← WORKSPACE (brand parent)
├── workspace.atelier                ← config + registered pack pointers
├── _brand/                          ← BRAND knowledge inherited by all projects
│   ├── DESIGN.md                    ← brand palette, typography, treatment
│   ├── SCRIPT.md                    ← voice exemplars, brand do/don't, tone
│   ├── STORYBOARD.md                ← visual patterns the brand favors
│   └── .atelier-brand.yaml          ← agent-readable what/when/how overlay
├── _packs/                          ← workspace-level asset packs
│   ├── core-logos/
│   │   ├── primary.svg
│   │   ├── monochrome.svg
│   │   └── .atelier-pack.yaml
│   ├── product-shoot-2026/
│   │   ├── hero/
│   │   ├── lifestyle/
│   │   └── .atelier-pack.yaml
│   └── transitions/
├── projects/                        ← each = one output series
│   ├── spring-launch/               ← PROJECT (inherits + overrides workspace brand)
│   │   ├── DESIGN.md                ← project overrides ("hint of playfulness")
│   │   ├── SCRIPT.md                ← this series' actual script
│   │   ├── STORYBOARD.md            ← this series' shot list
│   │   ├── media/                   ← raw recordings for this project
│   │   ├── transcripts/             ← auto-generated
│   │   ├── _packs/                  ← optional project-only packs
│   │   └── hyperframes/             ← scaffolded outputs (one per variant)
│   │       ├── teaser-15s/
│   │       ├── trailer-30s/
│   │       └── full-spot-60s/
│   └── customer-stories/
│       └── ...
└── .paradigm/                       ← persistent agent learning + lore
```

External packs (any folder anywhere on disk — Dropbox, iCloud, local) register via:

```sh
atelier pack register ~/Dropbox/Shared/CompanyBrand
```

This writes a pointer into `workspace.atelier` and indexes the folder. No copy; the original location stays canonical.

## Cascade rules — workspace brand → project brand

When agents work on `projects/spring-launch/`, the **effective brand** they read is:

| Layer | Source | Role |
|---|---|---|
| Base | `_brand/*` (workspace) | Source of truth — the brand identity |
| Overlay | `projects/spring-launch/*.md` (project) | Additive/override for THIS output series |
| Result | merged in-memory | What Quill/Lux/Iris plan against |

Merge semantics:

- **String fields** (voice descriptor, tone, register) → project overrides workspace
- **List fields** (palette swatches, voice exemplars, brand do/don't, technique whitelist) → project extends workspace (additive)
- **Map bindings** (when/how to use what) → project overrides at the key, leaves sibling keys intact

Asset packs follow the same cascade: workspace-registered packs are visible to every project; projects can register additional packs they uniquely need.

## The `.atelier-pack.yaml` sidecar (sketched)

A pack is a folder. The sidecar tells Atelier (and through Atelier, the agents) what's in it and how to use it:

```yaml
name: swiss-grid
owner: ascend
vibe: editorial, clinical, generous whitespace, primary palette restraint

# Categorization of what's in the folder. Atelier walks the folder to find
# the actual files; this block describes the categories + their intent.
categories:
  logos:
    when: full-screen reveals, watermarks (subtle bottom-right)
    when_not: inline with body copy, on busy backgrounds without scrim
    treatment: monochrome only on photographic backgrounds; full color on solid paper
  grids:
    when: 2-up or 3-up comparison shots, before/after, multi-product hero
    when_not: single-subject focus, motion-heavy shots
    primary_file: 12-col-1080.svg
  transitions:
    when: scene change between distinct beats; never within a beat
    duration_s: 0.4

# Cross-cutting rules that apply to combinations within this pack.
restrictions:
  - never combine logos/ with grids/ in the same frame
  - never apply tint() to product photos in this pack
```

## The `.atelier-brand.yaml` sidecar (sketched)

A brand has DESIGN/SCRIPT/STORYBOARD as on-disk markdown. The sidecar overlay captures structured knowledge agents query directly:

```yaml
name: my-company
voice:
  register: clinical-editorial
  tone: confident-not-cocky
  exemplars:
    - "We measured this. Three months of founder velocity."
    - "Same engine. Different scale."
  do:
    - lead with the metric, not the brag
    - end on the actionable beat, not the inspirational one
  dont:
    - exclamation marks
    - hype adjectives ("amazing", "incredible", "game-changing")
visual:
  primary_palette: [paper, ink, accent]
  typography:
    display: DM Sans
    body: Inter
  treatment:
    photos: high-key, generous negative space
    motion: gentle ease-out, never bounce
techniques_whitelist:
  - swiss-grid
  - fade-under-vo
  - ken-burns-restrained
techniques_blacklist:
  - glitch
  - kinetic-typography-heavy
```

## The creator workflow this enables

```sh
cd ~/my-brand-workspace
claude       # Claude Code session in the workspace folder
```

Then in chat:

- **"@quill draft a 15s teaser script for spring-launch"** → reads workspace `_brand/SCRIPT.md` + writes `projects/spring-launch/SCRIPT.md` inheriting the brand voice
- **"@lux storyboard it"** → reads merged brand + script, queries registered asset packs for matching footage, writes `projects/spring-launch/STORYBOARD.md`
- Creator drops `recording-001.mov` into `projects/spring-launch/media/` — Atelier auto-transcribes (existing pipeline)
- **"@iris compose the teaser-15s variant"** → scaffolds `projects/spring-launch/hyperframes/teaser-15s/` via `@a-company/atelier-hyperframes-adapter`, reads merged brand + project artifacts + selected asset paths
- **"@iris preview"** → launches Hyperframes dev server against the scaffold for live agent iteration
- **"@iris render"** → final MP4 via `@hyperframes/producer`

Multiple variants per project (teaser-15s / trailer-30s / full-spot-60s) all share the same project-level brand overlay. Same composition logic, different durations / variant-specific overrides.

The Claude Code session never leaves the workspace folder. Agents read everything fresh per task.

---

## v2 CLI surface

| Verb | What it does | Replaces v1 |
|---|---|---|
| `atelier workspace init` | Scaffold a workspace with `_brand/` + `_packs/` + `projects/` + `workspace.atelier` | parts of `atelier studio --new` |
| `atelier brand init` | Scaffold workspace's `_brand/` artifacts (DESIGN/SCRIPT/STORYBOARD templates + `.atelier-brand.yaml`) | (new) |
| `atelier pack register <dir>` | Point at any folder, walk it, write `.atelier-pack.yaml` stub, register in workspace | (new) |
| `atelier pack scan` | Re-walk registered packs, refresh the index (after creator drops files in) | (new) |
| `atelier project new <name>` | Create a project inheriting workspace brand (project-level DESIGN/SCRIPT/STORYBOARD scaffolded as overrides) | `atelier init` (renamed + reshaped) |
| `atelier media add <file>` | Drop a media file into the current project's `media/`, auto-transcribe | `atelier media` (existing) |
| `atelier compose <project> [<variant>]` | Agent-driven composition: emit a Hyperframes scaffold from artifacts + asset bindings | (new — what `atelier render` becomes when scoped to scaffolding only) |
| `atelier preview <project> [<variant>]` | Launch Hyperframes dev server against a scaffolded variant for live iteration | replaces `atelier studio` |
| `atelier render <project> [<variant>]` | Final MP4 via `@hyperframes/producer` | replaces v1 `atelier render` |
| `atelier brand show [<project>]` | Print the effective merged brand for a project (debugging the cascade) | (new) |
| `atelier pack list` | Show all registered packs + categories + counts | (new) |
| `atelier artifacts validate` / `scaffold` | Pure artifact tooling (preserved from v1) | (existing) |
| `atelier transcribe` / `transcript` | Whisper pipeline + transcript editor (preserved from v1) | (existing) |

## v2 MCP tool surface

Quill/Lux/Iris get a new tool vocabulary aligned with the brand+pack+compose model:

**Brand + voice (Quill primarily):**
- `atelier_get_effective_brand({ projectName })` → returns merged workspace + project brand (DESIGN + voice + visual + techniques)
- `atelier_update_brand({ projectName?, patch })` → write changes to brand artifacts; auto-routes to workspace or project based on scope
- `atelier_get_voice_exemplars({ projectName?, tag? })` → retrieve example phrasings for tone-matching

**Asset packs (Lux primarily):**
- `atelier_pack_list({ projectName? })` → all packs visible to a project (workspace + project)
- `atelier_pack_query({ category, criteria? })` → "give me logos appropriate for full-screen reveals in brand X" → returns absolute file paths + usage notes
- `atelier_pack_register({ dir, name? })` → register a new pack
- `atelier_pack_scan({ packName? })` → re-walk + refresh index

**Composition (Iris primarily):**
- `atelier_scaffold_hyperframes({ projectName, variantName, sceneSpec })` → call into `@a-company/atelier-hyperframes-adapter` to materialize a Hyperframes project from artifact overlays + asset bindings
- `atelier_preview({ projectName, variantName })` → start Hyperframes dev server
- `atelier_render({ projectName, variantName, format? })` → final render via `@hyperframes/producer`

**Cross-cutting:**
- `atelier_workspace_info()` → workspace + projects + packs listing
- `atelier_project_info({ projectName })` → single project state + media + transcripts + variants

Preserved from v1 (no rework needed):
- All artifact MCP surfaces (already format-agnostic)
- Transcribe + transcript editing surfaces
- Mind-map + asset-touching MCP tools
- Media notes + ref-cycle

Deprecated from v1:
- Layer-mutation surfaces (`atelier_add_layer` / `atelier_add_delta` / `atelier_set_*` for layer properties / etc.) — these spoke in `.atelier` doc primitives that don't exist in v2

---

## Inventory (carried from sharpened plan)

### (A) KEEP — survives the pivot intact (~7k LOC)

Same as before. Highlights for the new framing:

- **Artifact schemas** (`packages/schema/src/artifacts/`) — DESIGN/SCRIPT/STORYBOARD become the brand contract
- **Agent personas** (Quill/Lux/Iris) — exactly the brand intelligence engine the v2 vision needs
- **Workspace + mind-map + recipes** — extends to be brand-aware
- **Paradigm integration** — durable agent learning across sessions (key to brand voice retention)
- **Transcribe + ingest + media notes** — asset prep stays
- **MCP server skeleton** — only tool registrations change

### (B) ADAPT (~3.5k LOC) — emit Hyperframes, query brand cascade

- **caption-builder** → emits Hyperframes overlay HTML instead of Atelier layer YAML
- **timeline-ops** → operates on Hyperframes timeline
- **technique-library** → re-expressed as Hyperframes CSS+animation snippets, parameterized by brand bindings
- **mind-map** → extends to support multi-pack registration + per-pack categorization
- **recipes** → bodies emit Hyperframes constructs; binding model survives
- **rename-media + ref-cycle** → spans Hyperframes assets

### (C) DEPRECATE (~28k LOC) — kill entirely

Same as before. Concentrated in `packages/canvas`, `packages/studio`, `packages/svg`, `packages/lottie`, `packages/video`, `packages/react`, most of `packages/core`/`schema`/`types` (the `.atelier` doc model), `atelier studio` CLI verb, `atelier render` CLI verb, layer-mutation MCP tools, `apps/playground`, `apps/showcase`.

### (D) NEW WORK (~5-8k LOC — revised upward for the brand+pack surface)

1. **`packages/hyperframes-adapter/`** (started) — scaffolder + producer-runner. Already builds clean (~250 LOC). Needs caption emitter from real transcript shape, brand merge, technique bindings.

2. **`packages/atelier-brand/`** (new) — workspace `_brand/` + project artifact loader, cascade merge, `.atelier-brand.yaml` parser
   - `load.ts` — read DESIGN.md + SCRIPT.md + STORYBOARD.md + `.atelier-brand.yaml`
   - `merge.ts` — cascade workspace → project per the rules table
   - `query.ts` — `getEffectiveBrand(projectName)` API

3. **`packages/atelier-packs/`** (new) — folder-as-truth asset pack management
   - `register.ts` — walk a folder, scaffold `.atelier-pack.yaml`, write workspace pointer
   - `scan.ts` — re-walk, refresh index, detect new/removed files
   - `query.ts` — `queryPack({ category, criteria })` returns absolute paths + usage rules
   - `cascade.ts` — workspace packs + project packs merge

4. **New CLI verbs** (`packages/cli/src/commands/`):
   - `workspace.ts` — `init`
   - `brand.ts` — `init` / `show`
   - `pack.ts` — `register` / `scan` / `list`
   - `project.ts` — `new`
   - `compose.ts` — agent-driven scaffold
   - `preview.ts` — Hyperframes dev server
   - `render.ts` — final render (REPLACES v1 render)

5. **New MCP tool surface** (`packages/mcp/src/tools/`):
   - `brand.ts` — `atelier_get_effective_brand` / `atelier_update_brand` / `atelier_get_voice_exemplars`
   - `packs.ts` — `atelier_pack_list` / `atelier_pack_query` / `atelier_pack_register` / `atelier_pack_scan`
   - `compose.ts` — `atelier_scaffold_hyperframes` / `atelier_preview` / `atelier_render`
   - `workspace-v2.ts` — `atelier_workspace_info` / `atelier_project_info`

6. **Agent retarget** — update `.claude/agents/atelier-{quill,lux,iris}.md` + `.paradigm/personas/` for the new tool vocabulary. Each persona description sharpens for their pillar (Quill=brand voice; Lux=asset packs + visual; Iris=composition driver).

7. **`atelier workspace init` template** — scaffolds the full directory hierarchy with `_brand/` + `_packs/` + `projects/` empty + a starter `.atelier-brand.yaml`.

8. **Documentation** — rewrite README + new `docs/v2-architecture.md` + `docs/brand-cascade.md` + `docs/asset-packs.md`. Archive v1 docs.

---

## Phase timeline (revised)

### Phase 0 — Foundation + spike ✅ DONE

- ✅ Decision recorded as `TD-2026-05-28-097`
- ✅ Branch `feat/v2-hyperframes-pivot` created
- ✅ Migration plan written (this doc — superseded by sharpened v2)
- ✅ `@hyperframes/producer` installed in `packages/hyperframes-adapter`
- ✅ Minimum scaffolder built
- ✅ End-to-end spike: `creator/demo/vid.atelier` → Hyperframes → MP4 with video + audio + captions
- ✅ Owner-verified pivot direction

### Phase 1 — Brand + packs + cascade (next)

- ☐ `packages/atelier-brand/` — load + merge + query
- ☐ `packages/atelier-packs/` — register + scan + query
- ☐ CLI verbs: `workspace init` / `brand init` / `brand show` / `pack register` / `pack scan` / `pack list` / `project new`
- ☐ MCP brand + pack surfaces
- ☐ Update agent personas + `.claude/agents/` for the new tool vocabulary
- ☐ Workspace template (`_brand/` + `_packs/` + `projects/`)
- ☐ One real workspace + brand + pack registered + a project created + cascade verified via `atelier brand show`

**Phase 1 acceptance:** A creator can `atelier workspace init my-brand`, register one pack, create one project, ask Quill in Claude Code to draft a script that inherits brand voice. No render yet.

### Phase 2 — Composition + render (after Phase 1)

- ☐ `atelier compose` CLI + MCP — agent scaffolds Hyperframes from artifacts + assets
- ☐ Caption-builder adapted to emit Hyperframes overlay HTML
- ☐ Timeline-ops adapted to Hyperframes timeline format
- ☐ Technique library re-emitted as Hyperframes CSS snippets
- ☐ `atelier preview` — Hyperframes dev server
- ☐ `atelier render` — `@hyperframes/producer` driver
- ☐ Iris's MCP tools wired

**Phase 2 acceptance:** Same creator from Phase 1 can ask Iris "compose + render" → gets an MP4 deliverable. Compare output parity with the spike.

### Phase 3 — Deprecate v1 (after Phase 2)

- ☐ Delete `packages/canvas`, `packages/studio`, `packages/svg`, `packages/lottie`, `packages/video`, `packages/react`
- ☐ Delete most of `packages/core`, `packages/schema` non-artifact files, `packages/types` non-general
- ☐ Delete `packages/cli/src/web/*`, deprecated CLI verbs, deprecated MCP tools
- ☐ Delete `apps/playground`, `apps/showcase`, `examples/*.atelier`
- ☐ Bump to `2.0.0` across surviving packages
- ☐ CHANGELOG + README rewrite

**Phase 3 acceptance:** All remaining tests green. Branch ready for merge to main as v2.0.

---

## Risk register (revised)

| Risk | Mitigation |
|---|---|
| Hyperframes pre-1.0 API churn | Pin version, integrate via Node API, adapter package is the only consumer |
| `.atelier-pack.yaml` sidecar format becomes a versioned contract creators rely on | Treat sidecar as a v2.x stable interface; format changes go through a `version:` field + migration tool |
| Brand cascade rules feel surprising to creators | `atelier brand show <project>` prints the merged effective brand — creators can always inspect |
| Cross-filesystem symlinks fail (network drives, Windows w/o admin) | Asset injector falls back to copy; pack registration tolerates either |
| Hyperframes' deterministic-font system rejects our `:root` CSS var fallback chains | Use Hyperframes' mapped font names directly; allow brand to declare `font_aliases` for non-mapped fonts |
| Multi-creator brand sync wasn't in scope but creators ask for it | "External pack folder on Dropbox/iCloud" pattern handles 80% of multi-creator without us building a sync layer |
| 28k LOC deletion is a huge diff | Stage across multiple commits per Phase 3 plan |

---

## Today's work — what's NOT wasted

Even though today's v1 export work lands in the deprecate column:

- **Agent team feedback architecture** (RENDER-AUDIO-ISSUE.md) informs how v2 agents report against Hyperframes integration
- **Artifact schemas + Quill/Lux/Iris personas + workspace concept + mind-map + recipes + Paradigm integration** — the entire v1 KEEP column IS the v2 foundation
- **The hyperframes-adapter spike** proved the renderer integration in one session
- **Caption-timing + transcript model** translates verbatim
- **WS bridge / live-mutation pattern** maps to how the v2 file-watcher will trigger Hyperframes hot-reload

---

## Cross-references

- Paradigm decision: `TD-2026-05-28-097`
- Companion lore: `L-2026-05-28-ascend-184856-364`
- Spike commit: `c37b4a2` + verification in `creator/demo/exports/demo-v2-spike-*.mp4`
- Originating issue: `creator/demo/exports/RENDER-AUDIO-ISSUE.md`
- v1.0 milestone lore: `L-2026-05-28-ascend-163734-001`
- Hyperframes upstream: https://github.com/heygen-com/hyperframes
- Hyperframes docs: https://hyperframes.mintlify.app/quickstart
