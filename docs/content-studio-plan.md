# Atelier Produce — Content Studio Plan

> **Status:** Draft — owner-approved direction 2026-10-08
> **Scope:** `atelier produce` — the content counterpart to `atelier design` (docs/design-studio-plan.md). Deep, reference-backed direction for static and video content (video first), turned into a repeatable per-episode pipeline with platform knowledge built in.

## Why

A content series is dozens of pieces per episode: the long-form cut, intro/end cards, thumbnails, shorts, captions, descriptions, chapters, podcast feed assets, social posts, newsletter, guest kits. Today each one is re-decided every episode. Atelier already owns brand direction, ingest, transcription, trimming, and Hyperframes rendering. What's missing is **deciding the format once, deeply — and then running it every episode with almost no friction.**

## Two layers

| Layer | When | What happens | Output |
|---|---|---|---|
| **Series kit** | Once per series; revisited when the format changes | Deep, board-based direction session (same mechanics as `atelier design`) | `series-kit.yaml` + `KIT.md` + render templates |
| **Episode run** | Every episode | Raw footage in → kit applied → creator approves at a few checkpoints → publish package out | `episodes/<id>/package/` + publish checklist |

The deep conversation happens once. Repetition happens in the run.

## Invocation

```sh
atelier produce                    # start/continue: kit session if the series has no kit, else a new episode run
atelier produce kit [--deep]       # (re)open the series kit session
atelier produce episode <media>    # run an episode from raw footage
atelier produce plan               # deliverable map + schedule for the series
```

Natural language is the primary entry, via a user-level **`atelier-produce`** skill installed by `atelier setup`:

```
can we use atelier produce for my podcast?
atelier produce the new episode — footage is in ~/Footage/ep12
```

Same kickoff shape as `atelier design`: resolve intent (kit / episode / plan) → load the brand cascade + series → ask Quick/Deep → start the surface → first boards or first checkpoint.

## Where it lives

Workspace = brand, project = series — the existing v2 cascade:

```
<workspace>/
├── _brand/                         ← brand cascade (inherited)
├── _packs/                         ← asset packs (logos, music beds, lower-thirds…)
└── projects/<series>/
    ├── DESIGN.md · SCRIPT.md · STORYBOARD.md   ← existing v2 artifacts (series tier)
    ├── KIT.md                      ← narrative of the format (generated)
    ├── .atelier/
    │   ├── series-kit.yaml         ← decided format: tokens, templates, rules, platform plan
    │   └── sessions/<id>/          ← kit sessions (session.yaml + refs/)
    ├── templates/                  ← Hyperframes intro/end card, lower-third, short layouts, thumbnail template
    └── episodes/<NNN-slug>/
        ├── media/  transcripts/
        ├── episode.yaml            ← run state, checkpoints, decisions
        └── package/
            ├── youtube/            ← master w/ cards, thumbnail(s), title, description, chapters, tags, end screen notes
            ├── shorts/             ← vertical clips + captions + per-platform copy
            ├── podcast/            ← audio master, episode art, show notes
            ├── social/             ← LinkedIn / X posts, quote cards
            ├── newsletter/         ← written piece from the transcript
            ├── guest-kit/          ← clips, quote cards, copy for guests
            └── CHECKLIST.md        ← publish steps + platform check results
```

## Crew

| Persona | Owns in `atelier produce` |
|---|---|
| **Patrick** — Producer (new) | The plan: deliverable map, platform knowledge + specs, schedule/cadence, the recording spec, and running the episode pipeline end to end. Runs kit sessions (like Luna runs design sessions) and every episode run. |
| **Quill** — Showrunner | Story and words: hooks, titles, descriptions, chapters, show notes, newsletter, social copy; *why* a moment works as a short. |
| **Lux** — Cinematographer | All content visuals, static and moving: intro/end cards, thumbnail system, lower-thirds, vertical framing, caption look, quote cards. |
| **Iris** — Composer | Builds and renders: Hyperframes templates, the long-form master, shorts, thumbnails, audio master. |
| **Luna + Mika** | Consulted when content touches product UI (e.g. app screenshots/demos in an episode); otherwise not involved. |

Disagreements (e.g. Quill's best hook vs. Lux's framing constraint) reach the creator as an annotated choice — same rule as design.

## Series kit — boards

Same mechanics as `atelier design`: every option visible immediately; **See reference** renders on demand from the creator's own material; pick / mix & match / notes / skip; every decision writes into `series-kit.yaml`. In terminal mode, "See reference" is a real answer option.

| Board | Owner | "See reference" renders |
|---|---|---|
| **Series intent** — audience, promise, tone | Producer + Quill | — |
| **Platform mix** — which platforms, what goes where, cadence | Producer | The deliverable map for one episode, per platform |
| **Recording spec** — angles, framing safe for 9:16 crop, B-roll, thumbnail-face moments, audio | Producer + Lux | Frame guides over the creator's footage showing what survives each crop |
| **Intro card** | Lux | 3–5 s animated clips per option with the real logo/name (Hyperframes) |
| **End card / end screen** | Lux | Clips with YouTube end-screen element zones overlaid |
| **Thumbnail system** | Lux + Quill | Mock thumbnails from real frames at feed size, mobile size, and next to competitor thumbnails |
| **Lower-thirds / guest IDs** | Lux | Overlaid on a real clip |
| **Short-form approach** — clip length, hook style, framing, pacing | Producer + Quill + Lux | One real short cut three ways |
| **Caption style** | Lux | Applied to a real clip, inside each platform's UI safe zone |
| **Title & description voice** | Quill | A real episode written up per option, with truncation previews |
| **Chapters & show notes format** | Quill | Real episode, both formats |
| **Social & newsletter voice** | Quill | One episode's posts / newsletter intro per option |
| **Quote cards** | Lux + Quill | Real pull quotes, per option, at feed + story sizes |
| **Guest share kit** | Producer | The kit contents for one real episode |

Pre-footage (new series): references use brand assets + placeholder footage, and the recording spec board comes first.

## Platform knowledge → rules

Platform rules live in a versioned knowledge file (`platforms/*.yaml`, shipped with Atelier) and are compiled into `series-kit.yaml` rules for the chosen platforms. Every episode package is checked against them before it's marked ready. Initial coverage:

- **YouTube long-form** — thumbnail 1280×720 (16:9), legible at small sizes; title front-loaded for truncation; chapters start at 00:00 with ≥3 entries; end screen in the final 5–20 s with element-safe layout; description structure (hook line, links, chapters, tags).
- **Shorts / Reels / TikTok** — 9:16; hook in the first 1–3 s; captions and key action inside each app's UI safe zone; per-platform length limits; on-screen text legible on mobile.
- **Podcast feeds (Spotify / Apple)** — square show/episode art (3000×3000), audio loudness target, show notes with timestamps and links.
- **LinkedIn / X** — clip aspect + length per platform, native captions, text-post length.

Platform specs change; each rule cites its source and a `checked:` date, and the Producer flags stale entries.

## Episode run

```
1. Ingest      footage in → media/ ; QC against the recording spec (missing angles, audio issues)
2. Transcribe  transcripts/ (existing atelier transcribe)
3. Trim        silence/false-start trim (existing atelier trim)
4. Words       Quill drafts title options, description, chapters, show notes
5. Shorts      Producer + Quill rank short candidates (hook strength, standalone sense, length fit)
               ▶ CHECKPOINT: creator picks shorts (See reference = rendered previews)
6. Thumbnails  Lux builds variants from real frames using the thumbnail system
               ▶ CHECKPOINT: creator picks thumbnail + title pair
7. Render      Iris renders: long-form master w/ cards + lower-thirds, shorts w/ captions,
               thumbnails, podcast audio master, quote cards
8. Copy        per-platform copy: social posts, newsletter, guest kit
               ▶ CHECKPOINT: creator approves copy (one screen, editable)
9. Check       platform rules against every asset → CHECKLIST.md
10. Package    package/ assembled; publish checklist (Atelier does not auto-publish — TD-902)
```

Steps without a checkpoint run unattended. A re-run resumes from `episode.yaml`, so a crash or a change of mind at step 6 doesn't redo 1–5.

## Repeatability and learning

- The kit is the contract: every episode uses the same templates and rules, so output is consistent without re-deciding.
- Per-episode decisions (which shorts, which thumbnail) are recorded; the Producer surfaces patterns ("you always pick the reaction-face thumbnail") per learning mode.
- Later: pull platform analytics back in to rank what performed and suggest kit revisions — a kit session can be re-opened on a single board.
- Ties to the roadmap item on reference dissection: a reference video can seed kit options ("make our intro feel like this").

## Shared engine with `atelier design`

Both verbs use the same session engine: boards, options, references on demand, decisions → system file, terminal mode now and the studio preview server later. `atelier design` writes `design-system.yaml`; `atelier produce` writes `series-kit.yaml`. Building one advances the other.

## Milestones

1. **Patrick (Producer) persona** + `atelier-produce` skill (terminal mode) + `atelier setup` installs it.
2. **Series kit session** — board bank for content, `series-kit.yaml` + `KIT.md`, references rendered via Hyperframes from the creator's footage/brand.
3. **Platform knowledge** — `platforms/*.yaml` with sources, compiled into kit rules; `atelier produce check`.
4. **Episode run v1** — ingest → transcribe → trim → words → shorts checkpoint → thumbnail checkpoint → render → package, resumable via `episode.yaml`.
5. **Extended deliverables** — social posts, quote cards, newsletter, guest kit.
6. **Preview server** — produce boards and checkpoints in the studio Direction mode (shared with design).
7. **Analytics loop** — performance back into kit suggestions.

## Open questions

- Thumbnail generation: compose from real frames only, or allow generated imagery (and where's the line)?
- Music beds / sound design: in the kit from v1, or later?
- Multi-camera / remote-guest recordings (e.g. separate tracks per speaker) — v1 or later?
