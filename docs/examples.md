---
title: Example Catalog
scope: All 19 showcase examples with code patterns and concepts
packages: ["@atelier/core", "@atelier/canvas"]
related: ["docs/builder-guide.md", "docs/getting-started.md", "apps/showcase/README.md"]
---

# Atelier Example Catalog

The Atelier showcase app ships with 19 interactive examples organized into 8 categories. Each example is a self-contained `AtelierDocument` built with the `createDocument` fluent API. The showcase app renders them on an HTML canvas using `@atelier/canvas` with play/pause controls, a frame scrubber, and keyboard shortcuts (Space to toggle playback). Two themes are available -- **Minimal** (neutral tones, serif typography) and **Branded** (terracotta accent, warm shadows) -- which style the app chrome without affecting the animation canvas itself.

All examples run at 60 fps on a 600x400 canvas with a `#1E1E1E` dark background.

Source: `apps/showcase/src/examples/`

---

## Summary Table

| # | ID | Name | Category | Frames | Layers | Key Concepts |
|---|-----|------|----------|--------|--------|--------------|
| 1 | `shapes-primitives` | Primitives | Shapes | 180 | 4 | rect, ellipse, rounded rect, staggered opacity |
| 2 | `shapes-path` | Path Drawing | Shapes | 180 | 1 | path points, rotation, scale phasing |
| 3 | `shapes-corner-radius` | Corner Radius | Shapes | 180 | 1 | `visual.shape.cornerRadius` animation |
| 4 | `easing-race` | Easing Race | Easing | 200 | 22 | all 7 easing types compared side by side |
| 5 | `easing-bounce-spring` | Bounce & Spring | Easing | 180 | 5 | spring physics, squish deformation |
| 6 | `motion-slide` | Slide | Motion | 200 | 2 | `frame.x` round-trip, linear-gradient fill |
| 7 | `motion-spin` | Spin | Motion | 180 | 2 | rotation (720 degrees), marker tracking |
| 8 | `motion-scale-pulse` | Scale Pulse | Motion | 180 | 2 | scale breathing, radial-gradient, opacity sync |
| 9 | `styles-gradient-reveal` | Gradient Reveal | Styles | 180 | 3 | linear-gradient, cover/reveal layering |
| 10 | `styles-stroke-width` | Stroke Animation | Styles | 180 | 3 | `visual.stroke.width` animation, staggered shapes |
| 11 | `styles-color-shift` | Color Shift | Styles | 240 | 2 | `visual.fill.color` multi-step interpolation |
| 12 | `composition-stagger` | Stagger Entrance | Composition | 180 | 5 | stagger delay pattern, loop-generated layers |
| 13 | `composition-choreography` | Choreography | Composition | 240 | 5 | multi-phase sequencing, spread + rotate + pulse |
| 14 | `presets-fade-in` | Fade In Preset | Presets | 150 | 6 | `expandPreset()`, reusable delta bundles |
| 15 | `presets-slide-up` | Slide Up Preset | Presets | 150 | 4 | preset with positional offset adjustment |
| 16 | `templates-branded-title` | Branded Title Card | Templates | 180 | 7 | `.variable()`, `bounds.width` animation |
| 17 | `templates-notification` | Notification Banner | Templates | 180 | 4 | spring easing, enter/exit choreography |
| 18 | `states-intro-outro` | Intro / Outro | States | 120+90 | 6 | two-state document, entrance vs exit |
| 19 | `states-traffic-light` | Traffic Light | States | 120+90+120 | 5 | three-state machine, mutual exclusion |

---

## Shapes

Source: `apps/showcase/src/examples/shapes.ts`

These examples demonstrate the three visual shape primitives available in Atelier: `rect`, `ellipse`, and `path`.

### 1. Primitives (`shapes-primitives`)

Three shapes appear sequentially with staggered timing: a terracotta rect, a blue ellipse, and a green rounded rect (cornerRadius 24). Each fades in and slides upward from y:200 to y:150. A title label fades in first.

**Demonstrates:** Shape types, staggered entrance timing, `frame.y` + `opacity` animation.

```ts
.addLayer({
  id: "rounded",
  visual: {
    type: "shape",
    shape: { type: "rect", cornerRadius: 24 },
    fill: { type: "solid", color: "#7A8B6F" },
  },
  frame: { x: 400, y: 150 },
  bounds: { width: 120, height: 120 },
  opacity: 0,
})
```

**Notable technique -- staggered ranges:** Each shape's delta starts 20 frames later than the previous: rect at [20,50], ellipse at [40,70], rounded at [60,90].

### 2. Path Drawing (`shapes-path`)

A diamond shape defined with four path points rotates 360 degrees over the full state while scaling from 0.5 up to 1.2 and back to 1.0 in two phases.

**Demonstrates:** Custom `path` shapes with point arrays, multi-phase scale animation, `closed: true`.

```ts
shape: {
  type: "path",
  points: [
    { x: 60, y: 0 },
    { x: 120, y: 60 },
    { x: 60, y: 120 },
    { x: 0, y: 60 },
  ],
  closed: true,
},
```

**Notable technique -- two-phase scale:** The scale animation splits into two ranges: [40,119] scales up to 1.2, then [120,180] eases back to 1.0, creating an expand-and-settle effect.

### 3. Corner Radius (`shapes-corner-radius`)

A single rectangle whose `cornerRadius` animates from 0 (sharp square) to 75 (fully circular) and back, while simultaneously rotating 180 degrees. The morph creates a smooth square-to-circle-to-square transformation.

**Demonstrates:** `visual.shape.cornerRadius` as an animatable property, concurrent rotation.

```ts
.addDelta("morph", {
  layer: "shape",
  property: "visual.shape.cornerRadius",
  range: [0, 89],
  from: 0,
  to: 75,
  easing: "ease-in-out",
})
```

---

## Easing

Source: `apps/showcase/src/examples/easing.ts`

Direct visual comparison of all easing functions supported by the engine.

### 4. Easing Race (`easing-race`)

Seven colored circles race horizontally across the screen from x:150 to x:530, each with a different easing function. Monospace labels on the left identify each curve. Faint track lines provide visual reference.

**Demonstrates:** All 7 easing types in one view.

| Easing | Type | Parameters |
|--------|------|------------|
| `linear` | object | `{ type: "linear" }` |
| `ease-in` | string | `"ease-in"` |
| `ease-out` | string | `"ease-out"` |
| `ease-in-out` | string | `"ease-in-out"` |
| `cubic-bezier` | object | `{ type: "cubic-bezier", x1: 0.68, y1: -0.55, x2: 0.27, y2: 1.55 }` |
| `spring` | object | `{ type: "spring", mass: 1, stiffness: 100, damping: 10 }` |
| `step` | object | `{ type: "step", steps: 8 }` |

**Notable technique -- loop-generated layers:** Rows are defined in a data array and both layers and deltas are generated with a `for` loop, keeping the code DRY. Each dot shares identical `range: [20, 170]` and `from: 150, to: 530` values -- only the easing differs.

### 5. Bounce & Spring (`easing-bounce-spring`)

Two balls drop from y:80 to y:280 side by side. The left ball uses `ease-in-out` and squishes on landing (scale.x:1.15, scale.y:0.85). The right ball uses spring physics (stiffness:120, damping:8) and naturally overshoots its target.

**Demonstrates:** Spring vs standard easing, scale deformation for squish effect.

```ts
easing: {
  type: "spring",
  mass: 1,
  stiffness: 120,
  damping: 8,
},
```

**Notable technique -- squish deformation:** Asymmetric scale values at the landing range (`scale.x` to 1.15, `scale.y` to 0.85) simulate an elastic squash on the eased ball.

---

## Motion

Source: `apps/showcase/src/examples/motion.ts`

Core motion primitives: translation, rotation, and scale.

### 6. Slide (`motion-slide`)

A rounded rectangle with a linear-gradient fill (terracotta to purple, 135 degrees) slides along a track from x:50 to x:470 and back. Two delta phases create the round-trip.

**Demonstrates:** `frame.x` translation, round-trip animation with two deltas, gradient fill.

Two deltas create the round-trip: `range: [10, 89]` slides right, `range: [110, 189]` slides left. Frames 90-109 have no active deltas, creating a natural pause at the far end.

### 7. Spin (`motion-spin`)

A circle with a stroke border and a smaller marker dot both rotate 720 degrees (two full turns) over 180 frames. The marker orbits visually because it shares the same rotation delta.

**Demonstrates:** `rotation` property, synchronized multi-layer rotation.

```ts
.addDelta("spin", {
  layer: "spinner",
  property: "rotation",
  range: [0, 180],
  from: 0,
  to: 720,
  easing: "ease-in-out",
})
```

### 8. Scale Pulse (`motion-scale-pulse`)

A circle with a radial-gradient fill (green center to dark teal edge) scales from 0.6 up to 1.4 and back in a breathing pattern. An outer ring's opacity pulses in sync (0.15 to 0.5 and back).

**Demonstrates:** `scale.x`/`scale.y` animation, `radial-gradient` fill, coordinated opacity.

```ts
fill: {
  type: "radial-gradient",
  center: { x: 0.5, y: 0.5 },
  radius: 0.5,
  stops: [
    { offset: 0, color: "#7A8B6F" },
    { offset: 1, color: "#3A5A6B" },
  ],
},
```

**Notable technique -- synchronized layers:** The outer ring's opacity delta ranges mirror the inner circle's scale ranges exactly, creating visual coherence without coupling the values.

---

## Styles

Source: `apps/showcase/src/examples/styles.ts`

Visual styling capabilities: gradients, strokes, and color interpolation.

### 9. Gradient Reveal (`styles-gradient-reveal`)

A three-stop linear gradient (terracotta / purple / blue at 45 degrees) is hidden behind a solid dark cover layer. The cover fades to opacity 0, revealing the gradient beneath. A label fades in and slides up.

**Demonstrates:** `linear-gradient` with three stops, layer stacking for reveal effects.

```ts
fill: {
  type: "linear-gradient",
  angle: 45,
  stops: [
    { offset: 0, color: "#C75B39" },
    { offset: 0.5, color: "#5B4A6F" },
    { offset: 1, color: "#4A7C91" },
  ],
},
```

### 10. Stroke Animation (`styles-stroke-width`)

Three shapes (circle, rectangle, diamond path) have their `visual.stroke.width` animated from 1 to 10 and back, with staggered timing. Each shape has a different stroke color and starts its animation 15 frames after the previous.

**Demonstrates:** `visual.stroke.width` as an animatable property, staggered timing across multiple shapes.

```ts
.addDelta("grow", {
  layer: "circle",
  property: "visual.stroke.width",
  range: [0, 89],
  from: 1,
  to: 10,
  easing: "ease-in-out",
})
```

### 11. Color Shift (`styles-color-shift`)

A rounded rectangle cycles through four fill colors in sequence: terracotta, blue, green, amber, and back to terracotta. Each transition occupies 60 frames. The corner radius simultaneously morphs from 16 to 60 and back.

**Demonstrates:** `visual.fill.color` animation with RGB interpolation, four-step color cycle.

```ts
.addDelta("shift", {
  layer: "swatch",
  property: "visual.fill.color",
  range: [0, 59],
  from: "#C75B39",
  to: "#4A7C91",
  easing: "ease-in-out",
})
// ... three more color transitions
```

**Notable technique -- chained color deltas:** Four consecutive deltas each pick up where the previous left off, creating a seamless loop through the palette.

---

## Composition

Source: `apps/showcase/src/examples/composition.ts`

Techniques for coordinating multiple layers in time and space.

### 12. Stagger Entrance (`composition-stagger`)

Five rounded rectangles (bars) enter from below the canvas (y:400 to y:120), each delayed by 15 frames from the previous. Colors cycle through the palette. Layers and deltas are generated in a loop.

**Demonstrates:** Stagger delay pattern, programmatic layer/delta generation.

```ts
for (let i = 0; i < 5; i++) {
  const start = 10 + i * 15;  // 15-frame stagger
  const end = start + 50;

  builder.addDelta("enter", {
    layer: `bar-${i}`,
    property: "frame.y",
    range: [start, end],
    from: 400, to: 120,
    easing: "ease-out",
  });
}
```

**Notable technique -- computed ranges:** The stagger is purely a matter of arithmetic on the `range` start value. No special stagger API is needed; the delta system handles it naturally.

### 13. Choreography (`composition-choreography`)

A four-phase animation: (1) a center circle scales in from 0.2, (2) four rectangles appear and spread outward to the corners with staggered opacity, (3) everything rotates in unison (center 360 degrees, corners 180 degrees), (4) the center pulses with a scale up/down. 240 frames total, 5 shapes.

**Demonstrates:** Multi-phase sequencing, radial spread, coordinated rotation.

```ts
// Phase 2: Four rects spread outward (staggered by 5 frames each)
.addDelta("dance", {
  layer: "tl",
  property: "frame.x",
  range: [30, 80],
  from: 300, to: 160,
  easing: "ease-out",
})
// ... tr starts at [35,85], bl at [40,90], br at [45,95]
```

**Notable technique -- phase boundaries:** Each phase occupies a distinct frame range (0-40, 30-95, 100-180, 180-240) with slight overlaps to avoid hard cuts.

---

## Presets

Source: `apps/showcase/src/examples/presets.ts`

Reusable animation patterns via the `Preset` type and `expandPreset()` function.

### 14. Fade In Preset (`presets-fade-in`)

A `Preset` object defines two relative deltas (opacity 0 to 1, frame.y +20 to 0). It is registered with `builder.preset()` and then applied to three cards and their labels using `expandPreset()`. Each card receives a 25-frame stagger.

**Demonstrates:** `Preset` type, `expandPreset()`, `builder.preset()` registration.

```ts
const fadeIn: Preset = {
  description: "Fade in with upward slide",
  deltas: [
    { property: "opacity", offset: [0, 30], from: 0, to: 1, easing: "ease-out" },
    { property: "frame.y", offset: [0, 30], from: 20, to: 0, easing: "ease-out" },
  ],
};

builder.preset("fade-in", fadeIn);

// Apply to each card
const cardDeltas = expandPreset(fadeIn, card.id, startFrame, 30);
for (const delta of cardDeltas) {
  if (delta.property === "frame.y") {
    delta.from = cards[i].y + 20;
    delta.to = cards[i].y;
  }
  builder.addDelta("enter", delta);
}
```

**Notable technique -- position adjustment:** Preset `frame.y` values are relative. After expansion, the `from`/`to` values are overridden with absolute positions for each layer.

### 15. Slide Up Preset (`presets-slide-up`)

A `slideUp` preset (opacity + frame.y from +40 below) is applied to a title, subtitle, and button with staggered start frames. Demonstrates a complete "welcome screen" entrance pattern.

**Demonstrates:** Preset reuse across heterogeneous layers (text, shape), staggered preset application.

```ts
const slideUp: Preset = {
  description: "Slide up from below with fade",
  deltas: [
    { property: "opacity", offset: [0, 25], from: 0, to: 1, easing: "ease-out" },
    { property: "frame.y", offset: [0, 35], from: 40, to: 0, easing: "ease-out" },
  ],
};

const elements = [
  { id: "title", y: 120, start: 10 },
  { id: "subtitle", y: 175, start: 30 },
  { id: "button-bg", y: 230, start: 50 },
  { id: "button-text", y: 240, start: 55 },
];
```

---

## Templates

Source: `apps/showcase/src/examples/templates.ts`

Template variables make documents customizable. The `.variable()` method declares named slots that consumers can override.

### 16. Branded Title Card (`templates-branded-title`)

A polished title card with three template variables: `title` (string), `brandColor` (color), `accentColor` (color). An accent line "draws in" by animating `bounds.width` from 0 to 200 while shifting `frame.x` to keep it centered. The title and subtitle fade in with upward motion. Decorative corner brackets appear last at reduced opacity.

**Demonstrates:** `.variable()` for template slots, `bounds.width` animation, sequenced entrance.

```ts
.variable("title", {
  type: "string",
  default: titleText,
  description: "Main title text displayed on the card",
})
.variable("brandColor", {
  type: "color",
  default: brandColor,
  description: "Primary brand color for the accent bar and title",
})
```

**Notable technique -- expanding width from center:** The accent line animates both `bounds.width` (0 to 200) and `frame.x` (300 to 200) in the same range, creating the illusion of drawing outward from the center point.

### 17. Notification Banner (`templates-notification`)

A notification banner with template variables for `message` (string) and `iconColor` (color). The banner slides down from off-screen (y:-60 to y:30) using spring easing (stiffness:200, damping:15), pauses for ~80 frames, then slides back up with `ease-in`. All four child layers (background, icon, checkmark, text) share identical spring easing on entry.

**Demonstrates:** Spring easing for natural motion, enter/pause/exit pattern, template variables.

```ts
.addDelta("show", {
  layer: "banner",
  property: "frame.y",
  range: [10, 50],
  from: -60, to: 30,
  easing: { type: "spring", mass: 1, stiffness: 200, damping: 15 },
})
// icon, check, message all use the same spring + range
```

**Notable technique -- rigid group motion:** All four layers share identical easing and range values for both entry ([10,50] with spring) and exit ([130,170] with ease-in), so the banner moves as a single unit.

---

## States

Source: `apps/showcase/src/examples/states.ts`

State-based animation: the same layers with different animation sequences per state.

### 18. Intro / Outro (`states-intro-outro`)

Two states defined on the same 6 layers (gradient background, heading, body text, 3 colored dots). The `intro` state (120 frames) fades everything in with upward motion and subtle scale on the background. The `outro` state (90 frames) reverses the sequence -- dots fade first, then text, then background shrinks and fades. Exit uses `ease-in` for a natural accelerating departure.

**Demonstrates:** Multi-state documents, entrance vs exit choreography, reversed timing order.

```ts
.addState("intro", { duration: 120, description: "Entrance animation" })
// bg fades in [0,40], heading [20,50], body [35,65], dots [50-80]

.addState("outro", { duration: 90, description: "Exit animation" })
// dots fade out [0-25], body [15,40], heading [25,50], bg [40,70]
```

**Notable technique -- reversed stagger order:** Intro brings elements in front-to-back (bg first, dots last). Outro removes them back-to-front (dots first, bg last), creating a natural layered collapse.

### 19. Traffic Light (`states-traffic-light`)

Three states (`red`, `yellow`, `green`) each activate a different light. The active light scales up to 1.05x and brightens to full opacity while the others dim to 0.2. A housing rectangle and label provide context. State durations differ: red and green are 120 frames, yellow is 90.

**Demonstrates:** Three-state machine, mutual exclusion pattern (only one light active), per-state duration.

```ts
.addState("red", { duration: 120, description: "Red light active -- stop" })
.addDelta("red", {
  layer: "red-light",
  property: "opacity",
  range: [0, 30],
  from: 0.2, to: 1,
  easing: "ease-out",
})
.addDelta("red", {
  layer: "red-light",
  property: "scale.x",
  range: [0, 30],
  from: 0.9, to: 1.05,
  easing: "ease-out",
})
// yellow-light and green-light dim to 0.2
```

**Notable technique -- mutual dimming:** Each state explicitly animates the non-active lights down to 0.2 opacity, ensuring clean transitions regardless of which state was previously active.

---

## Concepts Index

A reverse lookup from concept to the example(s) that demonstrate it.

| Concept | Examples |
|---------|----------|
| **Shape types** | |
| `rect` | Primitives, Corner Radius, Slide, Gradient Reveal, Stagger Entrance, Branded Title Card, Traffic Light |
| `ellipse` | Primitives, Easing Race, Bounce & Spring, Spin, Scale Pulse, Intro/Outro, Traffic Light |
| `path` (custom points) | Path Drawing, Stroke Animation |
| **Animatable properties** | |
| `frame.x` / `frame.y` | Primitives, Easing Race, Slide, Stagger Entrance, Choreography, Notification Banner, Intro/Outro |
| `rotation` | Path Drawing, Corner Radius, Spin, Choreography |
| `scale.x` / `scale.y` | Path Drawing, Bounce & Spring, Scale Pulse, Choreography, Intro/Outro, Traffic Light |
| `opacity` | Primitives, Stagger Entrance, Gradient Reveal, Fade In Preset, Branded Title Card, Intro/Outro |
| `visual.shape.cornerRadius` | Corner Radius, Color Shift |
| `visual.stroke.width` | Stroke Animation |
| `visual.fill.color` | Color Shift |
| `bounds.width` | Branded Title Card |
| **Fill types** | |
| `linear-gradient` | Slide, Gradient Reveal, Slide Up Preset, Intro/Outro |
| `radial-gradient` | Scale Pulse |
| **Easing functions** | |
| `spring` | Easing Race, Bounce & Spring, Notification Banner |
| `cubic-bezier` | Easing Race |
| `step` | Easing Race |
| **Patterns** | |
| Stagger timing | Primitives, Stagger Entrance, Choreography, Fade In Preset, Slide Up Preset, Intro/Outro |
| Multi-phase sequencing | Path Drawing, Slide, Scale Pulse, Choreography, Color Shift |
| `Preset` / `expandPreset()` | Fade In Preset, Slide Up Preset |
| `.variable()` templates | Branded Title Card, Notification Banner |
| Multi-state documents | Intro/Outro, Traffic Light |
| Enter/exit choreography | Notification Banner, Intro/Outro |
| Loop-generated layers | Easing Race, Stagger Entrance, Fade In Preset |

---

## Color Palette Reference

All examples draw from a consistent 7-color palette:

| Name | Hex | Usage |
|------|-----|-------|
| Terracotta | `#C75B39` | Primary warm accent |
| Blue | `#4A7C91` | Cool contrast |
| Green | `#7A8B6F` | Earthy complement |
| Amber | `#D4A574` | Warm secondary |
| Purple | `#5B4A6F` | Deep accent |
| Teal | `#3A5A6B` | Dark cool tone |
| Cream | `#F5F0EB` | Text and highlights |
