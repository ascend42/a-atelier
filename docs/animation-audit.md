# Animation Audit — Pain Points & Bug Log

Triage session 2026-02-14. Examining all 19 showcase examples for animation bugs, then cataloging systemic pain points for MCP/engine improvements.

---

## Bugs Found & Fixed

### Bug 1: Text alignment rendering broken (Easing Race)
- **Symptom**: Labels ("linear", "ease-in", etc.) clipped off left edge of canvas
- **Root cause**: `renderText()` always drew at `(0, 0)` in local coords. Canvas 2D `textAlign: "right"` makes x=0 the RIGHT edge of text, pushing it off-canvas to the left.
- **Fix**: Offset text draw position within bounding box — `"center"` → `width/2`, `"right"` → `width`
- **File**: `packages/canvas/src/renderers/text-renderer.ts`
- **Impact**: Affects ALL text layers using `textAlign: "center"` or `"right"` across every example

---

## Systemic Pain Points (MCP / Engine Improvement Opportunities)

### P1: Text alignment is a rendering concern, not a data concern
The text renderer was broken since M3 and nobody caught it until visual review. The MCP `atelier_preview` tool renders frames server-side, so this bug would have been invisible to the AI authoring agent. **Implication**: Preview fidelity between MCP server rendering and browser rendering must match, or visual bugs silently ship.

### P2: Layout is manual pixel math
The AI must compute exact x/y coordinates for every element. For the easing race, that meant calculating `startY + i * rowHeight` for 7 rows, label widths, dot positions, etc. This is error-prone and tedious.
- **Opportunity**: Add layout helpers — `alignWithin(bounds)`, `stackVertical(gap)`, `distributeHorizontal()` — either as Builder API methods or MCP tools.

### P3: No bounding box / guide visualization
When debugging layout issues, there's no way to see where a layer's bounding box is vs. where the visual content actually renders. Adding a debug overlay mode (`atelier_preview --debug`) that draws bounding rectangles would catch alignment issues immediately.

### P4: Color values are magic strings
Animations hardcode hex colors everywhere. Changing a palette (as we just did) requires find-replace across every file. The template variable system exists but isn't used for colors in examples.
- **Opportunity**: Promote theme/palette variables as a first-class concept, or make the MCP enforce variable usage for colors.

---

## Examples Remaining to Triage
- [ ] Shapes: Primitives, Path Drawing, Corner Radius
- [ ] Easing: Easing Race (text fix applied), Bounce & Spring
- [ ] Motion: Slide, Spin, Scale Pulse
- [ ] Styles: Gradient Reveal, Stroke Animation, Color Shift
- [ ] Composition: Stagger Entrance, Choreography
- [ ] Presets: Fade In, Slide Up
- [ ] Templates: Branded Title Card, Notification Banner
- [ ] States: Intro/Outro, Traffic Light
