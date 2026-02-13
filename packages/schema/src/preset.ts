import { z } from "zod";
import { AnimatablePropertySchema } from "./delta.js";
import { EasingSchema } from "./easing.js";

export const PresetDeltaSchema = z.object({
  property: AnimatablePropertySchema,
  offset: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  from: z.unknown(),
  to: z.unknown(),
  easing: EasingSchema.optional(),
});

export const PresetSchema = z.object({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deltas: z.array(PresetDeltaSchema).min(1, "Preset must have at least one delta"),
});
