# Studio Recipe — Reusable Style Preset (Phase 1)

**Status:** Draft — pending implementation
**Owner:** #studio-recipe (new), #cli-trim, #cli-transcribe, #caption-pipeline
**Related tasks:** Phase 1 of the Studio Recipe value play; Phase 3 (extraction from reference video) deferred
**Depends on:** T-004 (VideoProject) ✓ shipped, T-006 (captions) ✓ shipped, T-007b (trim) ✓ shipped
**Pairs with:** `silence-trim.md`, `captions.md` — Studio Recipe is the bundle that supplies defaults to both

---

## 1. Problem & Vision

UGC creators have a consistent personal style — silence-trim feel, caption color and rhythm, palette, fonts, overlay style. Today every project re-discovers those defaults: hardcoded `paddingPre: 0.08`, `phrase max_words: 5`, caption color `#FFFFFF`, etc. The constants are bound to the code.

**The value play:** make style a *data object*. A YAML file that a creator can author once, save in their library, share with another creator, or have an agent extract from a reference video (Phase 3). Apply it to any new VideoProject and the silence policy, caption styling, phrase grouping, palette, and overlays come pre-configured — tweaked by the user from there.

Phase 1 of this play: the schema + a manual authoring path + the `--recipe` flag consumed by `atelier trim` and `atelier transcribe`. Phase 3 (style extraction from a reference video) becomes possible once Phase 1 is in production and consumers exist.

## 2. Goals (Phase 1)

- `StudioRecipe` is a JSON/YAML data type, versioned, partial-friendly
- `atelier recipe new <name>` scaffolds a `<name>.recipe.yaml` with all current defaults filled in (a starting point users can edit)
- `atelier recipe validate <path>` runs the recipe through Zod + a `^valid-recipe` gate
- `atelier trim --recipe <path>` and `atelier transcribe --recipe <path>` both consume the recipe; existing CLI flags still override
- `atelier apply-recipe <project> <recipe>` is the convenience verb: runs both trim and transcribe with the recipe in one shot
- Recipes can be stored anywhere; the convention is `.atelier/recipes/<name>.recipe.yaml` in a user's project root or `~/.atelier/recipes/` for the personal library
- **Partial recipes are valid** — any omitted field falls back to code defaults

## 3. Non-Goals (Phase 1)

- Extraction from reference video (Phase 3)
- Studio UI for recipe browsing or editing (Phase 4)
- A recipe marketplace / registry (Phase 4)
- Multi-aspect render targets (`aspect_targets`) — reserved field, not implemented this phase
- Overlay rules / keyword triggers — reserved field, not implemented this phase
- Per-word highlight color animation — reserved field
- Audio policy (ducking, music lane) — reserved field
- Transition kit overrides — reserved field

The schema includes reserved fields for these future capabilities (§5.5) so Phase 1 recipes remain forward-compatible.

## 4. Two Load-Bearing Decisions (locked here, not later)

### 4.1 Recipe-vs-CLI precedence

**Order of application (lowest to highest priority):**

1. **Code defaults** (hardcoded in `cut-model.ts`, `caption-builder.ts`, etc.)
2. **Recipe values** (when `--recipe <path>` is provided)
3. **Per-invocation CLI flags** (e.g. `--pad-pre 0.10`)
4. **Per-cut / per-word overrides** stored in `cuts.json` / `transcript.json` (preserved across re-runs as before)

`--tighten <ms>` and `--loosen <ms>` operate on **current padding values** — they delta from whatever is in `cuts.json` right now, never from the recipe. This preserves the parametric-cut UX guarantee.

`--reset` (on trim or transcribe) discards per-item overrides and reseeds from the recipe (or code defaults if no recipe).

### 4.2 Partial recipes are valid

A recipe with only `{ silence_policy: { default_padding_pre: 0.05 } }` is valid. Every other field falls through to its code default. Validation accepts any shape that conforms to the schema for the fields it *does* declare; missing fields are not errors.

Rationale: matches the rest of Atelier's permissive defaults pattern (omitted Layer.anchorPoint, omitted Canvas.background, etc.). A creator should be able to author a recipe that only declares the one thing they care about.

## 5. Schema

### 5.1 Top-level

```typescript
export interface StudioRecipe {
  /** Recipe format version — current is "1.0" */
  version: string;
  /** Human-readable name for the recipe */
  name: string;
  /** Optional one-line description */
  description?: string;
  /** Optional author (creator handle) */
  author?: string;
  /** Optional tags for searchability */
  tags?: string[];

  /** Silence-trim policy — consumed by atelier trim */
  silence_policy?: SilencePolicy;
  /** Caption visual style — consumed by atelier transcribe / captions regenerate */
  caption_style?: CaptionStyle;
  /** Caption phrase grouping — consumed by atelier transcribe */
  caption_grouping?: CaptionGrouping;

  /** RESERVED — Phase 3 extension fields (validated as opaque if present) */
  overlay_rules?: unknown[];
  caption_highlight?: unknown;
  transition_kit?: unknown;
  palette?: unknown;
  audio_policy?: unknown;
  aspect_targets?: unknown[];
}
```

### 5.2 `SilencePolicy`

```typescript
export interface SilencePolicy {
  /** silencedetect noise threshold, e.g. "-30dB" */
  noise?: string;
  /** Minimum silence duration to register, in seconds */
  min_silence?: number;
  /** Default leading padding for new cuts, in seconds */
  default_padding_pre?: number;
  /** Default trailing padding for new cuts, in seconds */
  default_padding_post?: number;
  /** Match tolerance for preserving user padding on re-detect, in seconds */
  match_tolerance?: number;
}
```

Direct map to `atelier trim` flags. All fields optional; code defaults apply when omitted.

### 5.3 `CaptionStyle`

```typescript
export interface CaptionStyle {
  font_family?: string;
  font_size?: number;
  font_weight?: "normal" | "bold" | number;
  text_align?: "left" | "center" | "right";
  color?: string;
  /** Vertical position 0–1 (0=top, 1=bottom). Default 0.85 */
  y_ratio?: number;
  /** Horizontal width ratio of canvas. Default 0.9 */
  width_ratio?: number;
  /** Opacity fade duration in/out, in seconds */
  fade_seconds?: number;
}
```

Maps directly to `caption-builder.ts` `CaptionStyle`. Naming kept in `snake_case` for YAML ergonomics; runtime layer translates.

### 5.4 `CaptionGrouping`

```typescript
export interface CaptionGrouping {
  /** Maximum words per phrase block (default 5) */
  max_words?: number;
  /** Pause gap in seconds that forces a phrase break (default 0.4) */
  pause_gap?: number;
}
```

### 5.5 Reserved fields (forward-compat)

`overlay_rules`, `caption_highlight`, `transition_kit`, `palette`, `audio_policy`, `aspect_targets` are typed as `unknown` in Phase 1. The Zod schema validates them as `z.unknown().optional()` — meaning a Phase 1 recipe that includes Phase 3 fields parses cleanly, those sections are ignored, and Phase 3 implementation can later refine them without bumping the recipe version (additive change).

## 6. File Format & Location

### 6.1 Format

YAML preferred for authoring; JSON accepted for tools. Both share the same Zod schema.

File extension: `.recipe.yaml` or `.recipe.json` (the suffix is informational, not enforced — Atelier sniffs `version: "..."` to identify a recipe).

### 6.2 Location conventions

- **Project-local:** `<project>/.atelier/recipes/<name>.recipe.yaml` — checked into source control, used for project-specific style
- **User library:** `~/.atelier/recipes/<name>.recipe.yaml` — personal default set, lives across projects
- **Anywhere:** `--recipe /abs/path/to/file.recipe.yaml` accepts any path

Resolution order when `--recipe <name>` (without slashes) is provided:
1. `<project>/.atelier/recipes/<name>.recipe.{yaml,json}`
2. `~/.atelier/recipes/<name>.recipe.{yaml,json}`
3. `<cwd>/<name>` (literal path)

## 7. CLI Surface

### 7.1 `atelier recipe new <name>`

```
atelier recipe new <name> [--dir <path>]

Options:
  --dir <path>   Where to write (default: ./.atelier/recipes/)
```

Scaffolds `<name>.recipe.yaml` with every current code default filled in as starter content. The scaffold is intentionally explicit — every field present and commented — so authors learn the shape by editing it, not by reading docs.

### 7.2 `atelier recipe validate <path>`

```
atelier recipe validate <path> [--json]
```

Runs the recipe through Zod schema + `^valid-recipe` gate. Reports unknown fields as warnings (forward-compat), schema mismatches as errors. Exits 1 on errors.

### 7.3 `atelier recipe show <path>`

```
atelier recipe show <path> [--with-defaults]
```

Prints the recipe with optional `--with-defaults` that fills in every omitted field with its code default — useful for understanding what a partial recipe will actually do at apply time.

### 7.4 Consumed by existing commands

```
atelier trim       <project> --recipe <name-or-path> [other flags]
atelier transcribe <project> --recipe <name-or-path> [other flags]
atelier captions regenerate <project> --recipe <name-or-path>
```

CLI flags after `--recipe` still override the recipe (per §4.1).

### 7.5 `atelier apply-recipe <project> <recipe>` (convenience verb)

```
atelier apply-recipe <project> <recipe> [--reset] [--no-trim] [--no-transcribe]

Options:
  --reset           Apply --reset to both pipelines (destructive)
  --no-trim         Skip atelier trim step
  --no-transcribe   Skip atelier transcribe step
```

Equivalent to running `atelier trim` + `atelier transcribe` with the same recipe, in that order. Useful for fresh-project bootstrap.

## 8. Algorithm — How a Recipe Lands in a Pipeline

Centralized in a new `packages/cli/src/lib/recipe.ts`:

```typescript
loadRecipe(pathOrName: string): StudioRecipe
  - Resolves per §6.2
  - Parses YAML or JSON (sniffs by content)
  - Validates via Zod (^valid-recipe)
  - Returns the parsed recipe

applyRecipeToTrimOptions(recipe: StudioRecipe, cliOptions: TrimOptions): TrimOptions
  - Merges recipe.silence_policy into TrimOptions
  - CLI options take precedence per §4.1

applyRecipeToTranscribeOptions(recipe: StudioRecipe, cliOptions: TranscribeOptions): TranscribeOptions
  - Merges recipe.caption_style and recipe.caption_grouping
  - CLI options take precedence

applyRecipeToCaptionOptions(recipe: StudioRecipe): BuildCaptionsOptions
  - Used by captions regenerate and the transcribe caption build step
```

The pipelines themselves stay clean — they accept their existing options interface. The recipe layer is purely a *transformation* on those options before invocation.

## 9. Storage in VideoProject (optional)

A VideoProject MAY store a path to the recipe used most recently:

```typescript
// VideoProjectManifest extension (v1.2 reserved — not bumped this phase)
{
  ...existing fields,
  /** Reserved: last-applied recipe path or name */
  // recipe?: string;
}
```

Not implemented in Phase 1. The user passes `--recipe` each invocation. Phase 4 (studio UI) is the natural moment to add a sticky default to the manifest.

## 10. Library Vetting

**Zero new npm dependencies.** Recipe parsing reuses the existing `yaml` package (already in CLI deps), schema validation reuses `zod` (already in CLI deps).

The recipe loader's only new attack surface is reading user-supplied YAML — `yaml@^2.7.0`'s `parse()` is safe by default (no arbitrary code execution, no YAML 1.1 tag references). Recipe paths are resolved with explicit `~/.atelier/recipes/` and `<project>/.atelier/recipes/` lookups; no glob, no path-traversal risk inherent to the resolver. Files outside those locations require an explicit path argument.

## 11. Test Plan

### 11.1 Unit tests

- `loadRecipe` resolves project-local before user-lib before literal path
- Zod accepts partial recipes (only `silence_policy.default_padding_pre` set)
- Zod accepts recipes with unknown future fields (`palette`, `aspect_targets`)
- Zod rejects recipes with invalid types (e.g. `default_padding_pre: "fast"`)
- `applyRecipeToTrimOptions` — recipe sets baseline; CLI option wins on conflict
- `applyRecipeToTranscribeOptions` — same precedence
- YAML and JSON inputs produce identical parsed StudioRecipe
- Reserved fields round-trip without modification

### 11.2 Integration tests

- `atelier recipe new test-recipe` produces a valid YAML that immediately passes `atelier recipe validate`
- `atelier trim <project> --recipe ./test.yaml` applies recipe defaults; `--pad-pre 0.20` on the same invocation overrides recipe's `default_padding_pre`
- `atelier apply-recipe <project> ./test.yaml` chains trim + transcribe with the same recipe

### 11.3 Dogfood

- Author a personal recipe matching the user's UGC style (8 fields)
- Apply to a fresh take with `atelier apply-recipe`
- Visually verify caption style + cut tightness match expectations
- Re-record a similar take, re-apply same recipe, verify consistency

## 12. Open Questions

1. **Should `recipe new` write YAML with inline comments documenting each field?** Lean yes — discoverability matters more than file cleanliness for a starter doc.
2. **Recipe inheritance** — should a recipe be able to `extends: "base-recipe.yaml"`? Defer to Phase 2 of Studio Recipe; for Phase 1 keep recipes flat.
3. **Where do agent-authored recipes live?** Iris (Composer) might generate a recipe from a reference clip in Phase 3. Phase 1 path is irrelevant — defer.
4. **YAML vs JSON canonical** — both are valid. Should `recipe show` output preserve the input format or always emit YAML? Default to "preserve."

## 13. Risks

- **Precedence drift between commands**: if `atelier trim` and `atelier transcribe` apply recipes inconsistently, users get unpredictable results. Mitigation: centralize all recipe→options logic in `lib/recipe.ts`; never duplicate per-command.
- **Reserved-fields-become-silently-meaningful**: a Phase 1 recipe that sets `palette: {...}` parses cleanly and is ignored. When Phase 3 ships, that recipe suddenly *does* something — possibly surprising. Mitigation: `atelier recipe validate` should *warn* on reserved fields ("`palette` is reserved for Phase 3 and currently has no effect") so authors aren't caught off-guard.
- **Path-traversal via recipe references**: if Phase 2 introduces `extends:`, that field accepts a path. Until Phase 2 ships, the resolver only accepts explicit paths from the CLI argument or fixed locations — no recipe content can reference filesystem paths.
- **Schema versioning**: Phase 1 ships v1.0. Adding fields is additive (no bump). Removing or renaming fields requires a v1.1 with migration — same pattern as cuts.json / transcript.json. Document this in the spec for future maintainers.
