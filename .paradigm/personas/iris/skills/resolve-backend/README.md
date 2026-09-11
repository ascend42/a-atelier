# Iris — DaVinci Resolve Backend Skills (EXPERIMENTAL)

> **Status:** `experimental` · **unverified — authored before any live run.**
> These playbooks were written from a source audit of
> [`samuelgursky/davinci-resolve-mcp`](https://github.com/samuelgursky/davinci-resolve-mcp)
> @ v2.224.2 and its scripting-API surface — **not** from a validated
> Resolve session. Every command / tool name is real (extracted from the
> repo), but the *sequencing and failure modes are inferred*. Lines marked
> **⚠ VERIFY** are the assumptions to confirm on first contact and then
> promote this bundle from `experimental` → `canonical`.

## Why this exists — the renderer slot

Atelier v2 is **not a renderer** (`docs/v2-hyperframes-migration.md`). It is
the brand + direction + asset + voice layer that *feeds* a renderer. The
mainline renderer is **Hyperframes** (HTML/CSS, seek-driven capture →
ffmpeg). This bundle evaluates **DaVinci Resolve** — a mature timeline NLE,
driven over MCP — as an **alternative backend in the same slot**.

| | Hyperframes (mainline) | DaVinci Resolve (this bundle) |
|---|---|---|
| Model | HTML/CSS scene + timing attributes | Project → media pool → **timeline** of clips |
| Iris drives | scaffold `index.html`, symlink assets, `npx hyperframes render` | MCP tool calls: `project_manager` → `media_pool` → `timeline` → `render`/`delivery_workflow` |
| Captions | `<div class="clip caption">` | native subtitle track **or** Fusion `Text+` |
| Grade / brand look | CSS | color page / CDL / `color_grade_workflow` |
| Output | MP4/MOV/WebM-alpha/PNG-seq | ProRes/DNxHR/H.264/H.265 via render presets + QC gate |
| Strength | fast iteration, deterministic, web-native | finishing-grade codecs, real NLE ops, loudness/QC |
| Cost | zero external app | requires **Resolve** running (Studio, or free ≤ 21.0.x via in-app bridge — free 21.1+ won't connect) |

The open question this bundle is built to answer: **does a real NLE's
timeline model earn its weight over the HTML/CSS renderer for
agent-driven, brand-cascaded short-form?** Iris is the render-driver in
both worlds, so she owns the comparison.

## Skills in this bundle

| Skill | Purpose |
|---|---|
| [`setup-and-safety-davinci-resolve-mcp.md`](./setup-and-safety-davinci-resolve-mcp.md) | **Read first.** Safe install (venv, auto-update OFF, `safe_mode` ON), the audit caveats (unconfined FS paths), and the first-contact probes (`resolve_is_running`, `resolve_control`). |
| [`map-storyboard-to-resolve-project.md`](./map-storyboard-to-resolve-project.md) | **Keystone.** Merged brand+STORYBOARD trio → `project_manager.create` → import media → `media_pool.create_timeline_from_clips(clip_infos)` with record frames from beat timing windows. |
| [`compose-captions-and-overlays-in-resolve.md`](./compose-captions-and-overlays-in-resolve.md) | Transcript segments → subtitle track or Fusion `Text+`; lower-thirds / brand overlays via `fusion_comp`. The Resolve analog of `compose-captions-into-hyperframes`. |
| [`run-resolve-render-and-verify.md`](./run-resolve-render-and-verify.md) | `render_presets` → `delivery_workflow` (probe → validate → dry-run set → prepare job) → `render.start` → `verify_output`. Verbatim-error + verify discipline, same as the Hyperframes render skill. |

## First live run

Before trusting any of these on a real machine, work through
[`FIRST-LIVE-RUN-CHECKLIST.md`](./FIRST-LIVE-RUN-CHECKLIST.md) — the ordered
list of every `⚠ VERIFY` assumption in this bundle. It is the promotion
gate: pass it, and the skills go `experimental → canonical`.

## Loading order

For a "render this project in Resolve" task, start at
`setup-and-safety` (once per machine), then the keystone
`map-storyboard-to-resolve-project`, which references the caption/overlay
and render skills as the procedure crosses into them.

## Promotion criteria (experimental → canonical)

Promote a skill only after a live run confirms every **⚠ VERIFY** line in
it, and record the run as lore (`paradigm_lore_record`) so the confirmed
command shapes and real failure modes replace the inferred ones — exactly
how the Hyperframes render skill encodes the RENDER-AUDIO-ISSUE lesson.
