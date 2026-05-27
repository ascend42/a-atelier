# Atelier Creator Roadmap

> **Status:** Plan-of-record, post-decision phase. Supersedes §7 (roadmap) of `docs/keynote/paradigm/atelier-creator-flow-assessment.md` and §8 (open questions) of `docs/keynote/paradigm/atelier-hero-paths-and-creator-teams.md`. Those documents remain as historical context.
> **Authored:** 2026-05-25 evening. For 7am review.
> **Audience:** Project owner, future agents picking up the work.

---

## Thesis & Architectural Shape

**Hyperframes ships artifacts; Atelier ships a live loop.** Eleven decisions tonight crystallized what Atelier becomes: an open-source, local-first creator framework and tool, with a small set of Paradigm-native agents (Quill, Lux, Iris) shipping invisibly underneath. The agents learn the creator's style on the creator's laptop, surface only inert structural artifacts (skills, recipes, asset packs) to the community via nevr.land, and never lift personal data off the machine. Hyperframes brings artifact discipline to the front of the pipeline (DESIGN/SCRIPT/STORYBOARD); Atelier closes the back with a live loop (talk → mutate → render → iterate). nevr.land hosts only what is inert and viewable. Nothing is extracted. Nothing is monetized. The framework is profitable for the *creator*, never for Atelier itself. Local-first is the architectural floor, not a marketing claim — every other decision in this roadmap is downstream of it.

---

## The Eleven Decisions

| TD-ID | One-line summary | What it constrains |
|---|---|---|
| TD-2026-05-26-088 | Image generation stays external; build a stable seam for later wrapping. | All generation calls in the pipeline must route through a single interface module so a wrapped MCP tool drops in without flow changes. |
| TD-2026-05-26-363 | Quill / Lux / Iris ship WITH Atelier as a self-contained Claude Code skill/plugin (not in a-paradigm). | The Atelier package owns persona instantiation; `.paradigm/personas/index.yaml` is populated here, not upstream. |
| TD-2026-05-26-720 | **SUPERSEDED by TD-540.** Was: hosted Studio tier as additive layer. | No hosted Studio. Reference only when explaining the reversal. |
| TD-2026-05-26-275 | Atelier surface is standalone (no Paradigm setup required); engine is Paradigm-native. | Dual citizenship: install Atelier alone and it works; with Paradigm present, deeper learning unlocks. No hard Paradigm dep at install. |
| TD-2026-05-26-684 | Open-source framework + tool. No paid marketplace, no subscriptions, no premium gating. | All sharing surfaces are free. No tier walls. Recipes are public goods. |
| TD-2026-05-26-646 | Creator picks AMBIENT or EXPLICIT learning mode at team setup; changeable anytime; no auto-prompts to switch. | Every agent surfacing/locking action must branch on mode. Default is asked, never assumed. |
| TD-2026-05-26-210 | Shared Paradigm-published personas (canonical Quill/Lux/Iris) + per-creator notebooks. | Personas are the engine, notebooks are the creator. Forking personas is a v3 question, not a v1 surface. |
| TD-2026-05-26-229 | nevr.land hosts inert artifacts (skills, recipes, asset packs). Recipes are pure structure with asset-typed slots; assets bind locally at install. | Recipes never travel with assets. Install-time binding is via the recipient's mind-map. GitHub install-by-URL is the federated fallback. |
| TD-2026-05-26-540 | Local-first wins. Studio is 127.0.0.1-only. No hosted Studio, no nevr.land Studio instance, no self-hostable Studio backend product. | nevr.land's scope is *only* inert public artifacts. No Atelier-branded service ever holds creator data. |
| TD-2026-05-26-271 | Notebooks and mind-map are creator-owned, local-only, never uploaded, never used to train shared personas. | Privacy enforced by architecture (no upload paths exist), not by policy. |
| TD-2026-05-26-902 | Extracted recipes default to `personal-use: true` — not publishable to nevr.land by default. | The Imitator path's outputs are conservative by default. Publish requires explicit creator action and (later) attribution/transformation gates. |

---

## Phased Build Sequence

Phases are ordered by dependency, not effort. Each phase ends with an outcome that unlocks the next.

### Phase 0 — Persona Instantiation
**Applies:** TD-363, TD-210, TD-275

**Goal:** Make Quill, Lux, and Iris exist as Paradigm personas with canonical skill bundles and seed notebooks. Doc/YAML only, no source code.

**Key deliverables:**
- Populate `.paradigm/personas/index.yaml` (currently `personas: {}`) with canonical entries for `#quill-showrunner`, `#lux-cinematographer`, `#iris-composer`.
- For each persona: a core skills bundle (prompt + docs) under `.paradigm/personas/<name>/skills/` and a canonical notebook seed under `.paradigm/personas/<name>/notebook.yaml`.
- A persona manifest schema documenting: identity, core skills, supported flows, MCP surfaces consumed, mode-awareness contract (Ambient vs. Explicit per TD-646).
- Update `.paradigm/lore/timeline.yaml` with the instantiation lore.

**Outcome / unlocks next:** Agents are addressable. Phase 1 can write artifact schemas knowing who authors them.

---

### Phase 1 — Front-of-Pipeline Artifact Schemas
**Applies:** TD-363

**Goal:** Specify the Hyperframes-style artifacts that sit *before* the live loop. Specification only — no Zod implementation, no source.

**Key deliverables:**
- `docs/specs/atelier/artifacts/DESIGN.md` — the creative-direction artifact (audience, voice, visual register, constraints). Authored by Quill.
- `docs/specs/atelier/artifacts/SCRIPT.md` — narrative/beat/copy structure. Authored by Quill, refined with Lux.
- `docs/specs/atelier/artifacts/STORYBOARD.md` — shot/frame/composition plan. Authored by Lux.
- Companion: `docs/specs/atelier/artifacts/README.md` describing where each lives inside a Project folder (siblings of `project.atelier`), revision conventions, and which agent owns which.

**Outcome / unlocks next:** Phase 2 can widen the Project model knowing what front-of-pipeline files it must hold.

---

### Phase 2 — Project + Iteration Model Widening
**Applies:** TD-229, TD-363

**Goal:** Generalize the shipped VideoProject convention (`source.mp4`, `project.atelier`, `transcript.json`, `cuts.json`) into a Project model where carousels, single images, and clips are siblings, and iteration history is first-class.

**Key deliverables:**
- Spec at `docs/specs/atelier/project-model.md` covering: Project root, content-type-agnostic `project.atelier`, sibling artifact directories (`design/`, `script/`, `storyboard/`, `assets/`, `iterations/`).
- Iteration-history contract: every mutation flowing through `packages/mcp/src/store.ts` produces an iteration entry; rollback and branch semantics defined.
- Asset-slot vocabulary: the typed variable slots (`image.logo`, `image.b-roll.tech`, etc.) recipes will reference for install-time binding under TD-229.
- Migration note for existing VideoProject folders (additive, no breaking change).

**Outcome / unlocks next:** Phase 3 has a stable shape to wire agents against, and Phase 4's mind-map knows what slot vocabulary to satisfy.

---

### Phase 3 — Agent Wiring + Creator Skill Packaging
**Applies:** TD-363, TD-646, TD-210

**Goal:** The agents read front-of-pipeline artifacts, drive the live loop via the existing MCP surface (`packages/mcp/src/bridge-protocol.ts`, `packages/mcp/src/store.ts`), and ship as a self-contained Claude Code skill.

**Key deliverables:**
- Wire Quill → DESIGN/SCRIPT mutations; Lux → STORYBOARD + layer/composition mutations; Iris → audio/music layer mutations. All go through the WS bridge with source tags.
- Setup-time prompt: at first creator-team init, ask "Ambient or Explicit?" (TD-646). Persist to `.paradigm/personas/<creator>/learning-mode.yaml`. Provide a single command to switch; never auto-prompt.
- Ambient-mode soft-surface mechanic: confidence-thresholded suggestions written to a nominations log (not auto-applied). Explicit-mode: nothing locks without confirmation.
- Package: Atelier Claude Code skill that bundles agents + core skills + canonical notebooks, installable without Paradigm pre-installed (TD-275). When Paradigm *is* present, notebook + mind-map integration activates.

**Outcome / unlocks next:** "Talk → driven pipeline" works locally end-to-end. The creator can run a session entirely through the agents.

---

### Phase 4 — The Mind-Map (Asset / Knowledge Graph)
**Applies:** TD-229, TD-271, TD-275

**Goal:** Build the substrate that lets the agent team answer "what graphic goes here?" from the creator's *own* assets. Net-new, but built on Paradigm's existing graph patterns.

**Key deliverables:**
- Spec: `docs/specs/atelier/mind-map.md` covering ingestion (local image/content/meme directories), per-creator indexing, query API (queryable by Lux/Iris during recipe binding).
- Storage: lives entirely under `.paradigm/mind-map/<creator>/` on local disk. No network surface. No upload path exists in code (TD-271 enforced by architecture).
- Slot-resolution protocol: given a recipe with `image.b-roll.tech` slot, the agent team queries the mind-map and proposes a local asset; in Ambient mode it picks the top match silently with surfacing on uncertainty, in Explicit mode it presents candidates.
- Reindex CLI surface and watcher for ingestion directories.

**Outcome / unlocks next:** Phase 6's recipe-install can actually bind. The Imitator path in Phase 7 has a substrate to query.

---

### Phase 5 — Headless Build/Export + Generation Seam Interface
**Applies:** TD-088, T-003, T-002b, T-2026-05-10-008

**Goal:** Close the rendering gap so the team can ship work unattended, and lay down the stable generation seam.

**Key deliverables:**
- MCP video export: lift the browser-only WebCodecs path (`packages/studio/src/export/video-exporter.ts`) into an MCP-callable surface.
- CLI FFmpeg encoder (T-003): wire FFmpeg WASM into the CLI export path.
- WebCodecs demux (T-002b): close the stub so source-video frame extraction works headlessly.
- Studio timeline UI (T-2026-05-10-008) — needed to make iteration history visually navigable.
- **Generation seam interface** (TD-088): a single module, e.g. `packages/schema/src/generation/seam.ts`, with a typed interface `GenerationProvider` and an `external` implementation that calls Higgsfield/etc. via `atelier_import_images`. The wrapped MCP provider is a future drop-in implementing the same interface — *no flow changes when it arrives*.

**Outcome / unlocks next:** Unattended end-to-end runs. Phase 6 can publish recipes that depend on generation without coupling to a provider.

---

### Phase 6 — Recipe-Sharing Surface on nevr.land
**Applies:** TD-229, TD-902, TD-684

**Goal:** Implement publish/install for inert artifacts. Free, viewable, no executables.

**Key deliverables:**
- nevr.land artifact schema: skill (prompt + docs), recipe (YAML structure with typed asset slots), asset pack (explicitly-licensed bundles with manifest).
- Publish CLI: `atelier publish <artifact>` — validates inertness (no scripts), checks `personal-use` flag on recipes (TD-902 blocks publication if true), writes to nevr.land.
- Install CLI: `atelier install <nevr-url>` and `atelier install <github-url>` (federated fallback per TD-229). On install, the recipient's agent team resolves slots against their local mind-map.
- Authorship rules in publish-time validation: core skills require ownership by registered agent owner; community skills/recipes require declaring which registered agents they target.
- No payment surfaces. No tier flags. No gating fields in the schema (TD-684).

**Outcome / unlocks next:** Creators share house-style templates. Phase 7's extracted recipes have a publish target (when manually flipped off `personal-use`).

---

### Phase 7 — Style Extraction (Imitator Path)
**Applies:** TD-902, TD-684

**Goal:** The Imitator hero path at the honest floor — extract what is mechanically observable, defer what requires taste.

**Key deliverables:**
- Extraction targets (in scope): palette, caption cadence/length distributions, aspect ratio defaults, overlay placement habits, typography choices, audio bed selection patterns.
- Out of scope (v1): voice, narrative arc, comedic timing, "taste." Flagged in the spec as deferred to v2+.
- Output: extracted recipes default `personal-use: true` in schema (TD-902). Publishing requires the creator to explicitly flip the flag; future versions may add attribution/transformation gates before allowing the flip.
- Integration: extraction reads iteration history (Phase 2) and mind-map (Phase 4), runs locally only.

**Outcome / unlocks next:** Imitator works. The publish floor is conservative by default, which buys the project time to design attribution/transformation gates without rushing.

---

### Later / Explicitly Deferred

| Item | Trigger to revisit |
|---|---|
| Wrapped Atelier generation provider | TD-088 fulfillment; depends on demand and a generation partner. Seam exists from Phase 5, so drop-in is mechanical. |
| Persona-forking community mechanism | Post-TD-210, only if community contribution pressure justifies it. v3-class. |
| Hosted Studio tier reconsideration | Would require formally revising TD-540. Not on the table this cycle. |
| Imitator v2 (voice/taste/timing) | After v1 ships and we have iteration data to learn from. |
| Attribution/transformation gates for extracted-recipe publish | After Phase 7 ships and we observe how creators actually use the personal-use floor. |

---

## What We Are Explicitly NOT Building

Naming what we won't build is as load-bearing as naming what we will — it tells future agents what to push back on.

- **No hosted Studio tier.** TD-540 reversed TD-720. Studio is 127.0.0.1-only, forever in this cycle. If someone proposes a managed Studio, the answer is no and the citation is TD-540.
- **No paid marketplace, no subscriptions, no premium agent gating.** TD-684. Every sharing surface on nevr.land is free. There are no tier fields in the artifact schema.
- **No personal-data sync.** TD-271. Notebooks and mind-map never leave the laptop. No sync product, no backup-to-cloud feature, no "share your notebook with your team." If a creator wants to move their notebook, they copy the directory.
- **No auto-publishing of extracted recipes.** TD-902. `personal-use: true` is the default. Publish is always an explicit creator action.
- **No forked personas in v1.** TD-210. The persona is the engine, the notebook is the creator. Forking is a v3 question if it ever becomes one.
- **No upstream Paradigm dependency for installing Atelier.** TD-275. Atelier installs and runs standalone; Paradigm presence deepens the engine but is not a gate.
- **No nevr.land hosting of executables.** TD-229. Skills are prompts + docs. Recipes are YAML structure. Asset packs are explicitly-licensed bundles. Nothing runs.

---

## Cross-Cutting Principles

Every phase must respect these. They are the invariants — if a phase deliverable violates one, the deliverable is wrong, not the principle.

- **Local-first is architectural, not aspirational.** No upload paths exist in code for notebooks or mind-map. (TD-540, TD-271)
- **Inert public artifacts only.** If it executes, it doesn't go on nevr.land. Skills, recipes, and asset packs are viewable, diffable, reviewable. (TD-229)
- **Creator owns their edge.** The persona is shared; the notebook is theirs. Style learned from a creator never trains anything published. (TD-271, TD-210)
- **Propose vs. assert by mode.** Every agent surfacing action must branch on Ambient vs. Explicit. Default is asked, never assumed. (TD-646)
- **Paradigm-native engine, standalone surface.** Atelier installs without Paradigm. With Paradigm, the engine deepens. No hard upstream dep at install. (TD-275)
- **Stable seams over present-tense integrations.** Where the long-term answer is uncertain (generation, future hosted-anything reversal), build a typed interface so the swap is mechanical. (TD-088)

---

## Open Questions for Next Session

These surfaced while writing the roadmap and are not resolved by the eleven decisions. Leave them crisp until the next design session.

1. **Soft-surface threshold in Ambient mode.** How does the agent team decide its hypothesis is confident enough to surface, given that the creator never gets auto-prompted? Is it a numeric threshold, a heuristic, or a per-skill calibration?
2. **Iteration history vs. layer-tag-isolation.** The DocumentStore's source-tagged mutation model has a layer-tag-isolation invariant. How does Project iteration history (Phase 2) interact with that — is iteration a layer-tag dimension, a higher-level wrapper, or orthogonal?
3. **nevr.land "registered against agents."** TD-229 says community skills/recipes are published *against registered agents*. What is the manifest format for this registration? Where does it live? Who validates it at publish time?
4. **Mind-map ingestion privacy at the directory level.** TD-271 says nothing leaves the laptop. But ingestion directories may contain assets the creator wouldn't even want indexed locally (private albums, etc.). Do we need an opt-in directory contract or a sentinel-file ignore mechanism?
5. **Iteration history retention.** Unbounded iteration history will balloon disk usage. What's the retention/compaction policy, and does it differ by content type?
6. **Generation seam observability.** When the seam routes through an external provider, what does the recipe-replay log capture — the prompt, the provider, the output hash? Necessary for reproducibility, dangerous for privacy if mishandled.
7. **Asset-pack license enforcement.** TD-229 says asset packs are *explicitly-licensed*. What's the schema for license declaration, and does install-time validation refuse packs with ambiguous licensing?

---

## Next Session

When you wake up, **Phase 0 is ready to execute.** It is doc- and YAML-only, fully scoped, and dependency-free. Specifically:

1. Review `.paradigm/personas/index.yaml` (currently empty) and the persona manifest schema sketch in Phase 0 above.
2. Greenlight the canonical persona definitions for `#quill-showrunner`, `#lux-cinematographer`, `#iris-composer` — or redirect on naming/scope before they get instantiated.
3. Greenlight the artifact-spec scope for Phase 1 (DESIGN/SCRIPT/STORYBOARD as the three artifacts, owned by Quill/Quill+Lux/Lux respectively).
4. Decide whether the seven open questions need a working session before Phase 0 begins, or whether they can be answered in flight.

Phase 0 lands persona identity. Phase 1 lands the front-of-pipeline contract. Phases 2–4 build the substrate (Project model, agent wiring, mind-map) that the live loop runs on. Phase 5 closes the rendering gap and lays the generation seam. Phases 6–7 turn the system outward to the community without violating a single privacy invariant.

The build sequence falls out of the decisions. The decisions are made. Execute.
