import type { Command } from "commander";
import {
  loadVideoProject,
  readTranscript,
  readComposition,
  writeComposition,
} from "../lib/video-project.js";
import { rewriteCaptionLayers } from "../lib/caption-builder.js";
import { loadRecipe, applyRecipeToCaptionOptions } from "../lib/recipe.js";

/** Register `atelier captions regenerate <project>` */
export function captionsCommand(program: Command): void {
  const captions = program.command("captions").description("Manage caption layers in a VideoProject");

  captions
    .command("regenerate <project>")
    .description(
      "Re-derive caption-tagged TextVisual layers from the current transcript.json. " +
      "Used when caption styling changes without re-running Whisper.",
    )
    .option("--recipe <name>", "Apply a Studio Recipe's caption_style + caption_grouping")
    .action(async (projectDir: string, opts: { recipe?: string }) => {
      try {
        const project = loadVideoProject(projectDir);
        const transcript = readTranscript(project);
        if (!transcript) {
          throw new Error(
            `No transcript.json in ${projectDir}. Run \`atelier transcribe ${projectDir}\` first.`,
          );
        }
        const captionOptions = opts.recipe
          ? applyRecipeToCaptionOptions(loadRecipe(opts.recipe, projectDir).recipe)
          : {};
        const doc = readComposition(project);
        const updated = rewriteCaptionLayers(doc, transcript, captionOptions);
        writeComposition(project, updated);
        const captionLayers = updated.layers.filter((l) =>
          (l.tags ?? []).includes("caption"),
        );
        console.log(
          `Regenerated ${captionLayers.length} caption layer${captionLayers.length === 1 ? "" : "s"} in ${project.dir}`,
        );
      } catch (err) {
        console.error(`atelier captions regenerate: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
