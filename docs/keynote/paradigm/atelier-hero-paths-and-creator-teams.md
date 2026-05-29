# Atelier Hero Paths & Creator Teams
### The team's outlook: three cold-start strategies for one per-creator learning agent team

**The unifying insight.** The owner's three "hero paths" are not three products — they are **three cold-start strategies for the same thing: a per-creator agent team that learns the creator's style and gets faster over the life of their work.** Atelier already has the substrate this requires sitting idle and half-built: an empty personas roster (`.paradigm/personas/index.yaml` → `personas: {}`), the agent-notebook + ambient-learning + nomination/promotion machinery, and a recipe system whose schema (`packages/schema/src/recipe.ts`) plus the document-model `VariableSchema` (`packages/schema/src/variable.ts`, which already includes an `asset` type) compose into parameterized house-style. The thesis from the prior assessment holds and extends: *Hyperframes ships artifacts; Atelier ships a live loop.* The hero paths add the missing front-of-loop — they are how a creator's agent team is **seeded** so the live loop has a point of view from day one rather than starting blind.

---

## 1. Why "cold-start strategy" is the right frame

Every creator who arrives needs a Quill/Lux/Iris team (Decision B, TD-2026-05-26-363) — but a fresh team knows nothing about *them*. The differentiator between the three archetypes is **how much prior signal exists to seed the team's notebooks and recipes on day one.** The Shooter brings none; the Imitator brings someone else's; the Veteran brings their own. The learning loop after seeding is identical for all three: the team works inside the live document, the creator corrects, ambient learning captures the correction, nominations promote durable patterns into notebooks and recipes. The cold-start is the only variable. That is why these three belong in one outlook, not three.

---

## 2. The three hero paths

Each path has the same shape: **who, cold-start, learning loop, what already serves it, what's net-new.**

### The Shooter — learn by doing (low/no direction)

- **Who.** Knows they want to shoot but has no established style.
- **Cold-start.** Empty team. A default starter recipe and an empty creator notebook. The team is honest about not knowing yet and proposes rather than asserts.
- **Learning loop.** Pure ambient learning. Every co-edit correction ("smaller captions," "my handle bottom-right") is a signal; the nomination→promotion pipeline crystallizes repeated corrections into notebook entries and, eventually, a saved recipe that *is* their emerging style.
- **Already serves it.** The live loop is the entire mechanism (`packages/mcp/src/store.ts`, source-tagged mutations). Recipe `save` (one of the 5 MCP tools) captures the crystallized style. University tracks ATEL-501/601/801 already teach the flow the team will run.
- **Net-new.** The ambient-learning → recipe-write bridge for creative preferences (today the learning machinery exists but isn't wired to *author Atelier recipes*); a "style confidence" notion so the team knows when it has learned enough to stop asking.

### The Imitator — bootstrap from reference creators (style transfer)

- **Who.** Wants to copy another creator's (or a blend of several) content style to start learning from day one.
- **Cold-start.** Ingest reference content → **extract a style → write it into a seed recipe + seed notebook.** This is the team's most opinionated cold-start: it begins with a strong prior.
- **Learning loop.** Same ambient loop as the Shooter, but starting from an inherited style that the creator then diverges from — the team tracks the drift from "imitated" toward "theirs."
- **Already serves it.** `atelier_import_images` for reference ingest; the recipe schema as the target representation; reserved fields `palette` / `transition_kit` / `caption_highlight` as natural destinations for extracted style.
- **Net-new — and this is the heaviest lift of the three.** Style *extraction* is an inference pipeline Atelier does not have: parsing a reference creator's captions, pacing, palette, and overlay habits into structured recipe fields. Be candid — this is real ML/analysis work, not a wiring job, and it is the path most likely to underdeliver at first. Recommend shipping it as "extract what's mechanically observable" (palette, caption cadence, aspect ratio) before attempting taste.

### The Veteran — encode an existing voice (established process)

- **Who.** Already makes content with an established voice; wants their local team to make their *existing* process faster.
- **Cold-start.** Ingest the creator's own **back-catalog** to seed recipes + notebooks fast. Highest-value, lowest-ambiguity seed — the reference *is* the target, no taste transfer required.
- **Learning loop.** Less "learn what they like," more "encode what they already do" — the team's job is acceleration and consistency, not discovery. Corrections refine the encoded process.
- **Already serves it.** Same ingest + recipe substrate as the Imitator, but pointed at the creator's own work; the detected-vs-user-edited invariant means re-runs never destroy the Veteran's hand-tuning.
- **Net-new.** Back-catalog ingest that reads finished videos/posts *back* into recipe fields (the inverse of today's forward composition); a "this is how you usually do it" confirmation surface so the Veteran validates the encoding rather than trusting it blind.

> **Honest asymmetry:** Veteran is the easiest win (self-reference, no taste transfer), Shooter is the most patient (slow accrual), Imitator is the hardest and riskiest (style extraction from someone else's work). Sequence accordingly.

---

## 3. The unifying object model

Everything organizes into **Projects → iterations → content types.** The good news: **today's shipped VideoProject folder convention already is this model in miniature** — generalize it, don't replace it.

| Concept | Today (shipped) | Generalizes to |
|---|---|---|
| **Project** | VideoProject folder (`source.mp4`, `project.atelier`, `transcript.json`, `cuts.json`, `export/`) | A Project dir holding one-to-many content items of any type, with an attached recipe and a slot in the mind-map graph |
| **Iteration** | Re-runs of trim/transcribe, preserved via layer-tag isolation + detected-vs-user-edited | First-class iteration history per Project — each pass a tagged snapshot, user edits always survive |
| **Content type** | video (clips), carousel (image folders), single image | Same three, unified under one Project; a video Project holds 1→N clips, each its own `.atelier` doc |
| **Recipe** | `.recipe.{yaml,json}` in project + `~/.atelier/recipes/` | Attached per repeatable Project *type*; the creator's house style for "podcast clips" vs "product carousels" |
| **Assets / mind-map** | Per-doc assets (`AssetSchema`) | The cross-Project knowledge/asset graph (Section 4) |

The load-bearing move: a **Project** is the VideoProject convention widened to admit carousels and images as siblings of clips, with an **iteration** being the already-shipped re-run-without-destruction mechanic promoted to a named, queryable history. Nothing here orphans what shipped — it widens it.

---

## 4. The mind-map / asset-knowledge graph

This is **largely net-new — say so plainly.** The "mind map" is the agent team's curated graph of *everything a creator's work touches*: clips, the known image/content/meme directories, recipes, and project history — with edges the team uses to answer "what graphic goes here?"

- **What it is.** A knowledge+asset graph: nodes are assets (clips, memes, graphics, recipes, past Projects), edges are usage and provenance ("this meme appeared in 4 podcast clips," "this recipe derives from that reference creator").
- **How the team uses it.** When a storyboard beat calls for a graphic, the team *queries the graph* (by topic, by past co-occurrence, by recency) instead of asking the creator to go find a file. Over time the graph is the creator's institutional memory.
- **What it stands on (don't reinvent).** The per-doc `AssetSchema` is the leaf representation; Paradigm's existing graph + lore + navigator infrastructure (`aspect-graph.db`, lore timeline) is the proven pattern for "a queryable graph the agent curates." The mind-map is a *creator-asset* instance of machinery Paradigm already runs for *code*.
- **The shape.** A per-creator graph store, indexed directories the team can scan, and curation as an ambient-learning behavior (every Project that uses a meme strengthens an edge). The hard part is not the data structure — it's **disciplined ingest of messy local meme/content folders and keeping the graph honest as files move.**

---

## 5. Recipes as a shared, parameterized template ecosystem

This is the part the owner is most excited about, and it splits cleanly into an **easy half** and a **hard half.**

**The easy half (mostly already here).** Recipes become **parameterized templates** by leaning on two existing systems: the document-model `VariableSchema` (with its `asset` type — exactly the seam for swappable graphics/memes) and the reserved recipe fields `palette` / `transition_kit` / `caption_highlight` / `audio_policy` / `aspect_targets` (`recipe.ts:147-151`). A shared recipe declares variables ("typography," "accent palette," "intro meme set") with defaults; an importing creator swaps them. Promoting reserved fields from parse-opaque to first-class is *natural extension*, not net-new — the schema was built anticipating it.

**The hard half (this is where it gets real).**

| Hard problem | Why it bites |
|---|---|
| **Asset portability** | A shared recipe references memes/graphics that live on the author's disk. The template travels; the assets may not. Needs an asset-bundling or asset-variable convention (the `asset`-typed variable is the hook, but resolution across machines is unsolved). |
| **Licensing / attribution** | Sharing a recipe that embeds someone's graphics or imitates a creator's voice raises rights questions Atelier has never had to touch. |
| **Trust / quality** | A registry of community recipes needs versioning, attribution, and some quality signal, or it fills with noise. |
| **Distribution surface** | Sharing implies a hosted place to share *to*. There is no backend today. |

That last row is the connective tissue: **recipe sharing is the killer app for Decision C's hosted tier (TD-2026-05-26-720).** Local-first stays default; the registry/marketplace is exactly the additive hosted surface the owner already committed to — layered on the same bridge/DocumentStore protocol, sequenced after the agents land.

---

## 6. How it sits on the prior decisions

The vision is coherent with the three decisions already taken — it *is* their natural extension:

- **Decision B (agents ship with Atelier).** The per-creator learning team is Quill/Lux/Iris instantiated as persona instances on the empty roster, each accruing notebook knowledge. The hero paths are how those instances are seeded.
- **Decision C (hosted, additive).** Recipe sharing + any creator-facing surface (the registry, cross-machine asset resolution, the mind-map for non-developers) *requires* the hosted tier. The owner's sharing excitement and Decision C are the same bet.
- **Decision A (generation seam).** The Shooter and Imitator both eventually want "make me a graphic for this beat." The generation seam (TD-2026-05-26-088) means that drops in later without reshaping the team's flow — the mind-map asks "do we have a graphic?" first, generation is the fallback.

Nothing in the vision fights a prior decision. It pulls all three forward toward the same product.

---

## 7. The team's candid outlook

**What's natural (the wins).**
- The live loop *is* the learning surface — corrections are already source-tagged signals; we are wiring an existing pipeline, not inventing one.
- Recipe parameterization is mostly schema promotion (`VariableSchema` + reserved fields exist).
- The Project/iteration model is the shipped VideoProject convention widened — low structural risk.
- The Veteran path is a near-term win that proves the whole thesis cheaply.

**What's net-new and heavy (the lifts).**
- **Style extraction** (Imitator) is a genuine inference pipeline, not wiring.
- **The mind-map graph** is largely net-new ingest + curation, even if it stands on Paradigm's graph patterns.
- **Cross-machine asset portability** for shared recipes is unsolved and load-bearing for the feature the owner most wants.
- **The hosted registry** is real backend work (auth, persistence, versioning, trust) that doesn't exist yet.

**Top risks.**
1. **Imitator overpromise** — "copy any creator's style" implies taste transfer we can't deliver early; it will disappoint if shipped as more than mechanical-style extraction.
2. **Mind-map rot** — a graph over messy local meme folders goes stale fast as files move; an out-of-sync graph is worse than no graph because the team confidently fetches the wrong asset.
3. **Sharing without portability** — shipping recipe sharing before asset resolution means shared recipes that render broken on the recipient's machine, poisoning trust in the registry on day one.
4. **Learning that doesn't converge** — ambient learning that captures noise (one-off corrections) as if it were style produces a team that "learns" the wrong things; needs a confidence/promotion threshold or it degrades.

---

> **🔄 Resolved 2026-05-26.** All four open questions below were answered in the same evening's working session. The resolutions are recorded as Paradigm decisions and absorbed into the consolidated roadmap at **`docs/keynote/paradigm/atelier-creator-roadmap.md`**. Annotated resolution-pointers per question:
> 1. **Auto-learn vs explicitly-taught** → **TD-2026-05-26-646** — system asks at setup; Ambient or Explicit; creator chooses; no auto-prompts to switch.
> 2. **Persona-per-creator vs shared+per-creator-notebook** → **TD-2026-05-26-210** — shared Paradigm-published canonical personas, per-creator notebooks are the differentiator.
> 3. **Recipe-sharing model + asset portability** → **TD-2026-05-26-229** (nevr.land for inert artifacts, recipes are structure with asset slots, mind-map binds locally) + **TD-2026-05-26-540** (local-first wins, no hosted Studio) + **TD-2026-05-26-684** (no paid marketplace, no subscriptions).
> 4. **Privacy of memes/recipes/extracted style** → **TD-2026-05-26-271** (notebooks/mind-map creator-owned, never leave the laptop — enforced by architecture under local-first) + **TD-2026-05-26-902** (extracted recipes default to `personal-use: true`, not publishable).
>
> The §8 prose below is preserved as the original framing.

## 8. Open questions for the owner

1. **Auto-learn vs explicitly-taught.** Should the team accrue style silently from corrections (ambient), or should creators explicitly teach/confirm ("yes, that's my style now")? Most likely a blend — but where's the default, and how much does the team ask vs assume?
2. **Persona-per-creator vs shared-personas-with-per-creator-notebooks.** Does each creator get distinct Quill/Lux/Iris *instances*, or shared persona definitions with per-creator *notebooks*? The existing personas/notebooks split makes this a clean fork with real cost implications for the hosted tier.
3. **Recipe-sharing distribution model + asset portability.** Curated registry vs open marketplace vs simple export/import — and how do shared recipes carry (or resolve) the memes/graphics they reference across machines? This gates the feature you're most excited about.
4. **Privacy of shared memes/recipes.** A creator's meme/content directories and style are arguably their edge. What is shareable by default, what stays private, and who owns an extracted style derived from someone else's content?

---

*Ground truth cited: recipe schema + reserved fields `packages/schema/src/recipe.ts` (lines 147-151); the variables seam `packages/schema/src/variable.ts` (`asset` type); per-doc assets `packages/schema/src/asset.ts`; empty personas roster `.paradigm/personas/index.yaml`; University tracks `.paradigm/university/index.yaml` (ATEL-501/601/701/801); the VideoProject folder convention and live-loop store `packages/mcp/src/store.ts`. Decisions referenced: TD-2026-05-26-088 (A), TD-2026-05-26-363 (B), TD-2026-05-26-720 (C). Builds on `docs/keynote/paradigm/atelier-creator-flow-assessment.md`.*
