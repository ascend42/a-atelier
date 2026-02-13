import { z } from "zod";

export const VariableTypeSchema = z.enum(["string", "number", "color", "asset", "boolean"]);

export const VariableSchema = z.object({
  type: VariableTypeSchema,
  default: z.unknown().optional(),
  description: z.string().optional(),
});
