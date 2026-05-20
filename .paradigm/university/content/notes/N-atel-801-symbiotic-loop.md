---
id: N-atel-801-symbiotic-loop
title: The symbiotic loop — ingest, compose, co-edit, export
type: note
track: ATEL-801
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-801
  - workflow
  - import
  - vision
difficulty: advanced
estimatedMinutes: 6
prerequisites:
  - N-atel-201-mcp-overview
summary: The whole vision in one workflow — an agent runs an external generator in chat, atelier_import_images brings the results into the open doc, the human watches them appear live and keeps or undoes them, recipes and overlays compose the set, and atelier carousel exports it. Atelier owns no generation; it ingests, composes, and lets the human and agent co-edit one document.
---

## Atelier owns no generation

This is the thesis of the whole track: **Atelier does not generate images, video, audio, or text.** It has no diffusion model, no text-to-image tool, no in-process generator. What it owns is the part that's hard and durable — a declarative document model, a renderer, a recipe/overlay composition layer, and a live editing loop shared between a human and an agent.

Generation lives outside Atelier, in whatever tool the agent chooses to shell out to. Atelier's job begins when the bytes exist: it **ingests** them, **composes** them, and lets you and the agent **co-edit** the result.

## The loop, end to end

Picture a single chat session with the studio open in your browser:

1. **The agent generates — outside Atelier.** You ask for a set of images. The agent runs an external generator from chat — for example a Higgsfield CLI — and writes the results to a folder. None of this touches Atelier; it's the agent driving a separate tool.

2. **`atelier_import_images` ingests.** The agent calls the import tool. Each image becomes an ImageVisual layer with a matching `doc.assets` entry, added to the open document via a source-tagged-`llm` mutation. (Like every document-mutating tool, import builds a new document before calling `DocumentStore.set` — ~copy-on-write-doc — so the bridge never reads a half-built doc.)

3. **You watch them appear — live.** Because the mutation is `source: "llm"`, the bridge broadcasts it. The layers materialize on your canvas as the agent imports them, each with a toast: *"agent edited document — Cmd-Z to undo"*. You're not waiting for a render-and-refresh cycle; you're watching the document fill in real time.

4. **You keep or undo — per edit.** This is the symbiosis. A generated image that lands wrong? Cmd-Z, and it's gone — the agent's import was just an undo entry. The ones you like, you keep. You're curating the agent's output as it arrives, not after a batch finishes.

5. **Recipes and overlays compose.** Apply a recipe to lay out the kept images; add a handle and page-number via the overlay namespace. The layer-tag isolation invariant (ATEL-301) means re-running a recipe drops only its own tagged layers — your imported images and any manual tweaks survive. You and the agent can both restyle without erasing each other's work.

6. **`atelier carousel` exports the set.** The composed, multi-page result exports as a carousel — the page-number overlay threads `currentIndex` / `totalCount` per page during the batch.

## Why both editors at one canvas

The agent is good at the mechanical breadth — running the generator, importing a dozen results, applying a recipe across all of them, threading per-page overlays. You're good at the judgment — *that* crop, *not* that one, nudge the handle two pixels. The live bridge and the source-tagged-mutation aspect exist so neither steps on the other:

- Every change is **attributed** (`human` vs `llm`) so the UI never lies about who did what.
- Every change is **undoable** from your seat, so the agent never makes an edit you can't take back.
- Every change flows through **one document store**, so there's a single source of truth — no merge, no divergence, last-write-wins.

## The shape of the thing

Atelier is not a generator with an editor bolted on. It's a **composition surface** where a human and an agent edit the same document at the same time, with generation pushed to the edges. The agent brings breadth and the external tools; you bring taste and the veto; the document — declarative, rendered, source-tagged — is the contract between you.

That closes ATEL-801. You now understand `atelier studio` from the loopback bind up through the live bridge, and why the whole stack is built so an agent and a human can sit at one canvas without getting in each other's way.
