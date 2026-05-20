---
id: N-atel-601-recipe-tools-and-apply
title: Recipe tooling — CLI verbs, MCP tools, and resolution
type: note
track: ATEL-601
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-601
  - cli
  - mcp
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-301-composition-and-overlays
summary: The recipe surface — CLI verbs (recipe new/validate/show, apply-recipe, the --recipe flag on trim/transcribe/captions regenerate) and MCP tools (atelier_recipe_list/get/validate/save/apply). save refuses invalid recipes; apply wires only overlay_rules. The two-tier resolution chain and CLI-wins precedence.
---

## CLI: the recipe family

```
atelier recipe new <name>        scaffold a starter YAML with every default filled in
atelier recipe validate <path>   validate against the schema (^valid-recipe gate)
atelier recipe show <path>       print a recipe; --with-defaults overlays code defaults
```

**`recipe new`** scaffolds. It writes a starter `.recipe.yaml` (into `./.atelier/recipes/` by default, or `--dir`) with every Phase 1 field present and commented, so you learn the shape by editing. It refuses to overwrite an existing file, and it guards the footgun where `recipe new foo.recipe.yaml` would otherwise produce `foo.recipe.yaml.recipe.yaml`. Note: `new` only writes a template — it does *not* validate, because the scaffold is always valid by construction.

**`recipe validate`** runs the recipe through `validateRecipe` and reports `PASS`/`FAIL`. It also surfaces forward-compat warnings for reserved Phase 3 fields. Add `--json` for machine-readable output.

**`recipe show`** prints the recipe back as YAML. With `--with-defaults` it overlays the code defaults onto every omitted field, so you see the fully-resolved effective recipe.

## CLI: applying a recipe

A recipe touches a project two ways.

**The `--recipe <name>` flag** on the individual pipelines:

```
atelier trim <project> --recipe my-style                  silence_policy as the baseline
atelier transcribe <project> --recipe my-style            caption_style + caption_grouping
atelier captions regenerate <project> --recipe my-style   caption_style + caption_grouping
```

Each flag pulls the relevant section from the recipe and uses it as the baseline for that pipeline. (The caption verb is `captions regenerate`, not a bare `captions`.)

**The `apply-recipe` convenience verb** runs trim and transcribe against the same recipe in one shot:

```
atelier apply-recipe <project> <recipe>
```

In order: `atelier trim`, then `atelier transcribe`, then — if the recipe has `overlay_rules` — the overlay translator rewrites the project's `overlay`-tagged layers. Flags: `--reset` (destructive — discards existing user padding and transcript edits on both pipelines), `--no-trim`, `--no-transcribe`. Because `apply-recipe` is a single-frame apply with no carousel context, the page-number layer is silently skipped; the handle is applied if present.

## MCP: the conversational surface

Five tools let an agent view, edit, and apply recipes without shelling out:

```
atelier_recipe_list      enumerate discoverable recipes (project + user library)
atelier_recipe_get       load a recipe; returns BOTH the parsed object and its YAML
atelier_recipe_validate  validate a path OR inline YAML text
atelier_recipe_save      write a recipe — refuses to write if invalid
atelier_recipe_apply     apply overlay_rules to an in-store document
```

Two behaviors are worth internalizing.

**`atelier_recipe_save` validates before writing.** It runs `validateRecipe` first and *refuses* to write an invalid recipe, returning the validation issues instead. This is the deliberate contrast with `recipe new`: `new` scaffolds an always-valid template; `save` is how an agent persists an *edited* recipe, and it guards the write so a malformed edit never lands on disk. It creates parent directories as needed and accepts either a recipe object or raw YAML text.

**`atelier_recipe_apply` only applies `overlay_rules`.** This is the key agent mental-model point. The apply tool wires up *only* the handle + page-number overlays onto an in-store document (the result is stored back with `source: "llm"`). Silence-trim, transcribe, and caption application stay **CLI-only** — there is no MCP path for them. If the recipe requests a `page_number` but `currentIndex`/`totalCount` aren't passed, that layer is skipped and a warning is returned (same rule as the CLI translator).

## Resolution chain and precedence

A bare recipe name resolves through a two-tier chain (`resolveRecipePath` in `packages/cli/src/lib/recipe.ts`), checking these extensions at each tier — `.recipe.yaml`, `.recipe.json`, `.yaml`, `.yml`, `.json`:

1. **Project-local:** `<projectDir>/.atelier/recipes/<name>.<ext>`
2. **User library:** `~/.atelier/recipes/<name>.<ext>`

The project directory is searched first, so a project can shadow a personal recipe of the same name. A path that is absolute or contains a slash skips resolution entirely and loads literally. `recipe new`, `recipe validate`, and `recipe show` all share this chain, so a name authored by `new` is found by `validate` and `show`.

**CLI-wins precedence.** When a recipe is combined with explicit CLI flags, the CLI flag wins. In `applyRecipeToTrimOptions`, each field is `cliOptions.x ?? policy.x` — the recipe only fills in what the CLI left unspecified. So `atelier trim <project> --recipe my-style --noise -40dB` uses the recipe's silence policy as the baseline but honors the `-40dB` you typed. The recipe is a baseline; the command line is an override.
