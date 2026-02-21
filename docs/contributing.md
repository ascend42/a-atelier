---
title: Contributing Guide
scope: Monorepo workflow, testing, build system, code conventions
packages: ["all"]
related: ["README.md", "docs/architecture.md"]
---

# Contributing to Atelier

Atelier is a TypeScript monorepo for an AI-native animation engine. This guide covers everything you need to clone, build, test, and submit changes.

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** 10+ (declared in `packageManager` field)
- **Git**

## Repository Structure

```
a-atelier/
├── packages/
│   ├── types/       # @atelier/types   — 44 type definitions (0 deps)
│   ├── math/        # @atelier/math    — interpolation engine (0 deps)
│   ├── schema/      # @atelier/schema  — Zod validation + YAML (depends: types)
│   ├── core/        # @atelier/core    — animation engine (depends: types, math, schema)
│   ├── canvas/      # @atelier/canvas  — Canvas 2D renderer (depends: types, core)
│   ├── mcp/         # @atelier/mcp     — MCP server, 27 tools (depends: types, schema, core, canvas)
│   └── cli/         # @atelier/cli     — CLI tool (depends: types, schema, core, canvas)
├── apps/
│   ├── playground/  # Vite dev app with canvas playback
│   └── showcase/    # 19-example interactive animation catalog
├── docs/            # Documentation
├── .paradigm/       # Paradigm framework config
├── turbo.json       # Turborepo pipeline config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Workspace roots are defined in `pnpm-workspace.yaml` and cover `packages/*` and `apps/*`.

## Getting Set Up

```bash
git clone <repo-url> && cd a-atelier
pnpm install
pnpm build       # builds all packages in dependency order
pnpm test        # runs all 181 tests
pnpm typecheck   # type-checks every package
```

If you only need a single package, filter with `-F`:

```bash
pnpm -F @atelier/core build
pnpm -F @atelier/core test
```

## Build System

### Turborepo

Turborepo orchestrates builds via `turbo.json`. The `build` and `test` tasks both declare `"dependsOn": ["^build"]`, so upstream packages are always built first.

### Dependency Order

```
types + math          (no deps -- build in parallel)
       |
     schema           (depends on types)
       |
      core            (depends on types, math, schema)
       |
canvas   mcp   cli    (depend on core -- build in parallel)
```

You never need to manage this order manually. Running `pnpm build` at the root handles it.

### tsup

Every library package bundles with tsup. The configuration is identical across packages:

```ts
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

Each build produces three artifacts in `dist/`:
- `index.js` -- ESM
- `index.cjs` -- CommonJS
- `index.d.ts` -- TypeScript declarations

### Key Commands

| Command | Scope | Description |
|---------|-------|-------------|
| `pnpm build` | All packages | Build in dependency order via Turborepo |
| `pnpm test` | All packages | Run all vitest tests |
| `pnpm typecheck` | All packages | Type-check with `tsc --noEmit` |
| `pnpm clean` | All packages | Remove `dist/` directories |
| `pnpm -F @atelier/core build` | Single package | Build one package |
| `pnpm -F @atelier/core test` | Single package | Test one package |
| `pnpm -F @atelier/playground dev` | Playground | Start Vite dev server |
| `pnpm -F @atelier/showcase dev` | Showcase | Start showcase dev server |

## Testing

### Framework

All tests use **vitest**. Each package has a single test file at `src/index.test.ts`. Run the full suite from the root:

```bash
pnpm test
```

### Test Counts

| Package | Tests | What they cover |
|---------|-------|-----------------|
| types | 3 | Type smoke tests |
| math | 22 | Easing functions, spring physics, lerp, color interpolation |
| schema | 20 | Zod validation, YAML parse and serialize |
| core | 56 | Frame resolver, document builder, state machine, templates, overlap validation, presets |
| canvas | 13 | Frame rendering, shapes, text, style application |
| mcp | 50 | All 27 MCP tools, end-to-end workflows |
| cli | 13 | All CLI commands |
| **Total** | **181** | |

### Writing Tests

Tests use `describe` / `it` blocks from vitest:

```ts
import { describe, it, expect } from "vitest";

describe("feature", () => {
  it("does the expected thing", () => {
    expect(someFunction(input)).toBe(expected);
  });
});
```

**Guidelines:**

- Tests should be self-contained. Create documents with the `createDocument()` builder rather than relying on shared fixtures.
- For **canvas** tests, create a mock `RenderContext` using a `Proxy` that records method calls. See `packages/canvas/src/index.test.ts` for the pattern.
- For **MCP** tests, connect a `Client` to the server via `InMemoryTransport` and call tools through the client. See `packages/mcp/src/index.test.ts` for the setup helper.
- Run `pnpm -F @atelier/<pkg> test` while developing to get fast feedback on a single package.

## Code Conventions

### TypeScript

The project uses strict mode via a shared `tsconfig.base.json`:

- **Target**: ES2022
- **Module**: ESNext with bundler resolution
- **Strict**: `true` (all strict checks enabled)
- **Additional checks**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

Rules of thumb:
- No `any` types. Use proper generics or `unknown`.
- Use `type` keyword for type-only imports: `import type { Foo } from "./foo.js"`.
- All public API must be exported from the package's `src/index.ts` barrel file.

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `frame-resolver.ts`, `document-builder.ts` |
| Types / Interfaces | PascalCase | `AtelierDocument`, `ResolvedFrame` |
| Functions | camelCase | `resolveFrame`, `createDocument` |
| Constants | camelCase or UPPER_SNAKE | `defaultFps`, `MAX_LAYERS` |

### Module Layout

Each package follows the same structure:

```
packages/<name>/
  package.json
  tsconfig.json          # extends ../../tsconfig.base.json
  tsup.config.ts
  src/
    index.ts             # barrel -- all public exports
    index.test.ts        # tests
    <module>.ts           # internal modules organized by concern
```

Internal modules are organized by concern (e.g., `resolver/`, `builder/`, `state/` in core) and re-exported through `index.ts`.

### Dependencies

- Keep runtime dependencies minimal. `types` and `math` have zero runtime deps.
- Use **Zod** for validation schemas (schema package).
- Use **`@modelcontextprotocol/sdk`** for the MCP server.
- Use **`yaml`** for YAML parsing.
- Use **`commander`** for CLI argument parsing.
- Library packages must not import DOM APIs. The canvas package uses a `RenderContext` interface that consumers provide.

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `tsup.config.ts` (copy from an existing package and adjust).
2. The `pnpm-workspace.yaml` glob `packages/*` picks up new directories automatically.
3. Create `src/index.ts` as the single entry point.
4. Add a `src/index.test.ts` for tests.
5. If the package depends on other workspace packages, add them as `"workspace:*"` dependencies.
6. Create a `.purpose` file for Paradigm framework integration.
7. Run `pnpm install` to link workspace dependencies, then `pnpm build` to verify.

## Adding Showcase Examples

The showcase app at `apps/showcase/` contains an interactive catalog of animation examples.

**Source**: `apps/showcase/src/examples/`

Each category is a separate file (`motion.ts`, `shapes.ts`, `easing.ts`, etc.) that exports an array of `Example` objects:

```ts
import { createDocument } from "@atelier/core";
import type { AtelierDocument } from "@atelier/types";
import type { Example } from "./index.js";

export const myExamples: Example[] = [
  {
    id: "category-example-name",   // unique kebab-case ID
    name: "Example Name",          // display name
    description: "What this example demonstrates",
    category: "Category",
    create: (): AtelierDocument => {
      return createDocument("Example Name", {
        width: 600,
        height: 400,
        fps: 60,
        background: "#1E1E1E",
      })
        .addLayer({ /* ... */ })
        .addDelta("default", { /* ... */ })
        .build();
    },
  },
];
```

To register a new category, import it in `apps/showcase/src/examples/index.ts` and add it to the `examples` array.

All examples use a 600x400 canvas at 60 fps with a `#1E1E1E` background.

## Paradigm Framework

The project uses the Paradigm framework for structured AI-assisted development. This is optional for contributors but good to be aware of:

- **`.purpose` files** describe components, gates, signals, and flows for each package.
- **`portal.yaml`** defines authorization gates (conceptual only in this project).
- **`.paradigm/config.yaml`** holds project-level configuration.
- **Symbol prefixes** used in documentation and commits: `#component`, `$flow`, `^gate`, `!signal`, `~aspect`.

When contributing, update the nearest `.purpose` file if you add or change a feature.

## Commit Message Format

Follow this convention for commit messages:

```
type(#symbol): short description

- Detail with #component references
- Symbols: #a, #b, !signal-c
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`

The `#symbol` in parentheses identifies the primary component affected. The optional `Symbols:` trailer in the body lists all affected symbols for automated tracking.

Examples:

```
feat(#canvas-renderer): add gradient fill support

- Implement linear and radial gradient rendering
- Update #render-frame to handle gradient fill types
- Symbols: #canvas-renderer, #render-frame

fix(#delta-resolver): hold property value after delta range ends

refactor(#document-builder): extract layer validation into separate module
```

## Workflow Summary

1. Fork and clone the repo.
2. Run `pnpm install && pnpm build` to set up.
3. Create a feature branch from `main`.
4. Make your changes, keeping to the conventions above.
5. Run `pnpm test` and `pnpm typecheck` to verify.
6. Commit with the message format described above.
7. Open a pull request against `main`.
