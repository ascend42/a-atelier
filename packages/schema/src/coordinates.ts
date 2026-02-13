import { z } from "zod";
import { UnitValueSchema } from "./units.js";

export const FrameSchema = z.object({
  x: UnitValueSchema,
  y: UnitValueSchema,
});

export const BoundsSchema = z.object({
  width: UnitValueSchema,
  height: UnitValueSchema,
});

export const AnchorPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
