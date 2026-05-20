---
id: N-atel-401-motion-deep-dive
title: Motion deep dive — springs, expressions, motion paths
type: note
track: ATEL-401
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-401
  - motion
  - springs
  - expressions
  - motion-path
difficulty: intermediate
estimatedMinutes: 8
prerequisites:
  - N-atel-101-easings
summary: Three ways to push past from→to-with-easing. Springs for physical feel, expression-valued deltas for math-driven motion, and motion paths for trajectories. When each earns its complexity.
---

## When a bezier isn't enough

A plain delta is `from → to` shaped by an easing. That covers most motion. This note is the other 10% — three escape hatches, each for a problem the basic delta can't express.

## 1. Spring physics — tuning, not guessing

A spring easing is solved numerically per frame, so it can overshoot and settle in a way no bezier can fake. You set it as the delta's `easing`:

```yaml
easing:
  type: spring
  stiffness: 170
  damping: 20
  mass: 1
```

The three knobs:

| Knob | What it controls | Push it up → |
|---|---|---|
| `stiffness` | how hard the spring pulls toward the target | snappier, faster arrival |
| `damping` | how fast oscillation dies out | less bounce (high = no overshoot) |
| `mass` | inertia of the moving thing | slower, heavier, more lag |

The relationship that matters: **damping relative to stiffness** decides bounce. Low damping against high stiffness oscillates; high damping against the same stiffness glides in with no overshoot. Starting points: `{ stiffness: 170, damping: 26 }` for a clean snap, `{ stiffness: 100, damping: 10 }` for visible springiness. The delta's frame range still clips the solver — the spring is held at its resolved value after the range ends.

Use a spring when the thing should feel **tactile** — toggles, drag-release, dismissals. Use a bezier for crossfades and value-to-value moves where overshoot would be wrong.

## 2. Expression-valued deltas — math as the curve

A delta's `from` and `to` normally hold concrete values. Either can instead hold an **expression object** `{ expr: "..." }` that the engine evaluates **per frame**:

```yaml
- layer: badge
  property: rotation
  range: [0, 120]
  from: 0
  to: { expr: "sin(t * tau) * 8" }
```

The evaluator is a safe recursive-descent parser — **no `eval`, no `Function`**, so an expression can never run arbitrary code. Inside the string you have:

- **Context variables:** `t` (eased progress 0→1), `progress` (raw progress before easing), `frame` (current frame number), `duration` (the delta's length in frames).
- **Functions:** `sin cos tan abs min max floor ceil round sqrt pow clamp sign log`.
- **Constants:** `pi`, `tau`, `e`. Operators `+ - * / % **`, comparisons, and a `cond ? a : b` ternary.

Reach for an expression when the motion is a **function**, not a tween — a continuous wobble (`sin(t * tau)`), a value derived from frame number, a conditional that changes behavior partway. For anything a bezier or spring can already do, use those; expressions are for genuinely procedural motion. Note the contract: an expression resolves to a **number**, so it's for numeric properties.

## 3. Motion paths — trajectory instead of two axes

A motion path makes a layer travel a defined trajectory rather than animating `frame.x` and `frame.y` independently:

```yaml
motionPath:
  points: [ ... ]      # PathPoint[] defining the curve
  closed: false
  autoRotate: true     # turn the layer to follow the path tangent
  autoRotateOffset: 0  # degrees of rotation offset when autoRotate is on
```

`autoRotate` makes the layer **bank into the curve** — a paper plane that points where it's going, a label that rides along a route. `autoRotateOffset` corrects for art that doesn't point "right" at 0°.

You control **position along the path with progress**. When a motion path is present, the layer's `frame.x`/`frame.y` are overridden by the path, so you animate the `motionPath.progress` property (0→1) instead — that delta's easing now shapes *speed along the trajectory*:

```yaml
- layer: plane
  property: motionPath.progress
  range: [0, 90]
  from: 0
  to: 1
  easing: ease-in-out
```

A `frame.x` delta on a layer that has a motion path is ignored at render time — the path won. Express speed and timing through `motionPath.progress` plus easings, not through frame deltas.

## Choosing among the three

> Tactile, physical, should bounce or settle → **spring**.
> Continuous or procedural, a function of time/frame → **expression**.
> Should follow a defined route, maybe banking into it → **motion path** + `motionPath.progress`.

Everything else is a plain delta with an easing — and that's the right default. These three are tools for when the default genuinely can't say what you mean.

Next: presets and templates — packaging motion and structure for reuse.
