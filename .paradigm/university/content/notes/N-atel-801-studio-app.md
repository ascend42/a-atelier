---
id: N-atel-801-studio-app
title: '`atelier studio` — the local-first editor'
type: note
track: ATEL-801
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-801
  - studio
  - cli
difficulty: advanced
estimatedMinutes: 5
prerequisites:
  - N-atel-201-mcp-overview
summary: What `atelier studio` launches — a Vite-backed browser editor bound to 127.0.0.1, the welcome.atelier scaffold on an empty directory, the sidebar file list + "+ New", and the autosave coordinator whose flush-on-switch prevents .atelier corruption. Flags — --port, --no-open.
---

## What the command does

`atelier studio [file]` spins up a local Vite dev server, writes a tiny entry shim into a temp directory that imports the browser client (`bootStudioApp`), and opens your browser. The client is a real, typechecked TypeScript module — `src/web/inline-app.ts` — not a string. (It used to be a ~700-LOC template-literal string with no typecheck, no lint, no tests; two real bugs hid there precisely because the compiler never saw it. More on both below.)

The server reads and writes `.atelier` files from your current working directory. There is no project file, no auth token, no cloud round-trip. You point it at a folder and edit.

```
atelier studio                          → browse all .atelier files in CWD
atelier studio my-animation.atelier     → open a specific file
atelier studio --port 8080              → custom port (default 4321)
atelier studio --no-open                → don't auto-open the browser
```

Those are the flags the command actually registers: `-p, --port <number>` and `--no-open`. Nothing else.

## ^localhost-only

The server binds explicitly to `127.0.0.1` — not the string `"localhost"`. Vite's default already resolves to loopback, but pinning the literal IP makes the invariant intentional and auditable, and it defeats any future change in Vite's defaults. The dev server cannot be reached from another machine on the network.

This matters because the studio exposes mutating endpoints (`POST /api/file` writes `.atelier` files into your CWD) and two WebSocket endpoints (`/bridge` and `/mcp`). Two layers protect them:

1. **The loopback bind** — the primary protection. Off-machine traffic never arrives.
2. **An Origin check** on every mutating REST request and on every WS upgrade. Without it, any browser tab on any site could `fetch('http://localhost:4321/api/file', { method: 'POST', ... })` and write files into your project. (The WS Origin check has a subtlety covered in the live-bridge note.)

## The welcome scaffold

Run `atelier studio` in an empty directory and you don't land on a dead-end empty-state. If CWD contains zero `.atelier` files, the command copies the bundled `welcome.atelier` template into the folder so you open onto something real. It skips files that already exist, so re-running never overwrites your work.

The welcome scaffold ships a placeholder layer whose **id is `background`** — a specific id contract, not a fuzzy description. The first image you drop replaces that layer in place (see the editing-surface note). The scaffold is a 1080×1080 social-square so you start at the most common authoring size.

## The sidebar and "+ New"

The left sidebar lists every `.atelier` file under CWD (recursively, grouped by folder), fetched from `/api/files`. Click an entry to load it. The `+ New` button prompts for a name, writes a minimal-but-non-empty starter document (one centered text layer on a 1080×1080 canvas so the canvas isn't a confusing void), refreshes the list, and selects the new file. A "new file" is just a `POST /api/file` of a fresh starter doc followed by a list refresh — there's no special server-side create path.

## Autosave and the save-race that corrupted files

The studio autosaves on every document change with an **800ms debounce**. The status bar flips to "saving…" the instant you edit, then "✓ saved" once the write lands (with a click-to-retry affordance if the write fails).

The debounce hides a bug that was real and nasty (`#cli-studio` autosave corruption):

> Edit file A → switch to file B within the 800ms window. The pending timer closed over A's *doc* but read the GLOBAL current file at fire time — which by then was B — so A's bytes were written to B's path. Real `.atelier` corruption.

The fix is twofold, and both halves matter:

1. **Capture the target path AND serialized bytes in the timer closure.** A fired timer always writes the bytes it was given to the file it was scheduled for — never whatever the "current" file later becomes.
2. **Flush the pending save before switching files.** `loadFile` calls `flushPendingSave()` at its very top, writing any in-flight edit to its OWN path, then clears the timer. No edit is dropped and no cross-file write can occur.

This logic is extracted into a real, unit-testable class — `SaveCoordinator` (`schedule`, `flushPending`, `cancel`) — so the save-race can be reasoned about in isolation. The inline browser app embeds the **same manual debounce pattern** (it does not import the class); the path/bytes capture and the flush-on-switch are preserved verbatim so there's exactly one behavior to trust.

## What you've got after boot

A browser window bound to loopback, a file sidebar, an editing canvas, autosave you can trust across file switches, and — quietly — a WebSocket bridge already connected and waiting for an agent. The next note covers what you can do on the canvas; the one after covers the agent.
