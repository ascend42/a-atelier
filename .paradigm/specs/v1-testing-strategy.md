# v1 Testing Strategy

> Spec for the testing posture that supports the Atelier v1 "locally launchable
> editor" release. Authored 2026-05-18 during the v1 push. The unit-test bar
> is already 614/614 across 12 packages — this spec adds two layers: snapshot
> testing for image-doc render output, and end-to-end Playwright tests for the
> `atelier studio` flow.

## 1. The bar today (vitest unit / integration)

| Layer | Count | What it covers |
|---|---|---|
| `@a-company/atelier-types` | 6 | Type guards, narrow helpers |
| `@a-company/atelier-math` | 29 | Easings, spring solver, bezier |
| `@a-company/atelier-schema` | 42 | Zod schema validation, recipe overlay rules |
| `@a-company/atelier-core` | 118 | resolveFrame, deltas, state machines |
| `@a-company/atelier-lottie` | 37 | Lottie export shapes |
| `@a-company/atelier-canvas` | 26 | Canvas render primitives |
| `@a-company/atelier-video` | 8 | Video pipeline shapes |
| `@a-company/atelier-svg` | 32 | SVG export |
| `@a-company/atelier-react` | 15 | React embed |
| `@a-company/atelier-studio` | 35 | Studio widget panels, history, applyMutation |
| `@a-company/atelier-cli` | 127 | All CLI commands, lib/* functions, scaffolders, recipe translators |
| `@a-company/atelier-mcp` | 139 | MCP tool surface, document store, overlay tools |

Run with `pnpm test` or `pnpm -r test`. All green on every commit per the
post-commit hook.

## 2. Layer two — snapshot tests for image-doc render

**Why:** The v1 headline use case is "open Atelier, edit a thing, export PNG."
Regressions in rendering (font metrics shift, blend mode behavior changes,
fill anti-aliasing differs) won't surface in unit tests — they ship and the
user sees them.

**Approach (in order of pragmatism):**

### 2.1 Document-structure snapshots (ship in v0.1.x)

Lightweight — no new deps. Load a canonical document (e.g.
`packages/cli/templates/welcome.atelier`), run `resolveFrame(doc, "default",
N)`, and snapshot the resolved JSON via vitest's built-in `toMatchSnapshot()`.

Catches: schema drift, default value changes, easing-output regressions,
preset/template instantiation bugs.

Misses: rendering bugs (everything downstream of `ResolvedLayer[]`).

**Status: shipping in #15.** One test file:
`packages/cli/src/snapshot.test.ts` (or extending the existing `index.test.ts`)
loading welcome.atelier and snapshotting frame 0, 15, 30 of the default state.

### 2.2 Pixel snapshots (deferred to v0.2)

Render `welcome.atelier` to PNG via the new `atelier export-image` command,
compare against a committed golden PNG via [`pixelmatch`](https://github.com/mapbox/pixelmatch).

**Cost:** new dep (`pixelmatch` + `pngjs` for parsing) — ~80 KB combined.
Determinism risk: font hinting differs across OS; CI must pin a single
runner image (Linux + `apt-get install fonts-inter`) for golden refs to be
stable.

**Acceptance criteria for activating:**
- Pixel-perfect render is achievable on the chosen CI runner with installed
  font assets (no anti-aliasing variance across runs)
- Golden ref regeneration is a one-command flow (`pnpm test:visual:update`)
- Diff output is a side-by-side image visible in the PR (CI artifact)

## 3. Layer three — Playwright end-to-end for `atelier studio`

**Why:** The Studio is a browser app served by a Node Hono process. Unit
tests cover the widget; nothing covers "boot the CLI, open the browser,
verify the canvas." A regression in port-probing, scaffolding, or the
inline app's HTML would ship undetected.

**Approach:**

### 3.1 Smoke test — the v1 golden path

One Playwright test scripts the canonical first-run user journey:

```
1. Spawn `atelier studio --port 4321 --no-open` in an empty temp directory
2. Wait for "http://localhost:4321" log line
3. Open Playwright to localhost:4321
4. Assert the welcome.atelier loaded — canvas visible, layer panel lists
   "background", "handle", "page-number"
5. Drop an image onto the canvas (Playwright's setInputFiles or DataTransfer)
6. Assert a new image layer appears in the layer panel
7. Click + Add → Handle from the layer-type picker
8. Assert a new overlay-tagged TextVisual layer is selected
9. Open the YAML tab → assert YAML contains "tags:\n      - overlay"
10. Click Export → choose PNG → assert a PNG file is written to the temp dir
11. Spawn cleanup, assert the studio shuts down cleanly on Ctrl+C
```

If steps 1–11 pass, the v1 first-run promise is intact. Anything else is a
regression.

### 3.2 What NOT to test in Playwright

- Internal panel state transitions — that's the studio widget's vitest tests
- Rendering accuracy — that's section 2 (pixel snapshots)
- MCP tool behavior — that's mcp's vitest tests

Playwright is for the seam between processes (CLI → Hono → browser), not
for re-testing what the unit tests already cover.

### 3.3 Installation cost and CI

`@playwright/test` is ~30 MB installed; browsers cached in `~/.cache/ms-playwright`
add another ~400 MB. Reasonable for CI; flag for local dev as "optional, run
when touching studio flow."

Add as **root** devDep (not per-package). Test files live in `e2e/` at repo
root. New `pnpm test:e2e` script. CI runs after `pnpm test` (the unit-test
gate is the fast feedback loop).

**Acceptance criteria for activating:**
- Smoke test passes on macOS + Linux CI
- Setup time on a fresh checkout is documented in CONTRIBUTING.md
- Test takes <30s end-to-end (the test, not browser install)

## 4. What NOT to add (for v1)

- **Visual-regression on every component** — overkill; the snapshot test on
  welcome.atelier covers the canonical path. Other rendering paths get
  unit-test coverage where reasonable.
- **Cross-browser matrix** — Atelier studio is single-target (whatever
  browser the user opens). Chromium-only in Playwright is fine for v1;
  expand if/when we see Safari- or Firefox-specific bugs.
- **Load testing the WS bridge** — premature. Single-user, single-doc, single
  agent at v1. Re-evaluate when multiple agents or large docs become real.
- **A11y test runs in CI** — manual a11y pass for v1 (the cold-read flagged
  zero ARIA today); automate when the surface stabilizes.

## 5. Implementation order

1. **#15.1 (this commit):** Doc snapshot test for welcome.atelier + this spec.
2. **#15.2 (after v1 launch, v0.2):** Pixel snapshot via `atelier export-image`
   + pixelmatch. Requires fonts to be shipped as assets first.
3. **#15.3 (v0.2):** Playwright smoke test. Add @playwright/test as root
   devDep + `e2e/studio.smoke.spec.ts` + `playwright.config.ts` + CI step.

The doc snapshot test ships today; Playwright and pixel snapshots are
deferred to v0.2 to keep the v1 push lean. The cost of deferring is one
regression class (Studio HTTP flow) — accepted given how stable that surface
has been across the Builder A/C work this session.
