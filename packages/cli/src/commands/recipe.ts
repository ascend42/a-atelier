import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import {
  loadRecipe,
  scaffoldRecipeYaml,
  renderRecipeWithDefaults,
  recipeToYaml,
} from "../lib/recipe.js";

/** Register `atelier recipe new/validate/show` family */
export function recipeCommand(program: Command): void {
  const recipe = program.command("recipe").description("Manage Studio Recipes — reusable style presets");

  recipe
    .command("new <name>")
    .description("Scaffold a starter recipe YAML with all current defaults filled in")
    .option("--dir <path>", "Where to write the recipe (default: ./.atelier/recipes/)")
    .action((name: string, opts: { dir?: string }) => {
      try {
        const baseDir = opts.dir ?? join(resolve(process.cwd()), ".atelier", "recipes");
        if (!existsSync(baseDir)) {
          mkdirSync(baseDir, { recursive: true });
        }
        // Footgun guard: if the name already carries a recognized extension,
        // treat it as a filename so `recipe new foo.recipe.yaml` doesn't
        // produce `foo.recipe.yaml.recipe.yaml`. Otherwise append the canonical
        // extension. The bare-name stem (without ext) is what `recipe validate
        // <name>` resolves, so they stay in agreement.
        const hasKnownExt = /\.(recipe\.yaml|recipe\.json|yaml|yml|json)$/i.test(name);
        const fileName = hasKnownExt ? name : `${name}.recipe.yaml`;
        const outPath = join(baseDir, fileName);
        if (existsSync(outPath)) {
          throw new Error(`Recipe already exists at ${outPath} — refusing to overwrite.`);
        }
        const recipeName = name.replace(/\.(recipe\.yaml|recipe\.json|yaml|yml|json)$/i, "");
        const yaml = scaffoldRecipeYaml(recipeName);
        writeFileSync(outPath, yaml, "utf-8");
        console.log(`Created ${outPath}`);
      } catch (err) {
        console.error(`atelier recipe new: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  recipe
    .command("validate <path>")
    .description("Validate a recipe against the schema (^valid-recipe gate). Warns on reserved Phase 3 fields.")
    .option("--json", "Output result as JSON")
    .action((path: string, opts: { json?: boolean }) => {
      try {
        // Resolve a bare name against the project-local recipes dir first
        // (where `recipe new` writes), then the user library — so new/validate
        // agree on where a bare name lives.
        const loaded = loadRecipe(path, process.cwd());
        if (opts.json) {
          console.log(JSON.stringify({
            valid: true,
            path: loaded.path,
            warnings: loaded.warnings,
          }, null, 2));
        } else {
          console.log(`PASS  ${loaded.path}`);
          for (const w of loaded.warnings) {
            console.log(`  ⚠  ${w}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ valid: false, error: msg }, null, 2));
        } else {
          console.error(`FAIL  ${path}`);
          console.error(`  ${msg}`);
        }
        process.exit(1);
      }
    });

  recipe
    .command("show <path>")
    .description("Print a recipe; --with-defaults fills in every omitted field with its code default.")
    .option("--with-defaults", "Overlay code defaults onto omitted fields")
    .action((path: string, opts: { withDefaults?: boolean }) => {
      try {
        // Same project-local-first resolution as `recipe validate`.
        const loaded = loadRecipe(path, process.cwd());
        const out = opts.withDefaults ? renderRecipeWithDefaults(loaded.recipe) : loaded.recipe;
        console.log(recipeToYaml(out));
        for (const w of loaded.warnings) {
          console.error(`# ⚠  ${w}`);
        }
      } catch (err) {
        console.error(`atelier recipe show: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
