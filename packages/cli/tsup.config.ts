import { defineConfig } from "tsup";

const sharedEsmCjs = {
  format: ["esm", "cjs"] as const,
  clean: false,
  sourcemap: true,
  noExternal: [/^@atelier\//],
  external: ["vite"],
};

const sharedEsmOnly = {
  format: ["esm"] as const,
  clean: false,
  sourcemap: true,
  noExternal: [/^@atelier\//],
  external: ["vite"],
};

// Library entry — ESM + CJS for both `import` and `require()` consumers.
// CLI binary — ESM only. package.json bin points at dist/cli.js (the .js,
// not .cjs). Building CJS would emit an empty `import.meta` warning at
// build time from src/commands/studio.ts:resolveCliPackageDir, and the
// .cjs binary would crash at runtime because `new URL(import.meta.url)`
// throws on undefined. The library path is unaffected — index.ts doesn't
// re-export the studio command surface.
// MCP binary — same reasoning as cli, ESM-only.
export default defineConfig([
  {
    ...sharedEsmCjs,
    entry: { index: "src/index.ts" },
    dts: true,
    clean: true,
  },
  {
    ...sharedEsmOnly,
    entry: { cli: "src/cli.ts" },
    dts: false,
  },
  {
    ...sharedEsmOnly,
    entry: { mcp: "../mcp/src/index.ts" },
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
