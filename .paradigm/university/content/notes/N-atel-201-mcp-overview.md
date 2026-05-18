---
id: N-atel-201-mcp-overview
title: MCP in the Atelier context
type: note
track: ATEL-201
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-201
  - mcp
  - architecture
difficulty: intermediate
estimatedMinutes: 4
prerequisites:
  - N-atel-101-easings
summary: What the `atelier-mcp` server actually is, why every authoring tool maps to a single mutation on a single document store, and how the LLM↔Studio live-mutation bridge works without conflict.
---

## What `atelier-mcp` is

`atelier-mcp` is a Model Context Protocol server. An AI agent connects to it (via stdio in Claude Desktop, or WebSocket when paired with `atelier studio`) and gains 51 tools across 16 groups. Each tool is a typed function the agent calls; each call is a single mutation against a shared in-memory `DocumentStore`. The server doesn't talk to the LLM; it just exposes the mutation surface and lets the LLM drive.

The boundary is intentional: the agent does the planning, the server does the validating. If the agent asks `atelier_add_delta` to animate a property that doesn't exist on a layer, the Zod schema rejects the call with an AI-readable error message. The agent reads the error, fixes the request, retries. No invalid document ever reaches the renderer.

## The single-store invariant

There is **one** `DocumentStore` per project session. Every client — the MCP server's tool handlers, the `atelier studio` browser canvas, the WebSocket bridge between them — reads and writes the same store.

This is why the live LLM-mutation feature works at all. When an agent calls `atelier_add_layer`, the store updates, fires `onChange`, and the bridge broadcasts the mutation to any connected Studio. The Studio applies the mutation via `applyMutation(op)` (with a suppress-notify flag for one tick so the change doesn't echo back as a human edit), re-renders the canvas, and shows a toast: *"agent added layer `title`"* with an Undo affordance.

Conflict policy in v1: **last-write-wins**. Human edits during agent mutation overwrite the agent's pending change. No CRDT, no operational transform — Atelier is a single-author tool with an AI collaborator, not a real-time multiplayer canvas. Every op is tagged `source: "human" | "llm"` so the UI can attribute changes.

## Tool conventions

Every MCP tool follows the same conventions. Recognize the pattern once and you can read any tool's signature:

| Convention | Example |
|---|---|
| `atelier_<verb>_<noun>` naming | `atelier_add_layer`, `atelier_edit_delta`, `atelier_remove_state` |
| First argument is always `documentId` (or implicit if the server has a current doc) | `atelier_add_layer({ documentId, ... })` |
| Mutations return the **updated document** (not just the changed fragment) | An agent doesn't have to re-fetch after every call |
| Inspect tools return only what was asked for | `atelier_preview` returns resolved layers, not the whole doc |
| Validation runs after every mutation; tool calls fail fast with field-level errors | Errors include the offending path: `layers[0].visual.style.fontSize: expected number` |
| Tools that need a frame number accept either an absolute frame or `{ state, frame }` | Clarity over cleverness |

## The 16 groups

```
document    — create, load, list, info, validate, preview, batch_preview,
              profile, complexity, diff_frames, export, export_svg, export_lottie
layer       — add, edit, remove, reorder, list, edit_visual
state       — add, edit, remove, list, set_parent, configure_transition
delta       — add, edit, remove
visual      — set_shape, set_fill, set_stroke, set_shadow, set_blend_mode,
              set_clip_path, set_motion_path, set_tint
asset       — add, list, remove
variable    — add, list, remove, find
preset      — define, list, apply
template    — instantiate
interaction — add, list, remove
ref         — set_ref, resolve_refs
audio       — set_audio
overlay     — add_handle, add_page_number   (Phase 1.5)
```

The next three notes cover the high-frequency tools — what to call and when. The full reference is `docs/mcp-reference.md` in the atelier repo (and at `https://atelier.dev/mcp`, when that lands).

## Configuring the server

```json
{
  "mcpServers": {
    "atelier": {
      "command": "atelier-mcp"
    }
  }
}
```

That's it. No auth tokens. No project path — the server scans CWD for `.atelier` files and loads them lazily on `atelier_load`. To bind the server to a specific project directory, set `ATELIER_PROJECT_ROOT=/path/to/project` in the env.

For the live Studio bridge, run `atelier studio` first; the MCP server detects the bridge's WebSocket endpoint and connects automatically. No config needed.
