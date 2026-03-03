import { defineConfig } from "tsup";

const shared = {
  format: ["esm", "cjs"] as const,
  clean: false,
  sourcemap: true,
  noExternal: [/^@atelier\//],
  external: ["vite"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts", "src/cli.ts"],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: { mcp: "../mcp/src/index.ts" },
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
