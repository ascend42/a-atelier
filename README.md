---
title: Atelier
scope: Project overview, quick start, package reference
packages: ["@atelier/types", "@atelier/math", "@atelier/schema", "@atelier/core", "@atelier/canvas", "@atelier/studio", "@atelier/mcp", "@atelier/cli"]
related: ["docs/architecture.md", "docs/format-spec.md", "docs/getting-started.md"]
---

# Atelier

**AI-native animation engine** -- a declarative YAML format (`.atelier` files) authored through MCP tools.

Atelier lets AI agents create, edit, and preview animations through a structured tool interface, while developers can use the same engine programmatically via a fluent Builder API or command-line tool.

**Version 0.34.0** | 11 packages | 2 apps

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Packages](#packages)
- [Apps](#apps)
- [Dependency Graph](#dependency-graph)
- [Monorepo Commands](#monorepo-commands)
- [The `.atelier` Format](#the-atelier-format)
- [Documentation](#documentation)
- [Version History](#version-history)

---

## Overview

Atelier is a monorepo containing a full animation pipeline:

1. **Define** animations as declarative YAML documents with layers, states, and deltas
2. **Validate** documents against strict Zod schemas with AI-readable error messages
3. **Resolve** any frame by interpolating delta values through easing functions and spring physics
4. **Render** resolved frames to Canvas 2D with shapes, text, gradients, and transforms
5. **Edit** animations in a browser-based studio with GUI panels, undo/redo, and drag-to-reorder
6. **Export** to MP4, WebM, or GIF from the browser (WebCodecs) or CLI (FFmpeg)
7. **Export** to SVG strings or Lottie JSON for web and motion design workflows
8. **Author** animations through 52 MCP tools that an AI agent can call directly

The engine supports 27 animatable properties, 5 easing types (linear, cubic-bezier, ease presets, spring, step), hierarchical state machines with smooth transitions, template instantiation with variable substitution, animation presets, expression-driven animation, blend modes, motion paths, clip paths, audio sync, asset/variable management, layer interactions, and overlap validation.

---

## Install

```bash
npm i -g @a-company/atelier
```

This gives you two commands:

- `atelier` -- CLI for validating, inspecting, and rendering `.atelier` files
- `atelier-mcp` -- MCP server for AI-assisted animation authoring

---

## Quick Start

### Path 1: AI Agent (MCP)

Add the MCP server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "atelier": {
      "command": "atelier-mcp"
    }
  }
}
```

The agent gains access to 52 tools across 16 groups for creating and manipulating animations:

```
atelier_create        -- create a new document
atelier_add_layer     -- add a layer with visual properties
atelier_add_state     -- define an animation state
atelier_add_delta     -- animate a property over a frame range
atelier_preview       -- resolve a frame and inspect the result
atelier_validate      -- check document validity
atelier_export_svg    -- export a frame as SVG
atelier_export_lottie -- export document to Lottie JSON
atelier_profile       -- profile frame resolution performance
```

### Path 2: Programmatic (Builder API)

```typescript
import { createDocument, resolveFrame } from "@atelier/core";

const doc = createDocument("My Animation", { width: 800, height: 600, fps: 60 })
  .addLayer({
    id: "circle",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#e94560" },
    },
    frame: { x: 100, y: 200 },
    bounds: { width: 100, height: 100 },
    opacity: 0,
  })
  .addState("intro", { duration: 60 })
  .addDelta("intro", {
    layer: "circle",
    property: "opacity",
    range: [0, 30],
    from: 0,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "circle",
    property: "frame.x",
    range: [0, 60],
    from: 100,
    to: 400,
    easing: "ease-in-out",
  })
  .build();

const frame = resolveFrame(doc, "intro", 15);
// => resolved layer positions, opacities, and visual properties at frame 15
```

### Path 3: CLI

```bash
# Validate an .atelier file (schema + delta overlap detection)
atelier validate animation.atelier

# Print document summary (canvas, layers, states, presets)
atelier info animation.atelier

# Resolve a single frame to JSON or PNG
atelier still animation.atelier --state intro --frame 30
atelier still animation.atelier --state intro --frame 30 --format png -o frame.png

# Render to MP4 or GIF (requires FFmpeg + node-canvas)
atelier render animation.atelier -o output.mp4
atelier render animation.atelier -o output.gif -f gif

# Export to SVG or Lottie
atelier export-svg animation.atelier --state intro --frame 0 -o frame.svg
atelier export-lottie animation.atelier -o animation.json

# Inspect assets and variables
atelier assets animation.atelier
atelier variables animation.atelier
```

---

## Packages

| Package | Description | Key Exports |
|---------|-------------|-------------|
| [`@atelier/types`](packages/types) | 60+ pure TypeScript type definitions, zero runtime | `AtelierDocument`, `Layer`, `Delta`, `State`, `Canvas`, `Easing`, `AnimatableProperty`, `Shadow`, `Audio`, `Asset`, `Variable`, `Interaction`, shape/color/unit types |
| [`@atelier/math`](packages/math) | Pure interpolation engine | `linear`, `cubicBezier`, `easeIn`, `easeOut`, `easeInOut`, `step`, `spring`, `lerp`, `clamp`, `hexToRgba`, `lerpRgba`, `lerpHsla`, `evaluatePathAtProgress` |
| [`@atelier/schema`](packages/schema) | Zod validation + YAML parse/serialize | `validateDocument`, `validateLayer`, `validateDelta`, `parseAtelier`, `serializeAtelier`, all Zod schemas |
| [`@atelier/core`](packages/core) | Animation engine | `resolveFrame`, `DocumentBuilder`, `createDocument`, `StateMachine`, `blendResolvedFrames`, `instantiateTemplate`, `expandPreset`, `evaluateExpression`, `computeAudioState`, `validateNoOverlap` |
| [`@atelier/canvas`](packages/canvas) | Canvas 2D renderer | `renderFrame`, `buildEffectiveLayer`, `colorToCSS`, `renderShape`, `renderText`, `ImageCache` |
| [`@atelier/svg`](packages/svg) | SVG string renderer | `renderFrameSVG`, shape/gradient/filter/clip/text mapping to SVG elements |
| [`@atelier/lottie`](packages/lottie) | Lottie JSON exporter (lossy, best-effort) | `exportToLottie`, layer/shape/keyframe/easing/color mapping with warnings |
| [`@atelier/react`](packages/react) | React integration | `Animation`, `useAnimation`, `useAnimationState`, `AnimationPlayer` |
| [`@atelier/studio`](packages/studio) | Browser editor widget + video/GIF export | `AtelierStudio`, `exportDocument`, `supportsWebCodecs`, CSS panels and controls |
| [`@atelier/mcp`](packages/mcp) | MCP server (52 tools) for AI authoring | `createServer`, `DocumentStore` |
| [`@atelier/cli`](packages/cli) | CLI tool (9 commands) | `validateFile`, `getInfo`, `resolveStill`, `renderDocument`, `exportSvg`, `exportLottie` |

---

## Apps

| App | Description |
|-----|-------------|
| [`apps/playground`](apps/playground) | Vite dev app with canvas playback, Player class, scrubber, and keyboard controls |
| [`apps/showcase`](apps/showcase) | Interactive animation catalog with 19 examples across 8 categories (shapes, easing, motion, styles, composition, presets, templates, states) and 2 switchable themes |

---

## Dependency Graph

```
@atelier/types    @atelier/math
      \               /
       \             /
        v           v
      @atelier/schema
            |
            v
      @atelier/core
            |
            v
      @atelier/canvas
       / |  |  \   \
      v  v  v   v   v
 svg lottie react studio mcp cli
```

`types` and `math` have no internal dependencies and build in parallel. Each subsequent layer depends only on the packages above it. `svg`, `lottie`, `react`, `studio`, `mcp`, and `cli` all depend on `canvas`/`core` and can build in parallel.

---

## Development

To work on Atelier itself:

```bash
git clone <repo-url> && cd a-atelier
pnpm install
pnpm build
pnpm test
```

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages (via Turborepo) |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm dev` | Start dev servers |
| `pnpm clean` | Clean all `dist/` directories |

**Toolchain:** pnpm workspaces + Turborepo for orchestration, tsup for builds (ESM + CJS + DTS dual output), vitest for testing, TypeScript strict mode throughout.

---

## The `.atelier` Format

Atelier documents are YAML files describing layered, stateful animations:

```yaml
atelier: "1.0"
name: Hello World
canvas:
  width: 800
  height: 600
  fps: 60
  background: "#1a1a2e"

layers:
  - id: title
    visual:
      type: text
      content: "Hello, Atelier"
      font: { family: Inter, size: 48 }
    frame: { x: 200, y: 280 }
    opacity: 0

states:
  - name: intro
    duration: 90
    deltas:
      - layer: title
        property: opacity
        range: [0, 30]
        from: 0
        to: 1
        easing: ease-out
      - layer: title
        property: frame.y
        range: [0, 60]
        from: 320
        to: 280
        easing: ease-in-out
```

**Core concepts:**

- **Layers** define the visual elements (shapes, text, images, groups) with position, size, and style
- **States** are named segments of animation with a frame duration
- **Deltas** animate a single property of a single layer over a frame range within a state
- **Presets** are reusable delta templates (fade-in, slide-up) that expand into concrete deltas
- **Templates** are documents with `{{variable}}` placeholders for instantiation
- **State machines** drive playback through ordered state transitions

---

## Documentation

### Guides
- [Getting Started](docs/getting-started.md) -- installation, first animation, running the showcase
- [AI Agent Guide](docs/ai-agent-guide.md) -- MCP setup, authoring workflows, recipes, error recovery
- [Builder Guide](docs/builder-guide.md) -- programmatic animation construction via the fluent API
- [State Machine Guide](docs/state-machine-guide.md) -- multi-state animations and state transitions
- [Examples](docs/examples.md) -- annotated animation examples

### Reference
- [Format Specification](docs/format-spec.md) -- complete `.atelier` YAML format, every field and constraint
- [MCP Reference](docs/mcp-reference.md) -- all 52 MCP tools with parameters and responses
- [Architecture](docs/architecture.md) -- package design, dependency flow, rendering pipeline
- [Rendering Pipeline](docs/rendering-pipeline.md) -- frame resolution through canvas output

### Project
- [Design Decisions](docs/design-decisions.md) -- rationale behind key architectural choices
- [Contributing](docs/contributing.md) -- development setup, testing, PR workflow
- [Glossary](docs/glossary.md) -- terminology reference
- [Proposal](docs/PROPOSAL.md) -- original project proposal and design rationale
- [Changelog](CHANGELOG.md) -- detailed version history

---

## Version History

| Version | Milestone |
|---------|-----------|
| 0.25.1 | Paradigm framework repair: fix .purpose YAML errors, add svg/lottie/types/core coverage |
| 0.25.0 | M14: Performance analysis — 4 new MCP tools (profile, diff, batch, complexity) |
| 0.24.0 | M13: Composition/nesting — 2 new MCP ref layer tools |
| 0.23.0 | M12: Interactions & events — trigger-action bindings, 3 new MCP tools |
| 0.22.0 | M11: Variable management — 3 new MCP tools, 1 CLI command |
| 0.21.0 | M10: Asset management — 3 new MCP tools, 1 CLI command |
| 0.20.0 | M9: MCP + CLI parity — 10 new MCP tools, 2 CLI commands, still PNG support |
| 0.19.0 | M8: Hierarchical states, state transitions, `@atelier/svg`, `@atelier/lottie`, `@atelier/react` |
| 0.18.0 | M7: Blend modes, motion paths, clip paths, gradient animation, expressions, audio sync |
| 0.17.3 | Rename to a-atelier, CLI as `@a-company/atelier`, MCP binary |
| 0.17.2 | README overhaul, AGENTS.md, docs updates |
| 0.17.1 | Paradigm config generalization, Claude Code hooks |
| 0.17.0 | Studio browser export: MP4 (WebCodecs), WebM (VP9), GIF (built-in encoder) |
| 0.16.0 | CLI `atelier render` command: MP4/GIF export via FFmpeg |
| 0.15.0 | Studio undo/redo, group/ref rendering, asset management |
| 0.14.0 | Shadow/glow properties, keyboard shortcuts, image layers, path editing |
| 0.13.0 | Stroke trim (`visual.stroke.start`/`end`), color interpolation fix |
| 0.12.0 | Delta naming, dual-thumb range slider, mini timeline, sort deltas |
| 0.11.0 | Drag-to-reorder layers and deltas |
| 0.10.0 | Inline delta editor with property-matched controls |
| 0.9.0 | Studio side-by-side layout, CSS bundling |
| 0.8.0 | `@atelier/studio` package: canvas preview, YAML viewer, GUI editor |
| 0.7.3 | 22-document documentation suite |
| 0.7.2 | Showcase restyle with Cormorant Garamond and editorial palette |
| 0.7.1 | Fix: hold property value after delta range ends |
| 0.7.0 | Interactive showcase with 19 examples across 8 categories |
| 0.6.0 | State machine + template system |
| 0.5.0 | CLI tool + playground app |
| 0.4.0 | MCP server with 25 tools |
| 0.3.0 | Canvas 2D renderer |
| 0.2.0 | Core animation engine |
| 0.1.0 | Types + math + schema |
| 0.0.1 | Monorepo scaffold |

See [CHANGELOG.md](CHANGELOG.md) for full details.
