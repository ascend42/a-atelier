import { z } from "zod";

/** Silence-trim policy block */
export const SilencePolicySchema = z.object({
  noise: z.string().optional(),
  min_silence: z.number().nonnegative().optional(),
  default_padding_pre: z.number().nonnegative().optional(),
  default_padding_post: z.number().nonnegative().optional(),
  match_tolerance: z.number().nonnegative().optional(),
}).strict();

/** Caption visual style block */
export const CaptionStyleSchema = z.object({
  font_family: z.string().optional(),
  font_size: z.number().positive().optional(),
  font_weight: z.union([z.literal("normal"), z.literal("bold"), z.number()]).optional(),
  text_align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional(),
  y_ratio: z.number().min(0).max(1).optional(),
  width_ratio: z.number().min(0).max(1).optional(),
  fade_seconds: z.number().nonnegative().optional(),
}).strict();

/** Caption phrase grouping block */
export const CaptionGroupingSchema = z.object({
  max_words: z.number().int().positive().optional(),
  pause_gap: z.number().nonnegative().optional(),
}).strict();

/**
 * StudioRecipe — top-level. Reserved fields (overlay_rules, caption_highlight,
 * etc.) accept any shape; Phase 3 will refine them. Validate-time warnings
 * surface reserved-fields-in-use to authors so they aren't caught off-guard
 * when those sections become load-bearing.
 */
export const StudioRecipeSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),

  silence_policy: SilencePolicySchema.optional(),
  caption_style: CaptionStyleSchema.optional(),
  caption_grouping: CaptionGroupingSchema.optional(),

  // Reserved — Phase 3
  overlay_rules: z.array(z.unknown()).optional(),
  caption_highlight: z.unknown().optional(),
  transition_kit: z.unknown().optional(),
  palette: z.unknown().optional(),
  audio_policy: z.unknown().optional(),
  aspect_targets: z.array(z.unknown()).optional(),
}).strict();

/** Names of reserved fields — used by validators to emit forward-compat warnings */
export const RESERVED_RECIPE_FIELDS = [
  "overlay_rules",
  "caption_highlight",
  "transition_kit",
  "palette",
  "audio_policy",
  "aspect_targets",
] as const;
