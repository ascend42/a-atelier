---
id: N-atel-101-easings
title: Easings — linear, cubic-bezier, presets, spring, step
type: note
track: ATEL-101
author: atelier
created: '2026-05-18'
updated: '2026-05-18'
tags:
  - course
  - atel-101
  - easings
  - motion
difficulty: beginner
estimatedMinutes: 4
prerequisites:
  - N-atel-101-states-and-deltas
summary: Five easing kinds in Atelier. What each is, when to use it, and the one rule that prevents 90% of bad motion (don't use `linear` for organic movement).
---

## What an easing does

An easing is a function `f(t: 0..1) → 0..1` that maps "fraction of time elapsed" to "fraction of value progress." `f(0) = 0`, `f(1) = 1`. What happens in between is the personality of the motion.

Atelier supports five kinds:

## 1. `linear`

`f(t) = t`. Constant rate. Use for: progress bars, scrubbing, opacity crossfades where the perceived speed matters. **Do not use** for object motion — it looks robotic. Most "feels wrong" motion in the wild is `linear` doing the wrong job.

```yaml
easing: linear
```

## 2. Cubic-Bezier — `cubic-bezier(x1, y1, x2, y2)`

The CSS-style four-control-point bezier. Full control over the shape. This is what every preset below desugars to.

```yaml
easing: cubic-bezier(0.4, 0.0, 0.2, 1.0)    # Material "standard"
```

If you've used CSS transitions, this is the same function.

## 3. Ease presets

Named shortcuts to common bezier curves. Use these instead of memorizing coefficients.

| Preset | Bezier | Use for |
|---|---|---|
| `ease-in` | `(0.4, 0, 1, 1)` | Object accelerating off-screen |
| `ease-out` | `(0, 0, 0.2, 1)` | Object decelerating on entrance (most UI entrance animation) |
| `ease-in-out` | `(0.4, 0, 0.2, 1)` | Crossfades, value-to-value transitions where both endpoints are visible |
| `ease` | `(0.25, 0.1, 0.25, 1)` | The CSS default — generic "feels OK" |

Default for most UI motion: `ease-out` for entrances, `ease-in` for exits.

## 4. Spring physics — `spring({ stiffness, damping, mass? })`

Physics-based. Produces overshoot and oscillation that no bezier can match. Use for: anything that should feel tactile — toggles, drag-release, dismissals.

```yaml
easing:
  type: spring
  stiffness: 170
  damping: 20
  mass: 1
```

Stiffness controls how aggressively the spring pulls toward the target. Damping controls how quickly oscillation dies out. Atelier solves the spring numerically per-frame; the same `startFrame`–`endFrame` window still applies (the spring is clipped at `endFrame` and held at the resolved value after).

When in doubt: `stiffness: 170, damping: 26` for a clean snap; `stiffness: 100, damping: 10` for visible oscillation.

## 5. Step — `step(count)` or `step(count, position)`

Discrete jumps. `step(4)` produces four equal jumps from `from` to `to`. Use for: spritesheet frame indexing (jump through frames at 12fps inside a 60fps composition), digital-readout counters, deliberate stop-motion feel.

```yaml
easing:
  type: step
  count: 4
  position: start    # 'start' | 'end' | 'jump-none' | 'jump-both'
```

## The rule that prevents most bad motion

> If a real physical object would do it, use spring or ease-out.
> If a UI element is reporting progress, use linear.
> Almost nothing else should be linear.

Easings are why motion feels "designed" or "wrong." The engine doesn't care which you pick — the renderer interpolates whatever `f(t)` returns. But your viewer does care, every time.

## Inspecting an easing

The studio's easing-curve-editor (in PropertyPanel when you select a delta) shows the bezier curve, lets you drag control points, and previews the shape against the timeline. For springs, it samples the solver and plots the actual oscillation. There is no "easings preview file" — every delta you author can be inspected and tuned in place.

That closes ATEL-101. You now know enough to read any `.atelier` document and predict what it will render. ATEL-201 covers the MCP tool surface — how an agent builds documents like this without ever touching YAML.
