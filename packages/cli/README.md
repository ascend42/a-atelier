---
title: "@atelier/cli"
scope: CLI tool — validate, info, still commands for .atelier files
packages: ["@atelier/cli"]
related: ["docs/getting-started.md", "packages/schema/README.md", "packages/core/README.md"]
---

# @atelier/cli

CLI tool for working with `.atelier` animation files. Validates documents, displays summaries, and resolves individual frames for inspection.

| | |
|---|---|
| **Version** | 0.1.0 |
| **Binary** | `atelier` (maps to `./dist/cli.js`) |
| **Build** | tsup (ESM + CJS + DTS) |
| **Source** | `packages/cli/src/` |

## Dependencies

| Package | Source |
|---|---|
| `@atelier/types` | workspace |
| `@atelier/schema` | workspace |
| `@atelier/core` | workspace |
| `@atelier/canvas` | workspace |
| `commander` | ^13.0.0 |

## Installation

```bash
# From monorepo root
pnpm build

# Then use directly
npx atelier validate my-animation.atelier

# Or link globally
cd packages/cli && pnpm link --global
atelier validate my-animation.atelier
```

## Commands

### `atelier validate <file>`

Validates an `.atelier` YAML file through three checks:

1. **YAML syntax** -- the file must be parseable YAML.
2. **Zod schema validation** -- all types and structure must conform to the `@atelier/schema` definitions.
3. **Delta overlap detection** -- detects when two deltas target the same layer and property with overlapping frame ranges.

On success, prints `Valid` and exits with code 0. On failure, prints `Validation errors:` followed by a bulleted list and exits with code 1.

```bash
$ atelier validate animation.atelier
Valid

$ atelier validate broken.atelier
Validation errors:
  - State "intro": Overlapping deltas on layer "title", property "opacity" ...
```

Source: `packages/cli/src/commands/validate.ts`

### `atelier info <file>`

Parses an `.atelier` file and displays a human-readable summary of its contents: document metadata, canvas settings, layers, states, and preset counts.

```bash
$ atelier info animation.atelier
Name: My Animation
Description: A cool animation
Canvas: 800x600 @ 60fps, background: #1a1a2e
Layers: 4
  - bg (shape)
  - title (text)
  - circle (shape)
  - box (shape)
States: 1
  - intro: 180 frames, 7 deltas
Presets: 2
```

Source: `packages/cli/src/commands/info.ts`

### `atelier still <file> [options]`

Resolves a single frame of a document and outputs the computed layer states as JSON. This lets you inspect the exact property values at any point in an animation without rendering it.

**Options:**

| Flag | Description | Default |
|---|---|---|
| `-s, --state <name>` | State name to resolve | First state in the document |
| `-f, --frame <number>` | Frame number to resolve | `0` |

```bash
$ atelier still animation.atelier --state intro --frame 30
{
  "frame": 30,
  "stateName": "intro",
  "layers": [
    {
      "id": "bg",
      "layer": { ... },
      "computedProperties": {}
    },
    {
      "id": "title",
      "layer": { ... },
      "computedProperties": {
        "opacity": 1,
        "scale.x": 0.95
      }
    }
  ]
}
```

Source: `packages/cli/src/commands/still.ts`

## Programmatic API

All three commands export functions that can be imported directly, independent of the CLI entry point.

### `validateFile(filePath: string)`

Reads and validates an `.atelier` file. Returns a result object without printing to stdout or calling `process.exit`.

```typescript
import { validateFile } from "@atelier/cli";

const { valid, errors } = validateFile("animation.atelier");
if (!valid) {
  console.error(errors);
}
```

**Returns:** `{ valid: boolean; errors: string[] }`

### `getInfo(doc: AtelierDocument)`

Extracts a structured summary from a parsed `AtelierDocument`.

```typescript
import { getInfo } from "@atelier/cli";
import type { DocumentInfo } from "@atelier/cli";

const info: DocumentInfo = getInfo(doc);
console.log(`${info.layers.count} layers, ${info.states.count} states`);
```

### `resolveStill(doc, stateName?, frame?)`

Resolves a single frame, returning all layers with their computed property values.

```typescript
import { resolveStill } from "@atelier/cli";

const resolved = resolveStill(doc, "intro", 30);
for (const layer of resolved.layers) {
  console.log(layer.id, layer.computedProperties);
}
```

**Parameters:**

| Parameter | Type | Default |
|---|---|---|
| `doc` | `AtelierDocument` | (required) |
| `stateName` | `string` | First state in the document |
| `frame` | `number` | `0` |

**Returns:** `ResolvedFrame` (from `@atelier/core`)

**Throws** if the document has no states or the specified state name does not exist.

## Types

### `DocumentInfo`

Returned by `getInfo`. Contains the structured summary of a document.

```typescript
interface DocumentInfo {
  name: string;
  description?: string;
  canvas: {
    width: number;
    height: number;
    fps: number;
    background?: string;
  };
  layers: {
    count: number;
    items: { id: string; type: string }[];
  };
  states: {
    count: number;
    items: { name: string; duration: number; deltaCount: number }[];
  };
  presets: {
    count: number;
  };
}
```

### `ResolvedFrame` / `ResolvedLayer`

Returned by `resolveStill`. Re-exported from `@atelier/core`.

```typescript
interface ResolvedFrame {
  frame: number;
  stateName: string;
  layers: ResolvedLayer[];
}

interface ResolvedLayer {
  id: string;
  layer: Layer;
  computedProperties: Partial<Record<AnimatableProperty, unknown>>;
}
```

## Development

```bash
# Build
pnpm --filter @atelier/cli build

# Type-check
pnpm --filter @atelier/cli typecheck

# Run tests
pnpm --filter @atelier/cli test

# Clean build artifacts
pnpm --filter @atelier/cli clean
```
