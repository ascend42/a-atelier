import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // The `atelier-mcp` bin points at dist/index.js, which auto-starts the
  // stdio server via its isMain guard. Without a shebang the OS runs it as a
  // shell script ("import: command not found"). Node strips the shebang when
  // the file is imported as a library, so this is harmless for the export use.
  banner: { js: "#!/usr/bin/env node" },
});
