import { z } from "zod";

export const AssetTypeSchema = z.enum(["image", "svg", "font", "animation", "audio", "video"]);

export const AssetSchema = z.object({
  type: AssetTypeSchema,
  src: z.string().min(1, "Asset src is required"),
  description: z.string().optional(),
  spritesheet: z.object({
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
    frameCount: z.number().int().positive().optional(),
    frameWidth: z.number().positive(),
    frameHeight: z.number().positive(),
  }).optional(),
  videoMeta: z.object({
    duration: z.number().positive("videoMeta.duration must be positive"),
    fps: z.number().positive("videoMeta.fps must be positive"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).optional(),
});
