import { z } from "zod";
import { ShapeSchema, FillSchema, StrokeSchema, TextStyleSchema, PathPointSchema } from "./shape.js";
import { FrameSchema, BoundsSchema, AnchorPointSchema } from "./coordinates.js";
import { ShadowSchema } from "./shadow.js";

export const BlendModeSchema = z.enum([
  "normal", "multiply", "screen", "overlay",
  "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity",
]);

export const MotionPathSchema = z.object({
  points: z.array(PathPointSchema).min(2, "Motion path must have at least 2 points"),
  closed: z.boolean().optional(),
  autoRotate: z.boolean().optional(),
  autoRotateOffset: z.number().optional(),
});

export const ShapeVisualSchema = z.object({
  type: z.literal("shape"),
  shape: ShapeSchema,
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
});

export const TextVisualSchema = z.object({
  type: z.literal("text"),
  content: z.string(),
  style: TextStyleSchema,
});

export const ImageVisualSchema = z.object({
  type: z.literal("image"),
  assetId: z.string().min(1, "assetId is required"),
  src: z.string().optional(),
});

export const GroupVisualSchema = z.object({
  type: z.literal("group"),
});

export const RefVisualSchema = z.object({
  type: z.literal("ref"),
  src: z.string().min(1, "src is required"),
});

export const VisualSchema = z.discriminatedUnion("type", [
  ShapeVisualSchema,
  TextVisualSchema,
  ImageVisualSchema,
  GroupVisualSchema,
  RefVisualSchema,
]);

export const LayerSchema = z.object({
  id: z.string().min(1, "Layer id is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visual: VisualSchema,
  frame: FrameSchema,
  bounds: BoundsSchema,
  anchorPoint: AnchorPointSchema.optional(),
  parentId: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  rotation: z.number().optional(),
  scale: z.object({ x: z.number(), y: z.number() }).optional(),
  visible: z.boolean().optional(),
  shadow: ShadowSchema.optional(),
  blendMode: BlendModeSchema.optional(),
  motionPath: MotionPathSchema.optional(),
  clipPath: ShapeSchema.optional(),
});
