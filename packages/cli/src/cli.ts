#!/usr/bin/env node
// @a-company/atelier-cli — Entry point for the `atelier` command

import { createRequire } from "node:module";
import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { infoCommand } from "./commands/info.js";
import { stillCommand } from "./commands/still.js";
import { renderCommand } from "./commands/render.js";
import { exportSvgCommand } from "./commands/export-svg.js";
import { exportLottieCommand } from "./commands/export-lottie.js";
import { assetsCommand } from "./commands/assets.js";
import { variablesCommand } from "./commands/variables.js";
import { studioCommand } from "./commands/studio.js";

const program = new Command();

program
  .name("atelier")
  .description("Atelier animation CLI")
  .version(createRequire(import.meta.url)("../package.json").version);

// Register commands
validateCommand(program);
infoCommand(program);
stillCommand(program);
renderCommand(program);
exportSvgCommand(program);
exportLottieCommand(program);
assetsCommand(program);
variablesCommand(program);
studioCommand(program);

program.parse();
