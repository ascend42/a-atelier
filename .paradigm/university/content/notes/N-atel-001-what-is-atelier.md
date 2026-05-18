---
id: N-atel-001-what-is-atelier
title: What is Atelier?
type: note
track: ATEL-001
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-001
  - orientation
difficulty: beginner
estimatedMinutes: 3
prerequisites: []
summary: Atelier is an AI-native animation engine — a declarative YAML format authored through MCP tools, runnable from a CLI, embeddable as a widget, and now bootable as a local browser editor with `atelier studio`.
---

## The short version

Atelier is an **animation engine that an AI agent can author through tool calls**. A `.atelier` document is plain YAML describing layers (shapes, text, images, video, groups), states, and deltas (per-frame interpolations). An agent calling `atelier_create`, `atelier_add_layer`, `atelier_add_state`, `atelier_add_delta` builds a document the same way a human would in a GUI — except every step is structured, validated, and reproducible.

Once a document exists, Atelier can:

- **Resolve** any frame by interpolating delta values through easings (linear, cubic-bezier, ease presets, spring physics, step)
- **Render** to Canvas 2D, SVG strings, or Lottie JSON
- **Export** to PNG, MP4, WebM, GIF — from a browser (WebCodecs) or the CLI (FFmpeg)
- **Edit** in a browser studio with a canvas preview, layer panel, property panel, and YAML view
- **Trim, transcribe, caption** video projects with the silence-detect + Whisper + caption pipelines

## What makes it "AI-native"

Three things, in order of importance:

1. **The document format was designed for an agent to write.** Layers have descriptive IDs, deltas reference layers by ID, states reference each other by name. There is no "drag this onto the canvas" — there is `atelier_add_layer({ id: "title", visual: { type: "text", content: "Hello", style: {...} } })`. The schema gives AI-readable validation errors when the agent gets it wrong.
2. **52 MCP tools cover the full authoring surface.** An agent doesn't compose YAML by hand and pray it parses. It calls typed tools that mutate a document store, validate after each mutation, and return the updated document. Mistakes are caught at the tool boundary, not at render time.
3. **The detected-vs-user-edited convention.** When a pipeline (silence-trim, captions) generates layers from analysis, those layers are tagged. User edits set `userEdited` / `userAdded` / `hidden` flags. Re-running the pipeline preserves user fixes by matching on timing tolerance. The human and the agent can both edit the same document forever without one erasing the other.

## What it is not

- **Not a code framework.** It does not ship React components, runtime hooks, or HTTP handlers.
- **Not a cloud product.** Everything runs locally. There is no signup, no SaaS, no telemetry by default.
- **Not a replacement for After Effects.** It is a programmable, AI-author-first format. You will not draw bezier paths with a mouse here (yet). You will describe them in YAML or generate them via tool calls.

## Who uses Atelier today

- **AI agents** authoring social-media-ready motion graphics, explainer animations, and short-form video composition
- **Developers** scripting animations via the Builder API (`@atelier/core`) or driving the CLI from a Makefile
- **Content creators** in `atelier studio` for hands-on layer editing with AI assistance live in the loop

The rest of this track shows you how to install Atelier and render your first animation in under two minutes.
