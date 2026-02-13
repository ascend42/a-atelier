import { z } from "zod";
import { EasingSchema } from "./easing.js";

export const AnimatablePropertySchema = z.enum([
  "frame.x",
  "frame.y",
  "bounds.width",
  "bounds.height",
  "opacity",
  "rotation",
  "scale.x",
  "scale.y",
  "anchorPoint.x",
  "anchorPoint.y",
  "visual.shape.cornerRadius",
  "visual.fill.color",
  "visual.stroke.color",
  "visual.stroke.width",
  "visual.style.fontSize",
  "visual.style.color",
]);

export const FrameRangeSchema = z.tuple([
  z.number().int().min(0, "Frame start must be >= 0"),
  z.number().int().min(0, "Frame end must be >= 0"),
]).refine(([start, end]) => end >= start, {
  message: "Frame range end must be >= start",
});

export const DeltaSchema = z.object({
  id: z.string().optional(),
  layer: z.string().min(1, "Delta must reference a layer id"),
  property: AnimatablePropertySchema,
  range: FrameRangeSchema,
  from: z.unknown(),
  to: z.unknown(),
  easing: EasingSchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
