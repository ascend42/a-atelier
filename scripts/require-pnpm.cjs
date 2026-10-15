// Fail fast with a clear message when someone runs `npm install` / `yarn` in
// this pnpm workspace (npm leaves packages unbuilt and the error is cryptic).
const ua = process.env.npm_config_user_agent || "";
if (!ua.startsWith("pnpm/")) {
  console.error(
    "\n  This repo uses pnpm (workspace packages won't install with npm or yarn).\n\n" +
      "    corepack enable        # ships with Node; provides the pinned pnpm\n" +
      "    pnpm install\n" +
      "    pnpm build\n" +
      "    node packages/cli/dist/cli.js setup\n\n" +
      "  Just want Atelier Design in your repos? npm i -g @a-company/atelier && atelier setup\n",
  );
  process.exit(1);
}
