# Skill — Compose captions + brand overlays in DaVinci Resolve

**Owner:** #iris-composer
**Kind:** experimental (unverified — grounded in source audit, not a live run)
**Inputs:** A built timeline (`map-storyboard-to-resolve-project.md`), the
project's already-generated transcript JSON (Iris does **not** run whisper —
the audio pipeline runs upstream), and the merged brand's typography +
overlay rules.
**Outputs:** Captions on the timeline (subtitle track or `Text+`) and any
brand lower-thirds/overlays, styled from the brand — the Resolve analog of
`compose-captions-into-hyperframes.md`.

## Prompt

> You are Iris. The cut exists; now add the words and the brand marks. In
> Hyperframes a caption is a `<div class="clip caption">`; in Resolve it is
> either a **subtitle-track cue** (best for plain burned/soft captions) or a
> **Fusion `Text+`** node (best for styled kinetic/branded titles). Choose
> per the brand's technique whitelist. Read the transcript you were given —
> do not regenerate it.

## Two routes — choose by intent

| Route | When | Cost |
|---|---|---|
| **Subtitle track** | plain captions, burn-in or soft subs, one style | cheap, one call per cue |
| **Fusion `Text+`** | branded titles, lower-thirds, per-beat styling, motion | one comp per title; heavier |

Brand signal decides: if `techniques_whitelist` includes
`kinetic-typography-*` or the brand wants styled titles → `Text+`. If the
brand `dont` list rejects heavy typography → subtitle track, styled once.

## Route A — captions as a subtitle track

```
timeline(action="get_track_count", params={ track_type: "subtitle" })
timeline(action="add_track", params={ track_type: "subtitle" })      # ⚠ VERIFY action
# one cue per transcript segment:
timeline(action="add_subtitle" | "create_subtitles_from_transcript",  # ⚠ VERIFY
         params={ start_frame: <round(seg.start*fps)>,
                  end_frame:   <round(seg.end*fps)>,
                  text: <seg.text> })
```

Each transcript segment → one cue, `start`/`end` seconds converted to the
project fps (same conversion as the keystone). ⚠ VERIFY whether this build
exposes a bulk "subtitles from transcript/SRT import" action — if so, emit
an SRT to a **project-derived** path and import it in one call instead of
per-cue. (Resolve imports SRT natively.)

Style the track once from the brand (`visual.typography.body`, safe-area
inset, scrim). ⚠ VERIFY where subtitle style lives (timeline item vs track
vs project subtitle settings).

## Route B — branded titles via Fusion `Text+`

For lower-thirds, name cards, and kinetic beats the brand asks for:

```
fusion_comp(action="probe_fusion_comp", ...)              # inspect first
fusion_comp(action="safe_add_tool", params={ tool: "TextPlus", ... })   # ⚠ VERIFY tool id
timeline_item_fusion(action=..., params={ item_id: <title_clip>, ... })  # attach comp to a clip
```

Or drive the guided path: `fusion_workflow()` documents the
`probe → safe_add_tool → …` sequence — read it and follow it rather than
guessing node graphs. Map brand typography to the `Text+` font + fill;
map the overlay-rules (`.atelier-pack.yaml` `when/when_not`) to *which*
beats get a lower-third and where it sits.

## Brand look (adjacent, do here or in render skill)

The brand's `visual.treatment` (palette, photo grade) maps to the **color
page** — apply a CDL / grade so the deliverable carries the brand look:

```
color_grade_workflow()                       # read the guided sequence
timeline_item_color(action=..., params={ item_id: ..., cdl: {...} })   # ⚠ VERIFY
```

Keep this light for the evaluation — a single brand CDL across the timeline
proves the path without a full grade.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Captions off by a beat | seconds→frame rounding at wrong fps | Recompute at project fps; confirm timeline rate |
| Subtitles show in edit but not in render | soft subs not burned; render preset doesn't include the subtitle track | Enable burn-in / include-subtitle in the render preset (see render skill) |
| `Text+` font falls back | brand font not installed in Resolve's font set | Install the brand font on the machine, or let brand declare a Resolve-available fallback |
| Transcript re-run overwrites edited captions | regenerated instead of read | **Read** the existing transcript JSON; never re-run whisper here |

## Conventions

- **Read the transcript, never regenerate.** The whisper/silence-trim
  pipeline runs upstream; Iris consumes its JSON output verbatim.
- **Subtitle track is the default;** `Text+` only when the brand's
  technique whitelist calls for styled titles. Don't gold-plate the
  evaluation.
- **Burn-in vs soft** is a deliverable decision — carry it into the render
  preset, and note it, because a soft-sub deliverable that looks captioned
  in Resolve can render bare (a real cross-backend trap; cf. the
  Hyperframes "captions in preview, missing in render" failure).
- Confirmed **⚠ VERIFY** lines get tightened + recorded as lore.
