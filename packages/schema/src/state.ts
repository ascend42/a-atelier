import { z } from "zod";
import { DeltaSchema } from "./delta.js";

export const StateSchema = z.object({
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  duration: z.number().int().positive("State duration must be a positive integer (frames)"),
  deltas: z.array(DeltaSchema),
});
