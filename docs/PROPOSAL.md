# a-atelier: Animation Engine Proposal

## What This Is

A declarative, JSON-based animation format and engine designed to be:
- Written by machines (AI agents, scripts, APIs) and readable by humans
- Rendered across any environment via pluggable renderers
- Stateful and interactive, not just timeline playback
- The missing standard for programmatic animation authoring

---

## Problem Areas That Need To Be Addressed

Each section identifies a core area, what it involves, and whether to build from scratch or leverage existing technology.

---

### 1. The Document Format / Spec

**What it is:** The JSON structure that defines an animation — canvas size, layers, keyframes, states, variables. This is the core of the entire project. Everything else consumes or produces this format.

**Key decisions:**
- Flat layer model with `parentId` references (confirmed)
- Structured path points for shapes (confirmed — object-based, not SVG d-string)
- Per-property keyframes (animate `opacity`, `transform.x`, etc. independently)
- Variable/data binding system for parameterized animations
- Expression system: TBD — may create a custom structure, leaving open-ended

**Build or adopt:** **Build from scratch.** This is the product. No existing format serves this purpose. Lottie is an AE export format. Rive is proprietary binary. Nothing exists as an open, programmatic-first animation interchange spec.

**Depends on:** Nothing. This comes first.

---

### 2. Schema Validation

**What it is:** A way to validate that a JSON document conforms to the format spec. Also generates TypeScript types and enables tooling (autocomplete, error messages).

**Options:**
| Option | Pros | Cons |
|---|---|---|
| **Zod** | Runtime + static types, great ecosystem, composable | JS/TS only |
| **JSON Schema** | Language-agnostic, wide tooling support | Verbose, weaker type inference |
| **Both** | Zod as primary, generate JSON Schema from it | Extra build step |

**Build or adopt:** **Adopt Zod as primary**, generate JSON Schema for cross-language use. No need to reinvent validation.

**Depends on:** #1 (Document Format)

---

### 3. Document Builder API

**What it is:** A programmatic, fluent API for constructing animation documents without writing raw JSON. This is what AI agents and developers use day-to-day.

```ts
const anim = maker({ width: 1920, height: 1080, fps: 30, duration: 150 })
  .layer('bg', 'shape', { shape: { type: 'rect', fill: '#0a0a0a' } })
  .layer('title', 'text', { content: 'Hello', style: { fontSize: 64 } })
    .animate('opacity', [0, 0], [30, 1], 'easeOut')
    .animate('transform.y', [0, 580], [30, 540], 'spring')
  .build();
```

**Build or adopt:** **Build from scratch.** This is tightly coupled to the format and is a primary DX surface.

**Depends on:** #1 (Document Format), #2 (Schema)

---

### 4. Keyframe Interpolation Engine

**What it is:** The math that takes keyframe definitions and computes the value of any property at any given frame. Given frame 15, `opacity` keyframes at frame 0 (value 0) and frame 30 (value 1) with easeOut — what's the opacity?

**What it includes:**
- Linear interpolation
- Cubic bezier easing (CSS-style)
- Spring physics simulation
- Step functions
- Color interpolation (RGB, HSL, etc.)
- Path/point interpolation (for shape morphing)

**Options:**
| Option | Pros | Cons |
|---|---|---|
| **Build from scratch** | Tailored to format, no deps | Math is well-known but fiddly |
| **Use `popmotion`** | Battle-tested spring/easing | Dependency, may be more than needed |
| **Port easing functions from CSS spec** | Standard, predictable | Springs not included |

**Build or adopt:** **Build from scratch, borrowing known math.** Easing functions and spring solvers are well-documented algorithms. Wrapping a library adds dependency for straightforward math. Own the interpolation so we control precision and can add custom easing types later.

**Depends on:** #1 (Document Format)

---

### 5. State Machine

**What it is:** The system that manages named states, transitions between them, and triggers. This is what makes animations interactive and data-driven rather than just timeline playback.

**Key design questions:**
- Simple flat states with property overrides and transition durations?
- Hierarchical/nested states (like XState state charts)?
- Should entering a state trigger a timeline sequence, or just interpolate to target values?
- What are valid triggers? (events, variable conditions, timeline position, external API calls)
- How do states compose with the main timeline?

**Options:**
| Option | Pros | Cons |
|---|---|---|
| **Build custom** | Tailored to animation domain, simpler | More design work |
| **Integrate XState** | Powerful, well-designed, proven | Heavy, generic (not animation-specific), complex serialization |
| **Rive-inspired model** | Proven for animation specifically | Proprietary inspiration, may over-index on Rive's model |

**Build or adopt:** **Build custom, study Rive and XState for inspiration.** Animation state machines have specific needs (interpolated transitions, timeline interaction) that generic state machines don't address. But the concepts from XState (guards, actions, hierarchical states) are worth borrowing.

**Depends on:** #1 (Document Format), #4 (Interpolation Engine)

---

### 6. Renderers

**What it is:** The layer that reads a document + frame number and draws it to a target. Each environment needs its own renderer. All renderers share the same input (the document format) but produce different output.

#### 6a. Canvas 2D Renderer (Web)
**What it does:** Draws frames to an HTML5 Canvas element. The primary renderer for web preview and the simplest to implement.

**Build or adopt:** **Build from scratch.** Canvas 2D API is low-level enough that there's nothing meaningful to wrap. This is direct draw calls.

#### 6b. SVG Renderer (Web)
**What it does:** Generates SVG DOM elements. Better for accessibility, resolution independence, and CSS integration. Worse for performance with many layers.

**Build or adopt:** **Build from scratch.** Same reasoning as Canvas.

#### 6c. Video Export Renderer
**What it does:** Renders frames sequentially and encodes them into MP4, WebM, GIF, etc.

**Options:**
| Option | Pros | Cons |
|---|---|---|
| **Remotion** | Battle-tested, audio sync, Lambda/cloud rendering, community | Heavy (React, Webpack/esbuild bundler), opinionated architecture, our format would need to be translated into React components |
| **Canvas + FFmpeg (via fluent-ffmpeg or ffmpeg.wasm)** | Lightweight, direct control, no framework | Audio sync is manual work, no built-in cloud rendering |
| **Puppeteer/Playwright + Canvas + FFmpeg** | Can render anything a browser can | Slow (headless browser overhead), heavy |
| **node-canvas + FFmpeg** | No browser needed, fast, server-friendly | node-canvas has system deps (Cairo), some rendering differences vs browser |

**Build or adopt:** **Start with Canvas + FFmpeg (Node).** This gives us the fastest path to video export without framework lock-in. Remotion could be added later as an optional premium renderer if cloud/Lambda rendering is needed, but it shouldn't be foundational — it would force the architecture into React and add significant complexity.

#### 6d. Mobile Renderer (Future)
**What it does:** Renders on iOS/Android via Skia, Core Animation, or Canvas.

**Build or adopt:** **Future.** Not in scope for v1. When ready, react-native-skia is the likely path.

#### 6e. Lottie Export (Future)
**What it does:** Converts a-atelier documents to Lottie JSON (lossy — only features Lottie supports).

**Build or adopt:** **Future.** Useful for adoption (use a-atelier format, export to Lottie for existing pipelines). Complex mapping work.

**Renderers depend on:** #1 (Document Format), #4 (Interpolation Engine)

---

### 7. Timeline / Playback Controller

**What it is:** The clock that drives animation playback. Manages current frame, play/pause/scrub, loop, speed, and requestAnimationFrame scheduling in browser environments.

**Build or adopt:** **Build from scratch.** This is a simple loop — requestAnimationFrame in browser, manual frame stepping for server-side rendering. Not complex enough to warrant a dependency.

**Depends on:** #4 (Interpolation Engine), #6 (Renderer)

---

### 8. React Integration

**What it is:** A `<Animation />` React component that wraps the Canvas or SVG renderer, manages the playback loop, handles events, and exposes controls.

**Build or adopt:** **Build from scratch** as a thin wrapper. The actual rendering is done by the renderer packages. The React layer just manages lifecycle, refs, and event forwarding.

**Depends on:** #6 (Renderer), #7 (Timeline)

---

### 9. CLI Tool

**What it is:** A command-line interface for working with animation files.

**Commands:**
- `a-atelier validate <file>` — validate a document against the schema
- `a-atelier preview <file>` — open a browser preview with hot reload
- `a-atelier render <file> -o output.mp4` — render to video
- `a-atelier render <file> -o output.gif` — render to GIF
- `a-atelier still <file> --frame=30 -o frame.png` — render a single frame
- `a-atelier info <file>` — display document metadata, layer list, duration

**Build or adopt:** **Build from scratch**, using established CLI libraries (e.g., `commander` or `citty` for arg parsing). The CLI is a thin orchestrator calling into core + renderer packages.

**Depends on:** #1 (Document Format), #2 (Schema), #6 (Renderers)

---

### 10. MCP Server

**What it is:** An MCP (Model Context Protocol) server that exposes a-atelier capabilities as tools for AI agents. This is what makes the system AI-native.

**Potential tool surface:**
- `create_animation` — create a new document from parameters
- `add_layer` — add a layer to an existing document
- `animate_property` — add keyframes to a layer property
- `set_state` — define a named state
- `preview` — generate a preview (returns URL or image)
- `render` — render to video/gif and return path
- `list_layers` — inspect current document structure
- `modify_layer` — update layer properties
- `remove_layer` — remove a layer

**Build or adopt:** **Build from scratch.** MCP server is a thin wrapper exposing the builder API (#3) and renderers (#6) as tools.

**Depends on:** #3 (Builder API), #6 (Renderers), #9 (CLI — for rendering)

---

### 11. Asset Management

**What it is:** How the system handles images, fonts, audio files, and other binary assets referenced by animation documents.

**Key decisions:**
- URL references? Local file paths? Base64 embedded? Asset manifest?
- Font loading strategy (Google Fonts, local files, bundled)
- Image optimization (do we handle it or leave it to the user?)
- Audio file format support

**Build or adopt:** **Design the referencing system from scratch. Use existing tools (sharp, fontkit) for processing.** The asset reference model is part of the format spec. Processing is commodity work.

**Depends on:** #1 (Document Format)

---

### 12. Expression / Formula System

**What it is:** An optional system for defining dynamic values that compute at render time rather than being static keyframes. e.g., `"value": "frame * 2 + offset"` or a custom structure.

**This is deliberately left open-ended.** Options range from:
- No expressions (pure keyframes only) — simplest, safest
- A restricted math DSL — middle ground
- A custom structure/AST for composable value transformations
- Full sandboxed expression language

**Build or adopt:** **TBD.** This is a design-heavy decision. We may create something entirely custom here. Needs more thought on what use cases actually require expressions vs what can be solved with keyframes + variables.

**Depends on:** #1 (Document Format), #4 (Interpolation Engine)

---

## Dependency Graph

```
#1 Document Format (THE FOUNDATION)
 ├── #2 Schema Validation (Zod)
 ├── #3 Builder API
 ├── #4 Interpolation Engine
 │    ├── #5 State Machine
 │    ├── #6 Renderers (Canvas, SVG, Video)
 │    │    ├── #7 Timeline / Playback
 │    │    │    └── #8 React Integration
 │    │    └── #9 CLI Tool
 │    │         └── #10 MCP Server
 │    └── #12 Expression System (TBD)
 └── #11 Asset Management
```

---

## Build vs Adopt Summary

| Area | Verdict | Reasoning |
|---|---|---|
| Document Format | **Build** | This IS the product |
| Schema Validation | **Adopt (Zod)** | Commodity, great tooling |
| Builder API | **Build** | Core DX, tightly coupled to format |
| Interpolation Engine | **Build** | Known math, own the precision |
| State Machine | **Build** | Animation-specific needs |
| Canvas Renderer | **Build** | Direct API usage |
| SVG Renderer | **Build** | Direct API usage |
| Video Export | **Build (Canvas + FFmpeg)** | Avoid Remotion lock-in |
| Mobile Renderer | **Future** | Out of scope for v1 |
| Lottie Export | **Future** | Out of scope for v1 |
| Timeline/Playback | **Build** | Simple loop |
| React Component | **Build** | Thin wrapper |
| CLI | **Build + adopt (commander)** | Orchestrator shell |
| MCP Server | **Build** | Thin wrapper over builder + renderers |
| Asset Management | **Build model, adopt tools** | Reference model is format, processing is commodity |
| Expression System | **TBD** | Design-heavy, intentionally deferred |

---

## Design Decisions (Confirmed)

- **Layer model:** Flat array with `parentId` for nesting
- **Shape paths:** Structured point objects (not SVG d-string)
- **Keyframes:** Per-property
- **Remotion:** Not foundational. Possible optional renderer later. Build video export on Canvas + FFmpeg instead.
- **Expression system:** Open-ended. May create custom structure. Deferred.

## Design Decisions (Still Open)

- Primary use case priority: interactive vs video export vs both
- State machine complexity: flat states vs hierarchical
- State + timeline interaction model
- Audio: in scope for v1?
- Asset referencing strategy
- Expression / formula system design
- File extension and naming
- Licensing model
