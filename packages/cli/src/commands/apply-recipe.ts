import type { Command } from "commander";
import { trimProject } from "./trim.js";
import { transcribeProject } from "./transcribe.js";
import {
  loadRecipe,
  applyRecipeToTrimOptions,
  applyRecipeToTranscribeOptions,
} from "../lib/recipe.js";

/**
 * Register `atelier apply-recipe <project> <recipe>` — convenience verb that
 * runs `atelier trim` and `atelier transcribe` against the same recipe in
 * one shot. Useful for fresh-project bootstrap.
 */
export function applyRecipeCommand(program: Command): void {
  program
    .command("apply-recipe <project> <recipe>")
    .description(
      "Apply a Studio Recipe by running atelier trim + atelier transcribe " +
      "with the same recipe, in that order.",
    )
    .option("--reset", "Apply --reset to both pipelines (destructive — discards existing user padding and transcript edits)")
    .option("--no-trim", "Skip the atelier trim step")
    .option("--no-transcribe", "Skip the atelier transcribe step")
    .action(async (
      project: string,
      recipeRef: string,
      opts: { reset?: boolean; trim: boolean; transcribe: boolean },
    ) => {
      try {
        const { recipe, path, warnings } = loadRecipe(recipeRef, project);
        console.log(`Loaded recipe ${path}`);
        for (const w of warnings) console.log(`  ⚠  ${w}`);

        if (opts.trim) {
          const trimOpts = applyRecipeToTrimOptions(recipe, { reset: opts.reset });
          console.log(`\nRunning atelier trim...`);
          const r = await trimProject(project, trimOpts);
          console.log(`  ${r.cuts.length} cut${r.cuts.length === 1 ? "" : "s"} written`);
        }

        if (opts.transcribe) {
          const transcribeOpts = applyRecipeToTranscribeOptions(recipe, { reset: opts.reset });
          console.log(`\nRunning atelier transcribe...`);
          const r = await transcribeProject(project, transcribeOpts);
          console.log(`  ${r.wordCount} words, ${r.captionsGenerated ? "captions written" : "captions skipped"}`);
        }

        console.log(`\nDone.`);
      } catch (err) {
        console.error(`atelier apply-recipe: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
