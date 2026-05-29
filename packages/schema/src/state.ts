import { z } from "zod";
import { DeltaSchema } from "./delta.js";
import { EasingSchema } from "./easing.js";

export const StateTransitionConfigSchema = z.object({
  duration: z.number().int().positive("Transition duration must be a positive integer (frames)"),
  easing: EasingSchema.optional(),
});

/**
 * State schema — v1.0 removed `audio?: AudioSchema`. Audio is now a
 * first-class `AudioVisual` layer (see `layer.ts`); pre-1.0 documents that
 * still carry `state.audio` are tolerated by the legacy-friendly parser
 * (which drops the field via `passthrough` then strips on validate) but
 * authors should migrate.
 *
 * The strict StateSchema rejects unknown keys, so callers passing a
 * pre-1.0 doc through StateSchema.parse will fail on `audio`. Use
 * `parseAtelier` to migrate-on-read.
 */
export const StateSchema = z.object({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  parent: z.string().optional(),
  duration: z.number().int().positive("State duration must be a positive integer (frames)"),
  deltas: z.array(DeltaSchema),
  transitions: z.record(z.string(), StateTransitionConfigSchema).optional(),
});
