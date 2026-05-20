---
id: N-atel-001-install-and-launch
title: Install Atelier and launch the studio
type: note
track: ATEL-001
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-001
  - install
  - cli
difficulty: beginner
estimatedMinutes: 4
prerequisites:
  - N-atel-001-what-is-atelier
summary: One npm install gives you three commands — `atelier` (CLI), `atelier-mcp` (MCP server for AI agents), and `atelier studio` (local browser editor). Walks through install, what each command does, and how the three relate.
---

## Install

```bash
npm i -g @a-company/atelier
```

That single install gives you three executables on your `$PATH`:

| Command | What it does | When you use it |
|---|---|---|
| `atelier` | CLI for validating, inspecting, rendering, and processing `.atelier` files | Scripts, CI, Makefiles, ad-hoc inspection |
| `atelier-mcp` | MCP server an AI agent can connect to for authoring | Configure once in Claude Desktop or any MCP-aware client |
| `atelier studio` | Boots a local browser editor on `localhost` | Hands-on editing; image overlays; watching an agent mutate live |

You only need Node 20+ and a modern browser. No native build, no cloud account, no signup.

## Launch the studio

```bash
atelier studio
```

That command:

1. Probes a free port starting at `4321` (override with `--port 5000` or `--port-range 4321-4340`)
2. Boots a local HTTP server bound to `127.0.0.1` (never `0.0.0.0`)
3. Opens your default browser to `http://localhost:<port>` (suppress with `--no-open`)
4. Watches the current working directory for `.atelier` files and lists them in the sidebar
5. If the directory is empty, scaffolds a `welcome.atelier` so you land in a real document instead of an empty shell

The studio runs entirely on your machine. Nothing is sent anywhere.

## Configure the MCP server (for AI agents)

In your Claude Desktop config (or any MCP client):

```json
{
  "mcpServers": {
    "atelier": {
      "command": "atelier-mcp"
    }
  }
}
```

The agent now has 61 tools across 15 groups — document/layer/state/delta operations, visual configuration, asset and variable management, presets, templates, exports, and more. ATEL-201 covers the full tool surface and when to use which.

## How the three commands relate

They share a single underlying engine (`@atelier/core`) and document store. Mutations made by `atelier-mcp` are observable by `atelier studio` running in the same project — when you wire the live-mutation bridge (the WebSocket transport between the MCP store and the studio), an agent's tool calls appear in the studio canvas in real time, with a toast attributing each change to its source.

This is the symbiotic loop Atelier is built for: the agent proposes, you tweak, the agent re-proposes, your tweaks survive. The detected-vs-user-edited convention from ATEL-501 (video pipelines) is the same idea generalized — every channel (silence-trim, captions, overlays, agent mutations) carries a source tag, and re-runs preserve human authorship.

## Sanity-check your install

```bash
atelier --version
atelier list
```

`atelier list` enumerates the `.atelier` files in CWD. If there are none and you haven't launched the studio yet, that's expected — the welcome scaffold only happens on `atelier studio` first run.

Next: render your first animation.
