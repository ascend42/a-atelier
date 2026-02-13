import { z } from "zod";
import { ColorSchema } from "./color.js";
import { UnitValueSchema } from "./units.js";

export const PathPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  in: z.object({ x: z.number(), y: z.number() }).optional(),
  out: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const RectShapeSchema = z.object({
  type: z.literal("rect"),
  cornerRadius: z.union([
    z.number().min(0),
    z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]),
  ]).optional(),
});

export const EllipseShapeSchema = z.object({
  type: z.literal("ellipse"),
});

export const PathShapeSchema = z.object({
  type: z.literal("path"),
  points: z.array(PathPointSchema).min(2, "Path must have at least 2 points"),
  closed: z.boolean().optional(),
});

export const ShapeSchema = z.discriminatedUnion("type", [
  RectShapeSchema,
  EllipseShapeSchema,
  PathShapeSchema,
]);

export const GradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: ColorSchema,
});

export const SolidFillSchema = z.object({
  type: z.literal("solid"),
  color: ColorSchema,
});

export const LinearGradientFillSchema = z.object({
  type: z.literal("linear-gradient"),
  angle: z.number(),
  stops: z.array(GradientStopSchema).min(2, "Gradient needs at least 2 stops"),
});

export const RadialGradientFillSchema = z.object({
  type: z.literal("radial-gradient"),
  center: z.object({ x: UnitValueSchema, y: UnitValueSchema }),
  radius: UnitValueSchema,
  stops: z.array(GradientStopSchema).min(2, "Gradient needs at least 2 stops"),
});

export const FillSchema = z.discriminatedUnion("type", [
  SolidFillSchema,
  LinearGradientFillSchema,
  RadialGradientFillSchema,
]);

export const StrokeSchema = z.object({
  color: ColorSchema,
  width: z.number().min(0),
  dash: z.array(z.number().min(0)).optional(),
  lineCap: z.enum(["butt", "round", "square"]).optional(),
  lineJoin: z.enum(["miter", "round", "bevel"]).optional(),
});

export const TextStyleSchema = z.object({
  fontFamily: z.string().min(1, "fontFamily is required"),
  fontSize: z.number().positive("fontSize must be positive"),
  fontWeight: z.union([z.number(), z.enum(["normal", "bold"])]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  color: ColorSchema,
});
