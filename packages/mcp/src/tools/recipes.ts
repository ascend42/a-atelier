// @a-company/atelier-mcp — Studio Recipe tools (list, get, validate, save, apply)
//
// Conversational view/edit surface for Studio Recipes. Wraps the recipe
// load/validate/serialize/apply pipeline so an agent can show, explain, edit,
// and apply recipes without shelling out to the CLI.
//
// Dependency note: the canonical recipe pure-functions live in the CLI package
// (@a-company/atelier — packages/cli/src/lib/recipe.ts). The MCP package does
// NOT depend on the CLI package (importing it would risk a cli↔mcp dependency
// cycle), so the thin load/validate/serialize wrappers and the overlay_rules
// translator are re-implemented here on top of @a-company/atelier-schema's
// validateRecipe + the `yaml` package. This mirrors the existing intentional
// duplication of renderPageNumberFormat in overlays.ts.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { homedir } from "node:os";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateRecipe } from "@a-company/atelier-schema";
import type {
  AtelierDocument,
  Layer,
  StudioRecipe,
  OverlayAnchor,
  OverlayTextStyle,
  OverlayPageNumberRule,
} from "@a-company/atelier-types";
import type { DocumentStore } from "../store.js";

function getDoc(store: DocumentStore, id: string): { doc: AtelierDocument } | { error: string } {
  const doc = store.get(id);
  if (!doc) return { error: `Document "${id}" not found` };
  return { doc };
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...data }) }] };
}

function err(message: string, extra?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message, ...extra }) }],
    isError: true as const,
  };
}

// ─── Recipe load / validate / serialize (re-implemented from cli/recipe.ts) ───

interface LoadedRecipe {
  recipe: StudioRecipe;
  /** Absolute path the recipe was read from */
  path: string;
  /** Warnings from validateRecipe (e.g. reserved-field usage) */
  warnings: string[];
}

/**
 * Resolve a recipe reference to an absolute path. Mirrors recipe.ts's
 * resolveRecipePath: absolute or slash-bearing paths load literally; bare
 * names resolve against <projectDir>/.atelier/recipes/ then ~/.atelier/recipes/.
 */
function resolveRecipePath(pathOrName: string, projectDir: string): string {
  if (isAbsolute(pathOrName) || pathOrName.includes("/") || pathOrName.includes("\\")) {
    return resolve(pathOrName);
  }

  const candidates: string[] = [];
  const exts = [".recipe.yaml", ".recipe.json", ".yaml", ".yml", ".json"];

  const projectRecipesDir = join(resolve(projectDir), ".atelier", "recipes");
  for (const ext of exts) candidates.push(join(projectRecipesDir, `${pathOrName}${ext}`));
  const userRecipesDir = join(homedir(), ".atelier", "recipes");
  for (const ext of exts) candidates.push(join(userRecipesDir, `${pathOrName}${ext}`));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Recipe "${pathOrName}" not found. Looked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
  );
}

/** Parse raw recipe text — JSON for .json, YAML otherwise (YAML is a JSON superset). */
function parseRecipeText(raw: string, path: string): unknown {
  if (path.endsWith(".json")) return JSON.parse(raw);
  return parseYaml(raw);
}

/** Load + validate a recipe from a path or name. Throws on not-found / invalid. */
function loadRecipe(pathOrName: string, projectDir: string): LoadedRecipe {
  const path = resolveRecipePath(pathOrName, projectDir);
  const raw = readFileSync(path, "utf-8");
  const parsed = parseRecipeText(raw, path);

  const result = validateRecipe(parsed);
  if (!result.success) {
    const msg = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid recipe at ${path}:\n${msg}`);
  }

  return { recipe: result.data, path, warnings: result.warnings ?? [] };
}

/** Serialize a recipe object back to YAML. */
function recipeToYaml(recipe: StudioRecipe): string {
  return stringifyYaml(recipe);
}

// ─── Overlay translator (re-implemented from cli/recipe.ts) ───────────────────
//
// Translates recipe.overlay_rules → tag-isolated TextVisual layers. Only
// "overlay"-tagged layers are touched; everything else passes through. Re-apply
// is idempotent (prior overlay set dropped before fresh set appended).

const DEFAULT_OVERLAY_MARGIN = 24;
const DEFAULT_OVERLAY_TEXT_STYLE = {
  fontFamily: "Inter",
  fontSize: 24,
  fontWeight: 600 as const,
  color: "#F5F5F7",
};
const HANDLE_LAYER_ID = "overlay-handle";
const PAGE_NUMBER_LAYER_ID = "overlay-page-number";

interface ApplyOverlayContext {
  currentIndex?: number;
  totalCount?: number;
}

interface OverlayApplyResult {
  doc: AtelierDocument;
  warnings: string[];
}

function applyRecipeToOverlay(
  doc: AtelierDocument,
  recipe: StudioRecipe,
  ctx?: ApplyOverlayContext,
): OverlayApplyResult {
  const preserved = doc.layers.filter((l) => !(l.tags ?? []).includes("overlay"));
  const overlayLayers: Layer[] = [];
  const warnings: string[] = [];

  const rules = recipe.overlay_rules;
  if (!rules) {
    return { doc: { ...doc, layers: preserved }, warnings };
  }

  if (rules.handle) {
    overlayLayers.push(buildHandleLayer(rules.handle, doc.canvas));
  }

  if (rules.page_number) {
    if (ctx?.currentIndex != null && ctx?.totalCount != null) {
      overlayLayers.push(
        buildPageNumberLayer(rules.page_number, doc.canvas, ctx.currentIndex, ctx.totalCount),
      );
    } else {
      warnings.push(
        "recipe.overlay_rules.page_number is present but currentIndex/totalCount " +
          "were not provided — the page_number layer was skipped.",
      );
    }
  }

  return { doc: { ...doc, layers: [...preserved, ...overlayLayers] }, warnings };
}

function buildHandleLayer(
  rule: { text: string; anchor: OverlayAnchor; margin?: number; style?: OverlayTextStyle },
  canvas: AtelierDocument["canvas"],
): Layer {
  const margin = rule.margin ?? DEFAULT_OVERLAY_MARGIN;
  const { frame, anchorPoint } = anchorToFrame(rule.anchor, canvas, margin);
  return {
    id: HANDLE_LAYER_ID,
    tags: ["overlay"],
    visual: { type: "text", content: rule.text, style: mergeOverlayStyle(rule.style) },
    frame,
    bounds: { width: 600, height: 80 },
    anchorPoint,
  };
}

function buildPageNumberLayer(
  rule: OverlayPageNumberRule,
  canvas: AtelierDocument["canvas"],
  currentIndex: number,
  totalCount: number,
): Layer {
  const margin = rule.margin ?? DEFAULT_OVERLAY_MARGIN;
  const { frame, anchorPoint } = anchorToFrame(rule.anchor, canvas, margin);
  return {
    id: PAGE_NUMBER_LAYER_ID,
    tags: ["overlay"],
    visual: {
      type: "text",
      content: renderPageNumberFormat(rule.format, currentIndex, totalCount),
      style: mergeOverlayStyle(rule.style),
    },
    frame,
    bounds: { width: 200, height: 80 },
    anchorPoint,
  };
}

function anchorToFrame(
  anchor: OverlayAnchor,
  canvas: AtelierDocument["canvas"],
  margin: number,
): { frame: { x: number; y: number }; anchorPoint: { x: number; y: number } } {
  switch (anchor) {
    case "top-left":
      return { frame: { x: margin, y: margin }, anchorPoint: { x: 0, y: 0 } };
    case "top-right":
      return { frame: { x: canvas.width - margin, y: margin }, anchorPoint: { x: 1, y: 0 } };
    case "bottom-left":
      return { frame: { x: margin, y: canvas.height - margin }, anchorPoint: { x: 0, y: 1 } };
    case "bottom-right":
      return {
        frame: { x: canvas.width - margin, y: canvas.height - margin },
        anchorPoint: { x: 1, y: 1 },
      };
  }
}

function mergeOverlayStyle(
  style: OverlayTextStyle | undefined,
): { fontFamily: string; fontSize: number; fontWeight: number | "normal" | "bold"; color: string } {
  return {
    fontFamily: style?.font_family ?? DEFAULT_OVERLAY_TEXT_STYLE.fontFamily,
    fontSize: style?.font_size ?? DEFAULT_OVERLAY_TEXT_STYLE.fontSize,
    fontWeight: style?.font_weight ?? DEFAULT_OVERLAY_TEXT_STYLE.fontWeight,
    color: style?.color ?? DEFAULT_OVERLAY_TEXT_STYLE.color,
  };
}

function renderPageNumberFormat(format: string, currentIndex: number, totalCount: number): string {
  return format.replace(
    /\{(current|total)(?::0(\d+)d)?\}/g,
    (_, name: string, padWidth?: string) => {
      const value = name === "current" ? currentIndex : totalCount;
      const str = String(value);
      if (padWidth) return str.padStart(parseInt(padWidth, 10), "0");
      return str;
    },
  );
}

// ─── Discovery ────────────────────────────────────────────────────────────────

const RECIPE_EXTS = [".recipe.yaml", ".recipe.yml", ".recipe.json"];

function isRecipeFile(name: string): boolean {
  return RECIPE_EXTS.some((ext) => name.endsWith(ext));
}

/** List recipe files in a directory (non-recursive). Returns absolute paths. */
function listRecipesIn(dir: string): Array<{ name: string; path: string }> {
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter(isRecipeFile)
    .map((name) => ({ name, path: join(dir, name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function register(server: McpServer, store: DocumentStore): void {
  // ── atelier_recipe_list ─────────────────────────────────────
  server.tool(
    "atelier_recipe_list",
    "List discoverable Studio Recipes — project-local <projectDir>/.atelier/recipes/*.recipe.* " +
      "plus ~/.atelier/recipes/*.recipe.*. Returns { name, path } entries with absolute paths.",
    {
      projectDir: z.string().optional().describe("Project root to search (default: process.cwd())"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ projectDir }) => {
      const root = resolve(projectDir ?? process.cwd());
      const projectRecipes = listRecipesIn(join(root, ".atelier", "recipes"));
      const userRecipes = listRecipesIn(join(homedir(), ".atelier", "recipes"));
      // Project recipes take precedence; de-dupe by basename.
      const seen = new Set(projectRecipes.map((r) => r.name));
      const recipes = [...projectRecipes, ...userRecipes.filter((r) => !seen.has(r.name))];
      return ok({ count: recipes.length, recipes });
    },
  );

  // ── atelier_recipe_get ──────────────────────────────────────
  server.tool(
    "atelier_recipe_get",
    "Load a recipe and return BOTH the parsed object and its serialized YAML text " +
      "(so the agent can show/explain it), plus any validation warnings.",
    {
      path: z.string().describe("Recipe path or bare name (resolved like the CLI)"),
      projectDir: z.string().optional().describe("Project root for name resolution (default: process.cwd())"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ path, projectDir }) => {
      const root = resolve(projectDir ?? process.cwd());
      try {
        const loaded = loadRecipe(path, root);
        return ok({
          path: loaded.path,
          recipe: loaded.recipe as unknown as Record<string, unknown>,
          yaml: recipeToYaml(loaded.recipe),
          warnings: loaded.warnings,
        });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );

  // ── atelier_recipe_validate ─────────────────────────────────
  server.tool(
    "atelier_recipe_validate",
    "Validate a recipe from a path OR inline YAML text. Returns { success, warnings, errors }.",
    {
      path: z.string().optional().describe("Recipe path or bare name to validate"),
      yaml: z.string().optional().describe("Inline YAML text to validate (alternative to path)"),
      projectDir: z.string().optional().describe("Project root for name resolution (default: process.cwd())"),
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ path, yaml, projectDir }) => {
      if (!path && yaml === undefined) {
        return err("Provide either `path` or `yaml` to validate");
      }
      const root = resolve(projectDir ?? process.cwd());

      let parsed: unknown;
      try {
        if (yaml !== undefined) {
          parsed = parseYaml(yaml);
        } else {
          const resolved = resolveRecipePath(path as string, root);
          parsed = parseRecipeText(readFileSync(resolved, "utf-8"), resolved);
        }
      } catch (e) {
        return ok({ valid: false, warnings: [], errors: [{ path: "(yaml)", message: (e as Error).message }] });
      }

      const result = validateRecipe(parsed);
      if (!result.success) {
        return ok({ valid: false, warnings: [], errors: result.errors });
      }
      return ok({ valid: true, warnings: result.warnings ?? [], errors: [] });
    },
  );

  // ── atelier_recipe_save ─────────────────────────────────────
  server.tool(
    "atelier_recipe_save",
    "Write a recipe to disk. Accepts a recipe object (serialized via YAML) OR raw YAML text. " +
      "Validates BEFORE writing and REFUSES to write an invalid recipe (returns an error with the " +
      "validation issues). Creates parent directories as needed.",
    {
      path: z.string().describe("Absolute or relative file path to write the recipe to"),
      recipe: z.record(z.string(), z.unknown()).optional().describe("Recipe object (will be serialized to YAML)"),
      yaml: z.string().optional().describe("Raw YAML text (alternative to `recipe`)"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ path, recipe, yaml }) => {
      if (recipe === undefined && yaml === undefined) {
        return err("Provide either `recipe` (object) or `yaml` (text) to save");
      }

      // Materialize the recipe object + its YAML text.
      let parsed: unknown;
      let yamlText: string;
      if (yaml !== undefined) {
        yamlText = yaml;
        try {
          parsed = parseYaml(yaml);
        } catch (e) {
          return err(`YAML parse error: ${(e as Error).message}`);
        }
      } else {
        parsed = recipe;
        yamlText = stringifyYaml(recipe);
      }

      // Validate — refuse to write an invalid recipe.
      const result = validateRecipe(parsed);
      if (!result.success) {
        return err("Refusing to write an invalid recipe", { errors: result.errors });
      }

      const absPath = resolve(path);
      try {
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, yamlText, "utf-8");
      } catch (e) {
        return err(`Failed to write recipe: ${(e as Error).message}`);
      }

      return ok({ path: absPath, warnings: result.warnings ?? [] });
    },
  );

  // ── atelier_recipe_apply ────────────────────────────────────
  server.tool(
    "atelier_recipe_apply",
    "Apply a recipe's overlay_rules to an in-store document (handle + page-number overlays). " +
      "Accepts a recipe object OR a path/name. The result is stored back with source=\"llm\". " +
      "NOTE: only overlay_rules are applied here — silence-trim / transcribe / caption application " +
      "remain CLI-only. page_number overlays require currentIndex + totalCount; if a recipe requests " +
      "page_number without them, that layer is skipped and a warning is returned.",
    {
      documentId: z.string().describe("In-store document ID to apply the recipe to"),
      path: z.string().optional().describe("Recipe path or bare name (alternative to `recipe`)"),
      recipe: z.record(z.string(), z.unknown()).optional().describe("Recipe object (alternative to `path`)"),
      projectDir: z.string().optional().describe("Project root for name resolution (default: process.cwd())"),
      currentIndex: z.number().int().nonnegative().optional().describe("1-based carousel index for page_number"),
      totalCount: z.number().int().positive().optional().describe("Total carousel size for page_number"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ documentId, path, recipe, projectDir, currentIndex, totalCount }) => {
      const result = getDoc(store, documentId);
      if ("error" in result) return err(result.error);
      const { doc } = result;

      if (path === undefined && recipe === undefined) {
        return err("Provide either `path` or `recipe` to apply");
      }

      // Resolve the recipe object (validated either way).
      let resolvedRecipe: StudioRecipe;
      if (recipe !== undefined) {
        const validated = validateRecipe(recipe);
        if (!validated.success) {
          return err("Invalid recipe", { errors: validated.errors });
        }
        resolvedRecipe = validated.data;
      } else {
        const root = resolve(projectDir ?? process.cwd());
        try {
          resolvedRecipe = loadRecipe(path as string, root).recipe;
        } catch (e) {
          return err((e as Error).message);
        }
      }

      const { doc: updated, warnings } = applyRecipeToOverlay(doc, resolvedRecipe, {
        currentIndex,
        totalCount,
      });
      store.set(documentId, updated, "llm");

      return ok({
        documentId,
        warnings,
        layerCount: updated.layers.length,
        document: updated as unknown as Record<string, unknown>,
      });
    },
  );
}
