---
id: N-atel-801-live-bridge
title: The live bridge — WebSocket, MCP-over-WS, and source-tagged mutations
type: note
track: ATEL-801
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-801
  - bridge
  - mcp
  - aspects
difficulty: advanced
estimatedMinutes: 6
prerequisites:
  - N-atel-201-mcp-overview
summary: How an agent mutates the open studio document in real time — the /bridge WebSocket and /mcp MCP-over-WS transport, DocumentStore.onChange → broadcast, AtelierStudio.applyMutation, and the ~source-tagged-mutation aspect (human|llm|system; only llm broadcasts) that prevents echo loops and false attribution. Plus toast attribution and Cmd-Z undo of an agent edit.
---

## Two endpoints on one server

`atelier studio` mounts two WebSocket endpoints on Vite's HTTP server:

- **`/mcp`** — an MCP-over-WebSocket transport. An external MCP client (e.g. Claude Desktop running `atelier-mcp`) connects here and drives the same 61 tools it would over stdio. Each connection gets its own `McpServer`, but they all share **one** `DocumentStore`. The transport (`WebSocketServerTransport`) wraps a single `ws` socket as an MCP `Transport`: inbound frames parse to JSON-RPC and surface via `onmessage`; outbound SDK messages stringify and `ws.send`. A malformed inbound frame surfaces via `onerror` but does NOT close the connection.
- **`/bridge`** — a thin broadcast channel to the browser. It carries typed envelopes (`hello`, `doc:loaded`, `doc:patch`, `llm:mutation`, `error`) at `BRIDGE_PROTOCOL_VERSION = 1`. v1 ships whole-document replacement so the envelope stays trivial; a JSON-patch op shape is v1.1, once the byte cost is measured on real docs.

## The Origin asymmetry

WS upgrades bypass Vite's connect middleware (Node fires `upgrade` before connect runs), so the bridge re-runs the Origin check itself on every upgrade — otherwise either endpoint would be cross-origin-reachable from any tab. The check is asymmetric:

- **`/bridge`** demands a strict same-origin match (`isAllowedOrigin`) — it's a real browser origin, your own studio tab.
- **`/mcp`** tolerates a **missing** Origin (`isAllowedMcpOrigin`) but still rejects a present-but-foreign one. Non-browser MCP clients send NO Origin header; under the strict check they'd all 403 and MCP-over-WS would be unreachable. A browser tab on evil.com still can't reach `/mcp` (it sends a foreign Origin). The loopback bind to `127.0.0.1` remains the primary protection.

## The mutation loop

The full agent→human loop:

```
LLM tool call ──► McpServer (per /mcp conn) ──► DocumentStore.set(source:"llm")
                                                        │
                                          onChange fires (source = "llm")
                                                        ▼
                              bridge broadcasts `llm:mutation` envelope
                                                        ▼
                          browser studio.applyMutation({ type:"doc:replace", doc, source })
                                                        ▼
                       canvas re-renders + toast attribution (Cmd-Z still works)
```

And the human→agent direction:

```
human edit ──► AtelierStudio.onDocumentChange ──► `doc:patch` envelope
                                                        ▼
                              bridge writes DocumentStore.set(source:"human")
                                                        ▼
                              onChange fires (source = "human") → NOT broadcast
```

`applyMutation` is whole-document replacement only in v1 — the op shape is exactly `{ type: "doc:replace", doc, source }`. It snapshots the current state into undo history first (so an agent edit is undoable from your seat), preserves the current state name and selected layer when they still exist in the new doc, and sets a one-tick `suppressNotify` flag so the resulting re-render doesn't echo the change back out as a "human" edit.

## ~source-tagged-mutation — the aspect that makes the loop safe

Every `DocumentStore` mutation carries a **source tag**: `"human" | "llm" | "system"`. This is the load-bearing convention behind the live bridge, and it answers one question: *which changes should the browser be told about?*

The rule, expressed in code as `shouldBroadcastMutation(source)`, is: **broadcast only when `source === "llm"`.**

| Source | Where it comes from | Broadcast? | Why |
|---|---|---|---|
| `llm` | An MCP tool call over `/mcp` | **Yes** | A genuine agent edit — show it, persist it, toast it |
| `human` | The browser's own edit via `doc:patch` (or `POST /api/file`) | No | The browser is already current — broadcasting would echo the edit back to the tab that made it |
| `system` | File-read hydration (a file the user just opened) | No | The bytes are already on disk and in the browser — broadcasting would fire a phantom "agent edited document" toast and a bogus undo entry on a plain file-open |

Without this filter you'd get two failure modes: an **echo loop** (the browser's edit bounces back and re-applies) and **false attribution** (opening a file looks like an agent edited it). The tag travels end-to-end — the MCP-side `MutationSource`, the bridge envelope, and the studio-side `MutationSource` are the same three strings, so no translation happens between processes.

It also pairs with **~copy-on-write-doc**: any code that mutates a document builds a NEW document object before calling `DocumentStore.set`, never mutating the stored object in place. That guarantees the bridge — a concurrent reader broadcasting to the browser — can never observe a half-mutated document mid-update.

## Toast attribution and Cmd-Z

When an `llm:mutation` lands and matches the file you're viewing, the studio applies it and shows a bottom-right toast: *"agent edited document (`<tool>`) — Cmd-Z to undo"*. Because `applyMutation` snapshotted before replacing, **Cmd-Z returns the prior state** — an agent's edit is just another entry in your undo history. The agent and you share one timeline.

That shared, attributable, undoable timeline is the whole point. The next note ties it into a complete workflow.
