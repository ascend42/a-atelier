import { readFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateRecipe } from "@a-company/atelier-schema";
import type {
  StudioRecipe,
  SilencePolicy,
  CaptionStyle,
  CaptionGrouping,
} from "@a-company/atelier-types";
import type { TrimOptions } from "../commands/trim.js";
import type { TranscribeOptions } from "../commands/transcribe.js";
import type { CaptionStyle as RuntimeCaptionStyle, BuildCaptionsOptions } from "./caption-builder.js";

export const RECIPE_VERSION = "1.0";

export interface LoadedRecipe {
  recipe: StudioRecipe;
  /** Absolute path the recipe was read from */
  path: string;
  /** Warnings from validateRecipe (e.g. reserved-field usage) */
  warnings: string[];
}

/**
 * Resolve a recipe reference to an absolute path.
 *
 * Resolution order (per studio-recipe.md §6.2):
 *   1. <projectDir>/.atelier/recipes/<name>.recipe.{yaml,json}
 *   2. ~/.atelier/recipes/<name>.recipe.{yaml,json}
 *   3. The literal path passed (absolute or relative to cwd)
 *
 * Absolute paths and paths containing slashes skip resolution and load directly.
 */
export function resolveRecipePath(pathOrName: string, projectDir?: string): string {
  // Absolute path or contains a path separator — treat as literal
  if (isAbsolute(pathOrName) || pathOrName.includes("/") || pathOrName.includes("\\")) {
    return resolve(pathOrName);
  }

  const candidates: string[] = [];
  const exts = [".recipe.yaml", ".recipe.json", ".yaml", ".yml", ".json"];

  if (projectDir) {
    const projectRecipesDir = join(resolve(projectDir), ".atelier", "recipes");
    for (const ext of exts) candidates.push(join(projectRecipesDir, `${pathOrName}${ext}`));
  }
  const userRecipesDir = join(homedir(), ".atelier", "recipes");
  for (const ext of exts) candidates.push(join(userRecipesDir, `${pathOrName}${ext}`));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Recipe "${pathOrName}" not found. Looked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
  );
}

/**
 * Load and validate a recipe from a path or name.
 *
 * Sniffs YAML vs JSON by file extension; falls back to YAML parser when
 * unclear (YAML is a superset of JSON for objects).
 */
export function loadRecipe(pathOrName: string, projectDir?: string): LoadedRecipe {
  const path = resolveRecipePath(pathOrName, projectDir);
  const raw = readFileSync(path, "utf-8");

  let parsed: unknown;
  if (path.endsWith(".json")) {
    parsed = JSON.parse(raw);
  } else {
    parsed = parseYaml(raw);
  }

  const result = validateRecipe(parsed);
  if (!result.success) {
    const msg = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid recipe at ${path}:\n${msg}`);
  }

  return {
    recipe: result.data,
    path,
    warnings: result.warnings ?? [],
  };
}

/**
 * Generate a starter recipe YAML with every Phase 1 field present and
 * inline comments documenting it. Authors learn the shape by editing.
 */
export function scaffoldRecipeYaml(name: string): string {
  return `# Studio Recipe — ${name}
# Phase 1 — manual authoring + apply
# https://github.com/ascend42/a-atelier/blob/main/.paradigm/specs/studio-recipe.md

version: "${RECIPE_VERSION}"
name: "${name}"
description: ""
author: ""
tags: []

# ── Silence-trim policy — consumed by \`atelier trim\` ───────────────────
silence_policy:
  # silencedetect noise threshold (default: -30dB)
  noise: "-30dB"
  # Minimum silence duration to register, in seconds (default: 0.35)
  min_silence: 0.35
  # Default leading padding for new cuts, in seconds (default: 0.08)
  default_padding_pre: 0.08
  # Default trailing padding for new cuts, in seconds (default: 0.12)
  default_padding_post: 0.12
  # Re-detect match tolerance for preserving user padding, in seconds (default: 0.5)
  match_tolerance: 0.5

# ── Caption visual style — consumed by \`atelier transcribe\` ────────────
caption_style:
  font_family: "Inter"
  font_size: 84
  font_weight: "bold"     # normal | bold | numeric (100..900)
  text_align: "center"    # left | center | right
  color: "#FFFFFF"
  y_ratio: 0.85           # 0=top, 1=bottom
  width_ratio: 0.9
  fade_seconds: 0.05

# ── Caption phrase grouping — consumed by \`atelier transcribe\` ─────────
caption_grouping:
  max_words: 5
  pause_gap: 0.4

# ── Phase 3 fields (reserved — Phase 1 ignores these) ──────────────────
# overlay_rules: []
# caption_highlight: {}
# transition_kit: {}
# palette: {}
# audio_policy: {}
# aspect_targets: []
`;
}

// ─── Recipe → CLI options translation ─────────────────────────────

/**
 * Merge a recipe's silence_policy into TrimOptions.
 * CLI options take precedence (per studio-recipe.md §4.1).
 */
export function applyRecipeToTrimOptions(
  recipe: StudioRecipe | undefined,
  cliOptions: TrimOptions,
): TrimOptions {
  const policy = recipe?.silence_policy;
  if (!policy) return cliOptions;

  // CLI options win — only fill in from recipe where CLI didn't specify
  return {
    ...cliOptions,
    noise: cliOptions.noise ?? policy.noise,
    minSilence: cliOptions.minSilence ?? policy.min_silence,
    padPre: cliOptions.padPre ?? policy.default_padding_pre,
    padPost: cliOptions.padPost ?? policy.default_padding_post,
    // matchTolerance is recipe-only at this layer (no CLI flag yet)
    matchTolerance: cliOptions.matchTolerance ?? policy.match_tolerance,
  };
}

/**
 * Translate a recipe's caption_style + caption_grouping into runtime
 * BuildCaptionsOptions for the caption builder.
 *
 * CLI doesn't currently expose per-invocation caption styling flags;
 * the recipe is the canonical source for now.
 */
export function applyRecipeToCaptionOptions(
  recipe: StudioRecipe | undefined,
): BuildCaptionsOptions {
  if (!recipe) return {};
  const style = recipe.caption_style;
  const grouping = recipe.caption_grouping;

  const runtimeStyle: RuntimeCaptionStyle = {};
  if (style) {
    if (style.font_family !== undefined) runtimeStyle.fontFamily = style.font_family;
    if (style.font_size !== undefined) runtimeStyle.fontSize = style.font_size;
    if (style.font_weight !== undefined) runtimeStyle.fontWeight = style.font_weight;
    if (style.text_align !== undefined) runtimeStyle.textAlign = style.text_align;
    if (style.color !== undefined) runtimeStyle.color = style.color;
    if (style.y_ratio !== undefined) runtimeStyle.yRatio = style.y_ratio;
    if (style.width_ratio !== undefined) runtimeStyle.widthRatio = style.width_ratio;
    if (style.fade_seconds !== undefined) runtimeStyle.fadeSeconds = style.fade_seconds;
  }

  return {
    ...(Object.keys(runtimeStyle).length > 0 && { style: runtimeStyle }),
    ...(grouping?.max_words !== undefined && { maxWords: grouping.max_words }),
    ...(grouping?.pause_gap !== undefined && { pauseGap: grouping.pause_gap }),
  };
}

/**
 * Merge a recipe into TranscribeOptions. Caption-related recipe fields
 * are stashed on the transcribe options so the orchestrator can pass them
 * through to rewriteCaptionLayers.
 */
export function applyRecipeToTranscribeOptions(
  recipe: StudioRecipe | undefined,
  cliOptions: TranscribeOptions,
): TranscribeOptions {
  if (!recipe) return cliOptions;
  const captionOptions = applyRecipeToCaptionOptions(recipe);
  return {
    ...cliOptions,
    captionOptions,
  };
}

/**
 * Render a recipe's effective values (recipe overlaid on code defaults).
 * Used by `atelier recipe show --with-defaults`.
 */
export function renderRecipeWithDefaults(recipe: StudioRecipe): StudioRecipe {
  const defaults: { silence_policy: SilencePolicy; caption_style: CaptionStyle; caption_grouping: CaptionGrouping } = {
    silence_policy: {
      noise: "-30dB",
      min_silence: 0.35,
      default_padding_pre: 0.08,
      default_padding_post: 0.12,
      match_tolerance: 0.5,
    },
    caption_style: {
      font_family: "Inter",
      font_size: 84,
      font_weight: "bold",
      text_align: "center",
      color: "#FFFFFF",
      y_ratio: 0.85,
      width_ratio: 0.9,
      fade_seconds: 0.05,
    },
    caption_grouping: {
      max_words: 5,
      pause_gap: 0.4,
    },
  };

  return {
    ...recipe,
    silence_policy: { ...defaults.silence_policy, ...recipe.silence_policy },
    caption_style: { ...defaults.caption_style, ...recipe.caption_style },
    caption_grouping: { ...defaults.caption_grouping, ...recipe.caption_grouping },
  };
}

/** Serialize a recipe back to YAML for `recipe show` output */
export function recipeToYaml(recipe: StudioRecipe): string {
  return stringifyYaml(recipe);
}
