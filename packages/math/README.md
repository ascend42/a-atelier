---
title: "@atelier/math"
scope: Pure interpolation engine — easing, spring physics, lerp, color interpolation
packages: ["@atelier/math"]
related: ["docs/format-spec.md", "packages/types/README.md", "packages/core/README.md"]
---

# @atelier/math

Pure interpolation engine for the Atelier animation system. Provides easing curves, spring physics, linear interpolation, and color space conversion -- all as pure, stateless, side-effect-free functions.

| | |
|---|---|
| **Version** | 0.1.0 |
| **Dependencies** | Zero (no external or `@atelier/*` dependencies) |
| **Build** | tsup (ESM + CJS + DTS) |
| **Source** | `packages/math/src/` |
| **Test** | `vitest run` |

## Installation

```bash
pnpm add @atelier/math
```

## Exports

```typescript
// Easing
export { linear, cubicBezier, easeIn, easeOut, easeInOut, step } from "./easing.js";
export { spring } from "./spring.js";
export type { SpringConfig } from "./spring.js";

// Interpolation
export { lerp, clamp, lerpArray, remap } from "./lerp.js";

// Color
export { hexToRgba, rgbaToHex, lerpRgba, rgbaToHsla, hslaToRgba, lerpHsla } from "./color.js";
export type { RGBA, HSLA } from "./color.js";
```

---

## Modules

### 1. easing.ts -- Easing Functions

Source: `packages/math/src/easing.ts`

All easing functions accept a normalized progress value `t` in the range `[0, 1]` and return a mapped value.

#### `linear(t: number): number`

Identity easing. Returns `t` unchanged -- no acceleration, no deceleration.

```typescript
linear(0.5); // 0.5
```

#### `cubicBezier(x1, y1, x2, y2): (t: number) => number`

CSS-compatible cubic bezier curve. Returns a closure that maps progress `t` to an eased value.

Internally uses binary search (20 iterations, tolerance `1e-6`) to solve the parametric `t` from the x-axis bezier polynomial, then evaluates the y-axis polynomial at that parameter.

The bezier polynomial for a single axis is:

```
B(t) = 3(1-t)^2 * t * p1  +  3(1-t) * t^2 * p2  +  t^3
```

Boundary clamping: returns `0` for `t <= 0` and `1` for `t >= 1`.

```typescript
const ease = cubicBezier(0.25, 0.1, 0.25, 1.0);
ease(0.5); // ~0.802
```

#### Presets

Three standard CSS easing presets, pre-built with `cubicBezier`:

| Name | Control Points | CSS Equivalent |
|------|---------------|----------------|
| `easeIn` | `(0.42, 0, 1, 1)` | `ease-in` |
| `easeOut` | `(0, 0, 0.58, 1)` | `ease-out` |
| `easeInOut` | `(0.42, 0, 0.58, 1)` | `ease-in-out` |

```typescript
easeIn(0.5);    // slow start
easeOut(0.5);   // slow end
easeInOut(0.5); // slow start and end
```

#### `step(steps: number, position?: "start" | "end"): (t: number) => number`

Discrete step easing that jumps between `steps` evenly-spaced values. Returns a closure.

The `position` parameter controls when the jump occurs within each step interval:

- `"end"` (default) -- the value holds at the previous level until the next step boundary.
- `"start"` -- the value jumps to the next level at the beginning of each step interval.

Boundary behavior:
- `t <= 0`: returns `1 / steps` for `"start"`, `0` for `"end"`.
- `t >= 1`: always returns `1`.

```typescript
const step4 = step(4);
step4(0.0);  // 0
step4(0.25); // 0.25
step4(0.5);  // 0.5
step4(0.99); // 0.75
step4(1.0);  // 1

const step4Start = step(4, "start");
step4Start(0.0);  // 0.25
step4Start(0.25); // 0.5
```

---

### 2. spring.ts -- Spring Physics

Source: `packages/math/src/spring.ts`

#### `spring(config?: SpringConfig): (t: number) => number`

Creates a spring easing function based on damped harmonic oscillator physics. The spring always transitions from `0` to `1` but may overshoot depending on the configuration. Returns a closure that maps normalized `t` in `[0, 1]` to the spring's displacement.

```typescript
interface SpringConfig {
  mass?: number;      // default: 1
  stiffness?: number; // default: 100
  damping?: number;   // default: 10
  velocity?: number;  // default: 0
}
```

#### Physics model

The behavior is determined by the **damping ratio** and **natural frequency**:

```
w0   = sqrt(stiffness / mass)          -- natural frequency
zeta = damping / (2 * sqrt(stiffness * mass))  -- damping ratio
```

Three regimes:

| Regime | Condition | Behavior |
|--------|-----------|----------|
| **Underdamped** | `zeta < 1` | Oscillates around the target before settling. Damped frequency: `wd = w0 * sqrt(1 - zeta^2)`. |
| **Critically damped** | `zeta = 1` | Fastest approach to target without any oscillation. |
| **Overdamped** | `zeta > 1` | Approaches the target slowly, no oscillation. |

#### Duration auto-estimation

The spring's settle time (within 0.1% of target) is automatically estimated:

- **Underdamped**: `ln(1000) / (zeta * w0)`
- **Overdamped / critically damped**: `10 / (zeta * w0)`

The input `t` in `[0, 1]` is scaled to this estimated duration internally.

```typescript
// Bouncy spring
const bouncy = spring({ stiffness: 200, damping: 8 });
bouncy(0.3); // may overshoot 1.0

// Stiff, no-bounce spring
const stiff = spring({ stiffness: 300, damping: 30 });
stiff(0.5); // approaches 1.0 smoothly

// Heavy, slow spring
const heavy = spring({ mass: 5, stiffness: 100, damping: 15 });
heavy(0.5); // slower rise
```

---

### 3. lerp.ts -- Linear Interpolation

Source: `packages/math/src/lerp.ts`

#### `lerp(a: number, b: number, t: number): number`

Linear interpolation between two numbers.

```
lerp(a, b, t) = a + (b - a) * t
```

```typescript
lerp(0, 100, 0.5);  // 50
lerp(10, 20, 0.25); // 12.5
```

#### `clamp(value: number, min: number, max: number): number`

Constrains a value to the range `[min, max]`.

```typescript
clamp(150, 0, 100); // 100
clamp(-5, 0, 100);  // 0
clamp(50, 0, 100);  // 50
```

#### `lerpArray(a: number[], b: number[], t: number): number[]`

Element-wise linear interpolation between two arrays of equal length.

```typescript
lerpArray([0, 0, 0], [10, 20, 30], 0.5); // [5, 10, 15]
```

#### `remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number`

Re-maps a value from one range to another. Internally computes the normalized position within the input range, then applies `lerp` to the output range.

```
remap(value, inMin, inMax, outMin, outMax)
  = lerp(outMin, outMax, (value - inMin) / (inMax - inMin))
```

```typescript
remap(50, 0, 100, 0, 1);    // 0.5
remap(0.5, 0, 1, -100, 100); // 0
remap(75, 0, 100, 200, 400); // 350
```

---

### 4. color.ts -- Color Interpolation

Source: `packages/math/src/color.ts`

#### Types

```typescript
interface RGBA {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

interface HSLA {
  h: number; // 0-360 (degrees)
  s: number; // 0-100 (percent)
  l: number; // 0-100 (percent)
  a: number; // 0-1
}
```

#### `hexToRgba(hex: string): RGBA`

Parses a hex color string into an RGBA object. Supports four formats:

| Format | Example | Expansion |
|--------|---------|-----------|
| `#RGB` | `#f00` | `#ff0000ff` |
| `#RGBA` | `#f00f` | `#ff0000ff` |
| `#RRGGBB` | `#ff0000` | `#ff0000ff` |
| `#RRGGBBAA` | `#ff000080` | as-is |

```typescript
hexToRgba("#ff0000");  // { r: 255, g: 0, b: 0, a: 1 }
hexToRgba("#f00");     // { r: 255, g: 0, b: 0, a: 1 }
hexToRgba("#ff000080"); // { r: 255, g: 0, b: 0, a: ~0.502 }
```

#### `rgbaToHex(color: RGBA): string`

Converts an RGBA object back to a hex string. Values are rounded and clamped to `[0, 255]`. The alpha component is omitted from the output when it is fully opaque (`ff`).

```typescript
rgbaToHex({ r: 255, g: 0, b: 0, a: 1 });   // "#ff0000"
rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 }); // "#ff000080"
```

#### `lerpRgba(a: RGBA, b: RGBA, t: number): RGBA`

Channel-wise linear interpolation between two RGBA colors. Each channel (r, g, b, a) is interpolated independently.

```typescript
const red  = { r: 255, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 255, a: 1 };
lerpRgba(red, blue, 0.5); // { r: 127.5, g: 0, b: 127.5, a: 1 }
```

#### `rgbaToHsla(color: RGBA): HSLA`

Standard RGB-to-HSL conversion. Normalizes RGB channels to `[0, 1]`, computes hue from the dominant channel, and returns saturation and lightness as percentages.

```typescript
rgbaToHsla({ r: 255, g: 0, b: 0, a: 1 }); // { h: 0, s: 100, l: 50, a: 1 }
```

#### `hslaToRgba(color: HSLA): RGBA`

Standard HSL-to-RGB conversion. Returns RGBA with `r`, `g`, `b` rounded to integers in `[0, 255]`.

```typescript
hslaToRgba({ h: 0, s: 100, l: 50, a: 1 }); // { r: 255, g: 0, b: 0, a: 1 }
```

#### `lerpHsla(a: HSLA, b: HSLA, t: number): HSLA`

Interpolation between two HSLA colors with **shortest hue path**. If the hue difference exceeds 180 degrees, the interpolation wraps around the color wheel to take the shorter arc. This prevents unexpected color transitions -- for example, interpolating from red (0 degrees) to blue (240 degrees) will travel through magenta/purple rather than through green and cyan.

Saturation, lightness, and alpha are interpolated linearly. The resulting hue is normalized to `[0, 360)`.

```typescript
const red  = { h: 0, s: 100, l: 50, a: 1 };
const blue = { h: 240, s: 100, l: 50, a: 1 };

// Shortest path: 0 -> 360 -> 300 -> 240 (through magenta)
lerpHsla(red, blue, 0.5); // { h: 300, s: 100, l: 50, a: 1 }
```

---

## Usage Examples

### Easing functions with lerp

```typescript
import { easeInOut, lerp } from "@atelier/math";

// Animate a value from 100 to 500 with easeInOut
function animate(progress: number): number {
  const eased = easeInOut(progress);
  return lerp(100, 500, eased);
}

animate(0);   // 100
animate(0.5); // ~300
animate(1);   // 500
```

### Spring configuration

```typescript
import { spring, lerp } from "@atelier/math";

// Bouncy entrance animation
const bounce = spring({ stiffness: 180, damping: 12 });

function springPosition(progress: number): number {
  return lerp(0, 200, bounce(progress));
}

// The position will overshoot 200 before settling
springPosition(0.3); // may exceed 200 briefly
springPosition(1.0); // 200
```

### Color interpolation between hex values

```typescript
import { hexToRgba, lerpRgba, rgbaToHex, rgbaToHsla, lerpHsla, hslaToRgba } from "@atelier/math";

const sunrise = hexToRgba("#ff6b35");
const sunset  = hexToRgba("#9b59b6");

// RGB interpolation (direct channel blend)
const midRgb = lerpRgba(sunrise, sunset, 0.5);
rgbaToHex(midRgb); // blended color in hex

// HSL interpolation (perceptually smoother, shortest hue path)
const sunriseHsl = rgbaToHsla(sunrise);
const sunsetHsl  = rgbaToHsla(sunset);
const midHsl     = lerpHsla(sunriseHsl, sunsetHsl, 0.5);
const midRgba    = hslaToRgba(midHsl);
rgbaToHex(midRgba); // perceptually blended color
```

### Range remapping

```typescript
import { remap, clamp } from "@atelier/math";

// Convert a mouse position (0-800px) to an opacity (0-1)
function mouseToOpacity(mouseX: number): number {
  return clamp(remap(mouseX, 0, 800, 0, 1), 0, 1);
}

mouseToOpacity(400); // 0.5
mouseToOpacity(800); // 1
mouseToOpacity(900); // 1 (clamped)
```

---

## Design Principles

- **Pure functions only.** No internal state, no side effects, no mutation. Given the same inputs, every function always returns the same output.
- **Zero dependencies.** The package depends on nothing -- not even other `@atelier/*` packages. It can be used standalone in any JavaScript/TypeScript project.
- **Normalized time.** All easing and spring functions accept `t` in `[0, 1]` and handle boundary clamping internally.
- **CSS compatibility.** The `cubicBezier` implementation and presets match CSS transition timing functions exactly.
