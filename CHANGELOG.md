# Changelog

All notable changes to this project will be documented in this file.

Format: [major.minor.fix] — based on milestone progression.

## [0.0.1] — 2026-02-13

### Added
- Monorepo scaffold with pnpm workspaces and Turborepo
- 7 packages: `@atelier/types`, `@atelier/math`, `@atelier/schema`, `@atelier/core`, `@atelier/canvas`, `@atelier/mcp`, `@atelier/cli`
- 1 app: `@atelier/playground` (Vite dev app)
- tsup build (ESM + CJS + DTS dual output) for all packages
- vitest test runner with placeholder tests
- TypeScript strict mode via shared `tsconfig.base.json`
- Paradigm framework configuration (`.paradigm/config.yaml`, root `.purpose`)
