# Changelog

All notable changes to this project will be documented in this file.

Format: [major.minor.fix] — based on milestone progression.

## [0.1.0] — 2026-02-13

### Added
- `@atelier/types` — 44 type definitions across 12 modules: document, layer, delta, state, preset, variable, asset, canvas, shapes, colors, easing, coordinates/units
- `@atelier/math` — pure interpolation engine: linear/cubic-bezier/ease-in-out/step easing, spring physics solver (underdamped/critically/overdamped), numeric lerp, color interpolation (RGB + HSL with shortest hue path)
- `@atelier/schema` — Zod validation schemas mirroring all types, `validateDocument()`/`validateLayer()`/`validateDelta()` with AI-readable errors, YAML parse (`parseAtelier`) and serialize (`serializeAtelier`) with roundtrip support
- Per-package `.purpose` files for types, math, schema
- Paradigm wisdom: decisions 001 (YAML format), 002 (external state management), 003 (no-overlap delta validation)

## [0.0.1] — 2026-02-13

### Added
- Monorepo scaffold with pnpm workspaces and Turborepo
- 7 packages: `@atelier/types`, `@atelier/math`, `@atelier/schema`, `@atelier/core`, `@atelier/canvas`, `@atelier/mcp`, `@atelier/cli`
- 1 app: `@atelier/playground` (Vite dev app)
- tsup build (ESM + CJS + DTS dual output) for all packages
- vitest test runner with placeholder tests
- TypeScript strict mode via shared `tsconfig.base.json`
- Paradigm framework configuration (`.paradigm/config.yaml`, root `.purpose`)
