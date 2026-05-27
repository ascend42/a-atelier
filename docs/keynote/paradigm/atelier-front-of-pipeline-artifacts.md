# Atelier Front-of-Pipeline Artifacts — DESIGN.md, SCRIPT.md, STORYBOARD.md

> Specification (v0, pre-Zod). Authored 2026-05-25 as the unblocker for the next session's schema work.
> Binds: TD-2026-05-26-363, TD-2026-05-26-229, TD-2026-05-26-271, TD-2026-05-26-540.
> See `docs/keynote/paradigm/atelier-creator-roadmap.md` (Phases 0 - 2).

## 1. Lead

Atelier ships the **live loop at the back of the pipeline** — a running studio where the creator sees a document compose itself in real time and corrects it inline. To make that loop productive we have to feed it a populated `AtelierDocument` with intention behind every layer, and we have to let humans and agents re-enter the pipeline mid-flight. Hyperframes solved the second problem with **artifact discipline at the front**: a small set of plaintext files that capture brand, narrative, and beats before any rendering happens. Atelier adopts that discipline through three sibling artifacts — `DESIGN.md`, `SCRIPT.md`, `STORYBOARD.md` — authored by the Phase 0 personas, stored as inert Markdown-with-YAML inside the creator's Project folder, and consumed by Iris to mutate the live document. The artifacts are **not the document**; they are the spec that converges into the document. Their job is to be diffable, reviewable, and re-enterable: edit beat 2 and only beat 2 rebuilds; swap a typography token and the next composition pass picks it up.

## 2. Where They Live

The shipped VideoProject convention (`source.mp4`, `project.atelier`, `transcript.json`, `cuts.json`) widens in Phase 2 of the roadmap into a generic **Project** folder. The three artifacts are siblings of `project.atelier`:

```
my-podcast-clip/
  project.atelier         # AtelierDocument JSON — live target
  DESIGN.md               # brand register (Quill)
  SCRIPT.md               # narrative spec (Quill + Lux)
  STORYBOARD.md           # beat-by-beat composition (Lux)
  recipe.atelier.yaml     # optional — installed recipe binding slots
  assets/                 # creator-local bound assets (resolved via mind-map)
    source.mp4            # if video Project
    transcript.json       # Whisper output, word-level
    cuts.json             # editor's cut decisions
  .atelier/
    notebook.md           # per-creator persona notes (private; not an artifact)
    history/              # git-tracked; see below
```

**Revision convention: in-place edit, git history.** We **do not** version artifacts via filename (`SCRIPT.v2.md`). The creator's Project is already a git repo (or a folder Atelier wraps in one — see Phase 2). Agents commit on every authored revision with a Paradigm-style trailer; humans see a normal diff stream. Versioned filenames defeat the re-entry property — Iris should always read `STORYBOARD.md`, not "the latest storyboard file." This matches TD-2026-05-26-271 / TD-540 (local-first, no upload) by keeping all revision metadata inside the creator's own folder.

## 3. DESIGN.md

**PURPOSE.** Capture the brand register the entire Project must respect: who it's for, how it sounds, how it looks, what it must not do. DESIGN.md is the **bridge between a recipe and a Project**. A recipe (per `packages/schema/src/recipe.ts`) encodes recurring DESIGN choices as a preset; when a recipe is attached to a Project, DESIGN.md **defers to the recipe for any field the recipe declares** and explicitly records only **variances**. Without a recipe, DESIGN.md is authoritative.

**AUTHOR.** Quill (Phase 0 persona — voice and brand).

**STRUCTURE.** YAML frontmatter for typed fields; Markdown body for descriptive prose. Sections:

- `audience` — `{ primary: string, secondary?: string, platform: string[] }`. Free-text body for "what they care about, what they scroll past."
- `voice` — `{ descriptors: string[] (3 - 5), references?: string[] }`. Body: forbidden tones, signature phrases.
- `visual_register`
  - `palette` — array of `{ token: string, hex: string, role: "background"|"surface"|"primary"|"accent"|"text-on-dark"|"text-on-light"|... }`. Roles are an enum, not free text.
  - `typography` — array of `{ token: string, family: string, weights: number[], usage: "display"|"body"|"caption"|"mono" }`.
  - `motion_register` — `{ tempo: "snappy"|"steady"|"calm"|"languid", easing_bias: "linear"|"ease-out"|"spring", camera_bias?: "static"|"drift"|"snap" }`.
- `constraints` — `{ max_duration_seconds?: number, aspect_ratios: ("9:16"|"1:1"|"16:9"|"4:5")[], do_not: string[] }`. The `do_not` list is honored by Iris at composition time.
- `brand_references` — `{ logos: { token: string, role: "primary"|"mark"|"wordmark" }[], handles?: { platform: string, value: string }[], page_number_convention?: string }`.
- `variances` (only if a recipe is attached) — Markdown body listing fields where this Project diverges from the recipe, with reason.

Tokens (`palette[].token`, `typography[].token`, `brand_references.logos[].token`) are the names STORYBOARD.md and the AtelierDocument will reference — they belong to the same slot vocabulary as Section 5.

**EXAMPLE.**

```markdown
---
audience:
  primary: Senior product engineers
  platform: [linkedin, x]
voice:
  descriptors: [dry, precise, lightly self-deprecating]
  references: [Patrick McKenzie, Mitchell Hashimoto's talks]
visual_register:
  palette:
    - { token: paper, hex: "#F4EFE6", role: background }
    - { token: ink,   hex: "#1A1A1A", role: text-on-light }
    - { token: ember, hex: "#C9533C", role: accent }
  typography:
    - { token: display, family: "GT Sectra", weights: [400, 700], usage: display }
    - { token: body,    family: "Inter",     weights: [400, 500], usage: body }
  motion_register: { tempo: steady, easing_bias: ease-out, camera_bias: static }
constraints:
  max_duration_seconds: 75
  aspect_ratios: ["9:16", "1:1"]
  do_not:
    - No stock business handshakes
    - No emoji in supers
brand_references:
  logos:
    - { token: mark-primary, role: mark }
  handles:
    - { platform: x, value: "@ascend42" }
  page_number_convention: "n / N, bottom-right, body font, 60% opacity"
---

# Voice notes

Punchy openings; one idea per beat. The accent color (ember) is rare — reserve for
the single most important word per beat. Never two ember words on screen at once.
```

## 4. SCRIPT.md

**PURPOSE.** Capture the narrative — what is said, in what order, with what intent — independent of how it will be shot. SCRIPT.md is the **single source of truth for beat duration before VO exists**; once TTS (Phase 5) or recorded VO produces `transcript.json`, the transcript's word-level timestamps **supersede** the script's text-derived estimates for any beat marked `bind_to_transcript: true`.

**AUTHOR.** Quill drafts; Lux refines for shootability (flags lines that won't compose, suggests beat splits).

**STRUCTURE.** Two modes — the artifact declares which.

- **Narrated mode** (`mode: narrated`): four blocks from the Hyperframes lineage — `hook`, `story`, `proof`, `cta`. Each block is an ordered list of beats, each beat:
  - `id: string` (kebab-case, unique per Project)
  - `copy: string` (the spoken/displayed line)
  - `intent: string` (one sentence — *why* this beat exists)
  - `est_duration_s: number` (text-derived; ~2.5 words/sec for steady tempo)
  - `bind_to_transcript: boolean` (default `true` for narrated; if `true`, post-VO Iris pulls real duration from `transcript.json`)
- **Non-narrated mode** (`mode: carousel` | `text-only`): a flat ordered list of beats, each with `copy`, `intent`, `est_duration_s`, and no transcript binding.

Top-level YAML: `mode`, `target_duration_s` (creator's intent), `language`, `tts_voice?` (slot reference, e.g. `voice.host.primary` — resolved at TTS time).

**EXAMPLE.**

```markdown
---
mode: narrated
target_duration_s: 60
language: en-US
tts_voice: voice.host.primary
---

# Hook
- id: hook-1
  copy: "Most agent frameworks are loops with extra steps."
  intent: "Contrarian opener; primes the listener to disagree, then keeps watching."
  est_duration_s: 2.8
  bind_to_transcript: true

# Story
- id: story-1
  copy: "I spent six months building one. Here's what actually mattered."
  intent: "Establish receipts; promise specificity."
  est_duration_s: 3.6
- id: story-2
  copy: "Three things. Each one is boring. Each one matters."
  intent: "Set the rule-of-three frame for the proof block."
  est_duration_s: 3.2

# Proof
- id: proof-1
  copy: "One: structured artifacts beat clever prompts."
  intent: "Lead with the most defensible claim."
  est_duration_s: 3.0
- id: proof-2
  copy: "Two: the loop must run locally or it will not run at all."
  intent: "Local-first stake-in-the-ground."
  est_duration_s: 3.6
- id: proof-3
  copy: "Three: personas are cheap; recipes are the unit of trade."
  intent: "Set up the CTA."
  est_duration_s: 3.4

# CTA
- id: cta-1
  copy: "Atelier. Link in bio."
  intent: "Single token call-to-action; no verb pileup."
  est_duration_s: 1.8
```

## 5. STORYBOARD.md

**PURPOSE.** Translate SCRIPT beats into compositional beats — for each, a timing window, a mood, a camera, the asset slots required, the animation techniques to apply, the transition into the next beat, and any SFX. STORYBOARD.md is the **direct input to Iris**: when Iris mutates the live `AtelierDocument`, she walks this file beat by beat.

**AUTHOR.** Lux (Phase 0 persona — composition and motion).

**STRUCTURE.** YAML frontmatter for the technique library reference; Markdown body containing an ordered beat list. Each beat:

- `id: string` — **must match a SCRIPT.md beat id** (or be prefixed `b-roll.*` for storyboard-only beats with no script line).
- `window: { start_s: number, end_s: number }` — initial; rebound to transcript when present.
- `mood: string[]` — adjectives from a closed vocabulary (`tense`, `warm`, `clinical`, `mischievous`, ...).
- `camera: { kind: "static"|"drift"|"push"|"pull"|"whip", subject?: string }`.
- `slots` — **typed slot references, not file paths** (TD-2026-05-26-229). Examples:
  - `image.b-roll.tech` (category.subcategory)
  - `image.logo.primary`
  - `text.super.from-script` (text drawn from the matching script beat)
  - `text.lower-third.handle`
  - `audio.sfx.transition.whoosh`
  - `video.cut.<cut-id>` (resolves through `cuts.json` for video Projects)
- `techniques` — array of strings from the **Animation Technique Library** (a closed enum maintained alongside the schema): `["text.split-reveal", "image.ken-burns.slow", "super.weight-pulse-on-keyword"]`. Iris refuses unknown techniques.
- `transition_out` — `{ kind: "cut"|"dip-to-color"|"whip"|"crossfade", duration_s?: number, color?: token-reference }`.
- `sfx?` — array of `audio.*` slot references with `gain_db`.

**SLOT VOCABULARY CONVENTIONS.** Three segments, dot-separated: `<kind>.<category>.<specifier>`. Kind is from a closed set: `image | video | audio | text | font | voice | logo`. Category and specifier are creator-extensible but should reuse names from the recipe when one is attached. Slots are **bound locally** through the creator's mind-map (per TD-229) — STORYBOARD does not know which file resolves `image.b-roll.tech`; Iris asks the mind-map at bind time. This is what makes the same STORYBOARD portable across creators.

**EXAMPLE.**

```markdown
---
technique_library_version: 1
aspect_ratio: "9:16"
---

## hook-1
window: { start_s: 0.0, end_s: 2.8 }
mood: [clinical, dry]
camera: { kind: static }
slots:
  - text.super.from-script
  - image.b-roll.code-monitor
  - font.display
techniques:
  - text.split-reveal
  - super.weight-pulse-on-keyword
transition_out: { kind: whip, duration_s: 0.18 }
sfx:
  - { slot: audio.sfx.transition.whoosh, gain_db: -6 }

## story-1
window: { start_s: 2.8, end_s: 6.4 }
mood: [warm, confessional]
camera: { kind: push, subject: face }
slots:
  - video.cut.host-talking-01
  - text.lower-third.handle
techniques:
  - image.ken-burns.slow
transition_out: { kind: cut }

## proof-2
window: { start_s: 13.2, end_s: 16.8 }
mood: [grounded, declarative]
camera: { kind: static }
slots:
  - text.super.from-script
  - image.b-roll.local-machine
techniques:
  - text.split-reveal
  - background.color-shift-to-token
transition_out: { kind: dip-to-color, duration_s: 0.22, color: ember }
```

## 6. The Convergence — Artifacts to AtelierDocument

The three artifacts are **inert** (TD-2026-05-26-229); they do nothing until an agent reads them. The Phase 0 flow:

1. **Quill** drafts `DESIGN.md` from the creator's brief (or the attached recipe). If a recipe is attached, Quill writes only `variances`.
2. **Quill + Lux** co-author `SCRIPT.md`. Quill owns the prose; Lux flags beats that will not compose (too long, no visualizable subject, conflict with `do_not`).
3. **Lux** derives `STORYBOARD.md`, one storyboard beat per script beat (plus any storyboard-only `b-roll.*` beats). Lux picks techniques from the library and writes slot references — never file paths.
4. **Iris** reads all three. She loads the attached recipe (if any), resolves DESIGN tokens, walks STORYBOARD beats, queries the **mind-map** for each slot reference to bind to a local file (TD-229), and **mutates the live `AtelierDocument`** via the MCP surface — adding layers, states, deltas, assets, and variables that match the recipe schema (`packages/schema/src/recipe.ts`, `VariableSchema` `asset` type).
5. The creator **watches the document populate in the studio**. They correct in the live loop — drag a layer, change a color, retime a beat. Under the creator's chosen learning mode, those corrections feed back: changes that are structural propagate to the matching beat in `STORYBOARD.md`; changes that are brand propagate to `DESIGN.md`; changes that are private taste land in `.atelier/notebook.md` (the per-creator persona notebook — not an artifact).

The artifacts are the **spec**; `project.atelier` is the **build**. The live loop is the **edit surface**. All three coexist.

## 7. The Re-Entry Property

This is the property Hyperframes earned and we are buying:

- **Edit STORYBOARD beat 2.** Iris diffs the storyboard, identifies one changed beat, rebuilds only the corresponding `AtelierDocument` layers and states. Adjacent beats untouched.
- **Swap a slot binding via mind-map.** The storyboard does not change. Iris re-resolves the affected slot and replaces the asset reference inside `project.atelier`. Same composition, different content. This is the install-a-recipe-on-your-own-library move.
- **Update DESIGN typography.** No artifact below DESIGN changes. The next composition pass — triggered manually or by the live loop's reconcile — picks up the new typography token. Existing beats restyle.
- **Add a SCRIPT beat between proof-1 and proof-2.** Quill writes the beat. Lux adds the matching storyboard beat. Iris extends the document with the new layers and shifts subsequent timing windows. Earlier beats unchanged.
- **Re-record VO.** A new `transcript.json` lands. Beats with `bind_to_transcript: true` rebind their windows. The storyboard's `window` fields update; techniques and slots are preserved.

Each of these works because the artifacts are diffable plaintext **and** the live loop can reconcile against them. The hybrid is the point.

## 8. Out of Scope

- **No executable content.** No JS, no expressions, no template logic. If a value needs to be computed, it is computed by Iris from the typed fields.
- **No bundled assets.** STORYBOARD references slots; binding happens locally via mind-map. The artifacts can be shared, forked, or recipe-installed without moving binary files (TD-2026-05-26-229, TD-271/540).
- **No persona-private notes.** Quill's internal voice memos, Lux's "I'd love to try X here" — those go in `.atelier/notebook.md`, scoped per creator. Notebooks are not artifacts and are not consumed by Iris.
- **No publishing metadata.** Caption, hashtags, platform-specific cropping recipes — these belong to the **recipe**, not the artifact. The artifact describes the *piece*; the recipe describes *how this creator ships pieces*.
- **No rendering parameters** (codec, bitrate, format). Render config is a Project-level setting, not an artifact field.

## 9. Open Implementation Questions

Resolve at the start of the Zod session:

1. **YAML-with-Markdown vs Markdown-with-YAML-frontmatter.** This spec uses frontmatter + body for DESIGN/SCRIPT and frontmatter + structured Markdown sections for STORYBOARD. Confirm or unify. Recommendation: frontmatter + Markdown body universally — it diffs better and editors render it natively.
2. **Duration validation strictness.** Hard-fail if sum of beat durations exceeds `target_duration_s`? Warn only? Recommendation: warn pre-VO, hard-fail post-transcript-binding.
3. **Slot vocabulary openness.** Closed enum (refuse unknown `image.*` subcategories) or creator-extensible namespace? Recommendation: closed `kind` segment, open `category.specifier` — same posture as recipe variables.
4. **Technique library versioning.** Beat declares `technique_library_version`; Iris refuses if mismatch. Confirm versioning policy (semver vs integer).
5. **Recipe variance representation.** Free-text Markdown body or structured `variances:` list in frontmatter? Recommendation: structured list of `{ field, value, reason }` — agents need to diff variances.
6. **Beat IDs across artifacts.** Enforce SCRIPT beat ids appear in STORYBOARD (except `b-roll.*`)? Recommendation: yes, validated at Iris load time, surfaced as a Paradigm gate.
7. **Multi-language SCRIPT.** Single `language` per artifact, or sibling `SCRIPT.es.md` files? Recommendation: sibling files; defer.
8. **Git wrapping.** Does Atelier auto-`git init` a Project if not already a repo? Recommendation: yes, with an opt-out — the in-place-edit revision convention depends on it.
9. **Learning-mode feedback routing.** What classifies a correction as "structural" vs "brand" vs "private"? Recommendation: deterministic rules first (layer-shape changes → STORYBOARD; token changes → DESIGN; everything else → notebook), agent-classified later.

## 10. Closing

These three artifacts are the contract. Phase 0 personas — Quill, Lux, Iris — **author against this contract** (TD-2026-05-26-363); Phase 2's Zod schemas **encode it**. The artifacts are inert, local, diffable, and re-enterable; they sit as siblings of `project.atelier` inside the creator's own folder; they reference assets through typed slots that the mind-map binds at compose time. They preserve the property that made Hyperframes legible — *humans can re-enter the pipeline mid-flight* — and they hand off cleanly to the live loop that is Atelier's actual edge. Tomorrow's session writes the Zod. Tonight, this is the spec it writes against.
