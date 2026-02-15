#!/usr/bin/env node
// @atelier/cli — Entry point for the `atelier` command

import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { infoCommand } from "./commands/info.js";
import { stillCommand } from "./commands/still.js";
import { renderCommand } from "./commands/render.js";

const program = new Command();

program
  .name("atelier")
  .description("Atelier animation CLI")
  .version("0.1.0");

// Register commands
validateCommand(program);
infoCommand(program);
stillCommand(program);
renderCommand(program);

program.parse();
