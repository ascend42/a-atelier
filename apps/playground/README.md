---
title: "@atelier/playground"
scope: Vite dev app with canvas playback, Player class, keyboard controls
packages: ["@atelier/playground"]
related: ["packages/canvas/README.md", "packages/core/README.md", "apps/showcase/README.md"]
---

# @atelier/playground

> Vite dev app for Atelier animation preview

A development sandbox for previewing Atelier animations. Renders a demo animation to an HTML5 canvas with playback controls and a scrubber UI.

| Field | Value |
|-------|-------|
| **Version** | 0.1.0 |
| **Private** | true |
| **Source** | `apps/playground/src/` |

## Dependencies

| Package | Type |
|---------|------|
| `@atelier/types` | workspace |
| `@atelier/core` | workspace |
| `@atelier/canvas` | workspace |
| `typescript` | dev |
| `vite ^6.1.0` | dev |

## Running

```bash
# From monorepo root
pnpm build           # build workspace packages first
cd apps/playground
pnpm dev             # starts Vite dev server
```

## Source Files

### main.ts

**Path:** `apps/playground/src/main.ts`

Entry point. Sets up the canvas element, creates the demo animation document, initializes the `Player`, wires up UI controls, and binds keyboard shortcuts.

- Calls `createDemoAnimation()` to build the document
- Reads the first state and its duration to configure the player
- Creates DOM elements: header, canvas, play/pause button, range scrubber, frame counter, state info
- On each frame callback, calls `resolveFrame` (from `@atelier/core`) and `renderFrame` (from `@atelier/canvas`)
- Wires the scrubber so that scrubbing while playing resumes playback from the new position

### demo.ts

**Path:** `apps/playground/src/demo.ts`

Creates a demo animation using `createDocument` from `@atelier/core` that showcases Atelier's capabilities.

**Layers (4):**

| Layer | Type | Description |
|-------|------|-------------|
| `bg` | rect shape | Full-canvas background (`#1a1a2e`) |
| `title` | text | "Atelier" centered, 72px bold, starts invisible |
| `circle` | ellipse shape | Red circle (`#e94560`), starts invisible |
| `box` | rect shape | Blue rounded rect (`#0f3460`, 16px radius), starts invisible |

**State:** `intro` -- 180 frames (3 seconds at 60 fps)

**Deltas (7):**

| Frames | Layer | Property | From | To | Easing |
|--------|-------|----------|------|----|--------|
| 0--60 | title | opacity | 0 | 1 | ease-out |
| 30--60 | circle | opacity | 0 | 1 | ease-out |
| 30--120 | circle | frame.x | 100 | 600 | ease-in-out |
| 60--90 | box | opacity | 0 | 1 | ease-out |
| 60--150 | box | rotation | 0 | 360 | ease-in-out |
| 120--180 | circle | frame.x | 600 | 350 | ease-in-out |

```typescript
import { createDocument } from "@atelier/core";

export function createDemoAnimation(): AtelierDocument {
  return createDocument("Atelier Demo", { width: 800, height: 600, fps: 60, background: "#1a1a2e" })
    .addLayer({ id: "bg", ... })
    .addLayer({ id: "title", ... })
    .addLayer({ id: "circle", ... })
    .addLayer({ id: "box", ... })
    .addState("intro", { duration: 180 })
    .addDelta("intro", { layer: "title", property: "opacity", range: [0, 60], from: 0, to: 1, easing: "ease-out" })
    // ... more deltas
    .build();
}
```

### player.ts

**Path:** `apps/playground/src/player.ts`

Playback controller class that drives frame advancement via `requestAnimationFrame`, respecting the target FPS.

```typescript
class Player {
  constructor(fps: number, totalFrames: number, onFrame: (frame: number) => void, loop?: boolean);
  play(): void;
  pause(): void;
  seek(frame: number): void;
  toggle(): void;
  get isPlaying(): boolean;
  get frame(): number;
  destroy(): void;
}
```

Uses an accumulator pattern for frame-rate independent playback. Elapsed time is tracked between `requestAnimationFrame` callbacks; when the accumulator exceeds `1000 / fps` milliseconds, the frame advances. Multiple frames can be consumed in a single tick if the browser falls behind. Supports loop mode (default: on) -- when the last frame is reached, playback wraps to frame 0.

### styles.css

**Path:** `apps/playground/src/styles.css`

Dark-theme stylesheet for the playground UI. Page background is `#0a0a0a` with `#e0e0e0` text. The canvas has a subtle border and rounded corners with a drop shadow. Controls are laid out in a horizontal flex row matching the canvas width (800px). The scrubber thumb uses the accent color `#e94560`.

## UI Features

- Dark theme canvas (`#1a1a2e` canvas background, `#0a0a0a` page background)
- Play/pause button (toggles between play and pause icons)
- Frame scrubber (range input spanning the full frame count)
- Frame counter display (shows current frame, total frames, and elapsed seconds)
- State info bar (shows state name, FPS, and total duration)
- Keyboard shortcut: **Space** to toggle play/pause

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start Vite dev server |
| `build` | `vite build` | Production build |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `clean` | `rm -rf dist` | Remove build artifacts |
