---
title: Getting Started
scope: Prerequisites, installation, and first animation tutorial
packages: ["@atelier/types", "@atelier/core", "@atelier/canvas", "@atelier/schema"]
related: ["README.md", "docs/format-spec.md", "docs/builder-guide.md"]
---

# Getting Started with Atelier

Atelier is a declarative animation engine where animations are structured data, not code.
You describe _what_ moves, _when_, and _how_ -- the engine handles the rest.

This guide walks you from zero to a running animation in about ten minutes.

## See It In Action

Run the interactive showcase to explore 19 animation examples:

```bash
pnpm --filter @atelier/showcase dev
```

Open http://localhost:5173 -- browse examples, view the YAML source,
and use the visual editor to experiment with properties in real-time.

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| Node.js     | >= 20   | [nodejs.org](https://nodejs.org) |
| pnpm        | >= 8    | `npm install -g pnpm` |
| Git         | any     | [git-scm.com](https://git-scm.com) |

## Installation

```bash
git clone <repo-url> && cd a-atelier
pnpm install
pnpm build        # builds all 7 packages in dependency order
pnpm test         # runs 181 tests across the workspace
```

The build order is automatic (Turborepo resolves it), but the dependency chain is:

```
@atelier/types + @atelier/math
        |
   @atelier/schema
        |
   @atelier/core
        |
   @atelier/canvas
       / \
@atelier/mcp  @atelier/cli
```

## Three Paths to Get Started

Atelier supports three authoring workflows. Pick the one that fits your use case.

### Path A: MCP Server (AI-Assisted)

Best for using Claude or another AI to author animations interactively.

The MCP server exposes 27 tools for creating documents, layers, deltas, states,
presets, shapes, previews, and templates -- all through natural language.

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "atelier": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

Then ask Claude: _"Create a 600x400 animation with a red circle that fades in over 1 second."_

### Path B: TypeScript API (DocumentBuilder)

Best for programmatic animation creation in Node.js or browser apps.

```typescript
import { createDocument } from "@atelier/core";
```

This is the path covered in the tutorial below.

### Path C: YAML Format (Direct Authoring)

Best for hand-crafting animation files or version-controlling them in Git.

Write `.atelier` YAML files and validate them with the CLI:

```bash
npx atelier validate myfile.atelier
npx atelier info myfile.atelier
```

See [docs/format-spec.md](./format-spec.md) for the full YAML specification.

---

## Tutorial: Your First Animation

We will build a circle that fades in, scales up, and holds on screen -- using
the DocumentBuilder API (Path B).

### Step 1: Understand the Core Concepts

Every Atelier animation has four building blocks:

| Concept | What It Is |
|---------|------------|
| **Canvas** | The viewport -- width, height, FPS, and background color |
| **Layer** | A visual element: shape, text, or image with position and size |
| **State** | A named timeline with a fixed duration in frames |
| **Delta** | A property animation -- changes one property of one layer over a frame range |

A document contains one canvas, many layers, and one or more states.
Each state contains deltas that describe how layers change over time.

### Step 2: Create the Document

```typescript
import { createDocument } from "@atelier/core";

const doc = createDocument("My First Animation", {
  width: 600,
  height: 400,
  fps: 60,
  background: "#1E1E1E",
});
```

`createDocument` returns a `DocumentBuilder` -- a fluent API where every method
returns `this`, so you can chain calls.

### Step 3: Add a Layer

```typescript
doc.addLayer({
  id: "circle",
  visual: {
    type: "shape",
    shape: { type: "ellipse" },
    fill: { type: "solid", color: "#C75B39" },
  },
  frame: { x: 250, y: 150 },
  bounds: { width: 100, height: 100 },
  opacity: 0,  // start invisible
});
```

Key fields:
- `id` -- unique identifier, referenced by deltas
- `visual` -- what to draw (shape, text, or image)
- `frame` -- position `{ x, y }` in the canvas coordinate space
- `bounds` -- size `{ width, height }`
- `opacity` -- initial opacity (0 = invisible, 1 = fully visible)

### Step 4: Add a State

```typescript
doc.addState("intro", { duration: 60 });
```

This creates a 60-frame timeline called `"intro"`. At 60 FPS, that is 1 second.

### Step 5: Add Deltas

Deltas animate individual properties. Each delta targets one layer, one property,
and one frame range.

```typescript
// Fade in over frames 0-30
doc.addDelta("intro", {
  layer: "circle",
  property: "opacity",
  range: [0, 30],
  from: 0,
  to: 1,
  easing: "ease-out",
});

// Scale up horizontally over frames 0-30
doc.addDelta("intro", {
  layer: "circle",
  property: "scale.x",
  range: [0, 30],
  from: 0.5,
  to: 1,
  easing: "ease-out",
});

// Scale up vertically over frames 0-30
doc.addDelta("intro", {
  layer: "circle",
  property: "scale.y",
  range: [0, 30],
  from: 0.5,
  to: 1,
  easing: "ease-out",
});
```

The builder validates as you go -- if two deltas try to animate the same property
on the same layer at overlapping frames, it throws immediately. This is the
**no-overlap rule**.

### Step 6: Build the Document

```typescript
const animation = doc.build();
```

`.build()` returns a plain `AtelierDocument` object -- a frozen snapshot of
everything you defined. The builder is done; the document is ready for rendering.

### Putting It All Together

```typescript
import { createDocument, resolveFrame } from "@atelier/core";

const animation = createDocument("My First Animation", {
  width: 600,
  height: 400,
  fps: 60,
  background: "#1E1E1E",
})
  .addLayer({
    id: "circle",
    visual: {
      type: "shape",
      shape: { type: "ellipse" },
      fill: { type: "solid", color: "#C75B39" },
    },
    frame: { x: 250, y: 150 },
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
    property: "scale.x",
    range: [0, 30],
    from: 0.5,
    to: 1,
    easing: "ease-out",
  })
  .addDelta("intro", {
    layer: "circle",
    property: "scale.y",
    range: [0, 30],
    from: 0.5,
    to: 1,
    easing: "ease-out",
  })
  .build();

// Resolve frame 15 (halfway through the fade-in)
const frame15 = resolveFrame(animation, "intro", 15);
console.log(frame15.layers[0].computedProperties);
// { opacity: ~0.75, "scale.x": ~0.875, "scale.y": ~0.875 }
```

`resolveFrame` computes the exact value of every animated property at a given
frame number, applying easing curves and interpolation automatically.

---

## Rendering to Canvas

The `@atelier/canvas` package draws resolved frames onto an HTML Canvas 2D context.

```typescript
import { resolveFrame } from "@atelier/core";
import { renderFrame } from "@atelier/canvas";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
canvas.width = animation.canvas.width;
canvas.height = animation.canvas.height;

// Render a single frame
const resolved = resolveFrame(animation, "intro", 15);
renderFrame(ctx, resolved, animation);
```

`renderFrame` clears the canvas, fills the background, and draws each layer
in order using the painter's algorithm (first layer = back, last = front).

---

## Playback Loop

To play the animation continuously, drive frame advancement with
`requestAnimationFrame`:

```typescript
import { resolveFrame } from "@atelier/core";
import { renderFrame } from "@atelier/canvas";

const state = animation.states["intro"];
let frame = 0;

function animate() {
  const resolved = resolveFrame(animation, "intro", frame);
  renderFrame(ctx, resolved, animation);
  frame = (frame + 1) % state.duration;
  requestAnimationFrame(animate);
}

animate();
```

This is a simplified loop. For frame-rate-accurate playback that respects the
document's FPS setting, see the `Player` class in `apps/playground/src/player.ts`.
It uses a time accumulator to decouple rendering from the display refresh rate.

---

## Animatable Properties

Every delta targets one of these properties:

| Property | Type | Description |
|----------|------|-------------|
| `frame.x` | number | Horizontal position |
| `frame.y` | number | Vertical position |
| `bounds.width` | number | Layer width |
| `bounds.height` | number | Layer height |
| `opacity` | number (0-1) | Transparency |
| `rotation` | number (degrees) | Rotation around anchor point |
| `scale.x` | number | Horizontal scale factor |
| `scale.y` | number | Vertical scale factor |
| `anchorPoint.x` | number (0-1) | Transform origin X |
| `anchorPoint.y` | number (0-1) | Transform origin Y |
| `visual.shape.cornerRadius` | number | Rounded corners (rect) |
| `visual.fill.color` | string | Fill color |
| `visual.stroke.color` | string | Stroke color |
| `visual.stroke.width` | number | Stroke width |
| `visual.style.fontSize` | number | Text font size |
| `visual.style.color` | string | Text color |

## Easing Options

Deltas accept an `easing` field. Available options:

**Presets (strings):**
- `"ease-in"` -- accelerates from zero velocity
- `"ease-out"` -- decelerates to zero velocity
- `"ease-in-out"` -- accelerates then decelerates

**Structured (objects):**

```typescript
// Linear (default when easing is omitted)
{ type: "linear" }

// Custom cubic bezier curve
{ type: "cubic-bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }

// Physics-based spring
{ type: "spring", mass: 1, stiffness: 100, damping: 10, velocity: 0 }

// Discrete steps
{ type: "step", steps: 5, position: "end" }
```

---

## Key Concepts Summary

- **Layer**: A visual element (shape, text, image) with position, size, and style.
  Layers are stacked in document order -- first = back.

- **State**: A named animation timeline with a fixed duration in frames. A document
  can have multiple states (e.g., `"intro"`, `"hover"`, `"exit"`).

- **Delta**: A per-property animation. Each delta changes one property of one layer
  over a specific frame range. Values are interpolated with the specified easing.

- **No-overlap rule**: Two deltas cannot animate the same property on the same
  layer at overlapping frame ranges. The builder enforces this at construction time.

- **Frame resolution**: `resolveFrame(doc, stateName, frameNumber)` computes all
  animated property values at a specific frame, returning a `ResolvedFrame` with
  `computedProperties` for each layer.

- **Hold behavior**: After a delta's frame range ends, the property holds at its
  `to` value for the rest of the state. Properties do not revert.

---

## Next Steps

| Resource | Path | Description |
|----------|------|-------------|
| Builder Guide | [docs/builder-guide.md](./builder-guide.md) | Full DocumentBuilder API reference |
| Format Spec | [docs/format-spec.md](./format-spec.md) | YAML/JSON format specification |
| MCP Reference | [docs/mcp-reference.md](./mcp-reference.md) | All 27 MCP tool descriptions |
| State Machine | [docs/state-machine-guide.md](./state-machine-guide.md) | Multi-state transitions |
| Architecture | [docs/architecture.md](./architecture.md) | Package design and data flow |
| Playground | [apps/playground/](../apps/playground/) | Interactive dev app with scrubber |
| Showcase | [apps/showcase/](../apps/showcase/) | 19-example animation catalog |
