import { z } from "zod";
import { ColorSchema } from "./color.js";

export const ShadowSchema = z.object({
  color: ColorSchema,
  blur: z.number().min(0),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
});
