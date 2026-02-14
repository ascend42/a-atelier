---
title: "@atelier/showcase"
scope: Interactive animation catalog with 19 examples across 8 categories, 2 themes
packages: ["@atelier/showcase"]
related: ["docs/examples.md", "apps/playground/README.md", "packages/canvas/README.md"]
---

# @atelier/showcase

Interactive showcase of Atelier animation capabilities.

- **Version**: 0.1.0
- **Private**: true
- **Source**: `apps/showcase/src/`

## Dependencies

| Package | Type |
|---------|------|
| `@atelier/types` | workspace |
| `@atelier/core` | workspace |
| `@atelier/canvas` | workspace |
| `typescript` | dev |
| `vite` ^6.1.0 | dev |

## Purpose

An interactive catalog demonstrating all Atelier animation capabilities. Browse 19 examples across 8 categories with play/pause controls, scrubbing, and theme switching. Built as a portfolio piece and reference for the animation system.

## Running

```bash
pnpm build
cd apps/showcase
pnpm dev
```

## 19 Examples Across 8 Categories

### Shapes (3 examples)

| Example | ID | Description |
|---------|----|-------------|
| Primitives | `shapes-primitives` | Rectangle, ellipse, and rounded rect appear sequentially with slide-up |
| Path Drawing | `shapes-path` | Diamond path shape with animated rotation and scale |
| Corner Radius | `shapes-corner-radius` | Animated cornerRadius morphing square to circle to square with rotation |

### Easing (2 examples)

| Example | ID | Description |
|---------|----|-------------|
| Easing Race | `easing-race` | 7 circles race across screen, each with different easing (linear, ease-in, ease-out, ease-in-out, cubic-bezier, spring, step) |
| Bounce & Spring | `easing-bounce-spring` | Side-by-side drop: ease-in-out vs spring physics -- notice spring overshoot |

### Motion (3 examples)

| Example | ID | Description |
|---------|----|-------------|
| Slide | -- | Horizontal/vertical slide animations |
| Spin | -- | 720-degree rotation |
| Scale Pulse | -- | Scale up and down pulse effect |

### Styles (3 examples)

| Example | ID | Description |
|---------|----|-------------|
| Gradient Reveal | -- | Animated gradient transitions |
| Stroke Width | -- | Animated stroke width changes |
| Color Cycling | -- | Color animation cycling through hues |

### Composition (2 examples)

| Example | ID | Description |
|---------|----|-------------|
| Staggered Entrance | -- | Multiple elements entering with staggered timing |
| Multi-Phase | -- | Multi-phase choreography with sequential animations |

### Presets (2 examples)

| Example | ID | Description |
|---------|----|-------------|
| Fade-In Preset | -- | Using `expandPreset()` for fade-in |
| Slide-Up Preset | -- | Preset-based slide-up animation |

### Templates (2 examples)

| Example | ID | Description |
|---------|----|-------------|
| Branded Title Card | `templates-branded-title` | Polished title card with template variables (title, brandColor, accentColor). Accent line draws in, title/subtitle fade up, corner decorations appear |
| Notification Banner | `templates-notification` | Reusable notification with variables (message, iconColor). Spring-animated slide down, pause, slide back up |

### States (2 examples)

| Example | ID | Description |
|---------|----|-------------|
| Intro / Outro | `states-intro-outro` | Two states: intro fades everything in with motion, outro fades out -- demonstrates state switching |
| Traffic Light | `states-traffic-light` | Three states (red/yellow/green) -- each activates a light while dimming others, with scale pulse |

## Example Architecture

Each example file exports an array of `Example` objects:

```typescript
interface Example {
  id: string;
  name: string;
  description: string;
  category: string;
  create: () => AtelierDocument;  // factory function
}

interface Category {
  name: string;
  icon: string;
  items: Example[];
}
```

Example source files (all in `apps/showcase/src/examples/`):

- `index.ts` -- Aggregates all categories
- `shapes.ts` -- 3 shape examples
- `easing.ts` -- 2 easing examples
- `motion.ts` -- 3 motion examples
- `styles.ts` -- 3 style examples
- `composition.ts` -- 2 composition examples
- `presets.ts` -- 2 preset examples
- `templates.ts` -- 2 template examples
- `states.ts` -- 2 state examples

All examples use consistent 600x400 canvas at 60fps.

## Themes

Two themes available via toggle:

- **Minimal**: Monospace font, monochrome palette
- **Branded**: Inter font, red accent, glow effects

Restyled in v0.7.2 with Cormorant Garamond font and editorial color palette:

- Deep Charcoal (`#1E1E1E`)
- Paper White (`#F5F0EB`)
- Terracotta (`#C75B39`)
- Instructional Blue (`#4A7C91`)

## UI Features

- Sidebar navigation with category grouping
- Play/pause/scrub controls
- Theme toggle
- Keyboard shortcuts
- Frame counter

## How to Add a New Example

1. Choose the appropriate category file in `apps/showcase/src/examples/`
2. Add a new `Example` object to the exported array:

```typescript
{
  id: "category-name",
  name: "Display Name",
  description: "What this example demonstrates",
  category: "Category",
  create: (): AtelierDocument => {
    return createDocument("Name", { width: 600, height: 400, fps: 60, background: "#1E1E1E" })
      .addLayer(...)
      .addState(...)
      .addDelta(...)
      .build();
  },
}
```
