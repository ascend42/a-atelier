import { z } from "zod";
import { ShapeSchema, FillSchema, StrokeSchema, TextStyleSchema, PathPointSchema } from "./shape.js";
import { FrameSchema, BoundsSchema, AnchorPointSchema } from "./coordinates.js";
import { ShadowSchema } from "./shadow.js";
import { InteractionSchema } from "./interaction.js";

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

export const SpritesheetConfigSchema = z.object({
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  frameCount: z.number().int().positive().optional(),
  frameWidth: z.number().positive(),
  frameHeight: z.number().positive(),
});

export const SourceRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const ImageVisualSchema = z.object({
  type: z.literal("image"),
  assetId: z.string().min(1, "assetId is required"),
  src: z.string().optional(),
  sourceRect: SourceRectSchema.optional(),
  spritesheet: SpritesheetConfigSchema.optional(),
  frameIndex: z.number().int().min(0).optional(),
});

export const VideoVisualSchema = z.object({
  type: z.literal("video"),
  assetId: z.string().min(1, "assetId is required"),
  src: z.string().optional(),
  startFrame: z.number().int().min(0).optional(),
  sourceOffset: z.number().min(0).optional(),
  sourceEnd: z.number().positive().optional(),
  playbackRate: z.number().positive().optional(),
  volume: z.number().min(0).max(1).optional(),
  muted: z.boolean().optional(),
  objectFit: z.enum(["contain", "cover", "fill"]).optional(),
});

export const AudioVisualSchema = z.object({
  type: z.literal("audio"),
  assetId: z.string().min(1, "assetId is required"),
  src: z.string().optional(),
  startFrame: z.number().int().min(0).optional(),
  sourceOffset: z.number().min(0).optional(),
  sourceEnd: z.number().positive().optional(),
  playbackRate: z.number().positive().optional(),
  volume: z.number().min(0).max(1).optional(),
  muted: z.boolean().optional(),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
});

export const GroupVisualSchema = z.object({
  type: z.literal("group"),
});

export const RefVisualSchema = z.object({
  type: z.literal("ref"),
  src: z.string().min(1, "src is required"),
  state: z.string().optional(),
  frame: z.number().int().min(0).optional(),
});

export const VisualSchema = z.discriminatedUnion("type", [
  ShapeVisualSchema,
  TextVisualSchema,
  ImageVisualSchema,
  VideoVisualSchema,
  AudioVisualSchema,
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
  tint: z.object({
    color: z.string(),
    amount: z.number().min(0).max(1),
  }).optional(),
  interactions: z.array(InteractionSchema).optional(),
});
