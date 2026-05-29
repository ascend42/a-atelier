---
title: Paradigm v6.4 Release Video — Atelier Feasibility Report
date: 2026-05-11
status: assessment
audience: a-paradigm team
tags: [paradigm-release-video, keynote, video, atelier-phase-2]
---

# Paradigm v6.4 Release Video — Atelier Feasibility

**TL;DR — honest read.** Atelier today is a working motion-graphics renderer. It is **not yet a working video-clip assembler**. The pieces that would let Atelier ingest Higgsfield B-roll + green-screen talking head and assemble the master are scaffolded but not shipped: the WebCodecs video demuxer (T-002b), the headless WASM FFmpeg encoder (T-003), the timeline editor (T-2026-05-10-008), Whisper caption pipeline (T-006), and silence-removal pipeline (T-007). The existing 11 keynote `.atelier` files render fine because they are pure motion-graphics — no source video clips.

**Recommendation:** ship the v6.4 release video in **two phases**.

- **Phase A — now → release.** Atelier authors each segment as motion-graphics MP4. Final assembly (cut talking-head, drop B-roll, mix audio, add captions) happens in an external NLE (DaVinci Resolve or Final Cut). The "edited in Atelier" credit is partially true — every motion-graphic segment was — but the master assembly is external.
- **Phase B — after Phase 2 lands (T-002b, T-003, Timeline UI).** Rebuild the master as a single Atelier composition. *Now* the "edited in Atelier" credit is fully literal. Use it as a follow-up "how it was made" piece.

Do **not** block the v6.4 announcement on Phase 2. The architecture is sound but several load-bearing pieces aren't there yet, and a flagship release is the wrong stress test.

---

## 1. Current video capabilities (what works TODAY on main)

### VideoVisual layer
- Schema is in place (`packages/schema/src/layer.ts:58-69`): `assetId`, `src`, `startFrame`, `sourceOffset`, `sourceEnd`, `playbackRate`, `volume`, `muted`, `objectFit`.
- Animatable props via deltas: `frame.x/y`, `bounds.width/height`, `opacity`, `rotation`, `scale.x/y`, `anchorPoint.x/y`, `visual.fill.color`, `visual.stroke.color`.
- **Codec acceptance is theoretical** — the renderer passes frames through canvas `drawImage`; in practice the bottleneck is the decoder.
- **Alpha-channel video: NOT supported.** No blending logic for ProRes 4444, VP9-alpha, or WebM-alpha. → talking-head must be pre-keyed and delivered as opaque MP4 with backdrop already composited, **or** delivered as a chroma-keyed MP4 that we then matte against an Atelier-rendered backdrop **once T-002b lands**.
- Audio: single `Audio` config per state (`packages/types/src/audio.ts`) — `{ src, offset?, volume?, loop?, startFrame? }`. **No multi-track mixing, no gain automation.**

### atelier render CLI
- `packages/cli/src/commands/render.ts` — outputs **MP4 (H.264 CRF 18) and GIF** via system FFmpeg subprocess. **No WebM CLI output.**
- No hardcoded framerate or resolution ceiling. H.264 requires even dimensions (validated at runtime, `render-pipeline.ts:186-192`).
- **Multi-minute render perf is uncharted.** The existing keynote MP4s are short single-state animations. A 4-min, 15-track timeline has never been pushed through the pipeline.

### WebCodecsVideoProvider vs FfmpegEncoder
- **WebCodecsVideoProvider** (`packages/video/src/providers/webcodecs-provider.ts:83-104`) — frame-accurate decoder. **Currently throws** — Mediabunny demuxer integration is stubbed (T-002b).
- **FfmpegEncoder** (`packages/video/src/encoding/ffmpeg-encoder.ts:58-76`) — WASM FFmpeg shell. **Throws** "T-003 implementation pending".
- **ElementProvider** — HTMLVideoElement wrapper, **preview only, not frame-accurate** (`currentTime` seek), **browser-only**.
- **Headless / CI render path that works today:** node-canvas + system FFmpeg subprocess, **but it only works on motion-graphics docs**. A doc containing a `VideoVisual` layer hits the unimplemented decoder path and fails.

### Limits
- No max-clip constant; painters algorithm draws every layer every frame (O(n) per frame, no culling).
- **Transitions: crossfade only** (`StateTransitionConfig`). No cut, dissolve, wipe, push, zoom, slide.
- Audio sync: frame-based, implicit. No sample-accurate clock.

---

## 2. Phase 2 features in flight

| Feature | Status | Blocks v6.4 video? | ETA signal |
|---|---|---|---|
| **WebCodecs demux (T-002b)** | stubbed, throws | **YES** — no clip ingest without it | tasked, not started |
| **WASM FFmpeg encoder (T-003)** | stubbed, throws | NO (CLI path covers) | tasked, not started |
| **Timeline UI (T-008)** | not started; delta-panel is animation-only | YES if a human needs to nudge cuts | tasked 2026-05-10 |
| **Whisper caption pipeline (T-006)** | types only (`VideoTranscript`, `TranscriptSegment`, `TranscriptWord` in `packages/types/src/video-project.ts`) | NO — can author caption layers manually, or do captions in NLE | tasked 2026-05-10 |
| **Silence removal (T-007)** | types only (`VideoCutList`, `CutEntry`); no FFmpeg wrapper | NO — handle in NLE / DAW | tasked 2026-05-10 |
| **VideoProject folder utilities** | landed `af0dcb4` 2026-05-10 (filesystem scaffold) | NO | shipped |

All five "blocking-or-non-blocking" answers assume Phase A (external assembly). Under Phase B (Atelier assembles), **all five are blocking**.

---

## 3. Composition pattern for a "release video"

### Recommended shape (Phase A — what we should actually do)
**One Atelier composition per segment.** ~15 segments, each rendered to MP4. Final concat + talking-head + audio mix in an external NLE. This matches how the existing 11 keynote segments are structured and is the only path that works today.

### Recommended shape (Phase B — after Phase 2)
**Per-segment comps + a master concat comp.** Not a single 15-track mega-file. Reasons:
- The painters-style renderer has no culling — a 15-track doc means every layer is evaluated every frame even when invisible. Untested at multi-minute scale.
- `RefVisual` (`packages/schema/src/parse.ts`) — type exists for "embed another `.atelier` at a frame", **but resolver is deferred**. Once it lands, the master comp can `ref` each segment, giving us composable updates without copy-paste.
- Easier per-segment iteration, faster re-renders.

### 16:9 master → 9:16 / 1:1 social cuts
**No aspect-ratio reframe API exists.** Canvas is fixed `{ width, height, fps }` per document. Three options:
1. Author parallel `.atelier` files for each aspect (most work, best result).
2. Letterbox-render — same source, pad to target canvas (fastest, looks like a letterboxed 16:9 in a 9:16 frame, **bad for vertical platforms**).
3. Add a reframe primitive (new feature) — pan-and-scan keyframes per layer per aspect.

**Recommendation:** for v6.4, author 16:9 only. Do 9:16 / 1:1 in the NLE during the same edit pass; treat as a Phase B Atelier feature request after the release.

### Where the agent plugs in
At the MCP-tool level. Available today (`packages/mcp/src/tools/`):
- `atelier_create`, `atelier_add_layer`, `atelier_add_asset`, `atelier_add_delta`, `atelier_add_state`, `atelier_set_audio`, `atelier_configure_transition`, `atelier_preview`, `atelier_export_svg`.

Missing for full timeline authoring:
- `atelier_add_transition_effect` (only crossfade today)
- `atelier_set_clip` (no first-class "clip" — only layers + states)
- `atelier_render_headless` (agents must shell out to CLI)

For Phase A this is fine — the agent authors motion-graphics docs (which it can already do well) and the human runs `atelier render`.

---

## 3a. Talking-head segment workflow

**Deliver the founder footage pre-composited.** Recommended pipeline:

1. Founder shoots green-screen, angled, ~5 segments, ~24 sec each.
2. **External keying** (DaVinci, After Effects, or Premiere Ultra Key) — pull a clean key, deliver as MP4 with the keyed subject over a transparent or solid backdrop.
3. **Backdrop: pre-composited.** Until alpha-video support lands, do not deliver alpha MP4 expecting Atelier to matte it — Atelier can't. Either:
   - **(Recommended for v6.4 / Phase A)** bake the backdrop in during keying. Atelier-authored gradient/abstract motion-graphic loops can be exported as MP4, then loaded as the green-screen comp backdrop in the external keyer. Atelier still authors the backdrop look; we just composite in the keyer.
   - **(Phase B)** once T-002b lands and alpha decode is wired, deliver alpha-channel MP4 + place over an Atelier `RefVisual` of the master backdrop comp.

**Shared backdrop pattern.** Once `RefVisual` resolver ships, one `backdrop.atelier` referenced from each segment is the right shape — single source of truth, propagates on update. **Today, copy-paste the layers** between segment comps.

**Apple-keynote title overlays beside the talking head.** Animate inside the same Atelier comp as a motion-graphic pass over the talking-head MP4 layer. This is the strongest argument for using Atelier at all — the title typography + entrance choreography is exactly the kind of motion-graphics work the renderer is built for. **Caveat:** until VideoVisual decode works, you can't preview the title-over-footage layout *inside* Atelier — author the titles against a placeholder image of a still frame, then composite in NLE.

**Brief for the Composer agent (backdrop):** gradient + slow abstract motion. Primitives to use today:
- ShapeVisual rectangles with `visual.fill.color` deltas across keyframes (gradient drift).
- TextVisual at low opacity for ambient noise.
- `opacity`, `scale`, `rotation`, `frame.x/y` deltas with eased timing (`StateTransitionConfig`).
- No particle systems, no shaders, no displacement. Keep it geometric.

---

## 4. Higgsfield clip integration

**Cleanest agent path (Phase B, once T-002b lands):**
```
HF MP4 → atelier_add_asset(type: video, src: file://...) → atelier_add_layer(VideoVisual, assetId, startFrame) → atelier_add_delta(...) for animation
```

**Today (Phase A):** HF MP4s go directly to the NLE. Atelier authors the surrounding motion-graphic frame (title cards, lower thirds, transitions) as separate MP4s; NLE composites them over HF B-roll.

**Codec gotchas to pre-transcode for:**
- **H.265 / HEVC source** — decoder support is inconsistent; transcode to H.264 yuv420p before ingest.
- **Variable frame rate** — Atelier is fixed-fps; transcode VFR → CFR at the target rate.
- **Color space drift** — HF clips may be BT.709 limited; if mixing with sRGB graphics, color-manage in the NLE.
- **Container** — prefer MP4 over MOV/MKV; the WebCodecs path will be picky.

---

## 5. New "Atelier Composer" agent — placement

**Recommendation: Atelier Composer lives in `a-paradigm`.**

Reasoning:
- The Showrunner and Director/DP agents already live there. Keeping the film crew together makes orchestration simpler — one captain brief, one ROLE_PROMPTS section, one tier registration.
- Atelier Composer's job is *to use* Atelier (via MCP tools), not *to be part of* Atelier. The skill is composition + Paradigm narrative judgment, not Atelier internals.
- Atelier exposes the surface (MCP tools); the composer consumes it. That's the right boundary.

**Schema for Director → Composer handoff (`shot list + clip bundle`):**

```yaml
# shot-list.yaml — one per segment
segment_id: white-label-university
duration_frames: 720  # 12s @ 60fps
canvas: { width: 1920, height: 1080, fps: 60 }
narration:
  audio: ./narration.wav
  transcript: ./narration.transcript.json  # whisper output when available
shots:
  - id: shot-1
    kind: talking-head | b-roll | motion-graphic | title-card
    in_frame: 0
    out_frame: 180
    source: ./assets/founder-segment-3.mp4  # or hf-prompt-id for B-roll
    overlays:
      - kind: title
        text: "University — yours, branded."
        layer_id: title-1
        in_frame: 12
        out_frame: 168
    audio_track: narration  # or "ambient", or null
  - id: shot-2
    ...
references:
  backdrop: ../shared/backdrop.atelier  # RefVisual target
  brand: ../shared/brand-tokens.yaml
```

**Symphony relay shape: single document + asset folder, atomic.** Not a stream of shots.

- **Why one document, not a stream:** the Composer needs to see total duration, pacing, and shot-to-shot relationships *before* it starts authoring. Streaming shots forces local decisions without global context, which is exactly the symptom Paradigm exists to avoid in coding agents.
- **Folder layout:**
  ```
  .paradigm/film/<segment-id>/
    shot-list.yaml
    narration.wav
    narration.transcript.json
    assets/
      founder-segment-3.mp4
      hf-broll-mountains.mp4
      ...
    out/
      project.atelier        # composer writes here
      render.mp4             # CLI writes here
  ```
- **Cross-project handoff:** Symphony delivers the whole `<segment-id>/` folder to the Composer's working dir. Composer reads `shot-list.yaml`, calls Atelier MCP tools to author `out/project.atelier`, then signals done. Human or another agent runs `atelier render`.

This shape also gives a clean **Phase A fallback**: when a shot's `kind: talking-head` and Atelier can't decode video yet, the Composer writes a placeholder TextVisual or ImageVisual frame at the right duration, and the NLE editor knows to drop the real footage there.

---

## 6. Risks / unknowns / "don't promise this yet"

| Item | Risk | What Paradigm should say publicly |
|---|---|---|
| **Atelier as flagship-release assembler** | Phase 2 pieces not landed | "Motion graphics by Atelier; final cut in NLE." Don't say "edited entirely in Atelier" for the v6.4 video. |
| **Multi-minute, multi-track render perf** | Untested at this scale | Don't quote render times publicly. |
| **Alpha-channel video** | Not supported | Don't promise transparent overlays / chroma keying inside Atelier. |
| **9:16 / 1:1 vertical cuts** | No reframe API | Vertical cuts: do them in the NLE for v6.4. Atelier reframe is a Phase B feature request. |
| **Whisper captions in Atelier** | Scaffolded | Captions in v6.4 video: produce externally (Premiere Auto-Caption / Descript) and burn in, or skip burned captions and rely on platform captions. |
| **Transition vocabulary** | Crossfade only | Don't show Apple-style depth wipes and claim Atelier did them — Atelier did crossfades. |
| **WebM CLI output** | Not wired in CLI | If a deliverable needs WebM, render MP4 and transcode. |
| **Render of any doc containing VideoVisual** | Throws today (T-002b) | Phase A: no segment .atelier should reference a VideoVisual layer. Composer must enforce this. |

**Should Atelier be the assembler at all for the v6.4 video?** No, not the assembler. **Yes,** the segment author and motion-graphics renderer. Be specific about the credit: "Motion graphics: Atelier. Edit: [NLE]." Save the "edited in Atelier" headline for the Phase B follow-up video, which is itself a great asset for promoting Phase 2.

---

## Phased path summary

**Phase A — v6.4 launch (now → 2-3 weeks)**
1. Refresh existing segments — `gate-save` (add Rune / `none` preset), `mcp-tools` (add Atlas, North), `lore` (decision-store separation), `ripple-save` (soft-block flow), `university` (white-label).
2. Author two new segments — **Atlas + `arch.yaml`** and **University white-label** (the v6.4 flagship).
3. All segments render as pure motion-graphics MP4 (no `VideoVisual` layers).
4. NLE assembly: founder talking-head (pre-keyed) + HF B-roll + Atelier MP4s + narration + captions + vertical cuts.
5. Credit: "Motion graphics: Atelier."

**Phase B — follow-up video (post Phase 2 land: T-002b + T-003 + Timeline UI + alpha)**
1. Rebuild master as Atelier composition with `RefVisual` to per-segment comps and shared backdrop.
2. Founder footage as alpha MP4 placed over Atelier backdrops.
3. Single `atelier render` produces the master.
4. Credit: "Edited in Atelier" — fully earned.
5. Ship as a "how it was made" piece — doubles as a Phase 2 announcement.

---

## Appendix: existing keynote segments — reuse / refresh / replace

| Segment | Action | Notes |
|---|---|---|
| the-problem | reuse | Evergreen. |
| paradigm-shift | reuse | Symbol model stable v6.0+. |
| value-prop | reuse | Evergreen. |
| core-philosophy | reuse | Evergreen. |
| five-symbols | reuse | Stable v6.0+. |
| gate-save | refresh | Add Rune + `none` preset context. |
| ripple-save | refresh | Highlight v6.1 soft-block remediation. |
| mcp-tools | refresh | Add Atlas, North, capability preamble. |
| lore | refresh | v6.0 decision-store separation, knowledge streams. |
| sentinel | reuse | Observability story stable. |
| university | refresh + extend | v6.4 white-label is flagship; pair with a new white-label-focused segment. |
| **NEW: atlas-arch** | new | v6.2 cartographer + `arch.yaml` + Mermaid diagram generation. |
| **NEW: white-label-university** | new | v6.4 flagship: branded packs, custom tabs, project library. |

**Note on .atelier source authoring:** the existing 11 keynote files are encrypted — read/write via the `pencil` MCP `batch_get` / `batch_design` tools, not raw Read/Edit.
