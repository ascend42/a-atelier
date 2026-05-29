import { z } from "zod";

/**
 * DESIGN.md — the creative-direction artifact (front-of-pipeline spec §3).
 *
 * Authored by Quill. Captures the brand register the entire Project must
 * respect: audience, voice, visual register, constraints, brand references.
 * When a recipe is attached, DESIGN defers to the recipe and only records
 * `variances` — divergences from the recipe.
 *
 * Every sub-schema is `.strict()` to match the recipe-package convention
 * (unknown keys are a hard error, not silently dropped — see the package-
 * level `recipe-strict-no-unknown-keys` aspect).
 */

/** audience block — primary/secondary/platform list */
export const DesignAudienceSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().optional(),
  platform: z.array(z.string().min(1)).min(1),
}).strict();

/** voice block — descriptors are an ordered 3-to-5 list */
export const DesignVoiceSchema = z.object({
  descriptors: z.array(z.string().min(1)).min(3).max(5),
  references: z.array(z.string().min(1)).optional(),
}).strict();

/** Palette roles — closed enum per spec §3 ("Roles are an enum, not free text") */
export const PaletteRoleSchema = z.enum([
  "background",
  "surface",
  "primary",
  "accent",
  "text-on-dark",
  "text-on-light",
]);

/** Single palette entry — token + hex + role */
export const PaletteEntrySchema = z.object({
  token: z.string().min(1),
  hex: z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, {
    message: "hex must be a #RGB / #RRGGBB / #RRGGBBAA string",
  }),
  role: PaletteRoleSchema,
}).strict();

/** Typography usage enum — closed */
export const TypographyUsageSchema = z.enum(["display", "body", "caption", "mono"]);

/** Typography entry */
export const TypographyEntrySchema = z.object({
  token: z.string().min(1),
  family: z.string().min(1),
  weights: z.array(z.number().int().min(1).max(1000)).min(1),
  usage: TypographyUsageSchema,
}).strict();

/** motion_register sub-block — tempo / easing_bias / camera_bias */
export const MotionRegisterSchema = z.object({
  tempo: z.enum(["snappy", "steady", "calm", "languid"]),
  easing_bias: z.enum(["linear", "ease-out", "spring"]),
  camera_bias: z.enum(["static", "drift", "snap"]).optional(),
}).strict();

/** visual_register block — palette + typography + motion_register */
export const VisualRegisterSchema = z.object({
  palette: z.array(PaletteEntrySchema).min(1),
  typography: z.array(TypographyEntrySchema).min(1),
  motion_register: MotionRegisterSchema,
}).strict();

/** Aspect ratios — closed enum per spec §3 */
export const AspectRatioSchema = z.enum(["9:16", "1:1", "16:9", "4:5"]);

/** constraints block — duration, aspect ratios, do_not list */
export const DesignConstraintsSchema = z.object({
  max_duration_seconds: z.number().positive().optional(),
  aspect_ratios: z.array(AspectRatioSchema).min(1),
  do_not: z.array(z.string().min(1)),
}).strict();

/** Logo brand reference — closed role enum */
export const BrandLogoSchema = z.object({
  token: z.string().min(1),
  role: z.enum(["primary", "mark", "wordmark"]),
}).strict();

/** Handle brand reference — platform + value */
export const BrandHandleSchema = z.object({
  platform: z.string().min(1),
  value: z.string().min(1),
}).strict();

/** brand_references block — logos + handles + page-number convention */
export const BrandReferencesSchema = z.object({
  logos: z.array(BrandLogoSchema).min(1),
  handles: z.array(BrandHandleSchema).optional(),
  page_number_convention: z.string().optional(),
}).strict();

/**
 * Variance entry — structured form per spec §9 Q5 recommendation:
 * { field, value, reason }. Agents diff variances; free-text Markdown
 * would be opaque to them.
 */
export const DesignVarianceSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  reason: z.string().min(1),
}).strict();

/**
 * DesignArtifactSchema — the typed frontmatter shape. The Markdown body
 * is carried as a `body: string` field set by the parser (verbatim — voice
 * notes, prose, etc. live there).
 */
export const DesignArtifactSchema = z.object({
  audience: DesignAudienceSchema,
  voice: DesignVoiceSchema,
  visual_register: VisualRegisterSchema,
  constraints: DesignConstraintsSchema,
  brand_references: BrandReferencesSchema,
  variances: z.array(DesignVarianceSchema).optional(),
  /** Markdown body verbatim — attached by the parser, not part of frontmatter. */
  body: z.string(),
}).strict();

export type DesignArtifact = z.infer<typeof DesignArtifactSchema>;
