#!/usr/bin/env node
// @a-company/atelier-cli — Entry point for the `atelier` command

import { createRequire } from "node:module";
import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { lintCommand } from "./commands/lint.js";
import { trimCommand } from "./commands/trim.js";
import { transcribeCommand } from "./commands/transcribe.js";
import { reconstructCommand } from "./commands/reconstruct.js";
import { transcriptCommand } from "./commands/transcript.js";
import { captionsCommand } from "./commands/captions.js";
import { recipeCommand } from "./commands/recipe.js";
import { applyRecipeCommand } from "./commands/apply-recipe.js";
import { artifactsCommand } from "./commands/artifacts.js";
import { carouselCommand } from "./commands/carousel.js";
import { infoCommand } from "./commands/info.js";
import { stillCommand } from "./commands/still.js";
import { renderCommand } from "./commands/render.js";
import { exportSvgCommand } from "./commands/export-svg.js";
import { exportLottieCommand } from "./commands/export-lottie.js";
import { exportImageCommand } from "./commands/export-image.js";
import { assetsCommand } from "./commands/assets.js";
import { variablesCommand } from "./commands/variables.js";
import { studioCommand } from "./commands/studio.js";
import { initCommand } from "./commands/init.js";
import { mediaCommand } from "./commands/media.js";

const program = new Command();

program
  .name("atelier")
  .description("Atelier animation CLI")
  .version(createRequire(import.meta.url)("../package.json").version);

// Register commands
validateCommand(program);
lintCommand(program);
trimCommand(program);
transcribeCommand(program);
reconstructCommand(program);
transcriptCommand(program);
captionsCommand(program);
recipeCommand(program);
applyRecipeCommand(program);
artifactsCommand(program);
carouselCommand(program);
infoCommand(program);
stillCommand(program);
renderCommand(program);
exportSvgCommand(program);
exportLottieCommand(program);
exportImageCommand(program);
assetsCommand(program);
variablesCommand(program);
studioCommand(program);
initCommand(program);
mediaCommand(program);

program.parse();
