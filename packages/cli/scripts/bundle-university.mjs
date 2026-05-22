// Bundle the repo-root Atelier University pack into the CLI package so it
// ships in the npm tarball. The source of truth lives at
// `.paradigm/university/` (project-tenant pack, authored + reindexed there);
// this copies pack.yaml + content/ + index.yaml into `packages/cli/university/`
// at publish time. The copied dir is gitignored — regenerated on each release
// via the cli `prepublishOnly` hook so every published atelier version carries
// that version's University content. Discovery: package.json `paradigm.universityPack`
// points consumers' pack loader at `university/`.
import { cpSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(cliDir, "..", "..");
const src = resolve(repoRoot, ".paradigm/university");
const dest = resolve(cliDir, "university");

if (!existsSync(src)) {
  console.error(`[bundle-university] source pack not found: ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// Ship the authored content + manifest + index. Skip runtime-only dirs
// (.metrics/, diplomas/) which are local state, not pack content.
let copied = 0;
for (const entry of ["pack.yaml", "content", "index.yaml"]) {
  const s = resolve(src, entry);
  if (existsSync(s)) {
    cpSync(s, resolve(dest, entry), { recursive: true });
    copied++;
  }
}

if (copied === 0) {
  console.error("[bundle-university] nothing copied — pack appears empty");
  process.exit(1);
}
console.log(`[bundle-university] bundled University pack → packages/cli/university/ (${copied} entries)`);
