# Atelier Creator-Flow Assessment
### From "edit videos by vibe-coding" to "edit nothing, just talk" — a holistic strategy

**Thesis.** HeyGen's Hyperframes is a *batch artifact pipeline*: seven stages, each dropping a named file on disk, where an agent writes HTML/CSS/JS compositions and a human re-enters anywhere ("rebuild beat 2 with more energy"). Atelier is something different — and arguably stronger at the back of the pipeline: a *live symbiotic loop* where an agent and a human co-edit the **same document simultaneously** (agent mutates via MCP → `DocumentStore.onChange` → WS broadcast → studio re-renders, with selection, undo, and scroll preserved), backed by a recipes/style-as-preset system and a real composition + export engine. **Hyperframes ships artifacts; Atelier ships a live loop.** The owner's "make me a UGC video about X, edit nothing, just talk" vision lands almost entirely on the *front* of the pipeline — capture, design, script, storyboard creative direction — and on the *orchestrating agents* that turn one sentence into a driven pipeline. Atelier has the engine and the loop. It does not yet have the driver or the on-ramp.

---

## 1. The target experience

A creator opens a conversation and says: *"Make me a 30-second talking-head clip about why our new pricing is simpler."* They never touch a timeline. Here is the loop the owner wants, in Atelier terms:

1. **Talk → brief.** The creator describes the video. An orchestrating agent (today nonexistent) reads brand context and asks at most one or two clarifying questions.
2. **Direction, automatically.** The agent establishes brand reference (colors, type, handle), drafts a hook→story→proof→CTA script, and lays out beats with timing — the creative-direction work a human does by hand today.
3. **Voice + timing.** TTS narration is generated; word-level timestamps become the source of truth for every beat's duration.
4. **Build into a live document.** The agent assembles the composition directly into the `AtelierDocument` and pushes it over the bridge. The Studio renders it live.
5. **Co-edit by voice.** The creator watches it render and says *"more energy on the opener, move my handle bottom-right."* The agent mutates the same doc; Studio re-renders in place; the creator's selection and undo history survive. This is the part Atelier already does.
6. **Apply house style.** A Studio Recipe enforces caption style, silence policy, handle and page-number overlays — the creator's brand, applied as a preset, not re-specified each time.
7. **Ship.** Export to MP4/WebM/GIF and publish.

Steps 4–7 are real today. Steps 1–3 are the gap. The owner's friend "edits nothing" because Hyperframes' agents own steps 1–3 *and* the build. Atelier owns a better build-and-edit loop but does not yet own the on-ramp.

---

## 2. Where Atelier is strong today

These are the crown jewels — honest, shipped, and verifiable.

**The live loop (unique).** The WS bridge is real and working: `packages/mcp/src/bridge-protocol.ts` defines the envelopes, `packages/mcp/src/store.ts` holds the `DocumentStore` with `onChange` and human/llm/system source tagging, and the loop only broadcasts llm-source mutations (no echo). Human edits flow back as `doc:patch` and are *not* re-broadcast. Selection and scroll survive LLM mutations (aspects `apply-mutation-preserves-state-and-selection`, `layer-reorder-scroll-preserved`). Hyperframes has artifacts but no live co-edit; this is Atelier's structural advantage.

**Recipes (Phase 1 + 1.5 shipped).** `packages/schema/src/recipe.ts` is a strict Zod schema with live fields for silence policy, caption style, caption grouping, and overlay rules (handle + page-number anchoring, with format-template validation). Five MCP tools (`packages/mcp/src/tools/recipes.ts`) and CLI scaffold/validate/show exist. Style-as-preset is the mechanism that makes "my brand, every time" possible without re-prompting.

**A real composition + export engine.** PNG render is full (`packages/cli/src/lib/render-image.ts`, `packages/canvas/src/render-frame.ts` — painter's algorithm across image/text/shape/ref/video). Browser video export is full (`packages/studio/src/export/video-exporter.ts`: H.264 via WebCodecs, VP9/VP8+alpha via webm-muxer, GIF).

**The CLI video pipeline.** `#video-project`, `#cli-trim` (FFmpeg silencedetect → parametric cuts), `#cli-transcribe` (Whisper/OpenAI → caption layers), and transcript editing all ship, with the load-bearing invariant that re-runs never destroy user edits (detected-vs-user-edited tagging).

**The curriculum already exists.** University tracks ATEL-501/601/701/801 teach the exact flow, including the symbiotic agent loop. The *knowledge* of how to drive Atelier is written down — it just isn't embodied in an agent yet.

---

## 3. Where the gap is

The gap is the **front of the pipeline** and the **orchestrating agents**. Be specific:

**No content-generation agents are instantiated.** Quill (Showrunner — narrative, shot lists), Lux (Cinematographer — visual composition, B-roll, Higgsfield), and Iris (Composer — applies Recipes, authors animation via MCP) exist in **lore only** (`L-2026-05-13-ascend-071455-001.lore`), pinned to the `a-paradigm` project, not instantiated. The personas roster `.paradigm/personas/index.yaml` is literally empty (`personas: {}`). There is no content-gen Claude Code skill. Today "the agent" is a human-driven Claude session calling the 61 Atelier MCP tools by hand.

**No creative-direction artifacts.** Hyperframes' power comes from named files — `DESIGN.md`, `SCRIPT.md`, `STORYBOARD.md`, `transcript.json` — that let a human re-enter anywhere and that give agents a spec to read. Atelier has `transcript.json` (in the video-project) but no design, script, or storyboard artifact and no agent that authors them.

**No image generation, by design.** Atelier ingests external images (`atelier_import_images`) but owns no generation. For a conversation-first UGC product, this is a seam: a creator saying "make me a video about X" cannot tab out to Higgsfield mid-sentence.

**Thin build-side gaps.** MCP video export is missing (browser-only). CLI video export is stubbed (T-003, T-002b). Studio's Timeline UI is unbuilt (T-2026-05-10-008, HIGH); state-machine editor, video-layer editing in Studio, gradient/path editors are stub or partial. These matter less for "talk, don't edit" but matter for the human re-entry moments.

---

## 4. The holistic target architecture

The unifying insight: **Atelier should be the artifact-on-disk + live-loop hybrid.** Hyperframes has artifacts but no live co-edit. Atelier has live co-edit but a thin front-of-pipeline. Adopt Hyperframes' named-artifact discipline for the front (so humans can re-enter and agents have specs to read), then converge into Atelier's `AtelierDocument` for the build/edit/export back end where the live loop already wins.

Map the seven stages:

| Hyperframes stage | Atelier today | What's needed | Artifact on disk |
|---|---|---|---|
| **1. Capture** | None | Capture agent (palettes, fonts, refs from URLs/PDFs) → feeds Design | `.atelier/capture/` |
| **2. Design** | Recipes encode *style*, not full brand reference | Promote Recipe ↔ a brand-reference artifact; agent authors it | `DESIGN.md` (+ links to `.recipe.yaml`) |
| **3. Script** | None | **Quill** — hook/story/proof/CTA, durations from text | `SCRIPT.md` |
| **4. Storyboard** | None | **Quill/Lux** — beats, timing windows, asset refs, animation choices | `STORYBOARD.md` |
| **5. VO + Timing** | `#cli-transcribe` + transcript model (the source-of-truth invariant already exists) | TTS generation step (TTS-out, not just transcribe) | `narration.wav` + `transcript.json` |
| **6. Build** | **Full** — composition engine, render-frame, doc model, live bridge | **Iris** assembles into `AtelierDocument` via MCP; recipe applied | `*.atelier` documents (live, not just files) |
| **7. Validate / Export** | PNG render full; browser video export full; **MCP/CLI video export missing** | Close MCP video export; headless validation pass | snapshot PNGs, MP4/WebM/GIF |

The connective tissue:

- **Recipes** are the bridge between Stage 2 (Design) and Stage 6 (Build). A recipe is the creator's house style applied at build time — the reason "my brand, every time" doesn't require re-prompting.
- **Quill/Lux/Iris** own Stages 3–6. Quill writes the script and storyboard; Lux directs visuals and sources/generates imagery; Iris composes into the live document and applies the recipe. They are the *driver* the engine is missing.
- **The live loop** is Stage 6's edit surface and the entire human-re-entry experience. Where Hyperframes rebuilds a beat from an edited markdown file, Atelier mutates the live doc and the creator sees it change in place.
- **Image/video generation** plugs in at Stages 1 and 4–6 as a pipeline stage with its own artifact, whether owned or orchestrated (see Decision A).

The hybrid is the position: **keep named artifacts for the front (re-entry, agent specs, reviewer handoff); keep the live document for the back (co-edit, export).** Neither competitor occupies both.

---

## 5. The three strategic decisions

Each is a real fork. Positions, not hedges.

### Decision A — Image-generation ownership

**The choice.** (A1) Stay pure composition + ingest; agents orchestrate external generation (Higgsfield) as a pipeline stage that drops artifacts. (A2) Open the boundary so Atelier owns or wraps generation behind its own MCP tools.

**Trade-offs.** A1 keeps Atelier small, dependency-light, and provider-neutral — its current strength. But it is a *fragile boundary for a conversation-first product*: a creator who says "make me a UGC video about X" cannot tab out to a separate Higgsfield CLI. The "edit nothing, just talk" promise breaks the instant generation lives outside the conversation. A2 makes the loop seamless but couples Atelier to a generation provider's API, pricing, and failure modes — and pulls it away from "pure composition engine."

**Recommendation: A2, but wrapped, not owned.** Atelier should not *build* a model, but it must own a **generation MCP tool** that an agent can call inside the conversation — even if that tool shells out to Higgsfield or another provider behind a stable interface. The artifact-on-disk discipline still applies (generated assets land in `.atelier/capture/` or `assets/`), so the boundary stays inspectable and provider-swappable. The conversation must never have a "now go run another tool" gap. Keep ingest (`atelier_import_images`) for the bring-your-own path; add wrapped generation for the talk-only path.

### Decision B — Quill/Lux/Iris instantiation + home

**The choice.** (B1) The agents live in `a-paradigm`, consuming Atelier MCP as a library. (B2) They ship *with* Atelier as Claude Code skills / a plugin.

**This is the load-bearing decision for "edit nothing, just talk."** Without instantiated agents, there is no driver — only a human calling 61 tools. The agents are the product surface the owner's vision actually describes.

**Trade-offs.** B1 keeps content agents in the Paradigm ecosystem where personas/lore tooling lives, and keeps Atelier a clean library. But it means the UGC creator must adopt `a-paradigm` to get the experience — a heavy on-ramp for someone who just wants to talk and ship. B2 mirrors exactly how Hyperframes distributes (a Claude Code skill), puts the agents next to the engine they drive, and lets a creator install one thing.

**Recommendation: B2 — ship with Atelier as a Claude Code skill/plugin.** The plain reading wins: Hyperframes is a skill; Atelier University already teaches this flow (ATEL-501/601/701/801); the owner's vision is a self-contained "talk and ship" product, not a Paradigm add-on. Define Quill/Lux/Iris as concrete personas (populate the empty `.paradigm/personas/index.yaml`), then package them as the Atelier creator skill. Keep their *design lineage* in lore, but their *home* is Atelier. This is the single decision that converts the engine into the experience.

### Decision C — Localhost-only vs hosted

**The choice.** (C1) Stay local-first (127.0.0.1-bound, origin-checked, no db/auth/cloud). (C2) Add a hosted tier as a layered backend — the bridge and `DocumentStore` are already designed future-proof; no backend exists yet.

**Trade-offs.** C1 is the current security posture and is genuinely good for a developer/power-creator. But the owner said "studio web platform **and beyond**," and a UGC creator on a phone, remote-controlling, is not running a localhost Vite server. C2 unlocks the actual audience but introduces auth, multi-user, persistence, and a real attack surface — none of which exist.

**Recommendation: C2 as additive, not replacement.** Local-first stays the default and the developer path. Add a hosted tier as a *layer* on top of the existing bridge/`DocumentStore` design (which was built for exactly this) — auth and persistence around the same envelope protocol, not a rewrite. "And beyond" means the live loop runs in a browser the creator already has open, with the document persisted server-side. Sequence it after B (the agents are what make a hosted surface worth visiting), but commit to the position now so the bridge protocol evolves (e.g., the planned v1.1 JSON-patch) with multi-user in mind.

---

> **🔄 Updated 2026-05-26.** This document captures the original three-decision foundation. The conversation continued through **eleven** total decisions and a reversal of the original Decision C. The current plan-of-record is **`docs/keynote/paradigm/atelier-creator-roadmap.md`** — read that for the live roadmap, the consolidated decision table, and the phased build sequence. See also the team's outlook in `docs/keynote/paradigm/atelier-hero-paths-and-creator-teams.md` and the front-of-pipeline artifact spec in `docs/keynote/paradigm/atelier-front-of-pipeline-artifacts.md`. The sections below remain as historical context for how the first three decisions were framed; **§6–§8 are superseded** by the consolidated roadmap.

## 6. Decisions taken (2026-05-25)

The owner picked a position on all three forks:

- **A — Image generation: stay pure *for now*, wrap *later*.** Atelier keeps owning no generation today; agents orchestrate external generation (Higgsfield) and ingest via `atelier_import_images`. **But** the wrapped-provider path (A2) is an explicit future commitment — so the build should design the agent's generation call as a **seam** (a stable interface with an external implementation now) that a wrapped Atelier MCP tool can drop into later without reshaping the flow.
- **B — Agents: ship with Atelier.** Quill/Lux/Iris become a self-contained Atelier Claude Code skill/plugin, mirroring how Hyperframes distributes. Populate the empty `.paradigm/personas/index.yaml`; keep their design lineage in lore but make their home Atelier. This is the load-bearing turn that converts the engine into the experience.
- **C — Studio: hosted, additive.** Local-first (127.0.0.1) stays the default and dev path. A hosted tier is layered on the existing bridge/`DocumentStore` protocol — auth + persistence around the same envelopes, not a rewrite — sequenced after the agents land.

## 7. Roadmap — now unblocked

A sketch derived from the decisions; the owner sets exact priority and pace.

1. **Agents + front-of-pipeline (B).** Define the creative-direction artifact schemas (`DESIGN.md`, `SCRIPT.md`, `STORYBOARD.md`), instantiate Quill/Lux/Iris as concrete personas, package the Atelier creator skill, and add a TTS-out step for Stage 5 (today's pipeline only transcribes). *Outcome: "talk → driven pipeline" works end-to-end locally.*
2. **Headless build/export.** Close MCP video export (browser-only today) and the CLI FFmpeg encoder (T-003) + WebCodecs demux (T-002b) so an agent can render without a browser open. Land the **generation seam** interface here (external implementation for now, per A). *Outcome: the agent can ship a file unattended.*
3. **Hosted tier (C).** Auth + persistence layered on the bridge; evolve the envelope to JSON-patch (the planned v1.1) with multi-user in mind. *Outcome: the live loop runs in a browser the creator already has open.*
4. **Later — wrap generation (A2).** Drop a provider behind the Phase-2 seam so the creator never leaves the chat.

## 8. Closing

Atelier already owns the hard, defensible half: a real composition + export engine and a *live* agent↔human co-edit loop that Hyperframes does not have. With the three decisions made, the path is clear — **B is the load-bearing first move** (agents turn the engine into the experience), Phase 2 makes it ship unattended, and C answers "and beyond" without abandoning the local-first strength. The on-ramp and the driver are what's left to build; the engine is already here.

---

*Verifiable ground truth cited above: bridge `packages/mcp/src/bridge-protocol.ts`, store `packages/mcp/src/store.ts`, recipes `packages/schema/src/recipe.ts` + `packages/mcp/src/tools/recipes.ts`, ingest `packages/mcp/src/tools/import-images.ts`, render `packages/canvas/src/render-frame.ts` + `packages/cli/src/lib/render-image.ts`, video export `packages/studio/src/export/video-exporter.ts`, empty roster `.paradigm/personas/index.yaml`, agent definitions `L-2026-05-13-ascend-071455-001.lore`.*
