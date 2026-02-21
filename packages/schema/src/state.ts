import { z } from "zod";
import { DeltaSchema } from "./delta.js";

export const AudioSchema = z.object({
  src: z.string().min(1, "Audio src is required"),
  offset: z.number().min(0, "Audio offset must be non-negative").optional(),
  volume: z.number().min(0).max(1, "Audio volume must be 0–1").optional(),
  loop: z.boolean().optional(),
  startFrame: z.number().int().min(0, "Audio startFrame must be a non-negative integer").optional(),
});

export const StateSchema = z.object({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  duration: z.number().int().positive("State duration must be a positive integer (frames)"),
  deltas: z.array(DeltaSchema),
  audio: AudioSchema.optional(),
});
