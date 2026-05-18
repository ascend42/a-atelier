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

/** Anchor enum shared by every overlay sub-rule */
export const OverlayAnchorSchema = z.enum([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

/** Visual subset for overlay text — recipe snake_case convention */
export const OverlayTextStyleSchema = z.object({
  font_family: z.string().optional(),
  font_size: z.number().positive().optional(),
  font_weight: z.union([z.literal("normal"), z.literal("bold"), z.number()]).optional(),
  color: z.string().optional(),
}).strict();

/**
 * Validate a page-number format template:
 * - braces must balance
 * - every {…} group must match (current|total)(:0Nd)? (zero-pad form)
 * - at least one of {current} / {total} must appear
 *
 * Render-time substitution is a separate concern; this only validates syntax.
 */
function validatePageNumberFormat(
  format: string,
  ctx: z.RefinementCtx,
): void {
  if (format.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "format must be a non-empty string",
    });
    return;
  }

  const open = (format.match(/\{/g) ?? []).length;
  const close = (format.match(/\}/g) ?? []).length;
  if (open !== close) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `format has unbalanced braces (${open} '{' vs ${close} '}')`,
    });
    return;
  }

  const groupRe = /\{([^{}]*)\}/g;
  const groupRule = /^(current|total)(:0\d+d)?$/;
  let m: RegExpExecArray | null;
  let sawCurrent = false;
  let sawTotal = false;
  while ((m = groupRe.exec(format)) !== null) {
    const inner = m[1];
    if (!groupRule.test(inner)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `format placeholder "{${inner}}" is not recognized — expected {current}, {total}, {current:0Nd}, or {total:0Nd}`,
      });
      return;
    }
    if (inner.startsWith("current")) sawCurrent = true;
    if (inner.startsWith("total")) sawTotal = true;
  }

  if (!sawCurrent && !sawTotal) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "format must contain at least one {current} or {total} placeholder",
    });
  }
}

/** Handle overlay rule schema — anchored creator-handle text */
export const OverlayHandleRuleSchema = z.object({
  text: z.string().min(1),
  anchor: OverlayAnchorSchema,
  margin: z.number().nonnegative().optional(),
  style: OverlayTextStyleSchema.optional(),
}).strict();

/** Page-number overlay rule schema — anchored "1/5"-style indicator */
export const OverlayPageNumberRuleSchema = z.object({
  format: z.string().superRefine(validatePageNumberFormat),
  anchor: OverlayAnchorSchema,
  margin: z.number().nonnegative().optional(),
  style: OverlayTextStyleSchema.optional(),
}).strict();

/** Overlay rules block (Phase 1.5) — both sub-blocks optional */
export const OverlayRulesSchema = z.object({
  handle: OverlayHandleRuleSchema.optional(),
  page_number: OverlayPageNumberRuleSchema.optional(),
}).strict();

/**
 * StudioRecipe — top-level. Reserved fields (caption_highlight, transition_kit,
 * etc.) still accept any shape; Phase 3 will refine them. Validate-time warnings
 * surface reserved-fields-in-use to authors so they aren't caught off-guard
 * when those sections become load-bearing.
 *
 * overlay_rules was promoted from reserved Phase 3 to first-class Phase 1.5.
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

  // Phase 1.5 — first-class overlay rules
  overlay_rules: OverlayRulesSchema.optional(),

  // Reserved — Phase 3 (parse-opaque)
  caption_highlight: z.unknown().optional(),
  transition_kit: z.unknown().optional(),
  palette: z.unknown().optional(),
  audio_policy: z.unknown().optional(),
  aspect_targets: z.array(z.unknown()).optional(),
}).strict();

/** Names of still-reserved fields — used by validators to emit forward-compat warnings */
export const RESERVED_RECIPE_FIELDS = [
  "caption_highlight",
  "transition_kit",
  "palette",
  "audio_policy",
  "aspect_targets",
] as const;
