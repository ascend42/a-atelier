---
id: N-atel-701-choosing-output
title: Choosing an output — a decision guide by destination
type: note
track: ATEL-701
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-701
  - delivery
  - decision-guide
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-the-atelier-format
summary: One decision guide across every exporter — pick the format by destination (social post, web embed, motion-design handoff, preview), hit the right aspect target, and know when to use the CLI versus the studio Export button.
---

## Start from the destination, not the format

The mistake is asking "what can Atelier export?" The right question is "where is this going?" — and the destination picks the exporter for you.

| Destination | Format | Command / surface |
| --- | --- | --- |
| Social image post | PNG | `atelier export-image` (or `atelier carousel` for a set) |
| Open Graph / thumbnail / poster | PNG | `atelier export-image --width …` |
| Web logo / icon that must scale | SVG | `atelier export-svg` |
| Motion-design handoff (runtime / AE) | Lottie JSON | `atelier export-lottie` |
| Social / web video | MP4 | `atelier render` or studio Export |
| README / chat loop | GIF | `atelier render -f gif` |
| Web video, modern browsers, small files | WebM | studio Export (WebCodecs) |
| Frame inspection / debugging | JSON | `atelier still` (default format) |

## The four common destinations, decided

**Social post.** A still image, fixed pixel size, often square or portrait. → **PNG** via `atelier export-image`. Set your aspect with `--width`/`--height` (or design the canvas to the target). For a whole *set* of posts, see the carousel note below — don't loop the single-frame command.

**Web embed.** Two cases. If it's a logo, icon, or any artwork that has to stay crisp at arbitrary sizes → **SVG** via `atelier export-svg`, inlined into markup (drop the `--xml-declaration`). If it's video → **MP4** for reach, **WebM** (studio) when the audience is modern browsers and file size matters.

**Motion-design handoff.** You're giving the animation to a design or front-end team to drop into a product → **Lottie** via `atelier export-lottie`. It's the whole document as vector animation, tiny, and playable in every major runtime. Watch the stderr warnings: a clean export means the Lottie matches; a warning means a feature dropped and you should preview it in a player.

**Preview.** You just want to see the current frame. → `atelier still` for the resolved-frame JSON (what the renderer sees), or `atelier still --format png` / `atelier export-image` for a quick pixel look. No FFmpeg, no canvas build — both raster previews run on a plain install.

## Aspect targets

Design the document canvas to the destination's aspect when you can — it's lossless. Common targets:

- **1:1 (square)** — 1080×1080. Feed posts, carousels.
- **4:5 (portrait)** — 1080×1350. Maximizes feed real estate.
- **9:16 (vertical)** — 1080×1920. Stories, Reels, Shorts, TikTok.
- **16:9 (landscape)** — 1920×1080. YouTube, web hero video, presentations.

On a still export you can also retarget at export time: `atelier export-image hero.atelier --out card.png --width 1200` derives the height to preserve aspect. Override **both** `--width` and `--height` only when you deliberately want a non-aspect-preserving size — it will squash otherwise. For MP4, remember H.264 needs **even** dimensions; an odd canvas is rejected with the next even size suggested.

## CLI or the studio Export button?

Same artwork, two ways to get a file out:

- **The studio Export button** encodes in the browser via WebCodecs — no FFmpeg, no node-canvas, nothing to install. Best for one-off exports while you're editing, and the only path that reaches WebM. Interactive, per-document.
- **The CLI** (`export-image`, `export-svg`, `export-lottie`, `render`) is scriptable and batchable — wire it into a build, a script, a CI job. Raster and vector exports run on a plain install; **video (`atelier render`) additionally needs FFmpeg on `$PATH` and the `canvas` package** with its cairo/pango stack (see N-atel-701-video).

Rule of thumb: editing and exporting one thing → studio. Automating or batching → CLI.

## Batch image delivery — see ATEL-601

When the job is *many* images at once — a folder of shots composed into a uniform set of posts with consistent overlays — that's `atelier carousel`, covered in **ATEL-601 (Studio Recipes)**. It drives the same single-frame raster path across every input and applies a recipe's handle + page-number overlays per image. This note doesn't re-teach it; reach for ATEL-601 when you need batch delivery rather than a single export.
