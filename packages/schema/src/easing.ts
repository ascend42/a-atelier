import { z } from "zod";

export const LinearEasingSchema = z.object({ type: z.literal("linear") });

export const CubicBezierEasingSchema = z.object({
  type: z.literal("cubic-bezier"),
  x1: z.number().min(0).max(1),
  y1: z.number(),
  x2: z.number().min(0).max(1),
  y2: z.number(),
});

export const SpringEasingSchema = z.object({
  type: z.literal("spring"),
  mass: z.number().positive().optional(),
  stiffness: z.number().positive().optional(),
  damping: z.number().positive().optional(),
  velocity: z.number().optional(),
});

export const StepEasingSchema = z.object({
  type: z.literal("step"),
  steps: z.number().int().positive(),
  position: z.enum(["start", "end"]).optional(),
});

export const EasingPresetSchema = z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]);

export const EasingSchema = z.union([
  LinearEasingSchema,
  CubicBezierEasingSchema,
  SpringEasingSchema,
  StepEasingSchema,
  EasingPresetSchema,
]);
