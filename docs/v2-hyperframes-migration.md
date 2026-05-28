# Atelier v2.0 — Hyperframes Pivot Migration Plan

> **Status:** Active — `feat/v2-hyperframes-pivot` branch
> **Decision:** [TD-2026-05-28-097](../.paradigm/) — companion lore `L-2026-05-28-ascend-184856-364`
> **Trigger:** Owner directive after agent team's `creator/demo/exports/RENDER-AUDIO-ISSUE.md` made the case empirically.

## Why we're pivoting

Today (2026-05-28) the team shipped v1.0 export end-to-end in 13 commits. The agent team's diagnostic on `atelier render` exposed that even after a full day of work we have:

- A single-clip-MP4-only path
- Multi-clip mixing → v1.1
- State-level audio (`atelier_set_audio`) → v1.1
- Time-warped clips → v1.1
- GIF audio → format-impossible
- WebM audio → v1.1

[HeyGen Hyperframes](https://github.com/heygen-com/hyperframes) (v0.6.52 released the same day) ships all of that **plus** alpha channel (yuva420p WebM + ProRes 4444 MOV), HDR10/BT.2020, 24/30/60fps, distributed render via AWS Lambda — and is Apache 2.0, locally hostable, agent-first, with a first-class Node API (`@hyperframes/producer`).

**The economics:** continuing to bend Atelier into a composition engine means competing with a 22k-star actively-developed framework on its core competency. Pivoting lets us double down on what's actually differentiated — agent-driven creative direction + brand consistency + asset orchestration.

## What Atelier v2.0 IS

> **Atelier is the agent-driven creative-direction layer that feeds Hyperframes.**

- **Front-of-pipeline contract:** DESIGN.md / SCRIPT.md / STORYBOARD.md as the durable editorial brief, owned by agents (Quill / Lux / Iris)
- **Workspace + mind-map:** the creator's multi-project asset library
- **Recipes:** reusable style + technique presets that bind to slots via `SlotKind`
- **Asset packs:** images, videos, audio, fonts organized for agent retrieval
- **Agent personas:** Quill (Showrunner), Lux (Cinematographer), Iris (Composer) with persistent learning via Paradigm
- **Ingest + transcribe pipeline:** drop a video → land in `media/` → whisper transcribe → ready for use
- **Emitter:** translates the artifact triple + asset bindings into a **Hyperframes project** (HTML/CSS/JS + assets) that Hyperframes then renders deterministically

Atelier **does not** own composition format, timeline UI, renderer, encoder, or browser editor. Hyperframes does.

## What Atelier v2.0 IS NOT (anymore)

- ❌ A custom canvas/SVG/Lottie renderer
- ❌ A browser-based timeline editor
- ❌ A `.atelier` YAML document format with states/deltas/layers
- ❌ A WebCodecs / mp4-muxer / Mediabunny export pipeline
- ❌ An ffmpeg overlay pipeline (`atelier render`)
- ❌ A node-canvas dependency

---

## Inventory — what survives, what changes, what dies

### (A) KEEP — survives the pivot intact (~7k LOC)

| Area | Path | LOC | Why |
|---|---|---|---|
| Artifact schemas | `packages/schema/src/artifacts/` | ~1.0k | DESIGN/SCRIPT/STORYBOARD Zod schemas + SlotKind + parser + validator. Format-agnostic. |
| Artifact CLI | `packages/cli/src/commands/artifacts.ts` + `lib/artifact-project.ts` + `lib/artifact-templates.ts` | ~735 | `atelier artifacts validate / scaffold`. Pure artifact tooling. |
| Agent personas | `.claude/agents/atelier-{quill,lux,iris}.md` + `packages/cli/src/lib/atelier-agent-templates.ts` | ~503 | Roles are renderer-agnostic. Only MCP tool allowlists retarget. |
| Workspace | `creator/workspace.atelier` + `packages/cli/src/lib/workspace*.ts` + `learning-mode.ts` | ~1.7k | Project-inside-Workspace concept is independent of rendering. |
| `atelier init` | `packages/cli/src/commands/init.ts` | 633 | Scaffolds Project (artifact triple + mind-map + project file). Output target changes; scaffold logic stays. |
| Mind-map / assets | `packages/mcp/src/tools/mind-map.ts` + `packages/core/src/document.ts` (mind-map slice) | ~267 | Asset registry. Nothing rendering-specific. |
| Recipes | `packages/cli/src/lib/recipe.ts` + `packages/mcp/src/tools/recipes.ts` + `packages/cli/src/commands/recipe.ts` + `packages/core/src/recipe.ts` + `packages/schema/src/recipe.ts` | ~1k | Slot-binding model is renderer-agnostic. Recipe bodies retarget. |
| Transcribe | `packages/cli/src/commands/transcribe.ts` + `lib/whisper.ts` + `lib/transcribe-orchestrator.ts` | ~895 | Decoupled from doc format. |
| Transcript editor | `packages/cli/src/commands/transcript.ts` + `lib/transcript-model.ts` | ~741 | Pure derivation. JSON-in/JSON-out. |
| Silence detect | `packages/cli/src/lib/silence-detect.ts` | 144 | Pure analysis. |
| Media notes | `packages/cli/src/lib/media-notes.ts` + `packages/mcp/src/tools/media-notes.ts` + `effective-transcript.ts` | ~749 | `.notes.md` sidecar convention. Pure metadata. |
| MCP asset surface | `packages/mcp/src/tools/{assets,refs,rename-media,templates}.ts` + `import-images.ts` (mostly) | ~603 | Read-only or asset-management; no doc-mutation. |
| MCP server skeleton | `packages/mcp/src/{index,store,bridge-protocol,transports}.ts` | — | Only tool registrations change. |
| Paradigm integration | `packages/cli/src/lib/paradigm-augment.ts` + `.paradigm/` + `portal.yaml` | ~687 + config | Renderer-agnostic. |
| Math primitives | `packages/math/` | 487 | Pure functions. Useful regardless of pipeline. |
| General types | Selective `packages/types/` (color, asset, general) | ~200 | Reusable subset. |
| CLI infrastructure | `packages/cli/src/cli.ts` + `index.ts` + `commands/{info,lint,validate}.ts` | ~500 | Shell. |
| Reconstruct | `packages/cli/src/commands/reconstruct.ts` | 242 | Reconstruct project from existing assets. |

### (B) ADAPT — idea survives, output target changes (~3.5k LOC)

| Area | Path | LOC | Adaptation needed |
|---|---|---|---|
| Media-bin + ingest | `packages/cli/src/commands/media.ts` + `lib/ingest-dispatch.ts` + `ingest-bin-types.ts` | ~694 | "Drop file → media/ + transcribe + sidecar notes" stays. Downstream `composeVideoProject` hop is replaced by Hyperframes scaffolder. |
| Caption builder | `packages/cli/src/lib/caption-builder.ts` + `commands/captions.ts` | 255 | Word-timing → caption-cards stays. Emits Hyperframes overlay HTML (`data-start` / `data-duration`) instead of Atelier text layers + opacity deltas. |
| Timeline ops | `packages/cli/src/lib/cut-model.ts` + `lib/timeline-ops.ts` + `packages/mcp/src/lib/timeline-ops.ts` | ~570 | Cut/trim/splice data model survives. Sinks at Hyperframes timeline format. |
| Trim CLI | `packages/cli/src/commands/trim.ts` | 244 | Same. |
| Technique library | `packages/schema/src/artifacts/technique.ts` + technique catalog | 88 + catalog | Named-technique concept (ken-burns, split-reveal, fade-under-vo) survives. Each entry's body re-expressed as Hyperframes CSS/timeline snippets. |
| Clip-level MCP tools | `packages/mcp/src/tools/clips.ts` | 538 | Add/cut/reorder concepts map cleanly to Hyperframes scenes. |
| Overlay MCP tools | `packages/mcp/src/tools/overlays.ts` | 189 | Overlay placement maps to Hyperframes overlay constructs. |
| Variables MCP | `packages/mcp/src/tools/variables.ts` + `commands/variables.ts` | 212 | Design variables map to Hyperframes CSS variables. |
| Interactions MCP | `packages/mcp/src/tools/interactions.ts` | 164 | Concept survives, target changes. |
| Rename-media + ref-cycle | `packages/cli/src/lib/rename-media.ts` + `packages/mcp/src/tools/rename-media.ts` + `ref-cycle.ts` | ~702 | Reference-graph rewriting on asset rename. Now spans Hyperframes asset refs. |

### (C) DEPRECATE — kill entirely (~28k LOC)

**Custom render/composition packages (~9.7k LOC):**

- `packages/canvas/` (1310) — Canvas 2D `renderFrame`. Hyperframes replaces.
- `packages/studio/` (6261) — Browser editor with canvas-panel, layer-panel, property-panel, yaml-panel, history, player, export-dialog. Hyperframes is the editor.
- `packages/svg/` (705) — SVG renderer.
- `packages/lottie/` (878) — Lottie exporter.
- `packages/video/` (291) — `element-provider.ts` + `webcodecs-provider.ts` + `ffmpeg-encoder.ts`.
- `packages/react/` (287) — React `<Animation>` component for `.atelier` docs.

**Studio web app + inline canvas (~7.7k LOC):**

- `packages/cli/src/web/{inline-app,workspace-app,timeline-view,timeline-state-types}.ts` (~4.4k)
- `packages/cli/src/commands/studio.ts` (3320) — `atelier studio` CLI verb (server, HTTP endpoints, WebSocket bridge)
- `apps/playground/` + `apps/showcase/` — demo apps

**Render CLI verbs + helpers (~3k LOC):**

- `packages/cli/src/commands/render.ts` (140) + `render-pipeline.ts` (391) — `atelier render` (CLI ffmpeg overlay path, fixed today)
- `packages/cli/src/commands/{still,export-image,export-svg,export-lottie}.ts` (~394)
- `packages/cli/src/commands/carousel.ts` (277)
- `packages/cli/src/lib/{render-image,compose-video-project,compose-carousel-project,compose-image-project,video-project,media-project}.ts` (~1.4k)
- `packages/studio/src/export/` (`video-exporter.ts` + `gif-encoder.ts` + `export-dialog.ts`, ~1376) — built today

**`.atelier` doc format (~4.2k LOC):**

- `packages/core/src/` minus general helpers (1591) — `delta.ts`, `state.ts`, `layer.ts`, `shape.ts`, `shadow.ts`, `interaction.ts`, `timeline.ts`, `slides.ts`, `coordinates.ts`, `units.ts`, `parse.ts`, `validate.ts`, `easing.ts` + subdirs (resolver/, state/, expressions/, templates/, presets/, validation/, builder/, audio/)
- `packages/schema/src/` non-artifact files (~1.1k)
- `packages/types/` non-general types (~942)
- `examples/*.atelier` (12 files)
- `creator/demo/vid.atelier` (regenerates via new pipeline)

**MCP layer-mutation tools (~2.5k LOC):**

- `packages/mcp/src/tools/{layers,layer-effects,states,state-config,deltas,shapes,docs,document,presets,preview,export,performance}.ts`
- `packages/mcp/src/lib/doc-management.ts` (536) + `doc-management-types.ts` (101)
- `packages/cli/src/lib/doc-management.ts` + `studio-save-coordinator.ts`

**Docs targeted at deprecated stack:**

- `docs/format-spec.md`, `rendering-pipeline.md`, `state-machine-guide.md`, `animation-audit.md`

### (D) NEW WORK — what the pivot creates (~3-5k LOC)

1. **`packages/hyperframes-adapter/`** (new package) — owns all Hyperframes integration
   - `scaffolder.ts` — creates Hyperframes project skeleton from `creator/<project>/`
   - `design-to-css.ts` — DesignArtifact → `:root { --color-x: ...; }`
   - `storyboard-to-html.ts` — StoryboardArtifact + bindings → `index.html` timeline
   - `technique-emitters/` — per-technique HTML/CSS generators (~15 entries)
   - `asset-injector.ts` — copies/symlinks `media/` → Hyperframes `assets/`
   - `caption-emitter.ts` — replaces caption-builder's sink
   - `producer-runner.ts` — wraps `@hyperframes/producer` `executeRenderJob` with progress
   - `watcher.ts` — file-watcher: artifacts change → re-scaffold + signal Hyperframes hot-reload

2. **`atelier render-v2` CLI verb** — eventually graduates to `atelier render`. Drives the scaffolder + producer.

3. **`atelier preview` CLI verb** — launches Hyperframes' dev server in the scaffolded project. Replaces `atelier studio`.

4. **New MCP tools** — `atelier_add_scene`, `atelier_set_overlay`, `atelier_set_css_var`, `atelier_set_animation_timing`. Replace `atelier_add_layer` / `atelier_add_delta` / etc.

5. **Skill / agent retarget** — update `.claude/agents/atelier-*.md` and personas in `.paradigm/personas/` for the new MCP vocabulary. Optionally install Hyperframes' own `npx hyperframes skill add` for foundational Hyperframes literacy.

6. **New examples** — replace `examples/*.atelier` with Hyperframes project examples committed to `examples/v2/`.

7. **v2 docs** — update README, write `docs/v2-architecture.md`, archive `docs/v1-*.md`.

---

## Hyperframes API contract

Source of truth: [`packages/producer` README](https://github.com/heygen-com/hyperframes/tree/main/packages/producer).

```ts
import { createRenderJob, executeRenderJob } from '@hyperframes/producer';

const job = createRenderJob({
  inputPath: '/abs/path/to/hyperframes-project',  // directory with index.html + assets
  outputPath: '/abs/path/to/output.mp4',
  width: 1080,
  height: 1920,
  fps: 30,
  format: 'mp4',           // 'mp4' | 'webm' | 'mov' | 'png-sequence'
  quality: 'high',         // 'draft' | 'standard' | 'high'
  // codecs: 'h264' (default) | 'h265' for MP4; 'vp9' for WebM; 'prores' for MOV
});

await executeRenderJob(job, (progress) => {
  // { frame, totalFrames, percent } shape (approx)
});
```

**Hyperframes project structure** (what our scaffolder produces):

```
project/
├── meta.json              # { name, id, createdAt }
├── index.html             # root composition
├── compositions/          # sub-compositions, loaded via data-composition-src
│   ├── intro.html
│   └── outro.html
└── assets/
    ├── video.mp4
    ├── narration.wav
    └── overlay.png
```

**HTML data-attribute timing model:**

```html
<video data-start="0" data-duration="7.85" data-track-index="0" src="assets/video.mp4"></video>
<audio data-start="0" data-duration="7.85" data-track-index="1" data-volume="1.0" src="assets/audio.aac"></audio>
<div class="caption" data-start="0.0" data-duration="0.4">Just</div>
<div class="caption" data-start="1.03" data-duration="1.9">recording a quick video with</div>
```

**Animation registration** (for ken-burns / fade / etc):

```html
<script>
  window.__timelines = window.__timelines || [];
  window.__timelines.push({
    id: 'ken-burns-1',
    duration: 7.85,
    apply: (t) => { /* CSS transforms based on t in [0,1] */ }
  });
</script>
```

---

## Phase timeline

### Phase 0 — Spike (this session)

- ✅ Decision recorded as `TD-2026-05-28-097`
- ✅ Branch `feat/v2-hyperframes-pivot` created
- ✅ Migration plan written (this doc)
- ☐ `@hyperframes/producer` installed in new `packages/hyperframes-adapter`
- ☐ Minimum scaffolder: DESIGN → CSS-vars + STORYBOARD → index.html with video + captions
- ☐ End-to-end render of `creator/demo/vid.atelier` through Hyperframes
- ☐ Compare output against today's `animation (2).mp4` for parity

**Spike acceptance:** produces a playable MP4 with video + captions + audio at 1080×1920 in <30s runtime. If yes → Phase 1.

### Phase 1 — Parallel paths (1-2 weeks)

- ☐ `atelier render-v2` CLI verb wired (uses spike pipeline end-to-end)
- ☐ All technique-library entries re-emitted as Hyperframes CSS snippets
- ☐ Caption-builder ported to emit Hyperframes overlay HTML
- ☐ Timeline-ops adapted to operate on Hyperframes timeline format
- ☐ Mind-map → Hyperframes asset injector working
- ☐ Recipes retargeted: each recipe body emits Hyperframes constructs
- ☐ Iris's MCP tools retargeted (atelier_add_scene + atelier_set_overlay + atelier_set_css_var)
- ☐ Both v1 (`atelier render`) and v2 (`atelier render-v2`) keep working

**Phase 1 acceptance:** agent team can author a full project end-to-end through the v2 path. Output parity with v1 confirmed across at least 3 distinct demo projects.

### Phase 2 — Deprecate v1 (1 week)

- ☐ `atelier render-v2` graduates to `atelier render` (v1 → `atelier render-legacy` for one release, then deleted)
- ☐ `atelier preview` replaces `atelier studio` (drives Hyperframes dev server)
- ☐ Delete `packages/canvas`, `packages/studio`, `packages/svg`, `packages/lottie`, `packages/video`, `packages/react`
- ☐ Delete most of `packages/core`, `packages/schema` non-artifact files, `packages/types` non-general
- ☐ Delete `packages/cli/src/web/*`, `packages/cli/src/commands/{studio,still,export-image,export-svg,export-lottie,carousel}.ts`
- ☐ Delete `packages/cli/src/lib/{render-image,compose-*,video-project,media-project,doc-management}.ts`
- ☐ Delete `packages/mcp/src/tools/{layers,layer-effects,states,state-config,deltas,shapes,docs,document,presets,preview,export,performance}.ts`
- ☐ Delete `examples/*.atelier` + `apps/playground` + `apps/showcase`
- ☐ Delete `docs/{format-spec,rendering-pipeline,state-machine-guide,animation-audit}.md`
- ☐ Bump version to `2.0.0` across all surviving packages
- ☐ Update README, CHANGELOG, agent docs

**Phase 2 acceptance:** all 1212 tests green (or rewritten for new surface). Branch ready for merge to main as v2.0.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Hyperframes is pre-1.0 (v0.6.52). API churn possible. | Pin version in package.json. Integrate via Node API (more stable than CLI flags). Keep `packages/hyperframes-adapter` as the only consumer so swaps are cheap. |
| Hyperframes brand system (`Design.HTML`) is "in development". | Own the DESIGN.md → CSS-vars layer ourselves. This is actually our differentiator. When Hyperframes ships their brand system, evaluate replacing ours. |
| Transcript-to-caption auto-alignment not in Hyperframes. | We already have this in `caption-builder.ts`. Keep + adapt to emit Hyperframes overlay HTML. |
| Existing v1 creators (anyone using `.atelier` files) have a breaking-change cliff. | Document the migration. Provide `atelier migrate-v1-doc <file>` CLI to convert `.atelier` → Hyperframes project (best-effort). |
| Today's 13 commits (export pipeline + audio mux + render fix) all go to /dev/null on the deprecate path. | The work isn't wasted — the insight survives. The WS bridge architecture, the BrowserVideoFrameProvider cache pattern, the cross-fade timing investigation all inform the v2 design. Document in lore. |
| Hyperframes render speed unknown — they publish no benchmarks. | First test in the spike. If too slow vs current path, evaluate distributed-render via `@hyperframes/aws-lambda` or keep our ffmpeg overlay path as the "fast" option behind a flag. |
| 28k LOC deletion is a huge diff. | Stage across multiple commits per phase 2 plan. Each commit removes one package + its tests + its dependents in a single atomic chunk. |
| Tests for the deleted stack disappear; coverage of remaining KEEP/ADAPT code may degrade. | Audit test coverage of the KEEP column BEFORE starting phase 2. Add tests for any KEEP code that was only indirectly covered through DEPRECATE-path tests. |

---

## Rollback strategy

If Phase 0 spike fails (Hyperframes can't render the demo end-to-end at acceptable quality/speed):

- Branch `feat/v2-hyperframes-pivot` stays open
- No changes to `feat/creator-flow-v1-prep` or `main`
- Record findings in lore + Paradigm decision update (`TD-2026-05-28-097` → `rejected`)
- Continue v1.0 development

If Phase 1 fails (parallel paths reveal Hyperframes can't express something we need):

- Revert the affected commits on `feat/v2-hyperframes-pivot`
- Re-scope: either own that feature (own a forked Hyperframes component) or accept the limitation as a v2 deferred-feature
- Update this doc + Paradigm decision

If Phase 2 fails (deletion causes cascading breakage we can't fix in scope):

- Branch is recoverable via git revert
- Re-bound deletion to packages that genuinely have zero forward references
- Update this doc

---

## Today's work — what's NOT wasted

Even though today's 13 commits land in the deprecate column:

- **Agent team feedback loop architecture** (RENDER-AUDIO-ISSUE.md) informs how v2 agents should report issues against Hyperframes integration
- **WS bridge / `applyMutation` / live-preview** pattern maps directly to how the v2 file-watcher will fire Hyperframes' hot-reload
- **BrowserVideoFrameProvider** module-level cache + seek-and-await pattern → applies to how we'd manage Hyperframes preview-window state during agent mutations
- **Cross-fade investigation** + caption-timing model translates verbatim — Hyperframes uses `data-start` / `data-duration`, we already compute these
- **Composer caption-builder** logic survives — just emits HTML instead of YAML
- **All Paradigm lore from today** documents the v1→v2 evolution rationale

---

## Cross-references

- Paradigm decision: `TD-2026-05-28-097`
- Companion lore: `L-2026-05-28-ascend-184856-364`
- Originating issue: `creator/demo/exports/RENDER-AUDIO-ISSUE.md`
- v1.0 milestone lore: `L-2026-05-28-ascend-163734-001`
- Hyperframes upstream: https://github.com/heygen-com/hyperframes
- Hyperframes docs: https://hyperframes.mintlify.app/quickstart
